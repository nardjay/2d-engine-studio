/**
 * Standalone HTML export: bundles the project JSON + a minified runtime
 * (render.js + runtime.js + model/util deps as ES modules via importmap is not
 * possible offline, so we inline the actual source files fetched at export time).
 */
async function fetchEngineSources() {
  const files = { util: 'js/util.js', render: 'js/render.js', model: 'js/model.js', luac: 'js/runtime/luac.js', runtime: 'js/runtime/runtime.js' };
  const out = {};
  for (const [k, path] of Object.entries(files)) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Could not read ' + path + ' (' + res.status + ')');
    out[k] = stripModuleSyntax(await res.text());
  }
  return out;
}

function stripModuleSyntax(src) {
  return src
    .replace(/^import\s+[^;]+;\s*$/gm, '')   // our imports are always single-line
    .replace(/^export\s+(default\s+)?/gm, '')
    .replace(/^\/\*[\s\S]*?\*\//gm, '')        // block comments that START at column 0 (jsdoc headers) — never inside template strings
    .replace(/^[ \t]+$/gm, '')                  // whitespace-only lines
    .replace(/\n{3,}/g, '\n');                  // collapse blank runs
}

// minimal DOM helper used by runtime.js (normally from ui.js)
const EL_SHIM = `
function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k === 'style') n.setAttribute('style', v);
    else if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const c of [].concat(children || [])) if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}
`;

export async function exportProjectHTML(project) {
  const sources = await fetchEngineSources();
  const data = JSON.stringify(stripForExport(project)).replace(/</g, '\\u003c');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(project.name)}</title>
<style>
${EXPORT_CSS}
</style>
</head>
<body>
<div id="game-root"></div>
<div id="tap-to-start">▶ ${escapeHTML(project.name)} — click to start</div>
<script>
"use strict";
/* ============ inlined engine (2D Engine Studio export) ============ */
${sources.util}
${sources.render}
${sources.model}
${EL_SHIM}
${sources.luac}
${sources.runtime}
/* ============ game data ============ */
const PROJECT = ${data};
/* ============ boot ============ */
(function boot() {
  const overlay = document.getElementById('tap-to-start');
  const root = document.getElementById('game-root');
  function start() {
    overlay.remove();
    const normalized = normalizeProject(PROJECT);
    const runtime = new GameRuntime(normalized, {
      onError: err => console.error('[game]', err.message || err),
    });
    function fit() {
      const scale = Math.min(1, (window.innerWidth - 16) / normalized.settings.width, (window.innerHeight - 16) / normalized.settings.height);
      root.style.transform = 'scale(' + scale + ')';
    }
    window.addEventListener('resize', fit);
    fit();
    runtime.mount(root);
  }
  overlay.addEventListener('click', start, { once: true });
  overlay.addEventListener('touchstart', start, { once: true });
})();
</script>
</body>
</html>
`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (project.name || 'game').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.html';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function stripForExport(project) {
  const clone = JSON.parse(JSON.stringify(project));
  for (const o of clone.objects || []) {
    for (const s of o.codeScripts || []) { delete s._broken; }
  }
  return clone;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const EXPORT_CSS = `
  html,body{margin:0;height:100%;background:#0b0e14;display:flex;align-items:center;justify-content:center;overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  #game-root{transform-origin:center center}
  #tap-to-start{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#dde4f0;
    font-size:20px;background:#0b0e14;cursor:pointer}
  .rt-stage{position:relative;overflow:hidden}
  .rt-clickable{cursor:pointer}
  .ui-object{position:absolute;box-sizing:border-box;user-select:none}
  .ui-object-button{display:flex;align-items:center;justify-content:center;text-align:center;border-radius:8px;
    border:1px solid #3a4a66;background:#2b3b5e;color:#fff;font-weight:600;padding:6px;transition:transform .06s}
  .ui-object-button.pressed{transform:scale(.96)}
  .ui-object-text{display:flex;align-items:center;color:#fff;padding:2px 4px;word-break:break-word}
  .ui-object-image{background-size:cover;background-position:center;border-radius:4px}
  .ui-object-panel{background:#1c2433;border:1px solid #33405a;border-radius:6px}
  .ui-object-shape{border-radius:0}
  .ui-object-progressbar{background:#1c2433;border:1px solid #33405a;border-radius:6px;overflow:hidden}
  .ui-object-progressbar .pb-fill{height:100%;background:#4f8cff;transition:width .15s}
  .ui-object-counter{display:flex;align-items:center;color:#fff;font-variant-numeric:tabular-nums;padding:2px 4px}
  .ui-object-timer{display:flex;align-items:center;justify-content:center;color:#fff;font-variant-numeric:tabular-nums;
    background:#1c2433;border:1px solid #33405a;border-radius:6px}
  .ui-object-input input{width:100%;box-sizing:border-box;background:#11151d;color:#fff;border:1px solid #33405a;border-radius:5px;padding:6px 8px;font-size:inherit}
  .ui-object-slider input{width:100%;accent-color:#4f8cff}
  .ui-object-toggle{display:flex;align-items:center;gap:8px;color:#fff}
  .ui-object-toggle .tg-box{width:34px;height:18px;border-radius:9px;background:#33405a;position:relative;flex:none}
  .ui-object-toggle .tg-box.on{background:#4f8cff}
  .ui-object-toggle .tg-box::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .12s}
  .ui-object-toggle .tg-box.on::after{left:18px}
`;
