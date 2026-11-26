import { icon } from './icons.js';

/** Tiny hyperscript helper. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : value);
  }
  appendChildren(node, children);
  return node;
}

export function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(node, child);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function btn(label, { iconName, onClick, className = 'btn', title } = {}) {
  const node = el('button', { class: className, title: title || label || '' });
  if (iconName) node.innerHTML = icon(iconName, 15);
  if (label) appendChildren(node, [el('span', { text: label })]);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

export function iconBtn(iconName, title, onClick, className = 'btn icon-only') {
  const node = el('button', { class: className, title });
  node.innerHTML = icon(iconName, 15);
  node.addEventListener('click', onClick);
  return node;
}

/* ---------------- toasts ---------------- */
export function toast(message, type = 'info', duration = 2600) {
  const root = document.getElementById('toast-root');
  const node = el('div', { class: `toast ${type}`, text: message });
  root.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .2s';
    setTimeout(() => node.remove(), 220);
  }, duration);
}

/* ---------------- modals ---------------- */
export function openModal({ title, content, actions = [], width }) {
  return new Promise(resolve => {
    const root = document.getElementById('modal-root');
    const overlay = el('div', { class: 'modal-overlay' });
    const modal = el('div', { class: 'modal' });
    if (width) modal.style.maxWidth = width + 'px';

    const close = value => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = e => { if (e.key === 'Escape') close(null); };

    modal.appendChild(el('div', { class: 'modal-head', text: title }));
    const body = el('div', { class: 'modal-body' });
    if (typeof content === 'string') body.innerHTML = content;
    else if (content instanceof Node) body.appendChild(content);
    modal.appendChild(body);

    const foot = el('div', { class: 'modal-foot' });
    for (const action of actions) {
      const b = el('button', {
        class: 'btn' + (action.primary ? ' primary' : '') + (action.danger ? ' danger' : ''),
        text: action.label,
        onclick: () => close(action.value),
      });
      foot.appendChild(b);
    }
    modal.appendChild(foot);
    overlay.appendChild(modal);
    root.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(null); });
    setTimeout(() => body.querySelector('input,textarea')?.focus(), 30);
  });
}

export async function promptDialog(title, label, defaultValue = '') {
  const input = el('input', { class: 'input', value: defaultValue });
  const content = el('div', {}, [el('label', { text: label }), input]);
  const result = await openModal({
    title, content,
    actions: [
      { label: 'Cancel', value: null },
      { label: 'Confirm', value: '__ok__', primary: true },
    ],
  });
  if (result !== '__ok__') return null;
  return input.value.trim();
}

export async function confirmDialog(title, message, confirmLabel = 'Delete') {
  const result = await openModal({
    title,
    content: el('div', { class: 'muted', text: message, style: { lineHeight: '1.6' } }),
    actions: [
      { label: 'Cancel', value: false },
      { label: confirmLabel, value: true, danger: true, primary: true },
    ],
  });
  return result === true;
}

/**
 * Floating right-click menu. items: [{ label, onClick, danger?, disabled? }]
 * or '-' for a separator. Closes on outside click / Escape / scroll.
 */
export function contextMenu(items, x, y) {
  document.querySelector('.ctx-menu')?.remove();
  const menu = el('div', { class: 'ctx-menu', role: 'menu' });
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', onDoc, true);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', close);
    window.removeEventListener('scroll', close, true);
  };
  const onDoc = e => { if (!menu.contains(e.target)) close(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  for (const it of items) {
    if (it === '-') { menu.appendChild(el('div', { class: 'ctx-sep' })); continue; }
    const b = el('button', {
      class: 'ctx-item' + (it.danger ? ' danger' : ''),
      role: 'menuitem', text: it.label, disabled: !!it.disabled,
    });
    b.addEventListener('click', () => { close(); it.onClick(); });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 6)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 6)) + 'px';
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, true);
  });
}