import { clone, validateModel } from './engine.js';
import { canonical } from './model-data.js';

const names = { baseCode: 'Base ordering code', code: 'Option code', orderCode: 'Ordering code override', codeOrder: 'Ordering-code position', prefix: 'Ordering-code prefix', defaultValues: 'Default choices', visibleWhen: 'Visibility conditions', targetField: 'Target field', targetCodes: 'Target option codes', sourcePage: 'Datasheet page', sourceName: 'Datasheet name', sourceId: 'Source attachment ID', sourceUrl: 'Datasheet URL', sourceText: 'Extracted source text', adminInstructions: 'Standing instructions', reviewQuestions: 'Review questions', when: 'All conditions (AND)', op: 'Operator', id: 'ID' };
export const readableName = key => names[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase());
const ignored = new Set(['chatHistory']);
export const modelFingerprint = model => canonical(model == null ? null : Object.fromEntries(Object.entries(model).filter(([key]) => !ignored.has(key))));
const list = value => Array.isArray(value) ? value : [];

export function compareModels(before, after) {
  const groups = Object.fromEntries(['Model information', 'Configuration steps and sequence', 'Fields and options', 'Compatibility rules', 'Other changed settings'].map(name => [name, []]));
  function add(group, label, old, next, important = '') {
    if (canonical(old) === canonical(next)) return;
    groups[group].push({ kind: old === undefined ? 'Added' : next === undefined ? 'Removed' : 'Modified', label, before: old, after: next, important });
  }
  function properties(group, label, old = {}, next = {}, skip = []) {
    for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) {
      if (skip.includes(key) || ignored.has(key)) continue;
      add(group, label ? label + ' · ' + readableName(key) : readableName(key), old[key], next[key], ['code', 'baseCode', 'codeOrder', 'prefix', 'orderCode'].includes(key) ? 'Ordering code changes' : '');
    }
  }
  function entities(group, label, oldItems, nextItems, key, visit) {
    if ([...list(oldItems), ...list(nextItems)].some(item => !item || typeof item !== 'object')) { add(group, label, oldItems, nextItems); return; }
    const old = new Map(list(oldItems).map((item, index) => [key(item, index), item]));
    const next = new Map(list(nextItems).map((item, index) => [key(item, index), item]));
    for (const id of new Set([...old.keys(), ...next.keys()])) {
      const a = old.get(id), b = next.get(id), item = b || a;
      const title = label + (item.label || item.message || item.code || item.id || id) + ' [' + id + ']';
      if (!a || !b) add(group, title, a, b, group === 'Compatibility rules' && b ? 'New compatibility restriction' : group === 'Fields and options' && !b ? 'Removed choices — check affected orders' : '');
      else visit(title, a, b);
    }
  }
  const a = before || {}, b = after || {};
  const info = ['id', 'name', 'manufacturer', 'subtitle', 'baseCode', 'revision', 'notes'];
  for (const key of info) add('Model information', readableName(key), a[key], b[key], key === 'baseCode' ? 'Ordering code changes' : '');
  const sequence = model => list(model.steps).map(s => s?.id);
  if (canonical(sequence(a)) !== canonical(sequence(b))) {
    const title = model => list(model.steps).map(s => `${s?.label} [${s?.id}]`).join(' → ');
    add('Configuration steps and sequence', 'Step sequence', before ? title(a) : undefined, title(b));
  }
  entities('Configuration steps and sequence', 'Step: ', a.steps, b.steps, s => s.id, (title, old, next) => properties('Configuration steps and sequence', title, old, next, ['id']));
  entities('Fields and options', 'Field: ', a.fields, b.fields, f => f.id, (title, old, next) => {
    properties('Fields and options', title, old, next, ['id', 'options']);
    entities('Fields and options', title + ' · Option: ', old.options, next.options, o => o.id || o.code, (option, x, y) => properties('Fields and options', option, x, y));
    const order = options => list(options).map(o => o?.id || o?.code);
    if (canonical(order(old.options)) !== canonical(order(next.options)) && canonical([...order(old.options)].sort()) === canonical([...order(next.options)].sort())) add('Fields and options', title + ' · Option display sequence', order(old.options), order(next.options));
  });
  if (before && canonical(list(a.fields).map(f => f?.id)) !== canonical(list(b.fields).map(f => f?.id))) add('Fields and options', 'Field definition sequence', list(a.fields).map(f => f?.id), list(b.fields).map(f => f?.id), 'Check ordering codes for fields sharing a code position');
  entities('Compatibility rules', 'Rule: ', a.rules, b.rules, (r, i) => r.id || 'position-' + (i + 1), (title, old, next) => add('Compatibility rules', title, old, next, 'Compatibility restriction changed'));
  const ruleOrder = model => list(model.rules).map((r, i) => r?.id || 'position-' + (i + 1));
  if (before && canonical(ruleOrder(a)) !== canonical(ruleOrder(b)) && canonical([...ruleOrder(a)].sort()) === canonical([...ruleOrder(b)].sort())) add('Compatibility rules', 'Rule sequence', ruleOrder(a), ruleOrder(b));
  properties('Other changed settings', '', a, b, [...info, 'steps', 'fields', 'rules']);
  return Object.entries(groups).map(([name, entries]) => ({ name, entries }));
}

