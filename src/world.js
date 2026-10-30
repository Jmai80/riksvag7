// Everything along Riksväg 7, as data: houses, farms, the church, trees, fields, guardrails,
// lamp posts, power lines, signs, the start and the finish – and the colliders the cars hit.
// Pure JS (deterministic with its own seed) so the tests see exactly what the player sees.
import { makeRng, clamp } from './rng.js';
import { HW, SHOULDER, WATER, LAKE, smoothstep, fbm } from './track.js';
import { CollisionGrid, obox } from './collide.js';

const P = {};
const NEAR = { s: 0, d: 0, i: 0, dist: 0 };

// facade colours of Swedish towns and villages
const PLASTER = [0xe9d9a8, 0xe3c9a0, 0xdcb6a0, 0xece6d8, 0xc9cfc8, 0xd9c08a, 0xe6d3c0, 0xbfc8cf];
const VILLA = [0xf2efe6, 0xe9d38e, 0xb9cfd9, 0x8a2a1d, 0xd8cdb5, 0x9fb59a];
const FALU = 0x8b2a1f;

export class World {
  constructor(track) {
    this.track = track;
    const R = (this.R = makeRng(2026));
    this.buildings = []; this.trees = []; this.fields = []; this.rails = []; this.lamps = []; this.poles = [];
    this.signs = []; this.rocks = []; this.bales = []; this.flags = []; this.fences = []; this.posts = [];
    this.docks = []; this.crowd = [];
    this.foot = new Map();  // occupied ground: a coarse hash of circles
    this.placeGantries();
    this.placeTowns(R);
    this.placeChurch();
    this.placeFields(R);
    this.placeFarms(R);
    this.placeLakeside(R);
    this.placeRails();
    this.placeRoadside(R);
    this.placeTrees(R);
    this.placeRocks(R);
    this.buildColliders();
  }

  // ---------------------------------------------------------------- occupancy
  key(x, z) { return Math.floor(x / 20) * 100003 + Math.floor(z / 20); }
  occupy(x, z, r) {
    const c = { x, z, r };
    for (let a = Math.floor((x - r) / 20); a <= Math.floor((x + r) / 20); a++)
      for (let b = Math.floor((z - r) / 20); b <= Math.floor((z + r) / 20); b++) {
        const k = a * 100003 + b;
        let l = this.foot.get(k);
        if (!l) this.foot.set(k, (l = []));
        l.push(c);
      }
  }
  isFree(x, z, r) {
    for (let a = Math.floor((x - r) / 20); a <= Math.floor((x + r) / 20); a++)
      for (let b = Math.floor((z - r) / 20); b <= Math.floor((z + r) / 20); b++) {
        const l = this.foot.get(a * 100003 + b);
        if (l) for (const c of l) if (Math.hypot(c.x - x, c.z - z) < c.r + r) return false;
      }
    return true;
  }
  roadDist(x, z) { return this.track.nearest(x, z, NEAR) ? NEAR.dist : 1e3; }
  // a rectangle (centre, heading, half sizes) at least `gap` from the asphalt everywhere
  clearOfRoad(x, z, h, hw, hd, gap) {
    const sn = Math.sin(h), cs = Math.cos(h);
    for (const [u, v] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const px = x + cs * hw * u + sn * hd * v, pz = z - sn * hw * u + cs * hd * v;
      if (this.roadDist(px, pz) < HW + gap) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- a building beside the road
  // s: along the road, side: +1 right / -1 left, setback: from the asphalt edge to the facade
  addBuilding(s, side, b, setback) {
    const T = this.track;
    T.pointAt(s, P);
    const nx = -P.dz * side, nz = P.dx * side;          // away from the road
    const off = HW + setback + b.d / 2;
    const x = P.x + nx * off, z = P.z + nz * off;
    const h = Math.atan2(-nx, -nz);                       // the front (+z local) faces the road
    const r = Math.hypot(b.w, b.d) / 2;
    if (!this.isFree(x, z, r + 1)) return null;
    if (!this.clearOfRoad(x, z, h, b.w / 2, b.d / 2, setback - 1.5)) return null;
    const ys = [];
    const sn = Math.sin(h), cs = Math.cos(h);
    for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]) ys.push(T.height(x + cs * b.w / 2 * u + sn * b.d / 2 * v, z - sn * b.w / 2 * u + cs * b.d / 2 * v));
    const base = Math.min(...ys), top = Math.max(...ys);
    if (top - base > 4.5) return null;                    // too steep to build on
    if (base < WATER + 0.6) return null;
    const B = { ...b, x, z, h, y: base, footTop: top, s, side };
    this.buildings.push(B);
    this.occupy(x, z, r + 0.8);
    return B;
  }

