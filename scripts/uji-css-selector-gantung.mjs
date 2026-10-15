/**
 * uji-css-selector-gantung.mjs — penjaga CSS "selector gantung".
 *
 * KENAPA ADA: sebuah penghapusan blok CSS yang ceroboh pernah meninggalkan
 * sisa teks selector tanpa blok deklarasi, mis. baris `.btn.btn.btn` tepat
 * sebelum komentar + `.modal-backdrop {`. CSS memaafkan itu dengan
 * menggabungkan dua selector jadi SATU selector keturunan
 * (`.btn.btn.btn .modal-backdrop`) — jadi aturan aslinya HILANG tanpa
 * galat apa pun, dan `.modal-backdrop` (position:fixed + z-index:1000)
 * mati: semua dialog di app kehilangan latar gelap, posisi tengah, dan
 * tombolnya terpotong. Galat seperti ini tidak terdeteksi tsc, tidak
 * terdeteksi penghitung kurung, dan tidak terdeteksi `git diff` bersih.
 *
 * YANG DIPERIKSA (deterministik, tanpa app/jaringan):
 *  1. selector "berulang palsu": satu kelas sederhana yang sama diulang
 *     >=3 kali dalam satu compound selector (mis. .btn.btn.btn).
 *  2. selector yang MENGANDUNG nama aturan inti (mis. .modal-backdrop
 *     sebagai keturunan) padahal aturan inti itu harus berdiri sendiri.
 *  3. aturan inti wajib ada (daftar di WAJIB).
 *
 * PAKAI: node scripts/uji-css-selector-gantung.mjs [berkas.css ...]
 *        (tanpa argumen: src/index.css + semua src/styles/*.css)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Aturan inti yang WAJIB ada sebagai selector berdiri sendiri. */
const WAJIB = ['.modal-backdrop', '.modal', '.modal-title', '.modal-body', '.modal-actions'];

/** Kelas yang dipakai sebagai penanda "ada sisa selector menempel". */
const INTI = WAJIB.map((s) => s.replace(/^\./, ''));

function daftarBerkas(argv) {
  if (argv.length) return argv.map((p) => path.resolve(p));
  const keluar = [path.join(AKAR, 'src', 'index.css')];
  const dir = path.join(AKAR, 'src', 'styles');
  for (const n of fs.readdirSync(dir).sort()) {
    if (n.endsWith('.css')) keluar.push(path.join(dir, n));
  }
  return keluar;
}

/** Kembalikan daftar pelanggaran untuk satu berkas. */
function periksa(berkas) {
  const css = fs.readFileSync(berkas, 'utf8');
  const akar = postcss.parse(css, { from: berkas });
  const temuan = [];
  const selectorAda = new Set();

  akar.walkRules((rule) => {
    // Lewati aturan di dalam @keyframes (selectornya 'from'/'to'/'0%').
    let induk = rule.parent;
    let diKeyframes = false;
    while (induk) {
      if (induk.type === 'atrule' && /keyframes$/i.test(induk.name)) diKeyframes = true;
      induk = induk.parent;
    }
    if (diKeyframes) return;

    const bagian = rule.selectors;
    for (const sel of bagian) {
      selectorAda.add(sel.trim());

      // (1) kelas sederhana yang sama diulang >=3x: .btn.btn.btn
      // Catatan: grup 1 SUDAH memuat titiknya, jadi pengulangannya `(?:\1)+`
      // (menulis `\.\1` justru menuntut dua titik dan tak pernah cocok).
      let kelasBerulang = null;
      for (const m of sel.matchAll(/(\.[A-Za-z_][\w-]*)((?:\1)+)/g)) {
        const jumlah = 1 + (m[2].match(/\./g) || []).length;
        if (jumlah >= 3) {
          kelasBerulang = m[1];
          temuan.push({
            baris: rule.source.start.line,
            jenis: 'KELAS-BERULANG-PALSU',
            pesan: `kelas '${m[1]}' diulang ${jumlah}x di '${sel.trim()}' — sisa penghapusan blok yang menempel ke aturan berikutnya`,
          });
        }
      }

      // (2) HANYA bila ada sisa berulang palsu: cek apakah aturan inti
      // ketarik jadi keturunan (mis. `.btn.btn.btn .modal-backdrop`) —
      // aturan inti seperti itu mati total. Aturan sah seperti
      // `.modal :is(button):focus-visible` TIDAK dilaporkan.
      if (kelasBerulang) {
        for (const inti of INTI) {
          if (new RegExp(`\\.${inti}(?![\\w-])`).test(sel.trim())) {
            temuan.push({
              baris: rule.source.start.line,
              jenis: 'INTI-DITEMPELLI',
              pesan: `'.${inti}' ketarik jadi keturunan '${kelasBerulang}' — aturan inti '.${inti}' MATI (hilang position/z-index-nya)`,
            });
          }
        }
      }
    }
  });

  return { temuan, selector: selectorAda };
}

const berkas = daftarBerkas(process.argv.slice(2));
let total = 0;
const semuaSelector = new Set();
const diperiksa = [];

for (const b of berkas) {
  const rel = path.relative(AKAR, b).replace(/\\/g, '/') || b;
  if (!fs.existsSync(b)) {
    console.log(`  ! LEWAT  ${rel} (berkas tidak ada)`);
    continue;
  }
  const { temuan, selector } = periksa(b);
  for (const s of selector) semuaSelector.add(s);
  total += temuan.length;
  diperiksa.push({ berkas: rel, temuan: temuan.length });
  if (!temuan.length) {
    console.log(`  ok  ${rel} (${selector.size} selector)`);
    continue;
  }
  for (const t of temuan) console.log(`  X  ${t.jenis} ${rel}:${t.baris} — ${t.pesan}`);
}

// (3) aturan inti wajib ada — GLOBAL, sekali untuk seluruh kumpulan berkas.
for (const w of WAJIB) {
  if (!semuaSelector.has(w)) {
    total += 1;
    console.log(`  X  INTI-HILANG (global) — aturan inti '${w}' tidak ada sebagai selector berdiri sendiri di berkas mana pun`);
  }
}

console.log('');
console.log(`berkas diperiksa : ${diperiksa.length}`);
console.log(`selector unik    : ${semuaSelector.size}`);
console.log(`temuan           : ${total}`);
console.log(total === 0 ? 'VERDICT: LULUS - tidak ada selector gantung' : 'VERDICT: GAGAL - ada selector gantung di atas');
process.exit(total === 0 ? 0 : 1);
