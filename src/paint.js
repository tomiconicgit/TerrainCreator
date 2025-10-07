// file: src/paint.js
import * as THREE from 'three';
import { loadSandMaps } from './textureLoader.js';

// Holds paint system refs on appState.paint
export function initPaintSystem(appState) {
  const { renderer, config } = appState;
  const tilesX = config.TILES_X;
  const tilesY = config.TILES_Y;

  const maskData = new Uint8Array(tilesX * tilesY); // 0 = no sand, 255 = sand
  const sandMask = new THREE.DataTexture(
    maskData, tilesX, tilesY, THREE.RedFormat, THREE.UnsignedByteType
  );
  sandMask.minFilter = THREE.NearestFilter;
  sandMask.magFilter = THREE.NearestFilter;
  sandMask.wrapS = THREE.ClampToEdgeWrapping;
  sandMask.wrapT = THREE.ClampToEdgeWrapping;
  sandMask.flipY = false;
  sandMask.needsUpdate = true;

  appState.paint = {
    tilesX, tilesY,
    maskData, sandMask,
    sandMaps: null,            // will be filled async
    uniforms: null,            // pointer to material uniforms once compiled
  };

  // kick off async map load (non-blocking)
  (async () => {
    const maps = await loadSandMaps(renderer);
    appState.paint.sandMaps = maps;
    // If uniforms are ready, push into material
    if (appState.paint.uniforms) {
      if (maps.map)        appState.paint.uniforms.uSandMap.value = maps.map;
      if (maps.roughness)  appState.paint.uniforms.uSandRoughness.value = maps.roughness;
      if (maps.normal)     appState.paint.uniforms.uSandNormal.value = maps.normal; // (unused in shader first pass)
    }
  })();
}

// Create a MeshStandardMaterial and hook in a mask-driven blend of Sand
export function createPaintableTerrainMaterial(appState) {
  const { paint, config } = appState;
  if (!paint) throw new Error('[paint] initPaintSystem must run before material creation.');

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.05,
    roughness: 0.9,
    vertexColors: true,
  });

  const uTiles = new THREE.Vector2(paint.tilesX, paint.tilesY);
  const uSandUV = new THREE.Vector2(paint.tilesX, paint.tilesY); // 1 repeat per tile

  // Neutral fallbacks until maps arrive
  const white1x1 = new THREE.DataTexture(new Uint8Array([255,255,255]), 1, 1, THREE.RGFormat);
  white1x1.colorSpace = THREE.SRGBColorSpace; white1x1.needsUpdate = true;
  const gray1x1 = new THREE.DataTexture(new Uint8Array([200]), 1, 1, THREE.RedFormat);
  gray1x1.needsUpdate = true;

  const uniformsToInject = {
    uSandMask:       { value: paint.sandMask },
    uTiles:          { value: uTiles },
    uSandUV:         { value: uSandUV },
    uSandMap:        { value: white1x1 },
    uSandRoughness:  { value: gray1x1 },
    uSandNormal:     { value: null }, // reserved for future normal mixing
  };

  // If maps already loaded, bind them
  if (paint.sandMaps) {
    if (paint.sandMaps.map)       uniformsToInject.uSandMap.value = paint.sandMaps.map;
    if (paint.sandMaps.roughness) uniformsToInject.uSandRoughness.value = paint.sandMaps.roughness;
    if (paint.sandMaps.normal)    uniformsToInject.uSandNormal.value = paint.sandMaps.normal;
  }

  mat.onBeforeCompile = (shader) => {
    // attach uniforms
    Object.assign(shader.uniforms, uniformsToInject);
    appState.paint.uniforms = shader.uniforms;

    // Blend sand color & roughness where mask=1 for that tile
    // We hook right after color is applied (vertex color chunk)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>

      // ---- TERRAIN PAINT: per-tile sand blend ----
      float sandMask = texture2D(uSandMask, vUv * uTiles).r;   // 0..1 (Nearest)
      vec4 sandTex   = texture2D(uSandMap, vUv * uSandUV);

      // Blend color
      diffuseColor.rgb = mix(diffuseColor.rgb, sandTex.rgb, sandMask);

      // Blend roughness (keep PBR stable)
      float sandR = texture2D(uSandRoughness, vUv * uSandUV).r;
      roughnessFactor = mix(roughnessFactor, sandR, sandMask);
      `
    );
  };

  return mat;
}

// Clear and rebuild mask when terrain size changes
export function rebuildPaintMaskOnTerrainChange(appState) {
  const { config } = appState;
  if (!appState.paint) return initPaintSystem(appState);

  const tilesX = config.TILES_X;
  const tilesY = config.TILES_Y;

  appState.paint.tilesX = tilesX;
  appState.paint.tilesY = tilesY;

  appState.paint.maskData = new Uint8Array(tilesX * tilesY);
  const newMask = new THREE.DataTexture(
    appState.paint.maskData, tilesX, tilesY, THREE.RedFormat, THREE.UnsignedByteType
  );
  newMask.minFilter = THREE.NearestFilter;
  newMask.magFilter = THREE.NearestFilter;
  newMask.wrapS = THREE.ClampToEdgeWrapping;
  newMask.wrapT = THREE.ClampToEdgeWrapping;
  newMask.flipY = false;
  newMask.needsUpdate = true;
  appState.paint.sandMask?.dispose?.();
  appState.paint.sandMask = newMask;

  // Update uniforms if material already compiled
  if (appState.paint.uniforms) {
    appState.paint.uniforms.uSandMask.value = newMask;
    appState.paint.uniforms.uTiles.value.set(tilesX, tilesY);
    appState.paint.uniforms.uSandUV.value.set(tilesX, tilesY);
  }
}

// Paint helper (on/off)
export function setTilePaint(appState, i, j, on=true) {
  const p = appState.paint;
  if (!p) return;
  if (i < 0 || j < 0 || i >= p.tilesX || j >= p.tilesY) return;
  const idx = j * p.tilesX + i;
  p.maskData[idx] = on ? 255 : 0;
  p.sandMask.needsUpdate = true;
}