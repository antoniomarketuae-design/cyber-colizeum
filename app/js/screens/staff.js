// Staff mode (#staff): how full the club is, the deals (on/off, edit, send now), booking requests to confirm,
// every PC (set free / playing / out of order) and demo controls. DEMO: it works on this phone only; later it
// becomes the club's private dashboard on the server, so a deal made there reaches every player's phone.
import { esc, icons, openSheet, closeSheet, patch } from '../ui.js';
import { on, clearAll } from '../store.js';
import { ROOMS, roomById, TOTAL_PCS } from '../data/club.js';
import { getLive, stats, setPc, getLevel, setLevel, resetLive } from '../data/live.js';
import { listBookings, updateBooking } from '../data/bookings.js';
import { listDeals, getDeal, dealState, setDealOn, offerShort, whenText, roomsText } from '../data/deals.js';
import { deliver } from '../data/inbox.js';
import { sendDealNow } from '../engine.js';
import { hm, dayLabel } from '../time.js';
import { tileHTML } from './live.js';

export const STAFF_PIN = '0000'; // demo only: the real staff login lives on the server
const UNLOCK_KEY = 'colizeum.staff';
export const staffUnlocked = () => { try { return sessionStorage.getItem(UNLOCK_KEY) === '1'; } catch { return false; } };
export const unlockStaff = () => { try { sessionStorage.setItem(UNLOCK_KEY, '1'); } catch {} };

const LEVELS = [
  { value: null, label: 'Time of day' },
  { value: 0.15, label: 'Quiet' },
  { value: 0.5, label: 'Half' },
  { value: 0.92, label: 'Packed' },
];

let offs = [];

function dealStatus(deal, state, now) {
  if (!deal.on) return ['Off', 'is-off'];
  if (state.running) return [`Running · until ${hm(state.end)}`, 'is-ok'];
  if (state.reason === 'busy') return [`Waiting: ${state.pct}% busy, starts under ${deal.when.below}%`, 'is-wait'];
  if (state.reason === 'over') return ['Ended', 'is-off'];
  if (state.next) return [`Next: ${dayLabel(state.next, now)} ${hm(state.next)}`, 'is-wait'];
  return ['Waiting', 'is-wait'];
}

function bookingLine(b, now) {
  return `${dayLabel(b.start, now)} · ${hm(b.start)}–${hm(b.end)} · ${roomById(b.room)?.name ?? ''} · PC ${b.pcs.join(', ')}`;
}

