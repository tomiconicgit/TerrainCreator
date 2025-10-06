// file: src/ui.js
import { createTerrain, randomizeTerrain, applyHeightmapTemplate } from './terrain.js';
import { populateTrees } from './trees.js';
import { updateCameraBounds } from './camera.js';

let uiState = {
  sculptOn: false,
  step: 0.2,
  radius: 2,
  mode: 'raise' // raise | lower | smooth
};

export function getUiState() {
  return uiState;
}

export function initUI(appState) {
  // ---- Tabs ----
  document.querySelectorAll('.tab').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('on'));
      document.querySelectorAll('.tabcontent').forEach(c => c.classList.remove('on'));
      b.classList.add('on');
      document.getElementById(`tab-${b.dataset.tab}`).classList.add('on');
    });
  });

  // ---- Terrain Tab ----
  const tilesX = document.getElementById('tilesX');
  const tilesY = document.getElementById('tilesY');
  document.getElementById('genTerrain').addEventListener('click', () => {
    appState.config.TILES_X = Math.max(2, Math.min(256, parseInt(tilesX.value || '30', 10)));
    appState.config.TILES_Y = Math.max(2, Math.min(256, parseInt(tilesY.value || '30', 10)));
    createTerrain(appState);
    updateCameraBounds(appState);
  });

  document.getElementById('randomize').addEventListener('click', () => randomizeTerrain(appState));

  const templateSel = document.getElementById('template');
  document.getElementById('applyTemplate').addEventListener('click', () => applyHeightmapTemplate(templateSel.value, appState));

  const treeCount = document.getElementById('treeCount');
  document.getElementById('applyTrees').addEventListener('click', () => {
    const n = Math.max(0, Math.min(100000, parseInt(treeCount.value || '0', 10)));
    populateTrees(n, appState);
  });

  // ---- Sculpt Tab ----
  const sculptOn = document.getElementById('sculptOn');
  sculptOn.addEventListener('change', (e) => {
    uiState.sculptOn = e.target.checked;
    appState.controls.enabled = !uiState.sculptOn;
  });

  const stepInput = document.getElementById('stepInput');
  const radiusInput = document.getElementById('radiusInput');
  stepInput.addEventListener('change', () => uiState.step = parseFloat(stepInput.value));
  radiusInput.addEventListener('change', () => uiState.radius = parseInt(radiusInput.value, 10));

  const clampNum = (el, min, max, step) => {
    const v = parseFloat(el.value);
    const n = isNaN(v) ? 0 : v;
    const s = Math.round(n / step) * step;
    el.value = Math.max(min, Math.min(max, parseFloat(s.toFixed(10))));
    el.dispatchEvent(new Event('change'));
  };
  document.getElementById('stepDown').addEventListener('click', () => { stepInput.value = (parseFloat(stepInput.value) - 0.2).toFixed(1); clampNum(stepInput, -2, 2, 0.2); });
  document.getElementById('stepUp').addEventListener('click', () => { stepInput.value = (parseFloat(stepInput.value) + 0.2).toFixed(1); clampNum(stepInput, -2, 2, 0.2); });
  document.getElementById('radiusDown').addEventListener('click', () => { radiusInput.value = Math.max(1, parseInt(radiusInput.value, 10) - 1); radiusInput.dispatchEvent(new Event('change')); });
  document.getElementById('radiusUp').addEventListener('click', () => { radiusInput.value = Math.min(6, parseInt(radiusInput.value, 10) + 1); radiusInput.dispatchEvent(new Event('change')); });

  const modeRaise = document.getElementById('modeRaise');
  const modeLower = document.getElementById('modeLower');
  const modeSmooth = document.getElementById('modeSmooth');
  const setMode = (mode) => {
    uiState.mode = mode;
    modeRaise.classList.toggle('on', mode === 'raise');
    modeLower.classList.toggle('on', mode === 'lower');
    modeSmooth.classList.toggle('on', mode === 'smooth');
  };
  modeRaise.addEventListener('click', () => setMode('raise'));
  modeLower.addEventListener('click', () => setMode('lower'));
  modeSmooth.addEventListener('click', () => setMode('smooth'));

  // ---- PWA Install ----
  let promptEvt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptEvt = e;
  });
  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.addEventListener('click', () => {
      if (promptEvt) {
        promptEvt.prompt();
        promptEvt = null;
      } else {
        alert('To install: Share > Add to Home Screen');
      }
    });
  }
}