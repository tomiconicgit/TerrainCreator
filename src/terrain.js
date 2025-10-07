// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import CubeMarker from './character.js';
import Terrain from '../vendor/THREE.Terrain.mjs';

const SUBDIVISIONS = 4; // segments per big tile

let gridLines = null;
let gridPositions = null;

// ---------- materials / helpers ----------
function makeSimpleMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.9,
    vertexColors: true,
  });
}

function setAllVertexColors(geom, colorHex = 0xD2B48C) {
  const col = new THREE.Color(colorHex);
  const { widthSegments, heightSegments } = geom.parameters;
  const vertexCount = (widthSegments + 1) * (heightSegments + 1);
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    colors[i * 3 + 0] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

// Bilinear sample (mesh local X/Z -> Y)
function sampleHeightLocal(x, z, terrainMesh, config) {
  const { TILES_X, TILES_Y, TILE_SIZE } = config;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  const g = terrainMesh.geometry;
  const pos = g.attributes.position.array;
  const { widthSegments, heightSegments } = g.parameters;

  const u = (x + W / 2) / W;
  const v = (z + H / 2) / H;

  const gx = u * widthSegments;
  const gz = v * heightSegments;

  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = Math.min(1, Math.max(0, gx - ix));
  const fz = Math.min(1, Math.max(0, gz - iz));

  const vpr = widthSegments + 1;
  const Y = (jj, ii) => pos[((jj) * vpr + (ii)) * 3 + 1];

  const x0 = Math.min(widthSegments, Math.max(0, ix));
  const z0 = Math.min(heightSegments, Math.max(0, iz));
  const x1 = Math.min(widthSegments, x0 + 1);
  const z1 = Math.min(heightSegments, z0 + 1);

  const y00 = Y(z0, x0);
  const y10 = Y(z0, x1);
  const y01 = Y(z1, x0);
  const y11 = Y(z1, x1);

  const y0 = y00 * (1 - fx) + y10 * fx;
  const y1 = y01 * (1 - fx) + y11 * fx;
  return y0 * (1 - fz) + y1 * fz;
}

// ---------- red grid (build once, then UPDATE) ----------
function buildMainGrid(appState) {
  if (gridLines) {
    try { gridLines.geometry?.dispose(); } catch {}
    try { gridLines.material?.dispose(); } catch {}
    try { appState.terrainGroup?.remove(gridLines); } catch {}
  }
  gridLines = null;
  gridPositions = null;

  const { TILES_X, TILES_Y, TILE_SIZE } = appState.config;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  const segsX = TILES_X * SUBDIVISIONS;
  const segsY = TILES_Y * SUBDIVISIONS;

  const segmentsCount =
    (TILES_X * segsY) +
    (TILES_Y * segsX) +
    segsY + segsX;

  const geom = new THREE.BufferGeometry();
  gridPositions = new Float32Array(segmentsCount * 2 * 3);
  geom.setAttribute('position', new THREE.BufferAttribute(gridPositions, 3));

  const mat = new THREE.LineBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.95 });
  gridLines = new THREE.LineSegments(geom, mat);
  gridLines.name = 'MainTileGrid';
  gridLines.renderOrder = 2;
  gridLines.frustumCulled = false;

  appState.terrainGroup.add(gridLines);
  refreshMainGrid(appState);
}

export function refreshMainGrid(appState) {
  if (!appState.terrainMesh || !gridLines || !gridPositions) return;

  const { TILES_X, TILES_Y, TILE_SIZE } = appState.config;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  const segsX = TILES_X * SUBDIVISIONS;
  const segsY = TILES_Y * SUBDIVISIONS;

  const lift = 0.6;
  let p = 0;

  // vertical lines
  for (let i = 0; i <= TILES_X; i++) {
    const x = -W / 2 + i * TILE_SIZE;
    for (let k = 0; k < segsY; k++) {
      const z0 = -H / 2 + (k / segsY) * H;
      const z1 = -H / 2 + ((k + 1) / segsY) * H;
      const y0 = sampleHeightLocal(x, z0, appState.terrainMesh, appState.config) + lift;
      const y1 = sampleHeightLocal(x, z1, appState.terrainMesh, appState.config) + lift;

      gridPositions[p++] = x;  gridPositions[p++] = y0; gridPositions[p++] = z0;
      gridPositions[p++] = x;  gridPositions[p++] = y1; gridPositions[p++] = z1;
    }
  }

  // horizontal lines
  for (let j = 0; j <= TILES_Y; j++) {
    const z = -H / 2 + j * TILE_SIZE;
    for (let k = 0; k < segsX; k++) {
      const x0 = -W / 2 + (k / segsX) * W;
      const x1 = -W / 2 + ((k + 1) / segsX) * W;
      const y0 = sampleHeightLocal(x0, z, appState.terrainMesh, appState.config) + lift;
      const y1 = sampleHeightLocal(x1, z, appState.terrainMesh, appState.config) + lift;

      gridPositions[p++] = x0; gridPositions[p++] = y0; gridPositions[p++] = z;
      gridPositions[p++] = x1; gridPositions[p++] = y1; gridPositions[p++] = z;
    }
  }

  gridLines.geometry.attributes.position.needsUpdate = true;
  gridLines.geometry.computeBoundingSphere();
  appState.gridLines = gridLines;
}

