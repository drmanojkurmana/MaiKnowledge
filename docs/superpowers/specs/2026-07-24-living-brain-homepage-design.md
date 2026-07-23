# MaiKnowledge — "Living Brain" Homepage Redesign

**Date:** 2026-07-24
**Status:** Design approved, pending implementation plan
**Site:** maiknowledge.in (Cloudflare Pages, buildless static)

## 1. Goal

Rebuild the MaiKnowledge homepage as an Active-Theory-caliber interactive
experience: high-fidelity WebGL graphics, smooth continuous transitions, and a
realistic human brain as the central hero element that drives the whole page.
The brain replaces Active Theory's animated tendril form as the centerpiece.

Keep the existing brand identity (dark, Apple-flavored, `#2997ff` blue,
SF Pro + Sacramento wordmark). This is a **full homepage redesign**, not a bolt-on
intro — the brain is the spine of the entire page.

### Non-goals

- No change to deployment (stays static on Cloudflare Pages, buildless).
- No change to the existing product content/messaging (StewardMD, KardiQ X AI,
  mission). We re-present it, we don't rewrite it.
- Not a photoreal medical render — the target is *stylized-realistic, modern,
  high-graphic* (custom shaders + postprocessing), matching Active Theory's
  "expensive" look rather than a textbook anatomy illustration.

## 2. Chosen approach

**Approach A — Persistent scroll-scrubbed brain.** One full-viewport WebGL canvas
holds the brain for the entire page. Scroll choreographs the camera and the
brain's lighting/position; content panels glide over the living 3D world.
Per-product "brain region lights up" behavior is folded in from the explorable-map
idea. A lighter static-brain path covers mobile and reduced-motion.

Rejected: **B** (hero-only centerpiece, then flat sections) — less continuous-world
magic; **C** (fully explorable clickable brain-map hub) — highest complexity, muddies
the marketing/conversion path.

## 3. The scene (persistent WebGL canvas)

A single fixed `<canvas id="brain-stage">` sits behind all page content
(`position: fixed; inset: 0; z-index: 0`), full viewport, for the whole page.
Content scrolls in the normal document above it (`z-index: 1+`).

**Brain geometry**

- A real anatomical brain mesh loaded from a **CC-licensed GLTF**, decimated to a
  web-friendly triangle budget and **Draco-compressed**. Stored in the repo
  (target < 3 MB compressed). Draco decoder loaded from CDN.
- Rendered as a **glowing wireframe / edge shell** (the "brain skeleton"): a
  custom fresnel rim-glow material (cyan→blue) over the mesh, so silhouettes and
  sulci edges catch the light. Interior faces render dark/translucent so it reads
  as a luminous shell, not a solid blob.

**Particle synapse system**

- ~12–15k GPU points seeded on the mesh surface (sampled from geometry) =
  "synapses." Rendered as additive soft sprites.
- A precomputed subset of nearest-neighbor **links** pulses with traveling light
  (animated dash / flow along the line). Random firings play continuously.
- Pointer raycast against a proxy sphere: particles near the cursor brighten and
  scatter slightly, then settle (the "reactive" feel).

**Materials & postprocessing (the "high-graphic" layer)**

- Fresnel rim-glow shader on the shell; additive synapse sprites.
- `EffectComposer` stack: **UnrealBloom** (the core glow), subtle **vignette**,
  faint **film grain**, and light **chromatic aberration** at the edges. Optional
  depth-of-field on capable devices for the "expensive" focus falloff.
- Tone mapping: ACES filmic; `sRGB` output; DPR-capped renderer.

**Idle life**

- Slow continuous rotation + gentle "breathing" scale.
- Subtle mouse parallax: brain tilts toward the cursor; camera drifts slightly.
- Continuous low-rate random synapse firings so the scene is never static.

## 4. Loader (Active-Theory-style intro)

1. Instant: black screen with the MaiK*nowledge* wordmark + a live percentage
   counter. Counter is tied to real asset load progress (Three.js modules, GLTF,
   Draco decoder, fonts) via a `LoadingManager`.
2. At 100%: particles **fly in from scattered positions and assemble** onto the
   wireframe shell (formation animation), bloom swells, counter fades.
3. Hero headline + nav reveal (staggered fade/translate).

Reduced-motion / low-end: skip the assemble animation, cross-fade straight to the
formed brain.

## 5. Scroll choreography (the spine)

A smooth-scroll layer (Lenis-style, via CDN or a small self-hosted lerp) produces
a single normalized progress value `p` ∈ [0,1] for the page. `p` drives a keyframe
timeline for camera position/target, brain rotation, which region lights, bloom
intensity, and particle behavior. Content panels are standard DOM, revealed with
IntersectionObserver + transforms, positioned to not collide with the brain's
current dock side.

Beats (progress values are targets, tunable in implementation):

| p    | Section         | Brain behavior                                             | Content |
|------|-----------------|------------------------------------------------------------|---------|
| 0.00 | Hero            | Centered, full, slow spin                                  | Headline "Clinical intelligence, alive", subhead, CTA, scroll cue |
| 0.20 | StewardMD       | Camera pushes in; frontal/temporal region lights **green** ("Live" pulse); brain docks **right** ~40% | Left panel: StewardMD, screenshots, "Live" badge, Try/Visit CTAs |
| 0.45 | KardiQ X AI     | Brain rotates; a different region lights **violet** (research); docks **left** | Right panel: KardiQ X AI, "coming soon" shimmer |
| 0.65 | Platform / "how MaiK thinks" | Brain returns center; dense **synapse storm** across whole surface | 3 value cards fade up ("the connective tissue" moment) |
| 0.80 | About / mission | Brain recedes + dims to a calm ambient state              | Centered mission statement |
| 1.00 | Footer / contact | Brain condenses to a small glowing **node** beside the wordmark | Links, CTA, contact |

