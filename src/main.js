// file: src/main.js
import * as THREE from 'three';
import { showErrorOverlay } from './utils.js';
import { initCamera, updateCameraBounds } from './camera.js';
import { initLighting } from './lighting.js';
import { createTerrain, setMainGridVisible } from './terrain.js';
import { initSculpting, initTapToMove } from './sculpt.js';
import { initUI, getUiState } from './ui.js';
import initNavLock from './navlock.js';
import initTexturePainter from './texturepaint.js';

async function startApp() {
  console.log('THREE revision:', THREE.REVISION);

  const appState = {
    renderer: null, scene: null, camera: null, controls: null,
    dirLight: null, lightTarget: null,
    terrainGroup: null, terrainMesh: null, terrainMaterial: null,
    treesGroup: null, ball: null,
    gridLines: null,
    camFollowEnabled: true,
    painter: null,
    config: {
      TILES_X: 30, TILES_Y: 30, TILE_SIZE: 32,
      MIN_H: -200, MAX_H: 300,
      CHAR_HEIGHT_UNITS: 32 * 1.0,
      TREE_MIN_RATIO: 10/6, TREE_MAX_RATIO: 15/6,
    }
  };

  const sceneHost = document.getElementById('sceneHost');
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  appState.renderer = renderer;

  const sizeRendererToHost = () => {
    const rect = sceneHost.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    if (appState.camera) {
      appState.camera.aspect = w / h;
      appState.camera.updateProjectionMatrix();
    }
  };

  const scene = new THREE.Scene();
  scene.background = null;
  appState.scene = scene;

  const { camera, controls } = initCamera(renderer);
  appState.camera = camera;
  appState.controls = controls;

  const { dirLight, lightTarget } = initLighting(scene);
  appState.dirLight = dirLight;
  appState.lightTarget = lightTarget;

  // Build terrain + UI
  createTerrain(appState);
  initUI(appState);
  initSculpting(appState, getUiState);

  // Texture painter
  const painter = initTexturePainter(appState);
  appState.painter = painter;
  painter.attachToTerrain();

  // Tap-to-move, gated by HUD/painter
  let allowTapMove = true;
  initTapToMove(appState, getUiState, () => allowTapMove);

  // HUD + events
  try {
    initNavLock({ zIndex: 10000, offset: 10 });
    window.addEventListener('tc:navlock', (e) => { allowTapMove = !(e?.detail?.paused); });
    window.addEventListener('tc:gridtoggle', (e) => { setMainGridVisible(appState, !!e?.detail?.on); });
  } catch (_) {}

  // UI -> painter wiring (textures tab)
  window.addEventListener('tc:texture-activate', (e) => {
    if (e?.detail?.key === 'sand') painter.setActive('sand');
  });
  window.addEventListener('tc:texture-deactivate', () => {
    painter.setActive(null);
  });

  // When terrain is rebuilt from the UI, reattach the mask + shader hook
  window.addEventListener('tc:terrain-rebuilt', () => {
    painter.attachToTerrain();
  });

  sizeRendererToHost();
  updateCameraBounds(appState);
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

window.addEventListener('error', (e) => showErrorOverlay('Window error', e.error || e));
window.addEventListener('unhandledrejection', (e) => showErrorOverlay('Unhandled promise rejection', e.reason));
(async () => {
  try { startApp(); }
  catch (e) { showErrorOverlay('Failed to start application.', e); throw e; }
})();