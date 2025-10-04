// file: src/terrain.js
import * as THREE from 'three';
import { dispose } from './utils.js';
import BallMarker from './character.js';

let edgesHelper = null;
const SUBDIVISIONS = 4;

// --- FINAL SHADER WITH 3-TEXTURE PBR BLENDING ---
const vertexShader = `
  // Pass TILES_X/Y as #define constants for use in GLSL
  #define TILE_X float(30.0)
  #define TILE_Y float(30.0)

  uniform sampler2D uRockDisplacement;
  uniform sampler2D uLeavesDisplacement;
  uniform sampler2D uDesertDisplacement;
  uniform float uDisplacementScale;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  varying mat3 vTBN;

  void main() {
    vColor = color; // The blend weights (R: leaves, G: desert)
    vUv = uv * vec2(TILE_X, TILE_Y);

    // --- Vertex Displacement ---
    vec2 tileUv = fract(vUv);
    float rockDisp = texture2D(uRockDisplacement, tileUv).r;
    float leavesDisp = texture2D(uLeavesDisplacement, tileUv).r;
    float desertDisp = texture2D(uDesertDisplacement, tileUv).r;
    
    // Blend displacement maps
    float displacement = rockDisp;
    displacement = mix(displacement, leavesDisp, vColor.r);
    displacement = mix(displacement, desertDisp, vColor.g);
    
    vec3 displacedPosition = position + normal * displacement * uDisplacementScale;

    // Calculate TBN matrix for normal mapping
    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vec3 worldTangent = normalize(mat3(modelMatrix) * tangent.xyz);
    vec3 worldBitangent = cross(worldNormal, worldTangent) * tangent.w;
    vTBN = mat3(worldTangent, worldBitangent, worldNormal);
    
    vWorldPosition = (modelMatrix * vec4(displacedPosition, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uRockDiffuse;
  uniform sampler2D uRockNormal;
  uniform sampler2D uRockRoughness;
  
  uniform sampler2D uLeavesDiffuse;
  uniform sampler2D uLeavesNormal;
  uniform sampler2D uLeavesRoughness;
  
  uniform sampler2D uDesertDiffuse;
  uniform sampler2D uDesertNormal;
  uniform sampler2D uDesertRoughness;
  
  uniform vec3 uSunDirection;

  varying vec2 vUv;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  varying mat3 vTBN;

  void main() {
    vec2 tileUv = fract(vUv);

    // --- PBR Texture Blending ---
    vec3 rockColor = texture2D(uRockDiffuse, tileUv).rgb;
    vec3 leavesColor = texture2D(uLeavesDiffuse, tileUv).rgb;
    vec3 desertColor = texture2D(uDesertDiffuse, tileUv).rgb;
    vec3 albedo = rockColor;
    albedo = mix(albedo, leavesColor, vColor.r);
    albedo = mix(albedo, desertColor, vColor.g);

    // Blend Normal maps
    vec3 rockNormal = texture2D(uRockNormal, tileUv).rgb * 2.0 - 1.0;
    vec3 leavesNormal = texture2D(uLeavesNormal, tileUv).rgb * 2.0 - 1.0;
    vec3 desertNormal = texture2D(uDesertNormal, tileUv).rgb * 2.0 - 1.0;
    vec3 tangentSpaceNormal = rockNormal;
    tangentSpaceNormal = mix(tangentSpaceNormal, leavesNormal, vColor.r);
    tangentSpaceNormal = mix(tangentSpaceNormal, desertNormal, vColor.g);
    vec3 finalNormal = normalize(vTBN * tangentSpaceNormal);

    // Blend Roughness maps
    float rockRoughness = texture2D(uRockRoughness, tileUv).r;
    float leavesRoughness = texture2D(uLeavesRoughness, tileUv).r;
    float desertRoughness = texture2D(uDesertRoughness, tileUv).r;
    float roughness = rockRoughness;
    roughness = mix(roughness, leavesRoughness, vColor.r);
    roughness = mix(roughness, desertRoughness, vColor.g);
    
    // --- PBR Lighting ---
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    vec3 halfwayDir = normalize(uSunDirection + viewDirection);
    float ambient = 0.3;
    float diffuse = max(0.0, dot(finalNormal, uSunDirection));
    float spec = pow(max(dot(finalNormal, halfwayDir), 0.0), (1.0 - roughness) * 256.0);
    vec3 specular = vec3(0.5) * spec;
    vec3 lighting = vec3(ambient + diffuse) + specular;

    // Apply lighting and gamma correction
    vec3 finalColor = pow(albedo, vec3(2.2)) * lighting;
    gl_FragColor = vec4(pow(finalColor, vec3(1.0/2.2)), 1.0);
  }
`;