  // ---------------------------------------------------------------- the towns
  placeTowns(R) {
    const T = this.track, Z = T.zones;
    // Ekeby: blocks of flats and shops at the start, villas further out; a petrol station
    for (const side of [1, -1]) {
      let s = -70 + R() * 10;
      while (s < Z.ekeby[1] + 40) {
        const centre = s < 430;
        let b;
        if (centre) {
          const floors = R.int(3, 5), w = R.range(14, 24);
          b = { kind: 'block', w, d: R.range(10, 13), wallH: floors * 3.05 + 0.7, floors, roof: R() < 0.55 ? 'flat' : 'hip', color: R.pick(PLASTER), roofColor: R.pick([0x3c3f44, 0x6b3a2c, 0x4a4d52]), shop: R() < 0.7, seed: R.int(1, 1e6) };
        } else {
          b = villa(R);
        }
        const placed = this.addBuilding(s + b.w / 2, side, b, centre ? R.range(4.2, 6) : R.range(9, 16));
        s += (placed ? b.w : 6) + (centre ? R.range(1.5, 4) : R.range(9, 20));
        if (Math.abs(s - Z.start) < 22 && centre) s = Z.start + 22; // keep the start gantry's feet clear
      }
    }
    const gas = this.addBuilding(560, 1, { kind: 'station', w: 22, d: 14, wallH: 4.2, roof: 'flat', color: 0xeeeeea, seed: 5 }, 9);
    if (gas) gas.canopy = true;
    // Mellby: a village of wooden houses round the church
    for (const side of [1, -1]) {
      let s = Z.mellby[0] + R() * 20;
      while (s < Z.mellby[1]) {
        const b = R() < 0.65 ? villa(R) : stuga(R);
        const placed = this.addBuilding(s + b.w / 2, side, b, R.range(8, 18));
        if (placed && R() < 0.3) this.flags.push(flagBeside(placed, R));
        s += (placed ? b.w : 6) + R.range(10, 26);
      }
    }
    // Sjuby: the finish town – flats and shops round the finish line, villas before them
    for (const side of [1, -1]) {
      let s = Z.sjuby[0] - 60 + R() * 10;
      while (s < T.L + 30) {
        const centre = s > Z.finish - 200;
        const b = centre
          ? (() => { const floors = R.int(3, 4); return { kind: 'block', w: R.range(14, 22), d: R.range(10, 13), wallH: floors * 3.05 + 0.7, floors, roof: R() < 0.5 ? 'flat' : 'hip', color: R.pick(PLASTER), roofColor: R.pick([0x3c3f44, 0x6b3a2c]), shop: R() < 0.8, seed: R.int(1, 1e6) }; })()
          : villa(R);
        const placed = this.addBuilding(s + b.w / 2, side, b, centre ? R.range(4.5, 6.5) : R.range(9, 15));
        s += (placed ? b.w : 6) + (centre ? R.range(1.5, 4) : R.range(9, 18));
        if (Math.abs(s - Z.finish) < 18 && centre) s = Z.finish + 18;
      }
    }
    // the end of the road in Sjuby: the town square's long building closes it off
    T.pointAt(T.L, P);
    const h = Math.atan2(P.dx, P.dz);
    const ex = P.x + P.dx * 16, ez = P.z + P.dz * 16;
    this.buildings.push({ kind: 'block', w: 46, d: 14, wallH: 13, floors: 4, roof: 'hip', color: 0xd9c08a, roofColor: 0x6b3a2c, shop: true, seed: 77, x: ex, z: ez, h: h + Math.PI, y: T.height(ex, ez) - 0.5, s: T.L + 16, side: 0, townhall: true });
    this.occupy(ex, ez, 24);
  }

