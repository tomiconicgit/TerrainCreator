// file: src/texturepaint.js
// Safe multi-texture painter — preserves full MeshStandardMaterial lighting.
// Blends 4 diffuse maps (sand, dryground, sandstone, coastsand) via vertex masks.

import * as THREE from 'three';

const SUBDIVISIONS = 4; // must match terrain.js

export default function initTexturePainter(appState) {
  const loader = new THREE.TextureLoader();

  function loadTex(url) {
    const t = loader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = THREE.SRGBColorSpace; // authored as sRGB JPGs
    return t;
  }

  const maps = {
    sand:      loadTex('assets/textures/sand/sand-diffuse.jpg'),
    dryground: loadTex('assets/textures/dryground/dryground-diffuse.jpg'),
    sandstone: loadTex('assets/textures/sandstone/sandstone-diffuse.jpg'),
    coastsand: loadTex('assets/textures/coastsand/coastsand-diffuse.jpg'),
  };

  function makeWhiteTex() {
    const t = new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }

  const state = {
    activeKey: null,
    maskAttrs: {},
    tilesUniform: new THREE.Vector2(1,1),
    uvScale: 1.0,
    brushRadius: 0,
  };

  function _addOrResizeMaskAttributes(mesh) {
    const geom = mesh?.geometry;
    if (!geom) return;
    const count = geom.attributes.position?.count || 0;

    const ensure = (name) => {
      const a = geom.getAttribute(name);
      if (!a || a.count !== count) {
        const attr = new THREE.BufferAttribute(new Float32Array(count), 1);
        geom.setAttribute(name, attr);
        return attr;
      }
      return a;
    };

    state.maskAttrs.sand      = ensure('mask1');
    state.maskAttrs.dryground = ensure('mask2');
    state.maskAttrs.sandstone = ensure('mask3');
    state.maskAttrs.coastsand = ensure('mask4');
  }

  function _ensureUVs(mat){
    if(!mat.map) mat.map = makeWhiteTex(); // forces USE_MAP/USE_UV path
    mat.defines = mat.defines || {};
    mat.defines.USE_UV = 1;
  }

  function _hookMaterial(mat){
    if(!mat || mat.userData.__texPaintHooked) return;
    mat.userData.__texPaintHooked = true;
    mat.vertexColors = true;
    _ensureUVs(mat);

    mat.onBeforeCompile = (shader)=>{
      shader.defines = shader.defines || {};
      shader.defines.USE_UV = 1;

      shader.uniforms.mapSand      = { value: maps.sand };
      shader.uniforms.mapDryground = { value: maps.dryground };
      shader.uniforms.mapSandstone = { value: maps.sandstone };
      shader.uniforms.mapCoastsand = { value: maps.coastsand };
      shader.uniforms.tiles        = { value: state.tilesUniform };
      shader.uniforms.uvScale      = { value: state.uvScale };

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

      // ---- FIX: no mapTexelToLinear dependency; do our own sRGB->Linear ----
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D mapSand, mapDryground, mapSandstone, mapCoastsand;
           uniform vec2 tiles; uniform float uvScale;
           varying float vMask1, vMask2, vMask3, vMask4;

           vec3 srgbToLinear(vec3 c){ return pow(c, vec3(2.2)); }`
        )
        .replace(
          'vec4 diffuseColor = vec4( diffuse, opacity );',
          `vec4 diffuseColor = vec4( diffuse, opacity );
           vec2 tileUV = fract(vUv * tiles) * uvScale;

           vec3 tex1 = srgbToLinear(texture2D(mapSand,      tileUV).rgb);
           vec3 tex2 = srgbToLinear(texture2D(mapDryground, tileUV).rgb);
           vec3 tex3 = srgbToLinear(texture2D(mapSandstone, tileUV).rgb);
           vec3 tex4 = srgbToLinear(texture2D(mapCoastsand, tileUV).rgb);

           float w1 = clamp(vMask1,0.0,1.0);
           float w2 = clamp(vMask2,0.0,1.0);
           float w3 = clamp(vMask3,0.0,1.0);
           float w4 = clamp(vMask4,0.0,1.0);
           float s  = w1+w2+w3+w4;

           if(s>1e-5){
             vec3 blend = (w1*tex1 + w2*tex2 + w3*tex3 + w4*tex4)/s;
             diffuseColor.rgb = mix(diffuseColor.rgb, blend, clamp(s,0.0,1.0));
           }`
        );

      mat.userData._shader = shader;
    };

    mat.needsUpdate = true;
  }

  function _updateTileUniforms(){
    const cfg = appState?.config;
    if(!cfg) return;
    state.tilesUniform.set(cfg.TILES_X, cfg.TILES_Y);
    const sh = appState.terrainMaterial?.userData?._shader;
    if(sh) sh.uniforms.tiles.value.copy(state.tilesUniform);
  }

  function _localToTile(x,z){
    const {TILE_SIZE,TILES_X,TILES_Y} = appState.config;
    const W = TILES_X*TILE_SIZE, H = TILES_Y*TILE_SIZE;
    const u = (x+W/2)/W, v = (z+H/2)/H;
    let i = Math.floor(u*TILES_X), j = Math.floor(v*TILES_Y);
    i = Math.max(0,Math.min(TILES_X-1,i));
    j = Math.max(0,Math.min(TILES_Y-1,j));
    return {i,j};
  }

  function _paintTileSingle(i,j){
    const mesh = appState.terrainMesh;
    if(!mesh) return;
    const {config} = appState;
    if(i<0||j<0||i>=config.TILES_X||j>=config.TILES_Y) return;

    const widthSeg = config.TILES_X*SUBDIVISIONS;
    const vpr = widthSeg+1;
    const col0=i*SUBDIVISIONS, col1=(i+1)*SUBDIVISIONS;
    const row0=j*SUBDIVISIONS, row1=(j+1)*SUBDIVISIONS;
    const keys=['sand','dryground','sandstone','coastsand'];

    for(let r=row0;r<=row1;r++){
      for(let c=col0;c<=col1;c++){
        const idx=r*vpr+c;
        for(const k of keys){
          const a=state.maskAttrs[k];
          if(a) a.array[idx]=(k===state.activeKey)?1.0:0.0;
        }
      }
    }
  }

  function _paintArea(iCenter,jCenter){
    const R = Math.max(0, state.brushRadius|0);
    for(let j=jCenter-R; j<=jCenter+R; j++){
      for(let i=iCenter-R; i<=iCenter+R; i++){
        _paintTileSingle(i,j);
      }
    }
    Object.values(state.maskAttrs).forEach(a=>{ if(a) a.needsUpdate=true; });
  }

  function _clearAll(){
    Object.values(state.maskAttrs).forEach(a=>{
      if(a){ a.array.fill(0); a.needsUpdate=true; }
    });
  }

  function _fillAll(key){
    const keys=['sand','dryground','sandstone','coastsand'];
    for(const k of keys){
      const a=state.maskAttrs[k];
      if(!a) continue;
      a.array.fill(k===key?1:0);
      a.needsUpdate=true;
    }
  }

  const ray = new THREE.Raycaster();
  function _onPointerDown(ev){
    if(!state.activeKey||!appState.terrainMesh)return;
    const rect=appState.renderer.domElement.getBoundingClientRect();
    const x=((ev.clientX-rect.left)/rect.width)*2-1;
    const y=-((ev.clientY-rect.top)/rect.height)*2+1;
    ray.setFromCamera({x,y},appState.camera);
    const hits=ray.intersectObject(appState.terrainMesh,false);
    if(!hits.length)return;
    const local=appState.terrainMesh.worldToLocal(hits[0].point.clone());
    const {i,j}=_localToTile(local.x,local.z);
    _paintArea(i,j);
  }

  function attachToTerrain(){
    if(!appState.terrainMesh||!appState.terrainMaterial)return;
    _addOrResizeMaskAttributes(appState.terrainMesh);
    _hookMaterial(appState.terrainMaterial);
    _updateTileUniforms();
  }

  function setActive(key){
    state.activeKey=key||null;
    try{ window.dispatchEvent(new CustomEvent('tc:navlock',{detail:{paused:!!state.activeKey}})); }catch(_){}
  }

  function setBrushRadius(n){ state.brushRadius = Math.max(0, (n|0)); }

  if(!appState.__texturePainterInstalled){
    appState.renderer.domElement.addEventListener('pointerdown',_onPointerDown,{passive:true});
    appState.__texturePainterInstalled=true;
  }

  return { attachToTerrain, setActive, setBrushRadius, clearAll:_clearAll, fillAll:_fillAll };
}