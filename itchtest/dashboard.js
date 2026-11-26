import { el, clear, toast, promptDialog, confirmDialog, contextMenu } from 'ui.js';
import { icon } from 'icons.js';
import { createProject, normalizeProject } from 'model.js';
import { listProjects, getProject, putProject, deleteProjectById } from 'storage.js';
import { formatDate, uid } from 'util.js';

export class Dashboard {
  constructor(root, app) {
    this.root = root;
    this.app = app;
  }

  async show() {
    this.root.classList.remove('hidden');
    await this.render();
  }

  hide() { this.root.classList.add('hidden'); }

  async render() {
    clear(this.root);

    const head = el('div', { class: 'dash-head' });
    const logo = el('div', { class: 'dash-logo' });
    logo.innerHTML = `<span class="mark">${icon('shape', 14)}</span>`;
    logo.appendChild(el('span', { text: '2D Engine Studio' }));
    head.append(
      logo,
      el('div', { class: 'spacer' }),
      el('a', {
        class: 'btn', href: 'docs.html', target: '_blank',
        style: { textDecoration: 'none' }, text: 'Docs',
      }),
      el('button', {
        class: 'btn', text: 'Data \u25BE', title: 'Download / import / delete your projects',
        onclick: e => this.dataMenu(e.currentTarget),
      }),
      el('button', {
        class: 'btn primary',
        onclick: () => this.createNew(),
      }, [el('span', { html: icon('plus', 14) }), el('span', { text: 'New Project' })]),
    );

    const body = el('div', { class: 'dash-body' });
    this.root.append(head, body);

    body.appendChild(el('div', { class: 'dash-hero' }, [
      el('div', { class: 'hero-title', text: 'Make real 2D games with drag-and-drop + JavaScript & Lua' }),
      el('div', { class: 'hero-sub', text: 'Objects, variables, timers, sounds, scenes, groups, and per-object JavaScript & Lua code.' }),
    ]));

    let projects = [];
    try {
      projects = await listProjects();
      projects = projects.map(normalizeProject).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (err) {
      toast('Could not load projects: ' + err.message, 'error');
    }

    if (!projects.length) {
      body.appendChild(el('div', { class: 'empty-state' }, [
        el('div', { html: icon('layers', 36), style: { opacity: '0.4' } }),
        el('div', { style: { fontSize: '15px', fontWeight: '600' }, text: 'No projects yet' }),
        el('div', { class: 'faint', text: 'Create a blank project to get started.' }),
        el('button', { class: 'btn primary', text: 'Create Project', onclick: () => this.createNew() }),
      ]));
      return;
    }

    body.appendChild(el('h2', { class: 'dash-section-title', text: 'Your Projects' }));
    const grid = el('div', { class: 'project-grid' });
    for (const project of projects) grid.appendChild(this.renderCard(project));
    body.appendChild(grid);
  }

  renderCard(project) {
    const card = el('div', {
      class: 'project-card',
      oncontextmenu: e => {
        e.preventDefault();
        contextMenu([
          { label: 'Open', onClick: () => this.open(project.id) },
          { label: 'Download Game (standalone .html)', onClick: () => this.downloadGame(project) },
          { label: 'Rename…', onClick: () => this.rename(project) },
          { label: 'Duplicate', onClick: () => this.duplicate(project) },
          '-',
          { label: 'Delete', danger: true, onClick: () => this.remove(project) },
        ], e.clientX, e.clientY);
      },
    });
    card.appendChild(el('div', { class: 'pc-title', text: project.name, title: project.name }));
    card.appendChild(el('div', { class: 'pc-meta' }, [
      el('span', { text: `${project.objects.length} object${project.objects.length === 1 ? '' : 's'}` }),
      el('span', { text: `${project.events.length} event${project.events.length === 1 ? '' : 's'}` }),
      el('span', { text: `Edited ${formatDate(project.updatedAt)}` }),
    ]));

    const actions = el('div', { class: 'pc-actions' });
    actions.append(
      el('button', { class: 'btn primary', text: 'Open', onclick: () => this.open(project.id) }),
      el('button', { class: 'btn', text: 'Download Game', title: 'Standalone HTML \u2014 runs anywhere, no editor needed', onclick: () => this.downloadGame(project) }),
      el('button', { class: 'btn', text: 'Rename', onclick: () => this.rename(project) }),
      el('button', { class: 'btn', text: 'Duplicate', onclick: () => this.duplicate(project) }),
      el('button', { class: 'btn danger', text: 'Delete', onclick: () => this.remove(project) }),
    );
    card.appendChild(actions);
    return card;
  }

  async createNew() {
    const name = await promptDialog('New Project', 'Project name', 'My Clicker Game');
    if (!name) return;
    const project = createProject(name);
    await putProject(project);
    await this.open(project.id);
  }

  async open(id) {
    const record = await getProject(id);
    if (!record) { toast('Project not found', 'error'); await this.render(); return; }
    this.hide();
    this.app.openEditor(normalizeProject(record));
  }

  async rename(project) {
    const name = await promptDialog('Rename Project', 'Project name', project.name);
    if (!name) return;
    project.name = name;
    project.updatedAt = Date.now();
    await putProject(project);
    await this.render();
  }

  async duplicate(project) {
    const copy = normalizeProject(JSON.parse(JSON.stringify(project)));
    copy.id = uid('proj');
    copy.name = project.name + ' Copy';
    copy.createdAt = Date.now();
    copy.updatedAt = Date.now();
    await putProject(copy);
    await this.render();
    toast('Project duplicated', 'success');
  }

  async remove(project) {
    if (!await confirmDialog('Delete Project', `Permanently delete "${project.name}"? This cannot be undone.`)) return;
    await deleteProjectById(project.id);
    await this.render();
    toast('Project deleted');
  }

  /* ---- data & distribution (v2.2) ---- */

  dataMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    contextMenu([
      { label: 'Download all projects (.json)', onClick: () => this.exportData() },
      { label: 'Import projects (.json)…', onClick: () => this.importData() },
      '-',
      { label: 'Delete ALL projects', danger: true, onClick: () => this.deleteAll() },
    ], r.left, r.bottom + 6);
  }

