// Hero canvas. One job: the field reads as label-free phase contrast, and the objective
// "lens" under the pointer reveals the fluorescence channels of the same specimen.
import * as THREE from 'three';

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const frag = /* glsl */ `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uLens;
uniform float uR;
uniform float uTime;
uniform vec3 uW;
uniform float uMerge;
uniform float uReveal;
uniform float uDpr;
varying vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(0.42, 0.28, 0.5)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 phase(vec2 uv) {
  float l = lum(texture2D(uTex, uv).rgb);
  // A ring of taps gives the bright "halo" phase contrast draws just outside each cell.
  float r = 7.0 / uRes.x * uDpr;
  float lb = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    lb += lum(texture2D(uTex, uv + vec2(cos(a), sin(a)) * r).rgb);
  }
  lb /= 8.0;
  vec3 base = vec3(0.905, 0.91, 0.89);
  vec3 cell = vec3(0.30, 0.32, 0.31);
  vec3 col = mix(base, cell, smoothstep(0.02, 0.5, l) * 0.78);
  col += vec3(0.11) * smoothstep(0.0, 0.18, lb - l);
  return col;
}

void main() {
  vec2 uv = vUv;
  // Living specimen: a slow sub-pixel drift, never enough to read as a wobble effect.
  uv += 0.0022 * vec2(sin(uTime * 0.31 + vUv.y * 5.0), cos(uTime * 0.27 + vUv.x * 4.0));

  vec2 p = vUv * uRes;
  vec2 c = uLens * uRes;
  float d = distance(p, c);
  float inLens = 1.0 - smoothstep(uR - 1.5 * uDpr, uR, d);

  vec3 bf = phase(uv);
  // Lens shadow on the stage around the objective.
  bf *= 1.0 - 0.10 * smoothstep(uR + 46.0 * uDpr, uR, d) * (1.0 - inLens);

  vec2 dir = vUv - uLens;
  vec2 luv = uLens + dir / 1.35 + (uv - vUv);
  float k = pow(clamp(d / uR, 0.0, 1.0), 2.0) * 0.006;
  vec3 f = vec3(
    texture2D(uTex, luv + dir * k).r,
    texture2D(uTex, luv).g,
    texture2D(uTex, luv - dir * k).b
  );
  vec3 iso = uW.x * vec3(0.30, 0.46, 1.0) * f.b * 1.7
           + uW.y * vec3(1.0, 0.20, 0.60) * f.r * 1.6
           + uW.z * vec3(0.36, 1.0, 0.56) * f.g * 2.6;
  vec3 fl = mix(iso, f * 1.12, uMerge) + vec3(0.012, 0.012, 0.02);

  vec3 col = mix(bf, fl, inLens);
  float ring = 1.0 - smoothstep(0.6 * uDpr, 1.6 * uDpr, abs(d - uR));
  col = mix(col, vec3(0.067, 0.075, 0.067), ring * 0.9);

  // Crosshair at the lens centre.
  vec2 q = abs(p - c);
  float gap = 7.0 * uDpr, len = 15.0 * uDpr, w = 0.6 * uDpr;
  float cross = (step(q.y, w) * step(gap, q.x) * step(q.x, len)) + (step(q.x, w) * step(gap, q.y) * step(q.y, len));
  col = mix(col, vec3(0.92), clamp(cross, 0.0, 1.0) * inLens * 0.85);

  // Field-edge falloff of a real eyepiece.
  float e = distance(vUv, vec2(0.5));
  col *= 1.0 - 0.12 * smoothstep(0.36, 0.5, e) * (1.0 - inLens);
  col += (hash(p + fract(uTime) * 91.0) - 0.5) * 0.028;

  // Intro: the iris opens from the centre.
  float iris = smoothstep(uReveal * 0.72, uReveal * 0.72 - 0.012, e);
  col = mix(vec3(0.957, 0.957, 0.941), col, iris);
  gl_FragColor = vec4(col, 1.0);
}
`;

