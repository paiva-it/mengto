// Three lights from one kit of parts: same builders, different parameter tables.
import { pt, TAU } from './kit.js';

const Q = Math.PI / 4;

// A face-mounted box on a round or polygonal wall at angle th (radians on plan), radius r.
const onWall = (b, th, r, y, w, h, d, cx = 0, cz = 0) =>
  b.box(cx + Math.cos(th) * r, y, cz + Math.sin(th) * r, w, h, d, Math.PI / 2 - th);

// Rail posts along the edges of an n-gon, plus top and mid rails.
const railing = (iron, y0, h, R, n, per, a0 = 0, cx = 0, cz = 0) => {
  for (let k = 0; k < n; k++) {
    const a = pt(k, R, n, a0, cx, cz), b = pt(k + 1, R, n, a0, cx, cz);
    for (let s = 0; s < per; s++) {
      const f = s / per;
      iron.box(a[0] + (b[0] - a[0]) * f, y0 + h / 2, a[1] + (b[1] - a[1]) * f, 0.045, h, 0.045);
    }
  }
  iron.prismN(y0 + h - 0.05, y0 + h, R, R, n, { a0, cx, cz, top: false });
  iron.prismN(y0 + h * 0.48, y0 + h * 0.48 + 0.035, R, R, n, { a0, cx, cz });
};

// The glazed lantern: pedestal, glass drum, astragals at every corner, bands.
const lantern = (m, y0, y1, R, n, a0 = 0, cx = 0, cz = 0) => {
  m.glass.prismN(y0, y1, R, R, n, { a0, cx, cz });
  for (let k = 0; k < n; k++) {
    const p = pt(k, R + 0.01, n, a0, cx, cz);
    m.iron.box(p[0], (y0 + y1) / 2, p[1], 0.05, y1 - y0, 0.05, Math.PI / 2 - (a0 + (k * TAU) / n));
  }
  for (const y of [y0, (y0 + y1) / 2, y1 - 0.06]) m.iron.prismN(y, y + 0.06, R + 0.03, R + 0.03, n, { a0, cx, cz });
};

/* ---------------------------------------------------------------- Nº 1  Ardra Rock */
const rockProf = (t) => 1.2 + 1.25 * Math.pow(1 - t, 2.4);
const rockR = (y) => rockProf((y - 0.7) / 11.5);
const corbel = (t) => 1.2 + 0.55 * Math.pow(t, 1.8);
const dome = (t) => 1.12 * Math.pow(Math.max(0, Math.cos((t * Math.PI) / 2)), 0.7);

function buildRock(m) {
  m.rock.prismN(0, 0.35, 3.4, 3.25, 24, { top: true });
  m.rock.prismN(0.35, 0.7, 2.75, 2.65, 24, { top: true });
  m.stone.lathe(0.7, 12.2, rockProf, 40, 48);
  // string courses, each with its ledge decked
  for (const y of [4.2, 8.0]) {
    const r = rockR(y);
    m.stone.prismN(y, y + 0.14, r + 0.07, r + 0.07, 48);
    m.stone.ring(y + 0.14, r - 0.05, r + 0.07, 48);
  }
  // door and lintel sized to the curve they sit on, then a spiral of windows
  const F = Q;
  onWall(m.iron, F, 2.28, 1.55, 0.62, 1.4, 0.4);
  onWall(m.stone, F, 2.36, 2.36, 0.95, 0.24, 0.4);
  [3.0, 5.3, 7.3, 9.1, 10.8].forEach((y, i) => {
    const th = F + 0.95 + i * 1.25;
    onWall(m.pane, th, rockR(y) - 0.02, y, 0.26, 0.5, 0.1);
    onWall(m.stone, th, rockR(y + 0.32) - 0.02, y + 0.32, 0.4, 0.08, 0.16);
  });
  m.stone.lathe(12.2, 12.75, corbel, 8, 48);
  m.stone.prismN(12.75, 12.9, 1.85, 1.85, 48, { top: true, bot: true });
  railing(m.iron, 12.9, 0.72, 1.78, 24, 2);
  m.paint.prismN(12.9, 13.35, 1.06, 1.06, 16, { top: true });
  lantern(m, 13.35, 14.65, 1.0, 16);
  m.copper.ring(14.65, 0, 1.12, 32, { down: true });
  m.copper.lathe(14.65, 15.45, dome, 12, 32);
  m.copper.lathe(15.38, 15.78, (t) => 0.2 * Math.sin(Math.PI * t) + 0.01, 8, 16);
  m.iron.box(0, 16.05, 0, 0.04, 0.6, 0.04);
  m.iron.box(0.18, 16.2, 0, 0.36, 0.16, 0.02);
}

/* -------------------------------------------------------------- Nº 2  Morrow Point */
const ironR = (y) => 2.05 + (1.3 - 2.05) * ((y - 0.6) / 10);
const a8 = Math.PI / 8;

