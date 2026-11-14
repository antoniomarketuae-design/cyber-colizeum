// Cyber Colizeum API: the deals every phone sees, and real phone notifications (Web Push) when the club has one.
// Runs on the VPS behind nginx at https://nexflowclub.com/colizeum-api/ (nginx strips that prefix).
// Data lives in small JSON files in data/ (a club has hundreds of phones at most); every write is atomic.
// Staff calls send `Authorization: Bearer <staff key>`; the server keeps only the key's sha256.
import http from 'node:http';
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import webpush from 'web-push';

try { process.loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url))); } catch {}

const VERSION = '1';
const PORT = Number(process.env.PORT) || 3030;
const HERE = fileURLToPath(new URL('.', import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(HERE, 'data');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const STAFF_KEY_SHA256 = (process.env.STAFF_KEY_SHA256 || '').toLowerCase();
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const TZ = 'Europe/Sofia';
const ROOMS = ['vip', 'streamer', 'bootcamp', 'bootcamp2', 'hall'];
const PUSH_HOSTS = ['push.apple.com', 'fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com'];
const MAX_SUBS = 50000;
const KEEP_MESSAGES = 40;

if (!/^[0-9a-f]{64}$/.test(STAFF_KEY_SHA256)) { console.error('STAFF_KEY_SHA256 is missing'); process.exit(1); }
if (!VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) { console.error('VAPID keys are missing'); process.exit(1); }
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://cybercolizeum.bg', VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);

// ---- Storage: one JSON file per kind, kept in memory, written atomically ----

mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });

