# Cyber Colizeum server (`colizeum-api`)

Live since 2026-11-14 at **https://nexflowclub.com/colizeum-api/** (owner approved: same VPS as Dreaming).

What it does: keeps the deals every phone sees, the phones that allowed notifications (with each player's choices:
deal messages on/off, rooms, quiet hours, max per day) and the last 40 messages; sends real phone notifications
(Web Push, `web-push` package) when staff press Send, when a right-now deal is saved, and when a set-times deal
starts (checked every 30 s, Sofia time). Quiet-time deals can't notify yet: the server doesn't know the real PCs.

| Route | Who | What |
|---|---|---|
| `GET /health`, `GET /config` (VAPID public key), `GET /deals`, `GET /messages?since=<ms>` | anyone | read |
| `POST /push/subscribe {subscription, prefs}`, `POST /push/unsubscribe {endpoint}` | phones | notifications on/off, choices |
| `POST /admin/check`, `GET /admin/stats`, `POST /admin/push {title, body, rooms} \| {dealId}`, `POST /admin/deals {deal}`, `PUT /admin/deals/<id> {deal}`, `DELETE /admin/deals/<id>` | staff key | staff mode |

## On the VPS (`root@213.218.160.60`, always `-i ~/.ssh/id_ed25519_flokinet -o IdentitiesOnly=yes`)
- Folder `/opt/colizeum` (700): `server.js`, `package.json`, `package-lock.json`, `node_modules`, `data/` (JSON files:
  deals, subs, sent, messages; 700/600), `.env` (600: PORT=3030, ALLOWED_ORIGINS, VAPID_SUBJECT, STAFF_KEY_SHA256,
  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — never print it).
- PM2 process **`colizeum-api`** on **127.0.0.1:3030** (`pm2 save` done).
- nginx: `location /colizeum-api/` added after `/dreaming-api/` in `/etc/nginx/sites-enabled/nexflow`; backup in
  `/root/nginx-backups/nexflow.20261114-165438.before-colizeum`.
- Staff key: plain text only on the dev PC at `C:\Users\Ljh\.colizeum\staff.key` (and with the owner); the server keeps
  its sha256. New key = new hash in `.env` + `pm2 restart colizeum-api --update-env`.

## Deploy a change
```
cd "E:/cyber colizeum/server"
scp -i ~/.ssh/id_ed25519_flokinet -o IdentitiesOnly=yes server.js package.json package-lock.json root@213.218.160.60:/opt/colizeum/
ssh -i ~/.ssh/id_ed25519_flokinet -o IdentitiesOnly=yes root@213.218.160.60 'cd /opt/colizeum && npm install --omit=dev --no-audit --no-fund && pm2 restart colizeum-api --update-env && sleep 2 && curl -s http://127.0.0.1:3030/health'
```
Local test: `node <scratch>/server-test.mjs "E:/cyber colizeum/server"` style — run server.js with throwaway VAPID keys,
a test staff key and a temp `DATA_DIR`; the app on localhost uses it when localStorage `colizeum.apiBase` is set.
