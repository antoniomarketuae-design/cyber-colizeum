// Deal editor (#deal/new, #deal/<id>), staff only: name, message, rooms, offer, when it runs, whether players get a
// notification, how long the code works, and a preview of the message. Saved on the club's server for every phone.
import { esc, icons, chipsHTML, openSheet, closeSheet } from '../ui.js';
import { ROOMS, roomById } from '../data/club.js';
import { getDeal, saveDeal, deleteDeal, WEEK, DAY_SHORT, offerShort, roomsBusyPct } from '../data/deals.js';
import { getLive, stats } from '../data/live.js';
import { staffUnlocked } from './staff.js';
import { fromMin, euro } from '../time.js';

const NOW_HOURS = [1, 2, 3, 4, 6];
const CODE_HOURS = [1, 2, 3, 5];
const OFFERS = [
  { value: 'percent', label: '% off', unit: '% off' },
  { value: 'price', label: 'Price per hour', unit: '€ per hour' },
  { value: 'bonus', label: 'Bonus time', unit: '% extra time' },
];
const MODES = [
  { value: 'now', label: 'Right now' },
  { value: 'weekly', label: 'Set times' },
  { value: 'quiet', label: 'When quiet' },
];
const LIMITS = { percent: [1, 90], price: [0.5, 50], bonus: [5, 300] };

function blank() {
  return {
    title: '', message: '', rooms: ['hall'], on: true, notify: true, codeMinutes: 120,
    offer: { type: 'percent', value: 20 },
    when: { mode: 'now', hours: 2, days: [1, 2, 3, 4, 5], from: '10:00', to: '16:00', below: 35 },
  };
}

const timeOptions = (selected) => Array.from({ length: 48 }, (_, i) => fromMin(i * 30))
  .map((t) => `<option value="${t}"${t === selected ? ' selected' : ''}>${t}</option>`).join('');

const segHTML = (items, selected, act) => items.map((it) => `<button type="button" data-act="${act}" data-value="${it.value}" aria-pressed="${it.value === selected}">${esc(it.label)}</button>`).join('');

