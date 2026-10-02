/* Coldwater's hero: the page's own rim. The loader (#kindle, an inline script
   that draws in a worker) hands over at progress HAND; from that moment this
   draws the same ring — the loader's own GLSL, compiled with KB_PAGE so the
   burnt hole is clear down to the reef beneath — on the same intro curve and
   clock, so the two rims coincide while the loader's last frame fades. */

type KbLoad = {
  t0: number;
  handAt: number;
  ready(): Promise<void>;
  set(p: number): void;
  step(p: number): Promise<void>;
  done(): Promise<void>;
  follow(u: number): void;
  close(): void;
  velocity(): number;
};
type KbGLSL = { VS: string; FS: string; SVS: string; SFS: string };
type Win = Window & {
  __kbLoad?: KbLoad;
  __kbGLSL?: KbGLSL;
  __kbIntroBurn?: (x: number) => number;
  __kbLoaderFrames?: number[];
  __kbNoWorker?: boolean;
};
type SparkSet = {
  n: number; life: number; rise: number; thr: number; size: number; streak: number; gain: number; ash: number;
  bc: WebGLBuffer; bs: WebGLBuffer; bi: WebGLBuffer; count: number;
};

const W = window as Win;
const HAND = 0.36, REST = 0.43, DUR = 1.6;
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv = document.getElementById('hero-gl') as HTMLCanvasElement;
const introBurn = W.__kbIntroBurn ?? ((x: number) => HAND + (REST - HAND) * Math.min(1, Math.max(0, x)));

/* the ring's radius in CSS px at u, as the FS draws it (kbScale, T = 1.62u - 0.30) */
const ringPx = (u: number, w: number, h: number) => {
  const t = Math.min(1, Math.max(0, (u - 0.335) / 0.215)), sc = 0.67 + 0.33 * t * t * (3 - 2 * t);
  return (u * 1.62 - 0.3) * Math.hypot(w / h, 1) * 0.5 * sc * h;
};

let vw = innerWidth, vh = innerHeight;
const sizeVars = () => {
  root.style.setProperty('--vh', `${vh}px`);
  root.style.setProperty('--hole', `${ringPx(REST, vw, vh).toFixed(1)}px`);
};
sizeVars();
addEventListener('resize', () => {
  // ponytail: width only — a phone's URL bar changing innerHeight would make the ring jump
  if (innerWidth === vw) return;
  vw = innerWidth; vh = innerHeight; sizeVars();
  if (handAt) frame();
});

let gl: WebGLRenderingContext | null = null;
let prog: WebGLProgram | null = null, sparkProg: WebGLProgram | null = null, buf: WebGLBuffer | null = null;
let fsh: WebGLShader | null = null, softD = 1;
const U: Record<string, WebGLUniformLocation | null> = {};
const SU: Record<string, WebGLUniformLocation | null> = {};
let aCorner = 0, aSeed = 1;
const sets: SparkSet[] = [];

/* station 1: create both programs and link them, asking nothing yet — with
   KHR_parallel_shader_compile the driver compiles them while the build goes on */
const compile = () => {
  const G = W.__kbGLSL;
  if (!G) return;
  try {
    gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) throw 0;
    // a software rasteriser draws the ring at half resolution, as the loader does
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (/swiftshader|llvmpipe|software|basic render/i.test(dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '')) softD = 0.5;
    gl.getExtension('KHR_parallel_shader_compile');
    const g = gl;
    const sh = (type: number, src: string) => { const o = g.createShader(type)!; g.shaderSource(o, src); g.compileShader(o); return o; };
    const deriv = g.getExtension('OES_standard_derivatives') ? '#extension GL_OES_standard_derivatives : enable\n' : '#define KB_NO_DERIV\n';
    prog = g.createProgram()!;
    g.attachShader(prog, sh(g.VERTEX_SHADER, G.VS));
    fsh = sh(g.FRAGMENT_SHADER, deriv + '#define KB_PAGE\n' + G.FS);
    g.attachShader(prog, fsh);
    g.bindAttribLocation(prog, 0, 'a');
    g.linkProgram(prog);
    sparkProg = g.createProgram()!;
    g.attachShader(sparkProg, sh(g.VERTEX_SHADER, G.SVS));
    g.attachShader(sparkProg, sh(g.FRAGMENT_SHADER, G.SFS));
    g.bindAttribLocation(sparkProg, 0, 'aCorner');
    g.bindAttribLocation(sparkProg, 1, 'aSeed');
    g.linkProgram(sparkProg);
  } catch {
    gl = null;
  }
};

/* station 2: check the links, set up the buffers and the same cinders as the
   loader's (same mulberry32 seed, same sets), so none is born twice */
