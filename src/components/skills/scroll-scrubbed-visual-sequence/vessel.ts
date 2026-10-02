// Procedural canvas renderer for one thrown pot. Every visual state is a pure function of
// normalized progress p (0..1), so the same scroll position always draws the same frame.

type RGB = [number, number, number];
type Material = { dark: RGB; mid: RGB; light: RGB };

type Key = {
  h: number; // body height, in units of S
  r: number[]; // 9 radii bottom -> top, in units of S
  open: number; // inner radius of the opening (0 = closed dome)
  dry: number; // 0 wet clay -> 1 bisque
  glaze: number; // 0 bare -> 1 dipped
  rings: number; // throwing-ring strength
  rpm: number;
  wall: number; // mm
  kg: number;
};

type Scene = Key & { stage: number; spin: number; wheel: number; heat: number; ghost: number };

type DrawOptions = {
  glaze?: Material;
  guides?: boolean; // ghost profile + dimension lines
  mmPerUnit?: number;
  tilt?: number;
  scale?: number;
};

const SEQUENCE = {
  scrollVh: 520,
  stops: [0, 0.17, 0.34, 0.51, 0.68, 0.85],
  hold: 0.3, // share of each segment spent resting on the state just reached
  reducedMotionProgress: 1,
  mmPerUnit: 190,
  spinTurns: 26, // wheel revolutions across the throwing chapters
};

const KEYS: Key[] = [
  // 01 wedged lump
  { h: 0.46, r: [0.6, 0.66, 0.67, 0.65, 0.6, 0.52, 0.42, 0.3, 0.16], open: 0, dry: 0, glaze: 0, rings: 0.15, rpm: 120, wall: 0, kg: 1.24 },
  // 02 centred cone
  { h: 0.74, r: [0.5, 0.5, 0.48, 0.45, 0.41, 0.36, 0.29, 0.2, 0.08], open: 0, dry: 0, glaze: 0, rings: 0.35, rpm: 240, wall: 0, kg: 1.24 },
  // 03 opened cylinder
  { h: 0.6, r: [0.55, 0.55, 0.55, 0.54, 0.53, 0.52, 0.51, 0.5, 0.49], open: 0.4, dry: 0, glaze: 0, rings: 0.55, rpm: 180, wall: 11, kg: 1.2 },
  // 04 pulled jar
  { h: 1.12, r: [0.32, 0.41, 0.48, 0.5, 0.47, 0.38, 0.25, 0.2, 0.245], open: 0.195, dry: 0, glaze: 0, rings: 1, rpm: 140, wall: 6, kg: 1.16 },
  // 05 trimmed + fired (12 % shrink, foot turned)
  { h: 0.99, r: [0.24, 0.35, 0.42, 0.44, 0.415, 0.335, 0.22, 0.176, 0.216], open: 0.172, dry: 1, glaze: 0, rings: 0.55, rpm: 0, wall: 5.4, kg: 0.86 },
  // 06 dipped in celadon, listed
  { h: 0.99, r: [0.24, 0.35, 0.42, 0.44, 0.415, 0.335, 0.22, 0.176, 0.216], open: 0.172, dry: 1, glaze: 1, rings: 0.2, rpm: 0, wall: 5.4, kg: 0.94 },
];

const WET: Material = { dark: [70, 46, 34], mid: [138, 96, 72], light: [196, 150, 116] };
const BISQUE: Material = { dark: [150, 112, 92], mid: [222, 190, 164], light: [246, 230, 212] };
const CELADON: Material = { dark: [30, 62, 54], mid: [104, 150, 128], light: [190, 218, 198] };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const band = (p: number, a: number, b: number) => smooth(clamp((p - a) / (b - a)));
const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mixMat = (a: Material, b: Material, t: number): Material => ({
  dark: mixRGB(a.dark, b.dark, t),
  mid: mixRGB(a.mid, b.mid, t),
  light: mixRGB(a.light, b.light, t),
});
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// Which state p rests on, and how far it has morphed toward the next one.
const segmentAt = (p: number) => {
  const { stops, hold } = SEQUENCE;
  let i = stops.length - 1;
  while (i > 0 && p < stops[i]) i--;
  if (i === stops.length - 1) return { i, t: 0 };
  const local = (p - stops[i]) / (stops[i + 1] - stops[i]);
  return { i, t: smooth(clamp((local - hold) / (1 - hold))) };
};

