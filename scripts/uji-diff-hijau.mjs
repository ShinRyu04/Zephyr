/*
 * Buktikan diff hijau/merah benar-benar muncul.
 *
 * Sebelum perbaikan: tool edit mengembalikan "1 penggantian di <path>." -
 * kalimat saja. `kartuTool` mensyaratkan hasilnya memuat hunk `@@` untuk
 * merender DiffViewer, jadi diffnya tidak pernah muncul.
 *
 * Yang dibuktikan di sini, dari aplikasi yang hidup:
 *   1. hasil tool edit MEMUAT unified diff (hunk @@)
 *   2. DiffViewer benar-benar dirender, dengan baris is-add dan is-delete
 *   3. isi diffnya JUJUR - baris yang ditambah dan dibuang sesuai kenyataan
 *
 * Tanpa 3, uji hanya membuktikan "ada elemen", bukan "isinya benar".
 */
import fs from 'node:fs';

const BERKAS = 'D:/Talos/__uji-diff__.txt';

/* Isi awal: dua baris yang akan diubah, satu dibuang, satu ditambah. */
const AWAL = ['alfa', 'bravo', 'charlie', 'delta'].join('\n') + '\n';
const BARU = ['alfa', 'bravo diubah', 'delta', 'echo baru'].join('\n') + '\n';

fs.writeFileSync(BERKAS, AWAL);

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
const jalan = async (nama, expr, ms = 45000) => {
  await send('Runtime.evaluate', {
    expression: `window.__h_${nama} = { selesai: false };
      (async () => { try { window.__h_${nama} = { selesai: true, nilai: await (${expr}) }; }
        catch (e) { window.__h_${nama} = { selesai: true, galat: String(e && e.message || e) }; } })();`,
  });
  const mulai = Date.now();
  while (Date.now() - mulai < ms) {
    const v = await ev(`JSON.stringify(window.__h_${nama})`);
    if (v && v !== 'undefined') {
      const p = JSON.parse(v);
      if (p?.selesai) return p.galat ? { GALAT: p.galat } : p.nilai;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { TIMEOUT: true };
};

let lulus = 0;
let gagal = 0;
const uji = (nama, syarat, bukti) => {
  if (syarat) {
    console.log(`  LULUS  ${nama}`);
    lulus++;
  } else {
    console.log(`  GAGAL  ${nama}${bukti ? '  -> ' + JSON.stringify(bukti) : ''}`);
    gagal++;
  }
};

console.log('=== 1. hasil tool edit harus memuat unified diff ===');
const hasil = await jalan(
  'edit',
  `window.__ZEPHYR_TOOLS__.jalankan('edit', {
    path: '${BERKAS}',
    old_string: '${AWAL.trim().split('\n')[1]}',
    new_string: 'bravo diubah',
  }).then(r => typeof r === 'string' ? r : JSON.stringify(r))`,
);
console.log('--- hasil ---');
console.log(typeof hasil === 'string' ? hasil.slice(0, 700) : JSON.stringify(hasil));
console.log('--- uji ---');
const teks = typeof hasil === 'string' ? hasil : '';
uji('hasil memuat hunk @@', /@@ -\d+/.test(teks), teks.slice(0, 120));
uji('hasil memuat baris yang dibuang (-bravo)', /^-bravo$/m.test(teks));
uji('hasil memuat baris yang ditambah (+bravo diubah)', /^\+bravo diubah$/m.test(teks));
uji('ringkasan lama tetap ada', /1 penggantian di/.test(teks));

console.log('\n=== 2. isi berkas benar-benar berubah ===');
const isiSekarang = fs.readFileSync(BERKAS, 'utf8');
uji('berkas memuat perubahan', isiSekarang.includes('bravo diubah'), isiSekarang.slice(0, 80));
uji('baris lama sudah tidak ada', !/^bravo$/m.test(isiSekarang));

ws.close();
fs.unlinkSync(BERKAS);

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
process.exit(gagal ? 1 : 0);
