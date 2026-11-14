// Me tab: your details, which deal messages you want (rooms, quiet hours, how many a day), phone notifications,
// the club's contacts, language, app version, and the door to staff mode.
import { esc, icons, chipsHTML, openSheet, closeSheet } from '../ui.js';
import { on, getSetting, setSetting } from '../store.js';
import { ROOMS, CLUB } from '../data/club.js';
import { unreadCount } from '../data/inbox.js';
import { notifySetting } from '../engine.js';
import { fromMin } from '../time.js';
import { openInbox } from './live.js';
import { staffUnlocked } from './staff.js';
import { api, setStaffKey, forgetStaffKey } from '../api.js';
import { pushState, enablePush, disablePush, syncPrefs } from '../push.js';

const MAX_OPTIONS = [1, 2, 3, 5];
let offs = [];

function timeOptions(selected) {
  return Array.from({ length: 24 }, (_, h) => fromMin(h * 60))
    .map((t) => `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`).join('');
}

/** Staff keys look like CC-XXXX-XXXX-XXXX: accept small letters, spaces and the iPhone's long dashes too. */
function cleanKey(typed) {
  const plain = typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^CC[A-Z0-9]{12}$/.test(plain) ? `CC-${plain.slice(2, 6)}-${plain.slice(6, 10)}-${plain.slice(10)}` : typed.trim();
}

const PUSH_TEXT = {
  'needs-install': '<p class="fine">On iPhone, notifications work in the app on your Home Screen: in Safari tap Share → Add to Home Screen, open the app from there, then turn them on here.</p>',
  unsupported: '<p class="fine">This browser can’t get notifications. Deals still appear behind the bell.</p>',
  denied: '<p class="fine">Notifications are blocked for this app. Turn them on in your phone’s Settings → Notifications → Colizeum.</p>',
  off: `<button type="button" class="btn" data-act="allow">${icons.bell}<span>Turn on notifications</span></button>
    <p class="fine">Get a message on your phone when the club has a deal, even when the app is closed.</p>`,
  on: `<p class="me-push-on">${icons.check}<span>Notifications are on. Deals reach this phone even when the app is closed.</span></p>
    <button type="button" class="btn btn-ghost btn-small" data-act="push-off">Turn off</button>`,
};

