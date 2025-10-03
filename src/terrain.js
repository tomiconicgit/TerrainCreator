// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import BallMarker from './character.js';

let edgesHelper = null;

// --- A NEW, SIMPLE SHADER FOR PER-TILE TEXTURING ---
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    // Pass the vertex color (our texture "switch") to the fragment shader
    vColor = color;

    // Pass the UV coordinates
    vUv = uv;

    // Standard position calculation
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uSandTexture;
  uniform sampler2D uLeavesTexture;

  varying vec2 vUv;
  varying vec3 vColor;

  void main() {
    // fract() gets the fractional part of the UV coordinate.
    // Since our UVs now go from 0 to 30, fract(vUv) will repeat from 0 to 1 for each tile.
    vec2 tileUv = fract(vUv);

    // Sample both the sand and leaves textures using these repeating tile UVs
    vec3 sandColor = texture2D(uSandTexture, tileUv).rgb;
    vec3 leavesColor = texture2D(uLeavesTexture, tileUv).rgb;

    // The vColor.r is our "switch".
    // If it's 0 (not painted), it will show sandColor.
    // If it's 1 (painted with leaves), it will show leavesColor.
    vec3 finalColor = mix(sandColor, leavesColor, vColor.r);

    gl_FragColor = vec4(finalColor, 1.0);
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

    // --- CRUCIAL UV MODIFICATION ---
    // This loop remaps the UV coordinates so each tile gets its own 0-1 space.
    const uvs = geom.attributes.uv.array;
    for (let i = 0; i < uvs.length; i += 2) {
        uvs[i] *= TILES_X;
        uvs[i + 1] *= TILES_Y;
    }

    // --- Texture Loading ---
    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (path) => {
        const texture = textureLoader.load(path);
        // We use the shader for repeating, not the texture properties
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };
    
    // NOTE: You'll need to provide a sand texture.
    // For now, a placeholder color is created. Replace the path if you have an image.
    const createPlaceholderTexture = (color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };

    const terrainMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uSandTexture: { value: createPlaceholderTexture('#d2b48c') }, // Tan color for sand
            // You can replace the placeholder above with:
            // uSandTexture: { value: loadTexture('./src/assets/textures/sand.jpg') },
            uLeavesTexture: { value: loadTexture('./src/assets/textures/leaves-diffuse.jpg') },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        vertexColors: true,
    });
    appState.terrainMaterial = terrainMaterial;
    
    // Initialize vertex colors. All set to 0, so the 'sand' texture will show by default.
    const vertexCount = (TILES_X + 1) * (TILES_Y + 1);
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    
    const mesh = new THREE.Mesh(geom, terrainMaterial);
    // This shader isn't lit, so receiveShadow doesn't apply.
    // We can add lighting back in a later step if needed.
    mesh.receiveShadow = false;

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

// --- NEW, SIMPLIFIED PAINTING LOGIC ---
// This function now just changes the vertex colors of the tiles.
export function paintTextureOnTile(ci, cj, texture, radius, appState) {
    const { terrainMesh, config } = appState;
    if (!terrainMesh) return;

    // For now, we only have a "leaves" brush.
    // We set the RED channel to 1.0 for leaves.
    const paintValue = (texture === 'leaves') ? 1.0 : 0.0;

    const colorAttr = terrainMesh.geometry.attributes.color;
    const vertsPerRow = config.TILES_X + 1;

    // Loop through a square of tiles around the center point (ci, cj)
    for (let j = cj - radius; j <= cj + radius; j++) {
        for (let i = ci - radius; i <= ci + radius; i++) {
            // Check if the tile is within the terrain bounds
            if (i >= 0 && i < config.TILES_X && j >= 0 && j < config.TILES_Y) {
                // Check if the tile is within the circular brush radius
                const dist = Math.hypot(i - ci, j - cj);
                if (dist <= radius) {
                    // Get the 4 vertex indices for this tile
                    const v1 = j * vertsPerRow + i;         // Top-left
                    const v2 = j * vertsPerRow + (i + 1);     // Top-right
                    const v3 = (j + 1) * vertsPerRow + i;     // Bottom-left
                    const v4 = (j + 1) * vertsPerRow + (i + 1); // Bottom-right
                    
                    // Set the RED color component for each vertex
                    colorAttr.setX(v1, paintValue);
                    colorAttr.setX(v2, paintValue);
                    colorAttr.setX(v3, paintValue);
                    colorAttr.setX(v4, paintValue);
                }
            }
        }
    }

    // Tell Three.js the color attribute has been updated
    colorAttr.needsUpdate = true;
}

// The rest of the file is unchanged and correct.
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
    const { terrainMesh, ball, config } = appState;
    const { TILES_X, TILES_Y } = config;

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
