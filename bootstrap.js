/* TerrainCreator Bootstrap — modern launcher-style gate
   - Frosted glass card over animated backdrop
   - Inline SVG logo + title
   - Progress bar + status
   - Start Program button (enabled after preflight passes)
   - Error capture (window.onerror, unhandledrejection, console.error)
   - Debug modal with full logs + Copy All
   - Loads ./src/main.js only after clicking Start
   - If import fails: bar turns red, modal opens, bootstrap stays on top
   - Sets window.__tcBootstrapActive so app can suppress its own overlay
*/
(() => {
  const onReady = (fn) =>
    (document.readyState === 'loading')
      ? document.addEventListener('DOMContentLoaded', fn, { once: true })
      : fn();

  onReady(() => {
    window.__tcBootstrapActive = true;

    // ---------- UI ----------
    const root = document.createElement('div');
    root.id = 'tc-bootstrap';
    root.innerHTML = `
      <div class="bg">
        <div class="grid"></div>
        <div class="glow"></div>
      </div>

      <div class="card" role="dialog" aria-label="Launcher">
        <div class="brand">
          <div class="logo" aria-hidden="true">
            <!-- Subtle inline SVG mark -->
            <svg viewBox="0 0 64 64" width="42" height="42" fill="none" stroke="currentColor" stroke-width="2">
              <defs>
                <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stop-color="#a0c2ff" stop-opacity="1"/>
                  <stop offset="1" stop-color="#7bd1b8" stop-opacity="1"/>
                </linearGradient>
              </defs>
              <path stroke="url(#g)" d="M4 52 L22 20 L34 36 L44 16 L60 44" />
              <circle cx="22" cy="20" r="3" fill="url(#g)" />
              <circle cx="34" cy="36" r="3" fill="url(#g)" />
              <circle cx="44" cy="16" r="3" fill="url(#g)" />
              <circle cx="60" cy="44" r="3" fill="url(#g)" />
            </svg>
          </div>
          <div class="titles">
            <div class="title">TerrainCreator</div>
            <div class="subtitle">Launcher</div>
          </div>
        </div>

        <div class="bar" aria-hidden="true">
          <div class="fill" style="width:0%">
            <span class="pct">0%</span>
          </div>
        </div>
        <div class="status" id="tc-status" aria-live="polite">Initializing…</div>

        <div class="actions">
          <button id="tc-continue" class="btn primary" disabled>
            Start Program
          </button>
          <button id="tc-debug-toggle" class="btn ghost" aria-label="Show errors">Debug</button>
        </div>
      </div>

      <div class="modal hidden" id="tc-modal" aria-modal="true" role="dialog" aria-label="Bootstrap Debugger">
        <div class="modal-card">
          <div class="modal-head">
            <div class="modal-title">Bootstrap Debugger</div>
            <div class="modal-actions">
              <button id="tc-copy" class="btn">Copy All</button>
              <button id="tc-close" class="btn ghost">Close</button>
            </div>
          </div>
          <div class="modal-body">
            <pre id="tc-log">No errors captured.</pre>
          </div>
        </div>
      </div>
    `;

    const css = document.createElement('style');
    css.textContent = `
      :root{
        --bg0:#0c0f13;
        --card-bg: rgba(22,24,28,0.65);
        --card-stroke: rgba(255,255,255,0.08);
        --text:#e9eef5;
        --muted:#9fb0c4;
        --accent1:#78b1ff;
        --accent2:#59d3b0;
        --bar-track: rgba(255,255,255,0.08);
        --bar-fill1:#78b1ff;
        --bar-fill2:#59d3b0;
        --error1:#ff6767;
        --error2:#d53a3a;
        --btn-bg: #2a2f36;
        --btn-fg: #e9eef5;
        --btn-ghost: transparent;
        --btn-ghost-stroke: rgba(255,255,255,0.16);
        --radius: 16px;
        --shadow: 0 10px 30px rgba(0,0,0,0.35);
      }
      #tc-bootstrap, #tc-bootstrap * { box-sizing:border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }
      #tc-bootstrap {
        position: fixed; inset: 0; z-index: 2147483647;
        display: grid; place-items: center; color: var(--text);
        background: var(--bg0);
        isolation: isolate;
      }
      /* Backdrop layers */
      #tc-bootstrap .bg { position:absolute; inset:0; overflow:hidden; }
      #tc-bootstrap .grid {
        position:absolute; inset:-40% -40% -40% -40%;
        background:
          radial-gradient(60% 60% at 80% 10%, rgba(121,178,255,0.16), transparent 60%),
          radial-gradient(50% 50% at 10% 80%, rgba(89,211,176,0.18), transparent 60%),
          linear-gradient(transparent 24px, rgba(255,255,255,0.06) 25px, transparent 26px),
          linear-gradient(90deg, transparent 24px, rgba(255,255,255,0.06) 25px, transparent 26px);
        background-size: 100% 100%, 100% 100%, 50px 50px, 50px 50px;
        filter: blur(8px);
        transform: rotate(2deg) scale(1.1);
        animation: pan 22s linear infinite;
      }
      @keyframes pan { from { transform: rotate(2deg) scale(1.1) translateX(0); } to { transform: rotate(2deg) scale(1.1) translateX(-50px); } }
      #tc-bootstrap .glow{
        position:absolute; inset:0;
        background: radial-gradient(40% 30% at 70% 20%, rgba(120,177,255,0.25), transparent 70%),
                    radial-gradient(30% 30% at 20% 70%, rgba(89,211,176,0.22), transparent 70%);
        filter: blur(8px);
        opacity:.7;
      }

      /* Card */
      #tc-bootstrap .card{
        position: relative;
        width: min(560px, 92vw);
        border-radius: var(--radius);
        border: 1px solid var(--card-stroke);
        background: var(--card-bg);
        backdrop-filter: blur(14px) saturate(1.1);
        box-shadow: var(--shadow);
        padding: 18px 18px 16px;
      }
      #tc-bootstrap .brand{
        display:flex; align-items:center; gap:12px; margin-bottom:12px;
      }
      #tc-bootstrap .logo{
        width:42px; height:42px; display:grid; place-items:center;
        color:#cbe0ff;
        filter: drop-shadow(0 1px 6px rgba(120,177,255,0.25));
      }
      #tc-bootstrap .titles .title{ font-size:20px; font-weight:800; letter-spacing:.2px; }
      #tc-bootstrap .titles .subtitle{ font-size:12px; color: var(--muted); margin-top:2px; }

      /* Bar */
      #tc-bootstrap .bar{
        width:100%; height:16px; border-radius:10px; background: var(--bar-track);
        border:1px solid rgba(255,255,255,0.12); overflow:hidden; position:relative;
      }
      #tc-bootstrap .fill{
        height:100%;
        background: linear-gradient(90deg, var(--bar-fill1), var(--bar-fill2));
        display:flex; align-items:center; justify-content:flex-end;
        transition: width .25s ease;
      }
      #tc-bootstrap .fill .pct{
        font-size:11px; padding-right:6px; color:#0c0f13; font-weight:800;
        text-shadow: 0 1px 0 rgba(255,255,255,0.6);
      }
      #tc-bootstrap .fill.errorbar{
        background: linear-gradient(90deg, var(--error1), var(--error2));
      }
      #tc-bootstrap .status{
        margin-top:10px; font-family: ui-monospace, Menlo, Consolas, monospace;
        font-size:13px; color: var(--muted);
        min-height: 18px;
      }

      /* Actions */
      #tc-bootstrap .actions{
        margin-top:14px; display:flex; gap:8px; justify-content:flex-end;
      }
      #tc-bootstrap .btn{
        padding:10px 14px; border-radius:10px;
        border:1px solid var(--btn-ghost-stroke);
        background: var(--btn-bg); color: var(--btn-fg);
        font-weight:700; cursor:pointer;
      }
      #tc-bootstrap .btn.primary{
        border-color: transparent;
        background: linear-gradient(180deg, var(--bar-fill1), var(--bar-fill2));
        color:#0b0f14; text-shadow: 0 1px 0 rgba(255,255,255,.45);
      }
      #tc-bootstrap .btn[disabled]{ opacity:.55; filter:grayscale(.15); cursor:not-allowed; }
      #tc-bootstrap .btn.ghost{
        background: var(--btn-ghost);
        color: var(--text);
      }

      /* Modal */
      #tc-bootstrap .modal{ position:fixed; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.45); }
      #tc-bootstrap .modal.hidden{ display:none; }
      #tc-bootstrap .modal-card{
        width:min(820px, 94vw); max-height:80vh; background: rgba(16,19,24,.96);
        border:1px solid rgba(255,255,255,.10); border-radius:14px; display:flex; flex-direction:column; overflow:hidden;
        box-shadow: var(--shadow);
      }
      #tc-bootstrap .modal-head{
        display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.10);
      }
      #tc-bootstrap .modal-title{ font-weight:800; }
      #tc-bootstrap .modal-actions{ display:flex; gap:8px; }
      #tc-bootstrap .modal-body{ overflow:auto; background:#0e1217; }
      #tc-bootstrap #tc-log{ margin:0; padding:12px; font-size:12px; line-height:1.4; color:#cfe3ff; white-space:pre-wrap; }
    `;
    document.head.appendChild(css);
    document.body.appendChild(root);

    // ---------- Refs ----------
    const fillEl = root.querySelector('.fill');
    const pctEl = root.querySelector('.pct');
    const statusEl = root.querySelector('#tc-status');
    const btnContinue = root.querySelector('#tc-continue');
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

    // Keyboard: Enter starts when enabled
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !btnContinue.disabled) {
        e.preventDefault();
        btnContinue.click();
      }
    });

    // ---------- Steps (vendor-free) ----------
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
        pushError('feature.warn', { message: 'Clipboard API not available; Copy All may fail' });
      }
    });

    addStep('Checking application entry file', async () => {
      try {
        const res = await fetch('./src/main.js', { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error(`./src/main.js HTTP ${res.status}`);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('javascript') && !ct.includes('text/plain')) {
          pushError('mime.warn', { message: `Unexpected content-type for ./src/main.js: ${ct}` });
        }
      } catch (e) {
        pushError('asset.warn', { step: 'Checking application entry file', message: e?.message || String(e) });
      }
    });

    // ---------- Runner ----------
    (async function runPreflight() {
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
          modal.classList.remove('hidden');
          return; // stop here; don't enable Start
        }
      }
      setProgress(total, total, false);
      setStatus('Preflight complete');
      btnContinue.disabled = false;
    })();

    // ---------- Gated launch ----------
    btnContinue.addEventListener('click', async () => {
      btnContinue.disabled = true;
      setStatus('Starting…');
      try {
        await import('./src/main.js');
        // success → fade out
        setStatus('Ready');
        setTimeout(() => {
          root.style.opacity = '0';
          root.style.transition = 'opacity .28s ease';
          setTimeout(() => {
            window.__tcBootstrapActive = false;
            root.remove(); css.remove();
          }, 300);
        }, 150);
      } catch (e) {
        // keep bootstrap up
        fillEl.classList.add('errorbar');
        setStatus('App failed to launch');
        pushError('app.import.fail', { message: e?.message || String(e), stack: e?.stack || null });
        modal.classList.remove('hidden');
        btnContinue.disabled = false; // allow retry
      }
    });
  });
})();
