// file: src/main.js
import * as THREE from 'three';
import { showErrorOverlay } from './utils.js';
import { initCamera, updateCameraBounds } from './camera.js';
import { initLighting } from './lighting.js';
import { createTerrain } from './terrain.js';
import { initSculpting, initTapToMove } from './sculpt.js';
import { initUI, getUiState } from './ui.js';
import initNavLock from './navlock.js';

async function startApp() {
  console.log('THREE revision:', THREE.REVISION);

  const appState = { /* ... unchanged ... */ };

  const canvas = document.getElementById('c');
  const sceneHost = document.getElementById('sceneHost'); // <-- NEW

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  // SIZE TO HOST, not full window  <-- CHANGED
  function sizeRendererToHost() {
    const w = sceneHost.clientWidth || window.innerWidth;
    const h = sceneHost.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    appState.camera.aspect = w / h;
    appState.camera.updateProjectionMatrix();
  }

  // temporarily create camera before sizing
  const { camera, controls } = initCamera(renderer);
  appState.camera = camera;
  appState.controls = controls;

  sizeRendererToHost(); // initial sizing
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  appState.renderer = renderer;

  const scene = new THREE.Scene();
  scene.background = null;
  appState.scene = scene;

  const { dirLight, lightTarget } = initLighting(scene);
  appState.dirLight = dirLight;
  appState.lightTarget = lightTarget;

  createTerrain(appState);
  updateCameraBounds(appState);

  let allowTapMove = true;
  initUI(appState);
  initSculpting(appState, getUiState);
  initTapToMove(appState, getUiState, () => allowTapMove);

  try {
    initNavLock({ zIndex: 10000, offset: 10 });
    window.addEventListener('tc:navlock', (e) => {
      allowTapMove = !(e?.detail?.paused);
    });
  } catch (_) {}

  // Resize on window changes — size to SCENE HOST  <-- CHANGED
  window.addEventListener('resize', () => {
    sizeRendererToHost();
    updateCameraBounds(appState);
  });

  renderer.setAnimationLoop(() => {
    if (appState.camFollowEnabled && appState.ball?.mesh) {
      appState.controls.lookAt(appState.ball.mesh.position);
    }
    appState.controls.update();
    renderer.render(scene, camera);
  });
}

// ---- Error Handling & Boot ---- (unchanged)
window.addEventListener('error', (e) => showErrorOverlay('Window error', e.error || e));
window.addEventListener('unhandledrejection', (e) => showErrorOverlay('Unhandled promise rejection', e.reason));

(async () => {
  try { startApp(); }
  catch (e) { showErrorOverlay('Failed to start application.', e); throw e; }
})();