function rebuildEdges(terrainGroup, terrainMesh, config) {
    if (edgesHelper) dispose(edgesHelper);
}

export function createTerrain(appState) {
    const { scene, config } = appState;
    const { TILES_X, TILES_Y, TILE_SIZE } = config;
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
    
    const createPlaceholderTexture = (color, isColor = true) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const texture = new THREE.CanvasTexture(canvas);
        if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };

    const terrainMaterial = new THREE.ShaderMaterial({
        defines: {
            'TILE_X': TILES_X,
            'TILE_Y': TILES_Y
        },
        uniforms: {
            // Rock (base) textures - using placeholders
            uRockDiffuse: { value: createPlaceholderTexture('#8a8279') },
            uRockNormal: { value: createPlaceholderTexture('#8080FF') },
            uRockRoughness: { value: createPlaceholderTexture('#FFFFFF') },
            uRockDisplacement: { value: createPlaceholderTexture('#000000') },

            // Your Leaves textures
            uLeavesDiffuse: { value: loadTexture('./src/assets/textures/leaves-diffuse.jpg', true) },
            uLeavesNormal: { value: loadTexture('./src/assets/textures/leaves-normal.png') },
            uLeavesRoughness: { value: loadTexture('./src/assets/textures/leaves-roughness.jpg') },
            uLeavesDisplacement: { value: loadTexture('./src/assets/textures/displacement.png') },

            // Your new Desert textures
            uDesertDiffuse: { value: loadTexture('./src/assets/textures/drydesert-diffuse.jpg', true) },
            uDesertNormal: { value: loadTexture('./src/assets/textures/drydesert-normal.png') },
            uDesertRoughness: { value: loadTexture('./src/assets/textures/drydesert-roughness.png') },
            uDesertDisplacement: { value: loadTexture('./src/assets/textures/drydesert-displacement.png') },
            
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

    if (appState.ball) appState.ball.dispose();
    appState.ball = new BallMarker({
      three: THREE,
      scene: scene,
      terrainMesh: mesh,
      tileI: Math.floor(TILES_X / 3),
      tileJ: Math.floor(TILES_Y / 3),
      radius: TILE_SIZE * 0.35,
      color: 0xff2b2b,
      config: config, 
    });
}

export function paintTextureOnTile(ci, cj, texture, radius, appState) {
    const { terrainMesh, config } = appState;
    if (!terrainMesh) return;

    // Define which color channel corresponds to which texture
    let paintChannel = -1; // -1 means erase to base (rock)
    if (texture === 'leaves') paintChannel = 0; // Red channel
    if (texture === 'desert' || texture === 'sand') paintChannel = 1; // Green channel
    if (texture === 'rock') paintChannel = -1; // Erase

    const colorAttr = terrainMesh.geometry.attributes.color;
    const actualSubdivisions = terrainMesh.geometry.parameters.widthSegments / config.TILES_X;
    const totalVertsX = config.TILES_X * actualSubdivisions + 1;

    for (let j = cj - radius; j <= cj + radius; j++) {
        for (let i = ci - radius; i <= ci + radius; i++) {
            if (i >= 0 && i < config.TILES_X && j >= 0 && j < config.TILES_Y) {
                if (Math.hypot(i - ci, j - cj) <= radius) {
                    for (let subJ = 0; subJ <= actualSubdivisions; subJ++) {
                        for (let subI = 0; subI <= actualSubdivisions; subI++) {
                            const vertIndex = (j * actualSubdivisions + subJ) * totalVertsX + (i * actualSubdivisions + subI);
                            if (vertIndex < colorAttr.count) {
                                // Erase other channels before painting a new one
                                if (paintChannel !== 0) colorAttr.setX(vertIndex, 0);
                                if (paintChannel !== 1) colorAttr.setY(vertIndex, 0);

                                // Paint the target channel
                                if (paintChannel === 0) colorAttr.setX(vertIndex, 1); // Paint Red
                                if (paintChannel === 1) colorAttr.setY(vertIndex, 1); // Paint Green
                            }
                        }
                    }
                }
            }
        }
    }
    colorAttr.needsUpdate = true;
}

// Unchanged functions below...
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
    //... (heightmap logic remains the same)
}
