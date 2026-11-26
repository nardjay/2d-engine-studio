import { el, contextMenu, toast } from 'ui.js';

const HOOKS = [
  ['update', 'Every frame'],
  ['click', 'On click'],
  ['hover', 'On hover'],
  ['unhover', 'On unhover'],
  ['enter', 'On enter (trigger)'],
  ['exit', 'On exit (trigger)'],
  ['init', 'On create'],
];

/**
 * Roblox-style script editor: opens as a center tab for one Script child of an
 * object. Big monospace area, hook picker, live reference chips.
 */
export class ScriptEditor {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.current = null; // { objId, scriptId }
  }

  open(obj, script) {
    this.current = { objId: obj.id, scriptId: script.id };
    this.render();
  }

  openGame(key) {
    const project = this.editor.project;
    if (!project.scripts) project.scripts = { onStart: '', onUpdate: '', onClick: '', onKey: '', onScene: '' };
    this.current = { gameKey: key, scriptId: 'game-' + key };
    this.render();
  }

  close() {
    this.current = null;
    this.host.innerHTML = '';
  }

  find() {
    if (!this.current) return {};
    const project = this.editor.project;
    if (this.current.gameKey) {
      const key = this.current.gameKey;
      const names = { onStart: 'On start', onUpdate: 'On update', onClick: 'On click', onKey: 'On key', onScene: 'On scene' };
      const hooks = { onStart: 'init', onUpdate: 'update', onClick: 'click', onKey: 'click', onScene: 'update' };
      const script = {
        id: 'game-' + key,
        name: names[key] || key,
        hook: hooks[key] || 'update',
        get code() { return project.scripts[key] ?? ''; },
        set code(v) { project.scripts[key] = v; },
        get lang() { return project.scripts.lang || 'js'; },
        set lang(v) { project.scripts.lang = v; },
        gameKey: key,
      };
      return { obj: { name: 'Game' }, script, isGame: true };
    }
    const obj = this.editor.project.objects.find(o => o.id === this.current.objId);
    const script = obj?.codeScripts?.find(s => s.id === this.current.scriptId);
    return { obj, script, isGame: false };
  }

  render() {
    const { obj, script, isGame } = this.find();
    this.host.innerHTML = '';
    if (!obj || !script) {
      this.host.appendChild(el('div', { class: 'insp-empty', text: 'This script no longer exists.' }));
      return;
    }

    const project = this.editor.project;
    const wrap = el('div', { class: 'script-editor' });

    // header: breadcrumb + name + hook
    const head = el('div', { class: 'se-head' });
    head.append(
      el('span', { class: 'se-crumb', html: `${el('span', { text: obj.name }).outerHTML} <span class="faint">/</span>` }),
      (() => {
        const name = el('input', { class: 'se-name', value: script.name, spellcheck: 'false' });
        if (isGame) name.disabled = true;
        name.addEventListener('change', () => {
          script.name = name.value.trim() || 'Script';
          this.editor.commitHistory('Rename script');
          this.editor.hierarchy.render();
          this.editor.updateScriptTabTitle?.(script);
        });
        return name;
      })(),
      (() => {
        const hook = el('select', { class: 'select', style: { maxWidth: '130px' } });
        for (const [val, label] of HOOKS) {
          const opt = el('option', { value: val, text: label });
          if (val === script.hook) opt.selected = true;
          hook.appendChild(opt);
        }
        if (isGame) hook.disabled = true;
        hook.addEventListener('change', () => {
          script.hook = hook.value;
          this.editor.commitHistory('Change script hook');
          this.editor.hierarchy.render();
        });
        return hook;
      })(),
      (() => {
        const lang = el('select', { class: 'select', style: { width: '110px' }, title: 'Script language — JavaScript or Lua (compiled to JS) — applies to this script' });
        for (const [val, label] of [['js', 'JavaScript'], ['lua', 'Lua']]) {
          const opt = el('option', { value: val, text: label });
          if (val === (script.lang || 'js')) opt.selected = true;
          lang.appendChild(opt);
        }
        lang.addEventListener('change', () => {
          script.lang = lang.value;
          this.editor.scheduleAutosave?.();
          this.editor.commitHistory('Change script language');
          this.render();
        });
        return lang;
      })(),
      el('div', { class: 'spacer' }),
      el('span', { class: 'faint', style: { fontSize: '10px' }, text: 'Ctrl+S to save · autosaves' }),
    );
    wrap.appendChild(head);

    // reference chips row
    const chips = el('div', { class: 'se-chips' });
    const chip = (text, snippet) => el('button', {
      class: 'ref-chip', text, title: `Insert: ${snippet}`,
      onclick: () => this.insert(snippet),
    });
    chips.appendChild(el('span', { class: 'faint', style: { fontSize: '10px', marginRight: '4px' }, text: 'self' }));
    for (const v of project.variables) chips.appendChild(chip(v.name, `get("${v.name}")`));
    for (const o of project.objects) if (o.id !== obj.id) chips.appendChild(chip(o.name, `obj("${o.name}")`));
    for (const [label, snippet] of [
      ['dt', 'dt'], ['time', 'time'],
      ['randInt', 'randInt(1, 6)'], ['chance', 'chance(0.5)'], ['pick', 'pick(["a", "b"])'],
      ['hide', 'hide("Name")'], ['show', 'show("Name")'], ['setText', 'setText("Name", "...")'],
      ['moveTo', 'moveTo("Name", 100, 200)'], ['spawn', 'spawn("shape", { x: 40, y: 40 })'],
      ['destroy', 'destroy("Name")'], ['beep', 'beep(440, 80)'], ['wait', 'await wait(1)'],
      ['log', 'log(vars())'], ['cancel', 'cancel()'],
    ]) chips.appendChild(chip(label, snippet));
    wrap.appendChild(chips);

    // code area with syntax-highlight backdrop
    const seWrap = el('div', { class: 'se-wrap' });
    const hl = el('pre', { class: 'se-hl' });
    const area = el('textarea', { class: 'se-code', spellcheck: 'false' });
    seWrap.append(hl, area);
    const KW = new Set(['const', 'let', 'var', 'if', 'else', 'return', 'function', 'for', 'while', 'do', 'of', 'in', 'new', 'await', 'async', 'break', 'continue', 'true', 'false', 'null', 'undefined', 'typeof', 'try', 'catch', 'switch', 'case']);
    const LUA_KW = new Set(['if', 'then', 'else', 'elseif', 'end', 'for', 'while', 'do', 'repeat', 'until', 'in', 'local', 'function', 'return', 'and', 'or', 'not', 'nil', 'true', 'false', 'break']);
    const APIFNS = new Set(['get', 'set', 'add', 'subtract', 'multiply', 'increase', 'decrease', 'toggleVar', 'obj', 'objects', 'hide', 'show', 'toggleVisible', 'setText', 'moveTo', 'moveBy', 'setSize', 'setProperty', 'setColor', 'setTextColor', 'setOpacity', 'bring', 'spawn', 'destroy', 'timerStart', 'timerStop', 'timerSet', 'beep', 'wait', 'vars', 'rand', 'randInt', 'chance', 'pick', 'clamp', 'log', 'cancel', 'key', 'pressed', 'print', 'pcall', 'error', 'warn', 'len', 'changed', 'clone', 'touching', 'gotoScene', 'currentScene', 'cam', 'emit', 'view', 'restart', 'cam', 'emit', 'view', 'other', 'save', 'load', 'play', 'mouse']);
    const SPECIAL = new Set(['self', 'dt', 'time']);
    const isLua = () => (script.lang || 'js') === 'lua';
    const escH = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const highlightJS = (src) => {
      let out = '', last = 0;
      const kws = isLua() ? LUA_KW : KW;
      const re = isLua()
        ? /(--\[\[[\s\S]*?\]\]|--[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\b\d[\d.]*\b)|([A-Za-z_$][\w$]*)/g
        : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d.]*\b)|([A-Za-z_$][\w$]*)/g;
      let m;
      while ((m = re.exec(src))) {
        out += escH(src.slice(last, m.index));
        if (m[1]) out += `<span class="tk-c">${escH(m[1])}</span>`;
        else if (m[2]) out += `<span class="tk-s">${escH(m[2])}</span>`;
        else if (m[3]) out += `<span class="tk-n">${escH(m[3])}</span>`;
        else {
          const id = m[4];
          if (kws.has(id)) out += `<span class="tk-k">${id}</span>`;
          else if (APIFNS.has(id)) out += `<span class="tk-f">${id}</span>`;
          else if (SPECIAL.has(id)) out += `<span class="tk-p">${id}</span>`;
          else out += escH(id);
        }
        last = m.index + m[0].length;
      }
      return out + escH(src.slice(last));
    };
    const syncHl = () => {
      hl.innerHTML = highlightJS(area.value) + '\n';
      hl.scrollTop = area.scrollTop; hl.scrollLeft = area.scrollLeft;
    };
    area.addEventListener('input', syncHl);
    area.addEventListener('scroll', syncHl);
    area.value = script.code ?? '';
    area.placeholder = isLua()
      ? (script.hook === 'click'
        ? '-- runs when clicked in Play mode\n-- e.g. add("Coins", 1)\ncancel()'
        : script.hook === 'init'
          ? '-- runs once when Play starts\n-- e.g. local coins = get("Coins") + 1\nset("Coins", coins)'
          : '-- runs every frame · dt = seconds since last frame\n-- e.g. self.x = self.x + 40 * dt')
      : script.hook === 'click' ? '// runs when clicked in Play mode\n// e.g. add("Coins", 1); cancel(); // cancel() skips events & purchase'
      : script.hook === 'init' ? '// runs once when Play starts\n// e.g. self.text = "Ready"; set("Coins", 0);'
      : '// runs every frame · dt = seconds since last frame\n// e.g. self.x += 40 * dt;';
    const persist = () => {
      script.code = area.value;
      this.editor.scheduleAutosave();
      this.editor.debouncedCommit();
      this.editor.hierarchy.render();
    };
    area.addEventListener('change', () => { persist(); syncHl(); });
    syncHl();
    area.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      const insert = text => {
        const s = area.selectionStart, en = area.selectionEnd;
        area.value = area.value.slice(0, s) + text + area.value.slice(en);
        area.selectionStart = area.selectionEnd = s + text.length;
        area.focus();
        area.dispatchEvent(new Event('change'));
      };
      contextMenu([
        { label: 'Cut', onClick: () => { area.focus(); document.execCommand('cut'); } },
        { label: 'Copy', onClick: () => { area.focus(); document.execCommand('copy'); } },
        { label: 'Paste', onClick: async () => {
            try { insert(await navigator.clipboard.readText()); }
            catch { toast('Use Ctrl+V — clipboard read needs permission', 'error'); }
          } },
        { label: 'Select all', onClick: () => { area.focus(); area.select(); } },
        '-',
        { label: 'Insert reference…', onClick: () => this.insertMenu(area, e.clientX, e.clientY, insert) },
      ], e.clientX, e.clientY);
    });
    area.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = area.selectionStart, en = area.selectionEnd;
        area.value = area.value.slice(0, s) + '  ' + area.value.slice(en);
        area.selectionStart = area.selectionEnd = s + 2;
        syncHl();
        return;
      }
      // ---- autocomplete: Ctrl+Space (or auto after 2+ letters via Ctrl+Space only) ----
      if (ac.isOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
        e.preventDefault();
        ac.handleKey(e.key);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        ac.open();
      }
    });

    // autocomplete popup over the textarea
    const ac = {
      isOpen: false, items: [], idx: 0, popup: null,
      words() {
        const api = ['get', 'set', 'add', 'subtract', 'multiply', 'increase', 'decrease', 'toggleVar',
          'obj', 'objects', 'hide', 'show', 'toggleVisible', 'setText', 'moveTo', 'moveBy', 'setSize',
          'setProperty', 'setColor', 'setTextColor', 'setOpacity', 'bring', 'spawn', 'destroy', 'clone',
          'timerStart', 'timerStop', 'timerSet', 'beep', 'wait', 'play', 'save', 'load', 'changed',
          'touching', 'gotoScene', 'currentScene', 'key', 'pressed', 'rand', 'randInt', 'chance', 'pick',
          'clamp', 'vars', 'log', 'warn', 'error', 'pcall', 'cancel', 'self', 'dt', 'time'];
        const langs = isLua()
          ? ['if', 'then', 'elseif', 'else', 'end', 'for', 'while', 'repeat', 'until', 'do', 'local', 'function', 'return', 'and', 'or', 'not', 'nil', 'true', 'false', 'ipairs', 'pairs', 'print']
          : ['if', 'else', 'for', 'while', 'function', 'return', 'const', 'let', 'await'];
        const vars = project.variables.map(v => v.name);
        const objs = project.objects.map(o => o.name);
        return [...new Set([...api, ...langs, ...vars, ...objs])];
      },
      prefix() {
        const upto = area.value.slice(0, area.selectionStart);
        const m = upto.match(/[A-Za-z_$][\w$]*$/);
        return m ? m[0] : '';
      },
      open() {
        const pfx = this.prefix().toLowerCase();
        this.items = this.words().filter(w => w.toLowerCase().startsWith(pfx) && w !== this.prefix());
        if (!this.items.length) return;
        this.idx = 0;
        this.popup = el('div', { class: 'ac-popup' });
        this.render();
        // position near caret (monospace metrics)
        const line = area.value.slice(0, area.selectionStart).split('\n').pop();
        const lineNo = area.value.slice(0, area.selectionStart).split('\n').length - 1;
        const cs = getComputedStyle(area);
        const lh = parseFloat(cs.lineHeight) || 20;
        const ch = parseFloat(cs.fontSize) * 0.6;
        this.popup.style.left = Math.min(12 + line.length * ch, seWrap.clientWidth - 240) + 'px';
        this.popup.style.top = Math.min(14 + (lineNo + 1) * lh - area.scrollTop, seWrap.clientHeight - 160) + 'px';
        seWrap.appendChild(this.popup);
        this.isOpen = true;
      },
      render() {
        this.popup.innerHTML = '';
        this.items.slice(0, 8).forEach((w, i) => {
          this.popup.appendChild(el('div', {
            class: 'ac-item' + (i === this.idx ? ' sel' : ''), text: w,
            onmousedown: ev => { ev.preventDefault(); this.idx = i; this.accept(); },
          }));
        });
      },
      close() {
        this.isOpen = false;
        this.popup?.remove();
        this.popup = null;
      },
      accept() {
        const word = this.items[this.idx];
        if (!word) { this.close(); return; }
        const pfx = this.prefix();
        const s = area.selectionStart;
        area.value = area.value.slice(0, s - pfx.length) + word + area.value.slice(s);
        area.selectionStart = area.selectionEnd = s - pfx.length + word.length;
        this.close();
        area.focus();
        syncHl();
      },
      handleKey(k) {
        const n = Math.min(8, this.items.length);
        if (k === 'Escape' || k === 'Tab') { if (k === 'Tab') this.accept(); else this.close(); return; }
        if (k === 'Enter') { this.accept(); return; }
        this.idx = (this.idx + (k === 'ArrowDown' ? 1 : n - 1)) % n;
        this.render();
      },
    };
    area.addEventListener('blur', () => ac.close());
    let typing = false;
    area.addEventListener('input', () => {
      if (typing) return;
      typing = true;
      requestAnimationFrame(() => { typing = false; script.code = area.value; });
    });
    this.area = area;
    wrap.appendChild(seWrap);

    this.host.appendChild(wrap);
  }

  insertMenu(area, x, y, insert) {
    const project = this.editor.project;
    const { obj } = this.find();
    const items = [];
    for (const v of project.variables) items.push({ label: `get("${v.name}")`, onClick: () => insert(`get("${v.name}")`) });
    for (const o of project.objects) {
      if (obj && o.id === obj.id) continue;
      items.push({ label: `obj("${o.name}")`, onClick: () => insert(`obj("${o.name}")`) });
    }
    if (!items.length) items.push({ label: 'no objects/variables yet', onClick: () => {} });
    contextMenu(items, x, y);
  }

  insert(snippet) {
    if (!this.area) return;
    const area = this.area;
    const start = area.selectionStart ?? area.value.length;
    const end = area.selectionEnd ?? start;
    area.value = area.value.slice(0, start) + snippet + area.value.slice(end);
    area.focus();
    area.selectionStart = area.selectionEnd = start + snippet.length;
    area.dispatchEvent(new Event('change'));
  }
}
