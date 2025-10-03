// file: src/sky.js
// Sky dome that auto-fits your world and drives environment lighting.
// Tries local addon first at src/vendor/three.sky.js, then other local fallbacks, then CDN.

export class SkySystem {
  /**
   * @param {object} THREE - the Three namespace you already loaded
   * @param {object|null} SkyClass - optional Sky class
   * @param {THREE.Scene} scene
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.DirectionalLight} dirLight
   */
  constructor(THREE, SkyClass, scene, renderer, dirLight) {
    this.THREE = THREE;
    this.scene = scene;
    this.renderer = renderer;
    this.dirLight = dirLight;

    this.sun = new THREE.Vector3();
    this.lightTarget = new THREE.Object3D();
    this.scene.add(this.lightTarget);
    this.dirLight.target = this.lightTarget;

    this.pmremGen = new THREE.PMREMGenerator(this.renderer);
    this.pmremGen.compileEquirectangularShader();
    this.envRT = null;

    this.sky = null;        // set by load()
    this.uniforms = null;   // set if using the real Sky addon

    // Brighter daytime defaults
    this.params = {
      turbidity: 10,
      rayleigh: 1.2,
      mieCoefficient: 0.003,
      mieDirectionalG: 0.8,
      elevation: 55,
      azimuth: 130,
      exposure: 0.9
    };

    this._loaded = false;
    this._SkyClass = SkyClass || null;
  }

  async _tryImport(paths) {
    for (const p of paths) {
      try { return (await import(p)).Sky; } catch {}
    }
    return null;
  }

  async load() {
    let SkyClass = this._SkyClass;

    if (!SkyClass) {
      // Priority: src/vendor/three.sky.js
      SkyClass = await this._tryImport([
        './vendor/three.sky.js',                 // <repo>/src/vendor/three.sky.js (preferred)
        '../src/vendor/three.sky.js',            // fallback variants
        '../vendor/three.sky.js',
        '../vendor/examples/jsm/objects/Sky.js',
        'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/objects/Sky.js'
      ]);
    }

    if (SkyClass) {
      this.sky = new SkyClass();
      this.sky.name = 'Sky';
      this.scene.add(this.sky);
      this.uniforms = this.sky.material?.uniforms || null;
    } else {
      // Minimal gradient fallback
      const THREE = this.THREE;
      const geo = new THREE.SphereGeometry(1, 32, 16);
      const mat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          top: { value: new THREE.Color(0x6aa9ff) },
          bottom: { value: new THREE.Color(0x223144) },
          offset: { value: 0.0 },
          exponent: { value: 1.5 },
        },
        vertexShader: `
          varying vec3 vWorld;
          void main(){
            vec4 wp = modelMatrix * vec4(position,1.0);
            vWorld = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          varying vec3 vWorld;
          uniform vec3 top;
          uniform vec3 bottom;
          uniform float offset;
          uniform float exponent;
          void main(){
            float h = normalize(vWorld).y;
            float f = max(pow(max(h+offset,0.0), exponent), 0.0);
            gl_FragColor = vec4(mix(bottom, top, f), 1.0);
          }
        `
      });
      this.sky = new this.THREE.Mesh(geo, mat);
      this.sky.name = 'SkyFallback';
      this.scene.add(this.sky);
      this.uniforms = null;
    }

    this._loaded = true;
  }

  /**
   * Fits the sky dome to `worldSpanUnits` and positions light towards `focus`.
   */
  update(worldSpanUnits = 100, focus) {
    if (!this._loaded) return;

    const THREE = this.THREE;
    const p = this.params;

    // Compute sun vector from params
    const phi = THREE.MathUtils.degToRad(90 - p.elevation);
    const theta = THREE.MathUtils.degToRad(p.azimuth);
    this.sun.setFromSphericalCoords(1, phi, theta);

    // Apply shader uniforms if real Sky is used
    if (this.uniforms) {
      const u = this.uniforms;
      u['turbidity'].value = p.turbidity;
      u['rayleigh'].value = p.rayleigh;
      u['mieCoefficient'].value = p.mieCoefficient;
      u['mieDirectionalG'].value = p.mieDirectionalG;
      u['sunPosition'].value.copy(this.sun);
    }

    const size = Math.max(100, worldSpanUnits);
    this.sky.scale.setScalar(size);
    this.renderer.toneMappingExposure = p.exposure;

    // Build environment map from a temporary scene containing only the sky
    if (this.uniforms) {
      if (this.envRT) this.envRT.dispose();
      const tmp = new THREE.Scene();
      tmp.add(this.sky);
      this.envRT = this.pmremGen.fromScene(tmp);
      this.scene.environment = this.envRT.texture;
    }

    // Aim sun light and fit its shadow camera
    const lightDist = Math.max(150, size * 1.5);
    this.dirLight.position.copy(this.sun).multiplyScalar(lightDist);
    this.lightTarget.position.copy(focus || new THREE.Vector3());

    const ortho = this.dirLight.shadow.camera;
    if (ortho && ortho.isOrthographicCamera) {
      const half = Math.max(50, size * 0.75);
      ortho.left = -half; ortho.right = half; ortho.top = half; ortho.bottom = -half;
      ortho.updateProjectionMatrix();
    }
  }

  dispose() {
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; }
    if (this.pmremGen) { this.pmremGen.dispose(); this.pmremGen = null; }
    if (this.sky) { this.scene.remove(this.sky); this.sky.geometry?.dispose(); this.sky.material?.dispose?.(); this.sky = null; }
    if (this.lightTarget) { this.scene.remove(this.lightTarget); this.lightTarget = null; }
  }
}