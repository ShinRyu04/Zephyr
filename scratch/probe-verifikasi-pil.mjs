// Verifikasi akhir: hover pada KEDUA arah (masuk lalu keluar) supaya delta
// terbaca benar, dan bandingkan main window vs Agents.
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
const SNAP=sel=>`(() => {const b=document.querySelector(${JSON.stringify(sel)});if(!b)return{error:'tidak ada'};const i=b.querySelector('.mb-aipill-ic');const bo=b.querySelector('.mb-aipill-body');const r=e=>{const x=e.getBoundingClientRect();return{x:+x.x.toFixed(2),w:+x.width.toFixed(2)}};const g=b.parentElement.getBoundingClientRect();return{btn:r(b),ikon:r(i),body:r(bo),grupX:+g.x.toFixed(2),ikonWarna:getComputedStyle(i).color,bodyMaxW:getComputedStyle(bo).maxWidth}})()`;

async function uji(conn,sel,nama){
  // 1) pastikan TIDAK hover: pindahkan mouse jauh
  await conn.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:2,y:400,buttons:0});
  await new Promise(r=>setTimeout(r,700));
  const tertutup=await conn.ev(SNAP(sel));
  if(tertutup?.error){console.log(nama,'->',tertutup.error);return null}
  // 2) hover ke tengah tombol
  const cx=tertutup.btn.x+tertutup.btn.w/2, cy=8;
  await conn.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx,y:cy,buttons:0});
  await new Promise(r=>setTimeout(r,700));
  const terbuka=await conn.ev(SNAP(sel));
  console.log('=== '+nama+' ('+sel+') ===');
  console.log('  tertutup: btnW='+tertutup.btn.w+' ikonX='+tertutup.ikon.x+' bodyW='+tertutup.body.w+' maxW='+tertutup.bodyMaxW+' warna='+tertutup.ikonWarna);
  console.log('  terbuka : btnW='+terbuka.btn.w+' ikonX='+terbuka.ikon.x+' bodyW='+terbuka.body.w+' maxW='+terbuka.bodyMaxW+' warna='+terbuka.ikonWarna);
  const d={btnW:+(terbuka.btn.w-tertutup.btn.w).toFixed(2),ikonX:+(terbuka.ikon.x-tertutup.ikon.x).toFixed(2),grupX:+(terbuka.grupX-tertutup.grupX).toFixed(2),bodyW:+(terbuka.body.w-tertutup.body.w).toFixed(2)};
  console.log('  DELTA   : btnW='+d.btnW+'  ikonX='+d.ikonX+'  grupX='+d.grupX+'  bodyW='+d.bodyW);
  return {tertutup,terbuka,d};
}
const a=await att(t=>t.type==='page'&&!t.url.includes('#agents'));
const b=await att(t=>t.url.includes('#agents'));
const ra=a?await uji(a,'.mb-aipill','MAIN'):null;
const rb=b?await uji(b,'.ag-open-editor','AGENTS'):null;
if(ra&&rb){
  console.log('\n=== PERBANDINGAN (yang harus SAMA) ===');
  const cek=(k,x,y)=>console.log('  '+k.padEnd(18)+' main='+String(x).padStart(8)+'  agents='+String(y).padStart(8)+'  '+(String(x)===String(y)?'SAMA':'*** BEDA ***'));
  cek('btnW melebar',ra.d.btnW,rb.d.btnW);
  cek('ikonX bergeser',ra.d.ikonX,rb.d.ikonX);
  cek('bodyW',ra.d.bodyW,rb.d.bodyW);
  cek('ikonWarna hover',ra.terbuka.ikonWarna,rb.terbuka.ikonWarna);
  cek('ikonWarna diam',ra.tertutup.ikonWarna,rb.tertutup.ikonWarna);
  const gerak=Math.abs(rb.d.ikonX)>0.5;
  console.log('\n  IKON NGGESER DI AGENTS:',gerak?('YA ('+rb.d.ikonX+'px) <-- MASIH SALAH'):'TIDAK (+'+rb.d.ikonX+'px) <-- BENAR, sama seperti main');
}
a?.close();b?.close();
