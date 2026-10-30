// The computer drivers (from GTA 7's RaceDriver in src/racer.js): follow the road with a lateral
// offset (right of the road is positive), take the inside of the bends, dodge the cars ahead,
// back out when wedged and rubber-band a little toward the player. Pure JS.
import { clamp } from './rng.js';
import { HW } from './track.js';
import { topSpeed } from './cars.js';

const T1 = {}, T2 = {}, T3 = {};

export const RIVALS = [
  { name: 'Turbo-Tord', type: 'lo', paint: 'lila', skill: 0.89, pace: 0.95 },
  { name: 'Sonja Snabb', type: 'falk', paint: 'turkos', skill: 0.9, pace: 0.955 },
  { name: 'Kurv-Karin', type: 'svala', paint: 'koppar', skill: 0.91, pace: 0.965 },
  { name: 'Rally-Rolf', type: 'falk', paint: 'svart', skill: 0.87, pace: 0.94 },
  { name: 'Gasen-Gunnar', type: 'svala', paint: 'vit', skill: 0.85, pace: 0.935 },
];

export class Driver {
  constructor(game, car, o = {}) {
    this.game = game; this.car = car; this.track = game.track;
    this.name = o.name || 'Förare';
    this.skill = o.skill ?? 0.93;
    this.pace = o.pace ?? 1;                 // how close to the car's top speed it cruises
    this.vTop = topSpeed(car.spec);
    this.base = o.base ?? 0;
    this.off = this.base; this.offT = this.base;
    this.dist = o.dist ?? 0;
    this.hold = true;
    this.finished = false;
    this.revT = 0; this.stuckT = 0; this.clearT = 0;
    this.best = this.dist; this.noProgT = 0; this.respawns = 0;
    this.rubber = 1;
    this.near = []; this.nn = 0; this.speedNow = 6;
    this.blocker = null;
    this.player = !!o.player;     // the player's car on autopilot after the finish line
    car.driver = 'ai';
    car.steerFade = 30;
    // how hard this car can corner compared with the track's speed profile (made for ~19 m/s² of grip)
    this.cornerK = Math.sqrt((car.spec.grip * 1.25 * 0.82) / 15.5);
  }

