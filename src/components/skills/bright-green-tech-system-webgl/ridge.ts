// Kammlinie ridge viewport: a procedural crest drawn as 18 glowing contour bands,
// a slow signal beam sweeping across it, hut nodes, the traverse route and a few motes.
import * as THREE from 'three';

const GREEN = new THREE.Color('#b6ff3b');
const BG = new THREE.Color('#080b0b');

// ---- terrain ----------------------------------------------------------------
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (x: number, y: number) => {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const ridged = (x: number, y: number) => {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 5; i++) {
    const n = 1 - Math.abs(noise(x * f, y * f) * 2 - 1);
    s += n * n * amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s;
};
const crestZ = (x: number) => 1.5 * Math.sin(x * 0.22 + 0.6) - 0.6;
const height = (x: number, z: number) => {
  const d = z - crestZ(x);
  const ridge = Math.exp(-(d * d) / (2 * 2.3 * 2.3));
  const back = Math.exp(-((z + 9) ** 2) / (2 * 2.6 * 2.6)); // a farther range that dissolves into fog
  return ridge * 2.5 + back * 2.2 + ridged(x * 0.27 + 3.1, z * 0.27 + 1.7) * 1.7 * (0.35 + ridge + back * 0.8) - 0.4;
};

// Traverse huts (index-aligned with the page's hut list) + the rest of the network.
const ROUTE_X = [-9.6, -6.6, -3.4, -0.2, 3.0, 6.2, 9.4];
const ROUTE_DZ = [1.1, -0.3, 0.25, 0.0, -0.35, 0.5, 1.5];
const OTHER: [number, number][] = [[-10.5, -3.5], [-5, 4.2], [-1.5, -4.6], [1.8, 4.6], [5, -4], [8.4, 3.6], [11.2, -2.2]];

type Ridge = { select: (i: number) => void; destroy: () => void };

const mount = (canvas: HTMLCanvasElement, opts: { onFrame?: (x: number, y: number, beam: number) => void } = {}): Ridge | null => {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('reduced');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(BG, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);

  // Terrain mesh, heights baked on the CPU so huts and routes sit exactly on it.
  const geo = new THREE.PlaneGeometry(36, 30, 240, 200);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -6);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let minH = Infinity, maxH = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const h = height(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
  }
  geo.computeVertexNormals();

  const focus = new THREE.Vector3();
  const uniforms = {
    uTime: { value: 0 },
    uBeam: { value: 0 },
    uMinH: { value: minH },
    uK: { value: 18 / (maxH - minH) }, // eighteen contour bands, bottom to summit
    uMaxH: { value: maxH },
    uGreen: { value: GREEN },
    uBg: { value: BG },
    uFocus: { value: focus },
  };
  const terrain = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying float vH; varying vec3 vW; varying vec3 vN; varying float vDepth;
        void main(){
          vH = position.y; vW = position; vN = normal;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uBeam, uMinH, uK, uMaxH; uniform vec3 uGreen, uBg, uFocus;
        varying float vH; varying vec3 vW; varying vec3 vN; varying float vDepth;
        float line(float v, float w){ float d = abs(fract(v - 0.5) - 0.5) / max(fwidth(v), 1e-4); return 1.0 - clamp(d / w, 0.0, 1.0); }
        void main(){
          float t = (vH - uMinH) * uK;
          float c = line(t, 1.1);
          float idx = line(t / 6.0, 1.3);
          float grid = max(line(vW.x, 0.7), line(vW.z, 0.7));
          float shade = clamp(dot(normalize(vN), normalize(vec3(-0.55, 0.75, 0.35))), 0.0, 1.0);
          float alt = smoothstep(uMaxH * 0.55, uMaxH, vH);
          float beam = exp(-pow((vW.x - uBeam) / 0.6, 2.0));
          float trail = exp(-max(uBeam - vW.x, 0.0) * 0.55) * step(vW.x, uBeam);
          float foc = exp(-pow(distance(vW.xz, uFocus.xz) / 2.2, 2.0));
          vec3 col = vec3(0.028, 0.036, 0.036) + vec3(0.045, 0.055, 0.05) * shade + vec3(0.05) * alt * shade;
          col += uGreen * c * (0.13 + 0.10 * trail + 0.75 * beam + 0.32 * foc + 0.12 * alt);
          col += uGreen * idx * 0.22;
          col += vec3(0.55, 0.62, 0.58) * grid * 0.05 * (1.0 - beam);
          col += uGreen * beam * 0.08;
          col = mix(col, uBg, smoothstep(13.0, 23.0, vDepth));
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  scene.add(terrain);

  // Huts.
  const huts = ROUTE_X.map((x, i) => {
    const z = crestZ(x) + ROUTE_DZ[i];
    return new THREE.Vector3(x, height(x, z) + 0.06, z);
  });
  const others = OTHER.map(([x, z]) => new THREE.Vector3(x, height(x, z) + 0.06, z));
  const all = [...huts, ...others];
  const hutGeo = new THREE.BufferGeometry().setFromPoints(all);
  hutGeo.setAttribute('aIdx', new THREE.Float32BufferAttribute(all.map((_, i) => (i < huts.length ? i : -1)), 1));
  const hutUniforms = { uSel: { value: 2 }, uTime: uniforms.uTime, uGreen: uniforms.uGreen, uScale: { value: 1 } };
  const hutPoints = new THREE.Points(
    hutGeo,
    new THREE.ShaderMaterial({
      uniforms: hutUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aIdx; uniform float uSel, uTime, uScale; varying float vKind; varying float vSel;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vSel = abs(aIdx - uSel) < 0.5 ? 1.0 : 0.0;
          vKind = aIdx < 0.0 ? 0.0 : 1.0;
          float s = mix(mix(9.0, 15.0, vKind), 30.0 + 4.0 * sin(uTime * 2.2), vSel);
          gl_PointSize = s * uScale * (14.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uGreen; varying float vKind; varying float vSel;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float core = smoothstep(0.32, 0.18, d);
          float halo = pow(1.0 - d, 2.2);
          vec3 tint = mix(vec3(0.75, 0.8, 0.76), uGreen, max(vKind * 0.65, vSel));
          float a = core * mix(0.55, 1.0, vKind) + halo * mix(0.25, 0.7, vSel);
          gl_FragColor = vec4(tint * a, a);
        }`,
    }),
  );
  scene.add(hutPoints);

  // Route between the traverse huts, following the ground, with a flowing dash.
  const routePts: THREE.Vector3[] = [];
  const along: number[] = [];
  let dist = 0;
  for (let h = 0; h < huts.length - 1; h++) {
    const a = huts[h], b = huts[h + 1];
    for (let s = 0; s <= 48; s++) {
      if (h > 0 && s === 0) continue;
      const t = s / 48;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t + Math.sin(t * Math.PI) * 0.35 * (h % 2 ? 1 : -1);
      const p = new THREE.Vector3(x, height(x, z) + 0.05, z);
      if (routePts.length) dist += p.distanceTo(routePts[routePts.length - 1]);
      routePts.push(p);
      along.push(dist);
    }
  }
  const routeGeo = new THREE.BufferGeometry().setFromPoints(routePts);
  routeGeo.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  const route = new THREE.Line(
    routeGeo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uGreen: uniforms.uGreen },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aAlong; varying float vA; void main(){ vA = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uGreen; varying float vA;
        void main(){ float dash = step(0.45, fract(vA * 2.2 - uTime * 0.35)); gl_FragColor = vec4(uGreen * (0.35 + 0.65 * dash), 1.0); }`,
    }),
  );
  scene.add(route);

  // Beacon above the selected hut + ground ring.
  const beaconGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.6, 0)]);
  beaconGeo.setAttribute('aT', new THREE.Float32BufferAttribute([0, 1], 1));
  const beacon = new THREE.Line(
    beaconGeo,
    new THREE.ShaderMaterial({
      uniforms: { uGreen: uniforms.uGreen },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uGreen; varying float vT; void main(){ float a = 1.0 - vT; gl_FragColor = vec4(uGreen * a, a); }`,
    }),
  );
  scene.add(beacon);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.34, 0.37, 64).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: GREEN, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scene.add(ring);

  // Motes: sparse, slow, faint.
  const MOTES = 420;
  const mp = new Float32Array(MOTES * 3);
  for (let i = 0; i < MOTES; i++) {
    mp[i * 3] = (hash(i, 1) - 0.5) * 28;
    mp[i * 3 + 1] = 0.6 + hash(i, 2) * 4.2;
    mp[i * 3 + 2] = (hash(i, 3) - 0.5) * 16;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const motes = new THREE.Points(
    moteGeo,
    new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uGreen: uniforms.uGreen, uScale: hutUniforms.uScale },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime, uScale; varying float vF;
        void main(){ vec3 p = position; p.x = mod(p.x + uTime * 0.12 + 14.0, 28.0) - 14.0; p.y += sin(uTime * 0.4 + position.z) * 0.08;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vF = 1.0 - smoothstep(8.0, 22.0, -mv.z); gl_PointSize = 2.2 * uScale * (12.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uGreen; varying float vF; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - d) * 0.45 * vF; gl_FragColor = vec4(mix(vec3(0.8), uGreen, 0.5) * a, a); }`,
    }),
  );
  scene.add(motes);

  // ---- camera, input, loop -----------------------------------------------------
  const look = new THREE.Vector3();
  const target = new THREE.Vector3();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let sel = 2;
  const place = (i: number) => {
    const h = huts[i];
    target.set(h.x * 0.7, h.y * 0.7, h.z);
    focus.copy(h);
    beacon.position.copy(h);
    ring.position.set(h.x, h.y - 0.02, h.z);
    hutUniforms.uSel.value = i;
  };
  place(sel);
  look.copy(target);

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  const onLeave = () => { pointer.tx = 0; pointer.ty = 0; };
  canvas.parentElement?.addEventListener('pointermove', onPointer);
  canvas.parentElement?.addEventListener('pointerleave', onLeave);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow viewports pull the camera back so the whole crest stays in frame.
    camera.fov = w / h < 1 ? 50 : 36;
    hutUniforms.uScale.value = Math.min(1.4, Math.max(0.7, h / 700)) * renderer.getPixelRatio();
    camera.updateProjectionMatrix();
    draw(0);
  };

  const v = new THREE.Vector3();
  let t = 5; // start mid-sweep so the beam is on the crest in the first seconds
  const draw = (dt: number) => {
    if (!reduced) t += dt;
    uniforms.uTime.value = t;
    // Beam sweeps west→east every ~11 s; reduced motion parks it over the selected hut.
    uniforms.uBeam.value = reduced ? focus.x : ((t * 2.6) % 36) - 18;
    const k = reduced ? 1 : 1 - Math.pow(0.0015, dt);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    look.lerp(target, reduced ? 1 : 1 - Math.pow(0.08, dt));
    const az = (reduced ? 0 : Math.sin(t * 0.06) * 0.16) + pointer.x * 0.12;
    const narrow = camera.aspect < 1;
    const r = narrow ? 13.5 : 11.2;
    const elev = (narrow ? 12.5 : 10.2) + pointer.y * 0.6;
    camera.position.set(look.x + Math.sin(az) * r, elev, look.z + Math.cos(az) * r);
    camera.lookAt(look.x, look.y, look.z);
    ring.scale.setScalar(1 + 0.25 * Math.sin(t * 2.2));
    renderer.render(scene, camera);
    if (opts.onFrame) {
      v.copy(huts[sel]).setY(huts[sel].y + 1.6).project(camera);
      opts.onFrame((v.x * 0.5 + 0.5) * canvas.clientWidth, (-v.y * 0.5 + 0.5) * canvas.clientHeight, uniforms.uBeam.value);
    }
  };

  let raf = 0, last = 0, onScreen = true;
  const loop = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    draw(dt);
    raf = requestAnimationFrame(loop);
  };
  const sync = () => {
    const run = !reduced && onScreen && !document.hidden;
    if (run && !raf) { last = 0; raf = requestAnimationFrame(loop); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  sync();

  return {
    select(i: number) {
      sel = i;
      place(i);
      if (!raf) draw(0);
    },
    destroy() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', sync);
      renderer.dispose();
    },
  };
};

export { mount };
