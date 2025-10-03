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

function sampleHeightLocal(x, z, appState) {
    const { terrainMesh, config } = appState;
    const { W, H } = planeWorldSize(config);
    const u = (x + W / 2) / W, v = (z + H / 2) / H;
    const gx = u * config.TILES_X, gy = v * config.TILES_Y;
    const vpr = config.TILES_X + 1;
    const i = Math.floor(gx), j = Math.floor(gy);
    const tx = _clamp(i, 0, config.TILES_X - 1), ty = _clamp(j, 0, config.TILES_Y - 1);
    const fx = gx - tx, fy = gy - ty;
    const pos = terrainMesh.geometry.attributes.position.array;
    const idx = (jj, ii) => ((jj) * vpr + (ii)) * 3 + 1;
    const y00 = pos[idx(ty, tx)], y10 = pos[idx(ty, tx + 1)], y01 = pos[idx(ty + 1, tx)], y11 = pos[idx(ty + 1, tx + 1)];
    const y0 = y00 * (1 - fx) + y10 * fx, y1 = y01 * (1 - fx) + y11 * fx;
    return y0 * (1 - fy) + y1 * fy;
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
    const i = (Math.random() * TILES_X) | 0;
    const j = (Math.random() * TILES_Y) | 0;
    const key = `${i},${j}`;
    if (used.has(key)) continue;
    
    used.add(key);
    const c = tileCenterLocal(i, j, config);
    const y = sampleHeightLocal(c.x, c.z, appState);
    const t = makeTree(config);
    t.position.set(c.x, y, c.z);
    appState.treesGroup.add(t);
    placed++;
  }
  terrainGroup.add(appState.treesGroup);
}
