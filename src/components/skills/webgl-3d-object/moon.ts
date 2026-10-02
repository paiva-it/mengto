import * as THREE from 'three';

type MoonHandle = {
  setPhase: (p: number) => void;
  dispose: () => void;
};

// Faceted moon: a real icosahedron, lightly cratered, PBR ceramic, lit by a "sun" whose
// direction follows the lunar phase so the terminator moves across the facets.
const mountMoon = (canvas: HTMLCanvasElement, initialPhase: number): MoonHandle => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxDpr = window.innerWidth < 700 ? 1.5 : 1.75;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.35, 5.6);
  camera.lookAt(0, -0.1, 0);

  // Icosahedron detail 2 (non-indexed). Displace by a hash of the vertex position so the
  // copies of a shared vertex move together and the facets stay closed.
  const geometry = new THREE.IcosahedronGeometry(1.3, 2);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const craters = [
    new THREE.Vector3(0.6, 0.5, 0.62).normalize(),
    new THREE.Vector3(-0.4, -0.2, 0.9).normalize(),
    new THREE.Vector3(-0.7, 0.6, -0.2).normalize(),
    new THREE.Vector3(0.2, -0.85, 0.4).normalize(),
  ];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const key = Math.round(v.x * 1e4) * 0.7 + Math.round(v.y * 1e4) * 1.3 + Math.round(v.z * 1e4) * 2.1;
    const jitter = (Math.sin(key * 12.9898) * 43758.5453) % 1;
    let r = 1 + jitter * 0.035;
    for (const c of craters) {
      const d = n.dot(c);
      if (d > 0.9) r -= (d - 0.9) * 1.5;
    }
    v.copy(n).multiplyScalar(1.3 * r);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xf2e8d6,
    metalness: 0.1,
    roughness: 0.52,
    emissive: 0x3a1204,
    emissiveIntensity: 0.18,
    flatShading: true,
  });
  const moon = new THREE.Mesh(geometry, material);
  moon.castShadow = true;
  scene.add(moon);

  scene.add(new THREE.AmbientLight(0xfff1e6, 0.16));

  // Sun: the key light. Its direction is the phase.
  const sun = new THREE.DirectionalLight(0xfff4e8, 2.9);
  scene.add(sun);

  // Orange rim from behind so the dark limb still shows its edge against the page.
  const rim = new THREE.DirectionalLight(0xff7a3a, 1.6);
  rim.position.set(-4, 1.6, -3.2);
  scene.add(rim);

  // Overhead light that only casts the shadow onto the "sea".
  const top = new THREE.DirectionalLight(0xffffff, 0.25);
  top.position.set(0.6, 6, 1.2);
  top.castShadow = true;
  top.shadow.mapSize.set(1024, 1024);
  top.shadow.camera.left = -2.5;
  top.shadow.camera.right = 2.5;
  top.shadow.camera.top = 2.5;
  top.shadow.camera.bottom = -2.5;
  top.shadow.radius = 6;
  scene.add(top);

  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.ShadowMaterial({ opacity: 0.26 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.85;
  shadowPlane.receiveShadow = true;
  scene.add(shadowPlane);

  let target = initialPhase;
  let current = initialPhase;
  let rafId = 0;
  let visible = true;

  const placeSun = (p: number) => {
    // p = 0 new moon (sun behind), 0.5 full (sun behind the viewer). Waxing lights the right limb.
    const a = p * Math.PI * 2;
    sun.position.set(Math.sin(a) * 5, 1.1, -Math.cos(a) * 5);
  };

  const resize = () => {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const draw = (time: number) => {
    const t = time * 0.001;
    // Shortest way round the circle, eased.
    let d = target - current;
    d -= Math.round(d);
    current = reduceMotion ? target : current + d * 0.08;
    placeSun(current);
    moon.rotation.x = -0.18 + (reduceMotion ? 0 : Math.sin(t * 0.45) * 0.06);
    moon.rotation.y = reduceMotion ? 0.6 : 0.6 + t * 0.12;
    moon.rotation.z = reduceMotion ? 0 : Math.sin(t * 0.32) * 0.05;
    moon.position.y = reduceMotion ? 0 : Math.sin(t * 0.8) * 0.08;
    renderer.render(scene, camera);
  };

  const loop = (time: number) => {
    draw(time);
    if (visible && !reduceMotion) rafId = requestAnimationFrame(loop);
  };

  const start = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  };

  const onResize = () => {
    resize();
    draw(performance.now());
  };

  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && !document.hidden;
    if (visible) start();
  });
  io.observe(canvas);
  const onVis = () => {
    visible = !document.hidden;
    if (visible) start();
  };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', onResize);

  resize();
  draw(0);
  start();

  return {
    setPhase: (p: number) => {
      target = p;
      if (reduceMotion) draw(performance.now());
    },
    dispose: () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      geometry.dispose();
      material.dispose();
      shadowPlane.geometry.dispose();
      (shadowPlane.material as THREE.Material).dispose();
      renderer.dispose();
    },
  };
};

export type { MoonHandle };
export { mountMoon };
