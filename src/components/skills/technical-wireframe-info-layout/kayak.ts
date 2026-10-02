// Exploded wireframe sea kayak (Fulmar 17) + projected label connectors.
// Five layers (L0 skeg … L4 hatches) drawn as outlined line geometry only, separated vertically by `explode`.
import * as THREE from 'three';

type Focus = 'all' | 'hull' | 'deck' | 'outfit';
type Seg = number[]; // flat xyz pairs for LineSegments

const HALF = 2.6; // half length, world units (5.2 ≈ 5.18 m)
const OFFSETS = [-1.4, -0.72, 0, 0.72, 1.42]; // L0..L4 exploded y
const FOCUS_LAYERS: Record<Focus, number[]> = {
  all: [0, 1, 2, 3, 4],
  hull: [0, 1],
  deck: [3, 4],
  outfit: [2],
};

// ---- hull form -------------------------------------------------------------
const beam = (u: number) => 0.3 * Math.pow(Math.max(0, 1 - u * u), 0.62);
const sheer = (u: number) => 0.03 * u * u + 0.09 * Math.pow(Math.max(u, 0), 3) + 0.05 * Math.pow(Math.max(-u, 0), 3);
const keel = (u: number) => -0.2 + 0.15 * Math.pow(Math.abs(u), 3.2);
const deckH = (u: number) => 0.12 * Math.pow(Math.max(0, 1 - u * u), 0.45) * (1 + 0.3 * Math.exp(-(((u - 0.22) / 0.2) ** 2)));
const hullPt = (u: number, t: number): THREE.Vector3 =>
  new THREE.Vector3(u * HALF, sheer(u) + (keel(u) - sheer(u)) * Math.pow(Math.sin(t), 0.55), beam(u) * Math.cos(t));
const deckPt = (u: number, t: number): THREE.Vector3 =>
  new THREE.Vector3(u * HALF, sheer(u) + deckH(u) * Math.pow(Math.sin(t), 0.9), beam(u) * Math.cos(t));

const CP = { x: -0.2, rx: 0.44, rz: 0.21 }; // cockpit opening
const inCockpit = (p: THREE.Vector3) => ((p.x - CP.x) / CP.rx) ** 2 + (p.z / CP.rz) ** 2 < 1;

const push = (s: Seg, a: THREE.Vector3, b: THREE.Vector3) => s.push(a.x, a.y, a.z, b.x, b.y, b.z);
const polyline = (s: Seg, pts: THREE.Vector3[], skip?: (p: THREE.Vector3) => boolean) => {
  for (let i = 1; i < pts.length; i++) {
    if (skip && (skip(pts[i - 1]) || skip(pts[i]))) continue;
    push(s, pts[i - 1], pts[i]);
  }
};
const range = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const ellipse = (cx: number, y: number, cz: number, rx: number, rz: number, n = 48) =>
  range(n + 1, 0, Math.PI * 2).map((a) => new THREE.Vector3(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz));
const deckTop = (u: number) => sheer(u) + deckH(u);

