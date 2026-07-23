# Living Brain Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the maiknowledge.in homepage as an Active-Theory-style experience with a realistic anatomical brain (glowing wireframe shell + firing particle synapses) as a persistent, scroll-choreographed WebGL centerpiece.

**Architecture:** One fixed full-viewport WebGL canvas holds the brain for the whole page; page content scrolls above it as frosted-glass panels. A normalized scroll progress `p∈[0,1]` drives a keyframe timeline that moves the camera, rotates the brain, lights per-product regions, and tunes bloom. Pure logic (quality tiering, surface sampling, neighbor links, keyframe interpolation, smooth-scroll easing) is extracted into DOM-free, Three-free modules so it is unit-testable in Node; Three.js-dependent rendering is verified in-browser.

**Tech Stack:** Buildless static site. Three.js + addons (`GLTFLoader`, `DRACOLoader`, `EffectComposer`, `UnrealBloomPass`, `ShaderPass`) via an ESM importmap from a CDN. Vanilla ES modules, no bundler. Node's built-in `node:test`/`node:assert` for pure-logic tests. Deployed unchanged on Cloudflare Pages.

## Global Constraints

- **Buildless.** No bundler, no `package.json` dependency install for the shipped site. All browser deps load via an ESM importmap from a CDN. Deploy path (Cloudflare Pages static) is unchanged.
- **Brand tokens (verbatim, from `index.html` `#mk-root`):** bg `#000000`, bg-alt `#0a0a0c`, text `#f5f5f7`, text2 `#a1a1a6`, text3 `#86868b`, accent/link `#2997ff`, signature gradient `#8fb0ff → #2997ff`. Region hues: live green `#30d158`, research violet `#bf5af2`, dev amber `#ff9f0a`.
- **Fonts:** SF Pro system stack (already set on `body`); Sacramento for the wordmark tail (already self-hosted / linked). Do not change fonts.
- **Three.js version:** pin `three@0.169.0` exactly in the importmap (same version for `three` and every addon path).
- **Pure modules are Three-free and DOM-free:** `quality.js`, `brain-math.js`, `scroll-easing.js` must not `import` three and must not touch `window`/`document`, so `node --test` can import them directly.
- **Accessibility:** all copy stays real DOM; the canvas is `aria-hidden="true"`; respect `prefers-reduced-motion`; preserve existing `<title>`/meta/OG.
- **Copy:** sentence case for UI microcopy; keep existing product names (StewardMD, KardiQ X AI) and messaging.
- **Commits:** conventional-commit style, one per task, end with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

## File Structure

```
index.html                     (modify) importmap, canvas layer, layered sections, module <script type="module">
experience.css                 (create) canvas layer, loader, frosted panels, section layout, reduced-motion
js/quality.js                  (create) PURE: device → quality tier
js/brain-math.js               (create) PURE: surface sampling, neighbor links, keyframe lerp, helpers
js/scroll-easing.js            (create) PURE: smooth-scroll lerp + progress normalization math
js/brain-stage.js              (create) Three: renderer/scene/brain shell/particles/postfx/idle/pointer; imperative API
js/scroll-choreography.js      (create) maps scroll progress → brain-stage API + panel reveals (beats)
js/loader.js                   (create) LoadingManager %, wordmark screen, assemble handoff
js/main.js                     (create) entry: boot after first paint, wire loader → stage → choreography
assets/brain.glb               (create) Draco-compressed anatomical brain (or procedural fallback if unsourced)
test/quality.test.js           (create) node:test for quality.js
test/brain-math.test.js        (create) node:test for brain-math.js
test/scroll-easing.test.js     (create) node:test for scroll-easing.js
```

**Testing strategy.** Pure modules (`quality`, `brain-math`, `scroll-easing`) get real `node --test` unit tests (true TDD). Three/DOM modules are verified in-browser: serve the folder with `python3 -m http.server 8080`, load `http://localhost:8080/` with the Playwright MCP (`browser_navigate`), assert `browser_console_messages` shows **0 errors**, and confirm the described visual with a screenshot. Every visual task lists its exact expected observation.

**Local serve/verify commands (reused by visual tasks):**
```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge && python3 -m http.server 8080
```
Then in the browser tool: `browser_navigate("http://localhost:8080/")`, `browser_console_messages` (expect no `error` entries), `browser_take_screenshot`.

**Run all pure tests:**
```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge && node --test test/
```

---

### Task 1: Quality tiering (pure, TDD)

**Files:**
- Create: `js/quality.js`
- Test: `test/quality.test.js`

**Interfaces:**
- Produces: `pickTier({ dpr, deviceMemory, coarsePointer, maxTextureSize }) => 'high' | 'mid' | 'low'` and `TIER_SETTINGS: Record<'high'|'mid'|'low', { particles:number, dprCap:number, bloom:boolean, dof:boolean }>`.

- [ ] **Step 1: Write the failing test**

```js
// test/quality.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTier, TIER_SETTINGS } from '../js/quality.js';

test('coarse pointer (mobile) forces low', () => {
  assert.equal(pickTier({ dpr: 3, deviceMemory: 8, coarsePointer: true, maxTextureSize: 8192 }), 'low');
});
test('low memory forces low', () => {
  assert.equal(pickTier({ dpr: 2, deviceMemory: 2, coarsePointer: false, maxTextureSize: 8192 }), 'low');
});
test('small max texture forces mid at best', () => {
  assert.equal(pickTier({ dpr: 2, deviceMemory: 8, coarsePointer: false, maxTextureSize: 2048 }), 'mid');
});
test('strong desktop is high', () => {
  assert.equal(pickTier({ dpr: 2, deviceMemory: 8, coarsePointer: false, maxTextureSize: 8192 }), 'high');
});
test('tier settings scale particle count down', () => {
  assert.ok(TIER_SETTINGS.high.particles > TIER_SETTINGS.mid.particles);
  assert.ok(TIER_SETTINGS.mid.particles > TIER_SETTINGS.low.particles);
  assert.equal(TIER_SETTINGS.low.dof, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/quality.test.js`
