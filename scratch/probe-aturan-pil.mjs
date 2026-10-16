// Aturan mana yang MENANG untuk .mb-aipill-body di jendela Agents?
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
// Cari SEMUA aturan yang menyebut mb-aipill, di semua sheet, urut kemunculan.
const CARI=`(() => {
  const out=[];
  for(const s of document.styleSheets){
    let rules; try{rules=s.cssRules}catch(e){continue}
    for(const r of rules){
      const t=r.cssText||'';
      if(t.includes('mb-aipill')) out.push({idx:out.length, text:t.slice(0,200)});
    }
  }
  return out;
})()`;
const a=await att(t=>t.type==='page'&&!t.url.includes('#agents'));
const b=await att(t=>t.url.includes('#agents'));
for(const [nama,conn] of [['MAIN',a],['AGENTS',b]]){
  if(!conn){console.log(nama,'tidak ada');continue}
  const r=await conn.ev(CARI);
  console.log('=== '+nama+' : '+(Array.isArray(r)?r.length:JSON.stringify(r))+' aturan ===');
  if(Array.isArray(r)) r.forEach(x=>console.log(' ['+x.idx+'] '+x.text));
  conn.close();
}
