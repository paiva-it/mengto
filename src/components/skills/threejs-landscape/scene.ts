import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- noise
const hash = (x: number, z: number) => {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
const vnoise = (x: number, z: number) => {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
};
const fbm = (x: number, z: number, oct: number) => {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
};
const ridged = (x: number, z: number, oct: number) => {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(vnoise(x * f, z * f)); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
  return s / n;
};
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// One analytic height function: terrain, grass, stones and the mast all sample it.
const landH = (x: number, z: number) => {
  const d = Math.hypot(x, z);
  const far = smooth(18, 320, d);
  const wx = x + fbm(x * 0.012, z * 0.012, 3) * 26; // domain warp
  const wz = z + fbm(x * 0.012 + 41, z * 0.012 - 17, 3) * 26;
  let h = fbm(wx * 0.0075, wz * 0.0075, 5) * 34 * (0.1 + 0.9 * far); // broad landforms
  h += ridged(wx * 0.021, wz * 0.021, 3) * 9 * (0.15 + 3.2 * far); // ridges scale up with distance
  h += Math.max(0, fbm(wx * 0.0032 + 7, wz * 0.0032, 4) + 0.08) * 120 * smooth(180, 560, d); // far massifs
  h += fbm(x * 0.06, z * 0.06, 2) * 0.7; // near swell
  return h;
};

// ---------------------------------------------------------------- states
type Sun = { el: number; az: number };
type State = {
  sun: Sun; sunC: THREE.Color; sunI: number; glow: number;
  hemiS: THREE.Color; hemiG: THREE.Color; hemiI: number;
  fog: THREE.Color; fogN: number; fogF: number;
  ground: THREE.Color; base: THREE.Color; tip: THREE.Color;
  sky: THREE.Color[]; stars: number; beacon: number; ink: THREE.Color;
};
const C = (h: string) => new THREE.Color(h);
const S = (s: Omit<State, 'sky' | 'sunC' | 'hemiS' | 'hemiG' | 'fog' | 'ground' | 'base' | 'tip' | 'ink'> & Record<'sunC' | 'hemiS' | 'hemiG' | 'fog' | 'ground' | 'base' | 'tip' | 'ink', string> & { sky: string[] }): State => ({
  ...s,
  sunC: C(s.sunC), hemiS: C(s.hemiS), hemiG: C(s.hemiG), fog: C(s.fog), ground: C(s.ground),
  base: C(s.base), tip: C(s.tip), ink: C(s.ink), sky: s.sky.map(C),
});

const STATES: Record<string, State> = {
  dawn: S({
    sun: { el: 0.1, az: Math.PI + 1.25 }, sunC: '#ffc69c', sunI: 2.2, glow: 0.35,
    hemiS: '#cdd6e6', hemiG: '#6a604c', hemiI: 1.35,
    fog: '#e9d8cc', fogN: 40, fogF: 760,
    ground: '#efe2d6', base: '#3d4a2c', tip: '#a7ab73',
    sky: ['#8fa6c4', '#a9b9cf', '#cdcbd3', '#e6d4cb', '#eedacb', '#e3d0c0'], stars: 0.08, beacon: 0.5, ink: '#1c2230',
  }),
  noon: S({
    sun: { el: 1.05, az: Math.PI - 0.6 }, sunC: '#fff4e2', sunI: 2.8, glow: 0,
    hemiS: '#d2e2f2', hemiG: '#5e5a40', hemiI: 1.5,
    fog: '#dbe3e5', fogN: 70, fogF: 950,
    ground: '#ffffff', base: '#35502a', tip: '#a3b85f',
    sky: ['#4f86c0', '#6f9fcf', '#98bbdc', '#bcd2e3', '#d9e3e7', '#d2dad8'], stars: 0, beacon: 0.25, ink: '#13202c',
  }),
  dusk: S({
    sun: { el: 0.085, az: Math.PI + 0.06 }, sunC: '#ff9a5a', sunI: 2.6, glow: 1,
    hemiS: '#b79cb8', hemiG: '#4a3a35', hemiI: 1.05,
    fog: '#e8b391', fogN: 30, fogF: 700,
    ground: '#f2cfc0', base: '#2f3220', tip: '#c09a58',
    sky: ['#424c80', '#6c6596', '#b9869a', '#e8a589', '#f6c48f', '#e2a07c'], stars: 0.25, beacon: 0.9, ink: '#fff6ee',
  }),
  night: S({
    sun: { el: 0.6, az: Math.PI - 0.55 }, sunC: '#9fb2ff', sunI: 0.55, glow: 0,
    hemiS: '#3a4a7c', hemiG: '#0a0c12', hemiI: 0.6,
    fog: '#1b2338', fogN: 30, fogF: 640,
    ground: '#6f7ca6', base: '#0d130e', tip: '#36463d',
    sky: ['#04060d', '#080d1d', '#0f1630', '#18213d', '#252f4c', '#192034'], stars: 1, beacon: 1, ink: '#e8edf7',
  }),
};

const cloneState = (s: State): State => ({
  ...s, sun: { ...s.sun },
  sunC: s.sunC.clone(), hemiS: s.hemiS.clone(), hemiG: s.hemiG.clone(), fog: s.fog.clone(),
  ground: s.ground.clone(), base: s.base.clone(), tip: s.tip.clone(), ink: s.ink.clone(), sky: s.sky.map((c) => c.clone()),
});
const lerpAngle = (a: number, b: number, t: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) { d -= Math.PI * 2; }
  if (d < -Math.PI) { d += Math.PI * 2; }
  return a + d * t;
};
const mixState = (out: State, A: State, B: State, t: number) => {
  const n = (k: 'sunI' | 'glow' | 'hemiI' | 'fogN' | 'fogF' | 'stars' | 'beacon') => { out[k] = A[k] + (B[k] - A[k]) * t; };
  (['sunI', 'glow', 'hemiI', 'fogN', 'fogF', 'stars', 'beacon'] as const).forEach(n);
  (['sunC', 'hemiS', 'hemiG', 'fog', 'ground', 'base', 'tip', 'ink'] as const).forEach((k) => out[k].lerpColors(A[k], B[k], t));
  for (let i = 0; i < 6; i++) { out.sky[i].lerpColors(A.sky[i], B.sky[i], t); }
  out.sun.el = A.sun.el + (B.sun.el - A.sun.el) * t;
  out.sun.az = lerpAngle(A.sun.az, B.sun.az, t);
};

