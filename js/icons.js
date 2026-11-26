const P = {
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  save: `<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>`,
  undo: `<path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-9.4L3 7"/>`,
  redo: `<path d="M21 7v6h-6"/><path d="M20.5 13a9 9 0 1 1-2.1-9.4L21 7"/>`,
  play: `<path d="M6 4l14 8-14 8V4z"/>`,
  stop: `<rect x="6" y="6" width="12" height="12" rx="1"/>`,
  monitor: `<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  trash: `<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>`,
  copy: `<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
  eye: `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`,
  eyeOff: `<path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 4.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3.2"/><path d="M2 2l20 20"/>`,
  close: `<path d="M18 6L6 18M6 6l12 12"/>`,
  chevronUp: `<path d="M18 15l-6-6-6 6"/>`,
  chevronDown: `<path d="M6 9l6 6 6-6"/>`,
  grid: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`,
  zoomIn: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>`,
  zoomOut: `<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>`,
  home: `<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>`,
  button: `<rect x="3" y="7" width="18" height="10" rx="3"/><path d="M8 12h8"/>`,
  text: `<path d="M5 6V4h14v2M12 4v16M9 20h6"/>`,
  image: `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>`,
  panel: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>`,
  progress: `<rect x="2" y="9" width="20" height="6" rx="3"/><path d="M2 12h11"/>`,
  counter: `<path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18"/>`,
  upgrade: `<circle cx="12" cy="12" r="9"/><path d="M12 16V8M8 12l4-4 4 4"/>`,
  folder: `<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>`,
  layers: `<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/>`,
  code: `<path d="M8 6l-5 6 5 6M16 6l5 6-5 6"/>`,
  variable: `<path d="M4 4c2 0 3 1 3 3v3c0 2 1 2 2 2-1 0-2 0-2 2v3c0 2-1 3-3 3"/><path d="M20 4c-2 0-3 1-3 3v3c0 2-1 2-2 2 1 0 2 0 2 2v3c0 2 1 3 3 3"/>`,
  terminal: `<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 9l3 3-3 3M12 15h5"/>`,
  refresh: `<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>`,
  upload: `<path d="M12 16V4M7 9l5-5 5 5"/><path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/>`,
  arrowUp: `<path d="M12 19V5M6 11l6-6 6 6"/>`,
  arrowDown: `<path d="M12 5v14M6 13l6 6 6-6"/>`,
  alert: `<path d="M12 3l9 16H3l9-16z"/><path d="M12 9v5M12 17v.01"/>`,
  check: `<path d="M20 6L9 17l-5-5"/>`,
  edit: `<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>`,
  shape: `<circle cx="8" cy="8" r="4.5"/><rect x="12.5" y="12.5" width="8.5" height="8.5" rx="1"/><path d="M4.5 20.5L8 14l3.5 6.5z"/>`,
  input: `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10v4M10 12h8"/>`,
  slider: `<path d="M4 8h16M4 16h16"/><circle cx="9" cy="8" r="2.2"/><circle cx="15" cy="16" r="2.2"/>`,
  toggle: `<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16.5" cy="12" r="2.8"/>`,
  timer: `<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>`,
};

export function icon(name, size = 16) {
  const path = P[name] || '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export function iconEl(name, size = 16) {
  const wrap = document.createElement('span');
  wrap.style.display = 'flex';
  wrap.innerHTML = icon(name, size);
  return wrap.firstElementChild;
}