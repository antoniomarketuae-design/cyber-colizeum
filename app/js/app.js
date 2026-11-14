// The app shell: hash routes (#live, #deals, …), the bottom tab bar, messages, update checks, offline and the
// iPhone "Add to Home Screen" guide. Pattern from Dreaming; each screen is a module { id, label, icon, render,
// destroy?, hideTabbar? } in js/screens/. Other screens are reached by link: add them to SHARED.
import live from './screens/live.js';
import deals from './screens/deals.js';
import book from './screens/book.js';
import me from './screens/me.js';
import staff from './screens/staff.js';
import dealEdit from './screens/deal-edit.js';
import { icons, esc, closeSheet } from './ui.js';
import { setPresenter } from './data/inbox.js';
import { startEngine } from './engine.js';

const APP_NAME = 'Cyber Colizeum';
const TABS = [live, deals, book, me];
const SHARED = [staff, dealEdit];
const screens = () => [...TABS, ...SHARED];

const screenEl = document.getElementById('screen');
const tabbarEl = document.getElementById('tabbar');
const toastEl = document.getElementById('toast');
const noticeEl = document.getElementById('notice');
const state = { version: null };

const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let inAppMoves = 0;
const ctx = {
  get version() { return state.version; },
  isStandalone,
  isIOS,
  checkForUpdate: (reason) => checkForUpdate(reason),
  toast: (message, opts) => toast(message, opts),
  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  // Goes back within the app; a screen opened directly (fresh launch, shared link) goes to Live instead.
  back(fallback = '#live') {
    if (inAppMoves > 0) history.back();
    else ctx.navigate(fallback);
  },
};

// ---- Screens and tab bar ----

function parseRoute() {
  const [id, ...rest] = location.hash.slice(1).split('/');
  const screen = screens().find((s) => s.id === id) ?? TABS[0];
  const param = rest.length ? decodeURIComponent(rest.join('/')) : null;
  return { screen, param };
}

function renderTabs() {
  tabbarEl.innerHTML = TABS.map((s) => `<a class="tab" href="#${s.id}" data-id="${s.id}">${s.icon}<span>${s.label}</span></a>`).join('');
}

let active = null;
function render() {
  const { screen, param } = parseRoute();
  closeSheet();
  try { active?.destroy?.(); } catch {}
  active = screen;
  document.body.dataset.screen = screen.id;
  document.body.dataset.tabbar = screen.hideTabbar ? 'hidden' : 'shown';
  tabbarEl.hidden = Boolean(screen.hideTabbar);
  renderTabs();
  const current = screen.tab ?? screen.id;
  for (const tab of tabbarEl.querySelectorAll('.tab')) {
    if (tab.dataset.id === current) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  try {
    screen.render(screenEl, ctx, param);
  } catch (err) {
    console.error(err);
    screenEl.innerHTML = '<p class="muted" style="padding-top:40px">Something went wrong on this screen.</p>';
  }
}
window.addEventListener('hashchange', () => { inAppMoves += 1; render(); window.scrollTo(0, 0); });

// ---- Messages at the top of the screen ----

let toastTimer;
function toast(message, { action, onAction, sticky } = {}) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = '';
  toastEl.append(document.createTextNode(message));
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = action;
    btn.addEventListener('click', onAction);
    toastEl.append(btn);
  }
  toastEl.hidden = false;
  if (!sticky) toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}

// A new message (deal, free PC, booking answer) slides down like a phone notification; tap opens it.
let noticeTimer;
function showNotice(m) {
  clearTimeout(noticeTimer);
  noticeEl.innerHTML = `
    <span class="notice-icon notice-${esc(m.kind)}">${m.kind === 'deal' ? icons.tag : m.kind === 'booking' ? icons.calendar : icons.monitor}</span>
    <span class="notice-text"><b>${esc(m.title)}</b><span>${esc(m.body)}</span></span>`;
  noticeEl.dataset.link = m.link || '';
  noticeEl.hidden = false;
  void noticeEl.offsetHeight; // lay it out above the screen first, so adding the class slides it down
  noticeEl.classList.add('is-shown');
  noticeTimer = setTimeout(hideNotice, 7000);
}
function hideNotice() {
  noticeEl.classList.remove('is-shown');
  setTimeout(() => { if (!noticeEl.classList.contains('is-shown')) noticeEl.hidden = true; }, 350);
}
noticeEl.addEventListener('click', () => {
  const link = noticeEl.dataset.link;
  hideNotice();
  if (link) ctx.navigate(link);
});
setPresenter(showNotice);

// ---- Updates: each publish raises version.json by one (tools/bump.js) ----

let announced = null;
async function checkForUpdate(reason) {
  let latest;
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    latest = await res.json();
  } catch {
    if (reason === 'manual') toast('Offline: could not check for updates');
    return;
  }
  if (!state.version) {
    state.version = latest;
    if (active?.id === 'me') render();
    return;
  }
  if (latest.version === state.version.version) {
    if (reason === 'manual') toast('You have the latest version');
    return;
  }
  // Coming back to the app is a natural moment to switch over.
  if (reason === 'resume' || reason === 'manual') { location.reload(); return; }
  if (announced === latest.version) return;
  announced = latest.version;
  toast(`Version ${latest.version} is ready`, { action: 'Update', onAction: () => location.reload(), sticky: true });
}

let swRegistration = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then((reg) => { swRegistration = reg; }).catch(() => {});
  // A tapped system notification asks the open app to show its screen.
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.link) ctx.navigate(e.data.link); });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  swRegistration?.update().catch(() => {});
  checkForUpdate('resume');
});
setInterval(() => { if (document.visibilityState === 'visible') checkForUpdate('poll'); }, 30000);

// ---- First visit in Safari: how to put the app on the Home Screen ----

function maybeShowInstallGuide() {
  const forced = new URLSearchParams(location.search).has('install'); // ?install previews it anywhere
  if (!forced && (isStandalone() || !isIOS)) return;
  try { if (!forced && sessionStorage.getItem('skip-install')) return; } catch {}
  const el = document.createElement('div');
  el.className = 'install';
  el.innerHTML = `
    <div class="install-inner">
      <img class="install-icon" src="icons/logo-180.png" alt="" width="88" height="88">
      <h1>Install ${APP_NAME}</h1>
      <p class="install-lead">Put it on your Home Screen: it opens full screen like a real app, and it can tell you when there's a deal.</p>
      <ol class="steps">
        <li><span class="step-icon">${icons.compass}</span><span>Open this page in <b>Safari</b>.</span></li>
        <li><span class="step-icon">${icons.share}</span><span>Tap <b>Share</b>. On iOS 26, tap <b>•••</b> first, then <b>Share</b>.</span></li>
        <li><span class="step-icon">${icons.addSquare}</span><span>Choose <b>Add to Home Screen</b>, then tap <b>Add</b>.</span></li>
      </ol>
      <p class="install-after">Then open <b>${APP_NAME}</b> from your Home Screen.</p>
      <button class="btn btn-ghost" type="button" data-skip>Continue in the browser</button>
    </div>`;
  el.querySelector('[data-skip]').addEventListener('click', () => {
    try { sessionStorage.setItem('skip-install', '1'); } catch {}
    el.remove();
  });
  document.body.append(el);
}

render();
startEngine();
checkForUpdate('boot');
maybeShowInstallGuide();
