// file: src/navlock.js
// Minimal floating HUD: Tap-to-move + Grid Outlines switches (no container card)
// Emits:
//   - 'tc:navlock'   { paused: boolean }
//   - 'tc:gridtoggle'{ on: boolean }

export function initNavLock(opts = {}) {
  const z = (opts.zIndex != null) ? String(opts.zIndex) : '9999';
  const offset = (opts.offset != null) ? opts.offset : 8;

  // state
  let paused = false;
  let gridOn = true;

  // UI (no card/container; just two switches)
  const box = document.createElement('div');
  box.id = 'tc-navlock';
  box.innerHTML = `
    <div class="hud">
      <label class="minitoggle" title="Tap-to-move">
        <input type="checkbox" id="tc-navlock-toggle" aria-label="Tap to move"/>
        <span class="slider"></span>
        <span class="txt">Tap-to-move</span>
      </label>

      <label class="minitoggle" title="Grid Outlines">
        <input type="checkbox" id="tc-grid-toggle" checked aria-label="Grid outlines"/>
        <span class="slider"></span>
        <span class="txt">Grid Outlines</span>
      </label>
    </div>
  `;

  const css = document.createElement('style');
  css.textContent = `
    :root{
      --hud-text:#e9eef5;
      --hud-muted:#9fb0c4;
    }
    #tc-navlock, #tc-navlock * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    #tc-navlock {
      position: fixed;
      top: calc(${offset}px + env(safe-area-inset-top));
      left: ${offset}px;
      z-index: ${z};
      color: var(--hud-text);
      user-select: none; pointer-events: auto;
    }

    /* Row of bare switches (no background, no border, no brand) */
    #tc-navlock .hud{
      display:flex; align-items:center; gap:10px;
      padding:0; margin:0; background:transparent; border:0; box-shadow:none;
    }

    /* Each switch+label — lightweight, no chip on mobile */
    #tc-navlock .minitoggle{
      display:inline-flex; align-items:center; gap:8px;
      padding:0; margin:0; background:transparent; border:0;
      font: 600 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      color: var(--hud-muted);
    }
    #tc-navlock .minitoggle .txt{ white-space:nowrap; }

    /* Switch */
    #tc-navlock .minitoggle .switch{ display:none; } /* legacy; not used */
    #tc-navlock .slider{
      position:relative; display:inline-block; width:48px; height:26px;
      border-radius:999px; background:#2e353d; border:1px solid rgba(255,255,255,0.12); transition:.18s;
    }
    #tc-navlock input{ display:none; }
    #tc-navlock .slider:before{
      content:""; position:absolute; width:20px; height:20px; left:3px; top:3px;
      background:#fff; border-radius:50%; transition:.18s; box-shadow:0 1px 2px rgba(0,0,0,.35);
    }
    #tc-navlock input:checked + .slider{ background:#3a3f45; }
    #tc-navlock input:checked + .slider:before{ transform:translateX(22px); }

    /* Mobile: hide text labels & shrink the switch footprint */
    @media (max-width: 480px){
      #tc-navlock { left: 6px; top: calc(6px + env(safe-area-inset-top)); }
      #tc-navlock .hud{ gap:8px; }
      #tc-navlock .minitoggle .txt{ display:none; }
      #tc-navlock .slider{ width:40px; height:24px; }
      #tc-navlock .slider:before{ width:18px; height:18px; }
      #tc-navlock input:checked + .slider:before{ transform:translateX(16px); }
    }
  `;
  document.head.appendChild(css);
  document.body.appendChild(box);

  const toggleMove = box.querySelector('#tc-navlock-toggle');
  const toggleGrid = box.querySelector('#tc-grid-toggle');

  function setPaused(v) {
    paused = !!v;
    if (toggleMove) toggleMove.checked = paused;
    try { window.dispatchEvent(new CustomEvent('tc:navlock', { detail: { paused } })); } catch {}
  }
  function setGrid(v){
    gridOn = !!v;
    if (toggleGrid) toggleGrid.checked = gridOn;
    try { window.dispatchEvent(new CustomEvent('tc:gridtoggle', { detail: { on: gridOn } })); } catch {}
  }

  toggleMove.addEventListener('change', function(){ setPaused(this.checked); });
  toggleGrid.addEventListener('change', function(){ setGrid(this.checked); });

  // Expose read-only flags for convenience
  Object.defineProperty(window, '__tapMovePaused', { configurable:true, get:()=>paused });
  Object.defineProperty(window, '__gridOutlinesOn', { configurable:true, get:()=>gridOn });

  // init defaults
  setPaused(false);
  setGrid(true);

  return {
    isPaused: ()=>paused,
    setPaused,
    isGridOn: ()=>gridOn,
    setGrid,
    destroy(){
      try { box.remove(); } catch(_) {}
      try { css.remove(); } catch(_) {}
    }
  };
}

export default initNavLock;