Expected: FAIL — `Cannot find module '../js/quality.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// js/quality.js
export const TIER_SETTINGS = {
  high: { particles: 15000, dprCap: 2,   bloom: true,  dof: true  },
  mid:  { particles: 8000,  dprCap: 1.75, bloom: true,  dof: false },
  low:  { particles: 4000,  dprCap: 1.5,  bloom: false, dof: false },
};

export function pickTier({ dpr, deviceMemory, coarsePointer, maxTextureSize }) {
  if (coarsePointer) return 'low';
  if (typeof deviceMemory === 'number' && deviceMemory <= 3) return 'low';
  if (typeof maxTextureSize === 'number' && maxTextureSize < 4096) return 'mid';
  if (typeof deviceMemory === 'number' && deviceMemory < 6) return 'mid';
  return 'high';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/quality.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/quality.js test/quality.test.js
git commit -m "feat(brain): device quality tiering (pure, tested)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Brain math helpers (pure, TDD)

**Files:**
- Create: `js/brain-math.js`
- Test: `test/brain-math.test.js`

**Interfaces:**
- Produces:
  - `clamp01(x) => number`
  - `smoothstep(edge0, edge1, x) => number`
  - `mulberry32(seed) => () => number` (deterministic RNG in [0,1))
  - `sampleSurfacePoints(positions: Float32Array, count: number, rng: () => number) => Float32Array` — returns `count*3` floats sampled uniformly across the triangles defined by consecutive vertex triples in `positions` (non-indexed geometry).
  - `nearestNeighborLinks(points: Float32Array, k: number) => Array<[number, number]>` — unique undirected index pairs, each point linked to its `k` nearest others.
  - `lerpKeyframes(keyframes: Array<{ at:number, [k:string]: number }>, p: number) => Record<string, number>` — piecewise-linear interpolation of every numeric field (except `at`) across keyframes sorted by `at`; clamps outside range.

- [ ] **Step 1: Write the failing test**

```js
// test/brain-math.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clamp01, smoothstep, mulberry32, sampleSurfacePoints, nearestNeighborLinks, lerpKeyframes } from '../js/brain-math.js';

