// Node tests for Riksväg 7: the road, the landscape, the physics (GTA 7's), the race and its rules.
// npm test → ends with "All checks passed".
import { Track, HW, LIMIT, WATER } from '../src/track.js';
import { World } from '../src/world.js';
import { Game } from '../src/game.js';
import { Driver, RIVALS } from '../src/ai.js';
import { Vehicle } from '../src/vehicle.js';
import { CAR_TYPES, CAR_ORDER, PAINTS, zeroTo100, topSpeed } from '../src/cars.js';
import { circleVs } from '../src/collide.js';

let fails = 0, n = 0;
const check = (ok, what) => { n++; if (!ok) { fails++; console.log('FAIL', what); } };
const section = (s) => console.log(`\n== ${s}`);
const DT = 1 / 60;
const run = (g, sec, inp = {}) => { for (let i = 0; i < Math.round(sec / DT); i++) g.step(DT, inp); };

section('the road');
const T = new Track();
check(T.L > 5500 && T.L < 6100, `length ${T.L.toFixed(0)} m`);
check(T.zones.finish - T.zones.start > 5300, 'start to finish is over 5.3 km');
let mono = true; for (let i = 1; i < T.n; i++) if (T.cum[i] <= T.cum[i - 1]) mono = false;
check(mono, 'distances grow along the road');
let maxGrade = 0; for (let i = 1; i < T.n; i++) maxGrade = Math.max(maxGrade, Math.abs(T.ys[i] - T.ys[i - 1]) / (T.cum[i] - T.cum[i - 1]));
check(maxGrade < 0.22, `grades stay under 22 % – the crests are the steepest (max ${(maxGrade * 100).toFixed(1)} %)`);
let minR = Infinity; for (let i = 0; i < T.n; i++) if (T.ks[i]) minR = Math.min(minR, 1 / Math.abs(T.ks[i]));
check(minR >= 54, `tightest bend ${minR.toFixed(0)} m radius (the landscape ribbon needs ≥ 54)`);
// the road never comes close to itself
let md = Infinity;
for (let i = 0; i < T.n; i += 4) for (let j = i + 1; j < T.n; j += 4) if (T.cum[j] - T.cum[i] > 300) md = Math.min(md, Math.hypot(T.xs[i] - T.xs[j], T.zs[i] - T.zs[j]));
check(md > 150, `separate parts of the road stay ${md.toFixed(0)} m apart`);
// the road is above the lake everywhere, the bridge is level
let dry = true; for (let i = 0; i < T.n; i++) if (T.ys[i] < WATER + 2.4) dry = false;
check(dry, 'the road is above the water everywhere');
const by0 = T.roadY(T.zones.bridge[0] + 5), by1 = T.roadY(T.zones.bridge[1] - 5);
check(Math.abs(by0 - by1) < 0.2, 'the bridge is level');
check(T.natural(-40, 2290) < WATER - 1, 'the lake is deep in the middle');
// ground height on the road = the road's height; the ground beside the road blends into the land
const P = {};
let worst = 0; for (let s = 0; s < T.L; s += 37) { T.pointAt(s, P); worst = Math.max(worst, Math.abs(T.groundHeight(P.x - P.dz * 2, P.z + P.dx * 2) - P.y)); }
check(worst < 0.05, `the ground on the asphalt is the road (worst ${worst.toFixed(3)} m)`);
check(T.surfaceAt(...(() => { T.beside(1000, 0, P); return [P.x, P.z]; })()) === 'road', 'the asphalt is road');
check(T.surfaceAt(...(() => { T.beside(1000, HW + 1, P); return [P.x, P.z]; })()) === 'gravel', 'the shoulder is gravel');
check(T.surfaceAt(...(() => { T.beside(1000, HW + 12, P); return [P.x, P.z]; })()) === 'grass', 'further out is grass');
check(T.nearest(...(() => { T.beside(2000, -3, P); return [P.x, P.z]; })()) && Math.abs(T.tmp.d + 3) < 0.05, 'nearest() finds the lateral offset (left is negative)');

