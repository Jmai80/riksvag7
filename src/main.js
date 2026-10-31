// Riksväg 7: the game loop and the screens (title → car picker → race → results), wired to the
// simulation (game.js), the view (render.js), the HUD, the input and the sound.
import { Track } from './track.js';
import { Course, COURSES, COURSE_IDS } from './course.js';
import { World } from './world.js';
import { Game } from './game.js';
import { View } from './render.js';
import { Hud, fmtTime } from './hud.js';
import { Input } from './input.js';
import { AudioFX } from './audio.js';
import { Vehicle } from './vehicle.js';
import { TitleCam } from './titlecam.js';
import { CAR_TYPES, CAR_ORDER, PAINTS, zeroTo100, topSpeed } from './cars.js';
import { smooth } from './rng.js';
import { fetchTop, submit, rankOf, cleanName, MIN_MS, MAX_MS } from './leaderboard.js';

export const VERSION = '1.4';
const $ = (id) => document.getElementById(id);
const DT = 1 / 60;

// ------------------------------------------------------------------ settings and best times
const settings = (() => {
  const def = { sound: true, drive: 'stick', cam: 'far', quality: 'auto', car: 'svala', paint: {}, name: '', course: 1 };
  try { return { ...def, ...JSON.parse(localStorage.getItem('riksvag7-settings') || '{}') }; } catch (_) { return def; }
})();
const save = () => { try { localStorage.setItem('riksvag7-settings', JSON.stringify(settings)); } catch (_) { /* storage blocked */ } };
// best times per course and car: { 1: { svala: 138.2 }, 2: { … } } (1.2 and earlier kept { svala: 138.2 }, all on course 1)
const best = (() => {
  let b = {};
  try { b = JSON.parse(localStorage.getItem('riksvag7-best') || '{}') || {}; } catch (_) { /* fresh start */ }
  const out = {};
  for (const id of COURSE_IDS) out[id] = {};
  for (const [k, v] of Object.entries(b)) {
    if (typeof v === 'number') out[1][k] = v;                    // the old format
    else if (out[k] && v && typeof v === 'object') Object.assign(out[k], v);
  }
  return out;
})();
const saveBest = () => { try { localStorage.setItem('riksvag7-best', JSON.stringify(best)); } catch (_) { /* storage blocked */ } };

let track, world, view, hud, input, audio, titleCam;
const courses = {};
const course = () => courses[settings.course] || courses[1];
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
  if (!COURSES[settings.course]) settings.course = 1;
  for (const id of COURSE_IDS) courses[id] = new Course(track, id);
  setLoad(0.2, 'Bygger hus och planterar skog…'); await frame();
  world = new World(track);
  titleCam = new TitleCam(track, world);
  setLoad(0.4, 'Lackar bilarna…'); await frame();
  view = new View($('c'), track, world, settings.quality);
  view.rig.mode = settings.cam;
  setLoad(0.8, 'Värmer däcken…'); await frame();
  hud = new Hud(track);
  audio = new AudioFX();
  audio.muted = !settings.sound;
  input = new Input($('game'), { stickEl: $('stick'), knobEl: $('knob'), onKind: (k) => setKind(k) });
  setKind(input.lastKind);
  // compile the shaders with the car picker's view, by day and by evening, so the first frames don't stutter
  const keep = settings.course;
  for (const id of [...COURSE_IDS].reverse()) {
    settings.course = id;
    showPicker(true);
    view.renderer.compile(view.scene, view.camera);
  }
  settings.course = keep;
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
  $('board').hidden = true;
  endRace();
  show('title');
  const recs = COURSE_IDS.map((id) => [id, Math.min(...Object.values(best[id]))]).filter((r) => isFinite(r[1]));
  $('titleBest').textContent = recs.length ? `Dina rekord: ${recs.map(([id, t]) => `${COURSES[id].short} ${fmtTime(t)}`).join(' · ')}` : 'Ekeby–Sjuby på under 2:20? Prova!';
  view.setMood('day'); view.scenery.setCourse(1);
  view.setCars([]);
  titleCam.enter();
  view.rig.blendT = 1;
}

