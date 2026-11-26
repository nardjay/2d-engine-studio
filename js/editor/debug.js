import { el, clear, contextMenu } from '../ui.js';

export class DebugPanel {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
    this.entries = [];
  }

  log(message, type = 'info') {
    // de-spam: identical consecutive messages collapse into one line with ×N
    const last = this.entries[this.entries.length - 1];
    if (last && last.message === message && last.type === type) {
      last.count++;
      last.time = new Date();
      if (this.isMounted) this.rerenderThrottled();
      return;
    }
    const entry = { message, type, time: new Date(), count: 1 };
    if (type === 'error' || type === 'err') entry.hint = friendlyHint(String(message));
    this.entries.push(entry);
    if (this.entries.length > 300) this.entries.shift();
    if (this.isMounted) this.rerenderThrottled();
  }

  // a game printing every frame must not re-render the whole log 60×/s
  rerenderThrottled() {
    if (this._rr) return;
    this._rr = setTimeout(() => { this._rr = null; this.render(); }, 180);
  }

  render() {
    this.isMounted = true;
    clear(this.host);
    const wrap = el('div', {
      class: 'debug-log',
      oncontextmenu: e => {
        e.preventDefault();
        contextMenu([
          { label: 'Clear log', onClick: () => { this.entries = []; this.render(); } },
          { label: 'Copy all', onClick: async () => {
              const text = this.entries.map(x => `[${x.time.toLocaleTimeString()}] ${x.type === 'info' ? '' : x.type + ' '} ${x.message}`).join('\n');
              try { await navigator.clipboard.writeText(text || ''); this.editor.log('Console copied to clipboard'); }
              catch { this.editor.log('Clipboard unavailable', 'warn'); }
            } },
        ], e.clientX, e.clientY);
      },
    });
    if (!this.entries.length) {
      wrap.appendChild(el('div', { class: 'faint', text: 'Editor output will appear here.' }));
    }
    for (const entry of this.entries) {
      wrap.appendChild(el('div', { class: 'debug-line ' + (entry.type === 'info' ? '' : entry.type) }, [
        el('span', { class: 't', text: entry.time.toLocaleTimeString() }),
        el('span', { text: entry.message }),
        entry.count > 1 ? el('span', { class: 'debug-x', text: `×${entry.count}` }) : null,
      ].filter(Boolean)));
      if (entry.hint) wrap.appendChild(el('div', { class: 'debug-line hint' }, [
        el('span', { class: 't', text: '' }),
        el('span', { text: '→ ' + entry.hint }),
      ]));
    }
    this.host.appendChild(wrap);
    this.host.scrollTop = this.host.scrollHeight;
  }
}

/** Turn the common runtime errors into a plain sentence about WHAT to fix. */
function friendlyHint(msg) {
  let m;
  if ((m = msg.match(/Unknown object "([^"]+)"/))) return `There is no object named "${m[1]}". Open the Explorer and use the object's EXACT name (capitalization counts), or the object may live in another scene.`;
  if (/binds a missing variable/.test(msg)) return 'This widget points at a variable that was deleted. Select the widget in the Explorer and pick a fresh Variable in Properties.';
  if (/Unknown variable|no variable/i.test(msg)) return 'The script uses a variable name that does not exist. Check the Variables tab — names are case-sensitive.';
  if (/is not defined/.test(msg)) return 'A name in the script does not exist: check spelling/case, or you used a function this engine does not have (see the Handbook → Scripting API).';
  if (/Unexpected token|Unexpected end|SyntaxError/i.test(msg)) return 'Syntax error — count your brackets and quotes on that line.';
  if (/attempt to index|attempt to call/.test(msg)) return 'Lua error: the value before the dot is nil — obj("Name") found nothing (wrong name?) or a variable was never set.';
  if (/NaN|Number expected/.test(msg)) return 'A text value landed where a number belongs. Check the variable type in the Variables tab.';
  if (/gotoScene/.test(msg) && /unknown|not found/i.test(msg)) return 'That scene name does not exist. The name in gotoScene("...") must match a scene tab exactly.';
  if (/blocked.*cross-origin|CSP|Content Security/i.test(msg)) return 'The browser blocked a resource (usually only on strict hosts like itch.io).';
  if (/could not be parsed|broken/i.test(msg)) return 'This script was skipped after repeated errors. Fix the first error above, then press Reset to re-arm it.';
  return null;
}