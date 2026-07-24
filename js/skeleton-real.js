// skeleton-real.js — assemble a REAL skeleton from co-registered BodyParts3D bone
// scans (CC BY-SA 2.1 JP — see CREDITS.md), Draco-compressed to GLB.
// The parts are segmented from one body so they share a coordinate system: load them
// WITHOUT re-centering and they line up. Diagnostic-confirmed: Z is up, X is
// left-right (midline ≈ 0), paired bones are already bilateral (no mirroring).
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const FULL = ['spine', 'ribcage', 'hip', 'femur', 'humerus', 'clavicle'];
const LIGHT = ['spine', 'hip', 'femur', 'clavicle']; // mobile: skip the heaviest (ribcage/humerus)

export async function buildRealSkeleton(THREE, material, manager, tier) {
  const files = tier === 'low' ? LIGHT : FULL;
  const draco = new DRACOLoader(manager);
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/draco/');
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(draco);

  const group = new THREE.Group();
  await Promise.all(files.map(async (f) => {
    let gltf;
    try { gltf = await loader.loadAsync(`assets/skeleton/${f}.glb?v=1`); }
    catch (e) { console.warn('[skeleton] part missing:', f, e.message); return; }
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
    if (!mesh) return;
    mesh.updateWorldMatrix(true, true);
    const geo = mesh.geometry;
    geo.applyMatrix4(mesh.matrixWorld); // bake any node transform -> keep shared coords
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, material)); // shared coords — do NOT center per part
  }));
  if (group.children.length === 0) throw new Error('no skeleton parts loaded');
  group.rotation.x = -Math.PI / 2; // scan Z-up -> Three Y-up (stand upright)
  return group;
}
