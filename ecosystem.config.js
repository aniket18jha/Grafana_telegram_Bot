module.exports = {
  apps: [
    {
      name: 'grafana-bot',
      script: 'index.js',
      autorestart: true,
      max_restarts: 20,       // stop trying after 20 rapid crashes, to avoid an infinite loop burning CPU
      min_uptime: '10s',      // a restart within 10s of starting counts as a "crash" for the counter above
      restart_delay: 3000,    // wait 3s before each restart attempt
      watch: false,
    },
    {
      name: 'bot-watchdog',
      script: 'watchdog.js',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 3000,
      watch: false,
    },
  ],
};