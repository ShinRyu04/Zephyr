// rapikan-kontras-tema.mjs — betulkan otomatis kontras token tema sampai gate a11y hijau.
//
// Kenapa ada: `scripts/a11y-kontras.mjs` mengukur rasio WCAG semua pasangan yang
// benar-benar muncul di UI. Nyatanya 13 dari 19 tema gagal AA pada token yang sama
// berulang (comment, gutter, border-strong, success/warning di tema terang) —
// memperbaikinya manual satu per satu resepnya lupa/typo. Skrip ini memakai PEMBACA
// dan DAFTAR PASANGAN YANG SAMA dengan gate (import dari a11y-kontras.mjs), jadi
// nilainya tak mungkin drift dari yang diukur gate.
//
// Dua hal yang bikin versi pertama gagal dan diperbaiki di sini:
//   1. Satu token bisa muncul di BEBERAPA pasangan (mis. --text-inverse di atas
//      --accent DAN --danger). Nilai penggantinya harus lulus SEMUA sekaligus —
//      kalau hanya lulus salah satu, iterasi berikutnya membetulkan yang lain dan
//      nilainya berayun selamanya (kejadian nyata: solarized-light bolak-balik
//      #ffffff <-> #1d1d1d).
//   2. Perubahan harus MONOTON: kalau jumlah gagal tidak turun, berhenti dan
//      laporkan, jangan menulis lagi.
//
// Arah penyesuaian dihitung, bukan ditebak: token yang lebih terang dari latarnya
// dicerahkan, yang lebih gelap digelapkan; hue dipertahankan (diskalakan ke arah
// hitam/putih) supaya palet tetap terasa tema aslinya.
//
// Lingkup bawaan: token permukaan KODE (--syn-*, --editor-gutter) karena itu isi
// yang dibaca user di editor. Token chrome (border, danger/warning/success di tema
// terang) sengaja tidak disentuh otomatis — itu pilihan estetika penulis palet.
// Pakai --semua kalau memang mau semuanya.
//
// Batas yang ketemu saat dipakai sungguhan: kadang satu token memang MUSTAHIL
// dinaikkan karena syaratnya saling bertabrakan. Contoh nyata: `--text-inverse`
// harus terang di atas `--danger` (#cd2f2c) TAPI `--accent` (#268bd2) terlalu terang
// untuk teks terang — tak ada satu warna pun yang lulus keduanya. Jalan keluarnya
// menyesuaikan sisi LATARNYA (accent digelapkan ke #1f71ab / #4e6b8f) dan itu keputusan
// rasa palet, jadi skrip sengaja berhenti & melapor MUSTAHIL, bukan mengubah accent
// sendiri. Hasil pemakaian pertama: 19 tema, 83 pasangan gagal -> 0.
//
// Pakai:
//   node scripts/rapikan-kontras-tema.mjs --kering        # laporkan saja
//   node scripts/rapikan-kontras-tema.mjs                 # lingkup kode
//   node scripts/rapikan-kontras-tema.mjs --semua         # semua pasangan
//   node scripts/rapikan-kontras-tema.mjs --maks 8        # batas iterasi
import fs from 'node:fs';
import path from 'node:path';
import { bacaTema, auditTema, keRgb, rasio } from './a11y-kontras.mjs';

const AKAR = path.resolve(import.meta.dirname, '..');
const BERKAS = [
  'src/styles/theme.css',
  'src/styles/theme-light.css',
  'src/styles/themes-extra.css',
  'src/styles/a11y.css',
  'src/styles/tokens.css',
];
const kering = process.argv.includes('--kering');
const semua = process.argv.includes('--semua');
const iMaks = process.argv.indexOf('--maks');
const MAKS = iMaks > 0 ? Number(process.argv[iMaks + 1]) : 6;

/** Lingkup bawaan: token permukaan kode. */
const dalamLingkup = (token) => semua || /^--syn-/.test(token) || token === '--editor-gutter';

const keHex = (rgb) =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const alphaDari = (v) => {
  const m = /^rgba?\(([^)]+)\)$/i.exec(String(v).trim());
  if (!m) return 1;
  const b = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  return b.length >= 4 && Number.isFinite(b[3]) ? b[3] : 1;
};

const kompositDi = (fg, alpha, bg) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

