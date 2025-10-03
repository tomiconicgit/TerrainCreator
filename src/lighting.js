// file: src/lighting.js
import * as THREE from 'three';

export function initLighting(scene) {
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight.castShadow = true;

  // REMOVED the separate AmbientLight
  scene.add(dirLight);

  const lightTarget = new THREE.Object3D();
  scene.add(lightTarget);
  dirLight.target = lightTarget;
  
  // Return only the directional light
  return { dirLight, lightTarget };
}
