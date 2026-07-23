// brain-math.js — PURE (no three, no DOM). Geometry + interpolation helpers.
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Uniform area-weighted sampling across triangles (positions = non-indexed triples).
export function sampleSurfacePoints(positions, count, rng) {
  const triCount = positions.length / 9;
  const areas = new Float32Array(triCount);
  let total = 0;
  const ax = [0, 0, 0], bx = [0, 0, 0], cx = [0, 0, 0];
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    for (let j = 0; j < 3; j++) {
      ax[j] = positions[o + j];
      bx[j] = positions[o + 3 + j];
      cx[j] = positions[o + 6 + j];
    }
    const e1 = [bx[0] - ax[0], bx[1] - ax[1], bx[2] - ax[2]];
    const e2 = [cx[0] - ax[0], cx[1] - ax[1], cx[2] - ax[2]];
    const cxp = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];
    const area = 0.5 * Math.hypot(cxp[0], cxp[1], cxp[2]);
    areas[t] = area;
    total += area;
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let r = rng() * total, t = 0;
    while (t < triCount - 1 && (r -= areas[t]) > 0) t++;
    const o = t * 9;
    let u = rng(), v = rng();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    for (let j = 0; j < 3; j++) {
      out[i * 3 + j] = w * positions[o + j] + u * positions[o + 3 + j] + v * positions[o + 6 + j];
    }
  }
  return out;
}

export function nearestNeighborLinks(points, k) {
  const n = points.length / 3;
  const pairs = new Set();
  for (let i = 0; i < n; i++) {
    const dists = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dx = points[i * 3] - points[j * 3];
      const dy = points[i * 3 + 1] - points[j * 3 + 1];
      const dz = points[i * 3 + 2] - points[j * 3 + 2];
      dists.push([dx * dx + dy * dy + dz * dz, j]);
    }
    dists.sort((a, b) => a[0] - b[0]);
    for (let m = 0; m < Math.min(k, dists.length); m++) {
      const j = dists[m][1];
      pairs.add(i < j ? `${i},${j}` : `${j},${i}`);
    }
  }
  return [...pairs].map((s) => s.split(',').map(Number));
}

export function lerpKeyframes(keyframes, p) {
  const kf = [...keyframes].sort((a, b) => a.at - b.at);
  const field = (o) => {
    const r = {};
    for (const key of Object.keys(o)) if (key !== 'at') r[key] = o[key];
    return r;
  };
  if (p <= kf[0].at) return field(kf[0]);
  if (p >= kf[kf.length - 1].at) return field(kf[kf.length - 1]);
  let i = 0;
  while (i < kf.length - 1 && kf[i + 1].at < p) i++;
  const a = kf[i], b = kf[i + 1];
  const t = (p - a.at) / (b.at - a.at);
  const out = {};
  for (const key of Object.keys(a)) if (key !== 'at') out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
}
