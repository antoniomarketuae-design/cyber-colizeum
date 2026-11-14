// The heartbeat: every 5 seconds (while the app is open) the demo club moves on, finished holds and bookings
// close, deals that just started are announced (within the player's own limits) and watched PCs that became
// free are reported. Screens listen for 'tick' to repaint.
import { emit, load, save, getSetting } from './store.js';
import { step, getLive, stats, watches, unwatch } from './data/live.js';
import { expireBookings } from './data/bookings.js';
import { listDeals, dealState, offerShort } from './data/deals.js';
import { deliver } from './data/inbox.js';
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
  for (const deal of listDeals()) {
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

/** Staff "Send now": goes to every player at once (in this demo, this phone), whatever their limits. */
export function sendDealNow(deal, now = Date.now()) {
  const st = stats(getLive(now));
  const state = dealState(deal, now, st);
  if (state.running) {
    const sent = load(SENT_KEY, { runs: {}, days: {} });
    sent.runs[runKey(deal, state)] = now;
    save(SENT_KEY, sent);
  }
  deliver(dealMessage(deal));
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

let timer = null;
export function startEngine() {
  if (timer) return;
  tick();
  timer = setInterval(() => { if (document.visibilityState === 'visible') tick(); }, TICK_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
}
