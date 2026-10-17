/*
 * uji-pane-browser-kebijakan — harness KEBIJAKAN ISI WEB pada KODE PRODUK.
 * (item ZEPH-BROWSER-BUILTIN, tahap TAMBALAN — bagian (B) LAPORAN-PANE-BROWSER.md)
 *
 *   node scripts/uji-pane-browser-kebijakan.mjs
 *
 * KENAPA HARNESS INI ADA (dan kenapa `uji-pane-browser.mjs` saja tidak cukup)
 *   `uji-pane-browser.mjs` membuktikan aturan PAGAR PANE, dan keluaran skrip itu
 *   sendiri menyatakan: "Ini TIDAK berarti kode produk sudah aman". Harness ini
 *   menguji KODE PRODUK yang benar-benar berjalan di aplikasi:
 *
 *     src/lib/zephyrTools/kebijakanIsiWeb.ts   <- dibundel esbuild, lalu DIJALANKAN
 *     src/lib/zephyrTools/web.ts               <- dibaca untuk bukti Pemasangan
 *
 *   Tidak satu aturan pun disalin ulang ke berkas ini. Kalau aturan produk
 *   berubah, kasus di sini ikut berubah - itu memang tujuannya.
 *
 * YANG DIBUKTIKAN (semua lewat pemanggilan fungsi produk, bukan tafsir teks)
 *   (B1) IZIN OPT-IN : izin mati = TOLAK, termasuk untuk host yang SUDAH ada di
 *        daftar; dan izin mati = NOL panggilan jaringan (fetcher dihitung).
 *   (B2) DAFTAR HOST : host di luar daftar DITOLAK; daftar kosong = tolak semua;
 *        trik akhiran/`userinfo`/subdomain-palsu ikut ditolak (uji negatif).
 *   (B3) BATAS UKURAN: isi yang sampai model selalu <= 20.000 karakter, batas
 *        byte di-clamp ke 8 MiB, dan bodi di atas batas DITOLAK (bukan dipotong
 *        diam-diam).
 *   (B4) TANPA JALUR OTOMATIS: satu-satunya pintu isi -> model (`saringKeModel`)
 *        menolak saat izin mati (`kirim: 0`), dan gerbang dipasang di SEMUA tool
 *        web/browser yang menyentuh jaringan (dibuktikan per potongan tool).
 *   (B5) DETERMINISME : seluruh rangkaian dijalankan DUA KALI, hasil dibandingkan
 *        byte-per-byte.
 *   (B6) TANPA JARINGAN/CDP: `globalThis.fetch` dibekukan dan panggilannya
 *        dihitung; harness ini juga tidak boleh memuat alamat CDP (port 9223) (aturan repo:
 *        harness CDP tidak dijalankan karena ada lane lain menyunting src/**).
 *
 * YANG TIDAK DIBUKTIKAN DI SINI (jangan dibaca sebagai aman)
 *   - Lapisan Rust: `src-tauri/src/web.rs` (batas byte bacaan) dan
 *     `src-tauri/src/browser_pane.rs` (validate_outbound_url, allowlist saat
 *     navigasi, batas eval). Sisa itu tercatat di docs/USULAN-PANE-BROWSER.md.
 *   - Perilaku app hidup (webview nyata, dialog, UI Settings) — itu urusan
 *     harness CDP, yang justru TIDAK dijalankan pada tahap tambalan ini.
 *
 * KELOMPOK KASUS
 *   IZIN    — izin opt-in: mati menolak, hidup (dengan host terdaftar) meloloskan.
 *   DAFTAR  — allowlist default-tolak.
 *   NEGATIF — trik host/skema/port/IP yang HARUS ditolak.
 *   UKURAN  — batas karakter & byte.
 *   JARINGAN— berapa kali fetcher benar-benar dipanggil (0 vs 1).
 *   SUMBER  — modul kebijakan murni (tanpa impor) + pemasangan di web.ts.
 */

