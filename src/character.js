// file: src/character.js
// Cube marker that snaps to the center of a main 1×1 tile,
// keeps its bottom face flush on the terrain, and aligns its up-axis to the surface normal.

export default class CubeMarker {
  constructor({
    three,
    scene,
    terrainMesh,
    config,            // pass appState.config
    tileI = 0,
    tileJ = 0,
    size  = 18,        // cube edge length
    color = 0xff2b2b,
    hover = 0,         // optional micro lift
  }) {
    if (!three || !scene || !terrainMesh || !config) {
      throw new Error('[CubeMarker] three, scene, terrainMesh, and config are required.');
    }
    this.THREE = three;
    this.scene = scene;
    this.terrainMesh = terrainMesh;
    this.config = config;

    this.tileI = tileI | 0;
    this.tileJ = tileJ | 0;
    this.size  = size;
    this.half  = size * 0.5;
    this.hover = hover;

    const geom = new this.THREE.BoxGeometry(size, size, size);
    const mat  = new this.THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.35 });
    this.mesh  = new this.THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    this.mesh.name = 'CubeMarker';
    this.scene.add(this.mesh);

    this._snapToCurrentTile();
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry?.dispose();
    if (Array.isArray(this.mesh.material)) this.mesh.material.forEach(m => m.dispose());
    else this.mesh.material?.dispose();
    this.mesh = null;
  }

  placeOnTile(i, j) {
    const { TILES_X, TILES_Y } = this.config;
    this.tileI = Math.min(TILES_X - 1, Math.max(0, i | 0));
    this.tileJ = Math.min(TILES_Y - 1, Math.max(0, j | 0));
    this._snapToCurrentTile();
  }

  refresh() { this._snapToCurrentTile(); }

  // ---- internals -----------------------------------------------------------

  _tileCenterLocal(i, j) {
    const { TILES_X, TILES_Y, TILE_SIZE } = this.config;
    const W = TILES_X * TILE_SIZE, H = TILES_Y * TILE_SIZE;
    const x = -W / 2 + (i + 0.5) * TILE_SIZE;
    const z = -H / 2 + (j + 0.5) * TILE_SIZE;
    return new this.THREE.Vector3(x, 0, z);
  }

  // Bilinear height (y) at local x/z
  _sampleHeightLocal(x, z) {
    const g = this.terrainMesh.geometry;
    const pos = g.attributes.position.array;
    const { width, height, widthSegments, heightSegments } = g.parameters;

    const u = (x + width  / 2) / width;
    const v = (z + height / 2) / height;

    const gx = u * widthSegments;
    const gz = v * heightSegments;

    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = Math.min(1, Math.max(0, gx - ix));
    const fz = Math.min(1, Math.max(0, gz - iz));

    const vpr = widthSegments + 1;
    const Y = (jj, ii) => pos[((jj) * vpr + (ii)) * 3 + 1];

    const x0 = Math.min(widthSegments, Math.max(0, ix));
    const z0 = Math.min(heightSegments, Math.max(0, iz));
    const x1 = Math.min(widthSegments, x0 + 1);
    const z1 = Math.min(heightSegments, z0 + 1);

    const y00 = Y(z0, x0), y10 = Y(z0, x1), y01 = Y(z1, x0), y11 = Y(z1, x1);
    const y0 = y00 * (1 - fx) + y10 * fx;
    const y1 = y01 * (1 - fx) + y11 * fx;
    return y0 * (1 - fz) + y1 * fz;
  }

  // Estimate local-space surface normal at local x/z using central differences
  _sampleNormalLocal(x, z) {
    const { TILE_SIZE } = this.config;
    const eps = Math.max(0.5, TILE_SIZE * 0.05);

    const yC = this._sampleHeightLocal(x, z);
    const yX = this._sampleHeightLocal(x + eps, z);
    const yZ = this._sampleHeightLocal(x, z + eps);

    const vx = new this.THREE.Vector3(eps, yX - yC, 0);
    const vz = new this.THREE.Vector3(0,   yZ - yC, eps);

    // local normal (up-facing)
    return vz.cross(vx).normalize();
  }

  _snapToCurrentTile() {
    const THREE = this.THREE;
    const cLocal = this._tileCenterLocal(this.tileI, this.tileJ);

    const y = this._sampleHeightLocal(cLocal.x, cLocal.z);
    const nLocal = this._sampleNormalLocal(cLocal.x, cLocal.z);

    // Local → World
    const worldPoint = this.terrainMesh.localToWorld(new THREE.Vector3(cLocal.x, y + this.hover, cLocal.z));
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(this.terrainMesh.matrixWorld);
    const nWorld = nLocal.clone().applyMatrix3(normalMatrix).normalize();

    // Align cube's up-axis to the surface normal
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nWorld);
    this.mesh.quaternion.copy(q);

    // Offset along the normal by half the cube size so the BOTTOM face is flush
    const offset = nWorld.clone().multiplyScalar(this.half);
    this.mesh.position.copy(worldPoint.add(offset));
  }
}
