const axios = require('axios');

const { TELEGRAM_BOT_TOKEN, ALERT_CHAT_IDS, ADMIN_USER_IDS } = process.env;

// Falls back to ADMIN_USER_IDS if ALERT_CHAT_IDS isn't set, so this works
// out of the box, but a dedicated "Alerts" group/chat ID is recommended —
// see the note in .env.example.
const targets = (ALERT_CHAT_IDS || ADMIN_USER_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function sendAlert(text) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('[alert] Cannot send alert — TELEGRAM_BOT_TOKEN is missing.');
    return;
  }
  if (targets.length === 0) {
    console.error('[alert] Cannot send alert — no ALERT_CHAT_IDS or ADMIN_USER_IDS configured.');
    return;
  }

  await Promise.all(
    targets.map(async (chatId) => {
      try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text,
        });
      } catch (err) {
        console.error(`[alert] Failed to notify ${chatId}:`, err.response?.data || err.message);
      }
    })
  );
}

module.exports = { sendAlert };