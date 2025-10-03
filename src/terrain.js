// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import BallMarker from './character.js';

let edgesHelper = null;

// Define our "procedural" textures as colours
const TEXTURE_COLORS = {
    grass: new THREE.Color(0x559040),
    sand: new THREE.Color(0xdacfa0),
    gravel: new THREE.Color(0x959794),
    stone: new THREE.Color(0x6b7280),
};
const DEFAULT_TEXTURE = 'grass';

function rebuildEdges(terrainGroup, terrainMesh) {
  // ... (no changes in this function)
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

    const geom = new THREE.PlaneGeometry(W, H, TILES_X, TILES_Y);
    geom.rotateX(-Math.PI / 2);

    // ========= NEW: ADD VERTEX COLOR ATTRIBUTE =========
    const vertexCount = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    const colors = geom.attributes.color;
    const defaultColor = TEXTURE_COLORS[DEFAULT_TEXTURE];
    for (let i = 0; i < vertexCount; i++) {
        colors.setXYZ(i, defaultColor.r, defaultColor.g, defaultColor.b);
    }
    // ======================================================

    // ========= MODIFIED: ENABLE VERTEX COLORS IN MATERIAL =========
    const mat = new THREE.MeshStandardMaterial({ 
        // color: 0x7c8a92, // We no longer need a single base color
        vertexColors: true, // This tells the material to use the 'color' attribute
        metalness: 0.05, 
        roughness: 0.9 
    });
    // ===============================================================
    
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = true;

    const terrainGroup = new THREE.Group();
    terrainGroup.name = 'TileTerrain';
    terrainGroup.add(mesh);
    scene.add(terrainGroup);

    appState.terrainGroup = terrainGroup;
    appState.terrainMesh = mesh;

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
      color: 0xff2b2b
    });
}

// ========= NEW: TEXTURE PAINTING FUNCTION =========
export function paintTextureOnTile(ci, cj, texture, radius, appState) {
    const { terrainMesh, config } = appState;
    if (!terrainMesh || !texture) return;

    const colorAttr = terrainMesh.geometry.attributes.color;
    const color = TEXTURE_COLORS[texture];
    if (!color) return;

    const vpr = config.TILES_X + 1; // Vertices per row

    // This function gets all vertex indices for a given tile (i, j)
    const getTileVertexIndices = (i, j) => {
        const tl = j * vpr + i;       // Top-left
        const tr = tl + 1;            // Top-right
        const bl = (j + 1) * vpr + i; // Bottom-left
        const br = bl + 1;            // Bottom-right
        return [tl, tr, bl, br];
    };
    
    // We iterate in a square around the center point (ci, cj)
    for (let j = cj - radius; j <= cj + radius; j++) {
        for (let i = ci - radius; i <= ci + radius; i++) {
            // Check if the tile is within the terrain bounds
            if (i >= 0 && i < config.TILES_X && j >= 0 && j < config.TILES_Y) {
                // Check if the tile is within the circular radius
                const dist = Math.hypot(i - ci, j - cj);
                if (dist <= radius) {
                    const vertexIndices = getTileVertexIndices(i, j);
                    vertexIndices.forEach(vi => {
                        colorAttr.setXYZ(vi, color.r, color.g, color.b);
                    });
                }
            }
        }
    }

    colorAttr.needsUpdate = true; // IMPORTANT: Tell Three.js the colors have changed
}
// ===============================================

// ... (rest of the file remains the same)
export function randomizeTerrain(appState) { /* ... */ }
export function applyHeightmapTemplate(name, appState) { /* ... */ }