  async exportData() {
    const projects = await listProjects();
    if (!projects.length) { toast('No projects to export', 'error'); return; }
    const bundle = { app: '2d-engine-studio', format: 1, exportedAt: new Date().toISOString(), projects };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'engine-studio-projects.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(`Exported ${projects.length} project(s)`, 'success');
  }

  async importData() {
    const input = el('input', { type: 'file', accept: 'application/json,.json' });
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const list = Array.isArray(parsed) ? parsed
          : parsed && Array.isArray(parsed.projects) ? parsed.projects
          : [parsed];
        let n = 0;
        for (const raw of list) {
          if (!raw || !Array.isArray(raw.objects)) continue;
          const p = normalizeProject(raw);
          if (await getProject(p.id)) p.id = uid('proj'); // never clobber an existing project
          await putProject(p);
          n++;
        }
        await this.render();
        toast(n ? `Imported ${n} project(s)` : 'No valid projects found in file', n ? 'success' : 'error');
      } catch (err) {
        toast('Import failed: ' + err.message, 'error');
      }
    });
    input.click();
  }

  async deleteAll() {
    const projects = await listProjects();
    if (!projects.length) { toast('Nothing to delete'); return; }
    if (!await confirmDialog('Delete ALL Projects', `Delete all ${projects.length} projects? Download your data first — this cannot be undone.`)) return;
    for (const p of projects) await deleteProjectById(p.id);
    await this.render();
    toast('All projects deleted');
  }

  async downloadGame(project) {
    toast('Building standalone game…');
    try {
      const x = await import('./exporter.js');
      await x.exportProjectHTML(project);
    } catch (err) {
      toast('Export failed: ' + (err.message || err), 'error');
    }
  }
}