// loader.js — progress %, wordmark screen, fade-out handoff.
export class Loader {
  constructor() {
    this.el = document.getElementById('brain-loader');
    this.pct = this.el.querySelector('.loader-pct-num');
    this._cb = () => {};
    this.reduced = false;
    this._shown = 0;
  }

  attachTo(manager) {
    manager.onProgress = (_url, loaded, total) => this._set(total ? loaded / total : 0);
    manager.onLoad = () => this._set(1);
    manager.onError = () => this._set(1);
  }

  // Safety valve: if no assets ever report (all cached / procedural), still climb to 100%.
  autoAdvance() {
    let f = 0;
    const step = () => {
      f = Math.min(1, f + 0.04);
      this._set(f);
      if (f < 1 && this._shown < 100) this._t = setTimeout(step, 40);
    };
    this._t = setTimeout(step, 40);
  }

  _set(frac) {
    const target = Math.round(frac * 100);
    const climb = () => {
      if (this._shown < target) {
        this._shown++;
        this.pct.textContent = String(this._shown);
        requestAnimationFrame(climb);
      }
    };
    climb();
  }

  onComplete(cb) { this._cb = cb; }
  setReducedMotion(on) { this.reduced = on; }

  finish() {
    if (this._t) clearTimeout(this._t);
    this._set(1);
    this.el.classList.add('done');
    setTimeout(() => this.el.remove(), 900);
    this._cb();
  }
}
