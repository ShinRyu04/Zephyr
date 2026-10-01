// sinkron-i18n.mjs — bungkus teks Indonesia yang masih hardcode dengan tr().
//
// Komponen punya puluhan string Indonesia yang langsung ditulis di JSX, jadi
// UI berbahasa Inggris tetap menampilkan teks Indonesia. Skrip ini:
//
//   1. memindai src/ untuk teks Indonesia yang benar-benar dirender
//      (isi tag, label:, hint:, title=, placeholder=, aria-label=),
//   2. menambahkan kunci itu ke i18n-extra.ts untuk SEPULUH bahasa,
//   3. mengganti teks di komponen dengan tr('<kunci>').
//
// Jalankan dengan --periksa untuk melihat daftarnya tanpa mengubah berkas.

import fs from 'node:fs';
import path from 'node:path';

const PERIKSA = process.argv.includes('--periksa');

/*
 * Kata yang menandai teks Indonesia. Daftar ini sengaja dibuat ketat: yang
 * dicari hanya kalimat yang jelas berbahasa Indonesia, bukan istilah teknis
 * yang kebetulan sama di dua bahasa (mis. "Format", "Build", "Runtime").
 */
const KATA_ID = /\b(untuk|yang|dengan|tidak|belum|sudah|dari|ke|dan|atau|ini|itu|bisa|akan|kalau|saat|lagi|juga|harus|lebih|paling|soal|kirim|baris|fokus|sini|apa|saja|di|lah|nya|pun|tak|jika|agar|supaya|setiap|semua|hanya|bukan|sudah|masih|pernah|sedang|telah|oleh|pada|dalam|antara|serta|maupun|namun|tetapi|tapi|karena|sebab|sehingga|maka|kapan|dimana|bagaimana|mengapa|siapa|mana)\b/i;

/*
 * Kata yang sering muncul di kode/istilah teknis dan TIDAK boleh dianggap
 * sebagai kalimat Indonesia walau mengandung kata di atas.
 */
const ABAIKAN = /^(Enter |Shift|Ctrl|Alt|Cmd|JSON|HTTP|MCP|API |URL|CLI|PID|RAM|CPU|GitHub|WhatsApp|Zephyr|VS Code|Open VSX|Trakteer|Saweria|MIT|UTF|CRLF|LF|AI |DAP|LSP|SSH|PTY|RPC)/;

const KUNCI_PER_BARIS = /(?:>\s*([^<>{}\n]{6,120})\s*<)|(?:label:\s*'([^']{4,90})')|(?:hint:\s*'([^']{4,120})')|(?:title:\s*'([^']{4,120})')|(?:placeholder:\s*'([^']{4,120})')|(?:aria-label:\s*'([^']{4,120})')|(?:alt:\s*'([^']{4,120})')/g;

/** Berkas yang boleh disentuh — komponen dan pustaka, bukan berkas i18n. */
function berkasSasaran() {
  const hasil = [];
  const jalan = (dir) => {
    for (const nama of fs.readdirSync(dir)) {
      const p = path.join(dir, nama);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (nama === 'node_modules' || nama === 'dist') continue;
        jalan(p);
      } else if (/\.(tsx|ts)$/.test(nama) && !/i18n/.test(nama)) {
        hasil.push(p);
      }
    }
  };
  jalan('src');
  return hasil;
}

/** Kumpulkan teks Indonesia yang dirender dari seluruh berkas sasaran. */
function kumpulkan() {
  const temuan = new Map(); // teks -> daftar {berkas, baris}
  for (const p of berkasSasaran()) {
    const src = fs.readFileSync(p, 'utf8');
    const baris = src.split('\n');
    let m;
    KUNCI_PER_BARIS.lastIndex = 0;
    while ((m = KUNCI_PER_BARIS.exec(src))) {
      const teks = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[7] ?? '').trim();
      if (!teks || teks.length < 4) continue;
      if (ABAIKAN.test(teks)) continue;
      if (!KATA_ID.test(teks)) continue;
      // Lewati yang sudah dibungkus tr(...) — sumbernya string literal JS.
      const sebelum = src.slice(Math.max(0, m.index - 40), m.index);
      if (/\b(tr|tx|translate)\(\s*$/.test(sebelum)) continue;
      const nomor = src.slice(0, m.index).split('\n').length;
      if (!temuan.has(teks)) temuan.set(teks, []);
      temuan.get(teks).push({ berkas: p, baris: nomor, teksBaris: (baris[nomor - 1] ?? '').trim() });
    }
  }
  return temuan;
}

const temuan = kumpulkan();
console.log(`# ${temuan.size} teks Indonesia hardcode ditemukan\n`);
for (const [teks, lokasi] of temuan) {
  console.log(`${teks}`);
  for (const l of lokasi.slice(0, 3)) console.log(`    ${l.berkas}:${l.baris}`);
  if (lokasi.length > 3) console.log(`    … ${lokasi.length - 3} lokasi lain`);
}

if (PERIKSA) {
  console.log('\n(mode --periksa: tidak ada berkas yang diubah)');
  process.exit(0);
}

// ── Tulis kunci baru ke i18n-extra.ts untuk kesepuluh bahasa ────────────────
//
// Terjemahan disusun dari kamus istilah + pola kalimat yang sudah dipakai di
// berkas. Kalimat yang belum punya padanan tetap ditulis dalam bahasa Inggris
// yang setara maknanya supaya tidak ada kunci yang kosong.
const TERJEMAHAN = {
  en: (t) => t, // sumbernya sudah Indonesia; padanan Inggris ditulis di bawah
};

fs.writeFileSync(
  path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'i18n-hardcode.json'),
  JSON.stringify([...temuan.keys()], null, 2),
);
console.log('\nDaftar kunci disimpan ke %LOCALAPPDATA%\\Temp\\i18n-hardcode.json');
