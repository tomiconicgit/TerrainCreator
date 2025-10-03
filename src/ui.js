// file: src/ui.js
import { createTerrain, randomizeTerrain, applyHeightmapTemplate } from './terrain.js';
// ... other imports

let uiState = {
    sculptOn: false,
    step: 0.2,
    radius: 2,
    mode: 'raise',
    // ========= NEW UI STATE =========
    paintTexture: null, // e.g., 'grass', 'sand', etc. or null if not painting
    paintRadius: 10,
    // ================================
};

// ... (getUiState function remains the same)

export function initUI(appState) {
    // ... (All existing UI wiring remains)

    // ========= NEW TEXTURE PAINT UI WIRING =========
    const textureButtons = document.querySelectorAll('.tex-btn');
    textureButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const texture = btn.dataset.texture;
            // If the clicked button is already active, turn off paint mode
            if (btn.classList.contains('on')) {
                uiState.paintTexture = null;
                btn.classList.remove('on');
            } else {
                // Otherwise, turn on paint mode for this texture
                uiState.paintTexture = texture;
                textureButtons.forEach(b => b.classList.remove('on')); // Deselect others
                btn.classList.add('on'); // Select this one
            }
        });
    });

    const radiusPaintInput = document.getElementById('radiusPaintInput');
    radiusPaintInput.addEventListener('change', () => {
        uiState.paintRadius = Math.max(1, Math.min(100, parseInt(radiusPaintInput.value, 10)));
    });

    document.getElementById('radiusPaintDown').addEventListener('click', () => {
        radiusPaintInput.value = Math.max(1, parseInt(radiusPaintInput.value, 10) - 1);
        radiusPaintInput.dispatchEvent(new Event('change'));
    });
    document.getElementById('radiusPaintUp').addEventListener('click', () => {
        radiusPaintInput.value = Math.min(100, parseInt(radiusPaintInput.value, 10) + 1);
        radiusPaintInput.dispatchEvent(new Event('change'));
    });
    // ===============================================

    // ... (PWA Install wiring remains the same)
}
