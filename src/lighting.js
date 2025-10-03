// file: src/lighting.js
import * as THREE from 'three';

export function initLighting(scene) {
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight.castShadow = true;

  const ambientLight = new THREE.AmbientLight(0x445566, 0.6);
  scene.add(dirLight, ambientLight);

  const lightTarget = new THREE.Object3D();
  scene.add(lightTarget);
  dirLight.target = lightTarget;
  
  // Return both lights now
  return { dirLight, ambientLight, lightTarget };
}
