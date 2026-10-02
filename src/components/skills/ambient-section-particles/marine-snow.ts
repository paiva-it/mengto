// Marine snow: one bounded canvas layer per section, one rAF loop per layer,
// paused off-screen / in hidden tabs, static under reduced motion.

type Range = [number, number];
type Mode = 'recycle' | 'settle';

interface SnowConfig {
  areaPerParticle: number; // px² of section per particle — density scales with area
  min: number;
  max: number;
  maxMobile: number;
  gravity: number; // px/s added to every particle's sink rate
  wind: number; // px/s lateral current
  sway: number; // px of phase-based drift
  speed: Range; // px/s sink rate
  size: Range; // px lobe radius
  opacity: Range;
  rotation: Range; // rad/s
  glowChance: number; // share of bioluminescent particles
  mode: Mode;
  pointerRadius: number;
  maxDpr: number;
  settleCap: number; // px, strict pile height cap in settle mode
}

interface Lobe {
  dx: number;
  dy: number;
  r: number;
}

interface Particle {
  x: number;
  y: number;
  z: number; // depth 0 (far) … 1 (near)
  vx: number; // disturbance velocity, decays back to zero
  vy: number;
  sink: number;
  alpha: number;
  phase: number;
  swayAmp: number;
  rot: number;
  rotV: number;
  glow: boolean;
  lobes: Lobe[];
  size: number;
}

const DEFAULTS: SnowConfig = {
  areaPerParticle: 5000,
  min: 40,
  max: 280,
  maxMobile: 90,
  gravity: 7,
  wind: -3,
  sway: 16,
  speed: [8, 18],
  size: [1.2, 4.2],
  opacity: [0.18, 0.72],
  rotation: [-0.8, 0.8],
  glowChance: 0.045,
  mode: 'recycle',
  pointerRadius: 110,
  maxDpr: 2,
  settleCap: 36,
};

