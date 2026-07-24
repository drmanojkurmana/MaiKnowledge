# Credits & third-party assets

## 3D brain model
- **Title:** "3D model of the Brain" (NIH 3D Print Exchange entry 3DPX-003765)
- **Author:** Nevit Dilmen
- **Source:** https://commons.wikimedia.org/wiki/File:3DPX-003765_3DModel_of_Brain_Nevit_Dilmen.stl
- **License:** Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0) — https://creativecommons.org/licenses/by-sa/3.0/
- **File:** `assets/brain.stl`
- **Changes made:** re-centered, uniformly scaled, and rendered in WebGL as a
  glowing point-cloud / rim-lit shell (Three.js). Geometry not otherwise altered.

## 3D skeleton (spine, rib cage, pelvis, femurs, humeri, clavicles)
- **Source:** BodyParts3D / Anatomography — The Database Center for Life Science (DBCLS)
- **Via:** Wikimedia Commons (Category: STL files of human skeletons) — files
  `BodyParts3D Vertebral column / Rib cage / Hip bone / Femur / Humerus / Clavicle`.
- **License:** Creative Commons Attribution-ShareAlike 2.1 Japan (CC BY-SA 2.1 JP) —
  https://creativecommons.org/licenses/by-sa/2.1/jp/
- **Files:** `assets/skeleton/*.stl`
- **Changes made:** co-registered parts assembled into one figure, re-oriented
  (Z-up → Y-up), scaled/positioned below the brain, and rendered in WebGL as a
  shaded translucent surface. Geometry not otherwise altered.

Per CC BY-SA, this attribution is retained and any redistribution of the
model itself remains under the same license. The model is used here as an asset
within the MaiKnowledge website (a collective work); it can be swapped for a
purchased/commissioned or CC0 model at any time by replacing `assets/brain.stl`
(or dropping in `assets/brain.glb`) — the renderer auto-detects and fits it.
