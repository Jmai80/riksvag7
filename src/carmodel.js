// The cars, built from numbers – no model files. Unlike GTA 7's box-built cars, the body is one
// smooth surface: a cross-section (sill, flank, shoulder line, side glass, roof) is swept along the
// car with every height and width read from curves, and the wheel arches are cut into it. Details –
// glass, lamps, grilles, plates, seams – are shaped in 2D and projected onto that surface, the way a
// decal is applied, so they follow every curve. Wheels have a tyre profile, spoked rims, discs and
// callipers. Paint, chrome and glass are physically based and reflect the sky.
import * as THREE from './three.js';
import { CAR_TYPES, PAINTS } from './cars.js';
import { lightPoolTexture, glowTexture } from './textures.js';

// ------------------------------------------------------------------ small math helpers
function pchip(table) {
  const t = table.slice().sort((a, b) => a[0] - b[0]);
  const n = t.length, xs = t.map((p) => p[0]), ys = t.map((p) => p[1]);
  const d = new Array(n).fill(0), h = [], del = [];
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; del[i] = (ys[i + 1] - ys[i]) / h[i]; }
  for (let i = 1; i < n - 1; i++) {
    if (del[i - 1] * del[i] <= 0) d[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / del[i - 1] + w2 / del[i]); }
  }
  d[0] = del[0]; d[n - 1] = del[n - 2];
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const u = (x - xs[i]) / h[i], u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h[i] * d[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h[i] * d[i + 1];
  };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// centripetal Catmull-Rom through 2D key points, `counts[i]` samples on segment i
function catmull(K, counts) {
  const out = [K[0]];
  const ext = [[2 * K[0][0] - K[1][0], 2 * K[0][1] - K[1][1]], ...K, [2 * K[K.length - 1][0] - K[K.length - 2][0], 2 * K[K.length - 1][1] - K[K.length - 2][1]]];
  const tj = (ti, a, b) => ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6, 0.5);
  for (let s = 0; s < K.length - 1; s++) {
    const p0 = ext[s], p1 = ext[s + 1], p2 = ext[s + 2], p3 = ext[s + 3];
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    for (let k = 1; k <= counts[s]; k++) {
      const t = t1 + ((t2 - t1) * k) / counts[s];
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(L(B1, B2, t1, t2));
    }
  }
  return out;
}
// The half cross-section: floor (straight), the wheel well's inner wall and ceiling (straight),
// then a smooth curve over rocker, flank, shoulder, side glass and roof (Catmull-Rom).
const SEG = [3, 3, 5, 3, 3];              // samples between the curve's key points C0..C5
const FLOOR = 6;                          // points before C0: centre, half, edge, wall top, ceiling middle (+C0)
const HALF = FLOOR + SEG.reduce((a, b) => a + b, 0);  // points from the bottom centre to the roof centre
const I_BELT = FLOOR - 1 + SEG[0] + SEG[1];           // the shoulder line
const I_ROOF = I_BELT + SEG[2];                       // where the side glass meets the roof
const DARK_UNDER = 5;                                 // the first points are underside (dark)

