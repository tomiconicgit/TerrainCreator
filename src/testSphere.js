// file: src/testSphere.js
import * as THREE from 'three';

export function createTestSphere(appState) {
  const { scene, config } = appState;
  if (!scene) return;

  const radius = Math.max(18, config.TILE_SIZE * 0.5);
  const segs = 64;

  const geom = new THREE.SphereGeometry(radius, segs, segs);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    metalness: 0.0,
    roughness: 0.95
  });

  const sphere = new THREE.Mesh(geom, mat);
  sphere.castShadow = true;
  sphere.receiveShadow = false;
  sphere.name = 'TestSphere';

  // float the sphere a bit above mean terrain
  sphere.position.set(0, Math.max(40, config.CHAR_HEIGHT_UNITS * 1.2), 0);

  scene.add(sphere);
  appState.testSphere = sphere;
}