section('the world along it');
const W = new World(T);
check(W.buildings.length > 120, `${W.buildings.length} buildings`);
check(W.trees.length > 3000, `${W.trees.length} trees`);
check(!!W.church, 'Mellby has its church');
check(W.buildings.some((b) => b.kind === 'barn') && W.buildings.some((b) => b.kind === 'stuga'), 'farms: barns and red cottages');
check(W.fields.length >= 8, `${W.fields.length} fields`);
check(W.rails.some((r) => r.bridge && r.side > 0) && W.rails.some((r) => r.bridge && r.side < 0), 'guardrails on both sides of the bridge');
// nothing solid on the road
const near = { s: 0, d: 0, i: 0, dist: 0 };
let onRoad = 0;
for (const b of W.buildings) {
  const sn = Math.sin(b.h), cs = Math.cos(b.h);
  for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]) {
    const x = b.x + cs * b.w / 2 * u + sn * b.d / 2 * v, z = b.z - sn * b.w / 2 * u + cs * b.d / 2 * v;
    if (T.nearest(x, z, near) && near.dist < HW + 1 && near.s > -5 && near.s < T.L) onRoad++;
  }
}
check(onRoad === 0, `no building stands on the road (${onRoad} corners do)`);
let treeOnRoad = 0; for (const t of W.trees) if (T.nearest(t.x, t.z, near) && near.dist < HW + 3) treeOnRoad++;
check(treeOnRoad === 0, `no tree on or right beside the road (${treeOnRoad})`);
let colOnRoad = 0; for (const c of W.colliders) { const x = c.t === 'circle' ? c.x : c.cx, z = c.t === 'circle' ? c.z : c.cz; if (T.nearest(x, z, near) && near.dist < HW - 0.5 && near.s > 0 && near.s < T.L) colOnRoad++; }
check(colOnRoad === 0, `no collider on the asphalt (${colOnRoad})`);

section('the cars (GTA 7 physics)');
check(CAR_ORDER.length === 3 && CAR_ORDER.every((k) => CAR_TYPES[k]), 'three cars to choose from');
for (const k of CAR_ORDER) {
  const S = CAR_TYPES[k];
  check(S.paints.length === 4 && S.paints.every((p) => PAINTS[p]), `${S.name}: four paints`);
  console.log(`  ${S.name}: 0–100 ${zeroTo100(S).toFixed(2)} s, top ${(topSpeed(S) * 3.6).toFixed(0)} km/h`);
}
check(topSpeed(CAR_TYPES.lo) > topSpeed(CAR_TYPES.falk) && topSpeed(CAR_TYPES.falk) > topSpeed(CAR_TYPES.svala), 'Lo > Falk > Svala in top speed');
check(CAR_TYPES.svala.grip > CAR_TYPES.falk.grip && CAR_TYPES.falk.grip > CAR_TYPES.lo.grip, 'Svala > Falk > Lo in grip');
// a straight run in the real world: flat out from the grid
{
  const g = new Game({ track: T, world: W, carType: 'falk', paint: 'bla', rivals: false, intro: 0.05 });
  run(g, 3.4);
  check(g.phase === 'race', 'countdown over');
  const s0 = g.player.dist;
  run(g, 6, { throttleAxis: 1, steerAxis: 0 });
  check(g.player.kmh > 140, `full throttle for 6 s: ${g.player.kmh.toFixed(0)} km/h`);
  check(g.player.dist - s0 > 150, 'and it went forward along the road');
  let minKmh = Infinity;
  for (let i = 0; i < 180; i++) { g.step(DT, { throttleAxis: -1, steerAxis: 0 }); minKmh = Math.min(minKmh, g.player.kmh); }
  check(minKmh < 3, 'brakes stop it');
  check(g.player.fwdSpeed < -1, 'and holding the brake reverses');
}
// the stick mode is GTA 7's: push up to drive, pull down to brake
{
  const g = new Game({ track: T, world: W, carType: 'svala', paint: 'gul', rivals: false, intro: 0.05 });
  run(g, 3.4);
  run(g, 3, { moveX: 0, moveY: 1, analog: true });
  check(g.player.kmh > 60, `stick up: ${g.player.kmh.toFixed(0)} km/h`);
  run(g, 0.6, { moveX: 1, moveY: 0.6, analog: true });
  check(g.player.w < -0.05, 'stick right turns right');
  // pedals mode
  g.settings.drive = 'pedals';
  run(g, 2, { gas: true, moveX: 0 });
  const v1 = g.player.kmh;
  run(g, 2, { brake: true });
  check(g.player.kmh < v1 - 40, 'pedals: GAS and BROMS work');
  g.settings.drive = 'stick';
}
// handbrake drift: the rear lets go
{
  const g = new Game({ track: T, world: W, carType: 'falk', paint: 'bla', rivals: false, intro: 0.05 });
  run(g, 3.4); run(g, 4, { throttleAxis: 1 });
  let maxSlip = 0;
  for (let i = 0; i < 40; i++) { g.step(DT, { throttleAxis: 1, steerAxis: 1, handbrake: true }); maxSlip = Math.max(maxSlip, g.player.slip); }
  check(maxSlip > 4, `handbrake + steer slides (${maxSlip.toFixed(1)} m/s sideways)`);
}
// grass is slower than asphalt
{
  const speedOn = (d) => { const v = new Vehicle('falk', 'bla', 0, 0, 0); v.driver = 'player'; const q = T.beside(900, d, {}); v.place(T, q.x, q.z, Math.atan2(q.dx, q.dz)); v.input.park = false; v.input.throttle = 1; for (let i = 0; i < 180; i++) v.step(DT, T); return v.speed; };
  check(speedOn(HW + 18) < speedOn(0) * 0.9, 'grass is slower than asphalt');
}
// the crests throw a fast car into the air
{
  const g = new Game({ track: T, world: W, carType: 'lo', paint: 'orange', rivals: false, intro: 0.05 });
  run(g, 3.4);
  const d = new Driver(g, g.player, { skill: 1, base: 0, dist: g.player.dist, player: true }); d.hold = false; g.player.auto = d;
  let jump = 0; g.on('land', (e) => { if (e.player) jump = Math.max(jump, e.dist); });
  for (let i = 0; i < 60 * 60 && g.player.dist < T.zones.bumps[0] + 120; i++) g.step(DT, {});
  check(jump > 15, `a jump over the first crest: ${jump.toFixed(0)} m`);
}

