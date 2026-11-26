import { uid, deepClone, toNumber } from './util.js';

export const VARIABLE_TYPES = ['number', 'text', 'boolean'];

export const TYPE_DEFS = {
  button: {
    label: 'Button', icon: 'button',
    defaults: {
      w: 180, h: 56, bg: '#2b3b5e', borderColor: '#40598c', borderWidth: 1, radius: 8,
      text: 'Click Me', fontSize: 18, color: '#e6ecf7', align: 'center',
      costVariableId: null, costAmount: 0,
    },
  },
  text: {
    label: 'Text', icon: 'text',
    defaults: {
      w: 220, h: 32, bg: 'transparent', borderColor: '#000000', borderWidth: 0, radius: 0,
      text: 'Text', fontSize: 18, color: '#e6ecf7', align: 'left',
    },
  },
  image: {
    label: 'Image', icon: 'image',
    defaults: { w: 128, h: 128, bg: 'transparent', borderColor: '#000000', borderWidth: 0, radius: 0, assetId: null, fit: 'contain' },
  },
  panel: {
    label: 'Panel', icon: 'panel',
    defaults: { w: 320, h: 200, bg: '#171c27', borderColor: '#2a3243', borderWidth: 1, radius: 10 },
  },
  progressbar: {
    label: 'Progress Bar', icon: 'progress',
    defaults: {
      w: 240, h: 20, bg: '#1a2030', borderColor: '#2a3243', borderWidth: 1, radius: 10,
      fillColor: '#4f8cff', valueVarId: null, maxVarId: null, maxValue: 100,
    },
  },
  counter: {
    label: 'Counter', icon: 'counter',
    defaults: {
      w: 200, h: 40, bg: 'transparent', borderColor: '#000000', borderWidth: 0, radius: 0,
      text: '', fontSize: 24, color: '#e6ecf7', align: 'left',
      variableId: null, prefix: '', suffix: '',
    },
  },
  shape: {
    label: 'Shape', icon: 'shape',
    defaults: { w: 120, h: 80, bg: '#4f8cff', borderColor: '#000000', borderWidth: 0, radius: 0, kind: 'rect' },
  },
  input: {
    label: 'Input', icon: 'input',
    defaults: {
      w: 200, h: 36, bg: '#1a2030', borderColor: '#2a3243', borderWidth: 1, radius: 6,
      variableId: null, placeholder: 'Type…', fontSize: 14, color: '#e6ecf7',
    },
  },
  slider: {
    label: 'Slider', icon: 'slider',
    defaults: {
      w: 220, h: 32, bg: 'transparent', borderColor: '#000000', borderWidth: 0, radius: 0,
      variableId: null, min: 0, max: 100, step: 1, fillColor: '#4f8cff',
    },
  },
  toggle: {
    label: 'Toggle', icon: 'toggle',
    defaults: {
      w: 180, h: 36, bg: 'transparent', borderColor: '#000000', borderWidth: 0, radius: 0,
      variableId: null, text: 'Enabled', fontSize: 14, color: '#e6ecf7', fillColor: '#4f8cff',
    },
  },
  timer: {
    label: 'Timer', icon: 'timer',
    defaults: {
      w: 160, h: 44, bg: '#171c27', borderColor: '#2a3243', borderWidth: 1, radius: 8,
      fontSize: 22, color: '#e6ecf7', align: 'center',
      mode: 'countdown', seconds: 30, autoStart: true,
    },
  },
  trigger: {
    label: 'Trigger Zone', icon: 'alert',
    defaults: {
      w: 120, h: 120, bg: 'transparent', borderColor: '#b197fc', borderWidth: 1, radius: 4,
      targetName: '',
    },
  },
  emitter: {
    label: 'Emitter', icon: 'shape',
    defaults: {
      w: 20, h: 20, bg: '#2a3243', borderColor: '#3a465c', borderWidth: 1, radius: 10,
      rate: 20, life: 0.8, speed: 90, spread: 40, angle: -90, size: 6, gravity: 200,
      colors: '#ffd76e,#ff9e6b', running: true,
    },
  },
};

