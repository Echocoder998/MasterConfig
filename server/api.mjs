import { getProposal, DEFAULT_MODEL } from './ai.mjs';
import { validateModel } from '../src/engine.js';

const SESSION_COOKIE = 'dasco_session';
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_JSON_BYTES = 17 * 1024 * 1024;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const encoder = new TextEncoder();

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
}

function requestOriginStatus(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return { origin: '', allowed: true };
  const url = new URL(request.url);
  if (origin === url.origin) return { origin, allowed: true };
  const allowed = allowedOrigins(env).includes(origin);
  return { origin, allowed };
}

function corsHeaders(request, env) {
  const { origin, allowed } = requestOriginStatus(request, env);
  const headers = { 'Vary': 'Origin' };
  if (origin && allowed) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return headers;
}

function json(request, env, data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function text(request, env, body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...corsHeaders(request, env), 'Cache-Control': 'no-store', ...headers } });
}

function preflight(request, env) {
  if (!requestOriginStatus(request, env).allowed) return json(request, env, { error: 'Origin is not allowed.' }, 403);
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(request, env),
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-File-Name',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400'
    }
  });
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlJson(value) {
  return base64url(encoder.encode(JSON.stringify(value)));
}

function fromBase64url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

async function signedSession(role, env) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not configured.');
  const payload = base64urlJson({ role, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() });
  return payload + '.' + base64url(await hmac(env.SESSION_SECRET, payload));
}

function cookieValue(request) {
  const cookie = request.headers.get('cookie') || '';
  return cookie.split(';').map(x => x.trim()).find(x => x.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1) || '';
}

async function sessionFromRequest(request, env) {
  const token = cookieValue(request);
  if (!token || !env.SESSION_SECRET) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = base64url(await hmac(env.SESSION_SECRET, payload));
  if (signature.length !== expected.length || signature !== expected) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
  } catch {
    return null;
  }
  if (!['admin', 'sales'].includes(data.role) || Number(data.exp) < Date.now() / 1000) return null;
  return { role: data.role };
}

function cookieAttrs(request, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:';
  return `HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=${secure ? 'None' : 'Lax'}${secure ? '; Secure' : ''}`;
}

async function requireAuth(request, env) {
  const session = await sessionFromRequest(request, env);
  if (!session) throw Object.assign(new Error('Sign in required.'), { status: 401 });
  return session;
}

async function requireAdmin(request, env) {
  const session = await requireAuth(request, env);
  if (session.role !== 'admin') throw Object.assign(new Error('Admin access required.'), { status: 403 });
  return session;
}

async function readJson(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw Object.assign(new Error('JSON required.'), { status: 415 });
  const textBody = await request.text();
  if (textBody.length > MAX_JSON_BYTES) throw Object.assign(new Error('Request is too large.'), { status: 413 });
  return JSON.parse(textBody);
}

function validateSavedModels(models) {
  if (!Array.isArray(models)) return ['Catalog models must be an array.'];
  if (new Set(models.map(m => m.id)).size !== models.length) return ['Catalog contains duplicate model IDs.'];
  const errors = [];
  for (const model of models) {
    if (model.status === 'active') errors.push(...validateModel(model).map(e => `${model.name || model.id}: ${e}`));
    else if (!model.id || !model.name || !Array.isArray(model.fields) || !Array.isArray(model.steps) || !Array.isArray(model.rules)) errors.push(`${model.name || model.id || 'Draft'}: Invalid draft structure.`);
  }
  return [...new Set(errors)];
}

function requireBindings(env) {
  if (!env.DB) throw Object.assign(new Error('D1 binding DB is not configured.'), { status: 503 });
  if (!env.FILES) throw Object.assign(new Error('R2 binding FILES is not configured.'), { status: 503 });
}

async function getRevision(env) {
  const row = await env.DB.prepare('SELECT revision FROM catalog_state WHERE id = 1').first();
  if (!row) {
    await env.DB.prepare("INSERT OR IGNORE INTO catalog_state (id,revision,write_id) VALUES (1,0,'')").run();
    return 0;
  }
  return Number(row.revision || 0);
}

async function setRevision(env, revision) {
  await env.DB.prepare("INSERT INTO catalog_state (id,revision,write_id) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, write_id = excluded.write_id").bind(revision, crypto.randomUUID()).run();
}

