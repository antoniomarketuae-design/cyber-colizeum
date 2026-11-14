// The club itself: contact details, rooms, PC numbers and prices (copied from cybercolizeum.bg, Nov 2026).
// PC numbering is a placeholder until the owner confirms it: VIP 1–5, Streamer 6, Bootcamp 7–15,
// Bootcamp 2 16–18, Main hall 19–48. Change `first` / `count` here and the whole app follows.

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
    id: 'hall', name: 'Main hall', short: 'Hall', first: 19, count: 30, perHour: 4,
    about: 'The big hall · GeForce RTX gaming PCs',
    packages: HALL_PACKAGES,
  },
];

export const TOTAL_PCS = ROOMS.reduce((sum, r) => sum + r.count, 0);

export const roomById = (id) => ROOMS.find((r) => r.id === id);

export const pcsOf = (room) => Array.from({ length: room.count }, (_, i) => room.first + i);

export const roomOfPc = (n) => ROOMS.find((r) => n >= r.first && n < r.first + r.count);

export const ALL_PCS = ROOMS.flatMap(pcsOf);
