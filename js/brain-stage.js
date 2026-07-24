// brain-stage.js — Three.js scene: anatomical brain (cerebrum + cerebellum + brainstem)
// as glowing wireframe shell + firing particle synapses, with postprocessing (bloom,
// vignette/grain/chromatic, depth-of-field), cursor synapse bursts, and a click pulse.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { pickTier, TIER_SETTINGS } from './quality.js?v=13';
import { sampleSurfacePoints, nearestNeighborLinks, mulberry32 } from './brain-math.js?v=13';
import { buildSkeleton } from './skeleton.js?v=13';
import { buildRealSkeleton } from './skeleton-real.js?v=13';

const BURST_MAX = 240; // cursor-trail synapse burst particles

function easeOutBack(e) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(e - 1, 3) + c1 * Math.pow(e - 1, 2);
}

export class BrainStage {
  constructor(canvas, loadingManager) {
    this.canvas = canvas;
    this.loadingManager = loadingManager;
    this.tier = pickTier({
      dpr: window.devicePixelRatio || 1,
      deviceMemory: navigator.deviceMemory,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      maxTextureSize: this._maxTexture(canvas),
    });
    this.settings = TIER_SETTINGS[this.tier];
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 8.4);

    this.pointer = { x: 0, y: 0 };
    this._pointerWorld = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this._targetColor = new THREE.Color(0xffffff);
    this._progress = 0;
    this._pulse = 0;
    this._focus = { camX: 0, camZ: 8.4, rot: 0 };
    this._focusCur = { camX: 0, camZ: 8.4, rot: 0 };
    this._camY = null;
    this._skeletonParts = [];
    this._running = false;
    this._lastBurst = 0;

