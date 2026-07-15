require('dotenv').config();

// Silences node-telegram-bot-api's file-sending deprecation warnings —
// we already explicitly set filename/contentType when sending photos.
process.env.NTBA_FIX_350 = '1';

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { fetchPanelImage } = require('./lib/grafana');
const { getPanelForChat, setPanelForChat, listAll } = require('./lib/panelStore');

const {
  TELEGRAM_BOT_TOKEN,
  WEBHOOK_URL,
  PORT = 3000,
  ADMIN_USER_IDS = '',
} = process.env;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Missing TELEGRAM_BOT_TOKEN in .env');
  process.exit(1);
}

const adminIds = ADMIN_USER_IDS.split(',').map((s) => s.trim()).filter(Boolean);
const isAdmin = (userId) => adminIds.includes(String(userId));

const useWebhook = Boolean(WEBHOOK_URL);
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: !useWebhook });

// Without this, polling errors (e.g. 409 Conflict from a duplicate running
// instance, or network issues) fail completely silently.
bot.on('polling_error', (err) => {
  console.error('Polling error:', err.code, err.message);
});

bot.on('webhook_error', (err) => {
  console.error('Webhook error:', err.code, err.message);
});

// Predefined quick time ranges shown as buttons. Add/remove as you like.
const TIME_RANGES = [
  { label: '1h', from: 'now-1h' },
  { label: '6h', from: 'now-6h' },
  { label: '12h', from: 'now-12h' },
  { label: '24h', from: 'now-24h' },
  { label: '7d', from: 'now-7d' },
  { label: '1Month', from: 'now-1M' },
  { label: '6Months', from: 'now-6M' }
];

// Tracks users who were asked to type a custom range, so we know to
// interpret their next plain-text message as a range instead of a command.
// key = `${chatId}:${userId}` -> { panelId, expiresAt }
const pendingCustomRange = new Map();
const CUSTOM_RANGE_TTL_MS = 2 * 60 * 1000;

function rangeKeyboard(panelId) {
  const row = TIME_RANGES.map((r) => ({
    text: r.label,
    callback_data: `range:${panelId}:${r.from}`,
  }));
  // split into rows of 3 buttons
  const rows = [];
  for (let i = 0; i < row.length; i += 3) rows.push(row.slice(i, i + 3));
  return { reply_markup: { inline_keyboard: rows } };
}

async function sendPanelImage(chatId, panelId, from, to, statusMsgId) {
  try {
    const image = await fetchPanelImage({ panelId, from, to });
    await bot.sendPhoto(
      chatId,
      image,
      { caption: `Range: ${from} → ${to}` },
      { filename: 'panel.png', contentType: 'image/png' }
    );
  } catch (err) {
    console.error('Grafana fetch failed:', err.message);
    await bot.sendMessage(chatId, 'Sorry, could not fetch the graph from Grafana. Please try again.');
  } finally {
    if (statusMsgId) {
      bot.deleteMessage(chatId, statusMsgId).catch(() => {});
    }
  }
}

// Parse things like "2h", "30m", "3d", "45m" -> Grafana "now-Xh" style string.
// Also allows explicit "YYYY-MM-DD HH:mm to YYYY-MM-DD HH:mm" (advanced/optional).
function parseCustomRangeText(text) {
  const trimmed = text.trim();

  const relativeMatch = trimmed.match(/^(\d+)\s*(m|h|d)$/i);
  if (relativeMatch) {
    const [, num, unit] = relativeMatch;
    return { from: `now-${num}${unit.toLowerCase()}`, to: 'now' };
  }

  const explicitMatch = trimmed.split(/\s+to\s+/i);
  if (explicitMatch.length === 2) {
    const fromMs = Date.parse(explicitMatch[0]);
    const toMs = Date.parse(explicitMatch[1]);
    if (!Number.isNaN(fromMs) && !Number.isNaN(toMs)) {
      return { from: String(fromMs), to: String(toMs) };
    }
  }

  return null;
}

