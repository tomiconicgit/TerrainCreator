// file: src/sculpt.js
import * as THREE from 'three';
// The paintTextureOnTile function is no longer used here, it's called from initTapToPaint
// import { paintTextureOnTile } from './terrain.js'; 

const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let raycaster = new THREE.Raycaster();

// This helper function remains the same and is correct
function worldToTile(localX, localZ, config) {
    const { TILE_SIZE, TILES_X, TILES_Y } = config;
    const W = TILES_X * TILE_SIZE, H = TILES_Y * TILE_SIZE;
    const u = (localX + W / 2) / W, v = (localZ + H / 2) / H;
    let i = Math.floor(u * TILES_X), j = Math.floor(v * TILES_Y);
    i = _clamp(i, 0, TILES_X - 1);
    j = _clamp(j, 0, TILES_Y - 1);
    return { i, j };
}

// --- COMPLETELY REWRITTEN SCULPTING LOGIC ---
function applySculpt(hitPoint, appState, uiState) {
    const { terrainMesh, ball, config } = appState;
    if (!terrainMesh) return;

    const { MIN_H, MAX_H, TILE_SIZE } = config;
    const geom = terrainMesh.geometry;
    const posAttr = geom.attributes.position;

    // Convert the world-space hit point to the terrain's local space
    const localHit = terrainMesh.worldToLocal(hitPoint.clone());

    // Convert the brush radius from "tile units" to "world units"
    const worldBrushRadius = uiState.radius * TILE_SIZE;

    const vertices = posAttr.array;
    const tempVec = new THREE.Vector3();

    // Iterate through ALL vertices of the mesh
    for (let i = 0; i < posAttr.count; i++) {
        tempVec.fromBufferAttribute(posAttr, i);
        
        // Calculate the 2D distance (on the XZ plane) from the vertex to the brush center
        const distance = Math.hypot(tempVec.x - localHit.x, tempVec.z - localHit.z);

        // Check if the vertex is within the brush's circular radius
        if (distance < worldBrushRadius) {
            // Calculate a smooth falloff from the center (1.0) to the edge (0.0) of the brush
            const falloff = Math.cos((distance / worldBrushRadius) * (Math.PI / 2));
            const delta = falloff * uiState.step;
            
            const vertexYIndex = i * 3 + 1; // Index of the Y component in the flat array

            if (uiState.mode === 'smooth') {
                // Smoothing logic could be improved, but this is a simple start
                // For now, let's just make it a weak raise/lower
                // A true smooth would average surrounding vertex heights
                vertices[vertexYIndex] += delta * 0.1;

            } else { // Raise or Lower
                const sign = (uiState.mode === 'lower') ? -1 : 1;
                vertices[vertexYIndex] += delta * sign;
            }

            // Clamp the height to the defined min/max
            vertices[vertexYIndex] = _clamp(vertices[vertexYIndex], MIN_H, MAX_H);
        }
    }

    // Tell Three.js that the geometry has been updated
    posAttr.needsUpdate = true;
    geom.computeVertexNormals(); // Recalculate normals for correct lighting
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
    // We need to import the function here to avoid circular dependency issues with terrain.js
    let paintFn = null;
    import('../src/terrain.js').then(module => {
        paintFn = module.paintTextureOnTile;
    });

    renderer.domElement.addEventListener('pointerdown', (ev) => {
        const uiState = getUiState();
        if (!uiState.paintTexture || uiState.sculptOn || !paintFn) return;
        if (!appState.terrainMesh) return;
        
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera({ x, y }, camera);

        const hits = raycaster.intersectObject(appState.terrainMesh, false);
        if (hits.length > 0) {
            const local = appState.terrainMesh.worldToLocal(hits[0].point.clone());
            const { i, j } = worldToTile(local.x, local.z, appState.config);
            
            paintFn(i, j, uiState.paintTexture, uiState.paintRadius, appState);
        }
    });
}
