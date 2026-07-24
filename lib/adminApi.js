const express = require('express');
const { listAll, setChatConfig, deleteChat } = require('./panelStore');

const { DASHBOARD_PASSWORD } = process.env;

function requireDashboardAuth(req, res, next) {
  if (!DASHBOARD_PASSWORD) {
    return res.status(500).json({ error: 'DASHBOARD_PASSWORD is not set on the server.' });
  }
  const provided = req.header('x-dashboard-password');
  if (provided !== DASHBOARD_PASSWORD) {
    return res.status(401).json({ error: 'Invalid or missing dashboard password.' });
  }
  next();
}

const router = express.Router();

// Every route below requires the dashboard password header.
router.use(requireDashboardAuth);

// GET /api/config -> { "-1001...": { label, plans: [...] }, ... }
router.get('/config', (req, res) => {
  try {
    res.json(listAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/chats/:chatId  body: { label, plans: [{ name, panelId }, ...] }
router.put('/chats/:chatId', (req, res) => {
  try {
    const { label, plans } = req.body;
    if (!Array.isArray(plans)) {
      return res.status(400).json({ error: '"plans" must be an array.' });
    }
    for (const p of plans) {
      if (!p.name || !p.name.trim()) {
        return res.status(400).json({ error: 'Every plan needs a location name.' });
      }
      if (p.panelId === '' || p.panelId === undefined || p.panelId === null || Number.isNaN(Number(p.panelId))) {
        return res.status(400).json({ error: `Plan "${p.name}" needs a valid numeric panelId.` });
      }
    }
    const updated = setChatConfig(req.params.chatId, { label, plans });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chats/:chatId
router.delete('/chats/:chatId', (req, res) => {
  try {
    const existed = deleteChat(req.params.chatId);
    res.json({ deleted: existed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;