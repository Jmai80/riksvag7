// Riksväg 7: one long road from Ekeby to Sjuby, its height profile and the landscape around it.
// Pure JS (no three.js) so the physics, the AI and the tests run in Node. The road is a chain of
// straights and circular arcs (like GTA 7's street-race route), sampled every 2 m. Everything else –
// the ground, the lake, the hills – is a function of (x, z) built around it.
import { clamp, lerp } from './rng.js';

export const HW = 5.0;          // half width of the asphalt (two 4.5 m lanes + edge strips)
export const SHOULDER = 1.7;    // gravel outside the asphalt
export const WATER = 2.0;       // the lake's surface
export const LIMIT = 75;        // further than this from the road and the race puts you back on it
const STEP = 2;

// the route: start, corners (x, z, fillet radius), end. Driving north (+z) through it all.
const START = [0, -90];
const CORNERS = [
  [0, 640, 150],        // out of Ekeby
  [270, 930, 120],      // into the farmland
  [250, 1270, 170],
  [60, 1580, 62],       // the forest esses
  [150, 1790, 58],
  [-40, 2010, 125],
  [-40, 2560, 210],     // over the lake (the straight before this corner is the bridge)
  [210, 2860, 105],
  [205, 3080, 56],      // Mellby: the sharp right-left through the village
  [520, 3150, 58],
  [600, 3480, 130],     // the ridge
  [420, 3780, 64],
  [530, 4080, 82],
  [390, 4380, 160],
];
const END = [380, 5060];

export const LAKE = { x: -40, z: 2290, ax: 470, az: 165 };

