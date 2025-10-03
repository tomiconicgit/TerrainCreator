/* TerrainCreator Bootstrap — Tom Iconic
   - Self-contained UI (no external CSS/fonts)
   - Step-by-step loader with % bar
   - Live status line (one-liners)
   - Hard traps for window errors & unhandled rejections
   - Captures console.error
   - Expands a debug modal with full error details + Copy All
   - Hands off to your app only after all preflight checks pass
*/

(() => {
  // ---------- Minimal DOM ----------
  const root = document.createElement('div');
  root.id = 'tc-bootstrap';
  root.innerHTML = `
    <div class="wrap">
      <div class="brand">TerrainCreator</div>
      <div class="by">by Tom Iconic</div>

      <div class="bar">
        <div class="fill" style="width:0%"><span class="pct">0%</span></div>
      </div>

      <div class="status" id="tc-status">Preparing…</div>

      <div class="debugline">
        <button class="debugbtn" id="tc-debug-toggle" aria-label="open errors" title="Show errors">+</button>
        <span class="debughint">Debug</span>
      </div>
    </div>

    <div class="modal hidden" id="tc-modal">
      <div class="modal-card">
        <div class="modal-head">
          <div class="modal-title">Bootstrap Debugger</div>
          <div class="modal-actions">
            <button id="tc-copy" class="btn">Copy All</button>
            <button id="tc-close" class="btn btn-ghost">Close</button>
          </div>
        </div>
        <div class="modal-body">
          <pre id="tc-log"></pre>
        </div>
      </div>
    </div>
  `;
  const css = document.createElement('style');
  css.textContent = `
  #tc-bootstrap, #tc-bootstrap * { box-sizing: border-box; }
  #tc-bootstrap {
    position: fixed; inset: 0; background: #0c0f14; color: #dbe3f1;
    display: grid; place-items: center; z-index: 999999;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  }
  #tc-bootstrap .wrap { width: min(520px, 92vw); text-align: center; }
  .brand { font-size: 28px; font-weight: 800; letter-spacing: .3px; }
  .by { opacity: .7; margin-top: 2px; margin-bottom: 18px; }
  .bar { width: 100%; height: 18px; border-radius: 10px; background: #121720; border: 1px solid rgba(255,255,255,0.12); overflow: hidden; }
  .fill { height: 100%; background: linear-gradient(180deg, #00adff, #007ee0); display:flex; align-items:center; justify-content:flex-end; position:relative; transition: width .25s ease; }
  .fill .pct { font-size: 11px; padding-right: 6px; color: white; mix-blend-mode: normal; text-shadow: 0 1px 0 rgba(0,0,0,.3); }
  .status { margin-top: 12px; opacity: .9; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; white-space: pre-line; }
  .debugline { margin-top: 12px; display:flex; align-items:center; justify-content:center; gap:8px; opacity:.85; }
  .debugbtn { width:26px; height:26px; border-radius: 999px; border:1px solid rgba(255,255,255,.2); background: transparent; color:#dbe3f1; font-weight:700; }
  .debugbtn:active { transform: translateY(1px); }
  .debughint { font-size: 12px; color: #93a0b5; }
  .errorbar { background: linear-gradient(180deg, #ff4d4d, #d92a2a) !important; }
  /* Modal */
  .modal { position: fixed; inset: 0; display:grid; place-items:center; background: rgba(0,0,0,.45); }
  .modal.hidden { display: none; }
  .modal-card { width: min(780px, 94vw); max-height: 80vh; background: rgba(18,23,32,.95); border:1px solid rgba(255,255,255,.12); border-radius:14px; display:flex; flex-direction:column; overflow:hidden; }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.12); }
  .modal-title { font-weight:700; }
  .modal-actions { display:flex; gap:8px; }
  .btn { padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.18); background:#121720; color:#dbe3f1; font-weight:600; }
  .btn-ghost { background: transparent; }
  .modal-body { overflow:auto; }
  #tc-log { margin:0; padding: 12px; font-size: 12px; line-height: 1.4; color: #cfe3ff; }
  `;
  document.head.appendChild(css);
  document.body.appendChild(root);

  // ---------- UI refs ----------
  const fillEl   = root.querySelector('.fill');
  const pctEl    = root.querySelector('.pct');
  const statusEl = root.querySelector('#tc-status');
  const modal    = root.querySelector('#tc-modal');
  const logPre   = root.querySelector('#tc-log');
  const btnToggle= root.querySelector('#tc-debug-toggle');
  const btnCopy  = root.querySelector('#tc-copy');
  const btnClose = root.querySelector('#tc-close');

  // ---------- Error capture ----------
  const errorBag = [];
  const time = () => new Date().toISOString();

  function pushError(kind, data) {
    const entry = { t: time(), kind, ...data };
    errorBag.push(entry);
    renderLog();
  }

  // Capture window errors
  window.addEventListener('error', (e) => {
    pushError('window.error', {
      message: e?.error?.message || e.message || String(e),
      stack: e?.error?.stack || null,
      filename: e?.filename || null,
      lineno: e?.lineno || null,
      colno: e?.colno || null,
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason;
    pushError('unhandledrejection', {
      message: r?.message || String(r),
      stack: r?.stack || null
    });
  });

  // Patch console.error
  const _cerr = console.error;
  console.error = function(...args){
    try {
      pushError('console.error', { message: args.map(a => (a && a.stack) ? a.stack : String(a)).join(' ') });
    } catch {}
    _cerr.apply(console, args);
  };

  function renderLog() {
    const lines = errorBag.map((e, i) => {
      const meta = [];
      if (e.filename) meta.push(`file=${e.filename}`);
      if (e.lineno!=null) meta.push(`line=${e.lineno}`);
      if (e.colno!=null) meta.push(`col=${e.colno}`);
      const head = `[${i+1}] ${e.t}  ${e.kind}${meta.length?` (${meta.join(', ')})`:''}`;
      const body = (e.stack || e.message || '').toString();
      return `${head}\n${body}\n`;
    }).join('\n');
    logPre.textContent = lines || 'No errors captured.';
  }

  // ---------- UI actions ----------
  btnToggle.addEventListener('click', () => { modal.classList.toggle('hidden'); });
  btnClose .addEventListener('click', () => { modal.classList.add('hidden'); });
  btnCopy  .addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(logPre.textContent || ''); btnCopy.textContent = 'Copied'; setTimeout(() => btnCopy.textContent='Copy All', 1200); }
    catch { btnCopy.textContent = 'Copy failed'; setTimeout(() => btnCopy.textContent='Copy All', 1200); }
  });

  // ---------- Progress + status ----------
  const steps = [];
  let current = 0;
  function addStep(label, fn) { steps.push({ label, fn }); }
  function setStatus(text) { statusEl.textContent = text; }
  function setProgress(i, total, failure=false) {
    const pct = Math.floor(((i) / total) * 100);
    fillEl.style.width = pct + '%';
    pctEl.textContent = pct + '%';
    if (failure) fillEl.classList.add('errorbar');
  }

  async function run() {
    const total = steps.length;
    for (current = 0; current < total; current++) {
      const { label, fn } = steps[current];
      setStatus(label);
      setProgress(current, total, false);
      try {
        await fn();
      } catch (e) {
        // Freeze at failure point, paint red, expose modal
        setStatus(label + ' — FAILED');
        setProgress(current, total, true);
        pushError('step.fail', { message: e?.message || String(e), stack: e?.stack || null });
        modal.classList.remove('hidden'); // show immediately on fail
        throw e; // stop chain
      }
    }
    // 100% and fade out
    setProgress(total, total, false);
    setStatus('Ready');
    // Small delay for UX, then remove bootstrap screen
    setTimeout(() => {
      root.style.opacity = '0';
      root.style.transition = 'opacity .25s ease';
      setTimeout(() => { root.remove(); css.remove(); }, 260);
    }, 250);
  }

  // ---------- Preflight plan ----------
  // Keep these generic and independent. If any throws, we stop and show red bar.
  addStep('Checking browser features', async () => {
    if (!('Promise' in window) || !('fetch' in window) || !('Clipboard' in window || navigator.clipboard))
      throw new Error('Missing Promise/fetch/clipboard API');
    const cvs = document.createElement('canvas');
    const gl = cvs.getContext('webgl') || cvs.getContext('experimental-webgl');
    if (!gl) throw new Error('WebGL not available');
  });

  addStep('Verifying import map / three.module.js', async () => {
    // Try dynamic import using bare specifier. If site lacks importmap, this will throw.
    try {
      await import('three');
    } catch (e) {
      // Fall back to a sanity HEAD/GET on the local vendor path to hint at MIME/path issues.
      try {
        const res = await fetch('./vendor/three.module.js', { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error(`vendor/three.module.js HTTP ${res.status}`);
      } catch (e2) {
        pushError('asset.missing', { message: 'vendor/three.module.js not reachable', stack: (e2 && e2.stack) || String(e2) });
      }
      throw new Error('Import map or "three" module failed to resolve');
    }
  });

  addStep('Preloading core vendors (Sky, Terrain shim)', async () => {
    // Import Sky and terrain shim early; both use ESM and should surface syntax/MIME errors here.
    // Note: We do not attach THREE globally; modules will resolve via the import map.
    await import('./vendor/three.sky.js');
    // Optional shim; if you use it later, this ensures MIME/syntax is valid:
    try { await import('./vendor/THREE.Terrain.mjs'); } catch (_) { /* optional; don’t fail the chain */ }
  });

  addStep('Warming shader pipeline', async () => {
    // Light-weight check that renderer can be constructed; we throw it away right after.
    const { WebGLRenderer, SRGBColorSpace, ACESFilmicToneMapping } = await import('three');
    const c = document.createElement('canvas');
    const r = new WebGLRenderer({ canvas: c, antialias: true, alpha: true });
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = ACESFilmicToneMapping;
    r.dispose();
  });

  addStep('Loading application entry', async () => {
    // Your real app entry. Keep this path consistent with your project.
    // If it throws (syntax, runtime), bootstrap will catch & present full details.
    await import('./src/main.js');
  });

  // ---------- Kick it ----------
  run().catch(() => {
    // Already handled visually; keep the bootstrap visible
  });
})();