import { el } from '../ui.js';
import { buildObjectElement, createRenderContext, objTransform } from '../render.js';
import { deepClone, toNumber, interpolate, uid } from '../util.js';
import { coerceVarValue, createObject, cloneObject } from '../model.js';
import { luaToJs } from './luac.js';

const NUMBER_PROPS = new Set(['x', 'y', 'w', 'h', 'layer', 'opacity', 'borderWidth', 'radius', 'fontSize', 'maxValue', 'costAmount', 'seconds', 'min', 'max', 'step', 'rotation', 'z', 'rotX', 'rotY']);
const MAX_ACTIONS_PER_EVENT = 200; // guard against accidental cascades
const WIDGET_TYPES = new Set(['input', 'slider', 'toggle']);

/**
 * Play-mode runtime: private clone of the project, rAF game loop, per-object
 * code hooks (init/update/click), bound widgets and automatic purchases.
 */
export class GameRuntime {
  constructor(sourceProject, { onError = () => {}, onScene = null } = {}) {
    this.onError = onError;
    this.opts = { onScene };
    this.source = sourceProject;
    this.mountHost = null;
    this.destroyed = false;
    this.stage = null;
    this._fnCache = new Map();
    this._raf = null;
    this.time = 0;
    this.resetState();
  }

  /* ================= lifecycle ================= */

  resetState() {
    this.project = deepClone(this.source);
    this._gameUpdateBroken = false;
    this._gameUpdateErrors = 0;
    for (const o of this.project.objects) o.codeScripts?.forEach(s => { s._broken = false; });
    this.values = new Map(this.project.variables.map(v => [v.id, v.value]));
    this.textOverrides = new Map(); // objectId -> runtime text override
    for (const o of this.project.objects) {
      if (o.type === 'timer') { o.seconds = toNumber(o.seconds, 0); o.running = !!o.autoStart; }
    }
    this.dirty = false;
    this.nodes = new Map(); // objectId -> live DOM node (incremental refresh)
    this._objMapStale = true; // fresh clone → rebuild the name index on next obj() call
    this._prevValues = new Map(this.values);
    this._scene = null;
    this._gameUpdateBroken = false; this._gameUpdateErrors = 0;
    // "brain" object for game-wide scripts: self._x in On start/On update persists across frames
    this.gameSelf = { name: 'Game' };
  }

  mount(host) {
    this.unmount();
    this.mountHost = host;
    const { width, height, background } = this.project.settings;
    const bg0 = this.bgFor(this.dims().background);
    this.stage = el('div', {
      class: 'rt-stage',
      style: { width: width + 'px', height: height + 'px', backgroundColor: bg0.color, backgroundImage: bg0.image },
    });
    // world layer: everything moves inside it; the camera translates this div
    this.world = el('div', { class: 'rt-world', style: { position: 'absolute', left: '0', top: '0', width: '0', height: '0' } });
    this.particleLayer = el('div', { class: 'rt-particles', style: { position: 'absolute', left: '0', top: '0', width: '0', height: '0' } });
    this.world.appendChild(this.particleLayer);
    this.stage.appendChild(this.world);
    this.camera = { x: 0, y: 0, shake: 0, _target: null, _smooth: 5 };
    this.particles = [];
    this._triggerIn = new Map();
    this.stage.addEventListener('click', e => this.onStageClick(e));
    this.mouse = { x: 0, y: 0, down: false }; // {x, y, down} in stage coords — ALWAYS an object, scripts can read it on frame 1
    this._onStageMove = e => {
      const r = this.stage.getBoundingClientRect();
      const sc = r.width / this.dims().width || 1;
      this.mouse.x = (e.clientX - r.left) / sc;
      this.mouse.y = (e.clientY - r.top) / sc;
      this.updateHover();
    };
    this._onStageLeave = () => { this.mouse.down = false; };
    this._onStageUp = () => { this.mouse.down = false; };
    this.stage.addEventListener('mousemove', this._onStageMove);
    this.stage.addEventListener('mouseup', this._onStageUp);
    // touch → same mouse API (mobile support for every game, no code changes)
    this._onTouchMove = e => {
      const t = e.touches[0] || e.changedTouches[0];
      if (t) this._onStageMove(t);
      if (e.cancelable) e.preventDefault(); // no page scroll while playing
    };
    this._onTouchStart = e => { this._onTouchMove(e); this.mouse.down = true; };
    this._onTouchEnd = e => { this._onTouchMove(e); this.mouse.down = false; };
    this.stage.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.stage.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.stage.addEventListener('touchend', this._onTouchEnd);
    this.stage.addEventListener('touchcancel', this._onTouchEnd);
    window.addEventListener('mouseup', this._onStageUp); // release outside the stage still counts
    this.stage.addEventListener('mousedown', e => { this._onStageMove(e); this.mouse.down = true; });
    this.stage.addEventListener('mouseleave', this._onStageLeave);
    this.stage.addEventListener('input', e => this.onStageInput(e));
    host.appendChild(this.stage);
    this._keys = new Set();
    this._pressed = new Set();
    if (!GameRuntime._keyRef) {
      GameRuntime._keyRef = { count: 0 };
    }
    window.addEventListener('keydown', this._onKey = e => this.onKey(e, true));
    window.addEventListener('keyup', this._onKeyUp = e => this.onKey(e, false));
    GameRuntime._keyRef.count++;
    this.render();
    // SCENE OWNERSHIP at boot: objects belong to one scene unless persist.
    // Applies even with no startScene set — scenes are a partition, not opt-in.
    {
      const start = this.project.settings.startScene || this.sceneFirstName();
      if (start) this.gotoScene(start, { silent: true });
      else for (const o of this.project.objects) o.visible = (o.scene || 'main') === 'main' || o.persist === true;
    }
    window.__rt = this; // debug handle for console/automation
    this.runInitScripts();
    this.runStartEvents();
    this.startLoop();
  }

  sceneByName(name) {
    const scenes = this.project.scenes || [];
    return scenes.find(sc => sc.name === String(name)) || scenes.find(sc => sc.name.toLowerCase() === String(name).toLowerCase()) || scenes.find(sc => sc.name.toLowerCase() === 'main') || null;
  }