async function saveRuleRows(env, models) {
  const statements = [env.DB.prepare('DELETE FROM model_rules')];
  for (const model of models) {
    for (const rule of model.rules || []) {
      statements.push(env.DB.prepare('INSERT INTO model_rules (id,model_id,action,target_field,data,updated_at) VALUES (?,?,?,?,?,?)').bind(rule.id || crypto.randomUUID(), model.id, rule.action || '', rule.targetField || '', JSON.stringify(rule), new Date().toISOString()));
    }
  }
  await env.DB.batch(statements);
}

async function ensureSeed(env, seedCatalog) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM models').first();
  if (Number(count?.count || 0) || !seedCatalog?.models?.length) return;
  const statements = seedCatalog.models.map((model, position) => env.DB.prepare('INSERT INTO models (id,data,position) VALUES (?,?,?)').bind(model.id, JSON.stringify(model), position));
  await env.DB.batch(statements);
  await saveRuleRows(env, seedCatalog.models);
  await setRevision(env, 1);
}

async function readCatalog(request, env, seedCatalog) {
  requireBindings(env);
  const session = await requireAuth(request, env);
  await ensureSeed(env, seedCatalog);
  const result = await env.DB.prepare('SELECT data FROM models ORDER BY position').all();
  const models = (result.results || []).map(row => JSON.parse(row.data));
  return json(request, env, { models: session.role === 'admin' ? models : models.filter(model => model.status === 'active'), revision: await getRevision(env), role: session.role });
}

async function writeCatalog(request, env) {
  requireBindings(env);
  await requireAdmin(request, env);
  const body = await readJson(request);
  const current = await getRevision(env);
  if (body.revision !== current) return json(request, env, { error: 'The shared catalog changed after this page loaded. Reload, review the latest catalog, then apply your changes again.' }, 409);
  const errors = validateSavedModels(body.models);
  if (errors.length) return json(request, env, { error: errors.slice(0, 10).join(' ') }, 400);
  const ids = body.models.map(m => m.id);
  const statements = [];
  if (ids.length) statements.push(env.DB.prepare(`DELETE FROM models WHERE id NOT IN (${ids.map(() => '?').join(',')})`).bind(...ids));
  else statements.push(env.DB.prepare('DELETE FROM models'));
  for (const [position, model] of body.models.entries()) {
    statements.push(env.DB.prepare('INSERT INTO models (id,data,position) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,position=excluded.position').bind(model.id, JSON.stringify(model), position));
  }
  await env.DB.batch(statements);
  await saveRuleRows(env, body.models);
  const nextRevision = current + 1;
  await setRevision(env, nextRevision);
  return json(request, env, { ok: true, revision: nextRevision });
}

function sourceIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/sources\/([^/]+)$/);
  const id = match ? decodeURIComponent(match[1]) : '';
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw Object.assign(new Error('Invalid source ID.'), { status: 400 });
  return id;
}

function safeFileName(value, fallback) {
  const decoded = value ? decodeURIComponent(value) : fallback;
  return decoded.replace(/[^\w .()[\]-]+/g, '_').slice(0, 180) || fallback;
}

async function putSource(request, env, id) {
  requireBindings(env);
  await requireAdmin(request, env);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_SOURCE_BYTES) return json(request, env, { error: 'Source file exceeds 20 MB.' }, 413);
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_SOURCE_BYTES) return json(request, env, { error: 'Source file exceeds 20 MB.' }, 413);
  const name = safeFileName(request.headers.get('x-file-name'), id);
  const type = request.headers.get('content-type') || 'application/octet-stream';
  const key = `sources/${id}`;
  await env.FILES.put(key, body, { httpMetadata: { contentType: type }, customMetadata: { fileName: name } });
  await env.DB.prepare('INSERT INTO sources (id,object_key,file_name,content_type,size,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET object_key=excluded.object_key,file_name=excluded.file_name,content_type=excluded.content_type,size=excluded.size').bind(id, key, name, type, body.byteLength, new Date().toISOString()).run();
  return json(request, env, { ok: true, id, name, size: body.byteLength });
}

