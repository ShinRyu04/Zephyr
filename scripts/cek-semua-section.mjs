/**
 * Buka SETIAP section Settings satu per satu, baca semua teks terlihat,
 * dan laporkan yang mengandung kata Indonesia. Ini pemindaian menyeluruh.
 */
const KATA = ['yang','tidak','sudah','untuk','dari','akan','bisa','harus','belum','kalau',
  'karena','hanya','saja','pakai','dengan','adalah','tersedia','dibuka','disimpan',
  'dijalankan','membuat','menggunakan','semua','setiap','beberapa','namun','tetapi',
  'juga','masih','telah','gagal','kosong','pilih','buka','simpan','tutup','cari',
  'hapus','tambah','ubah','berkas','selesai','pintasan','riwayat','catatan','jawaban',
  'terang','gelap','nyaman','hangat','dingin','malam','siang','tema','warna','tampilan',
  'pengaturan','kontras','lembut','klasik','bersih','lain','lagi','punya','mau','jangan',
  'wajib','perlu','boleh','nyala','mati','aktif','ubah','atur','tampil','muncul','sembunyi'];

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
  const r = await kirim('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r?.result?.exceptionDetails) return null;
  return r?.result?.result?.value;
};
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));
const re = new RegExp('\\b(' + KATA.join('|') + ')\\b', 'i');

// buka Settings
await ev(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label')||'') === 'Settings');
  if (b) b.click(); return 1;
})()`);
await jeda(1500);

const nav = await ev(`(() => [...document.querySelectorAll('[class*="settings-nav"] button, nav button')]
  .map((b) => (b.textContent||'').trim()).filter((x) => x && x.length < 30))()`);
console.log('section:', JSON.stringify(nav));

const semua = {};
for (const nama of (nav ?? [])) {
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent||'').trim() === ${JSON.stringify(nama)});
    if (b) b.click(); return 1;
  })()`);
  await jeda(900);
  const teks = await ev(`(() => {
    const out = []; const seen = new Set();
    const root = document.querySelector('[class*="settings-body"], [class*="settings-page"], [class*="settings"]') || document.body;
    root.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (r.width < 2 || r.height < 2 || cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      for (const n of el.childNodes) {
        if (n.nodeType !== 3) continue;
        const t = n.textContent.trim();
        if (t.length < 4 || t.length > 130 || seen.has(t)) continue;
        if (/^[\\w.-]+$/.test(t)) continue;
        seen.add(t); out.push(t);
      }
    });
    return out;
  })()`);
  const indo = (teks ?? []).filter((x) => re.test(x));
  semua[nama] = { total: (teks ?? []).length, indo };
}

console.log('\\n=== HASIL PER SECTION ===');
for (const [nama, v] of Object.entries(semua)) {
  console.log(`\\n## ${nama} (${v.total} teks, ${v.indo.length} Indonesia)`);
  for (const x of v.indo.slice(0, 14)) console.log('   - ' + x);
}
ws.close();
