const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'config', 'chatPanelMap.json');

function readAll() {
  const raw = fs.readFileSync(FILE_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeAll(data) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

// Normalizes an entry to the { label, plans: [{ name, panelId }, ...] } shape,
// so we support both:
//   - legacy single-panel entries: { "panelId": 75, "label": "Client A" }
//   - multi-plan entries: { "label": "Client A", "plans": [{ "name": "Mumbai", "panelId": 75 }, ...] }
function normalize(entry) {
  if (!entry) return null;
  if (Array.isArray(entry.plans)) return entry;
  if (entry.panelId !== undefined) {
    return {
      label: entry.label || '',
      plans: [{ name: entry.label || 'Default', panelId: Number(entry.panelId) }],
    };
  }
  return { label: entry.label || '', plans: [] };
}

/**
 * Returns { label, plans: [{ name, panelId }, ...] } for a chat, or null if unconfigured.
 */
function getConfigForChat(chatId) {
  const all = readAll();
  const entry = all[String(chatId)];
  const normalized = normalize(entry);
  if (!normalized || normalized.plans.length === 0) return null;
  return normalized;
}

/**
 * Quick single-plan setup — replaces any existing plans for this chat with one
 * plan named "Default". Good for the common case of one group = one panel.
 */
function setSinglePanelForChat(chatId, panelId, chatLabel) {
  const all = readAll();
  const key = String(chatId);
  const existingLabel = normalize(all[key])?.label;
  all[key] = {
    label: chatLabel || existingLabel || '',
    plans: [{ name: 'Default', panelId: Number(panelId) }],
  };
  writeAll(all);
  return all[key];
}

/**
 * Adds (or updates, if panelId already exists) a named plan/location for a chat.
 * Call this multiple times to build up a group with several locations.
 */
function addPlanForChat(chatId, panelId, planName, chatLabel) {
  const all = readAll();
  const key = String(chatId);
  const current = normalize(all[key]) || { label: chatLabel || '', plans: [] };
  if (chatLabel) current.label = chatLabel;

  const numericPanelId = Number(panelId);
  const existingPlanIndex = current.plans.findIndex((p) => p.panelId === numericPanelId);

  if (existingPlanIndex >= 0) {
    current.plans[existingPlanIndex].name = planName;
  } else {
    current.plans.push({ name: planName, panelId: numericPanelId });
  }

  all[key] = current;
  writeAll(all);
  return current;
}

/**
 * Removes a plan/location (by panelId) from a chat's config.
 */
function removePlanForChat(chatId, panelId) {
  const all = readAll();
  const key = String(chatId);
  const current = normalize(all[key]);
  if (!current) return null;

  const numericPanelId = Number(panelId);
  current.plans = current.plans.filter((p) => p.panelId !== numericPanelId);
  all[key] = current;
  writeAll(all);
  return current;
}

function listAll() {
  const all = readAll();
  const normalized = {};
  for (const [chatId, entry] of Object.entries(all)) {
    normalized[chatId] = normalize(entry);
  }
  return normalized;
}

module.exports = {
  getConfigForChat,
  setSinglePanelForChat,
  addPlanForChat,
  removePlanForChat,
  listAll,
};