// The club itself: contact details, rooms, PC numbers and prices (copied from cybercolizeum.bg, Nov 2026).
// Rooms and counts from the owner's floor plan (2026-11-14): VIP 5, Streamer 1, Bootcamp 9, Bootcamp 2 3, Main hall 20.
// PC numbering is a placeholder until the owner confirms it (it matches the monitor numbers in his photos): VIP 1–5,
// Streamer 6, Bootcamp 7–15, Bootcamp 2 16–18, Main hall 19–38. Change `first` / `count` and the app follows.

export const CLUB = {
  name: 'Cyber Colizeum',
  address: 'Simeonovsko Shose Blvd 80, Sofia',
  mapsUrl: 'https://maps.apple.com/?q=Cyber%20Colizeum%2C%20Simeonovsko%20Shose%2080%2C%20Sofia',
  phone: '+359 882 00 44 77',
  tel: '+359882004477',
  email: 'kibercolizeum@gmail.com',
  website: 'https://cybercolizeum.bg/',
  instagram: 'https://www.instagram.com/cybercolizeum',
  facebook: 'https://www.facebook.com/share/14kuLu3zut2/',
  tiktok: 'https://www.tiktok.com/@cybercolizeum',
};

const HALL_PACKAGES = [
  { label: '3 hours', price: 10 },
  { label: '5 hours + a free drink', price: 14 },
  { label: 'Day 8:00–19:00 + snack and drink', price: 14 },
  { label: 'Night 22:00–8:00 + snack and drink', price: 14 },
];
const BOOTCAMP_PACKAGES = [
  { label: '3 hours', price: 10 },
  { label: '5 hours + a free drink', price: 14 },
  { label: 'Day 8:00–19:00 + snack and drink', price: 18 },
  { label: 'Night 22:00–8:00 + snack and drink', price: 18 },
];

export const ROOMS = [
  {
    id: 'vip', name: 'VIP room', short: 'VIP', first: 1, count: 5, perHour: 5,
    about: 'Private room · white water-cooled PCs with GeForce RTX',
    packages: [
      { label: '3 hours', price: 12 },
      { label: '5 hours + a free drink', price: 18 },
      { label: '8 hours + snack and drink', price: 26 },
      { label: 'Night 22:00–8:00 + snack and drink', price: 21.5 },
    ],
  },
  {
    id: 'streamer', name: 'Streamer room', short: 'Streamer', first: 6, count: 1, perHour: 6,
    about: 'Solo room · two screens, studio mic, webcam',
    packages: [
      { label: '3 hours', price: 14.5 },
      { label: '5 hours + a free drink', price: 21.5 },
      { label: '8 hours + snack and drink', price: 26 },
      { label: 'Night 22:00–8:00 + snack and drink', price: 21.5 },
    ],
  },
  {
    id: 'bootcamp', name: 'Bootcamp', short: 'Bootcamp', first: 7, count: 9, perHour: 4,
    about: 'Team room · 9 PCs side by side',
    packages: BOOTCAMP_PACKAGES,
  },
  {
    id: 'bootcamp2', name: 'Bootcamp 2', short: 'Bootcamp 2', first: 16, count: 3, perHour: 4,
    about: 'Small team room · 3 PCs',
    packages: BOOTCAMP_PACKAGES,
  },
  {
    id: 'hall', name: 'Main hall', short: 'Hall', first: 19, count: 20, perHour: 4,
    about: 'The big hall · GeForce RTX gaming PCs',
    packages: HALL_PACKAGES,
  },
];

export const TOTAL_PCS = ROOMS.reduce((sum, r) => sum + r.count, 0);

export const roomById = (id) => ROOMS.find((r) => r.id === id);

export const pcsOf = (room) => Array.from({ length: room.count }, (_, i) => room.first + i);

export const roomOfPc = (n) => ROOMS.find((r) => n >= r.first && n < r.first + r.count);

export const ALL_PCS = ROOMS.flatMap(pcsOf);

