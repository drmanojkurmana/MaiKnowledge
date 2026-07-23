// brain-stage.js — Three.js scene: brain shell + particle synapses + postfx + interaction.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { pickTier, TIER_SETTINGS } from './quality.js';
import { sampleSurfacePoints, nearestNeighborLinks, mulberry32, lerpKeyframes } from './brain-math.js';

const CAMERA_KEYFRAMES = [
  { at: 0.0,  camX: 0.0,  camZ: 6.2, rotOffset: 0.0, bloom: 0.55 },
  { at: 0.2,  camX: 1.7,  camZ: 4.8, rotOffset: 0.6, bloom: 0.7 },
  { at: 0.45, camX: -1.7, camZ: 4.8, rotOffset: 1.4, bloom: 0.7 },
  { at: 0.65, camX: 0.0,  camZ: 5.3, rotOffset: 2.2, bloom: 0.95 },
  { at: 0.8,  camX: 0.0,  camZ: 7.6, rotOffset: 2.6, bloom: 0.35 },
  { at: 1.0,  camX: 2.4,  camZ: 8.8, rotOffset: 3.0, bloom: 0.25 },
];

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
    this.camera.position.set(0, 0, 6);

    this.pointer = { x: 0, y: 0 };
    this._targetColor = new THREE.Color(0x2997ff);
    this._progress = 0;
    this._smoothP = null;
    this._running = false;

    this.placeholder = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.6, 2),
      new THREE.MeshBasicMaterial({ color: 0x2997ff, wireframe: true })
    );
    this.scene.add(this.placeholder);

    this._applySize();
    this._initPost();

    this._onResize = () => this._applySize();
    this._onVisibility = () => { if (document.hidden) this._stop(); else this.start(); };
    window.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    });

    this.ready = this.loadBrain();
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  }

  _initPost() {
    if (!this.settings.bloom) { this.composer = null; return; }
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.5, 0.75);
    this.composer.addPass(this.bloom);
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
          float vig = smoothstep(0.95, 0.35, distance(vUv, vec2(0.5)));
          col *= vig;
          col += (rand(vUv + uTime) - 0.5) * 0.03;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.composer.addPass(this._post);
  }

  setBloom(strength) { if (this.bloom) this.bloom.strength = strength; }
  setProgress(p) { this._progress = p; }
  lightRegion(color) { this._targetColor.set(color == null ? 0x2997ff : color); }
  setReducedMotion(on) { this.reducedMotion = on; }

  async loadBrain() {
    const loader = new GLTFLoader(this.loadingManager);
    const draco = new DRACOLoader(this.loadingManager);
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);
    let geometry;
    try {
      const gltf = await loader.loadAsync('assets/brain.glb?v=1');
      let mesh = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
      geometry = mesh ? mesh.geometry : this._fallbackGeometry();
    } catch (e) {
      console.warn('[brain] model missing, using procedural fallback:', e.message);
      geometry = this._fallbackGeometry();
    }
    geometry.computeVertexNormals();
    geometry.center();
    if (geometry.index) geometry = geometry.toNonIndexed();
    this._normalizeScale(geometry, 1.7);
    this.brainGeometry = geometry;

    this.shellMaterial = this._makeShell();
    this.brainMesh = new THREE.Mesh(geometry, this.shellMaterial);
    if (this.placeholder) {
      this.scene.remove(this.placeholder);
      this.placeholder.geometry.dispose();
      this.placeholder.material.dispose();
      this.placeholder = null;
    }
    this.scene.add(this.brainMesh);
    this._buildSynapses();
  }

  _fallbackGeometry() {
    // Anatomically-evocative brain: two hemispheres, a deep sagittal fissure down
    // the top midline, cortical gyri/sulci folds, elongated front-back, flat base.
    const detail = this.tier === 'high' ? 40 : this.tier === 'mid' ? 26 : 16;
    const g = new THREE.IcosahedronGeometry(1, detail);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);

      // Cortical folds (gyri/sulci) — layered high-frequency noise on the unit sphere.
      const fold =
        0.060 * Math.sin(x * 13.0) * Math.sin(z * 11.0) +
        0.050 * Math.sin(y * 15.0 + z * 7.0) +
        0.040 * Math.cos(x * 9.0 + y * 9.0) +
        0.028 * Math.sin(z * 21.0) +
        0.024 * Math.cos(y * 24.0);

      // Longitudinal fissure: a groove down the top midline (x≈0), fading toward the base.
      const fissure = -0.30 * Math.exp(-(x * x) / 0.008) * Math.max(0.0, y + 0.12);

      const r = 1 + fold + fissure;
      let px = x * r * 1.02;   // width (left–right)
      let py = y * r * 0.82;   // height (shorter)
      let pz = z * r * 1.30;   // length (front–back, longest axis)

      // Flatten the underside of the brain.
      if (py < -0.22) py = -0.22 + (py + 0.22) * 0.6;

      pos.setXYZ(i, px, py, pz);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
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
      uniforms: {
        uColor: { value: new THREE.Color(0x2997ff) },
        uGlow: { value: 0.7 },
        uTime: { value: 0 },
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

  _buildSynapses() {
    const rng = mulberry32(1337);
    const pos = this.brainGeometry.attributes.position.array;
    const pts = sampleSurfacePoints(pos, this.settings.particles, rng);
    this._targetPositions = pts.slice();

    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pts.slice(), 3));
    const seed = new Float32Array(this.settings.particles);
    for (let i = 0; i < seed.length; i++) seed[i] = rng();
    pGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x8fb0ff) }, uTime: { value: 0 }, uSize: { value: this.tier === 'low' ? 1.4 : 1.8 } },
      vertexShader: `
        attribute float aSeed; uniform float uTime; uniform float uSize; varying float vFire;
        void main() {
          vFire = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 40.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uSize * (0.6 + 0.8 * vFire) * (40.0 / -mv.z), 1.0, 4.0);
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

    const linkCap = this.tier === 'low' ? 400 : this.tier === 'mid' ? 1200 : 2400;
    const links = nearestNeighborLinks(pts, 2).slice(0, linkCap);
    const lp = new Float32Array(links.length * 6);
    for (let i = 0; i < links.length; i++) {
      const [a, b] = links[i];
      lp.set([pts[a * 3], pts[a * 3 + 1], pts[a * 3 + 2], pts[b * 3], pts[b * 3 + 1], pts[b * 3 + 2]], i * 6);
    }
    const lGeo = new THREE.BufferGeometry();
    lGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    const lMat = new THREE.LineBasicMaterial({ color: 0x2997ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
    this.links = new THREE.LineSegments(lGeo, lMat);
    this.brainMesh.add(this.links);
  }

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

    this._smoothP = this._smoothP == null ? this._progress : this._smoothP + (this._progress - this._smoothP) * 0.08;
    const k = lerpKeyframes(CAMERA_KEYFRAMES, this._smoothP);
    this.camera.position.x += (k.camX - this.camera.position.x) * 0.06;
    this.camera.position.z += (k.camZ - this.camera.position.z) * 0.06;
    this.camera.lookAt(0, 0, 0);

    const obj = this.brainMesh || this.placeholder;
    if (obj) {
      if (!this.reducedMotion) {
        obj.rotation.y = k.rotOffset + t * 0.05;
        const breathe = 1 + 0.02 * Math.sin(t * 0.8);
        obj.scale.setScalar(breathe);
        // Base forward tilt (-0.32 rad) tips the top toward the viewer so the sagittal
        // fissure between the two hemispheres reads clearly; pointer adds parallax.
        obj.rotation.x += (-0.32 + this.pointer.y * 0.2 - obj.rotation.x) * 0.05;
        obj.rotation.z += (this.pointer.x * 0.1 - obj.rotation.z) * 0.05;
      }
    }
    if (this.shellMaterial) {
      this.shellMaterial.uniforms.uTime.value = t;
      this.shellMaterial.uniforms.uColor.value.lerp(this._targetColor, 0.05);
    }
    if (this.synapses) this.synapses.material.uniforms.uTime.value = t;
    if (this.links) this.links.material.opacity = 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(t * 1.3));
    this.setBloom(k.bloom);
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
