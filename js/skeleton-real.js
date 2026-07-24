// skeleton-real.js — assemble a REAL skeleton from co-registered BodyParts3D bone
// scans (CC BY-SA 2.1 JP — see CREDITS.md), Draco-compressed to GLB.
// The parts are segmented from one body so they share a coordinate system: load them
// WITHOUT re-centering and they line up. Diagnostic-confirmed: Z is up, X is
// left-right (midline ≈ 0), paired bones are already bilateral (no mirroring).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// All parts load on every tier — Draco-compressed they total ~0.5MB, so there's no
// longer a reason to drop the ribcage on mobile.
const FULL = ['spine', 'ribcage', 'hip', 'femur', 'humerus', 'clavicle'];

export async function buildRealSkeleton(THREE, material, manager, tier) {
  const files = FULL;
  const draco = new DRACOLoader(manager);
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(draco);

  const group = new THREE.Group();
  // Sequential (not Promise.all) so a burst of parallel requests can't drop a part.
  for (const f of files) {
    let gltf;
    try { gltf = await loader.loadAsync(`assets/skeleton/${f}.glb?v=1`); }
    catch (e) { console.warn('[skeleton] part missing:', f, e.message); continue; }
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) continue;
    mesh.updateWorldMatrix(true, true);
    const geo = mesh.geometry;
    geo.applyMatrix4(mesh.matrixWorld); // bake any node transform -> keep shared coords
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, material)); // shared coords — do NOT center per part
  }
  if (group.children.length === 0) throw new Error('no skeleton parts loaded');
  group.rotation.x = -Math.PI / 2; // scan Z-up -> Three Y-up (stand upright)
  return group;
}
