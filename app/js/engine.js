// The heartbeat: every 5 seconds (while the app is open) the demo club moves on, finished holds and bookings
// close, quiet-time deals that just started are announced (within the player's own limits) and watched PCs that
// became free are reported. Every minute it fetches the club's deals and messages. Screens listen for 'tick'.
// Right-now and set-times deals are announced by the club's server as real notifications; quiet-time deals need
// the club's real PC data, so until then this phone announces them from the demo club, inside the app.
import { emit, load, save, remove, getSetting } from './store.js';
import { step, getLive, stats, watches, unwatch, resetLive } from './data/live.js';
import { expireBookings } from './data/bookings.js';
import { listDeals, dealState, offerShort, syncDeals } from './data/deals.js';
import { deliver, syncMessages } from './data/inbox.js';
import { api } from './api.js';
import { roomOfPc } from './data/club.js';
import { toMin, dayKey, HOUR } from './time.js';

const SENT_KEY = 'colizeum.sent.v1'; // { runs: { 'dealId:start': ms }, days: { 'YYYY-MM-DD': count } }
const TICK_MS = 5000;

export const NOTIFY_DEFAULTS = { deals: true, free: true, max: 2, quietFrom: '23:00', quietTo: '09:00', rooms: null };
export const notifySetting = (key) => getSetting(`notify.${key}`, NOTIFY_DEFAULTS[key]);

export function inQuietHours(now = Date.now()) {
  const from = toMin(notifySetting('quietFrom'));
  const to = toMin(notifySetting('quietTo'));
  if (from === to) return false;
  const mins = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  return from < to ? mins >= from && mins < to : mins >= from || mins < to;
}

const runKey = (deal, state) => `${deal.id}:${state.start}`;

function dealMessage(deal) {
  return { kind: 'deal', dealId: deal.id, title: `${deal.title} · ${offerShort(deal)}`, body: deal.message, link: '#deals' };
}

/** Announces each run of a deal once, if the player wants it: their rooms, outside quiet hours, under the daily cap. */
function announceDeals(now, st) {
  if (!notifySetting('deals')) return;
  const sent = load(SENT_KEY, { runs: {}, days: {} });
  const today = dayKey(now);
  const rooms = notifySetting('rooms');
  let changed = false;
  for (const deal of listDeals().filter((d) => d.when.mode === 'quiet')) {
    const state = dealState(deal, now, st);
    if (!state.running) continue;
    const key = runKey(deal, state);
    if (sent.runs[key]) continue;
    if (rooms && !deal.rooms.some((r) => rooms.includes(r))) { sent.runs[key] = now; changed = true; continue; }
    if (inQuietHours(now)) continue; // try again when quiet hours end, if the deal still runs
    if ((sent.days[today] ?? 0) >= notifySetting('max')) { sent.runs[key] = now; changed = true; continue; }
    sent.runs[key] = now;
    sent.days[today] = (sent.days[today] ?? 0) + 1;
    changed = true;
    deliver(dealMessage(deal));
  }
  if (!changed) return;
  for (const [k, at] of Object.entries(sent.runs)) if (now - at > 8 * 24 * HOUR) delete sent.runs[k];
  for (const d of Object.keys(sent.days)) if (d !== today) delete sent.days[d];
  save(SENT_KEY, sent);
}

function checkWatches(live) {
  for (const n of watches()) {
    const pc = live.find((p) => p.n === n);
    if (pc?.status !== 'free') continue;
    unwatch(n);
    if (!notifySetting('free')) continue;
    deliver({
      kind: 'free',
      title: `PC ${n} is free now`,
      body: `${roomOfPc(n).name}. Hold it for 15 minutes before someone else sits down.`,
      link: `#live/pc-${n}`,
    });
  }
}

export function tick(now = Date.now()) {
  step(now);
  expireBookings(now);
  const live = getLive(now);
  const st = stats(live);
  announceDeals(now, st);
  checkWatches(live);
  emit('tick', { now, live, stats: st });
}

// Staff "Start the demo over" (server demoResetAt): every phone clears its demo PCs, bookings, holds, codes, watched
// PCs and messages. The player's details, notification choices, view and the staff login stay.
const RESET_KEY = 'colizeum.demoReset';
const DEMO_KEYS = ['colizeum.live.v1', 'colizeum.bookings.v1', 'colizeum.claims.v1', 'colizeum.watch.v1', 'colizeum.inbox.v1', SENT_KEY];

function applyDemoReset(at) {
  if (!at || at <= load(RESET_KEY, 0)) return;
  for (const key of DEMO_KEYS) remove(key);
  save('colizeum.inbox.since', at);
  save(RESET_KEY, at);
  resetLive();
  for (const topic of ['live', 'bookings', 'deals', 'inbox']) emit(topic);
  tick();
}

/** Deals and the club's messages from the server (also called when a notification arrives). */
export async function syncClub() {
  const club = await syncDeals();
  applyDemoReset(club?.demoResetAt);
  await syncMessages((since) => api(`/messages?since=${since}`).then((d) => d.messages));
}

let timer = null;
export function startEngine() {
  if (timer) return;
  tick();
  syncClub();
  let beats = 0;
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    tick();
    beats += 1;
    if (beats % 12 === 0) syncClub(); // every minute
  }, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    tick();
    syncClub();
  });
}
