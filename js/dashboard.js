import { el, clear, toast, promptDialog, confirmDialog, contextMenu } from './ui.js';
import { icon } from './icons.js';
import { createProject, normalizeProject } from './model.js';
import { listProjects, getProject, putProject, deleteProjectById } from './storage.js';
import { formatDate, uid } from './util.js';

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
}