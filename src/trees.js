// Detailed trees for the roadside (the ones you drive right past): a Swedish spruce (gran) with
// drooping branches in whorls, a Scots pine (tall) with an orange upper trunk and needle tufts,
// and a silver birch with white bark and hanging leafy twigs. Trunks and branches are real
// geometry with bark textures; needles and leaves are painted on canvases and hung on cards that
// sway a little in the wind. Everything is made here, no image files.
import * as THREE from './three.js';
import { makeRng } from './rng.js';

// ------------------------------------------------------------------ canvases
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
const pick = (R, a) => a[Math.floor(R() * a.length)];

// a spruce branch seen from above: twig along x (trunk at the left), side twigs and dense needles
function spruceBranchTex() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = makeRng(31);
  g.lineCap = 'round';
  const needle = ['#132614', '#18301a', '#1d3820', '#23401f', '#16301c', '#2a4a26'];
  const tip = ['#3f6a2e', '#4a7634', '#3a6230'];
  const brush = (x0, y0, x1, y1, w, nl) => {
    g.strokeStyle = '#3b2d22'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const len = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / len, dy = (y1 - y0) / len, base = Math.atan2(dy, dx);
    for (let s = 0; s < len; s += 1.1) {
      const px = x0 + dx * s, py = y0 + dy * s, k = s / len;
      for (let n = 0; n < 3; n++) {
        const ang = base + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.9);
        const l = nl * (0.7 + R() * 0.5) * (1 - k * 0.3);
        g.strokeStyle = k > 0.82 && R() < 0.7 ? pick(R, tip) : pick(R, needle);
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(ang) * l, py + Math.sin(ang) * l); g.stroke();
      }
    }
  };
  const main = []; for (let x = 4; x <= 250; x += 4) main.push([x, 128 + Math.sin(x / 70) * 5]);
  // side twigs (sloping toward the tip), each with its own little twigs: a full, oval branch
  for (let i = 2; i < main.length - 1; i++) {
    const [x, y] = main[i], k = x / 250;
    const reach = 100 * Math.pow(Math.sin(Math.min(1, k * 1.15 + 0.05) * Math.PI), 0.8) * (0.8 + R() * 0.3) + 8;
    for (const side of [-1, 1]) {
      if (R() < 0.35) continue;
      const ang = side * (0.7 + R() * 0.3);
      const ex = x + Math.cos(ang) * reach * 0.65, ey = y + Math.sin(ang) * reach;
      brush(x, y, ex, ey, 1.4, 6.5);
      if (reach > 35 && R() < 0.8) { const t = 0.4 + R() * 0.3, mx = x + (ex - x) * t, my = y + (ey - y) * t; brush(mx, my, mx + 14 + R() * 8, my + side * (14 + R() * 10), 1, 5); }
    }
  }
  brush(4, 128, 250, 128 + Math.sin(250 / 70) * 5, 3, 7);
  return tex(c);
}