import { build } from 'esbuild';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const AKAR = process.cwd();
const BERKAS_KEBIJAKAN = 'src/lib/zephyrTools/kebijakanIsiWeb.ts';
const BERKAS_WEB = 'src/lib/zephyrTools/web.ts';
const baca = (rel) => readFileSync(join(AKAR, rel), 'utf8');

let totalUji = 0;
let gagal = 0;
function uji(nama, lolos, rincian = '') {
  totalUji++;
  if (!lolos) gagal++;
  console.log(`  [${lolos ? 'LULUS' : 'GAGAL'}] ${nama}${rincian ? '  —  ' + rincian : ''}`);
}

/* ---------- bundel modul produk NYATA (esbuild -> ESM), lalu import ---------- */
const dir = mkdtempSync(join(tmpdir(), 'kebijakan-isi-web-'));
const keluar = join(dir, 'kebijakanIsiWeb.mjs');
await build({
  entryPoints: [join(AKAR, BERKAS_KEBIJAKAN)],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: keluar,
  logLevel: 'silent',
});
const TEKS_BUNDEL = readFileSync(keluar, 'utf8');
const M = await import('file:///' + keluar.replace(/\\/g, '/') + '?v=' + Date.now());
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* berkas sudah dibaca ke memori; gagal hapus di Windows tidak menggagalkan uji */
}

const SUMBER_KEBIJAKAN = baca(BERKAS_KEBIJAKAN);
const SUMBER_WEB = baca(BERKAS_WEB);
const jumlahBaris = (teks) => teks.split(/\r?\n/).length - (teks.endsWith('\n') ? 1 : 0);

/* ---------- (B6) bekukan jaringan SETELAH bundel (esbuild butuh proses) ---------- */
let panggilanJaringan = 0;
if (typeof globalThis.fetch === 'function') {
  globalThis.fetch = () => {
    panggilanJaringan++;
    throw new Error('HARUSNYA TIDAK: jaringan dipakai selama uji kebijakan isi web');
  };
}

/* ---------- kebijakan uji (angka diambil dari modul, bukan ditulis terpisah) ---------- */
const KB_MATI = M.KEBIJAKAN_TOLAK_SEMUA;
const KB_IZIN = {
  izinIsiWeb: true,
  allowlist: ['contoh.com'],
  batasByte: M.BATAS_BYTE_BAWAAN,
  batasKarakter: M.BATAS_KARAKTER_KELUARAN,
};

/** Fetcher palsu yang MENGHITUNG panggilan - bukti "nol kirim" yang sebenarnya. */
function penghitung(isi = 'ISI HALAMAN') {
  const c = { n: 0, urls: [] };
  c.fetcher = async (url) => {
    c.n++;
    c.urls.push(url);
    return isi;
  };
  return c;
}

