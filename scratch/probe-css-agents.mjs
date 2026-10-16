// Apakah stylesheet global benar-benar dimuat di jendela Agents?
import WebSocket from 'ws';
const CDP='http://127.0.0.1:9223/json/list';
async function att(pred){
  const ts=await (await fetch(CDP)).json();
  const t=ts.find(pred); if(!t) return null;
  const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false});
  await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});
  let id=0;const P=new Map();
  ws.on('message',raw=>{const m=JSON.parse(raw.toString());const p=P.get(m.id);if(p){P.delete(m.id);clearTimeout(p.t);p.resolve(m);}});
  const send=(method,params={})=>{const i=++id;return new Promise((res,rej)=>{const to=setTimeout(()=>{P.delete(i);rej(new Error('timeout'))},15000);P.set(i,{resolve:res,t:to});ws.send(JSON.stringify({id:i,method,params}))})};
  const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r.result?.exceptionDetails)return {error:r.result.exceptionDetails.exception?.description};return r.result?.result?.value};
  return {ev,close:()=>ws.close()};
}
const S=`(() => {
  const sheets=[...document.styleSheets].map(s=>{try{return (s.href||'inline')+' :: '+s.cssRules.length+' rules'}catch(e){return (s.href||'inline')+' :: TIDAK TERBACA'}});
  let punyaAipill=false, punyaAccentSub=false;
  for(const s of document.styleSheets){try{for(const r of s.cssRules){const t=r.cssText||'';if(t.includes('.mb-aipill'))punyaAipill=true;if(t.includes('--accent-subtle'))punyaAccentSub=true;}}catch(e){}}
  return {jumlahSheet:document.styleSheets.length, punyaAturanAipill:punyaAipill, punyaTokenAccentSub:punyaAccentSub, sheets};
})()`;
const a=await att(t=>t.type==='page'&&!t.url.includes('#agents'));
const b=await att(t=>t.url.includes('#agents'));
if(a){console.log('=== MAIN ===');console.log(JSON.stringify(await a.ev(S),null,2));a.close();}
else console.log('main tidak ada');
if(b){console.log('\n=== AGENTS ===');console.log(JSON.stringify(await b.ev(S),null,2));b.close();}
else console.log('agents tidak ada');