test('clamp01 clamps', () => {
  assert.equal(clamp01(-1), 0); assert.equal(clamp01(2), 1); assert.equal(clamp01(0.4), 0.4);
});
test('smoothstep endpoints', () => {
  assert.equal(smoothstep(0, 1, 0), 0); assert.equal(smoothstep(0, 1, 1), 1);
  assert.ok(smoothstep(0, 1, 0.5) > 0.49 && smoothstep(0, 1, 0.5) < 0.51);
});
test('mulberry32 deterministic', () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert.equal(a(), b());
});
test('sampleSurfacePoints returns count*3 finite floats on a triangle', () => {
  const tri = new Float32Array([0,0,0, 1,0,0, 0,1,0]); // one triangle in z=0
  const pts = sampleSurfacePoints(tri, 50, mulberry32(1));
  assert.equal(pts.length, 150);
  for (let i = 0; i < pts.length; i++) assert.ok(Number.isFinite(pts[i]));
  for (let i = 0; i < pts.length; i += 3) assert.ok(Math.abs(pts[i+2]) < 1e-6); // stays in plane
});
test('nearestNeighborLinks gives unique pairs', () => {
  const pts = new Float32Array([0,0,0, 1,0,0, 0,1,0, 5,5,5]);
  const links = nearestNeighborLinks(pts, 1);
  const seen = new Set(links.map(([a,b]) => a < b ? `${a}-${b}` : `${b}-${a}`));
  assert.equal(seen.size, links.length); // no duplicates
  assert.ok(links.length >= 2);
});
test('lerpKeyframes interpolates and clamps', () => {
  const kf = [{ at: 0, zoom: 10 }, { at: 1, zoom: 20 }];
  assert.equal(lerpKeyframes(kf, 0).zoom, 10);
  assert.equal(lerpKeyframes(kf, 0.5).zoom, 15);
  assert.equal(lerpKeyframes(kf, 2).zoom, 20); // clamp high
  assert.equal(lerpKeyframes(kf, -1).zoom, 10); // clamp low
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/brain-math.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// js/brain-math.js
export const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
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
  const ax = [0,0,0], bx = [0,0,0], cx = [0,0,0];
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    for (let j = 0; j < 3; j++) { ax[j] = positions[o+j]; bx[j] = positions[o+3+j]; cx[j] = positions[o+6+j]; }
    const e1 = [bx[0]-ax[0], bx[1]-ax[1], bx[2]-ax[2]];
    const e2 = [cx[0]-ax[0], cx[1]-ax[1], cx[2]-ax[2]];
    const cxp = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    const area = 0.5 * Math.hypot(cxp[0], cxp[1], cxp[2]);
    areas[t] = area; total += area;
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
      out[i*3+j] = w*positions[o+j] + u*positions[o+3+j] + v*positions[o+6+j];
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
      const dx = points[i*3]-points[j*3], dy = points[i*3+1]-points[j*3+1], dz = points[i*3+2]-points[j*3+2];
      dists.push([dx*dx+dy*dy+dz*dz, j]);
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
  if (p <= kf[0].at) return field(kf[0]);
  if (p >= kf[kf.length-1].at) return field(kf[kf.length-1]);
  let i = 0; while (i < kf.length - 1 && kf[i+1].at < p) i++;
  const a = kf[i], b = kf[i+1];
  const t = (p - a.at) / (b.at - a.at);
  const out = {};
  for (const key of Object.keys(a)) if (key !== 'at') out[key] = a[key] + (b[key] - a[key]) * t;
  return out;
  function field(o) { const r = {}; for (const key of Object.keys(o)) if (key !== 'at') r[key] = o[key]; return r; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/brain-math.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/brain-math.js test/brain-math.test.js
git commit -m "feat(brain): surface sampling, neighbor links, keyframe lerp (pure, tested)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Smooth-scroll easing math (pure, TDD)

**Files:**
- Create: `js/scroll-easing.js`
- Test: `test/scroll-easing.test.js`

**Interfaces:**
- Produces:
  - `stepLerp(current, target, factor) => number` — frame-rate-independent-ish lerp toward target.
  - `normalizeProgress(scrollTop, scrollHeight, viewport) => number` — page scroll → `p∈[0,1]` (guards divide-by-zero).

- [ ] **Step 1: Write the failing test**

```js
// test/scroll-easing.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepLerp, normalizeProgress } from '../js/scroll-easing.js';

test('stepLerp moves toward target', () => {
  const next = stepLerp(0, 10, 0.1);
  assert.ok(next > 0 && next < 10);
});
test('stepLerp snaps when close', () => {
  assert.equal(stepLerp(9.9999, 10, 0.1), 10);
});
test('normalizeProgress top is 0, bottom is 1', () => {
  assert.equal(normalizeProgress(0, 3000, 1000), 0);
  assert.equal(normalizeProgress(2000, 3000, 1000), 1);
});
test('normalizeProgress guards zero scroll range', () => {
  assert.equal(normalizeProgress(0, 500, 1000), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scroll-easing.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// js/scroll-easing.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/scroll-easing.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/scroll-easing.js test/scroll-easing.test.js
git commit -m "feat(scroll): smooth-scroll easing + progress normalization (pure, tested)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Canvas layer scaffold + importmap + deferred boot

**Files:**
- Modify: `index.html` (add importmap in `<head>`, `<canvas id="brain-stage">` as first child of `#mk-root`, module entry `<script type="module" src="js/main.js">` before `</body>`)
- Create: `experience.css` (linked from `<head>`)
- Create: `js/main.js`

**Interfaces:**
- Produces: a global boot that logs `"[brain] boot"` after first paint; `experience.css` defines `.brain-stage` (fixed, behind content) and `.exp-content` (raised) layers.

- [ ] **Step 1: Add the importmap and stylesheet link to `<head>`**

Add inside `<head>` (after existing stylesheet links):

```html
<link rel="stylesheet" href="experience.css?v=1">
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/"
  }
}
</script>
```

- [ ] **Step 2: Add the canvas + entry script to the body**

As the FIRST child inside `<div id="mk-root" ...>` (line ~51), add:

```html
<canvas id="brain-stage" class="brain-stage" aria-hidden="true"></canvas>
```

Immediately before `</body>`, add:

```html
<script type="module" src="js/main.js?v=1"></script>
```

- [ ] **Step 3: Create the layer stylesheet**

```css
/* experience.css — Living Brain experience layer */
.brain-stage {
  position: fixed; inset: 0; width: 100vw; height: 100vh;
  z-index: 0; display: block; pointer-events: none; background: #000;
}
#mk-root { position: relative; }
/* All existing page content must sit above the canvas */
#mk-nav, #mk-menu, main, section, footer, .exp-content { position: relative; z-index: 1; }
@media (prefers-reduced-motion: reduce) {
  .brain-stage { /* still shown; motion handled in JS */ }
}
```

- [ ] **Step 4: Create the deferred entry**

```js
// js/main.js
function boot() {
  console.log('[brain] boot');
  // Wiring added in later tasks (loader → stage → choreography).
}
if (document.readyState === 'complete') {
  requestAnimationFrame(boot);
} else {
  window.addEventListener('load', () => requestAnimationFrame(boot));
}
```

- [ ] **Step 5: Verify in browser**

Serve (`python3 -m http.server 8080`), `browser_navigate("http://localhost:8080/")`.
Expected: page renders as before with all existing content; `browser_console_messages` shows `[brain] boot` and **0 errors**; the `#brain-stage` canvas exists behind content (screenshot: existing page looks unchanged).

- [ ] **Step 6: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add index.html experience.css js/main.js
git commit -m "feat(brain): canvas layer scaffold, three importmap, deferred boot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: brain-stage renderer + scene + render loop

**Files:**
- Create: `js/brain-stage.js`
- Modify: `js/main.js` (import and start the stage)

**Interfaces:**
- Consumes: `pickTier`, `TIER_SETTINGS` from `js/quality.js`; `three`.
- Produces: `class BrainStage { constructor(canvas); start(); dispose(); tier: string }`. For this task the scene shows a temporary wireframe icosahedron so the loop is visible; replaced by the real brain in Task 6.

- [ ] **Step 1: Implement the stage (renderer, camera, resize, visibility-paused loop)**

```js
// js/brain-stage.js
import * as THREE from 'three';
import { pickTier, TIER_SETTINGS } from './quality.js';

export class BrainStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.tier = pickTier({
      dpr: window.devicePixelRatio || 1,
      deviceMemory: navigator.deviceMemory,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      maxTextureSize: this._maxTexture(canvas),
    });
    this.settings = TIER_SETTINGS[this.tier];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._applySize();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 6);

    // Temporary placeholder — replaced by the real brain in Task 6.
    this.placeholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.6, 2),
      new THREE.MeshBasicMaterial({ color: 0x2997ff, wireframe: true })
    );
    this.scene.add(this.placeholder);

    this._running = false;
    this._onResize = () => this._applySize();
    this._onVisibility = () => { if (document.hidden) this._stop(); else this.start(); };
  }

  _maxTexture(canvas) {
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 8192;
    } catch { return 8192; }
  }

  _applySize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.dprCap));
    this.renderer.setSize(w, h, false);
    if (this.camera) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  start() {
    if (this._running) return;
    this._running = true;
    window.addEventListener('resize', this._onResize);
    document.addEventListener('visibilitychange', this._onVisibility);
    const tick = () => {
      if (!this._running) return;
      this._frame();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _frame() {
    if (this.placeholder) this.placeholder.rotation.y += 0.003;
    this.renderer.render(this.scene, this.camera);
  }

  _stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  dispose() {
    this._stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.renderer.dispose();
  }
}
```

- [ ] **Step 2: Wire it into the entry**

Replace the body of `boot()` in `js/main.js`:

```js
// js/main.js
import { BrainStage } from './brain-stage.js';

function boot() {
  console.log('[brain] boot');
  const canvas = document.getElementById('brain-stage');
  const stage = new BrainStage(canvas);
  stage.start();
  window.__brainStage = stage; // debug handle
  console.log('[brain] tier', stage.tier);
}
if (document.readyState === 'complete') requestAnimationFrame(boot);
else window.addEventListener('load', () => requestAnimationFrame(boot));
```

- [ ] **Step 3: Verify in browser**

Serve + `browser_navigate`. Expected: a slowly rotating blue wireframe icosahedron behind the page content; console logs `[brain] tier high` (on desktop) and **0 errors**. Resize the window (`browser_resize`) → canvas fills viewport with no distortion.

- [ ] **Step 4: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/brain-stage.js js/main.js
git commit -m "feat(brain): renderer, scene, resize + visibility-paused render loop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Load the brain model (GLTF + Draco) with procedural fallback

**Files:**
- Modify: `js/brain-stage.js` (load `assets/brain.glb`; fallback to a lathe/noise brain-ish geometry if the asset is missing)
- Create: `assets/brain.glb` (sourced CC-licensed anatomical brain, decimated + Draco-compressed) — if not yet sourced, the fallback covers development.

**Interfaces:**
- Consumes: `GLTFLoader`, `DRACOLoader` from `three/addons/`.
- Produces: `stage.brainMesh: THREE.Mesh` (centered, unit-scaled to ~radius 1.8), `stage.ready: Promise<void>` that resolves when the model (or fallback) is in the scene. Removes the Task-5 placeholder.

- [ ] **Step 1: Add model loading + fallback**

In `js/brain-stage.js`, add imports and a `loadBrain()` method; call it from the constructor and store `this.ready`:

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// inside constructor, after scene/camera setup and BEFORE creating placeholder:
this.ready = this.loadBrain();

// new method:
async loadBrain() {
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
  const loader = new GLTFLoader(this.loadingManager || undefined);
  loader.setDRACOLoader(draco);
  let geometry;
  try {
    const gltf = await loader.loadAsync('assets/brain.glb?v=1');
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    geometry = mesh ? mesh.geometry : this._fallbackGeometry();
  } catch (e) {
    console.warn('[brain] model missing, using procedural fallback', e.message);
    geometry = this._fallbackGeometry();
  }
  geometry.computeVertexNormals();
  geometry.center();
  geometry = geometry.toNonIndexed(); // needed for surface sampling (Task 7)
  this._normalizeScale(geometry, 1.8);
  this.brainGeometry = geometry;
  this.brainMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x2997ff, wireframe: true }));
  if (this.placeholder) { this.scene.remove(this.placeholder); this.placeholder.geometry.dispose(); this.placeholder = null; }
  this.scene.add(this.brainMesh);
}