// ------------------------------------------------------------------ the three bodies
// Heights (y, metres above the road) and widths along the car (z forward, the car's middle at 0).
// top: the centreline – bumper, bonnet, windscreen, roof, rear window, tail; belt: the shoulder line
// (where the side glass starts); bottom: the sill (wheel arches are added); tumble: how much the
// glasshouse leans in; plan: the half width along the car.
const BODIES = {
  svala: {
    len: 4.16, half: 0.915, pF: 3.4, pR: 7,
    top: [[2.08, 0.63], [2.0, 0.72], [1.8, 0.79], [1.05, 0.935], [0.6, 1.16], [0.2, 1.37], [-0.4, 1.4], [-1.35, 1.385], [-1.55, 1.34], [-1.83, 1.1], [-2.0, 1.02], [-2.08, 0.94]],
    belt: [[2.08, 0.59], [1.9, 0.72], [1.05, 0.935], [0.2, 0.985], [-1.0, 1.02], [-1.7, 1.035], [-2.0, 1.0], [-2.08, 0.92]],
    bottom: [[2.08, 0.34], [1.92, 0.2], [1.6, 0.165], [-1.65, 0.165], [-1.95, 0.24], [-2.08, 0.36]],
    tumble: [[2.08, 0.08], [1.1, 0.09], [0.6, 0.18], [0.2, 0.235], [-0.6, 0.25], [-1.4, 0.24], [-1.8, 0.17], [-2.08, 0.1]],
    plan: [[2.08, 0.9], [1.6, 0.985], [1.31, 1.0], [0.95, 0.955], [0, 0.948], [-0.95, 0.958], [-1.31, 1.0], [-1.8, 0.98], [-2.08, 0.95]],
    shoulderIn: 0.032, wheelX: 0.78, rimR: 0.252, tyreW: 0.24,
    // side glass: front edge base/top, rear edge top/base, B-pillar, where the glass meets the roof
    dlo: { a0: [1.0, 0.0], a1: [0.25, 1.0], c1: [-1.33, 1.0], c0: [-1.62, 0.0], b: [-0.3, -0.38] },
    screen: [1.04, 0.27], rearGlass: { y0: 1.07, y1: 1.37, w0: 0.6, w1: 0.52, from: 'back' },
    head: [[0.4, 0.705], [0.74, 0.735], [0.84, 0.79], [0.81, 0.815], [0.43, 0.775]],
    tail: [[0.5, 0.955], [0.86, 0.955], [0.88, 1.05], [0.54, 1.035]],
    grille: [[-0.4, 0.5], [0.4, 0.5], [0.46, 0.66], [-0.46, 0.66]],
    intake: [[-0.7, 0.24], [0.7, 0.24], [0.66, 0.4], [-0.66, 0.4]],
    plateF: [0, 0.435], plateR: [0, 0.66], diffuser: [0.62, 0.22, 0.35],
    exhaust: [[0.32, 0.27, 0.042], [0.43, 0.27, 0.042]], mirror: [0.9, 1.0],
    spoiler: 'roof', rim: { n: 5, split: true, color: 0x9da3aa, dark: false }, caliper: 0xd11b1b,
    seams: [1.02, -0.3, -1.32], handles: [0.35, -0.72],
  },
  falk: {
    len: 4.62, half: 0.935, pF: 4.4, pR: 5.2,
    top: [[2.31, 0.6], [2.22, 0.7], [1.95, 0.79], [0.85, 0.9], [0.45, 1.1], [0.0, 1.31], [-0.45, 1.335], [-1.0, 1.27], [-1.55, 1.05], [-1.95, 0.98], [-2.22, 0.96], [-2.31, 0.86]],
    belt: [[2.31, 0.57], [2.1, 0.7], [0.85, 0.87], [0.0, 0.9], [-1.0, 0.94], [-1.7, 0.96], [-2.15, 0.94], [-2.31, 0.84]],
    bottom: [[2.31, 0.3], [2.1, 0.17], [1.8, 0.15], [-1.85, 0.15], [-2.15, 0.22], [-2.31, 0.34]],
    tumble: [[2.31, 0.07], [0.9, 0.08], [0.45, 0.17], [0.0, 0.25], [-0.5, 0.27], [-1.1, 0.25], [-1.6, 0.13], [-2.31, 0.08]],
    plan: [[2.31, 0.92], [1.8, 0.975], [1.43, 1.0], [0.9, 0.965], [0.0, 0.955], [-0.8, 0.975], [-1.39, 1.0], [-1.9, 0.99], [-2.31, 0.96]],
    shoulderIn: 0.03, wheelX: 0.8, rimR: 0.245, tyreW: 0.255,
    dlo: { a0: [0.82, 0.0], a1: [0.02, 1.0], c1: [-0.62, 1.0], c0: [-1.42, 0.0], b: null },
    screen: [0.85, 0.02], rearGlass: { z0: -0.62, z1: -1.5, w0: 0.6, w1: 0.62, from: 'top' },
    head: [[0.42, 0.66], [0.82, 0.69], [0.88, 0.735], [0.84, 0.75], [0.45, 0.715]],
    tail: [[0.28, 0.9], [0.9, 0.89], [0.9, 0.95], [0.3, 0.955]],
    grille: [[-0.52, 0.38], [0.52, 0.38], [0.48, 0.6], [-0.48, 0.6]],
    intake: [[-0.82, 0.2], [0.82, 0.2], [0.78, 0.33], [-0.78, 0.33]],
    plateF: [0, 0.31], plateR: [0, 0.6], diffuser: [0.7, 0.18, 0.32],
    exhaust: [[-0.62, 0.25, 0.048], [-0.5, 0.25, 0.048], [0.5, 0.25, 0.048], [0.62, 0.25, 0.048]], mirror: [0.72, 0.92],
    spoiler: 'duck', rim: { n: 10, split: false, color: 0xb9bec4, dark: false }, caliper: 0x1c56c9,
    seams: [0.86, -1.0], handles: [-0.45],
  },
  lo: {
    len: 4.48, half: 0.98, pF: 3.6, pR: 7.5,
    top: [[2.24, 0.5], [2.1, 0.62], [1.7, 0.72], [1.15, 0.79], [0.85, 0.86], [0.3, 1.08], [-0.15, 1.135], [-0.6, 1.11], [-1.2, 0.98], [-1.8, 0.92], [-2.15, 0.9], [-2.24, 0.82]],
    belt: [[2.24, 0.47], [2.0, 0.6], [1.4, 0.7], [0.85, 0.8], [0.3, 0.83], [-0.4, 0.86], [-1.2, 0.9], [-1.9, 0.9], [-2.24, 0.8]],
    bottom: [[2.24, 0.26], [2.05, 0.12], [1.75, 0.105], [-1.85, 0.11], [-2.12, 0.2], [-2.24, 0.3]],
    tumble: [[2.24, 0.06], [0.88, 0.07], [0.35, 0.24], [-0.15, 0.3], [-0.65, 0.28], [-1.25, 0.12], [-2.24, 0.06]],
    plan: [[2.24, 0.88], [1.7, 0.955], [1.38, 0.98], [0.9, 0.945], [0.2, 0.93], [-0.6, 0.97], [-1.28, 1.0], [-1.9, 0.995], [-2.24, 0.965]],
    shoulderIn: 0.025, wheelX: 0.83, rimR: 0.255, tyreW: 0.27, tyreWR: 0.31,
    dlo: { a0: [0.86, 0.0], a1: [0.25, 1.0], c1: [-0.52, 1.0], c0: [-1.05, 0.0], b: null },
    screen: [0.86, 0.27], rearGlass: { z0: -0.55, z1: -1.15, w0: 0.45, w1: 0.52, from: 'top', louvre: true },
    head: [[0.38, 0.6], [0.8, 0.655], [0.86, 0.69], [0.4, 0.645]],
    tail: [[0.2, 0.83], [0.92, 0.82], [0.93, 0.86], [0.2, 0.87]],
    grille: [[-0.3, 0.3], [0.3, 0.3], [0.3, 0.44], [-0.3, 0.44]],
    intake: [[-0.9, 0.17], [-0.46, 0.17], [-0.46, 0.36], [-0.86, 0.38]],
    plateF: [0, 0.26], plateR: [0, 0.5], diffuser: [0.82, 0.12, 0.34],
    exhaust: [[-0.12, 0.42, 0.055], [0.12, 0.42, 0.055]], mirror: [0.76, 0.84],
    spoiler: 'wing', rim: { n: 7, split: false, color: 0x41454b, dark: true }, caliper: 0xf2b705,
    seams: [0.86, -0.95], handles: [-0.6], sideIntake: true,
  },
};

// ------------------------------------------------------------------ the body surface
export class Body {
  constructor(type) {
    const B = (this.B = BODIES[type]);
    const S = (this.S = CAR_TYPES[type]);
    this.L = B.len; this.zF = B.len / 2; this.zR = -B.len / 2;
    this.top = pchip(B.top); this.belt = pchip(B.belt); this.bottom = pchip(B.bottom);
    this.tumble = pchip(B.tumble); this.plan = pchip(B.plan);
    this.wheels = [S.wheelZ[0], S.wheelZ[1]];
    this.R = S.wheelR; this.Ra = S.wheelR + 0.055;
  }