  placeChurch() {
    // Mellby kyrka: white, with a tower and a spire, on the outside of the village's first bend
    const T = this.track, s = T.cornerS[8] - 70;
    const b = { kind: 'church', w: 11, d: 24, wallH: 7.5, roof: 'gable', color: 0xf3f1ea, roofColor: 0x2f3236, seed: 3 };
    let placed = null;
    for (const side of [-1, 1]) for (const sb of [16, 22, 30]) if (!placed) placed = this.addBuilding(s, side, b, sb);
    this.church = placed;
  }

  // ---------------------------------------------------------------- fields and farms
  placeFields(R) {
    const T = this.track, Z = T.zones;
    const spans = [[Z.farm[0] + 40, Z.farm[1] - 60], [Z.lake[1] + 30, Z.mellby[0] - 40], [Z.ridge[1] - 260, Z.sjuby[0] - 80]];
    const crops = ['vete', 'raps', 'vall', 'vall', 'plojd', 'vete'];
    for (const [a, b] of spans) for (const side of [1, -1]) {
      let s = a + R() * 30;
      while (s < b - 60) {
        const len = R.range(70, 150), wid = R.range(70, 140);
        const sc = s + len / 2;
        if (sc > b) break;
        T.pointAt(sc, P);
        const nx = -P.dz * side, nz = P.dx * side, off = HW + R.range(13, 22) + wid / 2;
        const x = P.x + nx * off, z = P.z + nz * off, h = Math.atan2(P.dx, P.dz);
        const r = Math.hypot(len, wid) / 2;
        if (this.isFree(x, z, r * 0.8) && this.clearOfRoad(x, z, h, wid / 2, len / 2, 9) && T.natural(x, z) > WATER + 1.2) {
          const f = { x, z, h, w: wid, d: len, crop: R.pick(crops), side, s: sc };
          this.fields.push(f);
          this.occupy(x, z, r * 0.85);
          // a fence along the road-side edge, and wrapped bales on some of the cut fields
          this.fences.push({ field: f });
          if (f.crop === 'vall' && R() < 0.7) {
            for (let k = 0, n = R.int(4, 9); k < n; k++) {
              const u = R.range(-0.4, 0.4) * wid, v = R.range(-0.4, 0.4) * len;
              const bx = x + Math.cos(h) * u + Math.sin(h) * v, bz = z - Math.sin(h) * u + Math.cos(h) * v;
              this.bales.push({ x: bx, z: bz, y: T.height(bx, bz), h: R() * 6.28 });
            }
          }
        }
        s += len + R.range(8, 40);
      }
    }
  }

  placeFarms(R) {
    const T = this.track, Z = T.zones;
    const spots = [];
    for (let s = Z.farm[0] + 60; s < Z.farm[1]; s += R.range(150, 230)) spots.push(s);
    for (let s = Z.lake[1] + 40; s < Z.mellby[0] - 20; s += 140) spots.push(s);
    for (let s = Z.ridge[0] + 120; s < Z.ridge[1]; s += R.range(260, 420)) spots.push(s);
    for (let s = Z.forest[0] + 80; s < Z.forest[1]; s += R.range(260, 360)) spots.push(s);
    for (const s0 of spots) {
      const side = R() < 0.5 ? 1 : -1;
      const inFarm = T.inZone(s0, 'farm') || (s0 > Z.lake[1] && s0 < Z.mellby[0]);
      // the farmhouse, then a barn and a shed behind or beside it
      const house = R() < 0.5 ? villa(R) : stuga(R);
      let h = null;
      for (const sb of [12, 18, 26]) if (!h) h = this.addBuilding(s0, side, house, sb);
      if (!h) continue;
      if (R() < 0.45) this.flags.push(flagBeside(h, R));
      if (inFarm || R() < 0.4) {
        const barn = { kind: 'barn', w: R.range(14, 20), d: R.range(9, 12), wallH: R.range(4.2, 5.2), roof: R() < 0.4 ? 'gambrel' : 'gable', color: FALU, roofColor: R.pick([0x2f3236, 0x5b2a22, 0x55595e]), seed: R.int(1, 1e6) };
        for (const [ds, sb] of [[R.range(24, 34), 22], [-R.range(24, 34), 24], [0, 34]]) if (this.addBuilding(s0 + ds, side, barn, sb)) break;
      }
      if (R() < 0.6) this.addBuilding(s0 + R.range(-30, 30), side, { kind: 'shed', w: R.range(4, 6), d: R.range(3.5, 5), wallH: 2.4, roof: 'gable', color: FALU, roofColor: 0x2f3236, seed: R.int(1, 1e6) }, R.range(14, 30));
    }
  }