function toSelect() {
  state = 'select'; paused = false;
  $('board').hidden = true;
  endRace();
  show('select');
  audio.init(); audio.click();
  showPicker();
}

function endRace() {
  game = null; finishT = -1;
  audio.reset();
  input.enabled = false; input.releaseAll();
  audio.horn(false);
}

// the car picker: the car on the road just past the start (Ekeby by day, Sjuby in the evening),
// the camera circling it
function showPicker(quiet = false) {
  const type = settings.car, C = course();
  const paint = settings.paint[type] || CAR_TYPES[type].paints[0];
  const p = C.pointAt(C.zones.start + 60, {});
  showCar = new Vehicle(type, paint, p.x, p.z, Math.atan2(p.dx, p.dz));
  showCar.place(track, p.x, p.z, Math.atan2(p.dx, p.dz));
  showCar.plate = C.info.plate;
  view.setMood(C.info.mood);
  view.scenery.setCourse(C.id);
  view.setCars([showCar]);
  view.attachHeadlights(showCar);
  if (quiet) return;
  for (const b of $('courses').children) {
    const on = Number(b.dataset.course) === C.id;
    b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
  }
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
  const rec = best[C.id][type];
  $('carBest').innerHTML = rec ? `Ditt rekord på ${C.info.short.toLowerCase()}: <b>${fmtTime(rec)}</b>` : `Inget rekord på ${C.info.short.toLowerCase()} än`;
}

function setPaint(key) {
  const c = view.cars.get(showCar);
  if (c) c.model.setPaint(key);
  showCar.paint = key;
  [...$('paints').children].forEach((b, i) => b.classList.toggle('on', CAR_TYPES[settings.car].paints[i] === key));
  $('paintName').textContent = PAINTS[key].name;
}

function setCourse(id) {
  if (!COURSES[id] || id === settings.course) return;
  settings.course = id; save();
  audio.whoosh();
  showPicker();
}

function cycleCar(d) {
  const i = CAR_ORDER.indexOf(settings.car);
  settings.car = CAR_ORDER[(i + d + CAR_ORDER.length) % CAR_ORDER.length];
  save(); audio.whoosh();
  showPicker();
}

// ------------------------------------------------------------------ the race
function startRace() {
  $('board').hidden = true;
  const type = settings.car, paint = settings.paint[type] || CAR_TYPES[type].paints[0], C = course();
  audio.init();
  audio.reset();
  game = new Game({ track: C, world, carType: type, paint, settings });
  game.course = C.id;
  game.player.plate = C.info.plate;
  view.setMood(C.info.mood);
  view.scenery.setCourse(C.id);
  view.setCars(game.vehicles);
  view.attachHeadlights(game.player);
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
    audio.finish(e.pos === 1);        // the engines fade, a happy little tune
    finishT = 2.6;
  });
}
let lastPos = 6;

function showResults() {
  state = 'results';
  const p = game.player, pos = p.finishPos, t = p.finishTime, type = p.type, C = COURSES[game.course], B = best[C.id];
  const rec = !B[type] || t < B[type];
  if (rec) { B[type] = t; saveBest(); }
  $('rCourse').textContent = `${C.short} · ${C.name}`.toUpperCase();
  $('rCourse').className = `resCourse ${C.mood}`;
  $('rPos').textContent = ordinal(pos);
  $('rText').textContent = pos === 1 ? 'VINST! 🏆' : pos === 2 ? 'ANDRA PLATS' : pos === 3 ? 'PALLPLATS' : 'I MÅL';
  $('rTime').innerHTML = `Din tid: ${fmtTime(t)}${rec ? ' · <span class="rec">Nytt rekord!</span>' : ` · Rekord: ${fmtTime(B[type])}`}`;
  const st = game.standings();
  $('rTable').innerHTML = st.map((r, i) => `<tr class="${r.player ? 'me' : ''}"><td>${i + 1}</td><td>${r.player ? 'Du' : r.name} <small>${CAR_TYPES[r.type].name}</small></td><td>${r.est ? '≈' : ''}${fmtTime(r.time)}</td></tr>`).join('');
  // the online leaderboard: your name from last time, one save per race
  const ms = Math.round(t * 1000), ok = ms >= MIN_MS && ms <= MAX_MS;
  $('saveBox').hidden = false;
  $('pName').value = settings.name || '';
  $('pName').disabled = !ok;
  $('pSave').disabled = !ok; $('pSave').textContent = 'SPARA TID';
  setSaveMsg(ok ? 'Spara tiden så syns den för alla som spelar.' : 'Den här tiden kan inte sparas i topplistan.', '');
  savedId = null;
  $('results').hidden = false;
  audio.lounge(true);                 // a calm tune while you look at the time and save it
  input.enabled = false; input.releaseAll();
}

