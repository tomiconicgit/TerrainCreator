// file: src/utils.js

export function showErrorOverlay(msg, err) {
    if (window.__tcBootstrapActive) {
      try { console.error('App error (suppressed overlay):', msg, err); } catch (_) {}
      return;
    }
    const pre = (err && (err.stack || err.message)) ? `\n\n${(err.stack || err.message)}` : '';
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(10,12,16,.94);' +
      'color:#fff;font-family:ui-monospace,Menlo,monospace;padding:18px;overflow:auto;white-space:pre-wrap';
    el.textContent = `App error: ${msg}${pre}`;
    document.body.appendChild(el);
}

export function dispose(obj) {
    if (!obj) return;
    if (obj.traverse) {
        obj.traverse((o) => {
            if (o.isMesh) {
                if (o.geometry) o.geometry.dispose();
                if (Array.isArray(o.material)) {
                    o.material.forEach(m => m.dispose());
                } else if (o.material) {
                    o.material.dispose();
                }
            }
        });
    }
    if (obj.parent) obj.parent.remove(obj);
}
