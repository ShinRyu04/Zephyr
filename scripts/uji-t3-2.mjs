// uji-t3-2.mjs — verifikasi T3.2 Database browser.
//
// UJI NYATA: harness MEMBUAT file SQLite sendiri (lewat jalur Rust tidak bisa —
// koneksi read-only), jadi file dibuat lebih dulu dengan Node, lalu dibaca
// lewat panel: daftar tabel, query SELECT, dan penolakan query tulis.
import { Cdp } from './lib-cdp.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

const DB = 'D:/Zephyr/.uji-db.sqlite';
const { cdp } = await Cdp.attach(9223, 'Zephyr');
let lulus = 0;
let gagal = 0;

const cek = (nama, ok, info = '') => {
  if (ok) {
    lulus++;
    console.log(`  LULUS  ${nama}${info ? '  ' + info : ''}`);
  } else {
    gagal++;
    console.log(`  GAGAL  ${nama}${info ? '  ' + info : ''}`);
  }
};

console.log('=== T3.2: Database browser ===\n');

// ── 0. buat file SQLite uji (lewat Node, bukan Rust: Rust read-only) ──
// Node 22 punya `node:sqlite` bawaan.
try {
  if (existsSync(DB)) rmSync(DB);
  mkdirSync('D:/Zephyr', { recursive: true });
  const skrip = `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(${JSON.stringify(DB)});
    db.exec("CREATE TABLE produk (id INTEGER PRIMARY KEY, nama TEXT, harga INTEGER)");
    db.exec("INSERT INTO produk (nama, harga) VALUES ('Kopi', 15000), ('Teh', 8000), ('Roti', 12000)");
    db.exec("CREATE VIEW mahal AS SELECT nama FROM produk WHERE harga > 10000");
    db.close();
    console.log('ok');
  `;
  const out = execFileSync(process.execPath, ['-e', skrip], { encoding: 'utf-8' }).trim();
  console.log(`  (file uji dibuat: ${DB} — ${out})\n`);
} catch (e) {
  console.log(`  (gagal membuat file uji: ${String(e).slice(0, 120)})\n`);
}

// ── V1: daftar tabel ──
const tab = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DB__;
  if (!D) return { err: 'bridge db tidak ada' };
  const r = await D.tabel(${JSON.stringify(DB)});
  return { n: r.length, nama: r.map((x) => x.nama), jenis: r.map((x) => x.jenis), baris: r.map((x) => x.baris) };
})())`, 90000);
cek('db_sqlite_tabel jalan', !tab.err, `n=${tab.n}`);
cek('tabel "produk" terdeteksi', Array.isArray(tab.nama) && tab.nama.includes('produk'), (tab.nama || []).join(','));
cek('view "mahal" terdeteksi sebagai view', Array.isArray(tab.jenis) && tab.jenis.includes('view'), (tab.jenis || []).join(','));
// Daftar urut alfabetis: "mahal" (view) di depan "produk". Jadi cari entri
// produk-nya, bukan mengambil indeks 0.
const iProduk = Array.isArray(tab.nama) ? tab.nama.indexOf('produk') : -1;
cek('jumlah baris produk terbaca benar (3)', iProduk >= 0 && tab.baris[iProduk] === 3,
  `nama=${JSON.stringify(tab.nama)} baris=${JSON.stringify(tab.baris)}`);

// ── V2: query SELECT ──
const q = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DB__;
  const h = await D.query(${JSON.stringify(DB)}, 'SELECT nama, harga FROM produk ORDER BY harga DESC');
  return { kolom: h.kolom, n: h.baris.length, baris0: h.baris[0], ms: h.ms };
})())`, 90000);
cek('query SELECT jalan', !q.err, `kolom=${(q.kolom || []).join(',')}`);
cek('kolom terbaca', JSON.stringify(q.kolom) === '["nama","harga"]', JSON.stringify(q.kolom));
cek('3 baris kembali', q.n === 3, `${q.n}`);
cek('urutan benar (termahal dulu)', q.baris0 && q.baris0[0] === 'Kopi', JSON.stringify(q.baris0));

// ── V3: query tulis DITOLAK tanpa mode tulis ──
const tolak = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DB__;
  try {
    await D.query(${JSON.stringify(DB)}, "DELETE FROM produk WHERE id = 1");
    return { ditolak: false };
  } catch (e) {
    return { ditolak: true, pesan: String(e && e.message ? e.message : e).slice(0, 90) };
  }
})())`, 60000);
cek('query DELETE ditolak tanpa mode tulis', tolak.ditolak === true, tolak.pesan || '');

// ── V4: bukti data TIDAK terhapus (file read-only) ──
const sisa = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DB__;
  const h = await D.query(${JSON.stringify(DB)}, 'SELECT COUNT(*) AS n FROM produk');
  return { n: h.baris[0][0] };
})())`, 60000);
cek('data utuh setelah percobaan DELETE', sisa.n === '3', `n=${sisa.n}`);

// ── V5: UI ter-render ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('db');
  await new Promise((r) => setTimeout(r, 700));
  return 1;
})())`, 60000);
const ui = await cdp.json(`return JSON.stringify({
  ada: !!document.querySelector('[data-testid="db-view"]'),
  adaPath: !!document.querySelector('[data-testid="db-path"]'),
  adaSql: !!document.querySelector('[data-testid="db-sql"]'),
  adaTulis: !!document.querySelector('[data-testid="db-write"]'),
  teks: (document.querySelector('[data-testid="db-view"]')?.textContent || '').slice(0, 90),
})`);
cek('panel Database ter-render', ui.ada === true);
cek('input path + editor SQL + toggle tulis ada', ui.adaPath && ui.adaSql && ui.adaTulis, ui.teks);

// ── V6: file tidak ada -> error jelas (bukan crash) ──
const hilang = await cdp.json(`return JSON.stringify(await (async () => {
  const D = window.__ZEPHYR_DB__;
  try {
    await D.tabel('D:/tidak-ada-xyz.sqlite');
    return { err: false };
  } catch (e) {
    return { err: true, pesan: String(e && e.message ? e.message : e).slice(0, 80) };
  }
})())`, 60000);
cek('file tidak ada -> error jelas', hilang.err === true, hilang.pesan || '');

// ── V7: tutup panel + bersihkan ──
await cdp.json(`return JSON.stringify(await (async () => {
  window.__ZEPHYR_PANEL__.store.getState().setActiveTab('terminal');
  return 1;
})())`, 30000);
try {
  if (existsSync(DB)) rmSync(DB);
} catch {}

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
