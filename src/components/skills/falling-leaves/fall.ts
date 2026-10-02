// Maple fall for one section: two canvases (behind / in front of the type), three depth layers,
// procedural two-faced sprites, tumble-coupled slip, area-scaled density, reduced-motion still.

type Layer = 'far' | 'mid' | 'near';
type Sprite = { face: HTMLCanvasElement; back: HTMLCanvasElement };
type Leaf = {
  layer: Layer; x: number; y: number; size: number; fall: number;
  spin: number; spinRate: number; roll: number; rollRate: number;
  slip: number; alpha: number; sprite: Sprite; drift: number;
};
type Opts = { count: number; wind: number; tumble: number };

const TAU = Math.PI * 2;
const SPRITE = 160; // baked once at the largest size drawn
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// deep oxblood → vermilion → dry amber
const RAMP = ['#5a0d0a', '#7d150e', '#a3240f', '#c23a19', '#d2601f', '#c9822c', '#d9a443'];

const LAYERS: Record<Layer, { share: number; scale: [number, number]; fall: [number, number]; alpha: [number, number]; blur: number }> = {
  far: { share: 0.5, scale: [0.3, 0.5], fall: [26, 44], alpha: [0.22, 0.4], blur: 0.6 },
  mid: { share: 0.46, scale: [0.5, 0.85], fall: [46, 78], alpha: [0.46, 0.78], blur: 0 },
  near: { share: 0.04, scale: [1.05, 1.9], fall: [92, 140], alpha: [0.5, 0.82], blur: 2.4 },
};

// Right half of a maple outline, tip to stem, in a [-1, 1] box (y down). Mirrored for the left.
const HALF: [number, number][] = [
  [0, -1], [0.1, -0.74], [0.24, -0.82], [0.2, -0.46], [0.42, -0.56], [0.5, -0.74], [0.6, -0.5],
  [0.94, -0.56], [0.8, -0.32], [0.9, -0.2], [0.6, -0.04], [0.68, 0.1], [0.4, 0.1], [0.46, 0.3],
  [0.22, 0.26], [0.06, 0.44], [0.025, 0.46], [0.03, 0.96], [0, 0.98],
];
const OUTLINE = [...HALF, ...HALF.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])];
const VEINS: [number, number][] = [[0, -0.92], [0.86, -0.5], [-0.86, -0.5], [0.6, 0.06], [-0.6, 0.06]];

function mix(hex: string, to: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

function bake(color: string, back: boolean, blur: number) {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const g = c.getContext('2d')!;
  const s = SPRITE * 0.44;
  g.translate(SPRITE / 2, SPRITE / 2);
  if (blur) g.filter = `blur(${blur}px)`;
  g.beginPath();
  OUTLINE.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)));
  g.closePath();
  // The back is duller and paler: mixed toward a dry grey-beige.
  const base = back ? mix(color, '#b9a993', 0.42) : color;
  const grad = g.createLinearGradient(-s, -s, s, s);
  grad.addColorStop(0, back ? mix(color, '#cfc2ae', 0.5) : mix(color, '#f0b060', 0.18));
  grad.addColorStop(1, base);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = back ? 'rgba(255,245,230,.35)' : 'rgba(30,6,2,.28)';
  g.lineWidth = SPRITE / 110;
  g.beginPath();
  for (const [x, y] of VEINS) { g.moveTo(0, 0.36 * s); g.lineTo(x * s * 0.88, y * s * 0.88); }
  g.stroke();
  return c;
}

