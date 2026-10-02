// Procedural render of a hydroponic grow rack: tiers of troughs under LED bars, plants at
// staggered growth stages, nutrient flow, and a crosshair that surveys one plant at a time.

type Variety = { name: string; light: string; dark: string; leaves: number; aspect: number; days: number };

const VARIETIES: Variety[] = [
  { name: 'Butterhead', light: '#b7e07a', dark: '#4f8a2f', leaves: 13, aspect: 0.52, days: 32 },
  { name: 'Red oak leaf', light: '#a8545f', dark: '#3b4a26', leaves: 15, aspect: 0.4, days: 30 },
  { name: 'Genovese basil', light: '#6fb04a', dark: '#24521f', leaves: 11, aspect: 0.62, days: 26 },
  { name: 'Mizuna', light: '#9fd065', dark: '#2f6a2a', leaves: 18, aspect: 0.22, days: 21 },
];

type Plant = { x: number; y: number; r: number; tier: number; col: number; seed: number; day: number; v: Variety };

const rand = (s: number) => {
  const x = Math.sin(s * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const startRack = (canvas: HTMLCanvasElement, opts: { reduced: boolean }) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  let W = 0;
  let H = 0;
  let plants: Plant[] = [];
  let troughs: { y: number; x0: number; x1: number }[] = [];
  let bars: { y: number; x0: number; x1: number; bottom: number }[] = [];
  let box = { x0: 0, x1: 0, y0: 0, y1: 0, pipe: 0 };
  let cols = 0;
  let tiers = 0;
  let target = 0;
  const cross = { x: 0, y: 0, r: 0 };
  let lastSwitch = 0;
  const order: number[] = [];

  const layout = () => {
    const rect = canvas.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const narrow = W < 560;
    box = {
      x0: W * (narrow ? 0.12 : 0.13),
      x1: W * (narrow ? 0.86 : 0.86),
      y0: H * (narrow ? 0.17 : 0.16),
      y1: H * (narrow ? 0.8 : 0.78),
      pipe: W * (narrow ? 0.92 : 0.915),
    };
    tiers = H < 560 ? 3 : 4;
    const tierH = (box.y1 - box.y0) / tiers;
    cols = Math.max(5, Math.min(11, Math.round((box.x1 - box.x0) / 62)));
    const step = (box.x1 - box.x0) / cols;

    plants = [];
    troughs = [];
    bars = [];
    for (let t = 0; t < tiers; t++) {
      const top = box.y0 + t * tierH;
      const ty = top + tierH * 0.86;
      troughs.push({ y: ty, x0: box.x0, x1: box.x1 });
      bars.push({ y: top + 8, x0: box.x0 + 6, x1: box.x1 - 6, bottom: ty });
      const v = VARIETIES[t % VARIETIES.length];
      for (let c = 0; c < cols; c++) {
        // Staggered sowing: each tier is a conveyor of ages, oldest on the right.
        const age = ((c + t * 2) % cols) / (cols - 1);
        const g = 0.38 + 0.62 * age;
        const seed = t * 31 + c * 7 + 1;
        plants.push({
          x: box.x0 + step * (c + 0.5),
          y: ty,
          r: Math.min(tierH * 0.66, step * 0.8) * g * (0.92 + rand(seed) * 0.16),
          tier: t,
          col: c,
          seed,
          day: Math.round(4 + age * (v.days - 4)),
          v,
        });
      }
    }
    // Survey order: mature plants first, shuffled deterministically.
    order.length = 0;
    plants
      .map((p, i) => ({ i, k: p.r + rand(p.seed * 3) * 8 }))
      .sort((a, b) => b.k - a.k)
      .slice(0, 10)
      .forEach((o) => order.push(o.i));
    target = 0;
    const p = plants[order[0]];
    cross.x = p.x;
    cross.y = p.y - p.r * 0.45;
    cross.r = p.r * 0.8 + 10;
  };

  const drawPlant = (p: Plant, t: number) => {
    const { v } = p;
    const n = v.leaves;
    const sway = opts.reduced ? 0 : Math.sin(t * 0.0009 + p.seed) * 0.05;
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1);
      // Back leaves first (wide fan), front leaves last (upright, smaller).
      const a = -Math.PI * (0.06 + 0.88 * f) + (rand(p.seed + k) - 0.5) * 0.25 + sway;
      const layer = k % 3;
      const len = p.r * (0.75 + rand(p.seed * 5 + k) * 0.35) * (layer === 2 ? 0.8 : 1);
      const cx = p.x + Math.cos(a) * len * 0.5;
      const cy = p.y - 4 + Math.sin(a) * len * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      const g = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
      g.addColorStop(0, v.dark);
      g.addColorStop(1, v.light);
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.82 + layer * 0.06;
      ctx.beginPath();
      ctx.ellipse(0, 0, len / 2, (len / 2) * v.aspect, 0, 0, Math.PI * 2);
      ctx.fill();
      // midrib
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = '#eaf7d8';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2.4, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  const mono = (size: number) => `500 ${size}px "Geist Mono", ui-monospace, monospace`;

  const frame = (t: number) => {
    ctx.clearRect(0, 0, W, H);

    // ground + faint survey grid
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0f0e');
    bg.addColorStop(1, '#141715');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let x = 0.5; x < W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0.5; y < H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // uprights
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    [box.x0 - 10, box.x1 + 10].forEach((x) => {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, box.y0 - 18);
      ctx.lineTo(x + 0.5, box.y1 + 22);
      ctx.stroke();
    });

    // plants
    plants.forEach((p) => drawPlant(p, t));

    // LED bars + light cones (screen over the canopy, like a real grow room)
    const flicker = opts.reduced ? 1 : 0.94 + Math.sin(t * 0.004) * 0.02 + rand(Math.floor(t / 90)) * 0.04;
    bars.forEach((b) => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const cone = ctx.createLinearGradient(0, b.y, 0, b.bottom);
      cone.addColorStop(0, `rgba(255,70,160,${0.24 * flicker})`);
      cone.addColorStop(1, 'rgba(255,70,160,0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(b.x0, b.y);
      ctx.lineTo(b.x1, b.y);
      ctx.lineTo(b.x1 + 14, b.bottom);
      ctx.lineTo(b.x0 - 14, b.bottom);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.shadowColor = 'rgba(255,90,175,0.9)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(255,${150 + 30 * flicker},${210},${0.95 * flicker})`;
      ctx.fillRect(b.x0, b.y - 1.5, b.x1 - b.x0, 3);
      ctx.restore();
      ctx.fillStyle = '#262b28';
      ctx.fillRect(b.x0 - 4, b.y - 5, b.x1 - b.x0 + 8, 3);
    });

    // troughs
    troughs.forEach((tr, i) => {
      ctx.fillStyle = '#1b201d';
      ctx.fillRect(tr.x0 - 10, tr.y, tr.x1 - tr.x0 + 20, 11);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(tr.x0 - 10, tr.y, tr.x1 - tr.x0 + 20, 1);
      // nutrient film: dots running toward the drain
      {
        ctx.fillStyle = 'rgba(205,240,225,0.55)';
        const span = tr.x1 - tr.x0 + 20;
        for (let k = 0; k < 9; k++) {
          const u = (k / 9 + t * 0.00004 * (1 + i * 0.15)) % 1;
          ctx.fillRect(tr.x0 - 10 + u * span, tr.y + 5, 3, 1.2);
        }
      }
      // tier label
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.font = mono(10);
      ctx.textAlign = 'right';
      ctx.fillText(`T${i + 1}`, box.x0 - 18, tr.y + 9);
      // feed line from pipe
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(box.x1 + 10, tr.y + 5.5);
      ctx.lineTo(box.pipe, tr.y + 5.5);
      ctx.stroke();
    });

    // column labels
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = mono(9);
    ctx.textAlign = 'center';
    const step = (box.x1 - box.x0) / cols;
    for (let c = 0; c < cols; c++) {
      if (cols > 8 && c % 2) {
        continue;
      }
      ctx.fillText(`C${String(c + 1).padStart(2, '0')}`, box.x0 + step * (c + 0.5), box.y0 - 10);
    }

    // supply pipe with descending flow
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(box.pipe, box.y0 - 20);
    ctx.lineTo(box.pipe, box.y1 + 22);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(205,240,225,0.8)';
    for (let k = 0; k < 7; k++) {
      const u = (k / 7 + t * 0.00007) % 1;
      ctx.fillRect(box.pipe - 0.75, box.y0 - 20 + u * (box.y1 - box.y0 + 42), 1.5, 5);
    }

    // survey crosshair
    if (!opts.reduced && t - lastSwitch > 3400) {
      lastSwitch = t;
      target = (target + 1) % order.length;
    }
    const p = plants[order[target]];
    if (p) {
      const tx = p.x;
      const ty = p.y - p.r * 0.45;
      const tr = p.r * 0.8 + 10;
      const e = opts.reduced ? 1 : 0.07;
      cross.x += (tx - cross.x) * e;
      cross.y += (ty - cross.y) * e;
      cross.r += (tr - cross.r) * e;

      ctx.strokeStyle = 'rgba(255,92,170,0.55)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(box.x0 - 10, cross.y + 0.5);
      ctx.lineTo(box.x1 + 10, cross.y + 0.5);
      ctx.moveTo(cross.x + 0.5, box.y0 - 18);
      ctx.lineTo(cross.x + 0.5, box.y1 + 22);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#ff5caa';
      ctx.lineWidth = 1.2;
      const r = cross.r;
      const k = r * 0.35;
      // bracket corners instead of a full ring
      ctx.beginPath();
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].forEach(([sx, sy]) => {
        ctx.moveTo(cross.x + sx * r, cross.y + sy * (r - k));
        ctx.lineTo(cross.x + sx * r, cross.y + sy * r);
        ctx.lineTo(cross.x + sx * (r - k), cross.y + sy * r);
      });
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ff5caa';
      ctx.fillRect(cross.x - 1.5, cross.y - 1.5, 3, 3);

      // label
      const lines = [
        `R03 · T${p.tier + 1} · C${String(p.col + 1).padStart(2, '0')}`,
        `${p.v.name.toUpperCase()}`,
        `DAY ${p.day}/${p.v.days} · ${p.day >= p.v.days - 4 ? 'READY TO CUT' : 'GROWING'}`,
      ];
      ctx.font = mono(10);
      const wLab = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 18;
      const hLab = 50;
      let lx = cross.x + r + 10;
      if (lx + wLab > W - 12) {
        lx = cross.x - r - 10 - wLab;
      }
      const ly = Math.max(8, Math.min(H - hLab - 8, cross.y - r - 4));
      ctx.fillStyle = 'rgba(12,14,13,0.82)';
      ctx.fillRect(lx, ly, wLab, hLab);
      ctx.strokeStyle = 'rgba(255,92,170,0.6)';
      ctx.strokeRect(lx + 0.5, ly + 0.5, wLab - 1, hLab - 1);
      ctx.textAlign = 'left';
      lines.forEach((l, i) => {
        ctx.fillStyle = i === 0 ? '#ff8cc4' : 'rgba(255,255,255,0.82)';
        ctx.fillText(l, lx + 9, ly + 16 + i * 13);
      });
    }
  };

  layout();
  let raf = 0;
  let visible = true;
  const loop = (t: number) => {
    frame(t);
    raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  };
  const kick = () => {
    if (!raf && visible && !document.hidden && !opts.reduced) {
      raf = requestAnimationFrame(loop);
    }
  };

  new ResizeObserver(() => {
    layout();
    frame(performance.now());
  }).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    kick();
  }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
  // Fonts load after first paint; redraw so canvas labels use Geist Mono.
  document.fonts?.ready.then(() => frame(performance.now()));

  if (opts.reduced) {
    frame(0);
  } else {
    kick();
  }
};

export { startRack };