_fallbackGeometry() {
  // Two lobes: a scaled sphere pair merged via a noise-displaced icosphere approximates a brain mass.
  const g = new THREE.IcosahedronGeometry(1, 24);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const bump = 0.12 * Math.sin(x*8) * Math.cos(z*8) + 0.08 * Math.sin(y*10);
    const s = 1 + bump;
    pos.setXYZ(i, x*s*1.15, y*s*0.9, z*s);
  }
  pos.needsUpdate = true;
  return g;
}

_normalizeScale(geometry, target) {
  geometry.computeBoundingSphere();
  const r = geometry.boundingSphere.radius || 1;
  const s = target / r;
  geometry.scale(s, s, s);
}
```

Update `_frame()` to rotate `this.brainMesh` if present (else placeholder):

```js
_frame() {
  const obj = this.brainMesh || this.placeholder;
  if (obj) obj.rotation.y += 0.003;
  this.renderer.render(this.scene, this.camera);
}
```

- [ ] **Step 2: Verify in browser**

Serve + `browser_navigate`. Expected (with no `brain.glb` yet): console warns `[brain] model missing, using procedural fallback`, and a rotating brain-ish wireframe mass appears; **0 errors** (the warn is not an error). With a real `brain.glb` present: the anatomical wireframe brain appears. Screenshot confirms a brain-shaped wireframe.

- [ ] **Step 3: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/brain-stage.js
# add assets/brain.glb too once sourced:  git add assets/brain.glb
git commit -m "feat(brain): load GLTF+Draco brain with procedural fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Fresnel wireframe shell material

**Files:**
- Modify: `js/brain-stage.js` (replace the brain's basic wireframe with a fresnel rim-glow `ShaderMaterial`)

**Interfaces:**
- Produces: `stage.shellMaterial: THREE.ShaderMaterial` with uniforms `uColor` (THREE.Color), `uGlow` (float), `uTime` (float). Applied to `brainMesh`.

- [ ] **Step 1: Add the shell material and apply it**

Add a `_makeShell()` method and use it in `loadBrain()` instead of `MeshBasicMaterial`:

```js
_makeShell() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(0x2997ff) },
      uGlow:  { value: 1.0 },
      uTime:  { value: 0 },
    },
    vertexShader: `
      varying vec3 vN; varying vec3 vView;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uGlow; uniform float uTime;
      varying vec3 vN; varying vec3 vView;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.5);
        float pulse = 0.85 + 0.15 * sin(uTime * 1.5);
        gl_FragColor = vec4(uColor * fres * uGlow * pulse, fres);
      }`,
  });
}
```

In `loadBrain()`:

```js
this.shellMaterial = this._makeShell();
this.brainMesh = new THREE.Mesh(geometry, this.shellMaterial);
```

Advance `uTime` in `_frame()`:

```js
_frame() {
  const obj = this.brainMesh || this.placeholder;
  if (obj) obj.rotation.y += 0.003;
  if (this.shellMaterial) this.shellMaterial.uniforms.uTime.value = performance.now() / 1000;
  this.renderer.render(this.scene, this.camera);
}
```

- [ ] **Step 2: Verify in browser**

Serve + `browser_navigate`. Expected: the brain now reads as a luminous blue shell — bright glowing silhouette/edges, darker interior, gentle brightness pulse; **0 errors**. Screenshot confirms rim-glow rather than flat wireframe.

- [ ] **Step 3: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/brain-stage.js
git commit -m "feat(brain): fresnel rim-glow shell material

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Particle synapse points + firing links

**Files:**
- Modify: `js/brain-stage.js` (build a `THREE.Points` synapse cloud from `sampleSurfacePoints`, and animated `LineSegments` links from `nearestNeighborLinks`)

**Interfaces:**
- Consumes: `sampleSurfacePoints`, `nearestNeighborLinks`, `mulberry32` from `js/brain-math.js`.
- Produces: `stage.synapses: THREE.Points`, `stage.links: THREE.LineSegments`, both children of `brainMesh` (so they rotate with it). Particle count = `this.settings.particles`.

- [ ] **Step 1: Build particles + links after the brain geometry exists**

Add imports and a `_buildSynapses()` call at the end of `loadBrain()`:

```js
import { sampleSurfacePoints, nearestNeighborLinks, mulberry32 } from './brain-math.js';

// end of loadBrain(), after brainMesh added:
this._buildSynapses();