section('you stay in the car and out of the houses');
{
  const g = new Game({ track: T, world: W, carType: 'falk', paint: 'bla', rivals: false, intro: 0.05 });
  check(typeof g.player.exit !== 'function' && typeof g.exitCar !== 'function', 'there is no way out of the car');
  run(g, 3.4);
  // drive flat out straight into a house in Ekeby
  const b = W.buildings.find((b) => b.kind === 'block' && b.s > 150 && b.s < 400);
  const dir = Math.atan2(b.x - g.player.x, b.z - g.player.z);
  const q = { x: b.x - Math.sin(dir) * 25, z: b.z - Math.cos(dir) * 25 };
  g.player.place(g, q.x, q.z, dir);
  let inside = 0, hits = 0;
  g.on('crash', (e) => { if (e.player) hits++; });
  for (let i = 0; i < 240; i++) {
    g.step(DT, { throttleAxis: 1, steerAxis: 0 });
    const c = { t: 'obox', cx: b.x, cz: b.z, hx: b.w / 2, hz: b.d / 2, rot: b.h };
    if (circleVs(c, g.player.x, g.player.z, 0.05)) inside++;
  }
  check(hits > 0, 'driving into a house is a crash');
  check(inside === 0, 'and the car never gets inside it');
  check(g.player.driver === 'player', 'you are still driving');
}

section('the race');
{
  const g = new Game({ track: T, world: W, carType: 'svala', paint: 'gul' });
  check(g.vehicles.length === 6 && g.drivers.length === 5, 'six cars, five computer drivers');
  check(g.position === 6, 'you start last');
  check(RIVALS.every((r) => CAR_TYPES[r.type]), 'every rival drives one of the three cars');
  run(g, 1);
  check(g.phase === 'intro' && g.player.kmh < 1, 'the intro: nobody moves');
  const counts = []; g.on('count', (e) => counts.push(e.n)); let went = false; g.on('go', () => { went = true; });
  run(g, 1.6, { throttleAxis: 1 });
  check(g.player.kmh < 1, 'no false starts: the car is held on the grid');
  run(g, 3.4);
  check(counts.join() === '1,2,3' && went && g.phase === 'race', 'three red lights, then green');
  // the player on autopilot as a good driver
  const d = new Driver(g, g.player, { skill: 1.02, base: 2, dist: g.player.dist, player: true }); d.hold = false; g.player.auto = d;
  let t = 0;
  while (t < 260 && !g.vehicles.every((v) => v.finished)) { g.step(DT, {}); t += DT; }
  check(g.vehicles.every((v) => v.finished), 'all six reach the finish');
  check(g.drivers.every((dr) => dr.respawns <= 1), `the computer drivers keep on the road (respawns ${g.drivers.map((dr) => dr.respawns).join(',')})`);
  const st = g.standings();
  check(st.length === 6 && st.every((r, i) => i === 0 || r.time >= st[i - 1].time), 'the standings are in order of time');
  const winner = st[0].time, last = st[5].time;
  check(winner > 115 && winner < 160, `the winning time is ${winner.toFixed(1)} s`);
  check(last - winner < 25, `a close race: ${(last - winner).toFixed(1)} s from first to last`);
  check(g.phase === 'done' && g.player.finishPos >= 1, `you finished ${g.player.finishPos}:a`);
  console.log('  ' + st.map((r) => `${r.name} ${r.time.toFixed(1)}`).join(' · '));
}
// off the road too far, or in the lake → back on the road
{
  const g = new Game({ track: T, world: W, carType: 'falk', paint: 'bla', rivals: false, intro: 0.05 });
  run(g, 3.4);
  let resets = 0; g.on('reset', () => resets++);
  const q = T.beside(1000, LIMIT + 15, {});
  g.player.place(g, q.x, q.z, 0); g.player.dist = 1000;
  run(g, 2);
  check(resets === 1, 'too far from the road: put back on it');
  check(Math.abs(T.project(g.player.x, g.player.z, 1000) - 990) < 20 && T.lastDist < 3, 'in your lane, a little behind where you were');
  g.player.place(g, -40 + 120, 2290, 0); g.player.y = WATER - 2; g.player.dist = (T.zones.bridge[0] + T.zones.bridge[1]) / 2;
  run(g, 1.2);
  check(resets === 2, 'in the lake: back on the road');
  // the button
  run(g, 3);
  g.step(DT, { reset: true });
  check(resets === 3, 'TILLBAKA puts you on the road');
  g.step(DT, { reset: true });
  check(resets === 3, 'but not twice in a row');
}
// wrong way
{
  const g = new Game({ track: T, world: W, carType: 'falk', paint: 'bla', rivals: false, intro: 0.05 });
  run(g, 3.4);
  const q = T.beside(1500, 2, {});
  g.player.place(g, q.x, q.z, Math.atan2(-q.dx, -q.dz)); g.player.dist = 1500;
  run(g, 3, { throttleAxis: 1 });
  check(g.wrongWay, 'driving back toward Ekeby: FEL HÅLL');
}

