// Live tab (home): which PCs are free right now, room by room, with the deals running now.
// Tap a PC → its sheet: hold it for 15 min, "tell me when it's free", or book it for later.
import { esc, icons, openSheet, closeSheet, chipsHTML, brandHTML, countdownHTML, patch } from '../ui.js';
import { on, getSetting, setSetting } from '../store.js';
import { ROOMS, roomById, TOTAL_PCS } from '../data/club.js';
import { getLive, stats, watches, isWatched, toggleWatch } from '../data/live.js';
import { activeHold, holdPc, updateBooking, HOLD_MINUTES } from '../data/bookings.js';
import { runningDeals, roomPrice, offerShort, claimFor, roomsText } from '../data/deals.js';
import { messages, unreadCount, markAllRead } from '../data/inbox.js';
import { hm, duration, euro, ago } from '../time.js';
import { openDealSheet } from './deals.js';

let offs = [];

function tileLabel(pc) {
  if (pc.status === 'free') return 'free';
  if (pc.status === 'held' || pc.mine) return 'you';
  if (pc.status === 'busy') return hm(pc.until);
  if (pc.status === 'reserved') return 'booked';
  return 'off';
}

function tileAria(pc) {
  if (pc.status === 'free') return `PC ${pc.n}, free`;
  if (pc.status === 'held') return `PC ${pc.n}, held for you`;
  if (pc.status === 'busy') return pc.mine ? `PC ${pc.n}, your booking` : `PC ${pc.n}, playing, free from ${hm(pc.until)}`;
  if (pc.status === 'reserved') return `PC ${pc.n}, booked from ${hm(pc.at)}`;
  return `PC ${pc.n}, out of order`;
}

function wideText(pc) {
  if (pc.status === 'free') return 'Free now';
  if (pc.status === 'held') return 'Held for you';
  if (pc.status === 'busy') return pc.mine ? 'Your booking' : `Free from ${hm(pc.until)}`;
  if (pc.status === 'reserved') return `Booked from ${hm(pc.at)}`;
  return 'Out of order';
}

export function tileHTML(pc, { wide = false, watched = false } = {}) {
  const cls = `lv-pc is-${pc.status}${pc.mine ? ' is-mine' : ''}${watched ? ' is-watched' : ''}${wide ? ' lv-pc-wide' : ''}`;
  const sub = wide ? wideText(pc) : tileLabel(pc);
  return `<button type="button" class="${cls}" data-act="pc" data-pc="${pc.n}" aria-label="${esc(tileAria(pc))}">
    <span class="lv-pc-n">${pc.n}</span><span class="lv-pc-t">${esc(sub)}</span></button>`;
}

function priceHTML(price) {
  const parts = [];
  if (price.deal) parts.push(`<s>${euro(price.base)}</s> <b class="hot">${euro(price.now)}/h</b>`);
  else parts.push(`${euro(price.base)}/h`);
  if (price.bonus) parts.push(`<b class="hot">${esc(offerShort(price.bonus))}</b>`);
  return parts.join(' · ');
}

// ---- PC sheet ----

