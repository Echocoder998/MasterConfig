export const defaultFilters = () => ({ search: '', manufacturer: '', status: '', updated: 'any', from: '', to: '', sort: 'name-asc' });
export const updatedTime = model => typeof model.updatedAt === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(model.updatedAt) && Number.isFinite(Date.parse(model.updatedAt)) ? Date.parse(model.updatedAt) : null;
export function filterError(filters) {
  if (filters.updated !== 'custom') return '';
  if (!filters.from || !filters.to) return 'Choose both a start date and an end date.';
  if (filters.from > filters.to) return 'The start date must be on or before the end date.';
  return '';
}
export function filterModels(models, filters = defaultFilters(), now = Date.now()) {
  if (filterError(filters)) return [];
  const search = (filters.search || '').trim().toLocaleLowerCase();
  const result = models.filter(m => {
    if (search && ![m.name, m.id, m.baseCode, m.manufacturer].some(v => String(v || '').toLocaleLowerCase().includes(search))) return false;
    if (filters.manufacturer && m.manufacturer !== filters.manufacturer) return false;
    if (filters.status && m.status !== filters.status) return false;
    const date = updatedTime(m);
    if (filters.updated === 'unknown') return date === null;
    if (['7', '30', 'custom'].includes(filters.updated)) {
      if (date === null) return false;
      if (filters.updated === 'custom') {
        const end = new Date(filters.to + 'T00:00:00'); end.setDate(end.getDate() + 1);
        return date >= new Date(filters.from + 'T00:00:00').getTime() && date < end.getTime();
      }
      return date >= now - Number(filters.updated) * 86400000 && date <= now;
    }
    return true;
  });
  return result.sort((a, b) => {
    if (filters.sort?.startsWith('updated')) {
      const x = updatedTime(a), y = updatedTime(b);
      if (x === null && y !== null) return 1;
      if (y === null && x !== null) return -1;
      if (x !== y) return (x - y) * (filters.sort === 'updated-desc' ? -1 : 1);
    }
    return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }) * (filters.sort === 'name-desc' ? -1 : 1) || String(a.id).localeCompare(String(b.id));
  });
}

export function localUpdatedLabel(model) {
  const time = updatedTime(model);
  return time === null ? 'Unknown date' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(time);
}
