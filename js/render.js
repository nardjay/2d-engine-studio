import { interpolate, formatNumber, toNumber } from './util.js';

/** Builds the variable-resolution context shared by editor preview & runtime. */
export function createRenderContext(project, { values = null } = {}) {
  const byId = new Map(project.variables.map(v => [v.id, v]));
  const byName = new Map(project.variables.map(v => [v.name, v]));

  const getVarById = id => {
    if (values && values.has(id)) return values.get(id);
    const v = byId.get(id);
    return v ? v.value : 0;
  };
  const getVarByName = name => {
    const v = byName.get(name);
    return v ? getVarById(v.id) : undefined;
  };
  return { project, getVarById, getVarByName };
}

function applyBox(node, obj) {
  node.style.left = obj.x + 'px';
  node.style.top = obj.y + 'px';
  node.style.width = obj.w + 'px';
  node.style.height = obj.h + 'px';
  node.style.zIndex = String(1 + (obj.layer || 0));
}

/** Shared transform builder — supports the hidden 3D fields (z, rotX, rotY). */
export function objTransform(obj) {
  const z = obj.z || 0, rx = obj.rotX || 0, ry = obj.rotY || 0, r = obj.rotation || 0;
  if (!z && !rx && !ry && !r) return '';
  let t = '';
  if (z) t += `translateZ(${z}px) `;
  if (rx) t += `rotateX(${rx}deg) `;
  if (ry) t += `rotateY(${ry}deg) `;
  if (r) t += `rotate(${r}deg)`;
  return t.trim();
}

function applyVisual(node, obj) {
  if (obj.bg && obj.bg !== 'transparent') node.style.background = obj.bg;
  const bw = obj.borderWidth || 0;
  if (bw > 0) node.style.border = `${bw}px solid ${obj.borderColor || '#000'}`;
  if (obj.radius) node.style.borderRadius = obj.radius + 'px';
  node.style.opacity = String(obj.opacity ?? 1);
  if (obj.blend) node.style.mixBlendMode = obj.blend;
  if (obj.shadow) node.style.boxShadow = obj.shadow;
  if (obj.cursor) node.style.cursor = obj.cursor;
  node.style.transform = objTransform(obj);
  if (obj.z || obj.rotX || obj.rotY) node.style.transformStyle = 'preserve-3d';
  if (!obj.visible) node.style.visibility = 'hidden';
}

const FONT_FAMILIES = {
  arcade: '"Press Start 2P", monospace',
  rounded: '"Comic Sans MS", "Trebuchet MS", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"Courier New", monospace',
  impact: 'Impact, Haettenschweiler, sans-serif',
  cursive: '"Segoe Script", "Brush Script MT", cursive',
};

function applyFont(label, obj) {
  label.style.fontWeight = obj.bold ? '700' : '';
  label.style.fontStyle = obj.italic ? 'italic' : '';
  if (obj.fontFamily && FONT_FAMILIES[obj.fontFamily]) label.style.fontFamily = FONT_FAMILIES[obj.fontFamily];
  const dec = [obj.underline && 'underline', obj.strike && 'line-through'].filter(Boolean).join(' ');
  if (dec) label.style.textDecoration = dec;
  if (obj.letterSpacing) label.style.letterSpacing = obj.letterSpacing + 'px';
  if (obj.lineSpacing) label.style.lineHeight = obj.lineSpacing;
  if (obj.strokeWidth) label.style.webkitTextStroke = `${obj.strokeWidth}px ${obj.strokeColor || '#000'}`;
  if (obj.shadow) label.style.textShadow = obj.shadowColor ? `2px 3px 0 ${obj.shadowColor}` : '2px 3px 6px rgba(0,0,0,.75)';
}

function justifyFor(align) {
  if (align === 'left') return 'flex-start';
  if (align === 'right') return 'flex-end';
  return 'center';
}

