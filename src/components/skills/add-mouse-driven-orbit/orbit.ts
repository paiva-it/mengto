// Passive mouse-driven orbit for the Ondo hero: one damped normalized target split across
// a shallow camera arc, a 42 % carried look-at, and unequal near/far group rotations.
import * as THREE from 'three';

type Pose = { x: number; y: number };

const H = 900; // world height in stage-pixel units; width follows the aspect
const FOV = 40;
const STILL: Pose = { x: 0.28, y: -0.12 }; // designed three-quarter still (reduced motion)
const SHOT: Pose = { x: 0.52, y: -0.2 }; // pose held for the card capture

// ---------- procedural parts ----------

// Roasted bean: squashed sphere with an S-shaped crease pressed into its flat face.
const beanGeometry = () => {
  const g = new THREE.SphereGeometry(1, 64, 40);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i);
    if (z > 0) z *= 0.72; // flatter face
    const seam = x - 0.09 * Math.sin(y * 3.2);
    const groove = Math.exp(-((seam / 0.085) ** 2)) * Math.max(0, z) * 0.85;
    z -= groove;
    x *= 0.74;
    p.setXYZ(i, x, y * 1.0, z * 0.58);
  }
  g.computeVertexNormals();
  return g;
};

// Leaf: pointed ellipse, bent along its length and cupped across it.
const leafGeometry = () => {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.42, 0.18, 0.5, 0.72, 0, 1.4);
  s.bezierCurveTo(-0.5, 0.72, -0.42, 0.18, 0, 0);
  const g = new THREE.ShapeGeometry(s, 24);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    p.setZ(i, -0.18 * y * y + 0.35 * x * x);
  }
  g.computeVertexNormals();
  return g;
};

const tube = (pts: number[][], radius: number, mat: THREE.Material, seg = 160) =>
  new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), seg, radius, 28),
    mat,
  );

const capsAt = (curve: THREE.Mesh, r: number, mat: THREE.Material) => {
  // round the open ends of a tube
  const path = (curve.geometry as THREE.TubeGeometry).parameters.path;
  const caps = new THREE.Group();
  for (const t of [0, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat);
    cap.position.copy(path.getPointAt(t));
    caps.add(cap);
  }
  return caps;
};

