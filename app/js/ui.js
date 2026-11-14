// Small helpers, icons and the bottom sheet shared by every screen.
import { countdown } from './time.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const ic = (body, fill = 'none') => `<svg viewBox="0 0 24 24" fill="${fill}" stroke="${fill === 'none' ? 'currentColor' : 'none'}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  live: ic('<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>'),
  tag: ic('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.4"/>'),
  calendarPlus: ic('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>'),
  calendar: ic('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  users: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>'),
  bell: ic('<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  bellOff: ic('<path d="M6 16v-5a6 6 0 0 1 9.5-4.9M18 11v5l1.5 2H8"/><path d="M10 20a2 2 0 0 0 4 0M3 3l18 18"/>'),
  clock: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  monitor: ic('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  bolt: ic('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  check: ic('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  close: ic('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: ic('<path d="m15 5-7 7 7 7"/>'),
  chevronRight: ic('<path d="m9 5 7 7-7 7"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  minus: ic('<path d="M5 12h14"/>'),
  edit: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  trash: ic('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  send: ic('<path d="M21 3 10 14"/><path d="m21 3-7 18-4-7-7-4z"/>'),
  phone: ic('<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>'),
  pin: ic('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  mail: ic('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>'),
  globe: ic('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  instagram: ic('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.2 6.8h.01"/>'),
  facebook: ic('<path d="M14.5 21v-8h3l.5-3.5h-3.5V7.8c0-1 .3-1.8 1.8-1.8H18V3a24 24 0 0 0-2.7-.1C12.6 2.9 11 4.5 11 7.4v2.1H8V13h3v8"/>'),
  tiktok: ic('<path d="M14 3v12a4 4 0 1 1-4-4"/><path d="M14 3c.4 2.6 2.4 4.6 5 5"/>'),
  key: ic('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'),
  refresh: ic('<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>'),
  ticket: ic('<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5z"/><path d="M14 5v14" stroke-dasharray="2 2.5"/>'),
  compass: ic('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  share: ic('<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M7 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-1"/>'),
  addSquare: ic('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>'),
};

// ---- Bottom sheet: one at a time, closed by the scrim, Escape or any [data-act="close"] ----

let current = null;

export function closeSheet() {
  if (!current) return;
  const { el, onClose } = current;
  current = null;
  el.remove();
  document.body.classList.remove('sheet-open');
  onClose?.();
}

/**
 * Opens a sheet with `html`. Clicks on [data-act] call onAct(act, element, sheet).
 * Returns { el, close, set(html) }.
 */
export function openSheet(html, { onAct, onClose, label = 'Details' } = {}) {
  closeSheet();
  const el = document.createElement('div');
  el.className = 'sheet';
  el.innerHTML = `
    <div class="sheet-scrim" data-act="close"></div>
    <div class="sheet-card" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  const sheet = {
    el,
    close: closeSheet,
    set(next) { patch(el.querySelector('.sheet-body'), next); },
  };
  el.querySelector('.sheet-body').patchedHTML = stable(html);
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'close') { closeSheet(); return; }
    onAct?.(t.dataset.act, t, sheet);
  });
  document.body.append(el);
  document.body.classList.add('sheet-open');
  void el.offsetHeight; // lay it out closed first, so adding the class slides it up
  el.classList.add('is-open');
  current = { el, onClose };
  return sheet;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

// Countdown numbers tick by themselves, so they are left out when comparing old and new HTML.
const stable = (html) => html.replace(/(data-countdown="\d+">)[^<]*/g, '$1');

/**
 * Puts `html` into `el` only when it differs from what is there, so the screens can repaint every few seconds
 * without swallowing a tap that lands mid-repaint. Returns true when it changed.
 */
export function patch(el, html) {
  if (!el) return false;
  const key = stable(html);
  if (el.patchedHTML === key) return false;
  el.patchedHTML = key;
  el.innerHTML = html;
  return true;
}

/** A row of toggle chips: [{ value, label }], selected values get aria-pressed="true". */
export function chipsHTML(items, selected, act) {
  const sel = new Set([].concat(selected));
  return items.map((it) => `<button type="button" class="chip" data-act="${act}" data-value="${esc(it.value)}" aria-pressed="${sel.has(it.value)}">${esc(it.label)}</button>`).join('');
}

/** The club's name as a glowing wordmark, for the top of a screen. */
export const brandHTML = () => '<span class="brand">Cyber <b>Colizeum</b></span>';

/** A "12:31" countdown to `end` (ms) that ticks by itself every second. */
export const countdownHTML = (end) => `<span data-countdown="${end}">${countdown(end - Date.now())}</span>`;

setInterval(() => {
  for (const node of document.querySelectorAll('[data-countdown]')) node.textContent = countdown(Number(node.dataset.countdown) - Date.now());
}, 1000);
