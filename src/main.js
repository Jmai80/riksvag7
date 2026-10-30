// Riksväg 7: the game loop and the screens (title → car picker → race → results), wired to the
// simulation (game.js), the view (render.js), the HUD, the input and the sound.
import { Track } from './track.js';
import { World } from './world.js';
import { Game } from './game.js';
import { View } from './render.js';
import { Hud, fmtTime } from './hud.js';
import { Input } from './input.js';
import { AudioFX } from './audio.js';
import { Vehicle } from './vehicle.js';
import { CAR_TYPES, CAR_ORDER, PAINTS, zeroTo100, topSpeed } from './cars.js';
import { smooth } from './rng.js';

export const VERSION = '1.0';
const $ = (id) => document.getElementById(id);
const DT = 1 / 60;

// ------------------------------------------------------------------ settings and best times
const settings = (() => {
  const def = { sound: true, drive: 'stick', cam: 'far', quality: 'auto', car: 'svala', paint: {} };
  try { return { ...def, ...JSON.parse(localStorage.getItem('riksvag7-settings') || '{}') }; } catch (_) { return def; }
})();
const save = () => { try { localStorage.setItem('riksvag7-settings', JSON.stringify(settings)); } catch (_) { /* storage blocked */ } };
const best = (() => { try { return JSON.parse(localStorage.getItem('riksvag7-best') || '{}'); } catch (_) { return {}; } })();
const saveBest = () => { try { localStorage.setItem('riksvag7-best', JSON.stringify(best)); } catch (_) { /* storage blocked */ } };

let track, world, view, hud, input, audio;
let game = null;
let state = 'loading';          // loading | title | select | race | results
let paused = false;
let acc = 0, last = 0, time = 0;
let showCar = null;
let finishT = -1;

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const setLoad = (k, msg) => { $('loadbar').firstElementChild.style.width = `${Math.round(k * 100)}%`; if (msg) $('loadMsg').textContent = msg; };

async function boot() {
  setLoad(0.05, 'Drar vägen…'); await frame();
  track = new Track();
  setLoad(0.2, 'Bygger hus och planterar skog…'); await frame();
  world = new World(track);
  setLoad(0.4, 'Lackar bilarna…'); await frame();
  view = new View($('c'), track, world, settings.quality);
  view.rig.mode = settings.cam;
  setLoad(0.8, 'Värmer däcken…'); await frame();
  hud = new Hud(track);
  audio = new AudioFX();
  audio.muted = !settings.sound;
  input = new Input($('game'), { stickEl: $('stick'), knobEl: $('knob'), onKind: (k) => setKind(k) });
  setKind(input.lastKind);
  // compile the shaders with the car picker's view, so the first frames don't stutter
  showPicker(true);
  view.renderer.compile(view.scene, view.camera);
  setLoad(1, 'Klart!'); await frame();
  $('loading').hidden = true;
  wireUi();
  toTitle();
  window.addEventListener('resize', () => view.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'race' && !paused) pause(true); });
  last = performance.now();
  requestAnimationFrame(loop);
}

function setKind(k) {
  $('game').classList.toggle('keys', k === 'keys');
  const help = k === 'keys'
    ? 'Kör med <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> eller pilarna, <kbd>Space</kbd> handbroms, <kbd>R</kbd> tillbaka på vägen, <kbd>Esc</kbd> paus.'
    : 'Dra tummen på vänstra halvan: uppåt är gas, nedåt broms, åt sidorna styr du. Handbromsen sitter till höger.';
  $('titleHelp').innerHTML = help;
}

// ------------------------------------------------------------------ screens
function show(id) { for (const s of ['title', 'select', 'hud', 'pausemenu', 'results']) $(s).hidden = s !== id && !(id === 'pausemenu' && s === 'hud'); }

function toTitle() {
  state = 'title'; paused = false;
  endRace();
  show('title');
  const b = Object.entries(best).sort((a, c) => a[1] - c[1])[0];
  $('titleBest').textContent = b ? `Bästa tid: ${fmtTime(b[1])} (${CAR_TYPES[b[0]].name})` : 'Ekeby–Sjuby på under 2:20? Prova!';
  view.setCars([]);
  view.rig.blendT = 1;
}

function toSelect() {
  state = 'select'; paused = false;
  endRace();
  show('select');
  audio.init(); audio.click();
  showPicker();
}

function endRace() {
  game = null; finishT = -1;
  input.enabled = false; input.releaseAll();
  audio.horn(false);
}

