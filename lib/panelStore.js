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

function getPanelForChat(chatId) {
  const all = readAll();
  return all[String(chatId)] || null;
}

function setPanelForChat(chatId, panelId, label) {
  const all = readAll();
  all[String(chatId)] = { panelId: Number(panelId), label: label || all[String(chatId)]?.label || '' };
  writeAll(all);
  return all[String(chatId)];
}

function listAll() {
  return readAll();
}

module.exports = { getPanelForChat, setPanelForChat, listAll };
