// Staff mode (#staff), for the club's admin (needs the staff key, checked by the server):
// send a notification to the players' phones, the deals (on/off, edit, send now — kept on the server for every
// phone), how full the club is, booking requests, every PC, demo controls.
// Still demo (this phone only): the PCs, how full the club is, and bookings — until the club's software is linked.
import { esc, icons, openSheet, closeSheet, patch, chipsHTML } from '../ui.js';
import { on } from '../store.js';
import { ROOMS, roomById, TOTAL_PCS } from '../data/club.js';
import { getLive, stats, setPc, getLevel, setLevel } from '../data/live.js';
import { listBookings, updateBooking } from '../data/bookings.js';
import { listDeals, getDeal, dealState, setDealOn, syncDeals, offerShort, whenText, roomsText } from '../data/deals.js';
import { deliver } from '../data/inbox.js';
import { api, staffKey, forgetStaffKey } from '../api.js';
import { syncClub } from '../engine.js';
import { hm, dayLabel, ago } from '../time.js';
import { tileHTML } from './live.js';

export const staffUnlocked = () => Boolean(staffKey());

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

const sentText = (r) => (r.sent
  ? `Sent to ${r.sent} phone${r.sent === 1 ? '' : 's'}`
  : 'Sent. No phone has notifications on for it yet, so it waits in their inbox.');

