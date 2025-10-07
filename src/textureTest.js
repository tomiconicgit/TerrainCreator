// file: src/textureTest.js
import * as THREE from 'three';
import { loadSandMaterial } from './textureLoader.js';
import { setTilePaint } from './paint.js';

export function initTextureTest(appState) {
  const { renderer, camera } = appState;
  if (!renderer || !camera) return;

  const raycaster = new THREE.Raycaster();
  let activeTex = null;          // 'sand' or null
  let activeBtn = null;

  // Hook "Use" buttons
  document.querySelectorAll('.tex-select').forEach(btn => {
    btn.addEventListener('click', async () => {
      const texId = btn.dataset.tex;
      if (!texId) return;

      if (activeTex === texId) { clearActive(); resumeMove(); return; }

      setActive(btn, texId);
      pauseMove();
    });
  });

  // Click in scene:
  // 1) sphere gets full material (existing behavior)
  // 2) terrain tile gets painted in mask
  renderer.domElement.addEventListener('pointerdown', async (ev) => {
    if (!activeTex) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera({ x, y }, camera);

    // First: sphere test
    if (appState.testSphere) {
      const hitsS = raycaster.intersectObject(appState.testSphere, false);
      if (hitsS.length && activeTex === 'sand') {
        const mat = await loadSandMaterial(appState.renderer);
        if (mat) {
          disposeMat(appState.testSphere.material);
          appState.testSphere.material = mat;
        }
        // keep active so user can paint multiple tiles next if they want
        return;
      }
    }

    // Second: terrain tile paint
    if (appState.terrainMesh) {
      const hitsT = raycaster.intersectObject(appState.terrainMesh, false);
      if (hitsT.length && activeTex === 'sand') {
        const world = hitsT[0].point.clone();
        const local = appState.terrainMesh.worldToLocal(world);
        const { i, j } = localToTile(local.x, local.z, appState.config);
        setTilePaint(appState, i, j, true);
        return;
      }
    }

  }, { passive: true });

  // ESC cancels
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeTex) {
      clearActive();
      resumeMove();
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
  function pauseMove(){
    try { window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused: true } })); } catch {}
  }
  function resumeMove(){
    try { window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused: false } })); } catch {}
  }
}

function localToTile(localX, localZ, config) {
  const { TILE_SIZE, TILES_X, TILES_Y } = config;
  const W = TILES_X * TILE_SIZE;
  const H = TILES_Y * TILE_SIZE;

  const u = (localX + W / 2) / W;
  const v = (localZ + H / 2) / H;

  let i = Math.floor(u * TILES_X);
  let j = Math.floor(v * TILES_Y);
  i = Math.min(TILES_X - 1, Math.max(0, i));
  j = Math.min(TILES_Y - 1, Math.max(0, j));
  return { i, j };
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