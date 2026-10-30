// The race HUD: position, time, speed and gear, the trip from start to finish with every car on it,
// a minimap that turns with you, banners (the countdown, wrong way) and name tags over the rivals.
import { topSpeed, gearOf } from './cars.js';
import { HW } from './track.js';

const $ = (id) => document.getElementById(id);
export function fmtTime(t) {
  if (!(t >= 0)) return '–:––.–';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

export class Hud {
  constructor(track) {
    this.track = track;
    this.el = { pos: $('hPos'), of: $('hOf'), time: $('hTime'), speed: $('hSpeed'), gear: $('hGear'), arc: $('hArc'), prog: $('hProg'), banner: $('banner'), toast: $('toast'), tags: $('tags'), warn: $('warn') };
    this.map = $('map'); this.mctx = this.map.getContext('2d');
    this.dots = []; this.tags = [];
    this.bannerT = 0; this.toastT = 0;
    // the route, thinned to every 8 m, for the minimap
    this.route = [];
    for (let i = 0; i < track.n; i += 4) this.route.push([track.xs[i], track.zs[i]]);
    this.arcLen = 0;
  }

  setup(game) {
    this.game = game;
    const P = this.el.prog;
    P.querySelectorAll('.dot').forEach((d) => d.remove());
    this.dots = game.vehicles.map((v) => {
      const d = document.createElement('i');
      d.className = 'dot' + (v === game.player ? ' me' : '');
      P.appendChild(d);
      return d;
    });
    this.el.tags.innerHTML = '';
    this.tags = game.vehicles.map((v) => {
      if (v === game.player) return null;
      const t = document.createElement('div');
      t.className = 'tag'; t.textContent = v.name;
      this.el.tags.appendChild(t);
      return t;
    });
    this.el.of.textContent = `/${game.vehicles.length}`;
    this.vTop = topSpeed(game.player.spec);
    if (!this.arcLen) { try { this.arcLen = this.el.arc.getTotalLength(); } catch (_) { this.arcLen = 300; } }
    this.el.arc.style.strokeDasharray = `${this.arcLen} ${this.arcLen}`;
  }

  banner(text, kind = '', dur = 1.0) {
    const b = this.el.banner;
    b.textContent = text; b.className = kind; b.hidden = false;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    this.bannerT = dur;
  }
  toast(text, dur = 2.4) { const t = this.el.toast; t.textContent = text; t.hidden = false; this.toastT = dur; }

  update(dt, game, view) {
    const p = game.player, T = this.track;
    // time and position
    const racing = game.phase === 'race' || game.phase === 'done';
    this.el.time.textContent = racing ? fmtTime(p.finished ? p.finishTime : game.raceTime) : '0:00.0';
    this.el.pos.textContent = game.position;
    // speed (km/h) and an arc that fills with it
    const kmh = Math.round(Math.abs(p.fwdSpeed) * 3.6);
    if (kmh !== this.lastKmh) { this.el.speed.textContent = kmh; this.lastKmh = kmh; }
    const f = Math.min(1, Math.abs(p.fwdSpeed) / (this.vTop * 1.02));
    this.el.arc.style.strokeDashoffset = String(this.arcLen * (1 - f));
    const gear = p.fwdSpeed < -0.5 ? 'R' : String(gearOf(p));
    if (gear !== this.lastGear) { this.el.gear.textContent = gear; this.lastGear = gear; }
    // the trip: start → finish, a dot for every car
    const F = T.zones.finish, S0 = T.zones.start - 40;
    game.vehicles.forEach((v, i) => {
      const k = Math.max(0, Math.min(1, (v.dist - S0) / (F - S0)));
      this.dots[i].style.left = `${(k * 100).toFixed(2)}%`;
    });
    // warnings
    const warn = game.wrongWay ? 'FEL HÅLL!' : game.outWarn ? 'TILLBAKA TILL VÄGEN' : '';
    if (warn !== this.lastWarn) { this.el.warn.textContent = warn; this.el.warn.hidden = !warn; this.lastWarn = warn; }
    // banner and toast timers
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) this.el.banner.hidden = true;
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.el.toast.hidden = true;
    // name tags over the rivals close ahead
    const o = {};
    game.vehicles.forEach((v, i) => {
      const t = this.tags[i];
      if (!t) return;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      let show = d < 70 && d > 4 && racing;
      if (show) { view.project(v.x, (v.visY ?? v.y) + v.spec.height + 0.7, v.z, o); show = o.vis && o.x > 0 && o.y > 0 && o.x < innerWidth && o.y < innerHeight; }
      if (show) { t.style.transform = `translate(${o.x.toFixed(0)}px, ${o.y.toFixed(0)}px) translate(-50%, -100%)`; t.style.opacity = String(Math.min(1, (70 - d) / 20)); }
      if (t.hidden === show) t.hidden = !show;
    });
    this.drawMap(game);
  }

  drawMap(game) {
    const c = this.map, g = this.mctx, p = game.player;
    const dpr = Math.min(2, window.devicePixelRatio || 1), S = c.clientWidth * dpr;
    if (c.width !== S) { c.width = S; c.height = S; }
    const scale = S / 340;                // metres → pixels (about 170 m to the edge)
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = 'rgba(46, 70, 38, 0.92)'; g.fillRect(0, 0, S, S);
    // the map turns with the car: forward is up
    const h = p.h, cs = Math.cos(h), sn = Math.sin(h);
    const tx = (x, z) => { const dx = x - p.x, dz = z - p.z; return [S / 2 + (-dx * cs + dz * sn) * scale, S / 2 - (dx * sn + dz * cs) * scale]; };
    // the road
    const R = this.route;
    const draw = (w, col) => {
      g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath();
      let pen = false;
      for (const [x, z] of R) {
        if (Math.abs(x - p.x) > 260 || Math.abs(z - p.z) > 260) { pen = false; continue; }
        const [u, v] = tx(x, z);
        if (pen) g.lineTo(u, v); else { g.moveTo(u, v); pen = true; }
      }
      g.stroke();
    };
    draw((HW * 2 + 6) * scale, 'rgba(255,255,255,0.85)');
    draw(HW * 2 * scale, '#3b3f45');
    // start and finish lines
    for (const s of [this.track.zones.finish]) {
      const q = this.track.pointAt(s, {});
      const [u, v] = tx(q.x, q.z);
      g.fillStyle = '#ffcf33'; g.beginPath(); g.arc(u, v, 6 * dpr, 0, 7); g.fill();
    }
    // the rivals
    for (const v of game.vehicles) {
      if (v === p) continue;
      const [u, w] = tx(v.x, v.z);
      g.fillStyle = '#ff4b3e'; g.strokeStyle = '#111'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(u, w, 5 * dpr, 0, 7); g.fill(); g.stroke();
    }
    g.restore();
    // you: an arrow in the middle
    g.save();
    g.translate(S / 2, S / 2);
    g.fillStyle = '#ffcf33'; g.strokeStyle = '#111'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(0, -10 * dpr); g.lineTo(7 * dpr, 8 * dpr); g.lineTo(0, 4 * dpr); g.lineTo(-7 * dpr, 8 * dpr); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
