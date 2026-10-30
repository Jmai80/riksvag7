// The world's meshes, built from the Track and the World data: the landscape, the road and the
// bridge, the lake, houses, the church, farms, trees, fields and everything along the road.
import * as THREE from './three.js';
import { HW, SHOULDER, WATER, LAKE, fbm, smoothstep } from './track.js';
import { makeRng, clamp } from './rng.js';
import * as TX from './textures.js';
import { makeTreeKit } from './trees.js';

export const NEAR_TREE = 45;   // trees closer than this to the road get the detailed models (trees.js)
const DETAIL_RANGE = 120;       // … when the camera is within this distance of their group

const P = {}, Q = {};

// ------------------------------------------------------------------ a geometry builder
class GB {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = []; }
  get n() { return this.pos.length / 3; }
  vert(p, n, uv, c) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]); this.col.push(c[0], c[1], c[2]); return this.n - 1; }
  // a flat quad a-b-c-d (counter-clockwise seen from the front)
  quad(a, b, c, d, col, uv = [[0, 0], [1, 0], [1, 1], [0, 1]]) {
    const n = norm(cross(sub(b, a), sub(d, a)));
    const i = this.n;
    this.vert(a, n, uv[0], col); this.vert(b, n, uv[1], col); this.vert(c, n, uv[2], col); this.vert(d, n, uv[3], col);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  tri(a, b, c, col, uv = [[0, 0], [1, 0], [0.5, 1]]) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    const i = this.n;
    this.vert(a, n, uv[0], col); this.vert(b, n, uv[1], col); this.vert(c, n, uv[2], col);
    this.idx.push(i, i + 1, i + 2);
  }
  // an axis-aligned box in a local frame (tf), all faces but the bottom; uv in metres / tile
  box(tf, x0, y0, z0, x1, y1, z1, col, tile = 0, bottom = false) {
    const p = (x, y, z) => tf(x, y, z);
    const u = (a, b) => (tile ? [a / tile, b / tile] : [a, b]);
    const W = x1 - x0, D = z1 - z0, H = y1 - y0;
    this.quad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), col, [u(0, 0), u(W, 0), u(W, H), u(0, H)]);   // +z
    this.quad(p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), col, [u(0, 0), u(W, 0), u(W, H), u(0, H)]);   // -z
    this.quad(p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), col, [u(0, 0), u(D, 0), u(D, H), u(0, H)]);   // +x
    this.quad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), col, [u(0, 0), u(D, 0), u(D, H), u(0, H)]);   // -x
    this.quad(p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0), col, [u(0, 0), u(W, 0), u(W, D), u(0, D)]);   // top
    if (bottom) this.quad(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1), col);
  }
  // ground-like meshes: turn every triangle so it faces up
  faceUp() {
    const P = this.pos, I = this.idx;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      const ux = P[b] - P[a], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vz = P[c + 2] - P[a + 2];
      if (uz * vx - ux * vz < 0) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
    }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const frame = (h, ox, oy, oz) => { const c = Math.cos(h), s = Math.sin(h); return (x, y, z) => [ox + x * c + z * s, oy + y, oz - x * s + z * c]; };
