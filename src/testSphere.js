// file: src/testSphere.js
import * as THREE from 'three';

/**
 * Creates a high-tessellation sphere used ONLY for texture testing.
 * Placed above the terrain so it won't interfere with anything.
 */
export function createTestSphere(appState) {
  const THREE_NS = THREE;
  const r = Math.max(20, appState.config.TILE_SIZE * 0.8);

  // High segment counts so displacement maps actually do something.
  const geo = new THREE_NS.SphereGeometry(r, 128, 128);
  const mat = new THREE_NS.MeshStandardMaterial({
    color: 0xdddddd,
    metalness: 0.0,
    roughness: 0.8
  });

  const mesh = new THREE_NS.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.name = 'TC_TestSphere';

  // Float it near center; slightly above ground.
  mesh.position.set(0, r + 10, 0);

  // Attach to the terrain group so transforms stay consistent.
  appState.terrainGroup.add(mesh);
  appState.testSphere = { mesh };
}