// file: src/navlock.js
// Tiny floating card (top-left) to pause/resume tap-to-move.
// Exports initNavLock() which returns a controller with isPaused() and setPaused().

export function initNavLock(opts = {}) {
  const z = (opts.zIndex != null) ? String(opts.zIndex) : '9999';
  const offset = (opts.offset != null) ? opts.offset : 8;

  // state
  let paused = false;

  // UI
  const box = document.createElement('div');
  box.id = 'tc-navlock';
  box.innerHTML = `
    <div class="row">
      <span class="title">Nav Lock</span>
      <label class="switch" title="Pause tap to move">
        <input type="checkbox" id="tc-navlock-toggle" />
        <span class="slider"></span>
      </label>
    </div>
    <div class="hint" id="tc-navlock-hint">Tap-to-move: ON</div>
  `;

  const css = document.createElement('style');
  css.textContent = `
    #tc-navlock, #tc-navlock * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    #tc-navlock {
      position: fixed;
      top: calc(${offset}px + env(safe-area-inset-top));
      left: ${offset}px;
      z-index: ${z};
      background: rgba(16,19,24,0.75);
      border: 1px solid rgba(255,255,255,0.12);
      backdrop-filter: blur(10px);
      color: #dbe3f1;
      font: 600 12px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      border-radius: 12px;
      padding: 8px 10px;
      user-select: none;
      pointer-events: auto;
    }
    #tc-navlock .row {
      display: flex; align-items: center; gap: 10px; justify-content: space-between;
    }
    #tc-navlock .title { letter-spacing: .2px; }
    #tc-navlock .hint { margin-top: 6px; opacity: .75; font-weight: 500; }
    /* iOS-friendly toggle */
    #tc-navlock .switch { position: relative; display: inline-block; width: 48px; height: 26px; }
    #tc-navlock .switch input { display: none; }
    #tc-navlock .slider {
      position: absolute; inset: 0; border-radius: 999px;
      background: #2a2f3a; transition: .18s;
      border: 1px solid rgba(255,255,255,0.12);
    }
    #tc-navlock .slider:before {
      content: ""; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px;
      background: #fff; border-radius: 50%; transition: .18s;
      box-shadow: 0 1px 2px rgba(0,0,0,.35);
    }
    #tc-navlock .switch input:checked + .slider { background: #1f8ae6; }
    #tc-navlock .switch input:checked + .slider:before { transform: translateX(22px); }
  `;
  document.head.appendChild(css);
  document.body.appendChild(box);

  const toggle = box.querySelector('#tc-navlock-toggle');
  const hint = box.querySelector('#tc-navlock-hint');

  function setPaused(v) {
    paused = !!v;
    if (toggle) toggle.checked = paused;
    if (hint) hint.textContent = paused ? 'Tap-to-move: PAUSED' : 'Tap-to-move: ON';
    // Broadcast for interested listeners
    try {
      window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused } }));
    } catch (_) {}
  }

  toggle.addEventListener('change', function () {
    setPaused(this.checked);
  });

  // Expose a global flag for simplicity (read-only convention)
  Object.defineProperty(window, '__tapMovePaused', {
    configurable: true,
    get: function(){ return paused; }
  });

  // init
  setPaused(false);

  return {
    isPaused: function(){ return paused; },
    setPaused: setPaused,
    destroy: function(){
      try { box.remove(); } catch(_) {}
      try { css.remove(); } catch(_) {}
    }
  };
}

export default initNavLock;