## 6. Visual system

Reuse the current brand tokens (from `index.html` `#mk-root`):

- Background `#000` / `#0a0a0c`; text `#f5f5f7` / `#a1a1a6` / `#86868b`.
- Accent `#2997ff`; signature gradient `#8fb0ff → #2997ff`.
- Status hues reused for region lighting: live green `#30d158`, research violet
  `#bf5af2`, dev amber `#ff9f0a`.
- Type: SF Pro system stack; Sacramento for the wordmark tail (already self-hosted).
- Content panels: frosted-glass cards (`backdrop-filter: blur`, thin white border,
  soft shadow) — an elevation of the existing `--card` style — floating over the 3D.
- Large `clamp()` display headings for the cinematic feel.

## 7. Architecture (buildless)

Extend the existing static site — no build step, no repo restructure.

- `index.html`: add an **ESM importmap** pinning `three` and addons
  (`GLTFLoader`, `DRACOLoader`, `EffectComposer` + passes, controls helpers) to a
  CDN (esm.sh / jsDelivr / unpkg). WebGL init deferred until after first paint.
- New modules (ES modules, no bundler):
  - `brain-stage.js` — renderer, scene, camera, brain shell material, particle
    system, postprocessing, idle animation, pointer interaction, device tiering.
  - `scroll-choreography.js` — smooth-scroll integration, progress `p`, keyframe
    timeline mapping `p` → scene state, panel reveal coordination.
  - `loader.js` — `LoadingManager` wiring, percentage UI, assemble animation.
- New stylesheet `experience.css` for the canvas layer, panels, loader, layout.
- Assets: `assets/brain.glb` (Draco-compressed anatomical model); reuse existing
  fonts/wordmark. Draco decoder from CDN.
- Deploy path unchanged (Cloudflare Pages static). `.wrangler` / CNAME untouched.

### Module boundaries

- `brain-stage.js` owns *everything 3D*; exposes an imperative API
  (`setProgress(p)`, `lightRegion(name, color)`, `setQualityTier(tier)`,
  `setReducedMotion(bool)`). It knows nothing about page sections.
- `scroll-choreography.js` owns *the mapping* from scroll to that API and to DOM
  panel reveals. It knows the beats; it does not touch WebGL internals.
- `loader.js` owns *startup*; hands off to the other two when assets are ready.

This keeps each unit independently understandable and testable: the stage can be
driven manually (e.g. a debug slider) without any scroll logic.

## 8. Performance & mobile

Clinicians skew mobile, so graceful degradation is a first-class requirement.

- **Device tiering** at init (GPU hints, `deviceMemory`, DPR, coarse-pointer):
  - High: ~15k particles, full postprocessing (+ optional DoF), DPR ≤ 2.
  - Mid: ~8k particles, bloom + vignette only.
  - Low / mobile: ~4k particles, bloom softened or off, DPR capped ~1.5.
- Mobile may switch continuous camera moves to **discrete section snaps** if
  frame budget demands; touch drag gives light parallax (gyro optional, off by
  default).
- `prefers-reduced-motion`: static formed brain, no auto-spin/breathing, standard
  scroll reveals, loader skips assemble.
- WebGL initializes **after** first paint; wordmark + hero text show immediately
  so the page is never blank. Pause the render loop when the tab/canvas is hidden
  (visibility + IntersectionObserver).

## 9. Accessibility & SEO

- All copy is **real DOM** (headings, paragraphs, links, CTAs) layered over the
  canvas → fully crawlable and screen-reader accessible. Canvas is `aria-hidden`.
- Preserve current `<title>`, meta description, and OG tags.
- Logical keyboard focus order through nav → panels → CTAs; visible focus rings.
- Respect reduced-motion (above). Ensure text contrast over the dark scene meets
  WCAG AA (panels provide a solid/blur backing where needed).

## 10. Risks & open questions

- **GLTF sourcing/licensing:** need a CC-licensed anatomical brain suitable for
  decimation + Draco. Fallback: a procedural brain if no acceptable-license,
  low-poly-enough model is found. (Resolved direction: prefer real GLTF for the
  realistic look; procedural only as fallback.)
- **CDN reliability for ESM `three`:** pin a specific version; consider
  self-hosting the three build + Draco decoder in `assets/` if CDN latency or
  offline (native-app reuse) becomes a concern later.
- **Scroll choreography tuning** is inherently iterative — beat progress values
  and camera paths will be refined against the real model on-device.
- **Mobile frame budget** — validate the low tier on a mid-range phone early.

## 11. Success criteria

- Loads to an interactive, formed brain with a real progress-tied loader.
- Smooth 60fps idle + scroll on desktop high tier; ≥30fps stable on mid mobile.
- All five scroll beats choreograph the brain + reveal content without collisions.
- Existing content (StewardMD, KardiQ X, mission, contact) all present and
  crawlable; brand identity intact.
- Deploys unchanged on Cloudflare Pages; reduced-motion + low-end paths work.
