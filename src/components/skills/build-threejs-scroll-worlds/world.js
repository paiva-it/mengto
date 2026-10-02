// TERN ORBITAL — one persistent Three.js world (planet, imaging satellite, ground station,
// constellation) conducted by native scroll. Scroll owns the camera route and the planet's
// rotation under the satellite; pointer/keyboard own the instrument hotspots and the band toggle.
import * as THREE from 'three';

import { createScrollConductor } from './scroll-conductor.js';
import { ELEV_MIN, ELEV_SPAN, SEA, cloudMap, foilNormal, planetMaps, radial, ring, solarCells } from './textures.js';

// ---------- world bible constants (1 unit ≈ 640 km of planet; hardware is drawn ~1e4× oversize) ----------
const R = 10;
const SAT_Y = 11.5;
const THETA0 = -0.82; // group rotation offset → the pass starts at 47°N
const SWATH = 0.035; // half-width of the swath in unit-sphere x
const STRIP_LEAD = 0.22; // imaged strip already behind the bird when the page opens
const SUN = new THREE.Vector3(0.62, 0.6, -0.5).normalize();
const INK = new THREE.Color('#07080a');
const SKY = new THREE.Color('#5d7f9c');
const SIGNAL = new THREE.Color('#ff5b26');
const LIME = new THREE.Color('#c6f25e');

// ---------- chapter ledger: camera endpoints + world channels, one row per authored state ----------
// theta: planet rotation under the bird · beam: imaging frustum · strip: imaged swath opacity
// link: downlink beam · fleet: constellation rings · hot: instrument hotspots · sky: in-atmosphere tint
const CHAPTERS = [
  {
    id: 'orbit',
    cam: { p: [3.9, 12.75, 5.2], t: [-1.15, 10.95, -1.3], fov: 40 },
    mob: { p: [2.1, 13.2, 6.9], t: [0.2, 10.0, -0.9], fov: 58 },
    w: { theta: 0, beam: 0.6, strip: 0.9, link: 0, fleet: 0, hot: 0, sky: 0, exposure: 1.0 },
  },
  {
    id: 'instrument',
    cam: { p: [1.55, 11.92, 1.75], t: [-0.42, 11.38, 0.02], fov: 36 },
    mob: { p: [0.95, 12.1, 2.85], t: [0.05, 11.05, 0], fov: 56 },
    w: { theta: 0.1, beam: 0.08, strip: 0.85, link: 0, fleet: 0, hot: 1, sky: 0, exposure: 1.08 },
  },
  {
    id: 'swath',
    cam: { p: [0.55, 13.3, 3.6], t: [-0.65, 9.8, -1.6], fov: 46 },
    mob: { p: [0.5, 13.0, -3.4], t: [0, 9.4, -0.4], fov: 70 }, // from ahead: the strip recedes up the frame, above the copy
    w: { theta: 0.3, beam: 1, strip: 1, link: 0, fleet: 0, hot: 0, sky: 0, exposure: 1.0 },
  },
  {
    id: 'downlink',
    cam: null, // composed from the ground station's position at this chapter (see below)
    mob: null,
    w: { theta: 0.55, beam: 0.15, strip: 0.95, link: 1, fleet: 0, hot: 0, sky: 1, exposure: 1.02 },
  },
  {
    id: 'constellation',
    cam: { p: [17, 19, 27], t: [-4.2, 1.2, 0], fov: 40 },
    mob: { p: [16, 26, 42], t: [0, -3.5, 0], fov: 52 },
    w: { theta: 0.85, beam: 0, strip: 0.55, link: 0, fleet: 1, hot: 0, sky: 0, exposure: 1.0 },
  },
  {
    id: 'task',
    cam: { p: [-6.6, 8.25, 31.4], t: [-4.6, -0.6, -1], fov: 42 },
    mob: { p: [-7, 9, 34], t: [0, -5.5, 0], fov: 56 },
    w: { theta: 1.25, beam: 0, strip: 0.3, link: 0, fleet: 0.35, hot: 0, sky: 0, exposure: 1.12 },
  },
];

const HOTSPOTS = [
  { id: 'aperture', pos: [0, -0.5, 0] },
  { id: 'arrays', pos: [0.5, 0.02, 0] },
  { id: 'tracker', pos: [0.09, 0.3, -0.09] },
  { id: 'antenna', pos: [0.13, -0.3, 0.11] },
];

const nadirPhi = (theta) => -(theta + THETA0);
const lerp = THREE.MathUtils.lerp;
const ease = (t) => lerp(t, t * t * (3 - 2 * t), 0.7);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

