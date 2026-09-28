export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $=id=>document.getElementById(id);
export function bind(selector,event,fn){document.querySelectorAll(selector).forEach(e=>e.addEventListener(event,fn))}
let timer;export function toast(message){$('toast').textContent=message;$('toast').className='show';clearTimeout(timer);timer=setTimeout(()=>{$('toast').className=''},8000)}
export function download(name,content,type='application/json'){const b=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function options(items,value){return items.map(([id,label])=>`<option value="${esc(id)}" ${String(id)===String(value)?'selected':''}>${esc(label)}</option>`).join('')}
export function input(label,value,attrs=''){return `<label class="form-label">${esc(label)}<input value="${esc(value)}" ${attrs}></label>`}
