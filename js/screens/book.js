// Book tab: pick a room, a day and time, how long, how many players and the seats (side by side for a group);
// the request waits for the club to confirm it. Below: your bookings, with cancel.
import { esc, icons, openSheet, closeSheet, chipsHTML } from '../ui.js';
import { on, getSetting, setSetting } from '../store.js';
import { ROOMS, roomById, roomOfPc, pcsOf } from '../data/club.js';
import { getLive } from '../data/live.js';
import { addBooking, listBookings, updateBooking, bookingsOn, isLive } from '../data/bookings.js';
import { hm, dayLabel, atMinutes, fromMin, euro, MIN } from '../time.js';

const HOURS = [1, 2, 3, 5, 8];
const DAYS_AHEAD = 7;
const STATUS = {
  pending: ['Waiting for the club', 'is-wait'],
  confirmed: ['Confirmed', 'is-ok'],
  declined: ['Declined', 'is-no'],
  cancelled: ['Cancelled', 'is-off'],
  done: ['Done', 'is-off'],
  expired: ['Not confirmed in time', 'is-off'],
};

let offs = [];

/** Start times (minutes after midnight) for day offset `day`; today's begin at least 10 minutes from now. */
function slotsFor(day, now) {
  const out = [];
  for (let m = 0; m < 24 * 60; m += 30) if (atMinutes(now, day * 24 * 60 + m) > now + 10 * MIN) out.push(m);
  return out;
}

/** '' when PC n is free for [start, end), else why not ("busy till 15:40", "booked", "out of order"). */
function whyNot(pc, start, end) {
  if (pc.status === 'off') return 'out of order';
  if (bookingsOn(pc.n, start, end).some((b) => b.kind === 'booking')) return 'booked';
  if (pc.status === 'busy' && !pc.mine && pc.until > start) return `busy till ${hm(pc.until)}`;
  return '';
}

