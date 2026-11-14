# Server — start from reference/dreaming-server/

Keep: `server.js` (HTTP, CORS, device accounts, plans/limits/usage, redeem codes, images and videos routes),
`plans.json`, `images.js`, `videos.js`, `video-options.js`, `dashboard.js` + `dashboard/` (optional), `install.sh`,
`nginx-*.conf`, `package.json` (pg, sharp, ffmpeg-static).
Drop: `library.js` and the `/library/*`, interpretation and inbox routes (Dreaming-only).

Rename everything "dreaming" → the new app id (folder `/opt/<app>`, PM2 process `<app>-api`, Postgres role/db
`<app>`, nginx path `/<app>-api/`, port, cookie path), set `ALLOWED_ORIGINS` to the new GitHub Pages origin plus the
local test origin, and put the provider keys in the root-only `/opt/<app>/.env` (copy server-side from
`/opt/nexflow/.env.local`, compare by fingerprint, never print). Ask the owner which VPS/domain before deploying.

`.env.example` lists the names the server reads.
