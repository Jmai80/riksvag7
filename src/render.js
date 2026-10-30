// The view: renderer, light and shadows, the sky, the scenery, the cars and the chase camera.
import * as THREE from './three.js';
import { makeSky, makeEnvironment, SUN_DIR } from './sky.js';
import { Scenery } from './scenery.js';
import { CarModel } from './carmodel.js';
import { clamp, smooth, smoothAngle, wrapAngle } from './rng.js';
import { blobTexture } from './textures.js';
import { HW } from './track.js';

const HAZE = 0xc6d3dc;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

export const QUALITY = {
  pretty: { dpr: 2, shadow: 2048, trees: 1, hd: true, far: 1300 },
  auto: { dpr: 1.5, shadow: 1024, trees: 1, hd: true, far: 1100 },
  saver: { dpr: 1, shadow: 0, trees: 0.55, hd: false, far: 800 },
};

export class View {
  constructor(canvas, track, world, quality = 'auto') {
    this.canvas = canvas; this.track = track; this.world = world;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(HAZE, 180, 1100);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.3, 2400);
    this.scene.environment = makeEnvironment(r);
    this.scene.environmentIntensity = 0.85;
    this.sky = makeSky(2200);
    this.scene.add(this.sky);

    // the sun and the sky's light
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0dc, 2.7));
    sun.castShadow = true;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    const sc = sun.shadow.camera;
    sc.left = -58; sc.right = 58; sc.top = 58; sc.bottom = -58; sc.near = 10; sc.far = 400;
    this.scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd4f0, 0x5a5640, 0.55);
    this.scene.add(this.hemi);

    this.quality = quality;
    this.applyQuality(quality, true);
    this.scenery = new Scenery(track, world, { trees: QUALITY[quality].trees, hdTrees: QUALITY[quality].hd });
    this.scene.add(this.scenery.group);

    // blob shadows under the cars (always on, also when the shadow map is off)
    this.blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0x000000 });
    this.cars = new Map();
    this.particles = new Particles(this.scene, 260);
    this.rig = new CameraRig(this.camera);
    this.time = 0;
    this.resize();
  }

  applyQuality(q, first = false) {
    this.quality = q;
    const Q = QUALITY[q];
    this.dprMax = Q.dpr;
    this.setDpr(Math.min(window.devicePixelRatio || 1, Q.dpr));
    this.sun.castShadow = Q.shadow > 0;
    if (Q.shadow) { this.sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.camera.far = Q.far + 1200;
    this.scene.fog.far = Q.far;
    this.camera.updateProjectionMatrix();
    if (!first && this.scenery) for (const m of this.scenery.treeMeshes) m.visible = true;
  }

  setDpr(d) { this.dpr = d; this.renderer.setPixelRatio(d); this.resize(); }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // the cars of a race (or the showroom car)
  setCars(list) {
    for (const [v, c] of this.cars) if (!list.includes(v)) { this.scene.remove(c.model.group, c.blob); c.model.dispose(); this.cars.delete(v); }
    list.forEach((v, i) => {
      if (this.cars.has(v)) return;
      const plate = v.plate || ['RIK 007', 'TRB 777', 'SNB 412', 'KRV 305', 'RLY 230', 'GAS 909'][i % 6];
      const model = new CarModel(v.type, v.paint, plate);
      const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.blobMat);
      blob.renderOrder = 2;
      this.scene.add(model.group, blob);
      this.cars.set(v, { model, blob });
    });
  }

  syncCars(dt) {
    for (const [v, c] of this.cars) {
      if (v.visY === undefined || Math.abs(v.visY - v.y) > 2) v.visY = v.y;
      v.visY = smooth(v.visY, v.y, v.air ? 60 : 30, dt);
      c.model.sync(v, dt, v.visY);
      const gh = this.track.groundHeight(v.x, v.z), lift = Math.max(0, v.visY - gh);
      const s = 1 + lift * 0.3;
      c.blob.position.set(v.x, gh + 0.04, v.z);
      c.blob.rotation.y = v.h;
      c.blob.scale.set(v.spec.wid * 1.25 * s, 1, v.spec.len * 1.08 * s);
      c.blob.material.opacity = 0.55 / (1 + lift);
    }
  }

  // tyre smoke, dust off the road, sparks
  syncFx(game, dt) {
    for (const v of game.vehicles) {
      const near = Math.hypot(v.x - this.camera.position.x, v.z - this.camera.position.z) < 120;
      if (!near || v.air) continue;
      const sp = v.speed;
      const off = v.surface === 'grass' || v.surface === 'gravel';
      if ((v.slip > 4.5 && sp > 6) || (off && sp > 8)) {
        v.fxT = (v.fxT || 0) + dt * (off ? 30 : Math.min(40, v.slip * 4));
        while (v.fxT > 1) {
          v.fxT -= 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          const p = v.local(side * 0.75, v.spec.wheelZ[1]);
          const col = off ? (v.surface === 'grass' ? [0.42, 0.38, 0.28] : [0.62, 0.57, 0.48]) : [0.86, 0.86, 0.86];
          this.particles.emit(p.x, v.y + 0.3, p.z, v.vx * 0.2 + (Math.random() - 0.5), 0.6 + Math.random() * 0.8, v.vz * 0.2 + (Math.random() - 0.5), 1.0 + Math.random() * 0.8, off ? 1.0 : 1.6, col, off ? 0.45 : 0.35, 2.8);
        }
      }
    }
    this.particles.update(dt, this.camera);
  }

  sparks(x, y, z, n) {
    for (let i = 0; i < n; i++) this.particles.emit(x, y, z, (Math.random() - 0.5) * 9, 1 + Math.random() * 4, (Math.random() - 0.5) * 9, 0.12, 0.45, [1, 0.75, 0.3], 1, 0, true);
  }

  sync(game, dt) {
    this.time += dt;
    this.sky.material.uniforms.uTime.value = this.time;
    if (game) { this.syncCars(dt); this.syncFx(game, dt); }
    this.scenery.update(this.time, game, this.camera.position);
    // the sun's shadow box follows the camera's target, reaching a little further ahead
    const f = this.rig.look, cp = this.camera.position;
    const fx = f.x - cp.x, fz = f.z - cp.z, fl = Math.hypot(fx, fz) || 1;
    const step = 2;
    const cx = Math.round((f.x + (fx / fl) * 22) / step) * step, cz = Math.round((f.z + (fz / fl) * 22) / step) * step;
    this.sun.target.position.set(cx, f.y, cz);
    this.sun.position.set(cx + SUN_DIR.x * 200, f.y + SUN_DIR.y * 200, cz + SUN_DIR.z * 200);
    this.sky.position.copy(this.camera.position);
  }

  render() { this.renderer.render(this.scene, this.camera); }

  project(x, y, z, out) {
    tmpV.set(x, y, z).project(this.camera);
    out.x = (tmpV.x * 0.5 + 0.5) * this.canvas.clientWidth;
    out.y = (-tmpV.y * 0.5 + 0.5) * this.canvas.clientHeight;
    out.vis = tmpV.z < 1;
    return out;
  }
}