// a pine card: a few round tufts of long, slightly blue-green needles on short twigs
function pineTuftTex() {
  // a cloud of round tufts of long needles, lighter and bluer than the spruce's
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = makeRng(41);
  g.lineCap = 'round';
  const cols = ['#3c5a35', '#46663c', '#527446', '#35522f', '#5c7e4d', '#4a6a45', '#2f4a2c'];
  const tufts = [];
  for (let k = 0; k < 16; k++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 82;
    tufts.push([128 + Math.cos(a) * r * 1.15, 128 + Math.sin(a) * r * 0.85, 20 + R() * 14]);
  }
  g.strokeStyle = '#5b3d26'; g.lineWidth = 2;
  for (const [x, y] of tufts) { g.beginPath(); g.moveTo(128 + (x - 128) * 0.4, 128 + (y - 128) * 0.4); g.lineTo(x, y); g.stroke(); }
  for (const [x, y, r] of tufts) {
    for (let n = 0; n < 130; n++) {
      const a = R() * Math.PI * 2, l = r * (0.5 + R() * 0.55);
      g.strokeStyle = pick(R, cols); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }
  return tex(c);
}

// birch leaves on thin hanging twigs
function birchLeafTex() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = makeRng(51);
  const cols = ['#557f2a', '#628c31', '#71993a', '#477025', '#7da542', '#4f7a2e', '#86a845'];
  g.lineCap = 'round';
  const twigs = [];
  for (let k = 0; k < 11; k++) {
    const x0 = 20 + R() * 216, pts = [[x0, 4]];
    let x = x0, y = 4;
    for (let s = 0; s < 12; s++) { x += (R() - 0.5) * 10; y += 18 + R() * 4; pts.push([x, y]); }
    twigs.push(pts);
    g.strokeStyle = '#5a4634'; g.lineWidth = 1.2; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
  }
  for (const pts of twigs) for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    for (let n = 0; n < 7; n++) {
      const lx = x + (R() - 0.5) * 30, ly = y + (R() - 0.3) * 18, s = 5.5 + R() * 4, a = Math.PI / 2 + (R() - 0.5) * 1.8;
      g.save(); g.translate(lx, ly); g.rotate(a);
      g.fillStyle = pick(R, cols);
      g.beginPath(); g.moveTo(-s * 0.2, 0); g.quadraticCurveTo(s * 0.5, -s * 0.6, s * 1.2, 0); g.quadraticCurveTo(s * 0.5, s * 0.6, -s * 0.2, 0); g.fill();
      g.strokeStyle = 'rgba(30,50,15,0.45)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(s, 0); g.stroke();
      g.restore();
    }
  }
  return tex(c);
}

// bark: u around the trunk, v along it
function barkTex(kind) {
  const W = 128, H = 256, c = canvas(W, H), g = c.getContext('2d'), R = makeRng(kind.length * 13);
  if (kind === 'birch') {
    g.fillStyle = '#ece9e1'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '180,175,165' : '255,255,250'},${R() * 0.25})`; g.fillRect(R() * W, R() * H, 2 + R() * 6, 1); }
    // the black lenticels and patches
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(20,18,16,${0.55 + R() * 0.4})`; const w = 6 + R() * 26; g.fillRect(R() * W, R() * H, w, 1.5 + R() * 2.5); }
    for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(25,22,20,0.8)'; g.beginPath(); g.ellipse(R() * W, R() * H, 4 + R() * 9, 3 + R() * 7, 0, 0, 7); g.fill(); }
  } else if (kind === 'pine') {
    g.fillStyle = '#7a6656'; g.fillRect(0, 0, W, H);
    for (let row = 0; row < H; row += 22 + R() * 14) for (let x = 0; x < W;) {
      const w = 10 + R() * 18, h = 26 + R() * 30, l = 0.85 + R() * 0.3;
      g.fillStyle = `rgb(${Math.round(176 * l)},${Math.round(152 * l)},${Math.round(130 * l)})`;
      g.beginPath(); g.moveTo(x + 2, row + R() * 4); g.lineTo(x + w - 2, row + R() * 4); g.lineTo(x + w - 1, row + h); g.lineTo(x + 1, row + h - R() * 6); g.closePath(); g.fill();
      x += w + 2 + R() * 2;
    }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '60,45,35' : '220,200,180'},${R() * 0.18})`; g.fillRect(R() * W, R() * H, 1, 2 + R() * 4); }
  } else {
    g.fillStyle = '#6b5a4c'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,30,24' : '140,125,110'},${0.2 + R() * 0.4})`; g.beginPath(); g.ellipse(R() * W, R() * H, 2 + R() * 4, 1 + R() * 2, 0, 0, 7); g.fill(); }
  }
  return tex(c, { repeat: true });
}

