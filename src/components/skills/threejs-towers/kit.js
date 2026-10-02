// The kit of parts. Every light on the page is assembled from these builders, which all
// append into one set of shared vertex / normal / uv / index arrays per material.
import * as THREE from 'three';

const TAU = Math.PI * 2;
const pt = (k, R, n, a0 = 0, cx = 0, cz = 0) => {
  const a = a0 + (k * TAU) / n;
  return [cx + Math.cos(a) * R, cz + Math.sin(a) * R];
};

class Bld {
  constructor() {
    this.p = [];
    this.n = [];
    this.u = [];
    this.i = [];
  }

  vert(x, y, z, nx, ny, nz, u, v) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.u.push(u, v);
    return this.p.length / 3 - 1;
  }

  // Quad (pass P[3] === P[2] for a triangle). Normal from the diagonals, so a quad with a
  // collapsed edge (a fan to the centre) still gets a real normal. Winding: CCW = front.
  face(P, uv) {
    const [a, b, c, d] = P;
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
    const vx = d[0] - b[0], vy = d[1] - b[1], vz = d[2] - b[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L; ny /= L; nz /= L;
    const q = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const idx = P.map((p, k) => this.vert(p[0], p[1], p[2], nx, ny, nz, q[k][0], q[k][1]));
    this.i.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
  }

  // Box rotated rz in its own XY plane, then ry about Y. uvWorld > 0 rewrites the UVs in world
  // units (that many metres per texture repeat) with a random offset, so a long pole and a
  // short brace do not share one stretched grain.
  box(cx, cy, cz, sx, sy, sz, ry = 0, rz = 0, uvWorld = 0) {
    const co = Math.cos(ry), si = Math.sin(ry), cr = Math.cos(rz), sr = Math.sin(rz);
    const h = [sx / 2, sy / 2, sz / 2];
    const V = (a, b, c) => {
      const x = a * h[0], y = b * h[1], z = c * h[2];
      const x2 = x * cr - y * sr, y2 = x * sr + y * cr;
      return [cx + x2 * co + z * si, cy + y2, cz - x2 * si + z * co];
    };
    const faces = [
      [V(1, -1, 1), V(1, -1, -1), V(1, 1, -1), V(1, 1, 1)],
      [V(-1, -1, -1), V(-1, -1, 1), V(-1, 1, 1), V(-1, 1, -1)],
      [V(-1, 1, 1), V(1, 1, 1), V(1, 1, -1), V(-1, 1, -1)],
      [V(-1, -1, -1), V(1, -1, -1), V(1, -1, 1), V(-1, -1, 1)],
      [V(-1, -1, 1), V(1, -1, 1), V(1, 1, 1), V(-1, 1, 1)],
      [V(1, -1, -1), V(-1, -1, -1), V(-1, 1, -1), V(1, 1, -1)],
    ];
    // corner 0→1 runs along dims[f][0], corner 1→2 along dims[f][1]
    const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
    faces.forEach((F, f) => {
      if (!uvWorld) return this.face(F);
      const du = dims[f][0] / uvWorld, dv = dims[f][1] / uvWorld;
      const o = Math.random(), p = Math.random();
      const uv = dv > du
        ? [[o, p], [o, p + du], [o + dv, p + du], [o + dv, p]] // long side onto u, along the grain
        : [[o, p], [o + du, p], [o + du, p + dv], [o, p + dv]];
      this.face(F, uv);
    });
  }

  // n-gon prism. This vertex order faces outward; every other builder copies it.
  prismN(y0, y1, R0, R1, n, o = {}) {
    const { a0 = 0, cx = 0, cz = 0, top = false, bot = false } = o;
    for (let k = 0; k < n; k++) {
      const a = pt(k, R0, n, a0, cx, cz), b = pt(k + 1, R0, n, a0, cx, cz);
      const c = pt(k + 1, R1, n, a0, cx, cz), d = pt(k, R1, n, a0, cx, cz);
      this.face([[b[0], y0, b[1]], [a[0], y0, a[1]], [d[0], y1, d[1]], [c[0], y1, c[1]]]);
    }
    if (top) this.ring(y1, 0, R1, n, { a0, cx, cz });
    if (bot) this.ring(y0, 0, R0, n, { a0, cx, cz, down: true });
  }

  // Flat annulus on the plan — decks the ledge where one storey steps back from the next.
  ring(y, r0, r1, n, o = {}) {
    const { a0 = 0, cx = 0, cz = 0, down = false } = o;
    for (let k = 0; k < n; k++) {
      const ia = pt(k, r0, n, a0, cx, cz), ib = pt(k + 1, r0, n, a0, cx, cz);
      const oa = pt(k, r1, n, a0, cx, cz), ob = pt(k + 1, r1, n, a0, cx, cz);
      const P = [[oa[0], y, oa[1]], [ia[0], y, ia[1]], [ib[0], y, ib[1]], [ob[0], y, ob[1]]];
      this.face(down ? P.reverse() : P);
    }
  }

  // Surface of revolution with smooth normals; prof(t) → radius for t in 0..1.
  lathe(y0, y1, prof, steps, seg, o = {}) {
    const { cx = 0, cz = 0 } = o;
    const base = this.p.length / 3, dy = (y1 - y0) / steps;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, r = prof(t), y = y0 + (y1 - y0) * t;
      const e = 1e-3, slope = (prof(Math.min(1, t + e)) - prof(Math.max(0, t - e))) / (((Math.min(1, t + e) - Math.max(0, t - e)) * (y1 - y0)) || 1);
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
        const L = Math.hypot(1, slope);
        this.vert(cx + c * r, y, cz + s * r, c / L, -slope / L, s / L, j / seg, t);
      }
    }
    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg, v = (ii, jj) => base + ii * seg + jj;
        const a = v(i, j2), b = v(i, j), c = v(i + 1, j), d = v(i + 1, j2);
        this.i.push(a, b, c, a, c, d);
      }
    }
    return dy;
  }

  // A hipped roof on a square plan, from one function of position along the eave.
  // o: { yE, yT, RE (eave circumradius), trunc (top circumradius, 0 = pyramid), lift, flare,
  //      pow, tip (overshoot past the eave), a0, cx, cz, thick }
  roof(o, soffit) {
    const NU = 16, NT = 10, TH = o.thick ?? 0.1, tmax = 1 + (o.tip || 0);
    for (let p = 0; p < 4; p++) {
      const top = [], bot = [];
      for (let it = 0; it <= NT; it++) {
        const t = (it / NT) * tmax, rt = [], rb = [];
        for (let iu = 0; iu <= NU; iu++) {
          const P = roofPoint(o, p, -1 + (2 * iu) / NU, t);
          rt.push(P);
          rb.push([P[0], P[1] - TH, P[2]]);
        }
        top.push(rt);
        bot.push(rb);
      }
      for (let it = 0; it < NT; it++) {
        for (let iu = 0; iu < NU; iu++) {
          this.face([top[it][iu], top[it][iu + 1], top[it + 1][iu + 1], top[it + 1][iu]]);
          soffit.face([bot[it][iu + 1], bot[it][iu], bot[it + 1][iu], bot[it + 1][iu + 1]]);
        }
      }
      for (let iu = 0; iu < NU; iu++) soffit.face([top[NT][iu], top[NT][iu + 1], bot[NT][iu + 1], bot[NT][iu]]);
    }
  }

  geo() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    return g;
  }
}