// ------------------------------------------------------------------ the chase camera (GTA 7's car camera)
export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0; this.manual = 0; this.manualT = 9;
    this.shake = 0; this.k = 1;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.fov = 60;
    this.mode = 'far';            // 'far' (GTA 7's chase view) or 'near' (lower and closer)
    this.blendT = 1; this.from = new THREE.Vector3(); this.fromLook = new THREE.Vector3();
  }

  startBlend(sec = 1.4) { this.from.copy(this.cam.position); this.fromLook.copy(this.look); this.blendT = 0; this.blendDur = sec; }

  // a slow orbit round a point (the car picker, the title, the intro)
  orbit(dt, cx, cy, cz, r, h, speed, fov = 45, t0 = 0, side = 0) {
    this.orbitA = (this.orbitA ?? t0) + dt * speed;
    const a = this.orbitA;
    this.pos.set(cx + Math.sin(a) * r, cy + h, cz + Math.cos(a) * r);
    // side > 0 puts the subject left of the middle (shift the aim to the camera's right)
    this.look.set(cx + Math.cos(a) * side, cy + 0.55, cz - Math.sin(a) * side);
    this.apply(dt, fov);
  }

  // chase: behind the car, looking a little ahead (portrait screens get a higher, further view)
  chase(dt, car, aspect, input, world) {
    const portrait = aspect < 0.9;
    const sp = car.speed, f = Math.min(sp / 40, 1);
    let dist, height, lookH, ahead, fov;
    if (this.mode === 'near') {
      dist = (portrait ? 8.2 : 6.0) + f * 1.0; height = portrait ? 3.6 : 2.0; lookH = 1.0; ahead = portrait ? 5 : 3; fov = (portrait ? 70 : 60) + f * 10;
    } else {
      dist = (portrait ? 11.0 : 8.4) + f * 1.8; height = portrait ? 6.2 : 3.4; lookH = 1.1; ahead = portrait ? 6 : 2.6; fov = (portrait ? 68 : 58) + f * 10;
    }
    let hd = car.h;
    if (sp > 3 && car.fwdSpeed > 0) hd = car.h + wrapAngle(Math.atan2(car.vx, car.vz) - car.h) * 0.45;
    if (car.fwdSpeed < -2) hd = car.h;
    if (input && input.camDX) { this.manual -= input.camDX * 0.0065; this.manualT = 0; } else this.manualT += dt;
    if (this.manualT > 1.0) this.manual *= Math.exp(-3 * dt);
    this.yaw = smoothAngle(this.yaw, hd, car.air ? 1.5 : 3.2, dt);
    const yaw = this.yaw + this.manual;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const ty = car.visY ?? car.y;
    // keep out of houses
    const want = dist;
    const hit = world ? world.raycast(car.x, car.z, car.x - fx * (want + 0.8), car.z - fz * (want + 0.8), ty - 1) : 1;
    const kT = hit < 1 ? Math.max(0.3, (hit * (want + 0.8) - 0.8) / want) : 1;
    this.k = smooth(this.k, kT, kT < this.k ? 12 : 2.5, dt);
    const d = want * this.k;
    // follow the slope: look along the car's pitch a bit so hills don't fill the screen
    const pitchLift = clamp(-(car.pitch || 0) * d * 0.6, -2, 2);
    this.pos.set(car.x - fx * d, ty + height * (0.6 + 0.4 * this.k) + pitchLift, car.z - fz * d);
    this.look.set(car.x + fx * ahead, ty + lookH + Math.sin(car.pitch || 0) * ahead, car.z + fz * ahead);
    // never below the ground
    this.minY = (world && world.groundAt ? world.groundAt(this.pos.x, this.pos.z) : -1e9) + 0.8;
    if (this.pos.y < this.minY) this.pos.y = this.minY;
    this.apply(dt, fov);
  }

  // a fixed shot from beside the road (the finish)
  shot(dt, px, py, pz, lx, ly, lz, fov) {
    this.pos.set(px, py, pz); this.look.set(lx, ly, lz);
    this.apply(dt, fov);
  }

  apply(dt, fov) {
    if (this.shake > 0.001) {
      this.pos.x += (Math.random() - 0.5) * this.shake; this.pos.y += (Math.random() - 0.5) * this.shake; this.pos.z += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-7 * dt);
    }
    this.fov = smooth(this.fov, fov, 3, dt);
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / (this.blendDur || 1.4));
      const e = this.blendT < 0.5 ? 2 * this.blendT * this.blendT : 1 - Math.pow(-2 * this.blendT + 2, 2) / 2;
      this.cam.position.lerpVectors(this.from, this.pos, e);
      tmpV2.lerpVectors(this.fromLook, this.look, e);
      this.cam.lookAt(tmpV2);
    } else {
      this.cam.position.copy(this.pos);
      this.cam.lookAt(this.look);
    }
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}