function pcSheetHTML(n) {
  const now = Date.now();
  const live = getLive(now);
  const pc = live.find((p) => p.n === n);
  if (!pc) return '<p class="muted">This PC is not on the map.</p>';
  const room = roomById(pc.room);
  const price = roomPrice(room, runningDeals(now, stats(live)));
  const watched = isWatched(n);

  let status;
  if (pc.status === 'free') status = 'Free now';
  else if (pc.status === 'held') status = `Held for you · ${countdownHTML(pc.until)} left`;
  else if (pc.status === 'busy') status = pc.mine ? `Your booking · until ${hm(pc.until)}` : `Playing · free from ${hm(pc.until)} <span class="faint">(in ${duration(pc.until - now)})</span>`;
  else if (pc.status === 'reserved') status = `Booked for you from ${hm(pc.at)}`;
  else status = 'Out of order right now';

  let actions = '';
  if (pc.status === 'free') {
    actions = `
      <button type="button" class="btn" data-act="hold">${icons.clock}<span>Hold it for ${HOLD_MINUTES} min</span></button>
      <button type="button" class="btn btn-ghost" data-act="book">${icons.calendarPlus}<span>Book for later</span></button>
      <p class="pcs-fine">A hold keeps this PC for you while you get here. Say “PC ${n}” at the desk.</p>`;
  } else if (pc.status === 'held') {
    actions = `
      <p class="pcs-fine">Go to the desk and say “PC ${n}”. If you don't come in time, it frees itself.</p>
      <button type="button" class="btn btn-ghost" data-act="unhold">${icons.close}<span>Cancel the hold</span></button>`;
  } else if (pc.status === 'busy' && !pc.mine) {
    actions = watched
      ? `<button type="button" class="btn btn-ghost is-on" data-act="watch">${icons.check}<span>We'll tell you when it's free</span></button>
         <p class="pcs-fine">Tap again to stop.</p>`
      : `<button type="button" class="btn" data-act="watch">${icons.bell}<span>Tell me when it's free</span></button>`;
    actions += `<button type="button" class="btn btn-ghost" data-act="book">${icons.calendarPlus}<span>Book for later</span></button>`;
  } else if (pc.mine) {
    actions = `<button type="button" class="btn btn-ghost" data-act="bookings">${icons.calendar}<span>See your bookings</span></button>`;
  } else {
    actions = `<button type="button" class="btn btn-ghost" data-act="close">Pick another PC</button>`;
  }

  return `
    <div class="pcs-head">
      <span class="pcs-num is-${pc.status}${pc.mine ? ' is-mine' : ''}">${n}</span>
      <div><h2 class="pcs-title">PC ${n}</h2><p class="pcs-room">${esc(room.name)}</p></div>
    </div>
    <p class="pcs-status is-${pc.status}${pc.mine ? ' is-mine' : ''}"><span class="dot"></span><span>${status}</span></p>
    <ul class="facts">
      <li>${icons.tag}<span>${priceHTML(price)}${price.deal ? ` <span class="faint">with ${esc(price.deal.title)}</span>` : ''}</span></li>
      <li>${icons.monitor}<span>${esc(room.about)}</span></li>
    </ul>
    <div class="sheet-actions">${actions}</div>`;
}

export function openPcSheet(n, ctx) {
  let off = null;
  const sheet = openSheet(pcSheetHTML(n), {
    label: `PC ${n}`,
    onClose: () => off?.(),
    onAct(act) {
      const pc = getLive().find((p) => p.n === n);
      if (act === 'hold') {
        if (pc?.status !== 'free') { ctx.toast(`Someone just sat down at PC ${n}`); sheet.set(pcSheetHTML(n)); return; }
        const { replaced } = holdPc(n, pc.room);
        ctx.toast(replaced ? `PC ${n} held instead of PC ${replaced.pcs[0]}` : `PC ${n} is yours for ${HOLD_MINUTES} minutes`);
      } else if (act === 'unhold') {
        const hold = activeHold();
        if (hold) updateBooking(hold.id, { status: 'cancelled' });
        ctx.toast('Hold cancelled');
      } else if (act === 'watch') {
        ctx.toast(toggleWatch(n) ? `We'll tell you when PC ${n} is free` : `Stopped watching PC ${n}`);
      } else if (act === 'book') {
        closeSheet();
        ctx.navigate(`#book/pc-${n}`);
        return;
      } else if (act === 'bookings') {
        closeSheet();
        ctx.navigate('#book');
        return;
      }
      sheet.set(pcSheetHTML(n));
    },
  });
  off = on('tick', () => sheet.set(pcSheetHTML(n)));
}

// ---- Messages sheet (the bell) ----

const KIND_ICON = { deal: icons.tag, free: icons.monitor, booking: icons.calendar };

export function openInbox(ctx) {
  const list = messages();
  const body = list.length
    ? `<ul class="ib-list">${list.map((m) => `
        <li><button type="button" class="ib-item${m.read ? '' : ' is-new'}" data-act="open" data-link="${esc(m.link || '')}">
          <span class="ib-icon ib-${esc(m.kind)}">${KIND_ICON[m.kind] ?? icons.bell}</span>
          <span class="ib-text"><b>${esc(m.title)}</b><span>${esc(m.body)}</span><small>${esc(ago(m.at))}</small></span>
        </button></li>`).join('')}</ul>`
    : '<p class="muted ib-empty">No messages yet. When a deal starts, or a PC you\'re waiting for is free, it shows up here.</p>';
  openSheet(`<h2 class="sheet-title">Messages</h2>${body}`, {
    label: 'Messages',
    onAct(act, t) {
      if (act !== 'open') return;
      closeSheet();
      if (t.dataset.link) ctx.navigate(t.dataset.link);
    },
  });
  markAllRead();
}

// ---- The screen ----

