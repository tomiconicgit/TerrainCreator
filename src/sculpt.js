// file: src/sculpt.js
import * as THREE from 'three';
import { rebuildGridAfterGeometry } from './terrain.js';

const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));

let raycaster = new THREE.Raycaster();
// make red line hits easier
raycaster.params.Line = raycaster.params.Line || {};
raycaster.params.Line.threshold = 2; // world units

// Map a LOCAL x/z to the containing 1×1 tile (main red grid), not the fine geometry.
function localToTile(localX, localZ, config) {
  const { TILE_SIZE, TILES_X, TILES_Y } = config;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  const u = (localX + W / 2) / W; // 0..1
  const v = (localZ + H / 2) / H; // 0..1

  let i = Math.floor(u * TILES_X);
  let j = Math.floor(v * TILES_Y);
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

  const u = (localHit.x + width / 2) / width;
  const v = (localHit.z + height / 2) / height;

  const hitVertX = Math.round(u * widthSegments);
  const hitVertZ = Math.round(v * heightSegments);

  const vertexCell = width / widthSegments;
  const radiusVerts = Math.ceil(worldBrushRadius / vertexCell);

  const startX = Math.max(0, hitVertX - radiusVerts);
  const endX   = Math.min(widthSegments, hitVertX + radiusVerts);
  const startZ = Math.max(0, hitVertZ - radiusVerts);
  const endZ   = Math.min(heightSegments, hitVertZ + radiusVerts);

  const vpr = widthSegments + 1;

  if (uiState.mode === 'smooth') {
    const picks = [];
    let sum = 0;
    for (let z = startZ; z <= endZ; z++) {
      for (let x = startX; x <= endX; x++) {
        const idx = z * vpr + x;
        const yv  = vertices[idx * 3 + 1];
        const dx = (x - hitVertX) * vertexCell;
        const dz = (z - hitVertZ) * vertexCell;
        const d  = Math.hypot(dx, dz);
        if (d < worldBrushRadius) { picks.push({ idx, yv }); sum += yv; }
      }
    }
    if (!picks.length) return;
    const avg = sum / picks.length;
    for (const p of picks) {
      const yi = p.idx * 3 + 1;
      vertices[yi] += (avg - p.yv) * 0.1;
    }
  } else {
    const sign = (uiState.mode === 'lower') ? -1 : 1;
    for (let z = startZ; z <= endZ; z++) {
      for (let x = startX; x <= endX; x++) {
        const idx = z * vpr + x;
        const yi  = idx * 3 + 1;
        const dx = (x - hitVertX) * vertexCell;
        const dz = (z - hitVertZ) * vertexCell;
        const d  = Math.hypot(dx, dz);
        if (d < worldBrushRadius) {
          const falloff = Math.cos((d / worldBrushRadius) * (Math.PI / 2));
          const delta = falloff * uiState.step;
          vertices[yi] = Math.min(MAX_H, Math.max(MIN_H, vertices[yi] + delta * sign));
        }
      }
    }
  }

  posAttr.needsUpdate = true;
  geom.computeVertexNormals();
  rebuildGridAfterGeometry(appState); // keep red grid glued
  ball?.refresh();
}

export function initSculpting(appState, getUiState) {
  const { renderer, camera } = appState;
  let dragging = false;

  const cast = (ev) => {
    if (!appState.terrainMesh) return;
    const ui = getUiState();
    if (!ui.sculptOn) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x, y }, camera);

    const targets = [];
    if (appState.gridLines)   targets.push(appState.gridLines);
    if (appState.terrainMesh) targets.push(appState.terrainMesh);

    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length) applySculpt(hits[0].point, appState, ui);
  };

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (!getUiState().sculptOn) return;
    try { renderer.domElement.setPointerCapture(ev.pointerId); } catch {}
    dragging = true;
    cast(ev);
  });
  renderer.domElement.addEventListener('pointermove', (ev) => { if (dragging && getUiState().sculptOn) cast(ev); });
  window.addEventListener('pointerup',  () => { dragging = false; });
}

export function initTapToMove(appState, getUiState, getAllow) {
  const { renderer, camera } = appState;

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    const ui = getUiState();
    if (ui.sculptOn || !getAllow()) return;
    if (!appState.terrainMesh || !appState.ball) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x, y }, camera);

    // Prefer grid hits (they lie exactly on tile borders), then terrain
    const targets = [];
    if (appState.gridLines)   targets.push(appState.gridLines);
    if (appState.terrainMesh) targets.push(appState.terrainMesh);

    const hits = raycaster.intersectObjects(targets, false);
    if (!hits.length) return;

    const world = hits[0].point.clone();
    const local = appState.terrainMesh.worldToLocal(world);
    const { i, j } = localToTile(local.x, local.z, appState.config);
    appState.ball.placeOnTile(i, j);

    if (appState.camFollowEnabled) appState.controls.lookAt(appState.ball.mesh.position);
  }, { passive: true });
}
