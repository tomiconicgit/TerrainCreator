/* TerrainCreator Bootstrap — three-free
   - Self-contained splash UI (title, % bar, status)
   - Captures window errors, unhandled rejections, console.error
   - Non-fatal preflight (no vendor imports)
   - Loads ./src/main.js last; any failures are surfaced in the modal
*/

(() => {
  const onReady = (fn) =>
    (document.readyState === 'loading')
      ? document.addEventListener('DOMContentLoaded', fn, { once: true })
      : fn();

  onReady(() => {
    // ---------- UI ----------
    const root = document.createElement('div');
    root.id = 'tc-bootstrap';
    root.innerHTML = `
      <div class="wrap">
        <div class="brand">TerrainCreator</div>
        <div class="by">by Tom Iconic</div>
        <div class="bar"><div class="fill" style="width:0%"><span class="pct">0%</span></div></div>
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
      #tc-bootstrap { position: fixed; inset: 0; background: #0c0f14; color: #dbe3f1;
        display: grid; place-items: center; z-index: 999999;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      #tc-bootstrap .wrap { width: min(520px, 92vw); text-align: center; }
      .brand { font-size: 28px; font-weight: 800; letter-spacing: .3px; }
      .by { opacity: .7; margin-top: 2px; margin-bottom: 18px; }
      .bar { width: 100%; height: 18px; border-radius: 10px; background: #121720; border: 1px solid rgba(255,255,255,0.12); overflow: hidden; }
      .fill { height: 100%; background: linear-gradient(180deg, #00adff, #007ee0); display:flex; align-items:center; justify-content:flex-end; position:relative; transition: width .25s ease; }
      .fill .pct { font-size: 11px; padding-right: 6px; color: white; text-shadow: 0 1px 0 rgba(0,0,0,.3); }
      .status { margin-top: 12px; opacity: .9; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; white-space: pre-line; }
      .debugline { margin-top: 12px; display:flex; align-items:center; justify-content:center; gap:8px; opacity:.85; }
      .debugbtn { width:26px; height:26px; border-radius: 999px; border:1px solid rgba(255,255,255,.2); background: transparent; color:#dbe3f1; font-weight:700; }
      .debugbtn:active { transform: translateY(1px); }
      .debughint { font-size: 12px; color: #93a0b5; }
      .errorbar { background: linear-gradient(180deg, #ff4d4d, #d92a2a) !important; }
      .modal { position: fixed; inset: 0; display:grid; place-items:center; background: rgba(0,0,0,.45); }
      .modal.hidden { display: none; }
      .modal-card { width: min(780px, 94vw); max-height: 80vh; background: rgba(18,23,32,.95);
        border:1px solid rgba(255,255,255,.12); border-radius:14px; display:flex; flex-direction:column; overflow:hidden; }
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

    // ---------- Refs ----------
    const fillEl = root.querySelector('.fill');
    const pctEl = root.querySelector('.pct');
    const statusEl = root.querySelector('#tc-status');
    const modal = root.querySelector('#tc-modal');
    const logPre = root.querySelector('#tc-log');
    const btnToggle = root.querySelector('#tc-debug-toggle');
    const btnCopy = root.querySelector('#tc-copy');
    const btnClose = root.querySelector('#tc-close');

    // ---------- Error capture ----------
    const errorBag = [];
    const nowISO = () => new Date().toISOString();
    const pushError = (kind, data) => {
      errorBag.push({ t: nowISO(), kind, ...data });
      renderLog();
    };

    window.addEventListener('error', (e) => {
      pushError('window.error', {
        message: e?.error?.message || e.message || String(e),
        stack: e?.error?.stack || null,
        filename: e?.filename || null,
        lineno: e?.lineno || null,
        colno: e?.colno || null,
      });
    });

    window.addEventListener('unhandledrejection', (e) => {
      const r = e?.reason;
      pushError('unhandledrejection', {
        message: r?.message || String(r),
        stack: r?.stack || null
      });
    });

    const _cerr = console.error;
    console.error = function (...args) {
      try {
        pushError('console.error', { message: args.map(a => (a && a.stack) ? a.stack : String(a)).join(' ') });
      } catch {}
      _cerr.apply(console, args);
    };

    const renderLog = () => {
      logPre.textContent = errorBag.map((e, i) => {
        const meta = [];
        if (e.step) meta.push(`step="${e.step}"`);
        if (e.filename) meta.push(`file=${e.filename}`);
        if (e.lineno != null) meta.push(`line=${e.lineno}`);
        if (e.colno != null) meta.push(`col=${e.colno}`);
        const head = `[${i + 1}] ${e.t}  ${e.kind}${meta.length ? ` (${meta.join(', ')})` : ''}`;
        const body = (e.stack || e.message || '').toString();
        return `${head}\n${body}\n`;
      }).join('\n') || 'No errors captured.';
    };

    // ---------- UI actions ----------
    btnToggle.addEventListener('click', () => modal.classList.toggle('hidden'));
    btnClose.addEventListener('click', () => modal.classList.add('hidden'));
    btnCopy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(logPre.textContent || ''); btnCopy.textContent = 'Copied'; }
      catch { btnCopy.textContent = 'Copy failed'; }
      setTimeout(() => (btnCopy.textContent = 'Copy All'), 1200);
    });

    // ---------- Steps (no vendor imports) ----------
    const steps = [];
    const addStep = (label, fn) => steps.push({ label, fn });
    const setStatus = (t) => (statusEl.textContent = t);
    const setProgress = (i, total, fail = false) => {
      const pct = Math.floor((i / total) * 100);
      fillEl.style.width = pct + '%';
      pctEl.textContent = pct + '%';
      if (fail) fillEl.classList.add('errorbar');
    };

    addStep('Checking browser features', async () => {
      if (!('Promise' in window) || !('fetch' in window)) {
        throw new Error('Missing Promise or fetch API');
      }
      const cvs = document.createElement('canvas');
      const gl = cvs.getContext('webgl') || cvs.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL not available');
      if (!navigator.clipboard) {
        // Not fatal; just warn
        pushError('feature.warn', { message: 'Clipboard API not available; Copy All may fail' });
      }
    });

    addStep('Checking application entry file', async () => {
      // Non-fatal HEAD/GET to ensure ./src/main.js is reachable (not 404/HTML).
      try {
        const res = await fetch('./src/main.js', { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error(`./src/main.js HTTP ${res.status}`);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('javascript') && !ct.includes('text/plain')) {
          pushError('mime.warn', { message: `Unexpected content-type for ./src/main.js: ${ct}` });
        }
      } catch (e) {
        // Warn but continue; import() below will surface details if it truly fails.
        pushError('asset.warn', { step: 'Checking application entry file', message: e?.message || String(e) });
      }
    });

    addStep('Loading application', async () => {
      // Hand off to the app. Any runtime/syntax errors will be captured by the bootstrap listeners.
      await import('./src/main.js');
    });

    // ---------- Runner ----------
    (async function run() {
      const total = steps.length;
      for (let i = 0; i < total; i++) {
        const { label, fn } = steps[i];
        setStatus(label);
        setProgress(i, total, false);
        try {
          await fn();
        } catch (e) {
          setStatus(label + ' — FAILED');
          setProgress(i, total, true);
          pushError('step.fail', { step: label, message: e?.message || String(e), stack: e?.stack || null });
          modal.classList.remove('hidden'); // stay up and show errors
          return;
        }
      }
      // Success → 100% and fade out
      setProgress(total, total, false);
      setStatus('Ready');
      setTimeout(() => {
        root.style.opacity = '0';
        root.style.transition = 'opacity .25s ease';
        setTimeout(() => { root.remove(); css.remove(); }, 260);
      }, 250);
    })();
  });
})();