// ------------------------------------------------------------------ a geometry builder
class G {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  get count() { return this.p.length / 3; }
  v(p, n, uv, c) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.u.push(uv[0], uv[1]); this.c.push(c[0], c[1], c[2]); return this.count - 1; }
  // a tapered tube along a path of { x, y, z, r }
  tube(path, segs, col, uRep = 2, vScale = 2) {
    const base = this.count;
    let len = 0;
    for (let k = 0; k < path.length; k++) {
      const a = path[Math.max(0, k - 1)], b = path[Math.min(path.length - 1, k + 1)];
      let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      // a frame round the tangent
      let ax = 0, ay = 0, az = 1; if (Math.abs(tz) > 0.9) { ax = 1; az = 0; }
      let ux = ty * az - tz * ay, uy = tz * ax - tx * az, uz = tx * ay - ty * ax; const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
      const wx = ty * uz - tz * uy, wy = tz * ux - tx * uz, wz = tx * uy - ty * ux;
      if (k) len += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y, path[k].z - path[k - 1].z);
      const P = path[k];
      for (let s = 0; s <= segs; s++) {
        const an = (s / segs) * Math.PI * 2, cs = Math.cos(an), sn = Math.sin(an);
        const nx = ux * cs + wx * sn, ny = uy * cs + wy * sn, nz = uz * cs + wz * sn;
        this.v([P.x + nx * P.r, P.y + ny * P.r, P.z + nz * P.r], [nx, ny, nz], [(s / segs) * uRep, len / vScale], typeof col === 'function' ? col(P, k / (path.length - 1)) : col);
      }
    }
    for (let k = 0; k < path.length - 1; k++) for (let s = 0; s < segs; s++) {
      const a = base + k * (segs + 1) + s, b = a + 1, c = a + segs + 1, d = c + 1;
      this.i.push(a, c, b, b, c, d);
    }
  }
  // a foliage card: a strip along `pts` (the spine) with half-width `w(t)` along `side`; normals
  // from `nrm(p)`; u runs along the spine, v across
  card(pts, side, w, nrm, col) {
    const base = this.count, n = pts.length;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), p = pts[k], hw = w(t);
      for (const s of [-1, 1]) {
        const q = [p[0] + side[0] * hw * s, p[1] + side[1] * hw * s, p[2] + side[2] * hw * s];
        this.v(q, nrm(q), [t, s < 0 ? 0 : 1], col);
      }
    }
    for (let k = 0; k < n - 1; k++) { const a = base + k * 2; this.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}