  halfWidth(z) {
    const B = this.B, zn = z / (this.L / 2);
    const p = zn > 0 ? B.pF : B.pR;
    const e = Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(zn)), p));
    return B.half * Math.pow(e, 1 / p) * this.plan(z);
  }

  // the arch: the sill rises over each wheel in a half circle
  sill(z) {
    let y = this.bottom(z);
    for (const zw of this.wheels) {
      const dz = Math.abs(z - zw);
      if (dz < this.Ra) y = Math.max(y, this.R + Math.sqrt(this.Ra * this.Ra - dz * dz) * 0.98);
    }
    return y;
  }

  // the half cross-section at z: points from the bottom centre over the flank to the roof centre
  ring(z) {
    const B = this.B;
    const w = Math.max(1e-4, this.halfWidth(z));
    const k = Math.min(1, w / B.half);         // 0 at the very nose/tail
    const yb = this.bottom(z);
    const yA = Math.max(yb, this.sill(z));      // over a wheel: the arch
    let yBelt = this.belt(z), yTop = this.top(z);
    const lip = yA + 0.035 * k;
    yBelt = Math.max(yBelt, lip + 0.06);
    yTop = Math.max(yTop, yBelt + 0.025);
    const gh = yTop - yBelt;
    const wSh = Math.max(1e-4, w - B.shoulderIn * k);
    const wTop = Math.max(1e-4, Math.min(wSh - 0.01 * k, w - this.tumble(z) * k));
    const wLow = w - 0.06 * k;
    const xIn = Math.min(B.wheelX - B.tyreW / 2 - 0.045, wLow * 0.8);
    const out = [[0, yb], [xIn * 0.5, yb], [xIn, yb], [xIn + 0.012, yA], [(xIn + 0.012 + wLow) / 2, (yA + lip) / 2]];
    const C = [
      [wLow, lip],
      [w, lip + (yBelt - lip) * 0.42],
      [wSh, yBelt],
      [wTop, yBelt + gh * 0.84],
      [wTop * 0.6, yTop - gh * 0.02],
      [0, yTop],
    ];
    for (const p of catmull(C, SEG)) out.push(p);
    return out;
  }

  // a fine cache of sections for finding the surface quickly
  cache() {
    if (this.rc) return;
    this.rcStep = 0.004;
    this.rcN = Math.ceil(this.L / this.rcStep) + 1;
    this.rc = [];
    for (let i = 0; i < this.rcN; i++) this.rc.push(this.ring(this.zR + i * this.rcStep));
  }
  ringAt(z) {
    this.cache();
    const f = Math.min(this.rcN - 1.0001, Math.max(0, (z - this.zR) / this.rcStep)), i = Math.floor(f), t = f - i;
    const a = this.rc[i], b = this.rc[i + 1], out = this.tmpRing || (this.tmpRing = a.map(() => [0, 0]));
    for (let j = 0; j < a.length; j++) { out[j][0] = a[j][0] + (b[j][0] - a[j][0]) * t; out[j][1] = a[j][1] + (b[j][1] - a[j][1]) * t; }
    return out;
  }

  // ---- the geometry: rings swept along the car
  geometry() {
    const N = 120, zs = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, f = u - (0.62 * Math.sin(2 * Math.PI * u)) / (2 * Math.PI);
      zs.push(this.zR + this.L * f);
    }
    const M = HALF * 2 - 2;                     // full ring (both sides, shared centre points)
    const pos = new Float32Array(zs.length * M * 3), col = new Float32Array(zs.length * M * 3);
    let o = 0;
    const shade = (j) => (j < DARK_UNDER ? 0.035 : 1);
    for (const z of zs) {
      const h = this.ring(z);
      for (let j = 0; j < HALF; j++) { const c = shade(j); col[o] = col[o + 1] = col[o + 2] = c; pos[o++] = h[j][0]; pos[o++] = h[j][1]; pos[o++] = z; }
      for (let j = HALF - 2; j >= 1; j--) { const c = shade(j); col[o] = col[o + 1] = col[o + 2] = c; pos[o++] = -h[j][0]; pos[o++] = h[j][1]; pos[o++] = z; }
    }
    const idx = [];
    for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < M; j++) {
      const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---- finding the surface (for the details)
  inside(x, y, z) {
    const h = this.ringAt(z), ax = Math.abs(x);
    let c = false;
    for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
      const xi = h[i][0], yi = h[i][1], xj = h[j][0], yj = h[j][1];
      if ((yi > y) !== (yj > y) && ax < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  // the first surface met coming from the front (dir +1) or from behind (dir -1)
  endZ(x, y, dir) {
    const zEnd = dir > 0 ? this.zF : this.zR;
    let b = zEnd + dir * 0.005, a = null;
    for (let z = zEnd; dir > 0 ? z > 0 : z < 0; z -= dir * 0.02) { if (this.inside(x, y, z)) { a = z; break; } b = z; }
    if (a === null) return null;
    for (let k = 0; k < 14; k++) { const m = (a + b) / 2; if (this.inside(x, y, m)) a = m; else b = m; }
    return a;
  }
  sideX(z, y) {
    const h = this.ringAt(z);
    let best = null;
    for (let i = FLOOR - 1; i < h.length - 1; i++) {
      const [x0, y0] = h[i], [x1, y1] = h[i + 1];
      if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) { const x = x0 + ((x1 - x0) * (y - y0)) / (y1 - y0); if (best === null || x > best) best = x; }
    }
    return best;
  }
  topY(x, z) {
    const h = this.ringAt(z), ax = Math.abs(x);
    let best = null;
    for (let i = 0; i < h.length - 1; i++) {
      const [x0, y0] = h[i], [x1, y1] = h[i + 1];
      if ((x0 - ax) * (x1 - ax) <= 0 && x0 !== x1) { const y = y0 + ((y1 - y0) * (ax - x0)) / (x1 - x0); if (best === null || y > best) best = y; }
    }
    return best;
  }
  beltY(z) { return this.ringAt(z)[I_BELT][1]; }
  roofY(z) { return this.ringAt(z)[I_ROOF][1]; }
  roofX(z) { return this.ringAt(z)[I_ROOF][0]; }
}

// ------------------------------------------------------------------ decals projected onto the body
// outline: closed 2D polygon (in the projection plane), map(u, v) → [x, y, z] or null
function rounded(poly, r, seg = 4) {
  // round the real corners only (a densified straight edge keeps its points as they are)
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[(i + n - 1) % n], c = poly[i], q = poly[(i + 1) % n];
    const d1 = Math.hypot(c[0] - p[0], c[1] - p[1]), d2 = Math.hypot(q[0] - c[0], q[1] - c[1]);
    const cosA = ((c[0] - p[0]) * (q[0] - c[0]) + (c[1] - p[1]) * (q[1] - c[1])) / (d1 * d2 || 1);
    if (cosA > 0.985) { out.push(c); continue; }
    const rr = Math.min(r, d1 * 0.45, d2 * 0.45);
    const a = [c[0] + ((p[0] - c[0]) * rr) / d1, c[1] + ((p[1] - c[1]) * rr) / d1];
    const b = [c[0] + ((q[0] - c[0]) * rr) / d2, c[1] + ((q[1] - c[1]) * rr) / d2];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      out.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
    }
  }
  return out;
}
// densify long edges so a projected outline hugs a curved surface
function densify(poly, step) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
function grow(poly, d) {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p[0]; cy += p[1]; }
  cx /= poly.length; cy /= poly.length;
  // offset along each vertex's averaged edge normal
  const n = poly.length, out = [];
  let area = 0;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = poly[(i + n - 1) % n], c = poly[i], q = poly[(i + 1) % n];
    const e1 = [c[0] - p[0], c[1] - p[1]], e2 = [q[0] - c[0], q[1] - c[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const nx = (e1[1] / l1 + e2[1] / l2) * sgn, ny = (-e1[0] / l1 - e2[0] / l2) * sgn;
    const l = Math.hypot(nx, ny) || 1;
    out.push([c[0] + (nx / l) * d, c[1] + (ny / l) * d]);
  }
  return out;
}

