// file: src/grass.js
import * as THREE from 'three';

// --- GEOMETRY ---
// We create a single blade geometry that will be instanced.
// A simple plane is enough, bent slightly for a more natural look.
function createGrassBladeGeometry() {
    const bladeWidth = 0.2;
    const bladeHeight = 1.5;
    const geometry = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, 3);
    geometry.translate(0, bladeHeight / 2, 0); // Anchor at the bottom

    // Add a gentle bend to the blade
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        const bend = Math.pow(y / bladeHeight, 2) * 0.2;
        position.setX(i, position.getX(i) + bend);
    }
    geometry.computeVertexNormals();
    return geometry;
}
const bladeGeometry = createGrassBladeGeometry();

// --- SHADER ---
const grassVertexShader = `
  uniform float uTime;
  
  varying vec2 vUv;
  varying float vY;

  // From https://www.ronja-tutorials.com/post/024-single-pass-wireframe/
  vec3 barycentric(vec3 p1, vec3 p2, vec3 p3) {
    vec3 v0 = p2 - p1;
    vec3 v1 = p3 - p1;
    vec3 v2 = position - p1;
    float d00 = dot(v0, v0);
    float d01 = dot(v0, v1);
    float d11 = dot(v1, v1);
    float d20 = dot(v2, v0);
    float d21 = dot(v2, v1);
    float denom = d00 * d11 - d01 * d01;
    float v = (d11 * d20 - d01 * d21) / denom;
    float w = (d00 * d21 - d01 * d20) / denom;
    float u = 1.0 - v - w;
    return vec3(u, v, w);
  }

  void main() {
    vUv = uv;
    
    // Wind animation
    mat4 instanceModel = instanceMatrix;
    float y = position.y;
    vY = y;
    float windStrength = 0.3;
    float windSpeed = 2.0;
    float windWave = sin(instanceModel[3][0] * 2.0 + uTime * windSpeed) * windStrength;
    
    // Apply wind only to the top part of the blade
    float windEffect = pow(y, 2.0);
    instanceModel[3][0] += windWave * windEffect;

    gl_Position = projectionMatrix * modelViewMatrix * instanceModel * vec4(position, 1.0);
  }
`;

const grassFragmentShader = `
  varying vec2 vUv;
  varying float vY;

  void main() {
    // Gradient from dark green at the bottom to light green at the top
    vec3 bottomColor = vec3(0.1, 0.4, 0.1);
    vec3 topColor = vec3(0.5, 0.9, 0.2);
    vec3 finalColor = mix(bottomColor, topColor, vY);

    // Fade out the edges of the blade
    float alpha = smoothstep(0.5, 0.0, abs(vUv.x - 0.5));
    
    gl_FragColor = vec4(finalColor, alpha);
  }
`;

// --- MAIN CLASS ---
export class Grass {
    constructor(scene, terrainMesh) {
        this.scene = scene;
        this.terrainMesh = terrainMesh;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
            },
            vertexShader: grassVertexShader,
            fragmentShader: grassFragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
        });

        // The InstancedMesh can hold a huge number of blades.
        // We set a max count and will update the actual rendered count.
        const maxBlades = 200000;
        this.mesh = new THREE.InstancedMesh(bladeGeometry, this.material, maxBlades);
        this.mesh.name = "Grass";
        this.mesh.frustumCulled = false; // Important for performance with large fields
        this.scene.add(this.mesh);
    }

    updateUniforms(time) {
        this.material.uniforms.uTime.value = time;
    }

    // This is the core function that places grass on the terrain
    regenerate() {
        if (!this.terrainMesh) return;

        const terrainPositions = this.terrainMesh.geometry.attributes.position;
        const terrainColors = this.terrainMesh.geometry.attributes.color;
        
        let bladeCount = 0;
        const dummy = new THREE.Object3D(); // Used to create the transformation matrix for each blade

        for (let i = 0; i < terrainPositions.count; i++) {
            // Check the vertex color to see if it's "grassy"
            const r = terrainColors.getX(i);
            const g = terrainColors.getY(i);
            const b = terrainColors.getZ(i);

            // Threshold: If green is the dominant color, we can place grass here.
            if (g > r * 1.1 && g > b * 1.1) {
                // How much grass to place, based on how "green" the vertex is.
                // This makes the grass blend nicely at the edges of painted areas.
                const grassDensity = g - (r + b) / 2.0;
                
                // Add blades based on density. We use a random check to avoid grid-like patterns.
                if (Math.random() < grassDensity * 0.4) { // 0.4 is a density factor
                    if (bladeCount >= this.mesh.count) break; // Don't exceed max count

                    // Get the world position of the vertex
                    dummy.position.set(
                        terrainPositions.getX(i),
                        terrainPositions.getY(i),
                        terrainPositions.getZ(i)
                    );

                    // Add random rotation and scale
                    dummy.rotation.y = Math.random() * Math.PI * 2;
                    dummy.scale.setScalar(0.8 + Math.random() * 0.4);
                    dummy.updateMatrix();

                    this.mesh.setMatrixAt(bladeCount, dummy.matrix);
                    bladeCount++;
                }
            }
        }

        // We must update the instance matrix and set the final rendered count.
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mesh.count = bladeCount;
        console.log(`Rendered ${bladeCount} grass blades.`);
    }
}