    this.placeholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.0, 2),
      new THREE.MeshBasicMaterial({ color: 0x2997ff, wireframe: true })
    );
    this.scene.add(this.placeholder);

    this._applySize();
    this._initPost();
    this._initBursts();

    this._onResize = () => this._applySize();
    this._onVisibility = () => { if (document.hidden) this._stop(); else this.start(); };
    window.addEventListener('pointermove', (e) => this._onPointer(e));
    window.addEventListener('pointerdown', () => this.pulse());

    this.ready = this.loadBrain();
  }

  _maxTexture(canvas) {
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 8192;
    } catch { return 8192; }
  }

  _onPointer(e) {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    // Project the cursor onto the z=0 plane to spawn synapse bursts in world space.
    this._raycaster.setFromCamera({ x: this.pointer.x, y: this.pointer.y }, this.camera);
    this._raycaster.ray.intersectPlane(this._plane, this._pointerWorld);
    const now = performance.now();
    if (!this.reducedMotion && now - this._lastBurst > 26) {
      this._lastBurst = now;
      this._spawnBurst(this._pointerWorld, 3);
    }
  }

  _applySize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.dprCap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  }

  _initPost() {
    if (!this.settings.bloom) { this.composer = null; return; }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.5, 0.78);
    this.composer.addPass(this.bloom);
    if (this.settings.dof) {
      this.bokeh = new BokehPass(this.scene, this.camera, { focus: 8.4, aperture: 0.0009, maxblur: 0.006 });
      this.composer.addPass(this.bokeh);
    }
    this._post = new ShaderPass({
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
          float vig = smoothstep(0.95, 0.32, distance(vUv, vec2(0.5)));
          col *= vig;
          col += (rand(vUv + uTime) - 0.5) * 0.03;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.composer.addPass(this._post);
  }

  _initBursts() {
    const g = new THREE.BufferGeometry();
    this._burstPos = new Float32Array(BURST_MAX * 3);
    this._burstVel = new Float32Array(BURST_MAX * 3);
    this._burstLife = new Float32Array(BURST_MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this._burstPos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this._burstLife, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
      vertexShader: `
        attribute float aLife; varying float vL;
        void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv; gl_PointSize = (2.0 + 6.0*aLife) * (300.0/-mv.z) * 0.02 + aLife*5.0; }`,
      fragmentShader: `
        varying float vL; uniform vec3 uColor;
        void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard;
          gl_FragColor = vec4(uColor, smoothstep(0.5,0.0,d)*vL); }`,
    });
    this._burstIdx = 0;
    this.bursts = new THREE.Points(g, m);
    this.bursts.frustumCulled = false;
    this.scene.add(this.bursts);
  }

  _spawnBurst(pos, n) {
    if (!this._burstLife) return;
    for (let k = 0; k < n; k++) {
      const i = this._burstIdx = (this._burstIdx + 1) % BURST_MAX;
      this._burstPos[i * 3] = pos.x + (Math.random() - 0.5) * 0.2;
      this._burstPos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.2;
      this._burstPos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;
      this._burstVel[i * 3] = (Math.random() - 0.5) * 0.05;
      this._burstVel[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      this._burstVel[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
      this._burstLife[i] = 1.0;
    }
  }

  _updateBursts() {
    if (!this._burstLife) return;
    for (let i = 0; i < BURST_MAX; i++) {
      if (this._burstLife[i] <= 0) continue;
      this._burstLife[i] -= 0.02;
      this._burstPos[i * 3] += this._burstVel[i * 3];
      this._burstPos[i * 3 + 1] += this._burstVel[i * 3 + 1];
      this._burstPos[i * 3 + 2] += this._burstVel[i * 3 + 2];
    }
    this.bursts.geometry.attributes.position.needsUpdate = true;
    this.bursts.geometry.attributes.aLife.needsUpdate = true;
  }

  // ---- public API ----
  setBloom(strength) { if (this.bloom) this.bloom.strength = strength; }
  setProgress(p) { this._progress = p; }
  setFocus(f) { Object.assign(this._focus, f); }
  lightRegion() { this._targetColor.set(0xffffff); } // white throughout
  setReducedMotion(on) { this.reducedMotion = on; }
  pulse() { this._pulse = 1; }

  async loadBrain() {
    const loader = new GLTFLoader(this.loadingManager);
    const draco = new DRACOLoader(this.loadingManager);
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);
    let geometry = null;
    this._realModel = false;
    // 1) real STL scan if present (CC BY-SA anatomical brain — see CREDITS.md)
    try {
      geometry = await new STLLoader(this.loadingManager).loadAsync('assets/brain.stl?v=1');
      this._realModel = true;
    } catch (e) { /* no stl — try glb next */ }
    // 2) real GLB if present (auto-fit; drop-in replacement)
    if (!geometry) {
      try {
        const gltf = await loader.loadAsync('assets/brain.glb');
        let mesh = null;
        gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
        if (mesh) { geometry = mesh.geometry; this._realModel = true; }
      } catch (e) { /* fall through to procedural */ }
    }
    // 3) procedural fallback
    if (!geometry) {
      console.warn('[brain] no real model found, using procedural anatomical brain');
      geometry = this._buildBrainGeometry();
      this._realModel = false;
    }
    if (geometry.index) geometry = geometry.toNonIndexed();
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    // Real medical scans are usually Z-up; Three is Y-up, so the brain loads lying
    // on its side. Stand it upright.
    if (this._realModel) geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    geometry.center();
    this._normalizeScale(geometry, 2.95); // bigger brain
    this.brainGeometry = geometry;

    // Procedural low-poly => glowing wireframe; real scan => shaded translucent surface
    // (so the actual gyri/sulci read, not just a rim).
    this.shellMaterial = this._realModel ? this._makeSurfaceShell() : this._makeShell();
    this.brainMesh = new THREE.Mesh(geometry, this.shellMaterial);
    if (this.placeholder) {
      this.scene.remove(this.placeholder);
      this.placeholder.geometry.dispose();
      this.placeholder.material.dispose();
      this.placeholder = null;
    }
    this.scene.add(this.brainMesh);
    this._buildSynapses();

    // Skeleton hangs below the brain (skull). Solid glowing bones (fresnel, not wireframe).
    this.skeletonMaterial = this._makeSurfaceShell();
    this.skeletonMaterial.uniforms.uGlow.value = 1.1;
    this._skeletonParts = [];
    try {
      // Real co-registered BodyParts3D skeleton, fit to hang below the brain.
      const inner = await buildRealSkeleton(THREE, this.skeletonMaterial, this.loadingManager, this.tier);
      inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner);
      const size = new THREE.Vector3(), center = new THREE.Vector3();
      box.getSize(size); box.getCenter(center);
      inner.position.sub(center); // centre the assembled skeleton at its group origin
      const targetH = 16;
      const s = targetH / (size.y || 1);
      this.skeleton = new THREE.Group();
      this.skeleton.add(inner);
      this.skeleton.scale.setScalar(s);
      this.skeleton.position.y = -1.5 - targetH / 2; // top of skeleton just under the brain
      this.scene.add(this.skeleton);
    } catch (e) {
      console.warn('[skeleton] real load failed, using procedural:', e.message);
      const skel = buildSkeleton(THREE, this.skeletonMaterial);
      this.skeleton = skel.group;
      this._skeletonParts = skel.parts;
      this.scene.add(this.skeleton);
    }
  }

  _buildBrainGeometry() {
    const detail = this.tier === 'high' ? 44 : this.tier === 'mid' ? 28 : 18;

    // --- Cerebrum: deformed icosphere with hemispheres, sagittal fissure, gyri ---
    const cere = new THREE.IcosahedronGeometry(1, detail);
    const cp = cere.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
      const gyri =
        0.055 * Math.sin(x * 12.0) * Math.sin(z * 10.0) +
        0.045 * Math.sin(y * 15.0 + z * 7.0) +
        0.035 * Math.cos(x * 9.0 + y * 9.0) +
        0.030 * Math.abs(Math.sin(x * 8.0 + z * 8.0)) - 0.015 +
        0.024 * Math.sin(z * 22.0) +
        0.020 * Math.cos(y * 26.0 + x * 4.0);
      const fissure = -0.30 * Math.exp(-(x * x) / 0.008) * Math.max(0.0, y + 0.10);
      const r = 1 + gyri + fissure;
      let px = x * r * 1.02, py = y * r * 0.80, pz = z * r * 1.30;
      if (py < -0.20) py = -0.20 + (py + 0.20) * 0.6; // flatten base
      cp.setXYZ(i, px, py, pz);
    }
    cere.deleteAttribute('uv'); cere.deleteAttribute('normal');
    const cereGeo = cere.toNonIndexed();

    // --- Cerebellum: small ridged lobe at the back-bottom ---
    const cb = new THREE.IcosahedronGeometry(1, Math.max(10, Math.floor(detail / 2)));
    const bp = cb.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const foliation = 0.06 * Math.abs(Math.sin(y * 34.0)); // tight horizontal ridges
      const r = 1 + foliation;
      bp.setXYZ(i, x * r * 0.62, y * r * 0.42, z * r * 0.55);
    }
    cb.deleteAttribute('uv'); cb.deleteAttribute('normal');
    const cbGeo = cb.toNonIndexed();
    cbGeo.translate(0, -0.62, -1.02);

    // --- Brainstem: tapered stalk descending from the base ---
    const stem = new THREE.CylinderGeometry(0.10, 0.17, 0.75, 18, 4, true);
    stem.deleteAttribute('uv'); stem.deleteAttribute('normal');
    const stemGeo = stem.toNonIndexed();
    stemGeo.rotateX(0.5);
    stemGeo.translate(0, -0.82, -0.55);

    const merged = mergeGeometries([cereGeo, cbGeo, stemGeo], false);
    return merged || cereGeo;
  }

  _normalizeScale(geometry, target) {
    geometry.computeBoundingSphere();
    const r = geometry.boundingSphere.radius || 1;
    const s = target / r;
    geometry.scale(s, s, s);
  }

  _makeShell() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      wireframe: true,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uGlow: { value: 0.7 }, uTime: { value: 0 }, uIndigo: { value: new THREE.Color(0x5a4fcf) }, uTeal: { value: new THREE.Color(0x2dd4bf) } },
      vertexShader: `
        varying vec3 vN; varying vec3 vView; varying float vDepth;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uGlow; uniform float uTime; uniform vec3 uIndigo; uniform vec3 uTeal;
        varying vec3 vN; varying vec3 vView; varying float vDepth;
        void main() {
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.5);
          float pulse = 0.85 + 0.15 * sin(uTime * 1.5);
          float t = clamp((vDepth - 5.5) / 6.5, 0.0, 1.0);
          vec3 back = mix(uIndigo, uTeal, smoothstep(0.3, 1.0, t));
          vec3 tint = mix(vec3(1.0), back, smoothstep(0.04, 0.55, t));
          gl_FragColor = vec4(uColor * tint * fres * uGlow * pulse, fres);
        }`,
    });
  }

  // Shaded translucent surface for real scanned meshes: a fake key light reveals the
  // gyri/sulci via N·L, plus a fresnel rim; additive + translucent so text stays readable.
  _makeSurfaceShell() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uGlow: { value: 0.9 }, uTime: { value: 0 }, uIndigo: { value: new THREE.Color(0x5a4fcf) }, uTeal: { value: new THREE.Color(0x2dd4bf) } },
      vertexShader: `
        varying vec3 vN; varying vec3 vView; varying float vDepth;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uGlow; uniform float uTime; uniform vec3 uIndigo; uniform vec3 uTeal;
        varying vec3 vN; varying vec3 vView; varying float vDepth;
        void main() {
          vec3 N = normalize(vN);
          float ndl = clamp(dot(N, normalize(vec3(0.4, 0.6, 0.7))), 0.0, 1.0);
          float fres = pow(1.0 - abs(dot(N, normalize(vView))), 2.5);
          float pulse = 0.9 + 0.1 * sin(uTime * 1.5);
          float shade = (0.10 + 0.42 * ndl + 0.55 * fres) * uGlow * pulse;
          float t = clamp((vDepth - 5.5) / 6.5, 0.0, 1.0);
          vec3 back = mix(uIndigo, uTeal, smoothstep(0.3, 1.0, t));
          vec3 tint = mix(vec3(1.0), back, smoothstep(0.04, 0.55, t));
          gl_FragColor = vec4(uColor * tint * shade, clamp(shade, 0.0, 0.85));
        }`,
    });
  }

  _buildSynapses() {
    const rng = mulberry32(1337);
    const pos = this.brainGeometry.attributes.position.array;
    // On a real scan the shaded surface carries the anatomy, so thin the particles
    // (they accent, not dominate). Procedural relies on them, so keep the full count.
    const count = this._realModel ? Math.min(this.settings.particles, 9000) : this.settings.particles;
    const pts = sampleSurfacePoints(pos, count, rng);
    this._targetPositions = pts.slice();

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pts.slice(), 3));
    const seed = new Float32Array(count);
    for (let i = 0; i < seed.length; i++) seed[i] = rng();
    pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uTime: { value: 0 }, uSize: { value: this.tier === 'low' ? 1.7 : 2.5 }, uPulse: { value: 0 }, uIndigo: { value: new THREE.Color(0x5a4fcf) }, uTeal: { value: new THREE.Color(0x2dd4bf) } },
      vertexShader: `
        attribute float aSeed; uniform float uTime; uniform float uSize; uniform float uPulse; varying float vFire; varying float vDepth;
        void main() {
          vFire = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 40.0) + uPulse * 0.6;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uSize * (0.6 + 0.8 * vFire) * (44.0 / -mv.z), 1.0, 5.0);
        }`,
      fragmentShader: `
        varying float vFire; varying float vDepth; uniform vec3 uColor; uniform vec3 uIndigo; uniform vec3 uTeal;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * (0.4 + 0.6 * vFire);
          float t = clamp((vDepth - 5.5) / 6.5, 0.0, 1.0);
          vec3 back = mix(uIndigo, uTeal, smoothstep(0.3, 1.0, t));
          vec3 tint = mix(vec3(1.0), back, smoothstep(0.04, 0.55, t));
          gl_FragColor = vec4(uColor * tint, a);
        }`,
    });
    this.synapses = new THREE.Points(pGeo, pMat);
    this.brainMesh.add(this.synapses);

    const linkCap = this.tier === 'low' ? 500 : this.tier === 'mid' ? 1500 : 3000;
    // Build links from a bounded subset of points (nearestNeighborLinks is O(n²)).
    const linkSample = Math.min(this.settings.particles, 1600);
    const links = nearestNeighborLinks(pts.subarray(0, linkSample * 3), 2).slice(0, linkCap);
    const lp = new Float32Array(links.length * 6);
    for (let i = 0; i < links.length; i++) {
      const [a, b] = links[i];
      lp.set([pts[a * 3], pts[a * 3 + 1], pts[a * 3 + 2], pts[b * 3], pts[b * 3 + 1], pts[b * 3 + 2]], i * 6);
    }
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    const lMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.links = new THREE.LineSegments(lGeo, lMat);
    this.brainMesh.add(this.links);
  }

  assemble() {
    return new Promise((resolve) => {
      if (this.reducedMotion || !this.synapses) return resolve();
      const attr = this.synapses.geometry.attributes.position;
      const target = this._targetPositions;
      const start = new Float32Array(target.length);
      for (let i = 0; i < target.length; i++) start[i] = target[i] + (Math.random() - 0.5) * 10;
      attr.array.set(start);
      attr.needsUpdate = true;
      const t0 = performance.now();
      const dur = 1700;
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
    const t = performance.now() / 1000;
    this._pulse *= 0.94;

    // Camera DESCENDS the body as the user scrolls: y travels from the brain (skull)
    // down to the feet; z pulls back for the wider lower body. A gentle per-section
    // dock (camX) plus pointer parallax keeps it alive.
    const DESCEND = 13.5;
    this._focusCur.camX += (this._focus.camX * 0.5 - this._focusCur.camX) * 0.05;
    const camYTarget = -this._progress * DESCEND;
    const camZTarget = 9.0 + this._progress * 2.0 - this._pulse * 0.6;
    this._camY = this._camY == null ? camYTarget : this._camY + (camYTarget - this._camY) * 0.06;
    this.camera.position.x += (this._focusCur.camX + this.pointer.x * 0.3 - this.camera.position.x) * 0.06;
    this.camera.position.y += (this._camY - this.camera.position.y) * 0.06;
    this.camera.position.z += (camZTarget - this.camera.position.z) * 0.06;
    this.camera.lookAt(0, this.camera.position.y * 0.9, 0);
    if (this.bokeh) this.bokeh.uniforms.focus.value = Math.abs(this.camera.position.z); // keep the body sharp

    // Assemble the skeleton as scroll progress passes each stage's threshold.
    for (const part of this._skeletonParts) {
      if (this.reducedMotion) { part.obj.visible = true; part.obj.scale.setScalar(1); continue; }
      if (this._progress >= part.revealAt) {
        if (part.appear == null) part.appear = t;
        const e = Math.min(1, (t - part.appear) / 0.55);
        part.obj.visible = true;
        part.obj.scale.setScalar(easeOutBack(e));
      } else {
        part.obj.visible = false;
        part.appear = null;
        part.obj.scale.setScalar(0.001);
      }
    }
    if (this.skeletonMaterial) {
      this.skeletonMaterial.uniforms.uTime.value = t;
      this.skeletonMaterial.uniforms.uColor.value.lerp(this._targetColor, 0.05);
    }

    // Scroll drives a full turntable rotation top->bottom (plus gentle idle + pointer).
    const spin = this._progress * Math.PI * 2 + t * 0.04 + this.pointer.x * 0.35;
    const obj = this.brainMesh || this.placeholder;
    if (obj) {
      if (!this.reducedMotion) {
        obj.rotation.y = spin;
        const breathe = 1 + 0.02 * Math.sin(t * 0.8) + this._pulse * 0.05;
        obj.scale.setScalar(breathe);
        obj.rotation.x += (-0.32 + this.pointer.y * 0.2 - obj.rotation.x) * 0.05;
      }
      if (this.skeleton && !this.reducedMotion) this.skeleton.rotation.y = spin;
    }
    if (this.shellMaterial) {
      this.shellMaterial.uniforms.uTime.value = t;
      this.shellMaterial.uniforms.uGlow.value = 0.85 + this._pulse * 0.9;
      this.shellMaterial.uniforms.uColor.value.lerp(this._targetColor, 0.05);
    }
    if (this.synapses) {
      this.synapses.material.uniforms.uTime.value = t;
      this.synapses.material.uniforms.uPulse.value = this._pulse;
    }
    if (this.links) this.links.material.opacity = 0.13 + 0.07 * (0.5 + 0.5 * Math.sin(t * 1.3)) + this._pulse * 0.25;

    this._updateBursts();
    this.setBloom(0.32 + this._pulse * 0.7);
    if (this._post) this._post.uniforms.uTime.value = t;

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
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
