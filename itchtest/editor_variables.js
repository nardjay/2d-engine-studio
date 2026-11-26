import { el, clear, contextMenu, promptDialog } from 'ui.js';
import { createVariable, VARIABLE_TYPES, coerceVarValue } from 'model.js';
import { uid } from 'util.js';

export class VariablesPanel {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
  }

  render() {
    clear(this.host);
    const project = this.editor.project;
    const wrap = el('div', { style: { padding: '4px 0 12px' } });

    const head = el('div', { class: 'row', style: { padding: '8px 12px' } }, [
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn primary', text: '+ Add Variable',
        onclick: () => {
          const variable = createVariable(project, { name: 'NewVariable', type: 'number', value: 0 });
          project.variables.push(variable);
          this.editor.commitHistory('Add variable');
          this.editor.refreshPanels();
          this.editor.scheduleAutosave();
        },
      }),
    ]);
    wrap.appendChild(head);

    if (!project.variables.length) {
      wrap.appendChild(el('div', { class: 'insp-empty', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '18px 16px' } }, [
        el('span', { text: 'No variables defined yet.' }),
        el('button', {
          class: 'btn primary', text: '+ Add Variable',
          onclick: () => {
            const variable = createVariable(project, { name: 'NewVariable', type: 'number', value: 0 });
            project.variables.push(variable);
            this.editor.commitHistory('Add variable');
            this.editor.refreshPanels();
            this.editor.scheduleAutosave();
          },
        }),
      ]));
      this.host.appendChild(wrap);
      return;
    }

    const table = el('table', { class: 'var-table' });
    table.appendChild(el('thead', {}, el('tr', {}, [
      el('th', { text: 'Name' }), el('th', { text: 'Type' }), el('th', { text: 'Initial Value' }), el('th', { text: 'Used in', title: 'Scripts referencing this variable (get/set/{{name}}/events)' }), el('th', { text: '' }),
    ])));

    const usesOf = name => {
      const hits = [];
      const rx = new RegExp('(get|set|add|subtract|multiply|increase|decrease|toggleVar)\\(\\s*["\']' + name.replace(/[^\w ]/g, '\\$&') + '["\']|{{' + name.replace(/[^\w ]/g, '\\$&') + '}}');
      for (const o of project.objects) for (const s of o.codeScripts || []) if (rx.test(s.code || '')) hits.push({ obj: o.name, script: s.name, objId: o.id, scriptId: s.id });
      for (const key of ['onStart', 'onUpdate', 'onClick', 'onKey', 'onScene']) if (rx.test(project.scripts?.[key] || '')) hits.push({ obj: 'Game', script: key, gameKey: key });
      for (const ev of project.events || []) {
        if ((ev.variableName || ev.name || '') === name || JSON.stringify(ev.actions || []).includes('"variable": "' + name)) hits.push({ obj: 'Event', script: ev.name || 'event', eventId: true });
      }
      return hits;
    };
    const tbody = el('tbody');
    for (const variable of project.variables) {
      const hits = usesOf(variable.name);
      const tr = el('tr', {
        oncontextmenu: e => {
          e.preventDefault();
          contextMenu([
            { label: 'Rename…', onClick: async () => {
                const name = await promptDialog('Rename variable', 'Name', variable.name);
                if (!name || project.variables.some(v => v.id !== variable.id && v.name === name)) return;
                variable.name = name;
                this.editor.commitHistory('Rename variable');
                this.editor.refreshPanels();
                this.editor.scheduleAutosave();
              } },
            { label: 'Duplicate', onClick: () => this.duplicateVariable(variable) },
            '-',
            { label: 'Delete', danger: true, onClick: () => this.deleteVariable(variable) },
          ], e.clientX, e.clientY);
        },
      });

      const nameInput = el('input', { class: 'input', value: variable.name });
      nameInput.addEventListener('change', () => {
        const value = nameInput.value.trim();
        if (!value) { nameInput.value = variable.name; return; }
        if (project.variables.some(v => v.id !== variable.id && v.name === value)) {
          this.editor.log(`Variable name "${value}" already exists`, 'warn');
          nameInput.value = variable.name;
          return;
        }
        variable.name = value;
        this.editor.commitHistory('Rename variable');
        this.editor.scheduleAutosave();
      });

      const usesCell = el('td');
      usesCell.appendChild(el('button', {
        class: 'btn', style: { fontSize: '10px', padding: '2px 8px', color: hits.length ? '#9be89b' : '#5c6579' },
        text: hits.length ? hits.length + ' script(s)' : 'unused',
        title: hits.map(x => x.obj + ' → ' + x.script).join('\n') || 'Nothing references this variable yet',
        onclick: () => {
          if (!hits.length) { this.editor.log('Variable "' + variable.name + '" is not used in any script yet', 'info'); return; }
          const h0 = hits[0];
          if (h0.gameKey) this.editor.openGameScript(h0.gameKey);
          else if (h0.eventId) this.editor.bottom.setActive('events');
          else {
            const o = project.objects.find(x => x.id === h0.objId);
            const s = o?.codeScripts?.find(x => x.id === h0.scriptId);
            if (o && s) this.editor.openScript(o, s);
          }
          if (hits.length > 1) this.editor.log(variable.name + ' also used in: ' + hits.slice(1).map(x => x.obj + '→' + x.script).join(', '), 'info');
        },
      }));
      tr.appendChild(usesCell);

      const typeSelect = el('select', { class: 'select' });
      for (const type of VARIABLE_TYPES) {
        const opt = el('option', { value: type, text: type });
        if (type === variable.type) opt.selected = true;
        typeSelect.appendChild(opt);
      }
      typeSelect.addEventListener('change', () => {
        variable.type = typeSelect.value;
        variable.value = coerceVarValue(variable.value, variable.type);
        this.editor.commitHistory('Change variable type');
        this.editor.refreshPanels();
        this.editor.scheduleAutosave();
      });

      let valueInput;
      if (variable.type === 'boolean') {
        valueInput = el('select', { class: 'select' });
        for (const val of ['true', 'false']) {
          const opt = el('option', { value: val, text: val });
          if (String(variable.value) === val) opt.selected = true;
          valueInput.appendChild(opt);
        }
        valueInput.addEventListener('change', () => {
          variable.value = valueInput.value === 'true';
          this.editor.commitHistory('Change variable value');
          this.editor.scheduleAutosave();
        });
      } else {
        valueInput = el('input', {
          class: 'input',
          type: variable.type === 'number' ? 'number' : 'text',
          value: variable.value,
        });
        valueInput.addEventListener('change', () => {
          variable.value = coerceVarValue(valueInput.value, variable.type);
          this.editor.commitHistory('Change variable value');
          this.editor.scheduleAutosave();
        });
      }

      const deleteBtn = el('button', {
        class: 'x-btn', title: 'Delete variable', html: '✕',
        onclick: () => this.deleteVariable(variable),
      });

      tr.append(
        el('td', {}, nameInput),
        el('td', {}, typeSelect),
        el('td', {}, valueInput),
        el('td', {}, deleteBtn),
      );
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    this.host.appendChild(wrap);
  }

  deleteVariable(variable) {
    const project = this.editor.project;
    project.variables = project.variables.filter(v => v.id !== variable.id);
    // Clear dangling references
    for (const obj of project.objects) {
      if (obj.variableId === variable.id) obj.variableId = null;
      if (obj.valueVarId === variable.id) obj.valueVarId = null;
      if (obj.maxVarId === variable.id) obj.maxVarId = null;
      if (obj.costVariableId === variable.id) obj.costVariableId = null;
      for (const s of obj.codeScripts || []) if (variable.name) s.code = s.code; // code refs are by name; left intact
    }
    for (const ev of project.events) {
      ev.conditions = ev.conditions.filter(c => c.variableId !== variable.id);
      ev.actions = ev.actions.filter(a => a.variableId !== variable.id);
    }
    this.editor.commitHistory('Delete variable');
    this.editor.refreshPanels();
    this.editor.scheduleAutosave();
  }

  duplicateVariable(variable) {
    const project = this.editor.project;
    const copy = createVariable(project, { name: variable.name + '2', type: variable.type, value: variable.value });
    copy.id = uid('var');
    project.variables.push(copy);
    this.editor.commitHistory('Duplicate variable');
    this.editor.refreshPanels();
    this.editor.scheduleAutosave();
  }
}