  // ---------------------------------------------------------------- by the lake: boathouses and jetties
  placeLakeside(R) {
    const T = this.track;
    const tries = [[-1, -0.55], [-1, 0.5], [1, -0.6], [1, 0.45], [-1, 0.15], [1, 0.1]];
    for (const [sx, sz] of tries) {
      // walk from the middle of the lake outwards until the shore
      const ang = Math.atan2(sz, sx * 1.4);
      let x = LAKE.x, z = LAKE.z, found = false;
      for (let r = 40; r < 600; r += 2) {
        x = LAKE.x + Math.cos(ang) * r; z = LAKE.z + Math.sin(ang) * r * 0.45;
        if (T.natural(x, z) > WATER + 0.35) { found = true; break; }
      }
      if (!found || this.roadDist(x, z) < 40) continue;
      const h = Math.atan2(LAKE.x - x, (LAKE.z - z) / 0.45);  // facing the water
      const b = { kind: 'boathouse', w: 4.6, d: 6.4, wallH: 2.6, roof: 'gable', color: FALU, roofColor: 0x2f3236, seed: R.int(1, 1e6) };
      const bx = x - Math.sin(h) * 3.6, bz = z - Math.cos(h) * 3.6;
      if (!this.isFree(bx, bz, 5)) continue;
      const y = Math.max(WATER + 0.3, T.height(bx, bz) - 0.3);
      this.buildings.push({ ...b, x: bx, z: bz, h, y, s: -1, side: 0 });
      this.occupy(bx, bz, 5);
      this.docks.push({ x: x + Math.sin(h) * 3, z: z + Math.cos(h) * 3, h, len: R.range(8, 14) });
    }
  }

  // ---------------------------------------------------------------- the start and the finish
  placeGantries() {
    const Z = this.track.zones;
    this.gantries = [{ s: Z.start, kind: 'start' }, { s: Z.finish, kind: 'finish' }];
    for (const g of this.gantries) {
      this.track.pointAt(g.s, P);
      g.x = P.x; g.z = P.z; g.y = P.y; g.h = Math.atan2(P.dx, P.dz);
      for (const side of [1, -1]) this.occupy(P.x - P.dz * side * (HW + 1.5), P.z + P.dx * side * (HW + 1.5), 2.5);
    }
    // spectators behind barriers at both ends
    const R = makeRng(99);
    for (const g of this.gantries) for (const side of [1, -1]) {
      for (let k = 0; k < 26; k++) {
        const s = g.s + R.range(-34, 34), d = side * (HW + R.range(3.2, 6.5));
        this.track.beside(s, d, P);
        this.crowd.push({ x: P.x, z: P.z, y: this.track.height(P.x, P.z), h: Math.atan2(P.dz * side, -P.dx * side) + R.range(-0.5, 0.5), shirt: R.int(0, 9), skin: R.int(0, 4), hair: R.int(0, 5), tall: R.range(0.92, 1.08), cheer: R() });
      }
      this.barriers = this.barriers || [];
      this.barriers.push({ s0: g.s - 38, s1: g.s + 38, d: side * (HW + 2.6) });
    }
  }

