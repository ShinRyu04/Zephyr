
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const esbuild=require('esbuild');
async function bundel(rel){const o=await esbuild.build({entryPoints:[path.join(process.cwd(),rel)],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent'});const b=Buffer.from(o.outputFiles[0].text,'utf8').toString('base64');return import(`data:text/javascript;base64,${b}`);}
const cat=await bundel('src/lib/zephyrTools/catalog.ts');
const gate=await bundel('src/lib/toolGate.ts');
console.log('CAT EXPORTS',Object.keys(cat).join(','));
console.log('GATE EXPORTS',Object.keys(gate).join(','));
const c=cat.TOOL_CATALOG;
console.log('isArray',Array.isArray(c));
const first=Array.isArray(c)?c[0]:Object.values(c)[0];
console.log('first',JSON.stringify(first));
console.log('keys',JSON.stringify(Object.keys(first)));
const a=gate.TOOL_AKTIF_AWAL;
console.log('AKTIF type',typeof a,Array.isArray(a));
console.log('AKTIF sample',JSON.stringify(Array.isArray(a)?a.slice(0,3):a).slice(0,300));
console.log('SELALU',JSON.stringify(cat.TOOL_DIKIRIM_SELALU).slice(0,400));
console.log('WAJIB',JSON.stringify(gate.TOOL_WAJIB).slice(0,400));
console.log('COUNTS',JSON.stringify(cat.TOOL_COUNTS));