// (panel, u across the eave −1..1, t down the slope) → point. Clamp before Math.pow:
// overshooting tiles push t past 1 and a negative base to a fractional power is NaN.
function roofPoint(o, p, u, t) {
  const { a0 = 0, cx = 0, cz = 0 } = o;
  const tc = Math.min(1, t), over = Math.max(0, t - 1);
  const g = 1 - Math.pow(1 - tc, o.pow || 1);
  const f = (u + 1) / 2;
  const oa = pt(p + 1, 1, 4, a0), ob = pt(p, 1, 4, a0);
  const ia = pt(p + 1, o.trunc || 0, 4, a0), ib = pt(p, o.trunc || 0, 4, a0);
  const corner = Math.pow(Math.abs(u), 2.0); // 0 mid-eave, 1 at the hips
  const RE = o.RE * (1 + (o.flare || 0) * corner * Math.pow(tc, 3.2));
  const ox = oa[0] + (ob[0] - oa[0]) * f, oz = oa[1] + (ob[1] - oa[1]) * f;
  const ix = ia[0] + (ib[0] - ia[0]) * f, iz = ia[1] + (ib[1] - ia[1]) * f;
  const y = o.yT - (o.yT - o.yE) * g + (o.lift || 0) * corner * Math.pow(tc, 2.6) - over * (o.yT - o.yE) * 0.45;
  return [cx + ix + (ox * RE - ix) * t, y, cz + iz + (oz * RE - iz) * t];
}