export default {
  id: 'me',
  label: 'Me',
  icon: icons.user,
  render(el, ctx) {
    el.innerHTML = '<div class="me"></div>';
    const root = el.firstElementChild;

    const paint = () => {
      const v = ctx.version;
      const rooms = notifySetting('rooms') ?? ROOMS.map((r) => r.id);
      const unread = unreadCount();
      root.innerHTML = `
        <header><h1 class="screen-title">Me</h1></header>

        <section class="card">
          <h2 class="card-title">Your details</h2>
          <label class="fld"><span>Name</span>
            <input class="field" data-key="me.name" autocomplete="name" placeholder="Alex" value="${esc(getSetting('me.name', ''))}"></label>
          <label class="fld"><span>Phone</span>
            <input class="field" data-key="me.phone" type="tel" autocomplete="tel" placeholder="+359 88 123 4567" value="${esc(getSetting('me.phone', ''))}"></label>
          <p class="fine">Used when you book, so the club can reach you. Kept on this phone.</p>
        </section>

        <section class="card">
          <h2 class="card-title">Deal messages</h2>
          <label class="toggle-row"><span><b>Tell me about deals</b><span>When the club is quiet, deals pop up.</span></span>
            <input type="checkbox" class="switch" data-notify="deals"${notifySetting('deals') ? ' checked' : ''}></label>
          <div class="me-sub${notifySetting('deals') ? '' : ' is-dim'}">
            <p class="fld-label">Rooms I play in</p>
            <div class="chips">${chipsHTML(ROOMS.map((r) => ({ value: r.id, label: r.name })), rooms, 'room')}</div>
            <p class="fld-label">At most, per day</p>
            <div class="seg">${MAX_OPTIONS.map((n) => `<button type="button" data-act="max" data-value="${n}" aria-pressed="${notifySetting('max') === n}">${n}</button>`).join('')}</div>
            <p class="fld-label">Quiet hours (no messages)</p>
            <div class="me-quiet">
              <select class="field" data-notify="quietFrom" aria-label="Quiet from">${timeOptions(notifySetting('quietFrom'))}</select>
              <span>to</span>
              <select class="field" data-notify="quietTo" aria-label="Quiet until">${timeOptions(notifySetting('quietTo'))}</select>
            </div>
          </div>
          <label class="toggle-row"><span><b>Tell me when a PC I wait for is free</b><span>Tap a busy PC on Live → “Tell me”.</span></span>
            <input type="checkbox" class="switch" data-notify="free"${notifySetting('free') ? ' checked' : ''}></label>
          <div class="me-phone" data-push></div>
        </section>

        <section class="card list">
          <button type="button" class="list-row" data-act="inbox">${icons.bell}<span class="list-text"><b>Messages</b><span>${unread ? `${unread} new` : 'Deals and alerts you received'}</span></span>${icons.chevronRight}</button>
        </section>

        <h2 class="section-title">The club</h2>
        <img class="me-logo" src="img/logo.png" alt="Cyber Colizeum logo" width="850" height="823">
        <section class="card list">
          <a class="list-row" href="${CLUB.mapsUrl}" target="_blank" rel="noopener">${icons.pin}<span class="list-text"><b>${esc(CLUB.address)}</b><span>Open in Maps</span></span>${icons.chevronRight}</a>
          <a class="list-row" href="tel:${CLUB.tel}">${icons.phone}<span class="list-text"><b>${esc(CLUB.phone)}</b><span>Call the club</span></span>${icons.chevronRight}</a>
          <a class="list-row" href="${CLUB.instagram}" target="_blank" rel="noopener">${icons.instagram}<span class="list-text"><b>Instagram</b><span>@cybercolizeum</span></span>${icons.chevronRight}</a>
          <a class="list-row" href="${CLUB.facebook}" target="_blank" rel="noopener">${icons.facebook}<span class="list-text"><b>Facebook</b></span>${icons.chevronRight}</a>
          <a class="list-row" href="${CLUB.tiktok}" target="_blank" rel="noopener">${icons.tiktok}<span class="list-text"><b>TikTok</b></span>${icons.chevronRight}</a>
          <a class="list-row" href="${CLUB.website}" target="_blank" rel="noopener">${icons.globe}<span class="list-text"><b>cybercolizeum.bg</b></span>${icons.chevronRight}</a>
        </section>

        <h2 class="section-title">Language</h2>
        <section class="card list">
          <div class="list-row"><span class="list-text"><b>English</b></span>${icons.check}</div>
          <div class="list-row is-dim"><span class="list-text"><b>Български</b><span>Coming soon</span></span></div>
        </section>

        <h2 class="section-title">App</h2>
        <section class="card">
          <p class="me-version">Version ${esc(v ? v.version : '…')}${v?.updated ? ` · ${esc(v.updated)}` : ''}</p>
          <button type="button" class="btn btn-ghost" data-act="update">${icons.refresh}<span>Check for updates</span></button>
        </section>

        <section class="card list">
          <button type="button" class="list-row" data-act="staff">${icons.key}<span class="list-text"><b>Staff mode</b><span>For the club's team: deals, bookings, PCs</span></span>${icons.chevronRight}</button>
        </section>`;
    };

    const paintPush = async () => {
      const box = root.querySelector('[data-push]');
      if (box) box.innerHTML = PUSH_TEXT[await pushState()];
    };

    root.addEventListener('input', (e) => {
      const key = e.target.dataset.key;
      if (key) setSetting(key, e.target.value.trim());
    });

    root.addEventListener('change', (e) => {
      const key = e.target.dataset.notify;
      if (!key) return;
      setSetting(`notify.${key}`, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
      if (key === 'deals') root.querySelector('.me-sub')?.classList.toggle('is-dim', !e.target.checked);
      syncPrefs();
    });

    root.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'room') {
        const current = new Set(notifySetting('rooms') ?? ROOMS.map((r) => r.id));
        if (current.has(t.dataset.value)) { if (current.size > 1) current.delete(t.dataset.value); }
        else current.add(t.dataset.value);
        setSetting('notify.rooms', current.size === ROOMS.length ? null : [...current]);
        syncPrefs();
        paint();
        paintPush();
      } else if (act === 'max') {
        setSetting('notify.max', Number(t.dataset.value));
        syncPrefs();
        paint();
        paintPush();
      } else if (act === 'allow') {
        // Straight from the tap: iPhone only asks for permission in answer to one.
        try {
          const state = await enablePush();
          ctx.toast(state === 'on' ? 'Notifications are on' : 'Notifications stay off');
        } catch (err) {
          ctx.toast(err.status === 0 ? err.message : `Couldn’t reach the club’s server (${err.message}). Try again.`);
        }
        paintPush();
      } else if (act === 'push-off') {
        await disablePush();
        ctx.toast('Notifications are off');
        paintPush();
      } else if (act === 'inbox') {
        openInbox(ctx);
      } else if (act === 'update') {
        ctx.checkForUpdate('manual');
      } else if (act === 'staff') {
        if (staffUnlocked()) ctx.navigate('#staff');
        else askKey();
      }
    });

    function askKey() {
      const sheet = openSheet(`
        <h2 class="sheet-title">Staff mode</h2>
        <p class="muted">Enter your staff key. This phone remembers it until you log out.</p>
        <input class="field key-input" data-key-input type="password" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false" maxlength="40" aria-label="Staff key">
        <p class="err" data-key-err hidden></p>
        <div class="sheet-actions">
          <button type="button" class="btn" data-act="go">Open staff mode</button>
          <button type="button" class="btn btn-ghost" data-act="close">Cancel</button>
        </div>`, {
        label: 'Staff key',
        async onAct(act, t) {
          if (act !== 'go' || t.disabled) return;
          const input = sheet.el.querySelector('[data-key-input]');
          const err = sheet.el.querySelector('[data-key-err]');
          const key = cleanKey(input.value);
          if (!key) { err.textContent = 'Enter the staff key'; err.hidden = false; return; }
          t.disabled = true;
          setStaffKey(key);
          try {
            await api('/admin/check', { method: 'POST', staff: true });
            closeSheet();
            ctx.navigate('#staff');
          } catch (e) {
            forgetStaffKey();
            err.textContent = e.status === 401 ? 'That key is not right.' : e.message;
            err.hidden = false;
            input.select();
          } finally {
            t.disabled = false;
          }
        },
      });
      const input = sheet.el.querySelector('[data-key-input]');
      input.addEventListener('input', () => { sheet.el.querySelector('[data-key-err]').hidden = true; });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sheet.el.querySelector('[data-act="go"]').click(); });
      setTimeout(() => input.focus(), 250);
    }

    paint();
    paintPush();
    offs = [on('push', paintPush), on('inbox', () => {
      const row = root.querySelector('[data-act="inbox"] .list-text span');
      const unread = unreadCount();
      if (row) row.textContent = unread ? `${unread} new` : 'Deals and alerts you received';
    })];
  },
  destroy() {
    for (const off of offs) off();
    offs = [];
  },
};
