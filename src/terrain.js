// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import BallMarker from './character.js';

let edgesHelper = null;
const SUBDIVISIONS = 4;

// --- FINAL SHADER WITH DISPLACEMENT AND PBR BLENDING ---
const vertexShader = `
  // These are passed in from the material's 'defines' property
  #define TILE_X float(${THREE.ShaderChunk.common.includes('TILE_X') ? 'TILE_X' : '30.0'})
  #define TILE_Y float(${THREE.ShaderChunk.common.includes('TILE_Y') ? 'TILE_Y' : '30.0'})

  uniform sampler2D uSandDisplacement;
  uniform sampler2D uLeavesDisplacement;
  uniform float uDisplacementScale;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  varying mat3 vTBN;

  void main() {
    vColor = color;
    // Create the tiled UV coordinates for the whole terrain
    vUv = uv * vec2(TILE_X, TILE_Y);

    // --- Vertex Displacement ---
    vec2 tileUv = fract(vUv);
    float sandDisp = texture2D(uSandDisplacement, tileUv).r;
    float leavesDisp = texture2D(uLeavesDisplacement, tileUv).r;
    // Blend displacement based on the red vertex color (our paint)
    float displacement = mix(sandDisp, leavesDisp, vColor.r);
    vec3 displacedPosition = position + normal * displacement * uDisplacementScale;

    // Calculate TBN matrix for normal mapping in the fragment shader
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vec3 worldTangent = normalize(mat3(modelMatrix) * tangent.xyz);
    vec3 worldBitangent = cross(worldNormal, worldTangent) * tangent.w;
    vTBN = mat3(worldTangent, worldBitangent, worldNormal);
    
    // Pass the world position to the fragment shader
    vWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uSandDiffuse;
  uniform sampler2D uSandNormal;
  uniform sampler2D uSandRoughness; // Added for sand
  uniform sampler2D uLeavesDiffuse;
  uniform sampler2D uLeavesNormal;
  uniform sampler2D uLeavesRoughness; // Added for leaves
  
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  varying mat3 vTBN;

  void main() {
    vec2 tileUv = fract(vUv);

    // --- PBR Texture Blending ---
    vec3 sandColor = texture2D(uSandDiffuse, tileUv).rgb;
    vec3 leavesColor = texture2D(uLeavesDiffuse, tileUv).rgb;
    vec3 albedo = mix(sandColor, leavesColor, vColor.r);

    // Blend Normal maps
    vec3 sandNormal = texture2D(uSandNormal, tileUv).rgb * 2.0 - 1.0;
    vec3 leavesNormal = texture2D(uLeavesNormal, tileUv).rgb * 2.0 - 1.0;
    vec3 tangentSpaceNormal = mix(sandNormal, leavesNormal, vColor.r);
    vec3 finalNormal = normalize(vTBN * tangentSpaceNormal);

    // Blend Roughness maps
    float sandRoughness = texture2D(uSandRoughness, tileUv).r;
    float leavesRoughness = texture2D(uLeavesRoughness, tileUv).r;
    float roughness = mix(sandRoughness, leavesRoughness, vColor.r);
    
    // --- PBR Lighting ---
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 halfwayDir = normalize(uSunDirection + viewDirection);

    float ambient = 0.3;
    float diffuse = max(0.0, dot(finalNormal, uSunDirection));
    
    // Specular highlight calculation using roughness
    float spec = pow(max(dot(finalNormal, halfwayDir), 0.0), (1.0 - roughness) * 256.0);
    vec3 specular = vec3(0.5) * spec;

    vec3 lighting = vec3(ambient + diffuse) + specular;

    vec3 finalColor = pow(albedo, vec3(2.2)) * lighting;
    gl_FragColor = vec4(pow(finalColor, vec3(1.0/2.2)), 1.0);
  }
`;


function rebuildEdges(terrainGroup, terrainMesh, config) {
    if (edgesHelper) dispose(edgesHelper);
}