// the car picker: the car on the road in Ekeby, the camera circling it
function showPicker(quiet = false) {
  const type = settings.car;
  const paint = settings.paint[type] || CAR_TYPES[type].paints[0];
  const s = track.zones.start + 60;
  const p = track.pointAt(s, {});
  showCar = new Vehicle(type, paint, p.x, p.z, Math.atan2(p.dx, p.dz));
  showCar.place(track, p.x, p.z, Math.atan2(p.dx, p.dz));
  showCar.plate = 'RIK 007';
  view.setCars([showCar]);
  if (quiet) return;
  const S = CAR_TYPES[type];
  $('carName').textContent = S.name; $('carKind').textContent = S.kind; $('carBlurb').textContent = S.blurb;
  const top = topSpeed(S) * 3.6, acc0 = zeroTo100(S);
  $('vTop').textContent = `${Math.round(top)} km/h`; $('stTop').style.width = `${((top - 140) / 50) * 100}%`;
  $('vAcc').textContent = `${acc0.toFixed(1).replace('.', ',')} s`; $('stAcc').style.width = `${((3.2 - acc0) / 1.2) * 100}%`;
  $('vGrip').textContent = ['', 'Bra', 'Mycket bra', 'Bäst'][S.stats.handling > 0.9 ? 3 : S.stats.handling > 0.7 ? 2 : 1];
  $('stGrip').style.width = `${S.stats.handling * 100}%`;
  CAR_ORDER.forEach((k, i) => $('pips').children[i].classList.toggle('on', k === type));
  const P = $('paints');
  P.innerHTML = '';
  for (const key of S.paints) {
    const b = document.createElement('button');
    b.type = 'button'; b.style.background = `#${PAINTS[key].hex.toString(16).padStart(6, '0')}`;
    b.setAttribute('aria-label', PAINTS[key].name);
    b.classList.toggle('on', key === paint);
    b.addEventListener('click', () => { settings.paint[type] = key; save(); audio.click(); setPaint(key); });
    P.appendChild(b);
  }
  $('paintName').textContent = PAINTS[paint].name;
  $('carBest').innerHTML = best[type] ? `Ditt rekord: <b>${fmtTime(best[type])}</b>` : 'Inget rekord än';
}

function setPaint(key) {
  const c = view.cars.get(showCar);
  if (c) c.model.setPaint(key);
  showCar.paint = key;
  [...$('paints').children].forEach((b, i) => b.classList.toggle('on', CAR_TYPES[settings.car].paints[i] === key));
  $('paintName').textContent = PAINTS[key].name;
}

function cycleCar(d) {
  const i = CAR_ORDER.indexOf(settings.car);
  settings.car = CAR_ORDER[(i + d + CAR_ORDER.length) % CAR_ORDER.length];
  save(); audio.whoosh();
  showPicker();
}

// ------------------------------------------------------------------ the race
function startRace() {
  const type = settings.car, paint = settings.paint[type] || CAR_TYPES[type].paints[0];
  audio.init();
  game = new Game({ track, world, carType: type, paint, settings });
  game.player.plate = 'RIK 007';
  view.setCars(game.vehicles);
  hud.setup(game);
  state = 'race'; paused = false; finishT = -1;
  show('hud');
  $('game').classList.toggle('pedals', settings.drive === 'pedals');
  $('muted').hidden = settings.sound;
  input.enabled = true;
  view.rig.orbitA = game.player.h - 0.5;   // start in front of you, on the outside of the grid
  view.rig.blendT = 1;
  lastPos = game.position;
  game.on('count', (e) => { hud.banner(String(4 - e.n), '', 0.9); audio.beep(false); });
  game.on('go', () => { hud.banner('KÖR!', 'go', 1.0); audio.beep(true); });
  game.on('phase', (e) => { if (e.phase === 'countdown') view.rig.startBlend(1.3); });
  game.on('crash', (e) => {
    if (!e.player) return;
    audio.crash(e.impact);
    view.rig.shake = Math.min(0.6, e.impact * 0.04);
    if (e.impact > 5) view.sparks(e.x, game.player.y + 0.5, e.z, Math.min(24, e.impact * 2) | 0);
  });
  game.on('land', (e) => { if (e.player) { audio.land(e.impact); view.rig.shake = Math.min(0.5, e.impact * 0.05); if (e.dist > 18) hud.toast(`Hopp: ${Math.round(e.dist)} m!`, 1.6); } });
  game.on('horn', (e) => audio.horn(e.on));
  game.on('reset', (e) => { hud.toast(e.auto ? 'Tillbaka på vägen' : 'Tillbaka på vägen', 1.4); view.rig.startBlend(0.5); });
  game.on('rivalFinish', (e) => { if (!game.player.finished && e.pos === 1) hud.toast(`${e.car.name} gick i mål först!`, 2.2); });
  game.on('finish', (e) => {
    hud.banner('MÅL!', 'fin', 2.4);
    audio.fanfare(e.pos === 1);
    finishT = 2.6;
  });
}
let lastPos = 6;

