// file: src/textureTest.js
// Wires the Textures tab placeholders + tap-to-apply onto the test sphere.
// Assumes there is a button with class "tex-select" and data-tex="sand" in #tab-textures.

import * as THREE from 'three';
import { showErrorOverlay } from './utils.js';
import { getMaterial } from './textureLoader.js';

export function initTextureTest(appState) {
  const state = { active: false, current: null };
  const tab = document.getElementById('tab-textures');
  const ray = new THREE.Raycaster();

  function setActiveTex(name) {
    state.active = !!name;
    state.current = name || null;
    // Visual
    tab?.querySelectorAll('.tex-select').forEach(b => {
      const on = b.dataset.tex === state.current;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  // Click on texture buttons
  tab?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tex-select');
    if (!btn) return;
    const name = btn.dataset.tex;
    if (name === state.current) {
      setActiveTex(null);
    } else {
      setActiveTex(name); // enter paint mode
      // hint other systems (pause tap-to-move in HUD if desired)
      try { window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused: true } })); } catch {}
    }
  });

  // Tap scene to apply to the test sphere
  appState.renderer.domElement.addEventListener('pointerdown', async (ev) => {
    if (!state.active || !appState.testSphere) return;

    const rect = appState.renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera({ x, y }, appState.camera);

    const hit = ray.intersectObject(appState.testSphere, false)[0];
    if (!hit) return;

    try {
      const mat = await getMaterial(state.current, appState);
      appState.testSphere.material = mat;
      appState.testSphere.material.needsUpdate = true;
    } catch (e) {
      showErrorOverlay('Failed to load/apply texture.', e);
    } finally {
      setActiveTex(null); // exit paint mode
    }
  }, { passive: true });

  return {
    isActive(){ return !!state.active; }
  };
}