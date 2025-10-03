// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import BallMarker from './character.js';

let edgesHelper = null;
let terrainMaterial = null; // We'll need to update this from main.js

const TEXTURE_COLORS = {
    grass: new THREE.Color(0x559040),
    sand: new THREE.Color(0xdacfa0),
    gravel: new THREE.Color(0x959794),
    stone: new THREE.Color(0x6b7280),
};
const DEFAULT_TEXTURE = 'grass';

// ========= NEW: SHADER CODE =========
const vertexShader = `
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vColor;

  void main() {
    vColor = color;
    vNormal = normalize(normalMatrix * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uSunDirection;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying vec3 vColor;

  // Simple pseudo-random noise function
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  // 2D Noise function based on the random function
  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.y * u.x;
  }

  void main() {
    vec3 baseColor = vColor;
    bool isGrass = baseColor.g > baseColor.r && baseColor.g > baseColor.b * 1.2;

    if (isGrass) {
      // 1. Mottling (large scale color variation)
      float mottling = noise(vWorldPosition.xz * 0.01) * 0.5 + 0.5; // from 0.5 to 1.0
      vec3 grassDark = baseColor * 0.8;
      vec3 grassLight = baseColor * 1.2;
      baseColor = mix(grassDark, grassLight, mottling);

      // 2. Dirt patches
      float dirtNoise = noise(vWorldPosition.xz * 0.1);
      float dirtAmount = smoothstep(0.4, 0.55, dirtNoise);
      vec3 dirtColor = vec3(0.4, 0.25, 0.1);
      baseColor = mix(baseColor, dirtColor, dirtAmount);
    }
    
    // 3. Lighting
    vec3 normal = normalize(vNormal);
    float diffuse = max(0.0, dot(normal, uSunDirection));
    
    // Simple ambient light so shadows aren't pure black
    float ambient = 0.4;
    float lighting = ambient + (diffuse * (1.0 - ambient));

    gl_FragColor = vec4(baseColor * lighting, 1.0);
  }
`;
// ===================================

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

    const vertexCount = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    const colors = geom.attributes.color;
    const defaultColor = TEXTURE_COLORS[DEFAULT_TEXTURE];
    for (let i = 0; i < vertexCount; i++) {
        colors.setXYZ(i, defaultColor.r, defaultColor.g, defaultColor.b);
    }

    // ========= MODIFIED: USE SHADER MATERIAL =========
    if (!terrainMaterial) {
      terrainMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSunDirection: { value: new THREE.Vector3(0.707, 0.707, 0) },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        vertexColors: true,
      });
      appState.terrainMaterial = terrainMaterial;
    }
    // ===============================================
    
    const mesh = new THREE.Mesh(geom, terrainMaterial);
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

export function paintTextureOnTile(ci, cj, texture, radius, appState) {
    // ... (This function remains exactly the same as the previous version)
    const { terrainMesh, config } = appState;
    if (!terrainMesh || !texture) return;
    const colorAttr = terrainMesh.geometry.attributes.color;
    const brushColor = TEXTURE_COLORS[texture];
    if (!brushColor) return;
    const vpr = config.TILES_X + 1;
    const getTileVertexIndices = (i, j) => {
        const tl = j * vpr + i; const tr = tl + 1;
        const bl = (j + 1) * vpr + i; const br = bl + 1;
        return [tl, tr, bl, br];
    };
    const existingColor = new THREE.Color();
    for (let j = cj - radius; j <= cj + radius; j++) {
        for (let i = ci - radius; i <= ci + radius; i++) {
            if (i >= 0 && i < config.TILES_X && j >= 0 && j < config.TILES_Y) {
                const dist = Math.hypot(i - ci, j - cj);
                if (dist <= radius) {
                    const normalizedDist = dist / radius;
                    const blendStrength = Math.max(0, 1.0 - normalizedDist * normalizedDist);
                    const vertexIndices = getTileVertexIndices(i, j);
                    vertexIndices.forEach(vi => {
                        existingColor.fromBufferAttribute(colorAttr, vi);
                        existingColor.lerp(brushColor, blendStrength);
                        colorAttr.setXYZ(vi, existingColor.r, existingColor.g, existingColor.b);
                    });
                }
            }
        }
    }
    colorAttr.needsUpdate = true;
}

// ... (rest of the file is unchanged)
export function randomizeTerrain(appState) { /* ... */ }
export function applyHeightmapTemplate(name, appState) { /* ... */ }
const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));
// ... and so on
