// file: src/texturepaint.js
// Per-tile texture painting with albedo + normal + roughness blending.
//
// Public API:
//   const painter = initTexturePainter(appState)
//   painter.attachToTerrain()                        // call after terrain (re)builds
//   painter.setActive('sand'|'dryground'|'sandstone'|'coastsand'|null)
//   painter.clearAll()

import * as THREE from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const SUBDIVISIONS = 4; // must match terrain.js

export default function initTexturePainter(appState) {
  const texLoader = new THREE.TextureLoader();
  const exrLoader = new EXRLoader();

  function loadTex(url, { isColor = false } = {}) {
    const isEXR = url.toLowerCase().endsWith('.exr');
    const t = isEXR ? exrLoader.load(url) : texLoader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  }

  function makeWhiteTex() {
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.colorSpace = THREE.SRGBColorSpace;
    white.needsUpdate = true;
    return white;
  }
  function makeNeutralNormalTex() {
    const n = new THREE.DataTexture(new Uint8Array([128, 128, 255]), 1, 1, THREE.RGBFormat);
    n.colorSpace = THREE.NoColorSpace;
    n.needsUpdate = true;
    return n;
  }

  // ---- Texture sets -------------------------------------------------------
  const tex = {
    sand: {
      albedo: loadTex('assets/textures/sand/sand-diffuse.jpg', { isColor: true }),
      normal: loadTex('assets/textures/sand/sand-normal.exr'),
      rough:  loadTex('assets/textures/sand/sand-roughness.jpg'),
    },
    dryground: {
      albedo: loadTex('assets/textures/dryground/dryground-diffuse.jpg', { isColor: true }),
      normal: loadTex('assets/textures/dryground/dryground-normal.exr'),
      rough:  loadTex('assets/textures/dryground/dryground-roughness.jpg'),
    },
    sandstone: {
      albedo: loadTex('assets/textures/sandstone/sandstone-diffuse.jpg', { isColor: true }),
      normal: loadTex('assets/textures/sandstone/sandstone-normal.exr'),
      rough:  loadTex('assets/textures/sandstone/sandstone-roughness.jpg'),
    },
    coastsand: {
      albedo: loadTex('assets/textures/coastsand/coastsand-diffuse.jpg', { isColor: true }),
      normal: loadTex('assets/textures/coastsand/coastsand-normal.exr'),
      rough:  loadTex('assets/textures/coastsand/coastsand-roughness.exr'),
    },
  };

  const state = {
    activeKey: null,          // 'sand' | 'dryground' | 'sandstone' | 'coastsand' | null
    maskAttrs: {},            // per-vertex mask attributes (1 per texture)
    tilesUniform: new THREE.Vector2(1, 1),
    uvScale: 1.0,             // tiling inside each big tile
    normalScale: new THREE.Vector2(1, 1),
  };

  // ---- helpers -------------------------------------------------------------

  function _addOrResizeMaskAttributes(mesh) {
    const geom = mesh?.geometry;
    if (!geom) return;

    const verts = (geom.attributes.position?.count) || 0;

    const ensure = (name) => {
      const ex = geom.getAttribute(name);
      if (!ex || ex.count !== verts) {
        const attr = new THREE.BufferAttribute(new Float32Array(verts), 1);
        geom.setAttribute(name, attr);
        return attr;
      }
      return ex;
    };

    state.maskAttrs.sand      = ensure('mask1');
    state.maskAttrs.dryground = ensure('mask2');
    state.maskAttrs.sandstone = ensure('mask3');
    state.maskAttrs.coastsand = ensure('mask4');
  }

  // Ensure the std material compiles UV + normal paths even when no maps were set.
  function _ensureUVAndNormalPaths(mat) {
    if (!mat.map) {
      mat.map = makeWhiteTex(); // flips on USE_UV in standard chunks
    }
    if (!mat.normalMap) {
      mat.normalMap = makeNeutralNormalTex(); // flips on USE_NORMALMAP + normalmap_pars
      mat.normalScale = state.normalScale.clone();
    }
    mat.defines = mat.defines || {};
    mat.defines.USE_UV = 1;           // belt-and-suspenders to keep <uv_vertex> alive
    mat.defines.USE_NORMALMAP = 1;    // ensures normal helpers exist for our patch
  }

  function _hookMaterial(mat) {
    if (!mat || mat.userData.__texPaintHooked) return;
    mat.userData.__texPaintHooked = true;
    mat.vertexColors = true;

    _ensureUVAndNormalPaths(mat);

    mat.onBeforeCompile = (shader) => {
      shader.defines = shader.defines || {};
      shader.defines.USE_UV = 1;
      shader.defines.USE_NORMALMAP = 1;

      // Albedo samplers
      shader.uniforms.sandMap      = { value: tex.sand.albedo };
      shader.uniforms.dryMap       = { value: tex.dryground.albedo };
      shader.uniforms.sandstoneMap = { value: tex.sandstone.albedo };
      shader.uniforms.coastMap     = { value: tex.coastsand.albedo };

      // Normal samplers
      shader.uniforms.sandNorm      = { value: tex.sand.normal };
      shader.uniforms.dryNorm       = { value: tex.dryground.normal };
      shader.uniforms.sandstoneNorm = { value: tex.sandstone.normal };
      shader.uniforms.coastNorm     = { value: tex.coastsand.normal };

      // Roughness samplers
      shader.uniforms.sandRough      = { value: tex.sand.rough };
      shader.uniforms.dryRough       = { value: tex.dryground.rough };
      shader.uniforms.sandstoneRough = { value: tex.sandstone.rough };
      shader.uniforms.coastRough     = { value: tex.coastsand.rough };

      // Shared params
      shader.uniforms.tiles        = { value: state.tilesUniform };
      shader.uniforms.sandUVScale  = { value: state.uvScale };
      shader.uniforms.uNormalScale = { value: state.normalScale };

      // ---- VERTEX: pass masks
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <uv_pars_vertex>',
          `#include <uv_pars_vertex>
           attribute float mask1; attribute float mask2; attribute float mask3; attribute float mask4;
           varying float vMask1; varying float vMask2; varying float vMask3; varying float vMask4;`
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
           vMask1 = mask1; vMask2 = mask2; vMask3 = mask3; vMask4 = mask4;`
        );

      // ---- FRAGMENT: uniforms + helpers
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D sandMap, dryMap, sandstoneMap, coastMap;
           uniform sampler2D sandNorm, dryNorm, sandstoneNorm, coastNorm;
           uniform sampler2D sandRough, dryRough, sandstoneRough, coastRough;
           uniform vec2 tiles; uniform float sandUVScale; uniform vec2 uNormalScale;
           varying float vMask1, vMask2, vMask3, vMask4;`
        )
        // ALBEDO
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
           vec2 tileUV = fract(vUv * tiles) * sandUVScale;
           vec3 t1 = texture2D(sandMap,      tileUV).rgb;
           vec3 t2 = texture2D(dryMap,       tileUV).rgb;
           vec3 t3 = texture2D(sandstoneMap, tileUV).rgb;
           vec3 t4 = texture2D(coastMap,     tileUV).rgb;

           float w1 = clamp(vMask1, 0.0, 1.0);
           float w2 = clamp(vMask2, 0.0, 1.0);
           float w3 = clamp(vMask3, 0.0, 1.0);
           float w4 = clamp(vMask4, 0.0, 1.0);
           float s  = w1 + w2 + w3 + w4;

           if (s > 1e-5) {
             vec3 blended = (w1*t1 + w2*t2 + w3*t3 + w4*t4) / s;
             diffuseColor.rgb = blended;
           }`
        )
        // NORMALS (replace normal map stage)
        .replace(
          '#include <normal_fragment_maps>',
          `{
             vec2 tileUV = fract(vUv * tiles) * sandUVScale;
             vec3 n1 = texture2D(sandNorm,      tileUV).xyz * 2.0 - 1.0;
             vec3 n2 = texture2D(dryNorm,       tileUV).xyz * 2.0 - 1.0;
             vec3 n3 = texture2D(sandstoneNorm, tileUV).xyz * 2.0 - 1.0;
             vec3 n4 = texture2D(coastNorm,     tileUV).xyz * 2.0 - 1.0;

             float w1 = clamp(vMask1, 0.0, 1.0);
             float w2 = clamp(vMask2, 0.0, 1.0);
             float w3 = clamp(vMask3, 0.0, 1.0);
             float w4 = clamp(vMask4, 0.0, 1.0);
             float s  = w1 + w2 + w3 + w4;

             if (s > 1e-5) {
               vec3 nMix = normalize((w1*n1 + w2*n2 + w3*n3 + w4*n4) / s);
               nMix.xy *= uNormalScale;
               normal = perturbNormal2Arb( -vViewPosition, normal, nMix );
             }
           }`
        )
        // ROUGHNESS (replace chunk)
        .replace(
          '#include <roughnessmap_fragment>',
          `{
             vec2 tileUV = fract(vUv * tiles) * sandUVScale;
             float r1 = texture2D(sandRough,      tileUV).g;
             float r2 = texture2D(dryRough,       tileUV).g;
             float r3 = texture2D(sandstoneRough, tileUV).g;
             float r4 = texture2D(coastRough,     tileUV).g;

             float w1 = clamp(vMask1, 0.0, 1.0);
             float w2 = clamp(vMask2, 0.0, 1.0);
             float w3 = clamp(vMask3, 0.0, 1.0);
             float w4 = clamp(vMask4, 0.0, 1.0);
             float s  = w1 + w2 + w3 + w4;

             if (s > 1e-5) {
               float rMix = (w1*r1 + w2*r2 + w3*r3 + w4*r4) / s;
               roughnessFactor = clamp(rMix, 0.02, 1.0);
             }
           }`
        );

      // keep a handle for live uniform updates
      mat.userData._shader = shader;
    };

    // Force recompilation so onBeforeCompile runs
    mat.needsUpdate = true;
  }

  function _updateTileUniforms() {
    const s = appState?.config;
    if (!s) return;
    state.tilesUniform.set(s.TILES_X, s.TILES_Y);
    const sh = appState.terrainMaterial?.userData?._shader;
    if (sh) sh.uniforms.tiles.value.copy(state.tilesUniform);
  }

  // Map LOCAL x/z to the containing big 1×1 tile
  function _localToTile(localX, localZ) {
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

  // Paint one big tile: set the active mask to 1 and others to 0 in that tile region
  function _paintTileActive(i, j) {
    const mesh = appState.terrainMesh;
    if (!mesh || !state.maskAttrs || !state.activeKey) return;

    const { config } = appState;
    const widthSegments  = config.TILES_X * SUBDIVISIONS;
    const heightSegments = config.TILES_Y * SUBDIVISIONS;
    const vpr = widthSegments + 1;

    const col0 = i * SUBDIVISIONS;
    const col1 = (i + 1) * SUBDIVISIONS;
    const row0 = j * SUBDIVISIONS;
    const row1 = (j + 1) * SUBDIVISIONS;

    const keys = ['sand','dryground','sandstone','coastsand'];

    for (let r = row0; r <= row1; r++) {
      for (let c = col0; c <= col1; c++) {
        const idx = r * vpr + c;
        for (const k of keys) {
          const attr = state.maskAttrs[k];
          if (!attr) continue;
          attr.array[idx] = (k === state.activeKey) ? 1.0 : 0.0;
        }
      }
    }
    Object.values(state.maskAttrs).forEach(attr => { if (attr) attr.needsUpdate = true; });
  }

  function _clearAll() {
    Object.values(state.maskAttrs).forEach(attr => {
      if (!attr) return;
      attr.array.fill(0);
      attr.needsUpdate = true;
    });
  }

  // pointer handler (only when an active texture is selected)
  const ray = new THREE.Raycaster();
  function _onPointerDown(ev) {
    if (!state.activeKey) return;
    if (!appState.terrainMesh) return;

    const rect = appState.renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera({ x, y }, appState.camera);

    const targets = [appState.gridLines, appState.terrainMesh].filter(Boolean);
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) return;

    const worldPt = hits[0].point.clone();
    const local = appState.terrainMesh.worldToLocal(worldPt);
    const { i, j } = _localToTile(local.x, local.z);
    _paintTileActive(i, j);
  }

  // ---- public control -----------------------------------------------------
  function attachToTerrain() {
    if (!appState.terrainMesh || !appState.terrainMaterial) return;
    _addOrResizeMaskAttributes(appState.terrainMesh);
    _hookMaterial(appState.terrainMaterial); // hook the *current* material
    _updateTileUniforms();
  }

  function setActive(keyOrNull) {
    state.activeKey = keyOrNull || null;
    // Freeze tap-to-move while painting (reuse HUD event)
    try {
      window.dispatchEvent(new CustomEvent('tc:navlock', {
        detail: { paused: !!state.activeKey }
      }));
    } catch (_) {}
  }

  if (!appState.__texturePainterInstalled) {
    appState.renderer?.domElement?.addEventListener('pointerdown', _onPointerDown, { passive: true });
    appState.__texturePainterInstalled = true;
  }

  return {
    attachToTerrain,
    setActive,
    clearAll: _clearAll,
  };
}