export function mountFall(root: HTMLElement, back: HTMLCanvasElement, front: HTMLCanvasElement, onBuilt: (msg: string) => void) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const spritesFor = (blur: number) => RAMP.map((c) => ({ face: bake(c, false, blur), back: bake(c, true, blur) }));
  const sprites: Record<Layer, Sprite[]> = { far: spritesFor(LAYERS.far.blur), mid: spritesFor(0), near: spritesFor(LAYERS.near.blur) };
  const ctxB = back.getContext('2d')!;
  const ctxF = front.getContext('2d')!;
  const opts: Opts = { count: 150, wind: 12, tumble: 100 };
  let W = 0, H = 0, dpr = 1, k = 1, gust = 0;
  let leaves: Leaf[] = [];
  let raf = 0, last = 0, visible = true;

  function spawn(layer: Layer, anywhere: boolean): Leaf {
    const L = LAYERS[layer];
    const scale = rand(...L.scale);
    const set = sprites[layer];
    return {
      layer,
      x: rand(-40, W + 40),
      y: anywhere ? rand(-40, H) : rand(-140, -40),
      size: scale * 62 * clamp(k, 0.75, 1.15),
      fall: rand(...L.fall) * (0.7 + scale * 0.4),
      spin: rand(0, TAU),
      spinRate: rand(1.4, 3.6) * (Math.random() < 0.5 ? -1 : 1),
      roll: rand(0, TAU),
      rollRate: rand(-0.9, 0.9),
      slip: rand(14, 46) * (0.6 + scale * 0.5),
      alpha: rand(...L.alpha),
      sprite: set[Math.floor(Math.random() * set.length)],
      drift: rand(0.6, 1.3), // per-leaf response to wind
    };
  }

  function build() {
    if (!W || !H) return; // guard: no layout yet → do not stack the field at the origin
    k = clamp(Math.sqrt((W * H) / (1440 * 900)), 0.5, 1.3);
    const n = (l: Layer) => Math.max(l === 'near' ? 2 : 1, Math.round(opts.count * LAYERS[l].share * k));
    const counts = { far: n('far'), mid: n('mid'), near: Math.min(n('near'), 6) };
    leaves = (['far', 'mid', 'near'] as Layer[]).flatMap((l) => Array.from({ length: counts[l] }, () => spawn(l, true)));
    onBuilt(`${leaves.length} leaves built · far ${counts.far} · mid ${counts.mid} · near ${counts.near}`);
  }

  function step(l: Leaf, dt: number) {
    const t = opts.tumble / 100;
    l.spin += l.spinRate * t * dt;
    l.roll += l.rollRate * t * dt;
    // Slip is driven by the tumble: fastest edge-on (cos ≈ 0), stalled when face-flat.
    l.x += (Math.sin(l.spin) * l.slip + (opts.wind + gust) * l.drift * (l.size / 40)) * dt;
    l.y += l.fall * (1 - 0.35 * Math.abs(Math.cos(l.spin))) * dt;
    if (l.y > H + 60) Object.assign(l, spawn(l.layer, false));
    if (l.x > W + 60) l.x -= W + 120;
    else if (l.x < -60) l.x += W + 120;
  }

  function draw(ctx: CanvasRenderingContext2D, l: Leaf) {
    const c = Math.cos(l.spin);
    const img = c < 0 ? l.sprite.back : l.sprite.face;
    const s = l.size * (SPRITE / (SPRITE * 0.88));
    ctx.setTransform(dpr, 0, 0, dpr, l.x * dpr, l.y * dpr);
    ctx.rotate(l.roll);
    ctx.scale(c, 1); // the tumble: crosses zero, edge-on
    ctx.globalAlpha = l.alpha;
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
  }

  function render() {
    ctxB.setTransform(1, 0, 0, 1, 0, 0);
    ctxB.clearRect(0, 0, back.width, back.height);
    ctxF.setTransform(1, 0, 0, 1, 0, 0);
    ctxF.clearRect(0, 0, front.width, front.height);
    for (const l of leaves) draw(l.layer === 'near' ? ctxF : ctxB, l);
  }

  function frame(now: number) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    gust *= Math.pow(0.35, dt);
    for (const l of leaves) step(l, dt);
    render();
    loop();
  }

  function loop() {
    if (raf || reduced.matches || !visible || document.hidden || !leaves.length) return;
    last = performance.now(); // reset on resume so the pause is not integrated
    raf = requestAnimationFrame((t) => { last = t - 16; frame(t); });
  }

  function stop() { cancelAnimationFrame(raf); raf = 0; }

  function still() {
    // A composed still under reduced motion: same field, a few seconds of settled tumble.
    for (const l of leaves) l.spin = l.spin % TAU;
    render();
  }

  function refresh() {
    stop();
    if (reduced.matches) { still(); } else { render(); loop(); }
  }

  new ResizeObserver(([e]) => {
    const r = e.contentRect;
    if (!r.width || !r.height) return;
    const changed = Math.abs(r.width - W) > 1 || Math.abs(r.height - H) > 80 || !leaves.length;
    W = r.width; H = r.height;
    dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [back, front]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    if (changed) build();
    refresh();
  }).observe(root);

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? loop() : stop(); }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : loop()));
  reduced.addEventListener('change', refresh);

  return {
    set(next: Partial<Opts>) {
      const rebuild = next.count !== undefined && next.count !== opts.count;
      Object.assign(opts, next);
      if (rebuild) build();
      if (reduced.matches) still();
    },
    gust() {
      gust += 140;
      if (reduced.matches) { for (const l of leaves) l.x = ((l.x + 60 * l.drift) % (W + 120)) ; still(); }
    },
  };
}