  // ---------------------------------------------------------------- guardrails
  placeRails() {
    const T = this.track, Z = T.zones;
    for (const side of [1, -1]) {
      let run = null;
      for (let s = 0; s <= T.L; s += 4) {
        T.pointAt(s, P);
        const bridge = s > Z.bridge[0] - 24 && s < Z.bridge[1] + 24;
        let need = bridge;
        if (!need && T.townK(s) < 0.3) {
          const ox = P.x - P.dz * side * (HW + 7), oz = P.z + P.dx * side * (HW + 7);
          need = P.y - T.height(ox, oz) > 2.1;
          // the outside of a fast, tight bend
          if (!need && Math.abs(P.k) > 1 / 140 && Math.sign(P.k) === side) need = true;
        }
        if (need) { if (!run) run = { side, s0: s, s1: s, bridge }; run.s1 = s; run.bridge = run.bridge || bridge; }
        else if (run && s - run.s1 > 20) { this.pushRail(run); run = null; }
      }
      if (run) this.pushRail(run);
    }
  }
  pushRail(run) {
    if (run.s1 - run.s0 < 24 && !run.bridge) return;
    run.s0 = Math.max(0, run.s0 - 12); run.s1 = Math.min(this.track.L, run.s1 + 12);
    run.d = run.side * (run.bridge ? HW + 0.75 : HW + 1.15);
    this.rails.push(run);
  }

  // ---------------------------------------------------------------- lamps, poles, posts, signs
  placeRoadside(R) {
    const T = this.track, Z = T.zones;
    const onBridge = (s) => s > Z.bridge[0] - 30 && s < Z.bridge[1] + 30;
    const nearRail = (s, side) => this.rails.some((r) => r.side === side && s > r.s0 - 2 && s < r.s1 + 2);
    // street lights in the towns, both sides, staggered
    for (const side of [1, -1]) for (let s = -60 + (side > 0 ? 0 : 17); s < T.L; s += 34) {
      if (T.townK(s) < 0.75 || Math.abs(s - Z.start) < 10 || Math.abs(s - Z.finish) < 10) continue;
      T.beside(s, side * (HW + 2.0), P);
      if (!this.isFree(P.x, P.z, 0.5)) continue;
      this.lamps.push({ x: P.x, z: P.z, y: T.height(P.x, P.z), h: Math.atan2(P.dx, P.dz) + (side > 0 ? -Math.PI / 2 : Math.PI / 2), side });
    }
    // the power line on the left through the countryside
    let last = null;
    for (let s = 0; s < T.L; s += 58) {
      if (T.townK(s) > 0.2 || onBridge(s) || T.inZone(s, 'lake', -60)) { last = null; continue; }
      T.beside(s, -(HW + 10.5), P);
      if (!this.isFree(P.x, P.z, 1)) { last = null; continue; }
      const p = { x: P.x, z: P.z, y: T.height(P.x, P.z), h: Math.atan2(P.dx, P.dz), prev: last };
      this.poles.push(p);
      last = p;
    }
    // reflector posts (kantstolpar) every 50 m
    for (const side of [1, -1]) for (let s = 0; s < T.L; s += 50) {
      if (T.townK(s) > 0.3 || onBridge(s) || nearRail(s, side)) continue;
      T.beside(s, side * (HW + 1.25), P);
      this.posts.push({ x: P.x, z: P.z, y: T.height(P.x, P.z), h: Math.atan2(P.dx, P.dz), side });
    }
    const sign = (s, side, kind, text, d = HW + 2.4) => {
      T.beside(s, side * d, P);
      const g = { kind, text, x: P.x, z: P.z, y: T.height(P.x, P.z), h: Math.atan2(P.dx, P.dz) + Math.PI, side };
      this.signs.push(g);
      this.occupy(P.x, P.z, 0.6);
      return g;
    };
    // town names and speed limits (Swedish style: blue name signs, yellow speed signs)
    const L = T.L;
    sign(Z.ekeby[1] - 10, 1, 'speed', '90');
    sign(Z.ekeby[1] + 120, 1, 'distance', `Mellby ${Math.round((Z.mellby[0] - Z.ekeby[1]) / 1000)}|Sjuby ${Math.round((Z.finish - Z.ekeby[1]) / 1000)}`, HW + 3.2);
    sign(Z.mellby[0] - 30, 1, 'town', 'Mellby');
    sign(Z.mellby[0] - 18, 1, 'speed', '50');
    sign(Z.mellby[1] + 10, 1, 'speed', '90');
    sign(Z.sjuby[0] - 70, 1, 'town', 'Sjuby');
    sign(Z.sjuby[0] - 58, 1, 'speed', '50');
    sign(Z.lake[0] + 40, 1, 'lake', 'Ekesjön');
    // distance-to-go boards
    for (const km of [4, 3, 2, 1]) { const s = Z.finish - km * 1000; if (s > Z.start + 200) sign(s, -1, 'board', `${km} KM`, HW + 2.6); }
    sign(Z.finish - 500, -1, 'board', '500 M', HW + 2.6);
    // chevrons on the outside of the tight bends
    for (let c = 0; c < T.cornerS.length; c++) {
      const s = T.cornerS[c];
      T.pointAt(s, P);
      const r = 1 / Math.max(1e-6, Math.abs(P.k));
      if (r > 112) continue;
      const side = Math.sign(P.k) || 1; // the outside of a left turn is the right
      for (let k = -2; k <= 2; k++) {
        const ss = s + k * 14;
        if (nearRail(ss, side)) continue;
        sign(ss, side, 'chevron', P.k > 0 ? 'L' : 'R', HW + 2.3);
      }
    }
    void L; void R;
  }