const mount = (root: HTMLElement) => {
  const canvas = root.querySelector<HTMLCanvasElement>('canvas.orbit-canvas')!;
  const rangeX = root.querySelector<HTMLInputElement>('#orbit-x')!;
  const rangeY = root.querySelector<HTMLInputElement>('#orbit-y')!;
  const outX = root.querySelector<HTMLOutputElement>('#orbit-x-out')!;
  const outY = root.querySelector<HTMLOutputElement>('#orbit-y-out')!;
  const motionBtn = root.querySelector<HTMLButtonElement>('#orbit-motion')!;
  const live = root.querySelector<HTMLElement>('#orbit-live')!;

  const params = new URLSearchParams(location.search);
  const shot = params.has('shot');
  const rmq = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const forcedReduced = params.get('reduced') === '1';
  let motion = !(rmq.matches || forcedReduced);

  const target: Pose = { x: 0, y: 0 };
  const smooth: Pose = { x: 0, y: 0 };
  let lastX = NaN;
  let lastY = NaN;
  let dirty = true;

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 6000);
  const camZ = H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));

  scene.add(new THREE.HemisphereLight(0xf4efe2, 0x3b3a31, 1.5));
  const key = new THREE.DirectionalLight(0xfff0da, 2.6);
  key.position.set(-500, 900, 700);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd9e8b8, 1.3);
  rim.position.set(800, 200, -600);
  scene.add(rim);

  const mats = {
    sage: new THREE.MeshStandardMaterial({ color: 0x8e9a7c, roughness: 0.82 }),
    bark: new THREE.MeshStandardMaterial({ color: 0x6a5947, roughness: 0.9 }),
    bean: new THREE.MeshPhysicalMaterial({ color: 0x4a2817, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.35 }),
    beanLight: new THREE.MeshPhysicalMaterial({ color: 0x7a4a2a, roughness: 0.5, clearcoat: 0.3 }),
    cherry: new THREE.MeshPhysicalMaterial({ color: 0xa3222b, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 }),
    cherryRipe: new THREE.MeshPhysicalMaterial({ color: 0x6e1420, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 }),
    cherryGreen: new THREE.MeshPhysicalMaterial({ color: 0x9fb04a, roughness: 0.4, clearcoat: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x415c2f, roughness: 0.55, side: THREE.DoubleSide }),
  };

  // far layer: a broad sage bough sweeping behind the copy
  const far = new THREE.Group();
  const bough = tube(
    [
      [-1100, -40, 0],
      [-600, 80, 40],
      [-150, -20, 0],
      [250, 90, -30],
      [700, 10, 0],
      [1150, 120, 20],
    ],
    62,
    mats.sage,
  );
  far.add(bough);
  far.position.z = -420;
  scene.add(far);

  // near layer: a cherry branch with leaves, ripening fruit and roasted beans in front
  const near = new THREE.Group();
  const branch = tube(
    [
      [-980, -520, 40],
      [-560, -300, 0],
      [-120, -330, 60],
      [260, -210, 20],
      [620, -260, -20],
      [1000, -60, 0],
    ],
    30,
    mats.bark,
  );
  near.add(branch);
  near.add(capsAt(branch, 30, mats.bark));

  const twig = tube(
    [
      [-120, -330, 60],
      [-60, -230, 70],
      [40, -160, 60],
    ],
    12,
    mats.bark,
    40,
  );
  near.add(twig, capsAt(twig, 12, mats.bark));

  const leafGeo = leafGeometry();
  const leafAt = (x: number, y: number, z: number, s: number, rz: number, rx = 0.4) => {
    const l = new THREE.Mesh(leafGeo, mats.leaf);
    l.position.set(x, y, z);
    l.scale.setScalar(s);
    l.rotation.set(rx, 0, rz);
    near.add(l);
  };
  leafAt(-560, -300, 10, 150, 0.9);
  leafAt(-520, -310, 30, 120, -0.5, 0.7);
  leafAt(260, -210, 30, 170, 0.35);
  leafAt(300, -220, 40, 130, -0.9, 0.8);
  leafAt(40, -160, 70, 95, -0.3, 0.6);
  leafAt(640, -260, 0, 140, 0.6, 0.5);

  const cherryGeo = new THREE.SphereGeometry(1, 40, 28);
  const cluster = (cx: number, cy: number, cz: number, n: number, seed: number) => {
    for (let i = 0; i < n; i++) {
      const a = seed + i * 2.39996; // golden angle spread
      const r = 22 + (i % 3) * 9;
      const c = new THREE.Mesh(cherryGeo, i % 4 === 0 ? mats.cherryGreen : i % 3 === 0 ? mats.cherryRipe : mats.cherry);
      c.position.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, cz + Math.sin(a * 1.7) * 18);
      c.scale.set(19, 21, 19);
      near.add(c);
    }
  };
  cluster(-560, -300, 50, 7, 0.4);
  cluster(260, -210, 60, 8, 1.3);
  cluster(620, -255, 30, 5, 2.1);
  cluster(-120, -330, 90, 4, 3.0);

  const beanGeo = beanGeometry();
  const beans: [number, number, number, number, number, number, THREE.Material][] = [
    [-420, -200, 260, 46, 0.5, -0.4, mats.bean],
    [-250, -255, 300, 40, -0.6, 0.9, mats.bean],
    [-330, -110, 220, 34, 2.4, 0.3, mats.beanLight],
    [120, -300, 280, 38, 1.1, -0.8, mats.bean],
    [420, -120, 240, 32, -1.0, 0.6, mats.beanLight],
  ];
  for (const [x, y, z, s, rz, ry, m] of beans) {
    const b = new THREE.Mesh(beanGeo, m);
    b.position.set(x, y, z);
    b.scale.setScalar(s);
    b.rotation.set(0.5, ry, rz);
    near.add(b);
  }
  scene.add(near);

  // ---------- layout (center pose first, every size) ----------
  let vw = 0;
  const layout = (w: number, h: number) => {
    const aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const narrow = w < 760;
    // phones: crop in on the central cherry cluster rather than shrinking the whole branch
    const s = narrow ? 0.78 : Math.min(1.15, Math.max(0.8, (H * aspect) / 1440));
    near.scale.setScalar(s);
    far.scale.setScalar(narrow ? 0.8 : s);
    near.position.set(narrow ? -150 : 0, narrow ? 60 : 0, 0);
    far.position.set(narrow ? 120 : 0, narrow ? -60 : 0, -420);
  };

  const ro = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    if (!width || !height) return; // zero-sized root
    vw = width;
    renderer.setSize(width, height, false);
    layout(width, height);
    dirty = true;
    kick();
  });
  ro.observe(root);

  // ---------- pose application ----------
  const publish = (x: number, y: number) => {
    camera.position.set(-x * 26, y * 16, camZ);
    camera.lookAt(camera.position.x * 0.42, camera.position.y * 0.42, 0);
    near.rotation.y = x * 0.055;
    near.rotation.x = y * 0.026;
    far.rotation.y = x * 0.03;
    // DOM depth: copy and card move less than the 3D form
    root.style.setProperty('--ox', x.toFixed(3));
    root.style.setProperty('--oy', y.toFixed(3));
    dirty = true;
  };

  const syncControls = () => {
    rangeX.value = target.x.toFixed(2);
    rangeY.value = target.y.toFixed(2);
    outX.textContent = target.x.toFixed(2);
    outY.textContent = target.y.toFixed(2);
  };

  const snap = () => {
    smooth.x = target.x;
    smooth.y = target.y;
  };

  // ---------- input ----------
  const recordPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || !motion || coarse.matches || !vw) return;
    target.x = (e.clientX / innerWidth) * 2 - 1;
    target.y = (e.clientY / innerHeight) * 2 - 1;
    syncControls();
    kick();
  };
  const leave = () => {
    if (!motion) return;
    target.x = 0;
    target.y = 0;
    syncControls();
    kick();
  };
  root.addEventListener('pointermove', recordPointer);
  root.addEventListener('pointerleave', leave);

  const onRange = () => {
    target.x = Number(rangeX.value);
    target.y = Number(rangeY.value);
    outX.textContent = target.x.toFixed(2);
    outY.textContent = target.y.toFixed(2);
    if (!motion) snap(); // reduced motion: jump to the selected still, no easing
    kick();
  };
  rangeX.addEventListener('input', onRange);
  rangeY.addEventListener('input', onRange);

  const setMotion = (on: boolean, announce = true) => {
    motion = on;
    motionBtn.setAttribute('aria-pressed', String(on));
    motionBtn.textContent = on ? 'Motion on' : 'Motion off';
    root.dataset.motion = on ? 'on' : 'off';
    if (!on) {
      target.x = STILL.x;
      target.y = STILL.y;
      snap();
      syncControls();
    }
    if (announce) live.textContent = on ? 'Pointer orbit on. Move across the hero to tilt the scene.' : 'Pointer orbit off. Showing a still three-quarter view; the sliders pick other stills.';
    kick();
  };
  motionBtn.addEventListener('click', () => setMotion(!motion));
  const onReducedChange = () => setMotion(!rmq.matches);
  rmq.addEventListener('change', onReducedChange);

  // ---------- loop ----------
  let raf = 0;
  let prev = 0;
  let onscreen = true;

  const frame = (now: number) => {
    raf = 0;
    const dt = prev ? Math.min((now - prev) / 1000, 1 / 30) : 1 / 60;
    prev = now;
    if (motion) {
      const alpha = 1 - Math.pow(1 - 0.055, dt * 60);
      smooth.x += (target.x - smooth.x) * alpha;
      smooth.y += (target.y - smooth.y) * alpha;
    }
    const x = Math.round(smooth.x * 1000) / 1000;
    const y = Math.round(smooth.y * 1000) / 1000;
    if (x !== lastX || y !== lastY) {
      lastX = x;
      lastY = y;
      publish(x, y);
    }
    if (dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
    // keep looping only while still easing toward the target
    const settled = Math.abs(target.x - smooth.x) < 0.0005 && Math.abs(target.y - smooth.y) < 0.0005;
    if (!settled) kick();
    else prev = 0;
  };

  function kick() {
    if (raf || !onscreen || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }

  const io = new IntersectionObserver(([e]) => {
    onscreen = e.isIntersecting;
    if (!onscreen && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    prev = 0; // reset time base on resume
    kick();
  });
  io.observe(root);

  const onVisibility = () => {
    prev = 0;
    if (document.hidden && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    kick();
  };
  document.addEventListener('visibilitychange', onVisibility);

  // ---------- initial pose ----------
  if (shot && motion) {
    target.x = SHOT.x;
    target.y = SHOT.y;
    snap();
    syncControls();
  }
  setMotion(motion, false);
  root.classList.add('is-ready');

  // ---------- teardown ----------
  return () => {
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    root.removeEventListener('pointermove', recordPointer);
    root.removeEventListener('pointerleave', leave);
    rmq.removeEventListener('change', onReducedChange);
    document.removeEventListener('visibilitychange', onVisibility);
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
    });
    Object.values(mats).forEach((m) => m.dispose());
    renderer.dispose();
  };
};

export { mount };
