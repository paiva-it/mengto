// Local stand-in for a Unicorn Studio embed. It honours the same container contract as the SDK
// (data-us-scale, data-us-dpi, data-us-fps, data-us-lazyload) and the same authoring events
// (appear, scroll, hover, mousemove), so the markup can be swapped for a real data-us-project scene.
import { TARGETS } from './strata';

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uBeam, uAppear, uGround, uScroll, uSled;
uniform vec3 uPointer, uAccent;
uniform vec3 uTargets[4];
out vec4 o;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float strata(float x, float d, float t){
  return d * 18. + 0.55 * sin(x * 2.3 + d * 3.1 + t * 0.06) + 0.28 * sin(x * 5.7 - d * 7.0 - t * 0.045)
       + 0.12 * sin(x * 13.0 + d * 11.0 + t * 0.03);
}

void main(){
  vec2 frag = gl_FragCoord.xy;
  float x = frag.x / uRes.x;
  float ty = 1. - frag.y / uRes.y + uScroll * 0.1;
  float secH = (1. - uGround) * uRes.y;           // section height in px
  float d = (ty - uGround) / (1. - uGround);       // 0 at ground line, 1 at the bottom
  float beamPx = abs(x - uBeam) * uRes.x;
  float near = exp(-beamPx / 110.);

  // Air above the trench: near-black with one soft magenta haze, upper right.
  vec2 hp = vec2((x - 0.76) * uRes.x / uRes.y, ty - 0.08);
  vec3 col = vec3(0.031, 0.039, 0.059) + uAccent * 0.11 * exp(-dot(hp, hp) * 4.5);

  if (d > 0.) {
    float f = strata(x * 3.0, d, uTime);
    float layer = floor(f);
    float h = hash(vec2(layer, 7.1));
    vec3 fill = mix(vec3(0.050, 0.054, 0.074), vec3(0.105, 0.080, 0.118), h);
    fill *= 1. - d * 0.35;
    // Soil grain: pebbles at layer scale, speckle at pixel scale.
    float peb = smoothstep(0.72, 0.9, noise(vec2(frag.x / 9., f * 3.2 + layer * 5.)));
    fill += vec3(0.05, 0.04, 0.055) * peb * step(0.45, h);
    fill += (hash(floor(frag / 2.)) - 0.5) * 0.018;

    // Horizon boundaries, ~1px, antialiased with fwidth.
    float fw = fwidth(f);
    float edge = min(fract(f), 1. - fract(f));
    float line = 1. - smoothstep(0., fw * 1.3, edge);

    // Pointer lens (mousemove event) brightens the band under the cursor.
    float lens = 0.;
    if (uPointer.z > 0.) {
      vec2 pd = frag - uPointer.xy;
      lens = exp(-dot(pd, pd) / (2. * 140. * 140.)) * uPointer.z;
    }
    fill += uAccent * 0.05 * lens;

    vec3 lineCol = mix(uAccent, vec3(1.), 0.2);
    vec3 c = fill + lineCol * line * (0.11 + 0.95 * near + 0.6 * lens);

    // Radar returns: hyperbolic arcs over each buried target, lit as the beam passes.
    for (int i = 0; i < 4; i++) {
      vec3 tg = uTargets[i];
      float dx = (x - tg.x) * uRes.x;
      float dy = (d - tg.y) * secH;
      float k = 22. * tg.z;
      float curve = sqrt(dx * dx * 0.4 + k * k) - k;
      float glow = exp(-abs(dx) / 130.);
      float lit = 0.12 + 2.2 * exp(-abs(x - uBeam) * uRes.x / 160.);
      float arcs = exp(-abs(dy - curve) * 0.9) + 0.55 * exp(-abs(dy - curve - 7.) * 0.9) + 0.3 * exp(-abs(dy - curve - 14.) * 0.9);
      float apex = exp(-(dx * dx + dy * dy) / 18.);
      c += mix(uAccent, vec3(1.), 0.45) * (arcs * glow * 0.55 + apex * 1.4) * lit * step(-1., dy);
    }

    // Appear event: horizons settle in from the ground line downward.
    float vis = 1. - smoothstep(uAppear * 1.25 - 0.25, uAppear * 1.25, d);
    col = mix(col, c, vis);
  }

  // Ground line and the radar sled riding on it.
  float gpx = abs(ty - uGround) * uRes.y;
  col += mix(uAccent, vec3(1.), 0.6) * exp(-gpx * 1.4) * 0.85;
  float sledX = abs(x - uBeam) * uRes.x;
  float sledY = (uGround - ty) * uRes.y;
  float sled = step(sledX, 13.) * step(0., sledY) * step(sledY, 6.) * uSled;
  col = mix(col, vec3(0.95, 0.93, 0.98), sled);

  // The beam: a narrow core, a soft sheath, fading up into the air.
  float below = smoothstep(-0.06, 0.04, d);
  col += mix(uAccent, vec3(1.), 0.5) * (smoothstep(1.6, 0., beamPx) * 0.9 + exp(-beamPx / 26.) * 0.16) * below;

  // Vignette + ordered dither against banding.
  vec2 uv = frag / uRes;
  col *= 0.82 + 0.18 * smoothstep(0.9, 0.2, length(uv - 0.5));
  col += (hash(frag + fract(uTime)) - 0.5) / 255.;
  o = vec4(col, 1.);
}`;

const ACCENT: [number, number, number] = [0.96, 0.39, 0.97]; // hsl(299 92% 68%)

type Frame = { beam: number; time: number; fps: number; width: number; height: number };
type Options = { onFrame?: (f: Frame) => void; scrollEl?: HTMLElement };

const num = (v: string | undefined, fallback: number) => (v && !Number.isNaN(+v) ? +v : fallback);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const mountScene = (el: HTMLElement, { onFrame, scrollEl }: Options = {}) => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let gl: WebGL2RenderingContext | null = null;
  let uni: Record<string, WebGLUniformLocation | null> = {};
  let raf = 0;
  let inView = false;
  let last = 0;
  let fpsAvg = 0;
  let start = 0;
  const pointer = { x: 0, y: 0, a: 0, target: 0, nx: 0.5 };
  let beam = 0.5;

  const init = () => {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) {
      el.classList.add('no-gl');
      return false;
    }
    const sh = (type: number, src: string) => {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src);
      gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uRes', 'uTime', 'uBeam', 'uAppear', 'uGround', 'uScroll', 'uSled', 'uPointer', 'uAccent', 'uTargets'])
      uni[n] = gl.getUniformLocation(prog, n);
    gl.uniform3fv(uni.uAccent, ACCENT);
    gl.uniform3fv(uni.uTargets, TARGETS.flatMap((t, i) => [t.x, t.d, 1 + (i % 2) * 0.5]));
    canvas.style.opacity = '1';
    return true;
  };

  // data-us-scale × min(DPR, data-us-dpi): the same two knobs the SDK exposes.
  const resize = () => {
    if (!gl) return;
    const scale = num(el.dataset.usScale, 1);
    const dpi = Math.min(devicePixelRatio || 1, num(el.dataset.usDpi, 1.5));
    const w = Math.max(1, Math.round(el.clientWidth * dpi * scale));
    const h = Math.max(1, Math.round(el.clientHeight * dpi * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };

  const draw = (now: number) => {
    if (!gl) return;
    const t = (now - start) / 1000;
    const still = reduced.matches;
    // Hover event: the beam follows the cursor; otherwise it sweeps the transect on its own.
    pointer.a += (pointer.target - pointer.a) * 0.08;
    const auto = 0.5 + 0.43 * Math.sin(t * 0.17 - 0.6);
    beam += ((pointer.target ? pointer.nx : auto) - beam) * (still ? 1 : 0.05);
    const ground = num(getComputedStyle(el).getPropertyValue('--ground'), 0.5);
    let scroll = 0;
    if (scrollEl) {
      const r = scrollEl.getBoundingClientRect();
      scroll = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height)));
    }
    const k = canvas.width / el.clientWidth;
    gl.uniform2f(uni.uRes, canvas.width, canvas.height);
    gl.uniform1f(uni.uTime, still ? 40 : t);
    gl.uniform1f(uni.uBeam, still ? 0.45 : beam);
    gl.uniform1f(uni.uAppear, still ? 1 : Math.min(1, t / 1.8));
    gl.uniform1f(uni.uGround, ground);
    gl.uniform1f(uni.uScroll, scroll);
    gl.uniform1f(uni.uSled, el.dataset.sled === 'off' ? 0 : 1);
    gl.uniform3f(uni.uPointer, pointer.x * k, canvas.height - pointer.y * k, pointer.a);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    onFrame?.({ beam: still ? 0.45 : beam, time: still ? 40 : t, fps: fpsAvg, width: canvas.width, height: canvas.height });
  };

  // data-us-fps caps the loop; offscreen or hidden documents stop it entirely.
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const cap = num(el.dataset.usFps, 60);
    const dt = now - last;
    if (dt < 1000 / cap - 1.5) return;
    if (last) fpsAvg += (1000 / dt - fpsAvg) * 0.1;
    last = now;
    draw(now);
  };
  const run = () => {
    cancelAnimationFrame(raf);
    if (!gl || !inView || document.hidden) return;
    if (reduced.matches) {
      resize();
      draw(performance.now());
      return;
    }
    last = 0;
    raf = requestAnimationFrame(loop);
  };

  const ro = new ResizeObserver(() => {
    resize();
    if (reduced.matches) run();
  });

  const boot = () => {
    if (gl || el.classList.contains('no-gl')) return;
    el.prepend(canvas);
    try {
      if (!init()) return;
    } catch (err) {
      console.warn('[scene] fell back to static strata:', err);
      el.classList.add('no-gl');
      canvas.remove();
      return;
    }
    start = performance.now();
    resize();
    ro.observe(el);
  };

  // data-us-lazyload: no WebGL context until the container nears the viewport.
  const io = new IntersectionObserver(
    ([e]) => {
      inView = e.isIntersecting;
      if (inView) boot();
      run();
    },
    { rootMargin: el.dataset.usLazyload === 'true' ? '200px' : '100% 0px' },
  );
  io.observe(el);
  document.addEventListener('visibilitychange', run);
  reduced.addEventListener('change', run);

  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    pointer.x = e.clientX - r.left;
    pointer.y = e.clientY - r.top;
    pointer.nx = pointer.x / r.width;
    pointer.target = e.pointerType === 'mouse' ? 1 : 0;
    if (reduced.matches) draw(performance.now());
  });
  el.addEventListener('pointerleave', () => (pointer.target = 0));

  return { rerun: () => (resize(), run()) };
};

export { mountScene };
export type { Frame };
