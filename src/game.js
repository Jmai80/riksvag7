// The race: six cars on Riksväg 7. Fixed 60 Hz steps, pure JS (the Node tests drive it).
// You never leave the car – there is no button for it and nothing in here that would let you.
import { Vehicle, collideVehicles } from './vehicle.js';
import { Driver, RIVALS } from './ai.js';
import { HW, LIMIT, WATER } from './track.js';
import { clamp } from './rng.js';

const P = {};
export const PHASES = ['intro', 'countdown', 'race', 'done'];
export const INTRO_T = 2.6, COUNT_T = 3.2;

export class Game {
  constructor({ track, world, carType = 'svala', paint = 'gul', rivals = true, settings = { drive: 'stick' }, intro = INTRO_T }) {
    this.track = track; this.world = world; this.settings = settings;
    this.listeners = {};
    this.vehicles = [];
    this.drivers = [];
    this.time = 0;
    this.phase = 'intro'; this.phaseT = 0; this.introT = intro;
    this.raceTime = 0;
    this.lights = 0;                 // start lights: 0 off, 1–3 red, 4 green
    this.results = null;
    this.wrongT = 0; this.wrongWay = false; this.outT = 0; this.outWarn = false;
    this.resetCool = 0;

    // the grid: three rows of two behind the start line; you start last
    const Z = track.zones;
    const slots = [];
    for (let row = 0; row < 3; row++) for (const side of [-1, 1]) slots.push({ s: Z.start - 7 - row * 9.5 - (side > 0 ? 3 : 0), d: side * 2.35 });
    const list = rivals ? RIVALS.slice(0, 5) : [];
    list.forEach((r, i) => {
      const sl = slots[i];
      track.beside(sl.s, sl.d, P);
      const car = this.addCar(r.type, r.paint === paint && r.type === carType ? 'gra' : r.paint, P.x, P.z, Math.atan2(P.dx, P.dz));
      car.name = r.name;
      const d = new Driver(this, car, { name: r.name, skill: r.skill, pace: r.pace, base: sl.d * 0.75, dist: sl.s });
      this.drivers.push(d);
      car.ai = d;
    });
    const ps = slots[5];
    track.beside(ps.s, ps.d, P);
    this.player = this.addCar(carType, paint, P.x, P.z, Math.atan2(P.dx, P.dz));
    this.player.driver = 'player';
    this.player.name = 'Du';
    this.player.input.park = true;
    this.playerS = ps.s;
    this.order = [];
    this.updateOrder();
  }