_buildSynapses() {
  const rng = mulberry32(1337);
  const pos = this.brainGeometry.attributes.position.array;
  const pts = sampleSurfacePoints(pos, this.settings.particles, rng);

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const seed = new Float32Array(this.settings.particles);
  for (let i = 0; i < seed.length; i++) seed[i] = rng();
  pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0x8fb0ff) }, uTime: { value: 0 }, uSize: { value: this.tier === 'low' ? 2.0 : 3.0 } },
    vertexShader: `
      attribute float aSeed; uniform float uTime; uniform float uSize; varying float vFire;
      void main() {
        vFire = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 40.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (1.0 + vFire) * (300.0 / -mv.z);
      }`,
    fragmentShader: `
      varying float vFire; uniform vec3 uColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * (0.4 + 0.6 * vFire);
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  this.synapses = new THREE.Points(pGeo, pMat);
  this.brainMesh.add(this.synapses);

  // Links: cap for perf (subset of nearest-neighbor pairs).
  const linkCap = this.tier === 'low' ? 400 : this.tier === 'mid' ? 1200 : 2500;
  const links = nearestNeighborLinks(pts, 2).slice(0, linkCap);
  const lp = new Float32Array(links.length * 6);
  for (let i = 0; i < links.length; i++) {
    const [a, b] = links[i];
    lp.set([pts[a*3],pts[a*3+1],pts[a*3+2], pts[b*3],pts[b*3+1],pts[b*3+2]], i*6);
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  const lMat = new THREE.LineBasicMaterial({ color: 0x2997ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
  this.links = new THREE.LineSegments(lGeo, lMat);
  this.brainMesh.add(this.links);
}
```

Advance the particle time + a firing opacity on links in `_frame()`:

```js
// in _frame(), before render:
const t = performance.now() / 1000;
if (this.synapses) this.synapses.material.uniforms.uTime.value = t;
if (this.links) this.links.material.opacity = 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.3));
```

- [ ] **Step 2: Verify in browser**

Serve + `browser_navigate`. Expected: thousands of soft blue points cover the brain surface and twinkle/fire; faint additive link lines pulse across it; **0 errors**. On a coarse-pointer emulation (`browser_resize` to mobile) a reload yields visibly fewer particles (low tier). Screenshot confirms the particle synapse look.

- [ ] **Step 3: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/brain-stage.js
git commit -m "feat(brain): particle synapses + firing neighbor links

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Postprocessing (bloom, vignette, grain, chromatic) by tier

**Files:**
- Modify: `js/brain-stage.js` (add `EffectComposer` pipeline gated by `this.settings.bloom`)

**Interfaces:**
- Consumes: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `ShaderPass` from `three/addons/`.
- Produces: `stage.composer` (used instead of direct render when bloom enabled); `stage.setBloom(strength:number)` for choreography (Task 11).

- [ ] **Step 1: Add the composer + a combined vignette/grain/chromatic pass**

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// call after scene/camera ready (e.g. end of constructor):
this._initPost();

_initPost() {
  if (!this.settings.bloom) { this.composer = null; return; }
  this.composer = new EffectComposer(this.renderer);
  this.composer.addPass(new RenderPass(this.scene, this.camera));
  this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.6, 0.85);
  this.composer.addPass(this.bloom);
  this.composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.0018 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uAmount; varying vec2 vUv;
      float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 d = (vUv - 0.5) * uAmount;
        vec3 col;
        col.r = texture2D(tDiffuse, vUv + d).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - d).b;
        float vig = smoothstep(0.9, 0.35, distance(vUv, vec2(0.5)));
        col *= vig;
        col += (rand(vUv + uTime) - 0.5) * 0.03;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  this._post = this.composer.passes[2];
}

setBloom(strength) { if (this.bloom) this.bloom.strength = strength; }
```

Handle resize + render path:

```js
// in _applySize(), after renderer.setSize:
if (this.composer) this.composer.setSize(w, h);

// replace the render call in _frame():
if (this._post) this._post.uniforms.uTime.value = t;
if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
```

- [ ] **Step 2: Verify in browser**

Serve + `browser_navigate`. Expected: the glow blooms softly, edges show faint chromatic fringing, corners darken (vignette), a fine grain is visible; **0 errors**. Emulate mobile/low tier → composer is null and the scene still renders (no bloom) without error.

- [ ] **Step 3: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/brain-stage.js
git commit -m "feat(brain): postprocessing pipeline (bloom, vignette, grain, chromatic)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Idle life + pointer interaction + imperative API

**Files:**
- Modify: `js/brain-stage.js` (breathing scale, mouse parallax, pointer raycast scatter; add `setProgress`, `lightRegion`, `setReducedMotion` API stubs used by choreography)

**Interfaces:**
- Produces:
  - `setProgress(p: number)` — stores target progress (consumed in Task 11).
  - `lightRegion(color: number|null)` — cross-fades the shell/particle color toward `color` (null = default blue).
  - `setReducedMotion(on: boolean)` — disables auto-rotation/breathing/parallax when true.
  - `pointer: {x:number,y:number}` updated from mouse move (normalized -1..1).

- [ ] **Step 1: Add interaction + API**

```js
// in constructor:
this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
this.pointer = { x: 0, y: 0 };
this._targetColor = new THREE.Color(0x2997ff);
this._progress = 0;
window.addEventListener('pointermove', (e) => {
  this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  this.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
});

setProgress(p) { this._progress = p; }
lightRegion(color) { this._targetColor.set(color == null ? 0x2997ff : color); }
setReducedMotion(on) { this.reducedMotion = on; }

