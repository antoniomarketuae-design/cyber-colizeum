// Clock helpers shared by the data modules and the screens. 24-hour times, as in Bulgaria.
export const MIN = 60000;
export const HOUR = 60 * MIN;

/** "10:30" → 630 */
export const toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** 630 → "10:30" */
export const fromMin = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** Midnight of the day `ms` falls on, plus `mins` minutes (handles 24:00+ and summer time). */
export function atMinutes(ms, mins) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins).getTime();
}

/** "15:40" */
export const hm = (ms) => fromMin(new Date(ms).getHours() * 60 + new Date(ms).getMinutes());

/** "2026-11-14" in local time, for per-day counters. */
export function dayKey(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Today", "Tomorrow", else "Sat 21 Nov". */
export function dayLabel(ms, now = Date.now()) {
  const days = Math.round((atMinutes(ms, 0) - atMinutes(now, 0)) / (24 * HOUR));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "1 h 20 min", "45 min", "under a minute". */
export function duration(ms) {
  const mins = Math.ceil(ms / MIN);
  if (mins <= 1) return 'under a minute';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "12:05" minutes:seconds, for short countdowns. */
export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "3 min ago", "2 h ago", "Yesterday 14:20". */
export function ago(ms, now = Date.now()) {
  const mins = Math.floor((now - ms) / MIN);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 12 * 60 && dayKey(ms) === dayKey(now)) return `${Math.floor(mins / 60)} h ago`;
  return `${dayLabel(ms, now)} ${hm(ms)}`;
}

/** 4 → "4.00 €" */
export const euro = (n) => `${Number(n).toFixed(2)} €`;
