// Which PCs are free right now. DEMO: there is no link to the club's front-desk program yet, so this file plays
// a believable club: busier in the evening, quieter in the morning, players arriving and leaving every few
// seconds. Later the same getLive() will read the real data from the club's server instead.
import { load, save, emit } from '../store.js';
import { ROOMS, ALL_PCS, TOTAL_PCS, roomOfPc, pcsOf } from './club.js';
import { activeHold, bookingsOn, listBookings, isLive } from './bookings.js';
import { MIN, HOUR } from '../time.js';

const KEY = 'colizeum.live.v1';
const WATCH_KEY = 'colizeum.watch.v1';
const RESERVE_AHEAD = 2 * HOUR; // a confirmed booking shows on the map from 2 h before it starts

// Share of PCs taken at each hour of a weekday; weekend daytimes are busier.
const CURVE = [0.55, 0.45, 0.35, 0.25, 0.15, 0.1, 0.08, 0.1, 0.14, 0.18, 0.2, 0.24,
  0.3, 0.32, 0.33, 0.38, 0.48, 0.6, 0.72, 0.82, 0.88, 0.9, 0.85, 0.7];
const ROOM_FACTOR = { vip: 1, streamer: 0.9, bootcamp: 1.05, bootcamp2: 1, hall: 1 };
const SESSION_MINUTES = [45, 60, 90, 120, 120, 180, 180, 240, 300];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const upTo5 = (ms) => Math.ceil(ms / (5 * MIN)) * 5 * MIN;

/** How full a room "should" be at this moment (0–1). Staff can force a level to test quiet-time deals. */
export function targetBusy(roomId, now = Date.now(), level = null) {
  if (level != null) return level;
  const d = new Date(now);
  const h = d.getHours();
  const blend = CURVE[h] + (CURVE[(h + 1) % 24] - CURVE[h]) * (d.getMinutes() / 60);
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const t = blend + (weekend && h >= 10 && h < 18 ? 0.15 : 0);
  return Math.min(0.97, t * (ROOM_FACTOR[roomId] ?? 1));
}

const startSession = (now) => ({ s: 'busy', until: upTo5(now + pick(SESSION_MINUTES) * MIN) });

function fresh(now, level) {
  const pcs = {};
  for (const n of ALL_PCS) {
    const busy = Math.random() < targetBusy(roomOfPc(n).id, now, level);
    pcs[n] = busy ? { s: 'busy', until: upTo5(now + (10 + Math.random() * 270) * MIN) } : { s: 'free' };
  }
  return { pcs, tick: now, level };
}

let cache = null;
function state(now = Date.now()) {
  if (!cache) cache = load(KEY, null);
  const stale = !cache?.pcs || now - cache.tick > 6 * HOUR || Object.keys(cache.pcs).length !== TOTAL_PCS
    || ALL_PCS.some((n) => !cache.pcs[n]);
  if (stale) {
    cache = fresh(now, cache?.level ?? null);
    save(KEY, cache);
  }
  return cache;
}

function commit(st) {
  cache = st;
  save(KEY, st);
  emit('live');
}

/** True when a hold or booking keeps this PC for this phone now or within the next 2 hours. */
const kept = (n, now) => bookingsOn(n, now, now + RESERVE_AHEAD).length > 0;

/** Moves the demo club forward: sessions end, players leave early now and then, new players arrive. */
export function step(now = Date.now()) {
  const st = state(now);
  if (now - st.tick < 3000) return false;
  let changed = false;

  for (const n of ALL_PCS) {
    const p = st.pcs[n];
    if (p.s === 'busy' && p.until <= now) { st.pcs[n] = { s: 'free' }; changed = true; }
  }

  for (const room of ROOMS) {
    const nums = pcsOf(room);
    const busy = nums.filter((n) => st.pcs[n].s === 'busy');
    const want = Math.round(targetBusy(room.id, now, st.level) * room.count);
    const free = nums.filter((n) => st.pcs[n].s === 'free' && !kept(n, now));
    if (busy.length > want + 1 && Math.random() < 0.5) {
      st.pcs[pick(busy)] = { s: 'free' }; // someone leaves early
      changed = true;
    } else if (busy.length < want && free.length && Math.random() < 0.45) {
      st.pcs[pick(free)] = startSession(now); // someone sits down
      changed = true;
    } else if (room.count >= 9 && busy.length && free.length && Math.random() < 0.06) {
      st.pcs[pick(busy)] = { s: 'free' }; // the usual coming and going in the big rooms
      st.pcs[pick(free)] = startSession(now);
      changed = true;
    }
  }

  st.tick = now;
  if (changed) commit(st);
  else { cache = st; save(KEY, st); }
  return changed;
}