// One square scaffold tier in local coordinates (origin at its centre, y = 0 at its base):
// verticals scale in Y, horizontals scale out in X/Z, so each grows separately.
function scaffoldTier(hw, h, bays) {
  const vert = new Bld(), horiz = new Bld(), W = 1.6, P = 0.085, L = 0.065;
  const xs = Array.from({ length: bays + 1 }, (_, i) => -hw + (2 * hw * i) / bays);
  for (const x of xs) {
    vert.box(x, h / 2, hw, P, h, P, 0, 0, W);
    vert.box(x, h / 2, -hw, P, h, P, 0, 0, W);
  }
  for (const z of xs.slice(1, -1)) {
    vert.box(hw, h / 2, z, P, h, P, 0, 0, W);
    vert.box(-hw, h / 2, z, P, h, P, 0, 0, W);
  }
  for (let y = 0.45; y <= h + 0.01; y += 1.05) {
    horiz.box(0, y, hw, 2 * hw + 0.2, L, L, 0, 0, W);
    horiz.box(0, y, -hw, 2 * hw + 0.2, L, L, 0, 0, W);
    horiz.box(hw, y, 0, L, L, 2 * hw + 0.2, 0, 0, W);
    horiz.box(-hw, y, 0, L, L, 2 * hw + 0.2, 0, 0, W);
  }
  // one brace per face, alternating hand, and a board walk at the working lift
  const len = Math.hypot(2 * hw, h), ang = Math.atan2(h, 2 * hw);
  horiz.box(0, h / 2, hw + 0.06, len, 0.055, 0.055, 0, ang, W);
  horiz.box(0, h / 2, -hw - 0.06, len, 0.055, 0.055, 0, -ang, W);
  horiz.box(hw + 0.06, h / 2, 0, len, 0.055, 0.055, Math.PI / 2, -ang, W);
  horiz.box(-hw - 0.06, h / 2, 0, len, 0.055, 0.055, Math.PI / 2, ang, W);
  const yb = Math.floor((h - 0.45) / 1.05) * 1.05 + 0.45 + 0.05;
  horiz.box(0, yb, hw - 0.3, 2 * hw, 0.05, 0.5, 0, 0, W);
  horiz.box(0, yb, -hw + 0.3, 2 * hw, 0.05, 0.5, 0, 0, W);
  horiz.box(hw - 0.3, yb, 0, 0.5, 0.05, 2 * hw - 1.2, 0, 0, W);
  horiz.box(-hw + 0.3, yb, 0, 0.5, 0.05, 2 * hw - 1.2, 0, 0, W);
  return { vert: vert.geo(), horiz: horiz.geo() };
}

export { Bld, pt, roofPoint, scaffoldTier, TAU };
