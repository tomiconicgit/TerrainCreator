// file: src/lighting.js
import * as THREE from 'three';

export function initLighting(scene) {
  // Reduced intensity to prevent blowing out the texture colors
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.castShadow = true;

  scene.add(dirLight);

  const lightTarget = new THREE.Object3D();
  scene.add(lightTarget);
  dirLight.target = lightTarget;
  
  return { dirLight, lightTarget };
}
