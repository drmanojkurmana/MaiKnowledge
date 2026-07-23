// scroll-easing.js — PURE (no DOM). Smooth-scroll lerp + progress normalization.
export function stepLerp(current, target, factor) {
  const next = current + (target - current) * factor;
  return Math.abs(target - next) < 0.001 ? target : next;
}

export function normalizeProgress(scrollTop, scrollHeight, viewport) {
  const range = scrollHeight - viewport;
  if (range <= 0) return 0;
  const p = scrollTop / range;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
