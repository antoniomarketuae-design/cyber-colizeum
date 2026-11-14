# Cyber Colizeum — Product Map

The source of truth for what this app is and where each part stands. Update it whenever something changes.
Owner: Admin (builds from his iPhone). Assistant: C++.

## Vision
A phone app (home-screen PWA, like Dreaming) for the players of **Cyber Colizeum**, a gaming club in Sofia
(https://cybercolizeum.bg). Described by the owner on 2026-11-14:
- **Home = live map of which PCs are free.** 5 rooms, 48 PCs: VIP 5 · Streamer 1 · Bootcamp 9 · Bootcamp 2 3 ·
  Main hall 30 (owner's numbers, 2026-11-14). PCs only — no PlayStation / SimRacing in the app.
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
| Club data (rooms, PC numbers, prices, contacts) | ✅ v2 | `app/js/data/club.js` | **PC numbering is a placeholder**: VIP 1–5, Streamer 6, Bootcamp 7–15, Bootcamp 2 16–18, Hall 19–48. Prices from the website. |
| Live PC map (home) | ✅ v2 demo | `screens/live.js`, `data/live.js` | Simulated club (busier evenings). Tiles: free / playing "free from 15:40" / booked / yours / out of order. Tap → hold 15 min, "tell me when free", book later. |
| Deals + codes | ✅ v2 | `screens/deals.js`, `data/deals.js` | Running now (get a code, valid 1–5 h), coming up, your codes, price list. 3 example deals. |
| Deal messages (notifications) | ✅ v2 in-app | `engine.js`, `data/inbox.js` | Each deal run announced once, within the player's rooms / quiet hours / max per day. Bell = inbox. **Real push to closed phones needs the server (Web Push).** |
| Booking | ✅ v2 | `screens/book.js`, `data/bookings.js` | Room, day, time, hours, players, seats side by side; price estimate; request → staff confirms → message. |
| Me (details, notification choices, club contacts) | ✅ v2 | `screens/me.js` | Bulgarian "coming soon". |
| Staff mode | ✅ v2 demo | `screens/staff.js`, `screens/deal-edit.js` | Demo PIN 0000. How full, deals (on/off, edit, send now), booking requests, set any PC, demo "how full" control, reset. Same phone only until the server exists. |
| Publishing (GitHub Pages) | ✅ live 2026-11-14 (v2) | `tools/bump.js`, `tools/publish.js` | **https://antoniomarketuae-design.github.io/cyber-colizeum/** · repo `antoniomarketuae-design/cyber-colizeum` (public, created by the owner). `main` = app, docs, server, tools; `gh-pages` = `app/`. Same signed-in Git Credential Manager as Dreaming. Verified: files 200, service worker active, no console errors. |
| Local preview | ✅ | `tools/serve.js`, `.claude/launch.json` | Browser pane: preview "app" (port 8787, or the next free one). |
| App icons | ⏳ placeholder | `app/icons/`, `tools/make-icons.js` | Glowing 3×3 seat grid. Swap for the club's helmet logo when the owner sends the file. |
| Server (accounts, deals for everyone, push, staff login) | 💭 next big step | `reference/dreaming-server/` → `server/` | Needs: VPS folder, port, database, nginx path. Makes staff deals reach every phone + real push. |
| Link to the club's real software | 💭 later | — | Owner will name the front-desk program later — decides how live free/busy data arrives. |
| AI pictures / videos | ✅ dry-run tested | `tools/gen-image.mjs`, `gen-video.mjs` | Not used yet. Paid with `--go`; ask first. |