function buildIron(m) {
  m.rock.prismN(0, 0.6, 3.8, 3.7, 4, { a0: Q, top: true });
  // four bolted bands, red and white, on one octagonal taper
  for (let i = 0; i < 4; i++) {
    const y0 = 0.6 + i * 2.5, y1 = y0 + 2.5;
    (i % 2 ? m.paint : m.red).prismN(y0, y1, ironR(y0), ironR(y1), 8, { a0: a8 });
    m.iron.prismN(y1 - 0.06, y1, ironR(y1 - 0.06) + 0.03, ironR(y1) + 0.03, 8, { a0: a8 });
  }
  // windows on the face centres (apothem), alternating faces up the tower
  [[0, 1.55, 0.6, 1.4, m.iron], [0, 3.2], [2, 5.6], [0, 8.0], [-2, 9.7]].forEach(([k, y, w = 0.32, h = 0.55, mat = m.pane]) => {
    const th = Q + (k * Math.PI) / 4, r = ironR(y) * Math.cos(a8);
    onWall(mat, th, r, y, w, h, 0.14);
  });
  m.iron.prismN(10.6, 11.0, 1.3, 1.78, 8, { a0: a8 });
  m.iron.prismN(11.0, 11.12, 1.88, 1.88, 8, { a0: a8, top: true, bot: true });
  railing(m.iron, 11.12, 0.72, 1.8, 8, 3, a8);
  m.red.prismN(11.12, 11.5, 1.0, 1.0, 8, { a0: a8, top: true });
  lantern(m, 11.5, 12.7, 0.95, 8, a8);
  m.red.prismN(12.7, 13.6, 1.14, 0.02, 8, { a0: a8, bot: true });
  m.copper.lathe(13.52, 13.88, (t) => 0.17 * Math.sin(Math.PI * t) + 0.01, 8, 16);
  m.iron.box(0, 14.1, 0, 0.04, 0.5, 0.04);
}

/* ------------------------------------------------------------ Nº 3  Salthaven Pier */
const towerR = (y) => 1.75 + (1.45 - 1.75) * ((y - 0.5) / 8);
const COT = { cx: -3.7, cz: 0.4, R: 2.12 };
const roofO = { yE: 2.95, yT: 4.6, RE: 2.5, trunc: 0, lift: 0.05, flare: 0, pow: 1, tip: 0.05, a0: Q, cx: COT.cx, cz: COT.cz, thick: 0.09 };

function buildHarbour(m) {
  m.rock.prismN(0, 0.5, 6.0, 5.9, 4, { a0: Q, cx: -1.4, top: true });
  // tower: a granite course, its ledge decked, then the limewashed shaft
  m.stone.prismN(0.5, 1.1, 1.92, 1.92, 4, { a0: Q });
  m.stone.ring(1.1, towerR(1.1) - 0.02, 1.92, 4, { a0: Q });
  m.paint.prismN(1.1, 8.5, towerR(1.1), towerR(8.5), 4, { a0: Q });
  m.stone.prismN(8.5, 8.78, 1.45, 1.78, 4, { a0: Q, top: true });
  railing(m.iron, 8.78, 0.7, 1.7, 4, 5, Q);
  const ap = (y) => towerR(y) * Math.SQRT1_2; // the face, measured before the openings are sized
  onWall(m.iron, Math.PI / 2, ap(1.7), 1.75, 0.62, 1.3, 0.14);
  onWall(m.stone, Math.PI / 2, ap(2.5), 2.5, 0.92, 0.18, 0.2);
  for (const [th, y] of [[Math.PI / 2, 4.0], [Math.PI / 2, 6.6], [0, 3.0], [0, 5.3], [0, 7.4]]) {
    onWall(m.pane, th, ap(y), y, 0.34, 0.6, 0.14);
    onWall(m.stone, th, ap(y - 0.36), y - 0.36, 0.5, 0.08, 0.22);
  }
  m.paint.prismN(8.78, 9.12, 0.92, 0.92, 12, { top: true });
  lantern(m, 9.12, 10.2, 0.86, 12);
  m.copper.ring(10.2, 0, 0.98, 24, { down: true });
  m.copper.lathe(10.2, 10.85, (t) => 0.98 * Math.pow(Math.max(0, Math.cos((t * Math.PI) / 2)), 0.7), 10, 24);
  m.copper.lathe(10.8, 11.1, (t) => 0.15 * Math.sin(Math.PI * t) + 0.01, 8, 16);

  // the keeper's cottage: walls, openings, a hipped slate roof from the roof function
  const { cx, cz, R } = COT, o = { a0: Q, cx, cz };
  m.paint.prismN(0.5, 2.95, R, R, 4, o);
  const cap = R * Math.SQRT1_2;
  onWall(m.iron, Math.PI / 2, cap, 1.25, 0.56, 1.25, 0.12, cx, cz);
  for (const [th, x] of [[Math.PI / 2, -0.85], [Math.PI / 2, 0.85], [0, 0]]) {
    const c = Math.cos(th), s = Math.sin(th);
    onWall(m.pane, th, cap, 1.65, 0.42, 0.62, 0.12, cx - s * x, cz + c * x);
  }
  m.slate.roof(roofO, m.soffit);
  m.stone.box(cx + 0.55, 4.25, cz - 0.55, 0.42, 1.4, 0.42);
}

