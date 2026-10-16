// Apakah ada ruang kosong di kiri pil Agents supaya ia bisa tumbuh ke KANAN
// tanpa menggeser ikon? Bandingkan dengan main window.
import WebSocket from 'ws';
const CDP='http://127.0.0.1:9223/json/list';
async function att(pred){
  const ts=await (await fetch(CDP)).json(); const t=ts.find(pred); if(!t) return null;
  const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false});
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
  let id=0;const P=new Map();
  ws.on('message',raw=>{const m=JSON.parse(raw.toString());const p=P.get(m.id);if(p){P.delete(m.id);clearTimeout(p.t);p.resolve(m)}});
  const send=(method,params={})=>{const i=++id;return new Promise((res,rej)=>{const to=setTimeout(()=>{P.delete(i);rej(new Error('timeout'))},15000);P.set(i,{resolve:res,t:to});ws.send(JSON.stringify({id:i,method,params}))})};
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});if(r.result?.exceptionDetails)return{error:r.result.exceptionDetails.exception?.description};return r.result?.result?.value};
  return {ev,close:()=>ws.close()};
}
const UKUR=(pil,grup,cc)=>`(() => {
  const p=document.querySelector(${JSON.stringify(pil)});
  const g=document.querySelector(${JSON.stringify(grup)});
  const c=document.querySelector(${JSON.stringify(cc)});
  if(!p||!g) return {error:'tidak ditemukan'};
  const r=e=>{const x=e.getBoundingClientRect();return{x:+x.x.toFixed(2),r:+x.right.toFixed(2),w:+x.width.toFixed(2)}};
  const cs=getComputedStyle(g);
  const anak=[...g.children].map(e=>({cls:e.className,r:r(e).r,w:r(e).w}));
  return {
    grup:{...r(g),display:cs.display,justify:cs.justifyContent,flex:String(cs.flex)},
    pil:r(p),
    cc:c?r(c):null,
    anak,
    // berapa jarak dari tepi kiri pil ke tepi kiri anak pertama grup
    sisaKiri:+(r(p).x - r(g).x).toFixed(2),
  };
})()`;
const a=await att(t=>t.type==='page'&&!t.url.includes('#agents'));
const b=await att(t=>t.url.includes('#agents'));
if(a){console.log('=== MAIN ===');console.log(JSON.stringify(await a.ev(UKUR('.mb-aipill','.mb-cc-wrap','.mb-cc')),null,2));a.close()}
if(b){console.log('\n=== AGENTS ===');console.log(JSON.stringify(await b.ev(UKUR('.ag-open-editor','.ag-tb-center','.ag-cc')),null,2));b.close()}