// Scroll target that shows state i at rest.
const progressFor = (i: number) => {
  const { stops, hold } = SEQUENCE;
  if (i >= stops.length - 1) return 0.95;
  return stops[i] + (stops[i + 1] - stops[i]) * hold * 0.5;
};

const sceneAt = (p: number): Scene => {
  const { i, t } = segmentAt(p);
  const a = KEYS[i];
  const b = KEYS[Math.min(i + 1, KEYS.length - 1)];
  const k: Key = {
    h: lerp(a.h, b.h, t),
    r: a.r.map((r, n) => lerp(r, b.r[n], t)),
    open: lerp(a.open, b.open, t),
    dry: lerp(a.dry, b.dry, t),
    glaze: lerp(a.glaze, b.glaze, t),
    rings: lerp(a.rings, b.rings, t),
    rpm: lerp(a.rpm, b.rpm, t),
    wall: lerp(a.wall, b.wall, t),
    kg: lerp(a.kg, b.kg, t),
  };
  const throwEnd = SEQUENCE.stops[4];
  return {
    ...k,
    stage: t > 0.5 ? Math.min(i + 1, KEYS.length - 1) : i,
    spin: Math.min(p, throwEnd) * SEQUENCE.spinTurns * Math.PI * 2,
    wheel: 1 - band(p, throwEnd - 0.12, throwEnd - 0.04),
    heat: band(p, 0.6, 0.68) * (1 - band(p, 0.745, 0.8)),
    ghost: 0.7 * (1 - band(p, 0.36, 0.5)),
  };
};

// Seeded grog specks so every frame places them identically.
const SPECKS = (() => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: 90 }, () => ({ u: 0.04 + rnd() * 0.9, a: rnd() * Math.PI * 2, size: 0.6 + rnd() * 1.2 }));
})();

const radiusAt = (r: number[], u: number) => {
  const f = clamp(u) * (r.length - 1);
  const n = Math.min(r.length - 2, Math.floor(f));
  return lerp(r[n], r[n + 1], f - n);
};

const profilePoints = (k: Key, cx: number, by: number, S: number) =>
  k.r.map((r, n) => ({ x: cx + r * S, y: by - (k.h * S * n) / (k.r.length - 1) }));

