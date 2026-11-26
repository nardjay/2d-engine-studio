import { el, iconBtn } from 'ui.js';
import { buildObjectElement, createRenderContext, objTransform } from 'render.js';
import { clamp, toNumber } from 'util.js';
import { icon } from 'icons.js';

const SNAP_THRESHOLD = 6; // in stage px
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ZOOM_MIN = 0.1, ZOOM_MAX = 6;
const ZOOM_PRESETS = [10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 500, 600];

export class Workspace {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.zoom = 1;
    this.panX = 60;
    this.panY = 40;
    this.selection = new Set();
    this.nodes = new Map();
    this.drag = null;
    this.build();
    this.bindEvents();
  }

  /* ---------------- DOM ---------------- */
  build() {
    this.host.innerHTML = '';
    this.host.className = 'workspace';

    this.toolbar = el('div', { class: 'ws-toolbar' });
    this.zoomOutBtn = iconBtn('zoomOut', 'Zoom out', () => this.stepZoom(-1));
    this.zoomInBtn = iconBtn('zoomIn', 'Zoom in', () => this.stepZoom(1));
    this.zoomSelect = el('select', { class: 'zoom-select', title: 'Zoom level' });
    for (const p of ZOOM_PRESETS) this.zoomSelect.appendChild(el('option', { value: String(p), text: p + '%' }));
    this.zoomSelect.addEventListener('change', () => {
      const r = this.viewport.getBoundingClientRect();
      this.setZoom(Number(this.zoomSelect.value) / 100, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, true);
    });
    this.zoomLabel = el('span', { class: 'muted', style: { fontSize: '11px', minWidth: '40px', textAlign: 'center', display: 'none' } });
    this.gridToggle = iconBtn('grid', 'Toggle grid', () => this.editor.toggleGrid());
    this.toolbar.append(
      this.zoomOutBtn, this.zoomSelect, this.zoomInBtn,
      el('div', { class: 'tb-sep' }),
      this.gridToggle,
      el('div', { class: 'spacer' }),
      el('span', { class: 'faint', style: { fontSize: '11px' }, text: 'Drag to move · Shift-click to multi-select' })
    );

    this.viewport = el('div', { class: 'ws-viewport' });
    this.wrap = el('div', { class: 'ws-wrap' });
    this.stage = el('div', { class: 'ws-stage' });
    this.selectionLayer = el('div', { class: 'ws-selection' });
    this.guideLayer = el('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '10001' } });
    this.marqueeNode = null;

    this.stage.appendChild(this.selectionLayer);
    this.wrap.append(this.stage, this.guideLayer);
    this.viewport.appendChild(this.wrap);
    this.host.append(this.toolbar, this.viewport);
  }

  bindEvents() {
    this.viewport.addEventListener('pointerdown', e => this.onPointerDown(e));
    this.viewport.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    this.viewport.addEventListener('contextmenu', e => {
      e.preventDefault();
      const objNode = e.target.closest('.ui-object');
      if (objNode) {
        const obj = this.editor.project.objects.find(o => o.id === objNode.dataset.objectId);
        if (obj) {
          if (!this.editor.selection.includes(obj.id)) this.editor.setSelection([obj.id]);
          this.editor.showObjectMenu(obj, e.clientX, e.clientY);
          return;
        }
      }
      this.editor.showCanvasMenu(e.clientX, e.clientY);
    });
    this.viewport.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/clicker-type') || e.dataTransfer.types.includes('text/clicker-asset')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this.stage.classList.add('drop-hot');
      }
    });
    this.viewport.addEventListener('dragleave', () => this.stage.classList.remove('drop-hot'));
    this.viewport.addEventListener('drop', e => {
      const assetId = e.dataTransfer.getData('text/clicker-asset');
      const type = e.dataTransfer.getData('text/clicker-type');
      this.stage.classList.remove('drop-hot');
      if (!type && !assetId) return;
      e.preventDefault();
      if (assetId) this.editor.addObject('image', this.clientToStage(e.clientX, e.clientY), { assetId, w: 160, h: 160 });
      else this.editor.addObject(type, this.clientToStage(e.clientX, e.clientY));
    });
    window.addEventListener('pointermove', e => this.onPointerMove(e));
    window.addEventListener('pointerup', e => this.onPointerUp(e));
  }

  /* ---------------- render ---------------- */
  /** Zoom + pan the canvas so the given objects fill the view ("go into" a group). */
  focusObjects(objs) {
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const o of objs) {
      x1 = Math.min(x1, o.x); y1 = Math.min(y1, o.y);
      x2 = Math.max(x2, o.x + o.w); y2 = Math.max(y2, o.y + o.h);
    }
    const rect = this.viewport.getBoundingClientRect();
    const pad = 60;
    const z = Math.min(4, Math.max(0.1, Math.min((rect.width - pad) / Math.max(40, x2 - x1), (rect.height - pad) / Math.max(40, y2 - y1))));
    this.setZoom(z, null, false);
    this.panX = (rect.width - (x1 + x2) * z) / 2;
    this.panY = (rect.height - (y1 + y2) * z) / 2;
    this.applyTransform();
  }

  render() {
    const project = this.editor.project;
    const scene = this.editor.activeScene ? this.editor.activeScene() : null;
    const width = scene ? scene.width : project.settings.width;
    const height = scene ? scene.height : project.settings.height;
    this.stage.style.width = width + 'px';
    this.stage.style.height = height + 'px';
    // scene/project background: color OR "img:<assetId>" (editable image backgrounds)
    const bgv = String((scene ? scene.background : project.settings.background) || '#12161f');
    if (bgv.startsWith('img:')) {
      const a = (project.assets || []).find(x => x.id === bgv.slice(4));
      this.stage.style.backgroundColor = '#000';
      this.stage.style.backgroundImage = a ? 'url(' + a.url + ') center / cover no-repeat' : 'none';
      this._bgIsImage = true;
    } else {
      this.stage.style.backgroundColor = bgv;
      this._bgIsImage = false;
    }
    this.viewW = width;
    this.viewH = height;
    this.applyGrid();

    this.nodes.clear();
    while (this.stage.firstChild && this.stage.firstChild !== this.selectionLayer) {
      this.stage.removeChild(this.stage.firstChild);
    }
    const ctx = createRenderContext(project);
    const sceneName = scene ? scene.name : null;
    const objects = [...project.objects]
      .filter(o => !sceneName || (o.scene || 'main') === sceneName || o.persist === true) // editor shows one scene + persistent objects
      .sort((a, b) => (a.layer || 0) - (b.layer || 0));
    for (const obj of objects) {
      const node = buildObjectElement(obj, ctx);
      if (obj.type === 'button') node.style.cursor = 'pointer';
      this.nodes.set(obj.id, node);
      this.stage.insertBefore(node, this.selectionLayer);
    }
    this.renderSelection();
  }

  updateNode(objectId) {
    const obj = this.editor.project.objects.find(o => o.id === objectId);
    const node = this.nodes.get(objectId);
    if (!obj || !node) { this.render(); return; }
    // FAST PATH: transform/visibility-only changes are plain style writes —
    // no DOM rebuild. This is what makes dragging stay smooth on huge scenes.
    if (node._sig === undefined) node._sig = '';
    const sig = JSON.stringify([obj.type, obj.text, obj.bg, obj.color, obj.fontSize, obj.bold, obj.italic, obj.kind, obj.visible, obj.opacity, obj.rotation]);
    if (sig === node._sig) {
      node.style.left = obj.x + 'px';
      node.style.top = obj.y + 'px';
      node.style.width = obj.w + 'px';
      node.style.height = obj.h + 'px';
      node.style.transform = objTransform(obj);
      node.style.opacity = obj.opacity ?? 1;
      node.style.visibility = obj.visible === false ? 'hidden' : '';
      if (this.selection.has(objectId)) this.renderSelection();
      return;
    }
    const ctx = createRenderContext(this.editor.project);
    const fresh = buildObjectElement(obj, ctx);
    fresh._sig = sig;
    node.replaceWith(fresh);
    this.nodes.set(objectId, fresh);
    if (this.selection.has(objectId)) this.renderSelection();
  }

  applyGrid() {
    const s = this.editor.project.settings;
    if (s.showGrid) {
      this.stage.style.backgroundImage =
        `linear-gradient(to right, rgba(255,255,255,.05) 1px, transparent 1px),` +
        `linear-gradient(to bottom, rgba(255,255,255,.05) 1px, transparent 1px)`;
      this.stage.style.backgroundSize = `${s.gridSize}px ${s.gridSize}px`;
    } else {
      this.stage.style.backgroundImage = 'none';
    }
    this.gridToggle.style.color = s.showGrid ? 'var(--accent)' : '';
  }

  renderSelection() {
    this.selectionLayer.innerHTML = '';
    const project = this.editor.project;
    const selected = project.objects.filter(o => this.selection.has(o.id));
    for (const obj of selected) {
      const box = el('div', { class: 'sel-box' + (selected.length > 1 ? ' multi' : '') });
      box.style.left = obj.x + 'px';
      box.style.top = obj.y + 'px';
      box.style.width = obj.w + 'px';
      box.style.height = obj.h + 'px';
      this.selectionLayer.appendChild(box);
    }
    if (selected.length === 1) {
      const obj = selected[0];
      for (const handle of HANDLES) {
        const node = el('div', { class: 'sel-handle', dataset: { h: handle } });
        const { x, y, w, h } = obj;
        const pos = {
          nw: [x, y], n: [x + w / 2, y], ne: [x + w, y], e: [x + w, y + h / 2],
          se: [x + w, y + h], s: [x + w / 2, y + h], sw: [x, y + h], w: [x, y + h / 2],
        }[handle];
        node.style.left = (pos[0] - 4.5) + 'px';
        node.style.top = (pos[1] - 4.5) + 'px';
        this.selectionLayer.appendChild(node);
      }
    }
    this.selectionLayer.style.display = selected.length ? '' : 'none';
  }

  /* ---------------- view transform ---------------- */
  applyTransform() {
    this.wrap.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    const pct = Math.round(this.zoom * 100);
    // keep the select synced; add a temporary option for off-preset values
    const want = pct + '%';
    if (this.zoomSelect.value !== String(pct)) {
      if (![...this.zoomSelect.options].some(o => o.value === String(pct))) {
        const opt = el('option', { value: String(pct), text: want });
        const idx = ZOOM_PRESETS.findIndex(p => p > pct);
        const ref = idx === -1 ? null : this.zoomSelect.options[ZOOM_PRESETS.filter(p => p <= pct).length];
        this.zoomSelect.add(opt, ref);
      }
      this.zoomSelect.value = String(pct);
    }
    this.zoomLabel.textContent = want;
    this.editor.updateStatus?.();
  }

  /** Smooth multiplicative step (dir = ±1), animated over ~140 ms, anchored at viewport center. */
  stepZoom(dir, focusClient) {
    const target = clamp(this.zoom * Math.pow(1.25, dir), ZOOM_MIN, ZOOM_MAX);
    const focus = focusClient || (() => {
      const r = this.viewport.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })();
    this.setZoom(target, focus, true);
  }

  /** Set zoom. With animate=true it eases there while keeping focusClient fixed. */
  setZoom(next, focusClient, animate = false) {
    const clamped = clamp(next, ZOOM_MIN, ZOOM_MAX);
    const rect = this.viewport.getBoundingClientRect();
    const fx = focusClient ? focusClient.x - rect.left : rect.width / 2;
    const fy = focusClient ? focusClient.y - rect.top : rect.height / 2;
    // stage point under the focus stays put across the whole animation
    const sx = (fx - this.panX) / this.zoom;
    const sy = (fy - this.panY) / this.zoom;
    const apply = (z) => {
      this.zoom = z;
      this.panX = fx - sx * z;
      this.panY = fy - sy * z;
      this.applyTransform();
    };
    if (!animate) { apply(clamped); return; }
    if (this._zoomAnim) cancelAnimationFrame(this._zoomAnim);
    const from = this.zoom, to = clamped, t0 = performance.now(), dur = 140;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      apply(from + (to - from) * e);
      if (t < 1) this._zoomAnim = requestAnimationFrame(tick);
      else this._zoomAnim = null;
    };
    this._zoomAnim = requestAnimationFrame(tick);
  }

  fitView() {
    const project = this.editor.project;
    const rect = this.viewport.getBoundingClientRect();
    if (!rect.width) return;
    this.zoom = clamp(Math.min((rect.width - 60) / project.settings.width, (rect.height - 60) / project.settings.height, 1), ZOOM_MIN, ZOOM_MAX);
    this.panX = (rect.width - project.settings.width * this.zoom) / 2;
    this.panY = (rect.height - project.settings.height * this.zoom) / 2;
    this.applyTransform();
  }

  onWheel(e) {
    e.preventDefault();
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      // shift + wheel = horizontal pan
      this.panX -= (e.deltaY || e.deltaX);
      this.applyTransform();
      return;
    }
    // Plain wheel zooms smoothly at the cursor, like Unity/Roblox viewports.
    const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0021));
    this.setZoom(this.zoom * factor, { x: e.clientX, y: e.clientY });
  }

  clientToStage(clientX, clientY) {
    const rect = this.viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.panX) / this.zoom,
      y: (clientY - rect.top - this.panY) / this.zoom,
    };
  }

  /* ---------------- pointer interaction ---------------- */
  onPointerDown(e) {
    if (e.button === 1) {
      this.drag = { mode: 'pan', startX: e.clientX, startY: e.clientY, panX: this.panX, panY: this.panY };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const handle = e.target.closest('.sel-handle');
    if (handle && this.selection.size === 1) {
      const id = [...this.selection][0];
      const obj = this.editor.project.objects.find(o => o.id === id);
      if (obj) {
        this.drag = {
          mode: 'resize', handle: handle.dataset.h, id,
          start: this.clientToStage(e.clientX, e.clientY),
          origin: { x: obj.x, y: obj.y, w: obj.w, h: obj.h },
        };
        e.preventDefault();
        return;
      }
    }

    const objNode = e.target.closest('.ui-object');
    if (objNode) {
      const id = objNode.dataset.objectId;
      if (e.shiftKey) {
        if (this.selection.has(id)) this.selection.delete(id);
        else this.selection.add(id);
      } else if (!this.selection.has(id)) {
        this.selection = new Set([id]);
      }
      // group cohesion: grabbing one member grabs the whole group
      const grabbed = new Set(this.selection);
      for (const sid of [...this.selection]) {
        const og = this.editor.project.objects.find(x => x.id === sid);
        if (og && og.groupId) for (const mm of this.editor.project.objects) if (mm.groupId === og.groupId) grabbed.add(mm.id);
      }
      if (grabbed.size !== this.selection.length) this.selection = grabbed;
      this.editor.setSelection([...this.selection]);

      const start = this.clientToStage(e.clientX, e.clientY);
      const origins = new Map();
      for (const sid of this.selection) {
        const obj = this.editor.project.objects.find(o => o.id === sid);
        if (obj) origins.set(sid, { x: obj.x, y: obj.y });
      }
      this.drag = { mode: 'move', start, origins, moved: false };
      e.preventDefault();
      return;
    }

    // empty canvas -> marquee
    if (!e.shiftKey) this.editor.setSelection([]);
    this.selection = new Set();
    this.renderSelection();
    const start = this.clientToStage(e.clientX, e.clientY);
    this.drag = { mode: 'marquee', start };
    this.marqueeNode = el('div', { class: 'marquee' });
    this.stage.appendChild(this.marqueeNode);
    e.preventDefault();
  }

  onPointerMove(e) {
    if (!this.drag) return;
    const drag = this.drag;

    if (drag.mode === 'pan') {
      this.panX = drag.panX + (e.clientX - drag.startX);
      this.panY = drag.panY + (e.clientY - drag.startY);
      this.applyTransform();
      return;
    }

    const point = this.clientToStage(e.clientX, e.clientY);

    if (drag.mode === 'move') {
      let dx = point.x - drag.start.x;
      let dy = point.y - drag.start.y;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }

      // Snap using the primary (first) selected object.
      const primaryId = [...drag.origins.keys()][0];
      const origin = drag.origins.get(primaryId);
      const snapOn = this.editor.project.settings.snap !== false;
      if (origin && snapOn && !e.altKey) {
        const obj = this.editor.project.objects.find(o => o.id === primaryId);
        const box = { x: origin.x + dx, y: origin.y + dy, w: obj.w, h: obj.h };
        const snap = this.computeSnap(box, new Set(drag.origins.keys()));
        dx += snap.dx;
        dy += snap.dy;
        this.renderGuides(snap.guides);
      } else this.renderGuides([]);

      for (const [id, o] of drag.origins) {
        const obj = this.editor.project.objects.find(x => x.id === id);
        if (!obj) continue;
        obj.x = Math.round(o.x + dx);
        obj.y = Math.round(o.y + dy);
        const node = this.nodes.get(id);
        if (node) { node.style.left = obj.x + 'px'; node.style.top = obj.y + 'px'; }
      }
      drag.moved = true;
      this.renderSelection();
      return;
    }

    if (drag.mode === 'resize') {
      const obj = this.editor.project.objects.find(o => o.id === drag.id);
      if (!obj) return;
      const dx = point.x - drag.start.x;
      const dy = point.y - drag.start.y;

      // GROUP SCALE: resizing any grouped object scales the whole group around
      // its bounding-box origin — relative layout stays intact.
      if (obj.groupId) {
        if (!drag.group) {
          const members = this.editor.project.objects.filter(x => x.groupId === obj.groupId);
          let gx1 = 1e9, gy1 = 1e9;
          for (const g of members) { gx1 = Math.min(gx1, g.x); gy1 = Math.min(gy1, g.y); }
          drag.group = { ax: gx1, ay: gy1, snap: members.map(g => ({ id: g.id, x: g.x, y: g.y, w: g.w, h: g.h })) };
        }
        const o0 = drag.origin;
        const nw = Math.max(8, o0.w + (drag.handle.includes('e') ? dx : 0) - (drag.handle.includes('w') ? dx : 0));
        const nh = Math.max(8, o0.h + (drag.handle.includes('s') ? dy : 0) - (drag.handle.includes('n') ? dy : 0));
        const sx = nw / o0.w, sy = nh / o0.h;
        for (const s of drag.group.snap) {
          const mo = this.editor.project.objects.find(x => x.id === s.id);
          if (!mo) continue;
          mo.x = Math.round(drag.group.ax + (s.x - drag.group.ax) * sx);
          mo.y = Math.round(drag.group.ay + (s.y - drag.group.ay) * sy);
          mo.w = Math.max(8, Math.round(s.w * sx));
          mo.h = Math.max(8, Math.round(s.h * sy));
          const node = this.nodes.get(mo.id);
          if (node) { node.style.left = mo.x + 'px'; node.style.top = mo.y + 'px'; node.style.width = mo.w + 'px'; node.style.height = mo.h + 'px'; }
        }
        this.renderSelection();
        return;
      }
      const o = drag.origin;
      let { x, y, w, h } = o;
      if (drag.handle.includes('w')) { x = o.x + dx; w = o.w - dx; }
      if (drag.handle.includes('e')) { w = o.w + dx; }
      if (drag.handle.includes('n')) { y = o.y + dy; h = o.h - dy; }
      if (drag.handle.includes('s')) { h = o.h + dy; }
      if (w < 8) { w = 8; if (drag.handle.includes('w')) x = o.x + o.w - 8; }
      if (h < 8) { h = 8; if (drag.handle.includes('n')) y = o.y + o.h - 8; }
      obj.x = Math.round(x); obj.y = Math.round(y);
      obj.w = Math.round(w); obj.h = Math.round(h);
      const node = this.nodes.get(obj.id);
      if (node) {
        node.style.left = obj.x + 'px'; node.style.top = obj.y + 'px';
        node.style.width = obj.w + 'px'; node.style.height = obj.h + 'px';
      }
      this.renderSelection();
      return;
    }

    if (drag.mode === 'marquee') {
      const x = Math.min(drag.start.x, point.x);
      const y = Math.min(drag.start.y, point.y);
      const w = Math.abs(point.x - drag.start.x);
      const h = Math.abs(point.y - drag.start.y);
      Object.assign(this.marqueeNode.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      this.selection = new Set(
        this.editor.project.objects
          .filter(o => { const as = this.editor.activeScene ? this.editor.activeScene().name : null; return !as || (o.scene || 'main') === as; })
          .filter(o => o.x < x + w && o.x + o.w > x && o.y < y + h && o.y + o.h > y)
          .map(o => o.id)
      );
      this.renderSelection();
    }
  }

  onPointerUp() {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.renderGuides([]);

    if (drag.mode === 'marquee') {
      this.marqueeNode?.remove();
      this.marqueeNode = null;
      this.editor.setSelection([...this.selection]);
      return;
    }
    if (drag.mode === 'move' && drag.moved) this.editor.commitHistory('Move object');
    if (drag.mode === 'resize') this.editor.commitHistory('Resize object');
    if (drag.mode !== 'pan') this.editor.scheduleAutosave();
  }

  /* ---------------- snapping ---------------- */
  computeSnap(box, excludeIds) {
    const project = this.editor.project;
    const threshold = SNAP_THRESHOLD / this.zoom;
    const targetsX = [0, project.settings.width / 2, project.settings.width];
    const targetsY = [0, project.settings.height / 2, project.settings.height];
    for (const obj of project.objects) {
      if (excludeIds.has(obj.id)) continue;
      targetsX.push(obj.x, obj.x + obj.w / 2, obj.x + obj.w);
      targetsY.push(obj.y, obj.y + obj.h / 2, obj.y + obj.h);
    }
    const movingX = [box.x, box.x + box.w / 2, box.x + box.w];
    const movingY = [box.y, box.y + box.h / 2, box.y + box.h];

    let bestX = null, bestY = null;
    for (const m of movingX) {
      for (const t of targetsX) {
        const delta = t - m;
        if (Math.abs(delta) <= threshold && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) {
          bestX = { delta, line: t };
        }
      }
    }
    for (const m of movingY) {
      for (const t of targetsY) {
        const delta = t - m;
        if (Math.abs(delta) <= threshold && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) {
          bestY = { delta, line: t };
        }
      }
    }
    const guides = [];
    if (bestX) guides.push({ axis: 'v', pos: bestX.line });
    if (bestY) guides.push({ axis: 'h', pos: bestY.line });
    return { dx: bestX ? bestX.delta : 0, dy: bestY ? bestY.delta : 0, guides };
  }

  renderGuides(guides) {
    this.guideLayer.innerHTML = '';
    for (const guide of guides) {
      const node = el('div', { class: 'guide ' + guide.axis });
      if (guide.axis === 'v') node.style.left = guide.pos + 'px';
      else node.style.top = guide.pos + 'px';
      this.guideLayer.appendChild(node);
    }
  }

  nudge(dx, dy) {
    const ids = [...this.selection];
    if (!ids.length) return;
    // group cohesion: nudged members drag their whole group
    const all = new Set(ids);
    for (const id of [...ids]) {
      const o = this.editor.project.objects.find(x => x.id === id);
      if (o && o.groupId) for (const m of this.editor.project.objects) if (m.groupId === o.groupId) all.add(m.id);
    }
    for (const id of all) {
      const obj = this.editor.project.objects.find(o => o.id === id);
      if (!obj) continue;
      obj.x += dx; obj.y += dy;
      this.updateNode(id);
    }
    this.editor.commitHistory('Nudge object');
    this.editor.scheduleAutosave();
  }
}