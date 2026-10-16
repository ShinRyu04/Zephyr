// Hover SUNGGUHAN lewat CDP, lalu ukur. Bukan simulasi inline style.
import WebSocket from 'ws';
const CDP='http://127.0.0.1:9223/json/list';
async function att(pred){
  const ts=await (await fetch(CDP)).json(); const t=ts.find(pred); if(!t) return null;
  const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false});
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
  let id=0;const P=new Map();
  ws.on('message',raw=>{const m=JSON.parse(raw.toString());const p=P.get(m.id);if(p){P.delete(m.id);clearTimeout(p.t);p.resolve(m)}});
  const send=(method,params={})=>{const i=++id;return new Promise((res,rej)=>{const to=setTimeout(()=>{P.delete(i);rej(new Error('timeout '+method))},15000);P.set(i,{resolve:res,t:to});ws.send(JSON.stringify({id:i,method,params}))})};
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});if(r.result?.exceptionDetails)return{error:r.result.exceptionDetails.exception?.description};return r.result?.result?.value};
  return {ev,send,close:()=>ws.close()};
}
const RECT=`(() => {const b=document.querySelector(SEL);if(!b)return{error:'tidak ada'};const i=b.querySelector('.mb-aipill-ic');const bo=b.querySelector('.mb-aipill-body');const r=e=>{const x=e.getBoundingClientRect();return{x:+x.x.toFixed(2),w:+x.width.toFixed(2)}};return{btn:r(b),ikon:r(i),body:r(bo),bodyMaxW:getComputedStyle(bo).maxWidth,bodyOpacity:getComputedStyle(bo).opacity,btnWarna:getComputedStyle(b).color,ikonWarna:getComputedStyle(i).color}})()`;

async function uji(conn,sel,nama){
  const q=RECT.replace('SEL',JSON.stringify(sel));
  const before=await conn.ev(q);
  if(before?.error){console.log(nama,'->',before.error);return null}
  // Ambil titik tengah tombol, gerakkan mouse ke sana (hover sungguhan).
  const cx=before.btn.x+before.btn.w/2, cy=8;
  await conn.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx,y:cy,buttons:0});
  await new Promise(r=>setTimeout(r,600)); // beri waktu transisi 200ms selesai
  const after=await conn.ev(q);
  console.log('=== '+nama+' ('+sel+') ===');
  console.log(' SEBELUM:',JSON.stringify({btnW:before.btn.w,ikonX:before.ikon.x,ikonW:before.ikon.w,bodyW:before.body.w,bodyMaxW:before.bodyMaxW,bodyOpacity:before.bodyOpacity,ikonWarna:before.ikonWarna}));
  console.log('  SESUDAH:',JSON.stringify({btnW:after.btn.w,ikonX:after.ikon.x,ikonW:after.ikon.w,bodyW:after.body.w,bodyMaxW:after.bodyMaxW,bodyOpacity:after.bodyOpacity,ikonWarna:after.ikonWarna}));
  console.log('  DELTA  : btnW='+(after.btn.w-before.btn.w).toFixed(2)+'  ikonX='+(after.ikon.x-before.ikon.x).toFixed(2)+'  ikonW='+(after.ikon.w-before.ikon.w).toFixed(2));
  return {before,after};
}
const a=await att(t=>t.type==='page'&&!t.url.includes('#agents'));
const b=await att(t=>t.url.includes('#agents'));
const ra=a?await uji(a,'.mb-aipill','MAIN'):null;
const rb=b?await uji(b,'.ag-open-editor','AGENTS'):null;
if(ra&&rb){
  console.log('\n=== PERBANDINGAN ===');
  const d=x=>(x.after.btn.w-x.before.btn.w).toFixed(2);
  const dx=x=>(x.after.ikon.x-x.before.ikon.x).toFixed(2);
  console.log('melebar tombol : main='+d(ra)+'  agents='+d(rb)+'  '+(d(ra)===d(rb)?'SAMA':'BEDA'));
  console.log('ikon bergeser  : main='+dx(ra)+'  agents='+dx(rb)+'  '+(dx(ra)===dx(rb)?'SAMA':'BEDA'));
  console.log('warna ikon hover: main='+ra.after.ikonWarna+'  agents='+rb.after.ikonWarna);
}
a?.close();b?.close();
