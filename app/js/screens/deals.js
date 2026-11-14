// Deals tab: deals running now (get a code to show at the desk), your codes, what's coming up, and the prices.
import { esc, icons, openSheet, patch } from '../ui.js';
import { on } from '../store.js';
import { ROOMS } from '../data/club.js';
import { getLive, stats } from '../data/live.js';
import {
  listDeals, getDeal, dealState, runningDeals, roomPrice, offerShort, offerLong, whenText, roomsText,
  claimFor, claimDeal, activeClaims,
} from '../data/deals.js';
import { hm, dayLabel, duration, euro, MIN } from '../time.js';

let offs = [];

function codeHTML(claim) {
  return `
    <div class="code">
      <span class="code-label">Your code</span>
      <b class="code-value">${esc(claim.code)}</b>
      <span class="code-fine">Show it at the desk · valid until ${hm(claim.expiresAt)} (${duration(claim.expiresAt - Date.now())} left)</span>
    </div>`;
}

function waitingText(deal, state) {
  if (state.reason === 'busy') return `Starts when ${roomsText(deal.rooms)} drops under ${deal.when.below}% busy (now ${state.pct}%)`;
  if (state.next) return `Next: ${dayLabel(state.next)} at ${hm(state.next)}`;
  return whenText(deal);
}

function dealSheetHTML(id) {
  const deal = getDeal(id);
  if (!deal) return '<p class="muted">This deal has ended.</p><div class="sheet-actions"><button type="button" class="btn btn-ghost" data-act="close">Close</button></div>';
  const now = Date.now();
  const state = dealState(deal, now, stats(getLive(now)));
  const claim = claimFor(deal.id, now);
  let action;
  if (claim) action = codeHTML(claim);
  else if (state.running) {
    action = `
      <button type="button" class="btn btn-hot" data-act="claim">${icons.ticket}<span>Get the deal</span></button>
      <p class="pcs-fine">You get a code that works for ${duration((deal.codeMinutes || 120) * MIN)}. Show it at the desk.</p>`;
  } else action = `<p class="pcs-fine">Not running right now. ${esc(waitingText(deal, state))}.</p>`;
  return `
    <span class="dl-badge is-big">${esc(offerShort(deal))}</span>
    <h2 class="sheet-title">${esc(deal.title)}</h2>
    <p class="dl-msg">${esc(deal.message)}</p>
    <ul class="facts">
      <li>${icons.monitor}<span>${esc(roomsText(deal.rooms))}</span></li>
      <li>${icons.tag}<span>${esc(offerLong(deal))}</span></li>
      <li>${icons.clock}<span>${state.running ? `Running now · until ${hm(state.end)}` : esc(whenText(deal))}</span></li>
    </ul>
    <div class="sheet-actions">${action}</div>`;
}

export function openDealSheet(id, ctx) {
  let off = null;
  const sheet = openSheet(dealSheetHTML(id), {
    label: 'Deal',
    onClose: () => off?.(),
    onAct(act) {
      if (act !== 'claim') return;
      const deal = getDeal(id);
      const now = Date.now();
      if (!deal || !dealState(deal, now, stats(getLive(now))).running) { ctx.toast('This deal just ended'); sheet.set(dealSheetHTML(id)); return; }
      claimDeal(deal, now);
      ctx.toast('Code ready. Show it at the desk.');
      sheet.set(dealSheetHTML(id));
    },
  });
  off = on('tick', () => sheet.set(dealSheetHTML(id)));
}

export default {
  id: 'deals',
  label: 'Deals',
  icon: icons.tag,
  render(el, ctx) {
    el.innerHTML = '<div class="dl"></div>';
    const root = el.firstElementChild;
    const paint = () => {
      const now = Date.now();
      const st = stats(getLive(now));
      const running = runningDeals(now, st);
      const runningIds = new Set(running.map((r) => r.deal.id));
      const waiting = listDeals().filter((d) => d.on && !runningIds.has(d.id)).map((deal) => ({ deal, state: dealState(deal, now, st) }))
        .filter((x) => x.state.reason !== 'over');
      const claims = activeClaims(now);

      const runningHTML = running.length ? running.map(({ deal, state }) => {
        const claim = claimFor(deal.id, now);
        return `
          <article class="dl-card is-hot">
            <div class="dl-card-top"><span class="dl-badge">${esc(offerShort(deal))}</span><span class="dl-ends">${icons.clock}until ${hm(state.end)}</span></div>
            <h3 class="dl-title">${esc(deal.title)}</h3>
            <p class="dl-msg">${esc(deal.message)}</p>
            <p class="dl-rooms">${esc(roomsText(deal.rooms))}</p>
            ${claim ? codeHTML(claim) : `<button type="button" class="btn btn-hot" data-act="claim" data-id="${esc(deal.id)}">${icons.ticket}<span>Get the deal</span></button>`}
          </article>`;
      }).join('') : `
        <article class="dl-card dl-empty">
          <h3 class="dl-title">No deals running right now</h3>
          <p class="dl-msg">When the club is quiet, deals pop up here. Turn on deal messages in Me and we'll tell you the moment one starts.</p>
        </article>`;

      const otherCodes = claims.filter((c) => !runningIds.has(c.dealId));

      patch(root, `
        <header><h1 class="screen-title">Deals</h1></header>
        <h2 class="section-title">Running now</h2>
        ${runningHTML}
        ${otherCodes.length ? `<h2 class="section-title">Your codes</h2>${otherCodes.map((c) => `
          <article class="dl-card"><h3 class="dl-title">${esc(c.title)}</h3><p class="dl-rooms">${esc(c.offer)} · ${esc(roomsText(c.rooms))}</p>${codeHTML(c)}</article>`).join('')}` : ''}
        ${waiting.length ? `<h2 class="section-title">Coming up</h2>
          <div class="list">${waiting.map(({ deal, state }) => `
            <button type="button" class="list-row" data-act="open" data-id="${esc(deal.id)}">
              <span class="dl-badge is-small">${esc(offerShort(deal))}</span>
              <span class="list-text"><b>${esc(deal.title)}</b><span>${esc(waitingText(deal, state))}</span></span>
              ${icons.chevronRight}
            </button>`).join('')}</div>` : ''}
        <h2 class="section-title">Prices</h2>
        ${ROOMS.map((room) => {
          const price = roomPrice(room, running);
          return `
            <article class="dl-price">
              <header><h3>${esc(room.name)}</h3><span>${price.deal ? `<s>${euro(price.base)}</s> <b class="hot">${euro(price.now)}</b>` : euro(price.base)} / hour</span></header>
              <ul>${room.packages.map((p) => `<li><span>${esc(p.label)}</span><b>${euro(p.price)}</b></li>`).join('')}</ul>
            </article>`;
        }).join('')}
        <p class="dl-note">Prices from cybercolizeum.bg. Packages and deals are applied at the desk.</p>`);
    };

    root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      if (t.dataset.act === 'open') { openDealSheet(t.dataset.id, ctx); return; }
      if (t.dataset.act === 'claim') {
        const deal = getDeal(t.dataset.id);
        if (!deal) return;
        claimDeal(deal);
        ctx.toast('Code ready. Show it at the desk.');
        paint();
      }
    });

    paint();
    offs = ['tick', 'deals'].map((topic) => on(topic, () => paint()));
  },
  destroy() {
    for (const off of offs) off();
    offs = [];
  },
};
