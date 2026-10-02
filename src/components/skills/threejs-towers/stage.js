// The construction study: one clipping plane rises through a finished lighthouse; a cap closes
// the cut, scaffolding (the only thing that ignores the plane) stands one lift ahead.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { Bld, scaffoldTier, TAU } from './kit.js';
import { LIGHTS } from './lights.js';

const DURATION = 4.6;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);

function mount(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const canvas = $('tw-canvas');
  const params = new URLSearchParams(location.search);
  const SHOT = params.has('shot');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------------- renderer */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true; // the whole trick

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(14, 1, 0.5, 600);
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, {
    enableDamping: true, dampingFactor: 0.08, enablePan: false, enableZoom: false,
    minPolarAngle: 0.75, maxPolarAngle: Math.PI / 2 - 0.05, rotateSpeed: 0.6,
    autoRotate: !SHOT && !reduce, autoRotateSpeed: 0.45,
  });
  controls.addEventListener('start', () => { controls.autoRotate = false; canvas.classList.add('drag'); });
  controls.addEventListener('end', () => canvas.classList.remove('drag'));

  const key = new THREE.DirectionalLight(0xffcfa0, 2.9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { near: 1, far: 120, left: -15, right: 15, top: 15, bottom: -15 });
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(0x9db5d4, 0x1a2129, 1.6));

  // The sea: a disc that fades to nothing, so the page's dusk gradient is the horizon.
  const fade = document.createElement('canvas');
  fade.width = fade.height = 256;
  const fg = fade.getContext('2d');
  const grad = fg.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, '#fff'); grad.addColorStop(0.22, '#fff'); grad.addColorStop(1, '#000');
  fg.fillStyle = grad; fg.fillRect(0, 0, 256, 256);
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(34, 96),
    new THREE.MeshLambertMaterial({ color: 0x24333f, transparent: true, alphaMap: new THREE.CanvasTexture(fade), depthWrite: false }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.01;
  sea.receiveShadow = true;
  scene.add(sea);

  /* ---------------------------------------------------------------- materials */
  const CLIP = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const MAT = {
    rock: lam(0x55534f), stone: lam(0xd3cdc1), paint: lam(0xefe8db), red: lam(0xa83a2e),
    iron: lam(0x2a2e33, { side: THREE.DoubleSide }), copper: lam(0x5f8c7c), slate: lam(0x3d454d),
    soffit: lam(0x2b3036), glass: lam(0x1a2428, { emissive: 0xffd9a0, emissiveIntensity: 0 }),
    pane: lam(0x1d2226, { emissive: 0xffb866, emissiveIntensity: 0 }),
  };
  for (const m of Object.values(MAT)) {
    m.clippingPlanes = [CLIP];
    m.clipShadows = true; // or the shadow builds early
  }

  // Scaffold boards: a little grain, with UVs already in world units (kit.box uvWorld).
  const grain = document.createElement('canvas');
  grain.width = 256; grain.height = 64;
  const gg = grain.getContext('2d');
  gg.fillStyle = '#e9cf98'; gg.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 26; i++) {
    gg.strokeStyle = `rgba(120,80,30,${0.08 + Math.random() * 0.16})`;
    gg.lineWidth = 1 + Math.random() * 2;
    gg.beginPath();
    const y = Math.random() * 64;
    gg.moveTo(0, y);
    gg.bezierCurveTo(80, y + Math.random() * 6 - 3, 170, y + Math.random() * 6 - 3, 256, y);
    gg.stroke();
  }
  const grainTex = new THREE.CanvasTexture(grain);
  grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.colorSpace = THREE.SRGBColorSpace;
  const SCAF = lam(0xffffff, { map: grainTex, transparent: true });

  /* ---------------------------------------------------------- the lamp & beams */
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uInt: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying float vEdge;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normal); vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uInt; varying vec2 vUv; varying float vEdge;
      void main(){ float a = pow(vUv.y, 2.4) * pow(vEdge, 1.6) * uInt * 0.95;
        gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beamGeo = new THREE.ConeGeometry(3.6, 40, 32, 1, true);
  beamGeo.translate(0, -20, 0);
  beamGeo.rotateZ(Math.PI / 2); // apex at the lens, opening along +x
  const beams = new THREE.Group();
  for (const r of [0, Math.PI]) {
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.rotation.y = r;
    b.rotation.z = -0.03;
    beams.add(b);
  }
  const halo = document.createElement('canvas');
  halo.width = halo.height = 128;
  const hg = halo.getContext('2d');
  const hgr = hg.createRadialGradient(64, 64, 0, 64, 64, 64);
  hgr.addColorStop(0, 'rgba(255,255,255,1)'); hgr.addColorStop(0.2, 'rgba(255,255,255,.45)'); hgr.addColorStop(1, 'rgba(255,255,255,0)');
  hg.fillStyle = hgr; hg.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(halo), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
  }));
  const lampLight = new THREE.PointLight(0xffffff, 0, 10, 1.2);
  const lampRig = new THREE.Group();
  lampRig.add(beams, glow, lampLight);
  scene.add(lampRig);

  /* -------------------------------------------------------------- the cut caps */
  const capGeos = new Map();
  const capGeo = (n, a0) => {
    const k = `${n}:${a0}`;
    if (!capGeos.has(k)) capGeos.set(k, new THREE.CircleGeometry(1, n, -a0)); // −a0: the −π/2 X turn mirrors Z
    return capGeos.get(k);
  };
  const capMat = lam(0x8f887c);
  const caps = Array.from({ length: 3 }, () => {
    const c = new THREE.Mesh(capGeo(4, 0), capMat);
    c.rotation.x = -Math.PI / 2;
    c.receiveShadow = true;
    scene.add(c);
    return c;
  });

  /* ------------------------------------------------------------------- styles */
  let style, group, tiers = [];
  const disposeGroup = () => {
    if (!group) return;
    group.traverse((o) => o.geometry?.dispose());
    tiers.forEach((t) => t.mat.dispose());
    scene.remove(group);
  };

  function load(i) {
    disposeGroup();
    style = LIGHTS[i];
    group = new THREE.Group();
    const m = Object.fromEntries(Object.keys(MAT).map((k) => [k, new Bld()]));
    style.build(m);
    // merge by material, not by part: one mesh per material per light
    for (const [k, b] of Object.entries(m)) {
      const geo = b.geo();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, MAT[k]);
      mesh.castShadow = k !== 'glass';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    tiers = style.scaf.map(([base, top, hw, bays, cx = 0, cz = 0]) => {
      const { vert, horiz } = scaffoldTier(hw, top - base, bays);
      const mat = SCAF.clone();
      const g = new THREE.Group();
      g.position.set(cx, base, cz);
      const v = new THREE.Mesh(vert, mat), h = new THREE.Mesh(horiz, mat);
      v.castShadow = h.castShadow = true;
      g.add(v, h);
      group.add(g);
      return { base, top, g, v, h, mat };
    });
    scene.add(group);

    capMat.color.setHex(style.cut);
    const lc = new THREE.Color(style.lamp.color);
    MAT.glass.emissive.copy(lc);
    beamMat.uniforms.uColor.value.copy(lc);
    glow.material.color.copy(lc);
    lampLight.color.copy(lc);
    lampRig.position.set(0, style.lamp.y, 0);
    beams.visible = style.lamp.mode === 'sweep';

    frame();
    ui.no.textContent = style.no;
    ui.name.textContent = style.name;
    ui.built.textContent = style.built;
    ui.focal.textContent = style.focal;
    ui.range.textContent = style.range;
    ui.character.textContent = style.character;
    ui.light.textContent = style.name;
    root.dataset.light = style.id;
  }

  /* ------------------------------------------------------------------ framing */
  const focus = new THREE.Vector3();
  function frame() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const aspect = w / h, mobile = w < 720;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const H = style.height + 1.6, W = style.id === 'harbour' ? 13.5 : 8.6;
    const d = Math.max(H / 2 / tan / (mobile ? 0.54 : 0.8), W / 2 / (tan * aspect) / (mobile ? 0.92 : 0.7));
    focus.set(style.focusX ?? 0, H * (mobile ? 0.41 : 0.45), 0);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(Math.sin(Math.PI / 4), Number(params.get('el')) || 0.28, Math.cos(Math.PI / 4));
    dir.normalize().multiplyScalar(d);
    controls.target.copy(focus);
    camera.position.copy(focus).add(dir);
    key.target.position.copy(focus).setY(0);
    key.position.copy(focus).add(new THREE.Vector3(-20, 24, 18));
    controls.update();
  }

  /* --------------------------------------------------------------- timeline */
  let u = reduce ? 1 : 0, playing = !reduce, lastStage = -1, scaffoldOn = true, lampT = reduce ? 1 : 0;
  const SHOT_U = params.has('u') ? Number(params.get('u')) : 0.6;

  const heightAt = (x) => {
    const S = style.stages, n = S.length - 1, s = clamp01(x) * n;
    const i = Math.min(n - 1, Math.floor(s)), l = s - i, e = l * l * (3 - 2 * l);
    return { h: S[i][1] + (S[i + 1][1] - S[i][1]) * e, i: x >= 1 ? n : i + 1 };
  };

  /* -------------------------------------------------------------------- sound */
  let audio = null, soundOn = false;
  const tone = (f0, f1, dur, type, gain, at = 0) => {
    if (!audio || !soundOn) return;
    const t = audio.currentTime + at, o = audio.createOscillator(), g = audio.createGain(), lp = audio.createBiquadFilter();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(audio.destination);
    o.start(t); o.stop(t + dur + 0.05);
  };
  const knock = () => tone(220, 90, 0.16, 'triangle', 0.35);
  const foghorn = () => { tone(98, 92, 1.6, 'sawtooth', 0.16); tone(73.4, 70, 1.6, 'sawtooth', 0.12, 0.02); };

  /* ---------------------------------------------------------------------- ui */
  const ui = {
    no: $('i-no'), name: $('i-name'), built: $('i-built'), focal: $('i-focal'), range: $('i-range'),
    character: $('i-char'), light: $('b-light-v'), pct: $('tw-pct'), stage: $('tw-stage'),
    scrub: $('tw-scrub'), time: $('tw-time'), calls: $('tw-calls'),
  };
  let li = Math.max(0, LIGHTS.findIndex((l) => l.id === params.get('light')));
  $('b-light').addEventListener('click', () => { li = (li + 1) % LIGHTS.length; load(li); rebuild(); });
  $('b-rebuild').addEventListener('click', rebuild);
  $('b-scaf').addEventListener('click', (e) => {
    scaffoldOn = !scaffoldOn;
    e.currentTarget.setAttribute('aria-pressed', String(scaffoldOn));
    $('b-scaf-v').textContent = scaffoldOn ? 'On' : 'Off';
  });
  $('b-sound').addEventListener('click', (e) => {
    soundOn = !soundOn;
    if (soundOn && !audio) audio = new AudioContext();
    audio?.resume();
    e.currentTarget.setAttribute('aria-pressed', String(soundOn));
    $('b-sound-v').textContent = soundOn ? 'On' : 'Off';
  });
  ui.scrub.addEventListener('input', () => { playing = false; u = ui.scrub.valueAsNumber / 1000; });
  function rebuild() { u = 0; playing = true; lastStage = -1; lampT = 0; }

  addEventListener('resize', frame);
  load(li);

  /* -------------------------------------------------------------------- loop */
  const clock = new THREE.Clock();
  const proj = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    if (SHOT) u = SHOT_U; // the card preview: a fixed, mid-build frame
    else if (playing) {
      u = Math.min(1, u + dt / DURATION);
      if (u >= 1) playing = false;
    }
    const done = u >= 1;
    const { h, i: stageIdx } = heightAt(u);
    CLIP.constant = done ? 1e4 : h;

    if (stageIdx !== lastStage) {
      if (lastStage !== -1 && stageIdx > lastStage) (done ? foghorn : knock)();
      lastStage = stageIdx;
    }

    // caps: every section whose range the plane is in, each with its own plan
    let ci = 0;
    if (!done && h > 0.01) {
      for (const [y0, y1, r, n, o = {}] of style.caps) {
        if (h < y0 || h >= y1 || ci >= caps.length) continue;
        const c = caps[ci++], R = (typeof r === 'function' ? r(h) : r) * 0.995;
        c.geometry = capGeo(n, o.a0 ?? 0);
        c.position.set(o.cx ?? 0, h, o.cz ?? 0);
        c.scale.set(R, R, 1);
        c.visible = R > 0.02;
      }
    }
    for (; ci < caps.length; ci++) caps[ci].visible = false;

    // scaffolding stands ahead of the line, grows in, then falls away as its lift is passed
    for (const s of tiers) {
      const a = easeOut((h - (s.base - 1.4)) / 1.0), b = easeOut((h - (s.base - 0.9)) / 0.9);
      const f = Math.max(clamp01((h - (s.top - 0.45)) / 0.7), done ? 1 : 0);
      s.v.scale.y = Math.max(0.001, a);
      s.h.scale.set(Math.max(0.001, b), 1, Math.max(0.001, b));
      s.g.position.y = s.base - 0.7 * f * f;
      s.mat.opacity = 1 - f;
      s.g.visible = scaffoldOn && a > 0.002 && f < 1;
    }

    // first light
    lampT += ((done ? 1 : 0) - lampT) * Math.min(1, dt * 2.2);
    if (!done && lampT < 0.01) lampT = 0;
    let lamp = lampT;
    if (style.lamp.mode === 'occult') {
      const ph = (t % style.lamp.period) / style.lamp.period;
      lamp *= reduce ? 1 : 1 - THREE.MathUtils.smoothstep(ph, 0.72, 0.76) + THREE.MathUtils.smoothstep(ph, 0.94, 0.98);
    } else if (!reduce) beams.rotation.y = (t * TAU) / style.lamp.period;
    MAT.glass.emissiveIntensity = lamp * 1.6;
    MAT.pane.emissiveIntensity = lampT * 0.9;
    beamMat.uniforms.uInt.value = lamp;
    glow.material.opacity = lamp * 0.9;
    glow.scale.setScalar(4.2);
    lampLight.intensity = lamp * 14;

    controls.update();
    renderer.render(scene, camera);

    // readouts
    ui.pct.firstChild.nodeValue = String(Math.round(u * 100));
    root.classList.toggle('is-done', done);
    if (!ui.scrub.matches(':active')) ui.scrub.value = String(Math.round(u * 1000));
    ui.time.textContent = `${(u * DURATION).toFixed(2)} / ${DURATION.toFixed(2)} s`;
    ui.calls.textContent = String(renderer.info.render.calls);
    const label = done ? `First light · ${style.character}` : style.stages[stageIdx][0];
    if (ui.stage.textContent !== label) ui.stage.textContent = label;
    proj.set(0, done ? style.lamp.y + 2.2 : Math.max(h, 0.4), 0).project(camera);
    ui.stage.style.transform = `translate(-50%,-50%) translate(${((proj.x + 1) / 2) * canvas.clientWidth}px, ${((1 - proj.y) / 2) * canvas.clientHeight}px)`;
  });
}

export { mount };