function showResults() {
  state = 'results';
  const p = game.player, pos = p.finishPos, t = p.finishTime, type = p.type;
  const rec = !best[type] || t < best[type];
  if (rec) { best[type] = t; saveBest(); }
  $('rPos').textContent = `${pos}:a`;
  $('rText').textContent = pos === 1 ? 'VINST! 🏆' : pos === 2 ? 'ANDRA PLATS' : pos === 3 ? 'PALLPLATS' : 'I MÅL';
  $('rTime').innerHTML = `Din tid: ${fmtTime(t)}${rec ? ' · <span class="rec">Nytt rekord!</span>' : ` · Rekord: ${fmtTime(best[type])}`}`;
  const st = game.standings();
  $('rTable').innerHTML = st.map((r, i) => `<tr class="${r.player ? 'me' : ''}"><td>${i + 1}</td><td>${r.player ? 'Du' : r.name} <small>${CAR_TYPES[r.type].name}</small></td><td>${r.est ? '≈' : ''}${fmtTime(r.time)}</td></tr>`).join('');
  $('results').hidden = false;
  input.enabled = false; input.releaseAll();
}

function pause(on) {
  if (state !== 'race') return;
  paused = on;
  $('pausemenu').hidden = !on;
  if (on) { input.releaseAll(); audio.suspend(); refreshMenu(); } else { audio.resume(); last = performance.now(); }
}

const QLABEL = { auto: 'Auto', pretty: 'Snygg', saver: 'Snabb' };
function refreshMenu() {
  $('mDrive').textContent = `Körkontroll: ${settings.drive === 'pedals' ? 'Pedaler (GAS/BROMS)' : 'Spak'}`;
  $('mCam').textContent = `Kamera: ${settings.cam === 'near' ? 'Nära' : 'Bakom'}`;
  $('mSound').textContent = `Ljud: ${settings.sound ? 'På' : 'Av'}`;
  $('mQuality').textContent = `Grafik: ${QLABEL[settings.quality]}`;
  $('mHelp').innerHTML = settings.drive === 'pedals'
    ? 'Pedaler: styr med tummen till vänster, gasa och bromsa med knapparna till höger.'
    : 'Spak: dra tummen uppåt för gas, nedåt för broms och back, åt sidorna för att styra.';
  $('muted').hidden = settings.sound;
}

function wireUi() {
  const on = (id, f) => $(id).addEventListener('click', (e) => { e.preventDefault(); f(); });
  on('play', () => toSelect());
  on('selBack', () => { audio.click(); toTitle(); });
  on('prevCar', () => cycleCar(-1));
  on('nextCar', () => cycleCar(1));
  on('go', () => startRace());
  on('mResume', () => pause(false));
  on('mRestart', () => { $('pausemenu').hidden = true; audio.resume(); startRace(); });
  on('mCars', () => { $('pausemenu').hidden = true; audio.resume(); toSelect(); });
  on('mMenu', () => { $('pausemenu').hidden = true; audio.resume(); toTitle(); });
  on('mDrive', () => { settings.drive = settings.drive === 'pedals' ? 'stick' : 'pedals'; $('game').classList.toggle('pedals', settings.drive === 'pedals'); save(); refreshMenu(); });
  on('mCam', () => { settings.cam = settings.cam === 'near' ? 'far' : 'near'; view.rig.mode = settings.cam; save(); refreshMenu(); });
  on('mSound', () => toggleSound());
  on('mQuality', () => { const o = ['auto', 'pretty', 'saver']; settings.quality = o[(o.indexOf(settings.quality) + 1) % 3]; view.applyQuality(settings.quality); save(); refreshMenu(); });
  on('muted', () => toggleSound());
  on('rAgain', () => { $('results').hidden = true; startRace(); });
  on('rCars', () => { $('results').hidden = true; toSelect(); });
  // swipe on the picker's 3D view to change car
  let sx = null;
  $('game').addEventListener('pointerdown', (e) => { if (state === 'select' && !e.target.closest('.selCard, .selTop')) sx = e.clientX; });
  window.addEventListener('pointerup', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 50) cycleCar(e.clientX < sx ? 1 : -1); sx = null; });
}

function toggleSound() {
  settings.sound = !settings.sound; save();
  audio.init(); audio.setMuted(!settings.sound);
  refreshMenu();
  if (hud) hud.toast(settings.sound ? 'Ljud på' : 'Ljud av', 1.2);
}

// ------------------------------------------------------------------ the loop
const perf = { t: 0, n: 0, low: 0, steps: 0 };
const MANUAL = new URLSearchParams(location.search).has('manual');   // tests drive the clock themselves
function loop(now) {
  if (MANUAL) return;
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) return;
  tick(Math.min(dt, 0.1), true);
}

