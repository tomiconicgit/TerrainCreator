// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import BallMarker from './character.js';

let edgesHelper = null;
const SUBDIVISIONS = 4;

// Simple, no-image material (vertex colors enabled)
function makeSimpleMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,          // multiplied by vertex colors
    metalness: 0.05,
    roughness: 0.9,
    vertexColors: true
  });
}

function setAllVertexColors(geom, colorHex = 0xD2B48C /* sandy tan */) {
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

function rebuildEdges(terrainGroup, terrainMesh) {
  if (!terrainMesh) return;
  if (edgesHelper) {
    if (edgesHelper.geometry) edgesHelper.geometry.dispose();
    if (edgesHelper.material) edgesHelper.material.dispose();
    if (terrainGroup) terrainGroup.remove(edgesHelper);
  }
  const edgesGeom = new THREE.EdgesGeometry(terrainMesh.geometry, 1);
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x2a9df4, transparent: true, opacity: 0.55 });
  edgesHelper = new THREE.LineSegments(edgesGeom, edgesMat);
  edgesHelper.renderOrder = 1;
  terrainGroup.add(edgesHelper);
}

export function createTerrain(appState) {
  const { scene } = appState;
  const { TILES_X, TILES_Y, TILE_SIZE, CHAR_HEIGHT_UNITS } = appState.config;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  dispose(appState.terrainGroup);
  dispose(appState.treesGroup);
  appState.treesGroup = null;

  const widthSegments = TILES_X * SUBDIVISIONS;
  const heightSegments = TILES_Y * SUBDIVISIONS;
  const geom = new THREE.PlaneGeometry(W, H, widthSegments, heightSegments);
  geom.rotateX(-Math.PI / 2);

  const mat = makeSimpleMaterial();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;

  // Vertex colors (simple sand color everywhere)
  setAllVertexColors(geom, 0xD2B48C);

  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'TileTerrain';
  terrainGroup.add(mesh);
  scene.add(terrainGroup);

  appState.terrainGroup = terrainGroup;
  appState.terrainMesh = mesh;
  appState.terrainMaterial = mat;

  rebuildEdges(terrainGroup, mesh);

  const ballRadius = Math.max(6, Math.min(TILE_SIZE * 0.45, CHAR_HEIGHT_UNITS * 0.35));
  if (appState.ball) appState.ball.dispose();

  appState.ball = new BallMarker({
    three: THREE,
    scene: scene,
    terrainMesh: mesh,
    tileI: Math.floor(TILES_X / 3),
    tileJ: Math.floor(TILES_Y / 3),
    radius: ballRadius,
    color: 0xff2b2b,
    config: appState.config,
  });
}

export function randomizeTerrain(appState) {
  if (!appState.terrainMesh) return;
  const arr = appState.terrainMesh.geometry.attributes.position.array;
  for (let i = 1; i < arr.length; i += 3) {
    arr[i] += (Math.random() - 0.5) * 2.5;
  }
  appState.terrainMesh.geometry.attributes.position.needsUpdate = true;
  appState.terrainMesh.geometry.computeVertexNormals();
  rebuildEdges(appState.terrainGroup, appState.terrainMesh);
  if (appState.ball) appState.ball.refresh();
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
  rebuildEdges(appState.terrainGroup, appState.terrainMesh);
  if (ball) ball.refresh();
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