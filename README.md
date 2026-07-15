# Telegram → Grafana Panel Bot

Type `graph` in any linked Telegram group → bot asks for a time range (buttons) →
bot fetches the Grafana panel render for that group's `panelId` and posts the image.

Same dashboard UID for every group, different `panelId` per group.

## 1. Create the Telegram bot
1. Message **@BotFather** on Telegram → `/newbot` → follow prompts → copy the token.
2. Add the bot to every client group.
3. In group settings, make sure **Group Privacy is disabled** for the bot (BotFather →
   your bot → *Bot Settings* → *Group Privacy* → *Turn off*), otherwise the bot can't
   see plain messages like `graph`, only `/commands`.

## 2. Get a Grafana API token
In Grafana: **Administration → Service accounts** (or **API keys** on older versions)
→ create a token with **Viewer** role → this is your `GRAFANA_TOKEN`.

## 3. Install
```bash
cd telegram-grafana-bot
npm install
cp .env.example .env
```
Fill in `.env`:
- `TELEGRAM_BOT_TOKEN`
- `GRAFANA_TOKEN`
- `GRAFANA_DASHBOARD_UID` / `GRAFANA_DASHBOARD_SLUG` (from your curl URL — you already
  have `e2faf2f3-926f-4f11-887f-eb1ce5864bcc` / `all-links`)
- `ADMIN_USER_IDS` — your own Telegram numeric user ID(s), comma separated (get yours
  by messaging **@userinfobot**)
- Leave `WEBHOOK_URL` empty to test locally with polling.

## 4. Map each group to its panelId
You have two options:

**Option A — edit the JSON directly** (`config/chatPanelMap.json`):
```json
{
  "-1001111111111": { "panelId": 75, "label": "Client A - All Links" },
  "-1002222222222": { "panelId": 82, "label": "Client B - All Links" }
}
```
To find a chat's ID: add the bot to the group, send `/mychatid` in that group, the
bot replies with the numeric ID (group IDs are negative numbers).

**Option B — use the built-in admin command** (recommended, no redeploy needed):
In each group, an admin (whose Telegram user ID is in `ADMIN_USER_IDS`) sends:
```
/setpanel 75
```
The bot saves that group's chat ID → panelId 75 into `chatPanelMap.json` automatically.

## 5. Run it
```bash
npm start
```
With `WEBHOOK_URL` empty this uses long-polling — good enough for 60-70 groups and
simplest to run. Go to any linked group and type:
```
graph
```
You'll get inline buttons: `1h 6h 12h` / `24h 7d Custom…`. Tap one → bot fetches and
posts the image within a couple seconds. Tap "Custom…" and then type e.g. `2h`, `45m`,
or `3d` within 2 minutes to get a custom relative range.

## 6. Going to production (webhook mode)
Polling works but keeps an open connection per process and doesn't scale as cleanly
behind a load balancer. For production:
1. Deploy behind HTTPS (e.g. behind Nginx/Caddy, or a platform that gives you TLS).
2. Set `WEBHOOK_URL=https://your-domain.com` in `.env`.
3. Restart the app — it calls `bot.setWebHook()` automatically on boot and Express
   exposes the receiving route at `/telegram-webhook/<token>`.
4. Run with a process manager, e.g.:
   ```bash
   npm install -g pm2
   pm2 start index.js --name grafana-bot
   pm2 save
   ```

## Notes / things you may want to extend
- **Rate limiting**: if many groups hit "graph" at once, Grafana rendering (uses
  headless Chromium under the hood) can get slow. Consider a small queue if you see
  timeouts, or bump `GRAFANA_RENDERER` concurrency on the Grafana server.
- **Per-panel width/height**: currently global via `.env`. If some groups need bigger
  images, add `width`/`height` fields to that chat's entry in `chatPanelMap.json` and
  read them in `lib/grafana.js`.
- **Multiple panels per group**: right now one group = one panelId. If a group needs
  several graphs, store an array of `{ panelId, label }` and show a panel-picker
  keyboard before the time-range keyboard.
- **Auth header format**: this code sends `Authorization: Bearer <token>`, matching
  standard Grafana service account tokens. If your setup uses a different header
  (e.g. `Authorization: <token>` without "Bearer", or an API-key header), adjust
  `lib/grafana.js` accordingly — check exactly what your working `curl` command sends.