// ------------------------------------------------------------------ noise
function hash2(i, j, seed) {
  let h = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(i, j, seed), b = hash2(i + 1, j, seed), c = hash2(i, j + 1, seed), d = hash2(i + 1, j + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
export function fbm(x, z, seed = 1, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x * f, z * f, seed + o * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ the track
export class Track {
  constructor() {
    this.buildRoute();
    this.buildIndex();
    this.zones = this.makeZones();
    this.buildDistanceField();
    this.buildElevation();
    this.buildSpeedProfile();
    this.tmp = { s: 0, d: 0, i: 0, dist: 0 };
  }

  // ---------------------------------------------------------------- route geometry
  buildRoute() {
    const pts = [START, ...CORNERS.map((c) => [c[0], c[1]]), END];
    const xs = [], zs = [], ks = [];
    const push = (x, z, k) => { xs.push(x); zs.push(z); ks.push(k); };
    const fil = [];
    for (let c = 1; c < pts.length - 1; c++) {
      const P = pts[c - 1], C = pts[c], N = pts[c + 1], r = CORNERS[c - 1][2];
      const il = Math.hypot(C[0] - P[0], C[1] - P[1]), ol = Math.hypot(N[0] - C[0], N[1] - C[1]);
      const ix = (C[0] - P[0]) / il, iz = (C[1] - P[1]) / il, ox = (N[0] - C[0]) / ol, oz = (N[1] - C[1]) / ol;
      let dh = Math.atan2(ox, oz) - Math.atan2(ix, iz);
      while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      const t = r * Math.tan(Math.abs(dh) / 2);
      const A = [C[0] - ix * t, C[1] - iz * t], B = [C[0] + ox * t, C[1] + oz * t];
      const side = dh < 0 ? 1 : -1;
      const O = [A[0] - iz * r * side, A[1] + ix * r * side];
      fil.push({ A, B, O, dh, r, t });
    }
    this.cornerAt = [];
    const line = (a, b) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / STEP));
      for (let i = 0; i < n; i++) push(a[0] + (b[0] - a[0]) * (i / n), a[1] + (b[1] - a[1]) * (i / n), 0);
    };
    const arc = (f) => {
      const a0 = Math.atan2(f.A[1] - f.O[1], f.A[0] - f.O[0]);
      let sweep = Math.atan2(f.B[1] - f.O[1], f.B[0] - f.O[0]) - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const n = Math.max(2, Math.round(Math.abs(sweep) * f.r / STEP));
      const k = Math.sign(f.dh) / f.r;   // > 0: a left turn (heading grows)
      this.cornerAt.push(xs.length + (n >> 1));
      for (let i = 0; i < n; i++) {
        const a = a0 + sweep * (i / n);
        push(f.O[0] + Math.cos(a) * f.r, f.O[1] + Math.sin(a) * f.r, k);
      }
    };
    let from = START;
    for (const f of fil) { line(from, f.A); arc(f); from = f.B; }
    line(from, END);
    push(END[0], END[1], 0);
    const n = xs.length;
    const cum = new Float64Array(n), dxs = new Float64Array(n), dzs = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const l = Math.hypot(xs[b] - xs[a], zs[b] - zs[a]) || 1;
      dxs[i] = (xs[b] - xs[a]) / l; dzs[i] = (zs[b] - zs[a]) / l;
    }
    // light smoothing of the curvature so the AI's speed profile has no steps
    const kk = Float64Array.from(ks);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) { s += ks[j]; c++; }
      kk[i] = s / c;
    }
    Object.assign(this, { n, xs: Float64Array.from(xs), zs: Float64Array.from(zs), ks: kk, cum, dxs, dzs, L: cum[n - 1], fillets: fil });
    this.cornerS = this.cornerAt.map((i) => cum[i]);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) { x0 = Math.min(x0, xs[i]); x1 = Math.max(x1, xs[i]); z0 = Math.min(z0, zs[i]); z1 = Math.max(z1, zs[i]); }
    this.bbox = { x0, x1, z0, z1 };
  }

  indexAt(s) {
    let lo = 0, hi = this.n - 1;
    if (s <= 0) return 0;
    if (s >= this.L) return this.n - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    return Math.min(lo, this.n - 2);
  }

  // position, direction, curvature, height and AI target speed at a distance along the road
  pointAt(s, out = {}) {
    const i = this.indexAt(s), j = i + 1;
    const seg = this.cum[j] - this.cum[i] || 1;
    const t = clamp((s - this.cum[i]) / seg, s < 0 || s > this.L ? -50 : 0, s < 0 || s > this.L ? 50 : 1);
    out.x = this.xs[i] + (this.xs[j] - this.xs[i]) * t;
    out.z = this.zs[i] + (this.zs[j] - this.zs[i]) * t;
    const dx = this.dxs[i] + (this.dxs[j] - this.dxs[i]) * clamp(t, 0, 1), dz = this.dzs[i] + (this.dzs[j] - this.dzs[i]) * clamp(t, 0, 1);
    const l = Math.hypot(dx, dz) || 1;
    out.dx = dx / l; out.dz = dz / l;
    out.k = this.ks[i];
    if (this.ys) out.y = this.ys[i] + (this.ys[j] - this.ys[i]) * clamp(t, 0, 1);
    if (this.vs) out.v = this.vs[i] + (this.vs[j] - this.vs[i]) * clamp(t, 0, 1);
    return out;
  }

  heading(s) { const p = this.pointAt(s, T0); return Math.atan2(p.dx, p.dz); }
  // a point beside the road: d > 0 is to the right of the driving direction
  beside(s, d, out = {}) {
    this.pointAt(s, out);
    out.x += -out.dz * d; out.z += out.dx * d;
    return out;
  }

  // ---------------------------------------------------------------- nearest point on the road
  buildIndex() {
    const C = (this.hcell = 28);
    this.hash = new Map();
    for (let i = 0; i < this.n; i++) {
      const key = Math.floor(this.xs[i] / C) * 100003 + Math.floor(this.zs[i] / C);
      let a = this.hash.get(key);
      if (!a) this.hash.set(key, (a = []));
      a.push(i);
    }
  }

  // nearest road point within ~28 m: out.s, out.d (signed, right +), out.dist; false if none
  nearest(x, z, out = this.tmp) {
    const C = this.hcell, cx = Math.floor(x / C), cz = Math.floor(z / C);
    let best = -1, bd = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.hash.get((cx + a) * 100003 + (cz + b));
      if (!list) continue;
      for (let k = 0; k < list.length; k++) {
        const i = list[k], dx = this.xs[i] - x, dz = this.zs[i] - z, d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
    }
    if (best < 0) return false;
    // refine on the two segments around the nearest sample
    let bs = this.cum[best], bdist2 = bd, bdl = 0;
    for (const i of [best - 1, best]) {
      if (i < 0 || i >= this.n - 1) continue;
      const ax = this.xs[i], az = this.zs[i], abx = this.xs[i + 1] - ax, abz = this.zs[i + 1] - az;
      const l2 = abx * abx + abz * abz || 1;
      const t = clamp(((x - ax) * abx + (z - az) * abz) / l2, 0, 1);
      const px = ax + abx * t, pz = az + abz * t, dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz;
      if (d2 <= bdist2) { bdist2 = d2; bs = this.cum[i] + (this.cum[i + 1] - this.cum[i]) * t; const l = Math.sqrt(l2); bdl = (dx * -abz + dz * abx) / l; }
    }
    // beyond the ends the road just stops: measure along it
    out.s = bs; out.dist = Math.sqrt(bdist2); out.d = bdl || 0; out.i = best;
    if (Math.abs(out.d) < out.dist - 1e-6) out.d = Math.sign(out.d || 1) * out.dist;
    return true;
  }

  // nearest road distance by a hint (for a car that knows roughly where it is)
  project(x, z, hint, back = 20, fwd = 40) {
    let i = this.indexAt(Math.max(0, hint - back));
    const iEnd = this.indexAt(Math.min(this.L, hint + fwd));
    let bestS = hint, bestD = Infinity;
    for (; i <= iEnd && i < this.n - 1; i++) {
      const ax = this.xs[i], az = this.zs[i], abx = this.xs[i + 1] - ax, abz = this.zs[i + 1] - az;
      const l2 = abx * abx + abz * abz || 1;
      const t = clamp(((x - ax) * abx + (z - az) * abz) / l2, 0, 1);
      const dx = ax + abx * t - x, dz = az + abz * t - z, d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; bestS = this.cum[i] + (this.cum[i + 1] - this.cum[i]) * t; }
    }
    this.lastDist = Math.sqrt(bestD);
    return bestS;
  }

  // ---------------------------------------------------------------- the parts of the trip
  makeZones() {
    const cs = this.cornerS, L = this.L;
    // the bridge: where the straight before corner 7 crosses the lake's middle
    const lakeS0 = this.sAtZ(LAKE.z - 112, cs[5]), lakeS1 = this.sAtZ(LAKE.z + 112, cs[5]);
    return {
      ekeby: [0, cs[0] - 60],                // the start town
      farm: [cs[0] - 60, cs[2] + 230],
      forest: [cs[2] + 230, lakeS0 - 120],
      lake: [lakeS0 - 120, lakeS1 + 140],
      bridge: [lakeS0, lakeS1],
      mellby: [cs[7] - 190, cs[9] - 60],     // the village with the church
      ridge: [cs[9] - 60, cs[13] + 140],
      sjuby: [cs[13] + 140, L],              // the finish town
      start: 70, finish: L - 170,
      finish2: 161,                          // course 2's finish line, in Ekeby (room to stop after it)
      bumps: [cs[2] + 155, cs[11] + 165],     // crests where a fast car takes off
    };
  }

  sAtZ(z, from = 0) {
    for (let i = this.indexAt(from); i < this.n - 1; i++) if (this.zs[i] <= z && this.zs[i + 1] > z) return this.cum[i];
    return from;
  }

  zoneAt(s) {
    for (const k of ['ekeby', 'farm', 'forest', 'lake', 'mellby', 'ridge', 'sjuby']) {
      const Z = this.zones[k];
      if (s >= Z[0] && s < Z[1]) return k;
    }
    return 'farm';
  }
  inZone(s, k, pad = 0) { const Z = this.zones[k]; return s >= Z[0] - pad && s < Z[1] + pad; }
  townK(s) {
    // 1 inside a town, easing out over 80 m
    let k = 0;
    for (const t of ['ekeby', 'mellby', 'sjuby']) {
      const Z = this.zones[t];
      k = Math.max(k, smoothstep(Z[0] - 80, Z[0], s) * (1 - smoothstep(Z[1], Z[1] + 80, s)));
    }
    if (s < 0) k = 1;
    return k;
  }

  // a coarse distance-to-road field (chamfer transform on an 8 m grid) for the far landscape
  buildDistanceField() {
    const C = (this.dfC = 8), pad = 520;
    const x0 = (this.dfX0 = Math.floor(this.bbox.x0 - pad)), z0 = (this.dfZ0 = Math.floor(this.bbox.z0 - pad));
    const nx = (this.dfNx = Math.ceil((this.bbox.x1 + pad - x0) / C) + 1), nz = (this.dfNz = Math.ceil((this.bbox.z1 + pad - z0) / C) + 1);
    const D = (this.df = new Float32Array(nx * nz).fill(1e6));
    for (let i = 0; i < this.n; i++) {
      const gx = Math.round((this.xs[i] - x0) / C), gz = Math.round((this.zs[i] - z0) / C);
      const id = gz * nx + gx;
      const ex = Math.hypot(gx * C + x0 - this.xs[i], gz * C + z0 - this.zs[i]);
      if (ex < D[id]) D[id] = ex;
    }
    const a = C, b = C * Math.SQRT2;
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const id = z * nx + x;
      let v = D[id];
      if (x > 0) v = Math.min(v, D[id - 1] + a);
      if (z > 0) { v = Math.min(v, D[id - nx] + a); if (x > 0) v = Math.min(v, D[id - nx - 1] + b); if (x < nx - 1) v = Math.min(v, D[id - nx + 1] + b); }
      D[id] = v;
    }
    for (let z = nz - 1; z >= 0; z--) for (let x = nx - 1; x >= 0; x--) {
      const id = z * nx + x;
      let v = D[id];
      if (x < nx - 1) v = Math.min(v, D[id + 1] + a);
      if (z < nz - 1) { v = Math.min(v, D[id + nx] + a); if (x < nx - 1) v = Math.min(v, D[id + nx + 1] + b); if (x > 0) v = Math.min(v, D[id + nx - 1] + b); }
      D[id] = v;
    }
  }

  farDist(x, z) {
    const C = this.dfC, fx = (x - this.dfX0) / C, fz = (z - this.dfZ0) / C;
    const ix = clamp(Math.floor(fx), 0, this.dfNx - 2), iz = clamp(Math.floor(fz), 0, this.dfNz - 2);
    const tx = clamp(fx - ix, 0, 1), tz = clamp(fz - iz, 0, 1), D = this.df, nx = this.dfNx;
    const a = D[iz * nx + ix], b = D[iz * nx + ix + 1], c = D[(iz + 1) * nx + ix], d = D[(iz + 1) * nx + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  // ---------------------------------------------------------------- the natural ground
  // hills whose size depends on the part of the trip (by z, since the road runs north), rising
  // away from the road into a valley, with the lake dug into it
  natural(x, z, dfar = this.farDist(x, z)) {
    const amp = ampAt(z);
    let h = 17 + amp * 0.45 + 5 * Math.sin(z / 830 + 0.6) + amp * (fbm(x / 400, z / 400, 3) - 0.5) * 2.2 + amp * 0.32 * (fbm(x / 115 + 31, z / 115 - 17, 5) - 0.5) * 2;
    // no stray ponds: a soft floor above the water (only the lake goes below it)
    const fl = WATER + 2.5;
    if (h < fl + 3) h = fl + 3 * Math.exp((h - fl - 3) / 3);
    h += smoothstep(80, 460, dfar) * (26 + 30 * fbm(x / 260 - 9, z / 260 + 4, 9));
    // the lake
    const qx = (x - LAKE.x) / LAKE.ax, qz = (z - LAKE.z) / LAKE.az;
    const q = qx * qx + qz * qz + 0.5 * (fbm(x / 140, z / 140, 11) - 0.5);
    if (q < 1.6) h = lerp(WATER - 5.5 + 2 * q, h, smoothstep(0.62, 1.45, q));
    return h;
  }

  // ---------------------------------------------------------------- the road's height
  buildElevation() {
    const n = this.n, raw = new Float64Array(n);
    for (let i = 0; i < n; i++) raw[i] = this.natural(this.xs[i], this.zs[i], 0);
    // a wide smoothing so the road rolls with the land instead of copying every bump
    let ys = gaussian(raw, 34);
    // towns are flat, the bridge is level over the lake
    const Z = this.zones;
    const avg = (a, b) => { let s = 0, c = 0; for (let i = 0; i < n; i++) if (this.cum[i] >= a && this.cum[i] < b) { s += ys[i]; c++; } return c ? s / c : 10; };
    const towns = ['ekeby', 'mellby', 'sjuby'].map((t) => ({ a: Z[t][0], b: Z[t][1], y: avg(Z[t][0], Z[t][1]) }));
    towns[0].a = -200;
    const deck = WATER + 4.2;
    for (let i = 0; i < n; i++) {
      const s = this.cum[i];
      for (const T of towns) {
        const k = smoothstep(T.a - 120, T.a, s) * (1 - smoothstep(T.b, T.b + 120, s));
        ys[i] = lerp(ys[i], T.y, k);
      }
      const kb = smoothstep(Z.bridge[0] - 170, Z.bridge[0] - 10, s) * (1 - smoothstep(Z.bridge[1] + 10, Z.bridge[1] + 170, s));
      ys[i] = lerp(ys[i], deck, kb);
      ys[i] = Math.max(ys[i], WATER + 2.6);
    }
    // grades: at most 7 % – except the two crests, built steeper on purpose
    const gr = new Float64Array(n).fill(0.07);
    for (const b of Z.bumps) for (let i = 0; i < n; i++) if (Math.abs(this.cum[i] - b) < 70) gr[i] = 0.16;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < n; i++) { const ds = this.cum[i] - this.cum[i - 1], m = gr[i] * ds; ys[i] = clamp(ys[i], ys[i - 1] - m, ys[i - 1] + m); }
      for (let i = n - 2; i >= 0; i--) { const ds = this.cum[i + 1] - this.cum[i], m = gr[i] * ds; ys[i] = clamp(ys[i], ys[i + 1] - m, ys[i + 1] + m); }
    }
    ys = gaussian(ys, 5);
    // the crests: a steady climb, a sharp top and a drop – a fast car takes off
    for (const b of Z.bumps) for (let i = 0; i < n; i++) {
      const u = this.cum[i] - b;
      if (u > -44 && u < 40) ys[i] += 4.4 * (u < -2 ? smoothstep(-44, -2, u) : 1 - smoothstep(-2, 38, u));
    }
    this.ys = ys;
  }

  roadY(s) { const p = this.pointAt(s, T1); return p.y; }

  // ---------------------------------------------------------------- the AI's speed profile
  buildSpeedProfile() { this.vs = this.speedProfile(false); }

  // the cornering limit everywhere, then a braking pass against the driving direction
  speedProfile(reverse) {
    const n = this.n, vs = new Float64Array(n), aLat = 15.5, aBrake = 11, vMax = 60;
    for (let i = 0; i < n; i++) {
      // the tightest curvature a little around here
      let k = 0;
      for (let j = Math.max(0, i - 4); j <= Math.min(n - 1, i + 4); j++) k = Math.max(k, Math.abs(this.ks[j]));
      vs[i] = k ? Math.min(vMax, Math.sqrt(aLat / k)) : vMax;
    }
    if (!reverse) for (let i = n - 2; i >= 0; i--) vs[i] = Math.min(vs[i], Math.sqrt(vs[i + 1] * vs[i + 1] + 2 * aBrake * (this.cum[i + 1] - this.cum[i])));
    else for (let i = 1; i < n; i++) vs[i] = Math.min(vs[i], Math.sqrt(vs[i - 1] * vs[i - 1] + 2 * aBrake * (this.cum[i] - this.cum[i - 1])));
    return vs;
  }

  // ---------------------------------------------------------------- what the cars stand on
  // terrain height everywhere (for the landscape mesh); the road surface on the road
  height(x, z) {
    const dfar = this.farDist(x, z);
    const N = this.natural(x, z, dfar);
    if (dfar > 46) return N;
    if (!this.nearest(x, z, T2)) return N;
    return this.blend(T2, N);
  }

  blend(near, N) {
    const s = near.s, ad = near.dist;
    if (s < -5 || s > this.L + 5) {
      // past the ends of the road: just the land (the towns are flat there anyway)
    }
    const ry = this.roadY(clamp(s, 0, this.L));
    if (ad <= HW) return ry;
    const Z = this.zones;
    const onBridge = s > Z.bridge[0] && s < Z.bridge[1];
    if (onBridge) return ad <= HW + 0.9 ? ry : N;
    if (ad <= HW + SHOULDER) return ry - 0.04 * (ad - HW);
    const t = smoothstep(HW + SHOULDER, HW + 21, ad);
    const town = this.townK(s);
    const ditch = -0.55 * Math.exp(-(((ad - (HW + 3.8)) / 1.3) ** 2)) * (1 - town);
    return lerp(ry - 0.07, N, t) + ditch * (1 - t * 0.7);
  }

  groundHeight(x, z) {
    if (!this.nearest(x, z, T3)) return this.natural(x, z);
    const N = T3.dist > HW + 1 ? this.natural(x, z, Math.max(0, T3.dist - 2)) : 0;
    return this.blend(T3, N);
  }

  surfaceAt(x, z) {
    if (!this.nearest(x, z, T3)) return 'grass';
    if (T3.dist <= HW + 0.1) return 'road';
    if (T3.dist <= HW + SHOULDER || this.townK(T3.s) > 0.6) return 'gravel';
    return 'grass';
  }
}

const T0 = {}, T1 = {}, T2 = { s: 0, d: 0, i: 0, dist: 0 }, T3 = { s: 0, d: 0, i: 0, dist: 0 };

// how hilly it is along the trip (by z)
const AMP = [[-400, 4], [500, 5], [800, 9], [1250, 10], [1500, 24], [2000, 26], [2150, 10], [2500, 9], [2800, 8], [3150, 9], [3350, 26], [4300, 28], [4600, 9], [5400, 6]];
function ampAt(z) {
  if (z <= AMP[0][0]) return AMP[0][1];
  for (let i = 1; i < AMP.length; i++) if (z < AMP[i][0]) return lerp(AMP[i - 1][1], AMP[i][1], smoothstep(AMP[i - 1][0], AMP[i][0], z));
  return AMP[AMP.length - 1][1];
}

function gaussian(a, sigma) {
  const n = a.length, out = new Float64Array(n), R = Math.ceil(sigma * 3), w = [];
  for (let k = -R; k <= R; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -R; k <= R; k++) { const j = clamp(i + k, 0, n - 1); s += a[j] * w[k + R]; c += w[k + R]; }
    out[i] = s / c;
  }
  return out;
}
