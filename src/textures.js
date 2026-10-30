// Every texture is painted on a canvas when the game starts – no image files.
import * as THREE from './three.js';
import { makeRng } from './rng.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
function speckle(g, w, h, n, colors, R, size = [1, 3]) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[(R() * colors.length) | 0]; const s = size[0] + R() * (size[1] - size[0]); g.fillRect(R() * w, R() * h, s, s); }
}

// grass: a soft mottled green-grey (multiplied by the terrain's vertex colours)
export function grassTexture() {
  const c = canvas(512, 512), g = c.getContext('2d'), R = makeRng(11);
  g.fillStyle = '#bfc4b4'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const x = R() * 512, y = R() * 512, r = 2 + R() * 9;
    g.fillStyle = `rgba(${R() < 0.5 ? '90,100,70' : '235,240,220'},${0.05 + R() * 0.12})`;
    g.beginPath(); g.ellipse(x, y, r, r * (0.4 + R()), R() * 3, 0, 7); g.fill();
  }
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '60,70,40' : '250,250,235'},${0.12 + R() * 0.2})`; g.fillRect(R() * 512, R() * 512, 1, 2 + R() * 3); }
  return tex(c);
}

// asphalt with the road markings: u across the road (0 = left edge strip), v along it (12 m per tile)
export function roadTexture() {
  const W = 256, H = 1024, c = canvas(W, H), g = c.getContext('2d'), R = makeRng(5);
  g.fillStyle = '#4a4c4f'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 22000, ['#3d3f42', '#57595c', '#606366', '#38393b', '#6c6e70'], R, [1, 2.4]);
  // wheel tracks: slightly darker, polished bands in each lane
  for (const u of [0.18, 0.36, 0.64, 0.82]) { g.fillStyle = 'rgba(25,26,28,0.13)'; g.fillRect(u * W - 9, 0, 18, H); }
  // patches and cracks
  for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(35,36,38,${0.15 + R() * 0.15})`; g.fillRect(R() * W * 0.8, R() * H, 30 + R() * 60, 40 + R() * 120); }
  g.strokeStyle = 'rgba(25,25,25,0.4)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { g.beginPath(); let x = R() * W, y = R() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 20; y += R() * 26; g.lineTo(x, y); } g.stroke(); }
  // edge lines (solid) and the dashed centre line (3 m of 12)
  const paint = '#ecebe4';
  const lineW = 0.15 / 10 * W;
  g.fillStyle = paint;
  g.fillRect(0.4 / 10 * W, 0, lineW, H); g.fillRect(W - 0.4 / 10 * W - lineW, 0, lineW, H);
  g.fillRect(W / 2 - lineW / 2, H * 0.1, lineW, H * 0.25);
  g.fillRect(W / 2 - lineW / 2, H * 0.6, lineW, H * 0.25);
  // worn paint
  g.fillStyle = 'rgba(74,76,79,0.35)';
  for (let i = 0; i < 400; i++) g.fillRect(R() * W, R() * H, 2, 2);
  const t = tex(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

// gravel for the shoulders and the farm tracks
export function gravelTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), R = makeRng(8);
  g.fillStyle = '#9a8f80'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 9000, ['#7d7366', '#b3a898', '#8a8074', '#c4baa9', '#6e665b'], R, [1, 3]);
  return tex(c);
}

// wooden boards (vertical cladding, tinted by the house colour)
export function sidingTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), R = makeRng(3);
  g.fillStyle = '#f2f0ec'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 3, 256);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + 3, 0, 2, 256);
    g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(x + 12, 0, 6, 256);
    // the narrow cover board over each joint
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 26, 0, 1, 256);
  }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.05})`; g.fillRect(R() * 256, R() * 256, 1, 4 + R() * 12); }
  return tex(c);
}

// rendered plaster
export function plasterTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), R = makeRng(4);
  g.fillStyle = '#efefeb'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,255'},${R() * 0.06})`; g.fillRect(R() * 256, R() * 256, 2, 2); }
  for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(70,60,50,0.035)'; g.fillRect(R() * 256, R() * 200, 2 + R() * 6, 30 + R() * 80); }
  return tex(c);
}

