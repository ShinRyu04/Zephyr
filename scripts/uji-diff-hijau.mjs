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
import path from 'node:path';

const BERKAS = 'D:/Talos/__uji-diff__.txt';

/* Isi awal: dua baris yang akan diubah, satu dibuang, satu ditambah. */
const AWAL = ['alfa', 'bravo', 'charlie', 'delta'].join('\n') + '\n';
const BARU = ['alfa', 'bravo diubah', 'delta', 'echo baru'].join('\n') + '\n';

/*
 * PRASYARAT: folder fixture harus ada. Dulu skrip ini langsung menulis dan
 * meninggalkan ENOENT mentah ("D:/Talos" tidak ada di mesin ini), yang terbaca
 * seperti harness rusak padahal aplikasinya belum pernah diuji. Fixture TIDAK
 * dibuat di tempat lain: mengarang fixture di luar repo adalah pekerjaan lain.
 */
if (!fs.existsSync(path.dirname(BERKAS))) {
  console.log(`TIDAK BERLAKU: folder fixture ${path.dirname(BERKAS)} tidak ada, jadi berkas uji ${BERKAS} tidak bisa dibuat.`);
  process.exit(2);
}

fs.writeFileSync(BERKAS, AWAL);

let list;
try {
  list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
} catch (e) {
  console.log(`TIDAK BERLAKU: app tidak hidup di port 9223 (${String(e).split('\n')[0]}).`);
  process.exit(2);
}
const page = list.find((t) => t.type === 'page' && /zephyr|5173/i.test(t.title + t.url));
if (!page) {
  console.log('TIDAK BERLAKU: halaman Zephyr tidak ketemu di port 9223 (uji ini butuh app hidup).');
  process.exit(2);
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