// ---- layers: [bright, dim, dashed] segment buckets -------------------------
const buildLayers = (): Seg[][] => {
  const L: Seg[][] = Array.from({ length: 5 }, () => [[], [], []]);
  const stations = range(27, -0.97, 0.97);
  const ts = range(25, 0, Math.PI);

  // L1 hull shell: stations dim, stringers dim, sheer + keel bright, stems
  for (const u of stations) polyline(L[1][1], ts.map((t) => hullPt(u, t)));
  const us = range(80, -1, 1);
  for (const t of [0.35, 0.75, 1.15, 1.99, 2.39, 2.79]) polyline(L[1][1], us.map((u) => hullPt(u, t)));
  for (const t of [0, Math.PI / 2, Math.PI]) polyline(L[1][0], us.map((u) => hullPt(u, t)));

  // L3 deck shell: stations broken around the cockpit, sheer bright, bungees dashed
  for (const u of stations) polyline(L[3][1], ts.map((t) => deckPt(u, t)), inCockpit);
  for (const t of [0.5, 1.0, 2.14, 2.64]) polyline(L[3][1], us.map((u) => deckPt(u, t)), inCockpit);
  polyline(L[3][1], us.map((u) => deckPt(u, Math.PI / 2)), inCockpit);
  for (const t of [0, Math.PI]) polyline(L[3][0], us.map((u) => deckPt(u, t)));
  polyline(L[3][0], ellipse(CP.x, deckTop(CP.x / HALF) - 0.02, 0, CP.rx, CP.rz).map((p) => {
    const u = p.x / HALF;
    return new THREE.Vector3(p.x, sheer(u) + deckH(u) * Math.pow(Math.max(0, 1 - (p.z / beam(u)) ** 2), 0.45), p.z);
  }));
  for (const [a, b] of [[0.42, 0.56], [0.56, 0.7], [-0.52, -0.66], [-0.66, -0.8]]) {
    push(L[3][2], deckPt(a, 0.55), deckPt(b, Math.PI - 0.55));
    push(L[3][2], deckPt(a, Math.PI - 0.55), deckPt(b, 0.55));
  }

  // L4 hatches + coaming rings (lifted a hair off the deck)
  const ring = (u: number, rx: number, rz: number, b: Seg) =>
    polyline(b, ellipse(u * HALF, deckTop(u) + 0.03, 0, rx, rz));
  ring(0.6, 0.22, 0.13, L[4][0]);
  ring(0.6, 0.18, 0.1, L[4][1]);
  ring(-0.62, 0.26, 0.15, L[4][0]);
  ring(-0.62, 0.21, 0.12, L[4][1]);
  ring(-0.36, 0.1, 0.1, L[4][0]);
  ring(0.3, 0.055, 0.055, L[4][1]);
  polyline(L[4][0], ellipse(CP.x, deckTop(CP.x / HALF) + 0.05, 0, CP.rx + 0.05, CP.rz + 0.05));
  polyline(L[4][1], ellipse(CP.x, deckTop(CP.x / HALF) + 0.02, 0, CP.rx, CP.rz));

  // L2 bulkheads, seat, backband, footpeg rails
  for (const u of [0.36, -0.27, -0.46]) {
    const loop = [...ts.map((t) => hullPt(u, t)), ...ts.slice().reverse().map((t) => deckPt(u, t))];
    polyline(L[2][0], loop);
    polyline(L[2][2], [hullPt(u, Math.PI / 2), deckPt(u, Math.PI / 2)]);
  }
  const seatY = keel(CP.x / HALF) + 0.05;
  polyline(L[2][0], ellipse(CP.x - 0.05, seatY, 0, 0.2, 0.13));
  polyline(L[2][1], ellipse(CP.x - 0.05, seatY, 0, 0.13, 0.08));
  const back = range(20, -1.1, 1.1).map((a) => new THREE.Vector3(CP.x - 0.24 - Math.cos(a) * 0.05, seatY + 0.1, Math.sin(a) * 0.15));
  polyline(L[2][0], back);
  polyline(L[2][1], back.map((p) => p.clone().setY(seatY + 0.04)));
  for (const z of [-0.15, 0.15]) {
    const y = keel(0.12) + 0.09;
    push(L[2][0], new THREE.Vector3(0.18, y, z), new THREE.Vector3(0.62, y, z));
    for (const x of range(8, 0.2, 0.6)) push(L[2][1], new THREE.Vector3(x, y - 0.02, z), new THREE.Vector3(x, y + 0.02, z));
  }

  // L0 skeg box, skeg blade, rudder, control cable
  const ky = (u: number) => keel(u);
  const box = [-0.72, -0.5].map((u) => u * HALF);
  polyline(L[0][0], [
    new THREE.Vector3(box[0], ky(-0.72), 0), new THREE.Vector3(box[0], ky(-0.72) + 0.1, 0),
    new THREE.Vector3(box[1], ky(-0.5) + 0.1, 0), new THREE.Vector3(box[1], ky(-0.5), 0), new THREE.Vector3(box[0], ky(-0.72), 0),
  ]);
  polyline(L[0][1], [
    new THREE.Vector3(box[0] + 0.05, ky(-0.72), 0), new THREE.Vector3(box[0] + 0.12, ky(-0.72) - 0.26, 0),
    new THREE.Vector3(box[1] - 0.18, ky(-0.5) - 0.2, 0), new THREE.Vector3(box[1] - 0.04, ky(-0.5), 0),
  ]);
  const sx = -HALF + 0.02, sy = ky(-1);
  polyline(L[0][0], [
    new THREE.Vector3(sx, sy + 0.08, 0), new THREE.Vector3(sx - 0.18, sy - 0.04, 0),
    new THREE.Vector3(sx - 0.14, sy - 0.32, 0), new THREE.Vector3(sx + 0.04, sy - 0.26, 0), new THREE.Vector3(sx, sy + 0.08, 0),
  ]);
  for (const z of [-0.12, 0.12]) polyline(L[0][2], [new THREE.Vector3(sx, sy + 0.05, z), new THREE.Vector3(box[1], ky(-0.5) + 0.06, z), new THREE.Vector3(0.4, keel(0.15) + 0.06, z)]);
  return L;
};