/** Nilai yang terlihat user: warna di atas latarnya (alpha dikomposit, sama seperti gate). */
function terlihatDi(rgb, alpha, bg) {
  return alpha < 1 ? kompositDi(rgb, alpha, bg) : rgb;
}

/** Semua kendala (latar + ambang) terpenuhi? */
function lulusSemua(rgb, alpha, kendala) {
  return kendala.every(({ bg, ambang }) => rasio(terlihatDi(rgb, alpha, bg), bg) >= ambang);
}

/**
 * Cari nilai pengganti yang lulus SEMUA kendala sekaligus, dengan perubahan
 * sesedikit mungkin. Menempuh dua arah (ke putih / ke hitam) lalu mengambil yang
 * paling dekat dengan nilai asal. null = sudah lulus atau memang mustahil.
 */
function cukupkanSemua(nilai, kendala) {
  const rgb = keRgb(nilai);
  if (!rgb) return null;
  const alpha = alphaDari(nilai);
  // Epsilon: gate membandingkan `rasio >= ambang`, jadi nilai yang pas di ambang
  // (mis. 4.4999 yang dibulatkan jadi 4.50) masih dihitung gagal. Minta sedikit di atas.
  const kendalaEps = kendala.map((k) => ({ ...k, ambang: k.ambang + 0.01 }));
  if (lulusSemua(rgb, alpha, kendalaEps)) return null;

  // Kandidat diuji dalam bentuk NILAI YANG AKAN DITULIS (integer/rgba), bukan float:
  // kalau diuji sebagai float lalu dibulatkan, pembulatan bisa menjatuhkan rasio balik
  // di bawah ambang — dan skrip melaporkan "berhasil" padahal berkasnya masih gagal
  // (kejadian nyata di nord-light: kandidat 4.5037 dibulatkan jadi nilai lama 4.4972).
  // Pencariannya CAMPUR ke arah putih/hitam, bukan perkalian skala: warna jenuh
  // (mis. #e82424) tidak bisa dicerahkan dengan perkalian — komponen R sudah 232/255,
  // jadi menaikkan skala hanya menabrak batas 255 dan luminansinya mentok di bawah
  // ambang, padahal campur ke putih masih bisa (kejadian nyata di kanagawa).
  const samaDenganAsal = (c) => keHex(c).toLowerCase() === String(nilai).trim().toLowerCase();
  const kandidat = [];
  for (const arah of [1, -1]) {
    const ujung = arah === 1 ? [255, 255, 255] : [0, 0, 0];
    for (let step = 1; step <= 400; step++) {
      const p = step / 400;
      const coba = rgb.map((v, i) => Math.round(v * (1 - p) + ujung[i] * p));
      if (!samaDenganAsal(coba) && lulusSemua(coba, alpha, kendalaEps)) {
        kandidat.push({ langkah: step, coba });
        break;
      }
    }
  }
  if (kandidat.length === 0) return null;
  kandidat.sort((a, b) => a.langkah - b.langkah);
  const coba = kandidat[0].coba;
  return alpha < 1 ? `rgba(${coba.join(', ')}, ${alpha})` : keHex(coba);
}

