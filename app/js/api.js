// Talking to the club's server (server/server.js on the VPS, behind nginx at /colizeum-api/).
// The local preview (tools/serve.js) uses the live server too, unless localStorage 'colizeum.apiBase' points it at a
// test server on this PC (only honoured on localhost).
import { load, save } from './store.js';

export const API = (location.hostname === 'localhost' && load('colizeum.apiBase', '')) || 'https://nexflowclub.com/colizeum-api';
const STAFF_KEY = 'colizeum.staffKey';

/** JSON request; throws an Error with .status and the server's message (or "offline"). */
export async function api(path, { method = 'GET', body, staff = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (staff) headers.Authorization = `Bearer ${staffKey()}`;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch {
    throw Object.assign(new Error('Can\'t reach the club\'s server. Check your internet and try again.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Server error (${res.status})`), { status: res.status });
  return data;
}

// The staff key lives only on the admin's phone, after he typed it once in staff mode.
export const staffKey = () => load(STAFF_KEY, '');
export const setStaffKey = (key) => save(STAFF_KEY, key);
export const forgetStaffKey = () => { try { localStorage.removeItem(STAFF_KEY); } catch {} };