// Outline: front base arc, up the right wall (Catmull-Rom), across, down the mirrored left wall.
const bodyPath = (ctx: CanvasRenderingContext2D, k: Key, cx: number, by: number, S: number, tilt: number) => {
  const pts = profilePoints(k, cx, by, S);
  const r0 = k.r[0] * S;
  ctx.beginPath();
  ctx.moveTo(cx - r0, by);
  ctx.ellipse(cx, by, r0, r0 * tilt, 0, Math.PI, 0, true);
  const curve = (P: { x: number; y: number }[]) => {
    for (let n = 0; n < P.length - 1; n++) {
      const p0 = P[Math.max(0, n - 1)], p1 = P[n], p2 = P[n + 1], p3 = P[Math.min(P.length - 1, n + 2)];
      ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
  };
  curve(pts);
  const left = pts.map((p) => ({ x: 2 * cx - p.x, y: p.y })).reverse();
  ctx.lineTo(left[0].x, left[0].y);
  curve(left);
  ctx.closePath();
};

const cylinderFill = (ctx: CanvasRenderingContext2D, m: Material, cx: number, R: number) => {
  const g = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  g.addColorStop(0, css(m.dark));
  g.addColorStop(0.22, css(m.mid));
  g.addColorStop(0.36, css(m.light));
  g.addColorStop(0.62, css(m.mid));
  g.addColorStop(1, css(m.dark));
  return g;
};

const drawVessel = (ctx: CanvasRenderingContext2D, w: number, h: number, sc: Scene, opts: DrawOptions = {}) => {
  const tilt = opts.tilt ?? 0.2;
  const guides = opts.guides ?? false;
  const glazeMat = opts.glaze ?? CELADON;
  const mm = opts.mmPerUnit ?? SEQUENCE.mmPerUnit;
  ctx.clearRect(0, 0, w, h);

  const S = Math.min(w * 0.32, h * (guides ? 0.5 : 0.62)) * (opts.scale ?? 1);
  const cx = w / 2;
  const by = h / 2 + S * (guides ? 0.58 : 0.5);
  const R = Math.max(...sc.r) * S;
  const topY = by - sc.h * S;
  const rt = sc.r[sc.r.length - 1] * S;
  const clay = mixMat(WET, BISQUE, sc.dry);

  // Kiln glow behind the pot.
  if (sc.heat > 0.01) {
    const g = ctx.createRadialGradient(cx, by - sc.h * S * 0.5, 0, cx, by - sc.h * S * 0.5, S * 1.6);
    g.addColorStop(0, `rgba(255,120,60,${0.55 * sc.heat})`);
    g.addColorStop(0.5, `rgba(255,90,47,${0.22 * sc.heat})`);
    g.addColorStop(1, 'rgba(255,90,47,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Wheel head (throwing) cross-fading to a kiln shelf (fired).
  const WR = S * 1.02;
  if (sc.wheel > 0.01) {
    ctx.save();
    ctx.globalAlpha = sc.wheel;
    ctx.fillStyle = '#1d211c';
    ctx.beginPath();
    ctx.ellipse(cx, by + 10, WR, WR * tilt, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createLinearGradient(cx - WR, 0, cx + WR, 0);
    g.addColorStop(0, '#2c312a');
    g.addColorStop(0.35, '#5b6157');
    g.addColorStop(1, '#262a24');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, by, WR, WR * tilt, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(235,232,223,0.10)';
    ctx.lineWidth = 1;
    for (let n = 1; n <= 5; n++) {
      ctx.beginPath();
      ctx.ellipse(cx, by, (WR * n) / 5.4, ((WR * n) / 5.4) * tilt, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // A clay smear on the wheel turns with the spin: the visible proof of rotation.
    for (let n = 0; n < 3; n++) {
      const a = sc.spin + n * 2.1;
      if (Math.sin(a) < 0) continue;
      ctx.fillStyle = `rgba(138,96,72,${0.55 * Math.sin(a)})`;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * WR * 0.86, by + Math.sin(a) * WR * 0.86 * tilt, 7, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (sc.wheel < 0.99) {
    ctx.save();
    ctx.globalAlpha = 1 - sc.wheel;
    ctx.fillStyle = guides ? '#3a3d36' : 'rgba(20,23,20,0.14)';
    ctx.beginPath();
    ctx.ellipse(cx, by + 6, S * 0.8, S * 0.8 * tilt, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = guides ? '#575a51' : 'rgba(20,23,20,0.08)';
    ctx.beginPath();
    ctx.ellipse(cx, by, S * 0.8, S * 0.8 * tilt, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Contact shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + 4, by + 2, sc.r[0] * S * 1.15, sc.r[0] * S * tilt * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body.
  ctx.save();
  bodyPath(ctx, sc, cx, by, S, tilt);
  ctx.fillStyle = cylinderFill(ctx, clay, cx, R);
  ctx.fill();
  ctx.clip();

  // Foot shade.
  const fs = ctx.createLinearGradient(0, by, 0, by - sc.h * S * 0.45);
  fs.addColorStop(0, 'rgba(0,0,0,0.38)');
  fs.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fs;
  ctx.fillRect(cx - R, by - sc.h * S, R * 2, sc.h * S + R);

  // Grog specks riding the rotation.
  for (const s of SPECKS) {
    const a = s.a + sc.spin;
    const z = Math.cos(a);
    if (z < 0.05) continue;
    const y = by - sc.h * S * s.u;
    if (sc.glaze > 0 && s.u > 1 - sc.glaze * 0.8) continue;
    const r = radiusAt(sc.r, s.u) * S;
    ctx.fillStyle = css(sc.dry > 0.5 ? [120, 84, 64] : [48, 30, 22], 0.6 * z);
    ctx.fillRect(cx + Math.sin(a) * r * 0.96, y, s.size, s.size);
  }

  // Throwing rings: front halves of horizontal ellipses.
  if (sc.rings > 0.01) {
    const count = 14;
    for (let n = 1; n < count; n++) {
      const u = n / count + Math.sin(n * 3.1) * 0.012;
      const y = by - sc.h * S * u;
      const r = radiusAt(sc.r, u) * S;
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgba(30,18,10,${0.22 * sc.rings})`;
      ctx.beginPath();
      ctx.ellipse(cx, y, r, r * tilt, 0, 0, Math.PI);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,240,225,${0.14 * sc.rings})`;
      ctx.beginPath();
      ctx.ellipse(cx, y + 2, r, r * tilt, 0, 0, Math.PI);
      ctx.stroke();
    }
  }

  // Glaze dip: the glaze line descends from the rim; drips and a pooled edge on the way.
  const glazeU = 1 - sc.glaze * 0.78;
  if (sc.glaze > 0.005) {
    const lineY = (x: number) => by - sc.h * S * glazeU + Math.sin(x * 0.09) * 3 + Math.max(0, Math.sin(x * 0.031 + 1.3)) ** 6 * 16 * sc.glaze;
    ctx.beginPath();
    ctx.moveTo(cx - R - 2, topY - S);
    ctx.lineTo(cx + R + 2, topY - S);
    for (let x = cx + R + 2; x >= cx - R - 2; x -= 3) ctx.lineTo(x, lineY(x));
    ctx.closePath();
    ctx.fillStyle = cylinderFill(ctx, glazeMat, cx, R);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = css(glazeMat.dark, 0.65);
    ctx.beginPath();
    for (let x = cx - R - 2; x <= cx + R + 2; x += 3) ctx.lineTo(x, lineY(x) - 1.5);
    ctx.stroke();
  }

  // Sheen: wet slip or fresh glaze.
  const sheen = Math.max((1 - sc.dry) * 0.28, sc.glaze * 0.5);
  if (sheen > 0.01) {
    const sx = cx - R * 0.42;
    const g = ctx.createLinearGradient(sx - R * 0.12, 0, sx + R * 0.12, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${sheen})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - R * 0.12, topY, R * 0.24, sc.h * S * (sc.glaze > 0 ? 1 - glazeU * 0.15 : 0.9));
  }

  // Firing: the pot itself glows.
  if (sc.heat > 0.01) {
    ctx.fillStyle = `rgba(255,96,40,${0.5 * sc.heat})`;
    ctx.fillRect(cx - R - 2, topY - S, R * 2 + 4, sc.h * S + S * 2);
  }
  ctx.restore();

  // Rim and opening.
  const rimGlaze = clamp(sc.glaze * 6);
  const rimMat = mixMat(clay, glazeMat, rimGlaze);
  ctx.beginPath();
  ctx.ellipse(cx, topY, rt, rt * tilt, 0, 0, Math.PI * 2);
  ctx.fillStyle = cylinderFill(ctx, { dark: rimMat.mid, mid: rimMat.light, light: rimMat.light }, cx, rt);
  ctx.fill();
  if (sc.open > 0.01) {
    const ro = Math.min(sc.open * S, rt - 2);
    const g = ctx.createLinearGradient(0, topY - ro * tilt, 0, topY + ro * tilt);
    g.addColorStop(0, css(rimMat.dark, 1));
    g.addColorStop(1, 'rgba(12,8,6,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, topY + 1, ro, ro * tilt, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (sc.heat > 0.01) {
    ctx.fillStyle = `rgba(255,110,50,${0.45 * sc.heat})`;
    ctx.beginPath();
    ctx.ellipse(cx, topY, rt, rt * tilt, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!guides) return;

  // Ghost of the finished jar: the target the lump is thrown toward.
  if (sc.ghost > 0.01) {
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(215,255,63,${sc.ghost})`;
    bodyPath(ctx, KEYS[3], cx, by, S, tilt);
    ctx.stroke();
    ctx.restore();
  }

  // Dimension lines.
  ctx.save();
  ctx.strokeStyle = 'rgba(215,255,63,0.85)';
  ctx.fillStyle = 'rgba(215,255,63,0.95)';
  ctx.lineWidth = 1;
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
  const dx = cx + Math.max(R, S * 0.5) + 30;
  const tick = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  tick(dx, topY, dx, by);
  tick(dx - 5, topY, dx + 5, topY);
  tick(dx - 5, by, dx + 5, by);
  ctx.globalAlpha = 0.35;
  ctx.setLineDash([2, 4]);
  tick(cx + rt + 4, topY, dx - 6, topY);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillText(`H ${Math.round(sc.h * mm)} mm`, dx + 10, (topY + by) / 2 + 4);

  ctx.globalAlpha = clamp(sc.open / 0.12); // no rim to measure until the clay is opened
  const wy = topY - rt * tilt - 22;
  tick(cx - rt, wy, cx + rt, wy);
  tick(cx - rt, wy - 4, cx - rt, wy + 4);
  tick(cx + rt, wy - 4, cx + rt, wy + 4);
  const label = `Ø ${Math.round(2 * sc.r[sc.r.length - 1] * mm)} mm`;
  ctx.fillText(label, cx - ctx.measureText(label).width / 2, wy - 9);
  ctx.restore();
};

export type { Key, Material, Scene };
export { BISQUE, CELADON, KEYS, SEQUENCE, clamp, drawVessel, progressFor, sceneAt, segmentAt };
