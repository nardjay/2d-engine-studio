/**
 * Snapshot-based undo/redo.
 * Every commit stores a full JSON snapshot of the project — simple and
 * completely reliable for editor-scale documents.
 */
export class History {
  constructor({ getState, setState, limit = 60, onChange = () => {} }) {
    this.getState = getState;
    this.setState = setState;
    this.limit = limit;
    this.onChange = onChange;
    this.stack = [];
    this.index = -1;
    this.suspended = false;
  }

  reset() {
    this.stack = [JSON.stringify(this.getState())];
    this.index = 0;
    this.emit();
  }

  commit() {
    if (this.suspended) return;
    const snapshot = JSON.stringify(this.getState());
    if (this.stack[this.index] === snapshot) return;
    this.stack.length = this.index + 1;
    this.stack.push(snapshot);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    this.emit();
  }

  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.stack.length - 1; }

  undo() {
    if (!this.canUndo) return false;
    this.index--;
    this.apply();
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this.index++;
    this.apply();
    return true;
  }

  apply() {
    this.suspended = true;
    try { this.setState(JSON.parse(this.stack[this.index])); }
    finally { this.suspended = false; }
    this.emit();
  }

  emit() { this.onChange(this); }
}