const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };   // (linear)
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// ------------------------------------------------------------------ the whole scenery
export class Scenery {
  constructor(track, world, opts = {}) {
    this.T = track; this.W = world;
    this.group = new THREE.Group();
    this.dense = opts.trees ?? 1;
    this.hd = opts.hdTrees ?? true;
    this.tex = {
      grass: TX.grassTexture(), road: TX.roadTexture(), gravel: TX.gravelTexture(), siding: TX.sidingTexture(),
      plaster: TX.plasterTexture(), roof: TX.roofTexture(), window: TX.windowTexture(), shop: TX.shopTexture(), door: TX.doorTexture(),
    };
    this.mats = {
      terrain: new THREE.MeshLambertMaterial({ map: this.tex.grass, vertexColors: true }),
      road: new THREE.MeshStandardMaterial({ map: this.tex.road, roughness: 0.88, metalness: 0.0 }),
      gravel: new THREE.MeshLambertMaterial({ map: this.tex.gravel, vertexColors: true }),
      wood: new THREE.MeshLambertMaterial({ map: this.tex.siding, vertexColors: true }),
      plaster: new THREE.MeshLambertMaterial({ map: this.tex.plaster, vertexColors: true }),
      roof: new THREE.MeshLambertMaterial({ map: this.tex.roof, vertexColors: true }),
      plain: new THREE.MeshLambertMaterial({ vertexColors: true }),
      window: new THREE.MeshStandardMaterial({ map: this.tex.window, roughness: 0.15, metalness: 0.0, envMapIntensity: 0.9, emissive: 0xffffff, emissiveMap: TX.windowGlowTexture(), emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      shop: new THREE.MeshStandardMaterial({ map: this.tex.shop, roughness: 0.15, metalness: 0.0, emissive: 0xffffff, emissiveMap: TX.shopGlowTexture(), emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      door: new THREE.MeshLambertMaterial({ map: this.tex.door, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      steel: new THREE.MeshStandardMaterial({ color: 0xb9bdc1, roughness: 0.42, metalness: 0.75, vertexColors: true, side: THREE.DoubleSide }),
      concrete: new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }),
      foliage: new THREE.MeshLambertMaterial({ vertexColors: true }),
    };
    this.buildTerrain();
    this.buildRoad();
    this.buildWater();
    this.buildFields();
    this.buildBuildings();
    this.buildTrees();
    this.buildRoadside();
    this.buildGantries();
    this.buildCrowd();
  }

  add(mesh, { cast = false, receive = true } = {}) {
    mesh.castShadow = cast; mesh.receiveShadow = receive;
    this.group.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- ground colour
  groundColor(x, z, y, slope, near) {
    const T = this.T;
    const n1 = fbm(x / 60, z / 60, 31), n2 = fbm(x / 13, z / 13, 32);
    let c = mixc([0.13, 0.18, 0.06], [0.24, 0.26, 0.1], n1);                     // meadow
    c = mixc(c, [0.32, 0.29, 0.14], smoothstep(0.55, 0.8, n2) * 0.55);           // dry patches
    // forest floor where the trees are
    const s = near ? near.s : T.sAtZ(z, 0);
    const zone = T.zoneAt(s);
    const forest = (zone === 'forest' || zone === 'ridge' ? 1 : zone === 'lake' ? 0.5 : 0.15) * smoothstep(0.3, 0.55, fbm(x / 90, z / 90, 21) + (zone === 'forest' || zone === 'ridge' ? 0.2 : 0));
    c = mixc(c, [0.08, 0.1, 0.045], forest * 0.85);
    if (near && T.townK(near.s) > 0.5 && near.dist < 40) c = mixc(c, [0.15, 0.24, 0.07], 0.55);  // lawns
    c = mixc(c, [0.25, 0.24, 0.21], smoothstep(0.42, 0.75, slope));            // rock on the steep bits
    if (y < WATER + 1.2) c = mixc(c, [0.32, 0.29, 0.2], smoothstep(WATER + 1.2, WATER + 0.3, y));
    if (y < WATER - 0.2) c = mixc(c, [0.12, 0.13, 0.1], smoothstep(WATER - 0.2, WATER - 2, y));
    // far away: a little bluer and flatter (aerial haze is the fog's job; this keeps hills readable)
    return mulc(c, 1.85);
  }

  // ---------------------------------------------------------------- the landscape
  buildTerrain() {
    const T = this.T, B = T.bbox;
    // (1) a fine ribbon along the road: from the shoulder out to 46 m on each side, every 4 m
    const offs = [0, 1.0, 2.1, 3.2, 4.6, 6.4, 8.8, 12, 16, 21, 27, 34, 41, 46.5].map((o) => HW + SHOULDER + o);
    const gb = new GB();
    const rows = [];
    for (let i = 0; i < T.n; i += 2) rows.push(i);
    if (rows[rows.length - 1] !== T.n - 1) rows.push(T.n - 1);
    // past the ends: keep going straight for 120 m so the towns don't end at a cliff
    const ext = [];
    for (let k = 6; k >= 1; k--) ext.push(-k * 20);
    const sList = [...ext, ...rows.map((i) => T.cum[i]), ...[1, 2, 3, 4, 5, 6].map((k) => T.L + k * 20)];
    const near = { s: 0, d: 0, i: 0, dist: 0 };
    for (const side of [1, -1]) {
      const base = gb.n;
      for (const s of sList) {
        T.pointAt(Math.max(0, Math.min(T.L, s)), P);
        if (s < 0 || s > T.L) { const e = s < 0 ? s : s - T.L; P.x += P.dx * e; P.z += P.dz * e; }
        const rx = -P.dz * side, rz = P.dx * side;
        for (const o of offs) {
          const x = P.x + rx * o, z = P.z + rz * o;
          let y = T.height(x, z);
          const ok = T.nearest(x, z, near);
          const hx = T.height(x + 1.5, z), hz = T.height(x, z + 1.5);
          const slope = Math.hypot(hx - y, hz - y) / 1.5;
          let c = this.groundColor(x, z, y, slope, ok ? near : null);
          if (o < HW + SHOULDER + 3.2) c = mixc(c, mulc([0.12, 0.15, 0.06], 1.85), 0.35);  // the verge
          gb.vert([x, y, z], [0, 1, 0], [x / 7, z / 7], c);
        }
      }
      const C = offs.length;
      for (let r = 0; r < sList.length - 1; r++) for (let k = 0; k < C - 1; k++) {
        const a = base + r * C + k, b = a + 1, c = a + C, d = c + 1;
        if (side > 0) gb.idx.push(a, c, b, b, c, d); else gb.idx.push(a, b, c, b, d, c);
      }
    }
    const rg = gb.faceUp().geometry();
    rg.computeVertexNormals();
    this.splitAdd(rg, this.mats.terrain, 900);

    // (2) the far landscape: a grid in chunks, sunk under the ribbon near the road
    const C = 192;
    const x0 = Math.floor((B.x0 - 560) / C) * C, x1 = B.x1 + 560, z0 = Math.floor((B.z0 - 560) / C) * C, z1 = B.z1 + 560;
    for (let cz = z0; cz < z1; cz += C) for (let cx = x0; cx < x1; cx += C) {
      let dmin = Infinity;
      for (let a = 0; a <= 4; a++) for (let b = 0; b <= 4; b++) dmin = Math.min(dmin, T.farDist(cx + (a * C) / 4, cz + (b * C) / 4));
      if (dmin > 620) continue;
      const step = dmin < 170 ? 8 : 24, N = C / step;
      const g = new GB();
      const heights = [];
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
        const x = cx + i * step, z = cz + j * step;
        const fd = T.farDist(x, z);
        let y = T.height(x, z);
        const sink = 2.0 * (1 - smoothstep(40, 54, fd));
        const hx = T.height(x + 2, z), hz = T.height(x, z + 2);
        const slope = Math.hypot(hx - y, hz - y) / 2;
        const c = this.groundColor(x, z, y, slope, null);
        y -= sink;
        heights.push(y);
        g.vert([x, y, z], [0, 1, 0], [x / 7, z / 7], c);
      }
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        g.idx.push(a, c, b, b, c, d);
      }
      g.faceUp();
      // skirts against cracks between chunks of different detail
      const edge = [];
      for (let i = 0; i <= N; i++) edge.push(i);
      for (let j = 1; j <= N; j++) edge.push(j * (N + 1) + N);
      for (let i = N - 1; i >= 0; i--) edge.push(N * (N + 1) + i);
      for (let j = N - 1; j >= 1; j--) edge.push(j * (N + 1));
      edge.push(0);
      for (let e = 0; e < edge.length - 1; e++) {
        const a = edge[e], b = edge[e + 1];
        const pa = g.pos.slice(a * 3, a * 3 + 3), pb = g.pos.slice(b * 3, b * 3 + 3);
        const ca = g.col.slice(a * 3, a * 3 + 3);
        const k = g.n;
        g.vert([pa[0], pa[1] - 4, pa[2]], [0, 1, 0], [0, 0], ca); g.vert([pb[0], pb[1] - 4, pb[2]], [0, 1, 0], [0, 0], ca);
        g.idx.push(a, k, b, b, k, k + 1, a, b, k, b, k + 1, k);
      }
      const geo = g.geometry();
      geo.computeVertexNormals();
      this.add(new THREE.Mesh(geo, this.mats.terrain));
      this.terrainChunks = (this.terrainChunks || 0) + 1;
    }
  }

  // split a big geometry into chunks along z so the camera can skip what it doesn't see
  splitAdd(geo, mat, chunk, opts) {
    const pos = geo.attributes.position, idx = geo.index.array;
    const buckets = new Map();
    for (let i = 0; i < idx.length; i += 3) {
      const z = (pos.getZ(idx[i]) + pos.getZ(idx[i + 1]) + pos.getZ(idx[i + 2])) / 3;
      const k = Math.floor(z / chunk);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(idx[i], idx[i + 1], idx[i + 2]);
    }
    for (const list of buckets.values()) {
      const g = geo.clone();
      g.setIndex(list);
      g.computeBoundingSphere();
      // a bounding sphere for only the used vertices
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      for (const v of list) { const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v); mnx = Math.min(mnx, x); mny = Math.min(mny, y); mnz = Math.min(mnz, z); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); mxz = Math.max(mxz, z); }
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3((mnx + mxx) / 2, (mny + mxy) / 2, (mnz + mxz) / 2), Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) / 2);
      this.add(new THREE.Mesh(g, mat), opts);
    }
  }

  // ---------------------------------------------------------------- the road, its shoulders, the bridge
  buildRoad() {
    const T = this.T, Z = T.zones;
    const road = new GB(), grav = new GB(), walk = new GB();
    const sList = [];
    for (let i = 0; i < T.n; i++) sList.push(T.cum[i]);
    for (const k of [1, 2, 3, 4, 5, 6]) sList.unshift(-k * 20);
    const rows = sList.map((s) => {
      T.pointAt(Math.max(0, Math.min(T.L, s)), P);
      if (s < 0) { P.x += P.dx * s; P.z += P.dz * s; }
      return { s, x: P.x, z: P.z, rx: -P.dz, rz: P.dx, y: T.roadY(Math.max(0, s)), town: T.townK(Math.max(0, s)) };
    });
    // asphalt: u across (0 left edge → 1 right edge), v along (12 m per tile)
    for (let r = 0; r < rows.length; r++) {
      const R = rows[r], v = R.s / 12;
      road.vert([R.x - R.rx * HW, R.y + 0.03, R.z - R.rz * HW], [0, 1, 0], [0, v], [1, 1, 1]);
      road.vert([R.x + R.rx * HW, R.y + 0.03, R.z + R.rz * HW], [0, 1, 0], [1, v], [1, 1, 1]);
      if (r > 0) { const a = (r - 1) * 2; road.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    // shoulders: gravel in the country, a pavement and a kerb line in the towns
    for (const side of [1, -1]) {
      const bg = grav.n, bw = walk.n;
      for (let r = 0; r < rows.length; r++) {
        const R = rows[r];
        const onBridge = R.s > Z.bridge[0] - 2 && R.s < Z.bridge[1] + 2;
        for (const [gb, o0, o1, base] of [[grav, HW, HW + SHOULDER, bg], [walk, HW, HW + SHOULDER + 1.4, bw]]) {
          void base;
          const yy = (o) => (onBridge ? R.y + 0.02 : R.y - 0.04 * (o - HW) + 0.025);
          const ca = gb === walk ? mixc([0.55, 0.55, 0.54], [0.0, 0.0, 0.0], 0) : [1, 1, 1];
          const k = gb === walk ? R.town : 1 - R.town;
          const col = gb === walk ? mulc(ca, 1) : mulc([1, 1, 1], 0.95);
          void k;
          gb.vert([R.x + R.rx * side * o0, yy(o0), R.z + R.rz * side * o0], [0, 1, 0], [0, R.s / 4], col);
          gb.vert([R.x + R.rx * side * o1, yy(o1) - (gb === grav ? 0.02 : 0), R.z + R.rz * side * o1], [0, 1, 0], [(o1 - o0) / 4, R.s / 4], col);
        }
      }
      for (const [gb, b, townOnly] of [[grav, bg, false], [walk, bw, true]]) {
        for (let r = 1; r < rows.length; r++) {
          const R = rows[r], R0 = rows[r - 1];
          const town = (R.town + R0.town) / 2 > 0.6;
          if (townOnly !== town) continue;
          if (R0.s > Z.bridge[0] - 14 && R.s < Z.bridge[1] + 14) continue;   // the bridge has its own concrete edge
          const a = b + (r - 1) * 2;
          if (side > 0) gb.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else gb.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
    const rg = road.faceUp().geometry();
    this.splitAdd(rg, this.mats.road, 600);
    this.splitAdd(grav.faceUp().geometry(), this.mats.gravel, 600);
    const pave = new THREE.MeshLambertMaterial({ map: this.tex.plaster, vertexColors: true });
    this.splitAdd(walk.faceUp().geometry(), pave, 600);

    // the bridge: a concrete deck with edge beams, piers down into the lake
    const b = new GB();
    const conc = [0.62, 0.61, 0.58];
    const bs0 = Z.bridge[0] - 14, bs1 = Z.bridge[1] + 14;
    for (let s = bs0; s < bs1; s += 2) {
      T.pointAt(s, P); T.pointAt(s + 2, Q);
      for (const side of [1, -1]) {
        const o0 = HW, o1 = HW + 1.05;
        const pa = (R, o, dy) => [R.x - R.dz * side * o, R.y + dy, R.z + R.dx * side * o];
        // the edge beam's top and outer face
        const top0 = pa(P, o0, 0.03), top1 = pa(Q, o0, 0.03), top2 = pa(Q, o1, 0.03), top3 = pa(P, o1, 0.03);
        if (side > 0) b.quad(top0, top1, top2, top3, conc); else b.quad(top0, top3, top2, top1, conc);
        const f0 = pa(P, o1, 0.03), f1 = pa(Q, o1, 0.03), f2 = pa(Q, o1, -1.3), f3 = pa(P, o1, -1.3);
        if (side > 0) b.quad(f3, f2, f1, f0, mulc(conc, 0.85)); else b.quad(f0, f1, f2, f3, mulc(conc, 0.85));
      }
      // the underside
      const u = (R, o) => [R.x - R.dz * o, R.y - 1.3, R.z + R.dx * o];
      b.quad(u(P, HW + 1.05), u(Q, HW + 1.05), u(Q, -HW - 1.05), u(P, -HW - 1.05), mulc(conc, 0.5));
    }
    for (let s = Z.bridge[0] + 18; s < Z.bridge[1] - 10; s += 32) {
      T.pointAt(s, P);
      const h = Math.atan2(P.dx, P.dz);
      for (const o of [-3.6, 3.6]) {
        const x = P.x - P.dz * o, z = P.z + P.dx * o;
        const ground = Math.min(T.natural(x, z), WATER - 1);
        b.box(frame(h, x, 0, z), -0.7, ground - 1, -0.9, 0.7, P.y - 1.3, 0.9, mulc(conc, 0.8));
      }
      b.box(frame(h, P.x, 0, P.z), -HW - 0.6, P.y - 2.0, -0.8, HW + 0.6, P.y - 1.3, 0.8, mulc(conc, 0.75));
    }
    this.add(new THREE.Mesh(b.geometry(), this.mats.concrete), { cast: true });
  }

  // ---------------------------------------------------------------- the lake
  buildWater() {
    const geo = new THREE.PlaneGeometry(LAKE.ax * 2 + 500, LAKE.az * 2 + 400, 1, 1).rotateX(-Math.PI / 2);
    const nm = TX.waterNormals();
    nm.repeat.set(220, 110);
    this.waterMat = new THREE.MeshStandardMaterial({ color: 0x1d3a44, roughness: 0.06, metalness: 0.0, normalMap: nm, normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 1.0, transparent: true, opacity: 0.94 });
    const m = new THREE.Mesh(geo, this.waterMat);
    m.position.set(LAKE.x, WATER, LAKE.z);
    this.add(m, { receive: true });
    this.water = m;
    // the jetties
    const g = new GB();
    for (const d of this.W.docks) {
      const tf = frame(d.h, d.x, WATER, d.z);
      for (let k = 0; k < d.len; k += 0.5) g.box(tf, -0.9, 0.35, k, 0.9, 0.45, k + 0.42, mulc([0.42, 0.33, 0.24], 1 + ((k * 7) % 3) * 0.05));
      for (const k of [0, d.len * 0.5, d.len - 0.4]) for (const x of [-0.85, 0.85]) g.box(tf, x - 0.08, -1.5, k, x + 0.08, 0.35, k + 0.16, [0.3, 0.24, 0.18]);
    }
    this.add(new THREE.Mesh(g.geometry(), this.mats.plain), { cast: true });
  }

  // ---------------------------------------------------------------- fields, fences, bales
  buildFields() {
    const T = this.T;
    const mats = {};
    for (const f of this.W.fields) {
      const mat = mats[f.crop] || (mats[f.crop] = new THREE.MeshLambertMaterial({ map: TX.cropTexture(f.crop), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }));
      const g = new GB(), N = 14, M = 14;
      const tf = frame(f.h, f.x, 0, f.z);
      for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
        const lx = (i / N - 0.5) * f.w, lz = (j / M - 0.5) * f.d;
        const [x, , z] = tf(lx, 0, lz);
        g.vert([x, T.height(x, z) + 0.08, z], [0, 1, 0], [lx / 9, lz / 9], [1, 1, 1]);
      }
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; g.idx.push(a, c, b, b, c, d); }
      const geo = g.faceUp().geometry();
      geo.computeVertexNormals();
      this.add(new THREE.Mesh(geo, mat));
    }
    // fences along the road side of each field: posts and two rails
    const fg = new GB();
    const wood = [0.36, 0.3, 0.24];
    for (const { field: f } of this.W.fences) {
      const tf = frame(f.h, f.x, 0, f.z);
      const lx = (f.side > 0 ? -1 : 1) * (f.w / 2 + 1.5);
      let prev = null;
      for (let lz = -f.d / 2; lz <= f.d / 2 + 0.01; lz += 3) {
        const [x, , z] = tf(lx, 0, lz);
        const y = T.height(x, z);
        fg.box(frame(f.h, x, y, z), -0.05, -0.2, -0.05, 0.05, 1.1, 0.05, wood);
        if (prev) for (const hgt of [0.5, 0.95]) {
          const a = [prev[0], prev[1] + hgt, prev[2]], b = [x, y + hgt, z];
          const up = 0.06;
          fg.quad([a[0], a[1], a[2]], [b[0], b[1], b[2]], [b[0], b[1] + up, b[2]], [a[0], a[1] + up, a[2]], wood);
          fg.quad([b[0], b[1], b[2]], [a[0], a[1], a[2]], [a[0], a[1] + up, a[2]], [b[0], b[1] + up, b[2]], wood);
        }
        prev = [x, y, z];
      }
    }
    this.splitAdd(fg.geometry(), this.mats.plain, 500, { cast: true });
    // wrapped bales (white plastic)
    if (this.W.bales.length) {
      const geo = new THREE.CylinderGeometry(0.62, 0.62, 1.2, 16).rotateZ(Math.PI / 2);
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.35 }), this.W.bales.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      this.W.bales.forEach((b, i) => { e.set(0, b.h, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(b.x, b.y + 0.58, b.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); });
      im.computeBoundingSphere();
      this.add(im, { cast: true });
    }
  }

  // ---------------------------------------------------------------- houses
  buildBuildings() {
    const T = this.T;
    const walls = { wood: new GB(), plaster: new GB() }, roof = new GB(), plain = new GB(), win = new GB(), shop = new GB(), door = new GB();
    const WHITE = [0.86, 0.86, 0.84];
    for (const b of this.W.buildings) {
      const R = makeRng(b.seed || 1);
      const wood = ['villa', 'stuga', 'barn', 'shed', 'boathouse'].includes(b.kind);
      const W = wood ? walls.wood : walls.plaster;
      const hw = b.w / 2, hd = b.d / 2;
      const floor = (b.footTop ?? b.y) + (b.kind === 'boathouse' ? 0.1 : 0.25);
      const tf = frame(b.h, b.x, floor, b.z);
      const col = rgb(b.color), rc = rgb(b.roofColor || 0x3a3d42);
      // plinth down into the ground
      plain.box(tf, -hw - 0.05, b.y - floor - 1.2, -hd - 0.05, hw + 0.05, 0.05, hd + 0.05, [0.33, 0.32, 0.3]);
      const H = b.wallH;
      // walls (uv in metres; wood boards 1 tile = 2 m, plaster 3 m)
      W.box(tf, -hw, 0, -hd, hw, H, hd, col, wood ? 2 : 3);
      // the roof
      this.roof(b, tf, hw, hd, H, rc, col, W, roof, plain, wood);
      // windows, doors, shop fronts
      const facade = (face, len, floors, kind) => {
        // face: +1 front (+z), -1 back, 2 right (+x), -2 left
        const place = (u, y, w, h, gbx, uv) => {
          const off = 0.04;
          let a, bb, c, d;
          if (Math.abs(face) === 1) {
            const z = face * (hd + off), s = face;
            a = tf(u - (w / 2) * s, y, z); bb = tf(u + (w / 2) * s, y, z); c = tf(u + (w / 2) * s, y + h, z); d = tf(u - (w / 2) * s, y + h, z);
          } else {
            const x = Math.sign(face) * (hw + off), s = Math.sign(face);
            a = tf(x, y, u + (w / 2) * s); bb = tf(x, y, u - (w / 2) * s); c = tf(x, y + h, u - (w / 2) * s); d = tf(x, y + h, u + (w / 2) * s);
          }
          gbx.quad(a, bb, c, d, [1, 1, 1], uv);
        };
        const winUV = () => { const k = R() < 0.6 ? 0 : R() < 0.5 ? 1 : 2, u0 = k / 4 + 0.002, u1 = (k + 1) / 4 - 0.002; return [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]; };
        const fullUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
        if (kind === 'block') {
          const bays = Math.max(2, Math.round(len / 3.2)), bw = len / bays;
          for (let f = 0; f < floors; f++) for (let k = 0; k < bays; k++) {
            const u = -len / 2 + bw * (k + 0.5);
            if (f === 0 && face === 1 && b.shop) {
              if (k % 3 === 1 && bays > 2) place(u, 0, 1.2, 2.3, door, fullUV);
              else place(u, 0.25, bw - 0.4, 2.6, shop, fullUV);
            } else if (f === 0 && face === 1 && k === Math.floor(bays / 2)) place(u, 0, 1.3, 2.4, door, fullUV);
            else place(u, f * 3.05 + 0.95, 1.3, 1.55, win, winUV());
          }
        } else if (kind === 'house') {
          const n = Math.max(1, Math.floor(len / 2.6));
          for (let f = 0; f < floors; f++) for (let k = 0; k < n; k++) {
            const u = -len / 2 + (len / n) * (k + 0.5);
            if (f === 0 && face === 1 && k === Math.floor(n / 2) && b.kind !== 'boathouse') place(u, 0, 1.0, 2.1, door, fullUV);
            else place(u, f * 2.7 + 0.9, 1.0, 1.25, win, winUV());
          }
        }
      };
      if (b.kind === 'block' || b.kind === 'station') {
        const floors = b.floors || 1;
        facade(1, b.w, floors, 'block'); facade(-1, b.w, floors, 'block');
        if (b.d > 9) { facade(2, b.d, floors, 'block'); facade(-2, b.d, floors, 'block'); }
      } else if (b.kind === 'villa' || b.kind === 'stuga') {
        const floors = H > 4 ? 2 : 1;
        facade(1, b.w, floors, 'house'); facade(-1, b.w, floors, 'house');
        facade(2, b.d * 0.7, 1, 'house'); facade(-2, b.d * 0.7, 1, 'house');
        // white corner boards and a chimney
        for (const [x, z] of [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]]) plain.box(tf, x - 0.08, 0, z - 0.08, x + 0.08, H, z + 0.08, WHITE);
        const cx = R.range(-hw * 0.5, hw * 0.5);
        plain.box(tf, cx - 0.3, H, -0.3, cx + 0.3, H + hd * 0.75 + 1.1, 0.3, [0.36, 0.2, 0.16]);
        if (b.porch) {
          plain.box(tf, -1.3, 0, hd, 1.3, 0.25, hd + 1.6, [0.45, 0.42, 0.38]);
          roof.box(tf, -1.4, 2.5, hd, 1.4, 2.62, hd + 1.7, rc, 2);
          for (const x of [-1.2, 1.2]) plain.box(tf, x - 0.07, 0.25, hd + 1.45, x + 0.07, 2.5, hd + 1.59, WHITE);
        }
      } else if (b.kind === 'barn') {
        // the big doors, white framed
        plain.box(tf, -1.8, 0, hd, 1.8, 3.4, hd + 0.06, mulc(col, 0.8));
        for (const x of [-1.85, 1.8]) plain.box(tf, x, 0, hd, x + 0.08, 3.5, hd + 0.1, WHITE);
        plain.box(tf, -1.9, 3.4, hd, 1.9, 3.5, hd + 0.1, WHITE);
        plain.box(tf, -0.04, 0, hd + 0.06, 0.04, 3.4, hd + 0.09, WHITE);
        for (const [x, z] of [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]]) plain.box(tf, x - 0.1, 0, z - 0.1, x + 0.1, H, z + 0.1, WHITE);
      } else if (b.kind === 'shed' || b.kind === 'boathouse') {
        plain.box(tf, -0.6, 0, hd, 0.6, 1.9, hd + 0.05, mulc(col, 0.75));
        for (const [x, z] of [[hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd]]) plain.box(tf, x - 0.07, 0, z - 0.07, x + 0.07, H, z + 0.07, WHITE);
      } else if (b.kind === 'church') {
        // tall arched windows along the nave, a tower with a spire at the front
        for (const side of [1, -1]) for (let k = 0; k < 4; k++) {
          const z = -hd + 4 + k * 4.4, x = side * (hw + 0.04);
          const a = tf(x, 1.6, z + 0.6 * side), bb = tf(x, 1.6, z - 0.6 * side), c = tf(x, 5.6, z - 0.6 * side), d = tf(x, 5.6, z + 0.6 * side);
          win.quad(a, bb, c, d, [1, 1, 1], [[0.002, 0], [0.248, 0], [0.248, 1], [0.002, 1]]);
        }
        const tw = 2.9;
        W.box(tf, -tw, 0, hd - 0.2, tw, H + 9.5, hd + 5.6, col, 3);
        plain.box(tf, -tw - 0.1, H + 9.5, hd - 0.3, tw + 0.1, H + 9.8, hd + 5.7, WHITE);
        // the spire: a tall black pyramid with a gilded ball
        const top = H + 9.8, cz = hd + 2.7, sp = (x, y, z) => tf(x, y, z);
        const s0 = [sp(-tw, top, cz - tw), sp(tw, top, cz - tw), sp(tw, top, cz + tw), sp(-tw, top, cz + tw)], apex = sp(0, top + 11, cz);
        for (let k = 0; k < 4; k++) roof.tri(s0[k], s0[(k + 1) % 4], apex, [0.08, 0.08, 0.09]);
        plain.box(tf, -0.25, top + 11, cz - 0.25, 0.25, top + 11.5, cz + 0.25, [0.9, 0.7, 0.2]);
        plain.box(tf, -0.06, top + 11.5, cz - 0.06, 0.06, top + 13, cz + 0.06, [0.85, 0.65, 0.2]);
        place2(door, tf, 0, 0, hd + 5.64, 1.6, 3.0);
        // the clock faces
        for (const z of [hd + 5.65]) { const a = tf(-0.9, H + 6.2, z), bb = tf(0.9, H + 6.2, z), c = tf(0.9, H + 8.0, z), d = tf(-0.9, H + 8.0, z); plain.quad(a, bb, c, d, [0.85, 0.85, 0.82]); }
      }
      if (b.kind === 'station') {
        // the canopy over the pumps, in front of the shop
        const ct = frame(b.h, b.x, (b.footTop ?? b.y) + 0.25, b.z);
        roof.box(ct, -hw, 4.6, hd + 1.5, hw, 5.3, hd + 9.5, [0.86, 0.86, 0.84], 0);
        plain.box(ct, -hw - 0.02, 4.85, hd + 1.48, hw + 0.02, 5.25, hd + 9.52, [0.75, 0.12, 0.1]);
        for (const x of [-hw + 1.5, hw - 1.5]) for (const z of [hd + 3.5, hd + 7.5]) plain.box(ct, x - 0.18, 0, z - 0.18, x + 0.18, 4.6, z + 0.18, [0.8, 0.8, 0.78]);
        for (const x of [-3.5, 3.5]) { plain.box(ct, x - 0.45, 0, hd + 5.2, x + 0.45, 1.75, hd + 5.8, [0.85, 0.85, 0.83]); plain.box(ct, x - 0.46, 1.2, hd + 5.18, x + 0.46, 1.55, hd + 5.82, [0.75, 0.12, 0.1]); }
      }
    }
    function place2(gbx, tf, x, y, z, w, h) { gbx.quad(tf(x - w / 2, y, z), tf(x + w / 2, y, z), tf(x + w / 2, y + h, z), tf(x - w / 2, y + h, z), [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]); }
    this.splitAdd(walls.wood.geometry(), this.mats.wood, 500, { cast: true });
    this.splitAdd(walls.plaster.geometry(), this.mats.plaster, 500, { cast: true });
    this.splitAdd(roof.geometry(), this.mats.roof, 500, { cast: true });
    this.splitAdd(plain.geometry(), this.mats.plain, 500, { cast: true });
    this.splitAdd(win.geometry(), this.mats.window, 500);
    if (shop.n) this.splitAdd(shop.geometry(), this.mats.shop, 500);
    this.splitAdd(door.geometry(), this.mats.door, 500);
  }

  roof(b, tf, hw, hd, H, rc, col, W, roof, plain, wood) {
    const o = 0.45, WHITE = [0.86, 0.86, 0.84];
    if (b.roof === 'flat') {
      roof.box(tf, -hw - 0.05, H, -hd - 0.05, hw + 0.05, H + 0.25, hd + 0.05, mulc(rc, 0.9), 0);
      plain.box(tf, -hw - 0.1, H + 0.25, -hd - 0.1, hw + 0.1, H + 0.6, -hd + 0.15, [0.5, 0.5, 0.5]);
      plain.box(tf, -hw - 0.1, H + 0.25, hd - 0.15, hw + 0.1, H + 0.6, hd + 0.1, [0.5, 0.5, 0.5]);
      return;
    }
    if (b.roof === 'hip') {
      const rh = Math.min(hd, hw) * 0.65, rx = Math.max(0.5, hw - hd);
      const e = [tf(-hw - o, H, -hd - o), tf(hw + o, H, -hd - o), tf(hw + o, H, hd + o), tf(-hw - o, H, hd + o)];
      const r0 = tf(-rx, H + rh, 0), r1 = tf(rx, H + rh, 0);
      roof.quad(e[3], e[2], r1, r0, rc, [[0, 0], [b.w / 2, 0], [b.w / 2, hd / 1.5], [0, hd / 1.5]]);
      roof.quad(e[1], e[0], r0, r1, rc, [[0, 0], [b.w / 2, 0], [b.w / 2, hd / 1.5], [0, hd / 1.5]]);
      roof.tri(e[2], e[1], r1, rc, [[0, 0], [b.d / 2, 0], [b.d / 4, hd / 1.5]]);
      roof.tri(e[0], e[3], r0, rc, [[0, 0], [b.d / 2, 0], [b.d / 4, hd / 1.5]]);
      return;
    }
    // gable (and gambrel): the ridge across the width (along x); for the church and boathouses along
    // the depth (z) instead
    const along = b.kind === 'church' || b.kind === 'boathouse';
    const pitch = b.kind === 'barn' ? 0.62 : b.kind === 'church' ? 0.95 : 0.78;
    if (!along) {
      const rh = hd * pitch;
      const tl = (x, y, z) => tf(x, y, z);
      if (b.roof === 'gambrel') {
        const k1 = [hd * 0.55, hd * 0.95], k2 = [0, hd * 1.35];
        void k2;
        const ys = [H, H + k1[1], H + hd * 1.3];
        const zs = [hd + o, hd * 0.55, 0];
        for (const s of [1, -1]) {
          for (let k = 0; k < 2; k++) {
            const a = tl(-hw - o, ys[k], s * zs[k]), bb = tl(hw + o, ys[k], s * zs[k]), c = tl(hw + o, ys[k + 1], s * zs[k + 1]), d = tl(-hw - o, ys[k + 1], s * zs[k + 1]);
            if (s > 0) roof.quad(a, bb, c, d, rc, [[0, 0], [b.w / 2, 0], [b.w / 2, 1.5], [0, 1.5]]);
            else roof.quad(bb, a, d, c, rc, [[0, 0], [b.w / 2, 0], [b.w / 2, 1.5], [0, 1.5]]);
          }
        }
        for (const x of [hw, -hw]) {
          const pts = [[hd, H], [hd * 0.55, ys[1]], [0, ys[2]], [-hd * 0.55, ys[1]], [-hd, H]].map(([z, y]) => tl(x, y, z));
          const c0 = tl(x, H, 0);
          for (let k = 0; k < pts.length - 1; k++) (x > 0 ? W.tri(pts[k], c0, pts[k + 1], col, [[0, 0], [0.5, 0], [0.25, 0.5]]) : W.tri(pts[k + 1], c0, pts[k], col, [[0, 0], [0.5, 0], [0.25, 0.5]]));
        }
        return;
      }
      const a = tl(-hw - o, H - 0.08, hd + o), bb = tl(hw + o, H - 0.08, hd + o), r1 = tl(hw + o, H + rh, 0), r0 = tl(-hw - o, H + rh, 0);
      const c = tl(hw + o, H - 0.08, -hd - o), d = tl(-hw - o, H - 0.08, -hd - o);
      const sl = Math.hypot(hd + o, rh) / 1.4;
      roof.quad(a, bb, r1, r0, rc, [[0, 0], [b.w / 2, 0], [b.w / 2, sl], [0, sl]]);
      roof.quad(c, d, r0, r1, rc, [[0, 0], [b.w / 2, 0], [b.w / 2, sl], [0, sl]]);
      // gables
      for (const x of [hw, -hw]) {
        const p0 = tl(x, H, hd), p1 = tl(x, H, -hd), p2 = tl(x, H + rh * (hd / (hd + o)), 0);
        if (x > 0) W.tri(p0, p1, p2, col, [[0, 0], [b.d / (wood ? 2 : 3), 0], [b.d / (wood ? 4 : 6), rh / (wood ? 2 : 3)]]);
        else W.tri(p1, p0, p2, col, [[0, 0], [b.d / (wood ? 2 : 3), 0], [b.d / (wood ? 4 : 6), rh / (wood ? 2 : 3)]]);
      }
      // white barge boards along the rakes
      if (wood) for (const x of [hw + o, -hw - o]) {
        for (const s of [1, -1]) {
          const e0 = tl(x, H - 0.08, s * (hd + o)), e1 = tl(x, H + rh, 0);
          const e0b = [e0[0], e0[1] - 0.22, e0[2]], e1b = [e1[0], e1[1] - 0.22, e1[2]];
          if ((x > 0) === (s > 0)) plain.quad(e0b, e1b, e1, e0, WHITE); else plain.quad(e1b, e0b, e0, e1, WHITE);
        }
      }
    } else {
      const rh = hw * pitch;
      const tl = (x, y, z) => tf(x, y, z);
      const a = tl(hw + o, H - 0.08, hd + o), bb = tl(hw + o, H - 0.08, -hd - o), r1 = tl(0, H + rh, -hd - o), r0 = tl(0, H + rh, hd + o);
      const c = tl(-hw - o, H - 0.08, -hd - o), d = tl(-hw - o, H - 0.08, hd + o);
      const sl = Math.hypot(hw + o, rh) / 1.4;
      roof.quad(a, bb, r1, r0, rc, [[0, 0], [b.d / 2, 0], [b.d / 2, sl], [0, sl]]);
      roof.quad(c, d, r0, r1, rc, [[0, 0], [b.d / 2, 0], [b.d / 2, sl], [0, sl]]);
      for (const z of [hd, -hd]) {
        const p0 = tl(-hw, H, z), p1 = tl(hw, H, z), p2 = tl(0, H + rh * (hw / (hw + o)), z);
        if (z > 0) W.tri(p0, p1, p2, col, [[0, 0], [b.w / 3, 0], [b.w / 6, rh / 3]]);
        else W.tri(p1, p0, p2, col, [[0, 0], [b.w / 3, 0], [b.w / 6, rh / 3]]);
      }
    }
  }

  // ---------------------------------------------------------------- trees (instanced, in chunks)
  buildTrees() {
    const geos = { spruce: spruceGeo(), pine: pineGeo(), birch: birchGeo() };
    const kit = this.hd ? (this.treeKit = makeTreeKit()) : null;
    const chunks = new Map();
    const keep = this.dense;
    const NEAR = { s: 0, d: 0, i: 0, dist: 0 };
    this.W.trees.forEach((t, i) => {
      if (keep < 1 && (i % 100) / 100 >= keep && t.d > 25) return;
      const hd = kit && t.d < NEAR_TREE;
      // detailed trees in small groups along the road (so the camera and the sun's shadow only draw
      // the ones near them); the rest in big blocks
      let k;
      if (hd) { const ci = Math.floor((this.T.nearest(t.x, t.z, NEAR) ? NEAR.s : 0) / 120); k = `${t.type}:${1 + (ci % 2)}:${ci}`; }
      else k = `${t.type}:0:${Math.floor(t.z / 260)}:${Math.floor(t.x / 400)}`;
      if (!chunks.has(k)) chunks.set(k, []);
      chunks.get(k).push(t);
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    this.treeMeshes = [];
    this.treeLods = [];
    const fill = (im, list, tint, sink) => {
      list.forEach((t, i) => {
        e.set(0, t.r, 0); q.setFromEuler(e);
        const s = t.s;
        v.set(t.x, t.y - sink, t.z); sc.set(s, s * (0.9 + (t.r % 0.3)), s);
        m4.compose(v, q, sc);
        im.setMatrixAt(i, m4);
        if (tint) {
          const h = 0.85 + ((t.r * 1000) % 1) * 0.3;
          c.setRGB(h, h * (0.95 + (t.r % 0.1)), h * 0.9);
          im.setColorAt(i, c);
        }
      });
      im.computeBoundingSphere();
      this.treeMeshes.push(im);
    };
    for (const [k, list] of chunks) {
      const [type, variant] = k.split(':');
      const simple = new THREE.InstancedMesh(geos[type], this.mats.foliage, list.length);
      fill(simple, list, true, 0.25);
      // only the detailed trees by the road cast shadows (the sun's shadow only covers the road
      // around the car anyway; the big blocks further out would cost a lot for nothing)
      this.add(simple, { cast: false, receive: false });
      if (variant === '0') continue;
      // the detailed roadside tree: bark and foliage, both casting shadows. Close to the camera it
      // replaces the simple one (update() swaps them by distance)
      const G = kit.geos[type][Number(variant) - 1], M = kit.mats[type];
      const tr = new THREE.InstancedMesh(G.trunk, M.trunk, list.length);
      fill(tr, list, false, 0);
      this.add(tr, { cast: true, receive: true });
      const cr = new THREE.InstancedMesh(G.crown, M.crown, list.length);
      fill(cr, list, true, 0);
      this.add(cr, { cast: true, receive: false });
      const bs = cr.boundingSphere;
      this.treeLods.push({ center: bs.center.clone(), r: bs.radius, simple, detail: [tr, cr] });
      tr.visible = cr.visible = false;
    }
    // rocks
    if (this.W.rocks.length) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.75 + fbm(x * 2 + 5, z * 2 + y * 3, 41) * 0.5; p.setXYZ(i, x * k, y * k * 0.7, z * k); }
      g.computeVertexNormals();
      const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x8a8780 }), this.W.rocks.length);
      this.W.rocks.forEach((r, i) => { e.set(0.2, r.r, 0.1); q.setFromEuler(e); m4.compose(v.set(r.x, r.y + r.size * 0.25, r.z), q, sc.set(r.size, r.size, r.size * 1.2)); im.setMatrixAt(i, m4); });
      im.computeBoundingSphere();
      this.add(im, { cast: true });
    }
  }

  // ---------------------------------------------------------------- along the road
  buildRoadside() {
    const T = this.T, W = this.W;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const inst = (geo, mat, list, f, opts = { cast: true }) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => { f(it, m4); im.setMatrixAt(i, m4); });
      im.computeBoundingSphere();
      return this.add(im, opts);
    };
    const place = (x, y, z, h) => { e.set(0, h, 0); q.setFromEuler(e); return m4.compose(v.set(x, y, z), q, one); };
    // guardrails: a steel W-beam on posts
    const rail = new GB();
    const steelC = [1, 1, 1];
    for (const r of W.rails) {
      let prev = null;
      for (let s = r.s0; s <= r.s1 + 0.01; s += 2) {
        T.beside(Math.min(s, r.s1), r.d, P);
        const y = T.roadY(Math.min(s, r.s1));
        const cur = { x: P.x, z: P.z, y, rx: -P.dz * Math.sign(r.d), rz: P.dx * Math.sign(r.d) };
        if (prev) {
          // the beam: three faces (front, top lip, bottom lip)
          const f = (p, dy, out) => [p.x + p.rx * out, p.y + dy, p.z + p.rz * out];
          const side = Math.sign(r.d);
          const qd = (a, b, c, d) => (side > 0 ? rail.quad(a, b, c, d, steelC) : rail.quad(b, a, d, c, steelC));
          qd(f(prev, 0.46, -0.04), f(cur, 0.46, -0.04), f(cur, 0.6, -0.1), f(prev, 0.6, -0.1));
          qd(f(prev, 0.6, -0.1), f(cur, 0.6, -0.1), f(cur, 0.74, -0.04), f(prev, 0.74, -0.04));
          qd(f(cur, 0.46, -0.04), f(prev, 0.46, -0.04), f(prev, 0.46, 0.05), f(cur, 0.46, 0.05));
          qd(f(prev, 0.74, -0.04), f(cur, 0.74, -0.04), f(cur, 0.74, 0.05), f(prev, 0.74, 0.05));
        }
        if (Math.round((s - r.s0) / 2) % 2 === 0) rail.box(frame(Math.atan2(P.dx, P.dz), P.x + cur.rx * 0.05, y, P.z + cur.rz * 0.05), -0.04, -0.6, -0.06, 0.04, 0.66, 0.06, [0.75, 0.76, 0.77]);
        prev = cur;
      }
    }
    this.splitAdd(rail.geometry(), this.mats.steel, 500, { cast: true });

    // reflector posts: white with a black band and an amber reflector
    const postG = new GB();
    postG.box((x, y, z) => [x, y, z], -0.05, 0, -0.04, 0.05, 1.0, 0.04, [0.9, 0.9, 0.88]);
    postG.box((x, y, z) => [x, y, z], -0.051, 0.72, -0.041, 0.051, 0.92, 0.041, [0.02, 0.02, 0.02]);
    postG.box((x, y, z) => [x, y, z], -0.03, 0.76, -0.045, 0.03, 0.86, -0.04, [1.0, 0.45, 0.05]);
    inst(postG.geometry(), this.mats.plain, W.posts, (p, m) => place(p.x, p.y - 0.05, p.z, p.h + (p.side > 0 ? 0 : Math.PI)), { cast: false });

    // street lights
    const lampG = new GB();
    const gray = [0.42, 0.44, 0.46];
    lampG.box((x, y, z) => [x, y, z], -0.07, 0, -0.07, 0.07, 7.6, 0.07, gray);
    lampG.box((x, y, z) => [x, y, z], -0.04, 7.45, -0.04, 1.6, 7.55, 0.04, gray);
    lampG.box((x, y, z) => [x, y, z], 1.2, 7.3, -0.15, 2.0, 7.48, 0.15, [0.3, 0.31, 0.33]);
    inst(lampG.geometry(), this.mats.plain, W.lamps, (l, m) => place(l.x, l.y - 0.1, l.z, l.h));
    const headG = new GB();
    headG.box((x, y, z) => [x, y, z], 1.25, 7.25, -0.12, 1.95, 7.3, 0.12, [1, 1, 1], 0, true);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, emissive: 0xffdca8, emissiveIntensity: 0, roughness: 0.3 });
    inst(headG.geometry(), this.lampMat, W.lamps, (l, m) => place(l.x, l.y - 0.1, l.z, l.h), { cast: false });
    const poolMat = new THREE.MeshBasicMaterial({ map: TX.lightPoolTexture(false), color: 0xffcf8a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    this.lampPools = inst(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), poolMat, W.lamps, (l, m) => {
      const x = l.x + Math.cos(l.h) * 1.6, z = l.z - Math.sin(l.h) * 1.6;
      return place(x, this.T.height(x, z) + 0.08, z, 0);
    }, { cast: false, receive: false });
    if (this.lampPools) { this.lampPools.visible = false; this.lampPools.renderOrder = 3; }

    // the power line: wooden poles with a crossarm, three sagging wires
    const poleG = new GB();
    const pw = [0.32, 0.25, 0.19];
    poleG.box((x, y, z) => [x, y, z], -0.12, 0, -0.12, 0.12, 9.0, 0.12, pw);
    poleG.box((x, y, z) => [x, y, z], -1.2, 8.3, -0.07, 1.2, 8.48, 0.07, pw);
    for (const x of [-1.05, 0, 1.05]) poleG.box((x2, y, z) => [x2, y, z], x - 0.05, x === 0 ? 9.0 : 8.48, -0.05, x + 0.05, x === 0 ? 9.2 : 8.68, 0.05, [0.85, 0.85, 0.82]);
    inst(poleG.geometry(), this.mats.plain, W.poles, (p, m) => place(p.x, p.y - 0.2, p.z, p.h + Math.PI / 2));
    const wires = [];
    for (const p of W.poles) {
      if (!p.prev) continue;
      const a = p.prev;
      for (const [ox, oy] of [[-1.05, 8.66], [0, 9.18], [1.05, 8.66]]) {
        const pa = [a.x + Math.cos(a.h + Math.PI / 2) * ox, a.y - 0.2 + oy, a.z - Math.sin(a.h + Math.PI / 2) * ox];
        const pb = [p.x + Math.cos(p.h + Math.PI / 2) * ox, p.y - 0.2 + oy, p.z - Math.sin(p.h + Math.PI / 2) * ox];
        const N = 8;
        for (let k = 0; k < N; k++) {
          const t0 = k / N, t1 = (k + 1) / N, sag = (t) => -4 * 0.9 * t * (1 - t);
          wires.push(pa[0] + (pb[0] - pa[0]) * t0, pa[1] + (pb[1] - pa[1]) * t0 + sag(t0), pa[2] + (pb[2] - pa[2]) * t0);
          wires.push(pa[0] + (pb[0] - pa[0]) * t1, pa[1] + (pb[1] - pa[1]) * t1 + sag(t1), pa[2] + (pb[2] - pa[2]) * t1);
        }
      }
    }
    if (wires.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
      this.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.7 })));
    }

    // signs
    this.courseSigns = {};
    const signPost = new GB(), coursePosts = {};
    for (const s of W.signs) {
      const tex = TX.signTexture(s.kind, s.text);
      const wide = ['town', 'distance', 'lake', 'board'].includes(s.kind);
      const sw = s.kind === 'distance' ? 2.4 : wide ? 2.0 : s.kind === 'chevron' ? 0.7 : 0.9, sh = s.kind === 'distance' ? 1.2 : wide ? 1.0 : s.kind === 'chevron' ? 0.7 : 0.9;
      const hgt = s.kind === 'chevron' ? 1.2 : wide ? 1.9 : 1.75;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshLambertMaterial({ map: tex, transparent: s.kind === 'speed' }));
      face.position.set(s.x, s.y + hgt + sh / 2, s.z);
      face.rotation.y = s.h;
      this.add(face);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), s.back ? new THREE.MeshLambertMaterial({ map: TX.signTexture('chevron', s.back) }) : new THREE.MeshLambertMaterial({ color: 0x8c9196 }));
      back.position.copy(face.position); back.rotation.y = s.h + Math.PI;
      if (s.kind !== 'speed') this.add(back);
      if (s.course) { (this.courseSigns[s.course] || (this.courseSigns[s.course] = [])).push(face, back); }
      const posts = wide ? [-sw * 0.35, sw * 0.35] : [0];
      const pg = s.course ? (coursePosts[s.course] || (coursePosts[s.course] = new GB())) : signPost;
      for (const px of posts) pg.box(frame(s.h, s.x, s.y - 0.2, s.z), px - 0.04, 0, -0.06, px + 0.04, hgt + sh, -0.02, [0.55, 0.57, 0.6]);
    }
    this.add(new THREE.Mesh(signPost.geometry(), this.mats.plain), { cast: true });
    for (const c in coursePosts) this.courseSigns[c].push(this.add(new THREE.Mesh(coursePosts[c].geometry(), this.mats.plain), { cast: true }));

    // Swedish flags on poles at some houses (the cloth sways in update())
    this.flags = [];
    const flagTex = (() => { const c = document.createElement('canvas'); c.width = 160; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#006aa7'; g.fillRect(0, 0, 160, 100); g.fillStyle = '#fecc00'; g.fillRect(50, 0, 20, 100); g.fillRect(0, 40, 160, 20); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const flagMat = new THREE.MeshLambertMaterial({ map: flagTex, side: THREE.DoubleSide });
    const poleM = new GB();
    for (const f of W.flags) {
      const y = T.height(f.x, f.z);
      poleM.box((x, yy, z) => [f.x + x, y + yy, f.z + z], -0.05, 0, -0.05, 0.05, 8, 0.05, [0.92, 0.92, 0.9]);
      poleM.box((x, yy, z) => [f.x + x, y + yy, f.z + z], -0.1, 8, -0.1, 0.1, 8.2, 0.1, [0.9, 0.75, 0.2]);
      const geo = new THREE.PlaneGeometry(1.6, 1.0, 6, 1).translate(0.8, 0, 0);
      const fl = new THREE.Mesh(geo, flagMat);
      fl.position.set(f.x, y + 7.4, f.z);
      fl.userData.phase = f.phase;
      this.add(fl);
      this.flags.push(fl);
    }
    if (W.flags.length) this.add(new THREE.Mesh(poleM.geometry(), this.mats.plain), { cast: true });
  }

  // ---------------------------------------------------------------- start and finish
  buildGantries() {
    const T = this.T;
    this.startLights = { 1: [], 2: [] };
    this.banners = [];
    // course 1 starts at the Ekeby gantry and finishes at the Sjuby one; course 2 starts in Sjuby and
    // finishes under its own gantry a little further into Ekeby
    const texts = {
      start: { 1: ['RIKSVÄG 7 · START', false], 2: ['EKEBY CENTRUM', false] },
      finish: { 1: ['MÅL · SJUBY', true], 2: ['KVÄLLSRACET · START', false] },
      goal2: { 1: ['LYCKA TILL!', false], 2: ['MÅL · EKEBY', true] },
    };
    for (const gn of this.W.gantries) {
      const g = new GB();
      const tf = frame(gn.h, gn.x, gn.y, gn.z);
      const dark = [0.12, 0.13, 0.14], yel = [0.9, 0.7, 0.1];
      const sx = HW + 1.3;
      for (const x of [-sx, sx]) {
        g.box(tf, x - 0.35, -1, -0.35, x + 0.35, 7.2, 0.35, dark);
        g.box(tf, x - 0.5, -1, -0.5, x + 0.5, 0.6, 0.5, [0.5, 0.5, 0.48]);
        for (let y = 0.8; y < 7; y += 1.2) g.box(tf, x - 0.37, y, -0.37, x + 0.37, y + 0.12, 0.37, yel);
      }
      g.box(tf, -sx - 0.35, 6.0, -0.4, sx + 0.35, 7.6, 0.4, dark);
      this.add(new THREE.Mesh(g.geometry(), this.mats.plain), { cast: true });
      const tx = { 1: TX.bannerTexture(...texts[gn.kind][1]), 2: TX.bannerTexture(...texts[gn.kind][2]) };
      for (const side of [1, -1]) {
        const mat = new THREE.MeshStandardMaterial({ map: tx[1], emissive: 0xffffff, emissiveMap: tx[1], emissiveIntensity: 0, roughness: 0.8 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(sx * 2 - 0.8, 1.3), mat);
        const [x, y, z] = tf(0, 6.8, side * 0.42);
        m.position.set(x, y, z);
        m.rotation.y = gn.h + (side > 0 ? 0 : Math.PI);
        this.add(m);
        this.banners.push({ mat, tx });
      }
      // start lamps on the beam, facing the grid behind the line (the grid of course 1 lies before
      // the Ekeby gantry, the grid of course 2 beyond the Sjuby one)
      if (gn.kind === 'goal2') continue;
      const course = gn.kind === 'start' ? 1 : 2, face = course === 1 ? -1 : 1;
      for (let k = 0; k < 4; k++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0x000000, emissiveIntensity: 3, roughness: 0.3 });
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 20).rotateX(Math.PI / 2), mat);
        const [x, y, z] = tf(-1.8 + k * 1.2, 5.5, face * 0.45);
        lamp.position.set(x, y, z); lamp.rotation.y = gn.h;
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.3), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        box.position.set(...tf(-1.8 + k * 1.2, 5.5, face * 0.3)); box.rotation.y = gn.h;
        this.add(box); this.add(lamp);
        this.startLights[course].push(mat);
      }
    }
    this.setCourse(1);
    // the crowd barriers (red and white)
    const bg = new GB();
    for (const br of this.W.barriers || []) {
      for (let s = br.s0; s < br.s1; s += 2) {
        T.beside(s, br.d, P); T.beside(s + 2, br.d, Q);
        const y0 = T.roadY(s), y1 = T.roadY(s + 2);
        const red = Math.floor(s / 2) % 2 ? [0.75, 0.08, 0.06] : [0.92, 0.92, 0.9];
        const a = [P.x, y0, P.z], b = [Q.x, y1, Q.z];
        const sd = Math.sign(br.d);
        const qd = (p, q, r, t) => (sd > 0 ? bg.quad(p, q, r, t, red) : bg.quad(q, p, t, r, red));
        qd([a[0], a[1] + 0.3, a[2]], [b[0], b[1] + 0.3, b[2]], [b[0], b[1] + 1.05, b[2]], [a[0], a[1] + 1.05, a[2]]);
        qd([b[0], b[1] + 0.3, b[2]], [a[0], a[1] + 0.3, a[2]], [a[0], a[1] + 1.05, a[2]], [b[0], b[1] + 1.05, b[2]]);
      }
    }
    this.add(new THREE.Mesh(bg.geometry(), this.mats.plain), { cast: true });
  }

  buildCrowd() {
    const list = this.W.crowd;
    if (!list.length) return;
    const shirts = [0xc0392b, 0x2e86de, 0xf1c40f, 0x27ae60, 0xffffff, 0x8e44ad, 0xe67e22, 0x34495e, 0x16a085, 0xd35400];
    const skins = [0xf1c8a8, 0xe0ac86, 0xc68642, 0x8d5524, 0xffdbb5];
    const hairs = [0x2b1d14, 0x5a3825, 0xc9a35a, 0x1a1a1a, 0x8a8a8a, 0xb04a24];
    const body = new THREE.CapsuleGeometry(0.2, 0.55, 4, 8).translate(0, 1.15, 0);
    const legs = new THREE.CapsuleGeometry(0.13, 0.65, 4, 8).scale(1.4, 1, 0.9).translate(0, 0.45, 0);
    const head = new THREE.SphereGeometry(0.13, 12, 8).translate(0, 1.66, 0);
    const hair = new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5).translate(0, 1.69, -0.01);
    const mk = (g, f) => { const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial(), list.length); const c = new THREE.Color(); list.forEach((p, i) => { c.setHex(f(p)); im.setColorAt(i, c); }); return im; };
    this.crowd = [mk(body, (p) => shirts[p.shirt]), mk(legs, () => 0x2b3440), mk(head, (p) => skins[p.skin]), mk(hair, (p) => hairs[p.hair])];
    for (const im of this.crowd) this.add(im, { cast: true });
    this.updateCrowd(0);
  }

  // the evening: street lights and windows on, banners lit
  setNight(on) {
    this.night = on;
    this.lampMat.emissiveIntensity = on ? 3.2 : 0;
    if (this.lampPools) this.lampPools.visible = on;
    this.mats.window.emissiveIntensity = on ? 1.25 : 0;
    this.mats.shop.emissiveIntensity = on ? 1.1 : 0;
    for (const b of this.banners) b.mat.emissiveIntensity = on ? 0.55 : 0;
  }

  // which race is on: the banners, the course's own boards
  setCourse(id) {
    this.course = id;
    for (const b of this.banners) { b.mat.map = b.tx[id]; b.mat.emissiveMap = b.tx[id]; b.mat.needsUpdate = true; }
    for (const c in this.courseSigns) for (const m of this.courseSigns[c]) m.visible = Number(c) === id;
  }

  updateCrowd(t) {
    if (!this.crowd) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    this.W.crowd.forEach((p, i) => {
      const jump = p.cheer > 0.6 ? Math.max(0, Math.sin(t * (5 + p.cheer * 3) + i)) * 0.12 : 0;
      e.set(0, p.h + Math.sin(t * 0.7 + i) * 0.1, 0); q.setFromEuler(e);
      m4.compose(v.set(p.x, p.y + jump, p.z), q, sc.set(p.tall, p.tall, p.tall));
      for (const im of this.crowd) im.setMatrixAt(i, m4);
    });
    for (const im of this.crowd) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }

  update(t, game, camPos) {
    if (this.treeKit) this.treeKit.time.value = t;
    // detailed trees near the camera, simple ones further away
    if (camPos) for (const L of this.treeLods) {
      const near = L.center.distanceTo(camPos) - L.r < DETAIL_RANGE;
      L.simple.visible = !near; L.detail[0].visible = L.detail[1].visible = near;
    }
    for (const f of this.flags || []) { f.rotation.y = 0.6 + Math.sin(t * 0.8 + f.userData.phase) * 0.35; f.rotation.x = Math.sin(t * 2.3 + f.userData.phase) * 0.05; }
    if (this.water) this.waterMat.normalMap.offset.set(t * 0.006, t * 0.004);
    if (game) {
      const L = game.lights;
      this.startLights[this.course || 1].forEach((m, k) => {
        const on = L >= 4 ? true : L > k && k < 3;
        const green = L >= 4;
        m.emissive.setHex(on ? (green ? 0x22ff44 : 0xff1a10) : 0x000000);
        m.color.setHex(on ? (green ? 0x22aa33 : 0xaa1a10) : 0x1a1a1a);
      });
    }
    if (this.crowd && Math.floor(t * 20) !== this.crowdTick) { this.crowdTick = Math.floor(t * 20); this.updateCrowd(t); }
  }
}

