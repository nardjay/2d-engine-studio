import { el, clear, contextMenu, promptDialog } from 'ui.js';
import {
  createEvent, createCondition, createAction, getObjectById, getVariableById,
} from 'model.js';

import { deepClone, uid } from 'util.js';

const OPERATORS = [['>', '>'], ['<', '<'], ['==', '='], ['>=', '≥'], ['<=', '≤'], ['!=', '≠']];
const ACTION_LABELS = [
  ['add', 'Add to variable'],
  ['subtract', 'Subtract from variable'],
  ['set', 'Set variable'],
  ['multiply', 'Multiply variable'],
  ['updateText', 'Update text'],
  ['show', 'Show object'],
  ['hide', 'Hide object'],
  ['setProperty', 'Change object property'],
  ['code', 'Run code'],
];
const SETTABLE_PROPS = ['opacity', 'rotation', 'x', 'y', 'w', 'h', 'radius', 'borderWidth', 'bg', 'color', 'fillColor'];

export class EventsPanel {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.selectedId = null;
  }

  toScriptCode(event) {
    const lines = [];
    for (const a of event.actions || []) {
      const t = JSON.stringify(a.target ?? a.objectName ?? '');
      switch (a.type) {
        case 'setValue': lines.push(`set(${JSON.stringify(a.variable)}, ${a.value});`); break;
        case 'add': lines.push(`add(${JSON.stringify(a.variable)}, ${a.value});`); break;
        case 'subtract': lines.push(`add(${JSON.stringify(a.variable)}, -(${a.value}));`); break;
        case 'show': lines.push(`show(${t});`); break;
        case 'hide': lines.push(`hide(${t});`); break;
        case 'setText': lines.push(`setText(${t}, ${JSON.stringify(a.value ?? '')});`); break;
        case 'playSound': lines.push('beep(440, 100);'); break;
        case 'code': lines.push(String(a.code || '')); break;
        default: lines.push('// ' + a.type + ': ' + JSON.stringify(a));
      }
    }
    return lines.join('\n') || '// (empty event)';
  }

  render() {
    clear(this.host);
    const project = this.editor.project;
    if (this.selectedId && !project.events.some(e => e.id === this.selectedId)) this.selectedId = null;

    const layout = el('div', { class: 'ev-layout' });
    layout.append(this.renderList(), this.renderDetail());
    this.host.appendChild(layout);
  }

  renderList() {
    const project = this.editor.project;
    const wrap = el('div', { class: 'ev-list' });
    wrap.appendChild(el('button', {
      class: 'btn primary', text: '+ New Event', style: { width: '100%', marginBottom: '8px' },
      onclick: () => {
        const event = createEvent(project);
        project.events.push(event);
        this.selectedId = event.id;
        this.editor.commitHistory('Add event');
        this.editor.refreshPanels();
        this.editor.scheduleAutosave();
      },
    }));

    if (!project.events.length) {
      wrap.appendChild(el('div', {
        class: 'faint', style: { fontSize: '11px', padding: '8px', lineHeight: '1.6' },
        text: 'No events yet. Events link clicks and game start to actions.',
      }));
    }

    for (const event of project.events) {
      const target = getObjectById(project, event.targetId);
      const subtitle = event.trigger === 'start' ? 'Game start' : (target ? target.name : 'no target');
      wrap.appendChild(el('div', {
        class: 'ev-item' + (event.id === this.selectedId ? ' selected' : ''),
        onclick: () => { this.selectedId = event.id; this.render(); },
        oncontextmenu: e => {
          e.preventDefault();
          this.selectedId = event.id;
          contextMenu([
            { label: 'Open', onClick: () => this.render() },
            { label: 'Rename…', onClick: async () => {
                const name = await promptDialog('Rename event', 'Event name', event.name);
                if (!name) return;
                event.name = name;
                this.editor.commitHistory('Rename event');
                this.editor.scheduleAutosave();
                this.render();
              } },
            { label: 'Duplicate', onClick: () => this.duplicateEvent(event) },
            '-',
            { label: 'Delete', danger: true, onClick: () => this.deleteEvent(event) },
          ], e.clientX, e.clientY);
        },
      }, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'ev-name', text: event.name }),
          el('div', { class: 'faint', style: { fontSize: '10px' }, text: subtitle }),
        ]),
        el('button', {
          class: 'x-btn', html: '✕', title: 'Delete event',
          onclick: (e) => { e.stopPropagation(); this.deleteEvent(event); },
        }),
      ]));
    }
    return wrap;
  }

  deleteEvent(event) {
    const project = this.editor.project;
    project.events = project.events.filter(ev => ev.id !== event.id);
    if (this.selectedId === event.id) this.selectedId = null;
    this.editor.commitHistory('Delete event');
    this.editor.refreshPanels();
    this.editor.scheduleAutosave();
  }

  duplicateEvent(event) {
    const project = this.editor.project;
    const copy = deepClone(event);
    copy.id = uid('evt');
    copy.name = event.name + ' Copy';
    copy.conditions = (copy.conditions || []).map(c => ({ ...c, id: uid('cond') }));
    copy.actions = (copy.actions || []).map(a => ({ ...a, id: uid('act') }));
    project.events.push(copy);
    this.selectedId = copy.id;
    this.editor.commitHistory('Duplicate event');
    this.editor.refreshPanels();
    this.editor.scheduleAutosave();
  }

  renderDetail() {
    const project = this.editor.project;
    const detail = el('div', { class: 'ev-detail' });
    const event = project.events.find(e => e.id === this.selectedId);
    if (!event) {
      detail.appendChild(el('div', {
        class: 'insp-empty', text: 'Select an event on the left, or create a new one.',
      }));
      return detail;
    }

    const commit = (label) => {
      this.editor.commitHistory(label);
      this.editor.scheduleAutosave();
    };

    // --- header block
    const header = el('div', { class: 'ev-block' });
    header.appendChild(el('div', { class: 'ev-block-head' }, [
      el('h5', { text: 'Event' }),
      el('button', {
        class: 'btn', text: 'Rename',
        onclick: async () => {
          const { promptDialog } = await import('../ui.js');
          const name = await promptDialog('Rename event', 'Event name', event.name);
          if (name) { event.name = name; commit('Rename event'); this.render(); }
        },
      }),
      el('button', {
        class: 'btn', text: '→ Script', title: 'Convert this event into a real code script (easier to read & edit)',
        onclick: () => {
          const code = this.toScriptCode(event);
          const obj = (this.editor.project.objects || []).find(o => o.id === event.targetId) || null;
          if (!obj) { this.editor.log('Event has no target object — pick one first', 'warn'); return; }
          const script = { id: 'scr' + Date.now(), name: event.name || 'From event', hook: event.trigger === 'start' ? 'init' : 'click', code, lang: 'js' };
          obj.codeScripts = obj.codeScripts || [];
          obj.codeScripts.push(script);
          event.actions = []; event.name = (event.name || 'Event') + ' (converted)';
          this.editor.commitHistory('Event converted to script');
          this.editor.refreshPanels();
          this.editor.openScript(obj, script);
          this.editor.log('Event converted — now it is real code you can edit freely');
        },
      }),
    ]));

    const nameInput = el('input', { class: 'input', value: event.name });
    nameInput.addEventListener('change', () => { event.name = nameInput.value || 'Event'; commit('Rename event'); this.renderList(); });
    header.appendChild(el('div', { class: 'cond-row' }, [
      el('span', { class: 'field-label', text: 'Name' }),
      nameInput,
    ]));

    const triggerSelect = el('select', { class: 'select' });
    for (const [val, label] of [['click', 'On Click'], ['start', 'On Game Start']]) {
      const opt = el('option', { value: val, text: label });
      if (val === event.trigger) opt.selected = true;
      triggerSelect.appendChild(opt);
    }
    triggerSelect.addEventListener('change', () => {
      event.trigger = triggerSelect.value;
      commit('Change trigger');
      this.render();
    });
    header.appendChild(el('div', { class: 'cond-row' }, [
      el('span', { class: 'field-label', text: 'Trigger' }),
      triggerSelect,
    ]));

    if (event.trigger === 'click') {
      const objectSelect = el('select', { class: 'select' });
      const options = [['', '— choose object —'], ...project.objects.map(o => [o.id, `${o.name} (${o.type})`])];
      for (const [val, label] of options) {
        const opt = el('option', { value: val, text: label });
        if (val === (event.targetId || '')) opt.selected = true;
        objectSelect.appendChild(opt);
      }
      objectSelect.addEventListener('change', () => {
        event.targetId = objectSelect.value || null;
        commit('Change event target');
        this.renderList();
      });
      header.appendChild(el('div', { class: 'cond-row' }, [
        el('span', { class: 'field-label', text: 'Target' }),
        objectSelect,
      ]));
    }
    detail.appendChild(header);

    // --- conditions
    const conditionsBlock = el('div', { class: 'ev-block' });
    conditionsBlock.appendChild(el('div', { class: 'ev-block-head' }, [
      el('h5', { text: 'Conditions (all must pass)' }),
      el('button', {
        class: 'btn', text: '+ Condition',
        onclick: () => {
          if (!project.variables.length) { this.editor.log('Create a variable first', 'warn'); return; }
          event.conditions.push(createCondition(project));
          commit('Add condition');
          this.render();
        },
      }),
    ]));
    if (!event.conditions.length) {
      conditionsBlock.appendChild(el('div', { class: 'faint', style: { fontSize: '11px' }, text: 'Always runs.' }));
    }
    for (const condition of event.conditions) {
      conditionsBlock.appendChild(this.renderCondition(condition, event, project, commit));
    }
    detail.appendChild(conditionsBlock);

    // --- actions
    const actionsBlock = el('div', { class: 'ev-block' });
    actionsBlock.appendChild(el('div', { class: 'ev-block-head' }, [
      el('h5', { text: 'Actions' }),
      el('button', {
        class: 'btn', text: '+ Action',
        onclick: () => {
          event.actions.push(createAction(project, 'add'));
          commit('Add action');
          this.render();
        },
      }),
    ]));
    if (!event.actions.length) {
      actionsBlock.appendChild(el('div', { class: 'faint', style: { fontSize: '11px' }, text: 'No actions configured.' }));
    }
    for (const action of event.actions) {
      actionsBlock.appendChild(this.renderAction(action, event, project, commit));
    }
    detail.appendChild(actionsBlock);

    return detail;
  }

  renderCondition(condition, event, project, commit) {
    const row = el('div', { class: 'cond-row' });

    const varSelect = el('select', { class: 'select' });
    for (const [val, label] of [['', '— variable —'], ...project.variables.map(v => [v.id, v.name])]) {
      const opt = el('option', { value: val, text: label });
      if (val === (condition.variableId || '')) opt.selected = true;
      varSelect.appendChild(opt);
    }
    varSelect.addEventListener('change', () => { condition.variableId = varSelect.value || null; commit('Change condition'); });

    const opSelect = el('select', { class: 'select', style: { maxWidth: '64px' } });
    for (const [val, label] of OPERATORS) {
      const opt = el('option', { value: val, text: label });
      if (val === condition.operator) opt.selected = true;
      opSelect.appendChild(opt);
    }
    opSelect.addEventListener('change', () => { condition.operator = opSelect.value; commit('Change condition'); });

    const valueInput = el('input', { class: 'input', value: condition.value ?? '' });
    valueInput.addEventListener('change', () => { condition.value = valueInput.value; commit('Change condition'); });

    const remove = el('button', {
      class: 'x-btn', html: '✕', title: 'Remove condition',
      onclick: () => {
        event.conditions = event.conditions.filter(c => c.id !== condition.id);
        commit('Remove condition');
        this.render();
      },
    });

    row.append(varSelect, opSelect, valueInput, remove);
    return row;
  }

  renderAction(action, event, project, commit) {
    const wrap = el('div', { class: 'action-row', style: { flexWrap: 'wrap' } });

    const typeSelect = el('select', { class: 'select', style: { maxWidth: '170px', flex: 'none' } });
    for (const [val, label] of ACTION_LABELS) {
      const opt = el('option', { value: val, text: label });
      if (val === action.type) opt.selected = true;
      typeSelect.appendChild(opt);
    }
    typeSelect.addEventListener('change', () => {
      const fresh = createAction(project, typeSelect.value);
      Object.keys(action).forEach(k => delete action[k]);
      Object.assign(action, fresh);
      commit('Change action');
      this.render();
    });
    wrap.appendChild(typeSelect);

    const variableSelect = (current) => {
      const select = el('select', { class: 'select' });
      for (const [val, label] of [['', '— variable —'], ...project.variables.map(v => [v.id, v.name])]) {
        const opt = el('option', { value: val, text: label });
        if (val === (current || '')) opt.selected = true;
        select.appendChild(opt);
      }
      return select;
    };

    const objectSelect = (current, filter) => {
      const select = el('select', { class: 'select' });
      const objects = filter ? project.objects.filter(filter) : project.objects;
      for (const [val, label] of [['', '— object —'], ...objects.map(o => [o.id, o.name])]) {
        const opt = el('option', { value: val, text: label });
        if (val === (current || '')) opt.selected = true;
        select.appendChild(opt);
      }
      return select;
    };

    switch (action.type) {
      case 'add': case 'subtract': case 'set': case 'multiply': {
        const varSel = variableSelect(action.variableId);
        varSel.addEventListener('change', () => { action.variableId = varSel.value || null; commit('Change action'); });
        const valueInput = el('input', { class: 'input', value: action.value ?? '', style: { maxWidth: '90px' } });
        valueInput.addEventListener('change', () => { action.value = valueInput.value; commit('Change action'); });
        wrap.append(varSel, valueInput);
        break;
      }
      case 'updateText': {
        const objSel = objectSelect(action.objectId, o => o.type === 'text' || o.type === 'counter' || o.type === 'button');
        objSel.addEventListener('change', () => { action.objectId = objSel.value || null; commit('Change action'); });
        const textInput = el('input', { class: 'input', value: action.text ?? '' });
        textInput.placeholder = 'New text ({{Var}} allowed)';
        textInput.addEventListener('change', () => { action.text = textInput.value; commit('Change action'); });
        wrap.append(objSel, textInput);
        break;
      }
      case 'show': case 'hide': {
        const objSel = objectSelect(action.objectId);
        objSel.addEventListener('change', () => { action.objectId = objSel.value || null; commit('Change action'); });
        wrap.append(objSel);
        break;
      }
      case 'setProperty': {
        const objSel = objectSelect(action.objectId);
        objSel.addEventListener('change', () => { action.objectId = objSel.value || null; commit('Change action'); });
        const propSel = el('select', { class: 'select', style: { maxWidth: '120px' } });
        for (const prop of SETTABLE_PROPS) {
          const opt = el('option', { value: prop, text: prop });
          if (prop === action.property) opt.selected = true;
          propSel.appendChild(opt);
        }
        propSel.addEventListener('change', () => { action.property = propSel.value; commit('Change action'); });
        const valueInput = el('input', { class: 'input', value: action.value ?? '', style: { maxWidth: '100px' } });
        valueInput.addEventListener('change', () => { action.value = valueInput.value; commit('Change action'); });
        wrap.append(objSel, propSel, valueInput);
        break;
      }
      case 'code': {
        const area = el('textarea', { class: 'input code-input', rows: '4', spellcheck: 'false' });
        area.value = action.code || '';
        area.placeholder = 'add("Coins", randInt(1, 5));\nobj("Status").text = "Rolled!";';
        area.addEventListener('change', () => { action.code = area.value; commit('Change action'); });
        wrap.appendChild(area);
        wrap.appendChild(el('div', {
          class: 'faint', style: { fontSize: '10px', lineHeight: '1.5', flexBasis: '100%' },
          text: 'JavaScript. Helpers: get/set/add/multiply("Var", …), obj("Name") → live object (x, y, text, visible, opacity…), objects(), vars(), rand(min,max), randInt, chance(p), log(…).',
        }));
        break;
      }
      default:
        break;
    }

    const remove = el('button', {
      class: 'x-btn', html: '✕', title: 'Remove action',
      onclick: () => {
        event.actions = event.actions.filter(a => a.id !== action.id);
        commit('Remove action');
        this.render();
      },
    });
    wrap.appendChild(remove);
    return wrap;
  }
}