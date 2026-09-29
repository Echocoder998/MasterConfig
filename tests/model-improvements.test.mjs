import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareModels, createProposal, applyProposal, refreshProposal, proposalState, proposalReferences } from '../src/proposal.js';
import { timestampCatalog } from '../src/model-data.js';
import { filterModels, defaultFilters, filterError, localUpdatedLabel } from '../src/model-list.js';

const model = JSON.parse(fs.readFileSync(new URL('../src/switch-profile.json', import.meta.url)));
const clone = structuredClone;
const changes = (a, b) => compareModels(a, b).flatMap(g => g.entries);

test('comparison uses structured data, stable IDs, readable codes and complete settings', () => {
  const next = clone(model);
  next.name = 'Revised switch';
  next.fields[0].options[0].id = 'option-one';
  const current = clone(next);
  next.fields[0].options[0].code = '09';
  next.fields[0].options[0].orderCode = '009';
  next.fields[0].options.pop();
  next.fields[0].codeOrder = 7;
  next.defaultValues.enclosure = '09';
  next.extraSetting = { enabled: true };
  next.rules.push({ ...clone(model.rules[0]), id: 'new-rule' });
  const diff = changes(current, next);
  assert(diff.some(e => e.kind === 'Modified' && e.label.includes('[option-one]') && e.before === 'B4' && e.after === '09'));
  assert(diff.some(e => e.kind === 'Removed' && e.important.includes('Removed choices')));
  assert(diff.some(e => e.label.includes('Ordering-code position') && e.important));
  assert(diff.some(e => e.label === 'Default choices'));
  assert(diff.some(e => e.label === 'Extra Setting'));
  assert(diff.some(e => e.kind === 'Added' && e.important === 'New compatibility restriction'));
});

test('step reorder produces one sequence change without step additions or removals', () => {
  const next = clone(model); next.steps.reverse();
  const diff = changes(model, next);
  assert.equal(diff.length, 1);
  assert.equal(diff[0].label, 'Step sequence');
  assert.equal(diff[0].kind, 'Modified');
  assert(diff[0].after.includes('Range'));
});

test('new imports show additions and remain isolated until application', () => {
  const proposed = { ...clone(model), status: 'active', updatedAt: '1999-01-01T00:00:00Z' };
  const pending = createProposal(null, proposed);
  assert(changes(null, pending.model).every(e => e.kind === 'Added'));
  assert.equal(pending.model.status, 'draft');
  assert.equal(pending.model.updatedAt, undefined);
  const accepted = applyProposal(pending, null);
  assert.equal(accepted.status, 'draft');
  accepted.fields[0].label = 'Changed later';
  assert.notEqual(pending.model.fields[0].label, accepted.fields[0].label);
  assert.equal(proposed.status, 'active');
});

test('proposal snapshots and discard do not mutate the editor or saved model', () => {
  const current = clone(model), before = clone(current), proposed = clone(current);
  proposed.notes = 'Proposed note';
  let pending = createProposal(current, proposed, current);
  proposed.notes = 'Mutated response';
  assert.equal(pending.model.notes, 'Proposed note');
  pending = null;
  assert.deepEqual(current, before);
});

test('invalid proposals and different identities cannot be applied', () => {
  const proposed = clone(model); proposed.fields[0].options.push(clone(proposed.fields[0].options[0]));
  const pending = createProposal(model, proposed, model);
  assert(proposalState(pending, model).errors.some(e => e.includes('Duplicate option')));
  assert.throws(() => applyProposal(pending, model), /Duplicate option/);
  assert.throws(() => applyProposal(createProposal(model, { ...model, id: 'different' }), model), /model ID/);
});

test('editing during generation or review blocks apply until the comparison is refreshed', () => {
  const proposed = { ...clone(model), notes: 'AI notes' };
  const pending = createProposal(model, proposed, model);
  const current = { ...clone(model), notes: 'Admin notes' };
  assert.throws(() => applyProposal(pending, current, model), /Refresh/);
  const refreshed = refreshProposal(pending, current, model);
  assert(changes(refreshed.base, refreshed.model).some(e => e.before === 'Admin notes' && e.after === 'AI notes'));
  assert.equal(applyProposal(refreshed, current, model).notes, 'AI notes');
  current.name = 'Another edit';
  assert.throws(() => applyProposal(refreshed, current, model), /Refresh/);
});

test('saved model changes, deletion and import ID collisions block application', () => {
  const pending = createProposal(model, model, model);
  assert.throws(() => applyProposal(pending, model, { ...model, updatedAt: '2026-09-29T12:00:00Z' }), /saved model changed/);
  assert.throws(() => refreshProposal(pending, model, null), /saved model changed/);
  assert.throws(() => applyProposal(createProposal(null, model), null, model), /saved model changed/);
});

