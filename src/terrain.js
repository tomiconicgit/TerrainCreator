// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import BallMarker from './character.js';

let edgesHelper = null;

// Define colours and texture blend weights
const TEXTURE_INFO = {
    grass: { color: new THREE.Color(0x559040), weight: new THREE.Vector3(0, 1, 0) },
    sand:  { color: new THREE.Color(0xdacfa0), weight: new THREE.Vector3(0, 0, 1) },
    gravel:{ color: new THREE.Color(0x959794), weight: new THREE.Vector3(0, 0, 0) }, // Will appear as base
    stone: { color: new THREE.Color(0x6b7280), weight: new THREE.Vector3(0, 0, 0) }, // Will appear as base
    leaves:{ color: new THREE.Color(0x69553f), weight: new THREE.Vector3(1, 0, 0) },
};
const DEFAULT_TEXTURE = 'grass';

// --- NEW SHADER ---
// This shader blends textures based on vertex colors (R=Leaves, G=Grass, B=Sand)
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vWorldNormal; // Changed from vNormal
  varying vec3 vWorldPosition;
  varying mat3 vTBN;

  void main() {
    vUv = uv;
    vColor = color;
    
    vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldPosition = worldPosition;

    // --- CORRECTION: Pass world-space vectors to fragment shader ---
    vec3 worldNormal = normalize(vec3(modelMatrix * vec4(normal, 0.0)));
    vWorldNormal = worldNormal;
    
    // For Normal Mapping
    vec3 worldTangent = normalize(vec3(modelMatrix * vec4(tangent.xyz, 0.0)));
    vec3 worldBitangent = cross(worldNormal, worldTangent) * tangent.w;
    vTBN = mat3(worldTangent, worldBitangent, worldNormal);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uGrassDiffuse;
  uniform sampler2D uSandDiffuse;
  uniform sampler2D uLeavesDiffuse;
  uniform sampler2D uLeavesNormal;
  uniform sampler2D uLeavesRoughness;

  uniform vec3 uSunDirection;
  uniform vec3 uDirLightColor;
  uniform float uDirLightIntensity;

  varying vec2 vUv;
  varying vec3 vColor; // Blend weights (R: leaves, G: grass, B: sand)
  varying vec3 vWorldNormal; // Changed from vNormal
  varying vec3 vWorldPosition;
  varying mat3 vTBN;

  void main() {
    // --- 1. Texture Blending ---
    float textureScale = 20.0;
    vec3 grassColor = texture2D(uGrassDiffuse, vUv * textureScale).rgb;
    vec3 sandColor = texture2D(uSandDiffuse, vUv * textureScale).rgb;
    vec3 leavesColor = texture2D(uLeavesDiffuse, vUv * textureScale).rgb;

    // Blend diffuse colors based on vertex color weights
    vec3 baseColor = mix(grassColor, sandColor, vColor.b); // Mix grass and sand
    vec3 blendedDiffuse = mix(baseColor, leavesColor, vColor.r); // Mix in leaves

    // --- 2. Normal Mapping ---
    vec3 tangentSpaceNormal = texture2D(uLeavesNormal, vUv * textureScale).xyz * 2.0 - 1.0;
    vec3 perturbedNormal = normalize(vTBN * tangentSpaceNormal);

    // --- CORRECTION: Mix between two world-space normals ---
    vec3 finalNormal = normalize(mix(vWorldNormal, perturbedNormal, vColor.r));

    // --- 3. Roughness ---
    float leavesRoughness = texture2D(uLeavesRoughness, vUv * textureScale).r;
    float blendedRoughness = mix(0.9, leavesRoughness, vColor.r); // Base roughness vs leaves roughness

    // --- 4. Lighting (Simplified PBR) ---
    // All lighting calculations now use the correct world-space 'finalNormal'
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    
    // Ambient Light (from sky)
    float skyFactor = dot(finalNormal, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    vec3 skyLight = mix(vec3(0.3, 0.2, 0.1), vec3(0.4, 0.5, 0.7), skyFactor) * 0.5;

    // Direct Sun Light
    float diffuseStrength = max(0.0, dot(finalNormal, uSunDirection));
    vec3 diffuse = diffuseStrength * uDirLightColor * uDirLightIntensity;

    // Specular
    vec3 halfwayDir = normalize(uSunDirection + viewDirection);
    float spec = pow(max(dot(finalNormal, halfwayDir), 0.0), 32.0);
    vec3 specular = (spec * (1.0 - blendedRoughness)) * uDirLightColor * uDirLightIntensity * 0.5;

    vec3 lighting = skyLight + diffuse + specular;
    vec3 finalColor = pow(blendedDiffuse, vec3(2.2)) * lighting; // Gamma correction on diffuse

    gl_FragColor = vec4(pow(finalColor, vec3(1.0/2.2)), 1.0); // Final gamma correction
  }
`;


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

    const geom = new THREE.PlaneGeometry(W, H, TILES_X, TILES_Y);
    geom.rotateX(-Math.PI / 2);
    geom.computeTangents(); // IMPORTANT: Needed for normal mapping

    // --- Load Textures ---
    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (path) => {
        const texture = textureLoader.load(path);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    };
    
    // NOTE: You'll need to provide your own grass and sand textures
    // For now, we'll create simple 1x1 pixel placeholders
    const createPlaceholderTexture = (color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        return new THREE.CanvasTexture(canvas);
    };

    const terrainMaterial = new THREE.ShaderMaterial({
        uniforms: {
          // Texture uniforms
          uGrassDiffuse: { value: createPlaceholderTexture('#559040') },
          uSandDiffuse: { value: createPlaceholderTexture('#dacfa0') },
          uLeavesDiffuse: { value: loadTexture('./assets/textures/leaves-diffuse.jpg') },
          uLeavesNormal: { value: loadTexture('./assets/textures/leaves-normal.png') },
          uLeavesRoughness: { value: loadTexture('./assets/textures/leaves-roughness.jpg') },
          // Lighting uniforms (will be updated in main.js)
          uSunDirection: { value: new THREE.Vector3(0.707, 0.707, 0) },
          uDirLightColor: { value: new THREE.Color(0xffffff) },
          uDirLightIntensity: { value: 1.0 },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        vertexColors: true,
      });
      appState.terrainMaterial = terrainMaterial;
    
    // Set initial vertex colors to be all grass (0,1,0)
    const vertexCount = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    const colors = geom.attributes.color;
    const defaultWeight = TEXTURE_INFO[DEFAULT_TEXTURE].weight;
    for (let i = 0; i < vertexCount; i++) {
        colors.setXYZ(i, defaultWeight.x, defaultWeight.y, defaultWeight.z);
    }
    
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

// --- MODIFIED PAINTING LOGIC ---
export function paintTextureOnTile(ci, cj, texture, radius, appState) {
    const { terrainMesh, config, ball } = appState;
    if (!terrainMesh || !texture) return;

    const colorAttr = terrainMesh.geometry.attributes.color;
    const brushWeight = TEXTURE_INFO[texture]?.weight;
    if (!brushWeight) return; // Exit if texture is not in our list

    const vpr = config.TILES_X + 1;
    const getTileVertexIndices = (i, j) => {
        const tl = j * vpr + i; const tr = tl + 1;
        const bl = (j + 1) * vpr + i; const br = bl + 1;
        return [tl, tr, bl, br];
    };
    
    const existingWeight = new THREE.Vector3();
    for (let j = cj - radius; j <= cj + radius; j++) {
        for (let i = ci - radius; i <= ci + radius; i++) {
            if (i >= 0 && i < config.TILES_X && j >= 0 && j < config.TILES_Y) {
                const dist = Math.hypot(i - ci, j - cj);
                if (dist <= radius) {
                    const falloff = Math.max(0, 1.0 - (dist / radius));
                    const blendStrength = falloff * falloff * 0.1; // Slow blend
                    
                    const vertexIndices = getTileVertexIndices(i, j);
                    vertexIndices.forEach(vi => {
                        existingWeight.fromBufferAttribute(colorAttr, vi);
                        
                        // Lerp towards the target weight
                        existingWeight.lerp(brushWeight, blendStrength);

                        // Normalize the weights so they sum to 1 (prevents weird blending)
                        const total = existingWeight.x + existingWeight.y + existingWeight.z;
                        if (total > 0.0) {
                            existingWeight.divideScalar(total);
                        }

                        colorAttr.setXYZ(vi, existingWeight.x, existingWeight.y, existingWeight.z);
                    });
                }
            }
        }
    }

    colorAttr.needsUpdate = true;
    // No need to update position or normals when just painting
    if (ball) ball.refresh();
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
    const { TILES_X, TILES_Y } = appState.config;
    const pos = terrainMesh.geometry.attributes.position.array;
    const minH = -80, maxH = 120, range = maxH - minH;
    let idx = 1;
    for (let jy = 0; jy <= TILES_Y; jy++) {
        const v = jy / TILES_Y;
        for (let ix = 0; ix <= TILES_X; ix++) {
            const u = ix / TILES_X;
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
    rebuildEdges(appState.terrainGroup, terrainMesh);
    if (ball) ball.refresh();
}

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
