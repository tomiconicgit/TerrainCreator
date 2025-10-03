// file: src/main.js
import * as THREE from 'three';
import { showErrorOverlay } from './utils.js';
import { initCamera, updateCameraBounds } from './camera.js';
import { initLighting } from './lighting.js';
import { initSky, updateSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { initSculpting, initTapToMove, initTapToPaint } from './sculpt.js';
import { initUI, getUiState } from './ui.js';
import initNavLock from './navlock.js';

async function startApp() {
    console.log('THREE revision:', THREE.REVISION);

    const appState = {
        renderer: null,
        scene: null,
        camera: null,
        controls: null,
        dirLight: null,
        // ambientLight: null, // REMOVED
        lightTarget: null,
        terrainGroup: null,
        terrainMesh: null,
        terrainMaterial: null,
        treesGroup: null,
        ball: null,
        camFollowEnabled: true,
        config: {
            TILES_X: 30, TILES_Y: 30, TILE_SIZE: 32,
            MIN_H: -200, MAX_H: 300,
            CHAR_HEIGHT_UNITS: 32 * 1.0,
            TREE_MIN_RATIO: 10 / 6,
            TREE_MAX_RATIO: 15 / 6,
        }
    };

    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    appState.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = null;
    appState.scene = scene;

    const { camera, controls } = initCamera(renderer);
    appState.camera = camera;
    appState.controls = controls;

    const { dirLight, lightTarget } = initLighting(scene);
    appState.dirLight = dirLight;
    appState.lightTarget = lightTarget;

    initSky(scene, renderer);
    createTerrain(appState);
    
    updateCameraBounds(appState);
    updateSky(appState, new THREE.Vector3());

    let allowTapMove = true;
    initUI(appState);
    initSculpting(appState, getUiState);
    initTapToMove(appState, getUiState, () => allowTapMove);
    initTapToPaint(appState, getUiState);

    try {
        initNavLock({ zIndex: 10000, offset: 10 });
        window.addEventListener('tc:navlock', (e) => {
            allowTapMove = !(e?.detail?.paused);
        });
    } catch (_) {}

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        updateCameraBounds(appState);
        updateSky(appState);
    });

    renderer.setAnimationLoop(() => {
        // --- THIS BLOCK IS REQUIRED FOR THE CUSTOM SHADER ---
        if (appState.terrainMaterial && appState.terrainMaterial.isShaderMaterial) {
            const uniforms = appState.terrainMaterial.uniforms;
            uniforms.uSunDirection.value.copy(appState.dirLight.position).normalize();
            uniforms.uDirLightColor.value.copy(appState.dirLight.color);
            uniforms.uDirLightIntensity.value = appState.dirLight.intensity;
        }
        // --- END OF REQUIRED BLOCK ---

        if (appState.camFollowEnabled && appState.ball?.mesh) {
            controls.lookAt(appState.ball.mesh.position);
        }
        controls.update();
        renderer.render(scene, camera);
    });
}

// ---- Error Handling & Boot ----
window.addEventListener('error', (e) => showErrorOverlay('Window error', e.error || e));
window.addEventListener('unhandledrejection', (e) => showErrorOverlay('Unhandled promise rejection', e.reason));

(async () => {
    try {
        startApp();
    } catch (e) {
        showErrorOverlay('Failed to start application.', e);
        throw e;
    }
})();
