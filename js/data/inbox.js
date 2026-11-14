// Messages to the player: deals, "your PC is free", booking answers. Shown as a banner at the top of the app
// (the presenter set by app.js) and kept in the inbox behind the bell. When the phone allows notifications and
// the app is in the background, the service worker shows a real one. Real push from the club's server comes later.
import { load, save, emit } from '../store.js';

const KEY = 'colizeum.inbox.v1';
let presenter = null;

export const setPresenter = (fn) => { presenter = fn; };
export const messages = () => load(KEY, []);
export const unreadCount = () => messages().filter((m) => !m.read).length;

export function markAllRead() {
  const list = messages();
  if (!list.some((m) => !m.read)) return;
  save(KEY, list.map((m) => ({ ...m, read: true })));
  emit('inbox');
}

export function clearInbox() {
  save(KEY, []);
  emit('inbox');
}

/** { kind: 'deal' | 'news' | 'free' | 'booking', title, body, link }; `quiet` = straight to the inbox, no banner. */
export function deliver(msg, { quiet = false } = {}) {
  const m = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: Date.now(), read: false, ...msg };
  if (messages().some((x) => x.id === m.id)) return null; // already here (push and inbox sync can both bring it)
  save(KEY, [m, ...messages()].sort((a, b) => b.at - a.at).slice(0, 60));
  emit('inbox');
  if (quiet) return m;
  if (document.visibilityState === 'visible') presenter?.(m);
  else systemNotify(m);
  return m;
}

// ---- Messages the club sent to everyone (kept on the server; arrive even without notifications allowed) ----

const SINCE_KEY = 'colizeum.inbox.since';

/** Adds the club's messages sent since the last check. The first time, only the last 12 hours. */
export async function syncMessages(fetchMessages) {
  const since = load(SINCE_KEY, null) ?? Date.now() - 12 * 3600000;
  try {
    const list = await fetchMessages(since);
    let newest = since;
    for (const m of list.sort((a, b) => a.at - b.at)) {
      deliver({ id: m.id, kind: m.kind, title: m.title, body: m.body, link: m.link, at: m.at }, { quiet: true });
      newest = Math.max(newest, m.at);
    }
    save(SINCE_KEY, newest);
  } catch {}
}

async function systemNotify(m) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.showNotification(m.title, { body: m.body, icon: 'icons/logo-192.png', tag: m.id, data: { link: m.link || '#live' } });
  } catch {}
}
