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

// ── The Rumor (easter egg) ─────────────────────────────────────────────
// Konami code anywhere in the app unlocks the 3D showcase. The engine's
// rotX/rotY/z object properties are the real feature; this is the reward.
(() => {
  const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let idx = 0;
  window.addEventListener('keydown', e => {
    if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    idx = key === CODE[idx] ? idx + 1 : (key === CODE[0] ? 1 : 0);
    if (idx === CODE.length) { idx = 0; showSecret3D(); }
  });
  function showSecret3D() {
    if (document.getElementById('secret3d-overlay')) return;
    try { localStorage.setItem('2dengine-studio:secret3d', 'unlocked'); } catch { /* private mode */ }
    const faces = [
      ['2D', 'translateZ(90px)'], ['ENGINE', 'rotateY(180deg) translateZ(90px)'],
      ['3D', 'rotateY(90deg) translateZ(90px)'], ['STUDIO', 'rotateY(-90deg) translateZ(90px)'],
      ['rotX', 'rotateX(90deg) translateZ(90px)'], ['rotY', 'rotateX(-90deg) translateZ(90px)'],
    ];
    const wrap = document.createElement('div');
    wrap.id = 'secret3d-overlay';
    const scene = document.createElement('div');
    scene.className = 'secret3d-scene';
    const cube = document.createElement('div');
    cube.className = 'secret3d-cube';
    for (const [label, transform] of faces) {
      const f = document.createElement('div');
      f.className = 'secret3d-face';
      f.style.transform = transform;
      f.textContent = label;
      cube.append(f);
    }
    scene.append(cube);
    const title = document.createElement('div');
    title.className = 'secret3d-title';
    title.textContent = '🧊 SECRET 3D MODE — you found the rumor';
    const sub = document.createElement('div');
    sub.className = 'secret3d-sub';
    sub.innerHTML = 'This cube is pure CSS 3D — and so is every object in the engine.<br>' +
      'Open the Inspector on any object and set <b>rotX</b>, <b>rotY</b> or <b>z</b> to spin it in real space.<br>' +
      'The Handbook has a chapter about it: docs → Electives → The Rumor.';
    const btn = document.createElement('button');
    btn.className = 'secret3d-close';
    btn.textContent = 'Back to class';
    btn.addEventListener('click', () => wrap.remove());
    wrap.append(scene, title, sub, btn);
    document.body.append(wrap);
    // little confetti of spinning mini-cubes
    for (let i = 0; i < 12; i++) {
      const spark = document.createElement('div');
      spark.className = 'secret3d-spark';
      spark.textContent = ['✦', '✧', '◆'][i % 3];
      spark.style.left = (8 + Math.random() * 84) + '%';
      spark.style.animationDelay = (Math.random() * 2) + 's';
      spark.style.animationDuration = (2.5 + Math.random() * 2.5) + 's';
      wrap.append(spark);
    }
  }
})();