// Browser coverage for the ABB addition, including an existing shared catalog.
// The API fixture is local and never reads credentials or changes production.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { abbProfile, ABB_PROFILE_ID } from '../src/abb-profile.js';

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:3017';
const seed = JSON.parse(await fs.readFile('src/catalog.json', 'utf8'));
const originalModels = structuredClone(seed.models.filter(m => m.id !== ABB_PROFILE_ID));
originalModels[0].notes += ' Existing customer catalog note retained by the ABB addition.';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const errors = [];
await fs.mkdir('verification', { recursive: true });

const baseline = {
  size: '0050', connection: 'A1', flange_material: 'C', liner: 'T1',
  electrode_design: '1', electrode_material: 'S', grounding: '2', grounding_rings: 'A',
  approval: 'Y0', housing: 'D2', temperature_design: 'TK1', power: 'C', display: '2',
  outputs: 'G0', card_one: 'DR0', card_two: 'DS0', calibration: 'RCD',
  test_points: 'TV2', calibration_certificate: 'CMA'
};
async function select(page, field, code) {
  const choice = page.locator(`[data-field="${field}"][data-code="${code}"]`);
  assert(await choice.isEnabled(), `${field} ${code} must be selectable`);
  await choice.click();
  assert.equal(await page.locator(`[data-field="${field}"][data-code="${code}"]`).getAttribute('aria-pressed'), 'true');
}
async function gotoStep(page, id) {
  const index = abbProfile.steps.findIndex(s => s.id === id);
  assert(index >= 0, `Missing configuration step ${id}`);
  await page.locator(`[data-step="${index}"]`).click();
}
function listen(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
}
async function admin(page) {
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('heading', { name: 'Model catalog', exact: true }).waitFor();
}
async function stored(page) {
  return page.evaluate(async () => (await import('/storage.js')).loadCatalog());
}

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); listen(page);
  await page.goto(baseUrl);
  await page.getByRole('button', { name: 'Configure a Product', exact: true }).click();
  await page.locator('#model-select').waitFor();
  // Emulate a browser with saved customer records, predating the ABB addition.
  await page.evaluate(async models => {
    const storage = await import('/storage.js');
    await storage.loadCatalog();
    await storage.saveCatalog(models);
  }, originalModels);
  const existingSaved = await stored(page);
  await page.reload(); await admin(page);
  await page.locator('#add-abb-profile').click();
  await page.getByLabel('Model name', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Model name', { exact: true }).inputValue(), abbProfile.name);
  assert.equal(await page.locator('#activate').isEnabled(), false);
  assert.deepEqual(await stored(page), existingSaved, 'Staging must not persist or replace any model');
  await page.getByRole('button', { name: 'Daughtridge Sales Product Configurator home' }).click();
  await page.reload(); await admin(page);
  assert.deepEqual(await stored(page), existingSaved, 'Discarding an unsaved ABB model must leave the catalog unchanged');
  await page.locator('#add-abb-profile').click();
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click();
  await page.getByText('Draft saved. Activate after review to make it selectable.', { exact: true }).waitFor();
  const afterDraft = await stored(page);
  assert.deepEqual(afterDraft.filter(m => m.id !== ABB_PROFILE_ID), existingSaved);
  assert.equal(afterDraft.find(m => m.id === ABB_PROFILE_ID).status, 'draft');
  await page.reload();
  await page.getByRole('button', { name: 'Configure a Product', exact: true }).click();
  assert.equal(await page.locator(`#model-select option[value="${ABB_PROFILE_ID}"]`).count(), 0, 'Draft must remain unavailable to sales');
  await admin(page);
  await page.locator('#add-abb-profile').click();
  await page.getByText('This bundled model is already in your catalog.', { exact: false }).waitFor();
  assert.deepEqual(await stored(page), afterDraft, 'Duplicate add must not change saved records');
  await page.locator(`[data-edit="${ABB_PROFILE_ID}"]`).click();
  await page.locator('#review-check').check();
  await page.locator('#activate').click();
  await page.getByText('Model activated. Open Configurator to use it.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Model catalog', exact: true }).click();
  await page.locator(`[data-config="${ABB_PROFILE_ID}"]`).click();
  assert.equal(await page.locator('#model-select').inputValue(), ABB_PROFILE_ID);
  assert.equal(await page.locator('#download').isEnabled(), false, 'An incomplete quote must not download');
  assert.match(await page.locator('.codebox').innerText(), /RFQ CONFIGURATION/);
  assert.doesNotMatch(await page.locator('.codebox').innerText(), /DRAFT ORDERING CODE/);
  for (const step of abbProfile.steps) {
    await gotoStep(page, step.id);
    for (const field of step.fields) if (baseline[field]) await select(page, field, baseline[field]);
  }
  assert(await page.locator('#download').isEnabled(), 'Verified standard selections should complete a quote');
  await gotoStep(page, 'electronics');
  await select(page, 'outputs', 'M1');
  assert.equal(await page.locator('#download').isEnabled(), false, 'Missing Modbus card must block completion');
  assert.equal(await page.locator('[data-field="card_one"][data-code="DR0"]').isEnabled(), false);
  await select(page, 'card_one', 'DRM');
  assert(await page.locator('#download').isEnabled());
  await select(page, 'outputs', 'G0');
  assert.equal(await page.locator('[data-field="card_one"][data-code="DRM"]').getAttribute('aria-pressed'), 'false');
  await select(page, 'card_one', 'DR0');
  // Size changes clear incompatible materials without silently choosing replacements.
  await gotoStep(page, 'wetted'); await select(page, 'liner', 'P1');
  await gotoStep(page, 'size_connection'); await select(page, 'size', '0300');
  await gotoStep(page, 'wetted');
  assert.equal(await page.locator('[data-field="liner"][data-code="P1"]').isEnabled(), false);
  assert.equal(await page.locator('[data-field="liner"][data-code="P1"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#download').isEnabled(), false);
  await select(page, 'liner', 'T1');
  await gotoStep(page, 'size_connection'); await select(page, 'size', '0050');
  await gotoStep(page, 'design'); await select(page, 'housing', 'S2');
  await gotoStep(page, 'electronics'); await select(page, 'outputs', 'E2');
  await select(page, 'card_one', 'DR6'); await select(page, 'ethernet_protocol', 'GCE');
  await gotoStep(page, 'design');
  assert.equal(await page.locator('[data-field="housing"][data-code="D2"]').isEnabled(), false);
  await gotoStep(page, 'electronics'); await select(page, 'outputs', 'G0');
  await select(page, 'card_one', 'DR0');
  assert.equal(await page.locator('[data-field="ethernet_protocol"]').count(), 0);
  await gotoStep(page, 'design'); await select(page, 'housing', 'D2');
  await page.locator(`[data-step="${abbProfile.steps.length}"]`).click();
  await page.getByRole('heading', { name: 'Before you request a quote' }).waitFor();
  assert.equal(await page.locator('.quote-guide-card').count(), 4);
  assert.equal(await page.locator('.quote-guide-technical').getAttribute('open'), null);
  const technicalToggle = page.locator('.quote-guide-technical summary');
  await technicalToggle.focus(); await page.keyboard.press('Enter');
  assert(await page.getByRole('heading', { name: 'Detailed application checks' }).isVisible());
  assert((await page.locator('.quote-guide-technical').innerText()).includes(abbProfile.notes));
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.quote-guide-technical').getAttribute('open'), null);
  assert.equal(await page.locator('main > .scope').count(), 0, 'Do not repeat the long notes beneath the review');
  assert(await page.locator('#download').isEnabled());
  await page.screenshot({ path: 'verification/abb-review-desktop.png', fullPage: true });
  await page.locator('.quote-guide').screenshot({ path: 'verification/abb-guide-desktop.png' });
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadEvent;
  const quote = await fs.readFile(await download.path(), 'utf8');
  assert.match(quote, /REQUEST FOR QUOTATION — NOT A MANUFACTURER PART NUMBER/);
  assert.match(quote, /APPLICATION DATA TO SUPPLY \/ CONFIRM WITH ABB/);
  assert.match(quote, /WHAT TO SEND US/);
  assert.match(quote, /TECHNICAL DETAILS & CONFIGURATION LIMITS/);
  assert.match(quote, /conductivity/);
  assert.match(quote, /DS_FEP630_EN_L\.pdf/);
  assert.match(quote, /Meter size: DN 50/);
  assert.doesNotMatch(quote, /Ethernet protocol request:/, 'A hidden stale Ethernet value must not leak into the quote');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'verification/abb-review-mobile.png', fullPage: true });
  await page.locator('.quote-guide').screenshot({ path: 'verification/abb-guide-mobile.png' });
  await page.locator('.quote-guide-technical summary').click();
  assert(await page.getByRole('heading', { name: 'Detailed application checks' }).isVisible());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('.quote-guide-technical summary').click();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile review must not overflow');
  await gotoStep(page, 'electronics');
  await page.screenshot({ path: 'verification/abb-options-mobile.png', fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile options must not overflow');
  await context.close();

  // Exercise the shared-storage branch against a mocked existing cloud catalog.
  const cloud = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  let remoteModels = structuredClone(existingSaved), revision = 7;
  const saves = [];
  await cloud.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.DASCO_CONFIG = { apiBaseUrl: ${JSON.stringify(baseUrl)} };` }));
  await cloud.route('**/api/auth/session', route => route.fulfill({ json: { role: 'admin' } }));
  await cloud.route('**/api/ai/status', route => route.fulfill({ json: { configured: false } }));
  await cloud.route('**/api/catalog', async route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      assert.equal(body.revision, revision);
      remoteModels = structuredClone(body.models); revision++;
      saves.push(structuredClone(remoteModels));
    }
    await route.fulfill({ json: { models: remoteModels, revision, role: 'admin' } });
  });
  const remote = await cloud.newPage(); listen(remote);
  await remote.goto(baseUrl); await admin(remote);
  await remote.locator('#add-abb-profile').click();
  assert.equal(saves.length, 0, 'Opening the draft must not save remotely');
  await remote.getByRole('button', { name: 'Save as draft', exact: true }).click();
  await remote.getByText('Draft saved. Activate after review to make it selectable.', { exact: true }).waitFor();
  assert.equal(saves.length, 1);
  assert.deepEqual(remoteModels.filter(m => m.id !== ABB_PROFILE_ID), existingSaved);
  assert.equal(remoteModels.find(m => m.id === ABB_PROFILE_ID).status, 'draft');
  await remote.reload(); await admin(remote);
  await remote.locator('#add-abb-profile').click();
  await remote.getByText('This bundled model is already in your catalog.', { exact: false }).waitFor();
  assert.equal(saves.length, 1, 'Duplicate add must not call cloud save');
  await cloud.close();
  assert.deepEqual(errors, []);
  console.log('ABB browser checks passed: local/shared additive save, discard, duplicate protection, explicit activation, protocol changes, size restrictions, RFQ download, hidden values, desktop/mobile; no page errors.');
} finally {
  await browser.close();
}
