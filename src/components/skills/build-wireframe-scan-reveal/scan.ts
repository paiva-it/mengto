// Wireframe scan reveal for the Relay Nine house frame.
// One world-space conductor (origin + radius) drives two representations built from the same
// geometry: a temporary additive LineSegments cage that leads, and the solid that follows 520 mm behind.
// World units are millimetres, so the skill's 520 / 135 / 950 values read as real frame distances.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Ui = { button: HTMLButtonElement; status: HTMLElement; state: HTMLElement; pct: HTMLElement };

const DURATION = 3.4;
const SOLID_LAG = 520;
const STILL_FRACTION = 0.62;

const SCAN_GLSL = /* glsl */ `
uniform vec3 uScanOrigin;
uniform float uScanRadius;
uniform float uScanEnabled;
varying vec3 vScanWorld;
bool unscanned(vec3 worldPosition, float lag) {
  if (uScanEnabled < 0.5) return false;
  float wobble =
      sin(worldPosition.y * 0.011 + worldPosition.x * 0.007) * 36.0
    + sin(worldPosition.z * 0.021 + worldPosition.y * 0.013) * 17.0;
  return distance(worldPosition, uScanOrigin) > uScanRadius - lag + wobble;
}
`;

const easeOutPow = (t: number) => 1 - Math.pow(1 - t, 1.35);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const mount = (root: HTMLElement, canvas: HTMLCanvasElement, ui: Ui) => {
  const params = new URLSearchParams(location.search);
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  // ?shot holds the diagnostic still for the gallery capture, same frame reduced motion gets.
  const holdStill = () => motionQuery.matches || params.has('reduced') || params.has('shot');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xfff1e6, 0x2a2622, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-900, 1600, 1400);
  scene.add(key);
  const sodium = new THREE.PointLight(0xff8a3d, 2.4, 0, 0);
  sodium.position.set(-1100, -250, 700);
  scene.add(sodium);

  const camera = new THREE.PerspectiveCamera(28, 1, 10, 20000);

  // Shared conductor: every material reads these exact objects.
  const scan = {
    uScanOrigin: { value: new THREE.Vector3() },
    uScanRadius: { value: 0 },
    uScanEnabled: { value: 1 },
    uWireOpacity: { value: 0 },
  };

  const solidMaterials: THREE.Material[] = [];
  const scanify = <M extends THREE.MeshStandardMaterial>(material: M) => {
    material.polygonOffset = true; // keeps the cage from z-fighting the surface it rides on
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, scan);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vScanWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvScanWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${SCAN_GLSL}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nif (unscanned(vScanWorld, ${SOLID_LAG.toFixed(1)})) discard;`);
    };
    solidMaterials.push(material);
    return material;
  };

  const paint = scanify(new THREE.MeshPhysicalMaterial({ color: 0xff5a1f, roughness: 0.38, metalness: 0.15, clearcoat: 0.8, clearcoatRoughness: 0.25 }));
  const alloy = scanify(new THREE.MeshStandardMaterial({ color: 0xc9c4bb, roughness: 0.3, metalness: 0.9 }));
  const rubber = scanify(new THREE.MeshStandardMaterial({ color: 0x1d1b19, roughness: 0.85, metalness: 0 }));
  const canvasMat = scanify(new THREE.MeshStandardMaterial({ color: 0xc4ab8a, roughness: 0.82, metalness: 0 }));

  const wireMaterial = new THREE.ShaderMaterial({
    uniforms: { ...scan, uColor: { value: new THREE.Color(0xffe0cc) } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uScanOrigin;
      uniform float uScanRadius;
      uniform float uWireOpacity;
      uniform vec3 uColor;
      varying vec3 vWorld;
      void main() {
        float d = distance(vWorld, uScanOrigin);
        float rim = exp(-pow((d - uScanRadius) / 135.0, 2.0));
        float trail = smoothstep(uScanRadius, uScanRadius - 950.0, d);
        float alpha = (rim * 1.60 + trail * 0.34) * uWireOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, min(alpha, 1.0)); // additive blend multiplies by alpha once
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  // ---------- the bike: procedural, millimetres, bottom bracket at the origin ----------
  const bike = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    bike.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const tube = (points: THREE.Vector3[], r: number, material: THREE.Material, seg = 24, radial = 8) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), seg, r, radial, false), material);

  const rear = v(-398, 62);
  const front = v(596, 62);
  const bb = v(0, 0);
  const seatTop = v(-150, 520);
  const headTop = v(404, 530);
  const headBottom = v(442, 404);

  tube([v(-150, 520), v(-75, 260), bb], 16, paint, 12, 10); // seat tube
  tube([v(-130, 512), v(140, 521), v(404, 530)], 14, paint, 12, 10); // top tube
  tube([bb, v(220, 202), headBottom], 19, paint, 12, 10); // down tube
  tube([headBottom, v(423, 467), headTop], 22, paint, 4, 12); // head tube
  for (const z of [-1, 1]) {
    tube([v(-6, 6, 30 * z), v(-200, 40, 58 * z), v(rear.x, rear.y, 62 * z)], 9, paint, 12, 8); // chainstays
    tube([v(-140, 492, 22 * z), v(-270, 280, 54 * z), v(rear.x, rear.y, 62 * z)], 8, paint, 12, 8); // seatstays
    tube([v(444, 396, 34 * z), v(500, 250, 50 * z), v(560, 130, 52 * z), v(front.x, front.y, 52 * z)], 10, paint, 14, 8); // fork legs
  }
  tube([v(-150, 520), v(-172, 600), v(-196, 690)], 13, alloy, 4, 10); // seatpost
  const saddle = add(new THREE.CapsuleGeometry(42, 170, 4, 10), rubber);
  saddle.rotation.z = Math.PI / 2 + 0.06;
  saddle.scale.set(0.42, 1, 1.15);
  saddle.position.set(-206, 708, 0);
  tube([headTop, v(410, 568), v(520, 586)], 15, alloy, 6, 10); // steerer + stem
  // Track drops: a single tube from the left drop, through the clamp, to the right drop.
  tube(
    [v(540, 452, -205), v(610, 470, -205), v(616, 560, -200), v(560, 586, -190), v(522, 586, -80), v(522, 586, 80), v(560, 586, 190), v(616, 560, 200), v(610, 470, 205), v(540, 452, 205)],
    12, rubber, 64, 8,
  );

  // Porteur rack and the dispatch crate: the courier silhouette.
  for (const z of [-1, 1]) {
    tube([v(560, 492, 130 * z), v(940, 492, 130 * z)], 6, alloy, 4, 6);
    tube([v(880, 488, 130 * z), v(front.x + 14, 70, 56 * z)], 6, alloy, 8, 6);
    tube([v(560, 492, 130 * z), v(470, 420, 40 * z)], 6, alloy, 4, 6); // stay to the crown
  }
  tube([v(560, 492, -130), v(560, 492, 130)], 6, alloy, 4, 6);
  tube([v(940, 492, -130), v(940, 492, 130)], 6, alloy, 4, 6);
  const crate = add(new THREE.BoxGeometry(380, 210, 300, 5, 3, 4), canvasMat);
  crate.position.set(756, 604, 0);
  crate.rotation.y = 0.04;

  // Wheels: tyre, deep rim, hub, 28 spokes merged into one geometry.
  const wheel = (c: THREE.Vector3) => {
    const tyre = add(new THREE.TorusGeometry(336, 15, 6, 48), rubber);
    tyre.position.copy(c);
    const rim = add(new THREE.TorusGeometry(312, 13, 4, 48), alloy);
    rim.position.copy(c);
    const hub = add(new THREE.CylinderGeometry(22, 22, 120, 12, 1), alloy);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(c);
    const spokes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const side = i % 2 ? 1 : -1;
      const from = v(c.x + Math.cos(a + 0.22 * side) * 26, c.y + Math.sin(a + 0.22 * side) * 26, c.z + side * 40);
      const to = v(c.x + Math.cos(a) * 302, c.y + Math.sin(a) * 302, c.z);
      const g = new THREE.CylinderGeometry(2.2, 2.2, from.distanceTo(to), 4, 1);
      g.applyMatrix4(new THREE.Matrix4().lookAt(from, to, v(0, 0, 1)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)));
      g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      spokes.push(g);
    }
    const merged = mergeGeometries(spokes);
    spokes.forEach((g) => g.dispose());
    if (merged) add(merged, alloy);
  };
  wheel(rear);
  wheel(front);

  // Drivetrain: 48t ring, 17t cog, chain loop, cranks.
  const ring = add(new THREE.TorusGeometry(102, 7, 6, 48), alloy);
  ring.position.set(0, 0, 58);
  const cog = add(new THREE.TorusGeometry(38, 6, 6, 24), alloy);
  cog.position.set(rear.x, rear.y, 58);
  const chainPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI / 2 - (i / 12) * Math.PI;
    chainPts.push(v(Math.cos(a) * 106, Math.sin(a) * 106, 58));
  }
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 - (i / 8) * Math.PI;
    chainPts.push(v(rear.x + Math.cos(a) * 42, rear.y + Math.sin(a) * 42, 58));
  }
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(chainPts, true), 80, 4.5, 5, true), rubber);
  tube([v(0, 0, 72), v(-60, -152, 78)], 10, alloy, 2, 8);
  tube([v(0, 0, -72), v(60, 152, -78)], 10, alloy, 2, 8);
  for (const [x, y, z] of [[-60, -152, 112], [60, 152, -112]]) {
    const pedal = add(new THREE.BoxGeometry(90, 18, 70, 3, 1, 2), rubber);
    pedal.position.set(x, y, z);
  }

  bike.rotation.set(0.04, -0.52, 0);
  scene.add(bike);

  // ---------- the cage: same geometry, coarse edge graph, built per scan, disposed after ----------
  let cage: THREE.LineSegments[] = [];
  const disposeCage = () => {
    for (const lines of cage) {
      lines.removeFromParent();
      lines.geometry.dispose();
    }
    cage = [];
  };
  const buildCage = () => {
    disposeCage();
    for (const mesh of meshes) {
      const lines = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), wireMaterial);
      lines.renderOrder = 2;
      mesh.add(lines); // child of the mesh: same world matrix, so both fronts stay locked together
      cage.push(lines);
    }
  };

  // ---------- staging ----------
  let maxRadius = 3400;
  let stillRadius = 1800;
  const box = new THREE.Box3();
  const resize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!w || !h) return false;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    bike.updateMatrixWorld(true);
    box.setFromObject(bike);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const wide = aspect > 0.9;
    // Desktop: bike ~54 % of the width, right of the copy, low. Mobile: bleeds both edges, sits low.
    const widthShare = wide ? 0.5 : 0.96;
    const [fx, fy] = wide ? [0.665, 0.66] : [0.47, 0.585]; // where the bike's centre lands on screen
    const dist = size.x / (widthShare * 2 * tan * aspect);
    const viewW = 2 * dist * tan * aspect;
    const viewH = 2 * dist * tan;
    const target = center.clone().add(v((0.5 - fx) * viewW, (fy - 0.5) * viewH, 0));
    camera.position.copy(target).add(v(0, 260, dist));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // Origin outside the silhouette, low and left; reach = scene diagonal × 1.3 + 900.
    scan.uScanOrigin.value.set(box.min.x - 260, box.min.y - 240, box.max.z + 180);
    maxRadius = size.length() * 1.3 + 900;
    // Diagnostic still: the solid has surfaced 62 % of the way across the form (nearest to farthest
    // point), so the front crosses the frame itself rather than the empty overshoot past it.
    const farthest = Math.max(...[0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
      scan.uScanOrigin.value.distanceTo(v(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z))));
    const nearest = box.distanceToPoint(scan.uScanOrigin.value);
    stillRadius = SOLID_LAG + nearest + STILL_FRACTION * (farthest - nearest);
    return true;
  };

  // ---------- conductor ----------
  let elapsed = 0;
  let last = 0;
  let raf = 0;
  let scanning = false;
  let visible = true;

  const setUi = (state: string, pct: number, announce?: string) => {
    ui.state.textContent = state;
    ui.pct.textContent = `${Math.round(pct * 100)}%`;
    root.dataset.state = state.toLowerCase();
    if (announce) ui.status.textContent = announce;
  };

  const apply = (e: number) => {
    scan.uScanRadius.value = easeOutPow(e) * maxRadius;
    scan.uWireOpacity.value = Math.min(1, e / 0.06) * (1 - smoothstep(0.72, 1, e));
  };

  const finish = () => {
    scanning = false;
    scan.uScanEnabled.value = 0;
    disposeCage();
    setUi('Welded', 1, 'Scan complete. Frame Nº 09 fully revealed.');
    renderer.render(scene, camera);
  };

  const frame = (now: number) => {
    raf = 0;
    if (!scanning || !visible || document.hidden) return;
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;
    elapsed += dt;
    const e = Math.min(1, elapsed / DURATION);
    apply(e);
    setUi(e < 0.72 ? 'Scanning' : 'Burn-off', e);
    renderer.render(scene, camera);
    if (e >= 1) {
      finish();
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const loop = () => {
    if (raf || !scanning || !visible || document.hidden) return;
    last = performance.now(); // fresh time base after any pause: no jump
    raf = requestAnimationFrame(frame);
  };

  const still = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    scanning = false;
    if (!cage.length) buildCage();
    scan.uScanEnabled.value = 1;
    scan.uScanRadius.value = stillRadius;
    scan.uWireOpacity.value = 1;
    setUi('Still', STILL_FRACTION, 'Diagnostic still: scan held at 62 percent, cage and surface both visible.');
    renderer.render(scene, camera);
  };

  const play = () => {
    if (holdStill()) {
      still();
      return;
    }
    cancelAnimationFrame(raf);
    raf = 0;
    buildCage(); // disposes any previous cage first: replay never stacks copies
    scan.uScanEnabled.value = 1;
    elapsed = 0;
    apply(0);
    scanning = true;
    setUi('Scanning', 0, 'Scan started. Wire first, paint follows.');
    loop();
  };

  const redraw = () => {
    if (!resize()) return;
    if (scanning) {
      apply(Math.min(1, elapsed / DURATION));
    } else if (cage.length) {
      scan.uScanRadius.value = stillRadius;
    }
    renderer.render(scene, camera);
  };

  const ro = new ResizeObserver(redraw);
  ro.observe(root);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    loop();
  });
  io.observe(root);
  const onVisibility = () => loop();
  document.addEventListener('visibilitychange', onVisibility);
  const onMotion = () => play();
  motionQuery.addEventListener('change', onMotion);
  const onReplay = () => play();
  ui.button.addEventListener('click', onReplay);

  resize();
  // Wait for the display face so layout is final before the scan is measured.
  document.fonts.ready.then(() => {
    resize();
    play();
  });

  const teardown = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    motionQuery.removeEventListener('change', onMotion);
    ui.button.removeEventListener('click', onReplay);
    disposeCage();
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const m of solidMaterials) m.dispose();
    wireMaterial.dispose();
    envRT.dispose();
    renderer.dispose();
  };
  addEventListener('pagehide', teardown, { once: true });
  return teardown;
};

export { mount };
