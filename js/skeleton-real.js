// skeleton-real.js — assemble a REAL skeleton from co-registered BodyParts3D bone
// scans (CC BY-SA 2.1 JP — see CREDITS.md). The parts are segmented from one body so
// they share a coordinate system: load them WITHOUT re-centering and they line up.
// Diagnostic-confirmed: Z is up, X is left-right (midline ≈ 0), paired bones are
// already bilateral (no mirroring needed).
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const FULL = ['spine', 'ribcage', 'hip', 'femur', 'humerus', 'clavicle'];
const LIGHT = ['spine', 'hip', 'femur', 'clavicle']; // mobile: skip the 11.6MB ribcage + humerus

export async function buildRealSkeleton(THREE, material, manager, tier) {
  const files = tier === 'low' ? LIGHT : FULL;
  const loader = new STLLoader(manager);
  const group = new THREE.Group();
  await Promise.all(files.map(async (f) => {
    let geo;
    try { geo = await loader.loadAsync(`assets/skeleton/${f}.stl?v=1`); }
    catch (e) { console.warn('[skeleton] part missing:', f, e.message); return; }
    geo.deleteAttribute('uv');
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, material)); // shared coords — do NOT center per part
  }));
  if (group.children.length === 0) throw new Error('no skeleton parts loaded');
  group.rotation.x = -Math.PI / 2; // scan Z-up -> Three Y-up (stand upright)
  return group;
}