export function createTerrain(appState) {
    const { scene, config } = appState;
    const { TILES_X, TILES_Y, TILE_SIZE, CHAR_HEIGHT_UNITS } = config;
    const W = TILES_X * TILE_SIZE;
    const H = TILES_Y * TILE_SIZE;

    dispose(appState.terrainGroup);
    
    const widthSegments = TILES_X * SUBDIVISIONS;
    const heightSegments = TILES_Y * SUBDIVISIONS;
    const geom = new THREE.PlaneGeometry(W, H, widthSegments, heightSegments);
    geom.rotateX(-Math.PI / 2);
    geom.computeTangents();

    const textureLoader = new THREE.TextureLoader();
    const loadTexture = (path, isColor = false) => {
        const texture = textureLoader.load(path);
        if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };
    
    // Create a plain white texture for placeholders
    const createPlaceholderTexture = (color) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const texture = new THREE.CanvasTexture(canvas);
        if (color !== '#FFFFFF') texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };

    const terrainMaterial = new THREE.ShaderMaterial({
        defines: {
            'TILE_X': TILES_X,
            'TILE_Y': TILES_Y
        },
        uniforms: {
            // Sand textures (using placeholders, replace with your own sand files if you get them)
            uSandDiffuse: { value: createPlaceholderTexture('#d2b48c') },
            uSandNormal: { value: createPlaceholderTexture('#8080FF') },
            uSandRoughness: { value: createPlaceholderTexture('#FFFFFF') },
            uSandDisplacement: { value: createPlaceholderTexture('#000000') },

            // Leaves textures (using your specified file paths)
            uLeavesDiffuse: { value: loadTexture('./src/assets/textures/leaves-diffuse.jpg', true) },
            uLeavesNormal: { value: loadTexture('./src/assets/textures/leaves-normal.png') },
            uLeavesRoughness: { value: loadTexture('./src/assets/textures/leaves-roughness.jpg') },
            uLeavesDisplacement: { value: loadTexture('./src/assets/textures/displacement.png') },
            
            uDisplacementScale: { value: 5.0 },
            uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
        },
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        vertexColors: true,
    });
    appState.terrainMaterial = terrainMaterial;
    
    const vertexCount = (widthSegments + 1) * (heightSegments + 1);
    geom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    
    const mesh = new THREE.Mesh(geom, terrainMaterial);
    
    const terrainGroup = new THREE.Group();
    terrainGroup.name = 'TileTerrain';
    terrainGroup.add(mesh);
    scene.add(terrainGroup);

    appState.terrainGroup = terrainGroup;
    appState.terrainMesh = mesh;

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
      config: config, 
    });
}

export function paintTextureOnTile(ci, cj, texture, radius, appState) {
    const { terrainMesh, config } = appState;
    if (!terrainMesh) return;

    const paintValue = (texture === 'leaves') ? 1.0 : 0.0;
    const colorAttr = terrainMesh.geometry.attributes.color;
    
    const actualSubdivisions = terrainMesh.geometry.parameters.widthSegments / config.TILES_X;
    const totalVertsX = config.TILES_X * actualSubdivisions + 1;

    for (let j = cj - radius; j <= cj + radius; j++) {
        for (let i = ci - radius; i <= ci + radius; i++) {
            if (i >= 0 && i < config.TILES_X && j >= 0 && j < config.TILES_Y) {
                const dist = Math.hypot(i - ci, j - cj);
                if (dist <= radius) {
                    for (let subJ = 0; subJ <= actualSubdivisions; subJ++) {
                        for (let subI = 0; subI <= actualSubdivisions; subI++) {
                            const vertX = i * actualSubdivisions + subI;
                            const vertY = j * actualSubdivisions + subJ;
                            const vertIndex = vertY * totalVertsX + vertX;
                            
                            if (colorAttr && vertIndex < colorAttr.count) {
                                colorAttr.setX(vertIndex, paintValue);
                            }
                        }
                    }
                }
            }
        }
    }
    colorAttr.needsUpdate = true;
}

export function randomizeTerrain(appState) {
    if (!appState.terrainMesh) return;
    const arr = appState.terrainMesh.geometry.attributes.position.array;
    for (let i = 1; i < arr.length; i += 3) {
      arr[i] += (Math.random() - 0.5) * 2.5;
    }
    appState.terrainMesh.geometry.attributes.position.needsUpdate = true;
    appState.terrainMesh.geometry.computeVertexNormals();
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
                //... other cases
                default: n = 0;
            }
            pos[idx] = minH + ((n + 1) * 0.5) * range;
            idx += 3;
        }
    }
    pos.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
    if (ball) ball.refresh();
}
