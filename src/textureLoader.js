// file: src/textureLoader.js
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export async function loadSandMaterial(renderer) {
  const maps = await loadSandMaps(renderer);
  const mat = new THREE.MeshStandardMaterial({
    map: maps.map || null,
    roughnessMap: maps.roughness || null,
    normalMap: maps.normal || null,
    displacementMap: maps.displacement || null,
    metalness: 0.0,
    roughness: 1.0,
    displacementScale: 2.0,
    normalScale: new THREE.Vector2(1.0, 1.0)
  });
  return mat;
}

// NEW: load raw maps for shader blending on terrain
export async function loadSandMaps(renderer) {
  const texLoader = new THREE.TextureLoader();
  const exrLoader = new EXRLoader();
  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 1;

  const [colorMap, roughnessMap, normalEXR, dispMap] = await Promise.all([
    loadTex(texLoader, 'assets/textures/sand/sand-diffuse.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      wrapRepeat(t);
    }),
    loadTex(texLoader, 'assets/textures/sand/sand-roughness.jpg', (t) => {
      t.colorSpace = THREE.NoColorSpace;
      wrapRepeat(t);
    }),
    loadEXR(exrLoader, 'assets/textures/sand/sand-normal.exr', (t) => {
      // keep as data; in this pass we don't inject normals into the shader yet
      t.colorSpace = THREE.NoColorSpace;
      wrapRepeat(t);
    }),
    loadTex(texLoader, 'assets/textures/sand/sand-displacement.png', (t) => {
      t.colorSpace = THREE.NoColorSpace;
      wrapRepeat(t);
    })
  ]);

  return {
    map: colorMap,
    roughness: roughnessMap,
    normal: normalEXR,
    displacement: dispMap
  };
}

// helpers
function wrapRepeat(t) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
}
function loadTex(loader, url, onLoad) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (t) => { try { onLoad?.(t); } catch {} resolve(t); },
      undefined,
      () => resolve(null)
    );
  });
}
function loadEXR(loader, url, onLoad) {
  return new Promise((resolve) => {
    loader.load(
      url,
      (t) => { try { onLoad?.(t); } catch {} resolve(t); },
      undefined,
      () => resolve(null)
    );
  });
}