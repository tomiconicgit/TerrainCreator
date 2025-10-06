// file: src/character.js
// Places a red ball on a specific terrain tile and keeps it pinned to the tile height.
// Usage:
//   import BallMarker from './character.js';
//   const ball = new BallMarker({ three: THREE, scene, terrainMesh, tileI: 10, tileJ: 12 });
//   ball.placeOnTile(15, 14);  // move later
//   ball.refresh();            // call after you sculpt to re-snap to height

export default class BallMarker {
  constructor({
    three,
    scene,
    terrainMesh,
    tileI = 0,
    tileJ = 0,
    radius = 10,
    color = 0xff2b2b,
    hover = 2,            // small lift above the surface
  }) {
    if (!three || !scene || !terrainMesh) {
      throw new Error('[BallMarker] three, scene, and terrainMesh are required.');
    }
    this.THREE = three;
    this.scene = scene;
    this.terrainMesh = terrainMesh;

    // geometry params (from PlaneGeometry)
    const p = this._params();
    this.tileI = this._clamp(tileI, 0, p.wSeg - 1);
    this.tileJ = this._clamp(tileJ, 0, p.hSeg - 1);
    this.hover = hover;

    // make mesh
    const geom = new this.THREE.SphereGeometry(radius, 24, 18);
    const mat  = new this.THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.35 });
    const ball = new this.THREE.Mesh(geom, mat);
    ball.castShadow = true;
    ball.receiveShadow = false;
    ball.name = 'BallMarker';

    this.mesh = ball;
    this.scene.add(this.mesh);

    // initial position
    this._snapToTile(this.tileI, this.tileJ);
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry?.dispose();
      if (Array.isArray(this.mesh.material)) this.mesh.material.forEach(m => m.dispose());
      else this.mesh.material?.dispose();
      this.mesh = null;
    }
  }

  placeOnTile(i, j) {
    const p = this._params();
    this.tileI = this._clamp(i, 0, p.wSeg - 1);
    this.tileJ = this._clamp(j, 0, p.hSeg - 1);
    this._snapToTile(this.tileI, this.tileJ);
  }

  refresh() {
    // Call after terrain sculpt/geometry updates so the ball re-snaps to height
    this._snapToTile(this.tileI, this.tileJ);
  }

  // --- internals -------------------------------------------------------------

  _params() {
    const g = this.terrainMesh.geometry;
    // PlaneGeometry stores creation params here:
    const width  = g.parameters.width;
    const height = g.parameters.height;
    const wSeg   = g.parameters.widthSegments;
    const hSeg   = g.parameters.heightSegments;
    return { width, height, wSeg, hSeg, tileW: width / wSeg, tileH: height / hSeg };
  }

  _clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  _tileCornerVertexIndices(i, j) {
    const { wSeg } = this._params();
    const vertsPerRow = wSeg + 1;
    const tl =  j      * vertsPerRow + i;
    const tr =  tl + 1;
    const bl = (j + 1) * vertsPerRow + i;
    const br =  bl + 1;
    return [tl, tr, bl, br];
  }

  _tileCenterLocal(i, j) {
    const { width, height, tileW, tileH } = this._params();
    const x = -width  / 2 + (i + 0.5) * tileW;
    const z = -height / 2 + (j + 0.5) * tileH;
    return new this.THREE.Vector3(x, 0, z);
  }

  _sampleTileHeight(i, j) {
    const pos = this.terrainMesh.geometry.attributes.position.array;
    const corners = this._tileCornerVertexIndices(i, j);
    let sum = 0;
    for (const vi of corners) sum += pos[vi * 3 + 1];
    return sum / corners.length; // average corner heights
  }

  _snapToTile(i, j) {
    const centerLocal = this._tileCenterLocal(i, j);
    const y = this._sampleTileHeight(i, j) + this.hover;
    centerLocal.y = y;
    const world = this.terrainMesh.localToWorld(centerLocal.clone());
    this.mesh.position.copy(world);
  }
}
