import { apiCredentials, apiUrl, hostedWithoutApi, usesSharedStorage } from './config.js';

const DB = 'dasco-configurator-v2';
let opening;
let catalogRevision = null;

function hostedConfigError() {
  return new Error('PUBLIC_API_BASE_URL is not configured. Hosted builds must use the shared Cloudflare backend and cannot fall back to browser-only storage.');
}

function open() {
  return opening ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('catalog');
      r.result.createObjectStore('sources');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function operation(store, mode, key, value) {
  if (hostedWithoutApi()) throw hostedConfigError();
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = mode === 'readonly' ? s.get(key) : s.put(value, key);
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage transaction aborted'));
  });
}

async function readError(response) {
  try {
    const data = await response.json();
    return data.error || data.message || response.statusText;
  } catch {
    return response.statusText || 'Request failed.';
  }
}

async function remoteJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: apiCredentials(),
    headers: {
      ...(options.body && !(options.body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.status === 204 ? null : response.json();
}

export async function getSession() {
  if (!usesSharedStorage()) return { role: 'admin', local: true };
  const response = await fetch(apiUrl('/api/auth/session'), { credentials: apiCredentials() });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

export async function login(role, password) {
  return remoteJson('/api/auth/login', { method: 'POST', body: JSON.stringify({ role, password }) });
}

export async function logout() {
  if (!usesSharedStorage()) return;
  await remoteJson('/api/auth/logout', { method: 'POST' });
  catalogRevision = null;
}

export async function loadCatalog() {
  if (usesSharedStorage()) {
    const catalog = await remoteJson('/api/catalog');
    catalogRevision = catalog.revision;
    return catalog.models;
  }
  return operation('catalog', 'readonly', 'models');
}

export async function saveCatalog(models) {
  if (usesSharedStorage()) {
    const catalog = await remoteJson('/api/catalog', { method: 'PUT', body: JSON.stringify({ revision: catalogRevision, models }) });
    catalogRevision = catalog.revision;
    return;
  }
  return operation('catalog', 'readwrite', 'models', models);
}

export async function saveSource(id, file) {
  if (usesSharedStorage()) {
    const response = await fetch(apiUrl('/api/sources/' + encodeURIComponent(id)), {
      method: 'PUT',
      credentials: apiCredentials(),
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name || 'source-file')
      },
      body: file
    });
    if (!response.ok) throw new Error(await readError(response));
    return;
  }
  return operation('sources', 'readwrite', id, file);
}

export async function getSource(id) {
  if (usesSharedStorage()) {
    const response = await fetch(apiUrl('/api/sources/' + encodeURIComponent(id)), { credentials: apiCredentials() });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await readError(response));
    return response.blob();
  }
  return operation('sources', 'readonly', id);
}

export async function deleteSource(id) {
  if (!usesSharedStorage()) return;
  const response = await fetch(apiUrl('/api/sources/' + encodeURIComponent(id)), {
    method: 'DELETE',
    credentials: apiCredentials()
  });
  if (!response.ok && response.status !== 404) throw new Error(await readError(response));
}

export async function backup(models) {
  const sources = {};
  for (const m of models) {
    if (m.sourceId) {
      const b = await getSource(m.sourceId);
      if (b) {
        sources[m.sourceId] = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(b);
        });
      }
    }
  }
  return { schemaVersion: 1, models, sources };
}

export async function restoreSources(sources) {
  for (const [id, url] of Object.entries(sources || {})) {
    if (!/^data:.*;base64,/.test(url)) throw new Error('Invalid source backup.');
    const comma = url.indexOf(',');
    const type = url.slice(5, url.indexOf(';'));
    const data = atob(url.slice(comma + 1));
    if (data.length > 20 * 1024 * 1024) throw new Error('Source exceeds 20 MB.');
    await saveSource(id, new Blob([Uint8Array.from(data, c => c.charCodeAt(0))], { type }));
  }
}
