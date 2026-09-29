import {apiCredentials,apiUrl} from './config.js';
// The AI job runs on OpenAI in the background; the browser polls with short requests.
export const AI_CLIENT_TIMEOUT_MS=20*60*1000;
const POLL_MS=3000,MAX_POLL_FAILURES=5;
const ACTIVE=['queued','in_progress'];
export function progressText(p,subject='datasheet'){if(p?.stage==='queued')return 'Waiting for the AI to start';if(p?.stage==='in_progress')return 'Reading the '+subject+' and reasoning';return 'Sending request'}
async function post(path,body,signal){const r=await fetch(apiUrl(path),{method:'POST',credentials:apiCredentials(),headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});let data=null;try{data=await r.json()}catch{}return {ok:r.ok,status:r.status,data}}
function wait(ms,signal){return new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'))},{once:true})})}
// Starts an AI request and resolves with {reply,questions,proposal}. Servers without
// background jobs (the local dev server) answer the first request directly.
export async function requestAi(body,{signal,onProgress=()=>{}}={}){
 const start=await post('/api/ai/chat',body,signal);
 if(!start.ok)throw new Error(start.data?.error||'AI request failed.');
 if(!start.data?.job)return start.data;
 const job=start.data.job;let failures=0,finishing=false;onProgress({stage:start.data.status||'queued'});
 try{
  for(;;){
   await wait(finishing?0:POLL_MS,signal);
   let res;
   try{res=await post('/api/ai/jobs',finishing?{job,model:body.model}:{job},signal)}
   catch(e){if(e.name==='AbortError')throw e;res={ok:false,status:0,data:null}}
   if(!res.ok){if((res.status===0||res.status>=500)&&++failures<=MAX_POLL_FAILURES)continue;throw new Error(res.data?.error||'Lost contact with the AI server while waiting. No changes were applied.')}
   failures=0;const poll=res.data;
   if(poll.done){if(poll.error)throw new Error(poll.error);return poll.result}
   if(ACTIVE.includes(poll.status)){onProgress({stage:poll.status});continue}
   if(finishing)throw new Error('Unexpected response from the AI server. No changes were applied.');
   finishing=true;
  }
 }catch(e){if(e.name==='AbortError')post('/api/ai/jobs/cancel',{job}).catch(()=>{});throw e}
}
