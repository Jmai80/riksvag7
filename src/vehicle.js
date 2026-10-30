// Car physics: GTA 7's arcade model (src/vehicle.js in Jmai80/gta7), unchanged in how the cars
// accelerate, brake, grip, slide and steer. What is new here: the ground is a hilly landscape
// (slopes pull on the car and crests can throw it into the air), grass and gravel grip less than
// asphalt, and colliders carry an absolute top height. Pure JS – runs in Node for the tests.
import { clamp, moveToward } from './rng.js';
import { circleVs } from './collide.js';
import { CAR_TYPES } from './cars.js';

const GRAVITY = 16;      // the same snappy gravity as GTA 7 for airtime
const SLOPE_G = 7.5;     // how hard a hill pulls along the road (a little under 9.8: it is an arcade game)

let nextId = 1;
export class Vehicle {
  constructor(type, paint, x, z, h) {
    this.id = nextId++;
    this.type = type;
    this.spec = CAR_TYPES[type];
    this.paint = paint;
    this.x = x; this.z = z; this.y = 0; this.h = h;
    this.vx = 0; this.vz = 0; this.vy = 0; this.w = 0;
    this.steer = 0; this.spin = 0;
    this.input = { throttle: 0, steer: 0, handbrake: false, park: true };
    this.driver = null;        // 'player' | 'ai'
    this.air = false; this.airTime = 0; this.airDist = 0;
    this.slip = 0;
    this.accLong = 0; this.accLat = 0;
    this.brakeLight = 0;
    this.surface = 'road';
    this.inertia = this.spec.mass * (this.spec.len ** 2 + this.spec.wid ** 2) / 12;
    this.steerFade = 14;       // the player gets GTA 7's speed-sensitive steering; the AI sets its own
    this.power = 1;
    this.lastX = x; this.lastZ = z;
    this.pitch = 0; this.roll = 0; // the ground's slope under the car (radians), for the body and the camera
    this.airPitch = 0;
    this.landed = null;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdSpeed() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
  get kmh() { return Math.abs(this.fwdSpeed) * 3.6; }

  place(world, x, z, h) {
    this.x = x; this.z = z; this.h = h;
    this.vx = this.vz = this.vy = this.w = 0; this.steer = 0; this.air = false;
    this.y = world.groundHeight(x, z);
    this.lastX = x; this.lastZ = z;
    this.groundTilt(world);
  }

  // slope along and across the car from the ground under its wheels
  groundTilt(world) {
    const s = this.spec, sn = Math.sin(this.h), cs = Math.cos(this.h);
    const a = s.wheelbase / 2, b = s.wid * 0.42;
    const hf = world.groundHeight(this.x + sn * a, this.z + cs * a);
    const hr = world.groundHeight(this.x - sn * a, this.z - cs * a);
    const hl = world.groundHeight(this.x + cs * b, this.z - sn * b);   // the car's left (mesh +x)
    const hR = world.groundHeight(this.x - cs * b, this.z + sn * b);
    this.pitch = Math.atan2(hf - hr, a * 2);
    this.roll = Math.atan2(hl - hR, b * 2);
    return (hf - hr) / (a * 2);
  }

  step(dt, world) {
    const s = this.spec, inp = this.input;
    const sn = Math.sin(this.h), cs = Math.cos(this.h);
    let vf = this.vx * sn + this.vz * cs;
    let vr = -this.vx * cs + this.vz * sn;
    const vfPrev = vf;
    let accLong = 0;
    this.lastX = this.x; this.lastZ = this.z;
    const surf = world.surfaceAt ? world.surfaceAt(this.x, this.z) : 'road';
    this.surface = surf;
    const off = surf === 'grass' ? 1 : 0, shoulder = surf === 'gravel' ? 1 : 0;

    if (!this.air) {
      const thr = this.driver === null ? 0 : clamp(inp.throttle, -1, 1);
      if (thr > 0.02) {
        if (vf < -0.3) accLong = s.brake * thr;
        else accLong = s.accel * thr * Math.max(0, 1 - (Math.max(vf, 0) / s.maxSpeed) ** 2) * this.power * (off ? 0.78 : 1);
      } else if (thr < -0.02) {
        if (vf > 0.3) accLong = -s.brake * -thr * (off ? 0.7 : 1);
        else accLong = vf > -s.revMax ? -s.revAccel * -thr * this.power : 0;
      }
      // hills: uphill slows you, downhill speeds you up
      const slope = this.groundTilt(world);
      accLong -= SLOPE_G * slope;
      let nvf = vf + accLong * dt;
      if ((thr < -0.02 && vf > 0.3 && nvf < 0) || (thr > 0.02 && vf < -0.3 && nvf > 0)) nvf = 0;
      vf = nvf;

      const parked = inp.park;
      let decel = 1.0 + 0.022 * Math.abs(vf);
      if (Math.abs(thr) > 0.02) decel *= 0.4;
      if (off) decel += 2.4 + 0.035 * Math.abs(vf);      // grass drags
      if (inp.handbrake) decel += 6.5;
      if (parked) decel += 9;
      vf = moveToward(vf, 0, decel * dt);

      let grip = inp.handbrake ? s.hbGrip : s.grip;
      if (off) grip *= 0.62; else if (shoulder) grip *= 0.86;
      if (parked && !inp.handbrake) grip = 26;
      this.slip = Math.abs(vr);
      vr = moveToward(vr, 0, grip * dt);

      const sf = 1 / (1 + Math.abs(vf) / this.steerFade);
      const target = clamp(inp.steer, -1, 1) * s.steerMax * sf;
      this.steer += (target - this.steer) * Math.min(1, dt * 9);
      let wT = -(vf / s.wheelbase) * Math.tan(this.steer);
      const vabs = Math.abs(vf);
      if (inp.handbrake && vabs > 3) wT *= 1.5;
      const wMax = inp.handbrake ? 3.2 : (grip * 1.25) / Math.max(vabs, 2.5);
      wT = clamp(wT, -wMax, wMax);
      this.w += (wT - this.w) * Math.min(1, dt * 10);
    } else {
      this.w *= Math.exp(-0.6 * dt);
      this.slip = 0;
      this.steer += (clamp(inp.steer, -1, 1) * s.steerMax * 0.3 - this.steer) * Math.min(1, dt * 6);
    }

    this.h += this.w * dt;
    if (this.h > Math.PI) this.h -= Math.PI * 2; else if (this.h < -Math.PI) this.h += Math.PI * 2;
    this.vx = vf * sn - vr * cs;       // (in the frame the step began with, exactly as GTA 7 does:
    this.vz = vf * cs + vr * sn;       //  the heading change shows up as slip next step)
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.accLong = (vf - vfPrev) / dt;
    this.accLat = vf * this.w;
    this.spin += (vf * dt) / s.wheelR;

    // vertical: follow the ground; leave it over a crest when the car would fly higher than the
    // ground falls away, land when the ground comes back up
    const gh = world.groundHeight(this.x, this.z);
    if (this.air) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      this.airDist += Math.hypot(this.vx, this.vz) * dt;
      this.airPitch = moveToward(this.airPitch, -0.12, 0.3 * dt);
      if (this.y <= gh) {
        const groundVy = (gh - world.groundHeight(this.x - this.vx * dt, this.z - this.vz * dt)) / dt;
        const impact = Math.max(0, groundVy - this.vy);
        this.landed = { airTime: this.airTime, dist: this.airDist, impact };
        this.y = gh; this.vy = 0; this.air = false;
      }
    } else {
      // a crest: when the road bends down faster than gravity can pull the car along it, the car
      // flies (curvature measured over ±3 m along the motion, so the 2 m road samples don't show)
      const sp = Math.hypot(this.vx, this.vz);
      let fly = false, slopeV = 0;
      if (sp > 9) {
        const ux = this.vx / sp, uz = this.vz / sp, Lc = 3;
        const hA = world.groundHeight(this.x + ux * Lc, this.z + uz * Lc), hB = world.groundHeight(this.x - ux * Lc, this.z - uz * Lc);
        const curv = (hA - 2 * gh + hB) / (Lc * Lc);
        slopeV = ((hA - hB) / (2 * Lc)) * sp;
        fly = sp * sp * curv < -GRAVITY * 1.05;
      }
      if (fly) {
        this.air = true; this.airTime = 0; this.airDist = 0;
        this.airPitch = this.pitch;
        this.vy = slopeV; this.y = gh;
      } else if (gh < this.y - 0.6) {
        this.air = true; this.airTime = 0; this.airDist = 0; this.vy = 0; this.airPitch = this.pitch;
      } else {
        this.vy = slopeV || (gh - this.y) / dt;
        this.y = gh;
      }
    }

    // brake lights
    const braking = (inp.throttle < -0.05 && vf > 0.5) || (inp.throttle > 0.05 && vf < -0.5) || inp.handbrake || (inp.park && this.driver === 'ai');
    this.brakeLight = braking ? 1 : 0;
    this.reversing = vf < -0.4 && inp.throttle < -0.05;
  }