// ---------- shaders ----------
const NOISE = /* glsl */ `
  float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x){
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm3(vec3 p){ return (vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.25 + vnoise(p * 4.07) * 0.125) / 0.875; }
  // coast = smooth elevation + fine noise, faded with screen-space footprint so it never aliases
  float landMask(float elevTex, vec3 p){
    float far = clamp(length(fwidth(p)) * 140.0 - 0.15, 0.0, 1.0);
    float e = elevTex * ${ELEV_SPAN.toFixed(3)} + ${ELEV_MIN.toFixed(3)} + (fbm3(p * 90.0) - 0.5) * 0.03 * (1.0 - far);
    float w = max(0.0015, fwidth(e) * 1.5);
    return smoothstep(${SEA.toFixed(4)} - w, ${SEA.toFixed(4)} + w, e);
  }
`;
const lin = (h) => new THREE.Color(h).toArray().map((v) => v.toFixed(4)).join(', ');

// Coastline, ocean depth, sea ice and fine land grain are resolved per fragment so the
// surface stays crisp from orbit down to the ground-station close-up.
const planetSurface = (sh, elevTex) => {
  sh.uniforms.uElev = { value: elevTex };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vPosL;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPosL = position;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vPosL;\nuniform sampler2D uElev;\nfloat terrain;\n${NOISE}`)
    .replace('#include <map_fragment>', `
      vec3 landC = texture2D(map, vMapUv).rgb;
      float eT = texture2D(uElev, vMapUv).r;
      terrain = landMask(eT, vPosL);
      float depth = ${SEA.toFixed(3)} - (eT * ${ELEV_SPAN.toFixed(3)} + ${ELEV_MIN.toFixed(3)});
      vec3 ocean = mix(vec3(${lin('#18505a')}), vec3(${lin('#061a24')}), smoothstep(0.0, 0.07, depth));
      ocean = mix(ocean, vec3(${lin('#e6ebec')}), smoothstep(0.958, 0.982, abs(normalize(vPosL).z)) * 0.9);
      float grain = mix(0.86 + 0.28 * fbm3(vPosL * 420.0), 1.0, clamp(length(fwidth(vPosL)) * 600.0, 0.0, 1.0));
      diffuseColor.rgb = mix(ocean, landC * grain, terrain);
    `)
    .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.36, 0.93, terrain);');
};

const stripShader = {
  uniforms: {
    uColor: { value: null },
    uElev: { value: null },
    uNadir: { value: 0 },
    uLen: { value: 0.2 },
    uOpacity: { value: 1 },
    uBand: { value: new THREE.Vector3(1, 0, 0) },
    uSun: { value: SUN },
    uTime: { value: 0 },
    uSignal: { value: SIGNAL },
  },
  vertexShader: /* glsl */ `
    varying vec3 vLocal; varying vec3 vWN; varying vec2 vUv;
    void main(){
      vLocal = position; vUv = uv;
      vWN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uColor, uElev; uniform float uNadir, uLen, uOpacity, uTime; uniform vec3 uBand, uSun, uSignal;
    varying vec3 vLocal; varying vec3 vWN; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    ${NOISE}
    void main(){
      vec3 n = normalize(vLocal);
      float ax = abs(n.x);
      float hw = ${SWATH.toFixed(4)};
      float inSw = 1.0 - smoothstep(hw - 0.0012, hw, ax);
      float d = mod(atan(n.z, n.y) - uNadir + 6.2831853, 6.2831853);
      if (d > 3.14159) d -= 6.2831853;
      float along = step(0.0, d) * (1.0 - smoothstep(uLen - 0.3, uLen, d));
      float a = inSw * along * uOpacity;
      if (a < 0.004) discard;
      vec3 base = texture2D(uColor, vUv).rgb;
      float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
      float veg = clamp((base.g - base.r) * 9.0 + 0.35, 0.0, 1.0);
      float water = 1.0 - landMask(texture2D(uElev, vUv).r, vLocal);
      base = mix(base, vec3(0.006, 0.03, 0.045), water);
      vec3 truec = pow(base * 1.9, vec3(0.92));
      vec3 nir = mix(vec3(lum * 2.2, lum * 1.9, lum * 2.4), vec3(0.95, 0.12, 0.08) * (0.55 + lum * 3.0), veg);
      nir = mix(nir, vec3(0.01, 0.015, 0.03), water);
      vec2 cell = floor(vec2(ax, d) / 0.0011);
      float speck = 0.55 + 0.9 * hash(cell);
      vec3 sar = vec3(mix(0.5 + lum * 1.4, 0.03, water) * speck) * 0.55;
      vec3 col = truec * uBand.x + nir * uBand.y + sar * uBand.z;
      float day = smoothstep(-0.12, 0.35, dot(normalize(vWN), uSun));
      col *= 0.18 + 0.82 * day;
      // product framing: line grid, swath edges, and the pushbroom line at nadir
      vec2 g = abs(fract(vec2(ax, d) / 0.006) - 0.5);
      float grid = (1.0 - smoothstep(0.0, 0.04, min(g.x, g.y))) * 0.22;
      float edge = smoothstep(hw - 0.0022, hw - 0.0006, ax);
      float scan = 1.0 - smoothstep(0.0, 0.0045, d);
      col = mix(col, uSignal, max(edge * 0.9, grid * 0.5));
      col += uSignal * scan * 3.0;
      gl_FragColor = vec4(col, a * max(0.82, edge) * mix(0.2, 1.0, day));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const lightsShader = {
  uniforms: { uLights: { value: null }, uElev: { value: null }, uSun: { value: SUN }, uGain: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec3 vWN; varying vec2 vUv; varying vec3 vLocal;
    void main(){ vUv = uv; vLocal = position; vWN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uLights, uElev; uniform vec3 uSun; uniform float uGain;
    varying vec3 vWN; varying vec2 vUv; varying vec3 vLocal;
    ${NOISE}
    void main(){
      float night = smoothstep(0.08, -0.22, dot(normalize(vWN), uSun));
      float l = pow(texture2D(uLights, vUv).r, 2.2) * landMask(texture2D(uElev, vUv).r, vLocal);
      gl_FragColor = vec4(vec3(1.0, 0.55, 0.22) * l * night * 1.6 * uGain, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const atmoShader = {
  uniforms: { uSun: { value: SUN }, uFade: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec3 vVN; varying vec3 vWN;
    void main(){ vVN = normalize(normalMatrix * normal); vWN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uSun; uniform float uFade;
    varying vec3 vVN; varying vec3 vWN;
    void main(){
      float rim = pow(clamp(-vVN.z / 0.3, 0.0, 1.0), 3.2);
      float s = dot(normalize(vWN), uSun);
      vec3 day = vec3(0.36, 0.62, 1.0);
      vec3 dusk = vec3(1.0, 0.42, 0.16);
      vec3 col = mix(dusk, day, smoothstep(-0.05, 0.45, s)) * smoothstep(-0.38, 0.08, s);
      gl_FragColor = vec4(col * rim * 0.75 * uFade, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const beamShader = {
  uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uColor: { value: SIGNAL } },
  vertexShader: /* glsl */ `
    varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uTime, uOpacity; uniform vec3 uColor; varying vec2 vUv;
    void main(){
      float down = 1.0 - vUv.y;
      float bands = 0.55 + 0.45 * smoothstep(0.6, 1.0, sin((vUv.y * 26.0 + uTime * 5.0)));
      float a = (0.08 + 0.42 * pow(down, 2.0)) * bands * uOpacity;
      gl_FragColor = vec4(uColor * a, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

const linkShader = {
  uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: LIME } },
  vertexShader: beamShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform float uTime, uOpacity; uniform vec3 uColor; varying vec2 vUv;
    void main(){
      float dash = smoothstep(0.35, 0.5, fract(vUv.y * 18.0 + uTime * 1.6));
      gl_FragColor = vec4(uColor * (0.25 + 1.6 * dash) * uOpacity, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// ---------- builders ----------
const tex = (canvas, srgb = true) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  return t;
};

const buildSatellite = (foil, cells) => {
  const sat = new THREE.Group();
  sat.name = 'tern-7';
  const gold = new THREE.MeshStandardMaterial({ color: '#c8913a', metalness: 1, roughness: 0.32, normalMap: foil, normalScale: new THREE.Vector2(0.45, 0.45) });
  const silver = new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: 1, roughness: 0.26, normalMap: foil, normalScale: new THREE.Vector2(0.45, 0.45) });
  const white = new THREE.MeshStandardMaterial({ color: '#e7e4dc', metalness: 0, roughness: 0.55 });
  const black = new THREE.MeshStandardMaterial({ color: '#0b0c0e', metalness: 0.2, roughness: 0.7 });
  const frame = new THREE.MeshStandardMaterial({ color: '#8a8e93', metalness: 0.9, roughness: 0.35 });
  const cell = new THREE.MeshStandardMaterial({ map: cells, metalness: 0.55, roughness: 0.24 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1a1410', metalness: 0.3, roughness: 0.08, emissive: '#ff5b26', emissiveIntensity: 0.35 });
  const add = (geo, mat, x, y, z, parent = sat) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(0.34, 0.38, 0.32), gold, 0, 0, 0);
  add(new THREE.BoxGeometry(0.36, 0.022, 0.34), white, 0, 0.2, 0);
  add(new THREE.BoxGeometry(0.36, 0.022, 0.34), white, 0, -0.2, 0);
  add(new THREE.BoxGeometry(0.28, 0.3, 0.012), silver, 0, 0, 0.166); // radiator
  add(new THREE.BoxGeometry(0.012, 0.3, 0.24), silver, -0.176, 0, 0);
  // telescope: white baffle, black throat, glowing focal plane, slanted sunshade lip
  add(new THREE.CylinderGeometry(0.125, 0.125, 0.3, 40, 1, true), white, 0, -0.36, 0);
  add(new THREE.CylinderGeometry(0.118, 0.118, 0.3, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#050506', side: THREE.BackSide, roughness: 0.9 }), 0, -0.36, 0);
  add(new THREE.TorusGeometry(0.122, 0.008, 8, 40), frame, 0, -0.51, 0).rotation.x = Math.PI / 2;
  add(new THREE.CircleGeometry(0.115, 40), glass, 0, -0.27, 0).rotation.x = Math.PI / 2;
  const lip = add(new THREE.BoxGeometry(0.26, 0.005, 0.14), white, 0, -0.52, -0.12);
  lip.rotation.x = -0.5;
  // star trackers on the top deck
  for (const sx of [1, -1]) {
    const st = new THREE.Group();
    st.position.set(0.09 * sx, 0.25, -0.09);
    st.rotation.set(-0.5, 0, -0.45 * sx);
    sat.add(st);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 20), black, 0, 0, 0, st);
    add(new THREE.CylinderGeometry(0.05, 0.032, 0.06, 20, 1, true), white, 0, 0.06, 0, st);
  }
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 6), frame, -0.12, 0.36, 0.12); // whip antenna
  // gimballed X-band dish under the bus
  const arm = add(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 10), frame, 0.13, -0.25, 0.11);
  arm.rotation.z = 0.4;
  const dishPts = [];
  for (let i = 0; i <= 10; i += 1) {
    const r = (i / 10) * 0.07;
    dishPts.push(new THREE.Vector2(r, r * r * 5));
  }
  const xdish = add(new THREE.LatheGeometry(dishPts, 28), new THREE.MeshStandardMaterial({ color: '#e8e5de', roughness: 0.45, side: THREE.DoubleSide }), 0.15, -0.31, 0.12);
  xdish.rotation.set(Math.PI - 0.5, 0, 0.4);
  // thrusters
  for (const [x, z] of [[0.14, 0.13], [-0.14, 0.13], [0.14, -0.13], [-0.14, -0.13]]) {
    add(new THREE.ConeGeometry(0.018, 0.04, 12, 1, true), frame, x, -0.23, z).rotation.x = Math.PI;
  }
  // solar wings, canted toward the sun
  const wingMat = [frame, frame, cell, white, frame, frame];
  for (const sx of [1, -1]) {
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10), frame, 0.25 * sx, 0.02, 0).rotation.z = Math.PI / 2;
    const wing = new THREE.Group();
    wing.position.set(0.68 * sx, 0.02, 0);
    wing.rotation.x = -0.62;
    sat.add(wing);
    add(new THREE.BoxGeometry(0.72, 0.012, 0.3), wingMat, 0, 0, 0, wing);
    for (const x of [-0.12, 0.12]) add(new THREE.BoxGeometry(0.008, 0.016, 0.3), frame, x, 0, 0, wing);
  }
  return sat;
};

const buildStation = () => {
  const g = new THREE.Group();
  const concrete = new THREE.MeshStandardMaterial({ color: '#8a867d', roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: '#c9c7c0', roughness: 0.6, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: '#9ca0a5', metalness: 0.85, roughness: 0.35 });
  const add = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(0.42, 0.46, 0.04, 40), concrete, 0, 0.0, 0);
  const dishProfile = (r0, k) => {
    const pts = [];
    for (let i = 0; i <= 14; i += 1) {
      const r = (i / 14) * r0;
      pts.push(new THREE.Vector2(r, r * r * k));
    }
    return new THREE.LatheGeometry(pts, 40).rotateX(Math.PI / 2);
  };
  const makeDish = (x, z, r0, h) => {
    add(new THREE.CylinderGeometry(0.02, 0.034, h, 14), white, x, h / 2 + 0.02, z);
    const head = new THREE.Group();
    head.position.set(x, h + 0.04, z);
    g.add(head);
    add(dishProfile(r0, 2.4 / r0), white, 0, 0, -0.02, head);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const s = add(new THREE.CylinderGeometry(0.003, 0.003, r0 * 1.15, 6), metal, Math.cos(a) * r0 * 0.45, Math.sin(a) * r0 * 0.45, r0 * 0.5, head);
      s.lookAt(head.localToWorld(new THREE.Vector3(0, 0, r0 * 1.1)));
      s.rotateX(Math.PI / 2);
    }
    add(new THREE.CylinderGeometry(0.012, 0.018, 0.04, 12), metal, 0, 0, r0 * 1.05, head).rotation.x = Math.PI / 2;
    return head;
  };
  const main = makeDish(0, 0, 0.17, 0.16);
  const s1 = makeDish(0.27, -0.16, 0.07, 0.07);
  const s2 = makeDish(-0.25, 0.2, 0.06, 0.06);
  s1.rotation.set(-0.9, 0.6, 0);
  s2.rotation.set(-1.1, -0.8, 0);
  add(new THREE.BoxGeometry(0.2, 0.07, 0.11), new THREE.MeshStandardMaterial({ color: '#d6d2c8', roughness: 0.8 }), -0.2, 0.055, -0.22);
  add(new THREE.BoxGeometry(0.16, 0.012, 0.004), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffcf8a', emissiveIntensity: 2.2 }), -0.2, 0.06, -0.164);
  return { group: g, main };
};

// ---------- mount ----------
const mount = ({ canvas, sections, ui }) => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const shot = new URLSearchParams(location.search).has('shot');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    ui.fallback('WebGL is unavailable here, so the orbit is shown as a still frame. The story below is complete.');
    return null;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  scene.background = INK.clone();
  scene.fog = new THREE.FogExp2(SKY.clone(), 0);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 1200);

  // scene graph
  const worldRoot = new THREE.Group();
  const environment = new THREE.Group();
  const landmarks = new THREE.Group();
  const interactives = new THREE.Group();
  const atmosphere = new THREE.Group();
  worldRoot.add(environment, landmarks, interactives, atmosphere);
  scene.add(worldRoot);

  // light roles: sun key, earthshine fill from below, faint space ambient
  const sunLight = new THREE.DirectionalLight('#fff2e2', 3.4);
  sunLight.position.copy(SUN).multiplyScalar(50);
  // earthshine fill on the hardware comes from its environment map, not a light (a light would also hit the ocean)
  scene.add(sunLight, new THREE.AmbientLight('#20242c', 0.35));

  // stars
  {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i += 1) {
      const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * s * 600, u * 600, Math.sin(a) * s * 600], i * 3);
      const b = 0.25 + Math.pow(rnd(), 3) * 0.95, warm = rnd();
      col.set([b * (0.85 + warm * 0.2), b * 0.92, b * (1.05 - warm * 0.2)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    environment.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, fog: false, depthWrite: false })));
  }
  const stars = environment.children[0];

  // sun disc + glare: billboarded far along SUN, occluded by the planet
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(radial([[0, 'rgba(255,250,240,1)'], [0.07, 'rgba(255,236,210,0.95)'], [0.2, 'rgba(255,170,110,0.28)'], [0.5, 'rgba(255,120,60,0.06)'], [1, 'rgba(0,0,0,0)']], 256)), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
  sunSprite.scale.setScalar(70);
  environment.add(sunSprite);

  // planet: generated maps → shared sphere geometry with its pole baked onto +Z
  const maps = planetMaps();
  const colorTex = tex(maps.color);
  const elevTex = tex(maps.elev, false);
  const lightsTex = tex(maps.lights, false);
  const cloudTex = tex(cloudMap(), false);
  const sphere = new THREE.SphereGeometry(1, 160, 110).rotateX(Math.PI / 2);
  const planet = new THREE.Group();
  planet.name = 'planet';
  landmarks.add(planet);
  const surfaceMat = new THREE.MeshStandardMaterial({ map: colorTex, roughness: 1, metalness: 0 });
  surfaceMat.onBeforeCompile = (sh) => planetSurface(sh, elevTex);
  const surface = new THREE.Mesh(sphere, surfaceMat);
  surface.scale.setScalar(R);
  planet.add(surface);

  const stripMat = new THREE.ShaderMaterial({ ...stripShader, transparent: true, depthWrite: false });
  stripMat.uniforms.uColor.value = colorTex;
  stripMat.uniforms.uElev.value = elevTex;
  const strip = new THREE.Mesh(sphere, stripMat);
  strip.scale.setScalar(R * 1.0015);
  strip.renderOrder = 2;
  planet.add(strip);

  const lightsMat = new THREE.ShaderMaterial({ ...lightsShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  lightsMat.uniforms.uLights.value = lightsTex;
  lightsMat.uniforms.uElev.value = elevTex;
  const cityLights = new THREE.Mesh(sphere, lightsMat);
  cityLights.scale.setScalar(R * 1.001);
  planet.add(cityLights);

  const clouds = new THREE.Mesh(sphere, new THREE.MeshStandardMaterial({ color: '#ffffff', alphaMap: cloudTex, transparent: true, depthWrite: false, roughness: 1 }));
  clouds.scale.setScalar(R * 1.012);
  clouds.renderOrder = 3;
  planet.add(clouds);

  const atmoMat = new THREE.ShaderMaterial({ ...atmoShader, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.045, 96, 64), atmoMat);
  atmosphere.add(atmo);

  // hardware reflects a small authored environment (black sky, blue earth below, the sun),
  // so the foil and arrays read as metal instead of black voids
  const env = (() => {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { uSun: { value: SUN } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uSun; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = mix(vec3(0.01, 0.012, 0.018), vec3(0.09, 0.2, 0.32), smoothstep(0.05, -0.4, d.y));
          col += vec3(1.0, 0.55, 0.3) * 0.22 * exp(-abs(d.y + 0.1) * 16.0);
          float s = max(dot(d, uSun), 0.0);
          col += vec3(1.0, 0.94, 0.84) * (pow(s, 220.0) * 70.0 + pow(s, 8.0) * 0.3);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })));
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.015);
    pmrem.dispose();
    return rt.texture;
  })();
  const withEnv = (root) => root.traverse((o) => {
    (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach((m) => {
      if (m.isMeshStandardMaterial) m.envMap = env;
    });
  });

  // satellite, fixed in world space: the planet turns beneath it
  const sat = buildSatellite(tex(foilNormal(), false), tex(solarCells()));
  sat.position.set(0, SAT_Y, 0);
  withEnv(sat);
  interactives.add(sat); // the bird carries the hotspot proxies

  const beamGeo = new THREE.CylinderGeometry(0.004, 1, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, -0.5, 0);
  const beamMat = new THREE.ShaderMaterial({ ...beamShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, SAT_Y - 0.52, 0);
  beam.scale.set((SWATH * R) / Math.SQRT1_2, SAT_Y - 0.52 - R, 0.012 / Math.SQRT1_2);
  atmosphere.add(beam);

  // ground station, carried by the planet; its local direction is chosen to sit beside
  // the track exactly when the downlink chapter is composed
  const thetaD = CHAPTERS[3].w.theta;
  const stLocalPhi = nadirPhi(thetaD) + 0.13;
  const stDir = new THREE.Vector3(0.085, Math.cos(stLocalPhi), Math.sin(stLocalPhi)).normalize();
  const station = buildStation();
  withEnv(station.group);
  station.group.scale.setScalar(0.42);
  station.group.position.copy(stDir).multiplyScalar(R * 1.0005);
  station.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stDir);
  planet.add(station.group);
  const stationGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(radial([[0, 'rgba(198,242,94,1)'], [0.25, 'rgba(198,242,94,0.35)'], [1, 'rgba(0,0,0,0)']])), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  stationGlow.scale.setScalar(1.1);
  stationGlow.position.set(0, 0.45, 0);
  station.group.add(stationGlow);

  const linkGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 8, 1, true).translate(0, 0.5, 0);
  const linkMat = new THREE.ShaderMaterial({ ...linkShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const link = new THREE.Mesh(linkGeo, linkMat);
  atmosphere.add(link);

  // compose the downlink endpoint from the station's world position at thetaD
  {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), thetaD + THETA0);
    const st = stDir.clone().applyQuaternion(q).multiplyScalar(R);
    const up = st.clone().normalize();
    const back = new THREE.Vector3(0.55, 0, 1).normalize();
    const p = st.clone().addScaledVector(back, 0.62).addScaledVector(up, 0.2);
    const t = st.clone().lerp(new THREE.Vector3(0, SAT_Y, 0), 0.55).add(new THREE.Vector3(0.55, 0, 0));
    CHAPTERS[3].cam = { p: p.toArray(), t: t.toArray(), fov: 52 };
    const pm = st.clone().addScaledVector(back, 1.25).addScaledVector(up, 0.36);
    const tm = st.clone().lerp(new THREE.Vector3(0, SAT_Y, 0), 0.22);
    CHAPTERS[3].mob = { p: pm.toArray(), t: tm.toArray(), fov: 72 };
  }

  // constellation: 6 planes × 2 birds, all sharing the polar axis (+Z)
  const fleet = new THREE.Group();
  atmosphere.add(fleet);
  const dotTex = tex(radial([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,214,190,0.75)'], [0.5, 'rgba(255,91,38,0.14)'], [1, 'rgba(0,0,0,0)']]));
  const birds = [];
  const ringPts = new THREE.EllipseCurve(0, 0, SAT_Y, SAT_Y).getPoints(220).map((v) => new THREE.Vector3(0, v.x, v.y));
  for (let k = 0; k < 6; k += 1) {
    const plane = new THREE.Group();
    plane.rotation.z = (k / 6) * Math.PI;
    fleet.add(plane);
    const lineMat = new THREE.LineBasicMaterial({ color: k === 0 ? SIGNAL : '#ece9e1', transparent: true, opacity: 0, depthWrite: false, fog: false });
    plane.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), lineMat));
    for (let j = 0; j < 2; j += 1) {
      if (k === 0 && j === 0) continue; // that one is Tern-7, the modelled bird
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
      s.scale.setScalar(1.1);
      plane.add(s);
      birds.push({ s, phase: j * Math.PI + k * 0.9 + Math.PI / 2 });
    }
  }
  const fleetLines = fleet.children.map((p) => p.children[0]);

  // hotspots: invisible proxies for raycasting + halos that read in both themes of the frame
  const ringTex = tex(ring());
  const raycaster = new THREE.Raycaster();
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  const hot = new Map();
  for (const h of HOTSPOTS) {
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), proxyMat);
    proxy.position.fromArray(h.pos);
    proxy.userData.id = h.id;
    sat.add(proxy);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, color: '#ece9e1', transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
    halo.position.fromArray(h.pos);
    halo.renderOrder = 10;
    sat.add(halo);
    hot.set(h.id, { proxy, halo, state: 'unavailable', scale: 0.08 });
  }
  const proxies = [...hot.values()].map((h) => h.proxy);

  // ---------- camera curves (desktop / portrait compositions) ----------
  let curves = null;
  let portrait = false;
  const buildCurves = () => {
    portrait = innerWidth / innerHeight < 0.8;
    const ends = CHAPTERS.map((c) => (portrait && c.mob ? c.mob : c.cam));
    curves = {
      p: new THREE.CatmullRomCurve3(ends.map((e) => new THREE.Vector3(...e.p)), false, 'centripetal', 0.5),
      t: new THREE.CatmullRomCurve3(ends.map((e) => new THREE.Vector3(...e.t)), false, 'centripetal', 0.5),
      fov: ends.map((e) => e.fov),
    };
  };

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, fine ? 2 : 1.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    buildCurves();
    needs = true;
  };

  // ---------- interactions (FSM per hotspot, mirrored by DOM buttons) ----------
  let hovered = null;
  let active = null;
  let available = false;
  const setHot = (id, next) => {
    const h = hot.get(id);
    if (!h || h.state === next) return;
    h.state = next;
    ui.hotspot(id, next);
    needs = true;
  };
  const refreshHot = () => {
    for (const id of hot.keys()) {
      if (!available) setHot(id, 'unavailable');
      else if (id === active) setHot(id, 'active');
      else if (id === hovered) setHot(id, 'hover');
      else setHot(id, 'idle');
    }
  };
  const activate = (id) => {
    if (!available) return;
    active = active === id ? null : id;
    refreshHot();
  };
  const hover = (id) => {
    if (hovered === id) return;
    hovered = id;
    refreshHot();
  };

  const pointer = new THREE.Vector2(9, 9);
  const parallax = new THREE.Vector2();
  const parallaxTarget = new THREE.Vector2();
  let pointerDirty = false;
  const onPointerMove = (e) => {
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (fine && !reduce) parallaxTarget.copy(pointer).clampScalar(-1, 1);
    pointerDirty = !e.target.closest('a,button,input,label,.copy');
    if (!pointerDirty && hovered) hover(null);
  };
  const onClick = (e) => {
    if (hovered && !e.target.closest('a,button,input,label')) activate(hovered);
  };
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('click', onClick);

  // ---------- world state ----------
  let bandTarget = new THREE.Vector3(1, 0, 0);
  const band = new THREE.Vector3(1, 0, 0);
  const setBand = (i) => {
    bandTarget = new THREE.Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
    if (reduce) band.copy(bandTarget);
    needs = true;
  };

  const channel = (prog, key) => {
    const last = CHAPTERS.length - 1;
    const i = Math.min(last, Math.max(0, Math.floor(prog)));
    const j = Math.min(last, i + 1);
    return lerp(CHAPTERS[i].w[key], CHAPTERS[j].w[key], ease(prog - i));
  };

  const pos = new THREE.Vector3();
  const tgt = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let time = 0;
  let lastProg = -1;
  let needs = true;
  let chapter = -1;

  const applyWorld = (prog) => {
    const last = CHAPTERS.length - 1;
    const i = Math.min(last, Math.floor(prog));
    const u = (i + ease(prog - i)) / last;
    curves.p.getPoint(Math.min(1, u), pos);
    curves.t.getPoint(Math.min(1, u), tgt);
    const j = Math.min(last, i + 1);
    let fov = lerp(curves.fov[i], curves.fov[j], ease(prog - i));
    // tall-viewport pullback for aspects between the two authored compositions
    const tall = portrait ? 0 : Math.max(0, innerHeight / innerWidth - 0.68);
    if (tall) {
      tmp.subVectors(pos, tgt).normalize();
      pos.addScaledVector(tmp, tall * 1.4);
      fov += tall * 10;
    }
    // pointer micro-parallax on the input rig, never written into waypoints
    if (parallax.lengthSq() > 1e-6) {
      tmp.subVectors(tgt, pos);
      const dist = tmp.length();
      tmp2.crossVectors(tmp, camera.up).normalize();
      pos.addScaledVector(tmp2, parallax.x * dist * 0.012);
      pos.y += parallax.y * dist * 0.008;
    }
    if (pos.length() < R + 0.3) pos.setLength(R + 0.3); // collision guard against the planet
    camera.position.copy(pos);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.lookAt(tgt);

    const theta = channel(prog, 'theta');
    planet.rotation.x = theta + THETA0;
    const nadir = nadirPhi(theta);
    stripMat.uniforms.uNadir.value = nadir;
    stripMat.uniforms.uLen.value = nadirPhi(0) + STRIP_LEAD - nadir;
    stripMat.uniforms.uOpacity.value = channel(prog, 'strip');
    stripMat.uniforms.uBand.value.copy(band);
    beamMat.uniforms.uOpacity.value = channel(prog, 'beam');
    beam.visible = beamMat.uniforms.uOpacity.value > 0.01;

    // downlink: antenna on the bird → main dish, which tracks the bird
    const lk = channel(prog, 'link');
    linkMat.uniforms.uOpacity.value = lk;
    link.visible = lk > 0.01;
    planet.updateMatrixWorld(true);
    station.main.lookAt(sat.position);
    station.main.getWorldPosition(tmp);
    sat.localToWorld(tmp2.fromArray(HOTSPOTS[3].pos));
    link.position.copy(tmp);
    tmp2.sub(tmp);
    link.scale.set(1, tmp2.length(), 1);
    link.quaternion.setFromUnitVectors(UP, tmp2.normalize());
    stationGlow.material.opacity = lk * 0.6;
    stationGlow.visible = lk > 0.01;
    station.group.visible = pos.length() < 16;

    const sky = channel(prog, 'sky');
    // the sky reads only while the camera is inside the atmosphere
    const inside = THREE.MathUtils.smoothstep(R * 1.09, R * 1.03, pos.length()) * sky;
    scene.background.copy(INK).lerp(SKY, inside * 0.85);
    scene.fog.density = inside * 0.07;
    stars.material.opacity = 1 - inside;
    atmoMat.uniforms.uFade.value = 1 - inside;
    sunSprite.position.copy(pos).addScaledVector(SUN, 400);
    sunSprite.material.opacity = 1 - inside * 0.4;
    renderer.toneMappingExposure = channel(prog, 'exposure');

    const fl = channel(prog, 'fleet');
    fleetLines.forEach((l, k) => { l.material.opacity = fl * (k === 0 ? 0.85 : 0.28); });
    for (const b of birds) b.s.material.opacity = fl;
    fleet.visible = fl > 0.01;

    const hv = channel(prog, 'hot');
    for (const h of hot.values()) {
      const target = h.state === 'active' ? 0.16 : h.state === 'hover' ? 0.13 : 0.085;
      h.scale = reduce ? target : damp(h.scale, target, 12, 1 / 60);
      h.halo.scale.setScalar(h.scale);
      h.halo.material.opacity = hv * (h.state === 'idle' ? 0.75 : 1);
      h.halo.material.color.set(h.state === 'active' || h.state === 'hover' ? SIGNAL : '#ece9e1');
      h.halo.visible = hv > 0.01;
    }

    ui.telemetry(theta, prog);
  };

  const ambient = (dt) => {
    time += dt;
    clouds.rotation.z = time * 0.006;
    beamMat.uniforms.uTime.value = time;
    linkMat.uniforms.uTime.value = time;
    sat.rotation.set(Math.sin(time * 0.31) * 0.012, Math.sin(time * 0.23) * 0.02, Math.sin(time * 0.17) * 0.01);
    for (const b of birds) {
      const a = b.phase + time * 0.035;
      b.s.position.set(0, Math.cos(a) * SAT_Y, Math.sin(a) * SAT_Y);
    }
    parallax.x = damp(parallax.x, parallaxTarget.x, 3, dt);
    parallax.y = damp(parallax.y, parallaxTarget.y, 3, dt);
  };

  const conductor = createScrollConductor({ sections, damping: 5.2, reducedMotion: reduce });

  const clock = new THREE.Clock();
  let raf = 0;
  const frame = () => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 1 / 30);
    const s = conductor.getState();
    const exactIndex = Math.round(s.exact);
    if (exactIndex !== chapter) {
      chapter = exactIndex;
      available = chapter === 1;
      if (!available) active = null;
      refreshHot();
      ui.chapter(chapter);
    }
    // reduced motion snaps the world to the nearest composed chapter
    const prog = reduce ? exactIndex : s.smooth;
    if (!reduce) {
      ambient(dt);
      band.x = damp(band.x, bandTarget.x, 5, dt);
      band.y = damp(band.y, bandTarget.y, 5, dt);
      band.z = damp(band.z, bandTarget.z, 5, dt);
    } else {
      band.copy(bandTarget);
      if (time === 0) ambient(0);
    }
    if (available && pointerDirty) {
      pointerDirty = false;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(proxies, false)[0];
      hover(hit ? hit.object.userData.id : null);
      document.documentElement.style.cursor = hit ? 'pointer' : '';
    } else if (!available && hovered) {
      hover(null);
      document.documentElement.style.cursor = '';
    }
    if (reduce && !needs && prog === lastProg) return;
    lastProg = prog;
    needs = false;
    applyWorld(prog);
    renderer.render(scene, camera);
  };

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('resize', resize);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
    ui.fallback('The 3D orbit paused when the graphics context was lost. The story below is complete.');
  });

  resize();
  conductor.start();
  if (location.hash) {
    const i = CHAPTERS.findIndex((c) => `#${c.id}` === location.hash);
    if (i >= 0) conductor.goTo(i, 'auto');
  }
  if (shot) time = 6;
  frame();
  ui.ready();

  return {
    goTo: (i) => conductor.goTo(i),
    activate,
    hover: (id) => available && hover(id),
    setBand,
    destroy: () => {
      cancelAnimationFrame(raf);
      conductor.destroy();
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('click', onClick);
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((o) => {
        o.geometry?.dispose();
        const m = o.material;
        (Array.isArray(m) ? m : m ? [m] : []).forEach((mm) => {
          Object.values(mm).forEach((v) => v?.isTexture && v.dispose());
          mm.dispose();
        });
      });
      renderer.dispose();
    },
  };
};

export { CHAPTERS, mount };
