// file: src/trees.js
import * as THREE from 'three';
import { dispose } from './utils.js';

const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));

function planeWorldSize(config) {
  return { W: config.TILES_X * config.TILE_SIZE, H: config.TILES_Y * config.TILE_SIZE };
}

function tileCenterLocal(i, j, config) {
  const { W, H } = planeWorldSize(config);
  const x = -W / 2 + (i + 0.5) * config.TILE_SIZE;
  const z = -H / 2 + (j + 0.5) * config.TILE_SIZE;
  return new THREE.Vector3(x, 0, z);
}

// Sample the height by bilinear interpolation on the ACTUAL geometry grid
function sampleHeightLocal(x, z, appState) {
  const { terrainMesh, config } = appState;
  const { W, H } = planeWorldSize(config);
  const g = terrainMesh.geometry;
  const pos = g.attributes.position.array;
  const { widthSegments, heightSegments } = g.parameters;

  const u = (x + W / 2) / W;
  const v = (z + H / 2) / H;

  const gx = u * widthSegments;
  const gz = v * heightSegments;

  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;

  const vpr = widthSegments + 1;
  const idx = (jj, ii) => ((jj) * vpr + (ii)) * 3 + 1;

  const x0 = _clamp(ix, 0, widthSegments);
  const z0 = _clamp(iz, 0, heightSegments);
  const x1 = _clamp(ix + 1, 0, widthSegments);
  const z1 = _clamp(iz + 1, 0, heightSegments);

  const y00 = pos[idx(z0, x0)];
  const y10 = pos[idx(z0, x1)];
  const y01 = pos[idx(z1, x0)];
  const y11 = pos[idx(z1, x1)];

  const y0 = y00 * (1 - fx) + y10 * fx;
  const y1 = y01 * (1 - fx) + y11 * fx;
  return y0 * (1 - fz) + y1 * fz;
}

function makeTree(config) {
  const { TILE_SIZE, CHAR_HEIGHT_UNITS, TREE_MIN_RATIO, TREE_MAX_RATIO } = config;
  const ratio = THREE.MathUtils.lerp(TREE_MIN_RATIO, TREE_MAX_RATIO, Math.random());
  const totalH = CHAR_HEIGHT_UNITS * ratio;
  const trunkH = totalH * 0.42;
  const crownH = totalH - trunkH;

  const crownR = Math.min(TILE_SIZE * 0.45, totalH * 0.22);
  const trunkRBottom = Math.max(TILE_SIZE * 0.06, crownR * 0.22);
  const trunkRTop = Math.max(TILE_SIZE * 0.04, crownR * 0.16);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkRTop, trunkRBottom, trunkH, 10),
    new THREE.MeshStandardMaterial({ color: 0x735a3a, roughness: 0.9 })
  );
  trunk.position.y = trunkH * 0.5;

  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(crownR, crownH, 12),
    new THREE.MeshStandardMaterial({ color: 0x2f9448, roughness: 0.9 })
  );
  crown.position.y = trunkH + crownH * 0.5;

  trunk.castShadow = true;
  crown.castShadow = true;
  const g = new THREE.Group();
  g.add(trunk, crown);
  return g;
}

export function populateTrees(count, appState) {
  dispose(appState.treesGroup);
  appState.treesGroup = null;

  if (!appState.terrainMesh || count <= 0) return;
  
  const { terrainGroup, config } = appState;
  const { TILES_X, TILES_Y } = config;

  appState.treesGroup = new THREE.Group();
  appState.treesGroup.name = 'Trees';
  
  const max = Math.min(count, TILES_X * TILES_Y);
  const used = new Set();
  let placed = 0;
  
  while (placed < max) {
    const i = (Math.random() * TILES_X) | 0; // main tile i
    const j = (Math.random() * TILES_Y) | 0; // main tile j
    const key = `${i},${j}`;
    if (used.has(key)) continue;
    
    used.add(key);
    const c = tileCenterLocal(i, j, config); // center of BIG tile
    const y = sampleHeightLocal(c.x, c.z, appState); // correct bilinear sample
    const t = makeTree(config);
    t.position.set(c.x, y, c.z);
    appState.treesGroup.add(t);
    placed++;
  }
  terrainGroup.add(appState.treesGroup);
}
