// What the app keeps on this phone (localStorage), plus a tiny message bus so screens repaint when data changes.
// Nothing leaves the device. Never touches localStorage at import time, only when a function is called.
const SETTINGS_KEY = 'colizeum.settings.v1';
const listeners = new Set();
const topics = new Map();

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getSetting(key, fallback) {
  const s = load(SETTINGS_KEY, {});
  return key in s ? s[key] : fallback;
}

export function setSetting(key, value) {
  const s = load(SETTINGS_KEY, {});
  s[key] = value;
  save(SETTINGS_KEY, s);
  for (const fn of listeners) { try { fn(key); } catch {} }
  emit('settings', key);
}

/** Calls fn(key) after any setting changes; returns a function that stops listening. */
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Message bus: 'tick' (every few seconds), 'live', 'deals', 'bookings', 'inbox', 'settings'. Returns an off(). */
export function on(topic, fn) {
  if (!topics.has(topic)) topics.set(topic, new Set());
  topics.get(topic).add(fn);
  return () => topics.get(topic)?.delete(fn);
}

export function emit(topic, data) {
  for (const fn of topics.get(topic) ?? []) { try { fn(data); } catch (err) { console.error(err); } }
}

export function remove(key) {
  try { localStorage.removeItem(key); } catch {}
}

/** Every key this app writes, for "Reset demo". */
export function clearAll() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('colizeum.')) localStorage.removeItem(key);
  } catch {}
}