type Opts = { shot: boolean; onLens?: (x: number, y: number) => void };
type Specimen = {
  // Channel weights [nuclei, membrane, puncta]; merge 1 shows the raw composite. Tween these directly.
  w: THREE.Vector3;
  u: { uMerge: THREE.IUniform<number>; uReveal: THREE.IUniform<number> };
  destroy: () => void;
};

const mount = async (host: HTMLElement, src: string, { shot, onLens }: Opts): Promise<Specimen | null> => {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  let tex: THREE.Texture;
  try {
    tex = await new THREE.TextureLoader().loadAsync(src);
  } catch {
    renderer.dispose();
    return null;
  }
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTex: { value: tex },
    uRes: { value: new THREE.Vector2(1, 1) },
    uLens: { value: new THREE.Vector2(0.55, 0.48) },
    uR: { value: 100 },
    uTime: { value: 0 },
    uW: { value: new THREE.Vector3(0, 0, 0) },
    uMerge: { value: 1 },
    uReveal: { value: 1 },
    uDpr: { value: dpr },
  };
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms });
  scene.add(new THREE.Mesh(geo, mat));
  host.appendChild(canvas);

  const size = () => {
    const w = host.clientWidth;
    renderer.setSize(w, w, false);
    uniforms.uRes.value.set(w * dpr, w * dpr);
    uniforms.uR.value = w * 0.2 * dpr;
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);

  // Pointer target; the lens eases toward it. Idle → a slow survey path across the slide.
  const target = new THREE.Vector2(0.55, 0.48);
  const lens = uniforms.uLens.value;
  let lastInput = -1e9;
  const clampToField = (v: THREE.Vector2) => {
    const off = v.clone().subScalar(0.5);
    const max = 0.5 - 0.21;
    if (off.length() > max) off.setLength(max);
    v.set(0.5 + off.x, 0.5 + off.y);
  };
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    target.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
    clampToField(target);
    lastInput = performance.now();
  };
  const onLeave = () => {
    lastInput = performance.now() - 1800;
  };
  const onKey = (e: KeyboardEvent) => {
    const step = 0.04;
    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const v = m[e.key];
    if (!v) return;
    e.preventDefault();
    if (performance.now() - lastInput > 2500) target.copy(lens);
    target.x += v[0];
    target.y += v[1];
    clampToField(target);
    lastInput = performance.now() + 4000;
  };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerdown', onMove);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('keydown', onKey);
  window.addEventListener('blur', onLeave);

  let raf = 0;
  let running = false;
  let visible = true;
  let t0 = performance.now();
  let prev = t0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    const t = (now - t0) / 1000;
    uniforms.uTime.value = t;
    if (!shot && now - lastInput > 2500) {
      target.set(0.5 + 0.17 * Math.sin(t * 0.23 + 0.4), 0.5 + 0.12 * Math.sin(t * 0.37 + 1.1));
    }
    lens.lerp(target, 1 - Math.exp(-dt * 5));
    onLens?.(lens.x, lens.y);
    renderer.render(scene, camera);
  };
  const start = () => {
    if (running || !visible || document.hidden) return;
    running = true;
    prev = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const io = new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    if (visible) start();
    else stop();
  });
  io.observe(host);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);

  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    host.classList.remove('is-live');
  };
  const onRestored = () => {
    host.classList.add('is-live');
    start();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  renderer.render(scene, camera);
  host.classList.add('is-live');
  start();

  return {
    w: uniforms.uW.value,
    u: { uMerge: uniforms.uMerge, uReveal: uniforms.uReveal },
    destroy: () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onLeave);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerdown', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('keydown', onKey);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      geo.dispose();
      mat.dispose();
      tex.dispose();
      renderer.dispose();
      canvas.remove();
      host.classList.remove('is-live');
      t0 = 0;
    },
  };
};

export type { Specimen };
export { mount };