export default {
  id: 'staff',
  label: 'Staff',
  tab: 'me',
  hideTabbar: true,
  render(el, ctx) {
    if (!staffUnlocked()) { ctx.navigate('#me'); return; }
    el.innerHTML = `
      <div class="st">
        <header class="screen-header">
          <button type="button" class="icon-btn" data-act="back" aria-label="Back">${icons.back}</button>
          <h1 class="screen-title">Staff mode</h1>
          <span class="chip">Demo</span>
        </header>
        <p class="lead">What the club's team will use. In this demo it only changes this phone.</p>
        <h2 class="section-title">Right now</h2>
        <section class="card st-now" data-part="now"></section>
        <div class="section-head">
          <h2 class="section-title">Deals</h2>
          <a class="btn btn-small" href="#deal/new">${icons.plus}<span>New deal</span></a>
        </div>
        <div data-part="deals"></div>
        <h2 class="section-title">Booking requests</h2>
        <div data-part="bookings"></div>
        <h2 class="section-title">PCs · tap to change</h2>
        <div data-part="pcs"></div>
        <h2 class="section-title">Demo controls</h2>
        <section class="card" data-part="demo"></section>
      </div>`;
    const root = el.firstElementChild;
    const part = (name) => root.querySelector(`[data-part="${name}"]`);

    const paint = () => {
      const now = Date.now();
      const live = getLive(now);
      const st = stats(live);
      const bookings = listBookings().filter((b) => b.kind === 'booking');
      const pending = bookings.filter((b) => b.status === 'pending' && b.end > now).sort((a, b) => a.start - b.start);
      const confirmed = bookings.filter((b) => b.status === 'confirmed' && b.end > now).sort((a, b) => a.start - b.start);
      const level = getLevel();

      patch(part('now'), `
        <p class="st-big"><b>${st.taken}</b> of ${TOTAL_PCS} PCs taken · ${Math.round((100 * st.taken) / TOTAL_PCS)}%</p>
        ${ROOMS.map((r) => {
          const x = st.rooms[r.id];
          return `<div class="st-bar"><span class="st-bar-name">${esc(r.name)}</span>
            <span class="st-bar-track"><span style="width:${x.busyPct}%"></span></span>
            <span class="st-bar-num">${x.busyPct}%</span></div>`;
        }).join('')}`);

      const deals = listDeals();
      patch(part('deals'), deals.length ? deals.map((deal) => {
        const [label, cls] = dealStatus(deal, dealState(deal, now, st), now);
        return `
          <article class="card st-deal${deal.on ? '' : ' is-dim'}">
            <div class="st-deal-top">
              <span class="dl-badge is-small">${esc(offerShort(deal))}</span>
              <b class="st-deal-title">${esc(deal.title)}</b>
              <input type="checkbox" class="switch" data-act="toggle" data-id="${esc(deal.id)}" aria-label="Deal on"${deal.on ? ' checked' : ''}>
            </div>
            <p class="muted st-deal-when">${esc(whenText(deal))} · ${esc(roomsText(deal.rooms))}</p>
            <p><span class="pill ${cls}">${esc(label)}</span></p>
            <div class="st-deal-actions">
              <a class="btn btn-ghost btn-small" href="#deal/${esc(deal.id)}">${icons.edit}<span>Edit</span></a>
              <button type="button" class="btn btn-ghost btn-small" data-act="send" data-id="${esc(deal.id)}">${icons.send}<span>Send now</span></button>
            </div>
          </article>`;
      }).join('') : '<p class="muted st-empty">No deals yet. Make one with “New deal”.</p>');

      patch(part('bookings'), `
        ${pending.length ? pending.map((b) => `
          <article class="card st-booking">
            <b>${esc(b.name)} · ${b.pcs.length} player${b.pcs.length === 1 ? '' : 's'}</b>
            <span class="muted">${esc(bookingLine(b, now))}</span>
            <a class="st-tel" href="tel:${esc(b.phone.replace(/[^d+]/g, ''))}">${icons.phone}${esc(b.phone)}</a>
            <div class="st-deal-actions">
              <button type="button" class="btn btn-small" data-act="confirm" data-id="${esc(b.id)}">${icons.check}<span>Confirm</span></button>
              <button type="button" class="btn btn-ghost btn-small" data-act="decline" data-id="${esc(b.id)}">${icons.close}<span>Decline</span></button>
            </div>
          </article>`).join('') : '<p class="muted st-empty">No requests waiting.</p>'}
        ${confirmed.length ? `<div class="card list">${confirmed.map((b) => `
          <div class="list-row"><span class="list-text"><b>${esc(b.name)}</b><span>${esc(bookingLine(b, now))}</span></span><span class="pill is-ok">Confirmed</span></div>`).join('')}</div>` : ''}`);

      patch(part('pcs'), ROOMS.map((r) => `
        <section class="lv-room st-room">
          <header class="lv-room-head"><h2>${esc(r.name)}</h2><span class="lv-room-free${st.rooms[r.id].free ? ' has-free' : ''}">${st.rooms[r.id].free} free</span></header>
          <div class="lv-grid">${live.filter((p) => p.room === r.id).map((pc) => tileHTML(pc)).join('')}</div>
        </section>`).join(''));

      patch(part('demo'), `
        <p class="fld-label">How full is the club?</p>
        <div class="seg">${LEVELS.map((l) => `<button type="button" data-act="level" data-value="${l.value ?? ''}" aria-pressed="${level === l.value}">${l.label}</button>`).join('')}</div>
        <p class="fine">Pick “Quiet” to watch the “Quiet hall bonus” start by itself (between its hours).</p>
        <button type="button" class="btn btn-ghost" data-act="reset">${icons.refresh}<span>Reset the demo</span></button>`);
    };

    function pcSheet(n) {
      const pc = getLive().find((p) => p.n === n);
      const room = roomById(pc.room);
      openSheet(`
        <h2 class="sheet-title">PC ${n} · ${esc(room.name)}</h2>
        <p class="muted">Now: ${pc.status === 'busy' ? `playing until ${hm(pc.until)}` : esc(pc.status)}</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-ghost" data-act="set" data-s="free">Free</button>
          <div class="seg">${[1, 2, 3, 5].map((h) => `<button type="button" data-act="set" data-s="busy" data-h="${h}">Playing ${h} h</button>`).join('')}</div>
          <button type="button" class="btn btn-ghost" data-act="set" data-s="off">Out of order</button>
        </div>`, {
        label: `PC ${n}`,
        onAct(act, t) {
          if (act !== 'set') return;
          setPc(n, t.dataset.s, Number(t.dataset.h || 1) * 60);
          closeSheet();
          ctx.toast(`PC ${n} updated`);
        },
      });
    }

    function confirmReset() {
      openSheet(`
        <h2 class="sheet-title">Reset the demo?</h2>
        <p class="muted">Deletes the deals, bookings, codes and messages on this phone and starts fresh with the example deals.</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" data-act="yes">Reset</button>
          <button type="button" class="btn btn-ghost" data-act="close">Keep everything</button>
        </div>`, {
        label: 'Reset demo',
        onAct(act) {
          if (act !== 'yes') return;
          clearAll();
          resetLive();
          location.reload();
        },
      });
    }

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      const id = t.dataset.id;
      if (act === 'back') ctx.back('#me');
      else if (act === 'toggle') { setDealOn(id, t.checked); ctx.toast(t.checked ? 'Deal on' : 'Deal off'); }
      else if (act === 'send') {
        const deal = getDeal(id);
        if (!deal) return;
        sendDealNow(deal);
      } else if (act === 'confirm' || act === 'decline') {
        const b = updateBooking(id, { status: act === 'confirm' ? 'confirmed' : 'declined' });
        if (!b) return;
        deliver({
          kind: 'booking',
          title: act === 'confirm' ? 'Your booking is confirmed' : 'Your booking was declined',
          body: act === 'confirm' ? `${bookingLine(b, Date.now())}. See you there!` : `${bookingLine(b, Date.now())}. Call the club to find another time.`,
          link: '#book',
        });
      } else if (act === 'pc') pcSheet(Number(t.dataset.pc));
      else if (act === 'level') {
        setLevel(t.dataset.value === '' ? null : Number(t.dataset.value));
        ctx.toast('Demo club updated');
      } else if (act === 'reset') confirmReset();
    });

    paint();
    offs = ['tick', 'live', 'deals', 'bookings'].map((topic) => on(topic, () => paint()));
  },
  destroy() {
    for (const off of offs) off();
    offs = [];
  },
};
