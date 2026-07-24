// main.js — entry: boot after first paint, wire loader → stage → choreography.
import * as THREE from 'three';
import { BrainStage } from './brain-stage.js?v=10';
import { ScrollChoreography } from './scroll-choreography.js?v=10';
import { Loader } from './loader.js?v=10';
import { initKineticText } from './kinetic-text.js?v=10';

async function boot() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const manager = new THREE.LoadingManager();
  const loader = new Loader();
  loader.setReducedMotion(reduced);
  loader.attachTo(manager);
  loader.autoAdvance();

  const stage = new BrainStage(document.getElementById('brain-stage'), manager);
  stage.setReducedMotion(reduced);
  window.__brainStage = stage;
  stage.start();

  try {
    await stage.ready;
    await stage.assemble();
  } catch (e) {
    console.warn('[brain] init issue:', e && e.message);
  }
  loader.finish();

  const choreo = new ScrollChoreography(stage, {
    onSection: (i, id) => document.documentElement.setAttribute('data-brain-section', id || String(i)),
  });
  choreo.start();
  window.__brainChoreo = choreo;

  initKineticText();

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-in'); }),
    { threshold: 0.18 }
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
}

if (document.readyState === 'complete') requestAnimationFrame(boot);
else window.addEventListener('load', () => requestAnimationFrame(boot));