// ------------------------------------------------------------------ the online leaderboard
let savedId = null, boardCar = '', boardTrack = 1, boardSeq = 0;
// Supabase can only be reached from the real site (the copy inside Claude may not call other hosts)
const offlineMsg = () => (/github\.io$|localhost|127\.0\.0\.1/.test(location.hostname) ? 'Topplistan gick inte att nå just nu.' : 'Topplistan nås från spelet på jmai80.github.io/riksvag7.');
const ordinal = (n) => `${n}:${n % 10 === 1 || n % 10 === 2 ? (n % 100 === 11 || n % 100 === 12 ? 'e' : 'a') : 'e'}`;
function setSaveMsg(text, kind) { const m = $('saveMsg'); m.textContent = text; m.className = kind || ''; }

async function saveTime() {
  if (!game || !game.player.finished || savedId) return;
  const name = cleanName($('pName').value);
  if (!name) { setSaveMsg('Skriv ditt namn först.', 'err'); $('pName').focus(); return; }
  settings.name = name; save();
  const p = game.player, timeMs = Math.round(p.finishTime * 1000), car = p.type, trackId = game.course;
  $('pSave').disabled = true; $('pSave').textContent = 'SPARAR…';
  try {
    const row = await submit({ name, car, timeMs, position: p.finishPos, version: VERSION, track: trackId });
    savedId = row && row.id;
    $('pSave').textContent = 'SPARAT ✓'; $('pName').disabled = true;
    audio.click();
    let msg = 'Sparat!';
    try {
      const [all, mine] = await Promise.all([rankOf(timeMs, trackId), rankOf(timeMs, trackId, car)]);
      if (all) msg = `Sparat! Du är ${ordinal(all.rank)} av ${all.total} på ${COURSES[trackId].short.toLowerCase()}`;
      if (all && mine) msg += ` och ${ordinal(mine.rank)} av ${mine.total} med ${CAR_TYPES[car].name}`;
      if (all) msg += '.';
    } catch (_) { /* the rank is a bonus */ }
    setSaveMsg(msg, 'ok');
  } catch (e) {
    $('pSave').disabled = false; $('pSave').textContent = 'SPARA TID';
    setSaveMsg(/github\.io$|localhost|127\.0\.0\.1/.test(location.hostname) ? 'Topplistan gick inte att nå just nu. Försök igen om en stund.' : offlineMsg(), 'err');
    console.warn('topplistan', e);
  }
}

function openBoard(car = '', trackId = settings.course) {
  $('board').hidden = false;
  showBoard(car, trackId);
}

