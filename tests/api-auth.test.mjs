import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { handleApi } from '../server/api.mjs';

const env = {
  ADMIN_PASSWORD: 'admin-test-password',
  SALES_PASSWORD: 'sales-test-password',
  SESSION_SECRET: 'test-session-secret-with-enough-entropy',
  ALLOWED_ORIGINS: 'https://app.example.com',
  OPENAI_MODEL: 'gpt-test'
};

async function login(role, password) {
  const response = await handleApi(new Request('https://api.example.com/api/auth/login', {
    method: 'POST',
    headers: { origin: 'https://app.example.com', 'content-type': 'application/json' },
    body: JSON.stringify({ role, password })
  }), env);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return { response, cookie };
}

test('signed sessions distinguish sales and admin permissions', async () => {
  const sales = await login('sales', env.SALES_PASSWORD);
  assert.equal(sales.response.status, 200);
  assert.match(sales.cookie, /^dasco_session=/);

  const session = await handleApi(new Request('https://api.example.com/api/auth/session', {
    headers: { origin: 'https://app.example.com', cookie: sales.cookie }
  }), env);
  assert.equal(session.status, 200);
  assert.equal((await session.json()).role, 'sales');

  const salesAi = await handleApi(new Request('https://api.example.com/api/ai/status', {
    headers: { origin: 'https://app.example.com', cookie: sales.cookie }
  }), env);
  assert.equal(salesAi.status, 200);
  assert.equal((await salesAi.json()).canEdit, false);

  const salesChat = await handleApi(new Request('https://api.example.com/api/ai/chat', {
    method: 'POST',
    headers: { origin: 'https://app.example.com', cookie: sales.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ model: { id: 'x' }, message: 'hi' })
  }), env);
  assert.equal(salesChat.status, 503);

  const anonymousChat = await handleApi(new Request('https://api.example.com/api/ai/chat', {
    method: 'POST',
    headers: { origin: 'https://app.example.com', 'content-type': 'application/json' },
    body: JSON.stringify({ model: { id: 'x' }, message: 'hi' })
  }), env);
  assert.equal(anonymousChat.status, 401);

  const admin = await login('admin', env.ADMIN_PASSWORD);
  const adminAi = await handleApi(new Request('https://api.example.com/api/ai/status', {
    headers: { origin: 'https://app.example.com', cookie: admin.cookie }
  }), env);
  assert.equal(adminAi.status, 200);
  assert.deepEqual(await adminAi.json(), { configured: false, model: 'gpt-test', canEdit: true });
});

test('worker rejects unlisted browser origins', async () => {
  const response = await handleApi(new Request('https://api.example.com/api/auth/login', {
    method: 'POST',
    headers: { origin: 'https://preview.vercel.app', 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'sales', password: env.SALES_PASSWORD })
  }), env);
  assert.equal(response.status, 403);
});

test('bad password does not create a session cookie', async () => {
  const result = await login('admin', 'wrong');
  assert.equal(result.response.status, 401);
  assert.equal(result.cookie, undefined);
});

test('AI jobs are bound to the role that started them and keep their scope', async () => {
  const aiEnv = { ...env, OPENAI_API_KEY: 'test-placeholder' };
  const model = JSON.parse(fs.readFileSync(new URL('../src/switch-profile.json', import.meta.url)));
  const calls = [];
  const replies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify(replies.shift() ?? {}), { status: 200 });
  };
  const post = (path, cookie, body) => handleApi(new Request('https://api.example.com' + path, {
    method: 'POST',
    headers: { origin: 'https://app.example.com', cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }), aiEnv);
  try {
    const admin = await login('admin', env.ADMIN_PASSWORD);
    const sales = await login('sales', env.SALES_PASSWORD);

    // A sales request is forced to sales scope and never sends the PDF.
    replies.push({ id: 'resp_sales', status: 'queued' });
    const started = await post('/api/ai/chat', sales.cookie, { model, message: 'Remove XPK', scope: 'model', pdf: 'data:application/pdf;base64,JVBERg==' });
    assert.equal(started.status, 200);
    const { job } = await started.json();
    assert.equal(calls[0].body.background, true);
    assert.equal(calls[0].body.input.at(-1).content.length, 1);

    // Another role cannot use the token, and a tampered token is rejected.
    assert.equal((await post('/api/ai/jobs', admin.cookie, { job })).status, 403);
    assert.equal((await post('/api/ai/jobs', sales.cookie, { job: job.slice(0, -2) + 'xx' })).status, 403);

    // Status polls carry no model; the finishing poll returns an answer without model edits.
    replies.push({ id: 'resp_sales', status: 'in_progress' });
    assert.deepEqual(await (await post('/api/ai/jobs', sales.cookie, { job })).json(), { done: false, status: 'in_progress' });
    replies.push({ id: 'resp_sales', status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ reply: 'Only admins can change models.', questions: [], proposal_json: JSON.stringify(model) }) }] }] }, {});
    const finished = await (await post('/api/ai/jobs', sales.cookie, { job, model })).json();
    assert.equal(finished.done, true);
    assert.equal(finished.result.proposal, null);
    assert.equal(calls.at(-1).method, 'DELETE');
  } finally {
    globalThis.fetch = realFetch;
  }
});
