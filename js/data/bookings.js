// Bookings and 15-minute holds. In this demo they live on the phone; staff mode (same phone) confirms them.
// Later the club's server keeps them and the front-desk program locks the PCs.
import { load, save, emit } from '../store.js';

const KEY = 'colizeum.bookings.v1';
export const HOLD_MINUTES = 15;
const MIN = 60000;

const all = () => load(KEY, []);
const store = (list) => { save(KEY, list); emit('bookings'); };
const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const isLive = (b) => b.status === 'pending' || b.status === 'confirmed';

/** Newest first. */
export function listBookings() {
  return all().sort((a, b) => b.createdAt - a.createdAt);
}

export function getBooking(id) {
  return all().find((b) => b.id === id) ?? null;
}

/** { room, pcs, start, end, people, name, phone } → saved as a request the club has to confirm. */
export function addBooking(fields) {
  const booking = { id: newId(), kind: 'booking', status: 'pending', createdAt: Date.now(), ...fields };
  store([...all(), booking]);
  return booking;
}

export function updateBooking(id, patch) {
  const list = all().map((b) => (b.id === id ? { ...b, ...patch } : b));
  store(list);
  return list.find((b) => b.id === id) ?? null;
}

/** The PC this phone is holding right now, if any. */
export function activeHold(now = Date.now()) {
  return all().find((b) => b.kind === 'hold' && b.status === 'confirmed' && b.end > now) ?? null;
}

/** Holds one free PC for 15 minutes; a new hold replaces the old one. Returns { hold, replaced }. */
export function holdPc(n, room, now = Date.now()) {
  const previous = activeHold(now);
  const list = all().map((b) => (previous && b.id === previous.id ? { ...b, status: 'cancelled' } : b));
  const hold = {
    id: newId(), kind: 'hold', status: 'confirmed', createdAt: now,
    room, pcs: [n], start: now, end: now + HOLD_MINUTES * MIN, people: 1,
  };
  store([...list, hold]);
  return { hold, replaced: previous };
}

/** Live bookings that overlap [start, end) on PC n. */
export function bookingsOn(n, start, end) {
  return all().filter((b) => isLive(b) && b.pcs.includes(n) && b.start < end && b.end > start);
}

/** Marks finished holds and bookings as done; returns true when something changed. */
export function expireBookings(now = Date.now()) {
  let changed = false;
  const list = all().map((b) => {
    if (isLive(b) && b.end <= now) { changed = true; return { ...b, status: b.status === 'pending' ? 'expired' : 'done' }; }
    return b;
  });
  if (changed) store(list);
  return changed;
}
