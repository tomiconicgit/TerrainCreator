// file: src/sky.js
import * as THREE from 'three';
import { Sky } from '../../vendor/three.sky.js';

const skyParams = {
  turbidity: 2.5,
  rayleigh: 2.0,
  mieCoefficient: 0.004,
  mieDirectionalG: 0.8,
  elevation: 12,
  azimuth: 180,
  exposure: 1.15
};

let sky, uniforms, pmrem, envRT;

export function initSky(scene, renderer) {
  if (!Sky) return null;
  
  sky = new Sky();
  sky.name = 'Sky';
  sky.scale.setScalar(1000);
  scene.add(sky);
  uniforms = sky.material.uniforms;
  
  pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  
  return sky;
}

export function updateSky(appState, focus = new THREE.Vector3()) {
  if (!sky) return;

  const { renderer, scene, dirLight, lightTarget } = appState;
  const { TILE_SIZE, TILES_X, TILES_Y } = appState.config;
  const spanTiles = Math.max(TILES_X, TILES_Y);
  const worldSpanUnits = Math.max(100, spanTiles) * TILE_SIZE;

  // Set uniforms
  uniforms.turbidity.value = skyParams.turbidity;
  uniforms.rayleigh.value = skyParams.rayleigh;
  uniforms.mieCoefficient.value = skyParams.mieCoefficient;
  uniforms.mieDirectionalG.value = skyParams.mieDirectionalG;

  const phi = THREE.MathUtils.degToRad(90 - skyParams.elevation);
  const theta = THREE.MathUtils.degToRad(skyParams.azimuth);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  uniforms.sunPosition.value.copy(sunDir);

  sky.scale.setScalar(Math.max(100, worldSpanUnits));
  renderer.toneMappingExposure = skyParams.exposure;

  try {
    if (envRT) { envRT.dispose(); envRT = null; }
    const tmp = new THREE.Scene();
    const s2 = sky.clone();
    s2.material = sky.material.clone();
    s2.scale.copy(sky.scale);
    tmp.add(s2);
    envRT = pmrem.fromScene(tmp);
    scene.environment = envRT.texture;
    s2.geometry.dispose(); s2.material.dispose();
  } catch (err) {
    console.warn('[Sky env] Failed to build PMREM:', err);
    scene.environment = null;
  }

  // Match directional light
  const dist = Math.max(150, sky.scale.x * 1.5);
  dirLight.position.copy(sunDir).multiplyScalar(dist);
  lightTarget.position.copy(focus);

  const ortho = dirLight.shadow.camera;
  if (ortho && ortho.isOrthographicCamera) {
    const half = Math.max(50, sky.scale.x * 0.75);
    ortho.left = -half; ortho.right = half; ortho.top = half; ortho.bottom = -half;
    ortho.updateProjectionMatrix();
  }
}
