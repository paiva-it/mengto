// Matter.js tray: Engine + World with a custom DPR-aware canvas renderer and a fixed-step loop
// (Engine.update) that pauses when the stage is offscreen or the tab is hidden.
import Matter from 'matter-js';

import { formula } from './formula';

import type { Ingredient } from './formula';

const { Engine, Bodies, Body, Composite, Mouse, MouseConstraint, Query, Sleeping, Events } = Matter;

const STEP = 1000 / 60;
const WALL = 200;

// Deterministic PRNG so "Drop again" always replays the same fall.
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Item = { body: Matter.Body; ing: Ingredient; size: number };

const mountTray = (stage: HTMLElement) => {
  const canvas = stage.querySelector<HTMLCanvasElement>('#tray')!;
  const ctx = canvas.getContext('2d')!;
  const readout = stage.querySelector<HTMLElement>('#readout-text')!;
  const swatch = stage.querySelector<HTMLElement>('#readout-swatch')!;
  const pauseBtn = stage.querySelector<HTMLButtonElement>('#btn-pause')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('reduced');

  const engine = Engine.create({ enableSleeping: true, positionIterations: 8, velocityIterations: 6 });
  engine.gravity.y = 1;

  let W = 0;
  let H = 0;
  let floor = 0;
  let items: Item[] = [];
  let paused = false;
  let visible = true;
  let raf = 0;
  let last = 0;
  let acc = 0;

  // Mouse on the stage-sized canvas (CSS px). Drop Matter's wheel trap so the page still scrolls,
  // and only claim a touch when it lands on a body, so a finger on empty tray scrolls the page.
  const mouse = Mouse.create(canvas);
  mouse.pixelRatio = 1;
  canvas.removeEventListener('wheel', mouse.mousewheel as EventListener);
  canvas.removeEventListener('touchstart', mouse.mousedown as EventListener);
  canvas.removeEventListener('touchmove', mouse.mousemove as EventListener);
  canvas.addEventListener('touchstart', (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.changedTouches[0];
    const hit = Query.point(items.map((i) => i.body), { x: t.clientX - r.left, y: t.clientY - r.top });
    if (hit.length) mouse.mousedown(e);
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (mc.body) mouse.mousemove(e);
  }, { passive: false });
  // Matter divides by (clientWidth / canvas.width * pixelRatio); with a DPR backing store,
  // pixelRatio = DPR keeps mouse.position in CSS px, the units the world uses.
  const syncMouseScale = () => {
    mouse.pixelRatio = canvas.width / Math.max(1, canvas.clientWidth);
  };

  const mc = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.18, damping: 0.08, render: { visible: false } } });
  Composite.add(engine.world, mc);

  const describe = (item: Item | undefined) => {
    if (!item) return;
    swatch.style.background = item.ing.color;
    readout.textContent = `${item.ing.name} · ${item.ing.pct}% — ${item.ing.role}`;
  };
  Events.on(mc, 'startdrag', (e: any) => {
    canvas.classList.add('dragging');
    describe(items.find((i) => i.body === e.body));
    wake();
  });
  Events.on(mc, 'enddrag', () => canvas.classList.remove('dragging'));
  canvas.addEventListener('mousemove', () => {
    if (mc.body) return;
    const hit = Query.point(items.map((i) => i.body), mouse.position)[0];
    canvas.style.cursor = hit ? 'grab' : 'default';
  });

  const build = () => {
    Composite.clear(engine.world, false, true);
    Composite.add(engine.world, mc);
    // Phones: the floor sits above the readout + controls so the pile never hides under them.
    const mobile = W < 700;
    floor = mobile ? H - 116 : H;
    const opts = { isStatic: true, render: { visible: false } };
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, floor + WALL / 2, W + WALL * 2, WALL, opts),
      Bodies.rectangle(-WALL / 2, H / 2 - H, WALL, H * 4, opts),
      Bodies.rectangle(W + WALL / 2, H / 2 - H, WALL, H * 4, opts),
      Bodies.rectangle(W / 2, -H * 2 - WALL / 2, W + WALL * 2, WALL, opts),
    ]);

    // Area follows weight share, flattened (pct^0.55) so green tea is still holdable.
    const fill = mobile ? 0.22 : 0.37;
    const weights = formula.map((f) => Math.pow(f.pct, 0.55));
    const total = weights.reduce((a, b) => a + b, 0);
    const cap = Math.min(W, H) * (mobile ? 0.21 : 0.17);
    const rand = mulberry32(7);

    items = formula.map((ing, i) => {
      const area = (weights[i] / total) * fill * W * H;
      const size = Math.min(cap, Math.sqrt(area / Math.PI)); // equivalent radius
      const x = size + 12 + rand() * Math.max(1, W - 2 * size - 24);
      const y = -size - 40 - i * (mobile ? 70 : 55) - rand() * 40;
      const common = {
        restitution: 0.18,
        friction: 0.42,
        frictionStatic: 0.6,
        frictionAir: 0.012,
        density: 0.0015,
        angle: (rand() - 0.5) * 1.2,
      };
      let body: Matter.Body;
      if (ing.shape === 'block') {
        const w = size * 2.1;
        const h = (Math.PI * size * size) / w;
        body = Bodies.rectangle(x, y, w, h, { ...common, chamfer: { radius: Math.min(w, h) * 0.22 } });
      } else if (ing.shape === 'capsule') {
        const w = size * 2.7;
        const h = (Math.PI * size * size) / w;
        body = Bodies.rectangle(x, y, w, h, { ...common, chamfer: { radius: h / 2 - 0.5 } });
      } else if (ing.shape === 'hex') {
        body = Bodies.polygon(x, y, 6, size * 1.1, common);
      } else {
        body = Bodies.circle(x, y, size, common);
      }
      return { body, ing, size };
    });
    Composite.add(engine.world, items.map((i) => i.body));

    // Reduced motion: no fall — settle off-screen, show the resting tray.
    if (reduced) for (let i = 0; i < 720; i++) Engine.update(engine, STEP);
  };

  const resize = () => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const changed = Math.round(r.width) !== W;
    W = Math.round(r.width);
    H = Math.round(r.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    syncMouseScale();
    if (changed) build();
    draw();
  };

  // Keep everything inside the tray; anything flung past the walls is set back in.
  const contain = () => {
    for (const { body, size } of items) {
      const { x, y } = body.position;
      if (x < -size || x > W + size || y > floor + size || y < -H * 2) {
        Body.setPosition(body, { x: W / 2, y: -size - 20 });
        Body.setVelocity(body, { x: 0, y: 0 });
      }
    }
  };

  const tracePath = (body: Matter.Body) => {
    ctx.beginPath();
    if (body.circleRadius) {
      ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
      return;
    }
    const v = body.vertices;
    ctx.moveTo(v[0].x, v[0].y);
    for (let i = 1; i < v.length; i++) ctx.lineTo(v[i].x, v[i].y);
    ctx.closePath();
  };

  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    // floor shadow line
    ctx.fillStyle = 'rgba(34,36,30,0.06)';
    ctx.fillRect(16, floor - 1, W - 32, 1);

    for (const { body, ing, size } of items) {
      const { x, y } = body.position;
      const grabbed = mc.body === body;

      ctx.save();
      ctx.shadowColor = 'rgba(34,36,30,0.18)';
      ctx.shadowBlur = grabbed ? 28 : 14;
      ctx.shadowOffsetY = grabbed ? 14 : 6;
      tracePath(body);
      ctx.fillStyle = ing.color;
      ctx.fill();
      ctx.restore();

      // soft top-left light, then a hairline rim
      const g = ctx.createRadialGradient(x - size * 0.45, y - size * 0.55, size * 0.05, x, y, size * 1.4);
      g.addColorStop(0, 'rgba(255,255,255,0.42)');
      g.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(34,36,30,0.12)');
      tracePath(body);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(34,36,30,0.16)';
      ctx.stroke();

      // label rides the body's rotation
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(body.angle);
      ctx.fillStyle = ing.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const fs = Math.max(10, Math.min(26, size * 0.3));
      const pct = `${ing.pct}%`;
      if (size > 30) {
        ctx.font = `600 ${fs}px 'Inter Tight', sans-serif`;
        ctx.fillText(ing.short, 0, -fs * 0.45);
        ctx.globalAlpha = 0.72;
        ctx.font = `500 ${Math.max(10, fs * 0.62)}px 'IBM Plex Mono', monospace`;
        ctx.fillText(pct, 0, fs * 0.65);
      } else {
        ctx.font = `500 ${Math.max(9, size * 0.5)}px 'IBM Plex Mono', monospace`;
        ctx.fillText(pct, 0, 0);
      }
      ctx.restore();
    }
  };

  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    if (!last) last = t;
    acc = Math.min(acc + (t - last), STEP * 5); // clamp after a stall instead of spiralling
    last = t;
    while (acc >= STEP) {
      Engine.update(engine, STEP);
      acc -= STEP;
    }
    contain();
    draw();
  };

  const start = () => {
    if (raf || paused || !visible || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const wake = () => items.forEach(({ body }) => Sleeping.set(body, false));

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    visible ? start() : stop();
  }).observe(stage);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  let lastW = 0;
  new ResizeObserver(() => {
    // ignore pure height jitter from mobile URL bars unless it is large
    const r = stage.getBoundingClientRect();
    if (Math.round(r.width) === lastW && Math.abs(r.height - H) < 80) return;
    lastW = Math.round(r.width);
    resize();
  }).observe(stage);

  stage.querySelector('#btn-reset')!.addEventListener('click', () => {
    build();
    readout.textContent = 'Fourteen ingredients, dropped again in the same order.';
    swatch.style.background = '';
    draw();
  });
  stage.querySelector('#btn-shake')!.addEventListener('click', () => {
    const rand = mulberry32(Date.now());
    wake();
    for (const { body } of items) {
      Body.setVelocity(body, { x: (rand() - 0.5) * 14, y: -8 - rand() * 10 });
      Body.setAngularVelocity(body, (rand() - 0.5) * 0.3);
    }
  });
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    pauseBtn.setAttribute('aria-pressed', String(paused));
    pauseBtn.querySelector('span')!.textContent = paused ? 'Resume' : 'Pause';
    paused ? stop() : start();
  });

  document.fonts?.ready.then(draw);
  resize();
  lastW = W;
  start();

  // SPA teardown (Astro view transitions are not used here, but keep it honest).
  return () => {
    stop();
    Composite.clear(engine.world, false, true);
    Engine.clear(engine);
  };
};

export { mountTray };
