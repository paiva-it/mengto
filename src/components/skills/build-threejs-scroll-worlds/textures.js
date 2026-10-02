// Procedural planet + hardware textures, generated once on the CPU (no image downloads).
// Pixel maps are sampled on the unit sphere exactly as THREE.SphereGeometry lays out its UVs,
// so the seam and the poles carry no pinching or discontinuity.

const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const makeNoise = (seed) => {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const vals = new Float32Array(256).map(() => rnd());
  const h = (x, y, z) => vals[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const a = h(xi, yi, zi) + (h(xi + 1, yi, zi) - h(xi, yi, zi)) * u;
    const b = h(xi, yi + 1, zi) + (h(xi + 1, yi + 1, zi) - h(xi, yi + 1, zi)) * u;
    const c = h(xi, yi, zi + 1) + (h(xi + 1, yi, zi + 1) - h(xi, yi, zi + 1)) * u;
    const d = h(xi, yi + 1, zi + 1) + (h(xi + 1, yi + 1, zi + 1) - h(xi, yi + 1, zi + 1)) * u;
    const ab = a + (b - a) * v;
    const cd = c + (d - c) * v;
    return ab + (cd - ab) * w;
  };
  return (x, y, z, oct) => {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o += 1) {
      sum += noise(x * f, y * f, z * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

// Planet palette (sRGB). Oceans stay dark the way they read from orbit; land is ochre and sage.
const P = {
  green: hex('#3e5528'),
  sage: hex('#6b7442'),
  sand: hex('#c4a26a'),
  dune: hex('#a87b4b'),
  rock: hex('#6e6152'),
  snow: hex('#e6ebec'),
};
const mix3 = (out, a, b, t) => {
  out[0] = mix(a[0], b[0], t);
  out[1] = mix(a[1], b[1], t);
  out[2] = mix(a[2], b[2], t);
  return out;
};

const SEA = 0.515;

// Land colour is painted everywhere (oceans included) and the coastline is NOT baked: the surface
// shader thresholds the smooth elevation map plus fine 3D noise, so coasts stay crisp at any zoom.
const ELEV_MIN = 0.25;
const ELEV_SPAN = 0.55;

const planetMaps = (W = 2048, H = 1024) => {
  const terrain = makeNoise(7);
  const moist = makeNoise(19);
  const city = makeNoise(41);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    return { c, ctx, img: ctx.createImageData(W, H) };
  };
  const color = mk(), elev = mk(), lights = mk();
  const cu = new Float32Array(W), su = new Float32Array(W);
  for (let x = 0; x < W; x += 1) {
    cu[x] = Math.cos(((x + 0.5) / W) * Math.PI * 2);
    su[x] = Math.sin(((x + 0.5) / W) * Math.PI * 2);
  }
  const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
  for (let y = 0; y < H; y += 1) {
    const th = ((y + 0.5) / H) * Math.PI;
    const py = Math.cos(th), st = Math.sin(th);
    const lat = Math.abs(90 - ((y + 0.5) / H) * 180);
    for (let x = 0; x < W; x += 1) {
      const px = -cu[x] * st, pz = su[x] * st;
      const e = terrain(px * 1.55 + 3.1, py * 1.55, pz * 1.55, 7);
      const i = (y * W + x) * 4;
      const hgt = Math.max(0, e - SEA) / 0.25;
      const m = moist(px * 2.4 + 9, py * 2.4, pz * 2.4, 4);
      const dry = smooth(0.5, 0.42, m) * smooth(42, 18, lat);
      mix3(tmp, P.green, P.sage, smooth(0.42, 0.6, m + hgt * 0.4));
      mix3(tmp2, P.sand, P.dune, smooth(0.3, 0.8, terrain(px * 9, py * 9, pz * 9, 2)));
      mix3(tmp, tmp, tmp2, dry);
      mix3(tmp, tmp, P.rock, smooth(0.35, 0.7, hgt));
      mix3(tmp, tmp, P.snow, Math.max(smooth(64, 72, lat), smooth(0.78, 0.95, hgt)));
      let li = 0;
      if (e > SEA && lat < 62) {
        const region = city(px * 5 + 2, py * 5, pz * 5, 2);
        if (region > 0.5) {
          const c = city(px * 80, py * 80, pz * 80, 2);
          li = smooth(0.66, 0.8, c) * smooth(0.5, 0.62, region) * smooth(0.0, 0.03, e - SEA) * (1 - dry * 0.6);
        }
      }
      color.img.data[i] = tmp[0];
      color.img.data[i + 1] = tmp[1];
      color.img.data[i + 2] = tmp[2];
      color.img.data[i + 3] = 255;
      elev.img.data[i] = elev.img.data[i + 1] = elev.img.data[i + 2] = Math.min(1, Math.max(0, (e - ELEV_MIN) / ELEV_SPAN)) * 255;
      elev.img.data[i + 3] = 255;
      lights.img.data[i] = lights.img.data[i + 1] = lights.img.data[i + 2] = li * 255;
      lights.img.data[i + 3] = 255;
    }
  }
  for (const m of [color, elev, lights]) m.ctx.putImageData(m.img, 0, 0);
  return { color: color.c, elev: elev.c, lights: lights.c };
};

const cloudMap = (W = 1024, H = 512) => {
  const n = makeNoise(73);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y += 1) {
    const th = ((y + 0.5) / H) * Math.PI;
    const py = Math.cos(th), st = Math.sin(th);
    for (let x = 0; x < W; x += 1) {
      const ph = ((x + 0.5) / W) * Math.PI * 2;
      const px = -Math.cos(ph) * st, pz = Math.sin(ph) * st;
      const w = n(px * 1.2 + 5, py * 3.2, pz * 1.2, 3);
      const v = n(px * 3 + w * 2.2, py * 6 + w, pz * 3, 5);
      const a = smooth(0.52, 0.72, v) * 0.9;
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = a * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

// Crinkled multi-layer insulation: a tangent-space normal map from a value-noise height field.
const foilNormal = (S = 256) => {
  const n = makeNoise(5);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const hgt = (x, y) => n(x / 18, y / 18, 0.5, 4) + 0.35 * Math.abs(n(x / 6, y / 9, 3.5, 2) - 0.5);
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 6;
      const dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 6;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
};

// Solar array: 4 × 10 strings of cells with silver interconnects and a bus bar.
const solarCells = () => {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa0a6';
  g.fillRect(0, 0, 512, 256);
  const cw = 512 / 16, ch = 256 / 8;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const t = 0.85 + ((x * 7 + y * 13) % 5) * 0.035;
      g.fillStyle = `rgb(${18 * t},${22 * t},${52 * t})`;
      g.fillRect(x * cw + 1.5, y * ch + 1.5, cw - 3, ch - 3);
      g.fillStyle = 'rgba(160,170,200,0.18)';
      g.fillRect(x * cw + 1.5, y * ch + ch / 2 - 0.5, cw - 3, 1);
    }
  }
  return c;
};

// Soft radial sprite used for the sun, the hotspot halos and the constellation dots.
const radial = (stops, S = 128) => {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return c;
};

const ring = (S = 128) => {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.strokeStyle = '#fff';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(S / 2, S / 2, 7, 0, Math.PI * 2);
  g.fill();
  return c;
};

export { ELEV_MIN, ELEV_SPAN, SEA, cloudMap, foilNormal, planetMaps, radial, ring, solarCells };
