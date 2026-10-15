/*
 * Apakah aturan subagent yang baru sampai ke model - dan yang lama sudah hilang?
 *
 * Yang salah sebelumnya: aturan memicu subagent dari JUMLAH BERKAS, tanpa
 * membedakan menulis dari meneliti. Subagent read-only, jadi tugas menulis
 * diserahkan ke mereka, mereka melapor selesai, dan tidak ada berkas yang
 * dibuat. Agent induk lalu berhenti dengan yakin padahal hasilnya kosong.
 *
 * Tiga hal diperiksa:
 *   1. aturan baru ada: subagent MENELITI, bukan menulis
 *   2. pemicunya sekarang JENIS pekerjaan, bukan jumlah berkas
 *   3. aturan lama yang salah ("More than one file means more than one
 *      subagent") sudah tidak ada
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
if (!page) {
  console.log('Zephyr tidak ketemu');
  process.exit(1);
}
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
  console.log('prompt tidak terbaca:', teks);
  process.exit(1);
}

console.log(`panjang prompt: ${teks.length} karakter\n`);

const periksa = [
  ['aturan baru: subagent meneliti, bukan menulis', 'Subagents RESEARCH; they do not write files', false],
  ['aturan baru: jangan serahkan penulisan ke subagent', 'Never hand file-writing to a subagent', false],
  ['aturan baru: buktikan dari disk sebelum mengaku selesai', 'verify it from the disk', false],
  ['pemicu = jenis pekerjaan, bukan jumlah berkas', 'decide by the kind of work, not the number of files', false],
  ['aturan LAMA yang salah sudah hilang', 'More than one file means more than one subagent', true],
];

let lulus = 0;
for (const [nama, frasa, harusHilang] of periksa) {
  const ada = teks.includes(frasa);
  const ok = harusHilang ? !ada : ada;
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}`);
  if (ok) lulus++;
  else {
    const i = teks.indexOf('run_subagent');
    console.log('         kutipan:', teks.slice(Math.max(0, i - 60), i + 220).replace(/\s+/g, ' '));
  }
}

ws.close();
console.log(`\n== ${lulus}/${periksa.length} lulus ==`);
process.exit(lulus === periksa.length ? 0 : 1);
