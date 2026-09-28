const runtime = globalThis.DASCO_CONFIG || {};

export const API_BASE_URL = String(runtime.apiBaseUrl || '').replace(/\/+$/, '');

export function apiUrl(path) {
  return API_BASE_URL ? API_BASE_URL + path : path;
}

export function apiCredentials() {
  return API_BASE_URL ? 'include' : 'same-origin';
}

export function usesSharedStorage() {
  return Boolean(API_BASE_URL);
}

export function hostedWithoutApi() {
  const loc = globalThis.location;
  if (!loc || API_BASE_URL) return false;
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '']);
  return loc.protocol.startsWith('http') && !localHosts.has(loc.hostname);
}

export function storageLabel() {
  return usesSharedStorage() ? 'Shared cloud catalog' : 'Local browser catalog';
}
