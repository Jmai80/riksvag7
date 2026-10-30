// Small deterministic PRNG (mulberry32) so the same seed always builds the same town.
export function makeRng(seed = 7) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const moveToward = (v, target, maxDelta) =>
  v < target ? Math.min(v + maxDelta, target) : Math.max(v - maxDelta, target);
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
export const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
// 12 345 → "12 345" (Swedish thousands separator: no-break space)
export function fmt(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}
// seconds → "1:05" (whole seconds rounded down; countdowns pass Math.ceil(t))
export function mmss(t) {
  t = Math.max(0, Math.floor(t));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
export function smoothAngle(current, target, rate, dt) {
  return current + wrapAngle(target - current) * (1 - Math.exp(-rate * dt));
}