class Decals {
  constructor() { this.groups = new Map(); }
  add(mat, outline, map, lift, rings = [0.5, 0.86, 1], mirrorX = false) {
    let cx = 0, cy = 0;
    for (const p of outline) { cx += p[0]; cy += p[1]; }
    cx /= outline.length; cy /= outline.length;
    const pts = [[cx, cy]];
    for (const r of rings) for (const p of outline) pts.push([cx + (p[0] - cx) * r, cy + (p[1] - cy) * r]);
    const P3 = pts.map(([u, v]) => map(u, v));
    const n = outline.length, idx = [];
    const ok = (...ii) => ii.every((i) => P3[i]);
    for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + ((i + 1) % n); if (ok(0, a, b)) idx.push(0, a, b); }
    for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < n; i++) {
      const a = 1 + r * n + i, b = 1 + r * n + ((i + 1) % n), c = a + n, d = b + n;
      if (ok(a, b, c, d)) idx.push(a, c, b, b, c, d);
    }
    const pos = new Float32Array(P3.length * 3);
    P3.forEach((p, i) => { if (p) pos.set(p, i * 3); });
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // make sure the faces look outwards (the same way as the normals the surface gives them)
    const nrm = g.attributes.normal;
    let dot = 0;
    for (let i = 0; i < P3.length; i++) if (P3[i]) dot += nrm.getX(i) * outwardHint(P3[i])[0] + nrm.getY(i) * outwardHint(P3[i])[1] + nrm.getZ(i) * outwardHint(P3[i])[2];
    if (dot < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    // lift off the paint along the normal
    for (let i = 0; i < P3.length; i++) if (P3[i]) {
      pos[i * 3] += nrm.getX(i) * lift; pos[i * 3 + 1] += nrm.getY(i) * lift; pos[i * 3 + 2] += nrm.getZ(i) * lift;
    }
    g.computeVertexNormals();
    this.push(mat, g);
    if (mirrorX) this.push(mat, mirror(g));
    return g;
  }
  push(mat, g) { if (!this.groups.has(mat)) this.groups.set(mat, []); this.groups.get(mat).push(g); }
  meshes() {
    const out = [];
    for (const [mat, list] of this.groups) out.push(new THREE.Mesh(merge(list), mat));
    return out;
  }
}
// roughly outward from the car's middle (to orient decal faces)
function outwardHint(p) { const l = Math.hypot(p[0] * 2, p[1] - 0.6, p[2] * 0.6) || 1; return [(p[0] * 2) / l, (p[1] - 0.6) / l, (p[2] * 0.6) / l]; }

function mirror(g) {
  const m = g.clone();
  const p = m.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const idx = m.index.array.slice();
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  m.setIndex(Array.from(idx));
  m.computeVertexNormals();
  return m;
}

function merge(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, v * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nrm.set(g.attributes.normal.array, v * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, v * 2);
    if (g.index) { const a = g.index.array; for (let k = 0; k < a.length; k++) idx[i++] = a[k] + v; }
    else for (let k = 0; k < g.attributes.position.count; k++) idx[i++] = v + k;
    v += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ------------------------------------------------------------------ textures
function canvasTex(w, h, draw, srgb = true) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!c) return null;
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// a Swedish number plate: white, a blue EU band with an S, black letters
export function plateTexture(text) {
  return canvasTex(512, 112, (g, w, h) => {
    g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#123f9c'; g.fillRect(0, 0, 58, h);
    g.strokeStyle = '#ffd200'; g.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.arc(29 + Math.cos(a) * 15, 34 + Math.sin(a) * 15, 2, 0, 7); g.stroke(); }
    g.fillStyle = '#fff'; g.font = '700 30px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('S', 29, 96);
    g.fillStyle = '#111'; g.font = '700 84px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 58 + (w - 58) / 2, h / 2 + 4);
    g.strokeStyle = '#222'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
}
function honeycomb() {
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#060606'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2b2d30'; g.lineWidth = 3;
    const r = 10;
    for (let y = 0; y < h + r * 2; y += r * 1.73) for (let x = 0; x < w + r * 2; x += r * 3) {
      for (const [ox, oy] of [[0, 0], [r * 1.5, r * 0.866]]) {
        g.beginPath();
        for (let k = 0; k <= 6; k++) { const a = (k * Math.PI) / 3; g.lineTo(x + ox + Math.cos(a) * r, y + oy + Math.sin(a) * r); }
        g.stroke();
      }
    }
  });
  if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 2.5); }
  return t;
}
function treadTex() {
  const t = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#161616'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0a0a0a';
    for (const x of [14, 30, 46]) g.fillRect(x, 0, 4, h);
    for (let y = 0; y < h; y += 16) { g.fillRect(0, y, 12, 3); g.fillRect(52, y + 8, 12, 3); }
  }, false);
  if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 6); }
  return t;
}