section('the online leaderboard (Supabase, faked here)');
{
  const LB = await import('../src/leaderboard.js');
  check(LB.cleanName('  Kalle \n  Anka  ') === 'Kalle Anka', 'names are tidied');
  check(LB.cleanName('x'.repeat(30)).length === 16, 'names are cut at 16 characters');
  const calls = [];
  const rows = [{ id: 1, name: 'Tord', car: 'lo', time_ms: 131000 }, { id: 2, name: 'Sonja', car: 'falk', time_ms: 140500 }];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const u = new URL(url), h = opts.headers || {};
    if (opts.method === 'POST') { const r = { id: rows.length + 1, ...JSON.parse(opts.body) }; rows.push(r); return new Response(JSON.stringify([r]), { status: 201 }); }
    let list = rows.slice().sort((a, b) => a.time_ms - b.time_ms);
    const car = u.searchParams.get('car'), lt = u.searchParams.get('time_ms');
    if (car) list = list.filter((r) => r.car === car.slice(3));
    if (lt) list = list.filter((r) => r.time_ms < Number(lt.slice(3)));
    const headers = h.Prefer === 'count=exact' ? { 'content-range': `0-0/${list.length}` } : {};
    return new Response(JSON.stringify(list.slice(0, Number(u.searchParams.get('limit') || 10))), { status: 200, headers });
  };
  const top = await LB.fetchTop();
  check(top.length === 2 && top[0].name === 'Tord', 'the list comes back fastest first');
  check(calls[0].url.includes('/rest/v1/riksvag7_highscores') && calls[0].opts.headers.apikey.startsWith('sb_publishable_'), 'it asks the riksvag7_highscores table with the publishable key (as cityguess does)');
  check(calls[0].url.includes('order=time_ms.asc'), 'ordered by time, lowest first');
  const row = await LB.submit({ name: ' Jimmy ', car: 'svala', timeMs: 135400.4, position: 2, version: '1.1' });
  const sent = JSON.parse(calls[calls.length - 1].opts.body);
  check(row.id === 3 && sent.name === 'Jimmy' && sent.time_ms === 135400 && sent.car === 'svala' && sent.position === 2, 'a finished race is saved with name, car, time in ms and position');
  const rk = await LB.rankOf(135400);
  check(rk && rk.rank === 2 && rk.total === 3, `ranked ${rk && rk.rank} of ${rk && rk.total} overall`);
  const rkc = await LB.rankOf(135400, 'svala');
  check(rkc && rkc.rank === 1 && rkc.total === 1, 'and first with the Svala');
  let refused = 0;
  for (const bad of [{ name: '', car: 'lo', timeMs: 130000 }, { name: 'A', car: 'buss', timeMs: 130000 }, { name: 'A', car: 'lo', timeMs: 50000 }]) { try { await LB.submit(bad); } catch (_) { refused++; } }
  check(refused === 3, 'no name, an unknown car or an impossible time is refused before it is sent');
  globalThis.fetch = async () => new Response('nope', { status: 503 });
  let threw = false; try { await LB.fetchTop(); } catch (_) { threw = true; }
  check(threw, 'a server error shows up as an error (the game then says it could not reach the list)');
}

console.log(fails ? `\n${fails} of ${n} checks failed` : `\nAll checks passed (${n})`);
process.exit(fails ? 1 : 0);
