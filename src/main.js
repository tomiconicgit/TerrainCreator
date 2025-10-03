// file: src/main.js
// Sky is created directly from local vendor/three.sky.js (no src/sky.js wrapper)
import BallMarker from './character.js';

// -- Error overlay --
// If bootstrap is active, don't draw our own overlay; let bootstrap capture it.
function showErrorOverlay(msg, err) {
  if (window.__tcBootstrapActive) {
    console.error('MappedUp error (suppressed overlay):', msg, err);
    return;
  }
  const pre = (err && (err.stack || err.message)) ? `\n\n${err.stack || err.message}` : '';
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,12,16,.94);' +
    'color:#fff;font-family:ui-monospace,Menlo,monospace;padding:18px;overflow:auto;white-space:pre-wrap';
  el.textContent = `MappedUp error: ${msg}${pre}`;
  document.body.appendChild(el);
}

(async () => {
  // THREE via import map in index.html (points to CDN for GitHub Pages reliability)
  let THREE, Sky;
  try {
    THREE = await import('three');
  } catch (e) {
    showErrorOverlay('Failed to import "three" from import map.', e);
    throw e;
  }
  try {
    ({ Sky } = await import('../vendor/three.sky.js'));
  } catch (e) {
    showErrorOverlay('Failed to import Sky (vendor/three.sky.js).', e);
    throw e;
  }
  console.log('THREE revision:', THREE.REVISION);

  // ---- Config ----
  let TILES_X = 30, TILES_Y = 30;
  const TILE_SIZE = 32;
  const MIN_H = -200, MAX_H = 300;
  const raycaster = new THREE.Raycaster();

  // Real-world-ish cues (minimal, no unit overhaul):
  // Treat "one tile = a spot that fits a 6ft person".
  const CHAR_HEIGHT_UNITS = TILE_SIZE * 1.0;           // 1 tile height ~ "6ft"
  const TREE_MIN_RATIO = 10 / 6;                       // 10ft relative to 6ft
  const TREE_MAX_RATIO = 15 / 6;                       // 15ft relative to 6ft

  // ---- Renderer / Scene / Camera ----
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;       // brighter by default
  renderer.shadowMap.enabled = true;
  renderer.debug.checkShaderErrors = true;

  // Capture post-boot errors too
  window.addEventListener('error', (e) => {
    const msg = e?.error?.message || e.message || String(e);
    showErrorOverlay('Window error', e?.error || msg);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    showErrorOverlay('Unhandled promise rejection', r || {});
  });

  const scene = new THREE.Scene();
  scene.background = null; // let the sky render

  const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 20000);
  camera.position.set(600, 450, 600);

  // Minimal orbit controls with enable toggle
  class MiniOrbit {
    constructor(cam, dom){
      this.enabled = true;
      this.cam=cam; this.dom=dom; this.target=new THREE.Vector3(0,0,0);
      this.sph=new THREE.Spherical().setFromVector3(cam.position.clone().sub(this.target));
      this.dt=0; this.dp=0; this.dr=0; this.damp=.1; this.rot=.0025; this.zoom=.25; this.ptrs=new Map();
      dom.addEventListener('pointerdown',e=>{
        if(!this.enabled) return;
        dom.setPointerCapture(e.pointerId);
        this.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
      });
      dom.addEventListener('pointermove',e=>{
        if(!this.enabled || !this.ptrs.has(e.pointerId)) return;
        const p=this.ptrs.get(e.pointerId),dx=e.clientX-p.x,dy=e.clientY-p.y;
        this.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(this.ptrs.size===1){ this.dt-=dx*this.rot; this.dp-=dy*this.rot; }
      });
      addEventListener('pointerup',e=>this.ptrs.delete(e.pointerId));
      dom.addEventListener('wheel',e=>{
        if(!this.enabled) return;
        e.preventDefault();
        this.dr+=e.deltaY*this.zoom;
      },{passive:false});
    }
    update(){
      if(!this.enabled) return;
      this.sph.theta+=this.dt*(1-this.damp);
      this.sph.phi+=this.dp*(1-this.damp);
      this.sph.radius+=this.dr*(1-this.damp);
      this.dt*=this.damp; this.dp*=this.damp; this.dr*=this.damp;
      const eps=1e-3;
      this.sph.phi=Math.max(eps,Math.min(Math.PI/2-0.05,this.sph.phi));
      this.sph.radius=Math.max(50,Math.min(5000,this.sph.radius));
      const pos=new THREE.Vector3().setFromSpherical(this.sph).add(this.target);
      this.cam.position.copy(pos);
      this.cam.lookAt(this.target);
    }
  }
  const controls = new MiniOrbit(camera, renderer.domElement);

  // ---- Lights ----
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight.castShadow = true;
  scene.add(dirLight, new THREE.AmbientLight(0x445566, 0.6));
  const lightTarget = new THREE.Object3D(); scene.add(lightTarget); dirLight.target = lightTarget;

  // ---- Sky (vendor/three.sky.js) ----
  let sky = null, uniforms = null, envRT = null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const skyParams = {
    turbidity: 2.5,
    rayleigh: 2.0,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.8,
    elevation: 12,
    azimuth: 180,
    exposure: 1.15
  };

  function initSky() {
    if (!Sky) return;
    sky = new Sky();
    sky.name = 'Sky';
    sky.scale.setScalar(1000);
    scene.add(sky);
    uniforms = sky.material.uniforms;
  }

  function updateSky(worldSpanUnits = 3200, focus = new THREE.Vector3()) {
    if (!sky) return;
    // Set uniforms
    uniforms.turbidity.value = skyParams.turbidity;
    uniforms.rayleigh.value = skyParams.rayleigh;
    uniforms.mieCoefficient.value = skyParams.mieCoefficient;
    uniforms.mieDirectionalG.value = skyParams.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - skyParams.elevation);
    const theta = THREE.MathUtils.degToRad(skyParams.azimuth);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    uniforms.sunPosition.value.copy(sunDir);

    // Scale + exposure
    sky.scale.setScalar(Math.max(100, worldSpanUnits));
    renderer.toneMappingExposure = skyParams.exposure;

    // Env map via clone (guarded)
    try {
      if (envRT) { envRT.dispose(); envRT = null; }
      const tmp = new THREE.Scene();
      const s2 = sky.clone();
      s2.material = sky.material.clone();
      s2.scale.copy(sky.scale);
      tmp.add(s2);
      envRT = pmrem.fromScene(tmp);
      scene.environment = envRT.texture;
      s2.geometry.dispose(); s2.material.dispose();
    } catch (err) {
      console.warn('[Sky env] Failed to build PMREM:', err);
      scene.environment = null;
    }

    // Match directional light
    const dist = Math.max(150, sky.scale.x * 1.5);
    dirLight.position.copy(sunDir).multiplyScalar(dist);
    lightTarget.position.copy(focus);

    const ortho = dirLight.shadow.camera;
    if (ortho && ortho.isOrthographicCamera) {
      const half = Math.max(50, sky.scale.x * 0.75);
      ortho.left = -half; ortho.right = half; ortho.top = half; ortho.bottom = -half;
      ortho.updateProjectionMatrix();
    }
  }

  initSky();

  // ---- Terrain / Trees / Ball ----
  let terrainGroup=null, terrainMesh=null, edgesHelper=null, treesGroup=null, ball=null;

  const makeMaterial = () => new THREE.MeshStandardMaterial({ color:0x7c8a92, metalness:0.05, roughness:0.9 });
  const dispose = (obj)=>{
    if(!obj) return;
    obj.traverse?.(o)=>{
      if(o.isMesh){
        o.geometry?.dispose();
        if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
        else o.material?.dispose();
      }
    };
    obj.parent?.remove(obj);
  };

  const planeWorldSize = () => ({ W: TILES_X * TILE_SIZE, H: TILES_Y * TILE_SIZE });

  function updateSkyBounds() {
    if (!sky) return;
    const spanTiles = Math.max(TILES_X, TILES_Y);
    const worldSpan = Math.max(100, spanTiles) * TILE_SIZE;
    updateSky(worldSpan, new THREE.Vector3(0,0,0));
  }

  function buildTerrain(){
    const { W, H } = planeWorldSize();
    dispose(terrainGroup); dispose(treesGroup); treesGroup=null;

    const geom = new THREE.PlaneGeometry(W, H, TILES_X, TILES_Y);
    geom.rotateX(-Math.PI/2);

    const mesh = new THREE.Mesh(geom, makeMaterial());
    mesh.receiveShadow = true;

    terrainGroup = new THREE.Group();
    terrainGroup.name = 'TileTerrain';
    terrainGroup.add(mesh);
    scene.add(terrainGroup);
    terrainMesh = mesh;

    rebuildEdges();

    // ball fits a tile (keep your visual, but nudge radius to read as a "6ft person spot")
    const ballRadius = Math.max(6, Math.min(TILE_SIZE * 0.45, CHAR_HEIGHT_UNITS * 0.35));
    if (ball) ball.dispose();
    ball = new BallMarker({
      three: THREE,
      scene,
      terrainMesh,
      tileI: Math.floor(TILES_X/3),
      tileJ: Math.floor(TILES_Y/3),
      radius: ballRadius,
      color: 0xff2b2b
    });

    updateSkyBounds();
  }

  function rebuildEdges(){
    if(!terrainMesh) return;
    if(edgesHelper){
      edgesHelper.geometry.dispose(); edgesHelper.material.dispose(); terrainGroup.remove(edgesHelper);
    }
    const edgesGeom = new THREE.EdgesGeometry(terrainMesh.geometry, 1);
    const edgesMat  = new THREE.LineBasicMaterial({ color:0x2a9df4, transparent:true, opacity:0.55 });
    edgesHelper = new THREE.LineSegments(edgesGeom, edgesMat);
    edgesHelper.renderOrder = 1;
    terrainGroup.add(edgesHelper);
  }

  // ---- Heightmap templates ----
  const _clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
  const _smooth=t=>t*t*(3-2*t);
  const _perm=new Uint8Array(512); (function(){const p=new Uint8Array(256);for(let i=0;i<256;i++)p[i]=i;for(let i=255;i>0;i--){const j=(Math.random()*(i+1))|0;const t=p[i];p[i]=p[j];p[j]=t;}for(let i=0;i<512;i++)_perm[i]=p[i&255];})();
  const _grad2=(h,x,y)=>{switch(h&7){case 0:return x+y;case 1:return x-y;case 2:return -x+y;case 3:return -x-y;case 4:return x;case 5:return -x;case 6:return y;default:return -y;}};
  function _perlin2(x,y){const X=Math.floor(x)&255,Y=Math.floor(y)&255;x-=Math.floor(x);y-=Math.floor(y);const u=_smooth(x),v=_smooth(y);const aa=_perm[X+_perm[Y]],ab=_perm[X+_perm[Y+1]],ba=_perm[X+1+_perm[Y]],bb=_perm[X+1+_perm[Y+1]];const x1=(1-u)*_grad2(aa,x,y)+u*_grad2(ba,x-1,y);const x2=(1-u)*_grad2(ab,x,y-1)+u*_grad2(bb,x-1,y-1);return (1-v)*x1+v*x2;}
  function _fbm(x,y,o=5,l=2,g=.5,noise=_perlin2){let a=1,f=1,s=0,n=0;for(let i=0;i<o;i++){s+=a*noise(x*f,y*f);n+=a;a*=g;f*=l;}return s/n;}
  function _worley2(u,v,cell=1,pts=16){let md=1e9;for(let i=0;i<pts;i++){const px=(Math.sin(i*127.1)*43758.5453)%1,py=(Math.sin(i*311.7)*12543.1234)%1;const dx=(u*cell%1)-px,dy=(v*cell%1)-py;const d=Math.hypot(dx,dy);if(d<md)md=d;}return 1.0-_clamp(md*2,0,1)*2 + -1;}
  function _fault(x,y,it=50){let h=0;for(let i=0;i<it;i++){const a=Math.random()*Math.PI*2,nx=Math.cos(a),ny=Math.sin(a),c=Math.random()*2-1;const s=Math.sign(nx*x+ny*y-c);h+=s*(1/it);}return _clamp(h,-1,1);}

  function applyTemplate(name){
    if(!terrainMesh) return;
    const pos=terrainMesh.geometry.attributes.position.array;
    const xSeg=TILES_X, ySeg=TILES_Y;
    const minH=-80, maxH=120, range=maxH-minH;
    let idx=1;
    for(let jy=0;jy<=ySeg;jy++){
      const v=jy/ySeg;
      for(let ix=0;ix<=xSeg;ix++){
        const u=ix/xSeg;
        let n=0;
        switch(name){
          case 'Flat': n=-1; break;
          case 'DiamondSquare': n=Math.abs(_fbm(u*2.5,v*2.5,5,2,.5))*2-1; break;
          case 'Perlin': n=_fbm(u*2.5,v*2.5,5,2,.5,_perlin2); break;
          case 'Simplex': n=_fbm(u*2.8,v*2.8,6,2.1,.5,_perlin2); break;
          case 'Fault': n=_fault(u*2.5,v*2.5,64); break;
          case 'Cosine': n=Math.cos(_fbm(u*2.0,v*2.0,4,2,.5)*Math.PI); break;
          case 'Value': n=_fbm((u*2.5|0)+.001,(v*2.5|0)+.001,3,2,.6,_perlin2); break;
          case 'Worley': n=_worley2(u,v,3,16); break;
          default: n=0;
        }
        const h = minH + ((n+1)*0.5)*range;
        pos[idx]=h; idx+=3;
      }
    }
    terrainMesh.geometry.attributes.position.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
    rebuildEdges();
    ball?.refresh();
  }

  // ---- Trees ----
  function clearTrees(){ dispose(treesGroup); treesGroup=null; }
  function tileCenterLocal(i,j){
    const { W, H } = planeWorldSize();
    const x = -W/2 + (i + 0.5) * TILE_SIZE;
    const z = -H/2 + (j + 0.5) * TILE_SIZE;
    return new THREE.Vector3(x,0,z);
  }
  function sampleHeightLocal(x,z){
    const { W, H } = planeWorldSize();
    const u=(x+W/2)/W, v=(z+H/2)/H;
    const gx=u*TILES_X, gy=v*TILES_Y;
    const vpr=TILES_X+1;
    const i=Math.floor(gx), j=Math.floor(gy);
    const tx=_clamp(i,0,TILES_X-1), ty=_clamp(j,0,TILES_Y-1);
    const fx=gx-tx, fy=gy-ty;
    const pos=terrainMesh.geometry.attributes.position.array;
    const idx=(jj,ii)=>((jj)*vpr+(ii))*3+1;
    const y00=pos[idx(ty,tx)], y10=pos[idx(ty,tx+1)], y01=pos[idx(ty+1,tx)], y11=pos[idx(ty+1,tx+1)];
    const y0=y00*(1-fx)+y10*fx, y1=y01*(1-fx)+y11*fx;
    return y0*(1-fy)+y1*fy;
  }

  // Trees sized 10–15ft equivalent (> character height), base flush to terrain
  function makeTree(){
    const ratio = THREE.MathUtils.lerp(TREE_MIN_RATIO, TREE_MAX_RATIO, Math.random()); // ~1.67..2.5x character
    const totalH = CHAR_HEIGHT_UNITS * ratio;
    const trunkH = totalH * 0.42;
    const crownH = totalH - trunkH;

    const crownR = Math.min(TILE_SIZE * 0.45, totalH * 0.22);
    const trunkRBottom = Math.max(TILE_SIZE * 0.06, crownR * 0.22);
    const trunkRTop    = Math.max(TILE_SIZE * 0.04, crownR * 0.16);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkRTop, trunkRBottom, trunkH, 10),
      new THREE.MeshStandardMaterial({color:0x735a3a, roughness:0.9})
    );
    trunk.position.y = trunkH * 0.5; // base at y=0

    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(crownR, crownH, 12),
      new THREE.MeshStandardMaterial({color:0x2f9448, roughness:0.9})
    );
    crown.position.y = trunkH + crownH * 0.5;

    trunk.castShadow = crown.castShadow = true;
    const g = new THREE.Group(); g.add(trunk, crown);
    return g;
  }

  function populateTrees(count){
    clearTrees();
    if(!terrainMesh || count<=0) return;
    treesGroup = new THREE.Group(); treesGroup.name='Trees';
    const max = Math.min(count, TILES_X * TILES_Y);
    const used = new Set();
    let placed = 0;
    while (placed < max) {
      const i = (Math.random()*TILES_X)|0;
      const j = (Math.random()*TILES_Y)|0;
      const key = i + ',' + j;
      if (used.has(key)) continue;
      used.add(key);
      const c = tileCenterLocal(i,j);
      const y = sampleHeightLocal(c.x, c.z); // sample exact terrain height at the tile center
      const t = makeTree();
      t.position.set(c.x, y, c.z); // group base sits flush at sampled y
      treesGroup.add(t);
      placed++;
    }
    terrainGroup.add(treesGroup);
  }

  // ---- Sculpt ----
  function worldToTile(localX, localZ){
    const { W, H } = planeWorldSize();
    const u=(localX+W/2)/W, v=(localZ+H/2)/H;
    let i=Math.floor(u*TILES_X), j=Math.floor(v*TILES_Y);
    i=_clamp(i,0,TILES_X-1); j=_clamp(j,0,TILES_Y-1); return {i,j};
  }
  function tileCornerIndices(i,j){
    const vpr=TILES_X+1, tl=j*vpr+i, tr=tl+1, bl=(j+1)*vpr+i, br=bl+1; return [tl,tr,bl,br];
  }
  function applyTileDelta(ci,cj,dir,rTiles,step){
    if(!terrainMesh) return;
    const posAttr=terrainMesh.geometry.attributes.position, arr=posAttr.array;
    const map=new Map();
    for(let dj=-rTiles; dj<=rTiles; dj++){
      for(let di=-rTiles; di<=rTiles; di++){
        const ti=ci+di, tj=cj+dj; if(ti<0||tj<0||ti>=TILES_X||tj>=TILES_Y) continue;
        const d=Math.hypot(di,dj); if(d>rTiles) continue;
        const fall = rTiles===0 ? 1 : (1 - d/rTiles);
        const delta = dir * step * fall;
        for(const vi of tileCornerIndices(ti,tj)){ const yi=vi*3+1; map.set(yi,(map.get(yi)||0)+delta); }
      }
    }
    for(const [yi,dy] of map.entries()){ arr[yi] = _clamp(arr[yi]+dy, MIN_H, MAX_H); }
    posAttr.needsUpdate=true; terrainMesh.geometry.computeVertexNormals(); rebuildEdges(); ball?.refresh();
  }
  function smoothTiles(ci,cj,rTiles){
    if(!terrainMesh) return;
    const posAttr=terrainMesh.geometry.attributes.position, arr=posAttr.array;
    const vpr=TILES_X+1, set=new Set();
    const i0=Math.max(0,ci-rTiles), j0=Math.max(0,cj-rTiles);
    const i1=Math.min(TILES_X,ci+rTiles+1), j1=Math.min(TILES_Y,cj+rTiles+1);
    for(let j=j0;j<=j1;j++){ for(let i=i0;i<=i1;i++){ set.add(j*vpr+i); } }
    let sum=0,cnt=0; for(const vi of set){ sum+=arr[vi*3+1]; cnt++; }
    const avg=cnt?sum/cnt:0;
    for(const vi of set){ const yi=vi*3+1; arr[yi]+= (avg-arr[yi]) * 0.15; }
    posAttr.needsUpdate=true; terrainMesh.geometry.computeVertexNormals(); rebuildEdges(); ball?.refresh();
  }

  // ---- Tabs + UI wiring ----
  const tabButtons = Array.from(document.querySelectorAll('.tab'));
  const tabContents = {
    terrain: document.getElementById('tab-terrain'),
    sculpt: document.getElementById('tab-sculpt'),
    objects: document.getElementById('tab-objects'),
    extras: document.getElementById('tab-extras'),
    settings: document.getElementById('tab-settings')
  };
  tabButtons.forEach(b=>{
    b.addEventListener('click', ()=>{
      tabButtons.forEach(x=>x.classList.remove('on'));
      Object.values(tabContents).forEach(c=>c.classList.remove('on'));
      b.classList.add('on');
      tabContents[b.dataset.tab].classList.add('on');
    });
  });

  const tilesX = document.getElementById('tilesX');
  const tilesY = document.getElementById('tilesY');
  const genBtn = document.getElementById('genTerrain');
  const randBtn= document.getElementById('randomize');
  const templateSel = document.getElementById('template');
  const applyTemplateBtn = document.getElementById('applyTemplate');
  const treeCount = document.getElementById('treeCount');
  const applyTreesBtn = document.getElementById('applyTrees');

  genBtn.addEventListener('click', ()=>{
    TILES_X = Math.max(2, Math.min(256, parseInt(tilesX.value||'30',10)));
    TILES_Y = Math.max(2, Math.min(256, parseInt(tilesY.value||'30',10)));
    buildTerrain();
  });

  randBtn.addEventListener('click', ()=>{
    if(!terrainMesh) return;
    const arr = terrainMesh.geometry.attributes.position.array;
    for(let i=1;i<arr.length;i+=3) arr[i] += (Math.random()-0.5)*2.5;
    terrainMesh.geometry.attributes.position.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
    rebuildEdges(); ball?.refresh();
  });

  applyTemplateBtn.addEventListener('click', ()=> applyTemplate(templateSel.value));
  applyTreesBtn.addEventListener('click', ()=>{
    const n = Math.max(0, Math.min(100000, parseInt(treeCount.value||'0',10)));
    populateTrees(n);
  });

  const sculptOn = document.getElementById('sculptOn');
  const stepInput = document.getElementById('stepInput');
  const stepDown = document.getElementById('stepDown');
  const stepUp = document.getElementById('stepUp');
  const radiusInput = document.getElementById('radiusInput');
  const radiusDown = document.getElementById('radiusDown');
  const radiusUp = document.getElementById('radiusUp');
  const modeRaise = document.getElementById('modeRaise');
  const modeLower = document.getElementById('modeLower');
  const modeSmooth = document.getElementById('modeSmooth');

  controls.enabled = !sculptOn.checked;
  sculptOn.addEventListener('change', ()=>{ controls.enabled = !sculptOn.checked; });

  const clampNum=(el,min,max,step)=>{
    const v=parseFloat(el.value); const n=isNaN(v)?0:v; const s=Math.round(n/step)*step;
    el.value = Math.max(min, Math.min(max, parseFloat(s.toFixed(10))));
  };
  stepDown.addEventListener('click', ()=>{ stepInput.value=(parseFloat(stepInput.value)-0.2).toFixed(1); clampNum(stepInput,-2,2,0.2); });
  stepUp  .addEventListener('click', ()=>{ stepInput.value=(parseFloat(stepInput.value)+0.2).toFixed(1); clampNum(stepInput,-2,2,0.2); });
  radiusDown.addEventListener('click', ()=>{ radiusInput.value=Math.max(1, parseInt(radiusInput.value,10)-1); });
  radiusUp  .addEventListener('click', ()=>{ radiusInput.value=Math.min(6, parseInt(radiusInput.value,10)+1); });

  function setMode(r=false,l=false,s=false){
    [modeRaise,modeLower,modeSmooth].forEach(b=>b.classList.remove('on'));
    if(r) modeRaise.classList.add('on'); if(l) modeLower.classList.add('on'); if(s) modeSmooth.classList.add('on');
  }
  modeRaise.addEventListener('click', ()=>setMode(true,false,false));
  modeLower.addEventListener('click', ()=>setMode(false,true,false));
  modeSmooth.addEventListener('click', ()=>setMode(false,false,true));
  setMode(true,false,false);

  // Pointer sculpt
  let dragging=false;
  renderer.domElement.addEventListener('pointerdown',ev=>{ if(!sculptOn.checked) return; dragging=true; cast(ev); });
  renderer.domElement.addEventListener('pointermove',ev=>{ if(dragging && sculptOn.checked) cast(ev); });
  addEventListener('pointerup',()=>dragging=false);

  function cast(ev){
    if(!terrainMesh) return;
    const rect=renderer.domElement.getBoundingClientRect();
    const x=((ev.clientX-rect.left)/rect.width)*2-1, y=-((ev.clientY-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera({x,y},camera);
    const hit=raycaster.intersectObject(terrainMesh,false)[0]; if(!hit) return;
    const local=terrainMesh.worldToLocal(hit.point.clone());
    const {i,j}=worldToTile(local.x,local.z);
    const r = Math.max(0, Math.min(6, parseInt(radiusInput.value,10) || 0));
    const step = parseFloat(stepInput.value || '0.2');
    if (modeSmooth.classList.contains('on')) smoothTiles(i,j,r);
    else {
      const sign = modeLower.classList.contains('on') ? -1 : 1;
      applyTileDelta(i,j,sign, r, step);
    }
  }

  // --- Tap-to-move character when Sculpt is OFF ---
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    if (sculptOn.checked) return;                // don't hijack sculpting gesture
    if (!terrainMesh || !ball) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX-rect.left)/rect.width)*2 - 1;
    const y = -((ev.clientY-rect.top)/rect.height)*2 + 1;
    raycaster.setFromCamera({x,y}, camera);
    const hit = raycaster.intersectObject(terrainMesh, false)[0];
    if (!hit) return;
    const local = terrainMesh.worldToLocal(hit.point.clone());
    const { i, j } = worldToTile(local.x, local.z);
    ball.placeOnTile(i, j);
  });
  // --- END tap-to-move ---

  // ---- Boot / Loop / SW ----
  buildTerrain();                                  // also triggers updateSkyBounds()
  updateSky(100 * TILE_SIZE, new THREE.Vector3()); // visible from first frame

  addEventListener('resize', ()=>{
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
    updateSkyBounds();
  });

  renderer.setAnimationLoop(()=>{ controls.update(); renderer.render(scene,camera); });

  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  let promptEvt=null; addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvt=e;});
  document.getElementById('installBtn')?.addEventListener('click',()=>{
    if(promptEvt){promptEvt.prompt(); promptEvt=null;} else alert('To install: Share > Add to Home Screen');
  });
})().catch(e=>showErrorOverlay('Top-level init crashed.', e));