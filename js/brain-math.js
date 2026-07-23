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
// Uses a cumulative-area table + binary search so it stays O(count · log tris).
export function sampleSurfacePoints(positions, count, rng) {
  const triCount = positions.length / 9;
  const cum = new Float32Array(triCount); // prefix sum of triangle areas
  let total = 0;
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ax = positions[o], ay = positions[o + 1], az = positions[o + 2];
    const bx = positions[o + 3], by = positions[o + 4], bz = positions[o + 5];
    const cx = positions[o + 6], cy = positions[o + 7], cz = positions[o + 8];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const crx = e1y * e2z - e1z * e2y;
    const cry = e1z * e2x - e1x * e2z;
    const crz = e1x * e2y - e1y * e2x;
    total += 0.5 * Math.hypot(crx, cry, crz);
    cum[t] = total;
  }
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = rng() * total;
    let lo = 0, hi = triCount - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
    const o = lo * 9;
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
