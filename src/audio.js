// All sound is synthesized with Web Audio (as in GTA 7) – no audio files. The engine now has
// gears: the revs climb through each one and drop at the shift, and each car has its own voice
// (a turbo four in the Svala, a straight six in the Falk, a V8 in the Lo).
import { topSpeed, GEARS } from './cars.js';

const VOICE = {
  svala: { f0: 36, fr: 175, sub: 0.15, grit: 0.55, turbo: true },
  falk: { f0: 32, fr: 150, sub: 0.3, grit: 0.4, turbo: false },
  lo: { f0: 26, fr: 128, sub: 0.6, grit: 0.75, turbo: false },
};

export class AudioFX {
  constructor() { this.ctx = null; this.muted = false; this.gear = 1; this.shiftT = 0; this.calm = false; this.music = null; }

  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.eng = this.buildEngine(1);
    this.rival = this.buildEngine(0.6);
    this.skid = this.loopNoise('bandpass', 1300, 1.4);
    this.wind = this.loopNoise('bandpass', 700, 0.4);
    this.rumble = this.loopNoise('lowpass', 260, 0.8);
    this.amb = this.loopNoise('lowpass', 500, 0.5);
    this.amb.gain.gain.value = 0.012;
    this.buildHorn();
    // the music bus (the finish jingle and the calm tune on the results screen)
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.9;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 5200;
    this.musicBus.connect(warm); warm.connect(this.master);
  }

  loopNoise(type, freq, q) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(0, Math.random() * 1.5);
    return { src, filter: f, gain: g };
  }

  buildEngine(level) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
    const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'sawtooth';
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    const g3 = ctx.createGain(); g3.gain.value = 0.22;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(x * 2.2); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2.5;
    const out = ctx.createGain(); out.gain.value = 0;
    o1.connect(shaper); o2.connect(g2); g2.connect(shaper); o3.connect(g3); g3.connect(shaper);
    shaper.connect(lp); lp.connect(out); out.connect(this.master);
    o1.frequency.value = 40; o2.frequency.value = 20; o3.frequency.value = 40.6;
    o1.start(); o2.start(); o3.start();
    return { o1, o2, o3, g2, lp, out, rpm: 0.2, level };
  }

  buildHorn() {
    const ctx = this.ctx;
    const a = ctx.createOscillator(); a.type = 'square'; a.frequency.value = 415;
    const b = ctx.createOscillator(); b.type = 'square'; b.frequency.value = 523;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0;
    a.connect(f); b.connect(f); f.connect(g); g.connect(this.master);
    a.start(); b.start();
    this.hornG = g;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  horn(on) { if (this.ctx) this.hornG.gain.setTargetAtTime(on ? 0.09 : 0, this.ctx.currentTime, 0.02); }

  // one engine voice from a car's speed, throttle and gear
  drive(E, car, dt, t, revving = 0) {
    const V = VOICE[car.type] || VOICE.falk;
    const vTop = car.vTop || (car.vTop = topSpeed(car.spec));
    const v = Math.abs(car.fwdSpeed) / vTop;
    let g = 1;
    while (g < 6 && v > GEARS[g]) g++;
    const lo = GEARS[g - 1], hi = GEARS[g];
    let target = 0.28 + 0.72 * Math.min(1, (v - lo) / (hi - lo));
    if (g === 1) target = 0.22 + 0.78 * Math.min(1, v / hi);
    const thr = Math.max(0, car.input ? car.input.throttle : 0, revving);
    if (revving > 0 && v < 0.02) target = 0.25 + revving * 0.6;         // revving on the grid
    if (car.air) target = Math.min(1, E.rpm + 0.4 * dt + thr * 0.6 * dt);
    if (E === this.eng && g !== this.gear) {
      if (g > this.gear && thr > 0.3) { this.shiftT = 0.12; this.burst(0.05, 2400, 0.05, 'highpass'); if (V.turbo) this.burst(0.05, 3200, 0.12, 'bandpass'); }
      this.gear = g;
    }
    if (E === this.eng && this.shiftT > 0) { this.shiftT -= dt; target *= 0.82; }
    E.rpm += (target - E.rpm) * Math.min(1, dt * (target > E.rpm ? 7 : 12));
    const f = V.f0 + E.rpm * V.fr;
    E.o1.frequency.setTargetAtTime(f, t, 0.03);
    E.o3.frequency.setTargetAtTime(f * 1.011, t, 0.03);
    E.o2.frequency.setTargetAtTime(f / 2, t, 0.03);
    E.g2.gain.setTargetAtTime(0.18 + V.sub * 0.4, t, 0.1);
    E.lp.frequency.setTargetAtTime(380 + thr * 1500 * V.grit + E.rpm * 900, t, 0.05);
    // a turbo four whooshes when you lift off at high revs
    if (E === this.eng && V.turbo && this.lastThr > 0.6 && thr < 0.1 && E.rpm > 0.6) this.burst(0.06, 2600, 0.25, 'bandpass');
    if (E === this.eng) this.lastThr = thr;
    return { g, thr };
  }

  update(dt, game, view) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tickMusic();
    if (!game || this.calm) {
      // after the finish (and in the menus): the engines, the wind and the tyres fade away
      const k = this.calm ? 0.45 : 0.1;
      this.eng.out.gain.setTargetAtTime(0, t, k); this.rival.out.gain.setTargetAtTime(0, t, k);
      for (const n of [this.skid, this.wind, this.rumble]) n.gain.gain.setTargetAtTime(0, t, k);
      this.hornG.gain.setTargetAtTime(0, t, 0.05);
      return;
    }
    const car = game.player;
    const { thr } = this.drive(this.eng, car, dt, t, car.revving || 0);
    this.eng.out.gain.setTargetAtTime(0.05 + thr * 0.07 + this.eng.rpm * 0.035, t, 0.06);
    const sp = car.speed;
    const slide = car.air || car.surface !== 'road' ? 0 : Math.max(0, Math.min(1, (car.slip - 3.5) / 6));
    this.skid.gain.gain.setTargetAtTime(slide * 0.2, t, 0.05);
    this.wind.gain.gain.setTargetAtTime(Math.min(0.09, sp * sp * 0.00004), t, 0.2);
    this.wind.filter.frequency.setTargetAtTime(500 + sp * 18, t, 0.2);
    const off = !car.air && car.surface !== 'road' ? Math.min(1, sp / 25) : 0;
    this.rumble.gain.gain.setTargetAtTime(off * 0.16, t, 0.08);
    // the nearest rival's engine
    let near = null, nd = 45;
    for (const v of game.vehicles) { if (v === car) continue; const d = Math.hypot(v.x - car.x, v.z - car.z); if (d < nd) { nd = d; near = v; } }
    if (near) {
      this.drive(this.rival, near, dt, t);
      this.rival.out.gain.setTargetAtTime(0.05 * (1 - nd / 45) ** 1.5, t, 0.1);
    } else this.rival.out.gain.setTargetAtTime(0, t, 0.2);
    void view;
  }

  // ---------------------------------------------------------------- one-shots
  burst(vol, freq, dur, type = 'bandpass') {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, type = 'sine', vol = 0.1, delay = 0, slideTo = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  crash(impact) {
    const k = Math.min(1, impact / 16);
    if (k < 0.05) return;
    this.burst(0.5 * k, 800 + impact * 50, 0.15 + k * 0.35);
    this.burst(0.22 * k, 3600, 0.08 + k * 0.1, 'highpass');
    this.tone(65, 0.25, 'sine', 0.4 * k, 0, 36);
  }
  land(impact) { if (impact > 1.5) { this.tone(55, 0.22, 'sine', Math.min(0.35, impact * 0.05), 0, 32); this.burst(Math.min(0.2, impact * 0.03), 400, 0.15, 'lowpass'); } }
  beep(go) { go ? (this.tone(880, 0.6, 'square', 0.08), this.tone(1760, 0.6, 'sine', 0.04)) : this.tone(440, 0.22, 'square', 0.07); }
  // ---------------------------------------------------------------- music
  // a soft synth note on the music bus: a sine with a little second harmonic (a gentle e-piano),
  // or a bell (bright, quick decay), or a pad (slow swell)
  note(freq, when, dur, vol, kind = 'piano', bus = this.musicBus) {
    const ctx = this.ctx, t = Math.max(ctx.currentTime, when);
    const g = ctx.createGain(); g.connect(bus);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o1.frequency.value = freq; o2.frequency.value = freq * 2;
    o1.connect(g); o2.connect(g2); g2.connect(g);
    if (kind === 'pad') {
      o1.type = 'triangle'; o2.type = 'sine'; g2.gain.value = 0.12; o2.detune.value = 6;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.9, dur * 0.4));
      g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
    } else if (kind === 'bell') {
      o1.type = 'sine'; o2.type = 'sine'; o2.frequency.value = freq * 3.01; g2.gain.value = 0.35;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else if (kind === 'lead') {
      o1.type = 'square'; o2.type = 'triangle'; g2.gain.value = 0.6;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; g.disconnect(); g.connect(f); f.connect(bus);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.setValueAtTime(vol * 0.8, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    } else {
      o1.type = 'sine'; o2.type = 'sine'; g2.gain.value = 0.25;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    o1.start(t); o2.start(t); o1.stop(t + dur + 1.0); o2.stop(t + dur + 1.0);
  }

  // over the line: the engines go quiet and a happy little tune plays (a longer one for a win)
  finish(win) {
    if (!this.ctx) return;
    this.calm = true;
    this.horn(false);
    const t = this.ctx.currentTime + 0.08, N = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // C major: G C E G – E G, the last note held over a full chord, a bell on top
    const tune = win
      ? [[67, 0, 0.13], [72, 0.13, 0.13], [76, 0.26, 0.13], [79, 0.39, 0.26], [76, 0.65, 0.13], [79, 0.78, 0.13], [84, 0.91, 0.9]]
      : [[67, 0, 0.13], [72, 0.13, 0.13], [76, 0.26, 0.13], [79, 0.39, 0.26], [76, 0.65, 0.13], [79, 0.78, 0.7]];
    for (const [m, at, d] of tune) { this.note(N(m), t + at, d, 0.07, 'lead'); this.note(N(m - 12), t + at, d, 0.035, 'piano'); }
    const end = t + tune[tune.length - 1][1];
    for (const m of [60, 64, 67, 72]) this.note(N(m), end, 1.6, 0.035, 'pad');
    this.note(N(96), end + 0.02, 1.4, 0.03, 'bell'); this.note(N(91), end + 0.18, 1.2, 0.022, 'bell');
    if (win) for (let k = 0; k < 6; k++) this.note(N([84, 88, 91, 96, 91, 96][k]), end + 0.35 + k * 0.09, 0.6, 0.016, 'bell');
  }

  // the calm tune under the results: soft chords, a slow bass and a sparse melody (C major, 76 bpm).
  // Scheduled a little ahead in time from update().
  lounge(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (on && !this.music) {
      // its own little bus, so that stopping it also silences notes already on their way
      const bus = this.ctx.createGain();
      bus.gain.setValueAtTime(0.0001, t); bus.gain.linearRampToValueAtTime(1, t + 2.5);
      bus.connect(this.musicBus);
      this.music = { next: t + 0.5, step: 0, bus };
    } else if (!on && this.music) {
      const bus = this.music.bus;
      this.music = null;
      bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(0.0001, t, 0.3);
      setTimeout(() => bus.disconnect(), 3000);
    }
  }

  tickMusic() {
    const M = this.music;
    if (!M) return;
    const ctx = this.ctx, N = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const beat = 60 / 76;
    // four bars: Cmaj7 – Am7 – Fmaj7 – G6, then the same with a second melody
    const chords = [[48, [60, 64, 67, 71]], [45, [57, 60, 64, 67]], [41, [57, 60, 64, 65]], [43, [59, 62, 64, 67]]];
    const melodies = [
      [76, null, 79, null, 76, 74, null, 72, null, null, 72, null, 69, null, 72, null],
      [74, null, 72, 69, null, 72, null, null, 77, null, 76, null, 74, null, null, 71],
      [72, null, null, 76, null, 79, null, 81, null, 79, null, 76, null, null, 74, null],
      [71, null, 74, null, 79, null, null, 76, null, 74, null, null, 72, null, null, null],
    ];
    while (M.next < ctx.currentTime + 0.6) {
      const s = M.step, bar = Math.floor(s / 4) % 4, beatInBar = s % 4, phrase = Math.floor(s / 16) % 2;
      const [bass, chord] = chords[bar];
      if (beatInBar === 0) {
        for (const m of chord) this.note(N(m), M.next, beat * 4, 0.018, 'pad', M.bus);
        this.note(N(bass), M.next, beat * 2.2, 0.05, 'piano', M.bus);
      }
      if (beatInBar === 2) this.note(N(bass + 7), M.next, beat * 1.8, 0.035, 'piano', M.bus);
      // the melody in eighths
      const mel = melodies[(bar + phrase * 2) % 4];
      for (const half of [0, 1]) {
        const m = mel[beatInBar * 2 + half];
        if (m) this.note(N(m), M.next + half * beat / 2, beat * 1.4, 0.04, 'piano', M.bus);
      }
      M.step++; M.next += beat;
    }
  }

  // a new race: the engines may come back
  reset() { this.calm = false; this.lounge(false); }
  click() { this.tone(1200, 0.04, 'square', 0.03); }
  whoosh() { this.burst(0.12, 900, 0.35, 'bandpass'); }
}