  sceneFirstName() {
    const s = (this.project.scenes || [])[0];
    return s ? s.name : '';
  }

  /** Current view size = active scene size (falls back to project settings). */
  bgFor(value) {
    // "img:<assetId>" → tiled/cover image background from the project's assets
    const s = String(value || '');
    if (s.startsWith('img:')) {
      const a = (this.project.assets || []).find(x => x.id === s.slice(4));
      if (a) return { color: '#000', image: 'url(' + a.url + ') center / cover no-repeat' };
    }
    return { color: s || '#12161f', image: 'none' };
  }

  dims() {
    const sc = this._scene ? this.sceneByName(this._scene) : null;
    const st = this.project.settings;
    return { width: sc ? sc.width : st.width, height: sc ? sc.height : st.height, background: sc ? sc.background : st.background };
  }

  gotoScene(name, opts = {}) {
    this._scene = String(name);
    // scene ownership: objects belong to one scene UNLESS persist === true
    // (persistent objects — the player, HUD brains — travel across scenes)
    for (const o of this.project.objects) o.visible = (o.scene || 'main') === this._scene || o.persist === true;
    // resize the stage + background to the new scene
    const d = this.dims();
    if (this.stage) {
      this.stage.style.width = d.width + 'px';
      this.stage.style.height = d.height + 'px';
      const bg = this.bgFor(d.background);
      this.stage.style.backgroundColor = bg.color;
      this.stage.style.backgroundImage = bg.image;
    }
    this.camera.x = 0; this.camera.y = 0; this.camera._target = null; this.camera.shake = 0;
    this._objMapStale = true;
    // scene-entry depenetration: a dynamic object that lands INSIDE a static one
    // (persistent player teleporting onto a new scene's floor) is lifted out so
    // it can never fall through the world after a scene switch.
    {
      const statics = this.project.objects.filter(o => o.visible !== false && o.type === 'panel' && !o.gravity);
      for (const o of this.project.objects) {
        if (!o.gravity || o.visible === false) continue;
        for (const s of statics) {
          const ox = Math.min(o.x + o.w, s.x + s.w) - Math.max(o.x, s.x);
          const oy = Math.min(o.y + o.h, s.y + s.h) - Math.max(o.y, s.y);
          if (ox > 0 && oy > 0 && o.y + o.h <= s.y + s.h + 2) { o.y = s.y - o.h; o.vy = 0; }
        }
        if (o.y > d.height + 200) { o.y = 40; o.vy = 0; }
      }
    }
    this.dirty = true;
    if (this.world) this.render(); // full rebuild: sizes & visibility changed wholesale
    if (this.opts && this.opts.onScene) this.opts.onScene();
    if (!opts.silent) this.runGameHook('onScene', { other: String(name) }, 'On scene');
  }

  /** Shape-aware overlap: ellipses use a circular hitbox, everything else a box. */
  overlap(a, b) {
    if (a.kind === 'ellipse' && b.kind === 'ellipse') {
      const dx = (a.x + a.w / 2) - (b.x + b.w / 2);
      const dy = (a.y + a.h / 2) - (b.y + b.h / 2);
      const r1 = Math.min(a.w, a.h) / 2, r2 = Math.min(b.w, b.h) / 2;
      return dx * dx + dy * dy < (r1 + r2) * (r1 + r2);
    }
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  }

  updateHover() {
    if (!this.mouse) return;
    const cam = this._camVisual || { x: 0, y: 0 };
    const x = this.mouse.x + cam.x, y = this.mouse.y + cam.y; // stage → world space
    let top = null;
    for (const o of this.project.objects) {
      if (o.visible === false) continue;
      if (!o.codeScripts?.some(s => (s.hook === 'hover' || s.hook === 'unhover') && s.code?.trim())) continue;
      if (x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h) {
        if (o.kind === 'ellipse') { // round shapes: hover only inside the circle
          const rx = o.w / 2, ry = o.h / 2, cx = o.x + rx, cy = o.y + ry;
          const dx = (x - cx) / rx, dy = (y - cy) / ry;
          if (dx * dx + dy * dy > 1) continue;
        }
        if (!top || (o.layer || 0) > (top.layer || 0)) top = o;
      }
    }
    const id = top ? top.id : null;
    if (id === this._hoverId) return;
    if (this._hoverId) {
      const old = this.project.objects.find(o => o.id === this._hoverId);
      if (old) this.runHookScripts(old, 'unhover');
    }
    this._hoverId = id;
    if (top) this.runHookScripts(top, 'hover');
  }

