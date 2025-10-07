// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import CubeMarker from './character.js';

// how many terrain-geometry segments per 1×1 tile
const SUBDIVISIONS = 4;

// internal refs
let gridLines = null;          // THREE.LineSegments (red grid)
let gridPositions = null;      // Float32Array backing the grid's BufferGeometry

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

// Bilinear sample of CURRENT terrain heights (mesh local X/Z -> Y)
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
  // clean old
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

  // pair-per-segment for both directions
  const segmentsCount =
    (TILES_X * segsY) +       // verticals along all columns
    (TILES_Y * segsX) +       // horizontals along all rows
    segsY + segsX;            // outer frame edges
  const floats = segmentsCount * 2 /*points*/ * 3 /*xyz*/;

  const geom = new THREE.BufferGeometry();
  gridPositions = new Float32Array(floats);
  geom.setAttribute('position', new THREE.BufferAttribute(gridPositions, 3));

  const mat = new THREE.LineBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.95 });
  gridLines = new THREE.LineSegments(geom, mat);
  gridLines.name = 'MainTileGrid';
  gridLines.renderOrder = 2;
  gridLines.frustumCulled = false;

  appState.terrainGroup.add(gridLines);

  // first layout (flat); immediately refresh to match current terrain
  refreshMainGrid(appState);
}

export function refreshMainGrid(appState) {
  if (!appState.terrainMesh || !gridLines || !gridPositions) return;

  const { TILES_X, TILES_Y, TILE_SIZE } = appState.config;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  const segsX = TILES_X * SUBDIVISIONS;
  const segsY = TILES_Y * SUBDIVISIONS;

  const lift = 0.6; // float above surface to avoid z-fighting
  let p = 0;

  // vertical lines (constant x, marching in z)
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

  // horizontal lines (constant z, marching in x)
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
  appState.gridLines = gridLines; // expose for raycasting
}

export function rebuildGridAfterGeometry(appState) {
  // If grid exists, update in place; otherwise build it.
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

  // (Re)build grid now that we have the mesh
  buildMainGrid(appState);
  setMainGridVisible(appState, appState.gridMainVisible ?? true);

  // Spawn the cube marker
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
    hover: 0,
  });
}

export function randomizeTerrain(appState) {
  if (!appState.terrainMesh) return;
  const arr = appState.terrainMesh.geometry.attributes.position.array;
  for (let i = 1; i < arr.length; i += 3) arr[i] += (Math.random() - 0.5) * 2.5;
  appState.terrainMesh.geometry.attributes.position.needsUpdate = true;
  appState.terrainMesh.geometry.computeVertexNormals();
  // keep grid synced
  rebuildGridAfterGeometry(appState);
  appState.ball?.refresh();
}

export function applyHeightmapTemplate(name, appState) {
  if (!appState.terrainMesh) return;

  const { terrainMesh, ball } = appState;
  const { widthSegments, heightSegments } = terrainMesh.geometry.parameters;

  const pos = terrainMesh.geometry.attributes.position.array;
  const minH = -80, maxH = 120, range = maxH - minH;
  let idx = 1;
  for (let jy = 0; jy <= heightSegments; jy++) {
    const v = jy / heightSegments;
    for (let ix = 0; ix <= widthSegments; ix++) {
      const u = ix / widthSegments;
      let n = 0;
      switch (name) {
        case 'Flat': n = -1; break;
        case 'DiamondSquare': n = Math.abs(_fbm(u * 2.5, v * 2.5, 5, 2, .5)) * 2 - 1; break;
        case 'Perlin': n = _fbm(u * 2.5, v * 2.5, 5, 2, .5, _perlin2); break;
        case 'Simplex': n = _fbm(u * 2.8, v * 2.8, 6, 2.1, .5, _perlin2); break;
        case 'Fault': n = _fault(u * 2.5, v * 2.5, 64); break;
        case 'Cosine': n = Math.cos(_fbm(u * 2.0, v * 2.0, 4, 2, .5) * Math.PI); break;
        case 'Value': n = _fbm((u * 2.5 | 0) + .001, (v * 2.5 | 0) + .001, 3, 2, .6, _perlin2); break;
        case 'Worley': n = _worley2(u, v, 3, 16); break;
        default: n = 0;
      }
      pos[idx] = minH + ((n + 1) * 0.5) * range;
      idx += 3;
    }
  }
  terrainMesh.geometry.attributes.position.needsUpdate = true;
  terrainMesh.geometry.computeVertexNormals();

  // sync grid after template
  rebuildGridAfterGeometry(appState);
  ball?.refresh();
}

// --- noise helpers (unchanged) ---
const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _smooth = (t) => t * t * (3 - 2 * t);
const _perm = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let j = 255; j > 0; j--) { const k = (Math.random() * (j + 1)) | 0; const t = p[j]; p[j] = p[k]; p[k] = t; }
  for (let m = 0; m < 512; m++) _perm[m] = p[m & 255];
})();
const _grad2 = (h, x, y) => {
  switch (h & 7) {
    case 0: return x + y; case 1: return x - y; case 2: return -x + y; case 3: return -x - y;
    case 4: return x; case 5: return -x; case 6: return y; default: return -y;
  }
};
const _perlin2 = (x, y) => {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = _smooth(x), v = _smooth(y);
  const aa = _perm[X + _perm[Y]], ab = _perm[X + _perm[Y + 1]], ba = _perm[X + 1 + _perm[Y]], bb = _perm[X + 1 + _perm[Y + 1]];
  const x1 = (1 - u) * _grad2(aa, x, y) + u * _grad2(ba, x - 1, y);
  const x2 = (1 - u) * _grad2(ab, x, y - 1) + u * _grad2(bb, x - 1, y - 1);
  return (1 - v) * x1 + v * x2;
};
const _fbm = (x, y, o = 5, l = 2, g = .5, noise = _perlin2) => {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < o; i++) { s += a * noise(x * f, y * f); n += a; a *= g; f *= l; }
  return s / n;
};
const _worley2 = (u, v, cell = 1, pts = 16) => {
  let md = 1e9;
  for (let i = 0; i < pts; i++) {
    const px = (Math.sin(i * 127.1) * 43758.5453) % 1, py = (Math.sin(i * 311.7) * 12543.1234) % 1;
    const d = Math.hypot((u * cell % 1) - px, (v * cell % 1) - py);
    if (d < md) md = d;
  }
  return 1.0 - _clamp(md * 2, 0, 1) * 2 + -1;
};
const _fault = (x, y, it = 50) => {
  let h = 0;
  for (let i = 0; i < it; i++) {
    const a = Math.random() * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a), c = Math.random() * 2 - 1;
    h += Math.sign(nx * x + ny * y - c) * (1 / it);
  }
  return _clamp(h, -1, 1);
};