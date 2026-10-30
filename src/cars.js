// The three cars you can choose from, and the paints. The numbers mean the same as in GTA 7's
// CAR_TYPES (accel/brake in m/s², speeds in m/s, grip = how fast sideways slip dies away).
export const CAR_TYPES = {
  // a light, sharp hot hatch: the best grip and the quickest steering, the lowest top speed
  svala: {
    key: 'svala', name: 'Svala RS', kind: 'Hot hatch', blurb: 'Lätt och kvick. Bäst väghållning – tar kurvorna fortast.',
    len: 4.16, wid: 1.82, height: 1.44,
    wheelbase: 2.62, track: 0.79, wheelR: 0.345, wheelZ: [1.31, -1.31],
    mass: 1150, accel: 12.6, maxSpeed: 46, brake: 21, revAccel: 5.5, revMax: 9,
    grip: 18.6, hbGrip: 4.8, steerMax: 0.66,
    circles: [-1.36, 0, 1.36], radius: 0.92,
    paints: ['gul', 'vit', 'rod', 'svart'],
    stats: { handling: 0.95 },
  },
  // a long-bonneted fastback coupé: strong and stable, the all-rounder
  falk: {
    key: 'falk', name: 'Falk GT', kind: 'Sportcoupé', blurb: 'Stark och stabil. Bra på allt – en riktig landsvägskryssare.',
    len: 4.62, wid: 1.88, height: 1.34,
    wheelbase: 2.82, track: 0.81, wheelR: 0.345, wheelZ: [1.43, -1.39],
    mass: 1420, accel: 12.9, maxSpeed: 48.5, brake: 21, revAccel: 5.5, revMax: 9,
    grip: 16.8, hbGrip: 4.5, steerMax: 0.62,
    circles: [-1.5, 0, 1.5], radius: 0.95,
    paints: ['bla', 'silver', 'gron', 'rod'],
    stats: { handling: 0.78 },
  },
  // a low mid-engined supercar: brutal on the straights, a handful in the bends
  lo: {
    key: 'lo', name: 'Lo V8', kind: 'Superbil', blurb: 'Lägst och snabbast. Brutal på raksträckorna men nervös i kurvorna.',
    len: 4.48, wid: 1.96, height: 1.14,
    wheelbase: 2.66, track: 0.85, wheelR: 0.35, wheelZ: [1.38, -1.28],
    mass: 1380, accel: 14.0, maxSpeed: 51, brake: 22, revAccel: 5.5, revMax: 9,
    grip: 15.2, hbGrip: 4.1, steerMax: 0.58,
    circles: [-1.42, 0, 1.42], radius: 0.97,
    paints: ['orange', 'rod', 'gra', 'vit'],
    stats: { handling: 0.62 },
  },
};
export const CAR_ORDER = ['svala', 'falk', 'lo'];

// metallic paints (hex, name in the game, how metallic the flake is)
export const PAINTS = {
  gul: { hex: 0xf2b705, name: 'Racinggul', metal: 0.25 },
  vit: { hex: 0xeceeee, name: 'Pärlvit', metal: 0.15 },
  rod: { hex: 0xa3121b, name: 'Rubinröd', metal: 0.55 },
  svart: { hex: 0x101114, name: 'Obsidian', metal: 0.6 },
  bla: { hex: 0x1d3f8a, name: 'Kungsblå', metal: 0.6 },
  silver: { hex: 0xa9aeb3, name: 'Silvermetallic', metal: 0.85 },
  gron: { hex: 0x1f4a36, name: 'Skogsgrön', metal: 0.6 },
  orange: { hex: 0xe2560f, name: 'Lavaorange', metal: 0.35 },
  gra: { hex: 0x4c5157, name: 'Granitgrå', metal: 0.7 },
  // the computer drivers' cars
  turkos: { hex: 0x0f7c86, name: 'Turkos', metal: 0.5 },
  lila: { hex: 0x4b2a6e, name: 'Lila', metal: 0.6 },
  koppar: { hex: 0x8a4a26, name: 'Koppar', metal: 0.8 },
};

// 0–100 km/h on a flat road at full throttle, simulated with the real physics (for the car picker)
export function zeroTo100(spec) {
  let v = 0, t = 0;
  const dt = 1 / 120;
  while (v < 100 / 3.6 && t < 30) {
    let a = spec.accel * Math.max(0, 1 - (v / spec.maxSpeed) ** 2);
    a -= (1.0 + 0.022 * v) * 0.4;
    v += a * dt; t += dt;
  }
  return t;
}

// the speed where full throttle stops adding anything on a flat road
export function topSpeed(spec) {
  let v = 0;
  for (let i = 0; i < 120 * 120; i++) {
    const a = spec.accel * Math.max(0, 1 - (v / spec.maxSpeed) ** 2) - (1.0 + 0.022 * v) * 0.4;
    if (a < 1e-4) break;
    v += a / 120;
  }
  return v;
}

// the gearbox (for the engine sound and the HUD): each gear's share of the top speed
export const GEARS = [0, 0.17, 0.32, 0.47, 0.62, 0.79, 1.02];
export function gearOf(car) {
  const vTop = car.vTop || (car.vTop = topSpeed(car.spec));
  const v = Math.abs(car.fwdSpeed) / vTop;
  let g = 1;
  while (g < 6 && v > GEARS[g]) g++;
  return g;
}
