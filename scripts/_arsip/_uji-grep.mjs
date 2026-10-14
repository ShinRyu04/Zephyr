import { Cdp, reporter } from './lib-cdp.mjs';
const R = reporter('grep internal tanpa ripgrep');
const { cdp } = await Cdp.attach('9223', ['Zephyr']);
await cdp.json(`window.__ZEPHYR__.getState().openWorkspace('D:/Testing'); return JSON.stringify('ok');`);
for (let i=0;i<60;i++){ const r=await cdp.json(`return JSON.stringify({ws:window.__ZEPHYR__.getState().workspace})`); if(r.ws==='D:/Testing')break; await new Promise(s=>setTimeout(s,1000)); }
const r = await cdp.json(`return JSON.stringify(await (async () => {
  try {
    const out = await window.__ZEPHYR_TOOLS__.jalankan('grep', { pattern: 'rantau', ignoreCase: true });
    return { ok: true, res: String(out).slice(0,300) };
  } catch(e){ return { ok: false, err: String(e&&e.message?e.message:e).slice(0,200) }; }
})())`, 60000);
console.log(JSON.stringify(r,null,1));
R.check('G1', r.ok, 'grep tidak melempar error');
R.check('G2', r.ok && !/ripgrep.*tidak ditemukan/.test(r.res||''), 'tidak lagi "ripgrep tidak ditemukan"');
R.check('G3', r.ok && /berkas|kecocokan|Tidak ada hasil/.test(r.res||''), 'mengembalikan hasil pencarian nyata');
R.selesai();
await cdp.close();
