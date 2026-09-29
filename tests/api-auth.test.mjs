import test from 'node:test';
import assert from 'node:assert/strict';
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
