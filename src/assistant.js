import {esc,$,toast} from './ui.js';
import {clone} from './engine.js';
export function describeChanges(before,after){
 const changes=[];
 if(JSON.stringify(before.steps)!==JSON.stringify(after.steps))changes.push('Selection sequence: '+after.steps.map(s=>s.label).join(' → '));
 for(const f of after.fields){const old=before.fields.find(x=>x.id===f.id);if(!old){changes.push('Add field '+f.label+' ('+f.options.length+' choices)');continue}const added=f.options.filter(o=>!old.options.some(x=>x.code===o.code)),removed=old.options.filter(o=>!f.options.some(x=>x.code===o.code));if(added.length)changes.push(f.label+': add '+added.map(x=>x.code).join(', '));if(removed.length)changes.push(f.label+': remove '+removed.map(x=>x.code).join(', '));if(JSON.stringify(old)!==JSON.stringify(f)&&!added.length&&!removed.length)changes.push('Update '+f.label+' settings or descriptions.');}
 for(const f of before.fields)if(!after.fields.some(x=>x.id===f.id))changes.push('Remove field '+f.label);
 if(JSON.stringify(before.rules)!==JSON.stringify(after.rules))changes.push('Compatibility rules: '+before.rules.length+' → '+after.rules.length+' (review rule details).');
 if(before.notes!==after.notes)changes.push('Update model review notes.');
 if(!changes.length)changes.push('Metadata or default-choice changes.');return changes;
}
export function reorderFromText(model,text){
 const names=text.split(/\n|→|->|,/).map(s=>s.trim()).filter(Boolean);if(names.length!==model.steps.length)throw new Error('List every existing step exactly once, separated by commas or new lines.');
 const matches=names.map(name=>model.steps.find(s=>s.label.toLowerCase()===name.toLowerCase()));if(matches.some(s=>!s)||new Set(matches.map(s=>s.id)).size!==matches.length)throw new Error('Use the current step names exactly, with no duplicates.');
 return {...clone(model),steps:matches};
}
// Instructions tab and rule hint; the conversation itself lives in the chat dock.
export function createAssistant({getDraft,setDraft,changed,render,dock}){
 function statusHtml(){const st=dock.status();return `<div id="ai-status-panel" class="assistant-status ${st?.configured?'connected':''}"><b>${st?.configured?'AI connected'+(st.model?' · '+esc(st.model):''):st?'AI connection not configured':'Checking AI connection…'}</b><p>${st?.configured?'Use the Ask AI chat (bottom right) to change this model. Changes apply to the draft right away and can be undone.':'AI chat requires a server-side OpenAI API connection. You can still save instructions and set the section order below.'}</p><div class="admin-toolbar"><button id="ai-open" class="primary" type="button" ${st?.configured?'':'disabled'}>Open AI chat</button><button id="ai-status" class="quiet" type="button">Check connection</button></div></div>`}
 function html(){const d=getDraft();return `${statusHtml()}<label class="form-label">Standing instructions for this model<textarea id="ai-instructions" rows="4" placeholder="Describe the sections, ordering sequence, and rules the AI should preserve.">${esc(d.adminInstructions||'')}</textarea></label><p class="help">These instructions are saved with the model and sent with every AI request.</p><details class="field-editor"><summary>Set exact section order without AI</summary><div class="field-body"><label class="form-label">Existing section names, in the desired order<textarea id="exact-order" rows="3">${esc(d.steps.map(s=>s.label).join(', '))}</textarea></label><button id="apply-order" class="quiet">Apply section order</button><p class="help">This moves existing steps. It does not interpret a datasheet or change ordering-code positions.</p></div></details>`}
 function rulesHtml(){return `<div class="info-panel"><b>Describe a rule to the AI</b><p>Open the chat and describe the restriction in plain words, e.g. “B7 cannot use option XPK”. The AI adds the rule to this draft and you can undo it.</p><button id="ai-open-rules" class="quiet" type="button">Open AI chat for rules</button></div>`}
 function bindStatus(){
  if($('ai-status'))$('ai-status').onclick=()=>dock.checkStatus();
  if($('ai-open'))$('ai-open').onclick=()=>dock.open({rulesOnly:false});
 }
 function refreshStatus(){const el=$('ai-status-panel');if(el){el.outerHTML=statusHtml();bindStatus()}}
 function bind(){
  bindStatus();
  if($('ai-open-rules'))$('ai-open-rules').onclick=()=>dock.open({rulesOnly:true});
  if($('ai-instructions'))$('ai-instructions').onchange=e=>{getDraft().adminInstructions=e.target.value;changed()};
  if($('apply-order'))$('apply-order').onclick=()=>{try{setDraft(reorderFromText(getDraft(),$('exact-order').value));changed();render();toast('Section order updated. Save the model to keep it.')}catch(e){toast(e.message)}};
 }
 return {html,rulesHtml,bind,refreshStatus,reset:()=>dock.reset(),isBusy:()=>dock.isBusy()};
}
