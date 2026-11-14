// Deals the admin makes in staff mode, and the codes players get for them.
// A deal = rooms + an offer (% off, a price per hour, or bonus time) + when it runs:
//   'now'    right now, for a few hours
//   'weekly' on chosen days between two times (may cross midnight, e.g. 22:00–02:00)
//   'quiet'  on chosen days between two times, but only while its rooms are emptier than a % (the club's own idea)
import { load, save, emit } from '../store.js';
import { roomById } from './club.js';
import { MIN, toMin, atMinutes, hm } from '../time.js';

const KEY = 'colizeum.deals.v1';
const CLAIMS_KEY = 'colizeum.claims.v1';
export const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

// Examples so the demo is not empty; the admin edits or deletes them.
const EXAMPLES = [
  {
    id: 'd-happy', title: 'Weekday happy hour', on: true, codeMinutes: 120,
    message: 'Main hall and both Bootcamps are 30% off. Show your code at the desk.',
    rooms: ['hall', 'bootcamp', 'bootcamp2'], offer: { type: 'percent', value: 30 },
    when: { mode: 'weekly', days: [1, 2, 3, 4, 5], from: '10:00', to: '16:00' },
  },
  {
    id: 'd-quiet', title: 'Quiet hall bonus', on: true, codeMinutes: 120,
    message: 'The hall is quiet right now. Pay for 2 hours, play 3.',
    rooms: ['hall'], offer: { type: 'bonus', value: 50 },
    when: { mode: 'quiet', days: EVERY_DAY, from: '09:00', to: '18:00', below: 35 },
  },
  {
    id: 'd-vip', title: 'VIP afternoon', on: true, codeMinutes: 180,
    message: 'The VIP room is 3.50 € an hour this afternoon.',
    rooms: ['vip'], offer: { type: 'price', value: 3.5 },
    when: { mode: 'weekly', days: [1, 2, 3, 4], from: '12:00', to: '17:00' },
  },
];

function data() {
  let d = load(KEY, null);
  if (!d?.deals) {
    d = { deals: EXAMPLES.map((x) => ({ ...x, createdAt: Date.now() })) };
    save(KEY, d);
  }
  return d;
}
const store = (deals) => { save(KEY, { deals }); emit('deals'); };

export const listDeals = () => data().deals;
export const getDeal = (id) => listDeals().find((d) => d.id === id) ?? null;

export function saveDeal(deal) {
  const deals = listDeals();
  const saved = { ...deal, id: deal.id || `d${Date.now().toString(36)}`, createdAt: deal.createdAt || Date.now() };
  const i = deals.findIndex((d) => d.id === saved.id);
  if (i >= 0) deals[i] = saved;
  else deals.unshift(saved);
  store(deals);
  return saved;
}

export function deleteDeal(id) {
  store(listDeals().filter((d) => d.id !== id));
}

export function setDealOn(id, on) {
  store(listDeals().map((d) => (d.id === id ? { ...d, on } : d)));
}

// ---- When does a deal run? ----

/** The [start, end) window of a weekly / quiet deal that contains `now`, or null. */
function windowAt(when, now) {
  const day = new Date(now).getDay();
  const mins = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const from = toMin(when.from);
  const to = toMin(when.to);
  if (from < to) {
    if (when.days.includes(day) && mins >= from && mins < to) return { start: atMinutes(now, from), end: atMinutes(now, to) };
    return null;
  }
  if (when.days.includes(day) && mins >= from) return { start: atMinutes(now, from), end: atMinutes(now, 24 * 60 + to) };
  if (when.days.includes((day + 6) % 7) && mins < to) return { start: atMinutes(now, from - 24 * 60), end: atMinutes(now, to) };
  return null;
}

/** Next time a weekly / quiet window opens after `now` (within 8 days), or null. */
function nextStart(when, now) {
  for (let i = 0; i <= 8; i += 1) {
    const dayMs = atMinutes(now, i * 24 * 60);
    const start = atMinutes(dayMs, toMin(when.from));
    if (when.days.includes(new Date(dayMs).getDay()) && start > now) return start;
  }
  return null;
}

/** Share of the deal's rooms that is taken now (0–100), from live.stats(). */
export function roomsBusyPct(rooms, st) {
  let taken = 0;
  let total = 0;
  for (const id of rooms) {
    const r = st?.rooms[id];
    if (!r) continue;
    taken += r.taken;
    total += r.total - r.off;
  }
  return total ? Math.round((100 * taken) / total) : 100;
}

