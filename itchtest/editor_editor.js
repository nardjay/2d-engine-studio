import { el, clear, toast, iconBtn, contextMenu, promptDialog, confirmDialog, openModal } from 'ui.js';
import { icon } from 'icons.js';
import { normalizeProject, createProject, createObject, TYPE_DEFS, getObjectById, cloneObject } from 'model.js';
import { History } from 'history.js';
import { putProject } from 'storage.js';
import { debounce, deepClone, uid, toNumber, clamp } from 'util.js';
import { Workspace } from 'editor_workspace.js';
import { Inspector } from 'editor_inspector.js';
import { Hierarchy } from 'editor_hierarchy.js';
import { AssetsPanel } from 'editor_assets.js';
import { EventsPanel } from 'editor_events.js';
import { VariablesPanel } from 'editor_variables.js';
import { DebugPanel } from 'editor_debug.js';
import { BottomPanel } from 'editor_bottomPanel.js';
import { ScriptEditor } from 'editor_scriptEditor.js';
import { GameRuntime } from 'runtime_runtime.js';

export class Editor {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.project = null;
    this.selection = [];
    this.built = false;
    this.runtime = null;
    this.saveState = 'saved';
    this.autosave = debounce(() => this.save(), 900);
  }

  /* ================= lifecycle ================= */
  open(project) {
    this.project = normalizeProject(project);
    this.selection = [];
    this.root.classList.remove('hidden');
    if (!this.built) this.buildUI();
    this.history = new History({
      getState: () => this.project,
      setState: state => {
        this.project = state;
        this.selection = this.selection.filter(id => this.project.objects.some(o => o.id === id));
        this.refreshAll();
      },
      onChange: () => this.updateHistoryButtons(),
    });
    this.history.reset();
    this.refreshAll();
    this.openScriptTabs = [];
    this.scriptEditor.close();
    this.renderScriptTabs();
    this.setView('scene');
    this.workspace.fitView();
    this.log(`Opened project "${this.project.name}"`, 'ok');
    this.setSaveState('saved');
    if (!this._unloadGuard) { // flush pending autosave when the tab closes/refreshes with unsaved edits
      this._unloadGuard = () => { if (this.project && this.saveState === 'dirty') this.autosave.flush?.(); };
      window.addEventListener('beforeunload', this._unloadGuard);
    }
  }

  close() {
    this.stopRuntime();
    this.autosave.flush?.();
    this.root.classList.add('hidden');
    this.project = null;
    this.built = false;
    clear(this.root);
  }

  buildUI() {
    clear(this.root);
    // Custom menus everywhere: suppress the browser default inside the editor.
    // (Panel-specific contextmenu handlers still fire normally.)
    this.root.addEventListener('contextmenu', e => e.preventDefault());
    this.root.appendChild(this.buildTopbar());

    const main = el('div', { class: 'editor-main' });

    // left sidebar: create palette (Unity "GameObject / Toolbox" style)
    this.leftSidebar = el('div', { class: 'left-sidebar' });
    this.leftSidebar.appendChild(el('div', { class: 'panel-title', text: 'Create' }));
    const createWrap = el('div', { class: 'obj-create' });
    for (const [type, def] of Object.entries(TYPE_DEFS)) {
      const button = el('button', { title: `Add ${def.label} — click or drag onto the canvas`, draggable: 'true' });
      button.innerHTML = icon(def.icon, 15);
      button.appendChild(el('span', { text: def.label }));
      button.addEventListener('click', () => this.addObject(type));
      button.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/clicker-type', type);
        e.dataTransfer.effectAllowed = 'copy';
      });
      createWrap.appendChild(button);
    }
    this.leftSidebar.appendChild(createWrap);

    // center: Scene / Game view tabs (Unity style)
    const center = el('div', { class: 'center-col' });
    this.viewTabs = el('div', { class: 'view-tabs' });
    this.sceneTab = el('button', { class: 'view-tab active', text: 'Scene', onclick: () => this.setView('scene') });
    this.gameTab = el('button', { class: 'view-tab', text: 'Game', onclick: () => { if (this.runtime) this.setView('game'); else this.play(false); } });
    this.scriptTabs = el('div', { class: 'script-tabs' });
    this.viewTabs.append(this.sceneTab, this.gameTab, this.scriptTabs);
    // scene bar: chips per scene + add button (real scenes with own sizes)
    this.sceneBar = el('div', { class: 'scene-bar' });
    const views = el('div', { class: 'views' });
    this.workspaceHost = el('div', { class: 'view' });
    this.gameHost = el('div', { class: 'view game-col hidden' });
    this.scriptHost = el('div', { class: 'view script-view hidden' });
    views.append(this.workspaceHost, this.gameHost, this.scriptHost);
    center.append(this.viewTabs, this.sceneBar, views);

    // right: Explorer (top) + Properties (bottom) — Roblox Studio style
    this.rightSidebar = el('div', { class: 'right-sidebar' });
    const explorer = el('div', { class: 'explorer' });
    explorer.appendChild(el('div', { class: 'panel-title', text: 'Explorer' }));
    this.explorerHost = el('div', { class: 'explorer-body' });
    explorer.appendChild(this.explorerHost);
    const props = el('div', { class: 'properties' });
    props.appendChild(el('div', { class: 'panel-title', text: 'Properties' }));
    this.inspectorHost = el('div', { class: 'properties-body' });
    props.appendChild(this.inspectorHost);
    const splitProps = el('div', { class: 'splitter splitter-props' });
    this.rightSidebar.append(explorer, splitProps, props);
    // drag to resize Explorer vs Properties
    (() => {
      let startY = 0, startH = 0;
      splitProps.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        splitProps.setPointerCapture(ev.pointerId);
        startY = ev.clientY; startH = explorer.getBoundingClientRect().height;
        const move = m => {
          const nh = Math.min(Math.max(80, startH + (m.clientY - startY)), this.rightSidebar.clientHeight - 120);
          explorer.style.height = nh + 'px';
          explorer.style.flex = '0 0 ' + nh + 'px';
        };
        const up = () => {
          splitProps.removeEventListener('pointermove', move);
          splitProps.removeEventListener('pointerup', up);
        };
        splitProps.addEventListener('pointermove', move);
        splitProps.addEventListener('pointerup', up);
      });
      splitProps.addEventListener('dblclick', () => { explorer.style.height = ''; explorer.style.flex = ''; });
    })();

    // bottom: tabbed dock (Code / Variables / Events / Assets / Console)
    this.bottomHost = el('div', { class: 'bottom-panel' });
    this.statusBar = el('div', { class: 'statusbar' });

    main.append(this.leftSidebar, center, this.rightSidebar, this.bottomHost, this.statusBar);
    this.root.appendChild(main);
    this.addSplitters(main);

    this.workspace = new Workspace(this.workspaceHost, this);
    this.inspector = new Inspector(this.inspectorHost, this);
    this.hierarchy = new Hierarchy(this.explorerHost, this);
    this.assets = new AssetsPanel(el('div'), this);
    this.events = new EventsPanel(el('div'), this);
    this.variables = new VariablesPanel(el('div'), this);
    this.debug = new DebugPanel(el('div'), this);
    this.scriptEditor = new ScriptEditor(this.scriptHost, this);
    this.openScriptTabs = []; // [{ objId, scriptId } | { gameKey, scriptId }]

    this.bottom = new BottomPanel(this.bottomHost, this, {
      variables: this.variables,
      events: this.events,
      assets: this.assets,
      debug: this.debug,
    });

    this.bindKeyboard();
    this.built = true;
  }

  setView(v) {
    this.view = v;
    this.sceneTab.classList.toggle('active', v === 'scene');
    this.gameTab.classList.toggle('active', v === 'game');
    this.workspaceHost.classList.toggle('hidden', v !== 'scene');
    this.gameHost.classList.toggle('hidden', v !== 'game');
    this.scriptHost.classList.toggle('hidden', v !== 'script');
    [...this.scriptTabs.children].forEach(t =>
      t.classList.toggle('active', v === 'script' && t.dataset.scriptId === this.scriptEditor.current?.scriptId));
    if (v === 'game' && this.runtime && this._fitGame) this._fitGame();
    if (v === 'scene' && this.workspace) this.workspace.renderSelection();
    this.updateStatus();
  }

  /* ================= resizable panels ================= */
  addSplitters(main) {
    const defaults = { '--col-left': 210, '--col-right': 320, '--dock': 150 };
    const val = name => parseFloat(main.style.getPropertyValue(name)) || defaults[name];
    const mk = (cls, prop, min, max, calc) => {
      const s = el('div', { class: cls, title: 'Drag to resize · double-click to reset' });
      s.addEventListener('pointerdown', e => {
        e.preventDefault();
        const x0 = e.clientX, y0 = e.clientY, base = val(prop);
        const move = ev => main.style.setProperty(prop, clamp(calc(base, ev, x0, y0), min, max) + 'px');
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          document.body.style.userSelect = '';
          this.workspace?.fitView?.();
        };
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      s.addEventListener('dblclick', () => { main.style.removeProperty(prop); this.workspace?.fitView?.(); });
      main.appendChild(s);
    };
    mk('splitter splitter-left', '--col-left', 120, 420, (b, ev, x0) => b + (ev.clientX - x0));
    mk('splitter splitter-right', '--col-right', 220, 560, (b, ev, x0) => b - (ev.clientX - x0));
    mk('splitter splitter-bottom', '--dock', 90, 520, (b, ev, x0, y0) => b - (ev.clientY - y0));
  }

  /* ================= script children ================= */
  addScript(obj, hook = 'update') {
    const names = { update: 'Script', click: 'OnClick', init: 'OnStart', enter: 'OnEnter', exit: 'OnExit', hover: 'OnHover', unhover: 'OnUnhover' };
    const script = { id: uid('scr'), name: names[hook] || 'Script', hook, code: '' };
    obj.codeScripts = obj.codeScripts || [];
    obj.codeScripts.push(script);
    this.commitHistory('Add script');
    this.scheduleAutosave();
    this.hierarchy.render();
    this.inspector.render();
    this.openScript(obj, script);
    return script;
  }

  openScript(obj, script) {
    if (!this.openScriptTabs.some(t => t.scriptId === script.id)) {
      this.openScriptTabs.push({ objId: obj.id, scriptId: script.id });
      this.renderScriptTabs();
    }
    this.scriptEditor.open(obj, script);
    this.setView('script');
  }

  openGameScript(key) {
    const scriptId = 'game-' + key;
    if (!this.openScriptTabs.some(t => t.scriptId === scriptId)) {
      this.openScriptTabs.push({ gameKey: key, scriptId });
      this.renderScriptTabs();
    }
    this.scriptEditor.openGame(key);
    this.setView('script');
  }

  closeScript(scriptId) {
    this.openScriptTabs = this.openScriptTabs.filter(t => t.scriptId !== scriptId);
    if (this.scriptEditor.current?.scriptId === scriptId) {
      this.scriptEditor.close();
      const next = this.openScriptTabs[this.openScriptTabs.length - 1];
      if (next) {
        const obj = this.project.objects.find(o => o.id === next.objId);
        const script = obj?.codeScripts.find(s => s.id === next.scriptId);
        if (obj && script) { this.scriptEditor.open(obj, script); this.setView('script'); }
        else this.setView('scene');
      } else this.setView('scene');
    }
    this.renderScriptTabs();
  }

  updateScriptTabTitle(script) {
    const tab = [...this.scriptTabs.children].find(t => t.dataset.scriptId === script.id);
    if (tab) tab.querySelector('.st-name').textContent = script.name;
  }

  renderScriptTabs() {
    clear(this.scriptTabs);
    for (const t of this.openScriptTabs) {
      let label;
      if (t.gameKey) label = { onStart: 'On start', onUpdate: 'On update', onClick: 'On click', onKey: 'On key', onScene: 'On scene' }[t.gameKey] || t.gameKey;
      else {
        const obj = this.project.objects.find(o => o.id === t.objId);
        const script = obj?.codeScripts?.find(s => s.id === t.scriptId);
        if (!script) continue;
        label = script.name;
      }
      const tab = el('button', { class: 'view-tab script-tab', dataset: { scriptId: t.scriptId } });
      tab.appendChild(el('span', { class: 'icon-slot', html: icon('code', 11) }));
      tab.appendChild(el('span', { class: 'st-name', text: label }));
      const x = el('span', { class: 'st-close', html: '✕', title: 'Close tab' });
      x.addEventListener('click', e => { e.stopPropagation(); this.closeScript(t.scriptId); });
      tab.appendChild(x);
      tab.addEventListener('click', () => {
        if (t.gameKey) this.openGameScript(t.gameKey);
        else {
          const obj = this.project.objects.find(o => o.id === t.objId);
          const script = obj?.codeScripts.find(s => s.id === t.scriptId);
          if (obj && script) this.openScript(obj, script);
        }
      });
      this.scriptTabs.appendChild(tab);
    }
  }

  buildTopbar() {
    const bar = el('div', { class: 'topbar' });

    this.nameInput = el('input', { class: 'proj-name', value: this.project?.name || '' });
    this.nameInput.addEventListener('change', () => {
      const name = this.nameInput.value.trim();
      if (!name) { this.nameInput.value = this.project.name; return; }
      this.project.name = name;
      this.commitHistory('Rename project');
      this.scheduleAutosave();
    });
    bar.appendChild(this.nameInput);
    bar.appendChild(el('div', { class: 'tb-sep' }));

    bar.appendChild(iconBtn('home', 'Back to dashboard', () => this.app.showDashboard()));
    bar.appendChild(el('div', { class: 'tb-sep' }));

    this.saveBtn = iconBtn('save', 'Save (Ctrl+S)', () => this.save(true));
    this.undoBtn = iconBtn('undo', 'Undo (Ctrl+Z)', () => this.undo());
    this.redoBtn = iconBtn('redo', 'Redo (Ctrl+Shift+Z)', () => this.redo());
    bar.append(this.saveBtn, this.undoBtn, this.redoBtn);

    this.saveStateLabel = el('span', { class: 'save-state', text: 'Saved' });
    bar.appendChild(this.saveStateLabel);
    bar.appendChild(el('div', { class: 'spacer' }));

    // Unity-style centered play controls
    const playGroup = el('div', { class: 'play-group' });
    this.playBtn = iconBtn('play', 'Play (runs your code in the Game view)', () => this.play(false));
    this.previewBtn = iconBtn('monitor', 'Preview (floating window)', () => this.play(true));
    this.stopBtn = iconBtn('stop', 'Stop runtime', () => this.stopRuntime());
    this.resetPlayBtn = iconBtn('refresh', 'Reset runtime', () => {
      if (!this.runtime) return;
      const errBar = this._gameErrorBar;
      if (errBar) { errBar.classList.add('hidden'); errBar.innerHTML = ''; }
      this.runtime.reset();
    });
    playGroup.append(this.playBtn, this.resetPlayBtn, this.stopBtn, this.previewBtn);
    bar.appendChild(playGroup);
    bar.appendChild(el('div', { class: 'spacer' }));

    bar.appendChild(iconBtn('code', 'Game code', () => this.openGameScript('onUpdate')));
    bar.appendChild(iconBtn('upload', 'Export standalone HTML game', () => this.exportGame()));
    bar.appendChild(iconBtn('settings', 'Project settings', () => this.openSettingsModal()));

    return bar;
  }

  async exportGame() {
    try {
      const { exportProjectHTML } = await import('../exporter.js');
      await exportProjectHTML(this.project);
      toast('Exported — a standalone .html game file was downloaded', 'success');
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
    }
  }

  /* ================= panels ================= */
  openInspector() { this.rightSidebar.classList.add('open'); }
  closeInspector() { this.rightSidebar.classList.remove('open'); }

  updateStatus() {
    if (!this.statusBar || !this.project) return;
    clear(this.statusBar);
    this.statusBar.append(
      el('span', { text: this.selection.length ? `${this.selection.length} selected` : 'Canvas' }),
      el('div', { class: 'spacer' }),
      el('span', { text: this.runtime ? '● RUNNING' : '● EDITING', class: this.runtime ? 'sb-run' : '' }),
    );
  }

  openSettingsModal() {
    const s = this.project.settings;
    const num = (label, value, min) => {
      const i = el('input', { class: 'input', type: 'number', value, min: String(min) });
      return { i, row: el('div', { class: 'cond-row' }, [el('span', { class: 'field-label', text: label }), i]) };
    };
    const w = num('Width', s.width, 160);
    const h = num('Height', s.height, 120);
    const grid = num('Grid size', s.gridSize, 2);
    const bg = el('input', { class: 'input', type: 'color', value: String(s.background || '#12161f').startsWith('img:') ? '#12161f' : s.background });
    const bgImg = el('select', { class: 'input', id: 'bg-asset-pick' });
    bgImg.appendChild(el('option', { value: '', text: '— none (solid color) —', selected: !String(s.background || '').startsWith('img:') }));
    for (const a of (this.project.assets || []).filter(x => x.kind === 'image')) bgImg.appendChild(el('option', { value: 'img:' + a.id, text: a.name, selected: s.background === 'img:' + a.id }));
    bgImg.title = 'Use an imported image as the background of the main scene';
    const showGrid = el('input', { type: 'checkbox' }); showGrid.checked = s.showGrid !== false;
    const snap = el('input', { type: 'checkbox' }); snap.checked = s.snap !== false;
    const chk = (label, input) => el('div', { class: 'cond-row' }, [el('span', { class: 'field-label', text: label }), input]);
    const slider = (label, value, min, max, stepV, unit) => {
      const range = el('input', { type: 'range', min: String(min), max: String(max), step: String(stepV), value: String(value) });
      const lab = el('span', { class: 'faint', style: { fontSize: '11px', width: '46px', textAlign: 'right' }, text: Math.round(value * 100) / 100 + unit });
      range.addEventListener('input', () => { lab.textContent = Math.round(range.value * 100) / 100 + unit; });
      return { range, row: el('div', { class: 'cond-row' }, [el('span', { class: 'field-label', text: label }), el('div', { class: 'row', style: { gap: '6px', flex: '1' } }, [range, lab])]), get: () => toNumber(range.value, value) };
    };
    const vol = slider('Master volume', s.volume ?? 1, 0, 1, 0.05, '');
    const grav = slider('Gravity scale', s.gravityScale ?? 1, 0, 3, 0.1, '×');
    const sceneList = [...new Set((this.project.objects || []).map(o => o.scene || 'main'))];
    const startScene = el('input', { class: 'input', type: 'text', value: s.startScene ?? '', placeholder: 'none — all objects visible', list: 'scene-list' });
    const dl = el('datalist', { id: 'scene-list' });
    for (const sc of sceneList) dl.appendChild(el('option', { value: sc }));
    const numField = (label, value, ph) => {
      const i = el('input', { class: 'input', type: 'number', value: value || '', min: '0', placeholder: ph });
      return { row: el('div', { class: 'cond-row' }, [el('span', { class: 'field-label', text: label }), i]), i };
    };
    const worldW = numField('World width', s.worldWidth, '0 = same as view');
    const worldH = numField('World height', s.worldHeight, '0 = same as view');

    const presets = el('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, [
      ...[['Phone 390×844', 390, 844], ['Square 600×600', 600, 600], ['Desktop 960×600', 960, 600], ['Wide 1280×720', 1280, 720]]
        .map(([label, pw, ph]) => el('button', {
          class: 'btn', text: label,
          onclick: () => { w.i.value = pw; h.i.value = ph; },
        })),
    ]);

    const content = el('div', {}, [
      el('div', { class: 'faint', style: { fontSize: '10px', marginBottom: '6px' }, text: 'SIZE PRESETS' }),
      presets,
      el('div', { style: { height: '8px' } }),
      w.row, h.row, grid.row,
      el('div', { class: 'cond-row' }, [el('span', { class: 'field-label', text: 'Background' }), bg]),
      el('div', { class: 'cond-row' }, [el('span', { class: 'field-label', text: 'Background image' }), bgImg]),
      chk('Show grid', showGrid),
      chk('Snap objects to grid & edges', snap),
      el('div', { style: { height: '8px' } }),
      el('div', { class: 'faint', style: { fontSize: '10px', marginBottom: '6px' }, text: 'GAMEPLAY' }),
      vol.row, grav.row, worldW.row, worldH.row,
      el('div', { class: 'cond-row' }, [el('span', { class: 'field-label', text: 'Start scene' }), startScene, dl]),
    ]);

    openModal({
      title: `Project settings — ${this.project.name}`,
      content,
      actions: [{ label: 'Cancel', value: false }, { label: 'Apply', value: true, primary: true }],
    }).then(applied => {
      if (!applied) return;
      s.width = Math.max(160, toNumber(w.i.value, s.width));
      s.height = Math.max(120, toNumber(h.i.value, s.height));
      s.gridSize = Math.max(2, toNumber(grid.i.value, s.gridSize));
      s.background = bgImg.value || bg.value;
      const mainSc = (this.project.scenes || []).find(x => x.name.toLowerCase() === 'main');
      if (mainSc) mainSc.background = s.background;
      s.showGrid = showGrid.checked;
      s.snap = snap.checked;
      s.volume = Math.min(1, Math.max(0, vol.get()));
      s.gravityScale = Math.min(3, Math.max(0, grav.get()));
      s.worldWidth = Math.max(0, toNumber(worldW.i.value, 0));
      s.worldHeight = Math.max(0, toNumber(worldH.i.value, 0));
      s.startScene = startScene.value.trim();
      this.onSettingsChanged();
      this.inspector.render();
      this.debouncedCommit();
      this.log('Project settings updated');
    });
  }

  /* ================= context menus ================= */
  showObjectMenu(obj, x, y) {
    const menu = [
      { label: 'Rename…', onClick: async () => {
          const name = await promptDialog('Rename object', 'Name', obj.name);
          if (!name || name === obj.name) return;
          obj.name = name;
          this.commitHistory('Rename object');
          this.refreshPanels();
          this.scheduleAutosave();
        } },
      { label: obj.visible === false ? 'Show' : 'Hide', onClick: () => {
          obj.visible = obj.visible === false;
          this.workspace.render();
          this.refreshPanels();
          this.scheduleAutosave();
          this.debouncedCommit();
        } },
      '-',
      { label: 'Duplicate', onClick: () => { this.setSelection([obj.id]); this.duplicateSelection(); } },
      { label: 'Bring forward (layer +1)', onClick: () => this.layerOrder('up') },
      { label: 'Send backward (layer −1)', onClick: () => this.layerOrder('down') },
      { label: 'Bring to FRONT (top layer)', onClick: () => this.layerOrder('front') },
      { label: 'Send to BACK (bottom layer)', onClick: () => this.layerOrder('back') },
      '-',
      { label: 'Group selected (Ctrl+G)', disabled: this.selection.length < 2, onClick: () => this.groupSelection() },
      { label: 'Ungroup (Ctrl+Shift+G)', disabled: !this.project.objects.find(o => this.selection.includes(o.id) && o.groupId), onClick: () => this.ungroupSelection() },
      { label: 'Move to scene…', onClick: () => this.moveSelectionToSceneMenu(obj) },
      '-',
      { label: 'Focus', onClick: () => this.focusObject(obj.id) },
      { label: 'Edit code', onClick: () => {
          this.setSelection([obj.id]);
          const first = (obj.codeScripts || [])[0];
          if (first) this.openScript(obj, first);
          else this.addScript(obj);
        } },
      '-',
      { label: this.selection.length > 1 && this.selection.includes(obj.id) ? `Delete ${this.selection.length} objects` : 'Delete', danger: true, onClick: async () => {
          // multi-selection aware: delete ALL selected, not just the right-clicked one
          if (this.selection.length > 1 && this.selection.includes(obj.id)) {
            if (!(await confirmDialog('Delete objects', `Delete all ${this.selection.length} selected objects?`))) return;
            this.deleteSelection();
            return;
          }
          if (!(await confirmDialog('Delete object', `Delete "${obj.name}"? Events targeting it will be detached.`))) return;
          const project = this.project;
          project.objects = project.objects.filter(o => o.id !== obj.id);
          for (const event of project.events) {
            if (event.targetId === obj.id) event.targetId = null;
            event.actions = event.actions.filter(a => !(a.objectId && a.objectId === obj.id));
          }
          this.selection = this.selection.filter(id => id !== obj.id);
          this.workspace.selection.delete(obj.id);
          this.workspace.render();
          this.inspector.render();
          this.hierarchy.render();
          this.commitHistory('Delete object');
          this.scheduleAutosave();
          toast(`Deleted "${obj.name}"`, 'success');
        } },
    ];
    contextMenu(menu, x, y);
  }

  showCanvasMenu(x, y) {
    const project = this.project;
    contextMenu([
      { label: 'Select all', onClick: () => this.setSelection(project.objects.map(o => o.id)) },
      { label: project.settings.showGrid ? 'Hide grid' : 'Show grid', onClick: () => this.toggleGrid() },
      { label: project.settings.snap === false ? 'Enable snapping' : 'Disable snapping', onClick: () => {
          project.settings.snap = project.settings.snap === false;
          this.onSettingsChanged();
          this.debouncedCommit();
        } },
      '-',
      { label: 'Project settings', onClick: () => { this.setSelection([]); this.inspector.render(); this.openInspector(); } },
      { label: 'Fit view', onClick: () => this.workspace.fitView() },
    ], x, y);
  }

  refreshAll() {
    this.renderSceneBar();
    this.workspace.render();
    this.inspector.render();
    this.hierarchy.render();
    this.bottom.renderActive();
    this.nameInput.value = this.project.name;
    this.updateHistoryButtons();
    this.updateStatus();
  }

  refreshPanels() {
    this.renderSceneBar();
    this.workspace.render();
    this.inspector.render();
    this.hierarchy.render();
    this.bottom.renderActive();
  }

  /* ================= scenes (editor) ================= */

  activeScene() {
    const scenes = this.project.scenes || [];
    return scenes.find(sc => sc.name === this._activeScene) || scenes[0] || { name: 'main', width: this.project.settings.width, height: this.project.settings.height, background: this.project.settings.background };
  }

  renderSceneBar() {
    if (!this.sceneBar) return;
    clear(this.sceneBar);
    const scenes = this.project.scenes || [];
    const cur = this.activeScene().name;
    for (const sc of scenes) {
      const chip = el('button', {
        class: 'scene-chip' + (sc.name === cur ? ' active' : ''),
        text: sc.name,
        title: `${sc.name} — ${sc.width}×${sc.height}\nclick: edit this scene\nright-click: rename / size / duplicate / delete`,
        onclick: () => {
          this._activeScene = sc.name;
          // selection context follows the scene: objects of other scenes are not selectable
          const inSc = new Set(this.project.objects.filter(o => (o.scene || 'main') === sc.name || o.persist).map(o => o.id));
          this.selection = this.selection.filter(id => inSc.has(id));
          this.workspace.selection = new Set(this.selection);
          this.refreshPanels();
        },
        oncontextmenu: e => { e.preventDefault(); e.stopPropagation(); this.sceneMenu(sc, e.clientX, e.clientY); },
      });
      this.sceneBar.appendChild(chip);
    }
    this.sceneBar.appendChild(el('button', { class: 'scene-chip scene-add', title: 'New scene', text: '+', onclick: () => this.addScene() }));
    const n = this.project.objects.filter(o => (o.scene || 'main') === cur).length;
    this.sceneBar.appendChild(el('span', { class: 'faint scene-count', text: `${n} object(s) · ${this.activeScene().width}×${this.activeScene().height}` }));
  }

  async addScene(presetName) {
    const name = presetName || await promptDialog('New scene', 'Scene name', 'Level 2');
    if (!name) return;
    const clean = String(name).trim();
    if (!clean) return;
    if ((this.project.scenes || []).some(sc => sc.name.toLowerCase() === clean.toLowerCase())) { toast('Scene name taken', 'error'); return; }
    const s = this.project.settings;
    this.project.scenes.push({ id: uid('scn'), name: clean, width: s.width, height: s.height, background: s.background });
    this._activeScene = clean;
    this.commitHistory(`Scene "${clean}" created`);
    this.refreshPanels();
    this.scheduleAutosave();
  }

  sceneMenu(sc, x, y) {
    contextMenu([
      { label: 'Edit size / background…', onClick: () => this.sceneSettings(sc) },
      { label: 'Rename…', onClick: async () => {
        const n = await promptDialog('Rename scene', 'New name', sc.name);
        if (!n || !n.trim()) return;
        const clean = n.trim();
        if (this.project.scenes.some(x => x.name.toLowerCase() === clean.toLowerCase() && x !== sc)) { toast('Name taken', 'error'); return; }
        for (const o of this.project.objects) if ((o.scene || 'main') === sc.name) o.scene = clean;
        for (const g of this.project.groups || []) if ((g.scene || 'main') === sc.name) g.scene = clean;
        sc.name = clean;
        if (this._activeScene === sc.name) this._activeScene = clean;
        this.commitHistory('Rename scene'); this.refreshPanels(); this.scheduleAutosave();
      } },
      { label: 'Duplicate', onClick: async () => {
        const copy = deepClone(sc); copy.id = uid('scn'); copy.name = sc.name + ' copy';
        let i = 2; while (this.project.scenes.some(x => x.name === copy.name)) copy.name = sc.name + ` copy ${i++}`;
        this.project.scenes.push(copy);
        const members = this.project.objects.filter(o => (o.scene || 'main') === sc.name);
        for (const o of members) { const c = cloneObject(o, this.project); c.scene = copy.name; c.id = uid('obj'); c.name = o.name; this.project.objects.push(c); }
        this._activeScene = copy.name;
        this.commitHistory('Duplicate scene'); this.refreshPanels(); this.scheduleAutosave();
      } },
      { label: 'Delete scene', danger: true, disabled: sc.name.toLowerCase() === 'main' && (this.project.scenes || []).length === 1, onClick: async () => {
        const members = this.project.objects.filter(o => (o.scene || 'main') === sc.name).length;
        if (!(await confirmDialog('Delete scene', `Delete "${sc.name}"? ${members} object(s) in it will be deleted too.`))) return;
        this.project.objects = this.project.objects.filter(o => (o.scene || 'main') !== sc.name);
        this.project.scenes = this.project.scenes.filter(x => x !== sc);
        this.project.groups = (this.project.groups || []).filter(g => (g.scene || 'main') !== sc.name);
        if (this._activeScene === sc.name) this._activeScene = (this.project.scenes[0] || { name: 'main' }).name;
        this.commitHistory('Delete scene'); this.refreshPanels(); this.scheduleAutosave();
      } },
    ], x, y);
  }

  sceneSettings(sc) {
    const w = el('input', { class: 'input', type: 'number', value: sc.width, min: '160', max: '8192' });
    const h = el('input', { class: 'input', type: 'number', value: sc.height, min: '120', max: '8192' });
    // Scene background picker: solid color or an imported image asset
    const bg = el('input', { class: 'input', type: 'color', value: (sc.background || '#12161f').startsWith('img:') ? '#12161f' : sc.background });
    const bgImg = el('select', { class: 'input' });
    bgImg.appendChild(el('option', { value: '', text: '— none (solid color) —', selected: !(sc.background || '').startsWith('img:') }));
    for (const a of (this.project.assets || []).filter(x => x.kind === 'image')) bgImg.appendChild(el('option', { value: 'img:' + a.id, text: a.name, selected: sc.background === 'img:' + a.id }));
    bgImg.title = 'Pick an image asset as this scene\'s background';
    const row = (label, input) => el('div', { class: 'cond-row' }, [el('span', { class: 'field-label', text: label }), input]);
    openModal({
      title: `Scene "${sc.name}" — 160×120 to 8192×8192`,
      content: el('div', {}, [row('Width', w), row('Height', h), row('Background', bg), row('Background image', bgImg),
        el('div', { class: 'faint', style: { fontSize: '11px', marginTop: '8px' }, text: 'Each scene has its own canvas size. gotoScene("' + sc.name + '") switches to it at runtime.' })]),
      actions: [{ label: 'Cancel', value: false }, { label: 'Apply', value: true, primary: true }],
    }).then(applied => {
      if (!applied) return;
      sc.width = Math.min(8192, Math.max(160, toNumber(w.value, sc.width)));
      sc.height = Math.min(8192, Math.max(120, toNumber(h.value, sc.height)));
      sc.background = bg.value;
      this.commitHistory('Scene settings'); this.refreshPanels(); this.scheduleAutosave();
    });
  }

  /* ================= groups (folders) ================= */

  groupSelection() {
    if (this.selection.length < 2) { toast('Select 2+ objects to group', 'error'); return; }
    const ids = new Set(this.selection);
    const members = this.project.objects.filter(o => ids.has(o.id));
    const scene = members[0].scene || 'main';
    if (!members.every(o => (o.scene || 'main') === scene)) { toast('Group members must share one scene', 'error'); return; }
    const g = { id: uid('grp'), name: `Group ${(this.project.groups || []).length + 1}`, scene };
    (this.project.groups = this.project.groups || []).push(g);
    for (const o of members) o.groupId = g.id;
    this.commitHistory(`Grouped ${members.length} objects`);
    this.refreshPanels();
    this.scheduleAutosave();
    toast(`Grouped as "${g.name}" — Ctrl+Shift+G to ungroup`, 'success');
  }

  ungroupGroup(g) {
    for (const o of this.project.objects) if (o.groupId === g.id) o.groupId = null;
    this.project.groups = (this.project.groups || []).filter(x => x.id !== g.id);
    this.commitHistory(Ungroup); this.refreshPanels(); this.scheduleAutosave();
  }

  ungroupSelection() {
    const ids = new Set(this.selection);
    const gids = new Set(this.project.objects.filter(o => ids.has(o.id) && o.groupId).map(o => o.groupId));
    if (!gids.size) { toast('Selection is not in a group', 'error'); return; }
    for (const o of this.project.objects) if (gids.has(o.groupId)) o.groupId = null;
    this.project.groups = (this.project.groups || []).filter(g => !gids.has(g.id));
    this.commitHistory('Ungroup');
    this.refreshPanels();
    this.scheduleAutosave();
  }

  deleteGroup(g) {
    const members = this.project.objects.filter(o => o.groupId === g.id);
    this.project.objects = this.project.objects.filter(o => o.groupId !== g.id);
    this.project.groups = (this.project.groups || []).filter(x => x.id !== g.id);
    this.setSelection([]);
    this.commitHistory(`Delete group "${g.name}" (${members.length})`);
    this.refreshPanels();
    this.scheduleAutosave();
  }

  /** Focus = select all members + zoom canvas to fit them ("go in"). */
  focusGroup(g) {
    const members = this.project.objects.filter(o => o.groupId === g.id);
    if (!members.length) return;
    this._activeScene = g.scene || 'main';
    this.setSelection(members.map(o => o.id));
    this.workspace.focusObjects(members);
    this.refreshPanels();
  }

  updateHistoryButtons() {
    if (!this.history) return;
    this.undoBtn.disabled = !this.history.canUndo;
    this.redoBtn.disabled = !this.history.canRedo;
  }

  commitHistory(label) {
    this.history?.commit();
    if (label) this.log(label);
    this.updateHistoryButtons();
  }

  undo() {
    if (this.history?.undo()) { this.log('Undo'); this.scheduleAutosave(); }
  }

  redo() {
    if (this.history?.redo()) { this.log('Redo'); this.scheduleAutosave(); }
  }

  /* ================= selection ================= */
  setSelection(ids) {
    this.selection = [...new Set(ids)];
    this.workspace.selection = new Set(this.selection);
    this.workspace.renderSelection();
    this.inspector.render();
    this.hierarchy.render();
    this.updateStatus();
    if (this.selection.length) this.openInspector();
  }

  toggleSelection(id) {
    if (this.selection.includes(id)) this.setSelection(this.selection.filter(s => s !== id));
    else this.setSelection([...this.selection, id]);
  }

  focusObject(id) {
    const obj = getObjectById(this.project, id);
    if (!obj) return;
    const viewport = this.workspace.viewport.getBoundingClientRect();
    this.workspace.panX = viewport.width / 2 - (obj.x + obj.w / 2) * this.workspace.zoom;
    this.workspace.panY = viewport.height / 2 - (obj.y + obj.h / 2) * this.workspace.zoom;
    this.workspace.applyTransform();
  }

  /* ================= object CRUD ================= */
  addObject(type, stagePoint = null, extra = null) {
    const obj = createObject(type, this.project, extra || {});
    const sc = this.activeScene();
    obj.scene = sc.name;
    const W = sc.width, H = sc.height;
    if (stagePoint) {
      // Dropped from the palette: center the object under the cursor.
      obj.x = Math.round(Math.max(0, Math.min(stagePoint.x - obj.w / 2, W - obj.w)));
      obj.y = Math.round(Math.max(0, Math.min(stagePoint.y - obj.h / 2, H - obj.h)));
    } else {
      // place new objects near the top-left of the current view
      const view = this.workspace.clientToStage(
        this.workspace.viewport.getBoundingClientRect().left + 60,
        this.workspace.viewport.getBoundingClientRect().top + 60,
      );
      obj.x = Math.round(Math.max(0, Math.min(view.x, W - obj.w)));
      obj.y = Math.round(Math.max(0, Math.min(view.y, H - obj.h)));
    }
    this.project.objects.push(obj);
    this.workspace.render();
    this.commitHistory(`Add ${TYPE_DEFS[type].label}`);
    this.setSelection([obj.id]);
    this.scheduleAutosave();
  }

  updateObject(id, patch) {
    const obj = getObjectById(this.project, id);
    if (!obj) return;
    // group transform propagation: rotating a member rotates the whole group
    // (relative layout preserved); moving via inspector moves the group too.
    // createObject omits `rotation` on fresh objects — coerce undefined to 0
    // so the delta math can never produce NaN (audit finding, 2026-11-24).
    const was = { x: obj.x, y: obj.y, rotation: obj.rotation || 0 };
    Object.assign(obj, patch);
    if (obj.groupId) {
      const dx = patch.x !== undefined ? obj.x - was.x : 0;
      const dy = patch.y !== undefined ? obj.y - was.y : 0;
      const dr = patch.rotation !== undefined ? obj.rotation - was.rotation : 0;
      if (dx || dy || dr) {
        for (const m of this.project.objects) {
          if (m.groupId !== obj.groupId || m.id === obj.id) continue;
          if (dx || dy) { m.x += dx; m.y += dy; this.workspace.updateNode(m.id); }
          if (dr) { m.rotation = ((m.rotation || 0) + dr) % 360; this.workspace.updateNode(m.id); }
        }
      }
    }
    this.workspace.updateNode(id);
    this.scheduleAutosave();
    this.debouncedCommit();
  }

  patchSelection(patch) {
    for (const id of this.selection) {
      const obj = getObjectById(this.project, id);
      if (!obj) continue;
      Object.assign(obj, patch);
      this.workspace.updateNode(id);
    }
    this.scheduleAutosave();
    this.debouncedCommit();
  }

  moveSelectionToSceneMenu() {
    const ids = new Set(this.selection.length ? this.selection : []);
    if (!ids.size) return;
    const items = [];
    for (const sc of this.project.scenes || []) {
      items.push({ label: sc.name, onClick: () => {
        for (const o of this.project.objects) if (ids.has(o.id)) o.scene = sc.name;
        this.commitHistory('Move to scene ' + sc.name);
        this.refreshPanels(); this.scheduleAutosave();
      } });
    }
    items.push('-', { label: 'New scene…', onClick: async () => {
      const name = await promptDialog('New scene', 'Scene name', 'Room 2');
      if (!name?.trim()) return;
      await this.addScene(name.trim());
      for (const o of this.project.objects) if (ids.has(o.id)) o.scene = this._activeScene;
      this.commitHistory('Move to new scene'); this.refreshPanels(); this.scheduleAutosave();
    } });
    const r = this.workspace.viewport.getBoundingClientRect();
    contextMenu(items, r.left + r.width / 2, r.top + 40);
  }

  layerOrder(mode) {
    if (!this.selection.length) return;
    const ids = new Set(this.selection);
    const all = this.project.objects;
    const maxL = Math.max(0, ...all.map(o => o.layer || 0));
    const minL = Math.min(0, ...all.map(o => o.layer || 0));
    if (mode === 'front') for (const o of all) if (ids.has(o.id)) o.layer = maxL + 1;
    else if (mode === 'back') for (const o of all) if (ids.has(o.id)) o.layer = minL - 1;
    else if (mode === 'up') for (const o of all) if (ids.has(o.id)) o.layer = (o.layer || 0) + 1;
    else if (mode === 'down') for (const o of all) if (ids.has(o.id)) o.layer = (o.layer || 0) - 1;
    this.workspace.render();
    this.commitHistory('Layer ' + mode);
    this.scheduleAutosave();
  }

  deleteSelection() {
    if (!this.selection.length) return;
    const ids = new Set(this.selection);
    this.project.objects = this.project.objects.filter(o => !ids.has(o.id));
    // clean up event references
    for (const event of this.project.events) {
      if (ids.has(event.targetId)) event.targetId = null;
      event.actions = event.actions.filter(a => !(a.objectId && ids.has(a.objectId)));
    }
    this.setSelection([]);
    this.commitHistory('Delete object(s)');
    this.refreshPanels();
    this.scheduleAutosave();
  }

  duplicateSelection() {
    if (!this.selection.length) return;
    const created = [];
    for (const id of this.selection) {
      const source = getObjectById(this.project, id);
      if (!source) continue;
      const copy = deepClone(source);
      copy.id = uid('obj');
      copy.name = source.name + ' Copy';
      copy.x = source.x + 16;
      copy.y = source.y + 16;
      const maxLayer = this.project.objects.reduce((m, o) => Math.max(m, o.layer || 0), 0);
      copy.layer = maxLayer + 1;
      this.project.objects.push(copy);
      created.push(copy.id);
    }
    this.setSelection(created);
    this.commitHistory('Duplicate object(s)');
    this.refreshPanels();
    this.scheduleAutosave();
  }

  reorderObject(id, direction) {
    const obj = getObjectById(this.project, id);
    if (!obj) return;
    const sorted = [...this.project.objects].sort((a, b) => (a.layer || 0) - (b.layer || 0));
    const index = sorted.indexOf(obj);
    const target = index + (direction > 0 ? 1 : -1);
    if (target < 0 || target >= sorted.length) return;
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    sorted.forEach((o, i) => { o.layer = i + 1; });
    this.commitHistory('Reorder object');
    this.workspace.render();
    this.hierarchy.render();
    this.inspector.render();
    this.scheduleAutosave();
  }

  onSettingsChanged() {
    this.workspace.render();
    this.scheduleAutosave();
    this.debouncedCommit();
  }

  toggleGrid() {
    this.project.settings.showGrid = !this.project.settings.showGrid;
    this.workspace.applyGrid();
    this.inspector.render();
    this.scheduleAutosave();
  }

  /* ================= history helper ================= */
  get debouncedCommit() {
    if (!this._debouncedCommit) this._debouncedCommit = debounce(() => this.commitHistory(), 500);
    return this._debouncedCommit;
  }

  /* ================= persistence ================= */
  setSaveState(state) {
    this.saveState = state;
    if (!this.saveStateLabel) return;
    this.saveStateLabel.textContent =
      state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Unsaved' : state === 'error' ? 'Save failed' : 'Saved';
    this.saveStateLabel.style.color =
      state === 'dirty' ? 'var(--warn)' : state === 'error' ? 'var(--danger)' : 'var(--text-faint)';
  }

  scheduleAutosave() {
    this.setSaveState('dirty');
    this.autosave();
  }

  async save(explicit = false) {
    if (!this.project) return;
    this.setSaveState('saving');
    try {
      this.project.updatedAt = Date.now();
      await putProject(this.project);
      this.setSaveState('saved');
      if (explicit) toast('Project saved', 'success');
    } catch (err) {
      this.setSaveState('error');
      this.log('Save failed: ' + err.message, 'err');
      if (explicit) toast('Save failed: ' + err.message, 'error');
    }
  }

  /* ================= runtime ================= */
  play(windowed) {
    this.stopRuntime();
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur(); // Space must not re-click the Play button
    const runtime = new GameRuntime(this.project, {
      onError: message => {
        const bar = this._gameErrorBar;
        if (bar) {
          bar.classList.remove('hidden');
          bar.appendChild(el('div', { text: '⚠ ' + message }));
        }
        this.log('Runtime error: ' + message, 'err');
      },
      onScene: () => { if (this._fitGame) this._fitGame(); },
    });
    this.runtime = runtime;

    if (windowed) {
      // Floating preview window (old behavior)
      const overlay = document.getElementById('runtime-overlay');
      overlay.innerHTML = '';
      overlay.classList.add('windowed');
      overlay.classList.remove('hidden');

      const head = el('div', { class: 'rt-head' });
      head.append(
        el('span', { class: 'rt-title', text: this.project.name }),
        el('span', { class: 'badge', text: 'Preview' }),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', html: icon('refresh', 14), onclick: () => this.runtime?.reset() }),
        el('button', { class: 'btn', html: icon('close', 14), onclick: () => this.stopRuntime() }),
      );
      const body = el('div', { class: 'rt-body' });
      const scaleWrap = el('div', { class: 'rt-scale' });
      const stageHost = el('div');
      scaleWrap.appendChild(stageHost);
      body.appendChild(scaleWrap);
      const errorBar = el('div', { class: 'rt-errors hidden' });
      overlay.append(head, body, errorBar);
      this._gameErrorBar = errorBar;

      const fit = () => {
        const w = this.project.settings.width;
        const h = this.project.settings.height;
        const scale = Math.min(1, (body.clientWidth - 32) / w, (body.clientHeight - 32) / h);
        const crisp = Math.max(0.25, Math.floor(scale * 4) / 4);
        scaleWrap.style.transform = `scale(${crisp})`;
        scaleWrap.style.width = w + 'px';
        scaleWrap.style.height = h + 'px';
      };
      requestAnimationFrame(() => { fit(); runtime.mount(stageHost); });
      window.addEventListener('resize', fit);
      this._runtimeFit = fit;
    } else {
      // Unity-style: run inside the Game view tab
      this.setView('game');
      const host = this.gameHost;
      host.innerHTML = '';
      const stageArea = el('div', { class: 'game-stage-area' });
      const scaleWrap = el('div', { class: 'rt-scale' });
      const stageHost = el('div');
      scaleWrap.appendChild(stageHost);
      stageArea.appendChild(scaleWrap);
      const errorBar = el('div', { class: 'rt-errors hidden' });
      host.append(stageArea, errorBar);
      this._gameErrorBar = errorBar;

      const fit = () => {
        const w = this.project.settings.width;
        const h = this.project.settings.height;
        const scale = Math.min(1, (stageArea.clientWidth - 24) / w, (stageArea.clientHeight - 24) / h);
        const crisp = Math.max(0.25, Math.floor(scale * 4) / 4);
        scaleWrap.style.transform = `scale(${crisp})`;
        scaleWrap.style.width = w + 'px';
        scaleWrap.style.height = h + 'px';
      };
      this._fitGame = fit;
      requestAnimationFrame(() => { fit(); runtime.mount(stageHost); });
      window.addEventListener('resize', fit);
    }
    this.playBtn.classList.add('active');
    this.log('Runtime started');
  }

  stopRuntime() {
    const overlay = document.getElementById('runtime-overlay');
    if (this._runtimeFit) { window.removeEventListener('resize', this._runtimeFit); this._runtimeFit = null; }
    if (this._fitGame) { window.removeEventListener('resize', this._fitGame); this._fitGame = null; }
    const wasWindowed = overlay && !overlay.classList.contains('hidden');
    if (wasWindowed) {
      overlay.classList.add('hidden');
      overlay.innerHTML = '';
      overlay.classList.remove('windowed');
    }
    if (this.runtime) {
      this.runtime.destroy();
      this.runtime = null;
      this.log('Runtime stopped');
    }
    this._gameErrorBar = null;
    if (this.gameHost) this.gameHost.innerHTML = '';
    if (this.playBtn) this.playBtn.classList.remove('active');
    if (this.view === 'game') this.setView('scene');
  }

  /* ================= misc ================= */
  log(message, type = 'info') {
    this.debug?.log(message, type);
    if (this.bottom?.active === 'debug') this.bottom.renderActive();
  }

  bindKeyboard() {
    this._keyHandler = (e) => {
      if (this.root.classList.contains('hidden')) return;
      const target = e.target;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.save(true); return; }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo(); else this.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); return; }
      if (typing) return;

      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this.duplicateSelection(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selection.length) { e.preventDefault(); this.deleteSelection(); }
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'g' && !this.scriptEditor.isOpen) {
        e.preventDefault(); this.groupSelection();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g' && !this.scriptEditor.isOpen) {
        e.preventDefault(); this.ungroupSelection();
        return;
      }
      if (e.key === 'Escape') { this.setSelection([]); return; }
      if (e.key.startsWith('Arrow')) {
        if (!this.selection.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        this.workspace.nudge(dx, dy);
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }
}