  update(dt, obstacles) {
    const car = this.car, T = this.track, inp = car.input, g = this.game;
    this.dist = T.project(car.x, car.z, this.dist, 12, 30);
    if (this.hold) { inp.throttle = 0; inp.steer = 0; inp.handbrake = false; inp.park = true; return; }
    inp.park = false; inp.handbrake = false;
    const speed = car.fwdSpeed;

    // watchdog: no progress for a while, far from the player's eyes → back on the road
    if (this.dist > this.best + 2) { this.best = this.dist; this.noProgT = 0; }
    else if (!this.finished && (this.noProgT += dt) > 6 && g.awayFromPlayer(car, 45)) { this.respawn(); return; }

    // target speed: the road's profile a little ahead, scaled to this car's grip, times skill
    const ahead = T.pointAt(this.dist + 4 + Math.max(0, speed) * 0.45, T1);
    let v = Math.min(ahead.v * this.cornerK, 60);
    // and look further ahead for a bend that needs braking now
    for (const a of [20, 40, 65]) {
      const p = T.pointAt(this.dist + a, T2);
      const vb = Math.sqrt((p.v * this.cornerK) ** 2 + 2 * 9.5 * a);
      if (vb < v) v = vb;
    }
    const lead = this.dist - g.playerDist();
    const rb = lead > 90 ? 0.86 : lead > 35 ? 0.93 : lead < -90 ? 1.07 : lead < -35 ? 1.035 : 1;
    if (!this.player) this.rubber += (rb - this.rubber) * Math.min(1, dt * 0.5);
    v *= this.skill * (this.rubber < 1 || Math.abs(ahead.k) < 1 / 300 ? this.rubber : 1);
    v = Math.min(v, this.vTop * this.pace * (this.player ? 1 : this.rubber));
    if (this.finished) v = Math.min(v, this.dist > g.track.zones.finish + 90 ? 0 : 14);

    // obstacles ahead that we are closing in on
    const sn = Math.sin(car.h), cs = Math.cos(car.h);
    const look = clamp(10 + Math.abs(speed) * 1.5, 14, 55);
    const near = this.near;
    let nn = 0;
    for (const o of obstacles) {
      if (o === car) continue;
      const dx = o.x - car.x, dz = o.z - car.z, d2 = dx * dx + dz * dz;
      if (d2 > (look + 5) * (look + 5) || dx * sn + dz * cs < -2) continue;
      if ((car.vx - o.vx) * sn + (car.vz - o.vz) * cs < 0.5 && d2 > 36) continue;
      const e = near[nn] || (near[nn] = {});
      e.x = o.x; e.z = o.z; e.r = o.spec.radius + 0.4; e.vx = o.vx; e.vz = o.vz;
      nn++;
    }
    this.nn = nn;
    this.speedNow = Math.max(6, speed);
    // the racing line: toward the inside of the bend ahead
    const kA = T.pointAt(this.dist + 12 + Math.max(0, speed) * 0.5, T2).k;
    const inside = -Math.sign(kA) * Math.min(2.4, Math.abs(kA) * 300);
    const lineOff = clamp(this.base * 0.55 + inside, -3.7, 3.7);
    const lo = -(HW - 1.25), hi = HW - 1.25;
    let gap = nn ? this.gapAt(this.offT, look) : Infinity;
    let blocker = gap < Infinity ? this.blocker : null;
    if (gap < Infinity) {
      this.clearT = 0;
      const score = (c, gp) => Math.min(gp, look + 4) - Math.abs(c - this.off) * 1.1;
      let best = score(this.offT, gap), bestOff = this.offT, bestGap = gap, bestBlk = blocker;
      for (const c0 of [lineOff, this.offT - 2.6, this.offT + 2.6, lo, hi, 0]) {
        const c = clamp(c0, lo, hi);
        if (Math.abs(c - this.offT) < 0.5) continue;
        const gp = this.gapAt(c, look), sc = score(c, gp);
        if (sc > best + 2) { best = sc; bestOff = c; bestGap = gp; bestBlk = gp < Infinity ? this.blocker : null; }
      }
      this.offT = bestOff; gap = bestGap; blocker = bestBlk;
    } else if ((this.clearT += dt) > 1.2) {
      this.offT += clamp(lineOff - this.offT, -1.6 * dt, 1.6 * dt);
    }
    this.offT = clamp(this.offT, lo, hi);
    if (blocker) {
      const ov = Math.max(0, blocker.vx * sn + blocker.vz * cs);
      const vFollow = Math.max(0, (gap - 5) * 1.3);
      v = Math.min(v, Math.max(vFollow, Math.min(ov + 1.5, vFollow + 4)));
      if (gap < 3.5) v = Math.min(v, ov * 0.8);
    }
    this.off += clamp(this.offT - this.off, -4 * dt, 4 * dt);

    // steering: pure pursuit toward a point ahead on the (offset) road
    const Ld = clamp(6 + Math.abs(speed) * 0.42, 7, 24);
    const tp = T.pointAt(this.dist + Ld, T3);
    const tx = tp.x - tp.dz * this.off, tz = tp.z + tp.dx * this.off;
    const dx = tx - car.x, dz = tz - car.z;
    const lf = dx * sn + dz * cs, lr = -dx * cs + dz * sn;
    const alpha = Math.atan2(lr, Math.max(lf, 0.5));
    const delta = Math.atan((2 * car.spec.wheelbase * Math.sin(alpha)) / Math.max(Ld * 0.8, Math.hypot(dx, dz)));
    const sf = 1 / (1 + Math.abs(speed) / car.steerFade);
    const steer = clamp(delta / (car.spec.steerMax * sf), -1, 1);

    if (this.revT > 0) {
      this.revT -= dt;
      inp.throttle = -0.85; inp.steer = -steer;
      return;
    }
    const err = v - speed;
    let thr = clamp(err * 0.5, -1, 1);
    if (err > 0.3) thr = Math.max(thr, 0.35);
    if (err > 2) thr = 1;
    if (v < 0.3 && speed < 0.8) { thr = 0; inp.park = true; }
    if (car.air) thr = 0;
    inp.throttle = thr; inp.steer = steer;
    if (v > 3 && Math.abs(speed) < 0.7 && !this.finished) {
      if ((this.stuckT += dt) > 1.0) { this.revT = 1.1; this.stuckT = 0; }
    } else this.stuckT = Math.max(0, this.stuckT - dt);
  }

  gapAt(off, look) {
    const T = this.track, near = this.near, inv = 1 / this.speedNow;
    for (let ds = 2.5; ds <= look; ds += 2.5) {
      const p = T.pointAt(this.dist + ds, T2);
      const px = p.x - p.dz * off, pz = p.z + p.dx * off;
      const t = Math.min(2.5, ds * inv);
      for (let k = 0; k < this.nn; k++) {
        const e = near[k];
        const dx = e.x + e.vx * t - px, dz = e.z + e.vz * t - pz, lim = e.r + 1.1;
        if (dx * dx + dz * dz < lim * lim) { this.blocker = e; return ds; }
      }
    }
    return Infinity;
  }

  respawn() {
    const car = this.car, T = this.track, g = this.game;
    for (let k = 0; k < 8; k++) {
      const d = this.best + 4 + k * 7;
      const p = T.pointAt(d, T1);
      const x = p.x - p.dz * this.base, z = p.z + p.dx * this.base;
      if (g.vehicles.some((v) => v !== car && Math.hypot(v.x - x, v.z - z) < 6)) continue;
      car.place(g, x, z, Math.atan2(p.dx, p.dz));
      this.dist = this.best = d;
      this.off = this.offT = this.base;
      this.noProgT = 0; this.revT = 0; this.stuckT = 0;
      this.respawns++;
      return true;
    }
    this.noProgT = 4;
    return false;
  }
}