// ------------------------------------------------------------------ tree models (vertex coloured)
function colorize(g, f) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const col = f(p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function mergeGeos(list) {
  const out = [];
  for (const g of list) out.push(g.index ? g.toNonIndexed() : g);
  let n = 0;
  for (const g of out) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of out) { pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function jitter(g, amt, seed) {
  const R = makeRng(seed), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (R() - 0.5) * amt, p.getY(i) + (R() - 0.5) * amt * 0.6, p.getZ(i) + (R() - 0.5) * amt);
  g.computeVertexNormals();
  return g;
}
function spruceGeo() {
  // a trunk and four layered cones (open, 8 sides): ~70 triangles
  const parts = [colorize(new THREE.CylinderGeometry(0.12, 0.22, 3, 5, 1, true).translate(0, 1.5, 0), () => [0.12, 0.08, 0.05])];
  const layers = [[2.6, 2.4, 0.9], [2.0, 4.9, 3.0], [1.35, 7.2, 5.3], [0.75, 9.4, 7.4]];
  layers.forEach(([r, top, base], k) => {
    const g = jitter(new THREE.ConeGeometry(r, top - base + 1.6, 8, 1, true).translate(0, (top + base - 1.6) / 2 + 0.8, 0), 0.25, 10 + k);
    parts.push(colorize(g, (x, y) => { const t = (y - base) / (top - base + 1.6); return mixc([0.03, 0.07, 0.03], [0.08, 0.16, 0.06], clamp(t, 0, 1) * 0.85 + 0.05); }));
  });
  return mergeGeos(parts);
}
function pineGeo() {
  const parts = [colorize(new THREE.CylinderGeometry(0.14, 0.26, 9, 5, 1, true).translate(0, 4.5, 0), (x, y) => (y > 3 ? [0.42, 0.2, 0.09] : [0.2, 0.13, 0.08]))];
  const R = makeRng(4);
  for (let k = 0; k < 4; k++) {
    const g = jitter(new THREE.IcosahedronGeometry(1.6 + R() * 0.8, 0), 0.4, 20 + k);
    g.scale(1, 0.62, 1).translate((R() - 0.5) * 2.2, 8.4 + R() * 2.2, (R() - 0.5) * 2.2);
    parts.push(colorize(g, (x, y) => mixc([0.05, 0.1, 0.04], [0.11, 0.18, 0.07], clamp((y - 7.5) / 3.5, 0, 1))));
  }
  return mergeGeos(parts);
}
function birchGeo() {
  const parts = [colorize(new THREE.CylinderGeometry(0.1, 0.17, 7, 5, 4, true).translate(0, 3.5, 0), (x, y) => (Math.sin(y * 9) > 0.75 ? [0.08, 0.08, 0.08] : [0.78, 0.78, 0.74]))];
  const R = makeRng(7);
  for (let k = 0; k < 5; k++) {
    const g = jitter(new THREE.IcosahedronGeometry(1.4 + R() * 0.7, 0), 0.4, 40 + k);
    g.scale(1, 1.25, 1).translate((R() - 0.5) * 1.8, 5.2 + R() * 3.2, (R() - 0.5) * 1.8);
    parts.push(colorize(g, (x, y) => mixc([0.13, 0.22, 0.05], [0.3, 0.42, 0.1], clamp((y - 4.5) / 4.5, 0, 1))));
  }
  return mergeGeos(parts);
}