test('chat and object-key order do not create misleading changes; references are collected', () => {
  const next = Object.fromEntries(Object.entries(model).reverse()); next.chatHistory = [{ role: 'user', text: 'Hi' }];
  assert.deepEqual(changes(model, next), []);
  assert.deepEqual(proposalReferences({ fields: [{ options: [{ sourcePage: 5 }, { sourcePage: 2 }, { sourcePage: 5 }] }], rules: [{ sourcePage: 3 }] }), ['2', '3', '5']);
});

const now = Date.parse('2026-09-29T12:00:00Z');
const models = [
  { id: 'a-01', name: 'Switch 10', baseCode: 'B4', manufacturer: 'Ashcroft', status: 'active', updatedAt: '2026-09-28T12:00:00Z' },
  { id: 'b-02', name: 'Switch 2', manufacturer: 'Ashcroft', status: 'draft', updatedAt: '2026-09-10T12:00:00Z' },
  { id: 'c-03', name: 'Gauge', manufacturer: 'Wika', status: 'inactive' },
  { id: 'd-04', name: 'Legacy switch', manufacturer: 'Ashcroft', status: 'draft', updatedAt: 'invalid' }
];
const filter = overrides => ({ ...defaultFilters(), ...overrides });
test('search covers name, ID, base code and manufacturer with combined filters', () => {
  for (const search of ['switch 10', ' A-01 ', 'b4']) assert.deepEqual(filterModels(models, filter({ search }), now).map(m => m.id), ['a-01']);
  assert.equal(filterModels(models, filter({ search: 'ashcroft' }), now).length, 3);
  assert.deepEqual(filterModels(models, filter({ search: 'switch', manufacturer: 'Ashcroft', status: 'draft', updated: '30' }), now).map(m => m.id), ['b-02']);
  assert.equal(filterModels(models, filter({ manufacturer: 'Wika', status: 'active' }), now).length, 0);
});
test('date filters distinguish unknown dates, inclusive local ranges and invalid ranges', () => {
  assert.deepEqual(filterModels(models, filter({ updated: '7' }), now).map(m => m.id), ['a-01']);
  assert.equal(filterModels(models, filter({ updated: 'unknown' }), now).length, 2);
  assert.equal(localUpdatedLabel(models[2]), 'Unknown date');
  const local = [{ id: 'local', name: 'Local', updatedAt: new Date(2026, 8, 29, 23, 59, 59).toISOString() }];
  assert.equal(filterModels(local, filter({ updated: 'custom', from: '2026-09-29', to: '2026-09-29' })).length, 1);
  assert(filterError(filter({ updated: 'custom', from: '2026-09-30', to: '2026-09-29' })));
  assert(filterError(filter({ updated: 'custom', from: '', to: '' })));
});
test('name/date sorting is deterministic and unknown timestamps are always last', () => {
  assert.deepEqual(filterModels(models, filter({ sort: 'updated-desc' })).map(m => m.id), ['a-01', 'b-02', 'c-03', 'd-04']);
  assert.deepEqual(filterModels(models, filter({ sort: 'updated-asc' })).map(m => m.id), ['b-02', 'a-01', 'c-03', 'd-04']);
  assert.deepEqual(filterModels(models, filter({ search: 'Switch ', sort: 'name-asc' })).map(m => m.id), ['d-04', 'b-02', 'a-01']);
  assert.equal(filterModels(models, defaultFilters()).length, models.length);
});
test('timestamps only change for changed/new records and never invent legacy history', () => {
  const before = clone(models), stamp = '2026-09-29T12:00:00.000Z';
  const next = models.map(m => m.id === 'a-01' ? { ...m, name: 'Edited', updatedAt: '1900-01-01T00:00:00Z' } : m);
  const saved = timestampCatalog([...next, { id: 'new', name: 'New', createdAt: '1900-01-01T00:00:00Z' }], models, stamp);
  assert.equal(saved[0].updatedAt, stamp);
  assert.equal(saved[0].createdAt, undefined);
  assert.equal(saved[1].updatedAt, models[1].updatedAt);
  assert.equal(saved[2].updatedAt, undefined);
  assert.equal(saved[4].createdAt, stamp);
  assert.equal(saved[4].updatedAt, stamp);
  assert.deepEqual(models, before);
  assert.deepEqual(timestampCatalog(saved, saved, '2027-01-01T00:00:00Z'), saved);
});

test('rule sequence is reviewable and duplicate stable IDs block proposals', () => {
  const next = clone(model); next.rules.reverse();
  assert(changes(model, next).some(e => e.label === 'Rule sequence'));
  next.rules.push(clone(next.rules[0]));
  assert.throws(() => applyProposal(createProposal(model, next), model), /Rule IDs must be unique/);
  const malformed = clone(model); malformed.fields[0].options = [null];
  assert.doesNotThrow(() => compareModels(model, malformed));
  assert.throws(() => applyProposal(createProposal(model, malformed), model), /malformed/);
});
