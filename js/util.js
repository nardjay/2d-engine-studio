export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

export function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch (e) { /* fallback below */ }
  }
  return JSON.parse(JSON.stringify(value));
}

export function debounce(fn, ms = 300) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
  wrapped.cancel = () => { clearTimeout(timer); timer = null; };
  wrapped.flush = (...args) => { clearTimeout(timer); timer = null; fn(...args); };
  return wrapped;
}

export function toNumber(value, fallback = 0) {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' +
         d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Replaces {{VariableName}} tokens in a string with the resolved value.
 * Unknown names are left untouched so the designer can see the mistake.
 */
export function interpolate(text, getVar) {
  if (typeof text !== 'string' || !text) return '';
  return text.replace(/\{\{\s*([A-Za-z0-9_ ]+?)\s*\}\}/g, (match, name) => {
    const value = getVar(name.trim());
    return value === undefined || value === null ? match : String(value);
  });
}