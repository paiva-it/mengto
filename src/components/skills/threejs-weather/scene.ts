// Tarn Ridge — four weathers over one house. Follows the threejs-weather skill:
// frustum-anchored precipitation volume, fixed pools thinned by draw range, storm = rain leaned on,
// lightning as its own light + a DOM flash under the type, blizzard envelope, settled snow on its
// own clock with a shader uniform for the grass, relight gated on slow values.
import * as THREE from 'three';

import { Ambience } from './audio';

type Wx = 'clear' | 'rain' | 'storm' | 'snow';

interface Look {
  rain: number; // fraction of the rain pool drawn
  speed: number; // fall speed multiplier
  sun: number;
  fog: number; // fog-far multiplier
  wet: number;
  snow: number; // falling snow amount
  temp: number;
  top: THREE.Color;
  bot: THREE.Color;
}

const look = (rain: number, speed: number, sun: number, fog: number, wet: number, snow: number, temp: number, top: number, bot: number): Look => ({
  rain, speed, sun, fog, wet, snow, temp, top: new THREE.Color(top), bot: new THREE.Color(bot),
});

// The storm row is the rain row leaned on: 60 % → 100 % of the pool, ×1.0 → ×1.42, sun 30 → 14 %, fog ×0.52 → ×0.38.
const PRESETS: Record<Wx, Look> = {
  clear: look(0, 1, 1, 1, 0, 0, 14, 0x9eb1c1, 0xe3dfd5),
  rain: look(0.6, 1, 0.3, 0.52, 0.85, 0, 11, 0xa4a8ac, 0xc8c7c2),
  storm: look(1, 1.42, 0.14, 0.38, 1, 0, 9, 0x8a9096, 0xaeafac),
  snow: look(0, 1, 0.45, 0.62, 0.12, 1, -3, 0xbcc2c8, 0xe0e2e2),
};

