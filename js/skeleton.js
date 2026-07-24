// skeleton.js — procedural glowing human skeleton that hangs below the brain (skull).
// Built from primitives (vertebrae, ribs, sternum, shoulders/arms, pelvis, legs) grouped
// into stages, each with a `revealAt` scroll-progress threshold so the figure assembles
// as the user scrolls down the body. All meshes share one material (passed in).

function bone(THREE, mat, a, b, r1, r2) {
  const A = new THREE.Vector3(a[0], a[1], a[2]);
  const B = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = new THREE.Vector3().subVectors(B, A);
  const len = dir.length() || 0.0001;
  const geo = new THREE.CylinderGeometry(r2, r1, len, 10, 1, true);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function joint(THREE, mat, p, r) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), mat);
  m.position.set(p[0], p[1], p[2]);
  return m;
}

function vertebra(THREE, mat, y, r) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.42, 8, 16), mat);
  m.position.set(0, y, 0);
  m.rotation.x = Math.PI / 2;
  return m;
}

function ribPair(THREE, mat, y, spread, depth, radius) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, y, -0.2),
      new THREE.Vector3(s * spread * 0.6, y + 0.05, depth * 0.3),
      new THREE.Vector3(s * spread, y - 0.05, depth * 0.75),
      new THREE.Vector3(s * spread * 0.55, y - 0.15, depth),
      new THREE.Vector3(0, y - 0.2, depth * 1.05),
    ]);
    const geo = new THREE.TubeGeometry(curve, 22, radius, 6, false);
    g.add(new THREE.Mesh(geo, mat));
  }
  return g;
}

// Builds the skeleton. Returns { group, parts:[{obj, revealAt}] }.
export function buildSkeleton(THREE, mat) {
  const group = new THREE.Group();
  const parts = [];
  const add = (obj, revealAt) => { group.add(obj); parts.push({ obj, revealAt }); return obj; };

  // ---- Neck + upper (cervical/thoracic) spine ----
  const upperSpine = new THREE.Group();
  for (let y = -2.4; y > -6.6; y -= 0.44) upperSpine.add(vertebra(THREE, mat, y, 0.30 + (y < -4 ? 0.05 : 0)));
  add(upperSpine, 0.05);

  // ---- Ribcage + sternum + shoulders ----
  const chest = new THREE.Group();
  let ribW = 1.4;
  for (let i = 0; i < 9; i++) {
    const y = -4.0 - i * 0.30;
    const w = 2.2 * Math.sin(((i + 1) / 11) * Math.PI) + 0.7; // widest mid-cage
    chest.add(ribPair(THREE, mat, y, w, 1.7, 0.055));
    ribW = w;
  }
  chest.add(bone(THREE, mat, [0, -4.2, 1.55], [0, -6.2, 1.5], 0.12, 0.14)); // sternum
  // clavicles + shoulders
  chest.add(bone(THREE, mat, [0, -3.9, 0.3], [-2.3, -4.05, 0.5], 0.09, 0.09));
  chest.add(bone(THREE, mat, [0, -3.9, 0.3], [2.3, -4.05, 0.5], 0.09, 0.09));
  chest.add(joint(THREE, mat, [-2.4, -4.1, 0.5], 0.22));
  chest.add(joint(THREE, mat, [2.4, -4.1, 0.5], 0.22));
  add(chest, 0.18);

  // ---- Arms ----
  const arms = new THREE.Group();
  for (const s of [-1, 1]) {
    arms.add(bone(THREE, mat, [s * 2.4, -4.1, 0.4], [s * 2.9, -6.5, 0.2], 0.18, 0.13));   // humerus
    arms.add(joint(THREE, mat, [s * 2.9, -6.5, 0.2], 0.16));                               // elbow
    arms.add(bone(THREE, mat, [s * 2.9, -6.5, 0.2], [s * 2.7, -8.6, 0.35], 0.12, 0.09));   // forearm
    arms.add(joint(THREE, mat, [s * 2.7, -8.7, 0.35], 0.11));                              // wrist
    // simple hand fan
    for (let f = -2; f <= 2; f++) {
      arms.add(bone(THREE, mat, [s * 2.7, -8.7, 0.35], [s * 2.7 + f * 0.12, -9.3, 0.4 + Math.abs(f) * 0.03], 0.05, 0.03));
    }
  }
  add(arms, 0.28);

  // ---- Lumbar spine + pelvis ----
  const pelvis = new THREE.Group();
  for (let y = -6.6; y > -8.2; y -= 0.42) pelvis.add(vertebra(THREE, mat, y, 0.36));
  for (const s of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -8.2, 0),
      new THREE.Vector3(s * 1.0, -8.1, 0.3),
      new THREE.Vector3(s * 1.5, -8.5, 0.1),
      new THREE.Vector3(s * 1.1, -9.1, -0.1),
      new THREE.Vector3(s * 0.9, -9.2, 0),
    ]);
    pelvis.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.16, 6, false), mat));
    pelvis.add(joint(THREE, mat, [s * 0.9, -9.2, 0], 0.24)); // hip socket
  }
  add(pelvis, 0.42);

  // ---- Femurs ----
  const femurs = new THREE.Group();
  for (const s of [-1, 1]) {
    femurs.add(bone(THREE, mat, [s * 0.9, -9.2, 0], [s * 0.8, -11.6, 0.1], 0.2, 0.15));
    femurs.add(joint(THREE, mat, [s * 0.8, -11.7, 0.1], 0.18)); // knee
  }
  add(femurs, 0.58);

  // ---- Tibias + feet ----
  const shins = new THREE.Group();
  for (const s of [-1, 1]) {
    shins.add(bone(THREE, mat, [s * 0.8, -11.7, 0.1], [s * 0.8, -13.9, 0.15], 0.15, 0.1));
    shins.add(joint(THREE, mat, [s * 0.8, -13.9, 0.15], 0.1)); // ankle
    shins.add(bone(THREE, mat, [s * 0.8, -13.9, 0.15], [s * 0.8, -14.1, 0.9], 0.1, 0.08)); // foot
  }
  add(shins, 0.74);

  // Start hidden; the stage reveals parts as scroll progress passes each threshold.
  for (const p of parts) { p.obj.visible = false; p.obj.scale.setScalar(0.001); }
  return { group, parts };
}
