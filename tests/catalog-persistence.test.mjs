import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleApi } from '../server/api.mjs';

// Execute the actual D1 SQL against SQLite, including transaction rollback.
class TestD1 {
  constructor() { this.db = new DatabaseSync(':memory:'); this.db.exec(fs.readFileSync(new URL('../cloudflare/migrations/0001_initial_schema.sql', import.meta.url), 'utf8')); }
  prepare(sql) {
    const db = this.db;
    const statement = { sql, values: [], bind(...values) { this.values = values; return this; }, async first() { return db.prepare(sql).get(...this.values); }, async all() { return { results: db.prepare(sql).all(...this.values) }; }, async run() { const result = db.prepare(sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; } };
    return statement;
  }
  async batch(statements) {
    if (this.race) { this.race = false; this.db.exec('UPDATE catalog_state SET revision=revision+1'); }
    this.db.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) {
        if (this.fail && statement.sql.startsWith('INSERT INTO models')) throw new Error('Injected write failure');
        results.push(await statement.run());
      }
      this.db.exec('COMMIT'); return results;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}
async function setup() {
  const env = { DB: new TestD1(), FILES: {}, ADMIN_PASSWORD: 'test-admin', SALES_PASSWORD: 'test-sales', SESSION_SECRET: 'local-test-secret' };
  const login = await handleApi(new Request('https://test.local/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'admin', password: env.ADMIN_PASSWORD }) }), env);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const seed = JSON.parse(fs.readFileSync(new URL('../src/catalog.json', import.meta.url)));
  const request = (method, body) => handleApi(new Request('https://test.local/api/catalog', { method, headers: { cookie, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, { seedCatalog: seed });
  const initial = await (await request('GET')).json();
  return { env, request, initial };
}
test('server save timestamps only edited models and returns committed canonical dates', async () => {
  const { env, request, initial } = await setup();
  try {
    const models = structuredClone(initial.models);
    models[0].notes += ' Edited'; models[0].updatedAt = '1900-01-01T00:00:00Z';
    models.push({ id: 'untimed', name: 'Draft', status: 'draft', fields: [], steps: [], rules: [] });
    const response = await request('PUT', { revision: initial.revision, models });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert(Date.parse(saved.models[0].updatedAt) > Date.parse('2026-01-01T00:00:00Z'));
    assert.equal(saved.models[0].createdAt, initial.models[0].createdAt);
    for (let i = 1; i < initial.models.length; i++) assert.equal(saved.models[i].updatedAt, initial.models[i].updatedAt);
    const again = await (await request('PUT', { revision: saved.revision, models: saved.models })).json();
    assert.deepEqual(again.models, saved.models);
    assert.deepEqual((await (await request('GET')).json()).models, saved.models);
  } finally { env.DB.db.close(); }
});
test('failed writes roll back both timestamps and data; stale and racing writers are rejected', async () => {
  const { env, request, initial } = await setup();
  try {
    const models = structuredClone(initial.models); models[0].notes += ' Change';
    env.DB.fail = true;
    assert.equal((await request('PUT', { revision: initial.revision, models })).status, 500);
    assert.deepEqual(await (await request('GET')).json(), initial);
    env.DB.fail = false;
    assert.equal((await request('PUT', { revision: initial.revision - 1, models })).status, 409);
    env.DB.race = true;
    assert.equal((await request('PUT', { revision: initial.revision, models })).status, 409);
    assert.deepEqual((await (await request('GET')).json()).models, initial.models);
  } finally { env.DB.db.close(); }
});
test('an intentionally empty catalog stays empty on subsequent reads', async () => {
  const { env, request, initial } = await setup();
  try {
    assert.equal((await request('PUT', { revision: initial.revision, models: [] })).status, 200);
    assert.deepEqual((await (await request('GET')).json()).models, []);
  } finally { env.DB.db.close(); }
});