const norm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------ the three trees
function spruce(seed) {
  const R = makeRng(seed), trunk = new G(), crown = new G();
  const H = 13 + R() * 2.5;
  const path = [];
  for (let k = 0; k <= 7; k++) { const y = (k / 7) * H; path.push({ x: Math.sin(k * 1.3 + seed) * 0.03, y: y - 0.3, z: Math.cos(k * 0.9) * 0.03, r: 0.3 * Math.pow(1 - y / H, 0.85) + 0.02 }); }
  trunk.tube(path, 8, (P) => mix([0.62, 0.58, 0.56], [0.95, 0.9, 0.85], P.y / H), 2, 2);
  // an inner cone of needles keeps the tree from looking see-through
  {
    const base = crown.count, N = 7, rows = 5, y0 = 0.9, y1 = H - 0.4;
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, y = y0 + (y1 - y0) * t, rad = (1 - t) * (H - 1) * 0.17 + 0.05;
      for (let k = 0; k <= N; k++) { const a = (k / N) * Math.PI * 2; crown.v([Math.cos(a) * rad, y, Math.sin(a) * rad], norm(Math.cos(a), 0.5, Math.sin(a)), [(k / N) * 3, t * 4], [0.42, 0.45, 0.42]); }
    }
    for (let r = 0; r < rows; r++) for (let k = 0; k < N; k++) { const a = base + r * (N + 1) + k, b = a + 1, c = a + N + 1, d = c + 1; crown.i.push(a, c, b, b, c, d); }
  }
  // whorls of drooping branches, longest at the bottom
  let k = 0;
  for (let y = 0.9; y < H - 0.5; y += 0.68 + R() * 0.15, k++) {
    const nB = 6 + (k % 2), a0 = R() * Math.PI * 2, up = y / H;
    for (let b = 0; b < nB; b++) {
      const a = a0 + (b / nB) * Math.PI * 2 + (R() - 0.5) * 0.4;
      const L = Math.min(4.4, 0.35 + (H - y) * 0.31 * (0.85 + R() * 0.3));
      const droop = 0.22 + 0.4 * (1 - up);
      const dx = Math.cos(a), dz = Math.sin(a);
      const pts = [];
      for (let s = 0; s <= 2; s++) {
        const t = s / 2, r = 0.08 + L * t;
        pts.push([dx * r, y + 0.12 * L * t - droop * L * t * t, dz * r]);
      }
      const tilt = (b % 2 ? 1 : -1) * (0.35 + R() * 0.25);
      const sx = -dz * Math.cos(tilt), sy = Math.sin(tilt), sz = dx * Math.cos(tilt);
      const shade = 0.66 + 0.3 * up + (R() - 0.5) * 0.12;
      crown.card(pts, [sx, sy, sz], (t) => L * 0.5 * (0.6 + 0.4 * Math.sin(Math.min(1, t * 1.2 + 0.15) * Math.PI)), (q) => norm(q[0], 0.55 + (q[1] - y) * 0.3, q[2]), [shade, shade, shade]);
    }
  }
  // the leader at the top
  for (let c = 0; c < 2; c++) {
    const pts = [[0, H - 0.9, 0], [0, H - 0.2, 0], [0, H + 0.45, 0]], a = c * Math.PI / 2;
    crown.card(pts, [Math.cos(a), 0, Math.sin(a)], (t) => 0.32 * (1 - t) + 0.05, () => [0, 1, 0], [1.05, 1.05, 1.05]);
  }
  return { trunk: trunk.geometry(), crown: crown.geometry() };
}

