// Canonical JSON for model comparisons; object key order is not a model change.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export function timestampCatalog(models, previous = [], now = new Date().toISOString()) {
  const old = new Map(previous.map(m => [m.id, m]));
  const content = m => Object.fromEntries(Object.entries(m).filter(([k]) => !['updatedAt', 'createdAt'].includes(k)));
  return models.map(model => {
    const prior = old.get(model.id);
    const next = { ...model };
    delete next.updatedAt;
    delete next.createdAt;
    if (prior?.createdAt) next.createdAt = prior.createdAt;
    if (prior && canonical(content(prior)) === canonical(content(model))) {
      if (prior.updatedAt) next.updatedAt = prior.updatedAt;
    } else {
      next.updatedAt = now;
      if (!prior) next.createdAt = now;
    }
    return next;
  });
}
