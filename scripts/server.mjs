import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handleAI } from '../server/ai.mjs';
if(fs.existsSync('.env'))process.loadEnvFile('.env');
const root=path.resolve('dist/site'),port=Number(process.env.PORT||3000);
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.pdf':'application/pdf','.csv':'text/csv','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
http.createServer(async(req,res)=>{
 try {
  if(!['localhost','127.0.0.1'].includes((req.headers.host||'').split(':')[0])){res.writeHead(403);return res.end('Host rejected');}
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>17*1024*1024){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
   const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
   const result=await handleAI(request,process.env);res.writeHead(result.status,Object.fromEntries(result.headers));if(result.body)for await(const chunk of result.body)res.write(chunk);res.end();return;
  }
  let name=decodeURIComponent(url.pathname);if(name==='/')name='/index.html';const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)||file.includes(path.sep+'server'+path.sep)){res.writeHead(403);return res.end()}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data)});
 }catch{res.writeHead(400);res.end('Bad request')}
}).listen(port,'127.0.0.1',()=>console.log(`Open http://localhost:${port}. AI ${process.env.OPENAI_API_KEY?'configured':'not connected'}. Press Ctrl+C to stop.`));
