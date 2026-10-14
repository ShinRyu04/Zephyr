// uji-kesehatan-semua.mjs — papan kesehatan semua skrip uji/pemeriksa Zephyr.
//
// Tujuan: satu run untuk melihat JUJUR mana skrip yang hijau, merah, butuh app
// hidup, rusak (galat impor), atau menggantung. Skrip ini PELAPOR, bukan gerbang:
// ia SELALU keluar 0 (kecuali dirinya sendiri tak bisa jalan), apa pun hasil
// anak-anaknya. Gerbang ada di tiap skrip; di sini kita cuma mengukur.
//
// Aturan main (dipatuhi sendiri):
//   * TIDAK mengubah satu pun skrip yang dijalankan — cuma `node <file>`.
//   * cwd tiap anak = AKAR repo (banyak skrip membaca 'src/lib/...' relatif cwd).
//   * batas waktu per skrip (default 120 dtk, override UJI_KESEHATAN_CAP_MS)
//     supaya skrip yang menunggu app/CDP tidak menggantung selamanya.
//
// Pemakaian:
//   node scripts/uji-kesehatan-semua.mjs
//   UJI_KESEHATAN_CAP_MS=30000 node scripts/uji-kesehatan-semua.mjs
//   UJI_KESEHATAN_JSON=hasil.json node scripts/uji-kesehatan-semua.mjs
//
// Pemakaian berpotong (kalau 560+ skrip sekaligus terlalu lama, atau lingkungan
// membunuh proses induk sebelum selesai):
//   UJI_KESEHATAN_MULAI=0   UJI_KESEHATAN_BATAS=60 UJI_KESEHATAN_JSON=s1.json node scripts/uji-kesehatan-semua.mjs
//   UJI_KESEHATAN_MULAI=60  UJI_KESEHATAN_BATAS=60 UJI_KESEHATAN_JSON=s2.json node scripts/uji-kesehatan-semua.mjs
//   UJI_KESEHATAN_MULAI=999 UJI_KESEHATAN_GABUNG=s1.json,s2.json UJI_KESEHATAN_JSON=hasil.json node scripts/uji-kesehatan-semua.mjs
// Potongan mengurutkan nama berkas lebih dulu, jadi MULAI/BATAS = indeks stabil,
// dan run terakhir bisa mencetak satu tabel gabungan lengkap.

import { readdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DIR_SCRIPT = path.dirname(fileURLToPath(import.meta.url));
const AKAR = path.dirname(DIR_SCRIPT); // akar repo
const SAYA = path.basename(fileURLToPath(import.meta.url));
const CAP_MS = Number(process.env.UJI_KESEHATAN_CAP_MS ?? 120000);
const ULANG_MAKS = Number(process.env.UJI_KESEHATAN_ULANG ?? 4);
const MULAI = Number(process.env.UJI_KESEHATAN_MULAI ?? 0);
const BATAS = Number(process.env.UJI_KESEHATAN_BATAS ?? Number.MAX_SAFE_INTEGER);
const GABUNG = String(process.env.UJI_KESEHATAN_GABUNG ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
// Daftar nama berkas terpilih (mis. hanya yang tadi menggantung, untuk diuji
// ulang dengan batas waktu lebih longgar). Kalau kosong → pakai MULAI/BATAS.
const SAJA = String(process.env.UJI_KESEHATAN_SAJA ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const POLA = /^(uji-|cek-|verify).*\.mjs$/i;

// ---- kategorisasi ---------------------------------------------------------
// Urutan penting. Yang paling menentukan lebih dulu.
// RUSAK = skrip benar-benar TIDAK BISA JALAN karena impor/sintaksnya sendiri.
// Sengaja TIDAK memakai kata polos "SyntaxError"/"Unexpected token": banyak skrip
// menyuntik potongan kode ke halaman app lewat CDP, dan galat sintaks di
// <anonymous_script> itu galat sisi-app (→ BUTUH-APP), bukan skrip ujinya rusak.
const RE_RUSAK =
  /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)|Failed to resolve module specifier|does not provide an export named|ERR_UNKNOWN_FILE_EXTENSION|ERR_INVALID_PACKAGE|ERR_PACKAGE_PATH_NOT_EXPORTED|Cannot use import statement/;
// Galat sintaks MILIK SKRIP SENDIRI: node menyebut path scripts/<berkas>.mjs:baris.
// (<anonymous_script> / 'at <anonymous>' berarti galat di sisi halaman app.)
const RE_RUSAK_SENDIRI =
  /(?:SyntaxError|Invalid or unexpected token)[^\n]*\n?[^\n]*scripts[\\/][\w.-]+\.mjs:\d+/;
// Sinyal "butuh app hidup" — app WebView2 (CDP 9223), MCP (9222), atau Vite (5173).
// Termasuk galat yang HANYA muncul karena skrip menyuntik kode ke halaman app
// yang sudah mati (anonymous_script / evaluate / lib-cdp throw / THREW).
const RE_BUTUH_APP =
  /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT_APP|WebSocket|ws:\/\/|9223|9222|\bCDP\b|__ZEPHYR|Tauri|tauri|invoke|DevTools|localhost:5173|127\.0\.0\.1:5173|Target\.|Page\.|Runtime\.|attach|json\/(?:list|version)|Failed to parse URL from undefined|mock-ai\.mjs|mock provider MATI|anonymous_script|at <anonymous>|lib-cdp\.mjs:\d+|THREW|evaluate|zephyr\.exe|Tidak ada target CDP|belum hidup/i;
// Penanda gagal walau exit code 0. PENTING: penanda HURUF BESAR (verdict),
// bukan kata biasa — supaya deskripsi uji seperti "LULUS ... satu gagal
// dilaporkan" (kata 'gagal' huruf kecil) tidak salah dibaca sebagai kegagalan.
const RE_GAGAL =
  /(?:^|[\s>|*\-[(])GAGAL\b|(?:^|[\s>|*\-[(])FAIL(?:ED)?\b|VERDICT:\s*(?:GAGAL|FAIL)|\u274c|\u2717|✗|❌/;

function klasifikasi(kode, teks) {
  if (kode === 'MENGGANTUNG') return 'MENGGANTUNG';
  if (RE_RUSAK.test(teks) || RE_RUSAK_SENDIRI.test(teks)) return 'RUSAK';
  if (RE_BUTUH_APP.test(teks)) return 'BUTUH_APP';
  if (kode === 0 && !RE_GAGAL.test(teks)) return 'HIJAU';
  return 'MERAH';
}

function angkaPertama(teks) {
  for (const baris of teks.split(/\r?\n/)) {
    if (/\d/.test(baris)) {
      const b = baris.trim().replace(/\s+/g, ' ');
      if (b.length > 4) return b.slice(0, 78);
    }
  }
  return '-';
}

function ringkasPesan(teks) {
  const satu = teks.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  return satu.slice(0, 110) || '(tanpa keluaran)';
}

function tidur(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---- daftar skrip ---------------------------------------------------------
const semua = readdirSync(DIR_SCRIPT)
  .filter((f) => POLA.test(f) && f !== SAYA)
  .sort();
const berkas =
  SAJA.length > 0 ? semua.filter((f) => SAJA.includes(f)) : semua.slice(MULAI, MULAI + BATAS);

// ---- jalankan satu per satu ----------------------------------------------
const hasil = [];
let i = 0;
for (const f of berkas) {
  i += 1;
  const mulai = Date.now();
  // Windows sesekali gagal MEMBUAT proses saat spawn sangat rapat
  // (kode keluar 3221225794 = 0xC0000142 STATUS_DLL_INIT_FAILED, tanpa keluaran).
  // Itu artefak lingkungan, bukan kegagalan skrip — jadi diulang, bukan dicatat merah.
  let p = null;
  let percobaan = 0;
  for (percobaan = 1; percobaan <= ULANG_MAKS; percobaan += 1) {
    p = spawnSync(process.execPath, [path.join('scripts', f)], {
      cwd: AKAR,
      encoding: 'utf8',
      timeout: CAP_MS,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // 0xC0000142 DLL init gagal / 0xC0000005 access violation. Dibandingkan
    // sebagai unsigned supaya bentuk bertanda (-1073741502) ikut tertangkap.
    const u = p.status === null ? 0 : p.status >>> 0;
    const artefakSpawn = p.error == null && (u === 0xc0000142 || u === 0xc0000005);
    if (!artefakSpawn) break;
    tidur(500);
  }
  const durasi = Date.now() - mulai;
  const teks = `${p.stdout ?? ''}\n${p.stderr ?? ''}`;
  let kode = p.status ?? 1;
  if (p.error && p.error.code === 'ETIMEDOUT') kode = 'MENGGANTUNG';
  const uFinal = typeof kode === 'number' ? kode >>> 0 : 0;
  let kat = klasifikasi(kode, teks);
  // Sesudah diulang pun tetap gagal membuat proses → tandai apa adanya.
  if (kat === 'MERAH' && (uFinal === 0xc0000142 || uFinal === 0xc0000005)) kat = 'ARTEFAK_SPAWN';
  hasil.push({
    skrip: f,
    kategori: kat,
    kode: kode === 'MENGGANTUNG' ? 'TIMEOUT' : String(kode),
    durasi_ms: durasi,
    percobaan,
    angka: angkaPertama(teks),
    pesan: ringkasPesan(teks),
  });
  const tanda = {
    HIJAU: 'HIJAU',
    MERAH: 'MERAH',
    BUTUH_APP: 'BUTUH-APP',
    RUSAK: 'RUSAK',
    MENGGANTUNG: 'HANG',
    ARTEFAK_SPAWN: 'ARTEFAK',
  }[kat];
  process.stderr.write(
    `[${i}/${berkas.length} · idx ${MULAI + i - 1}/${semua.length}] ${tanda.padEnd(9)} ${f} (${durasi}ms)\n`,
  );
  // Tulis baris-per-baris supaya run yang dipotong tetap meninggalkan data.
  if (process.env.UJI_KESEHATAN_JSON) {
    appendFileSync(`${process.env.UJI_KESEHATAN_JSON}.jsonl`, JSON.stringify(hasil[hasil.length - 1]) + '\n');
  }
}

// ---- gabung hasil run sebelumnya -----------------------------------------
const peta = new Map();
for (const jalur of GABUNG) {
  if (!existsSync(jalur)) continue;
  try {
    const lama = JSON.parse(readFileSync(jalur, 'utf8'));
    for (const h of lama.hasil ?? []) peta.set(h.skrip, h);
  } catch {
    /* berkas rusak diabaikan — ini pelapor, bukan gerbang */
  }
}
for (const h of hasil) peta.set(h.skrip, h); // run sekarang menang
const semuanya = [...peta.values()].sort((a, b) => a.skrip.localeCompare(b.skrip));

// ---- ringkasan ------------------------------------------------------------
const hitung = { HIJAU: 0, MERAH: 0, BUTUH_APP: 0, RUSAK: 0, MENGGANTUNG: 0, ARTEFAK_SPAWN: 0 };
for (const h of semuanya) hitung[h.kategori] += 1;

const L = [];
L.push('');
L.push('='.repeat(96));
L.push(
  `RINGKASAN KESEHATAN SKRIP UJI/PEMERIKSA ZEPHYR — ${semuanya.length} dari ${semua.length} skrip terukur`,
);
L.push(`akar repo : ${AKAR}`);
L.push(`batas skrip: ${CAP_MS} ms   ·   waktu: ${new Date().toISOString()}`);
if (GABUNG.length > 0 || berkas.length !== semua.length) {
  L.push(
    `potongan   : idx ${MULAI}..${MULAI + Math.max(berkas.length - 1, -1)} (${berkas.length} skrip) · gabung ${GABUNG.length} berkas`,
  );
}
L.push('='.repeat(96));
L.push(`  HIJAU       : ${hitung.HIJAU}`);
L.push(`  MERAH       : ${hitung.MERAH}`);
L.push(`  BUTUH APP   : ${hitung.BUTUH_APP}`);
L.push(`  RUSAK       : ${hitung.RUSAK}`);
L.push(`  MENGGANTUNG : ${hitung.MENGGANTUNG}`);
if (hitung.ARTEFAK_SPAWN > 0) {
  L.push(
    `  ARTEFAK     : ${hitung.ARTEFAK_SPAWN}  (0xC0000142 — Windows gagal membuat proses, bukan salah skrip)`,
  );
}
L.push(
  `  (skrip yang perlu spawn-ulang karena artefak Windows: ${semuanya.filter((x) => x.percobaan > 1).length})`,
);
L.push('-'.repeat(96));
L.push('KATEGORI  | SKRIP                                     | KODE | ANGKA/KELUARAN');
L.push('-'.repeat(96));
const tanda2 = {
  HIJAU: 'HIJAU',
  MERAH: 'MERAH',
  BUTUH_APP: 'BUTUH-APP',
  RUSAK: 'RUSAK',
  MENGGANTUNG: 'HANG',
  ARTEFAK_SPAWN: 'ARTEFAK',
};
const urut = ['HIJAU', 'MERAH', 'BUTUH_APP', 'RUSAK', 'MENGGANTUNG', 'ARTEFAK_SPAWN'];
for (const kat of urut) {
  for (const h of semuanya.filter((x) => x.kategori === kat)) {
    L.push(
      `${tanda2[h.kategori].padEnd(9)} | ${h.skrip.padEnd(41)} | ${String(h.kode).padEnd(4)} | ${h.pesan}`,
    );
  }
}
L.push('='.repeat(96));
L.push('Catatan: BUTUH-APP = keluaran menyebut CDP/9223/Tauri/fetch failed (app belum hidup).');
L.push('         RUSAK      = galat impor/sintaks (modul hilang, eksport tidak ada).');
L.push('         HANG       = melewati batas waktu, dipotong.');
L.push('         ARTEFAK    = Windows gagal membuat proses (0xC0000142), bukan salah skrip.');
L.push('');

const laporan = L.join('\n');
console.log(laporan);

if (process.env.UJI_KESEHATAN_JSON) {
  writeFileSync(
    process.env.UJI_KESEHATAN_JSON,
    JSON.stringify(
      { cap_ms: CAP_MS, akar: AKAR, total_skrip: semua.length, hitung, hasil: semuanya },
      null,
      1,
    ),
  );
  console.log(`JSON: ${process.env.UJI_KESEHATAN_JSON}`);
}

// PELAPOR, bukan gerbang: selalu 0.
process.exit(0);