// roof tiles (rows) – tinted by the roof colour
export function roofTexture() {
  const c = canvas(256, 256), g = c.getContext('2d'), R = makeRng(6);
  g.fillStyle = '#e6e3df'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y + 13, 256, 3);
    for (let x = (y / 16) % 2 ? 0 : 10; x < 256; x += 21) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y, 2, 14); g.fillStyle = `rgba(255,255,255,${R() * 0.12})`; g.fillRect(x + 3, y + 2, 14, 4); }
  }
  for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(30,40,20,${R() * 0.08})`; g.fillRect(R() * 256, R() * 256, 3, 2); }
  return tex(c);
}

// a window: white frame, two panes reflecting the sky, a curtain now and then (atlas of 4 kinds)
export function windowTexture() {
  const S = 128, c = canvas(S * 4, S), g = c.getContext('2d'), R = makeRng(9);
  for (let k = 0; k < 4; k++) {
    const x0 = k * S;
    g.fillStyle = k === 3 ? '#2a2620' : '#f4f2ec'; g.fillRect(x0, 0, S, S);
    const m = 10;
    const gr = g.createLinearGradient(x0, 0, x0 + S, S);
    gr.addColorStop(0, '#8ea6bd'); gr.addColorStop(0.45, '#2c3b4c'); gr.addColorStop(0.55, '#3b4e62'); gr.addColorStop(1, '#1b2531');
    g.fillStyle = gr; g.fillRect(x0 + m, m, S - 2 * m, S - 2 * m);
    if (k === 1) { g.fillStyle = 'rgba(240,232,215,0.85)'; g.fillRect(x0 + m, m, 22, S - 2 * m); g.fillRect(x0 + S - m - 22, m, 22, S - 2 * m); }
    if (k === 2) { g.fillStyle = 'rgba(255,248,230,0.5)'; g.fillRect(x0 + m, m, S - 2 * m, 26); }
    g.fillStyle = k === 3 ? '#2a2620' : '#f4f2ec';
    g.fillRect(x0 + S / 2 - 4, m, 8, S - 2 * m);
    if (k !== 3) g.fillRect(x0 + m, S * 0.38, S - 2 * m, 6);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(x0 + m, m + 40); g.lineTo(x0 + m + 40, m); g.lineTo(x0 + m + 60, m); g.lineTo(x0 + m, m + 60); g.fill();
    void R;
  }
  const t = tex(c, { repeat: false });
  return t;
}

// a shop front: big glass, a sign band above
export function shopTexture() {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.fillStyle = '#26292d'; g.fillRect(0, 0, 512, 256);
  const gr = g.createLinearGradient(0, 40, 0, 256);
  gr.addColorStop(0, '#7f97ad'); gr.addColorStop(0.5, '#33424f'); gr.addColorStop(1, '#212a33');
  g.fillStyle = gr; g.fillRect(14, 60, 484, 186);
  g.fillStyle = '#26292d'; for (const x of [170, 340]) g.fillRect(x, 60, 8, 186);
  g.fillStyle = 'rgba(255,240,200,0.25)'; g.fillRect(14, 200, 484, 46);
  return tex(c, { repeat: false });
}

export function doorTexture() {
  const c = canvas(64, 128), g = c.getContext('2d');
  g.fillStyle = '#5a3a26'; g.fillRect(0, 0, 64, 128);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.strokeRect(8, 10, 48, 50); g.strokeRect(8, 68, 48, 50);
  g.fillStyle = '#c9b27a'; g.fillRect(50, 66, 5, 5);
  return tex(c, { repeat: false });
}

// crops: wheat, rapeseed, ley (mown stripes), ploughed soil
export function cropTexture(kind) {
  const c = canvas(256, 256), g = c.getContext('2d'), R = makeRng(kind.length * 7);
  const base = { vete: '#c8a95a', raps: '#e6cf2c', vall: '#7f9a4a', plojd: '#6b5240' }[kind] || '#7f9a4a';
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) { g.fillStyle = `rgba(0,0,0,${kind === 'plojd' ? 0.25 : 0.08})`; g.fillRect(0, y, 256, kind === 'plojd' ? 3 : 2); }
  if (kind === 'vall') for (let y = 0; y < 256; y += 64) { g.fillStyle = 'rgba(255,255,220,0.1)'; g.fillRect(0, y, 256, 32); }
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '0,0,0' : '255,255,230'},${R() * 0.12})`; g.fillRect(R() * 256, R() * 256, 1, 2 + R() * 3); }
  return tex(c);
}