const link = () => {
  const g = gl;
  if (!g || !prog || !sparkProg) return fail();
  if (!g.getProgramParameter(prog, g.LINK_STATUS) || !g.getProgramParameter(sparkProg, g.LINK_STATUS)) {
    console.warn('hero ring:', g.getShaderInfoLog(fsh!) || g.getProgramInfoLog(prog));
    return fail();
  }
  buf = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, buf);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
  for (const n of ['uRes', 'uProg', 'uAspect', 'uTime', 'uPxS']) U[n] = g.getUniformLocation(prog, n);
  for (const n of ['uProg', 'uAspect', 'uTime', 'uPx', 'uLife', 'uRise', 'uThrow', 'uSize', 'uStreak', 'uAsh', 'uVelocity', 'uResolution', 'uGain', 'uDensity'])
    SU[n] = g.getUniformLocation(sparkProg, n);
  aCorner = g.getAttribLocation(sparkProg, 'aCorner'); aSeed = g.getAttribLocation(sparkProg, 'aSeed');
  let seed = 0x2f6b9d1;
  const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (const o of [
    { n: 1800, life: 0.23, rise: 0.2, thr: 0.1, size: 2.6, streak: 2.1, gain: 8.0, ash: 0 },
    { n: 720, life: 0.58, rise: 0.42, thr: 0.055, size: 4.2, streak: 0.65, gain: 3.1, ash: 0 },
    { n: 360, life: 0.9, rise: 0.3, thr: 0.08, size: 2.0, streak: 0.0, gain: 0.9, ash: 1 },
    { n: 160, life: 1.4, rise: 0.4, thr: 0.03, size: 5.5, streak: 0.15, gain: 1.4, ash: 0 },
  ]) {
    const corner = new Float32Array(o.n * 8), sd = new Float32Array(o.n * 16), idx = new Uint16Array(o.n * 6);
    for (let i = 0; i < o.n; i++) {
      const s = [rand() * Math.PI * 2, rand(), 0.4 + rand() * 1.5, 0.3 + rand() * 0.7];
      for (let v = 0; v < 4; v++) { corner.set([(v % 2) - 0.5, v > 1 ? -0.5 : 0.5], (i * 4 + v) * 2); sd.set(s, (i * 4 + v) * 4); }
      const a = i * 4;
      idx.set([a, a + 2, a + 1, a + 2, a + 3, a + 1], i * 6);
    }
    const mk = (target: number, data: ArrayBufferView) => { const b = g.createBuffer()!; g.bindBuffer(target, b); g.bufferData(target, data, g.STATIC_DRAW); return b; };
    sets.push({ ...o, bc: mk(g.ARRAY_BUFFER, corner), bs: mk(g.ARRAY_BUFFER, sd), bi: mk(g.ELEMENT_ARRAY_BUFFER, idx), count: o.n * 6 });
  }
};

const fail = () => { gl = null; root.classList.add('no-hero-gl'); };

let handAt = 0, uPrev = HAND, tPrev = 0, vel = 0, warming = false;

const paint = (now: number) => {
  const g = gl;
  if (!g || !prog) return;
  const d = Math.min(1.5, devicePixelRatio || 1) * softD;
  const pw = Math.round(vw * d), ph = Math.round(vh * d);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const u = handAt ? introBurn((now - handAt) / 1000 / DUR) : HAND;
  const dt = Math.max(0.001, (now - tPrev) / 1000);
  vel += (Math.max(-1, Math.min(1, (u - uPrev) / dt)) - vel) * Math.min(1, dt * 8);
  uPrev = u; tPrev = now;
  const tSec = reduced ? 0 : (now - (W.__kbLoad?.t0 ?? 0)) / 1000;
  g.viewport(0, 0, warming ? 1 : pw, warming ? 1 : ph);
  g.useProgram(prog);
  g.disable(g.BLEND);
  g.bindBuffer(g.ARRAY_BUFFER, buf);
  g.enableVertexAttribArray(0);
  g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
  g.uniform2f(U.uRes, pw, ph); g.uniform1f(U.uAspect, vw / vh); g.uniform1f(U.uPxS, d);
  g.uniform1f(U.uProg, u); g.uniform1f(U.uTime, tSec);
  g.drawArrays(g.TRIANGLES, 0, 3);
  if (sparkProg && !reduced) {
    g.useProgram(sparkProg);
    g.enable(g.BLEND);
    g.blendFuncSeparate(g.ONE, g.ONE, g.ZERO, g.ONE); // light only: the canvas keeps its own alpha
    g.uniform1f(SU.uProg, u); g.uniform1f(SU.uAspect, vw / vh); g.uniform1f(SU.uTime, tSec);
    g.uniform1f(SU.uPx, d); g.uniform1f(SU.uVelocity, vel); g.uniform2f(SU.uResolution, pw, ph);
    g.uniform1f(SU.uDensity, 1);
    for (const o of sets) {
      g.uniform1f(SU.uLife, o.life); g.uniform1f(SU.uRise, o.rise); g.uniform1f(SU.uThrow, o.thr);
      g.uniform1f(SU.uSize, o.size); g.uniform1f(SU.uStreak, o.streak); g.uniform1f(SU.uAsh, o.ash);
      g.uniform1f(SU.uGain, o.gain);
      g.bindBuffer(g.ARRAY_BUFFER, o.bc); g.enableVertexAttribArray(aCorner); g.vertexAttribPointer(aCorner, 2, g.FLOAT, false, 0, 0);
      g.bindBuffer(g.ARRAY_BUFFER, o.bs); g.enableVertexAttribArray(aSeed); g.vertexAttribPointer(aSeed, 4, g.FLOAT, false, 0, 0);
      g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, o.bi);
      g.drawElements(g.TRIANGLES, o.count, g.UNSIGNED_SHORT, 0);
    }
    g.disableVertexAttribArray(aSeed);
  }
  return u;
};