function pine(seed) {
  const R = makeRng(seed), trunk = new G(), crown = new G();
  const H = 15 + R() * 3, lean = (R() - 0.5) * 0.5;
  const path = [];
  for (let k = 0; k <= 9; k++) { const t = k / 9, y = t * H; path.push({ x: lean * t * t + Math.sin(t * 5 + seed) * 0.08, y: y - 0.3, z: Math.sin(t * 3) * 0.06, r: 0.32 * Math.pow(1 - t * 0.85, 1.1) + 0.03 }); }
  // grey-brown, fissured below; thin orange bark higher up – the Scots pine's mark
  trunk.tube(path, 8, (P) => mix([0.62, 0.55, 0.5], [1.2, 0.72, 0.42], Math.min(1, Math.max(0, (P.y / H - 0.25) * 2.2))), 2, 1.6);
  const top = path[path.length - 1];
  const crownC = [top.x * 0.8, H * 0.8, top.z * 0.8];
  const nrm = (q) => norm(q[0] - crownC[0], (q[1] - crownC[1]) * 1.4 + 0.5, q[2] - crownC[2]);
  // strong branches through the upper third, needle tufts along each and a cluster at the end
  const nBr = 10 + Math.floor(R() * 3);
  for (let b = 0; b < nBr; b++) {
    const a = (b / nBr) * Math.PI * 2 * 1.618 + R() * 0.5, y0 = H * (0.56 + (b / nBr) * 0.36 + R() * 0.04), L = (2.0 + R() * 1.6) * (1.15 - (b / nBr) * 0.5);
    const t0 = (y0 + 0.3) / H, bx = lean * t0 * t0 + Math.sin(t0 * 5 + seed) * 0.08, bz = Math.sin(t0 * 3) * 0.06;
    const ex = bx + Math.cos(a) * L, ey = y0 + 0.2 + R() * 0.7, ez = bz + Math.sin(a) * L;
    trunk.tube([{ x: bx, y: y0, z: bz, r: 0.1 }, { x: (bx + ex) / 2, y: (y0 + ey) / 2 - 0.1, z: (bz + ez) / 2, r: 0.065 }, { x: ex, y: ey, z: ez, r: 0.03 }], 5, [0.95, 0.62, 0.4], 1, 2);
    const nT = 3 + Math.floor(L);
    for (let c = 0; c < nT; c++) {
      const f = 0.45 + (c / nT) * 0.6, cx = bx + (ex - bx) * f + (R() - 0.5) * 0.6, cy = y0 + (ey - y0) * f + 0.25 + R() * 0.35, cz = bz + (ez - bz) * f + (R() - 0.5) * 0.6;
      const s = 0.95 + R() * 0.6, ang = R() * Math.PI, ux = Math.cos(ang), uz = Math.sin(ang);
      const flat = c % 2 === 0, up = flat ? 0.25 : 0.95, out = Math.sqrt(1 - up * up);
      const sv = [-uz * out, up, ux * out], tilt = (R() - 0.5) * 0.5;
      const sh = 0.85 + R() * 0.25;
      crown.card([[cx - ux * s, cy - tilt * s, cz - uz * s], [cx, cy, cz], [cx + ux * s, cy + tilt * s, cz + uz * s]], sv, () => s, nrm, [sh, sh, sh]);
    }
  }
  // old, dead branch stubs lower down the trunk
  for (let b = 0; b < 6; b++) {
    const y0 = H * (0.25 + R() * 0.3), a = R() * Math.PI * 2, t0 = (y0 + 0.3) / H, bx = lean * t0 * t0, L = 0.4 + R() * 0.6;
    trunk.tube([{ x: bx, y: y0, z: 0, r: 0.04 }, { x: bx + Math.cos(a) * L, y: y0 - 0.1, z: Math.sin(a) * L, r: 0.012 }], 4, [0.5, 0.42, 0.36], 1, 1);
  }
  // the top
  for (let c = 0; c < 3; c++) {
    const ang = c * Math.PI / 3, ux = Math.cos(ang), uz = Math.sin(ang), s = 1.5;
    crown.card([[top.x - ux * s, H - 0.2, top.z - uz * s], [top.x, H + 0.3, top.z], [top.x + ux * s, H - 0.2, top.z + uz * s]], [0, 1, 0], () => s * 0.7, nrm, [1.05, 1.05, 1.05]);
  }
  return { trunk: trunk.geometry(), crown: crown.geometry() };
}

