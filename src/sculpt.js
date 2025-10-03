// file: src/sculpt.js
import * as THREE from 'three';
import { paintTextureOnTile } from './terrain.js'; // Import the new paint function

const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let raycaster = new THREE.Raycaster();

function worldToTile(localX, localZ, config) {
    // ... (no changes in this function)
    const { TILE_SIZE, TILES_X, TILES_Y } = config;
    const W = TILES_X * TILE_SIZE, H = TILES_Y * TILE_SIZE;
    const u = (localX + W / 2) / W, v = (localZ + H / 2) / H;
    let i = Math.floor(u * TILES_X), j = Math.floor(v * TILES_Y);
    i = _clamp(i, 0, TILES_X - 1);
    j = _clamp(j, 0, TILES_Y - 1);
    return { i, j };
}

// ... (initSculpting and its helper functions remain the same)

// ========= MODIFIED: initTapToMove =========
export function initTapToMove(appState, getUiState, getAllowTapMove) {
    const { renderer, camera } = appState;
    renderer.domElement.addEventListener('pointerdown', (ev) => {
        const uiState = getUiState();
        // EXIT if sculpting, painting, or navLock is active
        if (uiState.sculptOn || uiState.paintTexture || !getAllowTapMove()) return;
        
        // ... (rest of the function is the same)
        if (!appState.terrainMesh || !appState.ball) return;
        const rect = renderer.domElement.getBoundingClientRect();
        // ...
    });
}
// ===========================================

// ========= NEW: initTapToPaint =========
export function initTapToPaint(appState, getUiState) {
    const { renderer, camera } = appState;
    renderer.domElement.addEventListener('pointerdown', (ev) => {
        const uiState = getUiState();
        // EXIT if not in paint mode
        if (!uiState.paintTexture) return;

        if (!appState.terrainMesh) return;
        
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera({ x, y }, camera);

        const hits = raycaster.intersectObject(appState.terrainMesh, false);
        if (hits.length > 0) {
            const local = appState.terrainMesh.worldToLocal(hits[0].point.clone());
            const { i, j } = worldToTile(local.x, local.z, appState.config);
            
            // Call the paint function
            paintTextureOnTile(i, j, uiState.paintTexture, uiState.paintRadius, appState);
        }
    });
}
// =======================================
