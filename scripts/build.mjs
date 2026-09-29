import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const siteDir = 'dist/site';
const serverDir = 'dist/server';
const publicApiBaseUrl = String(process.env.PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');

await rm('dist', { recursive: true, force: true });
await mkdir(siteDir, { recursive: true });
await cp('public', siteDir, { recursive: true });
await cp('src', siteDir, { recursive: true });
await writeFile(path.join(siteDir, 'runtime-config.js'), `window.DASCO_CONFIG = ${JSON.stringify({ apiBaseUrl: publicApiBaseUrl })};\n`);

await mkdir(serverDir, { recursive: true });

let ai = await readFile('server/ai.mjs', 'utf8');
ai = ai.replace("'../src/engine.js'", "'./engine.js'");
await writeFile(path.join(serverDir, 'ai.mjs'), ai);

let api = await readFile('server/api.mjs', 'utf8');
api = api.replace("'../src/engine.js'", "'./engine.js'").replace("'../src/model-data.js'", "'./model-data.js'");
await cp('src/model-data.js', path.join(serverDir, 'model-data.js'));
await writeFile(path.join(serverDir, 'api.mjs'), api);
await cp('src/engine.js', path.join(serverDir, 'engine.js'));

const seedCatalog = JSON.parse(await readFile('src/catalog.json', 'utf8'));
const worker = `import {handleApi} from './api.mjs';\nconst seedCatalog=${JSON.stringify(seedCatalog)};\nexport default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return handleApi(request,env,{seedCatalog});return new Response('Not found',{status:404,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}};\n`;
await writeFile(path.join(serverDir, 'index.js'), worker);

console.log(`Built static frontend in ${siteDir} and Cloudflare Worker in ${serverDir}.`);