function birch(seed) {
  const R = makeRng(seed), trunk = new G(), crown = new G();
  const H = 11 + R() * 2.5, bend = (R() - 0.5) * 0.6;
  const path = [];
  for (let k = 0; k <= 8; k++) { const t = k / 8, y = t * H; path.push({ x: bend * Math.sin(t * Math.PI * 0.8), y: y - 0.3, z: Math.sin(t * 4 + seed) * 0.08, r: 0.19 * (1 - t * 0.78) + 0.015 }); }
  // white bark, black and rough at the foot
  trunk.tube(path, 8, (P) => (P.y < 1.2 ? mix([0.35, 0.33, 0.3], [1, 1, 1], P.y / 1.2) : [1, 1, 1]), 2, 2.2);
  const cC = [bend * 0.6, H * 0.64, 0], rx = 2.9 + R() * 0.6, ry = H * 0.32;
  const nrm = (q) => norm(q[0] - cC[0], (q[1] - cC[1]) * 0.8 + 0.6, q[2] - cC[2]);
  const nBr = 6;
  for (let b = 0; b < nBr; b++) {
    const a = (b / nBr) * Math.PI * 2 + R() * 0.5, t0 = 0.32 + b * 0.08, P = path[Math.round(t0 * 8)];
    const L = 1.8 + R() * 1.2;
    trunk.tube([{ x: P.x, y: P.y, z: P.z, r: 0.06 }, { x: P.x + Math.cos(a) * L * 0.6, y: P.y + L * 0.75, z: P.z + Math.sin(a) * L * 0.6, r: 0.035 }, { x: P.x + Math.cos(a) * L, y: P.y + L * 1.05, z: P.z + Math.sin(a) * L, r: 0.015 }], 4, [0.9, 0.88, 0.84], 1, 1.5);
  }
  // hanging leafy twigs all through an egg-shaped crown
  for (let c = 0; c < 64; c++) {
    const a = R() * Math.PI * 2, e = (R() * 2 - 1), rr = Math.sqrt(R()) * 0.9 + 0.1;
    const cx = cC[0] + Math.cos(a) * rx * rr * Math.sqrt(1 - e * e * 0.6), cy = cC[1] + e * ry, cz = cC[2] + Math.sin(a) * rx * rr * Math.sqrt(1 - e * e * 0.6);
    const s = 1.4 + R() * 0.7, ang = R() * Math.PI * 2, lean = 0.15 + R() * 0.35;
    const ux = Math.cos(ang), uz = Math.sin(ang), ox = Math.cos(a), oz = Math.sin(a);
    // u runs down the card (the twigs hang down in the picture), leaning out from the crown
    crown.card([[cx - ox * lean * s * 0.5, cy + s * 0.55, cz - oz * lean * s * 0.5], [cx, cy, cz], [cx + ox * lean * s, cy - s * 0.6, cz + oz * lean * s]], [ux, (R() - 0.5) * 0.3, uz], () => s * 0.6, nrm, [0.9 + R() * 0.2, 0.9 + R() * 0.2, 0.9 + R() * 0.1]);
  }
  return { trunk: trunk.geometry(), crown: crown.geometry() };
}

// birch cards have u running top → bottom on the card, the leaf texture has twigs hanging from the
// top edge: rotate its uv
function swapUV(g) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, 1 - u); } return g; }

// ------------------------------------------------------------------ materials (shared)
export function makeTreeKit() {
  const time = { value: 0 };
  // foliage: lit from both sides with the card's outward normal, alpha-cut, swaying in the wind
  const foliage = (map) => {
    const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        #else
          float ph = 0.0;
        #endif
        float sway = max(0.0, position.y - 2.0) * 0.012;
        transformed.x += sin(uTime * 1.3 + ph) * sway + sin(uTime * 3.7 + position.y * 2.0 + ph) * 0.02;
        transformed.z += cos(uTime * 1.1 + ph * 1.3) * sway * 0.8;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
        vec3 normal = normalize( vNormal );
        vec3 nonPerturbedNormal = normal;`);
    };
    m.customProgramCacheKey = () => 'foliage';
    return m;
  };
  const kit = {
    time,
    mats: {
      spruce: { trunk: new THREE.MeshLambertMaterial({ map: barkTex('spruce'), vertexColors: true }), crown: foliage(spruceBranchTex()) },
      pine: { trunk: new THREE.MeshLambertMaterial({ map: barkTex('pine'), vertexColors: true }), crown: foliage(pineTuftTex()) },
      birch: { trunk: new THREE.MeshLambertMaterial({ map: barkTex('birch'), vertexColors: true }), crown: foliage(birchLeafTex()) },
    },
    geos: {
      spruce: [spruce(3), spruce(8)],
      pine: [pine(5), pine(12)],
      birch: [birch(7), birch(15)].map((v) => ({ trunk: v.trunk, crown: swapUV(v.crown) })),
    },
  };
  return kit;
}

// for the tests and the tree studio
export function treeStats(kit) {
  const out = {};
  for (const k in kit.geos) out[k] = kit.geos[k].map((v) => Math.round((v.trunk.index.count + v.crown.index.count) / 3));
  return out;
}
