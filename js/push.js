// Real phone notifications (Web Push). On iPhone they work only in the app added to the Home Screen (iOS 16.4+).
// The phone asks once; the server keeps its notification address plus the player's choices from Me (deal
// messages on/off, rooms, quiet hours, how many a day) and sends only what fits them.
import { load, save, emit } from './store.js';
import { api } from './api.js';
import { notifySetting } from './engine.js';

const VAPID_KEY = 'colizeum.vapid';
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// The service worker, ready before any tap (see enablePush).
let readyReg = null;
if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then((reg) => { readyReg = reg; }).catch(() => {});

/** 'needs-install' | 'unsupported' | 'denied' | 'off' | 'on' */
export async function pushState() {
  if (!supported()) return isIOS && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

export function prefs() {
  return {
    deals: notifySetting('deals'),
    rooms: notifySetting('rooms'),
    quietFrom: notifySetting('quietFrom'),
    quietTo: notifySetting('quietTo'),
    max: notifySetting('max'),
  };
}

/** The server's public key, fetched ahead of time so the permission prompt is not delayed. */
export async function vapidKey() {
  const cached = load(VAPID_KEY, '');
  if (cached) return cached;
  const { vapidPublicKey } = await api('/config');
  save(VAPID_KEY, vapidPublicKey);
  return vapidPublicKey;
}

const keyBytes = (b64url) => {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/**
 * Turns notifications on: the phone asks the player, then registers with the club's server. Call it straight from
 * a tap. Safari allows subscribing only during the tap itself, so subscribe() must be the very first thing that
 * waits: it shows the permission question by itself. (v5 asked first and subscribed after, which iPhone refused.)
 * Returns the new state; throws with a plain message when something fails.
 */
export async function enablePush() {
  const key = load(VAPID_KEY, '');
  if (!readyReg || !key) {
    warmUp();
    throw Object.assign(new Error('The app is still starting. Tap “Turn on notifications” again.'), { status: 0 });
  }
  let sub;
  try {
    sub = await readyReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  } catch (err) {
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'default') return 'off'; // the player closed the question
    throw Object.assign(new Error(`Couldn’t turn on notifications (${err.name || 'error'}). Try again.`), { status: 0 });
  }
  await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), prefs: prefs() } });
  emit('push');
  return 'on';
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  emit('push');
}

let prefsTimer = null;
/** After a change in Me: tell the server the player's new choices (if notifications are on). */
export function syncPrefs() {
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(async () => {
    try {
      if (!supported() || Notification.permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON(), prefs: prefs() } });
    } catch {}
  }, 800);
}

/** Fetches the server key early (cheap, cached) so a later tap on "Turn on" goes straight to the question. */
export function warmUp() {
  if (supported()) vapidKey().catch(() => {});
}