/**
 * Every PC as { n, room, status, until, at, mine }:
 * status 'free' | 'busy' (until = free from) | 'reserved' (at = booking start) | 'held' (until = hold ends) | 'off'.
 * Holds and bookings made on this phone are `mine`.
 */
export function getLive(now = Date.now()) {
  const st = state(now);
  const hold = activeHold(now);
  const bookings = listBookings().filter((b) => b.kind === 'booking' && isLive(b) && b.end > now);
  return ALL_PCS.map((n) => {
    const p = st.pcs[n];
    const pc = { n, room: roomOfPc(n).id, status: p.s, until: p.until ?? null, at: null, mine: false };
    if (p.s === 'off') return pc;
    if (hold?.pcs.includes(n)) return { ...pc, status: 'held', until: hold.end, mine: true };
    const b = bookings.find((x) => x.pcs.includes(n) && x.start - RESERVE_AHEAD <= now);
    if (b && b.start <= now && b.status === 'confirmed') return { ...pc, status: 'busy', until: b.end, mine: true };
    if (b && b.status === 'confirmed' && p.s === 'free') return { ...pc, status: 'reserved', at: b.start, mine: true };
    return pc;
  });
}

/** Counts per room: { free, taken, off, total, busyPct } plus club totals. */
export function stats(live = getLive()) {
  const rooms = {};
  for (const r of ROOMS) rooms[r.id] = { free: 0, taken: 0, off: 0, total: r.count, busyPct: 0 };
  for (const pc of live) {
    const r = rooms[pc.room];
    if (pc.status === 'free') r.free += 1;
    else if (pc.status === 'off') r.off += 1;
    else r.taken += 1;
  }
  let free = 0;
  let taken = 0;
  for (const r of Object.values(rooms)) {
    r.busyPct = r.total - r.off ? Math.round((100 * r.taken) / (r.total - r.off)) : 100;
    free += r.free;
    taken += r.taken;
  }
  return { rooms, free, taken, total: TOTAL_PCS };
}

// ---- Staff controls (demo) ----

/** status 'free' | 'busy' (for `minutes`) | 'off' */
export function setPc(n, status, minutes = 60, now = Date.now()) {
  const st = state(now);
  st.pcs[n] = status === 'busy' ? { s: 'busy', until: upTo5(now + minutes * MIN) } : { s: status };
  commit(st);
}

export const getLevel = () => state().level ?? null;

/** Forces how full the demo club is (0–1), or null for "follow the time of day"; rebalances at once. */
export function setLevel(level, now = Date.now()) {
  const st = state(now);
  st.level = level;
  for (const room of ROOMS) {
    const nums = pcsOf(room).filter((n) => st.pcs[n].s !== 'off' && !kept(n, now));
    const want = Math.round(targetBusy(room.id, now, level) * room.count);
    let busy = nums.filter((n) => st.pcs[n].s === 'busy');
    let free = nums.filter((n) => st.pcs[n].s === 'free');
    while (busy.length > want) {
      const n = pick(busy);
      st.pcs[n] = { s: 'free' };
      busy = busy.filter((x) => x !== n);
    }
    while (busy.length < want && free.length) {
      const n = pick(free);
      st.pcs[n] = startSession(now);
      free = free.filter((x) => x !== n);
      busy.push(n);
    }
  }
  commit(st);
}

export function resetLive() {
  cache = null;
}

// ---- "Tell me when it's free" ----

export const watches = () => load(WATCH_KEY, []);
export const isWatched = (n) => watches().includes(n);

export function toggleWatch(n) {
  const list = watches();
  const next = list.includes(n) ? list.filter((x) => x !== n) : [...list, n];
  save(WATCH_KEY, next);
  emit('live');
  return next.includes(n);
}

export function unwatch(n) {
  save(WATCH_KEY, watches().filter((x) => x !== n));
}
