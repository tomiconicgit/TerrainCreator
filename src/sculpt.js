// file: src/sculpt.js
import * as THREE from 'three';

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

// --- NEW, EFFICIENT SCULPTING LOGIC ---
function applySculpt(hitPoint, appState, uiState) {
    const { terrainMesh, ball, config } = appState;
    if (!terrainMesh) return;

    const { MIN_H, MAX_H, TILE_SIZE } = config;
    const geom = terrainMesh.geometry;
    const posAttr = geom.attributes.position;
    const vertices = posAttr.array;

    const localHit = terrainMesh.worldToLocal(hitPoint.clone());
    const worldBrushRadius = uiState.radius * TILE_SIZE;

    const { width, height, widthSegments, heightSegments } = geom.parameters;

    // Find the vertex grid cell that the hit point is in
    const u = (localHit.x + width / 2) / width;
    const v = (localHit.z + height / 2) / height;
    const hitVertX = Math.round(u * widthSegments);
    const hitVertZ = Math.round(v * heightSegments);

    // Calculate brush radius in vertex units
    const vertexCellWidth = width / widthSegments;
    const radiusInVerts = Math.ceil(worldBrushRadius / vertexCellWidth);

    // Define a bounding box to only iterate over necessary vertices
    const startX = Math.max(0, hitVertX - radiusInVerts);
    const endX = Math.min(widthSegments, hitVertX + radiusInVerts);
    const startZ = Math.max(0, hitVertZ - radiusInVerts);
    const endZ = Math.min(heightSegments, hitVertZ + radiusInVerts);
    
    const vertsPerRow = widthSegments + 1;
    
    // --- Smooth Mode Logic ---
    if (uiState.mode === 'smooth') {
        const heightsInBrush = [];
        let totalHeight = 0;

        // First pass: collect heights of all vertices inside the brush
        for (let z = startZ; z <= endZ; z++) {
            for (let x = startX; x <= endX; x++) {
                const vertIndex = z * vertsPerRow + x;
                const vertexY = vertices[vertIndex * 3 + 1];
                
                const dx = (x - hitVertX) * vertexCellWidth;
                const dz = (z - hitVertZ) * vertexCellWidth;
                const distance = Math.hypot(dx, dz);

                if (distance < worldBrushRadius) {
                    heightsInBrush.push({ index: vertIndex, height: vertexY });
                    totalHeight += vertexY;
                }
            }
        }
        
        if (heightsInBrush.length === 0) return;
        const averageHeight = totalHeight / heightsInBrush.length;

        // Second pass: move each vertex slightly towards the average height
        for (const v of heightsInBrush) {
            const vertexYIndex = v.index * 3 + 1;
            const currentY = v.height;
            // The 0.1 is the smoothing strength
            vertices[vertexYIndex] += (averageHeight - currentY) * 0.1;
        }

    } 
    // --- Raise/Lower Mode Logic ---
    else {
        const sign = (uiState.mode === 'lower') ? -1 : 1;

        for (let z = startZ; z <= endZ; z++) {
            for (let x = startX; x <= endX; x++) {
                const vertIndex = z * vertsPerRow + x;
                const vertexYIndex = vertIndex * 3 + 1;

                const dx = (x - hitVertX) * vertexCellWidth;
                const dz = (z - hitVertZ) * vertexCellWidth;
                const distance = Math.hypot(dx, dz);
                
                if (distance < worldBrushRadius) {
                    const falloff = Math.cos((distance / worldBrushRadius) * (Math.PI / 2));
                    const delta = falloff * uiState.step;
                    
                    vertices[vertexYIndex] += delta * sign;
                    vertices[vertexYIndex] = _clamp(vertices[vertexYIndex], MIN_H, MAX_H);
                }
            }
        }
    }

    posAttr.needsUpdate = true;
    geom.computeVertexNormals();
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