async function getSourceFile(request, env, id) {
  requireBindings(env);
  await requireAuth(request, env);
  const row = await env.DB.prepare('SELECT object_key,file_name,content_type FROM sources WHERE id = ?').bind(id).first();
  if (!row) return json(request, env, { error: 'Source file not found.' }, 404);
  const object = await env.FILES.get(row.object_key);
  if (!object) return json(request, env, { error: 'Source file not found in private storage.' }, 404);
  return new Response(object.body, {
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': row.content_type || object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `${(row.content_type || '').includes('pdf') ? 'inline' : 'attachment'}; filename="${safeFileName('', row.file_name)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

async function deleteSourceFile(request, env, id) {
  requireBindings(env);
  await requireAdmin(request, env);
  const row = await env.DB.prepare('SELECT object_key FROM sources WHERE id = ?').bind(id).first();
  if (row) await env.FILES.delete(row.object_key);
  await env.DB.prepare('DELETE FROM sources WHERE id = ?').bind(id).run();
  return json(request, env, { ok: true });
}

async function aiStatus(request, env) {
  await requireAdmin(request, env);
  return json(request, env, { configured: !!env.OPENAI_API_KEY, model: env.OPENAI_MODEL || DEFAULT_MODEL });
}

async function aiChat(request, env) {
  await requireAdmin(request, env);
  if (!env.OPENAI_API_KEY) return json(request, env, { error: 'AI is not connected. Configure the server-side OpenAI API key to enable chat.' }, 503);
  try {
    return json(request, env, await getProposal(await readJson(request), env));
  } catch (e) {
    return json(request, env, { error: e.name === 'TimeoutError' ? 'AI request timed out. No changes were applied.' : e.message }, 400);
  }
}

async function login(request, env) {
  const body = await readJson(request);
  const role = body.role === 'admin' ? 'admin' : 'sales';
  const expected = role === 'admin' ? env.ADMIN_PASSWORD : env.SALES_PASSWORD;
  if (!expected) return json(request, env, { error: `${role === 'admin' ? 'ADMIN_PASSWORD' : 'SALES_PASSWORD'} is not configured.` }, 503);
  if (!env.SESSION_SECRET) return json(request, env, { error: 'SESSION_SECRET is not configured.' }, 503);
  if (String(body.password || '') !== String(expected)) return json(request, env, { error: 'Password rejected.' }, 401);
  const token = await signedSession(role, env);
  return json(request, env, { role }, 200, { 'Set-Cookie': `${SESSION_COOKIE}=${token}; ${cookieAttrs(request)}` });
}

function logoutResponse(request, env) {
  return json(request, env, { ok: true }, 200, { 'Set-Cookie': `${SESSION_COOKIE}=; ${cookieAttrs(request, 0)}` });
}

export async function handleApi(request, env, { seedCatalog } = {}) {
  try {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return preflight(request, env);
    if (!requestOriginStatus(request, env).allowed) return json(request, env, { error: 'Origin is not allowed.' }, 403);
    if (url.pathname === '/api/auth/login' && request.method === 'POST') return await login(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return logoutResponse(request, env);
    if (url.pathname === '/api/auth/session' && request.method === 'GET') return json(request, env, await requireAuth(request, env));
    if (url.pathname === '/api/catalog' && request.method === 'GET') return await readCatalog(request, env, seedCatalog);
    if (url.pathname === '/api/catalog' && request.method === 'PUT') return await writeCatalog(request, env);
    if (url.pathname === '/api/ai/status' && request.method === 'GET') return await aiStatus(request, env);
    if (url.pathname === '/api/ai/chat' && request.method === 'POST') return await aiChat(request, env);
    if (url.pathname.startsWith('/api/sources/')) {
      const id = sourceIdFromPath(url.pathname);
      if (request.method === 'PUT') return await putSource(request, env, id);
      if (request.method === 'GET') return await getSourceFile(request, env, id);
      if (request.method === 'DELETE') return await deleteSourceFile(request, env, id);
    }
    return json(request, env, { error: 'Not found.' }, 404);
  } catch (e) {
    if (e instanceof SyntaxError) return json(request, env, { error: 'Invalid JSON.' }, 400);
    return json(request, env, { error: e.message || 'Request failed.' }, e.status || 500);
  }
}

export { sessionFromRequest };
