// Me tab: your details, which deal messages you want (rooms, quiet hours, how many a day), phone notifications,
// the club's contacts, language, app version, and the door to staff mode.
import { esc, icons, chipsHTML, openSheet, closeSheet } from '../ui.js';
import { on, getSetting, setSetting } from '../store.js';
import { ROOMS, CLUB } from '../data/club.js';
import { unreadCount } from '../data/inbox.js';
import { notifySetting } from '../engine.js';
import { fromMin } from '../time.js';
import { openInbox } from './live.js';
import { STAFF_PIN, unlockStaff, staffUnlocked } from './staff.js';

const MAX_OPTIONS = [1, 2, 3, 5];
let offs = [];

function timeOptions(selected) {
  return Array.from({ length: 24 }, (_, h) => fromMin(h * 60))
    .map((t) => `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`).join('');
}

function phoneNotifyHTML(ctx) {
  if (!('Notification' in window)) {
    return ctx.isIOS && !ctx.isStandalone()
      ? '<p class="fine">On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then turn notifications on here.</p>'
      : '<p class="fine">This browser can\'t show notifications. Messages still appear inside the app.</p>';
  }
  const p = Notification.permission;
  if (p === 'granted') return '<p class="fine ok">Phone notifications are on. Until the club\'s server is connected, they arrive while the app is open or just closed.</p>';
  if (p === 'denied') return '<p class="fine">Notifications are blocked. Turn them on in your phone\'s Settings → Notifications → Cyber Colizeum.</p>';
  return `<button type="button" class="btn btn-ghost" data-act="allow">${icons.bell}<span>Allow phone notifications</span></button>`;
}

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
          <div class="me-phone">${phoneNotifyHTML(ctx)}</div>
        </section>

        <section class="card list">
          <button type="button" class="list-row" data-act="inbox">${icons.bell}<span class="list-text"><b>Messages</b><span>${unread ? `${unread} new` : 'Deals and alerts you received'}</span></span>${icons.chevronRight}</button>
        </section>

        <h2 class="section-title">The club</h2>
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

    root.addEventListener('input', (e) => {
      const key = e.target.dataset.key;
      if (key) setSetting(key, e.target.value.trim());
    });

    root.addEventListener('change', (e) => {
      const key = e.target.dataset.notify;
      if (!key) return;
      setSetting(`notify.${key}`, e.target.type === 'checkbox' ? e.target.checked : e.target.value);
      if (key === 'deals') root.querySelector('.me-sub')?.classList.toggle('is-dim', !e.target.checked);
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
        paint();
      } else if (act === 'max') {
        setSetting('notify.max', Number(t.dataset.value));
        paint();
      } else if (act === 'allow') {
        try { await Notification.requestPermission(); } catch {}
        paint();
      } else if (act === 'inbox') {
        openInbox(ctx);
      } else if (act === 'update') {
        ctx.checkForUpdate('manual');
      } else if (act === 'staff') {
        if (staffUnlocked()) ctx.navigate('#staff');
        else askPin();
      }
    });

    function askPin() {
      const sheet = openSheet(`
        <h2 class="sheet-title">Staff mode</h2>
        <p class="muted">Enter the staff PIN.</p>
        <input class="field pin" data-pin type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="Staff PIN">
        <p class="err" data-pin-err hidden>That PIN is not right.</p>
        <div class="sheet-actions">
          <button type="button" class="btn" data-act="go">Open staff mode</button>
          <button type="button" class="btn btn-ghost" data-act="close">Cancel</button>
        </div>`, {
        label: 'Staff PIN',
        onAct(act) {
          if (act !== 'go') return;
          const input = sheet.el.querySelector('[data-pin]');
          if (input.value.trim() !== STAFF_PIN) {
            sheet.el.querySelector('[data-pin-err]').hidden = false;
            input.select();
            return;
          }
          unlockStaff();
          closeSheet();
          ctx.navigate('#staff');
        },
      });
      const input = sheet.el.querySelector('[data-pin]');
      input.addEventListener('input', () => { sheet.el.querySelector('[data-pin-err]').hidden = true; });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sheet.el.querySelector('[data-act="go"]').click(); });
      setTimeout(() => input.focus(), 250);
    }

    paint();
    offs = [on('inbox', () => {
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
