// file: src/testSphere.js
import * as THREE from 'three';

export function createTestSphere(appState) {
  const { scene, config } = appState;
  const r = Math.max(10, config.TILE_SIZE * 0.9);
  const geo = new THREE.SphereGeometry(r, 48, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    metalness: 0.0,
    roughness: 1.0,
  });
  const sphere = new THREE.Mesh(geo, mat);
  sphere.castShadow = true;
  sphere.receiveShadow = false;

  // place slightly above terrain center
  const yLift = Math.max(20, config.CHAR_HEIGHT_UNITS * 0.6);
  sphere.position.set(0, yLift, 0);

  scene.add(sphere);
  return sphere;
}