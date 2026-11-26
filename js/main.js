import { Dashboard } from './dashboard.js';
import { Editor } from './editor/editor.js';
import { getProject } from './storage.js';
import { normalizeProject } from './model.js';

class App {
  constructor() {
    this.purgeLegacyStorage();
    this.dashboardEl = document.getElementById('dashboard');
    this.editorEl = document.getElementById('editor');
    this.dashboard = new Dashboard(this.dashboardEl, this);
    this.editor = new Editor(this.editorEl, this);
    window.__app = this; // debug handle for automation
  }

  // One-time cleanup: the app was internally named "clicker-studio" during
  // development. Remove those old records so renamed keys start fresh and no
  // stale dev data lingers in anyone's browser.
  purgeLegacyStorage() {
    try { indexedDB.deleteDatabase('clicker-studio'); } catch { /* fine */ }
    try {
      for (const k of Object.keys(localStorage)) {
        if (k === 'clicker-studio' || k.startsWith('clicker-studio:')) localStorage.removeItem(k);
      }
    } catch { /* fine */ }
  }

  async start() {
    // Session restore: if the user refreshes inside the editor, reopen that project
    const lastId = localStorage.getItem('2dengine-studio:lastProject');
    if (lastId) {
      try {
        const record = await getProject(lastId);
        if (record) {
          this.dashboard.hide();
          this.editor.open(normalizeProject(record));
          return;
        }
      } catch { /* fall through to dashboard */ }
      localStorage.removeItem('2dengine-studio:lastProject');
    }
    await this.dashboard.show();
  }

  openEditor(project) {
    try { localStorage.setItem('2dengine-studio:lastProject', project.id); } catch { /* full storage is non-fatal */ }
    this.dashboard.hide();
    this.editor.open(project);
  }

  showDashboard() {
    try { localStorage.removeItem('2dengine-studio:lastProject'); } catch { /* non-fatal */ }
    this.editor.close();
    this.dashboard.show();
  }
}

const app = new App();
const launchHint = document.getElementById('launch-hint');
app.start()
  .then(() => launchHint?.remove())
  .catch(error => {
    console.error('[2dengine-studio] startup failed', error);
    if (launchHint) {
      launchHint.innerHTML = '';
      launchHint.append(
        Object.assign(document.createElement('strong'), { textContent: 'The app could not start.' }),
        Object.assign(document.createElement('span'), { textContent: error?.message || String(error) }),
      );
    }
  });

// Surface unexpected errors in the console without killing the app.
window.addEventListener('error', e => console.error('[2dengine-studio]', e.error || e.message));
window.addEventListener('unhandledrejection', e => console.error('[2dengine-studio] unhandled', e.reason));