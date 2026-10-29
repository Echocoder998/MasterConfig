import { abbProfile } from './abb-profile.js';
import { clone, validateModel } from './engine.js';

export const bundledModels = [abbProfile];

// Stage only. The caller must use the normal draft save and activation workflow.
// Existing IDs are never replaced, regardless of their current lifecycle state.
export function stageBundledModel(models, id) {
  if (models.some(model => model.id === id)) throw new Error('This bundled model is already in your catalog. Use Edit model to review it; existing data will not be replaced.');
  const source = bundledModels.find(model => model.id === id);
  if (!source) throw new Error('Unknown bundled model.');
  const errors = validateModel(source);
  if (errors.length) throw new Error('Bundled model needs correction: ' + errors.join(' '));
  return {...clone(source), status:'draft'};
}

export function withBundledModels(models) {
  const ids = new Set(models.map(model => model.id));
  return [...models, ...bundledModels.filter(model => !ids.has(model.id)).map(model => ({...clone(model),status:'draft'}))];
}
