// file: src/navlock.js
// Floating studio HUD: Tap-to-move + Grid Outlines switches
// Emits:
//   - 'tc:navlock'   { paused: boolean }
//   - 'tc:gridtoggle'{ on: boolean }

export function initNavLock(opts = {}) {
  const z = (opts.zIndex != null) ? String(opts.zIndex) : '9999';
  const offset = (opts.offset != null) ? opts.offset : 8;

  // state
  let paused = false;
  let gridOn = true;

  // UI
  const box = document.createElement('div');
  box.id = 'tc-navlock';
  box.innerHTML = `
    <div class="bar">
      <div class="brand">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path fill="currentColor" d="M3 18l5-9 4 5 3-6 6 10" />
        </svg>
        <span class="name">Studio HUD</span>
      </div>

      <div class="controls">
        <div class="ctrl">
          <span class="label">Tap-to-move</span>
          <label class="switch">
            <input type="checkbox" id="tc-navlock-toggle"/>
            <span class="slider"></span>
          </label>
        </div>

        <div class="sep"></div>

        <div class="ctrl">
          <span class="label">Grid Outlines</span>
          <label class="switch">
            <input type="checkbox" id="tc-grid-toggle" checked/>
            <span class="slider"></span>
          </label>
        </div>
      </div>
    </div>
  `;

  const css = document.createElement('style');
  css.textContent = `
    :root{
      --hud-bg: rgba(22,24,28,0.65);
      --hud-stroke: rgba(255,255,255,0.10);
      --hud-text:#e9eef5;
      --hud-muted:#9fb0c4;
      --shadow: 0 10px 30px rgba(0,0,0,0.35);
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
    #tc-navlock .bar{
      display:flex; align-items:center; gap:12px;
      padding:10px 12px;
      background: var(--hud-bg);
      border:1px solid var(--hud-stroke);
      backdrop-filter: blur(14px) saturate(1.1);
      border-radius: 12px;
      box-shadow: var(--shadow);
    }
    #tc-navlock .brand{
      display:flex; align-items:center; gap:6px; color:#cbe0ff;
      filter: drop-shadow(0 1px 6px rgba(120,177,255,0.25));
      margin-right:6px;
    }
    #tc-navlock .brand .name{ font-size:12px; font-weight:800; letter-spacing:.2px; color: var(--hud-text); }

    #tc-navlock .controls{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    #tc-navlock .ctrl{ display:flex; align-items:center; gap:8px; }
    #tc-navlock .label{ color:var(--hud-muted); font: 600 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; white-space:nowrap; }
    #tc-navlock .sep{ width:1px; height:20px; background: var(--hud-stroke); }

    /* Switch */
    #tc-navlock .switch{ position:relative; display:inline-block; width:48px; height:26px; }
    #tc-navlock .switch input{ display:none; }
    #tc-navlock .slider{
      position:absolute; inset:0; border-radius:999px;
      background:#2e353d; transition:.18s; border:1px solid rgba(255,255,255,0.12);
    }
    #tc-navlock .slider:before{
      content:""; position:absolute; width:20px; height:20px; left:3px; top:3px;
      background:#fff; border-radius:50%; transition:.18s; box-shadow:0 1px 2px rgba(0,0,0,.35);
    }
    #tc-navlock .switch input:checked + .slider{ background:#3a3f45; }
    #tc-navlock .switch input:checked + .slider:before{ transform:translateX(22px); }
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
