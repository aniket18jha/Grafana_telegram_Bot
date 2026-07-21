// Runs as its own pm2 process, separate from the bot itself, so it can still
// send alerts even while the main bot process is down/restarting.
require('dotenv').config();
const pm2 = require('pm2');
const { sendAlert } = require('./lib/telegramAlert');

const WATCHED_APP = process.env.WATCHED_PM2_APP_NAME || 'grafana-bot';

pm2.connect((err) => {
  if (err) {
    console.error('[watchdog] Could not connect to pm2:', err.message);
    process.exit(1);
  }

  pm2.launchBus((busErr, bus) => {
    if (busErr) {
      console.error('[watchdog] Could not launch pm2 event bus:', busErr.message);
      return;
    }

    console.log(`[watchdog] Watching pm2 process "${WATCHED_APP}" for crashes/restarts...`);

    bus.on('process:event', (data) => {
      if (!data.process || data.process.name !== WATCHED_APP) return;

      const event = data.event; // e.g. 'start', 'restart', 'stop', 'exit', 'delete'
      console.log(`[watchdog] ${WATCHED_APP} event: ${event}`);

      if (event === 'restart') {
        sendAlert(
          `⚠️ "${WATCHED_APP}" restarted on the server.\n` +
          `Total restarts so far: ${data.process.restart_time ?? 'unknown'}.\n` +
          `If this keeps happening repeatedly, check logs: pm2 logs ${WATCHED_APP}`
        );
      }

      if (event === 'exit' && data.process.status !== 'online') {
        sendAlert(
          `🔴 "${WATCHED_APP}" went down (exit code ${data.process.exit_code ?? 'unknown'}).\n` +
          `PM2 will attempt to restart it automatically.`
        );
      }
    });
  });
});

process.on('SIGINT', () => {
  pm2.disconnect();
  process.exit(0);
});