// in _frame(), replace rotation block:
const obj = this.brainMesh || this.placeholder;
if (obj) {
  if (!this.reducedMotion) {
    obj.rotation.y += 0.0025;
    const breathe = 1 + 0.02 * Math.sin(t * 0.8);
    obj.scale.setScalar(breathe);
    obj.rotation.x += (this.pointer.y * 0.25 - obj.rotation.x) * 0.05;
    obj.rotation.z += (this.pointer.x * 0.12 - obj.rotation.z) * 0.05;
  }
}
if (this.shellMaterial) this.shellMaterial.uniforms.uColor.value.lerp(this._targetColor, 0.05);
```

- [ ] **Step 2: Verify in browser**

Serve + `browser_navigate`. Expected: brain breathes and drifts toward the cursor as the mouse moves (`browser_hover` at different coords), color stays blue; calling `window.__brainStage.lightRegion(0x30d158)` in `browser_evaluate` cross-fades the shell to green over ~1s; `window.__brainStage.setReducedMotion(true)` stops rotation/breathing. **0 errors**.

- [ ] **Step 3: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/brain-stage.js
git commit -m "feat(brain): idle breathing, pointer parallax, region-color + reduced-motion API

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Scroll choreography (camera timeline + smooth scroll)

**Files:**
- Create: `js/scroll-choreography.js`
- Modify: `js/brain-stage.js` (consume progress each frame to move camera + brain via keyframes)
- Modify: `js/main.js` (start choreography after stage ready)

**Interfaces:**
- Consumes: `stepLerp`, `normalizeProgress` from `js/scroll-easing.js`; `lerpKeyframes` from `js/brain-math.js`; the `BrainStage` API.
- Produces: `class ScrollChoreography { constructor(stage, { onBeat }); start(); dispose() }`. It computes smoothed page progress and calls `stage.setProgress(p)` and, on beat changes, `stage.lightRegion(color)` + `onBeat(index)`.
- Adds `stage.CAMERA_KEYFRAMES` and consumption in `_frame()`.

- [ ] **Step 1: Add camera keyframes + progress consumption to the stage**

```js
// js/brain-stage.js — near top of module (after imports):
import { lerpKeyframes } from './brain-math.js';
const CAMERA_KEYFRAMES = [
  { at: 0.00, camX: 0.0,  camZ: 6.0, rotOffset: 0.0,  bloom: 0.9 },
  { at: 0.20, camX: 1.6,  camZ: 4.6, rotOffset: 0.6,  bloom: 1.1 }, // StewardMD (brain docks right → camera offset left)
  { at: 0.45, camX: -1.6, camZ: 4.6, rotOffset: 1.4,  bloom: 1.1 }, // KardiQ X (docks left)
  { at: 0.65, camX: 0.0,  camZ: 5.2, rotOffset: 2.2,  bloom: 1.6 }, // platform synapse storm
  { at: 0.80, camX: 0.0,  camZ: 7.2, rotOffset: 2.6,  bloom: 0.5 }, // about (recede/dim)
  { at: 1.00, camX: 2.4,  camZ: 8.5, rotOffset: 3.0,  bloom: 0.3 }, // footer node
];

// smoothed progress + apply, inside _frame() (before render), guarded on brainMesh:
this._smoothP = this._smoothP == null ? this._progress : this._smoothP + (this._progress - this._smoothP) * 0.08;
const k = lerpKeyframes(CAMERA_KEYFRAMES, this._smoothP);
this.camera.position.x += (k.camX - this.camera.position.x) * 0.06;
this.camera.position.z += (k.camZ - this.camera.position.z) * 0.06;
this.camera.lookAt(0, 0, 0);
if (this.brainMesh && !this.reducedMotion) this.brainMesh.rotation.y = k.rotOffset + t * 0.05;
this.setBloom(k.bloom);
```

(Remove the plain `obj.rotation.y += ...` auto-spin added in Task 10 so keyframe `rotOffset` drives yaw; keep breathing/parallax.)

- [ ] **Step 2: Implement the choreography controller**

```js
// js/scroll-choreography.js
import { stepLerp, normalizeProgress } from './scroll-easing.js';

const BEATS = [
  { from: 0.00, color: null },        // hero
  { from: 0.14, color: 0x30d158 },    // StewardMD (live green)
  { from: 0.38, color: 0xbf5af2 },    // KardiQ X (research violet)
  { from: 0.58, color: 0x2997ff },    // platform (accent)
  { from: 0.74, color: null },        // about (default)
  { from: 0.92, color: null },        // footer
];