export default {
  id: 'staff',
  label: 'Staff',
  tab: 'me',
  hideTabbar: true,
  render(el, ctx) {
    if (!staffUnlocked()) { ctx.navigate('#me'); return; }
    const news = { title: '', body: '', rooms: ROOMS.map((r) => r.id) };
    let phones = null; // from the server: { phones, wantDeals, byRoom, messages }

    el.innerHTML = `
      <div class="st">
        <header class="screen-header">
          <button type="button" class="icon-btn" data-act="back" aria-label="Back">${icons.back}</button>
          <h1 class="screen-title">Staff mode</h1>
        </header>

        <h2 class="section-title">Send a notification</h2>
        <section class="card st-news">
          <p class="st-reach" data-part="reach">Checking how many phones get notifications…</p>
          <label class="fld"><span>Title</span>
            <input class="field" data-news="title" maxlength="60" placeholder="Happy hour starts now"></label>
          <label class="fld"><span>Message</span>
            <textarea class="field" data-news="body" rows="3" maxlength="200" placeholder="Main hall 30% off until 16:00. Show your code at the desk."></textarea></label>
          <p class="fld-label">Who gets it (players choose their rooms in Me)</p>
          <div class="chips" data-part="news-rooms"></div>
          <p class="err" data-news-err hidden></p>
          <button type="button" class="btn btn-hot" data-act="news-send">${icons.send}<span>Send to players</span></button>
          <p class="fine">For a deal, it's easier to make it below and tap “Send now”: players then also see it in Deals and can get a code.</p>
        </section>

        <div class="section-head">
          <h2 class="section-title">Deals</h2>
          <a class="btn btn-small" href="#deal/new">${icons.plus}<span>New deal</span></a>
        </div>
        <div data-part="deals"></div>
        <div data-part="sent"></div>

        <h2 class="section-title">Right now <span class="faint">· demo</span></h2>
        <section class="card st-now" data-part="now"></section>
        <h2 class="section-title">Booking requests <span class="faint">· on this phone for now</span></h2>
        <div data-part="bookings"></div>
        <h2 class="section-title">PCs · tap to change <span class="faint">· demo</span></h2>
        <div data-part="pcs"></div>
        <h2 class="section-title">Demo controls</h2>
        <section class="card" data-part="demo"></section>
        <button type="button" class="btn btn-ghost" data-act="logout">${icons.key}<span>Log out of staff mode</span></button>
      </div>`;
    const root = el.firstElementChild;
    const part = (name) => root.querySelector(`[data-part="${name}"]`);
    const newsErr = (text) => {
      const p = root.querySelector('[data-news-err]');
      p.textContent = text || '';
      p.hidden = !text;
    };

    const paintNewsRooms = () => {
      part('news-rooms').innerHTML = chipsHTML(ROOMS.map((r) => ({ value: r.id, label: r.name })), news.rooms, 'news-room');
    };

    const paintServer = () => {
      patch(part('reach'), phones
        ? `${icons.bell}<span><b>${phones.wantDeals}</b> phone${phones.wantDeals === 1 ? '' : 's'} get${phones.wantDeals === 1 ? 's' : ''} deal notifications.</span>`
        : `${icons.bell}<span>Can't reach the club's server right now.</span>`);
      patch(part('sent'), phones?.messages?.length ? `
        <h2 class="section-title">Last sent</h2>
        <div class="card list">${phones.messages.slice(0, 5).map((m) => `
          <div class="list-row"><span class="list-text"><b>${esc(m.title)}</b><span>${esc(ago(m.at))} · ${esc(m.body)}</span></span></div>`).join('')}</div>` : '');
    };

    const refreshServer = async () => {
      try {
        phones = await api('/admin/stats', { staff: true });
      } catch (err) {
        if (err.status === 401) { forgetStaffKey(); ctx.toast('Your staff key no longer works. Enter it again.'); ctx.navigate('#me'); return; }
        phones = null;
      }
      paintServer();
    };

    const paint = () => {
      const now = Date.now();
      const live = getLive(now);
      const st = stats(live);
      const bookings = listBookings().filter((b) => b.kind === 'booking');
      const pending = bookings.filter((b) => b.status === 'pending' && b.end > now).sort((a, b) => a.start - b.start);
      const confirmed = bookings.filter((b) => b.status === 'confirmed' && b.end > now).sort((a, b) => a.start - b.start);
      const level = getLevel();

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
            <p><span class="pill ${cls}">${esc(label)}</span>${deal.notify === false ? ' <span class="pill is-off">No notification</span>' : ''}</p>
            <div class="st-deal-actions">
              <a class="btn btn-ghost btn-small" href="#deal/${esc(deal.id)}">${icons.edit}<span>Edit</span></a>
              <button type="button" class="btn btn-ghost btn-small" data-act="send" data-id="${esc(deal.id)}">${icons.send}<span>Send now</span></button>
            </div>
          </article>`;
      }).join('') : '<p class="muted st-empty">No deals yet. Make one with “New deal”.</p>');

      patch(part('now'), `
        <p class="st-big"><b>${st.taken}</b> of ${TOTAL_PCS} PCs taken · ${Math.round((100 * st.taken) / TOTAL_PCS)}%</p>
        ${ROOMS.map((r) => {
          const x = st.rooms[r.id];
          return `<div class="st-bar"><span class="st-bar-name">${esc(r.name)}</span>
            <span class="st-bar-track"><span style="width:${x.busyPct}%"></span></span>
            <span class="st-bar-num">${x.busyPct}%</span></div>`;
        }).join('')}`);

      patch(part('bookings'), `
        ${pending.length ? pending.map((b) => `
          <article class="card st-booking">
            <b>${esc(b.name)} · ${b.pcs.length} player${b.pcs.length === 1 ? '' : 's'}</b>
            <span class="muted">${esc(bookingLine(b, now))}</span>
            <a class="st-tel" href="tel:${esc(b.phone.replace(/[^\d+]/g, ''))}">${icons.phone}${esc(b.phone)}</a>
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
        <p class="fine">Pick “Quiet” to watch the “Quiet hall bonus” start by itself (between its hours). Quiet-time deals
          show inside the app for now; they become notifications once the app knows the club's real PCs.</p>
        <button type="button" class="btn btn-ghost" data-act="reset">${icons.refresh}<span>Start the demo over</span></button>`);
    };

    /** Asks before a notification goes out to everyone, then sends it through the server. */
    function confirmSend({ title, body, rooms, dealId }) {
      const reach = phones ? (rooms?.length && rooms.length < ROOMS.length
        ? Math.max(0, ...rooms.map((r) => phones.byRoom[r] ?? 0))
        : phones.wantDeals) : null;
      openSheet(`
        <h2 class="sheet-title">Send this to players?</h2>
        <div class="notice-preview">
          <span class="notice-icon notice-deal">${icons.tag}</span>
          <span class="notice-text"><b>${esc(title)}</b><span>${esc(body)}</span></span>
        </div>
        <p class="muted">${reach == null ? 'It goes to every phone that allows deal notifications' : `About ${reach} phone${reach === 1 ? '' : 's'} will get it`}${rooms?.length && rooms.length < ROOMS.length ? ` for ${esc(rooms.map((r) => roomById(r).name).join(', '))}` : ''}, except phones in their quiet hours. It also goes into everyone's inbox.</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-hot" data-act="yes">${icons.send}<span>Send now</span></button>
          <button type="button" class="btn btn-ghost" data-act="close">Cancel</button>
        </div>`, {
        label: 'Send notification',
        async onAct(act, t) {
          if (act !== 'yes' || t.disabled) return;
          t.disabled = true;
          try {
            const r = await api('/admin/push', { method: 'POST', staff: true, body: dealId ? { dealId } : { title, body, rooms } });
            closeSheet();
            ctx.toast(sentText(r));
            if (!dealId) {
              news.title = '';
              news.body = '';
              root.querySelector('[data-news="title"]').value = '';
              root.querySelector('[data-news="body"]').value = '';
            }
            syncClub();
            refreshServer();
          } catch (err) {
            t.disabled = false;
            ctx.toast(err.message);
          }
        },
      });
    }

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
        <h2 class="sheet-title">Start the demo over?</h2>
        <p class="muted">Every phone clears its demo: PCs back to normal, and bookings, holds, codes and messages gone.
          Phones that are closed do it the next time they open. Deals, players' details and notification choices stay.</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" data-act="yes">${icons.refresh}<span>Start over</span></button>
          <button type="button" class="btn btn-ghost" data-act="close">Keep everything</button>
        </div>`, {
        label: 'Start the demo over',
        async onAct(act, t) {
          if (act !== 'yes' || t.disabled) return;
          t.disabled = true;
          try {
            await api('/admin/reset-demo', { method: 'POST', staff: true });
          } catch (err) {
            t.disabled = false;
            ctx.toast(err.message);
            return;
          }
          closeSheet();
          await syncClub();
          ctx.toast('Demo started over');
        },
      });
    }

    root.addEventListener('input', (e) => {
      const key = e.target.dataset.news;
      if (!key) return;
      news[key] = e.target.value;
      newsErr('');
    });

    root.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act;
      const id = t.dataset.id;
      if (act === 'back') ctx.back('#me');
      else if (act === 'news-room') {
        const v = t.dataset.value;
        news.rooms = news.rooms.includes(v) ? news.rooms.filter((x) => x !== v) : [...news.rooms, v];
        newsErr('');
        paintNewsRooms();
      } else if (act === 'news-send') {
        const title = news.title.trim();
        const body = news.body.trim();
        if (!title || !body) { newsErr('Write a title and a message'); return; }
        if (!news.rooms.length) { newsErr('Pick at least one room'); return; }
        confirmSend({ title, body, rooms: news.rooms });
      } else if (act === 'toggle') {
        const want = t.checked;
        try {
          await setDealOn(id, want);
          ctx.toast(want ? 'Deal on' : 'Deal off');
        } catch (err) {
          t.checked = !want;
          ctx.toast(err.message);
        }
      } else if (act === 'send') {
        const deal = getDeal(id);
        if (deal) confirmSend({ title: `${deal.title} · ${offerShort(deal)}`, body: deal.message, rooms: deal.rooms, dealId: deal.id });
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
      else if (act === 'logout') {
        forgetStaffKey();
        ctx.toast('Logged out of staff mode');
        ctx.navigate('#me');
      }
    });

    paintNewsRooms();
    paint();
    paintServer();
    refreshServer();
    syncDeals();
    offs = ['tick', 'live', 'deals', 'bookings'].map((topic) => on(topic, () => paint()));
  },
  destroy() {
    for (const off of offs) off();
    offs = [];
  },
};
