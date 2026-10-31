// The title screen's camera: a slow flight along Riksväg 7 that sweeps from one side of the road to
// the other like a pendulum. Out at the side it turns to look across the road at the land beyond –
// the fields, the forest, the lake, the villages – and it swoops low over the road as it crosses.
// It rises over trees, houses and the church tower on its way. Pure JS (the Node tests fly it).
import { WATER } from './track.js';
import { clamp } from './rng.js';

export const SWEEP = {
  speed: 15,      // m/s along the road
  period: 18,     // s for a swing out to one side and over to the other and back
  side: 60,       // m from the road at the end of a swing
  yaw: 1.05,      // rad: how far the camera turns across the road at the end of a swing
  low: 13,        // m over the ground when it crosses the road
  high: 30,       // m over the ground out at the side
  ahead: 140,     // m to the point it looks at
  margin: 5,      // m over the tops of trees and roofs
  fade: 1.1,      // s of fading to and from black where the flight starts over
  climb: 6,       // m/s: the steepest it climbs or sinks
};

const CELL = 8;
const key = (a, b) => a * 100003 + b;

export class TitleCam {
  constructor(track, world, o = {}) {
    this.T = track;
    this.o = { ...SWEEP, ...o };
    // between the town centres (their blocks of flats would fill the screen)
    this.s0 = o.s0 ?? 760;
    this.s1 = o.s1 ?? track.L - 760;
    this.loop = (this.s1 - this.s0) / this.o.speed;
    // a whole number of swings per flight, so that every flight is the same and its heights can be
    // worked out once
    this.period = this.loop / Math.max(1, Math.round(this.loop / this.o.period));
    this.t = o.t ?? 0;
    this.enterT = 0;
    this.pos = { x: 0, y: 0, z: 0 };
    this.look = { x: 0, y: 0, z: 0 };
    this.veil = 1;
    this.lift = 0;
    // the highest thing in every 8 m cell: tree tops, roofs (and the church spire), lamps, gantries
    this.tops = new Map();
    const put = (x, z, top, r = 1) => {
      for (let a = Math.floor((x - r) / CELL); a <= Math.floor((x + r) / CELL); a++)
        for (let b = Math.floor((z - r) / CELL); b <= Math.floor((z + r) / CELL); b++) {
          const k = key(a, b), v = this.tops.get(k);
          if (v === undefined || v < top) this.tops.set(k, top);
        }
    };
    for (const t of world.trees) put(t.x, t.z, t.y + 19 * t.s + 1, 3.5 * t.s);
    for (const b of world.buildings) {
      const roof = b.roof === 'flat' ? 1.5 : b.d * 0.45 + 0.5;
      put(b.x, b.z, b.y + b.wallH + roof + (b.kind === 'church' ? 24 : 0), Math.hypot(b.w, b.d) / 2);
    }
    for (const l of world.lamps || []) put(l.x, l.z, l.y + 9);
    for (const g of world.gantries || []) put(g.x, g.z, g.y + 8, 8);
    this.profile = this.heights();
  }

  // the height for every 0.1 s of the flight: never under what it needs, climbing and sinking at
  // most o.climb m/s, and smoothed so that it starts and stops gently
  heights() {
    // the flight repeats (a whole number of swings), so the heights wrap around at the end
    const step = 0.1, n = Math.round(this.loop / step), c = this.o.climb * step;
    let env = new Float32Array(n);
    for (let i = 0; i < n; i++) env[i] = this.needY(i * step) + 2.2;
    for (let k = 1; k < 2 * n; k++) { const i = k % n, j = (k - 1) % n; env[i] = Math.max(env[i], env[j] - c); }
    for (let k = 2 * n - 2; k >= 0; k--) { const i = k % n, j = (k + 1) % n; env[i] = Math.max(env[i], env[j] - c); }
    // two box filters of 1.3 s: a gentle start and stop on every climb
    for (let pass = 0; pass < 2; pass++) {
      const out = new Float32Array(n), w = 6;
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = -w; j <= w; j++) sum += env[(i + j + n) % n];
        out[i] = sum / (2 * w + 1);
      }
      env = out;
    }
    return env;
  }

  heightAt(t) {
    const P = this.profile, n = P.length, u = ((((t / this.loop) % 1) + 1) % 1) * n, i = Math.floor(u) % n, f = u - Math.floor(u);
    // Catmull-Rom between the samples, so that the climb rate changes smoothly too
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    return p1 + 0.5 * f * (p2 - p0 + f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  }

  // the highest top around (x, z), and the ground (or the lake) under it
  clearAt(x, z) {
    const a0 = Math.floor(x / CELL), b0 = Math.floor(z / CELL);
    let top = -Infinity;
    for (let a = a0 - 1; a <= a0 + 1; a++) for (let b = b0 - 1; b <= b0 + 1; b++) {
      const v = this.tops.get(key(a, b));
      if (v !== undefined && v > top) top = v;
    }
    return { top, ground: Math.max(this.T.height(x, z), WATER) };
  }

  // where the flight is at time t: a point beside the road, its height over the ground, where it looks
  pose(t, out = {}) {
    const o = this.o, T = this.T;
    const k = ((t % this.loop) + this.loop) % this.loop / this.loop;
    const s = this.s0 + k * (this.s1 - this.s0);
    const sw = Math.sin((2 * Math.PI * t) / this.period);
    const d = -o.side * sw;                       // out on the left while it looks to the right
    const P = T.beside(s, d, {});
    const yaw = o.yaw * sw;                       // > 0: to the right of the road's direction
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const lx = P.dx * cy - P.dz * sy, lz = P.dz * cy + P.dx * sy;
    out.s = s; out.d = d; out.x = P.x; out.z = P.z;
    out.h = o.low + (o.high - o.low) * sw * sw;   // swoops low over the road, high at the sides
    out.lx = P.x + lx * o.ahead; out.lz = P.z + lz * o.ahead;
    out.k = k;
    return out;
  }

  // how high the camera must be at time t: its swoop over the ground, and over anything it passes
  needY(t) {
    const p = this.pose(t), c = this.clearAt(p.x, p.z);
    return Math.max(Math.max(c.ground, this.T.roadY(clamp(p.s, 0, this.T.L))) + p.h, c.top + this.o.margin);
  }

  enter() { this.enterT = 0; }

  update(dt) {
    const o = this.o;
    this.t += dt; this.enterT += dt;
    const p = this.pose(this.t);
    const now = this.clearAt(p.x, p.z);
    this.pos.x = p.x; this.pos.z = p.z;
    this.pos.y = Math.max(this.heightAt(this.t), now.top + 1.5, now.ground + 4);
    this.look.x = p.lx; this.look.z = p.lz;
    this.look.y = Math.max(this.T.height(p.lx, p.lz), WATER) + 2;
    // fade from black when the title appears and where the flight starts over
    const u = ((this.t % this.loop) + this.loop) % this.loop;
    this.veil = clamp(Math.max(1 - this.enterT / 0.8, 1 - u / o.fade, 1 - (this.loop - u) / o.fade), 0, 1);
    return this;
  }
}
