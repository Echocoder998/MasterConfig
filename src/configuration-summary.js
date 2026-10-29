import { visible, orderCode, issues } from './engine.js';

export const isRfq = model => model.outputMode === 'rfq';
export const outputLabel = model => isRfq(model) ? 'RFQ CONFIGURATION' : 'DRAFT ORDERING CODE';
export const outputHelp = model => isRfq(model)
  ? 'Option codes are datasheet references. ABB must confirm the complete specification and manufacturer part number.'
  : 'Code order is independent of your selection sequence. Confirm combined-option syntax before ordering.';

export function configurationRows(model, values) {
  return model.fields.filter(field => visible(field, values)).map(field => {
    const codes = field.type === 'multi' ? (values[field.id] || []) : [values[field.id]];
    const picked = field.options.filter(option => codes.includes(option.code));
    return [field.label, picked.map(option => option.label + ' (' + option.code + ')').join('; ') || '—'];
  });
}

export function configurationText(model, values) {
  const problems = issues(model, values);
  const review = (model.applicationReview || []).map(item => '[ ] ' + item).join('\n');
  const sources = (model.sourceReferences || []).map(source => source.title + (source.pages ? ' · printed pages ' + source.pages : '') + '\n' + source.url).join('\n');
  return `DAUGHTRIDGE SALES — ${model.manufacturer} ${model.name}\n${isRfq(model) ? 'REQUEST FOR QUOTATION — NOT A MANUFACTURER PART NUMBER' : 'DRAFT CONFIGURATION — SALES REVIEW REQUIRED'}\n\n${orderCode(model,values)}\n\n${configurationRows(model,values).map(row=>row.join(': ')).join('\n')}\n\n${problems.length ? 'Open issues: '+problems.join(' ')+'\n\n' : ''}Source: ${model.sourceName} ${model.revision}\n${sources || model.sourceUrl || ''}\n${model.notes || ''}\n${review ? '\nAPPLICATION DATA TO SUPPLY / CONFIRM WITH ABB\n'+review+'\n' : ''}Review application suitability and final ordering syntax before ordering.\n`;
}