// ---- The floor plan for the Map view on Live ----
// Drawn from the club's design drawing ("ДП Компьютерный клуб", owner 2026-11-14) as a phone-sized map: same
// arrangement (slanted top wall, VIP top left, reception, streamer room, Bootcamp by the entrance, Bootcamp 2 next to
// the sim-racing seats, the main hall's two islands with screens back to back), but every PC drawn big enough to tap.
// Units are the SVG's own (viewBox 0 0 340 896). Owner (2026-11-14): the small room is the Streamer room; leave the
// 2-PC room by the sim seats and the PlayStation rooms off the map.
const SEAT_W = 38;
const SEAT_H = 42;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
/** PCs in a line: dx/dy is the step from one PC to the next. */
const line = (numbers, x, y, dx, dy, chair, size = {}) => numbers.map((n, i) => ({ n, x: x + i * dx, y: y + i * dy, chair, ...size }));
const SMALL = { w: 36, h: 36 };

export const FLOOR = {
  width: 340,
  height: 896,
  seatW: SEAT_W,
  seatH: SEAT_H,
  walls: [
    'M8 300V60L56 8L332 150V890H8V340', // the building, with the entrance gap on the left
    'M150 57V236', 'M232 99V236', // VIP | reception | streamer
    'M8 236H112', 'M196 236H246', 'M270 236H332', // wing | lobby and Bootcamp (doors left open)
    'M196 236V376', 'M196 412V440', // lobby | Bootcamp
    'M8 440H128', 'M196 440H332',
    'M120 452V590', // Bootcamp 2 | sim racing
    'M8 610H104', 'M200 610H332', // the main hall
  ],
  // The LED screen walls down the middle of each island in the main hall.
  dividers: ['M98 646V880', 'M240 646V880'],
  // Not PCs: drawn faintly so the map reads like the club.
  props: [{ x: 166, y: 118, w: 50, h: 34, rx: 6 }], // the reception desk
  marks: ['M12 312l8 8-8 8'], // the entrance arrow
  sims: [{ x: 150, y: 488 }, { x: 150, y: 540 }],
  labels: [
    { room: 'vip', x: 104, y: 178, anchor: 'middle' },
    { text: 'Reception', x: 191, y: 172, anchor: 'middle' },
    { room: 'streamer', short: true, x: 282, y: 216, anchor: 'middle' },
    { text: 'Entrance', x: 24, y: 323 },
    { room: 'bootcamp', x: 264, y: 254, anchor: 'middle' },
    { room: 'bootcamp2', x: 16, y: 460 },
    { text: 'Sim racing', x: 231, y: 470, anchor: 'middle' },
    { room: 'hall', x: 170, y: 628, anchor: 'middle' },
  ],
  seats: [
    ...line([1, 2], 58, 36, 40, 20, 'below', SMALL), // VIP: two under the slanted wall
    ...line(range(3, 5), 16, 76, 0, 42, 'right', SMALL), // VIP: three along the left wall
    ...line([6], 248, 146, 0, 0, 'below', SMALL), // streamer room
    ...line(range(7, 9), 204, 272, 44, 0, 'below', SMALL), // Bootcamp, 3 rows of 3
    ...line(range(10, 12), 204, 326, 44, 0, 'below', SMALL),
    ...line(range(13, 15), 204, 380, 44, 0, 'below', SMALL),
    ...line(range(16, 18), 16, 476, 0, 42, 'right', SMALL), // Bootcamp 2, along the left wall
    ...line(range(19, 23), 58, 650, 0, 46, 'left'), // main hall, left island
    ...line(range(24, 28), 100, 650, 0, 46, 'right'),
    ...line(range(29, 33), 200, 650, 0, 46, 'left'), // main hall, right island
    ...line(range(34, 38), 242, 650, 0, 46, 'right'),
  ],
};

export const ON_MAP = new Set(FLOOR.seats.map((s) => s.n));
