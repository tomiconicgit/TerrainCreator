// file: src/sculpt.js
import * as THREE from 'three';
import { paintTextureOnTile } from './terrain.js';

const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let raycaster = new THREE.Raycaster();

function worldToTile(localX, localZ, config) {
    const { TILE_SIZE, TILES_X, TILES_Y } = config;
    const W = TILES_X * TILE_SIZE, H = TILES_Y * TILE_SIZE;
    const u = (localX + W / 2) / W, v = (localZ + H / 2) / H;
    let i = Math.floor(u * TILES_X), j = Math.floor(v * TILES_Y);
    i = _clamp(i, 0, TILES_X - 1);
    j = _clamp(j, 0, TILES_Y - 1);
    return { i, j };
}

function applySculpt(hitPoint, appState, uiState) {
    const { terrainMesh, ball, config } = appState;
    const { TILES_X, TILES_Y, MIN_H, MAX_H } = config;

    const local = terrainMesh.worldToLocal(hitPoint.clone());
    const { i, j } = worldToTile(local.x, local.z, config);
    
    // Smooth
    if (uiState.mode === 'smooth') {
        const posAttr = terrainMesh.geometry.attributes.position, arr = posAttr.array;
        const vpr = TILES_X + 1, set = new Set();
        const i0 = Math.max(0, i - uiState.radius), j0 = Math.max(0, j - uiState.radius);
        const i1 = Math.min(TILES_X, i + uiState.radius + 1), j1 = Math.min(TILES_Y, j + uiState.radius + 1);
        for (let y = j0; y <= j1; y++) { for (let x = i0; x <= i1; x++) { set.add(y * vpr + x); } }
        let sum = 0, cnt = 0;
        set.forEach(vi => { sum += arr[vi * 3 + 1]; cnt++; });
        const avg = cnt ? sum / cnt : 0;
        set.forEach(vi => { const yi = vi * 3 + 1; arr[yi] += (avg - arr[yi]) * 0.15; });
    }
    // Raise/Lower
    else {
        const posAttr = terrainMesh.geometry.attributes.position, arr = posAttr.array;
        const map = new Map();
        const sign = uiState.mode === 'lower' ? -1 : 1;
        const tileCornerIndices = (ti, tj) => {
            const vpr = TILES_X + 1, tl = tj * vpr + ti, tr = tl + 1, bl = (tj + 1) * vpr + ti, br = bl + 1;
            return [tl, tr, bl, br];
        };

        for (let dj = -uiState.radius; dj <= uiState.radius; dj++) {
            for (let di = -uiState.radius; di <= uiState.radius; di++) {
                const ti = i + di, tj = j + dj;
                if (ti < 0 || tj < 0 || ti >= TILES_X || tj >= TILES_Y) continue;
                const d = Math.hypot(di, dj);
                if (d > uiState.radius) continue;
                const fall = uiState.radius === 0 ? 1 : (1 - d / uiState.radius);
                const delta = sign * uiState.step * fall;
                const corners = tileCornerIndices(ti, tj);
                for (const vi of corners) {
                    const yi = vi * 3 + 1;
                    map.set(yi, (map.get(yi) || 0) + delta);
                }
            }
        }
        map.forEach((dy, yi) => { arr[yi] = _clamp(arr[yi] + dy, MIN_H, MAX_H); });
    }

    terrainMesh.geometry.attributes.position.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
    if (ball) ball.refresh();
}

export function initSculpting(appState, getUiState) {
    const { renderer, camera } = appState;
    let dragging = false;

    const cast = (ev) => {
        if (!appState.terrainMesh) return;
        const uiState = getUiState();
        if (!uiState.sculptOn) return;

        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera({ x, y }, camera);
        
        const hits = raycaster.intersectObject(appState.terrainMesh, false);
        if (hits.length > 0) {
            applySculpt(hits[0].point, appState, uiState);
        }
    };
    
    renderer.domElement.addEventListener('pointerdown', (ev) => {
        if (!getUiState().sculptOn) return;
        dragging = true;
        cast(ev);
    });
    renderer.domElement.addEventListener('pointermove', (ev) => {
        if (dragging && getUiState().sculptOn) cast(ev);
    });
    window.addEventListener('pointerup', () => { dragging = false; });
}

export function initTapToMove(appState, getUiState, getAllowTapMove) {
    const { renderer, camera } = appState;
    renderer.domElement.addEventListener('pointerdown', (ev) => {
        const uiState = getUiState();
        // EXIT if sculpting, painting, or navLock is active
        if (uiState.sculptOn || uiState.paintTexture || !getAllowTapMove()) return;
                
        if (!appState.terrainMesh || !appState.ball) return;
        
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera({ x, y }, camera);

        const hits = raycaster.intersectObject(appState.terrainMesh, false);
        if (hits.length > 0) {
            const local = appState.terrainMesh.worldToLocal(hits[0].point.clone());
            const { i, j } = worldToTile(local.x, local.z, appState.config);
            appState.ball.placeOnTile(i, j);
            if (appState.camFollowEnabled) {
                appState.controls.lookAt(appState.ball.mesh.position);
            }
        }
    });
}

export function initTapToPaint(appState, getUiState) {
    const { renderer, camera } = appState;
    renderer.domElement.addEventListener('pointerdown', (ev) => {
        const uiState = getUiState();
        // EXIT if not in paint mode or if sculpting is on
        if (!uiState.paintTexture || uiState.sculptOn) return;

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
