// file: src/textureLoader.js
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

export async function loadSandMaterial(renderer) {
  const texLoader = new THREE.TextureLoader();
  const exrLoader = new EXRLoader();

  const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 1;

  const [colorMap, roughnessMap, normalEXR, dispMap] = await Promise.all([
    loadTex(texLoader, 'assets/textures/sand/sand-diffuse.jpg', (t) => {
      t.colorSpace = THREE.SRGBColorSpace; // color texture
      t.anisotropy = maxAniso;
      wrapRepeat(t);
    }),
    loadTex(texLoader, 'assets/textures/sand/sand-roughness.jpg', (t) => {
      // non-color data
      t.colorSpace = THREE.NoColorSpace;
      wrapRepeat(t);
    }),
    loadEXR(exrLoader, 'assets/textures/sand/sand-normal.exr', (t) => {
      t.colorSpace = THREE.NoColorSpace;   // normal map is data
      wrapRepeat(t);
    }),
    loadTex(texLoader, 'assets/textures/sand/sand-displacement.png', (t) => {
      t.colorSpace = THREE.NoColorSpace;   // height map is data
      wrapRepeat(t);
    })
  ]);

  const mat = new THREE.MeshStandardMaterial({
    map: colorMap || null,
    roughnessMap: roughnessMap || null,
    normalMap: normalEXR || null,
    displacementMap: dispMap || null,
    metalness: 0.0,
    roughness: 1.0,
    displacementScale: 2.0,    // tweak to taste
    normalScale: new THREE.Vector2(1.0, 1.0)
  });

  return mat;
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
      () => resolve(null) // tolerate missing maps
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