/** `people` free PCs side by side if possible, starting from `prefer` when it is free. */
function autoPick(room, avail, people, prefer) {
  const runs = [];
  let cur = [];
  for (const n of pcsOf(room)) {
    if (!avail[n]) cur.push(n);
    else { if (cur.length) runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  const withPrefer = prefer ? runs.find((r) => r.includes(prefer)) : null;
  if (withPrefer && withPrefer.length >= people) {
    const from = Math.min(withPrefer.indexOf(prefer), withPrefer.length - people);
    return withPrefer.slice(from, from + people);
  }
  const fit = runs.find((r) => r.length >= people);
  if (fit) return fit.slice(0, people);
  return runs.flat().slice(0, people);
}

const packageFor = (room, hours) => room.packages.find((p) => p.label.startsWith(`${hours} hours`)) ?? null;

export default {
  id: 'book',
  label: 'Book',
  icon: icons.calendarPlus,
  render(el, ctx, param) {
    const now = Date.now();
    const live = getLive(now);
    const pcParam = /^pc-(\d+)$/.exec(param ?? '');
    const prefer = pcParam ? Number(pcParam[1]) : null;
    const startRoom = (prefer && roomOfPc(prefer)) || roomById(param) || roomById(getSetting('book.room', 'hall')) || ROOMS[0];

    // Start time: the next half hour, or when the chosen PC frees up.
    let after = now;
    const preferPc = prefer ? live.find((p) => p.n === prefer) : null;
    if (preferPc?.status === 'busy' && !preferPc.mine) after = preferPc.until;
    let day = 0;
    let time = null;
    for (; day < DAYS_AHEAD && time == null; day += 1) {
      time = slotsFor(day, now).find((m) => atMinutes(now, day * 24 * 60 + m) >= after) ?? null;
    }
    day -= 1;

    const form = {
      room: startRoom.id, day, time: time ?? 18 * 60, hours: 2, people: 1, prefer,
      pcs: [], name: getSetting('me.name', ''), phone: getSetting('me.phone', ''),
    };

    el.innerHTML = `
      <div class="bk">
        <header>
          <h1 class="screen-title">Book</h1>
          <p class="lead">Pick a room, a time and your seats. The club confirms your booking.</p>
        </header>
        <section class="card bk-form">
          <h2 class="card-title">Room</h2>
          <div class="chips" data-part="room"></div>
          <h2 class="card-title">Day</h2>
          <div class="chips chips-scroll" data-part="day"></div>
          <div class="bk-when">
            <label class="fld"><span>Start</span><span data-part="time"></span></label>
            <div class="fld"><span>Players</span><div class="stepper" data-part="people"></div></div>
          </div>
          <h2 class="card-title">How long</h2>
          <div class="chips" data-part="hours"></div>
          <h2 class="card-title">Seats <span class="faint" data-part="seat-hint"></span></h2>
          <div data-part="seats"></div>
          <p class="err" data-err="pcs" hidden></p>
          <label class="fld"><span>Your name</span>
            <input class="field" data-input="name" autocomplete="name" placeholder="Alex" value="${esc(form.name)}"></label>
          <p class="err" data-err="name" hidden></p>
          <label class="fld"><span>Phone, so the club can reach you</span>
            <input class="field" data-input="phone" type="tel" autocomplete="tel" placeholder="+359 88 123 4567" value="${esc(form.phone)}"></label>
          <p class="err" data-err="phone" hidden></p>
          <div data-part="summary"></div>
          <button type="button" class="btn" data-act="submit">${icons.send}<span>Send booking request</span></button>
        </section>
        <h2 class="section-title" data-list-title>Your bookings</h2>
        <div data-part="list"></div>
        <p class="fine">Demo: you can confirm requests yourself in Me → Staff mode.</p>
      </div>`;
    const root = el.firstElementChild;
    const part = (name) => root.querySelector(`[data-part="${name}"]`);
    const showErr = (key, text) => {
      const p = root.querySelector(`[data-err="${key}"]`);
      p.textContent = text || '';
      p.hidden = !text;
    };

    const slot = () => {
      const start = atMinutes(Date.now(), form.day * 24 * 60 + form.time);
      return { start, end: start + form.hours * 60 * MIN };
    };
    const availability = () => {
      const { start, end } = slot();
      const room = roomById(form.room);
      const liveNow = getLive();
      const avail = {};
      for (const n of pcsOf(room)) avail[n] = whyNot(liveNow.find((p) => p.n === n), start, end);
      return avail;
    };
    const repick = () => {
      const room = roomById(form.room);
      form.people = Math.min(form.people, room.count);
      form.pcs = autoPick(room, availability(), form.people, form.prefer);
    };

    let seatSig = '';
    const paintForm = () => {
      const room = roomById(form.room);
      const now2 = Date.now();
      part('room').innerHTML = chipsHTML(ROOMS.map((r) => ({ value: r.id, label: r.name })), form.room, 'room');
      const days = Array.from({ length: DAYS_AHEAD }, (_, i) => i).filter((i) => slotsFor(i, now2).length);
      part('day').innerHTML = chipsHTML(days.map((i) => ({ value: String(i), label: dayLabel(atMinutes(now2, i * 24 * 60 + 12 * 60), now2) })), String(form.day), 'day');
      const slots = slotsFor(form.day, now2);
      if (!slots.includes(form.time)) form.time = slots[0];
      part('time').innerHTML = `<select class="field" data-input="time" aria-label="Start time">${slots.map((m) => `<option value="${m}"${m === form.time ? ' selected' : ''}>${fromMin(m)}</option>`).join('')}</select>`;
      part('people').innerHTML = `
        <button type="button" class="icon-btn" data-act="minus" aria-label="One player less"${form.people <= 1 ? ' disabled' : ''}>${icons.minus}</button>
        <b>${form.people}</b>
        <button type="button" class="icon-btn" data-act="plus" aria-label="One player more"${form.people >= room.count ? ' disabled' : ''}>${icons.plus}</button>`;
      part('hours').innerHTML = chipsHTML(HOURS.map((h) => ({ value: String(h), label: `${h} h` })), String(form.hours), 'hours');
      paintSeats(true);
    };

    const paintSeats = (force = false) => {
      const room = roomById(form.room);
      const avail = availability();
      const sig = JSON.stringify([form, avail]);
      if (!force && sig === seatSig) return;
      seatSig = sig;
      const chosen = new Set(form.pcs);
      part('seat-hint').textContent = room.count > 1 ? '· tap to change' : '';
      part('seats').innerHTML = `
        <div class="bk-seats${room.count === 1 ? ' is-one' : ''}">${pcsOf(room).map((n) => {
          const why = avail[n];
          const cls = chosen.has(n) ? 'is-chosen' : why ? 'is-taken' : 'is-free';
          return `<button type="button" class="bk-seat ${cls}" data-act="seat" data-pc="${n}" aria-pressed="${chosen.has(n)}"
            aria-label="PC ${n}${why ? `, ${esc(why)}` : ''}"${why && !chosen.has(n) ? ' disabled' : ''}><b>${n}</b><span>${chosen.has(n) ? 'yours' : why ? esc(why.split(' ')[0]) : 'free'}</span></button>`;
        }).join('')}</div>`;
      const { start, end } = slot();
      const pkg = packageFor(room, form.hours);
      const each = pkg ? pkg.price : form.hours * room.perHour;
      part('summary').innerHTML = form.pcs.length ? `
        <div class="bk-summary">
          <div><b>${esc(dayLabel(start))} · ${hm(start)}–${hm(end)}</b><span>${esc(room.name)} · PC ${form.pcs.join(', ')}</span></div>
          <div class="bk-total"><b>about ${euro(each * form.pcs.length)}</b><span>${pkg ? esc(pkg.label) : `${euro(room.perHour)}/h`} × ${form.pcs.length}</span></div>
        </div>
        <p class="fine">You pay at the club. Deals and packages are applied at the desk.</p>`
        : '<p class="fine">No free seats in this room at that time. Try another time or room.</p>';
    };

    const paintList = () => {
      const now2 = Date.now();
      const mine = listBookings().filter((b) => b.kind === 'booking');
      const upcoming = mine.filter((b) => isLive(b)).sort((a, b) => a.start - b.start);
      const past = mine.filter((b) => !isLive(b)).slice(0, 6);
      const items = [...upcoming, ...past];
      root.querySelector('[data-list-title]').hidden = !items.length;
      part('list').innerHTML = items.map((b) => {
        const [label, cls] = STATUS[b.status] ?? [b.status, 'is-off'];
        const room = roomById(b.room);
        return `
          <article class="card bk-item">
            <div class="bk-item-top"><span class="pill ${cls}">${esc(label)}</span><span class="faint">${esc(room?.name ?? '')}</span></div>
            <b>${esc(dayLabel(b.start, now2))} · ${hm(b.start)}–${hm(b.end)}</b>
            <span class="muted">PC ${b.pcs.join(', ')} · ${b.pcs.length} player${b.pcs.length === 1 ? '' : 's'} · ${esc(b.name)}</span>
            ${isLive(b) && b.start > now2 ? `<button type="button" class="btn btn-ghost btn-small" data-act="cancel" data-id="${esc(b.id)}">Cancel booking</button>` : ''}
          </article>`;
      }).join('');
    };

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t || t.disabled) return;
      const act = t.dataset.act;
      const room = roomById(form.room);
      if (act === 'room') {
        form.room = t.dataset.value;
        form.prefer = null;
        setSetting('book.room', form.room);
        repick(); paintForm();
      } else if (act === 'day') {
        form.day = Number(t.dataset.value);
        repick(); paintForm();
      } else if (act === 'hours') {
        form.hours = Number(t.dataset.value);
        repick(); paintForm();
      } else if (act === 'minus' || act === 'plus') {
        form.people = Math.max(1, Math.min(room.count, form.people + (act === 'plus' ? 1 : -1)));
        form.prefer = form.pcs[0] ?? form.prefer;
        repick(); paintForm();
      } else if (act === 'seat') {
        const n = Number(t.dataset.pc);
        if (form.pcs.includes(n)) { if (form.pcs.length > 1) form.pcs = form.pcs.filter((x) => x !== n); }
        else form.pcs = [...form.pcs, n].sort((a, b) => a - b);
        form.people = form.pcs.length;
        showErr('pcs', '');
        paintForm();
      } else if (act === 'submit') {
        submit();
      } else if (act === 'cancel') {
        confirmCancel(t.dataset.id);
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.dataset.input !== 'time') return;
      form.time = Number(e.target.value);
      repick(); paintForm();
    });

    root.addEventListener('input', (e) => {
      const key = e.target.dataset.input;
      if (key === 'name' || key === 'phone') { form[key] = e.target.value; showErr(key, ''); }
    });

    function submit() {
      let ok = true;
      const name = form.name.trim();
      const digits = form.phone.replace(/\D/g, '');
      if (!name) { showErr('name', 'Enter your name'); ok = false; }
      if (digits.length < 6) { showErr('phone', 'Enter a phone number the club can call'); ok = false; }
      const avail = availability();
      const taken = form.pcs.filter((n) => avail[n]);
      if (!form.pcs.length) { showErr('pcs', 'Pick at least one PC'); ok = false; }
      else if (taken.length) { showErr('pcs', `PC ${taken.join(', ')} was just taken. Pick another seat.`); ok = false; }
      if (!ok) { root.querySelector('.err:not([hidden])')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      const { start, end } = slot();
      addBooking({ room: form.room, pcs: form.pcs, start, end, people: form.pcs.length, name, phone: form.phone.trim() });
      setSetting('me.name', name);
      setSetting('me.phone', form.phone.trim());
      ctx.toast('Request sent. The club will confirm it.');
      repick(); paintForm();
      root.querySelector('[data-list-title]').scrollIntoView({ behavior: 'smooth' });
    }

    function confirmCancel(id) {
      openSheet(`
        <h2 class="sheet-title">Cancel this booking?</h2>
        <p class="muted">The seats go back to other players.</p>
        <div class="sheet-actions">
          <button type="button" class="btn btn-danger" data-act="yes">Cancel booking</button>
          <button type="button" class="btn btn-ghost" data-act="close">Keep it</button>
        </div>`, {
        label: 'Cancel booking',
        onAct(act) {
          if (act !== 'yes') return;
          updateBooking(id, { status: 'cancelled' });
          closeSheet();
          ctx.toast('Booking cancelled');
        },
      });
    }

    repick();
    paintForm();
    paintList();
    offs = [
      on('bookings', () => { paintList(); paintSeats(); }),
      on('tick', () => paintSeats()),
    ];
  },
  destroy() {
    for (const off of offs) off();
    offs = [];
  },
};