function bacaBerkas() {
  return BERKAS.map((rel) => ({ rel, teks: fs.readFileSync(path.join(AKAR, rel), 'utf8') }));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function spanTema(teks, tema) {
  const re = new RegExp(`\\[data-theme='${esc(tema)}'\\][^{}]*\\{([^{}]*)\\}`, 'g');
  const m = re.exec(teks);
  return m ? { isiMulai: m.index + m[0].indexOf('{') + 1, isiAkhir: m.index + m[0].lastIndexOf('}') } : null;
}

/**
 * Ganti nilai token di blok tema.
 *
 * Harus menulis ke blok TERAKHIR yang cocok, bukan yang pertama: `bacaTema()`
 * menggabungkan blok dengan "yang terakhir menang" (mis. tema `senja` punya blok di
 * theme.css DAN tokens.css; yang berlaku tokens.css). Menulis ke blok pertama dulu
 * → nilai di berkas berubah tapi yang terbaca tetap lama, hasilnya gate tetap merah
 * walau skrip melaporkan "sudah diperbaiki" (kejadian nyata).
 */
function setToken(berkas, tema, token, nilai) {
  const nl = berkas.some((b) => b.teks.includes('\r\n')) ? '\r\n' : '\n';
  const kandidat = [];
  for (const b of berkas) {
    const re = new RegExp(`\\[data-theme='${esc(tema)}'\\][^{}]*\\{([^{}]*)\\}`, 'g');
    let m;
    while ((m = re.exec(b.teks))) {
      kandidat.push({ b, isiMulai: m.index + m[0].indexOf('{') + 1, isiAkhir: m.index + m[0].lastIndexOf('}') });
    }
  }
  if (kandidat.length === 0) return null;
  const target = kandidat[kandidat.length - 1]; // urutan BERKAS = urutan baca, terakhir menang
  const { b } = target;
  const isi = b.teks.slice(target.isiMulai, target.isiAkhir);
  const rt = new RegExp(`(^|\\n)([ \\t]*)${esc(token)}\\s*:\\s*[^;]+;`, 'm');
  const m = rt.exec(isi);
  if (m) {
    const barisBaru = `${m[1]}${m[2]}${token}: ${nilai};`;
    b.teks = b.teks.slice(0, target.isiMulai + m.index) + barisBaru + b.teks.slice(target.isiMulai + m.index + m[0].length);
    return b.rel;
  }
  const baris = isi.trimEnd().split(/\r?\n/);
  const indent = (baris[baris.length - 1].match(/^[ \t]*/) ?? [''])[0];
  b.teks = b.teks.slice(0, target.isiAkhir) + `${indent}${token}: ${nilai};${nl}` + b.teks.slice(target.isiAkhir);
  return b.rel;
}

function hitungGagal() {
  const tema = bacaTema();
  const gagal = [];
  for (const [nama, token] of tema) {
    for (const h of auditTema(token)) if (!h.lolos) gagal.push({ tema: nama, ...h, token });
  }
  return { tema, gagal };
}

let sebelumnya = Infinity;
let total = 0;
for (let iter = 1; iter <= MAKS; iter++) {
  const { tema, gagal } = hitungGagal();
  const lingkup = gagal.filter((g) => dalamLingkup(g.fg));
  console.log(
    `iterasi ${iter}: gagal=${gagal.length} (dalam lingkup=${lingkup.length})` +
      (lingkup.length ? ` -> ${lingkup.map((g) => `${g.tema}/${g.fg}`).join(', ')}` : ''),
  );
  if (lingkup.length === 0) {
    if (gagal.length) {
      console.log(`sisa di luar lingkup (${gagal.length}) — pakai --semua kalau mau ikut dirapikan:`);
      for (const g of gagal) console.log(`   ${g.tema} ${g.nama} ${g.nilai.toFixed(2)} (min ${g.ambang})`);
    }
    break;
  }
  if (gagal.length >= sebelumnya) {
    console.log('jumlah gagal tidak turun — berhenti supaya tidak berayun');
    break;
  }
  sebelumnya = gagal.length;

  // Gabungkan kendala per (tema, token): satu nilai harus lulus semuanya.
  const butuh = new Map();
  for (const g of lingkup) {
    const kunci = `${g.tema}\u0000${g.fg}`;
    const cur = butuh.get(kunci) ?? { tema: g.tema, token: g.fg, kendala: [] };
    const bg = keRgb(tema.get(g.tema).get(g.bg), tema.get(g.tema));
    if (bg) cur.kendala.push({ bg, ambang: g.ambang });
    butuh.set(kunci, cur);
  }

  const berkas = bacaBerkas();
  let n = 0;
  for (const { tema: nama, token, kendala } of butuh.values()) {
    const lama = tema.get(nama).get(token);
    const baru = cukupkanSemua(lama, kendala);
    if (!baru || baru === lama) {
      console.log(`   ${nama} ${token}: MUSTAHIL dinaikkan ke ${kendala.map((k) => k.ambang).join('/')} (${lama})`);
      continue;
    }
    const rel = setToken(berkas, nama, token, baru);
    if (rel) {
      n++;
      console.log(`   ${nama} ${token}: ${lama} -> ${baru}  (${rel})`);
    }
  }
  total += n;
  if (kering) {
    console.log('   (mode kering: tidak menulis)');
    break;
  }
  if (n === 0) {
    console.log('tidak ada token yang bisa disesuaikan lagi');
    break;
  }
  for (const b of berkas) fs.writeFileSync(path.join(AKAR, b.rel), b.teks);
}
console.log(kering ? 'mode kering: berkas tidak diubah' : `selesai: ${total} nilai token disesuaikan`);
