/**
 * IndexedDB persistence for 2D Engine Studio projects.
 * If IndexedDB is unavailable (e.g. strict private mode) we fall back to an
 * in-memory map and warn the user — data simply will not persist.
 */
const DB_NAME = '2dengine-studio';
const DB_VERSION = 1;
const STORE = 'projects';

let dbPromise = null;
let memoryFallback = null;

function useMemory(reason) {
  if (!memoryFallback) {
    console.warn('[storage] IndexedDB unavailable, using in-memory store:', reason);
    memoryFallback = new Map();
  }
  return memoryFallback;
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB not supported')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  }).catch(err => { useMemory(err.message); throw err; });
  return dbPromise;
}

async function withStore(mode, fn) {
  let db;
  try { db = await openDB(); } catch (e) { return fn(useMemory(e.message), true); }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let output;
    const request = fn(store, false);
    if (request && typeof request === 'object' && 'onsuccess' in request) {
      request.onsuccess = () => { output = request.result; };
    } else output = request;
    tx.oncomplete = () => resolve(output);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Memory store mimics the IDBObjectStore API subset we use. */
function memoryRequest(map, op) {
  const req = { onsuccess: null, result: undefined };
  Promise.resolve().then(() => {
    req.result = op(map);
    req.onsuccess?.();
  });
  return req;
}

export async function listProjects() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return Array.from(useMemory(e.message).values());
  }
}

export async function getProject(id) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    return useMemory(e.message).get(id) || null;
  }
}

export async function putProject(project) {
  const record = JSON.parse(JSON.stringify(project));
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch (e) {
    useMemory(e.message).set(record.id, record);
    return false;
  }
}

export async function deleteProjectById(id) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    useMemory(e.message).delete(id);
  }
}

export function isPersistent() { return !memoryFallback; }