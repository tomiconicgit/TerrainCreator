// file: src/textureLoader.js
import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const cache = new Map();

export async function getMaterial(name, appState) {
  if (cache.has(name)) return cache.get(name);

  if (name !== 'sand') throw new Error(`Unknown texture set: ${name}`);

  const root = 'assets/textures/sand/';
  const texLoader = new THREE.TextureLoader();
  const exrLoader = new EXRLoader();

  const [albedo, roughness, normalEXR, displacement] = await Promise.all([
    texLoader.loadAsync(root + 'sand-diffuse.jpg'),
    texLoader.loadAsync(root + 'sand-roughness.jpg'),
    exrLoader.loadAsync(root + 'sand-normal.exr'),
    texLoader.loadAsync(root + 'sand-displacement.png'),
  ]);

  const maxAniso = appState.renderer.capabilities.getMaxAnisotropy?.() || 1;

  albedo.colorSpace = THREE.SRGBColorSpace;
  [albedo, roughness, normalEXR, displacement].forEach(t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
  });
  roughness.colorSpace = THREE.NoColorSpace;
  normalEXR.colorSpace = THREE.NoColorSpace;
  normalEXR.flipY = false;
  displacement.colorSpace = THREE.NoColorSpace;

  // modest tiling on sphere
  const u = 2, v = 1.5;
  [albedo, roughness, normalEXR, displacement].forEach(t => t.repeat.set(u, v));

  const mat = new THREE.MeshStandardMaterial({
    map: albedo,
    roughnessMap: roughness,
    normalMap: normalEXR,
    displacementMap: displacement,
    displacementScale: 0.06,
    displacementBias: 0,
    metalness: 0.0,
    roughness: 1.0,
  });
  mat.normalScale.set(1, 1);

  cache.set(name, mat);
  return mat;
}