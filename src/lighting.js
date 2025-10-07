// file: src/lighting.js
import * as THREE from 'three';

export function initLighting(scene) {
  // Key light
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.castShadow = true;

  // Give it a real position and a generous shadow frustum for big terrains
  dirLight.position.set(600, 900, 500);
  const lightTarget = new THREE.Object3D();
  lightTarget.position.set(0, 0, 0);
  dirLight.target = lightTarget;

  dirLight.shadow.mapSize.set(1024, 1024);
  dirLight.shadow.camera.near = 10;
  dirLight.shadow.camera.far = 5000;
  dirLight.shadow.camera.left   = -2000;
  dirLight.shadow.camera.right  =  2000;
  dirLight.shadow.camera.top    =  2000;
  dirLight.shadow.camera.bottom = -2000;

  // Soft fill so PBR doesn’t look pitch-black without an environment
  const hemi = new THREE.HemisphereLight(0x9fb5ff, 0x3a2c1e, 0.35);

  scene.add(dirLight);
  scene.add(lightTarget);
  scene.add(hemi);

  return { dirLight, lightTarget };
}