const COL = 6; // settle column width, px

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const sprite = (rgb: string) => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.35, `rgba(${rgb},0.75)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
};

const createSnowLayer = (section: HTMLElement, canvas: HTMLCanvasElement, overrides: Partial<SnowConfig> = {}) => {
  const cfg: SnowConfig = { ...DEFAULTS, ...overrides };
  const ctx = canvas.getContext('2d')!;
  const snow = sprite('226, 238, 232');
  const glowSprite = sprite('143, 245, 208');
  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const lowPower = (navigator.hardwareConcurrency ?? 8) <= 4;

  let rand = Math.random;
  const lerp = ([a, b]: Range) => a + (b - a) * rand();

  let w = 0;
  let h = 0;
  let dpr = 1;
  let particles: Particle[] = [];
  let quiet: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let pile = new Float32Array(0);
  let base = new Float32Array(0);
  let raf = 0;
  let last = 0;
  let t = 0;
  let visible = false;
  let gust = 0;
  let settled = 0;
  const pointer = { x: 0, y: 0, active: false };
  const listeners: Array<(n: number) => void> = [];

  const make = (seedY: boolean): Particle => {
    const z = rand() ** 1.4;
    const size = lerp(cfg.size) * (0.55 + z * 0.9);
    const n = rand() < 0.55 ? 1 : 2 + Math.floor(rand() * 3); // single flake or ragged aggregate
    const lobes: Lobe[] = [{ dx: 0, dy: 0, r: size }];
    for (let i = 1; i < n; i++) {
      lobes.push({ dx: (rand() - 0.5) * size * 3.2, dy: (rand() - 0.5) * size * 1.4, r: size * (0.4 + rand() * 0.5) });
    }
    return {
      x: rand() * w,
      y: seedY ? rand() * h : -20 - rand() * 60,
      z,
      vx: 0,
      vy: 0,
      sink: lerp(cfg.speed) * (0.5 + z * 0.8),
      alpha: lerp(cfg.opacity) * (0.45 + z * 0.55),
      phase: rand() * Math.PI * 2,
      swayAmp: cfg.sway * (0.3 + rand() * 0.7),
      rot: rand() * Math.PI * 2,
      rotV: lerp(cfg.rotation) * 0.4,
      glow: rand() < cfg.glowChance,
      lobes,
      size,
    };
  };

  const targetCount = () => {
    const raw = Math.round((w * h) / cfg.areaPerParticle);
    const cap = w < 640 ? cfg.maxMobile : cfg.max;
    return Math.max(cfg.min, Math.min(cap, Math.round(raw * (lowPower ? 0.6 : 1))));
  };

  const measureQuiet = () => {
    const zone = section.querySelector<HTMLElement>('[data-quiet]');
    if (!zone) {
      quiet = null;
      return;
    }
    const c = canvas.getBoundingClientRect();
    const r = zone.getBoundingClientRect();
    quiet = { x0: r.left - c.left - 24, y0: r.top - c.top - 24, x1: r.right - c.left + 24, y1: r.bottom - c.top + 24 };
  };

  // Lower opacity behind long text: 0.22 inside the zone, back to 1 over 70 px.
  const quietMul = (x: number, y: number) => {
    if (!quiet) return 1;
    const dx = Math.max(quiet.x0 - x, 0, x - quiet.x1);
    const dy = Math.max(quiet.y0 - y, 0, y - quiet.y1);
    const d = Math.hypot(dx, dy);
    const floor = w < 640 ? 0.42 : 0.22; // copy spans the full width on phones, so mute less
    return d >= 70 ? 1 : floor + (1 - floor) * (d / 70);
  };

  const buildPile = () => {
    const cols = Math.ceil(w / COL) + 1;
    const old = pile;
    pile = new Float32Array(cols);
    base = new Float32Array(cols);
    for (let i = 0; i < cols; i++) {
      const x = i * COL;
      base[i] = 16 + 6 * Math.sin(x / 140) + 3 * Math.sin(x / 47 + 1.3) + 2 * Math.sin(x / 19);
      pile[i] = Math.max(base[i], old[i] ?? 0);
    }
  };

  const resize = () => {
    const r = section.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    dpr = Math.min(devicePixelRatio || 1, cfg.maxDpr);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    measureQuiet();
    if (cfg.mode === 'settle') buildPile();
    if (reduceMq.matches) {
      drawStatic();
      return;
    }
    rand = Math.random;
    const n = targetCount();
    // Keep the running simulation; only add or trim to the new density.
    for (const p of particles) {
      if (p.x > w) p.x = rand() * w;
      if (p.y > h) p.y = rand() * h;
    }
    while (particles.length < n) particles.push(make(true));
    particles.length = n;
    if (!raf) draw();
  };

  const floorAt = (x: number) => {
    const i = Math.max(0, Math.min(pile.length - 1, Math.round(x / COL)));
    return h - pile[i];
  };

  const deposit = (x: number, amount: number) => {
    const i = Math.round(x / COL);
    for (let k = -2; k <= 2; k++) {
      const j = i + k;
      if (j < 0 || j >= pile.length) continue;
      pile[j] = Math.min(cfg.settleCap, pile[j] + amount * (k === 0 ? 1 : k * k === 1 ? 0.55 : 0.2));
    }
    settled++;
  };

  const step = (dt: number) => {
    t += dt;
    gust *= Math.exp(-dt * 0.85);
    const decay = Math.exp(-dt * 2.4);
    const R = cfg.pointerRadius;
    for (const p of particles) {
      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = (1 - d / R) ** 2 * 140 * dt * (0.4 + p.z);
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }
      p.vx *= decay;
      p.vy *= decay;
      const depth = 0.45 + p.z * 0.75;
      // Thruster pulse: lateral wash plus a little lift, stronger for near particles.
      p.x += (cfg.wind - gust * 120 + p.vx) * dt * depth;
      p.y += ((p.sink + cfg.gravity) * (1 - gust * 0.85) - gust * 18 + p.vy) * dt;
      p.rot += p.rotV * dt;

      if (cfg.mode === 'settle' && p.y >= floorAt(p.x)) {
        deposit(p.x, p.size * 0.7 * (0.6 + p.lobes.length * 0.25));
        Object.assign(p, make(false));
        continue;
      }
      if (p.y > h + 30) Object.assign(p, make(false));
      else if (p.x < -40) p.x += w + 80;
      else if (p.x > w + 40) p.x -= w + 80;
    }
    if (cfg.mode === 'settle') {
      // Slow compaction keeps the bed alive without ever exceeding the cap.
      for (let i = 0; i < pile.length; i++) pile[i] = Math.max(base[i], pile[i] - dt * 0.12);
    }
  };

  const drawParticle = (p: Particle, x: number, y: number) => {
    const pulse = p.glow ? 0.55 + 0.45 * Math.sin(t * 0.9 + p.phase) : 1;
    ctx.globalAlpha = Math.min(1, p.alpha * quietMul(x, y) * pulse * (p.glow ? 1.4 : 1));
    const img = p.glow ? glowSprite : snow;
    const cos = Math.cos(p.rot);
    const sin = Math.sin(p.rot);
    for (const l of p.lobes) {
      const r = l.r * (p.glow ? 2.6 : 2.2);
      ctx.drawImage(img, x + l.dx * cos - l.dy * sin - r, y + l.dx * sin + l.dy * cos - r, r * 2, r * 2);
    }
  };

  const drawPile = () => {
    const grad = ctx.createLinearGradient(0, h - cfg.settleCap, 0, h);
    grad.addColorStop(0, 'rgba(201, 180, 138, 0.7)');
    grad.addColorStop(1, 'rgba(92, 80, 58, 0.6)');
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < pile.length; i++) ctx.lineTo(i * COL, h - pile[i]);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < pile.length; i++) ctx.lineTo(i * COL, h - pile[i]);
    ctx.strokeStyle = 'rgba(236, 224, 196, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      drawParticle(p, p.x + Math.sin(t * 0.55 + p.phase) * p.swayAmp, p.y);
    }
    if (cfg.mode === 'settle') drawPile();
    ctx.globalAlpha = 1;
  };

  // Reduced motion: one sparse, deterministic still. No loop.
  function drawStatic() {
    rand = mulberry32(14);
    particles = [];
    const n = Math.round(targetCount() * 0.4);
    for (let i = 0; i < n; i++) particles.push(make(true));
    if (cfg.mode === 'settle') pile.set(base.map((b) => Math.min(cfg.settleCap, b + 10)));
    t = 0;
    draw();
  }

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); // clamp stalls & background-tab gaps
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  };

  const start = () => {
    if (raf || reduceMq.matches || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const onVisibility = () => (document.hidden ? stop() : start());
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.active = true;
  };
  const onLeave = () => (pointer.active = false);
  const onReduce = () => {
    stop();
    particles = [];
    resize();
    start();
  };

  const ro = new ResizeObserver(resize);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
    else stop();
  });
  let counterTimer = 0;

  resize();
  ro.observe(section);
  io.observe(section);
  document.addEventListener('visibilitychange', onVisibility);
  section.addEventListener('pointermove', onMove, { passive: true });
  section.addEventListener('pointerleave', onLeave);
  section.addEventListener('pointercancel', onLeave);
  reduceMq.addEventListener('change', onReduce);
  counterTimer = window.setInterval(() => listeners.forEach((fn) => fn(settled)), 600);

  return {
    gust: () => {
      gust = 1;
    },
    onSettle: (fn: (n: number) => void) => listeners.push(fn),
    reduced: () => reduceMq.matches,
    destroy: () => {
      stop();
      ro.disconnect();
      io.disconnect();
      clearInterval(counterTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      section.removeEventListener('pointermove', onMove);
      section.removeEventListener('pointerleave', onLeave);
      section.removeEventListener('pointercancel', onLeave);
      reduceMq.removeEventListener('change', onReduce);
      particles = [];
      canvas.width = canvas.height = 0;
    },
  };
};

export { createSnowLayer };
