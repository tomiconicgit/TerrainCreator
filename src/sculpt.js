// file: src/sculpt.js
import * as THREE from 'three';
import { rebuildGridAfterGeometry } from './terrain.js';

const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Shared raycaster (used for sculpting and tap-to-move)
let raycaster = new THREE.Raycaster();
// Make LineSegments easier to hit when you tap near the red outline
raycaster.params.Line = raycaster.params.Line || {};
raycaster.params.Line.threshold = 2; // world units; tweak if your TILE_SIZE is very small/large

// Map local X/Z to the nearest 1×1 tile of the main grid (NOT the subdivided geometry)
function worldToTile(localX, localZ, config) {
  const { TILE_SIZE, TILES_X, TILES_Y } = config;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  // Normalize to 0..1 across the whole mesh
  const u = (localX + W / 2) / W;
  const v = (localZ + H / 2) / H;

  // Choose the tile whose CENTER is closest to the tap
  let i = Math.round(u * TILES_X - 0.5);
  let j = Math.round(v * TILES_Y - 0.5);

  // Clamp into grid
  i = _clamp(i, 0, TILES_X - 1);
  j = _clamp(j, 0, TILES_Y - 1);
  return { i, j };
}

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

  // Map hit to the vertex grid of the current geometry
  const u = (localHit.x + width / 2) / width;
  const v = (localHit.z + height / 2) / height;

  const hitVertX = Math.round(u * widthSegments);
  const hitVertZ = Math.round(v * heightSegments);

  const vertexCellWidth = width / widthSegments;
  const radiusInVerts = Math.ceil(worldBrushRadius / vertexCellWidth);

  const startX = Math.max(0, hitVertX - radiusInVerts);
  const endX   = Math.min(widthSegments, hitVertX + radiusInVerts);
  const startZ = Math.max(0, hitVertZ - radiusInVerts);
  const endZ   = Math.min(heightSegments, hitVertZ + radiusInVerts);

  const vertsPerRow = widthSegments + 1;

  if (uiState.mode === 'smooth') {
    const heights = [];
    let total = 0;

    for (let z = startZ; z <= endZ; z++) {
      for (let x = startX; x <= endX; x++) {
        const vi = z * vertsPerRow + x;
        const yv = vertices[vi * 3 + 1];

        const dx = (x - hitVertX) * vertexCellWidth;
        const dz = (z - hitVertZ) * vertexCellWidth;
        const d = Math.hypot(dx, dz);

        if (d < worldBrushRadius) {
          heights.push({ index: vi, height: yv });
          total += yv;
        }
      }
    }

    if (!heights.length) return;
    const avg = total / heights.length;

    for (const vtx of heights) {
      const yi = vtx.index * 3 + 1;
      const cur = vtx.height;
      vertices[yi] += (avg - cur) * 0.1;
    }
  } else {
    const sign = (uiState.mode === 'lower') ? -1 : 1;

    for (let z = startZ; z <= endZ; z++) {
      for (let x = startX; x <= endX; x++) {
        const vi = z * vertsPerRow + x;
        const yi = vi * 3 + 1;

        const dx = (x - hitVertX) * vertexCellWidth;
        const dz = (z - hitVertZ) * vertexCellWidth;
        const d = Math.hypot(dx, dz);

        if (d < worldBrushRadius) {
          const falloff = Math.cos((d / worldBrushRadius) * (Math.PI / 2));
          const delta = falloff * uiState.step;
          vertices[yi] = _clamp(vertices[yi] + delta * sign, MIN_H, MAX_H);
        }
      }
    }
  }

  posAttr.needsUpdate = true;
  geom.computeVertexNormals();

  // Keep the red grid glued to the sculpted terrain
  rebuildGridAfterGeometry(appState);

  // Re-snap ball to height if it exists
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

    // Allow sculpting when clicking either the terrain OR the red grid lines
    const targets = [];
    if (appState.terrainMesh) targets.push(appState.terrainMesh);
    if (appState.gridLines)   targets.push(appState.gridLines);

    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length > 0) applySculpt(hits[0].point, appState, uiState);
  };

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (!getUiState().sculptOn) return;
    try { renderer.domElement.setPointerCapture(ev.pointerId); } catch(_) {}
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
    if (uiState.sculptOn || !getAllowTapMove()) return;
    if (!appState.terrainMesh || !appState.ball) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x, y }, camera);

    // Let grid line hits guide the tile choice, else fall back to terrain
    const targets = [];
    if (appState.terrainMesh) targets.push(appState.terrainMesh);
    if (appState.gridLines)   targets.push(appState.gridLines);

    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length > 0) {
      const world = hits[0].point.clone();
      const local = appState.terrainMesh.worldToLocal(world);
      const { i, j } = worldToTile(local.x, local.z, appState.config);
      appState.ball.placeOnTile(i, j);
      if (appState.camFollowEnabled) appState.controls.lookAt(appState.ball.mesh.position);
    }
  }, { passive: true });
}
