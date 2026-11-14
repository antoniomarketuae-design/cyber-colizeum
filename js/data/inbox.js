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

/** { kind: 'deal' | 'free' | 'booking', title, body, link } */
export function deliver(msg) {
  const m = { id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: Date.now(), read: false, ...msg };
  save(KEY, [m, ...messages()].slice(0, 60));
  emit('inbox');
  if (document.visibilityState === 'visible') presenter?.(m);
  else systemNotify(m);
  return m;
}

async function systemNotify(m) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.showNotification(m.title, { body: m.body, icon: 'icons/icon-192.png', tag: m.id, data: { link: m.link || '#live' } });
  } catch {}
}
