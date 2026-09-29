import {apiCredentials,apiUrl} from './config.js';
// Longer than the server's 15-minute AI limit so the server reports its own timeout first.
export const AI_CLIENT_TIMEOUT_MS=16*60*1000;
export function progressText(p,subject='datasheet'){if(p?.stage==='writing')return 'Writing the answer… '+Number(p.chars||0).toLocaleString()+' characters';if(p?.stage==='reading')return 'Reading the '+subject+' and reasoning';return 'Sending request'}
// Posts to /api/ai/chat and reads the newline-delimited JSON progress stream.
// Falls back to a plain JSON response from servers that do not stream.
export async function requestAi(body,{signal,onProgress=()=>{}}={}){
 const r=await fetch(apiUrl('/api/ai/chat'),{method:'POST',credentials:apiCredentials(),headers:{'Content-Type':'application/json',Accept:'application/x-ndjson'},body:JSON.stringify(body),signal});
 if(!(r.headers.get('content-type')||'').includes('ndjson')||!r.body){let result=null;try{result=await r.json()}catch{}if(!r.ok)throw new Error(result?.error||'AI request failed.');return result}
 const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
 for(;;){const {value,done}=await reader.read();if(value)buffer+=decoder.decode(value,{stream:!done});let end;
  while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;let msg;try{msg=JSON.parse(line)}catch{continue}
   if(msg.type==='progress')onProgress(msg);else if(msg.type==='error')throw new Error(msg.error||'AI request failed.');else if(msg.type==='result'){const {type,...result}=msg;return result}}
  if(done)break}
 throw new Error('The connection to the AI server closed before a response arrived. No changes were applied. Retry the request.');
}