export default {
  id: 'deal',
  label: 'Deal',
  tab: 'me',
  hideTabbar: true,
  render(el, ctx, param) {
    if (!staffUnlocked()) { ctx.navigate('#me'); return; }
    const existing = param && param !== 'new' ? getDeal(param) : null;
    const base = blank();
    const d = existing
      ? { ...base, ...existing, offer: { ...existing.offer }, when: { ...base.when, ...existing.when }, rooms: [...existing.rooms] }
      : base;
    if (d.when.mode === 'now' && !d.when.hours) d.when.hours = 2;

    el.innerHTML = `
      <div class="de">
        <header class="screen-header">
          <button type="button" class="icon-btn" data-act="back" aria-label="Back">${icons.back}</button>
          <h1 class="screen-title">${existing ? 'Edit deal' : 'New deal'}</h1>
        </header>
        <section class="card">
          <label class="fld"><span>Name of the deal</span>
            <input class="field" data-f="title" maxlength="40" placeholder="Happy hour" value="${esc(d.title)}"></label>
          <p class="err" data-err="title" hidden></p>
          <label class="fld"><span>Message players see</span>
            <textarea class="field" data-f="message" rows="3" maxlength="160" placeholder="Main hall 30% off until 16:00. Show your code at the desk.">${esc(d.message)}</textarea></label>
          <p class="err" data-err="message" hidden></p>
        </section>
        <section class="card">
          <h2 class="card-title">Rooms</h2>
          <div class="chips" data-part="rooms"></div>
          <p class="err" data-err="rooms" hidden></p>
        </section>
        <section class="card">
          <h2 class="card-title">Offer</h2>
          <div class="seg" data-part="offerType"></div>
          <div class="de-value">
            <input class="field" data-f="value" type="number" inputmode="decimal" step="any" min="0" value="${esc(d.offer.value)}" aria-label="Amount">
            <span data-part="unit"></span>
          </div>
          <p class="fine" data-part="offerHelp"></p>
          <p class="err" data-err="value" hidden></p>
        </section>
        <section class="card">
          <h2 class="card-title">When</h2>
          <div class="seg" data-part="mode"></div>
          <div data-part="whenBody"></div>
          <p class="err" data-err="when" hidden></p>
        </section>
        <section class="card">
          <label class="toggle-row"><span><b>Notify players</b><span data-part="notify-help"></span></span>
            <input type="checkbox" class="switch" data-f="notify"${d.notify !== false ? ' checked' : ''}></label>
        </section>
        <section class="card">
          <h2 class="card-title">The code works for</h2>
          <div class="chips" data-part="code"></div>
        </section>
        <h2 class="section-title">What players get</h2>
        <div data-part="preview"></div>
        <div class="de-actions">
          <button type="button" class="btn" data-act="save">${icons.check}<span>Save deal</span></button>
          ${existing ? `<button type="button" class="btn btn-danger" data-act="delete">${icons.trash}<span>Delete deal</span></button>` : ''}
        </div>
      </div>`;
    const root = el.firstElementChild;
    const part = (name) => root.querySelector(`[data-part="${name}"]`);
    const showErr = (key, text) => {
      const p = root.querySelector(`[data-err="${key}"]`);
      p.textContent = text || '';
      p.hidden = !text;
    };

    const paintRooms = () => { part('rooms').innerHTML = chipsHTML(ROOMS.map((r) => ({ value: r.id, label: r.name })), d.rooms, 'room'); };

    const paintOffer = () => {
      part('offerType').innerHTML = segHTML(OFFERS, d.offer.type, 'offer');
      part('unit').textContent = OFFERS.find((o) => o.value === d.offer.type).unit;
      const v = Number(d.offer.value) || 0;
      const rooms = d.rooms.map(roomById).filter(Boolean);
      let help = '';
      if (d.offer.type === 'percent') help = rooms.map((r) => `${r.name}: ${euro(r.perHour)} → ${euro(r.perHour * (1 - v / 100))}/h`).join(' · ');
      else if (d.offer.type === 'price') help = rooms.map((r) => `${r.name} is usually ${euro(r.perHour)}/h`).join(' · ');
      else help = `Example: pay for 2 hours, play ${Math.round(2 * (1 + v / 100) * 10) / 10} hours.`;
      part('offerHelp').textContent = help;
    };

    const NOTIFY_HELP = {
      now: 'Their phones get a notification as soon as you save.',
      weekly: 'Their phones get a notification each time the deal starts.',
      quiet: 'Shows inside the app when it starts. Phone notifications for quiet-time deals come once the app knows the club’s real PCs; until then use “Send now”.',
    };

    const paintWhen = () => {
      const w = d.when;
      part('notify-help').textContent = NOTIFY_HELP[w.mode];
      part('mode').innerHTML = segHTML(MODES, w.mode, 'mode');
      if (w.mode === 'now') {
        part('whenBody').innerHTML = `
          <p class="fld-label">Starts as soon as you save. For how long?</p>
          <div class="chips">${chipsHTML(NOW_HOURS.map((h) => ({ value: String(h), label: `${h} h` })), String(w.hours), 'nowHours')}</div>`;
        return;
      }
      const pct = roomsBusyPct(d.rooms, stats(getLive()));
      part('whenBody').innerHTML = `
        <p class="fld-label">Days</p>
        <div class="chips">${chipsHTML(WEEK.map((day) => ({ value: String(day), label: DAY_SHORT[day] })), w.days.map(String), 'day')}</div>
        <div class="de-times">
          <label class="fld"><span>From</span><select class="field" data-f="from">${timeOptions(w.from)}</select></label>
          <label class="fld"><span>To</span><select class="field" data-f="to">${timeOptions(w.to)}</select></label>
        </div>
        ${w.mode === 'quiet' ? `
          <label class="fld"><span>Start only while the rooms are under … % busy</span>
            <input class="field" data-f="below" type="number" inputmode="numeric" min="5" max="95" step="5" value="${esc(w.below)}"></label>
          <p class="fine">Right now these rooms are ${pct}% busy. The deal turns itself on when they get quieter than this, and players hear about it once.</p>`
        : '<p class="fine">Runs every chosen day between these times. A time past midnight (22:00 to 02:00) works too.</p>'}`;
    };

    const paintCode = () => {
      part('code').innerHTML = chipsHTML(CODE_HOURS.map((h) => ({ value: String(h * 60), label: `${h} h` })), String(d.codeMinutes), 'code');
    };

    const paintPreview = () => {
      const title = d.title.trim() || 'Your deal';
      part('preview').innerHTML = `
        <div class="notice-preview">
          <span class="notice-icon notice-deal">${icons.tag}</span>
          <span class="notice-text"><b>${esc(title)} · ${esc(offerShort(d))}</b><span>${esc(d.message.trim() || 'Your message')}</span></span>
        </div>
        <p class="fine">Each player gets it once per run, inside their own choices: their rooms, their quiet hours, their limit per day. “Send now” in staff mode skips those.</p>`;
    };

    const paintAll = () => { paintRooms(); paintOffer(); paintWhen(); paintCode(); paintPreview(); };

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      const v = t.dataset.value;
      if (act === 'back') { ctx.back('#staff'); return; }
      if (act === 'room') {
        d.rooms = d.rooms.includes(v) ? d.rooms.filter((x) => x !== v) : [...d.rooms, v];
        showErr('rooms', '');
        paintRooms(); paintOffer(); if (d.when.mode === 'quiet') paintWhen();
      } else if (act === 'offer') {
        d.offer.type = v;
        showErr('value', '');
        paintOffer(); paintPreview();
      } else if (act === 'mode') {
        d.when.mode = v;
        if (v === 'now' && !d.when.hours) d.when.hours = 2;
        showErr('when', '');
        paintWhen();
      } else if (act === 'nowHours') {
        d.when.hours = Number(v);
        paintWhen();
      } else if (act === 'day') {
        const day = Number(v);
        d.when.days = d.when.days.includes(day) ? d.when.days.filter((x) => x !== day) : [...d.when.days, day];
        showErr('when', '');
        paintWhen();
      } else if (act === 'code') {
        d.codeMinutes = Number(v);
        paintCode();
      } else if (act === 'save') { if (!t.disabled) save(t); }
      else if (act === 'delete') confirmDelete();
    });

    const onField = (e) => {
      const f = e.target.dataset.f;
      if (!f) return;
      if (f === 'title' || f === 'message') { d[f] = e.target.value; showErr(f, ''); paintPreview(); }
      else if (f === 'value') { d.offer.value = e.target.value; showErr('value', ''); paintOffer(); paintPreview(); }
      else if (f === 'from' || f === 'to') { d.when[f] = e.target.value; showErr('when', ''); }
      else if (f === 'below') { d.when.below = e.target.value; showErr('when', ''); }
      else if (f === 'notify') d.notify = e.target.checked;
    };
    root.addEventListener('input', onField);
    root.addEventListener('change', onField);

    async function save(button) {
      let ok = true;
      const title = d.title.trim();
      const message = d.message.trim();
      const value = Number(d.offer.value);
      const [lo, hi] = LIMITS[d.offer.type];
      const w = d.when;
      if (!title) { showErr('title', 'Give the deal a short name'); ok = false; }
      if (!message) { showErr('message', 'Write the message players will read'); ok = false; }
      if (!d.rooms.length) { showErr('rooms', 'Pick at least one room'); ok = false; }
      if (!(value >= lo && value <= hi)) { showErr('value', `Enter a number from ${lo} to ${hi}`); ok = false; }
      if (w.mode !== 'now') {
        const below = Number(w.below);
        if (!w.days.length) { showErr('when', 'Pick at least one day'); ok = false; }
        else if (w.from === w.to) { showErr('when', 'The start and end times are the same'); ok = false; }
        else if (w.mode === 'quiet' && !(below >= 5 && below <= 95)) { showErr('when', 'Enter a busy level from 5 to 95%'); ok = false; }
      }
      if (!ok) { root.querySelector('.err:not([hidden])')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }

      // A right-now deal starts when the server saves it, by the server's clock.
      const when = w.mode === 'now'
        ? { mode: 'now', hours: w.hours }
        : { mode: w.mode, days: [...w.days].sort(), from: w.from, to: w.to, ...(w.mode === 'quiet' ? { below: Number(w.below) } : {}) };
      button.disabled = true;
      try {
        await saveDeal({
          id: existing?.id, on: existing ? existing.on : true, notify: d.notify !== false,
          title, message, rooms: ROOMS.map((r) => r.id).filter((id) => d.rooms.includes(id)),
          offer: { type: d.offer.type, value }, when, codeMinutes: d.codeMinutes,
        });
      } catch (err) {
        button.disabled = false;
        ctx.toast(err.message);
        return;
      }
      ctx.toast(w.mode === 'now' ? (d.notify !== false ? 'Deal running, players notified' : 'Deal saved and running') : 'Deal saved');
      ctx.back('#staff');
    }

    function confirmDelete() {
      openSheet(`
        <h2 class="sheet-title">Delete “${esc(existing.title)}”?</h2>
        <p class="muted">Players stop seeing it. Codes already given keep working until they run out.</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" data-act="yes">Delete deal</button>
          <button type="button" class="btn btn-ghost" data-act="close">Keep it</button>
        </div>`, {
        label: 'Delete deal',
        async onAct(act, t) {
          if (act !== 'yes' || t.disabled) return;
          t.disabled = true;
          try {
            await deleteDeal(existing.id);
          } catch (err) {
            t.disabled = false;
            ctx.toast(err.message);
            return;
          }
          closeSheet();
          ctx.toast('Deal deleted');
          ctx.back('#staff');
        },
      });
    }

    paintAll();
  },
};