export default {
  id: 'live',
  label: 'Live',
  icon: icons.live,
  render(el, ctx, param) {
    el.innerHTML = `
      <div class="lv">
        <header class="lv-top">
          ${brandHTML()}
          <button type="button" class="icon-btn lv-bell" data-act="inbox" aria-label="Messages">${icons.bell}<span class="lv-bell-dot" data-bell hidden></span></button>
        </header>
        <div data-hero></div>
        <div data-hold></div>
        <div data-deals></div>
        <nav class="lv-filters" aria-label="Rooms" data-filters></nav>
        <div data-rooms></div>
        <div class="lv-legend" aria-hidden="true">
          <span><i class="lg is-free"></i>Free</span>
          <span><i class="lg is-busy"></i>Playing · free from</span>
          <span><i class="lg is-reserved"></i>Booked</span>
          <span><i class="lg is-mine"></i>Yours</span>
        </div>
        <p class="lv-demo">Demo: the PCs are simulated until the app is connected to the club's system.</p>
      </div>`;
    const root = el.firstElementChild;
    const part = (name) => root.querySelector(`[data-${name}]`);

    const paint = () => {
      const now = Date.now();
      const live = getLive(now);
      const st = stats(live);
      const running = runningDeals(now, st);
      const hold = activeHold(now);
      const filter = getSetting('live.filter', 'all');
      const watched = new Set(watches());
      const unread = unreadCount();

      part('bell').hidden = unread === 0;

      patch(part('hero'), `
        <section class="lv-hero">
          <p class="lv-count"><b>${st.free}</b><span>of ${TOTAL_PCS} PCs free right now</span></p>
          <p class="lv-sub"><span class="lv-pulse" aria-hidden="true"></span>Live · ${hm(now)}</p>
        </section>`);

      patch(part('hold'), hold ? `
        <button type="button" class="lv-hold" data-act="pc" data-pc="${hold.pcs[0]}">
          <span class="lv-hold-n">${hold.pcs[0]}</span>
          <span class="lv-hold-text"><b>PC ${hold.pcs[0]} is held for you</b><span>${countdownHTML(hold.end)} left · say “PC ${hold.pcs[0]}” at the desk</span></span>
          ${icons.chevronRight}
        </button>` : '');

      patch(part('deals'), running.map(({ deal, state }) => {
        const claim = claimFor(deal.id, now);
        return `
          <button type="button" class="lv-deal" data-act="deal" data-id="${esc(deal.id)}">
            <span class="lv-deal-badge">${esc(offerShort(deal))}</span>
            <span class="lv-deal-text"><b>${esc(deal.title)}</b><span>${esc(roomsText(deal.rooms))} · until ${hm(state.end)}</span></span>
            <span class="lv-deal-cta">${claim ? esc(claim.code) : 'Get it'}</span>
          </button>`;
      }).join(''));

      patch(part('filters'), chipsHTML(
        [{ value: 'all', label: 'All rooms' }, ...ROOMS.map((r) => ({ value: r.id, label: `${r.short} · ${st.rooms[r.id].free}` }))],
        filter, 'filter'));

      // One box per room shown, each repainted on its own.
      const shown = ROOMS.filter((r) => filter === 'all' || r.id === filter);
      const roomsEl = part('rooms');
      if (roomsEl.dataset.shown !== filter) {
        roomsEl.dataset.shown = filter;
        roomsEl.innerHTML = shown.map((r) => `<section class="lv-room" data-room="${r.id}"></section>`).join('');
      }
      for (const room of shown) {
        const pcs = live.filter((p) => p.room === room.id);
        const free = st.rooms[room.id].free;
        const wide = room.count === 1;
        patch(roomsEl.querySelector(`[data-room="${room.id}"]`), `
          <header class="lv-room-head">
            <h2>${esc(room.name)}</h2>
            <span class="lv-room-free${free ? ' has-free' : ''}">${free ? `${free} of ${room.count} free` : 'Full'}</span>
          </header>
          <p class="lv-room-meta">${priceHTML(roomPrice(room, running))}</p>
          <div class="lv-grid${wide ? ' is-wide' : ''}">${pcs.map((pc) => tileHTML(pc, { wide, watched: watched.has(pc.n) })).join('')}</div>`);
      }
    };

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'pc') openPcSheet(Number(t.dataset.pc), ctx);
      else if (act === 'deal') openDealSheet(t.dataset.id, ctx);
      else if (act === 'inbox') openInbox(ctx);
      else if (act === 'filter') { setSetting('live.filter', t.dataset.value); paint(); }
    });

    paint();
    offs = ['tick', 'live', 'bookings', 'deals', 'inbox'].map((topic) => on(topic, () => paint()));

    const m = /^pc-(\d+)$/.exec(param ?? '');
    if (m) openPcSheet(Number(m[1]), ctx);
  },
  destroy() {
    for (const off of offs) off();
    offs = [];
  },
};