export class ScrollChoreography {
  constructor(stage, { onBeat } = {}) {
    this.stage = stage;
    this.onBeat = onBeat || (() => {});
    this.raw = 0; this.smooth = 0; this.beat = -1;
    this._onScroll = () => { this.raw = normalizeProgress(window.scrollY, document.body.scrollHeight, window.innerHeight); };
    this._running = false;
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
      if (b !== this.beat) { this.beat = b; this.stage.lightRegion(BEATS[b].color); this.onBeat(b); }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  _beatIndex(p) { let i = 0; for (let b = 0; b < BEATS.length; b++) if (p >= BEATS[b].from) i = b; return i; }
  dispose() { this._running = false; if (this._raf) cancelAnimationFrame(this._raf); window.removeEventListener('scroll', this._onScroll); }
}
```

- [ ] **Step 3: Wire into entry**

```js
// js/main.js
import { BrainStage } from './brain-stage.js';
import { ScrollChoreography } from './scroll-choreography.js';

async function boot() {
  console.log('[brain] boot');
  const stage = new BrainStage(document.getElementById('brain-stage'));
  window.__brainStage = stage;
  stage.start();
  await stage.ready;
  const choreo = new ScrollChoreography(stage, { onBeat: (i) => console.log('[brain] beat', i) });
  choreo.start();
  window.__brainChoreo = choreo;
}
if (document.readyState === 'complete') requestAnimationFrame(boot);
else window.addEventListener('load', () => requestAnimationFrame(boot));
```

- [ ] **Step 4: Verify in browser**

Serve + `browser_navigate`. Scroll the page (`browser_evaluate("window.scrollTo(0, document.body.scrollHeight*0.3)")` etc.). Expected: as you scroll, the camera glides sideways/in-out and the brain color shifts green → violet → blue at the beat thresholds; console logs `[brain] beat N`; **0 errors**. Motion is smooth (eased), not jumpy.

- [ ] **Step 5: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/scroll-choreography.js js/brain-stage.js js/main.js
git commit -m "feat(scroll): camera keyframe timeline + beat region lighting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Restructure homepage content into layered beat sections

**Files:**
- Modify: `index.html` (wrap existing content into six full-height beat sections layered over the canvas, in beat order, reusing existing copy; add IntersectionObserver reveal hook)
- Modify: `experience.css` (frosted-glass panels, dock-side layout, section min-height, reveal states)

**Interfaces:**
- Produces: six `<section class="beat" data-beat="N" data-dock="left|right|center">` blocks with `.beat-panel` content; panels reveal via a small IntersectionObserver added to `js/main.js`.

- [ ] **Step 1: Restructure the body sections**

Wrap the existing content regions into beat sections. Keep the existing nav (`#mk-nav`) and menu (`#mk-menu`). Convert the current hero into `data-beat="0"`, the StewardMD section (`#stewardmd`) into `data-beat="1"` with `data-dock="right"`, the KardiQ/ecosystem product into `data-beat="2"` `data-dock="left"`, the platform/values into `data-beat="3"` `data-dock="center"`, the mission/about into `data-beat="4"`, and the `<footer>` region into `data-beat="5"`. Preserve all existing text/links/images verbatim inside `.beat-panel`. Example wrapper for the hero:

```html
<section class="beat" data-beat="0" data-dock="center" id="top">
  <div class="beat-panel" data-reveal>
    <h1 class="beat-title">Clinical intelligence, alive</h1>
    <p class="beat-sub">AI, software, and medical technology — starting with StewardMD.</p>
    <a class="beat-cta" href="#stewardmd">Explore</a>
    <div class="scroll-cue" aria-hidden="true"></div>
  </div>
</section>
```

(Repeat the wrapper pattern for beats 1–5, moving the existing StewardMD / product / mission / footer markup inside each `.beat-panel`. Do not delete existing copy — relocate it.)

- [ ] **Step 2: Add panel + layout styles**

```css
/* experience.css — beat sections */
.beat { min-height: 100vh; display: flex; align-items: center; padding: 8vh 6vw; }
.beat[data-dock="right"]  { justify-content: flex-start; }  /* brain sits right → panel left */
.beat[data-dock="left"]   { justify-content: flex-end; }
.beat[data-dock="center"] { justify-content: center; text-align: center; }
.beat-panel {
  max-width: 520px; padding: 28px 32px; border-radius: 18px;
  background: rgba(22,22,23,.55); backdrop-filter: blur(18px) saturate(1.2);
  -webkit-backdrop-filter: blur(18px) saturate(1.2);
  border: 1px solid rgba(255,255,255,.12); box-shadow: 0 12px 40px rgba(0,0,0,.4);
}
.beat[data-dock="center"] .beat-panel { background: transparent; backdrop-filter: none; border: none; box-shadow: none; }
.beat-title { font-size: clamp(34px, 6vw, 72px); font-weight: 600; letter-spacing: -.03em; margin: 0 0 12px; color: #f5f5f7; }
.beat-sub   { font-size: clamp(16px, 2vw, 21px); color: #a1a1a6; margin: 0 0 24px; }
.beat-cta   { display: inline-block; padding: 12px 26px; border-radius: 999px; background: #2997ff; color: #fff; font-weight: 600; }
[data-reveal] { opacity: 0; transform: translateY(28px); transition: opacity .9s cubic-bezier(.28,.11,.32,1), transform .9s cubic-bezier(.28,.11,.32,1); }
[data-reveal].is-in { opacity: 1; transform: none; }
.scroll-cue { width: 22px; height: 34px; margin: 32px auto 0; border: 2px solid rgba(255,255,255,.4); border-radius: 12px; }
```

- [ ] **Step 3: Add the reveal observer to the entry**

Append to `boot()` in `js/main.js`:

```js
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) e.target.classList.add('is-in');
}, { threshold: 0.2 });
document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
```

- [ ] **Step 4: Verify in browser**

Serve + `browser_navigate`. Expected: six full-height sections over the living brain; hero centered; StewardMD panel on the left while the brain is docked right; KardiQ panel on the right; panels fade/rise in on scroll; all original copy present. `browser_snapshot` shows headings/links as real DOM text; **0 errors**.

- [ ] **Step 5: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add index.html experience.css js/main.js
git commit -m "feat(home): layered beat sections with frosted panels over the brain

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Loader (progress %, wordmark screen, assemble handoff)

**Files:**
- Create: `js/loader.js`
- Modify: `js/brain-stage.js` (accept a `THREE.LoadingManager`; add an `assemble()` animation that flies particles in from scattered positions), `js/main.js` (show loader, tie to manager, run assemble, then reveal)
- Modify: `experience.css` (loader overlay)

**Interfaces:**
- Consumes: `THREE.LoadingManager`.
- Produces: `class Loader { constructor(); attachTo(manager); onComplete(cb); setReducedMotion(on) }` rendering `#brain-loader` with the wordmark + a `%` counter; `stage.assemble(): Promise<void>` that animates particle positions from a scattered start to their sampled positions (skipped instantly when reduced-motion).

- [ ] **Step 1: Add loader overlay markup + styles**

Add as first child of `<body>` (above `#mk-root`):

```html
<div id="brain-loader" role="status" aria-live="polite">
  <div class="loader-mark"><span class="lm-a">MaiK</span><span class="lm-b">nowledge</span></div>
  <div class="loader-pct">0<span>%</span></div>
</div>
```

```css
/* experience.css — loader */
#brain-loader { position: fixed; inset: 0; z-index: 10; background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; transition: opacity .8s ease; }
#brain-loader.done { opacity: 0; pointer-events: none; }
.loader-mark { font-size: 28px; color: #f5f5f7; }
.loader-mark .lm-b { font-family: 'Sacramento', cursive; background: linear-gradient(105deg,#8fb0ff,#2997ff); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.loader-pct { font-variant-numeric: tabular-nums; color: #a1a1a6; font-size: 15px; }
```

- [ ] **Step 2: Implement the loader controller**

```js
// js/loader.js
export class Loader {
  constructor() {
    this.el = document.getElementById('brain-loader');
    this.pct = this.el.querySelector('.loader-pct');
    this._cb = () => {}; this.reduced = false; this._shown = 0;
  }
  attachTo(manager) {
    manager.onProgress = (_url, loaded, total) => this._set(total ? loaded / total : 0);
    manager.onLoad = () => this._set(1);
  }
  _set(frac) {
    const target = Math.round(frac * 100);
    const step = () => {
      if (this._shown < target) { this._shown++; this.pct.firstChild.textContent = String(this._shown); requestAnimationFrame(step); }
    };
    step();
  }
  onComplete(cb) { this._cb = cb; }
  setReducedMotion(on) { this.reduced = on; }
  finish() { this.el.classList.add('done'); setTimeout(() => this.el.remove(), 900); this._cb(); }
}
```

- [ ] **Step 3: Add LoadingManager + assemble to the stage**

```js
// js/brain-stage.js — constructor accepts a manager:
constructor(canvas, loadingManager) { this.loadingManager = loadingManager; /* ...rest unchanged... */ }
// use it in loadBrain(): const loader = new GLTFLoader(this.loadingManager);

// assemble(): stash the sampled target positions in _buildSynapses, then animate from scattered.
// in _buildSynapses(), after creating pts: this._targetPositions = pts.slice();
assemble() {
  return new Promise((resolve) => {
    if (this.reducedMotion || !this.synapses) return resolve();
    const attr = this.synapses.geometry.attributes.position;
    const target = this._targetPositions;
    const start = new Float32Array(target.length);
    for (let i = 0; i < target.length; i++) start[i] = target[i] + (Math.random() - 0.5) * 8;
    attr.array.set(start);
    attr.needsUpdate = true;
    const t0 = performance.now();
    const dur = 1600;
    const anim = () => {
      const e = Math.min(1, (performance.now() - t0) / dur);
      const k = 1 - Math.pow(1 - e, 3);
      for (let i = 0; i < target.length; i++) attr.array[i] = start[i] + (target[i] - start[i]) * k;
      attr.needsUpdate = true;
      if (e < 1) requestAnimationFrame(anim); else resolve();
    };
    requestAnimationFrame(anim);
  });
}
```

(Note: `Math.random()` here is presentation-only jitter, acceptable in the browser.)

- [ ] **Step 4: Wire the loader into boot**

```js
// js/main.js
import * as THREE from 'three';
import { Loader } from './loader.js';
// ...
async function boot() {
  const manager = new THREE.LoadingManager();
  const loader = new Loader();
  loader.attachTo(manager);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  loader.setReducedMotion(reduced);
  const stage = new BrainStage(document.getElementById('brain-stage'), manager);
  window.__brainStage = stage; stage.start();
  await stage.ready;
  await stage.assemble();
  loader.finish();
  const choreo = new ScrollChoreography(stage, { onBeat: (i) => console.log('[brain] beat', i) });
  choreo.start(); window.__brainChoreo = choreo;
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('is-in')), { threshold: 0.2 });
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
}
```

- [ ] **Step 5: Verify in browser**

Serve + `browser_navigate` (throttle network if possible). Expected: black loader with wordmark + a counter climbing to 100%, then particles fly in and assemble onto the brain, loader fades out, hero reveals; **0 errors**. With reduced-motion emulation, the loader still counts and fades but particles appear already formed.

- [ ] **Step 6: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add js/loader.js js/brain-stage.js js/main.js index.html experience.css
git commit -m "feat(brain): progress loader + particle assemble intro

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: Reduced-motion + mobile fallback, a11y/SEO, and perf pass

**Files:**
- Modify: `js/main.js`, `js/brain-stage.js`, `js/scroll-choreography.js`, `index.html`, `experience.css`

**Interfaces:**
- Consumes: everything above. No new exported symbols.

- [ ] **Step 1: Reduced-motion + mobile behavior**

Ensure reduced-motion path is fully wired: `stage.setReducedMotion(reduced)` called in boot; when reduced, choreography still sets progress (camera eases) but the brain does not auto-rotate/breathe (already guarded in `_frame`). For coarse-pointer (mobile), pointer parallax is a no-op (no pointer) — confirm no error; keep low tier's reduced particles.

- [ ] **Step 2: Accessibility + SEO checks**

Confirm in `index.html`: canvas has `aria-hidden="true"`; existing `<title>`, `<meta name="description">`, and OG tags are unchanged; every beat panel's content is real DOM; nav → panels → CTAs form a logical tab order (add `tabindex` only where a non-native control needs it — none expected). Verify contrast of `.beat-title`/`.beat-sub` over the dark scene (panels already provide backing).

- [ ] **Step 3: Perf guards**

Confirm the render loop pauses on `visibilitychange` (Task 5) and add an IntersectionObserver that stops the loop when the canvas is fully scrolled out is unnecessary (canvas is fixed/full-viewport) — instead cap DPR (done) and ensure `assemble` runs once. Add `if (this.composer) this.composer.setSize` on resize (done in Task 9).

- [ ] **Step 4: Verify**

Run all pure tests: `node --test test/` → all pass.
Serve + `browser_navigate`:
- Desktop: smooth idle + scroll, bloom on; `browser_console_messages` → **0 errors**.
- `browser_resize` to mobile (375×812) + reload: fewer particles, no bloom, no crash; scroll still choreographs; **0 errors**.
- Reduced-motion (`browser_navigate` with `prefers-reduced-motion` emulation, or set `matchMedia` stub): brain static, standard reveals, loader still completes; **0 errors**.
- `browser_snapshot`: all headings, product copy, and links present as text.

- [ ] **Step 5: Commit**

```bash
cd /Users/diwakarkumar/Developer/MaiKnowledge
git add -A
git commit -m "feat(home): reduced-motion + mobile fallback, a11y/SEO, perf guards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §3 scene (shell + particles + links + postfx + idle) → Tasks 6–10. ✓
- §4 loader (progress %, assemble) → Task 13. ✓
- §5 scroll choreography (progress, beats, region lighting, dock sides) → Tasks 11–12. ✓
- §6 visual system (brand tokens, frosted panels, wordmark) → Tasks 4/12/13 (Global Constraints hold values verbatim). ✓
- §7 architecture (buildless importmap, module boundaries, GLTF+Draco, unchanged deploy) → Tasks 4–6; module split matches spec. ✓
- §8 performance & mobile (tiering, DPR cap, visibility pause, reduced-motion) → Tasks 1, 5, 9, 14. ✓
- §9 a11y & SEO (aria-hidden canvas, real DOM copy, meta preserved, focus order) → Tasks 4, 12, 14. ✓
- §10 risks (GLTF sourcing) → Task 6 procedural fallback keeps development unblocked. ✓

**Placeholder scan:** No "TBD/TODO"; every code step shows complete code; verification steps give exact expected observations. The only intentional deferral is `assets/brain.glb` sourcing, which Task 6 explicitly handles with a working procedural fallback.

**Type consistency:** API names are stable across tasks — `setProgress`, `lightRegion`, `setReducedMotion`, `setBloom`, `assemble`, `ready`; pure exports `pickTier`/`TIER_SETTINGS`, `sampleSurfacePoints`/`nearestNeighborLinks`/`mulberry32`/`lerpKeyframes`/`clamp01`/`smoothstep`, `stepLerp`/`normalizeProgress`. Keyframe field names (`camX`, `camZ`, `rotOffset`, `bloom`) are consistent between `CAMERA_KEYFRAMES` and its consumer.