// ---------------------------------------------------------------- scene
type Opts = {
  canvas: HTMLCanvasElement;
  reduced: boolean;
  initial: string;
  onInk: (ink: THREE.Color) => void;
  onStats: (s: { fps: number; tris: number; calls: number }) => void;
};

const createLandscape = ({ canvas, reduced, initial, onInk, onStats }: Opts) => {
  const mobile = innerWidth < 760;
  const dpr = Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // software rasterisers (SwiftShader, llvmpipe) get a lighter field so a frame still lands
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const soft = /swiftshader|llvmpipe|software/i.test(dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '');

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 40, 700);
  const h0 = landH(0, 0);
  const EYE = 1.5;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 2400);
  camera.position.set(0, h0 + EYE, 0);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  const key = new THREE.DirectionalLight(0xffffff, 2);
  scene.add(hemi, key, key.target);

  // ---- terrain: polar grid centred under the camera
  const AN = mobile ? 540 : 900, RN = 52, R0 = 2.0, R1 = 700;
  const pos = new Float32Array((RN + 1) * AN * 3);
  const col = new Float32Array((RN + 1) * AN * 3);
  const rock = C('#8a8072'), grass = C('#6c7a43'), sand = C('#cdb98f'), snow = C('#e9e0cf');
  const tmp = new THREE.Color();
  for (let r = 0, p = 0; r <= RN; r++) {
    const rad = R0 + (R1 - R0) * Math.pow(r / RN, 2.4); // dense near, sparse far
    for (let a = 0; a < AN; a++, p += 3) {
      const th = (a / AN) * Math.PI * 2;
      const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      const y = landH(x, z);
      pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
      const e = Math.max(0.4, rad * 0.01);
      const nx = landH(x - e, z) - landH(x + e, z), nz = landH(x, z - e) - landH(x, z + e), ny = 2 * e;
      const slope = 1 - ny / Math.hypot(nx, ny, nz);
      const rel = y - h0;
      const moist = smooth(-4, 6, -rel);
      tmp.copy(rock)
        .lerp(grass, Math.max(0, Math.min(1, (1 - slope * 3.2) * (0.35 + moist * 0.65))))
        .lerp(sand, Math.max(0, 0.5 - moist) * 0.6)
        .lerp(snow, smooth(48, 95, rel) * 0.7);
      tmp.multiplyScalar(0.92 + fbm(x * 0.004 + 3, z * 0.004, 2) * 0.16); // anti-banding
      col[p] = tmp.r; col[p + 1] = tmp.g; col[p + 2] = tmp.b;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < RN; r++) {
    for (let a = 0; a < AN; a++) {
      const a0 = r * AN + a, a1 = r * AN + ((a + 1) % AN);
      const b0 = a0 + AN, b1 = a1 + AN;
      idx.push(a0, b1, b0, a0, a1, b1); // upward winding — checked by looking from below
    }
  }
  const terrainGeo = new THREE.BufferGeometry();
  terrainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  terrainGeo.setIndex(idx);
  terrainGeo.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const terrain = new THREE.Mesh(terrainGeo, groundMat);
  scene.add(terrain);
  const wireMat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0, depthWrite: false });
  const wire = new THREE.Mesh(terrainGeo, wireMat);
  wire.visible = false;
  wire.renderOrder = 2;
  scene.add(wire);

  // ---- sky: six stops on an 8×512 canvas, remapped to the elevation band the lens sees
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 8; skyCanvas.height = 512;
  const sctx = skyCanvas.getContext('2d')!;
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyGeo = new THREE.SphereGeometry(1600, 32, 160);
  {
    const sp = skyGeo.getAttribute('position'), uv = skyGeo.getAttribute('uv');
    for (let i = 0; i < sp.count; i++) {
      const t = Math.min(1, Math.max(0, (sp.getY(i) / 1600 + 0.08) / 0.55));
      uv.setY(i, Math.pow(t, 0.9)); // canvas row 0.84 lands just under the horizon
    }
  }
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  scene.add(sky);
  const paintSky = (cols: THREE.Color[]) => {
    const g = sctx.createLinearGradient(0, 0, 0, 512);
    [0, 0.3, 0.52, 0.68, 0.84, 1].forEach((s, i) => g.addColorStop(s, `#${cols[i].getHexString()}`));
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, 8, 512);
    skyTex.needsUpdate = true;
  };

  // sun glow
  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  const gx = gc.getContext('2d')!;
  const rg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  rg.addColorStop(0.22, 'rgba(255,255,255,0.28)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  gx.fillStyle = rg;
  gx.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(gc);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  sun.scale.setScalar(260);
  sun.renderOrder = 0;
  scene.add(sun);

  // ---- stars: only the elevation band the camera clamp can reach, three size classes
  const starMats: THREE.PointsMaterial[] = [];
  const starBase = [0.55, 0.8, 1];
  [[28000, 1.0], [9000, 1.7], [2000, 2.6]].forEach(([n, size], k) => {
    const sp = new Float32Array(n * 3);
    const s0 = Math.sin(0.015), s1 = Math.sin(0.72);
    for (let i = 0; i < n; i++) {
      const y = s0 + Math.random() * (s1 - s0);
      const th = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - y * y);
      sp[i * 3] = Math.cos(th) * rr * 1500; sp[i * 3 + 1] = y * 1500; sp[i * 3 + 2] = Math.sin(th) * rr * 1500;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const m = new THREE.PointsMaterial({
      size: size * dpr, sizeAttenuation: false, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: k === 2 ? 0xfff1dc : 0xdfe7ff,
    });
    starMats.push(m);
    const pts = new THREE.Points(g, m);
    pts.renderOrder = 0;
    scene.add(pts);
  });

  // ---- grass: one ribbon, shaped in the vertex shader
  const grassUni = {
    uTime: { value: 0 }, uWindAmp: { value: reduced ? 0.25 : 0.55 }, uWind: { value: new THREE.Vector2(0.8, -0.35).normalize() },
    uRestBend: { value: 0.35 }, uBase: { value: new THREE.Color() }, uTip: { value: new THREE.Color() },
  };
  const blade = new THREE.BufferGeometry();
  {
    const v: number[] = [];
    [0, 0.22, 0.44, 0.64, 0.82].forEach((t) => v.push(-1, t, 0, 1, t, 0));
    v.push(0, 1, 0);
    const ix: number[] = [];
    for (let r = 0; r < 4; r++) { const a = r * 2; ix.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    ix.push(8, 9, 10);
    blade.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    blade.setIndex(ix);
  }
  const GN = soft ? (mobile ? 30000 : 55000) : mobile ? 60000 : 110000, GR = 20;
  const aRoot = new Float32Array(GN * 4), aParams = new Float32Array(GN * 4);
  for (let i = 0; i < GN; i++) {
    const r = Math.sqrt(9 + (GR * GR - 9) * Math.random());
    const th = Math.random() * Math.PI * 2;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const rim = 1 - smooth(GR * 0.62, GR, r); // blades fade out at the patch rim
    const clump = 0.75 + 0.5 * (fbm(x * 0.18, z * 0.18, 2) * 0.5 + 0.5);
    aRoot.set([x, landH(x, z) - 0.02, z, Math.random() * Math.PI * 2], i * 4);
    aParams.set([(0.15 + Math.random() * 0.22) * clump * (0.15 + 0.85 * rim), Math.random() * 6.28, Math.random(), (Math.random() - 0.5) * 0.6], i * 4);
  }
  blade.setAttribute('aRoot', new THREE.InstancedBufferAttribute(aRoot, 4));
  blade.setAttribute('aParams', new THREE.InstancedBufferAttribute(aParams, 4));
  const grassMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grassUni);
    sh.vertexShader = `
      uniform float uTime, uWindAmp, uRestBend; uniform vec2 uWind;
      attribute vec4 aRoot; attribute vec4 aParams;
      varying float vT; varying float vTint;
    ` + sh.vertexShader.replace('#include <begin_vertex>', `
      float gT = position.y;
      float gH = aParams.x;
      float gW = 0.014 * (1.0 - gT * 0.92);
      float gust = sin(uTime * 0.7 + aRoot.x * 0.08 + aRoot.z * 0.05) * 0.5 + 0.5;
      float sway = (sin(uTime * 1.7 + aParams.y) * 0.3 + gust * 0.7) * uWindAmp;
      float lean = uRestBend + aParams.w;
      float arc = gT * gT;
      vec3 l = vec3(position.x * gW, gH * gT * (1.0 - 0.2 * lean * lean * arc), lean * arc * gH * 0.55);
      float cy = cos(aRoot.w), sy = sin(aRoot.w);
      vec3 transformed = aRoot.xyz + vec3(l.x * cy + l.z * sy, l.y, -l.x * sy + l.z * cy);
      transformed.xz += uWind * sway * arc * gH;
      transformed.y -= sway * arc * gH * 0.22;
      vT = gT; vTint = aParams.z;
    `);
    sh.fragmentShader = `
      uniform vec3 uBase, uTip; varying float vT; varying float vTint;
    ` + sh.fragmentShader.replace('#include <color_fragment>', `
      // own uniforms: a white material times a constant would still be that constant
      diffuseColor.rgb *= mix(uBase * 0.55, uTip, smoothstep(0.0, 1.0, vT)) * (0.82 + 0.36 * vTint);
    `);
  };
  grassMat.customProgramCacheKey = () => 'fallow-grass';
  const grassMesh = new THREE.InstancedMesh(blade, grassMat, GN);
  grassMesh.frustumCulled = false;
  scene.add(grassMesh);
  // ponytail: camera never translates, so the patch is a fixed disc; snap-to-cell when it walks.

  // ---- stones, sampled from the same height function
  const stoneGeo = mergeVertices(new THREE.IcosahedronGeometry(1, 1));
  stoneGeo.scale(1, 0.62, 1);
  stoneGeo.translate(0, 0.3, 0);
  stoneGeo.computeVertexNormals();
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const SN = 2600;
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, SN);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v3 = new THREE.Vector3();
  for (let i = 0, tries = 0; i < SN && tries < SN * 20; tries++) {
    const r = 9 + 160 * Math.pow(Math.random(), 1.6), th = Math.random() * Math.PI * 2;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const slope = Math.abs(landH(x + 0.5, z) - landH(x - 0.5, z)) + Math.abs(landH(x, z + 0.5) - landH(x, z - 0.5));
    if (slope > 0.9) { continue; }
    const s = [0.05, 0.09, 0.16, 0.32][Math.floor(Math.pow(Math.random(), 2.2) * 4)] * (0.7 + Math.random() * 0.6);
    q.setFromEuler(new THREE.Euler(Math.random() * 0.4, Math.random() * 6.28, Math.random() * 0.4));
    m4.compose(v3.set(x, landH(x, z), z), q, sc.set(s * (1 + Math.random() * 0.6), s, s));
    stones.setMatrixAt(i, m4);
    stones.setColorAt(i, tmp.setHSL(0.09, 0.08, 0.5 + Math.random() * 0.2));
    i++;
  }
  scene.add(stones);

  // ---- the subject: a weather mast and instrument hut on the moor
  const MAST_A = 0.15, MAST_D = 92;
  const mx = Math.sin(MAST_A) * MAST_D, mz = -Math.cos(MAST_A) * MAST_D;
  const my = Math.min(landH(mx, mz), landH(mx + 2, mz), landH(mx - 2, mz), landH(mx, mz + 2), landH(mx, mz - 2));
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(ry);
    g.translate(x, y, z);
    parts.push(g);
  };
  box(0.22, 13, 0.22, 0, 6.5, 0);
  box(2.6, 0.08, 0.08, 0, 12.2, 0);
  box(0.08, 0.08, 1.8, 0, 11.4, 0);
  box(0.5, 0.5, 0.5, 1.3, 12.45, 0);
  box(0.6, 0.14, 0.6, -1.3, 12.3, 0);
  box(0.9, 1.0, 0.7, 0, 3.2, 0.3);
  box(4.2, 2.6, 3, -4.6, 1.5, 1.2, 0.2);
  const roof = new THREE.CylinderGeometry(0.01, 2.6, 1.2, 4, 1);
  roof.rotateY(Math.PI / 4 + 0.2);
  roof.scale(1.2, 1, 0.85);
  roof.translate(-4.6, 3.4, 1.2);
  parts.push(roof);
  const mastGeo = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  mastGeo.computeVertexNormals();
  const mast = new THREE.Mesh(mastGeo, new THREE.MeshLambertMaterial({ color: 0x3a3a3c }));
  mast.position.set(mx, my - 0.3, mz);
  mast.rotation.y = 0.5;
  scene.add(mast);
  const wires = new THREE.BufferGeometry().setFromPoints(
    [0, 2.1, 4.2].flatMap((a) => [new THREE.Vector3(0, 11.8, 0), new THREE.Vector3(Math.cos(a) * 6.5, 0.2, Math.sin(a) * 6.5)]),
  );
  const wireLines = new THREE.LineSegments(wires, new THREE.LineBasicMaterial({ color: 0x3a3a3c, transparent: true, opacity: 0.6 }));
  wireLines.position.copy(mast.position);
  scene.add(wireLines);
  const beaconMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff4a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const beacon = new THREE.Sprite(beaconMat);
  beacon.position.set(mx, my - 0.3 + 13.2, mz);
  beacon.scale.setScalar(4);
  scene.add(beacon);

  // ---------------------------------------------------------------- time of day
  let A = cloneState(STATES[initial]);
  let B = STATES[initial];
  const CUR = cloneState(A);
  let tStart = -1, tDur = 1600;
  const sunDir = new THREE.Vector3();
  const apply = () => {
    sunDir.setFromSphericalCoords(1, Math.PI / 2 - CUR.sun.el, CUR.sun.az);
    key.position.copy(sunDir).multiplyScalar(100).add(camera.position);
    key.target.position.copy(camera.position);
    key.color.copy(CUR.sunC);
    key.intensity = CUR.sunI;
    hemi.color.copy(CUR.hemiS);
    hemi.groundColor.copy(CUR.hemiG);
    hemi.intensity = CUR.hemiI;
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(CUR.fog);
    fog.near = CUR.fogN;
    fog.far = CUR.fogF;
    groundMat.color.copy(CUR.ground);
    stoneMat.color.copy(CUR.ground);
    grassUni.uBase.value.copy(CUR.base);
    grassUni.uTip.value.copy(CUR.tip);
    paintSky(CUR.sky);
    sun.position.copy(sunDir).multiplyScalar(1400).add(camera.position);
    sun.material.color.copy(CUR.sunC).multiplyScalar(CUR.glow);
    starMats.forEach((m, k) => { m.opacity = CUR.stars * starBase[k]; });
    wireMat.color.copy(CUR.ink);
    onInk(CUR.ink);
  };
  apply();
  const setTime = (name: string) => {
    if (!STATES[name]) { return; }
    A = cloneState(CUR); // freeze the interpolated look as the new start
    B = STATES[name];
    if (reduced) { mixState(CUR, A, B, 1); apply(); tStart = -1; return; }
    tStart = performance.now();
  };

  // ---------------------------------------------------------------- view
  const view = { yaw: 0, pitch: -0.035, fov: 26 };
  const goal = { ...view };
  const PITCH = [-0.14, 0.3];
  let dragging = false, lx = 0, ly = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch0 = 0, fov0 = 0;
  const fovRange = () => (camera.aspect < 1 ? [24, 58] : [12, 40]);
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    dragging = pointers.size === 1;
    lx = e.clientX; ly = e.clientY;
    if (pointers.size === 2) {
      const [p, r] = [...pointers.values()];
      pinch0 = Math.hypot(p.x - r.x, p.y - r.y); fov0 = goal.fov;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) { return; }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [p, r] = [...pointers.values()];
      const [lo, hi] = fovRange();
      goal.fov = THREE.MathUtils.clamp((fov0 * pinch0) / Math.max(1, Math.hypot(p.x - r.x, p.y - r.y)), lo, hi);
      return;
    }
    if (!dragging) { return; }
    const k = (view.fov / 26) * 0.0032;
    goal.yaw -= (e.clientX - lx) * k;
    goal.pitch = THREE.MathUtils.clamp(goal.pitch + (e.clientY - ly) * k, PITCH[0], PITCH[1]);
    lx = e.clientX; ly = e.clientY;
  });
  const up = (e: PointerEvent) => { pointers.delete(e.pointerId); dragging = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [lo, hi] = fovRange();
    goal.fov = THREE.MathUtils.clamp(goal.fov * Math.exp(e.deltaY * 0.0012), lo, hi);
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = 0.06;
    const [lo, hi] = fovRange();
    const acts: Record<string, () => void> = {
      ArrowLeft: () => { goal.yaw += step; },
      ArrowRight: () => { goal.yaw -= step; },
      ArrowUp: () => { goal.pitch = Math.min(PITCH[1], goal.pitch + step * 0.5); },
      ArrowDown: () => { goal.pitch = Math.max(PITCH[0], goal.pitch - step * 0.5); },
      '+': () => { goal.fov = Math.max(lo, goal.fov * 0.9); },
      '=': () => { goal.fov = Math.max(lo, goal.fov * 0.9); },
      '-': () => { goal.fov = Math.min(hi, goal.fov / 0.9); },
    };
    if (acts[e.key]) { e.preventDefault(); acts[e.key](); }
  });

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const base = camera.aspect < 1 ? 44 : 26;
    goal.fov = view.fov = base;
    camera.fov = base;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  // ---------------------------------------------------------------- loop
  let visible = true, frames = 0, fpsT = performance.now(), fps = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
  const look = new THREE.Vector3();
  const clock = new THREE.Clock();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(0.05, clock.getDelta());
    if (!reduced) { grassUni.uTime.value += dt; }
    if (tStart >= 0) {
      const t = Math.min(1, (now - tStart) / tDur);
      mixState(CUR, A, B, t * t * (3 - 2 * t));
      apply();
      if (t >= 1) { tStart = -1; }
    }
    const drift = reduced || dragging ? 0 : Math.sin(now * 0.00008) * 0.02;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7);
    view.yaw += (goal.yaw + drift - view.yaw) * k;
    view.pitch += (goal.pitch - view.pitch) * k;
    view.fov += (goal.fov - view.fov) * k;
    if (Math.abs(camera.fov - view.fov) > 1e-3) { camera.fov = view.fov; camera.updateProjectionMatrix(); }
    const cp = Math.cos(view.pitch);
    look.set(Math.sin(view.yaw) * cp, Math.sin(view.pitch), -Math.cos(view.yaw) * cp).add(camera.position);
    camera.lookAt(look);
    beaconMat.opacity = CUR.beacon * (reduced ? 0.8 : 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(now * 0.0035)), 6));
    renderer.render(scene, camera);
    frames++;
    if (frames === 1 || now - fpsT > 500) {
      if (frames > 1) { fps = Math.round((frames * 1000) / (now - fpsT)); }
      frames = 0; fpsT = now;
      onStats({ fps, tris: renderer.info.render.triangles, calls: renderer.info.render.calls });
    }
  };
  requestAnimationFrame(frame);

  return {
    setTime,
    setGrass: (on: boolean) => { grassMesh.visible = on; },
    setGrid: (on: boolean) => {
      wire.visible = on;
      wireMat.opacity = on ? 0.32 : 0;
    },
  };
};

export { createLandscape };
