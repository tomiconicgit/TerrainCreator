// file: src/textureTest.js
import * as THREE from 'three';
import { loadSandMaterial } from './textureLoader.js';

export function initTextureTest(appState) {
  const { renderer, camera, scene } = appState;
  if (!renderer || !camera || !scene) return;

  const raycaster = new THREE.Raycaster();
  let activeTex = null;          // e.g. 'sand'
  let activeBtn = null;

  // Wire "Use" buttons
  document.querySelectorAll('.tex-select').forEach(btn => {
    btn.addEventListener('click', async () => {
      const texId = btn.dataset.tex;
      if (!texId) return;

      // toggle off if already active
      if (activeTex === texId) {
        clearActive();
        return;
      }

      setActive(btn, texId);

      // Pause tap-to-move while painting
      try { window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused: true } })); } catch {}
    });
  });

  // Click in scene to apply to sphere when active
  renderer.domElement.addEventListener('pointerdown', async (ev) => {
    if (!activeTex) return;
    if (!appState.testSphere) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x, y }, camera);

    const hits = raycaster.intersectObject(appState.testSphere, false);
    if (!hits.length) return;

    if (activeTex === 'sand') {
      const mat = await loadSandMaterial(renderer);
      if (mat) {
        disposeMat(appState.testSphere.material);
        appState.testSphere.material = mat;
      }
    }

    // Done painting -> resume nav + clear selection
    clearActive();
    try { window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused: false } })); } catch {}
  }, { passive: true });

  // ESC cancels paint mode
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeTex) {
      clearActive();
      try { window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused: false } })); } catch {}
    }
  });

  function setActive(btn, id) {
    clearActive();
    activeTex = id;
    activeBtn = btn;
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = 'Active';
  }

  function clearActive() {
    if (activeBtn) {
      activeBtn.classList.remove('on');
      activeBtn.setAttribute('aria-pressed', 'false');
      activeBtn.textContent = 'Use';
    }
    activeBtn = null;
    activeTex = null;
  }
}

function disposeMat(mat) {
  try {
    if (!mat) return;
    ['map','normalMap','roughnessMap','metalnessMap','aoMap','displacementMap'].forEach(k=>{
      const t = mat[k]; if (t && t.dispose) t.dispose();
    });
    mat.dispose?.();
  } catch {}
}