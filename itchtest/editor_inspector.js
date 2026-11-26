import { el, clear } from 'ui.js';
import { TYPE_DEFS, getVariableById } from 'model.js';
import { toNumber } from 'util.js';
import { icon } from 'icons.js';

const ALIGN_OPTIONS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];

function field(label, control) {
  return el('div', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }),
    el('div', { class: 'field-ctl' }, control),
  ]);
}

function numberInput(value, onChange, { min, max, step = 1 } = {}) {
  const input = el('input', { class: 'input', type: 'number', value, step });
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.addEventListener('input', () => {
    if (input.value === '' || input.value === '-') return;
    let v = toNumber(input.value, 0);
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  });
  return input;
}

function textInput(value, onChange) {
  const input = el('input', { class: 'input', value: value ?? '' });
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

function colorInput(value, onChange) {
  const input = el('input', { class: 'input', type: 'color', value: value || '#000000' });
  input.addEventListener('input', () => onChange(input.value));
  return input;
}

function selectInput(options, value, onChange) {
  const select = el('select', { class: 'select' });
  for (const [val, label] of options) {
    const opt = el('option', { value: val, text: label });
    if (val === value) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function checkboxInput(value, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = !!value;
  input.style.width = '15px';
  input.style.height = '15px';
  input.style.accentColor = 'var(--accent)';
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

function section(title) {
  const s = el('div', { class: 'insp-section' }, [el('h4', { text: title, title: 'Click to collapse/expand' })]);
  s.firstElementChild.addEventListener('click', () => s.classList.toggle('folded'));
  return s;
}

export class Inspector {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
  }

  render() {
    clear(this.host);
    const project = this.editor.project;
    const ids = this.editor.selection;
    const body = el('div', { class: 'inspector-body' });

    if (ids.length === 0) {
      body.appendChild(this.renderProjectSettings());
    } else if (ids.length === 1) {
      const obj = project.objects.find(o => o.id === ids[0]);
      if (obj) body.appendChild(this.renderObject(obj));
    } else {
      body.appendChild(this.renderMulti(ids));
    }

    this.host.appendChild(body);
  }

  /* ------------ project settings ------------ */
  renderProjectSettings() {
    const project = this.editor.project;
    const wrap = el('div');
    wrap.appendChild(el('div', {
      class: 'insp-empty insp-canvas-hint',
      html: '<b>Editing: Canvas</b><br><span class="faint">Select an object on the canvas or in the Explorer to edit its properties.</span>',
    }));

    const s = section('Canvas');
    s.appendChild(field('Width', numberInput(project.settings.width, v => {
      project.settings.width = v; this.editor.onSettingsChanged();
    }, { min: 160 })));
    s.appendChild(field('Height', numberInput(project.settings.height, v => {
      project.settings.height = v; this.editor.onSettingsChanged();
    }, { min: 120 })));
    s.appendChild(field('Background', colorInput(project.settings.background, v => {
      project.settings.background = v; this.editor.onSettingsChanged();
    })));
    s.appendChild(field('Show grid', checkboxInput(project.settings.showGrid, v => {
      project.settings.showGrid = v; this.editor.onSettingsChanged();
    })));
    s.appendChild(field('Grid size', numberInput(project.settings.gridSize, v => {
      project.settings.gridSize = Math.max(2, v); this.editor.onSettingsChanged();
    }, { min: 2 })));
    wrap.appendChild(s);

    const stats = section('Project');
    stats.appendChild(el('div', {
      class: 'faint', style: { fontSize: '11px', lineHeight: '1.8' },
      text: `${project.objects.length} objects · ${project.variables.length} variables · ${project.events.length} events`,
    }));
    wrap.appendChild(stats);
    return wrap;
  }

  /* ------------ multi selection ------------ */
  renderMulti(ids) {
    const wrap = el('div');
    wrap.appendChild(el('div', { class: 'insp-empty', text: `${ids.length} objects selected` }));

    const common = section('Common');
    common.appendChild(field('Opacity', numberInput(1, v => {
      this.editor.patchSelection({ opacity: Math.max(0, Math.min(1, v)) });
    }, { min: 0, max: 1, step: 0.05 })));
    common.appendChild(field('Visible', checkboxInput(true, v => this.editor.patchSelection({ visible: v }))));
    // layer ordering for the whole selection — layers are no longer a secret
    const layerBtns = el('div', { class: 'row', style: { gap: '4px' } }, [
      el('button', { class: 'btn', title: 'Bring to front (highest layer)', text: '⤒ Front', onclick: () => this.editor.layerOrder('front') }),
      el('button', { class: 'btn', title: 'Move layer up', text: '▲', onclick: () => this.editor.layerOrder('up') }),
      el('button', { class: 'btn', title: 'Move layer down', text: '▼', onclick: () => this.editor.layerOrder('down') }),
      el('button', { class: 'btn', title: 'Send to back (lowest layer)', text: '⤓ Back', onclick: () => this.editor.layerOrder('back') }),
    ]);
    common.appendChild(field('Layer order', layerBtns));
    common.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Group (Ctrl+G)', onclick: () => this.editor.groupSelection(), disabled: ids.length < 2 }),
    ]));
    wrap.appendChild(common);

    const actions = section('Actions');
    actions.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn', text: 'Duplicate', onclick: () => this.editor.duplicateSelection() }),
      el('button', { class: 'btn danger', text: 'Delete', onclick: () => this.editor.deleteSelection() }),
    ]));
    wrap.appendChild(actions);
    return wrap;
  }

  /* ------------ single object ------------ */
  renderObject(obj) {
    const wrap = el('div');
    const project = this.editor.project;
    const update = (patch) => this.editor.updateObject(obj.id, patch);

    // Header
    const head = section(TYPE_DEFS[obj.type]?.label || 'Object');
    head.appendChild(field('Name', textInput(obj.name, v => {
      update({ name: v });
      this.editor.hierarchy.render();
    })));
    head.appendChild(el('div', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'ID' }),
      el('div', { class: 'field-ctl' }, [
        el('span', { class: 'obj-id', text: obj.id }),
      ]),
    ]));
    wrap.appendChild(head);

    // Transform
    const transform = section('Transform');
    const xy = el('div', { class: 'grid2' });
    xy.append(
      el('div', { class: 'mini-field' }, [el('span', { text: 'X' }), numberInput(obj.x, v => update({ x: v }))]),
      el('div', { class: 'mini-field' }, [el('span', { text: 'Y' }), numberInput(obj.y, v => update({ y: v }))]),
      el('div', { class: 'mini-field' }, [el('span', { text: 'W' }), numberInput(obj.w, v => update({ w: Math.max(1, v) }), { min: 1 })]),
      el('div', { class: 'mini-field' }, [el('span', { text: 'H' }), numberInput(obj.h, v => update({ h: Math.max(1, v) }), { min: 1 })]),
    );
    transform.appendChild(xy);
    const quick = el('div', { class: 'row', style: { gap: '4px', marginTop: '6px' } }, [
      el('button', { class: 'btn', style: { fontSize: '10px', padding: '3px 7px' }, text: 'Center H', title: 'Center horizontally on canvas',
        onclick: () => update({ x: Math.round((project.settings.width - obj.w) / 2) }) }),
      el('button', { class: 'btn', style: { fontSize: '10px', padding: '3px 7px' }, text: 'Center V',
        onclick: () => update({ y: Math.round((project.settings.height - obj.h) / 2) }) }),
      el('button', { class: 'btn', style: { fontSize: '10px', padding: '3px 7px' }, text: 'Top-left',
        onclick: () => update({ x: 20, y: 20 }) }),
    ]);
    transform.appendChild(quick);
    const rotRow = el('div', { class: 'row' });
    const rotRange = el('input', { type: 'range', min: '0', max: '360', step: '1', value: obj.rotation || 0 });
    const rotLabel = el('span', { class: 'faint', style: { fontSize: '11px', width: '38px' }, text: Math.round(obj.rotation || 0) + '°' });
    rotRange.addEventListener('input', () => {
      rotLabel.textContent = Math.round(rotRange.value) + '°';
      update({ rotation: toNumber(rotRange.value, 0) });
    });
    rotRow.append(rotRange, rotLabel);
    transform.appendChild(field('Rotation', rotRow));
    transform.appendChild(field('Layer', (() => {
      const num = numberInput(obj.layer, v => update({ layer: Math.round(v) }), { step: 1 });
      const btns = el('div', { class: 'row', style: { gap: '3px' } }, [
        el('button', { class: 'btn', style: { padding: '2px 6px' }, title: 'Bring to front', text: '⤒', onclick: () => this.editor.layerOrder('front') }),
        el('button', { class: 'btn', style: { padding: '2px 6px' }, title: 'Forward', text: '▲', onclick: () => this.editor.layerOrder('up') }),
        el('button', { class: 'btn', style: { padding: '2px 6px' }, title: 'Backward', text: '▼', onclick: () => this.editor.layerOrder('down') }),
        el('button', { class: 'btn', style: { padding: '2px 6px' }, title: 'Send to back', text: '⤓', onclick: () => this.editor.layerOrder('back') }),
      ]);
      return el('div', { class: 'row', style: { gap: '5px', flex: '1' } }, [num, btns]);
    })()));
    transform.appendChild(field('Scene', (() => {
      const sel = el('select', { class: 'input' });
      const names = (this.editor.project.scenes || []).map(sc => sc.name);
      if (!names.includes(obj.scene || 'main')) names.push(obj.scene || 'main');
      for (const n of names) sel.appendChild(el('option', { value: n, text: n, selected: n === (obj.scene || 'main') }));
      sel.addEventListener('change', () => update({ scene: sel.value }));
      return sel;
    })()));
    transform.appendChild(field('Show in ALL scenes', checkboxInput(!!obj.persist, v => update({ persist: v }))));
    wrap.appendChild(transform);

    // Extras: tags, blend, shadow, cursor
    const extras = section('Extras');
    extras.appendChild(field('Tags', el('input', {
      class: 'input', type: 'text', value: (obj.tags || []).join(', '), spellcheck: 'false',
      placeholder: 'enemy, boss, breakable… (query with tagged("boss"))',
      onchange: e => update({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }),
    })));
    const blendSel = el('select', { class: 'input' });
    for (const b of ['', 'screen', 'multiply', 'overlay', 'lighten', 'darken', 'color-dodge', 'difference']) {
      blendSel.appendChild(el('option', { value: b, text: b || 'normal', selected: (obj.blend || '') === b }));
    }
    blendSel.addEventListener('change', () => update({ blend: blendSel.value }));
    extras.appendChild(field('Blend mode', blendSel));
    extras.appendChild(field('Shadow (CSS)', el('input', {
      class: 'input', type: 'text', value: obj.shadow || '', spellcheck: 'false',
      placeholder: '0 0 24px #4f8cff',
      onchange: e => update({ shadow: e.target.value.trim() }),
    })));
    const curSel = el('select', { class: 'input' });
    for (const c of ['', 'default', 'pointer', 'crosshair', 'grab', 'not-allowed', 'text', 'move']) {
      curSel.appendChild(el('option', { value: c, text: c || 'auto', selected: (obj.cursor || '') === c }));
    }
    curSel.addEventListener('change', () => update({ cursor: curSel.value }));
    extras.appendChild(field('Cursor', curSel));
    wrap.appendChild(extras);

    // Physics
    const physics = section('Physics');
    physics.appendChild(field('Gravity', numberInput(obj.gravity || 0, v => update({ gravity: v }), { min: -2000, max: 2000, step: 50 })));
    const pv = el('div', { class: 'grid2' });
    pv.append(
      el('div', { class: 'mini-field' }, [el('span', { text: 'Vel X' }), numberInput(obj.vx || 0, v => update({ vx: v }), { min: -1000, max: 1000 })]),
      el('div', { class: 'mini-field' }, [el('span', { text: 'Vel Y' }), numberInput(obj.vy || 0, v => update({ vy: v }), { min: -1000, max: 1000 })]),
    );
    physics.appendChild(pv);
    physics.appendChild(field('Bounce', checkboxInput(!!obj.bounce, v => update({ bounce: v }))));
    physics.appendChild(el('div', { class: 'faint', style: { fontSize: '10px', lineHeight: '1.5' },
      text: 'Gravity + velocity are integrated automatically every frame (px/s, px/s²). Bounce = walls & floor. Code can set obj.vx / obj.vy anytime.' }));
    wrap.appendChild(physics);

    // Appearance
    const appearance = section('Appearance');
    appearance.appendChild(field('Visible', checkboxInput(obj.visible, v => {
      update({ visible: v }); this.editor.hierarchy.render();
    })));
    const opacityRange = el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: obj.opacity });
    const opacityLabel = el('span', { class: 'faint', style: { fontSize: '11px', width: '30px' }, text: Math.round(obj.opacity * 100) + '%' });
    opacityRange.addEventListener('input', () => {
      opacityLabel.textContent = Math.round(opacityRange.value * 100) + '%';
      update({ opacity: toNumber(opacityRange.value, 1) });
    });
    appearance.appendChild(field('Opacity', el('div', { class: 'row' }, [opacityRange, opacityLabel])));
    if (obj.type !== 'image') {
      appearance.appendChild(field('Background', colorInput(obj.bg === 'transparent' ? '#000000' : obj.bg, v => update({ bg: v }))));
      appearance.appendChild(field('Border', el('div', { class: 'row' }, [
        colorInput(obj.borderColor || '#000000', v => update({ borderColor: v })),
        numberInput(obj.borderWidth || 0, v => update({ borderWidth: v }), { min: 0, max: 20 }),
      ])));
    }
    appearance.appendChild(field('Radius', numberInput(obj.radius || 0, v => update({ radius: v }), { min: 0 })));
    wrap.appendChild(appearance);

    // Type-specific
    wrap.appendChild(this.renderTypeSpecific(obj, project, update));

    // Per-object scripts
    wrap.appendChild(this.renderScript(obj));

    // Actions
    const actions = section('Actions');
    actions.appendChild(el('div', { class: 'row', style: { flexWrap: 'wrap' } }, [
      el('button', { class: 'btn', text: 'Duplicate', onclick: () => this.editor.duplicateSelection() }),
      el('button', { class: 'btn', text: 'Forward', onclick: () => this.editor.reorderObject(obj.id, 1) }),
      el('button', { class: 'btn', text: 'Backward', onclick: () => this.editor.reorderObject(obj.id, -1) }),
      el('button', { class: 'btn danger', text: 'Delete', onclick: () => this.editor.deleteSelection() }),
    ]));
    wrap.appendChild(actions);
    return wrap;
  }

  renderTypeSpecific(obj, project, update) {
    const wrap = el('div');
    const variableOptions = [['', '— none —'], ...project.variables.map(v => [v.id, v.name])];
    const objectOptions = [['', '— none —'], ...project.objects.map(o => [o.id, o.name])];

    switch (obj.type) {
      case 'button': {
        const s = section('Button Settings');
        s.appendChild(field('Label', textInput(obj.text, v => update({ text: v }))));
        s.appendChild(field('Font size', numberInput(obj.fontSize, v => update({ fontSize: v }), { min: 6 })));
        s.appendChild(field('Text color', colorInput(obj.color, v => update({ color: v }))));
        s.appendChild(field('Style', el('div', { class: 'row', style: { gap: '12px' } }, [
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.bold, v => update({ bold: v })), el('span', { text: 'Bold' })]),
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.italic, v => update({ italic: v })), el('span', { text: 'Italic' })]),
        ])));
        s.appendChild(field('Align', selectInput(ALIGN_OPTIONS, obj.align, v => update({ align: v }))));
        // Purchase mode: pick a currency variable and the button doubles as a buy/upgrade button.
        s.appendChild(field('Cost variable', selectInput(variableOptions, obj.costVariableId || '', v => update({ costVariableId: v || null }))));
        if (obj.costVariableId) {
          s.appendChild(field('Cost amount', numberInput(obj.costAmount || 0, v => update({ costAmount: Math.max(0, v) }), { min: 0 })));
          s.appendChild(el('div', {
            class: 'faint', style: { fontSize: '10px', lineHeight: '1.5' },
            text: 'Automatic: shows the cost, greys out when unaffordable, deducts on click. A failed purchase runs no events.',
          }));
        }
        wrap.appendChild(s);
        break;
      }
      case 'text': {
        const s = section('Text');
        const area = el('textarea', { class: 'input', rows: '3' });
        area.value = obj.text || '';
        area.addEventListener('input', () => update({ text: area.value }));
        s.appendChild(field('Content', area));
        s.appendChild(el('div', {
          class: 'faint', style: { fontSize: '10px', margin: '-2px 0 8px' },
          text: 'Use {{VariableName}} to embed a live value.',
        }));
        s.appendChild(field('Font size', numberInput(obj.fontSize, v => update({ fontSize: v }), { min: 6 })));
        s.appendChild(field('Color', colorInput(obj.color, v => update({ color: v }))));
        s.appendChild(field('Style', el('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } }, [
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.bold, v => update({ bold: v })), el('span', { text: 'Bold' })]),
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.italic, v => update({ italic: v })), el('span', { text: 'Italic' })]),
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.underline, v => update({ underline: v })), el('span', { text: 'Underline' })]),
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.strike, v => update({ strike: v })), el('span', { text: 'Strike' })]),
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.shadow, v => update({ shadow: v })), el('span', { text: 'Shadow' })]),
        ])));
        s.appendChild(field('Font', selectInput([['', 'Default'], ['arcade', 'Arcade (pixel)'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Monospace'], ['impact', 'Impact'], ['cursive', 'Cursive']], obj.fontFamily || '', v => update({ fontFamily: v || null }))));
        s.appendChild(field('Letter spacing', numberInput(obj.letterSpacing || 0, v => update({ letterSpacing: v }), { min: -2, max: 30 })));
        s.appendChild(field('Line height', numberInput(obj.lineSpacing || 1.2, v => update({ lineSpacing: v }), { min: 0.8, max: 3, step: 0.1 })));
        s.appendChild(field('Outline width', numberInput(obj.strokeWidth || 0, v => update({ strokeWidth: v }), { min: 0, max: 6 })));
        if (obj.strokeWidth) s.appendChild(field('Outline color', colorInput(obj.strokeColor || '#000000', v => update({ strokeColor: v }))));
        if (obj.shadow) s.appendChild(field('Shadow color', colorInput(obj.shadowColor || '#000000', v => update({ shadowColor: v }))));
        s.appendChild(field('Align', selectInput(ALIGN_OPTIONS, obj.align, v => update({ align: v }))));
        wrap.appendChild(s);
        break;
      }
      case 'image': {
        const s = section('Image');
        const options = [['', '— none —'], ...project.assets.map(a => [a.id, a.name])];
        s.appendChild(field('Asset', selectInput(options, obj.assetId || '', v => update({ assetId: v || null }))));
        s.appendChild(field('Fit', selectInput(
          [['contain', 'Contain'], ['cover', 'Cover'], ['fill', 'Fill']],
          obj.fit, v => update({ fit: v })
        )));
        wrap.appendChild(s);
        break;
      }
      case 'progressbar': {
        const s = section('Progress Bar');
        s.appendChild(field('Value var', selectInput(variableOptions, obj.valueVarId || '', v => update({ valueVarId: v || null }))));
        s.appendChild(field('Max var', selectInput(variableOptions, obj.maxVarId || '', v => update({ maxVarId: v || null }))));
        if (!obj.maxVarId) {
          s.appendChild(field('Max value', numberInput(obj.maxValue, v => update({ maxValue: Math.max(1, v) }), { min: 1 })));
        }
        s.appendChild(field('Fill color', colorInput(obj.fillColor, v => update({ fillColor: v }))));
        wrap.appendChild(s);
        break;
      }
      case 'counter': {
        const s = section('Counter');
        s.appendChild(field('Variable', selectInput(variableOptions, obj.variableId || '', v => update({ variableId: v || null }))));
        s.appendChild(field('Prefix', textInput(obj.prefix, v => update({ prefix: v }))));
        s.appendChild(field('Suffix', textInput(obj.suffix, v => update({ suffix: v }))));
        s.appendChild(field('Font size', numberInput(obj.fontSize, v => update({ fontSize: v }), { min: 6 })));
        s.appendChild(field('Color', colorInput(obj.color, v => update({ color: v }))));
        s.appendChild(field('Style', el('div', { class: 'row', style: { gap: '12px' } }, [
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.bold, v => update({ bold: v })), el('span', { text: 'Bold' })]),
          el('label', { class: 'row', style: { gap: '4px', fontSize: '11px' } }, [checkboxInput(obj.italic, v => update({ italic: v })), el('span', { text: 'Italic' })]),
        ])));
        s.appendChild(field('Align', selectInput(ALIGN_OPTIONS, obj.align, v => update({ align: v }))));
        wrap.appendChild(s);
        break;
      }
      case 'shape': {
        const s = section('Shape');
        s.appendChild(field('Kind', selectInput([['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['pentagon', 'Pentagon'], ['hexagon', 'Hexagon'], ['star', 'Star'], ['arrow', 'Arrow']], obj.kind, v => update({ kind: v }))));
        s.appendChild(field('Corner radius', numberInput(obj.radius, v => update({ radius: v }), { min: 0, max: 200 })));
        wrap.appendChild(s);
        break;
      }
      case 'input': {
        const s = section('Input');
        s.appendChild(field('Binds variable', selectInput(variableOptions, obj.variableId || '', v => update({ variableId: v || null }))));
        s.appendChild(field('Placeholder', textInput(obj.placeholder, v => update({ placeholder: v }))));
        s.appendChild(field('Font size', numberInput(obj.fontSize, v => update({ fontSize: v }), { min: 6 })));
        wrap.appendChild(s);
        break;
      }
      case 'slider': {
        const s = section('Slider');
        s.appendChild(field('Binds variable', selectInput(variableOptions, obj.variableId || '', v => update({ variableId: v || null }))));
        s.appendChild(field('Min', numberInput(obj.min, v => update({ min: v }))));
        s.appendChild(field('Max', numberInput(obj.max, v => update({ max: v }))));
        s.appendChild(field('Step', numberInput(obj.step, v => update({ step: Math.max(0.01, v) }), { min: 0.01 })));
        s.appendChild(field('Accent', colorInput(obj.fillColor, v => update({ fillColor: v }))));
        wrap.appendChild(s);
        break;
      }
      case 'toggle': {
        const s = section('Toggle');
        s.appendChild(field('Binds variable', selectInput(variableOptions, obj.variableId || '', v => update({ variableId: v || null }))));
        s.appendChild(field('Label', textInput(obj.text, v => update({ text: v }))));
        s.appendChild(field('On color', colorInput(obj.fillColor, v => update({ fillColor: v }))));
        s.appendChild(el('div', {
          class: 'faint', style: { fontSize: '10px', lineHeight: '1.5' },
          text: 'The bound variable should be a boolean; it flips on click at runtime.',
        }));
        wrap.appendChild(s);
        break;
      }
      case 'timer': {
        const s = section('Timer');
        s.appendChild(field('Mode', selectInput([['countdown', 'Countdown'], ['stopwatch', 'Stopwatch']], obj.mode, v => update({ mode: v }))));
        s.appendChild(field('Seconds', numberInput(obj.seconds, v => update({ seconds: Math.max(0, v) }), { min: 0 })));
        s.appendChild(field('Auto start', checkboxInput(obj.autoStart, v => update({ autoStart: v }))));
        s.appendChild(field('Font size', numberInput(obj.fontSize, v => update({ fontSize: v }), { min: 6 })));
        s.appendChild(el('div', {
          class: 'faint', style: { fontSize: '10px', lineHeight: '1.5' },
          text: 'Code can read/change self.seconds and self.running. Countdown stops at 0.',
        }));
        wrap.appendChild(s);
        break;
      }
      case 'trigger': {
        const s = section('Trigger Zone');
        const ti = textInput(obj.targetName || '', v => update({ targetName: v }));
        ti.placeholder = 'e.g. Player';
        s.appendChild(field('Target object', ti));
        s.appendChild(el('div', {
          class: 'faint', style: { fontSize: '10px', lineHeight: '1.5' },
          text: 'Invisible at Play. Add On enter / On exit script children — inside them, `other` is the target object.',
        }));
        wrap.appendChild(s);
        break;
      }
      case 'emitter': {
        const s = section('Emitter');
        s.appendChild(field('Particles / sec', numberInput(obj.rate, v => update({ rate: v }), { min: 1, max: 120 })));
        s.appendChild(field('Lifetime (s)', numberInput(obj.life, v => update({ life: v }), { min: 0.1, max: 5, step: 0.1 })));
        s.appendChild(field('Speed', numberInput(obj.speed, v => update({ speed: v }), { min: 10, max: 600 })));
        s.appendChild(field('Angle (°)', numberInput(obj.angle, v => update({ angle: v }), { min: -180, max: 180 })));
        s.appendChild(field('Spread (°)', numberInput(obj.spread, v => update({ spread: v }), { min: 0, max: 360 })));
        s.appendChild(field('Size', numberInput(obj.size, v => update({ size: v }), { min: 2, max: 40 })));
        s.appendChild(field('Gravity', numberInput(obj.gravity === 200 ? 200 : (obj.gravity ?? 200), v => update({ gravity: v }), { min: -400, max: 1000 })));
        s.appendChild(field('Colors (csv)', textInput(obj.colors || '#ffd76e,#ff9e6b', v => update({ colors: v }))));
        s.appendChild(field('Running', checkboxInput(obj.running !== false, v => update({ running: v }))));
        wrap.appendChild(s);
        break;
      }
      default:
        break;
    }
    return wrap;
  }

  renderScript(obj) {
    const s = section('Scripts');
    const list = obj.codeScripts || [];
    if (!list.length) {
      s.appendChild(el('div', { class: 'faint', style: { fontSize: '11px', padding: '2px 0 6px' }, text: 'No scripts yet. Scripts live in the Explorer — click + on this object.' }));
    }
    for (const sc of list) {
      const row = el('div', { class: 'insp-script-row' }, [
        el('span', { class: 'is-name', text: sc.name }),
        el('span', { class: 'is-hook', text: { init: 'On create', update: 'Every frame', click: 'On click', hover: 'On hover', unhover: 'On unhover', enter: 'On enter', exit: 'On exit' }[sc.hook] || sc.hook }),
        el('button', { class: 'btn small', text: 'Edit', onclick: () => this.editor.openScript(obj, sc) }),
      ]);
      s.appendChild(row);
    }
    s.appendChild(el('button', {
      class: 'btn small block', text: '+ Add script',
      onclick: () => this.editor.addScript(obj),
    }));
    return s;
  }
}