  on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); }
  emit(name, e = {}) { for (const fn of this.listeners[name] || []) fn(e); }

  addCar(type, paint, x, z, h) {
    const v = new Vehicle(type, paint, x, z, h);
    v.place(this, x, z, h);
    v.dist = this.track.project(x, z, 0, 200, 200);
    this.vehicles.push(v);
    return v;
  }

  // the "world" the cars drive in
  groundHeight(x, z) { return this.track.groundHeight(x, z); }
  surfaceAt(x, z) { return this.track.surfaceAt(x, z); }
  query(x, z, r) { return this.world.grid.query(x, z, r); }
  playerDist() { return this.playerS; }
  awayFromPlayer(car, d) { return Math.hypot(car.x - this.player.x, car.z - this.player.z) > d; }

  // ---------------------------------------------------------------- one step
  step(dt, input = {}) {
    this.time += dt;
    this.phaseT += dt;
    const p = this.player;
    if (this.phase === 'intro' && this.phaseT >= this.introT) this.setPhase('countdown');
    if (this.phase === 'countdown') {
      const n = Math.min(4, Math.floor(this.phaseT / (COUNT_T / 4)) + 1);
      if (n !== this.lights) { this.lights = n; this.emit(n < 4 ? 'count' : 'go', { n }); }
      if (n >= 4) this.setPhase('race');
    }
    const racing = this.phase === 'race' || this.phase === 'done';
    if (racing) this.raceTime += dt;
    for (const d of this.drivers) d.hold = !racing;

    // the player's controls (exactly GTA 7's mapping), or the autopilot after the finish
    if (p.auto) p.auto.update(dt, this.vehicles);
    else this.drive(dt, input, racing);
    if (input.reset && racing && !p.finished) this.resetPlayer();
    this.resetCool = Math.max(0, this.resetCool - dt);

    for (const d of this.drivers) d.update(dt, this.vehicles);
    for (const v of this.vehicles) {
      v.step(dt, this);
      const imp = v.collideStatic(this);
      if (imp > 2) this.emit('crash', { car: v, impact: imp, x: v.x, z: v.z, player: v === p, kind: 'wall' });
      if (v.landed) { this.emit('land', { car: v, ...v.landed, player: v === p }); v.landed = null; }
      v.dist = v.ai ? v.ai.dist : this.track.project(v.x, v.z, v.dist ?? 0, 15, 35);
    }
    collideVehicles(this.vehicles, (a, b, imp, x, z) => this.emit('crash', { car: a, other: b, impact: imp, x, z, player: a === p || b === p, kind: 'car' }));
    this.playerS = p.dist;
    this.updateOrder();
    if (racing) this.watch(dt);
  }

  drive(dt, input, racing) {
    const car = this.player;
    let thr, steer = input.moveX || 0;
    if (input.throttleAxis !== null && input.throttleAxis !== undefined) {
      thr = input.throttleAxis;
      if (input.steerAxis !== null && input.steerAxis !== undefined) steer = input.steerAxis;
    } else if (this.settings.drive === 'pedals') {
      thr = (input.gas ? 1 : 0) - (input.brake ? 1 : 0);
    } else {
      const mx = input.moveX || 0, my = input.moveY || 0;
      const mag = Math.min(1, Math.hypot(mx, my));
      thr = mag < 0.14 ? 0 : my > -0.35 * mag ? mag : -mag;
    }
    steer = Math.sign(steer) * Math.pow(Math.min(1, Math.abs(steer)), 1.25);
    car.input.throttle = racing ? thr : 0;
    car.input.steer = steer;
    car.input.handbrake = !!input.handbrake;
    car.input.park = !racing;
    if (!racing) car.revving = thr;  // the engine roars on the grid while you wait
    if (!!input.horn !== this.hornOn) { this.hornOn = !!input.horn; this.emit('horn', { on: this.hornOn }); }
  }

  // ---------------------------------------------------------------- the race's rules
  setPhase(ph) {
    this.phase = ph; this.phaseT = 0;
    if (ph === 'race') this.raceTime = 0;
    this.emit('phase', { phase: ph });
  }

  updateOrder() {
    const L = this.track.zones.finish;
    for (const v of this.vehicles) {
      if (!v.finished && (this.phase === 'race' || this.phase === 'done') && v.dist >= L) {
        v.finished = true; v.finishTime = this.raceTime;
        const pos = this.vehicles.filter((o) => o.finished).length;
        v.finishPos = pos;
        if (v === this.player) this.finishPlayer(pos);
        else this.emit('rivalFinish', { car: v, pos });
        if (v.ai) v.ai.finished = true;
      }
    }
    this.order = this.vehicles.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishPos - b.finishPos;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.dist - a.dist;
    });
    this.position = this.order.indexOf(this.player) + 1;
  }

  finishPlayer(pos) {
    const p = this.player;
    p.auto = new Driver(this, p, { name: 'Du', skill: 0.5, base: 2.2, dist: p.dist, player: true });
    p.auto.finished = true; p.auto.hold = false;
    p.driver = 'player';
    this.emit('finish', { pos, time: p.finishTime });
    this.setPhase('done');
  }

  // the table at the end: finished cars by time, the rest by an estimate of when they get there
  standings() {
    const F = this.track.zones.finish;
    return this.order.map((v) => {
      let time = v.finishTime, est = false;
      if (!v.finished) { const sp = Math.max(12, v.speed || 0, 32); time = this.raceTime + Math.max(0, F - v.dist) / sp; est = true; }
      return { name: v.name, type: v.type, paint: v.paint, player: v === this.player, time, est };
    }).sort((a, b) => a.time - b.time);
  }

  // wrong way, too far off the road, in the lake, stuck
  watch(dt) {
    const p = this.player, T = this.track;
    if (p.finished) { this.wrongWay = false; this.outWarn = false; return; }
    T.pointAt(p.dist, P);
    const along = (p.vx * P.dx + p.vz * P.dz);
    const facing = Math.sin(p.h) * P.dx + Math.cos(p.h) * P.dz;
    this.wrongT = facing < -0.35 && along < -3 ? this.wrongT + dt : Math.max(0, this.wrongT - dt * 2);
    this.wrongWay = this.wrongT > 1.2;
    T.project(p.x, p.z, p.dist, 15, 35);
    const dist = T.lastDist;
    this.outWarn = dist > LIMIT - 25;
    if (dist > LIMIT || p.y < WATER - 0.4) { this.outT += dt; if (this.outT > (p.y < WATER - 0.4 ? 0.6 : 1.2)) this.resetPlayer(true); }
    else this.outT = 0;
  }

  // back on the road, in the middle of your lane, standing still (R / the ÅTERSTÄLL button)
  resetPlayer(auto = false) {
    if (this.resetCool > 0 && !auto) return false;
    const p = this.player, T = this.track;
    let s = Math.max(T.zones.start + 2, p.dist - (auto ? 12 : 4));
    // stay on your side of the road (right lane if you were in the middle)
    T.pointAt(s, P);
    const lat = (p.x - P.x) * -P.dz + (p.z - P.z) * P.dx;
    let d = lat < -0.5 ? -2.2 : 2.2;
    for (let k = 0; k < 10; k++) {
      const q = T.beside(s, d, {});
      if (!this.vehicles.some((v) => v !== p && Math.hypot(v.x - q.x, v.z - q.z) < 6.5)) break;
      s += 8; d = -d;
    }
    const q = T.beside(s, d, {});
    p.place(this, q.x, q.z, Math.atan2(q.dx, q.dz));
    p.dist = s; this.playerS = s;
    this.wrongT = 0; this.outT = 0; this.wrongWay = false;
    this.resetCool = 2.5;
    this.emit('reset', { auto });
    return true;
  }
}
export { HW };
