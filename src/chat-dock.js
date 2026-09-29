import {esc,$,toast} from './ui.js';
import {clone,validateModel} from './engine.js';
import {getSource} from './storage.js';
import {apiCredentials,apiUrl} from './config.js';
import {describeChanges} from './assistant.js';
const TIMEOUT_MS=260000;
const withoutChat=m=>{const x=clone(m);delete x.chatHistory;return JSON.stringify(x)};
async function pdfData(d){let b;if(d.sourceId)b=await getSource(d.sourceId);else if(d.sourceUrl&&/^[\w-]+\.pdf$/.test(d.sourceUrl)){const r=await fetch(d.sourceUrl);if(r.ok)b=await r.blob()}if(!b)return null;if(!(b.type==='application/pdf'||/\.pdf$/i.test(d.sourceName||d.sourceUrl||'')))return null;if(b.size>10*1024*1024)throw new Error('AI PDF limit is 10 MB. Split the source by model and attach the smaller PDF.');return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve('data:application/pdf;base64,'+String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('Could not read the source PDF.'));r.readAsDataURL(b)})}
// Context from the host page: {kind:'admin',model,setModel,changed,renderPage} while editing a draft,
// {kind:'sales',model,selections} in the configurator, or null to hide the dock.
export function createChatDock({getContext,onStatus}){
 let open=false,busy=false,error='',input='',status=null,statusLoading=null,rulesOnly=false,questions=[],undo=null,abort=null,timer=null,startedAt=0,timedOut=false,contextKey='',focusInput=false;
 const salesHistory=new Map();
 const keyOf=ctx=>ctx?ctx.kind+':'+ctx.model.id:'';
 const history=ctx=>ctx.kind==='admin'?(ctx.model.chatHistory||[]):(salesHistory.get(ctx.model.id)||[]);
 function setHistory(ctx,h){h=h.slice(-30);if(ctx.kind==='admin')ctx.model.chatHistory=h;else salesHistory.set(ctx.model.id,h)}
 const seconds=()=>Math.max(1,Math.floor((Date.now()-startedAt)/1000));
 function checkStatus(){statusLoading||=(async()=>{try{const r=await fetch(apiUrl('/api/ai/status'),{credentials:apiCredentials()});if(!r.ok)throw new Error();status=await r.json()}catch{status={configured:false}}finally{statusLoading=null;onStatus?.();render()}return status})();return statusLoading}
 function messageHtml(m){return `<div class="chat-message ${m.role==='user'?'from-user':'from-assistant'}"><b>${m.role==='user'?'You':'Flow Mind AI'}</b><p>${esc(m.text)}</p>${m.changes?.length?`<div class="chat-changes"><b>${m.undone?'Applied to draft, then undone':'Applied to draft'}</b><ul>${m.changes.map(c=>'<li>'+esc(c)+'</li>').join('')}</ul></div>`:''}</div>`}
 function render(){
  const el=$('chat-dock');if(!el)return;const ctx=getContext();const key=keyOf(ctx);
  if(key!==contextKey){contextKey=key;if(!busy){error='';questions=[];undo=null}}
  if(!ctx){el.hidden=true;el.innerHTML='';return}
  el.hidden=false;if(status===null)checkStatus();
  const admin=ctx.kind==='admin';
  if(!open){el.innerHTML=`<button id="chat-toggle" class="chat-launcher" aria-expanded="false"><span class="chat-launcher-icon" aria-hidden="true">✦</span>${busy?'Flow Mind AI is working… <span id="chat-elapsed">'+seconds()+'</span>s':'Flow Mind AI'}</button>`;$('chat-toggle').onclick=()=>{open=true;focusInput=true;render()};return}
  const log=history(ctx),pending=questions.length?questions:(admin?ctx.model.reviewQuestions||[]:[]);
  const intro=admin?'Ask for changes to this model, e.g. “Move Range after Options”, “Add option XPK to Options” or “B7 cannot use XPK”. Changes are applied to this draft right away; nothing goes live until you save and activate.':'Ask about this product, e.g. “Which enclosures work with a Viton seal?” or “Why is option XPK unavailable?”. The AI sees your current selections.';
  el.innerHTML=`<section class="chat-panel" aria-label="Flow Mind AI"><div class="chat-head"><div><b>Flow Mind AI</b><span>${admin?'Editing draft':'Configuring'} · ${esc(ctx.model.name)}</span></div><button id="chat-toggle" class="chat-close" aria-expanded="true" aria-label="Collapse Flow Mind AI chat">✕</button></div>
<div class="chat-log" id="chat-log" aria-live="polite">${status&&!status.configured?`<div class="info-panel"><b>AI connection not configured</b><p>Chat requires the server-side OpenAI API key.</p></div>`:''}${log.map(messageHtml).join('')||`<p class="help">${esc(intro)}</p>`}${busy?`<div class="chat-message from-assistant chat-working"><b>Flow Mind AI</b><p>${admin?'Reading the draft and datasheet':'Thinking'}… <span id="chat-elapsed">${seconds()}</span>s${admin?'. Large datasheets can take 3-4 minutes.':''}</p><button id="chat-cancel" class="text-button" type="button">Cancel</button></div>`:''}</div>
${error?`<div class="error-panel chat-note" role="alert">${esc(error)}</div>`:''}${pending.length&&!busy?`<div class="info-panel chat-note"><b>Needs clarification</b><ul>${pending.map(q=>'<li>'+esc(q)+'</li>').join('')}</ul></div>`:''}${undo&&admin&&undo.modelId===ctx.model.id&&!busy?`<div class="chat-undo chat-note"><span>AI changes applied to the draft.</span><button id="chat-undo" class="text-button" type="button">Undo</button></div>`:''}
<form id="chat-form" class="chat-form">${admin?`<label class="check-label"><input id="chat-rules" type="checkbox" ${rulesOnly?'checked':''} ${busy?'disabled':''}> Change rules only</label>`:''}<textarea id="chat-input" rows="3" aria-label="Message the AI" ${busy||!status?.configured?'disabled':''} placeholder="${admin?'Describe a change to this model…':'Ask about this configuration…'}">${esc(input)}</textarea><button class="primary" type="submit" ${busy||!status?.configured?'disabled':''}>Send</button></form>
<p class="chat-foot">${admin?'Sends this draft, recent chat and source PDF to OpenAI. Review changes before activation.':'Answers come from the model data. Confirm against the datasheet before ordering.'}</p></section>`;
  $('chat-toggle').onclick=()=>{open=false;render()};
  $('chat-input').oninput=e=>{input=e.target.value};
  $('chat-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}};
  $('chat-form').onsubmit=e=>{e.preventDefault();send()};
  if($('chat-rules'))$('chat-rules').onchange=e=>{rulesOnly=e.target.checked};
  if($('chat-cancel'))$('chat-cancel').onclick=()=>abort?.abort();
  if($('chat-undo'))$('chat-undo').onclick=undoLast;
  const logEl=$('chat-log');logEl.scrollTop=logEl.scrollHeight;
  if(focusInput&&!busy){focusInput=false;$('chat-input').focus()}
 }
 function undoLast(){const ctx=getContext();if(!undo||ctx?.kind!=='admin'||ctx.model.id!==undo.modelId)return;const log=(ctx.model.chatHistory||[]).map(m=>({...m}));const applied=log.findLast(m=>m.changes?.length&&!m.undone);if(applied)applied.undone=true;ctx.setModel({...undo.before,chatHistory:log,adminInstructions:ctx.model.adminInstructions});undo=null;ctx.changed();ctx.renderPage();toast('AI changes undone.')}
 function startTimer(){startedAt=Date.now();timedOut=false;timer=setInterval(()=>{const s=$('chat-elapsed');if(s)s.textContent=seconds()},1000)}
 function stopTimer(){clearInterval(timer);timer=null;abort=null}
 async function send(){
  const ctx=getContext();const message=input.trim();if(!ctx||busy||!message)return;
  const admin=ctx.kind==='admin',modelId=ctx.model.id,base=clone(ctx.model),prior=history(ctx);
  busy=true;error='';questions=[];undo=null;input='';setHistory(ctx,[...prior,{role:'user',text:message}]);if(admin)ctx.changed();render();
  let timeout=null;
  try{
   const pdf=admin?await pdfData(base):null;
   abort=new AbortController();startTimer();timeout=setTimeout(()=>{timedOut=true;abort?.abort()},TIMEOUT_MS);
   const body=admin?{model:base,message,history:prior,pdf,scope:rulesOnly?'rules':'model'}:{model:base,message,history:prior,scope:'sales',selections:ctx.selections?.()||''};
   const r=await fetch(apiUrl('/api/ai/chat'),{method:'POST',credentials:apiCredentials(),headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});
   let result=null;try{result=await r.json()}catch{}
   if(!r.ok)throw new Error(result?.error||'AI request failed.');
   const now=getContext(),reply={role:'assistant',text:result.reply};
   questions=result.questions||[];
   if(!admin){salesHistory.set(modelId,[...(salesHistory.get(modelId)||[]),reply].slice(-30));return}
   if(now?.kind!=='admin'||now.model.id!==modelId){error='The model changed while the AI was responding. No changes were applied.';return}
   if(result.validationError)error='The AI suggested changes that failed validation, so nothing was applied: '+result.validationError;
   else if(result.proposal){
    const errs=validateModel(result.proposal);
    if(errs.length)error='The AI suggested changes that failed validation, so nothing was applied: '+errs.slice(0,6).join(' ');
    else if(withoutChat(now.model)!==withoutChat(base))error='The draft was edited while the AI was responding, so its changes were not applied. Send the request again.';
    else{reply.changes=describeChanges(base,result.proposal);now.setModel({...result.proposal,adminInstructions:now.model.adminInstructions,chatHistory:now.model.chatHistory});undo={modelId,before:base}}
   }
   const target=getContext();setHistory(target,[...history(target),reply]);target.changed();target.renderPage();
  }catch(e){error=e.name==='AbortError'?(timedOut?'AI request timed out. No changes were applied. Try a narrower request.':'AI request canceled. No changes were applied.'):e.message}
  finally{clearTimeout(timeout);stopTimer();busy=false;render()}
 }
 function reset(){if(busy)return;error='';questions=[];undo=null;input=''}
 return {render,reset,isBusy:()=>busy,status:()=>status,checkStatus,ensureStatus:()=>status?Promise.resolve(status):checkStatus(),open(opts={}){if(opts.rulesOnly!==undefined)rulesOnly=opts.rulesOnly;if(opts.error!==undefined)error=opts.error;open=true;focusInput=true;render()}};
}