  // ---------------------------------------------------------------- trees
  placeTrees(R) {
    const T = this.track, Z = T.zones, B = T.bbox;
    const out = this.trees;
    // jittered grids, densest in the forest and on the ridge, sparse over the fields
    const grid = (sp, maxD, minD) => {
      for (let z = B.z0 - 300; z < B.z1 + 300; z += sp) for (let x = B.x0 - 320; x < B.x1 + 320; x += sp) {
        const px = x + (R() - 0.5) * sp * 0.9, pz = z + (R() - 0.5) * sp * 0.9;
        const fd = T.farDist(px, pz);
        if (fd > maxD || fd < minD - 10) continue;
        let s = 0, d = fd;
        if (fd < 60) { if (!T.nearest(px, pz, NEAR)) continue; s = NEAR.s; d = NEAR.dist; }
        else { T.nearest(px, pz, NEAR) ? (s = NEAR.s) : (s = this.sByZ(pz)); }
        if (d < minD) continue;
        const zone = s < 0 ? 'ekeby' : T.zoneAt(s);
        const dens = zone === 'forest' || zone === 'ridge' ? 1 : zone === 'lake' ? 0.55 : zone === 'farm' ? 0.2 : 0.12;
        const clump = fbm(px / 90, pz / 90, 21);
        if (R() > dens * smoothstep(0.32, 0.55, clump + (zone === 'forest' || zone === 'ridge' ? 0.2 : 0))) continue;
        const y = T.height(px, pz);
        if (y < WATER + 0.5) continue;
        if (!this.isFree(px, pz, 1.2)) continue;
        const birch = zone === 'farm' || zone === 'mellby' || zone === 'lake' ? 0.45 : 0.12;
        const r = R();
        const type = r < birch ? 'birch' : r < birch + (1 - birch) * 0.62 ? 'spruce' : 'pine';
        out.push({ type, x: px, z: pz, y, s: R.range(0.75, 1.3) * (type === 'birch' ? 0.9 : 1), r: R() * 6.28, d });
      }
    };
    grid(8.5, 70, HW + 9);
    grid(15, 170, 70);
    grid(26, 360, 170);
  }
  sByZ(z) { return this.track.sAtZ(z, 0); }

  placeRocks(R) {
    const T = this.track, Z = T.zones;
    for (let s = Z.forest[0]; s < Z.ridge[1]; s += R.range(18, 40)) {
      const zone = T.zoneAt(s);
      if (zone !== 'forest' && zone !== 'ridge') continue;
      const side = R() < 0.5 ? 1 : -1, d = side * (HW + R.range(9, 40));
      T.beside(s, d, P);
      if (!this.isFree(P.x, P.z, 2)) continue;
      const y = T.height(P.x, P.z);
      if (y < WATER + 0.6) continue;
      const size = R.range(0.6, 2.2);
      this.rocks.push({ x: P.x, z: P.z, y, size, seed: R.int(1, 1e6), r: R() * 6.28 });
      this.occupy(P.x, P.z, size + 0.5);
    }
  }

