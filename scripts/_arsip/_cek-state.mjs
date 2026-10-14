import { Cdp } from './lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','localhost']);
const r = await cdp.json(`return JSON.stringify((() => {
  const A = window.__ZEPHYR_AI__.store.getState();
  const sess = A.activeSession?A.activeSession():null;
  return { ws: window.__ZEPHYR__.getState().workspace, model: A.model, provider: A.provider, busy: A.agentBusy, mode: A.agentMode??A.mode, nMsg: sess?sess.messages.length:0, lastMsg: sess&&sess.messages.length?String(sess.messages[sess.messages.length-1].content||'').slice(0,100):null };
})())`);
console.log(JSON.stringify(r,null,1));
await cdp.close();