/* --------------------------------------------------------------------- parameters
   caps: [y0, y1, radius | (y) => radius, sides, { a0, cx, cz }]  — the plan of each cut
   scaf: [base, top, half-width, bays, cx, cz]
   stages: [caption, plane height]                                                      */
const LIGHTS = [
  {
    id: 'rock', name: 'Ardra Rock', no: 'Nº 1', build: buildRock,
    built: 'Dovetailed granite · 1847', focal: '48 m', range: '23 nmi', character: 'Fl W 5s',
    lamp: { y: 14.0, color: 0xffd9a0, mode: 'sweep', period: 10 },
    cut: 0x8f887c, height: 16.4,
    caps: [
      [0, 0.35, 3.25, 24], [0.35, 0.7, 2.65, 24], [0.7, 12.2, rockR, 48],
      [12.2, 12.75, (y) => corbel((y - 12.2) / 0.55), 48], [12.75, 12.9, 1.85, 48], [12.9, 13.35, 1.06, 16],
      [14.65, 15.45, (y) => dome((y - 14.65) / 0.8), 32],
    ],
    scaf: [[0.35, 3.75, 3.1, 7], [3.45, 7.15, 2.55, 6], [6.85, 10.55, 2.15, 5], [10.25, 13.85, 2.3, 5], [13.55, 16.2, 1.68, 4]],
    stages: [['READY', 0], ['FOUNDATION', 0.72], ['LOWER COURSES', 4.36], ['UPPER COURSES', 8.16], ['CORBELS', 12.92], ['LANTERN', 14.7], ['DOME', 16.4]],
  },
  {
    id: 'iron', name: 'Morrow Point', no: 'Nº 2', build: buildIron,
    built: 'Bolted cast-iron plate · 1872', focal: '31 m', range: '16 nmi', character: 'Fl R 3s',
    lamp: { y: 12.1, color: 0xff6a4a, mode: 'sweep', period: 6 },
    cut: 0x6b6460, height: 14.4,
    caps: [
      [0, 0.6, 3.7, 4, { a0: Q }], [0.6, 10.6, ironR, 8, { a0: a8 }], [10.6, 11.0, (y) => 1.3 + 0.48 * ((y - 10.6) / 0.4), 8, { a0: a8 }],
      [11.0, 11.12, 1.88, 8, { a0: a8 }], [11.12, 11.5, 1.0, 8, { a0: a8 }], [12.7, 13.6, (y) => 1.14 - 1.12 * ((y - 12.7) / 0.9), 8, { a0: a8 }],
    ],
    scaf: [[0.6, 3.7, 2.75, 6], [3.4, 6.5, 2.45, 5], [6.2, 9.3, 2.2, 5], [9.0, 11.9, 2.1, 5], [11.12, 14.2, 1.55, 4]],
    stages: [['READY', 0], ['PLINTH', 0.62], ['LOWER PLATES', 3.12], ['MIDDLE PLATES', 5.62], ['UPPER PLATES', 8.12], ['GALLERY', 11.14], ['LANTERN', 12.72], ['ROOF', 14.4]],
  },
  {
    id: 'harbour', name: 'Salthaven Pier', no: 'Nº 3', build: buildHarbour,
    built: 'Limewashed rubble stone · 1838', focal: '14 m', range: '9 nmi', character: 'Oc G 4s',
    lamp: { y: 9.65, color: 0x7dffb0, mode: 'occult', period: 4 },
    cut: 0x9b9384, height: 13.2, focusX: -1.6,
    caps: [
      [0, 0.5, 5.9, 4, { a0: Q, cx: -1.4 }], [0.5, 1.1, 1.92, 4, { a0: Q }], [1.1, 8.5, towerR, 4, { a0: Q }],
      [8.5, 8.78, (y) => 1.45 + 0.33 * ((y - 8.5) / 0.28), 4, { a0: Q }], [8.78, 9.12, 0.92, 12],
      [10.2, 10.85, (y) => 0.98 * Math.pow(Math.max(0, Math.cos(((y - 10.2) / 0.65) * Math.PI / 2)), 0.7), 24],
      [0.5, 2.95, COT.R, 4, { a0: Q, cx: COT.cx, cz: COT.cz }],
      [2.95, 4.55, (y) => roofO.RE * (1 - (y - 2.95) / 1.65) * 0.96, 4, { a0: Q, cx: COT.cx, cz: COT.cz }],
    ],
    scaf: [[0.5, 3.7, 1.72, 4], [3.4, 6.6, 1.72, 4], [6.3, 9.4, 1.72, 4], [8.78, 11.2, 1.18, 3], [0.5, 3.5, 1.82, 4, COT.cx, COT.cz]],
    stages: [['READY', 0], ['QUAY', 0.52], ['GROUND FLOOR', 3.0], ['SLATING', 4.7], ['SHAFT & CORNICE', 8.8], ['LANTERN', 10.22], ['DOME', 11.3]],
  },
];

export { LIGHTS };
