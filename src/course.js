// A course: the road driven one way or the other. The race (game.js), the computer drivers (ai.js)
// and the HUD only talk to a Course; s is the distance along the course, from its own start. Course
// 1 runs Ekeby → Sjuby by day, course 2 Sjuby → Ekeby in the evening – the same road, houses and
// trees (world.js is built once, along the road's own direction).
import { clamp } from './rng.js';

export const COURSES = {
  1: { id: 1, name: 'Ekeby → Sjuby', title: 'Dagsetappen', short: 'Bana 1', mood: 'day', reverse: false, plate: 'RIK 007' },
  2: { id: 2, name: 'Sjuby → Ekeby', title: 'Kvällsracet', short: 'Bana 2', mood: 'dusk', reverse: true, plate: 'RIK 007' },
};
export const COURSE_IDS = [1, 2];

const P = {};

export class Course {
  constructor(track, id = 1) {
    const C = COURSES[id];
    this.id = id; this.info = C;
    this.road = track; this.reverse = C.reverse;
    this.L = track.L; this.n = track.n; this.xs = track.xs; this.zs = track.zs;
    const Z = track.zones, L = track.L;
    // the gantries stand where they stand: course 2 starts under course 1's finish in Sjuby and
    // finishes under its own gantry in Ekeby, a little before course 1's start (to have room to stop)
    this.zones = this.reverse
      ? { start: L - Z.finish, finish: L - Z.finish2, bumps: Z.bumps.map((b) => L - b).reverse() }
      : { start: Z.start, finish: Z.finish, bumps: Z.bumps.slice() };
    this.vs = this.reverse ? track.speedProfile(true) : track.vs;
    this.lastDist = 0;
  }

  // the road's own distance for a course distance (and back)
  roadS(s) { return this.reverse ? this.L - s : s; }

  pointAt(s, out = {}) {
    const R = this.road;
    if (!this.reverse) return R.pointAt(s, out);
    const sr = this.L - s;
    R.pointAt(sr, out);
    out.dx = -out.dx; out.dz = -out.dz; out.k = -out.k;
    const i = R.indexAt(sr), j = i + 1, seg = R.cum[j] - R.cum[i] || 1, t = clamp((sr - R.cum[i]) / seg, 0, 1);
    out.v = this.vs[i] + (this.vs[j] - this.vs[i]) * t;
    return out;
  }

  // a point beside the course: d > 0 is to the right of the driving direction
  beside(s, d, out = {}) {
    this.pointAt(s, out);
    out.x += -out.dz * d; out.z += out.dx * d;
    return out;
  }

  heading(s) { const p = this.pointAt(s, P); return Math.atan2(p.dx, p.dz); }
  roadY(s) { return this.road.roadY(this.roadS(s)); }

  // the closest course distance to (x, z) near the hint
  project(x, z, hint, back = 20, fwd = 40) {
    const R = this.road;
    const s = this.reverse ? this.L - R.project(x, z, this.L - hint, fwd, back) : R.project(x, z, hint, back, fwd);
    this.lastDist = R.lastDist;
    return s;
  }

  // the ground doesn't care which way you drive
  groundHeight(x, z) { return this.road.groundHeight(x, z); }
  surfaceAt(x, z) { return this.road.surfaceAt(x, z); }
  height(x, z) { return this.road.height(x, z); }
}
