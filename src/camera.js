// file: src/camera.js
import * as THREE from 'three';

// Minimal orbit controls with pinch-to-zoom support
class MiniOrbit {
  constructor(cam, dom) {
    this.enabled = true;
    this.cam = cam; this.dom = dom; this.target = new THREE.Vector3(0, 0, 0);
    this.sph = new THREE.Spherical().setFromVector3(cam.position.clone().sub(this.target));
    this.dt = 0; this.dp = 0; this.dr = 0; this.damp = 0.1; this.rot = 0.0025; this.zoom = 0.25;
    
    // State for multi-touch
    this.ptrs = new Map();
    this.prevPinchDist = null;

    const self = this;
    
    dom.addEventListener('pointerdown', (e) => {
      if (!self.enabled) return;
      try { dom.setPointerCapture(e.pointerId); } catch (_) {}
      self.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // If this is the second finger, record the initial pinch distance
      if (self.ptrs.size === 2) {
        const pointers = Array.from(self.ptrs.values());
        const dx = pointers[0].x - pointers[1].x;
        const dy = pointers[0].y - pointers[1].y;
        self.prevPinchDist = Math.hypot(dx, dy);
      }
    });

    dom.addEventListener('pointermove', (e) => {
      if (!self.enabled || !self.ptrs.has(e.pointerId)) return;
      
      const p = self.ptrs.get(e.pointerId);
      const dx_single = e.clientX - p.x;
      const dy_single = e.clientY - p.y;
      self.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Single-finger drag for rotation
      if (self.ptrs.size === 1) {
        self.dt -= dx_single * self.rot;
        self.dp -= dy_single * self.rot;
      }
      // Two-finger pinch for zoom
      else if (self.ptrs.size === 2) {
        const pointers = Array.from(self.ptrs.values());
        const dx = pointers[0].x - pointers[1].x;
        const dy = pointers[0].y - pointers[1].y;
        const currentDist = Math.hypot(dx, dy);

        if (self.prevPinchDist) {
          const delta = currentDist - self.prevPinchDist;
          // Spreading fingers (positive delta) should zoom in (decrease radius)
          self.dr -= delta * 0.75; // Sensitivity factor for pinch
        }
        
        self.prevPinchDist = currentDist; // Update for the next frame
      }
    });

    window.addEventListener('pointerup', (e) => {
      self.ptrs.delete(e.pointerId);
      // When a finger is lifted, reset the pinch state
      if (self.ptrs.size < 2) {
        self.prevPinchDist = null;
      }
    });
    
    // Mouse wheel zoom (desktop)
    dom.addEventListener('wheel', (e) => {
      if (!self.enabled) return;
      try { e.preventDefault(); } catch (_) {}
      self.dr += e.deltaY * self.zoom;
    }, { passive: false });
  }

  setBounds(minR, maxR) {
    this.minRadius = Math.max(1, minR);
    this.maxRadius = Math.max(this.minRadius + 1, maxR);
  }

  lookAt(v3) {
    this.target.copy(v3);
  }

  update() {
    if (!this.enabled) return;
    this.sph.theta += this.dt * (1 - this.damp);
    this.sph.phi += this.dp * (1 - this.damp);
    this.sph.radius += this.dr * (1 - this.damp);
    this.dt *= this.damp; this.dp *= this.damp; this.dr *= this.damp;
    const eps = 1e-3;
    this.sph.phi = Math.max(eps, Math.min(Math.PI / 2 - 0.05, this.sph.phi));
    this.sph.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.sph.radius));
    const pos = new THREE.Vector3().setFromSpherical(this.sph).add(this.target);
    this.cam.position.copy(pos);
    this.cam.lookAt(this.target);
  }
}

export function initCamera(renderer) {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 20000);
  camera.position.set(600, 450, 600);
  const controls = new MiniOrbit(camera, renderer.domElement);
  return { camera, controls };
}

export function updateCameraBounds(appState) {
    const { TILE_SIZE, TILES_X, TILES_Y, CHAR_HEIGHT_UNITS } = appState.config;
    // min: get really close to character; max: see whole terrain comfortably
    const spanTiles = Math.max(TILES_X, TILES_Y);
    const worldSpan = Math.max(100, spanTiles) * TILE_SIZE;
    const camMinRadius = Math.max(CHAR_HEIGHT_UNITS * 0.6, TILE_SIZE * 0.8);
    const camMaxRadius = Math.max(worldSpan * 1.2, 1500);
    appState.controls.setBounds(camMinRadius, camMaxRadius);
}
