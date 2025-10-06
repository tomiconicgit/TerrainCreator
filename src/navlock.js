// file: src/navlock.js
// Minimal floating toggle to pause/resume tap-to-move (no container chrome).

export function initNavLock(opts = {}) {
  const z = (opts.zIndex != null) ? String(opts.zIndex) : '9999';
  const offset = (opts.offset != null) ? opts.offset : 8;

  let paused = false;

  const box = document.createElement('div');
  box.id = 'tc-navlock';
  box.innerHTML = `
    <span class="nl-label">Tap-to-move</span>
    <label class="switch" title="Pause tap to move">
      <input type="checkbox" id="tc-navlock-toggle" />
      <span class="slider"></span>
    </label>
  `;

  const css = document.createElement('style');
  css.textContent = `
    #tc-navlock, #tc-navlock * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    #tc-navlock{
      position: fixed;
      top: calc(${offset}px + env(safe-area-inset-top));
      left: ${offset}px;
      z-index: ${z};
      display:flex; align-items:center; gap:8px;
      background: transparent; border: none; padding: 0; color: #f4f4f4;
      font: 600 12px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      pointer-events: auto; user-select: none;
    }
    #tc-navlock .nl-label{ opacity:.9; }
    /* Inherit switch visuals from app.css; provide fallbacks */
    #tc-navlock .switch{ position:relative; display:inline-block; width:56px; height:28px; }
    #tc-navlock .switch input{ display:none; }
    #tc-navlock .slider{
      position:absolute; inset:0; border-radius:999px;
      background:#2e2e2e; transition:.18s; border:1px solid #0000;
    }
    #tc-navlock .slider:before{
      content:""; position:absolute; width:22px; height:22px; left:3px; top:3px;
      background:#fff; border-radius:50%; transition:.18s; box-shadow:0 1px 2px rgba(0,0,0,.35);
    }
    #tc-navlock .switch input:checked + .slider{ background:#444; }
    #tc-navlock .switch input:checked + .slider:before{ transform:translateX(28px); }
  `;
  document.head.appendChild(css);
  document.body.appendChild(box);

  const toggle = box.querySelector('#tc-navlock-toggle');

  function setPaused(v) {
    paused = !!v;
    if (toggle) toggle.checked = paused;
    try {
      window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused } }));
    } catch (_) {}
  }

  toggle.addEventListener('change', function () {
    setPaused(this.checked);
  });

  Object.defineProperty(window, '__tapMovePaused', {
    configurable: true,
    get: function(){ return paused; }
  });

  setPaused(false);

  return {
    isPaused: function(){ return paused; },
    setPaused,
    destroy: function(){
      try { box.remove(); } catch(_) {}
      try { css.remove(); } catch(_) {}
    }
  };
}

export default initNavLock;
