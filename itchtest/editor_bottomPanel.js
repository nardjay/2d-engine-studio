import { el, clear } from 'ui.js';

export class BottomPanel {
  constructor(host, editor, panels) {
    this.host = host;
    this.editor = editor;
    this.panels = panels; // { code, hierarchy, assets, events, variables, debug }
    this.active = 'variables';
    this.build();
  }

  build() {
    clear(this.host);
    this.tabBar = el('div', { class: 'bp-tabs' });
    this.content = el('div', { class: 'bp-content' });

    const tabs = [
      ['variables', 'Variables', 'variable', 'Game variables — numbers/text/booleans your scripts read and write'],
      ['events', 'Events', 'layers', 'No-code event blocks (click → action). Prefer code? Use script children in the Explorer'],
      ['assets', 'Assets', 'folder', 'Imported images & sounds — drop files here'],
      ['debug', 'Console', 'terminal', 'Runtime logs, warnings and errors'],
    ];

    this.tabNodes = {};
    for (const [key, label, , tip] of tabs) {
      const node = el('button', {
        class: 'bp-tab' + (key === this.active ? ' active' : ''),
        text: label,
        title: tip,
        onclick: () => this.setActive(key),
      });
      this.tabNodes[key] = node;
      this.tabBar.appendChild(node);
    }

    this.host.append(this.tabBar, this.content);
    this.setActive(this.active);
  }

  setActive(key) {
    this.active = key;
    for (const [k, node] of Object.entries(this.tabNodes)) node.classList.toggle('active', k === key);
    clear(this.content);
    const panel = this.panels[key];
    if (!panel) return;
    // Each panel renders into its own container so its DOM class survives switching.
    const host = el('div', { style: { height: '100%', overflow: 'auto' } });
    this.content.appendChild(host);
    panel.host = host;
    panel.render();
  }

  renderActive() {
    const panel = this.panels[this.active];
    if (!panel) return;
    const host = this.content.firstElementChild;
    if (!host) { this.setActive(this.active); return; }
    panel.host = host;
    clear(host);
    panel.render();
  }
}