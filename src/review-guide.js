import { esc } from './ui.js';

// Presentation only: existing saved ABB catalogs use this guide without changing
// their options, rules, notes, source references or approval state.
export const hasQuoteGuide = model => model.id === 'abb-processmaster-fep631' && model.outputMode === 'rfq';
export const quoteScopeHint = 'This is a quote request. ABB will confirm the final specification and part number.';

const introduction = 'Share your selections and the details below with Daughtridge Sales. ABB will confirm that the meter suits your application and provide the final part number.';
const groups = [
  { title: 'Liquid being measured', items: [
    'Liquid name and composition, including any solids or abrasive particles.',
    'Conductivity (how well it conducts electricity), if known. Tell us if it is demineralized water.'
  ] },
  { title: 'Flow rates & pipe size', items: [
    'Lowest, normal and highest flow rates, including the units.',
    'Pipe size. Selecting a meter size here does not verify that it is the right size for your flow.'
  ] },
  { title: 'Operating conditions', items: [
    'Lowest, normal and highest operating pressure and temperature.',
    'Any vacuum, cleaning or flushing conditions.'
  ] },
  { title: 'Installation & location', items: [
    'Pipe material, internal lining, installation orientation and grounding arrangement, if known.',
    'Ambient temperature and hazardous-area classification, if applicable.'
  ] }
];
const confirmations = [
  'Meter sizing, material compatibility and pressure/temperature limits.',
  'Grounding, full-pipe detection and approvals for the installation.',
  'Exact materials, cables, connectors, available options and the final quotation and part number.'
];
const list = items => '<ul>' + items.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>';

export function quoteGuideHtml(model) {
  if (!hasQuoteGuide(model)) return '';
  return `<section class="quote-guide" aria-labelledby="quote-guide-title">
    <div class="quote-guide-intro"><span class="quote-guide-label">QUOTE REQUEST</span><h3 id="quote-guide-title">Before you request a quote</h3><p>${esc(introduction)}</p></div>
    <h3 class="quote-guide-section-title">What to send us</h3>
    <div class="quote-guide-grid">${groups.map(group => `<section class="quote-guide-card"><h4>${esc(group.title)}</h4>${list(group.items)}</section>`).join('')}</div>
    <p class="quote-guide-help">Missing a detail? Share what you know and ask Daughtridge Sales for help.</p>
    <section class="quote-guide-confirm"><h3>What sales &amp; ABB will confirm</h3>${list(confirmations)}</section>
    <details class="quote-guide-technical"><summary>Technical details &amp; configuration limits</summary><div class="quote-guide-technical-content"><h4>Model scope and limitations</h4><p>${esc(model.notes || '')}</p>${model.applicationReview?.length ? '<h4>Detailed application checks</h4>' + list(model.applicationReview) : ''}</div></details>
  </section>`;
}

export function quoteGuideText(model) {
  if (!hasQuoteGuide(model)) return '';
  const groupText = groups.map(group => group.title + '\n' + group.items.map(item => '- ' + item).join('\n')).join('\n\n');
  return 'BEFORE YOU REQUEST A QUOTE\n' + introduction + '\n\nWHAT TO SEND US\n' + groupText + '\n\nMissing a detail? Share what you know and ask Daughtridge Sales for help.\n\nWHAT SALES & ABB WILL CONFIRM\n' + confirmations.map(item => '- ' + item).join('\n') + '\n';
}
