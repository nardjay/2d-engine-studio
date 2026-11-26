import { el, clear, toast, promptDialog, confirmDialog, contextMenu } from '../ui.js';
import { uid } from '../util.js';

export class AssetsPanel {
  constructor(host, editor) {
    this.host = host;
    this.editor = editor;
  }

  render() {
    clear(this.host);
    const project = this.editor.project;

    const head = el('div', { class: 'row', style: { padding: '8px 12px' } }, [
      el('span', { class: 'faint', style: { fontSize: '11px' }, text: 'Drop files here or import. Drag a card onto the canvas to place it.' }),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn primary', text: '+ Import Image',
        onclick: () => this.importImage(),
      }),
      el('button', {
        class: 'btn', text: '+ Import Sound',
        onclick: () => this.importSound(),
      }),
    ]);
    head.addEventListener('dragover', e => { e.preventDefault(); head.style.borderColor = 'var(--accent)'; });
    head.addEventListener('dragleave', () => { head.style.borderColor = ''; });
    head.addEventListener('drop', e => {
      e.preventDefault(); head.style.borderColor = '';
      for (const f of e.dataTransfer?.files || []) this.importFile(f);
    });
    this.host.appendChild(head);

    if (!project.assets.length) {
      this.host.appendChild(el('div', { class: 'insp-empty', text: 'No assets yet.' }));
      return;
    }

    const grid = el('div', { class: 'asset-grid' });
    for (const asset of project.assets) {
      const kb = Math.round((asset.dataUrl.length * 0.75) / 1024); // base64 → approx bytes
      const card = el('div', {
        class: 'asset-card',
        draggable: 'true',
        ondragstart: e => {
          e.dataTransfer.setData('text/clicker-asset', asset.id);
          e.dataTransfer.effectAllowed = 'copy';
        },
        title: `${asset.name} · ~${kb} KB · drag onto the canvas to use`,
        oncontextmenu: e => {
          e.preventDefault();
          contextMenu([
            { label: 'Place on canvas', onClick: () => this.editor.addObject('image', null, { assetId: asset.id, w: 160, h: 160 }) },
            { label: 'Rename…', onClick: () => this.renameAsset(asset) },
            { label: 'Copy to clipboard', onClick: () => this.copyAsset(asset) },
            '-',
            { label: 'Delete', danger: true, onClick: () => this.deleteAsset(asset) },
          ], e.clientX, e.clientY);
        },
      });
      const thumb = el('div', { class: 'asset-thumb' });
      if (asset.kind === 'audio') {
        thumb.classList.add('audio');
        thumb.innerHTML = '<div class="snd-ico">🎵</div>';
        thumb.title = 'Click to preview sound';
        thumb.addEventListener('click', () => { const a = new Audio(asset.dataUrl); a.volume = 0.5; a.play().catch(() => toast('Could not play sound', 'error')); });
      } else {
        thumb.appendChild(el('img', { src: asset.dataUrl, alt: asset.name }));
      }

      const name = el('div', { class: 'asset-name', text: asset.name, title: asset.name });
      name.insertAdjacentHTML('beforeend', ` <span class="faint" style="font-size:10px">~${kb} KB</span>`);
      const actions = el('div', { class: 'row', style: { gap: '4px' } }, [
        el('button', {
          class: 'btn', text: 'Rename', style: { flex: '1', justifyContent: 'center', height: '24px' },
          onclick: () => this.renameAsset(asset),
        }),
        el('button', {
          class: 'btn danger', text: 'Delete', style: { height: '24px' },
          onclick: () => this.deleteAsset(asset),
        }),
      ]);

      card.append(thumb, name, actions);
      grid.appendChild(card);
    }
    this.host.appendChild(grid);
  }

  importSound() {
    const input = el('input', { type: 'file', accept: 'audio/*' });
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      if (!file.type.startsWith('audio/')) { toast('Not an audio file', 'error'); return; }
      if (file.size > 8 * 1024 * 1024) { toast('Sound must be under 8 MB', 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const project = this.editor.project;
        const asset = { id: uid('asset'), name: file.name.replace(/\.[^.]+$/, ''), kind: 'audio', dataUrl: reader.result };
        project.assets.push(asset);
        this.editor.commitHistory('Import sound');
        this.editor.refreshPanels();
        this.editor.scheduleAutosave();
        toast(`Sound imported — use play("${asset.name}") in code`, 'success');
      };
      reader.onerror = () => toast('Failed to read sound', 'error');
      reader.readAsDataURL(file);
    });
    input.click();
  }

  importFile(file) {
    if (!file) return;
    if (file.type.startsWith('image/')) return this.readImage(file);
    if (file.type.startsWith('audio/')) return this.readSound(file);
    toast('Only images and sounds can be imported', 'error');
  }

  async readImage(file) {
    if (file.size > 8 * 1024 * 1024) { toast('Image must be under 8 MB', 'error'); return; }
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
    });
    // downscale/compress big images: keeps projects & exported HTML small and fast
    let finalUrl = dataUrl, note = '';
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      const MAX = 1024;
      if (img.width > MAX || img.height > MAX || file.size > 300 * 1024) {
        const sc = Math.min(1, MAX / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * sc));
        cv.height = Math.max(1, Math.round(img.height * sc));
        const hasAlpha = file.type === 'image/png' || file.type === 'image/webp';
        const ctx2 = cv.getContext('2d');
        ctx2.drawImage(img, 0, 0, cv.width, cv.height);
        finalUrl = cv.toDataURL(hasAlpha ? 'image/webp' : 'image/jpeg', 0.85);
        if (finalUrl.length > dataUrl.length) finalUrl = dataUrl; // never make it bigger
        else note = ' (optimized)';
      }
    } catch { /* keep original if canvas fails (e.g. svg sizing) */ }
    const project = this.editor.project;
    project.assets.push({ id: uid('asset'), name: file.name.replace(/\.[^.]+$/, ''), kind: 'image', dataUrl: finalUrl });
    this.editor.commitHistory('Import asset');
    this.editor.refreshPanels();
    this.editor.scheduleAutosave();
    toast('Image imported' + note, 'success');
  }

  importImage() {
    const input = el('input', { type: 'file', accept: 'image/*' });
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      this.readImage(file);
    });
    input.click();
  }

  async renameAsset(asset) {
    const next = await promptDialog('Rename asset', 'Asset name', asset.name);
    if (!next) return;
    asset.name = next;
    this.editor.commitHistory('Rename asset');
    this.editor.scheduleAutosave();
    this.render();
  }

  async deleteAsset(asset) {
    const project = this.editor.project;
    if (!await confirmDialog('Delete asset', `Delete "${asset.name}"? Objects using it will show a placeholder.`)) return;
    project.assets = project.assets.filter(a => a.id !== asset.id);
    for (const obj of project.objects) if (obj.assetId === asset.id) obj.assetId = null;
    this.editor.commitHistory('Delete asset');
    this.editor.refreshPanels();
    this.editor.scheduleAutosave();
  }

  async copyAsset(asset) {
    try {
      const blob = await (await fetch(asset.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      toast('Image copied to clipboard', 'success');
    } catch {
      toast('Clipboard image copy not available here', 'error');
    }
  }
}