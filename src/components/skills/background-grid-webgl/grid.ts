import * as THREE from 'three';

// Tuning knobs — the skill's five dials, in one place.
const KNOBS = {
  cell: 2.0, // world units per minor line (the 200 mm bolt pattern, scaled)
  major: 5, // every Nth line is a major line
  fadeNear: 4, // grid fully visible until this distance from camera
  fadeFar: 62, // ...and gone by this one
  drift: 0.55, // world units per second, forward
  camHeight: 4.6,
  camDistance: 12,
  parallax: { x: 1.6, y: 0.7 }, // max camera offset from pointer
  damping: 0.035, // per-frame lerp toward pointer target
  particles: 520,
};

const CHALK = new THREE.Color('#d9dbd6');
const ACCENT = new THREE.Color('#ff6a3d');

const gridVert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const gridFrag = /* glsl */ `
  uniform float uCell;
  uniform float uMajor;
  uniform float uOffset;
  uniform float uFadeNear;
  uniform float uFadeFar;
  uniform vec3 uChalk;
  uniform vec3 uAccent;
  uniform vec3 uCam;
  varying vec3 vWorld;

  float lineMask(vec2 coord, float width) {
    vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    return 1.0 - min(min(g.x, g.y) / width, 1.0);
  }

  void main() {
    vec2 p = vec2(vWorld.x, vWorld.z + uOffset);
    float minor = lineMask(p / uCell, 1.0);
    float major = lineMask(p / (uCell * uMajor), 1.4);

    float d = length(vWorld.xz - uCam.xz);
    float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, d);
    fade = pow(fade, 1.4);

    // a single accent lane down the centre: the "tonight's circuit" line
    float lane = 1.0 - min(abs(vWorld.x) / fwidth(vWorld.x) / 1.2, 1.0);
    float laneGlow = exp(-abs(vWorld.x) * 1.6) * 0.18;

    // straight (non-premultiplied) alpha: NormalBlending multiplies by a once
    float g = max(minor * 0.2, major * 0.5);
    float l = lane * 0.6 + laneGlow;
    vec3 col = mix(uChalk, uAccent, l / max(g + l, 1e-4));
    gl_FragColor = vec4(col, max(g, l) * fade);
  }
`;

const dustVert = /* glsl */ `
  uniform float uTime;
  uniform float uPixel;
  attribute float aSeed;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.18 + aSeed * 6.283) * 0.35;
    p.x += cos(uTime * 0.12 + aSeed * 12.0) * 0.25;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aSeed * 2.2) * uPixel * (14.0 / -mv.z);
    vAlpha = (0.18 + 0.32 * aSeed) * (1.0 - smoothstep(30.0, 70.0, -mv.z));
    vWarm = step(0.86, aSeed);
  }
`;

const dustFrag = /* glsl */ `
  uniform vec3 uChalk;
  uniform vec3 uAccent;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    float r = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, r) * vAlpha;
    gl_FragColor = vec4(mix(uChalk, uAccent, vWarm), a);
  }
`;

function mount(canvas: HTMLCanvasElement) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    document.documentElement.classList.add('no-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
  const lookAt = new THREE.Vector3(0, 0, -12);

  const gridMat = new THREE.ShaderMaterial({
    vertexShader: gridVert,
    fragmentShader: gridFrag,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uCell: { value: KNOBS.cell },
      uMajor: { value: KNOBS.major },
      uOffset: { value: 0 },
      uFadeNear: { value: KNOBS.fadeNear },
      uFadeFar: { value: KNOBS.fadeFar },
      uChalk: { value: CHALK },
      uAccent: { value: ACCENT },
      uCam: { value: camera.position },
    },
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), gridMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.z = -60;
  scene.add(plane);

  const n = KNOBS.particles;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 70;
    pos[i * 3 + 1] = 0.3 + Math.random() * 9;
    pos[i * 3 + 2] = 10 - Math.random() * 70;
    seed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: dustVert,
    fragmentShader: dustFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPixel: { value: renderer.getPixelRatio() },
      uChalk: { value: CHALK },
      uAccent: { value: ACCENT },
    },
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  const target = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  if (!reduce) {
    addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        target.x = (e.clientX / innerWidth) * 2 - 1;
        target.y = (e.clientY / innerHeight) * 2 - 1;
      },
      { passive: true },
    );
  }

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // narrow screens: widen FOV so the vanishing lines still reach the edges
    camera.fov = w < 700 ? 64 : 52;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const clock = new THREE.Clock();
  let offset = 0;
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    offset = (offset + dt * KNOBS.drift) % (KNOBS.cell * KNOBS.major); // seamless cycle
    gridMat.uniforms.uOffset.value = offset;
    dustMat.uniforms.uTime.value = t;
    dust.position.z = (t * KNOBS.drift * 0.6) % 20;

    eased.x += (target.x - eased.x) * KNOBS.damping;
    eased.y += (target.y - eased.y) * KNOBS.damping;
    camera.position.set(
      eased.x * KNOBS.parallax.x,
      KNOBS.camHeight - eased.y * KNOBS.parallax.y,
      KNOBS.camDistance,
    );
    camera.lookAt(lookAt);
    renderer.render(scene, camera);
  };

  if (reduce) {
    camera.position.set(0, KNOBS.camHeight, KNOBS.camDistance);
    frame();
    addEventListener('resize', () => requestAnimationFrame(frame));
    return;
  }

  let running = false;
  const loop = () => {
    if (!running) return;
    frame();
    requestAnimationFrame(loop);
  };
  const setRunning = (on: boolean) => {
    if (on === running) return;
    running = on;
    if (on) {
      clock.getDelta();
      requestAnimationFrame(loop);
    }
  };
  document.addEventListener('visibilitychange', () => setRunning(!document.hidden));
  setRunning(!document.hidden);
}

export { mount };