function renderContent(node, obj, ctx, options = {}) {
  if (obj.type === 'upgrade') obj = Object.assign({}, obj, { type: 'button' }); // legacy alias
  switch (obj.type) {
    case 'button': {
      const label = document.createElement('span');
      label.className = 'up-label';
      label.style.fontSize = (obj.fontSize || 16) + 'px';
      label.style.color = obj.color || '#fff';
      label.style.textAlign = obj.align || 'center';
      applyFont(label, obj);
      label.textContent = interpolate(obj.text || '', ctx.getVarByName);
      node.appendChild(label);

      // Optional purchase mode: a cost variable turns any button into a buy/upgrade button.
      if (obj.costVariableId) {
        const have = toNumber(ctx.getVarById(obj.costVariableId), 0);
        const cost = toNumber(obj.costAmount, 0);
        const costLine = document.createElement('span');
        costLine.className = 'up-cost';
        costLine.style.color = obj.color || '#fff';
        costLine.textContent = `Cost: ${formatNumber(cost)} (${formatNumber(have)})`;
        node.append(costLine);
        if (have < cost) node.classList.add('rt-disabled');
      }
      break;
    }
    case 'text': {
      node.style.justifyContent = justifyFor(obj.align);
      node.style.fontSize = (obj.fontSize || 16) + 'px';
      node.style.color = obj.color || '#fff';
      node.style.textAlign = obj.align || 'left';
      applyFont(node, obj);
      node.textContent = interpolate(obj.text || '', ctx.getVarByName);
      break;
    }
    case 'image': {
      const asset = ctx.project.assets.find(a => a.id === obj.assetId);
      if (asset) {
        const img = document.createElement('img');
        img.src = asset.dataUrl;
        img.alt = asset.name;
        img.style.objectFit = obj.fit || 'contain';
        img.draggable = false;
        node.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'img-missing';
        placeholder.textContent = 'No image';
        node.appendChild(placeholder);
      }
      break;
    }
    case 'panel':
      break;
    case 'progressbar': {
      const current = toNumber(ctx.getVarById(obj.valueVarId), 0);
      const max = obj.maxVarId
        ? Math.max(1, toNumber(ctx.getVarById(obj.maxVarId), 1))
        : Math.max(1, toNumber(obj.maxValue, 100));
      const pct = Math.max(0, Math.min(100, (current / max) * 100));
      const fill = document.createElement('div');
      fill.className = 'pb-fill';
      fill.style.width = pct + '%';
      fill.style.background = obj.fillColor || '#4f8cff';
      node.appendChild(fill);
      break;
    }
    case 'counter': {
      const value = ctx.getVarById(obj.variableId);
      node.style.justifyContent = justifyFor(obj.align);
      node.style.fontSize = (obj.fontSize || 24) + 'px';
      node.style.color = obj.color || '#fff';
      node.style.textAlign = obj.align || 'left';
      applyFont(node, obj);
      const display = `${obj.prefix || ''}${formatNumber(value)}${obj.suffix || ''}`;
      // setText() on a counter replaces the entire readout (useful for "GAME OVER" messages)
      node.textContent = obj.text ? interpolate(obj.text, ctx.getVarByName) : display;
      break;
    }
    case 'shape': {
      if (obj.kind === 'ellipse') node.style.borderRadius = '50%';
      else if (obj.kind === 'triangle') node.style.clipPath = 'polygon(50% 0%, 100% 100%, 0% 100%)';
      else if (obj.kind === 'diamond') node.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
      else if (obj.kind === 'pentagon') node.style.clipPath = 'polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)';
      else if (obj.kind === 'hexagon') node.style.clipPath = 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)';
      else if (obj.kind === 'star') node.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
      else if (obj.kind === 'arrow') node.style.clipPath = 'polygon(0% 35%, 60% 35%, 60% 0%, 100% 50%, 60% 100%, 60% 65%, 0% 65%)';
      break;
    }
    case 'input': {
      node.style.justifyContent = 'center';
      const input = document.createElement('input');
      input.className = 'rt-input';
      input.type = 'text';
      input.placeholder = obj.placeholder || '';
      input.style.fontSize = (obj.fontSize || 14) + 'px';
      input.style.color = obj.color || '#fff';
      const bound = ctx.getVarById(obj.variableId);
      input.value = bound === undefined || bound === null ? '' : String(bound);
      if (!options.interactive) input.disabled = true;
      node.appendChild(input);
      break;
    }
    case 'slider': {
      node.style.justifyContent = 'center';
      const range = document.createElement('input');
      range.className = 'rt-range';
      range.type = 'range';
      range.min = String(obj.min ?? 0);
      range.max = String(obj.max ?? 100);
      range.step = String(obj.step ?? 1);
      range.value = String(toNumber(ctx.getVarById(obj.variableId), toNumber(obj.min, 0)));
      range.style.accentColor = obj.fillColor || '#4f8cff';
      if (!options.interactive) range.disabled = true;
      node.appendChild(range);
      break;
    }
    case 'toggle': {
      node.style.flexDirection = 'row';
      node.style.alignItems = 'center';
      node.style.gap = '8px';
      node.style.justifyContent = 'flex-start';
      const sw = document.createElement('span');
      sw.className = 'rt-switch' + (ctx.getVarById(obj.variableId) === true || (typeof ctx.getVarById(obj.variableId) === 'number' && ctx.getVarById(obj.variableId) !== 0) ? ' on' : '');
      sw.style.setProperty('--sw-on', obj.fillColor || '#4f8cff');
      const lab = document.createElement('span');
      lab.style.fontSize = (obj.fontSize || 14) + 'px';
      lab.style.color = obj.color || '#fff';
      lab.textContent = interpolate(obj.text || '', ctx.getVarByName);
      node.append(sw, lab);
      break;
    }
    case 'timer': {
      node.style.justifyContent = justifyFor(obj.align);
      node.style.fontSize = (obj.fontSize || 22) + 'px';
      node.style.color = obj.color || '#fff';
      const t = Math.max(0, Math.ceil(toNumber(obj.seconds, 0)));
      const mm = Math.floor(t / 60), ss = t % 60;
      const disp = document.createElement('span');
      disp.className = 'timer-text';
      disp.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      node.appendChild(disp);
      break;
    }
    case 'trigger': {
      // editor-only visual: dashed zone with target label (hidden at Play)
      node.style.borderStyle = 'dashed';
      node.style.display = 'flex';
      node.style.alignItems = 'center';
      node.style.justifyContent = 'center';
      node.style.color = '#b197fc';
      node.style.fontSize = '10px';
      node.textContent = obj.targetName ? '▸ ' + obj.targetName : 'trigger';
      break;
    }
    case 'emitter': {
      node.style.display = 'flex';
      node.style.alignItems = 'center';
      node.style.justifyContent = 'center';
      node.textContent = '✦';
      node.style.color = obj.colors ? String(obj.colors).split(',')[0].trim() : '#ffd76e';
      node.style.fontSize = Math.min(16, Math.max(10, toNumber(obj.size, 6) + 6)) + 'px';
      break;
    }
    default:
      break;
  }
}

export function buildObjectElement(obj, ctx, options = {}) {
  const node = document.createElement('div');
  const type = obj.type === 'upgrade' ? 'button' : obj.type; // legacy alias
  node.className = `ui-object ui-object-${type}`;
  node.dataset.objectId = obj.id;
  applyBox(node, obj);
  applyVisual(node, obj);
  if (options.forceVisible) node.style.visibility = 'visible';
  renderContent(node, obj, ctx, options);
  return node;
}