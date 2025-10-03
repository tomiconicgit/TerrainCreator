// file: ./vendor/THREE.Terrain.mjs
// Minimal, CDN-free THREE.Terrain-style module for browser ESM.
// Matches the parts used by MappedUp: constructor -> getScene(), static enums,
// Terrain.Linear easing, and toHeightmap().
// Requires a THREE instance via opts.three (preferred) or global window.THREE.
//
// MIT-style shim for local use with MappedUp.

const _clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const _lerp = (a, b, t) => a + (b - a) * t;
const _smoothstep = (t) => t * t * (3 - 2 * t);

// --- Perlin (2D) ---
const _perm = new Uint8Array(512);
(function initPerm() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (Math.random()*(i+1))|0; const t=p[i]; p[i]=p[j]; p[j]=t; }
  for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];
})();
const _grad2 = (h, x, y) => {
  switch (h & 7) {
    case 0: return  x + y;
    case 1: return  x - y;
    case 2: return -x + y;
    case 3: return -x - y;
    case 4: return  x;
    case 5: return -x;
    case 6: return  y;
    default:return -y;
  }
};
function _perlin2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = _smoothstep(x), v = _smoothstep(y);
  const aa = _perm[X     + _perm[Y    ]];
  const ab = _perm[X     + _perm[Y + 1]];
  const ba = _perm[X + 1 + _perm[Y    ]];
  const bb = _perm[X + 1 + _perm[Y + 1]];
  const x1 = _lerp(_grad2(aa, x,   y),   _grad2(ba, x-1, y),   u);
  const x2 = _lerp(_grad2(ab, x, y-1),   _grad2(bb, x-1, y-1), u);
  return _lerp(x1, x2, v);
}
function _fbm(x, y, octaves=4, lac=2.0, gain=0.5, noise=_perlin2) {
  let amp=1, freq=1, sum=0, norm=0;
  for (let i=0;i<octaves;i++){ sum += amp*noise(x*freq, y*freq); norm+=amp; amp*=gain; freq*=lac; }
  return sum / norm;
}
// Worley-ish
function _worley2(u, v, cell=1.0, points=16) {
  let minD = 1e9;
  for (let i=0;i<points;i++){
    const px=(Math.sin(i*127.1)*43758.5453)%1;
    const py=(Math.sin(i*311.7)*12543.1234)%1;
    const dx=(u*cell%1)-px, dy=(v*cell%1)-py;
    const d=Math.hypot(dx,dy);
    if(d<minD) minD=d;
  }
  return 1.0 - _clamp(minD*2.0,0,1)*2 + -1;
}
function _fault(x,y,iter=50){
  let h=0;
  for(let i=0;i<iter;i++){
    const a=Math.random()*Math.PI*2, nx=Math.cos(a), ny=Math.sin(a), c=Math.random()*2-1;
    const side=Math.sign(nx*x+ny*y-c);
    h += side*(1/iter);
  }
  return _clamp(h,-1,1);
}

export default class Terrain {
  static DiamondSquare='DiamondSquare';
  static Perlin='Perlin';
  static Simplex='Simplex';
  static Fault='Fault';
  static Cosine='Cosine';
  static Value='Value';
  static Worley='Worley';
  static Linear=(t)=>t;

  constructor(opts={}){
    this.THREE = opts.three || (typeof window!=='undefined'?window.THREE:null);
    if(!this.THREE) throw new Error('[THREE.Terrain] THREE instance not provided (opts.three)');
    const THREE = this.THREE;

    const {
      heightmap=Terrain.Perlin,
      frequency=2.5,
      minHeight=-80,
      maxHeight=120,
      xSegments=127,
      ySegments=127,
      xSize=1024,
      ySize=1024,
      steps=1,
      easing=Terrain.Linear,
      material=new THREE.MeshStandardMaterial({ color:0x7c8a92, metalness:0.05, roughness:0.9 }),
    } = opts;

    const geom = new THREE.PlaneGeometry(xSize, ySize, xSegments, ySegments);
    geom.rotateX(-Math.PI/2);
    const pos = geom.attributes.position;
    const arr = pos.array;
    const range = maxHeight - minHeight;

    const algo = (typeof heightmap==='string')?heightmap:Terrain.Perlin;
    const sample = (u,v)=>{
      const fx=u*frequency, fy=v*frequency;
      switch(algo){
        case Terrain.DiamondSquare: return Math.abs(_fbm(fx,fy,5,2.0,0.5))*2-1;
        case Terrain.Perlin:        return _fbm(fx,fy,5,2.0,0.5,_perlin2);
        case Terrain.Simplex:       return _fbm(fx,fy,6,2.1,0.5,_perlin2);
        case Terrain.Fault:         return _fault(fx,fy,64);
        case Terrain.Cosine:        return Math.cos(_fbm(fx,fy,4,2.0,0.5)*Math.PI);
        case Terrain.Value:         return _fbm((fx|0)+0.001,(fy|0)+0.001,3,2.0,0.6,_perlin2);
        case Terrain.Worley:        return _worley2(u,v,Math.max(1,frequency|0),16);
        default:                    return _fbm(fx,fy,5,2.0,0.5,_perlin2);
      }
    };

    let idx=1;
    for(let iy=0; iy<=ySegments; iy++){
      const v = iy/ySegments;
      for(let ix=0; ix<=xSegments; ix++){
        const u = ix/xSegments;
        const n = sample(u,v); // [-1,1]
        let h = minHeight + (easing((n+1)*0.5) * range);
        if (steps && steps>1){
          const t=(h-minHeight)/range;
          const terr=Math.round(t*(steps-1))/(steps-1);
          h=minHeight + terr*range;
        }
        arr[idx]=h;
        idx+=3;
      }
    }
    pos.needsUpdate=true;
    geom.computeVertexNormals();

    const mesh = new THREE.Mesh(geom, material);
    mesh.receiveShadow=true;
    const group = new THREE.Group();
    group.name='TerrainScene';
    group.add(mesh);

    this._scene=group;
    this._mesh=mesh;
    this._segments={xSegments,ySegments};
  }

  getScene(){ return this._scene; }
  getMesh(){ return this._mesh; }

  static toHeightmap(positionArray,{xSegments,ySegments,min=null,max=null}={}){
    const ys=[];
    for(let i=1;i<positionArray.length;i+=3) ys.push(positionArray[i]);
    const lo = (min ?? Math.min(...ys));
    const hi = (max ?? Math.max(...ys));
    const scale = hi===lo ? 1 : 255/(hi-lo);

    const w = (xSegments+1), h=(ySegments+1);
    const canvas=document.createElement('canvas');
    canvas.width=w; canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    const img=ctx.createImageData(w,h);
    let vi=0;
    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const yy=ys[vi++];
        const g=Math.max(0,Math.min(255,Math.round((yy-lo)*scale)));
        const i4=(y*w+x)*4;
        img.data[i4]=g; img.data[i4+1]=g; img.data[i4+2]=g; img.data[i4+3]=255;
      }
    }
    ctx.putImageData(img,0,0);
    return canvas;
  }
}