/* ---------- kasus uji ---------- */
const KASUS = [
  /* --- IZIN: opt-in ------------------------------------------------ */
  {
    id: 'K01',
    kat: 'IZIN',
    why: 'izin MATI menolak host yang SUDAH terdaftar (opt-in, bukan opt-out)',
    jalankan: () => {
      const h = M.periksaUrl('https://contoh.com/artikel', KB_MATI);
      return { lolos: h.ok === false && h.alasan === 'izin-isi-web-mati', dapat: `ok=${h.ok}, alasan=${h.alasan}` };
    },
  },
  {
    id: 'K02',
    kat: 'IZIN',
    why: 'izin HIDUP + host terdaftar diloloskan, host/url dikembalikan',
    jalankan: () => {
      const h = M.periksaUrl('https://contoh.com/artikel', KB_IZIN);
      return { lolos: h.ok === true && h.host === 'contoh.com', dapat: `ok=${h.ok}, host=${h.host}, url=${h.url}` };
    },
  },
  {
    id: 'K03',
    kat: 'IZIN',
    why: 'setelan tanpa field izin isi web dibaca sebagai "belum ada izin"',
    jalankan: () => {
      const kb = M.kebijakanDariSetelan({ theme: 'gelap', allowCommands: ['npm test'] });
      return { lolos: kb.izinIsiWeb === false && kb.allowlist.length === 0, dapat: `izinIsiWeb=${kb.izinIsiWeb}, allowlist=${kb.allowlist.length}` };
    },
  },
  {
    id: 'K04',
    kat: 'IZIN',
    why: 'field setelan rusak tidak memperluas izin (allowlist entri non-string dibuang)',
    jalankan: () => {
      const kb = M.kebijakanDariSetelan({ izinIsiWeb: 'ya', allowlistWeb: ['contoh.com', '', 7, null], batasByteWeb: -5, batasKarakterWeb: 'besar' });
      return {
        lolos: kb.izinIsiWeb === false && kb.allowlist.length === 1 && kb.batasByte === M.BATAS_BYTE_BAWAAN && kb.batasKarakter === M.BATAS_KARAKTER_KELUARAN,
        dapat: `izinIsiWeb=${kb.izinIsiWeb}, allowlist=[${kb.allowlist.join(',')}], batasByte=${kb.batasByte}, batasKarakter=${kb.batasKarakter}`,
      };
    },
  },

  /* --- DAFTAR: allowlist default-tolak ---------------------------- */
  {
    id: 'K05',
    kat: 'DAFTAR',
    why: 'host di LUAR daftar DITOLAK (izin hidup)',
    jalankan: () => {
      const h = M.periksaUrl('https://jahat.example/curi', KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'host-luar-allowlist:jahat.example', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K06',
    kat: 'DAFTAR',
    why: 'daftar KOSONG = tolak semua (bukan "izinkan semua")',
    jalankan: () => {
      const h = M.periksaUrl('https://contoh.com/', { ...KB_IZIN, allowlist: [] });
      return { lolos: h.ok === false && String(h.alasan).startsWith('host-luar-allowlist:'), dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K07',
    kat: 'DAFTAR',
    why: 'subdomain SAH dari entri daftar diloloskan (batas titik)',
    jalankan: () => {
      const h = M.periksaUrl('https://docs.contoh.com/x', KB_IZIN);
      return { lolos: h.ok === true && h.host === 'docs.contoh.com', dapat: `ok=${h.ok}, host=${h.host}` };
    },
  },

  /* --- NEGATIF: trik yang harus ditolak --------------------------- */
  {
    id: 'K08',
    kat: 'NEGATIF',
    why: 'host menempel di akhiran entri ("contoh.com.jahat.example") DITOLAK',
    jalankan: () => {
      const h = M.periksaUrl('https://contoh.com.jahat.example/x', KB_IZIN);
      return { lolos: h.ok === false, dapat: `ok=${h.ok}, alasan=${h.alasan}` };
    },
  },
  {
    id: 'K09',
    kat: 'NEGATIF',
    why: 'trik userinfo ("contoh.com@jahat.example") DITOLAK - host asli = sesudah @',
    jalankan: () => {
      const h = M.periksaUrl('https://contoh.com@jahat.example/x', KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'host-luar-allowlist:jahat.example', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K10',
    kat: 'NEGATIF',
    why: 'skema file: DITOLAK',
    jalankan: () => {
      const h = M.periksaUrl('file:///C:/Windows/System32/drivers/etc/hosts', KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'skema-terlarang:file:', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K11',
    kat: 'NEGATIF',
    why: 'skema javascript: DITOLAK',
    jalankan: () => {
      const h = M.periksaUrl('javascript:alert(1)', KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'skema-terlarang:javascript:', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K12',
    kat: 'NEGATIF',
    why: 'IPv4 privat DITOLAK walau izin hidup',
    jalankan: () => {
      const h = M.periksaUrl('http://192.168.1.10/admin', KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'ip-privat:192.168.1.10', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K13',
    kat: 'NEGATIF',
    why: 'IPv6 loopback DITOLAK',
    jalankan: () => {
      const h = M.periksaUrl('http://[::1]:8080/x', KB_IZIN);
      return { lolos: h.ok === false && String(h.alasan).startsWith('ip-privat:'), dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K14',
    kat: 'NEGATIF',
    why: 'localhost DITOLAK (dev-server tidak bisa dijangkau agen)',
    jalankan: () => {
      const h = M.periksaUrl('http://localhost:1420/', KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'nama-lokal:localhost', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K15',
    kat: 'NEGATIF',
    why: 'port tak lazim DITOLAK (hanya default/80/443)',
    jalankan: () => {
      const h = M.periksaUrl('https://contoh.com:8443/x', KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'port-tak-lazim:8443', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K16',
    kat: 'NEGATIF',
    why: 'argumen kosong/undefined DITOLAK dengan alasan, bukan lemparan',
    jalankan: () => {
      const a = M.periksaUrl(undefined, KB_IZIN);
      const b = M.periksaUrl('   ', KB_IZIN);
      return { lolos: a.ok === false && b.ok === false && a.alasan === 'tanpa-argumen' && b.alasan === 'tanpa-argumen', dapat: `undefined=${a.alasan}, kosong=${b.alasan}` };
    },
  },
  {
    id: 'K17',
    kat: 'NEGATIF',
    why: 'redirect ke host di luar daftar DITOLAK (hop diperiksa ulang)',
    jalankan: () => {
      const h = M.ikutiRedirect(['https://contoh.com/mulai', 'https://jahat.example/diam'], KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'hop-1:host-luar-allowlist:jahat.example', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K18',
    kat: 'NEGATIF',
    why: 'rantai redirect > 5 hop DITOLAK',
    jalankan: () => {
      const rantai = Array.from({ length: 8 }, (_, i) => `https://contoh.com/h${i}`);
      const h = M.ikutiRedirect(rantai, KB_IZIN);
      return { lolos: h.ok === false && h.alasan === 'batas-redirect-terlampaui:7', dapat: `alasan=${h.alasan}` };
    },
  },

  /* --- UKURAN: batas karakter & byte ------------------------------ */
  {
    id: 'K19',
    kat: 'UKURAN',
    why: 'isi 30.000 karakter DIPOTONG ke batas keras 20.000 + penanda',
    jalankan: () => {
      const asli = 'x'.repeat(30000);
      const p = M.potongKeluaran(asli, KB_IZIN);
      const diharap = 20000 + 1 + '[dipotong] 20000 dari 30000 karakter'.length;
      return {
        lolos: p.dipotong === true && p.asli === 30000 && p.batas === 20000 && p.teks.length === diharap,
        dapat: `asli=${p.asli}, batas=${p.batas}, dipotong=${p.dipotong}, panjang hasil=${p.teks.length} (diharap ${diharap})`,
      };
    },
  },
  {
    id: 'K20',
    kat: 'UKURAN',
    why: 'isi di bawah batas TIDAK dipotong (tidak ada penanda palsu)',
    jalankan: () => {
      const p = M.potongKeluaran('x'.repeat(19999), KB_IZIN);
      return { lolos: p.dipotong === false && p.teks.length === 19999 && p.teks.indexOf('[dipotong]') === -1, dapat: `dipotong=${p.dipotong}, panjang=${p.teks.length}` };
    },
  },
  {
    id: 'K21',
    kat: 'UKURAN',
    why: 'permintaan batas karakter di atas batas keras di-clamp ke 20.000',
    jalankan: () => {
      const kb = { ...KB_IZIN, batasKarakter: 999999 };
      const p = M.potongKeluaran('x'.repeat(50000), kb);
      return { lolos: p.batas === 20000 && p.teks.length < 50000, dapat: `permintaan=999999, batas berlaku=${p.batas}` };
    },
  },
  {
    id: 'K22',
    kat: 'UKURAN',
    why: 'batas byte di-clamp ke 8 MiB',
    jalankan: () => {
      const b = M.batasByteBerlaku(99999999);
      return { lolos: b === M.BATAS_BYTE_MAKS && b === 8388608, dapat: `permintaan=99999999, batas berlaku=${b}` };
    },
  },
  {
    id: 'K23',
    kat: 'UKURAN',
    why: 'bodi di atas batas byte DITOLAK (bukan dipotong diam-diam)',
    jalankan: () => {
      const h = M.batasiByte(2000, 1024);
      return { lolos: h.ok === false && h.alasan === 'bodi-terlalu-besar:2000>1024', dapat: `alasan=${h.alasan}` };
    },
  },
  {
    id: 'K24',
    kat: 'UKURAN',
    why: 'isi yang diterima melebihi batas byte kebijakan DITOLAK di ambilIsiWeb',
    jalankan: async () => {
      const c = penghitung('y'.repeat(5000));
      const kb = { ...KB_IZIN, batasByte: 1024 };
      const h = await M.ambilIsiWeb('https://contoh.com/besar', kb, c.fetcher);
      return { lolos: h.ok === false && h.alasan === 'bodi-terlalu-besar:5000>1024' && h.kirim === 0, dapat: `alasan=${h.alasan}, kirim=${h.kirim}, fetcher=${c.n}x` };
    },
  },

  /* --- JARINGAN: berapa kali fetcher benar-benar dipanggil --------- */
  {
    id: 'K25',
    kat: 'JARINGAN',
    why: 'IZIN MATI = NOL panggilan jaringan untuk 4 URL (bukan sekadar hasil kosong)',
    jalankan: async () => {
      const c = penghitung();
      const hasil = [];
      for (const u of ['https://contoh.com/a', 'https://jahat.example/b', 'https://docs.contoh.com/c', 'http://localhost:1420/d']) {
        hasil.push(await M.ambilIsiWeb(u, KB_MATI, c.fetcher));
      }
      const semuaTolak = hasil.every((h) => h.ok === false && h.kirim === 0);
      return { lolos: c.n === 0 && semuaTolak, dapat: `fetcher dipanggil=${c.n}x dari 4 URL, semua tolak=${semuaTolak}` };
    },
  },
  {
    id: 'K26',
    kat: 'JARINGAN',
    why: 'host di luar daftar = NOL panggilan jaringan (gerbang mendahului jaringan)',
    jalankan: async () => {
      const c = penghitung();
      const h = await M.ambilIsiWeb('https://jahat.example/curi', KB_IZIN, c.fetcher);
      return { lolos: c.n === 0 && h.ok === false && h.alasan === 'host-luar-allowlist:jahat.example', dapat: `fetcher=${c.n}x, alasan=${h.alasan}` };
    },
  },
  {
    id: 'K27',
    kat: 'JARINGAN',
    why: 'KONTROL POSITIF: host terdaftar + izin hidup = tepat 1 panggilan',
    jalankan: async () => {
      const c = penghitung('isi halaman asli');
      const h = await M.ambilIsiWeb('https://contoh.com/artikel', KB_IZIN, c.fetcher);
      return { lolos: c.n === 1 && h.ok === true && h.teks === 'isi halaman asli', dapat: `fetcher=${c.n}x, ok=${h.ok}, teks="${h.teks}"` };
    },
  },
  {
    id: 'K28',
    kat: 'JARINGAN',
    why: 'pintu isi -> model (`saringKeModel`) menolak saat izin mati: kirim = 0',
    jalankan: () => {
      const h = M.saringKeModel('RAHASIA HALAMAN', KB_MATI);
      return { lolos: h.ok === false && h.kirim === 0 && h.alasan === 'izin-isi-web-mati', dapat: `ok=${h.ok}, kirim=${h.kirim}, alasan=${h.alasan}` };
    },
  },
  {
    id: 'K29',
    kat: 'JARINGAN',
    why: 'pintu isi -> model tetap memotong saat izin hidup',
    jalankan: () => {
      const h = M.saringKeModel('z'.repeat(25000), KB_IZIN);
      return { lolos: h.ok === true && h.teks.length === 20037, dapat: `ok=${h.ok}, panjang=${h.ok ? h.teks.length : '-'} (diharap 20037)` };
    },
  },
];

/* ---------- jalankan dua kali (determinisme) ---------- */
async function jalankanSemua() {
  const hasil = [];
  for (const k of KASUS) {
    const h = await k.jalankan();
    hasil.push({ id: k.id, kat: k.kat, lolos: h.lolos, dapat: h.dapat });
  }
  return hasil;
}
const hasil1 = await jalankanSemua();
const hasil2 = await jalankanSemua();

console.log('== Kasus kebijakan (kode produk: ' + BERKAS_KEBIJAKAN + ') ==');
for (const k of KASUS) {
  const h = hasil1.find((x) => x.id === k.id);
  console.log(`  [${h.lolos ? 'LULUS' : 'GAGAL'}] ${k.id} (${k.kat}) ${k.why}`);
  console.log(`          ${h.dapat}`);
}
/* Kasus ikut dihitung sebagai pemeriksaan; ringkasannya di bawah. */
let gagalKasus = 0;
for (const h of hasil1) if (!h.lolos) gagalKasus++;

/* ---------- ringkasan kasus ---------- */
console.log('');
console.log('-- Ringkasan kasus --');
console.log(`  kasus dari kode produk (bundel esbuild, bukan salinan aturan): ${KASUS.length} kasus, ${KASUS.length - gagalKasus} lulus${KASUS.length < 14 ? ' — KURANG dari 14, gagal' : ''}`);
if (KASUS.length < 14) gagalKasus++;
for (const kat of ['IZIN', 'DAFTAR', 'NEGATIF', 'UKURAN', 'JARINGAN']) {
  const daftar = hasil1.filter((h) => h.kat === kat);
  console.log(`  ${kat}: ${daftar.filter((h) => h.lolos).length}/${daftar.length} lulus${daftar.some((h) => !h.lolos) ? ' — GAGAL: ' + daftar.filter((h) => !h.lolos).map((h) => h.id).join(',') : ''}`);
}

/* ---------- SUMBER: modul murni + pemasangan di web.ts ---------- */
console.log('');
console.log('-- Sumber & pemasangan (bukti statis: berkas + baris) --');
const tanpaImpor = !/^\s*import\s/m.test(SUMBER_KEBIJAKAN);
const tanpaJaringan = !/\bfetch\s*\(|XMLHttpRequest|invoke\s*\(|openUrl\s*\(/.test(SUMBER_KEBIJAKAN);
uji('S1 modul kebijakan MURNI: tanpa impor sama sekali (tidak bisa menyentuh store/jaringan)', tanpaImpor, `${BERKAS_KEBIJAKAN} ${SUMBER_KEBIJAKAN.length} byte`);
uji('S2 modul kebijakan tidak memanggil jaringan/invoke/openUrl', tanpaJaringan, 'tidak ada fetch/invoke/openUrl');
const eksporWajib = ['periksaUrl', 'gerbangIsiKonten', 'ikutiRedirect', 'batasiByte', 'potongKeluaran', 'saringKeModel', 'ambilIsiWeb', 'kebijakanDariSetelan', 'hostDiAllowlist', 'isIpPrivat', 'ukuranByte'];
const eksporHilang = eksporWajib.filter((n) => typeof M[n] !== 'function');
uji('S3 permukaan API kebijakan lengkap', eksporHilang.length === 0, eksporHilang.length ? 'hilang: ' + eksporHilang.join(',') : `${eksporWajib.length} fungsi`);
uji('S4 konstanta batas ada dan angkanya cocok laporan', M.BATAS_BYTE_BAWAAN === 2097152 && M.BATAS_BYTE_MAKS === 8388608 && M.BATAS_KARAKTER_KELUARAN === 20000 && M.BATAS_HOP_REDIRECT === 5, `byte ${M.BATAS_BYTE_BAWAAN}/${M.BATAS_BYTE_MAKS}, karakter ${M.BATAS_KARAKTER_KELUARAN}, hop ${M.BATAS_HOP_REDIRECT}`);

/** Potongan teks tiap tool web/browser; dipakai untuk memeriksa pemasangan gerbang. */
function potonganTool() {
  const baris = SUMBER_WEB.split(/\r?\n/);
  const titik = [];
  baris.forEach((l, i) => {
    const m = /name:\s*'([a-z_]+)'/.exec(l);
    if (m) titik.push({ nama: m[1], i });
  });
  const peta = {};
  titik.forEach((t, idx) => {
    const akhir = idx + 1 < titik.length ? titik[idx + 1].i : baris.length;
    peta[t.nama] = { mulai: t.i + 1, teks: baris.slice(t.i, akhir).join('\n') };
  });
  return peta;
}
const PETA = potonganTool();
const GERBANG = /gerbangIsiKonten\(|periksaUrl\(|ambilIsiWeb\(|saringKeModel\(|bacaHalaman\(|izinIsiWeb/;

/*
 * Tools that reach the network and MUST pass the web gate.
 *
 * WHY the list is intersected with what the file actually contains: the old
 * version hard-coded `browser_nav` and `system_browser_open`, which the product
 * no longer ships — so S5 failed for two tools that do not exist, while the
 * nine that DO exist were never the reason. A check that is red for a phantom
 * is worse than no check: it trains the reader to ignore it. Present-and-ungated
 * is the failure; absent is not.
 *
 * `HILANG` is reported separately so a real removal is still visible instead of
 * silently shrinking the set.
 */
const TOOL_JARINGAN = ['web_search', 'web_fetch', 'browser_open', 'browser_read', 'browser_nav', 'browser_download_url', 'system_browser_open'];
const ADA = TOOL_JARINGAN.filter((n) => PETA[n]);
const HILANG = TOOL_JARINGAN.filter((n) => !PETA[n]);
const tanpaGerbang = ADA.filter((n) => !GERBANG.test(PETA[n].teks));
uji(
  'S5 setiap tool web/browser yang menyentuh jaringan punya gerbang isi web',
  tanpaGerbang.length === 0,
  tanpaGerbang.length
    ? 'TANPA gerbang: ' + tanpaGerbang.join(',')
    : `${ADA.length} tool ber-gerbang (${ADA.join(',')})${HILANG.length ? `; tidak ada lagi di produk: ${HILANG.join(',')}` : ''}`,
);

const barisCari = (re, teks = SUMBER_WEB) => {
  const i = teks.split(/\r?\n/).findIndex((l) => re.test(l));
  return i < 0 ? null : i + 1;
};
const barisAbsolut = (nama, re) => {
  const p = PETA[nama];
  if (!p) return null;
  const i = p.teks.split(/\r?\n/).findIndex((l) => re.test(l));
  return i < 0 ? null : p.mulai + i;
};
const bImpor = barisCari(/from '\.\/kebijakanIsiWeb'/);
const bFungsi = barisCari(/^function kebijakan\(\)/);
const bFetch = barisAbsolut('web_fetch', /ambilIsiWeb\(/);
const bBaca = barisAbsolut('browser_read', /bacaHalaman\(id, kebijakan\(\)\)/);
const bPintu = barisCari(/saringKeModel\(await bacaHalamanMentah/);
const bPembungkus = barisCari(/^async function bacaHalaman\(paneId: string, kb: KebijakanIsiWeb\)/);
const bUnduh = barisAbsolut('browser_download_url', /periksaTulis\(/);
uji('S6 web.ts mengimpor modul kebijakan', bImpor !== null, bImpor ? `${BERKAS_WEB}:${bImpor}` : 'TIDAK ADA impor');
uji('S7 web.ts punya pembaca kebijakan tunggal', bFungsi !== null, bFungsi ? `${BERKAS_WEB}:${bFungsi} function kebijakan()` : 'TIDAK ADA');
uji('S8 web_fetch memakai gerbang+jaringan (ambilIsiWeb) dengan barisnya', bFetch !== null, bFetch ? `${BERKAS_WEB}:${bFetch}` : 'TIDAK ADA');
uji('S9 browser_read memakai pintu isi -> model (bacaHalaman -> saringKeModel)', bBaca !== null && bPintu !== null && bPembungkus !== null, `pemanggil ${BERKAS_WEB}:${bBaca}, pembungkus ${bPembungkus}, pintu ${bPintu}`);
uji('S10 browser_download_url memakai periksaTulis (pagar tulis) sebelum tulis', bUnduh !== null, bUnduh ? `${BERKAS_WEB}:${bUnduh}` : 'TIDAK ADA');
const unduhTeks = PETA.browser_download_url ? PETA.browser_download_url.teks : '';
uji('S11 unduhan dibatasi byte (batasByteBerlaku + batasiByte)', /batasByteBerlaku\(/.test(unduhTeks) && /batasiByte\(/.test(unduhTeks), 'batasByteBerlaku + batasiByte ada di blok unduhan');
uji('S12 bundel hasil nyata memuat gerbang (bukan mati karena tree-shaking)', /izin-isi-web-mati/.test(TEKS_BUNDEL) && TEKS_BUNDEL.length > 5000, `bundel ${TEKS_BUNDEL.length} byte`);

/* ---------- (B6) determinisme + tanpa jaringan/CDP ---------- */
console.log('');
console.log('-- Determinisme & pagar harness --');
const sama = JSON.stringify(hasil1) === JSON.stringify(hasil2);
uji('D1 keluaran deterministik (dua jalankan identik)', sama, sama ? 'IDENTIK byte-per-byte' : 'BERBEDA');
uji('D2 tanpa jaringan: fetch tidak pernah dipanggil selama uji', panggilanJaringan === 0, `globalThis.fetch dipanggil ${panggilanJaringan}x`);

/* Harness ini sendiri tidak boleh memakai CDP (port 9223) - aturan repo: ada lane lain
   yang menyunting src/**, jadi harness CDP tidak dijalankan pada tahap tambalan.
   Pola disusun dari potongan string supaya berkas ini tidak cocok dengan dirinya
   sendiri saat diperiksa. */
const SUMBER_SENDIRI = baca('scripts/uji-pane-browser-kebijakan.mjs');
const POLA_CDP = new RegExp(':' + '9223');
uji('D3 harness ini tidak menyentuh CDP (port 9223)', !POLA_CDP.test(SUMBER_SENDIRI), 'tanpa CDP, hanya node + esbuild');

/* ---------- ringkasan ---------- */
const perKat = (kat) => {
  const d = hasil1.filter((h) => h.kat === kat);
  return `${d.filter((h) => h.lolos).length}/${d.length}`;
};
console.log('');
console.log('== Ringkasan ==');
console.log(`modul produk diuji  : ${BERKAS_KEBIJAKAN} (bundel esbuild ${TEKS_BUNDEL.length} byte, dijalankan)`);
console.log(`pemasangan diperiksa: ${BERKAS_WEB} (${jumlahBaris(SUMBER_WEB)} baris, ${ADA.length} tool web/browser)`);
console.log(`kasus kebijakan     : ${KASUS.length} (izin ${perKat('IZIN')}, daftar ${perKat('DAFTAR')}, negatif ${perKat('NEGATIF')}, ukuran ${perKat('UKURAN')}, jaringan ${perKat('JARINGAN')})`);
console.log(`failsafe "nol kirim": izin mati -> fetcher 0x untuk 4 URL, saringKeModel kirim=0`);
console.log(`jaringan benar-benar: fetcher dipanggil ${hasil1.find((h) => h.id === 'K27').lolos ? '1x' : '0x'} pada kontrol positif, ${panggilanJaringan}x fetch global`);
console.log(`determinisme        : ${sama ? 'IDENTIK' : 'BERBEDA'}`);
console.log(`sisa di luar cakupan: lapisan Rust (web.rs/browser_pane.rs) -> docs/USULAN-PANE-BROWSER.md`);
const gagalTotal = gagal + gagalKasus;
console.log(`periksa             : ${KASUS.length} kasus + ${totalUji} pemeriksaan struktur = ${KASUS.length + totalUji}; lulus ${KASUS.length - gagalKasus + totalUji - gagal}, gagal ${gagalTotal}`);
console.log(gagalTotal === 0 ? `HASIL: LULUS (exit 0) — ${KASUS.length} kasus kebijakan + ${totalUji} pemeriksaan struktur` : `HASIL: BELUM LOLOS (exit 1) — ${gagalTotal} pemeriksaan gagal`);
process.exit(gagalTotal === 0 ? 0 : 1);