  // ---------------------------------------------------------------- colliders
  buildColliders() {
    const T = this.track, cols = [];
    for (const b of this.buildings) cols.push(obox(b.x, b.z, b.h, b.w / 2, b.d / 2, b.y + b.wallH + 3, { cam: true }));
    for (const t of this.trees) if (t.d < 80) cols.push({ t: 'circle', x: t.x, z: t.z, r: 0.28 * t.s + 0.1, top: t.y + 6 });
    for (const r of this.rocks) cols.push({ t: 'circle', x: r.x, z: r.z, r: r.size * 0.8, top: r.y + r.size * 0.9 });
    for (const b of this.bales) cols.push({ t: 'circle', x: b.x, z: b.z, r: 0.7, top: b.y + 1.2 });
    for (const l of this.lamps) cols.push({ t: 'circle', x: l.x, z: l.z, r: 0.14, top: l.y + 8 });
    for (const p of this.poles) cols.push({ t: 'circle', x: p.x, z: p.z, r: 0.16, top: p.y + 9 });
    for (const s of this.signs) cols.push({ t: 'circle', x: s.x, z: s.z, r: 0.12, top: s.y + 2.5 });
    for (const g of this.gantries) for (const side of [1, -1]) {
      T.beside(g.s, side * (HW + 1.3), P);
      cols.push({ t: 'circle', x: P.x, z: P.z, r: 0.45, top: P.y + 7 });
    }
    // guardrails: short, slippery boxes along the road (cars slide along them)
    for (const r of this.rails) {
      let a = T.beside(r.s0, r.d, {});
      for (let s = r.s0 + 3; s <= r.s1 + 0.01; s += 3) {
        const b = T.beside(Math.min(s, r.s1), r.d, {});
        const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, len = Math.hypot(b.x - a.x, b.z - a.z);
        const y = T.roadY(s);
        cols.push(obox(cx, cz, Math.atan2(b.x - a.x, b.z - a.z), 0.12, len / 2 + 0.25, y + 0.78, { slick: true }));
        a = b;
      }
    }
    // the crowd barriers
    for (const br of this.barriers || []) {
      let a = T.beside(br.s0, br.d, {});
      for (let s = br.s0 + 3; s <= br.s1 + 0.01; s += 3) {
        const b = T.beside(s, br.d, {});
        cols.push(obox((a.x + b.x) / 2, (a.z + b.z) / 2, Math.atan2(b.x - a.x, b.z - a.z), 0.15, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.2, T.roadY(s) + 1.1, { slick: true }));
        a = b;
      }
    }
    this.colliders = cols;
    const B = T.bbox;
    this.grid = new CollisionGrid(cols, { x0: B.x0 - 400, z0: B.z0 - 400, x1: B.x1 + 400, z1: B.z1 + 400 }, 12);
  }
}

// ---------------------------------------------------------------- house recipes
function villa(R) {
  const red = R() < 0.3;
  return { kind: 'villa', w: R.range(9, 12.5), d: R.range(7.5, 9.5), wallH: R() < 0.5 ? 5.4 : 3.2, roof: 'gable', color: red ? FALU : R.pick(VILLA), trim: 0xf6f4ee, roofColor: R.pick([0x2f3236, 0x5b2a22, 0x3a3d42, 0x6e3326]), seed: R.int(1, 1e6), porch: R() < 0.5 };
}
function stuga(R) {
  return { kind: 'stuga', w: R.range(7, 9), d: R.range(5.5, 7), wallH: 2.8, roof: 'gable', color: FALU, trim: 0xf6f4ee, roofColor: R.pick([0x2f3236, 0x5b2a22, 0x3a3d42]), seed: R.int(1, 1e6) };
}
function flagBeside(b, R) {
  const sn = Math.sin(b.h), cs = Math.cos(b.h), u = (b.w / 2 + 3) * (R() < 0.5 ? 1 : -1), v = b.d / 2 + 2;
  return { x: b.x + cs * u + sn * v, z: b.z - sn * u + cs * v, y: b.y, phase: R() * 6 };
}
void SHOULDER; void clamp;
