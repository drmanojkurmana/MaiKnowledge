// scroll-choreography.js — drives the brain from the REAL page sections: as each
// section crosses the viewport centre it becomes "active", easing the camera to a
// per-section focus and lighting the matching brain region.
import { normalizeProgress } from './scroll-easing.js?v=14';

function colorForSection(el) {
  const id = (el.id || '').toLowerCase();
  const txt = (el.textContent || '').toLowerCase().slice(0, 400);
  const has = (s) => id.includes(s) || txt.includes(s);
  if (has('steward')) return 0x30d158;                 // live green
  if (has('kardi') || has('ecg') || has('cardio') || has('research')) return 0xbf5af2; // research violet
  if (has('platform') || has('ecosystem')) return 0x2997ff; // accent blue
  if (has('vision') || has('future')) return 0x64d2ff;  // cyan
  return null; // default brand blue
}

export class ScrollChoreography {
  constructor(stage, { onSection } = {}) {
    this.stage = stage;
    this.onSection = onSection || (() => {});
    this.active = -1;
    this._running = false;
  }

  _collect() {
    const nodes = Array.from(document.querySelectorAll('#mk-root section, #mk-root header'));
    const list = nodes.length ? nodes : Array.from(document.querySelectorAll('section'));
    this.sections = list.map((el, i) => ({
      el,
      color: colorForSection(el),
      // Hero (first) sits centred and far; later sections alternate docking left/right.
      focus: i === 0
        ? { camX: 0, camZ: 8.4, rot: 0 }
        : { camX: i % 2 ? 1.9 : -1.9, camZ: 6.6, rot: i * 0.4 },
    }));
  }

  start() {
    this._running = true;
    this._collect();
    const tick = () => {
      if (!this._running) return;
      this._update();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _update() {
    const mid = window.innerHeight / 2;
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < this.sections.length; i++) {
      const r = this.sections[i].el.getBoundingClientRect();
      const c = r.top + r.height / 2;
      const d = Math.abs(c - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    this.stage.setProgress(normalizeProgress(window.scrollY, document.documentElement.scrollHeight, window.innerHeight));
    if (best !== this.active) {
      this.active = best;
      const s = this.sections[best];
      this.stage.setFocus(s.focus);
      this.stage.lightRegion(s.color);
      this.onSection(best, s.el.id || '');
    }
  }

  dispose() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}
