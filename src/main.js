// file: src/main.js
// Sky is created directly from local vendor/three.sky.js (no src/sky.js wrapper)
import BallMarker from './character.js';

// -- Error overlay --
// If bootstrap is active, don't draw our own overlay; let bootstrap capture it.
function showErrorOverlay(msg, err) {
  if (window.__tcBootstrapActive) {
    try { console.error('MappedUp error (suppressed overlay):', msg, err); } catch (_) {}
    return;
  }
  var pre = (err && (err.stack || err.message)) ? '\n\n' + (err.stack || err.message) : '';
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,12,16,.94);' +
    'color:#fff;font-family:ui-monospace,Menlo,monospace;padding:18px;overflow:auto;white-space:pre-wrap';
  el.textContent = 'MappedUp error: ' + msg + pre;
  document.body.appendChild(el);
}

(function () {
  // use a promise chain instead of top-level async arrow
  var THREE, Sky;

  import('three').then(function (mod) {
    THREE = mod;
    return import('../vendor/three.sky.js');
  }).then(function (modSky) {
    Sky = modSky.Sky;
    startApp();
  }).catch(function (e) {
    showErrorOverlay('Failed to import libraries.', e);
    throw e;
  });

  function startApp() {
    console.log('THREE revision:', THREE.REVISION);

    // ---- Config ----
    var TILES_X = 30, TILES_Y = 30;
    var TILE_SIZE = 32;
    var MIN_H = -200, MAX_H = 300;
    var raycaster = new THREE.Raycaster();

    // Real-world-ish cues (minimal, no unit overhaul):
    // Treat "one tile = a spot that fits a 6ft person".
    var CHAR_HEIGHT_UNITS = TILE_SIZE * 1.0; // 1 tile height ~ "6ft"
    var TREE_MIN_RATIO = 10 / 6;             // ~1.67
    var TREE_MAX_RATIO = 15 / 6;             // 2.5

    // ---- Renderer / Scene / Camera ----
    var canvas = document.getElementById('c');
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;       // brighter by default
    renderer.shadowMap.enabled = true;
    if (renderer.debug) renderer.debug.checkShaderErrors = true;

    // Capture post-boot errors too
    window.addEventListener('error', function (e) {
      var msg = (e && e.error && e.error.message) || (e && e.message) || String(e);
      showErrorOverlay('Window error', (e && e.error) || msg);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      showErrorOverlay('Unhandled promise rejection', r || {});
    });

    var scene = new THREE.Scene();
    scene.background = null; // let the sky render

    var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 20000);
    camera.position.set(600, 450, 600);

    // Minimal orbit controls with enable toggle
    function MiniOrbit(cam, dom) {
      this.enabled = true;
      this.cam = cam; this.dom = dom; this.target = new THREE.Vector3(0, 0, 0);
      this.sph = new THREE.Spherical().setFromVector3(cam.position.clone().sub(this.target));
      this.dt = 0; this.dp = 0; this.dr = 0; this.damp = .1; this.rot = .0025; this.zoom = .25; this.ptrs = new Map();

      var self = this;
      dom.addEventListener('pointerdown', function (e) {
        if (!self.enabled) return;
        try { dom.setPointerCapture(e.pointerId); } catch (_) {}
        self.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      });
      dom.addEventListener('pointermove', function (e) {
        if (!self.enabled || !self.ptrs.has(e.pointerId)) return;
        var p = self.ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
        self.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (self.ptrs.size === 1) { self.dt -= dx * self.rot; self.dp -= dy * self.rot; }
      });
      window.addEventListener('pointerup', function (e) { self.ptrs.delete(e.pointerId); });
      dom.addEventListener('wheel', function (e) {
        if (!self.enabled) return;
        try { e.preventDefault(); } catch (_) {}
        self.dr += e.deltaY * self.zoom;
      }, { passive: false });
    }
    MiniOrbit.prototype.update = function () {
      if (!this.enabled) return;
      this.sph.theta += this.dt * (1 - this.damp);
      this.sph.phi += this.dp * (1 - this.damp);
      this.sph.radius += this.dr * (1 - this.damp);
      this.dt *= this.damp; this.dp *= this.damp; this.dr *= this.damp;
      var eps = 1e-3;
      this.sph.phi = Math.max(eps, Math.min(Math.PI / 2 - 0.05, this.sph.phi));
      this.sph.radius = Math.max(50, Math.min(5000, this.sph.radius));
      var pos = new THREE.Vector3().setFromSpherical(this.sph).add(this.target);
      this.cam.position.copy(pos); this.cam.lookAt(this.target);
    };

    var controls = new MiniOrbit(camera, renderer.domElement);

    // --- NEW: camera follow settings ---
    var followBall = true;
    var _tmpVec3 = new THREE.Vector3();

    // ---- Lights ----
    var dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.castShadow = true;
    scene.add(dirLight, new THREE.AmbientLight(0x445566, 0.6));
    var lightTarget = new THREE.Object3D(); scene.add(lightTarget); dirLight.target = lightTarget;

    // ---- Sky (vendor/three.sky.js) ----
    var sky = null, uniforms = null, envRT = null;
    var pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    var skyParams = {
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

    function updateSky(worldSpanUnits, focus) {
      if (worldSpanUnits === void 0) worldSpanUnits = 3200;
      if (!focus) focus = new THREE.Vector3();
      if (!sky) return;

      // Set uniforms
      uniforms.turbidity.value = skyParams.turbidity;
      uniforms.rayleigh.value = skyParams.rayleigh;
      uniforms.mieCoefficient.value = skyParams.mieCoefficient;
      uniforms.mieDirectionalG.value = skyParams.mieDirectionalG;

      var phi = THREE.MathUtils.degToRad(90 - skyParams.elevation);
      var theta = THREE.MathUtils.degToRad(skyParams.azimuth);
      var sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
      uniforms.sunPosition.value.copy(sunDir);

      // Scale + exposure
      sky.scale.setScalar(Math.max(100, worldSpanUnits));
      renderer.toneMappingExposure = skyParams.exposure;

      // Env map via clone (guarded)
      try {
        if (envRT) { envRT.dispose(); envRT = null; }
        var tmp = new THREE.Scene();
        var s2 = sky.clone();
        s2.material = sky.material.clone();
        s2.scale.copy(sky.scale);
        tmp.add(s2);
        envRT = pmrem.fromScene(tmp);
        scene.environment = envRT.texture;
        s2.geometry.dispose(); s2.material.dispose();
      } catch (err) {
        try { console.warn('[Sky env] Failed to build PMREM:', err); } catch (_) {}
        scene.environment = null;
      }

      // Match directional light
      var dist = Math.max(150, sky.scale.x * 1.5);
      dirLight.position.copy(sunDir).multiplyScalar(dist);
      lightTarget.position.copy(focus);

      var ortho = dirLight.shadow.camera;
      if (ortho && ortho.isOrthographicCamera) {
        var half = Math.max(50, sky.scale.x * 0.75);
        ortho.left = -half; ortho.right = half; ortho.top = half; ortho.bottom = -half;
        ortho.updateProjectionMatrix();
      }
    }

    initSky();

    // ---- Terrain / Trees / Ball ----
    var terrainGroup = null, terrainMesh = null, edgesHelper = null, treesGroup = null, ball = null;

    function makeMaterial() { return new THREE.MeshStandardMaterial({ color: 0x7c8a92, metalness: 0.05, roughness: 0.9 }); }

    function dispose(obj) {
      if (!obj) return;
      if (typeof obj.traverse === 'function') {
        obj.traverse(function (o) {
          if (o.isMesh) {
            if (o.geometry && typeof o.geometry.dispose === 'function') o.geometry.dispose();
            if (Array.isArray(o.material)) {
              for (var i = 0; i < o.material.length; i++) {
                if (o.material[i] && typeof o.material[i].dispose === 'function') o.material[i].dispose();
              }
            } else if (o.material && typeof o.material.dispose === 'function') o.material.dispose();
          }
        });
      }
      if (obj.parent && typeof obj.parent.remove === 'function') obj.parent.remove(obj);
    }

    function planeWorldSize() { return { W: TILES_X * TILE_SIZE, H: TILES_Y * TILE_SIZE }; }

    function updateSkyBounds() {
      if (!sky) return;
      var spanTiles = Math.max(TILES_X, TILES_Y);
      var worldSpan = Math.max(100, spanTiles) * TILE_SIZE;
      updateSky(worldSpan, new THREE.Vector3(0, 0, 0));
    }

    function buildTerrain() {
      var s = planeWorldSize(), W = s.W, H = s.H;
      dispose(terrainGroup); dispose(treesGroup); treesGroup = null;

      var geom = new THREE.PlaneGeometry(W, H, TILES_X, TILES_Y);
      geom.rotateX(-Math.PI / 2);

      var mesh = new THREE.Mesh(geom, makeMaterial());
      mesh.receiveShadow = true;

      terrainGroup = new THREE.Group();
      terrainGroup.name = 'TileTerrain';
      terrainGroup.add(mesh);
      scene.add(terrainGroup);
      terrainMesh = mesh;

      rebuildEdges();

      // ball fits a tile (keep your visual, but nudge radius to read as a "6ft person spot")
      var ballRadius = Math.max(6, Math.min(TILE_SIZE * 0.45, CHAR_HEIGHT_UNITS * 0.35));
      if (ball && typeof ball.dispose === 'function') ball.dispose();
      ball = new BallMarker({
        three: THREE,
        scene: scene,
        terrainMesh: terrainMesh,
        tileI: Math.floor(TILES_X / 3),
        tileJ: Math.floor(TILES_Y / 3),
        radius: ballRadius,
        color: 0xff2b2b
      });

      // --- NEW: snap orbit target to the character on (re)build ---
      try { if (ball && ball.mesh) controls.target.copy(ball.mesh.position); } catch (_) {}

      updateSkyBounds();
    }

    function rebuildEdges() {
      if (!terrainMesh) return;
      if (edgesHelper) {
        if (edgesHelper.geometry && typeof edgesHelper.geometry.dispose === 'function') edgesHelper.geometry.dispose();
        if (edgesHelper.material && typeof edgesHelper.material.dispose === 'function') edgesHelper.material.dispose();
        if (terrainGroup && typeof terrainGroup.remove === 'function') terrainGroup.remove(edgesHelper);
      }
      var edgesGeom = new THREE.EdgesGeometry(terrainMesh.geometry, 1);
      var edgesMat = new THREE.LineBasicMaterial({ color: 0x2a9df4, transparent: true, opacity: 0.55 });
      edgesHelper = new THREE.LineSegments(edgesGeom, edgesMat);
      edgesHelper.renderOrder = 1;
      terrainGroup.add(edgesHelper);
    }

    // ---- Heightmap templates ----
    function _clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
    function _smooth(t) { return t * t * (3 - 2 * t); }
    var _perm = new Uint8Array(512);
    (function () {
      var p = new Uint8Array(256);
      for (var i = 0; i < 256; i++) p[i] = i;
      for (var j = 255; j > 0; j--) {
        var k = (Math.random() * (j + 1)) | 0;
        var t = p[j]; p[j] = p[k]; p[k] = t;
      }
      for (var m = 0; m < 512; m++) _perm[m] = p[m & 255];
    })();
    function _grad2(h, x, y) {
      switch (h & 7) {
        case 0: return x + y;
        case 1: return x - y;
        case 2: return -x + y;
        case 3: return -x - y;
        case 4: return x;
        case 5: return -x;
        case 6: return y;
        default: return -y;
      }
    }
    function _perlin2(x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      var u = _smooth(x), v = _smooth(y);
      var aa = _perm[X + _perm[Y]], ab = _perm[X + _perm[Y + 1]], ba = _perm[X + 1 + _perm[Y]], bb = _perm[X + 1 + _perm[Y + 1]];
      var x1 = (1 - u) * _grad2(aa, x, y) + u * _grad2(ba, x - 1, y);
      var x2 = (1 - u) * _grad2(ab, x, y - 1) + u * _grad2(bb, x - 1, y - 1);
      return (1 - v) * x1 + v * x2;
    }
    function _fbm(x, y, o, l, g, noise) {
      if (o === void 0) o = 5;
      if (l === void 0) l = 2;
      if (g === void 0) g = .5;
      if (!noise) noise = _perlin2;
      var a = 1, f = 1, s = 0, n = 0;
      for (var i = 0; i < o; i++) { s += a * noise(x * f, y * f); n += a; a *= g; f *= l; }
      return s / n;
    }
    function _worley2(u, v, cell, pts) {
      if (cell === void 0) cell = 1;
      if (pts === void 0) pts = 16;
      var md = 1e9;
      for (var i = 0; i < pts; i++) {
        var px = (Math.sin(i * 127.1) * 43758.5453) % 1, py = (Math.sin(i * 311.7) * 12543.1234) % 1;
        var dx = (u * cell % 1) - px, dy = (v * cell % 1) - py;
        var d = Math.hypot(dx, dy);
        if (d < md) md = d;
      }
      return 1.0 - _clamp(md * 2, 0, 1) * 2 + -1;
    }
    function _fault(x, y, it) {
      if (it === void 0) it = 50;
      var h = 0;
      for (var i = 0; i < it; i++) {
        var a = Math.random() * Math.PI * 2, nx = Math.cos(a), ny = Math.sin(a), c = Math.random() * 2 - 1;
        var s = Math.sign(nx * x + ny * y - c);
        h += s * (1 / it);
      }
      return _clamp(h, -1, 1);
    }

    function applyTemplate(name) {
      if (!terrainMesh) return;
      var pos = terrainMesh.geometry.attributes.position.array;
      var xSeg = TILES_X, ySeg = TILES_Y;
      var minH = -80, maxH = 120, range = maxH - minH;
      var idx = 1;
      for (var jy = 0; jy <= ySeg; jy++) {
        var v = jy / ySeg;
        for (var ix = 0; ix <= xSeg; ix++) {
          var u = ix / xSeg;
          var n = 0;
          switch (name) {
            case 'Flat': n = -1; break;
            case 'DiamondSquare': n = Math.abs(_fbm(u * 2.5, v * 2.5, 5, 2, .5)) * 2 - 1; break;
            case 'Perlin': n = _fbm(u * 2.5, v * 2.5, 5, 2, .5, _perlin2); break;
            case 'Simplex': n = _fbm(u * 2.8, v * 2.8, 6, 2.1, .5, _perlin2); break;
            case 'Fault': n = _fault(u * 2.5, v * 2.5, 64); break;
            case 'Cosine': n = Math.cos(_fbm(u * 2.0, v * 2.0, 4, 2, .5) * Math.PI); break;
            case 'Value': n = _fbm((u * 2.5 | 0) + .001, (v * 2.5 | 0) + .001, 3, 2, .6, _perlin2); break;
            case 'Worley': n = _worley2(u, v, 3, 16); break;
            default: n = 0;
          }
          var h = minH + ((n + 1) * 0.5) * range;
          pos[idx] = h; idx += 3;
        }
      }
      terrainMesh.geometry.attributes.position.needsUpdate = true;
      terrainMesh.geometry.computeVertexNormals();
      rebuildEdges();
      if (ball && typeof ball.refresh === 'function') ball.refresh();
    }

    // ---- Trees ----
    function clearTrees() { dispose(treesGroup); treesGroup = null; }
    function tileCenterLocal(i, j) {
      var s = planeWorldSize(), W = s.W, H = s.H;
      var x = -W / 2 + (i + 0.5) * TILE_SIZE;
      var z = -H / 2 + (j + 0.5) * TILE_SIZE;
      return new THREE.Vector3(x, 0, z);
    }
    function sampleHeightLocal(x, z) {
      var s = planeWorldSize(), W = s.W, H = s.H;
      var u = (x + W / 2) / W, v = (z + H / 2) / H;
      var gx = u * TILES_X, gy = v * TILES_Y;
      var vpr = TILES_X + 1;
      var i = Math.floor(gx), j = Math.floor(gy);
      var tx = _clamp(i, 0, TILES_X - 1), ty = _clamp(j, 0, TILES_Y - 1);
      var fx = gx - tx, fy = gy - ty;
      var pos = terrainMesh.geometry.attributes.position.array;
      var idx = function (jj, ii) { return ((jj) * vpr + (ii)) * 3 + 1; };
      var y00 = pos[idx(ty, tx)], y10 = pos[idx(ty, tx + 1)], y01 = pos[idx(ty + 1, tx)], y11 = pos[idx(ty + 1, tx + 1)];
      var y0 = y00 * (1 - fx) + y10 * fx, y1 = y01 * (1 - fx) + y11 * fx;
      return y0 * (1 - fy) + y1 * fy;
    }

    // Trees sized 10–15ft equivalent (> character height), base flush to terrain
    function makeTree() {
      var ratio = THREE.MathUtils.lerp(TREE_MIN_RATIO, TREE_MAX_RATIO, Math.random()); // 1.67..2.5× character
      var totalH = CHAR_HEIGHT_UNITS * ratio;
      var trunkH = totalH * 0.42;
      var crownH = totalH - trunkH;

      var crownR = Math.min(TILE_SIZE * 0.45, totalH * 0.22);
      var trunkRBottom = Math.max(TILE_SIZE * 0.06, crownR * 0.22);
      var trunkRTop = Math.max(TILE_SIZE * 0.04, crownR * 0.16);

      var trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(trunkRTop, trunkRBottom, trunkH, 10),
        new THREE.MeshStandardMaterial({ color: 0x735a3a, roughness: 0.9 })
      );
      trunk.position.y = trunkH * 0.5; // base at y=0

      var crown = new THREE.Mesh(
        new THREE.ConeGeometry(crownR, crownH, 12),
        new THREE.MeshStandardMaterial({ color: 0x2f9448, roughness: 0.9 })
      );
      crown.position.y = trunkH + crownH * 0.5;

      trunk.castShadow = true;
      crown.castShadow = true;
      var g = new THREE.Group(); g.add(trunk, crown);
      return g;
    }

    function populateTrees(count) {
      clearTrees();
      if (!terrainMesh || count <= 0) return;
      treesGroup = new THREE.Group(); treesGroup.name = 'Trees';
      var max = Math.min(count, TILES_X * TILES_Y);
      var used = new Set();
      var placed = 0;
      while (placed < max) {
        var i = (Math.random() * TILES_X) | 0;
        var j = (Math.random() * TILES_Y) | 0;
        var key = i + ',' + j;
        if (used.has(key)) continue;
        used.add(key);
        var c = tileCenterLocal(i, j);
        var y = sampleHeightLocal(c.x, c.z); // exact terrain height at tile center
        var t = makeTree();
        t.position.set(c.x, y, c.z); // group base sits flush
        treesGroup.add(t);
        placed++;
      }
      terrainGroup.add(treesGroup);
    }

    // ---- Sculpt ----
    function worldToTile(localX, localZ) {
      var s = planeWorldSize(), W = s.W, H = s.H;
      var u = (localX + W / 2) / W, v = (localZ + H / 2) / H;
      var i = Math.floor(u * TILES_X), j = Math.floor(v * TILES_Y);
      i = _clamp(i, 0, TILES_X - 1); j = _clamp(j, 0, TILES_Y - 1); return { i: i, j: j };
    }
    function tileCornerIndices(i, j) {
      var vpr = TILES_X + 1, tl = j * vpr + i, tr = tl + 1, bl = (j + 1) * vpr + i, br = bl + 1; return [tl, tr, bl, br];
    }
    function applyTileDelta(ci, cj, dir, rTiles, step) {
      if (!terrainMesh) return;
      var posAttr = terrainMesh.geometry.attributes.position, arr = posAttr.array;
      var map = new Map();
      for (var dj = -rTiles; dj <= rTiles; dj++) {
        for (var di = -rTiles; di <= rTiles; di++) {
          var ti = ci + di, tj = cj + dj; if (ti < 0 || tj < 0 || ti >= TILES_X || tj >= TILES_Y) continue;
          var d = Math.hypot(di, dj); if (d > rTiles) continue;
          var fall = rTiles === 0 ? 1 : (1 - d / rTiles);
          var delta = dir * step * fall;
          var corners = tileCornerIndices(ti, tj);
          for (var k = 0; k < corners.length; k++) {
            var vi = corners[k]; var yi = vi * 3 + 1;
            map.set(yi, (map.get(yi) || 0) + delta);
          }
        }
      }
      map.forEach(function (dy, yi) { arr[yi] = _clamp(arr[yi] + dy, MIN_H, MAX_H); });
      posAttr.needsUpdate = true; terrainMesh.geometry.computeVertexNormals(); rebuildEdges(); if (ball && typeof ball.refresh === 'function') ball.refresh();
    }
    function smoothTiles(ci, cj, rTiles) {
      if (!terrainMesh) return;
      var posAttr = terrainMesh.geometry.attributes.position, arr = posAttr.array;
      var vpr = TILES_X + 1, set = new Set();
      var i0 = Math.max(0, ci - rTiles), j0 = Math.max(0, cj - rTiles);
      var i1 = Math.min(TILES_X, ci + rTiles + 1), j1 = Math.min(TILES_Y, cj + rTiles + 1);
      for (var j = j0; j <= j1; j++) { for (var i = i0; i <= i1; i++) { set.add(j * vpr + i); } }
      var sum = 0, cnt = 0; set.forEach(function (vi) { sum += arr[vi * 3 + 1]; cnt++; });
      var avg = cnt ? sum / cnt : 0;
      set.forEach(function (vi) { var yi = vi * 3 + 1; arr[yi] += (avg - arr[yi]) * 0.15; });
      posAttr.needsUpdate = true; terrainMesh.geometry.computeVertexNormals(); rebuildEdges(); if (ball && typeof ball.refresh === 'function') ball.refresh();
    }

    // ---- Tabs + UI wiring ----
    var tabButtons = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    var tabContents = {
      terrain: document.getElementById('tab-terrain'),
      sculpt: document.getElementById('tab-sculpt'),
      objects: document.getElementById('tab-objects'),
      extras: document.getElementById('tab-extras'),
      settings: document.getElementById('tab-settings')
    };
    tabButtons.forEach(function (b) {
      b.addEventListener('click', function () {
        tabButtons.forEach(function (x) { x.classList.remove('on'); });
        for (var k in tabContents) if (tabContents.hasOwnProperty(k)) tabContents[k].classList.remove('on');
        b.classList.add('on');
        tabContents[b.getAttribute('data-tab')].classList.add('on');
      });
    });

    var tilesX = document.getElementById('tilesX');
    var tilesY = document.getElementById('tilesY');
    var genBtn = document.getElementById('genTerrain');
    var randBtn = document.getElementById('randomize');
    var templateSel = document.getElementById('template');
    var applyTemplateBtn = document.getElementById('applyTemplate');
    var treeCount = document.getElementById('treeCount');
    var applyTreesBtn = document.getElementById('applyTrees');

    genBtn.addEventListener('click', function () {
      TILES_X = Math.max(2, Math.min(256, parseInt(tilesX.value || '30', 10)));
      TILES_Y = Math.max(2, Math.min(256, parseInt(tilesY.value || '30', 10)));
      buildTerrain();
    });

    randBtn.addEventListener('click', function () {
      if (!terrainMesh) return;
      var arr = terrainMesh.geometry.attributes.position.array;
      for (var i = 1; i < arr.length; i += 3) arr[i] += (Math.random() - 0.5) * 2.5;
      terrainMesh.geometry.attributes.position.needsUpdate = true;
      terrainMesh.geometry.computeVertexNormals();
      rebuildEdges(); if (ball && typeof ball.refresh === 'function') ball.refresh();
    });

    applyTemplateBtn.addEventListener('click', function () { applyTemplate(templateSel.value); });
    applyTreesBtn.addEventListener('click', function () {
      var n = Math.max(0, Math.min(100000, parseInt(treeCount.value || '0', 10)));
      populateTrees(n);
    });

    var sculptOn = document.getElementById('sculptOn');
    var stepInput = document.getElementById('stepInput');
    var stepDown = document.getElementById('stepDown');
    var stepUp = document.getElementById('stepUp');
    var radiusInput = document.getElementById('radiusInput');
    var radiusDown = document.getElementById('radiusDown');
    var radiusUp = document.getElementById('radiusUp');
    var modeRaise = document.getElementById('modeRaise');
    var modeLower = document.getElementById('modeLower');
    var modeSmooth = document.getElementById('modeSmooth');

    controls.enabled = !sculptOn.checked;
    sculptOn.addEventListener('change', function () { controls.enabled = !sculptOn.checked; });

    function clampNum(el, min, max, step) {
      var v = parseFloat(el.value); var n = isNaN(v) ? 0 : v; var s = Math.round(n / step) * step;
      el.value = Math.max(min, Math.min(max, parseFloat(s.toFixed(10))));
    }
    stepDown.addEventListener('click', function () { stepInput.value = (parseFloat(stepInput.value) - 0.2).toFixed(1); clampNum(stepInput, -2, 2, 0.2); });
    stepUp.addEventListener('click', function () { stepInput.value = (parseFloat(stepInput.value) + 0.2).toFixed(1); clampNum(stepInput, -2, 2, 0.2); });
    radiusDown.addEventListener('click', function () { radiusInput.value = Math.max(1, parseInt(radiusInput.value, 10) - 1); });
    radiusUp.addEventListener('click', function () { radiusInput.value = Math.min(6, parseInt(radiusInput.value, 10) + 1); });

    function setMode(r, l, s) {
      if (r === void 0) r = false;
      if (l === void 0) l = false;
      if (s === void 0) s = false;
      [modeRaise, modeLower, modeSmooth].forEach(function (b) { b.classList.remove('on'); });
      if (r) modeRaise.classList.add('on'); if (l) modeLower.classList.add('on'); if (s) modeSmooth.classList.add('on');
    }
    modeRaise.addEventListener('click', function () { setMode(true, false, false); });
    modeLower.addEventListener('click', function () { setMode(false, true, false); });
    modeSmooth.addEventListener('click', function () { setMode(false, false, true); });
    setMode(true, false, false);

    // Pointer sculpt
    var dragging = false;
    renderer.domElement.addEventListener('pointerdown', function (ev) { if (!sculptOn.checked) return; dragging = true; cast(ev); });
    renderer.domElement.addEventListener('pointermove', function (ev) { if (dragging && sculptOn.checked) cast(ev); });
    window.addEventListener('pointerup', function () { dragging = false; });

    function cast(ev) {
      if (!terrainMesh) return;
      var rect = renderer.domElement.getBoundingClientRect();
      var x = ((ev.clientX - rect.left) / rect.width) * 2 - 1, y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x: x, y: y }, camera);
      var hit = raycaster.intersectObject(terrainMesh, false)[0]; if (!hit) return;
      var local = terrainMesh.worldToLocal(hit.point.clone());
      var ij = worldToTile(local.x, local.z);
      var i = ij.i, j = ij.j;
      var r = Math.max(0, Math.min(6, parseInt(radiusInput.value, 10) || 0));
      var step = parseFloat(stepInput.value || '0.2');
      if (modeSmooth.classList.contains('on')) smoothTiles(i, j, r);
      else {
        var sign = modeLower.classList.contains('on') ? -1 : 1;
        applyTileDelta(i, j, sign, r, step);
      }
    }

    // --- Tap-to-move character when Sculpt is OFF ---
    renderer.domElement.addEventListener('pointerdown', function (ev) {
      if (sculptOn.checked) return; // don't hijack sculpting gesture
      if (!terrainMesh || !ball) return;
      var rect = renderer.domElement.getBoundingClientRect();
      var x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      var y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x: x, y: y }, camera);
      var hit = raycaster.intersectObject(terrainMesh, false)[0];
      if (!hit) return;
      var local = terrainMesh.worldToLocal(hit.point.clone());
      var ij = worldToTile(local.x, local.z);
      ball.placeOnTile(ij.i, ij.j);

      // --- NEW: nudge target toward the ball immediately on tap for snappier feel
      if (followBall && ball && ball.mesh && typeof controls.target.lerp === 'function') {
        controls.target.lerp(ball.mesh.position, 0.5);
      }
    });
    // --- END tap-to-move ---

    // ---- Boot / Loop / SW ----
    buildTerrain();                                  // also triggers updateSkyBounds()
    updateSky(100 * TILE_SIZE, new THREE.Vector3()); // visible from first frame

    window.addEventListener('resize', function () {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      updateSkyBounds();
    });

    // --- NEW: follow the ball each frame by lerping the orbit target ---
    renderer.setAnimationLoop(function () {
      if (followBall && ball && ball.mesh && typeof controls.target.lerp === 'function') {
        _tmpVec3.copy(ball.mesh.position);
        controls.target.lerp(_tmpVec3, 0.12); // 0..1 (higher = snappier follow)
      }
      controls.update();
      renderer.render(scene, camera);
    });

    if ('serviceWorker' in navigator) try { navigator.serviceWorker.register('./sw.js').catch(function () {}); } catch (_) {}
    var promptEvt = null;
    window.addEventListener('beforeinstallprompt', function (e) { try { e.preventDefault(); } catch (_) {} promptEvt = e; });
    var installBtn = document.getElementById('installBtn');
    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (promptEvt && typeof promptEvt.prompt === 'function') { promptEvt.prompt(); promptEvt = null; }
        else { alert('To install: Share > Add to Home Screen'); }
      });
    }
  }
})();