/*
 * Apakah aturan subagent baru BENAR-BENAR sampai ke model?
 *
 * Menulis kalimatnya ke berkas bukan bukti - yang menentukan adalah prompt yang
 * disusun saat mengirim. Jadi promptnya dibangun lewat jalur yang sama seperti
 * pengiriman sungguhan, lalu diperiksa.
 *
 * Dua hal yang diperiksa:
 *   1. aturan pemicunya ada
 *   2. contoh lama yang MEMBATASI ("reading three files") sudah tidak ada -
 *      itu yang membuat model mengira subagent hanya untuk membaca
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && /zephyr|5173/i.test(t.title + t.url));
if (!page) {
  console.log('Zephyr tidak ketemu');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
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
await new Promise((r) => (ws.onopen = r));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    return 'GALAT: ' + String(d.exception?.description ?? d.text ?? '').split('\n')[0];
  }
  return r.result?.result?.value;
};

console.log('=== bridge prompt yang tersedia ===');
const kunci = await ev(`Object.keys(window).filter(k => /prompt/i.test(k)).join(', ')`);
console.log(kunci);

console.log('\n=== prompt sistem terakhir yang dikirim ===');
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
  console.log('tidak ketemu:', teks);
} else {
  console.log(`panjang: ${teks.length} karakter\n`);
  const periksa = [
    ['pemicu (EN)', 'More than one file means more than one subagent'],
    ['perlindungan tabrakan', 'will overwrite each other'],
    ['contoh terbatas LAMA hilang', 'reading three files', true],
  ];
  let lulus = 0;
  for (const [nama, frasa, harusHilang] of periksa) {
    const ada = teks.includes(frasa);
    const ok = harusHilang ? !ada : ada;
    console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${nama}`);
    if (ok) lulus++;
    if (!ok) {
      const i = teks.indexOf('run_subagents');
      console.log('         kutipan:', teks.slice(Math.max(0, i - 120), i + 240).replace(/\s+/g, ' '));
    }
  }
  console.log(`\n== ${lulus}/${periksa.length} lulus ==`);
}

ws.close();