  // Resolve against static colliders. Returns the strongest impact speed this step.
  collideStatic(world) {
    const s = this.spec;
    let maxImpact = 0;
    for (let iter = 0; iter < 2; iter++) {
      const sn = Math.sin(this.h), cs = Math.cos(this.h);
      for (const off of s.circles) {
        const cx = this.x + sn * off, cz = this.z + cs * off;
        const hits = world.query(cx, cz, s.radius);
        for (let k = 0; k < hits.length; k++) {
          const c = hits[k];
          if (this.y > c.top - 0.12) continue;           // flying over it
          if (c.bottom !== undefined && this.y + s.height < c.bottom) continue; // under it (the gantries)
          const res = circleVs(c, cx, cz, s.radius);
          if (!res) continue;
          const nx = res.nx, nz = res.nz, depth = res.depth;
          this.x += nx * depth; this.z += nz * depth;
          const imp = this.applyImpulse(sn * off - nx * s.radius, cs * off - nz * s.radius, nx, nz, 0.18, c.slick ? 0.12 : 0.35);
          if (imp > maxImpact) maxImpact = imp;
        }
      }
    }
    return maxImpact;
  }

  // impulse against an immovable surface at contact offset (rx,rz) with normal n
  applyImpulse(rx, rz, nx, nz, e, mu) {
    const invM = 1 / this.spec.mass, invI = 1 / this.inertia;
    const vcx = this.vx + this.w * rz, vcz = this.vz - this.w * rx;
    const vn = vcx * nx + vcz * nz;
    if (vn >= 0) return 0;
    const rn = rz * nx - rx * nz;
    const j = (-(1 + e) * vn) / (invM + rn * rn * invI);
    this.vx += j * nx * invM; this.vz += j * nz * invM; this.w += j * rn * invI;
    const tx = -nz, tz = nx;
    const vt = vcx * tx + vcz * tz;
    const rt = rz * tx - rx * tz;
    let jt = -vt / (invM + rt * rt * invI);
    const lim = mu * j;
    jt = jt < -lim ? -lim : jt > lim ? lim : jt;
    this.vx += jt * tx * invM; this.vz += jt * tz * invM; this.w += jt * rt * invI;
    this.w = clamp(this.w, -6, 6);
    return -vn;
  }

