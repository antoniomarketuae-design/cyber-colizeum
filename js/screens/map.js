// The Map view on Live: the club's floor plan in neon (walls glowing ice-cyan, the violet LED screen walls,
// a faint blueprint grid) with every placed PC at its real spot, showing live free / playing / booked / yours.
// Tapping a PC opens the same sheet as the room tiles. Layout data: FLOOR in data/club.js.
import { esc } from '../ui.js';
import { FLOOR, roomById } from '../data/club.js';
import { roomPrice } from '../data/deals.js';
import { hm, euro } from '../time.js';

function seatLabel(pc) {
  if (pc.status === 'free') return 'free';
  if (pc.status === 'held' || pc.mine) return 'you';
  if (pc.status === 'busy') return hm(pc.until);
  if (pc.status === 'reserved') return 'booked';
  return 'off';
}

function seatAria(pc) {
  if (pc.status === 'free') return `PC ${pc.n}, free`;
  if (pc.status === 'held') return `PC ${pc.n}, held for you`;
  if (pc.status === 'busy') return pc.mine ? `PC ${pc.n}, your booking` : `PC ${pc.n}, playing, free from ${hm(pc.until)}`;
  if (pc.status === 'reserved') return `PC ${pc.n}, booked from ${hm(pc.at)}`;
  return `PC ${pc.n}, out of order`;
}

/** Where the chair goes, next to the desk. */
function chairAt(seat, w, h) {
  if (seat.chair === 'left') return [seat.x - 10, seat.y + h / 2];
  if (seat.chair === 'below') return [seat.x + w / 2, seat.y + h + 10];
  if (seat.chair === 'above') return [seat.x + w / 2, seat.y - 10];
  return [seat.x + w + 10, seat.y + h / 2];
}

function seatSVG(seat, pc, watched) {
  const w = seat.w ?? FLOOR.seatW;
  const h = seat.h ?? FLOOR.seatH;
  const cx = seat.x + w / 2;
  const [chairX, chairY] = chairAt(seat, w, h);
  const state = `is-${pc.status}${pc.mine ? ' is-mine' : ''}`;
  return `
    <g class="mp-seat ${state}" data-act="pc" data-pc="${pc.n}" role="button" tabindex="0" aria-label="${esc(seatAria(pc))}">
      <circle class="mp-chair" cx="${chairX}" cy="${chairY}" r="6"/>
      <rect class="mp-desk" x="${seat.x}" y="${seat.y}" width="${w}" height="${h}" rx="7"${pc.status === 'free' ? ' filter="url(#mp-glow)"' : ''}/>
      <text class="mp-n" x="${cx}" y="${seat.y + h / 2 + (h < 40 ? 0 : 1)}">${pc.n}</text>
      <text class="mp-t" x="${cx}" y="${seat.y + h / 2 + (h < 40 ? 11 : 13)}">${esc(seatLabel(pc))}</text>
      ${watched ? `<circle class="mp-watch" cx="${seat.x + w - 5}" cy="${seat.y + 5}" r="3"/>` : ''}
    </g>`;
}

function simSVG({ x, y }) {
  // A racing cockpit seen from above: seat shell, wheel, pedal box.
  return `
    <g class="mp-sim" aria-hidden="true">
      <rect x="${x + 44}" y="${y}" width="96" height="34" rx="15"/>
      <path d="M${x + 54} ${y + 7}q14 10 0 20"/>
      <line x1="${x + 30}" y1="${y + 3}" x2="${x + 30}" y2="${y + 31}"/>
      <rect x="${x}" y="${y + 9}" width="18" height="16" rx="3"/>
    </g>`;
}

/** The floor plan with live PCs, plus each placed room's price under it. */
export function mapHTML(live, running, watched) {
  const byN = new Map(live.map((p) => [p.n, p]));
  const placedRooms = [...new Set(FLOOR.seats.map((s) => byN.get(s.n)?.room).filter(Boolean))];
  const placedFree = (roomId) => FLOOR.seats.filter((s) => byN.get(s.n)?.room === roomId && byN.get(s.n).status === 'free').length;

  const labels = FLOOR.labels.map((l) => {
    const anchor = l.anchor ?? 'start';
    if (!l.room) return `<text class="mp-label is-muted" x="${l.x}" y="${l.y}" text-anchor="${anchor}">${esc(l.text.toUpperCase())}</text>`;
    const room = roomById(l.room);
    const free = placedFree(l.room);
    const price = roomPrice(room, running);
    return `
      <text class="mp-label" x="${l.x}" y="${l.y}" text-anchor="${anchor}">${esc((l.short ? room.short : room.name).toUpperCase())}</text>
      <text class="mp-count${free ? ' has-free' : ''}${price.deal || price.bonus ? ' has-deal' : ''}" x="${l.x}" y="${l.y + 11}" text-anchor="${anchor}">${free ? `${free} free` : 'full'} · ${euro(price.now)}/h</text>`;
  }).join('');

  const seats = FLOOR.seats.map((s) => {
    const pc = byN.get(s.n);
    return pc ? seatSVG(s, pc, watched.has(s.n)) : '';
  }).join('');

  return `
    <section class="lv-map" aria-label="Floor plan">
      <svg viewBox="0 0 ${FLOOR.width} ${FLOOR.height}" role="group" aria-label="Floor plan of the club with live PCs">
        <defs>
          <pattern id="mp-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" class="mp-grid"/></pattern>
          <pattern id="mp-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" class="mp-hatch"/></pattern>
          <filter id="mp-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.4" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <rect x="4" y="4" width="${FLOOR.width - 8}" height="${FLOOR.height - 8}" fill="url(#mp-grid)"/>
        <!-- One path each: a glow filter on a single straight line has an empty box and draws nothing. -->
        <path class="mp-wall" d="${FLOOR.walls.join(' ')}" filter="url(#mp-glow)"/>
        <path class="mp-divider" d="${FLOOR.dividers.join(' ')}" filter="url(#mp-glow)"/>
        ${FLOOR.props.map((p) => `<rect class="mp-prop" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx ?? 4}"/>`).join('')}
        ${FLOOR.marks.map((d) => `<path class="mp-mark" d="${d}"/>`).join('')}
        ${FLOOR.sims.map(simSVG).join('')}
        ${labels}
        ${seats}
      </svg>
      <p class="lv-map-note">${placedRooms.map((id) => {
        const room = roomById(id);
        const price = roomPrice(room, running);
        return `<span><b>${esc(room.name)}</b> ${price.deal ? `<s>${euro(price.base)}</s> <b class="hot">${euro(price.now)}/h</b>` : `${euro(price.base)}/h`}${price.bonus ? ' <b class="hot">+ bonus time</b>' : ''}</span>`;
      }).join('')}</p>
    </section>`;
}