  onKey(e, down) {
    // typing in the code editor / inputs should not drive the game
    const t = document.activeElement;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) return;
    let k = (e.key || '').toLowerCase();
    if (k === ' ' || k === 'spacebar') k = 'space';
    if (k === 'space' || k.startsWith('arrow')) e.preventDefault(); // stop page scroll + button re-click
    if (down) {
      if (e.repeat) { this._keys.add(k); return; } // held key auto-repeat must NOT re-trigger pressed()
      this._keys.add(k); this._pressed.add(k);
      if (this.project.scripts?.onKey?.trim()) this.runGameHook('onKey', { other: k }, 'On key');
    }
    else this._keys.delete(k);
  }

  unmount() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._onKey) { window.removeEventListener('keydown', this._onKey); this._onKey = null; }
    if (this._onKeyUp) { window.removeEventListener('keyup', this._onKeyUp); this._onKeyUp = null; }
    if (this.stage) {
      this.stage.removeEventListener('mousemove', this._onStageMove);
      this.stage.removeEventListener('mousedown', this._onStageMove);
      this.stage.removeEventListener('mouseup', this._onStageUp);
      window.removeEventListener('mouseup', this._onStageUp);
      this.stage.removeEventListener('mouseleave', this._onStageLeave);
      this.stage.removeEventListener('touchstart', this._onTouchStart);
      this.stage.removeEventListener('touchmove', this._onTouchMove);
      this.stage.removeEventListener('touchend', this._onTouchEnd);
      this.stage.removeEventListener('touchcancel', this._onTouchEnd);
    }
    if (this.stage) this.stage.remove();
    this.stage = null;
  }

  reset() {
    if (this.destroyed) return;
    const host = this.mountHost;
    this.unmount();
    this.resetState();
    this.time = 0;
    if (host) this.mount(host);
  }

  destroy() {
    this.destroyed = true;
    this.unmount();
    this.mountHost = null;
  }

  /* ================= rendering ================= */

  ctx() {
    return createRenderContext(this.project, { values: this.values });
  }

  render() {
    if (!this.stage) return;
    this._lastIds = this.project.objects.map(o => o.id).join('|');
    this.stage.innerHTML = '';
    this.world.innerHTML = '';
    this.world.appendChild(this.particleLayer);
    this.stage.appendChild(this.world); // keep world + particle layer across full rebuilds
    this._objMapStale = true;
    this.nodes = new Map();
    const ctx = this.ctx();
    const sorted = [...this.project.objects].sort((a, b) => (a.layer || 0) - (b.layer || 0));
    for (const obj of sorted) {
      const node = this.materialize(obj, ctx);
      this.nodes.set(obj.id, node);
      this.world.appendChild(node);
    }
  }

  /** Rebuild displays, but keep focused widgets alive so typing doesn't stutter. */
  refreshDynamic() {
    if (!this.stage) return;
    // incremental sync: only rebuild what changed (spawn/destroy/property),
    // instead of replacing every node — smooth even with hundreds of objects
    const active = document.activeElement;
    const activeNode = active && active.closest ? active.closest('.ui-object') : null;
    const ctx = this.ctx();
    const objs = [...this.project.objects].sort((a, b) => (a.layer || 0) - (b.layer || 0));
    const ids = new Set(objs.map(o => o.id));
    // remove nodes whose objects are gone
    for (const [id, node] of [...this.nodes]) if (!ids.has(id)) { node.remove(); this.nodes.delete(id); }
    let ref = this.world.lastElementChild || null;
    for (let i = objs.length - 1; i >= 0; i--) {
      const obj = objs[i];
      let node = this.nodes.get(obj.id);
      const varVal = (obj.type === 'counter' || obj.type === 'progressbar' || obj.type === 'slider' || obj.type === 'toggle' || obj.type === 'input') ? this.values.get(obj.variableId) : '';
      const sig = JSON.stringify([obj.type, obj.text, obj.bg, obj.color, obj.fontSize, obj.bold, obj.italic, obj.kind, obj.visible, obj.opacity, obj.rotation, obj.running, obj.seconds, obj.value, obj.assetId, obj.fillColor, obj.maxValue, obj.on, this.textOverrides.get(obj.id) || '', varVal, obj.variableId]);
      if (!node || node._dsig !== sig) {
        if (node === activeNode) { node.style.left = obj.x + 'px'; node.style.top = obj.y + 'px'; ref = node; continue; }
        const fresh = this.materialize(obj, ctx);
        fresh._dsig = sig;
        if (node) node.replaceWith(fresh);            // in-place: keeps DOM order, no ref issues
        else this.world.insertBefore(fresh, ref);     // brand-new object
        node = fresh;
        this.nodes.set(obj.id, node);
      } else if (node !== activeNode) {
        node.style.left = obj.x + 'px';
        node.style.top = obj.y + 'px';
        node.style.width = obj.w + 'px';
        node.style.height = obj.h + 'px';
        node.style.transform = objTransform(obj);
        node._cv = undefined; // let the camera culler re-decide visibility
      }
    }
    this.dirty = false;
  }

  materialize(obj, ctx) {
    let source = obj;
    if (this.textOverrides.has(obj.id)) {
      source = Object.assign({}, obj, { text: this.textOverrides.get(obj.id) });
    }
    if (source.type === 'trigger') source = Object.assign({}, source, { visible: false }); // zones are editor-only
    const node = buildObjectElement(source, ctx, { interactive: true });
    const clickable = obj.type === 'button' || obj.type === 'upgrade' || WIDGET_TYPES.has(obj.type) ||
      (obj.codeScripts || []).some(s => s.hook === 'click' && s.code?.trim());
    if (clickable) node.classList.add('rt-clickable');
    // hover/unhover fire via stage hit-testing (see updateHover) — node listeners would
    // be lost whenever a physics rebuild replaces the node.
    return node;
  }

  runHookScripts(obj, hook, extra = null) {
    for (const s of obj.codeScripts || []) {
      if (s.hook !== hook || !s.code?.trim()) continue;
      this.runScript(s.code, this.scriptApi(obj, { dt: 0, time: this.time, other: extra?.other ? this.live(extra.other) : undefined }), s.name,
        err => this.onError(`"${obj.name}/${s.name}" ${hook}: ${err.message || err}`), s.lang);
    }
  }

  /* ================= game loop ================= */

  startLoop() {
    let last = performance.now();
    const step = now => {
      if (this.destroyed || !this.stage) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.time += dt;
      this._prevValues = new Map(this.values); // changed() compares against start-of-frame
      this.tickTimers(dt);
      this.tickPhysics(dt);
      this.runUpdateScripts(dt);
      this.tickCamera(dt);
      this.tickTriggers(dt);
      this.tickEmitters(dt);
      this.tickParticles(dt);
      this._pressed.clear(); // pressed() is edge-triggered: valid only during the frame it happened
      if (this.dirty) this.refreshDynamic();
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  tickTimers(dt) {
    for (const obj of this.project.objects) {
      if (obj.type !== 'timer' || obj.running === false) continue;
      let s = toNumber(obj.seconds, 0);
      if (obj.mode === 'stopwatch') s += dt;
      else {
        s = Math.max(0, s - dt);
        if (s === 0) obj.running = false;
      }
      obj.seconds = s;
      // Update display text in place (cheap, no rebuild, no transition loss).
      const node = this.stage.querySelector(`[data-object-id="${obj.id}"] .timer-text`);
      if (node) {
        const t = Math.max(0, Math.ceil(s));
        node.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      }
    }
  }

  tickPhysics(dt) {
    const { width, height } = this.project.settings;
    const worldW = toNumber(this.project.settings.worldWidth, width);
    const worldH = toNumber(this.project.settings.worldHeight, height);
    for (const obj of this.project.objects) {
      const g = toNumber(obj.gravity, 0) * toNumber(this.project.settings.gravityScale, 1);
      const vx = toNumber(obj.vx, 0);
      const vy = toNumber(obj.vy, 0);
      if (!g && !vx && !vy) continue;
      obj.vy = vy + g * dt;
      obj.x = toNumber(obj.x, 0) + obj.vx * dt;
      obj.y = toNumber(obj.y, 0) + obj.vy * dt;
      if (obj.bounce) {
        const floor = worldH - obj.h, right = worldW - obj.w;
        if (obj.y >= floor) { obj.y = floor; if (obj.vy > 0) obj.vy = -obj.vy * 0.62; if (Math.abs(obj.vy) < 25) obj.vy = 0; }
        if (obj.y <= 0 && obj.vy < 0) { obj.y = 0; obj.vy = -obj.vy * 0.62; }
        if (obj.x >= right) { obj.x = right; obj.vx = -obj.vx * 0.8; }
        if (obj.x <= 0 && obj.vx < 0) { obj.x = 0; obj.vx = -obj.vx * 0.8; }
      }
      this.dirty = true;
    }
  }

  /* ================= camera ================= */
  // The camera is a viewport into a larger world. All objects live in world
  // space; the world layer is translated by (-x, -y). Generic: no game logic.
  tickCamera(dt) {
    const cam = this.camera;
    if (!cam) return;
    if (cam._target) {
      const t = typeof cam._target === 'object' ? cam._target : this.objIndex().get(cam._target);
      if (t && !t.__gone) {
        const dv = this.dims();
        const vw = dv.width, vh = dv.height;
        const tx = t.x + t.w / 2 - vw / 2, ty = t.y + t.h / 2 - vh / 2;
        const k = Math.min(1, (cam._smooth || 5) * dt);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
      }
    }
    // clamp to world bounds (when world is bigger than the view)
    const d = this.dims();
    const ww = toNumber(this.project.settings.worldWidth, d.width);
    const wh = toNumber(this.project.settings.worldHeight, d.height);
    cam.x = Math.max(0, Math.min(cam.x, Math.max(0, ww - d.width)));
    cam.y = Math.max(0, Math.min(cam.y, Math.max(0, wh - d.height)));
    // shake: decaying random offset, purely visual (doesn't move game state)
    cam.shake = Math.max(0, cam.shake - dt * 30);
    const sx = cam.shake ? (Math.random() * 2 - 1) * cam.shake : 0;
    const sy = cam.shake ? (Math.random() * 2 - 1) * cam.shake : 0;
    if (this.world) this.world.style.transform = `translate3d(${Math.round(-cam.x + sx)}px, ${Math.round(-cam.y + sy)}px, 0)`;
    this._camVisual = { x: cam.x - sx, y: cam.y - sy };
    // viewport culling: hide nodes fully outside the camera view (skip layout/paint).
    if (cam._cull !== false) {
      const { width: vw, height: vh } = this.dims();
      const vx = cam.x - sx, vy = cam.y - sy;
      for (const o of this.project.objects) {
        if (o.type === 'trigger') continue;
        const node = this.nodes.get(o.id);
        if (!node) continue;
        if (o.visible === false) continue; // script-hidden stays hidden
        const off = o.x + o.w < vx - 60 || o.x > vx + vw + 60 || o.y + o.h < vy - 60 || o.y > vy + vh + 60;
        const v = off ? 'hidden' : '';
        if (node._cv !== v) { node._cv = v; node.style.visibility = v; }
      }
    }
  }

  snapshotValues() {
    this._prevValues = new Map(this.values);
  }

  /* ================= triggers ================= */
  // A trigger object watches one target object (by name) crossing its box.
  // Fires On enter / On exit script hooks with `other` = the crossing object.
  tickTriggers(dt) {
    for (const t of this.project.objects) {
      if (t.type !== 'trigger' || t.visible === false) continue;
      const target = this.objIndex().get(t.targetName);
      const inside = !!target && this.overlap(t, target);
      const was = this._triggerIn.get(t.id) || false;
      if (inside === was) continue;
      this._triggerIn.set(t.id, inside);
      if (target) {
        if (inside) this.runHookScripts(t, 'enter', { other: target });
        else this.runHookScripts(t, 'exit', { other: target });
      }
    }
  }

  /* ================= particles ================= */
  // Emitters are objects with type 'emitter'; emit() API makes one-shot bursts.
  // Particles are pooled divs in the world layer — cheap, capped, never leak.
  spawnParticle(x, y, opts = {}) {
    if (this.particles.length >= 260) return; // hard cap: perf safety
    let node = this._freeParticles?.pop();
    if (!node) {
      node = document.createElement('div');
      node.style.position = 'absolute';
      node.style.pointerEvents = 'none';
    }
    const color = opts.color || '#ffd76e';
    node.style.background = color;
    node.style.borderRadius = opts.square ? '2px' : '50%';
    const p = {
      x, y,
      vx: opts.vx ?? (Math.random() * 2 - 1) * 60,
      vy: opts.vy ?? -(Math.random() * 80 + 40),
      life: 0,
      max: opts.life ?? (0.5 + Math.random() * 0.5),
      size: opts.size ?? 6,
      gravity: opts.gravity ?? 300,
      node,
    };
    node.style.width = node.style.height = p.size + 'px';
    this.particleLayer.appendChild(node);
    this.particles.push(p);
  }

  emitBurst(x, y, count = 12, opts = {}) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const sp = opts.speed ?? 120;
      this.spawnParticle(x, y, {
        ...opts,
        vx: Math.cos(a) * sp * (0.5 + Math.random()),
        vy: Math.sin(a) * sp * (0.5 + Math.random()),
      });
    }
  }

  tickEmitters(dt) {
    for (const e of this.project.objects) {
      if (e.type !== 'emitter' || e.running === false || e.visible === false) continue;
      e._acc = (e._acc || 0) + dt * toNumber(e.rate, 20);
      while (e._acc >= 1) {
        e._acc -= 1;
        const ang = (toNumber(e.angle, -90) * Math.PI) / 180;
        const spread = (toNumber(e.spread, 40) * Math.PI) / 180;
        const a = ang + (Math.random() * 2 - 1) * spread / 2;
        const sp = toNumber(e.speed, 90) * (0.6 + Math.random() * 0.8);
        const colors = String(e.colors || '#ffd76e,#ff9e6b').split(',');
        this.spawnParticle(e.x + e.w / 2, e.y + e.h / 2, {
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: toNumber(e.life, 0.8), size: toNumber(e.size, 6),
          gravity: toNumber(e.gravity, 200),
          color: colors[Math.floor(Math.random() * colors.length)].trim(),
        });
      }
    }
  }

  tickParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) {
        p.node.remove();
        (this._freeParticles = this._freeParticles || []).push(p.node);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.node.style.transform = `translate3d(${p.x | 0}px, ${p.y | 0}px, 0)`;
      p.node.style.opacity = (1 - p.life / p.max).toFixed(2);
    }
  }

  changed(name) {
    const v = this.findVar(name);
    if (!v) return false;
    const prev = this._prevValues ? this._prevValues.get(v.id) : undefined;
    return this.values.get(v.id) !== prev;
  }

  findVar(key) {
    return this.project.variables.find(v => v.id === key || v.name === key);
  }

  /**
   * O(1) name/id → object index for obj() lookups.
   * Rebuilt lazily only when the object set changes (spawn/destroy/rename/reset).
   */
  /** Live proxy handle: writes coerce numbers, mark dirty, keep indices fresh. */
  live(o) {
    const runtime = this;
    return new Proxy(o, {
      set(target, prop, value) {
        target[prop] = NUMBER_PROPS.has(prop) ? toNumber(value, target[prop]) : value;
        if (prop === 'text') runtime.textOverrides.set(target.id, value);
        if (prop === 'name') runtime._objMapStale = true;
        runtime.dirty = true;
        return true;
      },
    });
  }

  objIndex() {
    if (!this._objMap || this._objMapStale) {
      this._objMap = new Map();
      for (const o of this.project.objects) {
        if (!this._objMap.has(o.name)) this._objMap.set(o.name, o); // first wins, like .find()
        this._objMap.set(o.id, o);
      }
      this._objMapStale = false;
    }
    return this._objMap;
  }

  runGameHook(key, extra, label) {
    const code = this.project.scripts?.[key];
    if (!code || !code.trim()) return;
    this.runScript(code, this.scriptApi(this.gameSelf, Object.assign({ dt: 0, time: this.time }, extra)), 'game',
      err => this.onError('Game script "' + label + '" error: ' + (err.message || err)), this.project.scripts.lang || 'js');
  }

  runUpdateScripts(dt) {
    if (this.project.scripts?.onUpdate) {
      if (this._gameUpdateBroken) return; // disabled after repeated errors (cleared by reset)
      this._frameErr = false;
      this.runScript(this.project.scripts.onUpdate, this.scriptApi(this.gameSelf, { dt, time: this.time }), 'game',
        err => {
          this._frameErr = true;
          this.onError(`Game script "On update" error: ${err.message || err}`);
        }, this.project.scripts.lang || 'js');
      this._gameUpdateErrors = this._frameErr ? (this._gameUpdateErrors || 0) + 1 : 0;
      if (this._gameUpdateErrors >= 5 && !this._gameUpdateBroken) { this._gameUpdateBroken = true; this.onError('Game script "On update" disabled after 5 bad frames — press Reset or fix the code'); }
    }
    for (const obj of this.project.objects) {
      for (const s of obj.codeScripts || []) {
        if (s.hook !== 'update' || !s.code?.trim() || s._broken) continue;
        this.runScript(s.code, this.scriptApi(obj, { dt, time: this.time }), s.name, err => {
          s._broken = true; // report once, not every frame
          this.onError(`"${obj.name}/${s.name}" update disabled after error: ${err.message || err}`);
        }, s.lang);
      }
    }
  }

  runInitScripts() {
    if (this.project.scripts?.onStart) {
      this.runScript(this.project.scripts.onStart, this.scriptApi(this.gameSelf, { dt: 0, time: 0 }), 'game',
        err => this.onError(`Game script "On start": ${err.message || err}`), this.project.scripts.lang || 'js');
    }
    for (const obj of this.project.objects) {
      for (const s of obj.codeScripts || []) {
        if (s.hook !== 'init' || !s.code?.trim()) continue;
        this.runScript(s.code, this.scriptApi(obj, { dt: 0, time: 0 }), s.name,
          err => this.onError(`"${obj.name}/${s.name}" on create: ${err.message || err}`), s.lang);
      }
    }
    this.dirty = true;
  }

  /* ================= input handling ================= */

  onStageClick(e) {
    if (this.project.scripts?.onClick?.trim()) {
      const node = e.target.closest('[data-object-id]');
      const o = node ? this.project.objects.find(x => x.id === node.dataset.objectId) : null;
      this.runGameHook('onClick', { other: o ? this.live(o) : null }, 'On click');
    }
    if (this.destroyed) return;
    const node = e.target.closest('.ui-object');
    if (!node) return;
    const obj = this.project.objects.find(o => o.id === node.dataset.objectId);
    if (!obj || obj.visible === false) return;

    if (obj.type === 'toggle') {
      this.flipToggle(obj);
      this.runClickScripts(obj);
      this.refreshDynamic();
      return;
    }

    // Script children with the click hook run first; cancel() short-circuits purchase + events.
    if (this.runClickScripts(obj)) { this.refreshDynamic(); return; }

    // Purchase mode: cost-enabled buttons deduct automatically; a failed
    // purchase swallows the click (no events run).
    if (obj.costVariableId && !this.tryPurchase(obj)) { this.refreshDynamic(); return; }

    for (const event of this.eventsFor('click', obj.id)) {
      if (this.checkConditions(event)) this.runEvent(event);
    }
    this.refreshDynamic();
  }

  /** Runs every "On click" script child of obj. Returns true if any called cancel(). */
  runClickScripts(obj) {
    let cancelled = false;
    for (const s of obj.codeScripts || []) {
      if (s.hook !== 'click' || !s.code?.trim()) continue;
      this.runScript(s.code, this.scriptApi(obj, { dt: 0, time: this.time, cancel: () => { cancelled = true; } }),
        s.name, err => this.onError(`"${obj.name}/${s.name}" on click: ${err.message || err}`), s.lang);
      if (cancelled) break;
    }
    return cancelled;
  }

  onStageInput(e) {
    const node = e.target.closest('.ui-object');
    if (!node) return;
    const obj = this.project.objects.find(o => o.id === node.dataset.objectId);
    if (!obj || !obj.variableId) return;
    const variable = this.project.variables.find(v => v.id === obj.variableId);
    if (!variable) { this.onError(`Widget "${obj.name}" binds a missing variable`); return; }
    const raw = e.target.value;
    this.values.set(variable.id, coerceVarValue(
      variable.type === 'number' ? toNumber(raw, 0) : variable.type === 'boolean' ? raw === 'true' : raw,
      variable.type,
    ));
    // Display widgets (counter/text/progressbar/button cost) follow live values.
    this.dirty = true;
    this.refreshDynamic();
  }

  flipToggle(obj) {
    const variable = this.project.variables.find(v => v.id === obj.variableId);
    if (!variable) return;
    if (variable.type === 'boolean') {
      this.values.set(variable.id, !this.values.get(variable.id));
      this.dirty = true; // force the switch node to rebuild even though widgets are focus-safe
    } else if (variable.type === 'number') {
      // audit fix: toggling a number flips 0 ⇄ 1 (on/off switch), matching how
      // games use number flags — previously this only logged an error.
      const cur = toNumber(this.values.get(variable.id), 0);
      const next = cur ? 0 : 1;
      this.values.set(variable.id, coerceVarValue(next, 'number'));
      this.dirty = true;
    } else {
      this.onError(`Toggle "${obj.name}" must bind a boolean or number variable`);
    }
  }

  /* ================= events ================= */

  eventsFor(trigger, objectId) {
    return this.project.events.filter(e =>
      e.trigger === trigger && (trigger === 'start' || e.targetId === objectId)
    );
  }

  runStartEvents() {
    for (const event of this.eventsFor('start')) this.runEvent(event);
    this.refreshDynamic();
  }

  tryPurchase(obj) {
    const variable = this.project.variables.find(v => v.id === obj.costVariableId);
    if (!variable) { this.onError(`Button "${obj.name}" cost variable is missing`); return false; }
    const cost = toNumber(obj.costAmount, 0);
    const have = toNumber(this.values.get(variable.id), 0);
    if (have < cost) return false;
    this.values.set(variable.id, variable.type === 'number' ? have - cost : have);
    return true;
  }

  runEvent(event) {
    let count = 0;
    for (const action of event.actions || []) {
      if (count++ >= MAX_ACTIONS_PER_EVENT) {
        this.onError(`Event "${event.name}" exceeded ${MAX_ACTIONS_PER_EVENT} actions`);
        break;
      }
      try {
        this.applyAction(action);
      } catch (err) {
        this.onError(`Event "${event.name}": ${err.message || err}`);
      }
    }
  }

  checkConditions(event) {
    for (const cond of event.conditions || []) {
      if (!this.evalCondition(cond)) return false;
    }
    return true;
  }

  evalCondition(cond) {
    const variable = this.project.variables.find(v => v.id === cond.variableId);
    if (!variable) { this.onError(`Condition references a missing variable`); return false; }
    const left = this.values.get(variable.id);
    const right = cond.value;
    switch (variable.type) {
      case 'number': {
        const a = toNumber(left, 0);
        const b = toNumber(right, 0);
        switch (cond.operator) {
          case '>': return a > b;
          case '<': return a < b;
          case '>=': return a >= b;
          case '<=': return a <= b;
          case '==': return a === b;
          case '!=': return a !== b;
          default: return false;
        }
      }
      case 'boolean': {
        const a = left === true;
        const b = right === true || right === 'true';
        return cond.operator === '!=' ? a !== b : a === b;
      }
      default: {
        const a = String(left ?? '');
        const b = String(right ?? '');
        switch (cond.operator) {
          case '>': return a > b;
          case '<': return a < b;
          case '>=': return a >= b;
          case '<=': return a <= b;
          case '==': return a === b;
          case '!=': return a !== b;
          default: return false;
        }
      }
    }
  }

  /* ================= actions ================= */

  getVar(id) {
    const variable = this.project.variables.find(v => v.id === id);
    if (!variable) throw new Error('Unknown variable');
    return variable;
  }

  applyAction(action) {
    switch (action.type) {
      case 'add': case 'subtract': case 'multiply': case 'set': {
        const variable = this.getVar(action.variableId);
        const current = this.values.get(variable.id);
        let next;
        if (variable.type === 'number') {
          const operand = toNumber(action.value, 0);
          const a = toNumber(current, 0);
          next = action.type === 'add' ? a + operand
            : action.type === 'subtract' ? a - operand
            : action.type === 'multiply' ? a * operand
            : operand;
        } else if (variable.type === 'boolean') {
          next = action.type === 'set' ? (action.value === true || action.value === 'true') : current;
        } else { // text
          next = action.type === 'set' ? String(action.value ?? '')
            : action.type === 'add' ? String(current ?? '') + String(action.value ?? '')
            : action.type === 'subtract' ? String(current ?? '').replace(String(action.value ?? ''), '')
            : String(current ?? '');
        }
        this.values.set(variable.id, coerceVarValue(next, variable.type));
        break;
      }
      case 'updateText': {
        const obj = this.project.objects.find(o => o.id === action.objectId);
        if (!obj) throw new Error('Unknown object for updateText');
        const ctx = this.ctx();
        this.textOverrides.set(obj.id, resolveText(action.text ?? '', ctx));
        break;
      }
      case 'show': case 'hide': {
        const obj = this.project.objects.find(o => o.id === action.objectId);
        if (!obj) throw new Error('Unknown object for ' + action.type);
        obj.visible = action.type === 'show';
        break;
      }
      case 'setProperty': {
        const obj = this.project.objects.find(o => o.id === action.objectId);
        if (!obj) throw new Error('Unknown object for setProperty');
        const prop = action.property;
        if (!prop) throw new Error('setProperty missing property name');
        obj[prop] = NUMBER_PROPS.has(prop) ? toNumber(action.value, obj[prop]) : action.value;
        break;
      }
      case 'code': {
        this.runScript(action.code || '', this.scriptApi(this.gameSelf, { dt: 0, time: this.time }), 'action',
          err => { throw err; });
        break;
      }
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /* ================= audio & async helpers ================= */

  beep(freq = 440, ms = 80) {
    try {
      if (!this._audio) this._audio = new (window.AudioContext || window.webkitAudioContext)();
      const ac = this._audio;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.06, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + ms / 1000);
      osc.connect(gain).connect(ac.destination);
      gain.gain.value = gain.gain.value * (this.project.settings.volume ?? 1);
      osc.start();
      osc.stop(ac.currentTime + ms / 1000);
    } catch { /* audio unavailable */ }
  }

  wait(sec) {
    // usable inside async code: `await wait(1)` — resolves after N seconds of game time
    return new Promise(res => setTimeout(res, Math.max(0, sec) * 1000));
  }

  /** Audio asset playback: upload mp3/wav in the Assets panel, then play("jump"). */
  playAsset(name, vol = 1) {
    const asset = (this.project.assets || []).find(a => a.name === name || a.id === name);
    if (!asset || !asset.dataUrl) throw new Error(`Unknown sound asset: ${name}`);
    try {
      const a = new Audio(asset.dataUrl);
      a.volume = Math.min(1, Math.max(0, vol)) * (this.project.settings.volume ?? 1);
      a.play().catch(() => {});
      return a;
    } catch { return null; }
  }

  /** Persistent game storage (localStorage), namespaced per project + slot. */
  saveData(slot, data) {
    try {
      localStorage.setItem(`2dengine-studio-save:${this.project.id}:${slot}`, JSON.stringify(data ?? null));
      return true;
    } catch { return false; }
  }

  loadData(slot) {
    try {
      const raw = localStorage.getItem(`2dengine-studio-save:${this.project.id}:${slot}`);
      return raw === null ? null : JSON.parse(raw);
    } catch { return null; }
  }

  /* ================= scripting ================= */

  /** @param lang 'js' (default) or 'lua' — Lua is compiled to JS by luac. */
  compile(code, lang = 'js') {
    const key = lang + '\u0000' + code;
    let fn = this._fnCache.get(key);
    if (!fn) {
      let body = code;
      if (lang === 'lua') {
        try { body = luaToJs(code); }
        catch (err) { throw new Error('Lua compile error: ' + err.message); }
      }
      fn = new Function('api', `"use strict";
const { get, set, add, subtract, multiply, increase, decrease, toggleVar, obj, tagged, objects,
  hide, show, toggleVisible, setText, moveTo, moveBy, setSize, setProperty,
  setColor, setTextColor, setOpacity, bring, spawn, destroy,
  timerStart, timerStop, timerSet, beep, wait, vars,
  rand, randInt, chance, pick, clamp, key, pressed, changed, clone, touching,
  gotoScene, currentScene, restart, save, load, play, mouse, log, warn, error, pcall, len,
  self, other, dt, time, cancel, cam, emit, view } = api;
return (async () => {
${body}
})();`);
      this._fnCache.set(key, fn);
    }
    return fn;
  }

  /** Run a compiled script; sync errors throw, async rejections are reported. */
  runScript(code, api, label, onErr, lang = 'js') {
    try {
      const r = this.compile(code, lang)(api);
      if (r && typeof r.catch === 'function') r.catch(err => onErr(err));
    } catch (err) {
      onErr(err);
    }
  }

  scriptApi(selfObj, extra = {}) {
    const project = this.project;
    const runtime = this;
    const findVar = key => {
      const v = project.variables.find(x => x.id === key || x.name === key);
      if (!v) throw new Error(`Unknown variable: ${key}`);
      return v;
    };
    const markDirty = () => { runtime.dirty = true; };
    const live = o => new Proxy(o, {
      set(target, prop, value) {
        target[prop] = NUMBER_PROPS.has(prop) ? toNumber(value, target[prop]) : value;
        if (prop === 'text') runtime.textOverrides.set(target.id, value);
        if (prop === 'name') runtime._objMapStale = true; // renames must re-index obj() lookups
        markDirty();
        return true;
      },
    });
    const api = {
      get: key => runtime.values.get(findVar(key).id),
      set: (key, value) => {
        let v = project.variables.find(x => x.id === key || x.name === key);
        if (!v) { // code-first flow: set() creates the variable on the fly
          v = { id: uid('var'), name: String(key), type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'text', value: null };
          project.variables.push(v);
        }
        runtime.values.set(v.id, coerceVarValue(value, v.type));
        markDirty();
      },
      add: (key, n) => { api.set(key, toNumber(api.get(key), 0) + toNumber(n, 0)); return api.get(key); },
      subtract: (key, n) => api.set(key, toNumber(api.get(key), 0) - toNumber(n, 0)),
      multiply: (key, n) => api.set(key, toNumber(api.get(key), 0) * toNumber(n, 0)),
      increase: (key, n = 1) => api.add(key, n),
      decrease: (key, n = 1) => api.subtract(key, n),
      toggleVar: key => { const v = findVar(key); api.set(key, !(runtime.values.get(v.id) === true)); },
      objIndex: () => this.objIndex(),
      obj: sel => {
        const key = sel && typeof sel === 'object' ? sel.id : sel;
        const o = this.objIndex().get(key);
        if (!o) throw new Error(`Unknown object: ${sel}`);
        return live(o);
      },
      tagged: tag => project.objects.filter(o => (o.tags || []).includes(tag)).map(live),
      objects: () => project.objects.map(live),
      // --- object control ---
      hide: sel => { api.obj(sel).visible = false; },
      show: sel => { api.obj(sel).visible = true; },
      toggleVisible: sel => { const o = api.obj(sel); o.visible = !(o.visible !== false); },
      setText: (sel, t) => { api.obj(sel).text = String(t); },
      moveTo: (sel, x, y) => { const o = api.obj(sel); o.x = x; o.y = y; },
      moveBy: (sel, dx, dy) => { const o = api.obj(sel); o.x = toNumber(o.x, 0) + dx; o.y = toNumber(o.y, 0) + dy; },
      setSize: (sel, w, h) => { const o = api.obj(sel); o.w = w; o.h = h; },
      setProperty: (sel, prop, value) => { api.obj(sel)[prop] = value; },
      setColor: (sel, css) => { api.obj(sel).bg = css; },
      setTextColor: (sel, css) => { api.obj(sel).color = css; },
      setOpacity: (sel, v) => { api.obj(sel).opacity = Math.max(0, Math.min(1, v)); },
      bring: (sel, front = true) => {
        const o = api.obj(sel);
        const max = Math.max(...project.objects.map(x => x.layer || 0), 0);
        const min = Math.min(...project.objects.map(x => x.layer || 0), 0);
        o.layer = front ? max + 1 : min - 1;
      },
      spawn: (type, opts = {}) => {
        const obj = createObject(type, project, opts);
        if (obj.scene === 'main' && !opts.scene && runtime._scene) obj.scene = runtime._scene;
        project.objects.push(obj);
        runtime._objMapStale = true;
        markDirty();
        return live(obj);
      },
      destroy: sel => {
        const o = typeof sel === 'object' && sel.id ? project.objects.find(x => x.id === sel.id) : api.obj(sel);
        if (!o) return;
        project.objects = project.objects.filter(x => x.id !== o.id);
        runtime._objMapStale = true;
        markDirty();
      },
      // --- timer control ---
      timerStart: sel => { api.obj(sel).running = true; },
      timerStop: sel => { api.obj(sel).running = false; },
      timerSet: (sel, seconds) => { api.obj(sel).seconds = toNumber(seconds, 0); },
      // --- audio & misc ---
      beep: (freq = 440, ms = 80) => runtime.beep(freq, ms),
      wait: sec => runtime.wait(sec),
      vars: () => Object.fromEntries(project.variables.map(v => [v.name, runtime.values.get(v.id)])),
      rand: (min, max) => min + Math.random() * (max - min),
      randInt: (min, max) => Math.floor(min + Math.random() * (max - min + 1)),
      chance: p => Math.random() < p,
      pick: arr => arr[Math.floor(Math.random() * arr.length)],
      clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
      key: name => runtime._keys.has(String(name).toLowerCase()),
      pressed: name => runtime._pressed.has(String(name).toLowerCase()),
      mouse: runtime.mouse,
      // --- this round's upgrades ---
      changed: name => runtime.changed(name),
      clone: sel => { const o = api.obj(sel); if (!o) return null; const copy = cloneObject(project.objects.find(x => x.id === o.id) || o, project); runtime._objMapStale = true; return live(copy); },
      touching: (a, b) => {
        const oa = api.obj(a), ob = api.obj(b);
        if (!oa || !ob) return false;
        return runtime.overlap(oa, ob);
      },
      gotoScene: name => runtime.gotoScene(name),
      currentScene: () => runtime._scene,
      restart: () => runtime.reset(), // replay from On start (generic, for game-over "press space")
      // --- camera & particles ---
      cam: {
        follow: (target, smooth = 5) => { runtime.camera._target = typeof target === 'string' ? api.obj(target) : target; runtime.camera._smooth = smooth; },
        unfollow: () => { runtime.camera._target = null; },
        moveTo: (x, y) => { runtime.camera.x = x; runtime.camera.y = y; },
        shake: (mag = 8) => { runtime.camera.shake = Math.max(runtime.camera.shake || 0, mag); },
        persp: (d = 800) => {
          runtime.camera._persp = toNumber(d, 800);
          if (runtime.world) {
            runtime.world.style.perspective = runtime.camera._persp + 'px';
            runtime.world.style.transformStyle = 'preserve-3d';
          }
        },
        get x() { return runtime.camera.x; },
        set x(v) { runtime.camera.x = v; },
        get y() { return runtime.camera.y; },
        set y(v) { runtime.camera.y = v; },
      },
      emit: (x, y, count = 12, opts = {}) => runtime.emitBurst(x, y, count, opts),
      view: () => ({ width: runtime.dims().width, height: runtime.dims().height, scenes: (project.scenes || []).map(s2 => s2.name), scene: runtime._scene || 'main',
        worldWidth: toNumber(project.settings.worldWidth, project.settings.width),
        worldHeight: toNumber(project.settings.worldHeight, project.settings.height) }),
      save: (slot, data) => runtime.saveData(slot, data),
      load: slot => runtime.loadData(slot),
      play: (name, vol = 1) => runtime.playAsset(name, vol),
      log: (...args) => console.log('[game]', ...args),
      warn: (...args) => console.warn('[game]', ...args),
      error: msg => { throw new Error(String(msg)); },
      pcall: fn => { try { return [true, fn()]; } catch (err) { return [false, err]; } },
      len: x => (x && x.length) || 0,
      self: selfObj ? live(selfObj) : null,
      other: extra.other, // set in On enter / On exit hooks: the object that crossed the trigger
      cancel: extra.cancel || (() => {}),
      dt: extra.dt ?? 0,
      time: extra.time ?? this.time,
    };
    return api;
  }
}

/** updateText may contain {{vars}}; resolve them against live values now. */
function resolveText(raw, ctx) {
  return interpolate(String(raw ?? ''), ctx.getVarByName);
}
