// quality.js — PURE (no three, no DOM). Device → quality tier.
export const TIER_SETTINGS = {
  high: { particles: 22000, dprCap: 2,    bloom: true,  dof: true  },
  mid:  { particles: 11000, dprCap: 1.75, bloom: true,  dof: false },
  low:  { particles: 5000,  dprCap: 1.5,  bloom: false, dof: false },
};

export function pickTier({ dpr, deviceMemory, coarsePointer, maxTextureSize }) {
  if (coarsePointer) return 'low';
  if (typeof deviceMemory === 'number' && deviceMemory <= 3) return 'low';
  if (typeof maxTextureSize === 'number' && maxTextureSize < 4096) return 'mid';
  if (typeof deviceMemory === 'number' && deviceMemory < 6) return 'mid';
  return 'high';
}