  // world position of a point in car-local coordinates (x right, z forward) – as in GTA 7
  local(lx, lz) {
    const sn = Math.sin(this.h), cs = Math.cos(this.h);
    return { x: this.x + sn * lz - cs * lx, z: this.z + cs * lz + sn * lx };
  }
}

// Car vs car (GTA 7's). Calls onHit(a, b, impactSpeed, x, z) for noticeable hits.
export function collideVehicles(list, onHit) {
  const n = list.length;
  for (let i = 0; i < n; i++) {
    const a = list[i];
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      const dx = a.x - b.x, dz = a.z - b.z;
      const reach = (a.spec.len + b.spec.len) / 2 + 0.3;
      if (dx * dx + dz * dz > reach * reach) continue;
      if (Math.abs(a.y - b.y) > 1.3) continue;
      const sa = Math.sin(a.h), ca = Math.cos(a.h), sb = Math.sin(b.h), cb = Math.cos(b.h);
      let best = null;
      for (const oa of a.spec.circles) {
        const ax = a.x + sa * oa, az = a.z + ca * oa;
        for (const ob of b.spec.circles) {
          const bx = b.x + sb * ob, bz = b.z + cb * ob;
          const ddx = ax - bx, ddz = az - bz;
          const rr = a.spec.radius + b.spec.radius;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4;
            const depth = rr - d;
            if (!best || depth > best.depth) best = { depth, nx: ddx / d, nz: ddz / d, px: bx + (ddx / d) * b.spec.radius, pz: bz + (ddz / d) * b.spec.radius };
          }
        }
      }
      if (!best) continue;
      const imp = resolvePair(a, b, best);
      if (imp > 1.2 && onHit) onHit(a, b, imp, best.px, best.pz);
    }
  }
}

function resolvePair(a, b, c) {
  const ia = 1 / a.spec.mass, ib = 1 / b.spec.mass;
  const tot = ia + ib;
  a.x += c.nx * c.depth * (ia / tot); a.z += c.nz * c.depth * (ia / tot);
  b.x -= c.nx * c.depth * (ib / tot); b.z -= c.nz * c.depth * (ib / tot);
  const rax = c.px - a.x, raz = c.pz - a.z, rbx = c.px - b.x, rbz = c.pz - b.z;
  const vax = a.vx + a.w * raz, vaz = a.vz - a.w * rax;
  const vbx = b.vx + b.w * rbz, vbz = b.vz - b.w * rbx;
  const rvx = vax - vbx, rvz = vaz - vbz;
  const vn = rvx * c.nx + rvz * c.nz;
  if (vn >= 0) return 0;
  const rna = raz * c.nx - rax * c.nz, rnb = rbz * c.nx - rbx * c.nz;
  const iia = 1 / a.inertia, iib = 1 / b.inertia;
  const e = 0.25;
  const j = (-(1 + e) * vn) / (ia + ib + rna * rna * iia + rnb * rnb * iib);
  a.vx += j * c.nx * ia; a.vz += j * c.nz * ia; a.w += j * rna * iia;
  b.vx -= j * c.nx * ib; b.vz -= j * c.nz * ib; b.w -= j * rnb * iib;
  const tx = -c.nz, tz = c.nx;
  const vt = rvx * tx + rvz * tz;
  const rta = raz * tx - rax * tz, rtb = rbz * tx - rbx * tz;
  let jt = -vt / (ia + ib + rta * rta * iia + rtb * rtb * iib);
  const lim = 0.3 * j;
  jt = clamp(jt, -lim, lim);
  a.vx += jt * tx * ia; a.vz += jt * tz * ia; a.w += jt * rta * iia;
  b.vx -= jt * tx * ib; b.vz -= jt * tz * ib; b.w -= jt * rtb * iib;
  a.w = clamp(a.w, -6, 6); b.w = clamp(b.w, -6, 6);
  return -vn;
}