function uniqueName(project, base) {
  const taken = new Set(project.objects.map(o => o.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}

export function createObject(type, project, overrides = {}) {
  const def = TYPE_DEFS[type];
  if (!def) throw new Error(`Unknown object type: ${type}`);
  const maxLayer = project.objects.reduce((m, o) => Math.max(m, o.layer || 0), 0);
  const object = {
    id: uid('obj'),
    type,
    x: 40,
    y: 40,
    layer: maxLayer + 1,
    visible: true,
    opacity: 1,
    ...deepClone(def.defaults),
    scene: 'main', groupId: null, persist: false, gravity: 0, vx: 0, vy: 0, bounce: false, rotation: 0, z: 0, rotX: 0, rotY: 0,
    ...overrides,
  };
  object.name = overrides.name || uniqueName(project, def.label);
  return object;
}

/** Deep-copy an object (new id/name/scripts) and add it to the project. */
export function cloneObject(obj, project, overrides = {}) {
  const copy = normalizeObject({ ...deepClone(obj), ...overrides,
    id: uid('obj'),
    name: overrides.name || uniqueName(project, obj.name),
    x: (obj.x || 0) + 24, y: (obj.y || 0) + 24,
  });
  copy.codeScripts = (copy.codeScripts || []).map(s => ({ ...s, id: uid('scr'), _broken: undefined }));
  project.objects.push(copy);
  return copy;
}

export function createVariable(project, { name, type = 'number', value = 0 } = {}) {
  const taken = new Set(project.variables.map(v => v.name));
  let finalName = name || 'Variable';
  let i = 2;
  while (taken.has(finalName)) finalName = `${name || 'Variable'}${i++}`;
  return { id: uid('var'), name: finalName, type, value: coerceVarValue(value, type) };
}

export function coerceVarValue(value, type) {
  if (type === 'number') return toNumber(value, 0);
  if (type === 'boolean') return value === true || value === 'true';
  return value === null || value === undefined ? '' : String(value);
}

export function createEvent(project, overrides = {}) {
  const firstButton = project.objects.find(o => o.type === 'button');
  return {
    id: uid('evt'),
    name: 'New Event',
    trigger: 'click',
    targetId: firstButton ? firstButton.id : (project.objects[0]?.id ?? null),
    conditions: [],
    actions: [],
    ...overrides,
  };
}

export function createCondition(project) {
  return {
    id: uid('cond'),
    variableId: project.variables[0]?.id ?? null,
    operator: '>=',
    value: '0',
  };
}

export function createAction(project, type = 'add') {
  const base = { id: uid('act'), type };
  switch (type) {
    case 'add': case 'subtract': case 'set': case 'multiply':
      return { ...base, variableId: project.variables[0]?.id ?? null, value: '1' };
    case 'updateText':
      return { ...base, objectId: project.objects.find(o => o.type === 'text' || o.type === 'counter')?.id ?? null, text: '' };
    case 'show': case 'hide':
      return { ...base, objectId: project.objects[0]?.id ?? null };
    case 'setProperty':
      return { ...base, objectId: project.objects[0]?.id ?? null, property: 'opacity', value: '1' };
    case 'code':
      return { ...base, code: '' };
    default:
      return base;
  }
}

export function createProject(name = 'Untitled Game') {
  const now = Date.now();
  return {
    id: uid('proj'),
    name,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    settings: { width: 960, height: 600, background: '#12161f', showGrid: true, gridSize: 10, snap: true, volume: 1, gravityScale: 1, startScene: '', worldWidth: 0, worldHeight: 0 },
    scripts: { onStart: '', onUpdate: '', onClick: '', onKey: '', onScene: '' },
    scenes: [{ id: 'main', name: 'main', width: 960, height: 600, background: '#12161f' }],
    groups: [],
    variables: [],
    objects: [],
    events: [],
    assets: [],
  };
}

const OBJECT_NUMBER_FIELDS = ['x', 'y', 'w', 'h', 'layer', 'opacity', 'borderWidth', 'radius', 'fontSize', 'maxValue', 'costAmount', 'min', 'max', 'step', 'seconds', 'rotation', 'gravity', 'vx', 'vy', 'letterSpacing', 'lineSpacing', 'strokeWidth', 'z', 'rotX', 'rotY', 'rate', 'life', 'speed', 'spread', 'angle', 'size'];

function normalizeObject(raw) {
  let type = raw.type === 'upgrade' ? 'button' : raw.type; // legacy: upgrade merged into button
  if (!TYPE_DEFS[type]) type = 'panel';
  const def = TYPE_DEFS[type].defaults;
  const object = { ...deepClone(def), ...raw };
  object.id = raw.id || uid('obj');
  object.type = type;
  object.name = typeof object.name === 'string' && object.name && object.name !== 'Upgrade Button'
    ? object.name : TYPE_DEFS[type].label;
  for (const field of OBJECT_NUMBER_FIELDS) {
    if (object[field] !== undefined) object[field] = toNumber(object[field], def[field] ?? 0);
  }
  object.w = Math.max(1, object.w);
  object.h = Math.max(1, object.h);
  object.visible = object.visible !== false;
  object.rotation = ((object.rotation % 360) + 360) % 360;
  object.opacity = Math.min(1, Math.max(0, object.opacity ?? 1));
  object.layer = Math.round(object.layer ?? 1);
  const sc = raw.scripts && typeof raw.scripts === 'object' ? raw.scripts : {};
  // Script children (Roblox-style). Legacy per-object hook strings migrate in.
  const HOOKS = ['init', 'click', 'update', 'hover', 'unhover', 'enter', 'exit'];
  const kids = Array.isArray(raw.codeScripts)
    ? raw.codeScripts.filter(s => s && typeof s === 'object').map(s => ({
        id: s.id || uid('scr'),
        name: typeof s.name === 'string' && s.name ? s.name : 'Script',
        hook: HOOKS.includes(s.hook) ? s.hook : 'update',
        code: String(s.code ?? ''),
        lang: s.lang === 'lua' ? 'lua' : 'js',
      }))
    : [];
  for (const hook of HOOKS) {
    if (String(sc[hook] ?? '').trim()) {
      kids.push({
        id: uid('scr'),
        name: HOOK_LABEL[hook] || 'Script',
        hook, code: String(sc[hook]),
      });
    }
  }
  object.codeScripts = kids;
  object.scene = typeof raw.scene === 'string' && raw.scene ? raw.scene : 'main';
  object.groupId = typeof raw.groupId === 'string' ? raw.groupId : null;
  object.persist = raw.persist === true;
  object.tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
  object.blend = typeof raw.blend === 'string' ? raw.blend : '';
  object.shadow = typeof raw.shadow === 'string' ? raw.shadow : '';
  object.cursor = typeof raw.cursor === 'string' ? raw.cursor : '';
  object.bounce = !!raw.bounce;
  return object;
}

export const HOOK_LABEL = { init: 'On create', click: 'On click', update: 'Every frame', hover: 'On hover', unhover: 'On unhover' };

/** Fills gaps / repairs malformed data so a broken file never crashes the editor. */
export function normalizeProject(raw) {
  const project = deepClone(raw || {});
  if (!project.id) project.id = uid('proj');
  project.name = typeof project.name === 'string' && project.name.trim() ? project.name : 'Untitled Game';
  project.createdAt = project.createdAt || Date.now();
  project.updatedAt = project.updatedAt || project.createdAt;
  project.settings = Object.assign(
    { width: 960, height: 600, background: '#12161f', showGrid: true, gridSize: 10, snap: true, volume: 1, gravityScale: 1, startScene: '', worldWidth: 0, worldHeight: 0 },
    project.settings || {}
  );
  project.settings.width = Math.max(160, toNumber(project.settings.width, 960));
  project.settings.height = Math.max(120, toNumber(project.settings.height, 600));
  project.settings.gridSize = Math.max(2, toNumber(project.settings.gridSize, 10));
  project.settings.snap = project.settings.snap !== false;
  project.settings.volume = Math.min(1, Math.max(0, toNumber(project.settings.volume, 1)));
  project.settings.gravityScale = Math.min(3, Math.max(0, toNumber(project.settings.gravityScale, 1)));
  project.settings.startScene = String(project.settings.startScene ?? '');

  // groups (editor folders)
  project.groups = Array.isArray(project.groups)
    ? project.groups.filter(g => g && typeof g === 'object')
        .map(g => ({ id: g.id || uid('grp'), name: String(g.name || 'Group'), scene: String(g.scene || 'main') }))
    : [];

  // scenes: objects carry a scene NAME; each named scene has its own size + background
  if (!Array.isArray(project.scenes) || !project.scenes.length) project.scenes = [];
  const sceneNames = [...new Set((project.objects || []).map(o => (typeof o.scene === 'string' && o.scene) || 'main'))];
  if (!sceneNames.length) sceneNames.push('main');
  for (const sc of project.scenes) {
    sc.id = sc.id || uid('scn');
    sc.name = String(sc.name || 'Scene');
    sc.width = Math.min(8192, Math.max(160, toNumber(sc.width, project.settings.width)));
    sc.height = Math.min(8192, Math.max(120, toNumber(sc.height, project.settings.height)));
    sc.background = typeof sc.background === 'string' ? sc.background : project.settings.background;
  }
  for (const n of sceneNames) {
    if (!project.scenes.some(sc => sc.name.toLowerCase() === n.toLowerCase()))
      project.scenes.push({ id: n === 'main' ? 'main' : uid('scn'), name: n, width: project.settings.width, height: project.settings.height, background: project.settings.background });
  }
  // drop duplicate scene names (keep first)
  project.scenes = project.scenes.filter((sc, i) => project.scenes.findIndex(x => x.name.toLowerCase() === sc.name.toLowerCase()) === i);

  const sc = project.scripts && typeof project.scripts === 'object' ? project.scripts : {};
  project.scripts = {
    onStart: String(sc.onStart ?? sc.init ?? ''),
    onUpdate: String(sc.onUpdate ?? sc.update ?? ''),
    onClick: String(sc.onClick ?? ''),
    onKey: String(sc.onKey ?? ''),
    onScene: String(sc.onScene ?? ''),
    lang: sc.lang === 'lua' ? 'lua' : 'js',
  };

  const seenVarIds = new Set();
  project.variables = Array.isArray(project.variables)
    ? project.variables
        .filter(v => v && typeof v === 'object')
        .map(v => ({
          id: v.id && !seenVarIds.has(v.id) ? (seenVarIds.add(v.id), v.id) : (() => { const id = uid('var'); seenVarIds.add(id); return id; })(),
          name: typeof v.name === 'string' && v.name ? v.name : 'Variable',
          type: VARIABLE_TYPES.includes(v.type) ? v.type : 'number',
          value: coerceVarValue(v.value, VARIABLE_TYPES.includes(v.type) ? v.type : 'number'),
        }))
    : [];

  const seenObjIds = new Set();
  project.objects = Array.isArray(project.objects)
    ? project.objects
        .filter(o => o && typeof o === 'object' && o.type)
        .map(o => {
          const obj = normalizeObject(o);
          if (seenObjIds.has(obj.id)) obj.id = uid('obj');
          seenObjIds.add(obj.id);
          return obj;
        })
    : [];

  project.events = Array.isArray(project.events)
    ? project.events.filter(e => e && typeof e === 'object').map(e => ({
        id: e.id || uid('evt'),
        name: typeof e.name === 'string' && e.name ? e.name : 'Event',
        trigger: e.trigger === 'start' ? 'start' : 'click',
        targetId: e.targetId ?? null,
        conditions: Array.isArray(e.conditions) ? e.conditions.map(c => ({
          id: c.id || uid('cond'),
          variableId: c.variableId ?? null,
          operator: ['>', '<', '==', '>=', '<=', '!='].includes(c.operator) ? c.operator : '>=',
          value: c.value ?? '0',
        })) : [],
        actions: Array.isArray(e.actions) ? e.actions.filter(a => a && a.type).map(a => ({ ...a, id: a.id || uid('act') })) : [],
      }))
    : [];

  project.assets = Array.isArray(project.assets)
    ? project.assets.filter(a => a && a.id && a.dataUrl).map(a => ({
        id: a.id, name: a.name || 'Asset', dataUrl: a.dataUrl, width: a.width || 0, height: a.height || 0,
      }))
    : [];

  return project;
}

export const getObjectById = (project, id) => project.objects.find(o => o.id === id) || null;
export const getVariableById = (project, id) => project.variables.find(v => v.id === id) || null;
export const getVariableByName = (project, name) => project.variables.find(v => v.name === name) || null;
