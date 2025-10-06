// file: src/character.js
// Red ball that snaps to the center of a main 1×1 tile and samples the mesh height.
// Works regardless of geometry SUBDIVISIONS.

export default class BallMarker {
  constructor({
    three,
    scene,
    terrainMesh,
    config,            // <- pass appState.config
    tileI = 0,
    tileJ = 0,
    radius = 10,
    color  = 0xff2b2b,
    hover  = 2,
  }) {
    if (!three || !scene || !terrainMesh || !config) {
      throw new Error('[BallMarker] three, scene, terrainMesh, and config are required.');
    }
    this.THREE = three;
    this.scene = scene;
    this.terrainMesh = terrainMesh;
    this.config = config;
    this.tileI = tileI | 0;
    this.tileJ = tileJ | 0;
    this.hover = hover;

    const geom = new this.THREE.SphereGeometry(radius, 24, 18);
    const mat  = new this.THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.35 });
    this.mesh  = new this.THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
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

  _sampleHeightLocal(x, z) {
    // Bilinear interpolation on CURRENT terrain geometry (no assumptions)
    const g = this.terrainMesh.geometry;
    const pos = g.attributes.position.array;
    const { width, height, widthSegments, heightSegments } = g.parameters;

    const u = (x + width  / 2) / width;   // 0..1 across local X
    const v = (z + height / 2) / height;  // 0..1 across local Z

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

  _snapToCurrentTile() {
    const c = this._tileCenterLocal(this.tileI, this.tileJ);
    c.y = this._sampleHeightLocal(c.x, c.z) + this.hover;
    const world = this.terrainMesh.localToWorld(c.clone());
    this.mesh.position.copy(world);
  }
}