function tick(dt, draw) {
  time += dt;
  const inp = input.read();
  if (inp.mute) toggleSound();
  if (state === 'race') {
    if (inp.pause) pause(!paused);
    if (inp.cam) { settings.cam = settings.cam === 'near' ? 'far' : 'near'; view.rig.mode = settings.cam; save(); }
    if (!paused) {
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 6) {
        game.step(DT, inp);
        inp.reset = false; inp.pause = false;
        acc -= DT; n++;
      }
      if (n >= 6) acc = 0;
      if (game.position < lastPos && game.phase === 'race' && game.raceTime > 3) { const b = $('posBox'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
      lastPos = game.position;
      if (finishT > 0 && (finishT -= dt) <= 0) showResults();
    }
  } else if (state === 'results') {
    acc += dt;
    while (acc >= DT) { game.step(DT, {}); acc -= DT; }
  } else if (state === 'select') {
    if (inp.ok) startRace();
  } else if (state === 'title') {
    if (inp.ok) toSelect();
  }
  if (paused) { if (draw) view.render(); return; }

  // the camera
  const rig = view.rig, aspect = view.camera.aspect;
  const camWorld = { raycast: (a, b, c, d, e) => world.grid.raycast(a, b, c, d, e), groundAt: (x, z) => track.height(x, z) };
  if (state === 'title') {
    // a slow drive along the road, high and to the side
    const s = 300 + ((time * 14) % (track.L - 700));
    const p = track.beside(s, -16, {}), q = track.beside(s + 70, 2, {});
    const y = Math.max(track.height(p.x, p.z), p.y) + 13;
    rig.pos.set(p.x, y, p.z);
    rig.look.set(q.x, q.y + 2, q.z);
    rig.apply(dt, aspect < 0.9 ? 62 : 52);
  } else if (state === 'select') {
    const portrait = aspect < 0.9, low = !portrait && innerHeight < 560;
    rig.orbit(dt, showCar.x, showCar.y + (portrait ? -1.6 : low ? 0 : -0.45), showCar.z, portrait ? 12.5 : low ? 8.5 : 7.4, portrait ? 3.2 : 1.9, 0.22, portrait ? 50 : 40, 0, low ? 2.4 : 0);
  } else if (game) {
    const p = game.player;
    if (game.phase === 'intro') {
      rig.orbit(dt, p.x, p.y + 0.2, p.z, aspect < 0.9 ? 12 : 10, 4.2, -0.45, aspect < 0.9 ? 58 : 46, 2.0);
      rig.minY = 0;
    } else if (state === 'results' || (game.phase === 'done' && finishT < 1.2)) {
      rig.orbit(dt, p.x, p.y, p.z, 8.5, 2.4, 0.3, aspect < 0.9 ? 60 : 46);
    } else {
      rig.chase(dt, p, aspect, inp, camWorld);
    }
  }
  view.sync(state === 'race' || state === 'results' ? game : null, dt);
  if (state === 'select' && showCar) view.syncCars(dt);
  if (game && (state === 'race' || state === 'results')) { audio.update(dt, game, view); hud.update(dt, game, view); }
  else if (audio.ctx) audio.update(dt, null, view);
  if (draw) view.render();
  if (!MANUAL) autoQuality(dt);
}

// keep the frame rate up on slow phones: lower the resolution, then the shadows
function autoQuality(dt) {
  if (settings.quality !== 'auto' || state !== 'race') return;
  perf.t += dt; perf.n++;
  if (perf.t < 2) return;
  const fps = perf.n / perf.t;
  perf.t = 0; perf.n = 0;
  if (fps < 42) {
    if (view.dpr > 1.01) view.setDpr(Math.max(1, view.dpr - 0.25));
    else if (view.sun.castShadow) view.sun.castShadow = false;
  } else if (fps > 57 && view.dpr < Math.min(window.devicePixelRatio || 1, view.dprMax) - 0.01 && ++perf.steps > 3) {
    perf.steps = 0; view.setDpr(Math.min(view.dprMax, view.dpr + 0.25));
  }
}

// for the browser tests
window.__rv = {
  get game() { return game; }, get state() { return state; }, get view() { return view; }, get track() { return track; }, get world() { return world; },
  settings, toSelect, startRace, pause, showResults, setCar: (t) => { settings.car = t; showPicker(); }, setPaint,
  smooth,
  // run the game for a while without drawing, then draw one frame (manual mode)
  run(sec, step = 1 / 30, draw = true) { const n = Math.round(sec / step); for (let i = 0; i < n; i++) tick(step, draw && i === n - 1); },
  // step until cond() holds (or maxSec of game time), then draw one frame
  until(cond, maxSec = 200, step = 1 / 60) { for (let i = 0; i < maxSec / step; i++) { if (cond()) break; tick(step, false); } tick(step, true); return cond(); },
};

boot().catch((e) => { $('loadMsg').textContent = `Något gick fel: ${e.message}`; console.error(e); });