/* station 3: a real frame's draws into one pixel, waited on, so the first
   frame anyone sees is not the one that builds the GPU pipeline */
const warmUp = () => {
  if (!gl) return;
  warming = true;
  try { paint(performance.now()); } finally { warming = false; }
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
};

/* the hero draws while it is on screen; under reduced motion it stops once
   the ring has opened (no time, so nothing moves after that) */
let visible = true, raf = 0;
const frame = () => { raf = 0; paint(performance.now()); };
const loop = (now: number) => {
  raf = 0;
  paint(now);
  if (!visible || document.hidden) return;
  if (reduced && now - handAt > DUR * 1000 + 100) return;
  raf = requestAnimationFrame(loop);
};
const kick = () => { if (!raf && gl && handAt) raf = requestAnimationFrame(loop); };
new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(cv);
document.addEventListener('visibilitychange', kick);

const open = () => { root.classList.remove('loading'); root.classList.add('open'); };

/* the hand-off: the first hero frame goes up in the same commit the loader
   stops and starts its CSS fade */
const startHero = (LOAD: KbLoad | undefined) => {
  handAt = LOAD?.handAt || performance.now();
  tPrev = handAt;
  requestAnimationFrame((now) => {
    const u = paint(now);
    if (LOAD) {
      if (u !== undefined) LOAD.follow(u);
      LOAD.close();
    }
    open();
    kick();
    setTimeout(readout, 900);
  });
};

const readout = () => {
  const el = document.getElementById('gap');
  const f = W.__kbLoaderFrames || [];
  if (!el || f.length < 2) return;
  let top = 0;
  for (let i = 1; i < f.length; i++) top = Math.max(top, f[i] - f[i - 1]);
  el.textContent = `${top.toFixed(0)} ms`;
  const how = document.getElementById('gap-how');
  if (how) how.textContent = W.__kbNoWorker ? 'drawn on the main thread' : 'drawn in a worker';
};

/* A stand-in for a heavy page build — seven stations that hold this thread
   for 140-280 ms each, as a real build's parsing and geometry would — with
   the hero's real compile, link, image decode and warm-up among them. */
const spin = (ms: number) => { const e = performance.now() + ms; while (performance.now() < e) Math.sqrt(Math.random()); };
const block = !/[?&]block=0/.test(location.search);
const hold = (ms: number) => (block ? spin(ms) : undefined);

(async () => {
  history.scrollRestoration = 'manual';
  scrollTo(0, 0);
  const LOAD = W.__kbLoad;
  if (!LOAD) { compile(); link(); warmUp(); startHero(undefined); return; }
  LOAD.set(0.3);
  await LOAD.ready();
  const reef = document.getElementById('reef') as HTMLImageElement | null;
  const stations: [number, () => unknown][] = [
    [0.42, () => { compile(); hold(180); }],
    [0.52, () => reef?.decode().catch(() => undefined)],
    [0.6, () => hold(260)],
    [0.68, () => { link(); hold(140); }],
    [0.76, () => hold(240)],
    [0.85, () => { warmUp(); hold(150); }],
    [0.93, () => hold(220)],
  ];
  for (const [p, run] of stations) { await run(); await LOAD.step(p); }
  await LOAD.done();
  startHero(LOAD);
})();

document.getElementById('replay')?.addEventListener('click', () => { scrollTo(0, 0); location.reload(); });