// Label anchors in layer-local coordinates.
const ANCHORS: Record<string, [number, THREE.Vector3]> = {
  hatch: [4, new THREE.Vector3(0.6 * HALF + 0.22, deckTop(0.6) + 0.03, 0)],
  coaming: [4, new THREE.Vector3(CP.x - CP.rx - 0.05, deckTop(CP.x / HALF) + 0.05, 0)],
  deck: [3, deckPt(0.48, Math.PI / 2)],
  bulkhead: [2, deckPt(-0.46, Math.PI / 2)],
  footpeg: [2, new THREE.Vector3(0.62, keel(0.12) + 0.09, 0.15)],
  hull: [1, hullPt(0.42, Math.PI / 2)],
  skeg: [0, new THREE.Vector3(-0.6 * HALF - 0.2, keel(-0.62) - 0.22, 0)],
};

type Opts = {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  svg: SVGSVGElement;
  labels: HTMLElement[];
  reduced: boolean;
  still: boolean; // ?shot: fixed pose
};

const mount = ({ canvas, stage, svg, labels, reduced, still }: Opts) => {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const root = new THREE.Group();
  scene.add(root);

  const layers = buildLayers().map((buckets, i) => {
    const g = new THREE.Group();
    const mats = buckets.map((seg, k) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      const base = [0.92, 0.3, 0.55][k];
      const mat = k === 2
        ? new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: base, dashSize: 0.04, gapSize: 0.04 })
        : new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: base });
      const line = new THREE.LineSegments(geo, mat);
      if (k === 2) line.computeLineDistances();
      g.add(line);
      return { mat, base };
    });
    root.add(g);
    return { g, mats, i, dim: 1, dimTarget: 1 };
  });

  // Vertical datum lines (bow, cockpit, stern) spanning the stack, rebuilt as explode changes.
  const datumGeo = new THREE.BufferGeometry();
  const datum = new THREE.LineSegments(datumGeo, new THREE.LineDashedMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, dashSize: 0.05, gapSize: 0.06 }));
  root.add(datum);
  const datumXs: [number, number, number][] = [[HALF * 0.97, sheer(0.97) + 0.04, 0], [CP.x, 0, 0], [-HALF * 0.97, sheer(-0.97) + 0.02, 0]];

  let explode = 1, explodeTarget = 1, focus: Focus = 'all';
  let spread = 1, w = 1, h = 1, yawBase = -0.42, t0 = performance.now(), running = false, visible = true;
  const tmp = new THREE.Vector3();

  const applyExplode = () => {
    layers.forEach((l) => (l.g.position.y = OFFSETS[l.i] * explode * spread));
    const top = OFFSETS[4] * explode * spread + 0.35, bottom = OFFSETS[0] * explode * spread - 0.45;
    const pts: number[] = [];
    for (const [x, , z] of datumXs) pts.push(x, top, z, x, bottom, z);
    datumGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    datum.computeLineDistances();
  };

  const resize = () => {
    w = stage.clientWidth; h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const narrow = w / h < 0.95;
    yawBase = narrow ? -0.62 : -0.42;
    spread = narrow ? 1.25 : 1;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = narrow ? 2.5 : w < 900 ? 3.5 : 3.9;
    const d = Math.max(halfW / (tan * camera.aspect), 2.05 / tan);
    const dir = new THREE.Vector3(0, 0.95, 1).normalize();
    camera.position.copy(dir.multiplyScalar(d));
    camera.lookAt(0, -0.02, 0);
    camera.updateProjectionMatrix();
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  };

  // Connector paths + anchor nodes, recomputed from the projected anchors each frame.
  const paths = labels.map((el) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    p.setAttribute('class', 'conn');
    ring.setAttribute('class', 'node-ring'); ring.setAttribute('r', '5');
    dot.setAttribute('class', 'node-dot'); dot.setAttribute('r', '1.8');
    svg.append(p, ring, dot);
    return { el, p, ring, dot, key: el.dataset.anchor ?? '', side: el.dataset.side ?? 'l', dy: Number(el.dataset.dy ?? 0) };
  });

  const layout = () => {
    const sr = stage.getBoundingClientRect();
    const live: { c: (typeof paths)[number]; ax: number; ay: number; lh: number; ly: number; layer: number }[] = [];
    for (const c of paths) {
      const a = ANCHORS[c.key];
      if (!a || c.el.offsetParent === null) { c.p.setAttribute('d', ''); c.ring.setAttribute('r', '0'); c.dot.setAttribute('r', '0'); continue; }
      tmp.copy(a[1]).applyMatrix4(layers[a[0]].g.matrixWorld).project(camera);
      const ax = ((tmp.x + 1) / 2) * w, ay = ((1 - tmp.y) / 2) * h;
      const lh = c.el.offsetHeight;
      live.push({ c, ax, ay, lh, ly: ay - lh / 2 + c.dy, layer: a[0] });
    }
    // ponytail: one-pass push-down per side, enough for ≤4 tags a side
    for (const side of ['l', 'r']) {
      let floor = 8;
      for (const t of live.filter((x) => x.c.side === side).sort((a, b) => a.ly - b.ly)) {
        t.ly = Math.min(h - t.lh - 8, Math.max(floor, t.ly));
        floor = t.ly + t.lh + 10;
      }
    }
    for (const { c, ax, ay, lh, ly, layer } of live) {
      c.el.style.transform = `translateY(${ly.toFixed(1)}px)`;
      const r = c.el.getBoundingClientRect();
      const ex = c.side === 'l' ? r.right - sr.left : r.left - sr.left;
      const ey = ly + lh / 2;
      const k = (ax - ex) * 0.5;
      c.p.setAttribute('d', `M${ex.toFixed(1)} ${ey.toFixed(1)} C${(ex + k).toFixed(1)} ${ey.toFixed(1)} ${(ax - k).toFixed(1)} ${ay.toFixed(1)} ${ax.toFixed(1)} ${ay.toFixed(1)}`);
      for (const n of [c.ring, c.dot]) { n.setAttribute('cx', ax.toFixed(1)); n.setAttribute('cy', ay.toFixed(1)); }
      c.ring.setAttribute('r', '5'); c.dot.setAttribute('r', '1.8');
      const on = FOCUS_LAYERS[focus].includes(layer);
      c.el.classList.toggle('is-dim', !on);
      c.p.classList.toggle('is-dim', !on);
      c.ring.classList.toggle('is-dim', !on);
    }
  };

  const frame = (now: number) => {
    const moving = !reduced && !still;
    const t = (now - t0) / 1000;
    root.rotation.y = yawBase + (moving ? Math.sin(t * 0.11) * 0.16 : 0.06);
    root.position.y = moving ? Math.sin(t * 0.37) * 0.025 : 0;
    const k = reduced ? 1 : 0.07;
    explode += (explodeTarget - explode) * k;
    applyExplode();
    let settling = Math.abs(explodeTarget - explode) > 0.001;
    for (const l of layers) {
      l.dim += (l.dimTarget - l.dim) * (reduced ? 1 : 0.1);
      if (Math.abs(l.dimTarget - l.dim) > 0.002) settling = true;
      l.mats.forEach(({ mat, base }) => (mat.opacity = base * l.dim));
    }
    scene.updateMatrixWorld();
    renderer.render(scene, camera);
    layout();
    return moving || settling;
  };

  const loop = (now: number) => {
    const again = frame(now);
    if (again && visible && !document.hidden) requestAnimationFrame(loop);
    else running = false;
  };
  const kick = () => {
    if (running) return;
    running = true;
    requestAnimationFrame(loop);
  };

  new ResizeObserver(() => { resize(); kick(); frame(performance.now()); }).observe(stage);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) kick(); }).observe(stage);
  document.addEventListener('visibilitychange', () => !document.hidden && kick());
  resize();
  applyExplode();
  kick();
  document.fonts?.ready.then(() => frame(performance.now())); // label heights change once fonts land

  return {
    setExplode(on: boolean) { explodeTarget = on ? 1 : 0.06; kick(); },
    setFocus(f: Focus) {
      focus = f;
      layers.forEach((l) => (l.dimTarget = FOCUS_LAYERS[f].includes(l.i) ? 1 : 0.2));
      kick();
    },
  };
};

export type { Focus };
export { mount };
