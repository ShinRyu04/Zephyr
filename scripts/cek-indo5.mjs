/**
 * Hitung teks Indonesia yang BENAR-BENAR TERLIHAT (bukan <style>/<script>,
 * bukan elemen tersembunyi). Ini yang dibaca user di layar.
 */
const KATA = [
  'yang', 'tidak', 'sudah', 'untuk', 'dari', 'akan', 'bisa', 'harus', 'belum',
  'kalau', 'karena', 'hanya', 'saja', 'pakai', 'dengan', 'adalah', 'tersedia',
  'dibuka', 'disimpan', 'dijalankan', 'membuat', 'menggunakan', 'semua', 'setiap',
  'beberapa', 'namun', 'tetapi', 'juga', 'masih', 'telah', 'gagal', 'kosong',
  'pilih', 'buka', 'simpan', 'tutup', 'cari', 'hapus', 'tambah', 'ubah',
  'berkas', 'selesai', 'pintasan', 'riwayat', 'catatan', 'jawaban', 'tema',
  'terang', 'gelap', 'pengaturan', 'tampilan', 'jendela', 'pilihan',
];

const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && (t.title || '').includes('Zephyr'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const tunggu = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); }
});
await new Promise((r) => ws.addEventListener('open', r));
const kirim = (method, params = {}) => new Promise((r) => {
  const i = ++id; tunggu.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expr) => {
  const r = await kirim('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r?.result?.result?.value;
};

const hasil = await ev(`(() => {
  const kata = ${JSON.stringify(KATA)};
  const re = new RegExp('\\\\b(' + kata.join('|') + ')\\\\b', 'i');
  const out = []; const seen = new Set();
  const buang = new Set(['STYLE','SCRIPT','NOSCRIPT','HEAD','TITLE']);
  document.querySelectorAll('body *').forEach((el) => {
    if (buang.has(el.tagName)) return;
    // terlihat?
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 2 || r.height < 2) return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    for (const n of el.childNodes) {
      if (n.nodeType !== 3) continue;
      const t = n.textContent.trim();
      if (t.length < 5 || !re.test(t)) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      out.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,44),
                 testid: el.getAttribute('data-testid')||'', teks: t.slice(0,110) });
    }
  });
  const w = window.__ZEPHYR__;
  return { uiLang: w?.getState?.().settings?.uiLang ?? '(?)', jumlah: out.length, out };
})()`);

console.log(JSON.stringify({ uiLang: hasil?.uiLang, jumlah: hasil?.jumlah }, null, 1));
for (const x of (hasil?.out ?? [])) console.log(`  [${x.tag}${x.testid ? ' ' + x.testid : ''}] ${x.teks}`);
ws.close();