// ------------------------------------------------------------------ particles (one draw call)
class Particles {
  constructor(scene, max) {
    this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, vertexColors: true,
      uniforms: { uScale: { value: 400 }, ...THREE.UniformsLib.fog },
      vertexShader: `attribute float size; varying vec4 vC; uniform float uScale;
        #include <fog_pars_vertex>
        void main(){ vC = color; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `varying vec4 vC;
        #include <fog_pars_fragment>
        void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(d)) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a);
        #include <fog_fragment>
        }`,
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 5;
    scene.add(this.pts);
    this.list = [];
    this.next = 0;
  }
  emit(x, y, z, vx, vy, vz, size, life, col, alpha, grow = 1, gravity = false) {
    const p = this.list[this.next] || (this.list[this.next] = {});
    Object.assign(p, { x, y, z, vx, vy, vz, size, life, t: 0, col, alpha, grow, gravity });
    this.next = (this.next + 1) % this.max;
  }
  update(dt, camera) {
    this.mat.uniforms.uScale.value = (window.innerHeight || 800) / (2 * Math.tan((camera.fov * Math.PI) / 360)) * 0.5;
    for (let i = 0; i < this.max; i++) {
      const p = this.list[i];
      if (!p || p.t >= p.life) { this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      p.t += dt;
      if (p.gravity) p.vy -= 14 * dt; else { p.vx *= Math.exp(-1.5 * dt); p.vz *= Math.exp(-1.5 * dt); p.vy *= Math.exp(-1 * dt); }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = p.t / p.life;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.size * (1 + k * p.grow);
      this.col[i * 4] = p.col[0]; this.col[i * 4 + 1] = p.col[1]; this.col[i * 4 + 2] = p.col[2];
      this.col[i * 4 + 3] = p.alpha * (1 - k) * Math.min(1, p.t * 8);
    }
    const g = this.pts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
  }
}
void HW;