// signs: Swedish style. kind: town (blue), speed (yellow with a red ring), distance (blue), board, chevron, lake
export function signTexture(kind, text) {
  const W = kind === 'speed' || kind === 'chevron' ? 256 : 512, H = 256;
  const c = canvas(W, H), g = c.getContext('2d');
  const font = (px, w = 700) => `${w} ${px}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'speed') {
    g.fillStyle = '#d61f1f'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
    g.fillStyle = '#ffd400'; g.beginPath(); g.arc(128, 128, 96, 0, 7); g.fill();
    g.fillStyle = '#111'; g.font = font(118); g.fillText(text, 128, 134);
  } else if (kind === 'chevron') {
    g.fillStyle = '#f5f5f0'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d61f1f';
    const dir = text === 'L' ? -1 : 1;
    for (const off of [-60, 30]) { g.beginPath(); g.moveTo(128 + dir * (off - 40), 28); g.lineTo(128 + dir * (off + 30), 128); g.lineTo(128 + dir * (off - 40), 228); g.lineTo(128 + dir * (off - 5), 228); g.lineTo(128 + dir * (off + 65), 128); g.lineTo(128 + dir * (off - 5), 28); g.fill(); }
    g.strokeStyle = '#d61f1f'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
  } else if (kind === 'board') {
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffcf33'; g.font = font(150, 800); g.fillText(text, W / 2, H / 2 + 8);
  } else {
    // blue Swedish road sign, white border
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1f55a8'; g.fillRect(10, 10, W - 20, H - 20);
    g.fillStyle = '#fff';
    if (kind === 'distance') {
      const rows = text.split('|');
      g.font = font(78); g.textAlign = 'left';
      rows.forEach((r, i) => { const [name, km] = r.split(' '); g.textAlign = 'left'; g.fillText(name, 40, 75 + i * 105); g.textAlign = 'right'; g.fillText(km, W - 40, 75 + i * 105); });
    } else if (kind === 'lake') {
      g.font = font(96); g.fillText(text, W / 2, 110);
      g.strokeStyle = '#fff'; g.lineWidth = 8;
      for (let i = 0; i < 3; i++) { g.beginPath(); for (let x = 140; x <= 372; x += 4) g.lineTo(x, 190 + i * 18 + Math.sin(x / 14) * 6); g.stroke(); }
    } else {
      g.font = font(130); g.fillText(text, W / 2, H / 2 + 6);
    }
  }
  return tex(c, { repeat: false });
}

// the banners on the start and finish gantries
export function bannerTexture(text, finish) {
  const W = 1024, H = 160, c = canvas(W, H), g = c.getContext('2d');
  if (finish) {
    const s = 20;
    for (let y = 0; y < H; y += s) for (let x = 0; x < W; x += s) { g.fillStyle = ((x + y) / s) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x, y, s, s); }
    g.fillStyle = '#111'; g.fillRect(260, 18, 504, 124);
    g.fillStyle = '#ffcf33';
  } else {
    g.fillStyle = '#1f55a8'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffcf33'; g.fillRect(0, H - 14, W, 14); g.fillRect(0, 0, W, 14);
    g.fillStyle = '#fff';
  }
  g.font = '900 104px "Big Shoulders Display", "Arial Narrow", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + 6);
  return tex(c, { repeat: false });
}

// a ripple normal map for the lake
export function waterNormals() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = makeRng(21);
  const img = g.createImageData(S, S);
  const hgt = new Float32Array(S * S);
  const waves = [];
  for (let i = 0; i < 26; i++) waves.push([R() * 6.28, 2 + ((R() * 7) | 0), 2 + ((R() * 7) | 0), R() * 6.28, 0.3 + R()]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let h = 0;
    for (const [, kx, ky, ph, a] of waves) h += Math.sin(((x * kx + y * ky) / S) * Math.PI * 2 + ph) * a / (kx + ky);
    hgt[y * S + x] = h;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x + S - 1) % S)];
    const dy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x];
    const nx = -dx * 3, ny = -dy * 3, nz = 1, l = Math.hypot(nx, ny, nz);
    const i = (y * S + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}

// bark and the birch's white bark are vertex colours; this is the soft round blob shadow
export function blobTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, { repeat: false });
}

// ------------------------------------------------------------------ the evening (course 2)
// which windows glow: the same atlas as windowTexture() – plain windows stay dark, the ones with
// curtains and the ones with a lamp are lit warm
export function windowGlowTexture() {
  const S = 128, c = canvas(S * 4, S), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S * 4, S);
  const m = 10;
  for (const [k, top, bot] of [[1, '#ffcf86', '#c98a3c'], [2, '#fff0c8', '#e0a050']]) {
    const x0 = k * S, gr = g.createLinearGradient(0, m, 0, S - m);
    gr.addColorStop(0, top); gr.addColorStop(1, bot);
    g.fillStyle = gr; g.fillRect(x0 + m, m, S - 2 * m, S - 2 * m);
    g.fillStyle = '#000'; g.fillRect(x0 + S / 2 - 4, m, 8, S - 2 * m); g.fillRect(x0 + m, S * 0.38, S - 2 * m, 6);
    if (k === 1) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x0 + m, m, 22, S - 2 * m); g.fillRect(x0 + S - m - 22, m, 22, S - 2 * m); }
  }
  return tex(c, { repeat: false });
}
export function shopGlowTexture() {
  const c = canvas(512, 256), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256);
  const gr = g.createLinearGradient(0, 60, 0, 256);
  gr.addColorStop(0, '#fff2d6'); gr.addColorStop(1, '#d9a45c');
  g.fillStyle = gr; g.fillRect(14, 60, 484, 186);
  g.fillStyle = '#000'; for (const x of [170, 340]) g.fillRect(x, 60, 8, 186);
  return tex(c, { repeat: false });
}
// a pool of light on the road: round (street lights) or a long beam (headlights, u across, v ahead)
export function lightPoolTexture(beam) {
  const W = 128, H = beam ? 256 : 128, c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a;
    const u = (x + 0.5) / W - 0.5;
    if (beam) {
      const v = 1 - (y + 0.5) / H;                  // 0 at the car, 1 far ahead
      const spread = 0.12 + v * 0.38;
      a = Math.exp(-((u / spread) ** 2) * 2.2) * Math.min(1, v * 7) * Math.pow(1 - v, 1.3);
    } else {
      const w = (y + 0.5) / H - 0.5, r = Math.hypot(u, w) * 2;
      a = Math.pow(Math.max(0, 1 - r), 1.8);
    }
    const i = (y * W + x) * 4;
    img.data[i] = 255; img.data[i + 1] = beam ? 236 : 214; img.data[i + 2] = beam ? 205 : 160; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: false });
}
// the glare round a lamp
export function glowTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, { repeat: false });
}
