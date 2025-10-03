// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import BallMarker from './character.js';

let edgesHelper = null;
let terrainMaterial = null;

const TEXTURE_COLORS = {
    grass: new THREE.Color(0x559040),
    sand: new THREE.Color(0xdacfa0),
    gravel: new THREE.Color(0x959794),
    stone: new THREE.Color(0x6b7280),
};
const DEFAULT_TEXTURE = 'grass';

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vViewDirection;
  varying vec3 vWorldPosition;

  void main() {
    vColor = color;
    vNormal = normalize(normalMatrix * normal);
    
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  // NEW UNIFORMS FOR REAL SCENE LIGHTING
  uniform vec3 uSunDirection;
  uniform vec3 uDirLightColor;
  uniform float uDirLightIntensity;
  uniform vec3 uAmbientLightColor;

  varying vec3 vNormal;
  varying vec3 vColor;
  varying vec3 vViewDirection;
  varying vec3 vWorldPosition;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.y * u.x;
  }

  void main() {
    // Convert incoming sRGB vertex color to linear space for correct lighting
    vec3 linearBaseColor = pow(vColor, vec3(2.2));
    
    bool isGrass = linearBaseColor.g > linearBaseColor.r * 1.1 && linearBaseColor.g > linearBaseColor.b * 1.1;

    if (isGrass) {
      float mottling = noise(vWorldPosition.xz * 0.03) * 0.5 + 0.5;
      vec3 grassDark = linearBaseColor * 0.75;
      vec3 grassLight = linearBaseColor * 1.25;
      linearBaseColor = mix(grassDark, grassLight, mottling);
    }
    
    // ======== UPGRADED LIGHTING CALCULATION ========
    vec3 normal = normalize(vNormal);
    
    // Ambient light from scene
    vec3 ambient = uAmbientLightColor;

    // Diffuse light from scene sun
    float diffuseStrength = max(0.0, dot(normal, uSunDirection));
    vec3 diffuse = diffuseStrength * uDirLightColor * uDirLightIntensity;

    // Specular highlight
    vec3 halfwayDir = normalize(uSunDirection + vViewDirection);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), 32.0);
    float specularStrength = isGrass ? 0.2 : 0.5;
    vec3 specular = specularStrength * spec * uDirLightColor * uDirLightIntensity;
    
    // Combine lighting components
    vec3 lighting = ambient + diffuse + specular;

    // Apply lighting to the linear base color
    vec3 finalColor = linearBaseColor * lighting;

    // The renderer will handle the final conversion from linear to sRGB screen space
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

    const vertexCount = geom.attributes.position.count;
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    const colors = geom.attributes.color;
    const defaultColor = TEXTURE_COLORS[DEFAULT_TEXTURE];
    for (let i = 0; i < vertexCount; i++) {
        colors.setXYZ(i, defaultColor.r, defaultColor.g, defaultColor.b);
    }

    if (!terrainMaterial) {
      terrainMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uSunDirection: { value: new THREE.Vector3(0.707, 0.707, 0) },
          // Add uniforms to receive light data from JS
          uDirLightColor: { value: new THREE.Color() },
          uDirLightIntensity: { value: 1.0 },
          uAmbientLightColor: { value: new THREE.Color() }
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        vertexColors: true,
      });
      appState.terrainMaterial = terrainMaterial;
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

export function paintTextureOnTile(ci, cj, texture, radius, appState) {
    const { terrainMesh, config, ball } = appState;
    if (!terrainMesh || !texture) return;

    const colorAttr = terrainMesh.geometry.attributes.color;
    const positionAttr = terrainMesh.geometry.attributes.position;
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

                        // --- NEW: PERLIN NOISE DISPLACEMENT FOR GRASS AND SAND ---
                        if (texture === 'grass' || texture === 'sand') {
                            const x = positionAttr.getX(vi);
                            const z = positionAttr.getZ(vi);
                            let frequency = 0.0;
                            let amplitude = 0.0;

                            if(texture === 'grass') {
                                frequency = 0.8; // Higher frequency for bumpy grass
                                amplitude = 0.3; 
                            } else { // sand
                                frequency = 0.1; // Lower frequency for gentle dunes
                                amplitude = 0.2;
                            }

                            // _perlin2 returns a value between -1 and 1
                            const noise = _perlin2(x * frequency, z * frequency);
                            const displacement = noise * amplitude * blendStrength;
                            
                            positionAttr.setY(vi, positionAttr.getY(vi) + displacement);
                        }
                    });
                }
            }
        }
    }

    colorAttr.needsUpdate = true;
    positionAttr.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();

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