/**
 * { running, start, end } when it runs now; otherwise { running: false, reason: 'off' | 'over' | 'time' | 'busy',
 * next?, pct? }. `st` (live.stats()) is needed for 'quiet' deals.
 */
export function dealState(deal, now, st) {
  if (!deal.on) return { running: false, reason: 'off' };
  const w = deal.when;
  if (w.mode === 'now') {
    if (now < w.endsAt) return { running: true, start: w.startsAt, end: w.endsAt };
    return { running: false, reason: 'over' };
  }
  const win = windowAt(w, now);
  if (!win) return { running: false, reason: 'time', next: nextStart(w, now) };
  if (w.mode === 'quiet') {
    const pct = roomsBusyPct(deal.rooms, st);
    if (pct >= w.below) return { running: false, reason: 'busy', pct, end: win.end };
    return { running: true, start: win.start, end: win.end, pct };
  }
  return { running: true, ...win };
}

/** [{ deal, state }] for the deals running now, best offers first. */
export function runningDeals(now, st) {
  return listDeals()
    .map((deal) => ({ deal, state: dealState(deal, now, st) }))
    .filter((x) => x.state.running);
}

// ---- Words ----

export function offerShort(deal) {
  const { type, value } = deal.offer;
  if (type === 'percent') return `−${value}%`;
  if (type === 'price') return `${Number(value).toFixed(2)} €/h`;
  return `+${value}% time`;
}

export function offerLong(deal) {
  const { type, value } = deal.offer;
  if (type === 'percent') return `${value}% off`;
  if (type === 'price') return `${Number(value).toFixed(2)} € per hour`;
  return `+${value}% extra play time`;
}

/** [1,2,3,4,5] → "Mon–Fri"; all → "Every day"; [6,0] → "Sat–Sun"; else "Mon, Wed, Fri". */
export function daysText(days) {
  const set = WEEK.filter((d) => days.includes(d));
  if (set.length === 7) return 'Every day';
  if (!set.length) return 'No days';
  const idx = set.map((d) => WEEK.indexOf(d));
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (run && set.length >= 3) return `${DAY_SHORT[set[0]]}–${DAY_SHORT[set[set.length - 1]]}`;
  return set.map((d) => DAY_SHORT[d]).join(', ');
}

export const roomsText = (rooms) => rooms.map((id) => roomById(id)?.name ?? id).join(', ');

/** "Mon–Fri · 10:00–16:00", "When under 35% busy · Every day 09:00–18:00", "Right now, until 16:30". */
export function whenText(deal) {
  const w = deal.when;
  if (w.mode === 'now') return `Right now, until ${hm(w.endsAt)}`;
  const times = `${daysText(w.days)} · ${w.from}–${w.to}`;
  return w.mode === 'quiet' ? `When under ${w.below}% busy · ${times}` : times;
}

/** The best price per hour in a room right now, given the running deals: { base, now, deal, bonus }. */
export function roomPrice(room, running) {
  let best = room.perHour;
  let deal = null;
  let bonus = null;
  for (const { deal: d } of running) {
    if (!d.rooms.includes(room.id)) continue;
    const { type, value } = d.offer;
    if (type === 'bonus') { if (!bonus || value > bonus.offer.value) bonus = d; continue; }
    const price = type === 'percent' ? room.perHour * (1 - value / 100) : Number(value);
    if (price < best) { best = price; deal = d; }
  }
  return { base: room.perHour, now: Math.round(best * 100) / 100, deal, bonus };
}

// ---- Codes ----

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => `CC-${Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')}`;

export const allClaims = () => load(CLAIMS_KEY, []);
export const activeClaims = (now = Date.now()) => allClaims().filter((c) => c.expiresAt > now);
export const claimFor = (dealId, now = Date.now()) => activeClaims(now).find((c) => c.dealId === dealId) ?? null;

/** Gives this phone a code for the deal (or the one it already has). */
export function claimDeal(deal, now = Date.now()) {
  const existing = claimFor(deal.id, now);
  if (existing) return existing;
  const claim = {
    code: newCode(), dealId: deal.id, title: deal.title, offer: offerLong(deal), rooms: deal.rooms,
    claimedAt: now, expiresAt: now + (deal.codeMinutes || 120) * MIN,
  };
  save(CLAIMS_KEY, [claim, ...allClaims().filter((c) => c.expiresAt > now - 7 * 24 * 60 * MIN)]);
  emit('deals');
  return claim;
}
