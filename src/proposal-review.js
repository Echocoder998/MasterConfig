import { esc, toast } from './ui.js';
import { getSource } from './storage.js';
import { compareModels, proposalState, applyProposal, refreshProposal, readableName, proposalReferences } from './proposal.js';

export function formatValue(value, model) {
  if (value === undefined) return 'Not present';
  if (value === null) return 'None';
  if (value === '') return '(blank)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.map(v => formatValue(v, model)).join('\n') : '(empty list)';
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => {
    const field = ['field', 'targetField'].includes(k) && model?.fields?.find(f => f.id === v);
    const keyField = model?.fields?.find(f => f.id === k);
    return `${keyField ? keyField.label + ' [' + k + ']' : readableName(k)}: ${field ? `${field.label} [${v}]` : formatValue(v, model)}`;
  }).join('\n');
  return String(value);
}

// A native modal keeps focus in the review. Closing it keeps the proposal pending.
export function openProposalReview({ getProposal, setProposal, getCurrent, getSaved, sourceBlob, onApply, onDiscard }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'proposal-dialog';
  dialog.setAttribute('aria-labelledby', 'proposal-title');
  document.body.append(dialog);
  const previousFocus = document.activeElement;
  let message = '', checking = false;
  const close = () => { dialog.close(); dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus(); };
  dialog.addEventListener('cancel', e => { e.preventDefault(); if(!checking)close(); });
  async function action(refresh) {
    checking = true; render();
    try {
      const saved = await getSaved();
      const current = getCurrent();
      if (refresh) {
        setProposal(refreshProposal(getProposal(), current, saved));
        message = 'Comparison refreshed against the current editor. Applying replaces the whole draft, including any intervening edits shown below. Review it again before applying.';
      } else {
        const next = applyProposal(getProposal(), current, saved);
        await onApply(next);
        close();
        toast('Proposal applied to the unsaved draft. Save separately to keep it.');
        return;
      }
    } catch (error) { message = error.message; }
    finally { checking = false; if (dialog.isConnected) render(); }
  }
  function render() {
    const scroll = dialog.scrollTop;
    const focused = ['data-refresh','data-apply'].find(name => dialog.querySelector(':focus')?.hasAttribute(name));
    const proposal = getProposal(), state = proposalState(proposal, getCurrent());
    const groups = compareModels(proposal.base, proposal.model), entries = groups.flatMap(g => g.entries);
    const references = [...new Set([...proposalReferences(proposal.base), ...proposalReferences(proposal.model)])];
    const warnings = [...new Set([...(proposal.model.reviewQuestions || []), ...entries.map(e => e.important).filter(Boolean)])];
    dialog.innerHTML = `<div class="proposal-heading"><div><div class="eyebrow">AI PROPOSAL · UNSAVED</div><h2 id="proposal-title" tabindex="-1">Review proposed changes</h2><p>${esc(proposal.model.name)} · ${entries.length} changes</p></div><button class="quiet" data-close ${checking ? 'disabled' : ''} aria-label="Close proposal review">Close</button></div>
      <p>Compare the current model with the complete proposed draft. Applying only updates the editor; use its Save controls afterwards. Activation still requires your source review.</p>
      ${message ? `<div class="notice" role="status">${esc(message)}</div>` : ''}
      ${state.stale ? '<div class="error-panel" role="alert">The editor changed after this proposal was generated. Refresh the comparison before applying.</div>' : ''}
      <section class="proposal-validation"><h3>Validation and review notes</h3>${state.errors.length ? `<div class="error-panel" role="alert"><b>Cannot apply this proposal</b><ul>${state.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '<p class="validation">✓ Structure and references pass validation. Verify manufacturer requirements against the datasheet.</p>'}${warnings.length ? `<ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p>No additional warnings.</p>'}<p><b>Datasheet:</b> ${esc(proposal.model.sourceName || proposal.model.sourceUrl || 'No file attached')}${references.length ? ' · Referenced pages: ' + esc(references.join(', ')) : ' · No page references provided'}</p>${proposal.model.sourceId || proposal.model.sourceUrl ? '<button class="quiet" data-source>Open datasheet</button>' : ''}</section>
      <div class="proposal-groups">${groups.map(g => `<section><h3>${esc(g.name)} <span>(${g.entries.length})</span></h3>${g.entries.length ? g.entries.map(e => `<article class="proposal-change ${e.kind.toLowerCase()}"><div class="change-title"><span class="change-badge"><span aria-hidden="true">${({ Added: '+', Modified: '↔', Removed: '−' })[e.kind]}</span> ${e.kind}</span><b>${esc(e.label)}</b></div>${e.important ? `<p class="change-warning">${esc(e.important)}</p>` : ''}<div class="change-values"><div><h4>Current</h4><pre>${esc(formatValue(e.before, proposal.base))}</pre></div><div><h4>Proposed</h4><pre>${esc(formatValue(e.after, proposal.model))}</pre></div></div></article>`).join('') : '<p class="help">No changes.</p>'}</section>`).join('')}</div>
      <div class="proposal-actions"><button class="primary" data-apply ${checking || state.stale || state.errors.length ? 'disabled' : ''}>${checking ? 'Checking latest model…' : 'Apply proposal'}</button><button class="quiet" data-discard ${checking ? 'disabled' : ''}>Discard proposal</button><button class="quiet" data-refresh ${checking ? 'disabled' : ''}>Refresh comparison</button><span class="help">Applies the entire proposal to the editor. Does not save or activate.</span></div>`;
    dialog.querySelector('[data-close]').onclick = close;
    dialog.querySelector('[data-apply]').onclick = () => action(false);
    dialog.querySelector('[data-refresh]').onclick = () => action(true);
    dialog.querySelector('[data-discard]').onclick = () => { onDiscard(); close(); toast('Proposal discarded. The model is unchanged.'); };
    dialog.scrollTop = scroll;
    if(focused)dialog.querySelector('['+focused+']').focus({preventScroll:true});
    const source = dialog.querySelector('[data-source]');
    if (source) source.onclick = async () => {
      try {
        const model = proposal.model;
        if (model.sourceId) {
          const blob = sourceBlob || await getSource(model.sourceId);
          if (!blob) throw new Error('Source file is not saved yet. Use your original upload to check the references.');
          const url = URL.createObjectURL(blob); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000);
        } else if (/^(https?:\/\/|[\w-]+\.pdf$)/i.test(model.sourceUrl || '')) window.open(model.sourceUrl, '_blank', 'noopener');
      } catch (error) { message = error.message; render(); }
    };
  }
  render(); dialog.showModal(); dialog.querySelector('#proposal-title').focus();
}