// ------------------------------------------------------------------ materials (shared)
let MATS = null;
export function carMaterials() {
  if (MATS) return MATS;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  MATS = {
    glass: phys({ color: 0x0a0d12, metalness: 0.0, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    frame: std({ color: 0x08090a, roughness: 0.32, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    matte: std({ color: 0x121314, roughness: 0.78, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    grille: std({ color: 0xffffff, map: honeycomb(), roughness: 0.6, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    chrome: std({ color: 0xe8eaec, roughness: 0.08, metalness: 1.0 }),
    chromeDecal: std({ color: 0xd9dcdf, roughness: 0.1, metalness: 1.0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    lens: phys({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.22, clearcoat: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    drl: std({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    projector: std({ color: 0x1a1c20, roughness: 0.15, metalness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    reverse: std({ color: 0xdedede, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.2, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    tyre: std({ color: 0x1b1b1b, roughness: 0.9, metalness: 0 }),
    tread: std({ color: 0xffffff, map: treadTex(), roughness: 0.95, metalness: 0 }),
    disc: std({ color: 0x6d7074, roughness: 0.38, metalness: 0.9 }),
    hub: std({ color: 0x0e0f10, roughness: 0.6, metalness: 0.3 }),
    under: std({ color: 0x0b0b0c, roughness: 0.9 }),
    liner: std({ color: 0x0d0d0e, roughness: 0.95, side: THREE.DoubleSide }),
    mirrorGlass: std({ color: 0xaab4bf, roughness: 0.02, metalness: 1 }),
  };
  return MATS;
}

export function paintMaterial(paintKey) {
  const P = PAINTS[paintKey] || PAINTS.vit;
  return new THREE.MeshPhysicalMaterial({
    color: P.hex, metalness: 0.15 + P.metal * 0.55, roughness: 0.42 - P.metal * 0.12,
    clearcoat: 1.0, clearcoatRoughness: 0.035, envMapIntensity: 1.6, vertexColors: true,
  });
}

// ------------------------------------------------------------------ building one car type
const CACHE = new Map();
function buildType(type) {
  if (CACHE.has(type)) return CACHE.get(type);
  const body = new Body(type), B = body.B, S = CAR_TYPES[type];
  const M = carMaterials();
  const D = new Decals();
  const front = (u, v) => { const z = body.endZ(u, v, 1); return z === null ? null : [u, v, z]; };
  const back = (u, v) => { const z = body.endZ(u, v, -1); return z === null ? null : [u, v, z]; };
  const side = (u, v) => { const x = body.sideX(u, v); return x === null ? null : [x, v, u]; };
  const top = (u, v) => { const y = body.topY(u, v); return y === null ? null : [u, y, v]; };

  // --- side glass (the daylight opening), framed in black
  const dl = B.dlo;
  const edgeY = (z, f) => { const yb = body.beltY(z) + 0.028, yt = body.roofY(z) - 0.03; return yb + (yt - yb) * f; };
  const pane = (zFront, zRear, fTop = 1) => {
    // the glass between two z: top edge along the roof, bottom along the shoulder line
    const pts = [];
    const zt0 = Math.min(zFront, dl.a1[0]), zt1 = Math.max(zRear, dl.c1[0]);
    const zb0 = Math.min(zFront, dl.a0[0]), zb1 = Math.max(zRear, dl.c0[0]);
    for (let k = 0; k <= 12; k++) { const z = zt0 + ((zt1 - zt0) * k) / 12; pts.push([z, edgeY(z, fTop)]); }
    for (let k = 0; k <= 12; k++) { const z = zb1 + ((zb0 - zb1) * k) / 12; pts.push([z, edgeY(z, 0)]); }
    return pts;
  };
  const full = pane(dl.a0[0], dl.c0[0]);
  D.add(M.frame, rounded(densify(grow(full, 0.03), 0.06), 0.05), side, 0.0025, undefined, true);
  if (dl.b) {
    // two panes either side of the B-pillar
    const zb = dl.b[0];
    const fr = pane(dl.a0[0], zb + 0.04), rr = pane(zb - 0.04, dl.c0[0]);
    // the pillar edges are straight up and down
    D.add(M.glass, rounded(densify(fr, 0.05), 0.04), side, 0.005, undefined, true);
    D.add(M.glass, rounded(densify(rr, 0.05), 0.04), side, 0.005, undefined, true);
  } else {
    D.add(M.glass, rounded(densify(full, 0.05), 0.04), side, 0.005, undefined, true);
  }

  // --- windscreen (from above): between the A-pillars, from the scuttle to the roof
  const [zs0, zs1] = B.screen;
  const scr = [];
  const pill = (z) => body.roofX(z) - 0.055;
  for (let k = 0; k <= 10; k++) { const z = zs0 - 0.02 + ((zs1 + 0.04 - zs0) * k) / 10; scr.push([pill(z), z]); }
  for (let k = 10; k >= 0; k--) { const z = zs0 - 0.02 + ((zs1 + 0.04 - zs0) * k) / 10; scr.push([-pill(z), z]); }
  D.add(M.frame, rounded(grow(scr, 0.025), 0.06), top, 0.0025);
  D.add(M.glass, rounded(scr, 0.06), top, 0.005);
  // the wipers resting at the bottom
  for (const sx of [-1, 1]) D.add(M.matte, rounded([[sx * 0.05, zs0 + 0.01], [sx * 0.55, zs0 + 0.06], [sx * 0.55, zs0 + 0.075], [sx * 0.05, zs0 + 0.025]], 0.005, 1), top, 0.008, [0.6, 1]);

  // --- rear glass
  const RG = B.rearGlass;
  if (RG.from === 'back') {
    const rg = [[-RG.w0, RG.y0], [RG.w0, RG.y0], [RG.w1, RG.y1], [-RG.w1, RG.y1]];
    D.add(M.frame, rounded(densify(grow(rg, 0.03), 0.05), 0.06), back, 0.0025);
    D.add(M.glass, rounded(densify(rg, 0.05), 0.06), back, 0.005);
  } else {
    const rg = [[-RG.w0, RG.z0], [RG.w0, RG.z0], [RG.w1, RG.z1], [-RG.w1, RG.z1]].map(([x, z]) => [Math.sign(x) * Math.min(Math.abs(x), body.roofX(z) - 0.07), z]);
    D.add(M.frame, rounded(densify(grow(rg, 0.03), 0.05), 0.06), top, 0.0025);
    D.add(M.glass, rounded(densify(rg, 0.05), 0.06), top, 0.005);
    if (RG.louvre) for (let k = 1; k < 6; k++) { const z = RG.z0 + ((RG.z1 - RG.z0) * k) / 6; D.add(M.matte, [[-RG.w0 + 0.03, z - 0.012], [RG.w0 - 0.03, z - 0.012], [RG.w0 - 0.03, z + 0.012], [-RG.w0 + 0.03, z + 0.012]], top, 0.012, [0.5, 1]); }
  }

  // --- the front: headlamps (chrome bowl, LED strip, projector, clear lens), grille, intakes
  const headPoly = densify(B.head, 0.03);
  for (const sx of [1]) {
    const hp = headPoly.map(([x, y]) => [x * sx, y]);
    D.add(M.frame, rounded(grow(hp, 0.012), 0.02), front, 0.002, undefined, true);
    D.add(M.chromeDecal, rounded(hp, 0.018), front, 0.004, undefined, true);
    // an LED strip along the top edge
    const top0 = hp.slice().sort((a, b) => b[1] - a[1]).slice(0, 2);
    void top0;
    const xs = hp.map((p) => p[0]), ys = hp.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const strip = [[x0 + 0.03, y1 - 0.028], [x1 - 0.05, y1 - 0.012], [x1 - 0.05, y1 - 0.002], [x0 + 0.03, y1 - 0.018]];
    D.add(M.drl, rounded(strip, 0.006, 2), front, 0.007, [0.6, 1], true);
    for (const f of [0.3, 0.62]) {
      const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * 0.42, r = Math.min(0.04, (y1 - y0) * 0.33);
      const circ = []; for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; circ.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      D.add(M.projector, circ, front, 0.007, [0.6, 1], true);
    }
    D.add(M.lens, rounded(hp, 0.018), front, 0.012, undefined, true);
  }
  D.add(M.frame, rounded(densify(grow(B.grille, 0.015), 0.05), 0.03), front, 0.002);
  D.add(M.grille, rounded(densify(B.grille, 0.05), 0.03), front, 0.004);
  if (type === 'lo') {
    D.add(M.grille, rounded(densify(B.intake, 0.05), 0.03), front, 0.004, undefined, true);
  } else {
    D.add(M.grille, rounded(densify(B.intake, 0.05), 0.04), front, 0.004);
  }

  // --- the back: lamps (a light bar for the Falk and the Lo), diffuser
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0609, emissive: 0xff1010, emissiveIntensity: 0.35, roughness: 0.18, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const tailPoly = densify(B.tail, 0.03);
  D.add(M.frame, rounded(grow(tailPoly, 0.01), 0.015), back, 0.002, undefined, true);
  D.add(tailMat, rounded(tailPoly, 0.015), back, 0.004, undefined, true);
  if (type !== 'svala') {
    const ty0 = Math.min(...B.tail.map((p) => p[1])), ty1 = Math.max(...B.tail.map((p) => p[1]));
    const bar = [[-B.tail[0][0] - 0.01, ty0 + 0.012], [B.tail[0][0] + 0.01, ty0 + 0.012], [B.tail[0][0] + 0.01, ty1 - 0.012], [-B.tail[0][0] - 0.01, ty1 - 0.012]];
    D.add(tailMat, densify(bar, 0.04), back, 0.004, [0.5, 1]);
  }
  const revPoly = [[B.tail[0][0] + 0.02, Math.min(...B.tail.map((p) => p[1])) + 0.004], [B.tail[0][0] + 0.09, Math.min(...B.tail.map((p) => p[1])) + 0.004], [B.tail[0][0] + 0.09, Math.min(...B.tail.map((p) => p[1])) + 0.03], [B.tail[0][0] + 0.02, Math.min(...B.tail.map((p) => p[1])) + 0.03]];
  D.add(M.reverse, revPoly, back, 0.007, [0.5, 1], true);
  const [dw, dy0, dy1] = B.diffuser;
  D.add(M.matte, rounded(densify([[-dw, dy0], [dw, dy0], [dw - 0.06, dy1], [-dw + 0.06, dy1]], 0.05), 0.03), back, 0.003);
  for (let k = -3; k <= 3; k++) D.add(M.frame, [[k * 0.16 - 0.008, dy0], [k * 0.16 + 0.008, dy0], [k * 0.16 + 0.008, dy1 - 0.04], [k * 0.16 - 0.008, dy1 - 0.04]], back, 0.012, [0.5, 1]);

  // --- the sides: door shut-lines, handles, sill trim, mirrors
  for (const zc of B.seams) {
    const y0 = body.sill(zc) + 0.06, y1 = body.beltY(zc) - 0.005;
    D.add(M.frame, densify([[zc - 0.004, y0], [zc + 0.004, y0], [zc + 0.004, y1], [zc - 0.004, y1]], 0.05), side, 0.0015, [0.5, 1], true);
  }
  for (const zc of B.handles) {
    const y = body.beltY(zc) - 0.085;
    D.add(M.frame, rounded([[zc - 0.075, y - 0.014], [zc + 0.075, y - 0.014], [zc + 0.075, y + 0.014], [zc - 0.075, y + 0.014]], 0.012, 2), side, 0.003, [0.6, 1], true);
  }
  const zA = S.wheelZ[0] - body.Ra - 0.02, zB = S.wheelZ[1] + body.Ra + 0.02;
  const sk = [];
  for (let k = 0; k <= 16; k++) { const z = zB + ((zA - zB) * k) / 16; sk.push([z, body.sill(z) + 0.115]); }
  for (let k = 16; k >= 0; k--) { const z = zB + ((zA - zB) * k) / 16; sk.push([z, body.sill(z) + 0.05]); }
  D.add(M.matte, sk, side, 0.003, [0.5, 1], true);
  if (B.sideIntake) {
    const zi = S.wheelZ[1] + body.Ra + 0.08, y = body.beltY(zi + 0.25);
    D.add(M.grille, rounded(densify([[zi, y - 0.27], [zi + 0.42, y - 0.17], [zi + 0.42, y - 0.07], [zi + 0.06, y - 0.07]], 0.04), 0.05), side, 0.004, undefined, true);
  }

  const group = new THREE.Group();
  const paintGeo = body.geometry();
  const decalMeshes = D.meshes();


  // mirrors on stalks at the bottom of the A-pillars
  const mirrors = [];
  for (const sx of [1, -1]) {
    const zm = B.dlo.a0[0] - 0.1, ym = body.beltY(zm) + 0.015, xs = body.sideX(zm, ym) ?? B.half * 0.9;
    const housing = new THREE.SphereGeometry(1, 18, 12);
    housing.scale(0.1, 0.055, 0.065); housing.translate(sx * (xs + 0.13), ym + 0.075, zm - 0.02);
    const stalk = new THREE.BoxGeometry(0.11, 0.022, 0.06); stalk.translate(sx * (xs + 0.05), ym + 0.03, zm + 0.0);
    mirrors.push({ housing, stalk, glass: (() => { const g = new THREE.CircleGeometry(1, 16); g.scale(0.082, 0.042, 1); g.rotateY(Math.PI); g.translate(sx * (xs + 0.13), ym + 0.075, zm - 0.082); return g; })() });
  }

  // spoilers
  const spoilerGeos = [];
  if (B.spoiler === 'roof') {
    const zr = -1.36, yr = body.top(zr);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(-0.3, -0.03); shape.lineTo(-0.32, -0.005); shape.lineTo(-0.02, 0.03); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.12, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 4 });
    g.rotateY(-Math.PI / 2); g.translate(0.56, yr - 0.005, zr);
    spoilerGeos.push(['paint', g]);
  } else if (B.spoiler === 'duck') {
    const zr = -2.12, yr = body.top(zr);
    const shape = new THREE.Shape(); shape.moveTo(0.05, -0.015); shape.lineTo(-0.16, 0.015); shape.lineTo(-0.17, 0.04); shape.lineTo(0.05, 0.005); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.3, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
    g.rotateY(-Math.PI / 2); g.translate(0.65, yr, zr);
    spoilerGeos.push(['frame', g]);
  } else if (B.spoiler === 'wing') {
    const zr = -1.98, yr = body.top(zr) + 0.15;
    const shape = new THREE.Shape(); shape.moveTo(0.06, 0); shape.quadraticCurveTo(-0.08, 0.05, -0.26, 0.012); shape.lineTo(-0.27, -0.004); shape.quadraticCurveTo(-0.1, 0.005, 0.06, -0.012); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8 });
    g.rotateY(-Math.PI / 2); g.translate(0.75, yr, zr);
    spoilerGeos.push(['frame', g]);
    for (const sx of [-0.5, 0.5]) {
      const p = new THREE.BoxGeometry(0.02, 0.17, 0.12); p.translate(sx * 0.8, yr - 0.075, zr - 0.08);
      spoilerGeos.push(['frame', p]);
      const e = new THREE.BoxGeometry(0.012, 0.09, 0.29); e.translate(sx * 1.5, yr + 0.01, zr - 0.1);
      spoilerGeos.push(['frame', e]);
    }
  }

  // exhausts
  const exh = [];
  for (const [ex, ey, er] of B.exhaust) {
    const z = body.endZ(ex, ey, -1) ?? body.zR;
    const g = new THREE.CylinderGeometry(er, er, 0.12, 18, 1, true); g.rotateX(Math.PI / 2); g.translate(ex, ey, z + 0.03);
    const inner = new THREE.CircleGeometry(er * 0.86, 18); inner.rotateY(Math.PI); inner.translate(ex, ey, z + 0.0);
    exh.push({ g, inner });
  }

  // number plates: the plate's place on the bumper (the texture is per car)
  const plateAt = (pp, dir) => {
    const z = body.endZ(pp[0], pp[1], dir);
    const z2 = body.endZ(pp[0], pp[1] + 0.04, dir), z3 = body.endZ(pp[0], pp[1] - 0.04, dir);
    const tilt = z2 !== null && z3 !== null ? Math.atan2(z2 - z3, 0.08) : 0;
    return { x: pp[0], y: pp[1], z: (z ?? 0) + dir * 0.012, tilt, dir };
  };
  const centre = (poly) => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
  const [hx, hy] = centre(B.head), [tx, ty] = centre(B.tail);
  const lamps = { head: [hx, hy, (body.endZ(hx, hy, 1) ?? body.zF) + 0.06], tail: [tx, ty, (body.endZ(tx, ty, -1) ?? body.zR) - 0.05] };
  const data = {
    lamps,
    body, paintGeo, decalMeshes, mirrors, spoilerGeos, exh, tailMat,
    plates: [plateAt(B.plateF, 1), plateAt(B.plateR, -1)],
    wheel: buildWheel(type, B, S),
  };
  void group;
  CACHE.set(type, data);
  return data;
}

// ------------------------------------------------------------------ wheels
function rimShape(R, n, split, hubR) {
  // a disc with n windows between the spokes; a split design also gets a slit down each spoke
  const s = new THREE.Shape();
  s.absarc(0, 0, R, 0, Math.PI * 2, false);
  const sw = n <= 5 ? (split ? 0.034 : 0.026) : n <= 7 ? 0.02 : 0.0135;   // spoke half width (m)
  const slot = (Math.PI * 2) / n;
  const r1 = R * 0.86, r0 = Math.max(hubR * 1.45, (2 * sw) / (slot - 0.12));
  const arcPts = (r, from, to, steps) => { const out = []; for (let k = 0; k <= steps; k++) { const a = from + ((to - from) * k) / steps; out.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); } return out; };
  for (let i = 0; i < n; i++) {
    const a0 = i * slot, a1 = (i + 1) * slot;
    const o0 = a0 + sw / r1, o1 = a1 - sw / r1, i0 = a0 + sw / r0, i1 = a1 - sw / r0;
    if (i1 <= i0 + 0.02) continue;
    const pts = [...arcPts(r0, i0, i1, 6), ...arcPts(r1, o1, o0, 14)];
    s.holes.push(new THREE.Path(pts));
    if (split) {
      const c = a1, w0 = 0.006 / (r0 + 0.03), w1 = 0.006 / r1;
      s.holes.push(new THREE.Path([...arcPts(r0 + 0.03, c - w0, c + w0, 1), ...arcPts(r1, c + w1, c - w1, 1)]));
    }
  }
  return s;
}

function buildWheel(type, B, S) {
  const R = S.wheelR, rimR = B.rimR, W = B.tyreW;
  // tyre: a lathe of the cross-section (tread, shoulders, bulging sidewalls)
  const prof = [];
  const hw = W / 2;
  const pts = [[rimR - 0.005, -hw * 0.86], [rimR + 0.02, -hw * 0.95], [(rimR + R) / 2, -hw * 1.0], [R - 0.03, -hw * 0.97], [R - 0.008, -hw * 0.82], [R, -hw * 0.5], [R, hw * 0.5], [R - 0.008, hw * 0.82], [R - 0.03, hw * 0.97], [(rimR + R) / 2, hw * 1.0], [rimR + 0.02, hw * 0.95], [rimR - 0.005, hw * 0.86]];
  for (const [r, x] of pts) prof.push(new THREE.Vector2(r, x));
  const tyre = new THREE.LatheGeometry(prof, 32);
  tyre.rotateZ(-Math.PI / 2);            // the lathe's axis (y) becomes x
  // the tread band gets its own textured ring
  const tread = new THREE.CylinderGeometry(R + 0.0015, R + 0.0015, W * 0.98, 40, 1, true);
  tread.rotateZ(Math.PI / 2);
  // rim: the spoked face (extruded, bevelled), the barrel behind it, a hub cap
  const hubR = rimR * 0.24;
  const face = new THREE.ExtrudeGeometry(rimShape(rimR, B.rim.n, B.rim.split, hubR), { depth: 0.028, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.008, bevelSegments: 1, curveSegments: 28 });
  face.rotateY(Math.PI / 2);             // extrusion along +x (outwards)
  face.translate(hw * 0.62 - 0.03, 0, 0);
  // a little dish: spokes dip toward the hub
  const fp = face.attributes.position;
  for (let i = 0; i < fp.count; i++) { const r = Math.hypot(fp.getY(i), fp.getZ(i)); fp.setX(i, fp.getX(i) - 0.035 * (1 - r / rimR)); }
  face.computeVertexNormals();
  const barrel = new THREE.CylinderGeometry(rimR, rimR, W * 0.85, 40, 1, true);
  barrel.rotateZ(Math.PI / 2);
  const lip = new THREE.TorusGeometry(rimR - 0.004, 0.009, 5, 28);
  lip.rotateY(Math.PI / 2); lip.translate(hw * 0.62 + 0.004, 0, 0);
  const cap = new THREE.CylinderGeometry(hubR * 0.62, hubR * 0.75, 0.025, 24);
  cap.rotateZ(Math.PI / 2); cap.translate(hw * 0.62 - 0.045, 0, 0);
  const nuts = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, g = new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6);
    g.rotateZ(Math.PI / 2); g.translate(hw * 0.62 - 0.05, Math.cos(a) * hubR * 0.95, Math.sin(a) * hubR * 0.95);
    nuts.push(g);
  }
  // brake: a ventilated disc and a calliper (these don't spin)
  const disc = new THREE.CylinderGeometry(rimR * 0.86, rimR * 0.86, 0.028, 32);
  disc.rotateZ(Math.PI / 2); disc.translate(-0.03, 0, 0);
  const cal = new THREE.BoxGeometry(0.07, 0.15, 0.1);
  const cp = cal.attributes.position;
  for (let i = 0; i < cp.count; i++) { const y = cp.getY(i); cp.setZ(i, cp.getZ(i) * (1 - Math.abs(y) * 1.2)); }
  cal.computeVertexNormals();
  cal.translate(-0.006, rimR * 0.6, -rimR * 0.36);
  return { tyre, tread, face, barrel, lip, cap, nuts: merge(nuts), disc, cal, rimColor: B.rim.color, caliper: B.caliper, dark: B.rim.dark, W, wheelX: B.wheelX, wR: B.tyreWR };
}

// ------------------------------------------------------------------ one car on the road
const tmpE = new THREE.Euler();
let POOL_TEX = null, GLOW_TEX = null;
export class CarModel {
  constructor(type, paintKey, plate = 'RVG 007') {
    const T = buildType(type), M = carMaterials();
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.group = new THREE.Group();
    this.chassis = new THREE.Group();           // wheels hang here; the body leans on top
    this.bodyG = new THREE.Group();
    this.group.add(this.chassis);
    this.chassis.add(this.bodyG);
    this.paint = paintMaterial(paintKey);
    this.paint2 = this.paint.clone(); this.paint2.vertexColors = false;   // mirrors, spoiler (no colour attribute)
    this.tail = T.tailMat.clone();
    this.rev = M.reverse.clone();
    const add = (g, m, cast = true) => { const me = new THREE.Mesh(g, m); me.castShadow = cast; me.receiveShadow = false; this.bodyG.add(me); return me; };
    add(T.paintGeo, this.paint);
    for (const dm of T.decalMeshes) {
      const m = dm.material === T.tailMat ? this.tail : dm.material === M.reverse ? this.rev : dm.material;
      const me = new THREE.Mesh(dm.geometry, m); me.castShadow = false; this.bodyG.add(me);
    }
    for (const mr of T.mirrors) { add(mr.housing, this.paint2); add(mr.stalk, M.frame, false); add(mr.glass, M.mirrorGlass, false); }
    for (const [k, g] of T.spoilerGeos) add(g, k === 'paint' ? this.paint2 : M.frame);
    for (const e of T.exh) { add(e.g, M.chrome, false); add(e.inner, M.under, false); }
    // plates
    this.plateTex = plateTexture(plate);
    const plateMat = new THREE.MeshStandardMaterial({ map: this.plateTex, roughness: 0.35, metalness: 0.1 });
    for (const p of T.plates) {
      const g = new THREE.PlaneGeometry(0.52, 0.11);
      const me = new THREE.Mesh(g, plateMat);
      me.position.set(p.x, p.y, p.z);
      me.rotation.set(-p.tilt * p.dir, p.dir > 0 ? 0 : Math.PI, 0);
      this.bodyG.add(me);
    }
    // wheels
    const W = T.wheel;
    const rimMat = new THREE.MeshStandardMaterial({ color: W.rimColor, roughness: W.dark ? 0.35 : 0.22, metalness: 0.9 });
    const calMat = new THREE.MeshStandardMaterial({ color: W.caliper, roughness: 0.35, metalness: 0.2 });
    this.wheels = [];
    const S = this.spec;
    for (const [zw, sx, front] of [[S.wheelZ[0], 1, true], [S.wheelZ[0], -1, true], [S.wheelZ[1], 1, false], [S.wheelZ[1], -1, false]]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * W.wheelX, S.wheelR, zw);
      const spin = new THREE.Group();
      const wide = !front && W.wR ? W.wR / W.W : 1;
      spin.scale.set(sx * wide, 1, 1);             // left wheels face +x, right wheels are mirrored
      pivot.scale.set(1, 1, 1);
      const mk = (g, m, cast = true) => { const me = new THREE.Mesh(g, m); me.castShadow = cast; return me; };
      spin.add(mk(W.tyre, M.tyre), mk(W.tread, M.tread, false), mk(W.face, rimMat), mk(W.barrel, M.hub, false), mk(W.lip, rimMat, false), mk(W.cap, rimMat, false), mk(W.nuts, M.chrome, false));
      const brake = new THREE.Group();
      brake.scale.set(sx, 1, 1);
      brake.add(mk(W.disc, M.disc, false), mk(W.cal, calMat, false));
      pivot.add(spin, brake);
      this.chassis.add(pivot);
      this.wheels.push({ pivot, spin, front, sx });
    }
    this.chassis.traverse((o) => { o.frustumCulled = true; });
    this.roll = 0; this.pitch = 0;
  }

  // the evening: a pool of light on the road ahead, glare round the headlamps and the tail lamps
  setNight(on) {
    this.night = on;
    if (on && !this.nightParts) {
      const T = buildType(this.type), [hx, hy, hz] = T.lamps.head, [tx, ty, tz] = T.lamps.tail;
      POOL_TEX = POOL_TEX || lightPoolTexture(true); GLOW_TEX = GLOW_TEX || glowTexture();
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 30).rotateX(Math.PI / 2).translate(0, 0.07, 2 + 15), new THREE.MeshBasicMaterial({ map: POOL_TEX, color: 0xffe2c0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
      pool.renderOrder = 3;
      this.group.add(pool);
      const head = new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xfff1da, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      this.tailGlow = new THREE.SpriteMaterial({ map: GLOW_TEX, color: 0xff2a14, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 });
      const sprites = [];
      for (const sx of [1, -1]) {
        const a = new THREE.Sprite(head); a.position.set(sx * hx, hy, hz); a.scale.setScalar(1.1); sprites.push(a);
        const b = new THREE.Sprite(this.tailGlow); b.position.set(sx * tx, ty, tz); b.scale.setScalar(0.7); sprites.push(b);
      }
      for (const sp of sprites) this.bodyG.add(sp);
      this.nightParts = [pool, ...sprites];
    }
    if (this.nightParts) for (const m of this.nightParts) m.visible = on;
  }

  // the per-car materials and the plate (the shared geometry stays cached)
  dispose() {
    if (this.nightParts) { this.nightParts[0].material.dispose(); this.tailGlow.dispose(); }
    for (const m of [this.paint, this.paint2, this.tail, this.rev]) m.dispose();
    if (this.plateTex) this.plateTex.dispose();
  }

  setPaint(key) {
    const P = PAINTS[key];
    for (const m of [this.paint, this.paint2]) {
      m.color.setHex(P.hex);
      m.metalness = 0.15 + P.metal * 0.55;
      m.roughness = 0.42 - P.metal * 0.12;
    }
  }

  // follow a Vehicle from the simulation (or a plain object with the same fields)
  sync(v, dt, y = v.y) {
    const g = this.group;
    g.position.set(v.x, y, v.z);
    const pitch = v.air ? (v.airPitch ?? 0) : (v.pitch || 0);
    tmpE.set(-pitch, v.h, v.roll || 0, 'YXZ');
    g.quaternion.setFromEuler(tmpE);
    // the body leans on its springs: squat and dive, roll in the bends
    const k = 1 - Math.exp(-8 * dt);
    const tRoll = Math.max(-0.055, Math.min(0.055, (v.accLat || 0) * 0.0042));
    const tPitch = Math.max(-0.04, Math.min(0.04, -(v.accLong || 0) * 0.0035));
    this.roll += (tRoll - this.roll) * k;
    this.pitch += (tPitch - this.pitch) * k;
    this.bodyG.position.y = 0.0;
    this.bodyG.rotation.set(this.pitch, 0, this.roll, 'YXZ');
    for (const w of this.wheels) {
      w.spin.rotation.x = v.spin || 0;
      if (w.front) w.pivot.rotation.y = -(v.steer || 0);
    }
    const brake = v.brakeLight ? 1 : 0;
    this.tail.emissiveIntensity = (this.night ? 1.3 : 0.35) + brake * 2.4;
    if (this.tailGlow) { this.tailGlow.opacity = 0.55 + brake * 0.45; }
    this.rev.emissiveIntensity = v.reversing ? 2 : 0;
  }
}

// for the tests: how big the generated meshes are
export function carStats(type) {
  const T = buildType(type);
  let tris = T.paintGeo.index.count / 3;
  for (const m of T.decalMeshes) tris += m.geometry.index.count / 3;
  return { tris: Math.round(tris), decals: T.decalMeshes.length };
}