export function proposalErrors(model) {
  try {
    const errors = validateModel(model);
    for (const [name, items] of [['Rule', model.rules], ...list(model.fields).map(f => ['Option in ' + f.id, f.options])]) {
      const ids = list(items).map(item => item.id).filter(Boolean);
      if (new Set(ids).size !== ids.length) errors.push(name + ' IDs must be unique.');
    }
    return errors;
  } catch { return ['The proposed model has malformed fields, options, steps or rules.']; }
}

export function createProposal(current, proposed, saved = null) {
  const next = clone(proposed);
  // Lifecycle and timestamps belong to the editor/persistence layer, never the AI.
  next.status = 'draft';
  for (const key of ['createdAt', 'updatedAt', 'chatHistory']) {
    delete next[key];
    if (current?.[key] !== undefined) next[key] = clone(current[key]);
  }
  return { base: clone(current), model: next, saved: clone(saved), baseFingerprint: modelFingerprint(current), savedFingerprint: modelFingerprint(saved) };
}

export function proposalState(proposal, current, saved = proposal.saved) {
  const errors = proposalErrors(proposal.model);
  if (current && current.id !== proposal.model.id) errors.push('Keep the current model ID.');
  if (!current && saved) errors.push('A model with this ID already exists. Re-import with a new ID.');
  return { errors, stale: modelFingerprint(current) !== proposal.baseFingerprint, savedChanged: modelFingerprint(saved) !== proposal.savedFingerprint };
}

export function refreshProposal(proposal, current, saved = proposal.saved) {
  if (modelFingerprint(saved) !== proposal.savedFingerprint) throw new Error('The saved model changed elsewhere. Reload the catalog, reopen the latest model and request a new proposal before applying. Your editor has not been changed.');
  return createProposal(current, proposal.model, saved);
}

export function applyProposal(proposal, current, saved = proposal.saved) {
  const state = proposalState(proposal, current, saved);
  if (state.savedChanged) throw new Error('The saved model changed elsewhere. Reload the catalog, reopen the latest model and request a new proposal.');
  if (state.stale) throw new Error('The editor changed. Refresh the comparison and review it before applying.');
  if (state.errors.length) throw new Error(state.errors.join(' '));
  return clone(proposal.model);
}

export function proposalReferences(model) {
  const pages = new Set();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (value.sourcePage !== undefined && value.sourcePage !== '') pages.add(String(value.sourcePage));
    Object.values(value).forEach(walk);
  }
  walk(model);
  return [...pages].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