function loadFile(name, fallback) {
  try { return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')); } catch { return fallback; }
}
function saveFile(name, value) {
  const file = join(DATA_DIR, name);
  writeFileSync(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

const EXAMPLE_DEALS = [
  {
    id: 'd-happy', title: 'Weekday happy hour', on: true, notify: true, codeMinutes: 120,
    message: 'Main hall and both Bootcamps are 30% off. Show your code at the desk.',
    rooms: ['hall', 'bootcamp', 'bootcamp2'], offer: { type: 'percent', value: 30 },
    when: { mode: 'weekly', days: [1, 2, 3, 4, 5], from: '10:00', to: '16:00' },
  },
  {
    id: 'd-quiet', title: 'Quiet hall bonus', on: true, notify: true, codeMinutes: 120,
    message: 'The hall is quiet right now. Pay for 2 hours, play 3.',
    rooms: ['hall'], offer: { type: 'bonus', value: 50 },
    when: { mode: 'quiet', days: [0, 1, 2, 3, 4, 5, 6], from: '09:00', to: '18:00', below: 35 },
  },
  {
    id: 'd-vip', title: 'VIP afternoon', on: true, notify: true, codeMinutes: 180,
    message: 'The VIP room is 3.50 € an hour this afternoon.',
    rooms: ['vip'], offer: { type: 'price', value: 3.5 },
    when: { mode: 'weekly', days: [1, 2, 3, 4], from: '12:00', to: '17:00' },
  },
];

const db = {
  deals: loadFile('deals.json', null) ?? { deals: EXAMPLE_DEALS.map((d) => ({ ...d, createdAt: Date.now() })) },
  subs: loadFile('subs.json', { subs: [] }),
  sent: loadFile('sent.json', { runs: {} }),
  messages: loadFile('messages.json', { messages: [] }),
};
saveFile('deals.json', db.deals);

// ---- Helpers ----

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const newId = (prefix) => `${prefix}${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

const hits = new Map();
/** True when this key went over `max` calls in the last `windowMs`. */
function tooMany(key, max, windowMs) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) if (!times.some((t) => now - t < 3600000)) hits.delete(key);
}, 600000).unref();

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function readJson(req, maxBytes = 16384) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooBig = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) tooBig = true;
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooBig) return reject(httpError(413, 'Request too large'));
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(httpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function isStaff(req) {
  const m = /^Bearer (.{4,200})$/.exec(String(req.headers.authorization || ''));
  return Boolean(m) && safeEqual(sha256(m[1].trim()), STAFF_KEY_SHA256);
}

function requireStaff(req) {
  if (tooMany(`staff:${clientIp(req)}`, 60, 15 * 60000)) throw httpError(429, 'Too many tries. Wait a few minutes.');
  if (!isStaff(req)) {
    if (tooMany(`staff-bad:${clientIp(req)}`, 8, 15 * 60000)) throw httpError(429, 'Too many wrong keys. Wait 15 minutes.');
    throw httpError(401, 'Wrong staff key');
  }
}

// ---- Sofia time (the VPS clock is UTC) ----

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const sofiaFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});
function sofia(ms) {
  const p = Object.fromEntries(sofiaFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { day: WEEKDAYS.indexOf(p.weekday), mins: Number(p.hour) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

/** The Sofia date the current run of a weekly / quiet window started on, or null when it is not running. */
function windowRun(when, ms) {
  const t = sofia(ms);
  const from = toMin(when.from);
  const to = toMin(when.to);
  if (from < to) return when.days.includes(t.day) && t.mins >= from && t.mins < to ? t.date : null;
  if (when.days.includes(t.day) && t.mins >= from) return t.date;
  const y = sofia(ms - 24 * 3600000);
  if (when.days.includes(y.day) && t.mins < to) return y.date;
  return null;
}

function inQuiet(prefs, ms) {
  const from = toMin(prefs.quietFrom);
  const to = toMin(prefs.quietTo);
  if (!(from >= 0) || !(to >= 0) || from === to) return false;
  const { mins } = sofia(ms);
  return from < to ? mins >= from && mins < to : mins >= from || mins < to;
}

// ---- Deals ----

function offerShort(deal) {
  const { type, value } = deal.offer;
  if (type === 'percent') return `−${value}%`;
  if (type === 'price') return `${Number(value).toFixed(2)} €/h`;
  return `+${value}% time`;
}

const LIMITS = { percent: [1, 90], price: [0.5, 50], bonus: [5, 300] };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Checks a deal from staff mode and returns the clean version to store. */
function cleanDeal(body, existing) {
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const title = str(body.title, 40);
  const message = str(body.message, 160);
  if (!title) throw httpError(400, 'Give the deal a short name');
  if (!message) throw httpError(400, 'Write the message players will read');
  const rooms = Array.isArray(body.rooms) ? ROOMS.filter((r) => body.rooms.includes(r)) : [];
  if (!rooms.length) throw httpError(400, 'Pick at least one room');
  const type = body.offer?.type;
  const value = Number(body.offer?.value);
  if (!LIMITS[type] || !(value >= LIMITS[type][0] && value <= LIMITS[type][1])) throw httpError(400, 'Check the offer amount');
  const w = body.when || {};
  let when;
  if (w.mode === 'now') {
    const hours = Number(w.hours);
    if (!(hours >= 0.5 && hours <= 24)) throw httpError(400, 'Pick how long the deal runs');
    const keep = existing?.when?.mode === 'now' && existing.when.hours === hours && existing.when.endsAt > Date.now();
    const startsAt = keep ? existing.when.startsAt : Date.now();
    when = { mode: 'now', hours, startsAt, endsAt: startsAt + hours * 3600000 };
  } else if (w.mode === 'weekly' || w.mode === 'quiet') {
    const days = Array.isArray(w.days) ? [...new Set(w.days.map(Number).filter((d) => d >= 0 && d <= 6))].sort() : [];
    if (!days.length) throw httpError(400, 'Pick at least one day');
    if (!HHMM.test(w.from) || !HHMM.test(w.to) || w.from === w.to) throw httpError(400, 'Check the start and end times');
    when = { mode: w.mode, days, from: w.from, to: w.to };
    if (w.mode === 'quiet') {
      const below = Number(w.below);
      if (!(below >= 5 && below <= 95)) throw httpError(400, 'Enter a busy level from 5 to 95%');
      when.below = below;
    }
  } else throw httpError(400, 'Pick when the deal runs');
  const codeMinutes = [60, 120, 180, 300].includes(Number(body.codeMinutes)) ? Number(body.codeMinutes) : 120;
  return {
    id: existing?.id || newId('d'),
    title, message, rooms, offer: { type, value }, when, codeMinutes,
    on: body.on !== false,
    notify: body.notify !== false,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
}

const saveDeals = () => saveFile('deals.json', db.deals);
const findDeal = (id) => db.deals.deals.find((d) => d.id === id);

/** The key of the deal's current run when it is running now ('quiet' needs the club's PCs, so never here). */
function runKey(deal, ms = Date.now()) {
  if (!deal.on) return null;
  if (deal.when.mode === 'now') return ms < deal.when.endsAt ? `${deal.id}:${deal.when.startsAt}` : null;
  if (deal.when.mode === 'weekly') {
    const date = windowRun(deal.when, ms);
    return date ? `${deal.id}:${date}` : null;
  }
  return null;
}

const dealMessage = (deal) => ({ kind: 'deal', dealId: deal.id, title: `${deal.title} · ${offerShort(deal)}`, body: deal.message, link: '#deals', rooms: deal.rooms });

// ---- Phones that allow notifications ----

function cleanPrefs(p = {}) {
  const rooms = Array.isArray(p.rooms) ? ROOMS.filter((r) => p.rooms.includes(r)) : null;
  return {
    deals: p.deals !== false,
    rooms: rooms && rooms.length && rooms.length < ROOMS.length ? rooms : null,
    quietFrom: HHMM.test(p.quietFrom) ? p.quietFrom : '23:00',
    quietTo: HHMM.test(p.quietTo) ? p.quietTo : '09:00',
    max: [1, 2, 3, 5].includes(Number(p.max)) ? Number(p.max) : 2,
  };
}

function cleanSubscription(s) {
  const endpoint = typeof s?.endpoint === 'string' ? s.endpoint : '';
  let host = '';
  try {
    const u = new URL(endpoint);
    if (u.protocol === 'https:') host = u.hostname;
  } catch {}
  if (!host || endpoint.length > 1000 || !PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) throw httpError(400, 'Not a phone notification address');
  const p256dh = String(s.keys?.p256dh || '');
  const auth = String(s.keys?.auth || '');
  if (!/^[\w-]{80,100}$/.test(p256dh) || !/^[\w-]{16,30}$/.test(auth)) throw httpError(400, 'Not a phone notification address');
  return { endpoint, keys: { p256dh, auth } };
}

const saveSubs = () => saveFile('subs.json', db.subs);

/**
 * Sends a message to every phone that wants it: deal messages on, one of its rooms, outside its quiet hours, and
 * (automatic sends only) under its daily limit. Always kept in the message list the app reads when it opens.
 */
async function broadcast(msg, { automatic = false } = {}) {
  const now = Date.now();
  const message = { id: newId('m'), at: now, ...msg };
  db.messages.messages = [message, ...db.messages.messages].slice(0, KEEP_MESSAGES);
  saveFile('messages.json', db.messages);

  const today = sofia(now).date;
  const phones = db.subs.subs.length;
  const payload = JSON.stringify({ id: message.id, kind: message.kind, title: message.title, body: message.body, link: message.link, at: now });
  const targets = db.subs.subs.filter((s) => {
    if (!s.prefs.deals) return false;
    if (s.prefs.rooms && msg.rooms?.length && !msg.rooms.some((r) => s.prefs.rooms.includes(r))) return false;
    if (inQuiet(s.prefs, now)) return false;
    if (automatic && (s.days?.[today] ?? 0) >= s.prefs.max) return false;
    return true;
  });

  let sent = 0;
  let failed = 0;
  const gone = new Set();
  for (let i = 0; i < targets.length; i += 25) {
    const batch = targets.slice(i, i + 25);
    const results = await Promise.allSettled(batch.map((s) => webpush.sendNotification(s.sub, payload, { TTL: 4 * 3600, urgency: 'high' })));
    results.forEach((r, j) => {
      const s = batch[j];
      if (r.status === 'fulfilled') {
        sent += 1;
        s.lastOk = now;
        s.days = { [today]: (s.days?.[today] ?? 0) + 1 };
      } else {
        failed += 1;
        const code = r.reason?.statusCode;
        if (code === 404 || code === 410) gone.add(s.id); // the phone removed the app or turned notifications off
        else console.error('push failed', code || '', String(r.reason?.body || r.reason?.message || '').slice(0, 200));
      }
    });
  }
  if (gone.size) db.subs.subs = db.subs.subs.filter((s) => !gone.has(s.id));
  saveSubs();
  console.log(`broadcast ${message.id} "${message.title}": ${sent} sent, ${failed} failed, ${phones - targets.length} skipped`);
  return { id: message.id, sent, failed, phones: db.subs.subs.length };
}

/** Announces each run of a deal once (when it is saved running, or when a weekly deal's time starts). */
async function announceRuns() {
  const now = Date.now();
  let changed = false;
  for (const deal of db.deals.deals) {
    const key = runKey(deal, now);
    if (!key || db.sent.runs[key]) continue;
    db.sent.runs[key] = now;
    changed = true;
    if (deal.notify) await broadcast(dealMessage(deal), { automatic: true });
  }
  for (const [k, at] of Object.entries(db.sent.runs)) if (now - at > 9 * 24 * 3600000) { delete db.sent.runs[k]; changed = true; }
  if (changed) saveFile('sent.json', db.sent);
}

// ---- Routes ----

function send(res, req, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(req) });
  res.end(JSON.stringify(data));
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req)); res.end(); return; }

  if (req.method === 'GET' && path === '/health') return send(res, req, 200, { ok: true, version: VERSION });
  if (req.method === 'GET' && path === '/config') return send(res, req, 200, { vapidPublicKey: VAPID_PUBLIC_KEY });
  if (req.method === 'GET' && path === '/deals') return send(res, req, 200, { deals: db.deals.deals, now: Date.now() });
  if (req.method === 'GET' && path === '/messages') {
    const since = Number(url.searchParams.get('since')) || 0;
    return send(res, req, 200, { messages: db.messages.messages.filter((m) => m.at > since).map(({ rooms, ...m }) => m) });
  }

  if (req.method === 'POST' && path === '/push/subscribe') {
    if (tooMany(`sub:${clientIp(req)}`, 40, 3600000)) throw httpError(429, 'Too many requests');
    const body = await readJson(req);
    const sub = cleanSubscription(body.subscription);
    const id = sha256(sub.endpoint).slice(0, 24);
    const existing = db.subs.subs.find((s) => s.id === id);
    if (existing) {
      existing.sub = sub;
      existing.prefs = cleanPrefs(body.prefs);
      existing.seenAt = Date.now();
    } else {
      if (db.subs.subs.length >= MAX_SUBS) throw httpError(503, 'Too many phones');
      db.subs.subs.push({ id, sub, prefs: cleanPrefs(body.prefs), createdAt: Date.now(), seenAt: Date.now(), days: {} });
    }
    saveSubs();
    return send(res, req, 200, { ok: true, id });
  }
  if (req.method === 'POST' && path === '/push/unsubscribe') {
    const body = await readJson(req);
    const id = sha256(String(body.endpoint || '')).slice(0, 24);
    const before = db.subs.subs.length;
    db.subs.subs = db.subs.subs.filter((s) => s.id !== id);
    if (db.subs.subs.length !== before) saveSubs();
    return send(res, req, 200, { ok: true });
  }

  if (path.startsWith('/admin/')) {
    requireStaff(req);
    if (req.method === 'POST' && path === '/admin/check') return send(res, req, 200, { ok: true });
    if (req.method === 'GET' && path === '/admin/stats') {
      const byRoom = Object.fromEntries(ROOMS.map((r) => [r, db.subs.subs.filter((s) => s.prefs.deals && (!s.prefs.rooms || s.prefs.rooms.includes(r))).length]));
      return send(res, req, 200, { phones: db.subs.subs.length, wantDeals: db.subs.subs.filter((s) => s.prefs.deals).length, byRoom, messages: db.messages.messages.slice(0, 10) });
    }
    if (req.method === 'POST' && path === '/admin/push') {
      const body = await readJson(req);
      const deal = body.dealId ? findDeal(String(body.dealId)) : null;
      let msg;
      if (deal) msg = dealMessage(deal);
      else {
        const title = typeof body.title === 'string' ? body.title.trim().slice(0, 60) : '';
        const text = typeof body.body === 'string' ? body.body.trim().slice(0, 200) : '';
        if (!title || !text) throw httpError(400, 'Write a title and a message');
        const rooms = Array.isArray(body.rooms) ? ROOMS.filter((r) => body.rooms.includes(r)) : [];
        msg = { kind: 'news', title, body: text, link: '#deals', rooms };
      }
      return send(res, req, 200, await broadcast(msg));
    }
    const m = /^\/admin\/deals(?:\/([\w-]{1,40}))?$/.exec(path);
    if (m) {
      const body = req.method === 'DELETE' ? {} : await readJson(req);
      if (req.method === 'POST' && !m[1]) {
        const deal = cleanDeal(body.deal || {}, null);
        db.deals.deals.unshift(deal);
        saveDeals();
        await announceRuns();
        return send(res, req, 200, { deal, deals: db.deals.deals });
      }
      const existing = m[1] ? findDeal(m[1]) : null;
      if (!existing) throw httpError(404, 'No such deal');
      if (req.method === 'PUT') {
        const deal = cleanDeal({ ...existing, ...(body.deal || {}) }, existing);
        db.deals.deals = db.deals.deals.map((d) => (d.id === deal.id ? deal : d));
        saveDeals();
        await announceRuns();
        return send(res, req, 200, { deal, deals: db.deals.deals });
      }
      if (req.method === 'DELETE') {
        db.deals.deals = db.deals.deals.filter((d) => d.id !== existing.id);
        saveDeals();
        return send(res, req, 200, { ok: true, deals: db.deals.deals });
      }
    }
  }
  throw httpError(404, 'Not found');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    if (!res.headersSent) send(res, req, status, { error: status >= 500 ? 'Server error' : err.message });
  });
});

// Runs that started while the server was down are marked as announced, so a restart never re-sends old deals.
for (const deal of db.deals.deals) {
  const key = runKey(deal);
  if (key && !db.sent.runs[key]) db.sent.runs[key] = Date.now();
}
saveFile('sent.json', db.sent);
setInterval(() => { announceRuns().catch((err) => console.error('announce failed', err.message)); }, 30000).unref();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`colizeum-api ${VERSION} listening on 127.0.0.1:${PORT} · ${db.subs.subs.length} phones · ${db.deals.deals.length} deals`);
});
