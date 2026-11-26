import { el, clear, contextMenu } from 'ui.js';

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
    this.entries.push({ message, type, time: new Date(), count: 1 });
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
    }
    this.host.appendChild(wrap);
    this.host.scrollTop = this.host.scrollHeight;
  }
}