// ---------- terrain noise ----------
const hash = (x: number, z: number) => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const vnoise = (x: number, z: number) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, z: number) => {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    s += a * vnoise(x * f, z * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
};
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const heightAt = (x: number, z: number) => {
  const d = Math.hypot(x, z);
  const roll = (fbm(x * 0.03 + 7, z * 0.03) - 0.5) * 5 * smooth(28, 75, d);
  const mtn = smooth(105, 210, d) * (16 + 78 * Math.pow(fbm(x * 0.006 + 3, z * 0.006 - 2), 2.2));
  return roll + mtn;
};

// ---------- blizzard envelope: calm, build, blow, ease (seconds) ----------
const BLIZ = [12, 6, 15, 8];
const BLIZ_T = BLIZ.reduce((a, b) => a + b, 0);
const blizzardAt = (t: number) => {
  let u = t % BLIZ_T;
  if (u < 0) u += BLIZ_T;
  if (u < BLIZ[0]) return 0;
  u -= BLIZ[0];
  if (u < BLIZ[1]) return smooth(0, 1, u / BLIZ[1]);
  u -= BLIZ[1];
  if (u < BLIZ[2]) return 1;
  u -= BLIZ[2];
  return 1 - smooth(0, 1, u / BLIZ[3]);
};

// ---------- precipitation volume (local space, carried ahead of the camera) ----------
const WX_W = 36, WX_D = 46, WX_TOP = 24, WX_NEAR = 5;
const RAIN_N = 6400, SNOW_N = 9000, SPLASH_N = 700;

const boot = () => {
  const host = document.getElementById('wx-stage');
  const canvas = host?.querySelector('canvas');
  const flashEl = document.getElementById('wx-flash');
  if (!host || !canvas || !flashEl) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

  const scene = new THREE.Scene();
  const fog = new THREE.Fog(0xcccccc, 8, 620);
  scene.fog = fog;
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 1400);
  const target = new THREE.Vector3(0, 1.9, 0);
  let R = 31, aimSide = 3.6, aimY = 1.9;
  const CAM_H = 2.6;
  let baseAz = 0.62, camAz = baseAz;

  // ---------- sky ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uFlash: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uBot; uniform float uFlash;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 2.4 + 0.02, 0.0, 1.0);
        vec3 c = mix(uBot, uTop, pow(h, 0.75));
        c *= 1.0 + uFlash * 0.8;   // the strike multiplies the sky, it does not repaint it
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xdfe4ea, 0x5b5640, 1.2);
  const sunL = new THREE.DirectionalLight(0xfff1dc, 2);
  sunL.position.set(40, 60, 25);
  const bolt = new THREE.DirectionalLight(0xe8eeff, 0); // nobody else touches this light
  scene.add(hemi, sunL, bolt);

  // ---------- ground ----------
  const SIZE = 680, SEG = 230;
  const gGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  gGeo.rotateX(-Math.PI / 2);
  const gp = gGeo.attributes.position;
  const gCol = new Float32Array(gp.count * 3);
  const olive = new THREE.Color(0x4a4529), stone = new THREE.Color(0x77736b), tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i), h = heightAt(x, z);
    gp.setY(i, h);
    tmp.copy(olive).lerp(stone, smooth(3, 22, h) * 0.9 + hash(x, z) * 0.06);
    tmp.toArray(gCol, i * 3);
  }
  gGeo.setAttribute('color', new THREE.Float32BufferAttribute(gCol, 3));
  gGeo.computeVertexNormals();
  const uGroundSnow = { value: 0 };
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  groundMat.onBeforeCompile = (s) => {
    s.uniforms.uSnow = uGroundSnow;
    s.fragmentShader = 'uniform float uSnow;\n' + s.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.94), uSnow);',
    );
  };
  scene.add(new THREE.Mesh(gGeo, groundMat));

  // ---------- puddles in the hollows by the house ----------
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0xb8bcc0, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const puddleGeo = new THREE.CircleGeometry(1, 28);
  puddleGeo.rotateX(-Math.PI / 2);
  for (const [x, z, sx, sz] of [[5.2, 5.5, 1.6, 0.8], [1.5, 7.4, 2.4, 1], [-3.8, 6.2, 1.2, 0.6], [8.4, 2, 1.1, 1.8], [-1.6, 10.5, 1.8, 0.7], [6.8, 9.2, 0.9, 0.5]]) {
    const m = new THREE.Mesh(puddleGeo, puddleMat);
    m.position.set(x, 0.03, z);
    m.scale.set(sx, 1, sz);
    m.rotation.y = hash(x, z) * 3;
    scene.add(m);
  }

  // ---------- house: a black timber barn with Ridge on its ridge ----------
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c2b29, roughness: 0.85 });
  const roofDark = new THREE.Color(0x1d1d1c), roofSnow = new THREE.Color(0xe8ecf1);
  const roofMat = new THREE.MeshStandardMaterial({ color: roofDark, roughness: 0.7 });
  const winMat = new THREE.MeshBasicMaterial({ color: 0x3a3f44 });
  const glassDark = new THREE.Color(0x3a3f44), glassWarm = new THREE.Color(0xf0b86a);
  const house = new THREE.Group();
  const shape = new THREE.Shape([
    new THREE.Vector2(-2.5, 0), new THREE.Vector2(2.5, 0), new THREE.Vector2(2.5, 3),
    new THREE.Vector2(0, 4.6), new THREE.Vector2(-2.5, 3),
  ]);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 7, bevelEnabled: false });
  body.rotateY(Math.PI / 2);
  body.translate(-3.5, 0, 0);
  house.add(new THREE.Mesh(body, wallMat));
  const pitch = Math.atan2(1.6, 2.5), slab = Math.hypot(2.5, 1.6) + 0.55;
  for (const side of [1, -1]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(7.7, 0.16, slab), roofMat);
    r.rotation.x = side * pitch;
    r.position.set(0, 3.84, side * 1.3);
    house.add(r);
  }
  const winGeo = new THREE.PlaneGeometry(1, 1);
  const win = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(winGeo, winMat);
    m.scale.set(w, h, 1);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    house.add(m);
  };
  // narrow glazing slots, the barn way
  for (const x of [-2.6, -2, -1.4]) win(0.36, 2.2, x, 1.3, 2.52, 0);
  win(2.4, 2.2, 1.35, 1.3, 2.52, 0);
  for (const z of [-1.3, -0.45, 0.4, 1.25]) win(0.5, 2.6 - Math.abs(z) * 0.5, 3.52, 1.55, z, Math.PI / 2);
  win(1.1, 1.6, -3.52, 1.4, 0.6, -Math.PI / 2);
  for (const x of [-1.6, 0.4]) win(1.4, 2.2, x, 1.3, -2.52, Math.PI);
  // Ridge: mast, sensor head, status LED
  const ridge = new THREE.Group();
  ridge.position.set(2.3, 4.62, 0);
  const pale = new THREE.MeshStandardMaterial({ color: 0xe9e5dc, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0x8b8a86, metalness: 0.6, roughness: 0.4 }));
  pole.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.12, 24), pale);
  head.position.y = 1.15;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), pale);
  dome.position.y = 1.21;
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xe0702e });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), ledMat);
  led.position.set(0.15, 1.15, 0.15);
  ridge.add(pole, head, dome, led);
  house.add(ridge);
  scene.add(house);
  const ridgeTop = new THREE.Vector3();

  // ---------- stones ----------
  const STONES = 140;
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a857b, roughness: 0.9, flatShading: true });
  const stoneBase = new THREE.Color(0x8a857b);
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), stoneMat, STONES);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
  for (let i = 0; i < STONES; i++) {
    const a = hash(i, 3) * Math.PI * 2, r = 6 + Math.sqrt(hash(i, 9)) * 40;
    vp.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    vp.y = heightAt(vp.x, vp.z) + 0.02;
    const s = 0.12 + Math.pow(hash(i, 5), 3) * 0.6;
    vs.set(s * (1 + hash(i, 6) * 0.6), s * 0.55, s);
    q.setFromEuler(e.set(hash(i, 1), hash(i, 2) * 6, hash(i, 4)));
    stones.setMatrixAt(i, m4.compose(vp, q, vs));
  }
  scene.add(stones);

  // ---------- instanced grass, snow mixed in the shader through its own uniform ----------
  const bladeGeo = new THREE.BufferGeometry();
  const bw = 0.055;
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute([-bw, 0, 0, bw, 0, 0, -bw * 0.6, 0.45, 0, bw * 0.6, 0.45, 0, 0, 1, 0], 3));
  bladeGeo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const grassU = {
    uTime: { value: 0 }, uWind: { value: 0 }, uSnow: { value: 0 }, uFlash: { value: 0 },
    uBase: { value: new THREE.Color(0x3f3c22) }, uTip: { value: new THREE.Color(0x968b52) },
    uLight: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color() }, uFogNear: { value: 8 }, uFogFar: { value: 620 },
  };
  const grassMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: grassU,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uWind;
      varying float vH; varying float vShade; varying float vDepth;
      void main() {
        vec3 base = instanceMatrix[3].xyz;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float h = position.y;
        float sway = sin(uTime * 1.7 + base.x * 0.35 + base.z * 0.27) * 0.6 + sin(uTime * 3.3 + base.x * 0.9) * 0.25;
        w.x += (sway * 0.16 * (0.4 + uWind) + uWind * 0.55) * h * h;
        w.z += sway * 0.07 * h * h;
        vH = h;
        vShade = 0.78 + fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453) * 0.34;
        vec4 mv = viewMatrix * w;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uLight; uniform vec3 uFogColor;
      uniform float uSnow; uniform float uFlash; uniform float uFogNear; uniform float uFogFar;
      varying float vH; varying float vShade; varying float vDepth;
      void main() {
        vec3 gBase = mix(uBase, vec3(0.60, 0.65, 0.72), uSnow * 0.86);
        vec3 gTip  = mix(uTip,  vec3(0.90, 0.94, 1.00), uSnow);  // snow lies on the tips first
        vec3 c = mix(gBase, gTip, smoothstep(0.0, 1.0, vH)) * vShade * (uLight + uFlash * 0.9);
        float f = smoothstep(uFogNear, uFogFar, vDepth);
        gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const GRASS = 46000;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, GRASS);
  for (let i = 0, made = 0; made < GRASS && i < GRASS * 3; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random() * (44 * 44 - 4.6 * 4.6) + 4.6 * 4.6);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 4.2 && Math.abs(z) < 3.2) continue;
    vp.set(x, heightAt(x, z), z);
    const s = 0.4 + Math.random() * 0.6;
    vs.set(0.8 + Math.random() * 0.6, s, 1);
    q.setFromEuler(e.set((Math.random() - 0.5) * 0.35, Math.random() * Math.PI, (Math.random() - 0.5) * 0.35));
    grass.setMatrixAt(made++, m4.compose(vp, q, vs));
  }
  grass.frustumCulled = false;
  scene.add(grass);

  // ---------- rain: one fixed pool of streaks ----------
  const wx = new THREE.Group();
  scene.add(wx);
  const rainGeo = new THREE.BufferGeometry();
  const rainAttr = new THREE.Float32BufferAttribute(new Float32Array(RAIN_N * 6), 3);
  rainAttr.setUsage(THREE.DynamicDrawUsage);
  rainGeo.setAttribute('position', rainAttr);
  const rp = rainAttr.array as Float32Array; // the attribute's own array, not the one handed in
  const drop = new Float32Array(RAIN_N * 4); // x, y, z, speed variance
  for (let i = 0; i < RAIN_N; i++) {
    drop[i * 4] = (Math.random() - 0.5) * WX_W;
    drop[i * 4 + 1] = Math.random() * WX_TOP;
    drop[i * 4 + 2] = (Math.random() - 0.5) * WX_D;
    drop[i * 4 + 3] = 0.8 + Math.random() * 0.4;
  }
  const rainMat = new THREE.LineBasicMaterial({ color: 0xeef2f6, transparent: true, opacity: 0.6, depthWrite: false });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  wx.add(rain);

  // ---------- snow: one fixed pool of flakes ----------
  const flakeTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const snowGeo = new THREE.BufferGeometry();
  const snowAttr = new THREE.Float32BufferAttribute(new Float32Array(SNOW_N * 3), 3);
  snowAttr.setUsage(THREE.DynamicDrawUsage);
  snowGeo.setAttribute('position', snowAttr);
  const sp = snowAttr.array as Float32Array;
  const flake = new Float32Array(SNOW_N * 2); // phase, speed
  for (let i = 0; i < SNOW_N; i++) {
    sp[i * 3] = (Math.random() - 0.5) * WX_W;
    sp[i * 3 + 1] = Math.random() * WX_TOP;
    sp[i * 3 + 2] = (Math.random() - 0.5) * WX_D;
    flake[i * 2] = Math.random() * Math.PI * 2;
    flake[i * 2 + 1] = 0.7 + Math.random() * 0.6;
  }
  const snowMat = new THREE.PointsMaterial({ color: 0xffffff, map: flakeTex, size: 0.13, transparent: true, depthWrite: false, opacity: 0.95 });
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  wx.add(snow);

  // ---------- splash rings: instanced short-lived sprites, spawned in proportion to rain ----------
  const splGeo = new THREE.BufferGeometry();
  const splPos = new THREE.Float32BufferAttribute(new Float32Array(SPLASH_N * 3), 3);
  const splAge = new THREE.Float32BufferAttribute(new Float32Array(SPLASH_N).fill(1), 1);
  splPos.setUsage(THREE.DynamicDrawUsage);
  splAge.setUsage(THREE.DynamicDrawUsage);
  splGeo.setAttribute('position', splPos);
  splGeo.setAttribute('aAge', splAge);
  const spP = splPos.array as Float32Array, spA = splAge.array as Float32Array;
  let splHead = 0;
  const splMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 400 }, uColor: { value: new THREE.Color(0xf2f5f8) }, uOpacity: { value: 0.7 } },
    vertexShader: /* glsl */ `
      attribute float aAge; uniform float uScale; varying float vAge;
      void main() {
        vAge = aAge;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAge >= 1.0 ? 0.0 : uScale * (0.12 + aAge * 0.38) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vAge;
      void main() {
        if (vAge >= 1.0) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        p.y *= 2.6;
        float r = length(p);
        float ring = smoothstep(0.5, 0.78, r) * (1.0 - smoothstep(0.82, 1.0, r));
        float a = ring * (1.0 - vAge) * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
  const splashes = new THREE.Points(splGeo, splMat);
  splashes.frustumCulled = false;
  scene.add(splashes);
  const hit = new THREE.Vector3();

  // ---------- state ----------
  const asked = new URLSearchParams(location.search).get('wx') as Wx | null; // deep link: ?wx=snow
  let state: Wx = asked && asked in PRESETS ? asked : 'storm';
  const cur: Look = { ...PRESETS[state], top: PRESETS[state].top.clone(), bot: PRESETS[state].bot.clone() };
  let snowPack = 0, blizClock = 0, blizK = 0, lastLook = -1;
  let pulses: { t: number; a: number }[] = [];
  let boltAge = 99, nextStrike = 1.6, lastStrikeKm = -1;
  const fogCol = new THREE.Color(), white = new THREE.Color(0xf1f3f5);

  const refreshLook = () => {
    hemi.intensity = 0.75 + 0.75 * cur.sun;
    sunL.intensity = 2.3 * cur.sun;
    fogCol.copy(cur.bot).lerp(white, blizK * 0.45);
    fog.color.copy(fogCol);
    fog.far = 620 * cur.fog * (1 - 0.62 * blizK);
    skyMat.uniforms.uTop.value.copy(cur.top).lerp(white, blizK * 0.5);
    skyMat.uniforms.uBot.value.copy(fogCol);
    grassU.uFogColor.value.copy(fogCol);
    grassU.uFogFar.value = fog.far;
    grassU.uSnow.value = snowPack;
    grassU.uLight.value.setScalar(0.62 + 0.6 * cur.sun);
    uGroundSnow.value = snowPack * 0.92;
    groundMat.roughness = 1 - 0.55 * cur.wet;
    groundMat.metalness = 0.16 * cur.wet;
    roofMat.color.copy(roofDark).lerp(roofSnow, Math.min(1, snowPack * 1.15));
    stoneMat.color.copy(stoneBase).lerp(roofSnow, snowPack * 0.85);
    puddleMat.opacity = cur.wet * 0.5;
    puddleMat.color.copy(cur.top).multiplyScalar(1.1);
    winMat.color.copy(glassDark).lerp(glassWarm, 0.15 + 0.6 * (1 - cur.sun));
  };

  const strike = (force = false) => {
    const near = Math.random(); // 0 distant … 1 close
    const s = 0.42 + near * 0.58;
    pulses = [{ t: 0, a: s }];
    let tt = 0;
    for (let i = 0, n = 1 + ((Math.random() * 2.6) | 0); i < n; i++) {
      tt += 0.05 + Math.random() * 0.14;
      pulses.push({ t: tt, a: s * (0.3 + Math.random() * 0.65) });
    }
    boltAge = 0;
    // a new side every strike — one that always comes from the same place stops reading
    const ang = Math.random() * Math.PI * 2;
    bolt.position.set(Math.cos(ang) * 80, 60 + Math.random() * 40, Math.sin(ang) * 80);
    lastStrikeKm = 0.8 + (1 - near) * 13;
    // sound arrives late, and the later it arrives the quieter it is
    window.setTimeout(() => amb.thunder(near), (0.32 + (1 - near) * 2.7) * 1000);
    if (!force) nextStrike = 2.5 + Math.random() * 6.5;
  };

  // ---------- UI wiring ----------
  const amb = new Ambience();
  const btns = [...document.querySelectorAll<HTMLButtonElement>('[data-wx]')];
  const lists = [...document.querySelectorAll<HTMLElement>('[data-actions]')];
  const stateEls = [...document.querySelectorAll<HTMLElement>('[data-state-label]')];
  const setState = (next: Wx) => {
    // enter or leave snow → the blizzard starts calm, every time
    if ((next === 'snow') !== (state === 'snow')) blizClock = 0;
    state = next;
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.wx === next)));
    lists.forEach((l) => (l.hidden = l.dataset.actions !== next));
    stateEls.forEach((el) => (el.textContent = next));
    if (next === 'storm') nextStrike = Math.min(nextStrike, 1.2);
    if (reduce) Object.assign(cur, { ...PRESETS[next], top: PRESETS[next].top.clone(), bot: PRESETS[next].bot.clone() });
  };
  btns.forEach((b) => b.addEventListener('click', () => setState(b.dataset.wx as Wx)));
  document.getElementById('wx-strike')?.addEventListener('click', () => strike(true));
  const soundBtn = document.getElementById('wx-sound');
  soundBtn?.addEventListener('click', () => {
    const on = amb.toggle();
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.querySelector('span')!.textContent = on ? 'Sound on' : 'Sound off';
  });
  setState(state);

  // drag to orbit; vertical drags still scroll the page
  let dragX: number | null = null;
  canvas.addEventListener('pointerdown', (ev) => {
    dragX = ev.clientX;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (dragX === null) return;
    baseAz -= (ev.clientX - dragX) * 0.004;
    dragX = ev.clientX;
  });
  const endDrag = () => (dragX = null);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // ---------- telemetry ----------
  const tEl = (id: string) => document.getElementById(id);
  const tRain = tEl('t-rain'), tGust = tEl('t-gust'), tTemp = tEl('t-temp'), tSnow = tEl('t-snow'), tStrike = tEl('t-strike');
  const tag = document.getElementById('ridge-tag');
  let teleT = 0;
  const telemetry = (t: number) => {
    const j = Math.sin(t * 1.3) * 0.5 + Math.sin(t * 3.7) * 0.3;
    const mmh = cur.rain * cur.speed * 9.8 + (cur.rain > 0.05 ? j * 0.4 : 0);
    const gust = 7 + cur.rain * cur.speed * cur.speed * 18 + blizK * 41 + j * 3;
    if (tRain) tRain.textContent = `${Math.max(0, mmh).toFixed(1)} mm/h`;
    if (tGust) tGust.textContent = `${Math.round(gust)} km/h`;
    if (tTemp) tTemp.textContent = `${cur.temp.toFixed(1)} °C`;
    if (tSnow) tSnow.textContent = `${Math.round(snowPack * 46)} mm`;
    if (tStrike) tStrike.textContent = lastStrikeKm < 0 ? '—' : `${lastStrikeKm.toFixed(1)} km`;
    amb.set(cur.rain * (0.6 + 0.4 * cur.speed), Math.max(blizK, (cur.speed - 1) * 1.6, cur.snow * 0.15));
  };

  // ---------- sizing / visibility ----------
  let W = 1, H = 1, visible = true;
  const resize = () => {
    W = host.clientWidth;
    H = host.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    const portrait = cam.aspect < 1;
    cam.fov = portrait ? 48 : 32;
    R = portrait ? 33 : 31;
    aimSide = portrait ? 0 : 3.6;
    aimY = portrait ? 5.2 : 2.2;
    cam.updateProjectionMatrix();
    splMat.uniforms.uScale.value = (H * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  };
  new ResizeObserver(resize).observe(host);
  resize();
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(host);

  // ---------- frame ----------
  const clock = new THREE.Clock();
  let simT = 0;
  const tick = () => {
    requestAnimationFrame(tick);
    const raw = Math.min(clock.getDelta(), 1 / 30);
    if (!visible || document.hidden) return;
    const dt = reduce ? 0 : raw;
    simT += dt;

    // ease the look toward the chosen preset
    const goal = PRESETS[state];
    const k = 1 - Math.exp(-raw * 0.9);
    cur.rain += (goal.rain - cur.rain) * k;
    cur.speed += (goal.speed - cur.speed) * k;
    cur.sun += (goal.sun - cur.sun) * k;
    cur.fog += (goal.fog - cur.fog) * k;
    cur.wet += (goal.wet - cur.wet) * k * (goal.wet > cur.wet ? 1 : 0.35); // dries slower than it wets
    cur.snow += (goal.snow - cur.snow) * k;
    cur.temp += (goal.temp - cur.temp) * k;
    cur.top.lerp(goal.top, k);
    cur.bot.lerp(goal.bot, k);

    // blizzard envelope + settled snow, each on its own clock
    if (state === 'snow') blizClock += raw;
    blizK = blizzardAt(blizClock) * cur.snow;
    const packGoal = state === 'snow' ? 1 : 0;
    snowPack += (packGoal - snowPack) * (packGoal > snowPack ? raw / 24 : raw / 13);
    if (reduce) snowPack = packGoal;

    // relight only when the slow values move
    const lk = cur.sun + cur.fog + cur.wet + cur.snow + snowPack + blizK + cur.top.r + cur.bot.g;
    if (Math.abs(lk - lastLook) > 0.006) {
      lastLook = lk;
      refreshLook();
    }

    // camera + anchored volume
    camAz = baseAz + (reduce ? 0 : Math.sin(simT * 0.05) * 0.12);
    cam.position.set(Math.sin(camAz) * R, CAM_H, Math.cos(camAz) * R);
    // aim left of the house so it sits right of the copy
    target.set(-Math.cos(camAz) * aimSide, aimY, Math.sin(camAz) * aimSide);
    cam.lookAt(target);
    sky.position.copy(cam.position);
    const fx = -Math.sin(camAz), fz = -Math.cos(camAz), ahead = WX_NEAR + WX_D / 2;
    wx.position.set(cam.position.x + fx * ahead, 0, cam.position.z + fz * ahead);
    wx.rotation.y = camAz;
    wx.updateMatrixWorld();

    // rain: density is a draw range, the storm leans on every dial
    const nRain = Math.round(RAIN_N * cur.rain);
    rainGeo.setDrawRange(0, nRain * 2);
    const fall = 26 * cur.speed;
    const slant = 0.1 * cur.speed * cur.speed; // grows faster than speed: wind, not "quicker rain"
    const len = 0.7 * cur.speed;
    for (let i = 0; i < nRain; i++) {
      const o = i * 4, v = drop[o + 3];
      let x = drop[o] + slant * fall * v * dt;
      let y = drop[o + 1] - fall * v * dt;
      const z = drop[o + 2];
      if (y < 0) {
        if (z > -8 && Math.random() < 0.55 * cur.rain) {
          hit.set(x, 0.05, z);
          wx.localToWorld(hit);
          spP[splHead * 3] = hit.x;
          spP[splHead * 3 + 1] = 0.05;
          spP[splHead * 3 + 2] = hit.z;
          spA[splHead] = 0;
          splHead = (splHead + 1) % SPLASH_N;
        }
        y += WX_TOP + Math.random() * 2;
        x = (Math.random() - 0.5) * WX_W;
      }
      if (x > WX_W / 2) x -= WX_W;
      drop[o] = x;
      drop[o + 1] = y;
      const p = i * 6, l = len * v;
      rp[p] = x;
      rp[p + 1] = y;
      rp[p + 2] = z;
      rp[p + 3] = x - slant * l;
      rp[p + 4] = y + l;
      rp[p + 5] = z;
    }
    rainAttr.needsUpdate = true;
    rain.visible = nRain > 0;
    for (let i = 0; i < SPLASH_N; i++) if (spA[i] < 1) spA[i] = Math.min(1, spA[i] + dt / 0.32);
    splPos.needsUpdate = true;
    splAge.needsUpdate = true;

    // snow: calm flakes until the envelope blows them sideways
    const nSnow = Math.round(SNOW_N * cur.snow * (0.42 + 0.58 * blizK));
    snowGeo.setDrawRange(0, nSnow);
    snow.visible = nSnow > 0;
    snowMat.size = 0.15 + blizK * 0.08;
    const sFall = 1.25 + blizK * 1.6, windX = blizK * 9;
    for (let i = 0; i < nSnow; i++) {
      const o = i * 3, ph = flake[i * 2], v = flake[i * 2 + 1];
      let x = sp[o] + (windX * v + Math.sin(simT * 0.9 + ph) * 0.5) * dt;
      let y = sp[o + 1] - sFall * v * dt;
      if (y < 0) y += WX_TOP;
      if (x > WX_W / 2) x -= WX_W;
      else if (x < -WX_W / 2) x += WX_W;
      sp[o] = x;
      sp[o + 1] = y;
      sp[o + 2] += Math.cos(simT * 0.7 + ph) * 0.3 * dt;
    }
    snowAttr.needsUpdate = true;

    // lightning: its own light, several flashes per strike
    if (state === 'storm' && !reduce) {
      nextStrike -= raw;
      if (nextStrike <= 0) strike();
    }
    boltAge += raw;
    let fv = 0;
    for (const p of pulses) if (boltAge >= p.t) fv += p.a * Math.exp(-(boltAge - p.t) / 0.085);
    if (reduce) fv *= 0.3;
    bolt.intensity = fv * 3.2;
    skyMat.uniforms.uFlash.value = fv;
    grassU.uFlash.value = fv;
    flashEl.style.opacity = Math.min(0.18, fv * 0.15).toFixed(3);

    grassU.uTime.value = simT;
    grassU.uWind.value = (cur.speed - 1) * 0.9 + blizK * 0.8;
    ledMat.color.setHex(Math.sin(simT * 4) > 0.2 || reduce ? 0xe0702e : 0x6a2f12);

    renderer.render(scene, cam);

    // Ridge tag follows the mast
    if (tag) {
      ridge.getWorldPosition(ridgeTop);
      ridgeTop.y += 1.3;
      ridgeTop.project(cam);
      tag.style.transform = `translate(${((ridgeTop.x + 1) / 2) * W}px, ${((1 - ridgeTop.y) / 2) * H}px)`;
    }
    teleT -= raw;
    if (teleT <= 0) {
      teleT = 0.25;
      telemetry(simT);
    }
  };
  tick();
};

export { boot };