// ---- "graph" trigger (case-insensitive, matches whole message, with or without leading slash) ----
bot.onText(/^\/?graph$/i, async (msg) => {
  const chatId = msg.chat.id;
  const config = getPanelForChat(chatId);

  if (!config) {
    return bot.sendMessage(
      chatId,
      `This group isn't linked to a Grafana panel yet.\nChat ID: ${chatId}\nAsk an admin to run /setpanel <panelId> in this group.`
    );
  }

  await bot.sendMessage(chatId, `Pick a time range for "${config.label || 'the graph'}":`, rangeKeyboard(config.panelId));
});

// ---- Button press handler ----
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const [, panelIdStr, rangeToken] = query.data.split(':');
  const panelId = Number(panelIdStr);

  await bot.answerCallbackQuery(query.id).catch(() => {});

  if (rangeToken === 'custom') {
    pendingCustomRange.set(`${chatId}:${userId}`, {
      panelId,
      expiresAt: Date.now() + CUSTOM_RANGE_TTL_MS,
    });
    return bot.sendMessage(
      chatId,
      'Reply with a custom range, e.g. "2h", "45m", "3d" (within the next 2 minutes).'
    );
  }

  const statusMsg = await bot.sendMessage(chatId, 'Fetching graph…');
  await sendPanelImage(chatId, panelId, rangeToken, 'now', statusMsg.message_id);
});

// ---- Plain text listener: catches custom range replies + admin commands ----
bot.on('message', async (msg) => {
  console.log(`[msg] chat=${msg.chat.id} from=${msg.from.id} text="${msg.text}"`);

  if (!msg.text || /^\/?graph$/i.test(msg.text.trim())) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const key = `${chatId}:${userId}`;
  const pending = pendingCustomRange.get(key);

  if (pending) {
    pendingCustomRange.delete(key);
    if (Date.now() > pending.expiresAt) {
      return bot.sendMessage(chatId, 'That custom-range request timed out, please type "graph" again.');
    }
    const parsed = parseCustomRangeText(msg.text);
    if (!parsed) {
      return bot.sendMessage(chatId, 'Could not understand that range. Try formats like "2h", "45m", "3d".');
    }
    const statusMsg = await bot.sendMessage(chatId, 'Fetching graph…');
    return sendPanelImage(chatId, pending.panelId, parsed.from, parsed.to, statusMsg.message_id);
  }
});

// ---- Admin commands ----
bot.onText(/^\/setpanel (\d+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(chatId, 'Only an admin can configure this.');
  }
  const panelId = match[1];
  const label = msg.chat.title || `Chat ${chatId}`;
  setPanelForChat(chatId, panelId, label);
  bot.sendMessage(chatId, `Linked this group to panelId ${panelId}.`);
});

bot.onText(/^\/mychatid$/, (msg) => {
  bot.sendMessage(msg.chat.id, `Chat ID: ${msg.chat.id}`);
});

bot.onText(/^\/listpanels$/, (msg) => {
  if (!isAdmin(msg.from.id)) {
    return bot.sendMessage(msg.chat.id, 'Only an admin can view this.');
  }
  const all = listAll();
  const lines = Object.entries(all).map(
    ([id, cfg]) => `${id} -> panelId ${cfg.panelId} (${cfg.label || 'no label'})`
  );
  bot.sendMessage(msg.chat.id, lines.join('\n') || 'No panels configured yet.');
});

// ---- Express app (used for webhook mode + health check) ----
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('Telegram-Grafana bot is running.'));

if (useWebhook) {
  const webhookPath = `/telegram-webhook/${TELEGRAM_BOT_TOKEN}`;
  app.post(webhookPath, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });

  bot.setWebHook(`${WEBHOOK_URL}${webhookPath}`);
  console.log(`Webhook mode. Telegram will POST updates to ${WEBHOOK_URL}${webhookPath}`);
} else {
  console.log('Polling mode (no WEBHOOK_URL set). Fine for local testing.');
}

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));