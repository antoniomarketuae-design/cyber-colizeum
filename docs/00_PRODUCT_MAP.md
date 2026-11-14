# Cyber Colizeum — Product Map

The source of truth for what this app is and where each part stands. Update it whenever something changes.
Owner: Admin (builds from his iPhone). Assistant: C++.

## Vision
A phone app (home-screen PWA, like Dreaming) for the players of **Cyber Colizeum**, a gaming club in Sofia
(https://cybercolizeum.bg). Described by the owner on 2026-11-14:
- **Home = live map of which PCs are free.** 5 rooms, 38 PCs: VIP 5 · Streamer 1 · Bootcamp 9 · Bootcamp 2 3 ·
  Main hall 20 (owner's floor plan "ДП Компьютерный клуб", 2026-11-14; he first said hall 30). PCs only — no
  PlayStation / SimRacing booking in the app (the sim seats are drawn on the map, greyed).
- **Off-peak discounts by notification:** when PCs sit empty, players get a deal to come in. **The admin makes the
  deals however he wants** (any rooms, % off / price per hour / bonus time, right now / set times / when quiet).
- **Booking in the app:** yes (the club confirms).
- **Language:** English first; Bulgarian later.
- First version = how it will look, with demo data. **Not connected to the club's real software yet** (owner: later).
- Look: the club's brand (black, ice-cyan #DCFFFF, orange #FF8562), Dreaming's shell and patterns.
What other clubs' apps do: `docs/01_RESEARCH_OTHER_CLUBS.md`.

## Components

| Component | Status | Where | Notes |
|---|---|---|---|
| App shell (tabs, install guide, updates, offline) | ✅ v2 | `app/js/app.js`, `sw.js` | Tabs Live · Deals · Book · Me; Staff + deal editor are link screens. New-message banner at the top. |
| Club data (rooms, PC numbers, prices, contacts, floor plan) | ✅ v8 | `app/js/data/club.js` | **PC numbering is a placeholder** (fits the monitor numbers in the photos): VIP 1–5, Streamer 6, Bootcamp 7–15, Bootcamp 2 16–18, Hall 19–38. `FLOOR` = map layout. Prices from the website. |
| Live PC map (home) | ✅ v8 demo | `screens/live.js`, `screens/map.js`, `data/live.js` | Two views, remembered: **Rooms** (card per room, filters) and **Map** (neon floor plan of the whole club from the owner's drawing: slanted top wall, VIP, reception, streamer, Bootcamp by the entrance, Bootcamp 2 + sim seats, hall islands with violet LED walls; live tiles, room prices). Tap → hold / tell me / book. Simulated club. |
| Deals + codes | ✅ v5 server | `screens/deals.js`, `data/deals.js` | Deals live on the server (same on every phone, cached for offline). Running now (code valid 1–5 h), coming up, your codes, price list. Codes are still made on the phone. |
| Phone notifications (Web Push) | ✅ v5 live | `push.js`, `sw.js`, `data/inbox.js`, server | Me → Turn on notifications (iPhone: Home Screen app only). Server sends on staff Send / right-now deal saved / set-times deal start, within each player's rooms, quiet hours, max per day (auto only). Every message also lands in the bell inbox. Quiet-time deals: in-app only until real PC data. |
| Booking | ✅ v2 | `screens/book.js`, `data/bookings.js` | Room, day, time, hours, players, seats side by side; price estimate; request → staff confirms → message. |
| Me (details, notification choices, club contacts) | ✅ v2 | `screens/me.js` | Bulgarian "coming soon". |
| Staff mode | ✅ v5 | `screens/staff.js`, `screens/deal-edit.js` | **Staff key 0000** (owner's choice after a warning; checked by the server, remembered on the admin's phone; log out button). Send a notification (title, message, rooms) with confirm; deals on/off, edit, Send now, "Notify players" switch; last sent. Still demo on the phone: how full, PCs, bookings. **Start the demo over** (v9): server demoResetAt → every phone clears its demo PCs, bookings, holds, codes, messages (keeps details, choices, staff login). |
| Publishing (GitHub Pages) | ✅ live 2026-11-14 (v2) | `tools/bump.js`, `tools/publish.js` | **https://antoniomarketuae-design.github.io/cyber-colizeum/** · repo `antoniomarketuae-design/cyber-colizeum` (public, created by the owner). `main` = app, docs, server, tools; `gh-pages` = `app/`. Same signed-in Git Credential Manager as Dreaming. Verified: files 200, service worker active, no console errors. |
| Local preview | ✅ | `tools/serve.js`, `.claude/launch.json` | Browser pane: preview "app" (port 8787, or the next free one). |
| Logo, wordmark, app icons | ✅ v3 | `app/img/logo.png`, `app/img/wordmark.png`, `app/icons/logo-*.png`, `tools/make-icons.js` | **Icon files are renamed whenever the picture changes** (iPhone caches Home Screen icons by file name; v4 renamed icon-* → logo-*). From cybercolizeum.bg (29.png 850×823 see-through logo, 30dd.png wordmark), downloaded with the owner's OK 2026-11-14. make-icons.js draws the logo on black + glow (reads PNGs by hand, no deps). Wordmark on Live, logo on Me. |
| Server `colizeum-api` | ✅ live 2026-11-14 | `server/` → VPS `/opt/colizeum`, PM2 `colizeum-api` :3030, nginx `/colizeum-api/` | **https://nexflowclub.com/colizeum-api/** · JSON files, web-push, staff key sha256 only. See `server/README.md`. Next: bookings + real PC data through it. |
| Link to the club's real software | 💭 later | — | Owner will name the front-desk program later — decides how live free/busy data arrives. |
| AI pictures / videos | ✅ dry-run tested | `tools/gen-image.mjs`, `gen-video.mjs` | Not used yet. Paid with `--go`; ask first. |
