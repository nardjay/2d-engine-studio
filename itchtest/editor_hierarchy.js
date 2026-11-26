import { el, clear, iconBtn, promptDialog, confirmDialog, toast, contextMenu } from 'ui.js';
import { icon } from 'icons.js';
import { deepClone, uid } from 'util.js';
import { TYPE_DEFS, createVariable } from 'model.js';

/** Bottom-panel "Hierarchy" tab: scene objects, top-most first, with per-row actions. */
export class Hierarchy {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.expanded = new Set();
  }

  render() {
    clear(this.host);
    const project = this.editor.project;
    if (!project) return;

    // "Game" root node (Roblox-style) — holds the global On start / On update scripts
    const cur = this.editor.scriptEditor?.current;
    this.host.appendChild(el('div', {
      class: 'hier-row hier-game' + (cur?.gameKey ? ' selected' : ''),
      onclick: () => this.editor.openGameScript('onStart'),
    }, [
      el('span', { class: 'hier-caret', text: '▾' }),
      el('span', { class: 'type-ico', html: icon('play', 12) }),
      el('span', { class: 'hier-name', text: 'Game' }),
    ]));
    for (const key of ['onStart', 'onUpdate', 'onClick', 'onKey', 'onScene']) {
      const label = { onStart: 'On start', onUpdate: 'On update', onClick: 'On click', onKey: 'On key', onScene: 'On scene' }[key];
      this.host.appendChild(el('div', {
        class: 'hier-child' + (cur?.gameKey === key ? ' selected' : '') + (!project.scripts?.[key]?.trim() ? ' empty' : ''),
        onclick: () => this.editor.openGameScript(key),
      }, [
        el('span', { class: 'type-ico', html: icon('code', 12) }),
        el('span', { class: 'hier-name', text: label }),
        el('span', { class: 'hier-hook', text: { onStart: 'once', onUpdate: 'every frame', onClick: 'anywhere', onKey: 'any key', onScene: 'after gotoScene' }[key] }),
      ]));
    }

    const sceneName = this.editor.activeScene ? this.editor.activeScene().name : null;
    const inScene = o => !sceneName || (o.scene || 'main') === sceneName || o.persist === true;
    const head = el('div', { class: 'row', style: { padding: '4px 10px' } }, [
      el('span', { class: 'faint', style: { fontSize: '10px' }, text: (() => {
        const inSc = project.objects.filter(o => !sceneName || (o.scene || 'main') === sceneName);
        const types = {};
        for (const o of inSc) types[o.type] = (types[o.type] || 0) + 1;
        const brief = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, n]) => n + '×' + t).join(' · ');
        return sceneName ? `${sceneName}: ${inSc.length} obj` + (brief ? ` · ${brief}` : '') : `${inSc.length} obj`;
      })() }),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn', style: { fontSize: '10px', padding: '2px 8px' }, text: 'Select all',
        onclick: () => this.editor.setSelection(project.objects.map(o => o.id)),
      }),
    ]);
    this.host.appendChild(head);

    if (!project.objects.length) {
      this.host.appendChild(el('div', { class: 'insp-empty', text: 'No objects yet. Drag one from the Objects sidebar onto the canvas.' }));
      return;
    }

    // search / filter box
    const search = el('input', { class: 'hier-search', type: 'text', placeholder: 'Search objects & scripts… (name, type)', value: this._q || '' });
    search.addEventListener('input', () => {
      this._q = search.value;
      this.render();
      const s = this.host.querySelector('.hier-search');
      if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    });
    this.host.appendChild(search);

    const q = (this._q || '').toLowerCase();
    const matches = o => !q
      || (o.name || '').toLowerCase().includes(q)
      || (o.type || '').toLowerCase().includes(q)
      || (o.codeScripts || []).some(s2 => (s2.name || '').toLowerCase().includes(q) || (s2.code || '').toLowerCase().includes(q));

    const list = el('div', {
      class: 'hier-list',
      oncontextmenu: e => {
        if (e.target.closest('.hier-row, .hier-child')) return; // row handlers own those
        e.preventDefault();
        const addItems = Object.entries(TYPE_DEFS).map(([type, def]) =>
          ({ label: `Add ${def.label}`, onClick: () => this.editor.addObject(type) }));
        contextMenu([
          { label: 'Select all', onClick: () => this.editor.setSelection(project.objects.map(o => o.id)), disabled: !project.objects.length },
          { label: 'Collapse all', onClick: () => { this.expanded.clear(); this.render(); } },
          '-',
          ...addItems,
        ], e.clientX, e.clientY);
      },
    });
    const sorted = [...project.objects].filter(inScene).sort((a, b) => (b.layer || 0) - (a.layer || 0));
    // group folders first (Unity-style): click = select members, dblclick = go in
    const groups = (project.groups || []).filter(g => (g.scene || 'main') === sceneName || !sceneName);
    for (const g of groups) {
      const members = sorted.filter(o => o.groupId === g.id);
      if (q && !members.some(matches) && !(g.name || '').toLowerCase().includes(q)) continue;
      if (!members.length && !this.editor.selection.includes('')) { /* empty groups still show so you can delete them */ }
      const collapsed = this.expanded.has(g.id);
      const allSel = members.length && members.every(o => this.editor.selection.includes(o.id));
      const grow = el('div', {
        class: 'hier-row hier-group' + (allSel ? ' selected' : ''),
        title: `Group: ${members.length} object(s) · click: select all · double-click: go in · Ctrl+Shift+G: ungroup`,
        onclick: e => { if (e.target.closest('.hier-actions')) return; this.editor.setSelection(members.map(o => o.id)); },
        ondblclick: () => this.editor.focusGroup(g),
        oncontextmenu: e => {
          e.preventDefault();
          contextMenu([
            { label: 'Select members', onClick: () => this.editor.setSelection(members.map(o => o.id)) },
            { label: 'Go in (zoom to fit)', onClick: () => this.editor.focusGroup(g) },
            { label: 'Rename…', onClick: async () => { const n = await promptDialog('Rename group', 'Group name', g.name); if (n?.trim()) { g.name = n.trim(); this.editor.commitHistory('Rename group'); this.render(); this.editor.scheduleAutosave(); } } },
            { label: 'Ungroup (keep objects)', onClick: () => this.editor.ungroupGroup(g) },
            { label: 'Delete group + objects', danger: true, onClick: async () => {
              if (!(await confirmDialog('Delete group', `Delete "${g.name}" and its ${members.length} object(s)?`))) return;
              this.editor.deleteGroup(g);
            } },
          ], e.clientX, e.clientY);
        },
      }, [
        el('span', { class: 'hier-caret', text: collapsed ? '▸' : '▾', onclick: e => { e.stopPropagation(); if (collapsed) this.expanded.delete(g.id); else this.expanded.add(g.id); this.render(); } }),
        el('span', { class: 'type-ico', html: icon('folder', 12) }),
        el('span', { class: 'hier-name', text: g.name }),
        el('span', { class: 'hier-hook', text: `×${members.length}` }),
      ]);
      list.appendChild(grow);
      if (collapsed) continue;
      for (const obj of members) for (const n of this.rowFor(obj, project, true)) list.appendChild(n);
    }
    const loose = sorted.filter(o => !o.groupId || !groups.some(g => g.id === o.groupId));
    // Explorer windowing (audit fix): huge projects render fast by showing the
    // top 300 loose objects; searching removes the cap, a footer loads the rest.
    const LIMIT = 300;
    if (!this._q && !this._showAll && loose.length > LIMIT) {
      const shown = [];
      let skipped = 0;
      for (const obj of loose) { if (matches(obj)) { if (shown.length < LIMIT) shown.push(obj); else skipped++; } }
      for (const obj of shown) for (const n of this.rowFor(obj, project)) list.appendChild(n);
      if (skipped > 0) {
        list.appendChild(el('button', {
          class: 'btn hier-more', text: `Show all ${loose.length} objects`,
          onclick: () => { this._showAll = true; this.render(); },
        }));
      }
      this.host.appendChild(list);
      return;
    }
    for (const obj of loose) if (matches(obj)) for (const n of this.rowFor(obj, project)) list.appendChild(n);
    this.host.appendChild(list);
  }

  /** Explorer rows for one object: main row + script children when expanded. Returns node array. */
  rowFor(obj, project, indent) {
    {
      const def = TYPE_DEFS[obj.type];
      const selected = this.editor.selection.includes(obj.id);
      const scripts = obj.codeScripts || [];
      const hasCode = scripts.some(s => s.code?.trim());
      const expanded = this.expanded.has(obj.id);

      const row = el('div', {
        class: 'hier-row' + (selected ? ' selected' : '') + (obj.visible === false ? ' hidden-obj' : ''),
        onclick: e => {
          if (e.target.closest('.hier-actions')) return;
          if (e.shiftKey || e.ctrlKey || e.metaKey) this.editor.toggleSelection(obj.id);
          else this.editor.setSelection([obj.id]);
        },
        ondblclick: () => this.editor.focusObject(obj.id),
        oncontextmenu: e => {
          e.preventDefault();
          if (!this.editor.selection.includes(obj.id)) this.editor.setSelection([obj.id]);
          this.editor.showObjectMenu(obj, e.clientX, e.clientY);
        },
      }, [
        el('span', {
          class: 'hier-caret' + (scripts.length ? '' : ' leaf'),
          text: scripts.length ? (expanded ? '▾' : '▸') : '·',
          onclick: e => {
            e.stopPropagation();
            if (!scripts.length) return;
            if (expanded) this.expanded.delete(obj.id); else this.expanded.add(obj.id);
            this.render();
          },
        }),
        el('span', { class: 'type-ico', html: icon(def ? def.icon : 'panel', 13) }),
        el('span', { class: 'hier-name', text: obj.name, title: obj.name }),
      ]);
      if (hasCode) row.appendChild(el('span', { class: 'hier-code', title: `${scripts.filter(s => s.code?.trim()).length} script(s) with code`, html: icon('code', 11) }));
      if (obj.layer) row.appendChild(el('span', { class: 'hier-layer', text: 'L' + obj.layer, title: 'Layer ' + obj.layer }));

      const actions = el('div', { class: 'hier-actions' });
      actions.appendChild(iconBtn('plus', 'Add to object…', e => {
        const r = e.currentTarget.getBoundingClientRect();
        contextMenu([
          { label: 'Add Script', onClick: () => { this.expanded.add(obj.id); this.editor.addScript(obj); } },
          { label: 'Add Script: On click', onClick: () => { this.expanded.add(obj.id); this.editor.addScript(obj, 'click'); } },
          { label: 'Add Script: On update', onClick: () => { this.expanded.add(obj.id); this.editor.addScript(obj, 'update'); } },
          { label: 'Add Script: On enter (trigger)', onClick: () => { this.expanded.add(obj.id); this.editor.addScript(obj, 'enter'); } },
          { label: 'Add Variable…', onClick: () => this.addVariableFor(obj) },
          '-',
          { label: 'Rename…', onClick: () => this.rename(obj) },
          { label: 'Duplicate', onClick: () => this.duplicate(obj) },
          { label: obj.visible === false ? 'Show' : 'Hide', onClick: () => this.toggleVisible(obj) },
          '-',
          { label: 'Delete', danger: true, onClick: () => this.remove(obj) },
        ], r.left, r.bottom + 4);
      }, 'btn icon-only hier-add'));
      actions.appendChild(iconBtn(obj.visible === false ? 'eyeOff' : 'eye', obj.visible === false ? 'Show' : 'Hide', () => this.toggleVisible(obj)));
      actions.appendChild(iconBtn('edit', 'Rename', () => this.rename(obj)));
      actions.appendChild(iconBtn('copy', 'Duplicate', () => this.duplicate(obj)));
      actions.appendChild(iconBtn('trash', 'Delete', () => this.remove(obj)));
      row.appendChild(actions);
      if (indent) row.classList.add('hier-indented');

      const out = [row];
      // script children
      if (expanded) {
        for (const sc of scripts) out.push(this.scriptChildNode(obj, sc));
        if (!scripts.length) out.push(el('div', { class: 'hier-child faint hier-indented', text: 'no scripts — click + to add one' }));
      }
      return out;
    }
  }

  /** Script child row as a detached node (appended by caller into the list). */
  scriptChildNode(obj, script) {
    return this.buildScriptChild(obj, script, host => host);
  }

  renderScriptChild(list, obj, script) {
    list.appendChild(this.scriptChildNode(obj, script));
  }

  buildScriptChild(obj, script) {
    const hookLabel = { update: 'every frame', click: 'on click', init: 'on create', hover: 'on hover', unhover: 'on unhover', enter: 'on enter', exit: 'on exit' }[script.hook] || script.hook;
    const active = this.editor.scriptEditor?.current?.scriptId === script.id;
    const row = el('div', {
      class: 'hier-child' + (active ? ' selected' : '') + (!script.code?.trim() ? ' empty' : ''),
      onclick: () => this.editor.openScript(obj, script),
      oncontextmenu: e => {
        e.preventDefault();
        contextMenu([
          { label: 'Open', onClick: () => this.editor.openScript(obj, script) },
          { label: 'Rename…', onClick: async () => {
              const name = await promptDialog('Rename script', 'Name', script.name);
              if (name) { script.name = name; this.editor.commitHistory('Rename script'); this.editor.updateScriptTabTitle?.(script); this.render(); }
            } },
          { label: 'Duplicate', onClick: () => {
              const copy = deepClone(script); copy.id = uid('scr'); copy.name = script.name + ' Copy';
              obj.codeScripts.push(copy); this.editor.commitHistory('Duplicate script'); this.render();
            } },
          '-',
          { label: 'Delete', danger: true, onClick: () => {
              obj.codeScripts = obj.codeScripts.filter(x => x.id !== script.id);
              this.editor.closeScript(script.id);
              this.editor.commitHistory('Delete script');
              this.render();
            } },
        ], e.clientX, e.clientY);
      },
    }, [
      el('span', { class: 'type-ico', html: icon('code', 12) }),
      el('span', { class: 'hier-name', text: script.name }),
      el('span', { class: 'hier-hook', text: hookLabel }),
    ]);
    return row;
  }

  async addVariableFor(obj) {
    const project = this.editor.project;
    const base = (obj.name || 'Var').replace(/[^A-Za-z0-9_ ]/g, '').trim().replace(/\s+/g, '_') || 'Var';
    const name = await promptDialog('Add variable', `Variable for "${obj.name}" (name)`, `${base}_value`);
    if (!name) return;
    const v = createVariable(project, { name, type: 'number', value: 0 });
    project.variables.push(v);
    this.editor.commitHistory('Add variable');
    this.editor.refreshPanels();
    this.editor.scheduleAutosave();
    toast(`Variable "${v.name}" created`, 'success');
  }

  toggleVisible(obj) {
    obj.visible = obj.visible === false;
    this.editor.workspace.render();
    this.editor.inspector.render();
    this.render();
    this.editor.scheduleAutosave();
    this.editor.debouncedCommit();
  }

  async rename(obj) {
    const name = await promptDialog('Rename object', 'Name', obj.name);
    if (!name || name === obj.name) return;
    obj.name = name;
    this.editor.commitHistory('Rename object');
    this.editor.workspace.render();
    this.editor.inspector.render();
    this.editor.scheduleAutosave();
    this.render();
  }

  duplicate(obj) {
    const copy = deepClone(obj);
    copy.id = uid('obj');
    copy.name = obj.name + ' Copy';
    copy.x = obj.x + 16;
    copy.y = obj.y + 16;
    // fresh ids for script children so tabs/selection don't collide
    copy.codeScripts = (obj.codeScripts || []).map(s => ({ ...deepClone(s), id: uid('scr') }));
    copy.layer = this.editor.project.objects.reduce((m, o) => Math.max(m, o.layer || 0), 0) + 1;
    this.editor.project.objects.push(copy);
    this.editor.setSelection([copy.id]);
    this.editor.commitHistory('Duplicate object');
    this.editor.workspace.render();
    this.editor.scheduleAutosave();
    this.render();
  }

  async remove(obj) {
    // if this object is part of a multi-selection, delete ALL of them
    if (this.editor.selection.length > 1 && this.editor.selection.includes(obj.id)) {
      return this.editor.deleteSelection();
    }
    const project = this.editor.project;
    const linkedEvents = project.events.filter(e => e.targetId === obj.id).length;
    const msg = linkedEvents
      ? `Delete "${obj.name}"? ${linkedEvents} event(s) target it and will be detached.`
      : `Delete "${obj.name}"?`;
    if (!(await confirmDialog('Delete object', msg))) return;
    project.objects = project.objects.filter(o => o.id !== obj.id);
    for (const event of project.events) {
      if (event.targetId === obj.id) event.targetId = null;
      event.actions = event.actions.filter(a => !(a.objectId && a.objectId === obj.id));
    }
    this.editor.selection = this.editor.selection.filter(id => id !== obj.id);
    this.editor.workspace.selection.delete(obj.id);
    this.editor.workspace.render();
    this.editor.inspector.render();
    this.editor.commitHistory('Delete object');
    this.editor.scheduleAutosave();
    this.render();
    toast(`Deleted "${obj.name}"`, 'success');
  }
}