async function showBoard(car, trackId = boardTrack) {
  boardCar = car; boardTrack = COURSES[trackId] ? trackId : 1;
  const seq = ++boardSeq;
  for (const b of $('bChips').children) b.classList.toggle('on', b.dataset.car === car);
  for (const b of $('bTracks').children) b.classList.toggle('on', Number(b.dataset.track) === boardTrack);
  const list = $('bList'), msg = $('bMsg');
  list.innerHTML = ''; msg.textContent = 'Hämtar topplistan…';
  try {
    const rows = await fetchTop(boardTrack, car || null, 10);
    if (seq !== boardSeq) return;
    msg.textContent = rows.length ? '' : 'Inga tider än – bli först!';
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      if (savedId && r.id === savedId) li.className = 'me';
      const b = document.createElement('b'); b.textContent = String(i + 1);
      const sp = document.createElement('span'); sp.textContent = r.name;
      const sm = document.createElement('small'); sm.textContent = CAR_TYPES[r.car] ? CAR_TYPES[r.car].name : r.car;
      sp.appendChild(sm);
      const em = document.createElement('em'); em.textContent = fmtTime(r.time_ms / 1000);
      li.append(b, sp, em);
      list.appendChild(li);
    });
  } catch (e) {
    if (seq !== boardSeq) return;
    msg.textContent = offlineMsg();
    console.warn('topplistan', e);
  }
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
  on('topBtn', () => { audio.init(); audio.click(); openBoard('', settings.course); });
  on('rBoard', () => openBoard(game ? game.player.type : '', game ? game.course : settings.course));
  on('bClose', () => { $('board').hidden = true; });
  on('pSave', () => saveTime());
  $('pName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('pName').blur(); saveTime(); } });
  for (const b of $('bChips').children) b.addEventListener('click', () => showBoard(b.dataset.car));
  for (const b of $('bTracks').children) b.addEventListener('click', () => showBoard(boardCar, Number(b.dataset.track)));
  for (const b of $('courses').children) b.addEventListener('click', (e) => { e.preventDefault(); setCourse(Number(b.dataset.course)); });
  on('rAgain', () => { $('results').hidden = true; startRace(); });
  on('rCars', () => { $('results').hidden = true; toSelect(); });
  // swipe on the picker's 3D view to change car
  let sx = null;
  $('game').addEventListener('pointerdown', (e) => { if (state === 'select' && !e.target.closest('.selCard, .selTop, .courses')) sx = e.clientX; });
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
    if (inp.ok && $('board').hidden) toSelect();
  }
  if (paused) { if (draw) view.render(); return; }

  // the camera
  const rig = view.rig, aspect = view.camera.aspect;
  const camWorld = { raycast: (a, b, c, d, e) => world.grid.raycast(a, b, c, d, e), groundAt: (x, z) => track.height(x, z) };
  if (state === 'title') {
    // the flight along the road, sweeping from side to side over the land (titlecam.js); upright
    // phones tilt down a little more, so the land shows above the road sign
    const c = titleCam.update(dt), portrait = aspect < 0.9;
    rig.pos.set(c.pos.x, c.pos.y, c.pos.z);
    rig.look.set(c.look.x, c.look.y - (portrait ? 10 : 3), c.look.z);
    rig.apply(dt, portrait ? 64 : 54);
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
  setVeil(state === 'title' ? titleCam.veil : 0);
  view.sync(state === 'race' || state === 'results' ? game : null, dt);
  if (state === 'select' && showCar) view.syncCars(dt);
  if (game && (state === 'race' || state === 'results')) { audio.update(dt, game, view); hud.update(dt, game, view); }
  else if (audio.ctx) audio.update(dt, null, view);
  if (draw) view.render();
  if (!MANUAL) autoQuality(dt);
}

// the title flight fades through black where it starts over
let veilOp = -1;
function setVeil(v) {
  const q = Math.round(v * 50) / 50;
  if (q !== veilOp) { veilOp = q; $('veil').style.opacity = String(q); }
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
  get game() { return game; }, get state() { return state; }, get audio() { return audio; }, get view() { return view; }, get track() { return track; }, get world() { return world; },
  get course() { return course(); }, courses, best, get titleCam() { return titleCam; },
  settings, toSelect, startRace, pause, showResults, setCar: (t) => { settings.car = t; showPicker(); }, setPaint, setCourse,
  smooth, openBoard, saveTime,
  // run the game for a while without drawing, then draw one frame (manual mode)
  run(sec, step = 1 / 30, draw = true) { const n = Math.round(sec / step); for (let i = 0; i < n; i++) tick(step, draw && i === n - 1); },
  // step until cond() holds (or maxSec of game time), then draw one frame
  until(cond, maxSec = 200, step = 1 / 60) { for (let i = 0; i < maxSec / step; i++) { if (cond()) break; tick(step, false); } tick(step, true); return cond(); },
};

boot().catch((e) => { $('loadMsg').textContent = `Något gick fel: ${e.message}`; console.error(e); });
