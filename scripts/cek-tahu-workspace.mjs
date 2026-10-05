/*
 * Apakah agent tahu di folder mana ia bekerja?
 *
 * Gejalanya: untuk pekerjaan yang SAMA, model mengirim path dengan dua bentuk
 * berbeda (`D:/Talos/situs` lalu `situs`), dan toolnya menjawab dengan dua
 * bentuk berbeda juga (`Direktori kosong: situs` lalu `D:\Talos dir situs`).
 * Model yang tahu tempatnya tidak akan menebak seperti itu.
 *
 * Dua hal diperiksa:
 *   1. apakah akar workspace benar-benar sampai ke model (ada di prompt?)
 *   2. apakah tool memberi tahu folder mana yang dipakai saat path relatif
 */
import { readFileSync } from 'node:fs';

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) {
    return 'GALAT: ' + String(r.result.exceptionDetails.exception?.description ?? '').split('\n')[0];
  }
  return r.result?.result?.value;
};

console.log('=== 1. workspace yang dipegang Zephyr ===');
console.log(await ev(`(() => {
  const z = window.__ZEPHYR__.getState ? window.__ZEPHYR__.getState() : window.__ZEPHYR__.store.getState();
  return JSON.stringify({ workspaces: z.workspaces, aktif: z.activeWorkspaceId, root: z.root ?? z.workspace ?? null }, null, 1);
})()`));

console.log('\n=== 2. apakah akar workspace ada di PROMPT yang dikirim? ===');
const teks = await ev(`(() => {
  for (const k of Object.keys(window)) {
    if (!/prompt/i.test(k)) continue;
    const P = window[k];
    if (!P || typeof P !== 'object') continue;
    for (const f of Object.keys(P)) {
      try {
        const v = P[f];
        if (typeof v !== 'function') continue;
        const h = v();
        if (typeof h === 'string' && h.length > 1000) return h;
      } catch (e) {}
    }
  }
  return null;
})()`);

if (typeof teks !== 'string') {
  console.log('  prompt tidak terbaca');
} else {
  for (const pola of ['D:\\Talos', 'D:/Talos', 'workspace', 'cwd', 'working directory', 'folder']) {
    const i = teks.indexOf(pola);
    console.log(
      `  ${i >= 0 ? 'ADA  ' : 'TIDAK'}  "${pola}"` +
        (i >= 0 ? `  -> ...${teks.slice(Math.max(0, i - 70), i + 110).replace(/\s+/g, ' ')}...` : ''),
    );
  }
}

console.log('\n=== 3. apa yang dikembalikan list_directory untuk path relatif? ===');
console.log(
  await ev(`(async () => {
  try {
    const a = await window.__ZEPHYR_TOOLS__.jalankan('list_directory', { path: 'situs' });
    const b = await window.__ZEPHYR_TOOLS__.jalankan('list_directory', { path: 'D:/Talos/situs' });
    return JSON.stringify({ relatif: String(a).slice(0, 200), absolut: String(b).slice(0, 200) }, null, 1);
  } catch (e) { return 'GALAT: ' + e.message; }
})()`) ?? '(async - lihat uji terpisah)',
);

ws.close();