export function rebuildGridAfterGeometry(appState) {
  if (gridLines && gridPositions) refreshMainGrid(appState);
  else buildMainGrid(appState);
}

export function setMainGridVisible(appState, visible) {
  if (gridLines) gridLines.visible = !!visible;
  appState.gridMainVisible = !!visible;
}

// ---------- terrain lifecycle ----------
export function createTerrain(appState) {
  const { scene } = appState;
  const { TILES_X, TILES_Y, TILE_SIZE, CHAR_HEIGHT_UNITS } = appState.config;

  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  dispose(appState.terrainGroup);
  dispose(appState.treesGroup);
  appState.treesGroup = null;

  const widthSegments  = TILES_X * SUBDIVISIONS;
  const heightSegments = TILES_Y * SUBDIVISIONS;

  const geom = new THREE.PlaneGeometry(W, H, widthSegments, heightSegments);
  geom.rotateX(-Math.PI / 2);

  const mat = makeSimpleMaterial();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;

  setAllVertexColors(geom, 0xD2B48C);

  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'TileTerrain';
  terrainGroup.add(mesh);
  scene.add(terrainGroup);

  appState.terrainGroup = terrainGroup;
  appState.terrainMesh = mesh;
  appState.terrainMaterial = mat;

  buildMainGrid(appState);
  setMainGridVisible(appState, appState.gridMainVisible ?? true);

  const cubeSize = Math.max(10, Math.min(TILE_SIZE * 0.6, CHAR_HEIGHT_UNITS * 0.5));
  appState.ball?.dispose();
  appState.ball = new CubeMarker({
    three: THREE,
    scene,
    terrainMesh: mesh,
    config: appState.config,
    tileI: Math.floor(TILES_X / 3),
    tileJ: Math.floor(TILES_Y / 3),
    size:  cubeSize,
    color: 0xff2b2b,
    hover: 0
  });
}

// ---------- editing ops (used by UI) ----------
export function randomizeTerrain(appState) {
  const { terrainMesh, config } = appState;
  if (!terrainMesh) return;

  const { MIN_H, MAX_H, TILE_SIZE } = config;
  const pos = terrainMesh.geometry.attributes.position;
  const arr = pos.array;

  const jitter = TILE_SIZE * 0.25; // gentle
  for (let i = 1; i < arr.length; i += 3) {
    const y = arr[i] + (Math.random() * 2 - 1) * jitter;
    arr[i] = THREE.MathUtils.clamp(y, MIN_H, MAX_H);
  }
  pos.needsUpdate = true;
  terrainMesh.geometry.computeVertexNormals();
  rebuildGridAfterGeometry(appState);
  appState.ball?.refresh();
}

export function applyHeightmapTemplate(templateName, appState) {
  const { terrainMesh, config } = appState;
  if (!terrainMesh) return;

  const { MIN_H, MAX_H, TILES_X, TILES_Y, TILE_SIZE } = config;
  const widthSegments  = TILES_X * SUBDIVISIONS;
  const heightSegments = TILES_Y * SUBDIVISIONS;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  // Build a temporary terrain using the helper module, then copy Y values.
  const t = new Terrain({
    three: THREE,
    heightmap: templateName, // 'Perlin' | 'Simplex' | 'Fault' | etc.
    frequency: 2.5,
    minHeight: MIN_H,
    maxHeight: MAX_H,
    xSegments: widthSegments,
    ySegments: heightSegments,
    xSize: W,
    ySize: H,
    steps: 1,
    easing: Terrain.Linear,
  });

  const src = t.getMesh().geometry.attributes.position.array;
  const dst = terrainMesh.geometry.attributes.position.array;

  // Copy only the Y components (every 3rd starting at index 1)
  for (let i = 1; i < dst.length && i < src.length; i += 3) {
    dst[i] = src[i];
  }

  terrainMesh.geometry.attributes.position.needsUpdate = true;
  terrainMesh.geometry.computeVertexNormals();

  rebuildGridAfterGeometry(appState);
  appState.ball?.refresh();
}