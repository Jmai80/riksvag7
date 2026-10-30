// Static collision world (from GTA 7): a uniform grid of colliders. Colliders are circles
// { t: 'circle', x, z, r } or oriented boxes { t: 'obox', cx, cz, hx, hz, rot }; every collider
// has an absolute `top` (y) – cars flying higher pass over it.
const RES = { nx: 0, nz: 0, depth: 0 };

export class CollisionGrid {
  constructor(cols, bounds, cell = 12) {
    this.cell = cell;
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / cell) + 1;
    this.nz = Math.ceil((bounds.z1 - bounds.z0) / cell) + 1;
    this.cells = new Array(this.nx * this.nz);
    this.cols = cols;
    this.stamp = new Uint32Array(cols.length);
    this.stampId = 1;
    this.out = [];
    cols.forEach((c, i) => {
      const b = boundsOf(c);
      c.bx0 = b[0]; c.bz0 = b[1]; c.bx1 = b[2]; c.bz1 = b[3];
      const i0 = this.ix(b[0]), i1 = this.ix(b[2]), j0 = this.iz(b[1]), j1 = this.iz(b[3]);
      for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) {
        const id = j * this.nx + k;
        (this.cells[id] || (this.cells[id] = [])).push(i);
      }
    });
  }

  ix(x) { return Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.x0) / this.cell))); }
  iz(z) { return Math.max(0, Math.min(this.nz - 1, Math.floor((z - this.z0) / this.cell))); }

  // colliders whose bounds touch the circle; returns a reused array
  query(x, z, r) {
    const out = this.out;
    out.length = 0;
    const s = ++this.stampId;
    const i0 = this.ix(x - r), i1 = this.ix(x + r), j0 = this.iz(z - r), j1 = this.iz(z + r);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = this.cells[j * this.nx + i];
        if (!list) continue;
        for (const ci of list) {
          if (this.stamp[ci] === s) continue;
          this.stamp[ci] = s;
          const c = this.cols[ci];
          if (x + r < c.bx0 || x - r > c.bx1 || z + r < c.bz0 || z - r > c.bz1) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // first hit along a segment (0..1), for keeping the camera out of houses
  raycast(x0, z0, x1, z1, minTop = -1e9) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(len / 1.2));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = x0 + dx * t, z = z0 + dz * t;
      const hits = this.query(x, z, 0.3);
      for (const c of hits) if (c.top > minTop && c.cam && circleVs(c, x, z, 0.3)) return Math.max(0, t - 1 / steps);
    }
    return 1;
  }
}

function boundsOf(c) {
  if (c.t === 'circle') return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  const cs = Math.abs(Math.cos(c.rot)), sn = Math.abs(Math.sin(c.rot));
  const ex = c.hx * cs + c.hz * sn, ez = c.hx * sn + c.hz * cs;
  return [c.cx - ex, c.cz - ez, c.cx + ex, c.cz + ez];
}

export function circleVs(c, x, z, r) {
  if (c.t === 'circle') {
    const dx = x - c.x, dz = z - c.z;
    const d2 = dx * dx + dz * dz, rr = r + c.r;
    if (d2 >= rr * rr) return null;
    const d = Math.sqrt(d2) || 1e-6;
    RES.nx = dx / d; RES.nz = dz / d; RES.depth = rr - d;
    return RES;
  }
  // oriented box: rotate into local frame (local x = (cos,-sin), local z = (sin,cos))
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const rx = x - c.cx, rz = z - c.cz;
  const lx = rx * cs - rz * sn, lz = rx * sn + rz * cs;
  const res = circleBox(lx, lz, r, -c.hx, -c.hz, c.hx, c.hz);
  if (!res) return null;
  const nx = res.nx * cs + res.nz * sn, nz = -res.nx * sn + res.nz * cs;
  res.nx = nx; res.nz = nz;
  return res;
}

function circleBox(x, z, r, x0, z0, x1, z1) {
  const qx = x < x0 ? x0 : x > x1 ? x1 : x;
  const qz = z < z0 ? z0 : z > z1 ? z1 : z;
  const dx = x - qx, dz = z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1e-10) {
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    RES.nx = dx / d; RES.nz = dz / d; RES.depth = r - d;
    return RES;
  }
  const pl = x - x0, pr = x1 - x, pt = z - z0, pb = z1 - z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) { RES.nx = -1; RES.nz = 0; } else if (m === pr) { RES.nx = 1; RES.nz = 0; }
  else if (m === pt) { RES.nx = 0; RES.nz = -1; } else { RES.nx = 0; RES.nz = 1; }
  RES.depth = m + r;
  return RES;
}

// an oriented box collider for a thing with heading h (rotation about y, three.js style:
// local +z = (sin h, cos h)), half sizes along its local x (width) and z (length)
export function obox(cx, cz, h, hx, hz, top, extra = {}) {
  // circleVs' frame: local x = (cos rot, -sin rot) – the same as three.js rotation.y = rot
  return { t: 'obox', cx, cz, hx, hz, rot: h, top, ...extra };
}
