// scroll-choreography.js — maps page scroll → brain-stage API + fires beat callbacks.
import { stepLerp, normalizeProgress } from './scroll-easing.js';

const BEATS = [
  { from: 0.0,  color: null },     // hero
  { from: 0.14, color: 0x30d158 }, // StewardMD (live green)
  { from: 0.38, color: 0xbf5af2 }, // KardiQ X (research violet)
  { from: 0.58, color: 0x2997ff }, // platform (accent)
  { from: 0.74, color: null },     // about (default)
  { from: 0.92, color: null },     // footer
];

export class ScrollChoreography {
  constructor(stage, { onBeat } = {}) {
    this.stage = stage;
    this.onBeat = onBeat || (() => {});
    this.raw = 0;
    this.smooth = 0;
    this.beat = -1;
    this._running = false;
    this._onScroll = () => {
      this.raw = normalizeProgress(window.scrollY, document.documentElement.scrollHeight, window.innerHeight);
    };
  }

  start() {
    this._running = true;
    window.addEventListener('scroll', this._onScroll, { passive: true });
    this._onScroll();
    const tick = () => {
      if (!this._running) return;
      this.smooth = stepLerp(this.smooth, this.raw, 0.12);
      this.stage.setProgress(this.smooth);
      const b = this._beatIndex(this.smooth);
      if (b !== this.beat) {
        this.beat = b;
        this.stage.lightRegion(BEATS[b].color);
        this.onBeat(b);
      }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _beatIndex(p) {
    let i = 0;
    for (let b = 0; b < BEATS.length; b++) if (p >= BEATS[b].from) i = b;
    return i;
  }

  dispose() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('scroll', this._onScroll);
  }
}
