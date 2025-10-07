// file: src/texturepaint.js
// Tap-a-tile texture painting for the main terrain mesh.
// - UI selects an "active" texture (Sand for now)
// - While active, tap on the terrain to paint one TILE (not a tiny subdiv).
// - Implemented by adding a per-vertex mask attribute and mixing in the sand
//   albedo inside a tiny onBeforeCompile hook (keeps MeshStandardMaterial look).
//
// Public API:
//   const painter = initTexturePainter(appState)
//   painter.attachToTerrain()              // call after terrain (re)builds
//   painter.setActive('sand' | null)       // enable/disable paint mode
//   painter.clearAll()                     // clear mask

import * as THREE from 'three';

const SUBDIVISIONS = 4; // must match terrain.js

export default function initTexturePainter(appState){
  const loader = new THREE.TextureLoader();
  const sandTex = loader.load('assets/textures/sand/sand-diffuse.jpg');
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.colorSpace = THREE.SRGBColorSpace;
  sandTex.anisotropy = 8;

  const state = {
    activeKey: null,          // 'sand' | null
    maskAttr: null,           // BufferAttribute (Float32)
    hooked: false,            // material shader hook applied
    tilesUniform: new THREE.Vector2(1,1),
    uvScale: 1.0              // tiling inside a tile (1 = 1x per tile)
  };

  // ---- helpers -------------------------------------------------------------

  function _addOrResizeMaskAttribute(mesh){
    const geom = mesh?.geometry;
    if (!geom) return;

    const verts = (geom.attributes.position?.count) || 0;
    const needNew = !geom.getAttribute('mask1') || geom.getAttribute('mask1').count !== verts;
    if (needNew){
      const arr = new Float32Array(verts);
      const attr = new THREE.BufferAttribute(arr, 1);
      geom.setAttribute('mask1', attr);
      state.maskAttr = attr;
    }else{
      state.maskAttr = geom.getAttribute('mask1');
    }
  }

  // Material hook: mix diffuse with sand albedo based on vMask1.
  function _hookMaterial(mat){
    if (!mat || state.hooked) return;
    mat.vertexColors = true; // keep your current color workflow

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.sandMap     = { value: sandTex };
      shader.uniforms.tiles       = { value: state.tilesUniform };
      shader.uniforms.sandUVScale = { value: state.uvScale };

      // vertex: pass mask1
      shader.vertexShader = shader.vertexShader
        .replace('#include <uv_vertex>',
                 '#include <uv_vertex>\nattribute float mask1;\nvarying float vMask1;')
        .replace('#include <begin_vertex>',
                 '#include <begin_vertex>\n vMask1 = mask1;');

      // fragment: mix in the sand albedo inside the tile; mask controls blend
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          `#include <common>
           uniform sampler2D sandMap;
           uniform vec2 tiles;
           uniform float sandUVScale;
           varying float vMask1;`)
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
           // compute tile-local UV: repeat across tiles then take fractional part
           vec2 tileUV = fract(vUv * tiles) * sandUVScale;
           vec3 sand = texture2D(sandMap, tileUV).rgb;
           diffuseColor.rgb = mix(diffuseColor.rgb, sand, clamp(vMask1, 0.0, 1.0));`
        );

      // keep a handle for later uniform tweaks
      mat.userData._shader = shader;
    };

    mat.needsUpdate = true;
    state.hooked = true;
  }

  function _updateTileUniforms(){
    const s = appState?.config;
    if (!s) return;
    state.tilesUniform.set(s.TILES_X, s.TILES_Y);
    const sh = appState.terrainMaterial?.userData?._shader;
    if (sh){
      sh.uniforms.tiles.value.copy(state.tilesUniform);
    }
  }

  // Map a LOCAL x/z to the containing main 1×1 tile (not the fine subdivs)
  function _localToTile(localX, localZ){
    const { TILE_SIZE, TILES_X, TILES_Y } = appState.config;
    const W = TILES_X * TILE_SIZE;
    const H = TILES_Y * TILE_SIZE;

    const u = (localX + W / 2) / W; // 0..1
    const v = (localZ + H / 2) / H; // 0..1

    let i = Math.floor(u * TILES_X);
    let j = Math.floor(v * TILES_Y);
    i = Math.max(0, Math.min(TILES_X - 1, i));
    j = Math.max(0, Math.min(TILES_Y - 1, j));
    return { i, j };
  }

  // Paint one main tile by setting mask=1 on its vertices
  function _paintTile(i, j){
    const mesh = appState.terrainMesh;
    if (!mesh || !state.maskAttr) return;

    const { config } = appState;
    const widthSegments  = config.TILES_X * SUBDIVISIONS;
    const heightSegments = config.TILES_Y * SUBDIVISIONS;
    const vpr = widthSegments + 1;

    const col0 = i * SUBDIVISIONS;
    const col1 = (i + 1) * SUBDIVISIONS;
    const row0 = j * SUBDIVISIONS;
    const row1 = (j + 1) * SUBDIVISIONS;

    const mask = state.maskAttr.array;

    for (let r = row0; r <= row1; r++){
      for (let c = col0; c <= col1; c++){
        const idx = r * vpr + c;
        mask[idx] = 1.0; // fully sand (future: accumulate channels for multiple textures)
      }
    }
    state.maskAttr.needsUpdate = true;
  }

  // Clear entire mask
  function _clearAll(){
    if (!state.maskAttr) return;
    state.maskAttr.array.fill(0);
    state.maskAttr.needsUpdate = true;
  }

  // pointer handler (only when an active texture is selected)
  const ray = new THREE.Raycaster();
  function _onPointerDown(ev){
    if (!state.activeKey) return;               // not painting
    if (!appState.terrainMesh) return;

    const rect = appState.renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera({ x, y }, appState.camera);

    const hits = ray.intersectObject(appState.terrainMesh, false);
    if (!hits.length) return;

    // local coordinates under the hit
    const local = appState.terrainMesh.worldToLocal(hits[0].point.clone());
    const { i, j } = _localToTile(local.x, local.z);
    _paintTile(i, j);
  }

  // ---- public-ish control -------------------------------------------------
  function attachToTerrain(){
    if (!appState.terrainMesh || !appState.terrainMaterial) return;
    _addOrResizeMaskAttribute(appState.terrainMesh);
    _hookMaterial(appState.terrainMaterial);
    _updateTileUniforms();
  }

  function setActive(keyOrNull){
    state.activeKey = keyOrNull || null;

    // Freeze tap-to-move while painting (reuse existing HUD event)
    try {
      window.dispatchEvent(new CustomEvent('tc:navlock', {
        detail: { paused: !!state.activeKey }
      }));
    } catch(_) {}
  }

  // listen for canvas taps once (module lifetime)
  if (!appState.__texturePainterInstalled){
    appState.renderer?.domElement?.addEventListener('pointerdown', _onPointerDown, { passive: true });
    appState.__texturePainterInstalled = true;
  }

  return {
    attachToTerrain,
    setActive,
    clearAll: _clearAll,
  };
}