/*
 * bacaKode - Zeph membaca ISI kode ZEPHYR SENDIRI sebagai POTONGAN BARIS.
 *
 * Item backlog `ZEPH-BACA-KODE-SENDIRI` (lanjutan `ai-tahu-100-8`).
 *
 * MASALAH YANG DIPECAHKAN. Peta kode (`zephyrIndeks.ts`, dibangun
 * `scripts/gen-fakta-zephyr.mjs`) sudah bisa MENUNJUK: tiap entri `kode`
 * menyebut berkas, jumlah baris, dan nama simbol ekspornya - contoh nyata,
 * `["kode","src/components/shell/ActivityBar.tsx","371 baris · tanpa ekspor"]`.
 * Yang belum ada: kemampuan MEMBACA ISI berkas itu. Pertanyaan "cara kerja X"
 * berhenti di tingkat daftar ("berkasnya ada, ekspornya bernama A, B, C"),
 * tidak sampai menjelaskan isinya - karena menunjuk lokasi bukan membaca.
 *
 * Modul ini menutup jarak itu: diberi jalur RELATIF dari akar repo Zephyr, ia
 * mengembalikan potongan baris yang benar-benar ada di disk, dengan nomor baris
 * nyata, sehingga jawaban bisa mengutip kode dan pembacanya bisa
 * memverifikasinya.
 *
 * ATURAN YANG DIPAKSA MODUL INI (semuanya diuji negatif di
 * `scripts/uji-baca-kode.mjs`):
 *
 *   1. HANYA DI DALAM REPO. Jalur `..`, jalur absolut (`/etc/hosts`,
 *      `C:/Windows/...`), jalur UNC (`\\\\server\\share\\...`), bentuk ter-encode
 *      (`%2e%2e`), dan BYTE KONTROL ditolak - bentuk MENTAHnya diperiksa
 *      sebelum normalisasi, karena `normalJalur()` membuang jejak itu. Selain
 *      itu jembatan wajib menyerahkan `realpath` kedua sisi (akar + berkas)
 *      dan hasilnya harus tetap di dalam akar: jalan pintas lewat
 *      symlink/junction ke luar repo DITOLAK, bukan diperingatkan. Realpath
 *      yang dipakai harus realpath SUNGGUHAN (bukan bentuk identitas yang
 *      mengembalikan masukan apa adanya): datangnya dari perintah Tauri
 *      `fs_realpath` di `src/lib/commands.ts` lewat seam
 *      `pasangRealpathBacaKode`, dan kalau tidak tersedia jalur tool MENOLAK
 *      membaca (fail-closed) - pagar dengan realpath identitas selalu lolos.
 *   2. HANYA BERKAS TEKS/KODE. Ekstensi di luar daftar putih ditolak, isi yang
 *      memuat byte NUL ditolak. Jadi `.png`/binary tidak pernah masuk jawaban.
 *   3. BERKAS RAHASIA DITOLAK. Pemeriksaannya BUKAN daftar baru: modul ini
 *      meminjam `alasanBlokirRahasia()` dari `konteksRepo.ts`, yang memakai
 *      daftar bersama `agentGuard.ts` (POLA_RAHASIA + DIR_TERPROTEKSI) plus
 *      tambahan `POLA_RAHASIA_TAMBAHAN`. Dua daftar yang berbeda akan berbeda
 *      pendapat pada suatu hari, dan berkas yang diblokir di satu jalur bisa
 *      lolos di jalur lain - itu sebabnya tidak ada salinan di sini.
 *      Penolakan terjadi SEBELUM jembatan disentuh sama sekali (jejak kosong).
 *   4. ADA BATAS. Angkanya diekspor, bukan disembunyikan di dalam fungsi:
 *      BATAS_BARIS_POTONGAN 120 baris/pembacaan, BATAS_BYTE_BERKAS 512 KiB,
 *      BATAS_KARAKTER_BARIS 400 karakter/baris, BATAS_CHAR_POTONGAN 6000
 *      karakter/pembacaan, BATAS_BERKAS_PER_PANGGILAN 1 berkas/panggilan,
 *      BATAS_BACAAN_SESI 12 pembacaan/sesi.
 *   5. NOL JARINGAN, NOL FOLDER USER. Modul ini tidak mengimpor apa pun selain
 *      `konteksRepo` (daftar blokir) dan tipe `AgentToolSpec`; tidak ada
 *      permintaan jaringan, tidak ada `@tauri-apps/api`, tidak ada akses
 *      berkas Node, tidak ada pembacaan folder rumah, tidak ada pembacaan
 *      variabel lingkungan. Pembacaannya lewat jembatan yang disuntikkan
 *      pemanggil (`PerintahBacaKode`), jadi di harness bisa diuji dengan
 *      pembaca palsu yang menghitung berapa kali disk disentuh.
 *   6. DETERMINISTIK. Keluaran tidak memuat waktu, tidak memuat jalur absolut,
 *      tidak memakai `toLocaleString` (pemisah ribuan diketik sendiri). Dua
 *      pemanggilan dengan masukan sama menghasilkan teks yang sama PERSIS,
 *      dan tiap baris bisa dilacak balik ke berkas + nomor baris nyata.
 *   7. HANYA BACA, TIDAK PERNAH MENULIS. `PerintahBacaKode` sengaja tidak punya
 *      satu pun kemampuan tulis (tidak ada `fsWrite`/`fsStat`+tulis/`invoke`),
 *      dan modul ini tidak memanggil apa pun selain `realpath`, `fsStat`,
 *      `fsRead`. Harness membuktikannya dengan Proxy yang mencatat SETIAP akses
 *      properti ke objek jembatan - kalau modul menyentuh nama lain, uji merah.
 *
 * YANG TIDAK DIKERJAKAN MODUL INI, DAN TIDAK BERPURA-PURA BISA:
 * menemukan akar repo Zephyr. Itu urusan pemanggil (lihat `pasangJembatanBacaKode`)
 * karena aplikasi yang sudah terpasang tidak punya salinan `src/` sama sekali;
 * usulan jujurnya ada di `docs/USULAN-BACA-KODE.md`.
 */

import { alasanBlokirRahasia, normalJalur } from './konteksRepo';
import type { AgentToolSpec } from './types';

/* ------------------------------------------------------------------ */
/* Batas (semuanya diekspor supaya bisa diuji dan dikutip)              */
/* ------------------------------------------------------------------ */

/** Versi kebijakan pembacaan - ikut tercetak di keluaran. */
export const BACA_KODE_VERSI = 1;
/** Baris maksimum satu pembacaan. */
export const BATAS_BARIS_POTONGAN = 120;
/** Baris sebelum simbol yang ikut dikirim saat pembacaan `simbol`. */
export const JENDELA_SEBELUM_SIMBOL = 6;
/** Baris sesudah simbol yang ikut dikirim saat pembacaan `simbol`. */
export const JENDELA_SESUDAH_SIMBOL = 40;
/** Ukuran berkas maksimum yang boleh dibaca (512 KiB). */
export const BATAS_BYTE_BERKAS = 512 * 1024;
/** Panjang maksimum satu baris yang dikirim; lebih dari ini dipangkas. */
export const BATAS_KARAKTER_BARIS = 400;
/** Anggaran karakter satu potongan (~1.500 token pada 4 karakter/token). */
export const BATAS_CHAR_POTONGAN = 6_000;
/** Berapa kali satu sesi boleh membaca berkas sebelum ditolak. */
export const BATAS_BACAAN_SESI = 12;
/** Berapa BERKAS per panggilan. Satu: potongan besar lebih berguna daripada
 *  banyak berkas setengah-setengah, dan `berkas` karena itu bertipe string. */
export const BATAS_BERKAS_PER_PANGGILAN = 1;
/** Perkiraan konservatif, dipinjam dari aturan `ai-tahu-100-7`. */
export const KARAKTER_PER_TOKEN = 4;

/* ------------------------------------------------------------------ */
/* Berkas mana yang boleh dibaca                                       */
/* ------------------------------------------------------------------ */

/**
 * Ekstensi yang boleh dibaca: kode + teks yang ikut repo. Daftar ini SENGAJA
 * pendek dan eksplisit. Berkas binary, arsip, dan berkas kunci tidak ada di
 * sini - dan karena pemeriksaannya "harus ada di daftar", apa pun yang belum
 * terpikirkan pun tertolak secara bawaan.
 */
export const EKSTENSI_TEKS: readonly string[] = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.rs',
  '.json',
  '.jsonc',
  '.toml',
  '.yml',
  '.yaml',
  '.ini',
  '.cfg',
  '.conf',
  '.md',
  '.txt',
  '.css',
  '.scss',
  '.html',
  '.sql',
  '.sh',
  '.py',
];

/** Berkas teks yang lazim TANPA ekstensi (ikut repo, bukan data user). */
export const NAMA_TEKS: readonly string[] = ['Dockerfile', 'Makefile', 'LICENSE', 'NOTICE'];

/** Apakah jalur ini berekstensi teks/kode yang boleh dibaca? */
export function berekstensiTeks(p: string): boolean {
  const jalur = normalJalur(p);
  const nama = jalur.slice(jalur.lastIndexOf('/') + 1);
  if (NAMA_TEKS.includes(nama)) return true;
  const titik = nama.lastIndexOf('.');
  if (titik <= 0) return false;
  return EKSTENSI_TEKS.includes(nama.slice(titik).toLowerCase());
}

export interface HasilJalur {
  ok: boolean;
  /** Jalur relatif yang sudah dinormalkan (garis miring `/`). */
  rel: string;
  /** Alasan penolakan dalam bahasa manusia; kosong kalau `ok`. */
  alasan: string;
}

/**
 * Boleh dibaca? Fungsi ini MURNI - tidak menyentuh disk sama sekali.
 *
 * Urutan pemeriksaan disengaja: jalur terlarang dan rahasia dulu (paling
 * berbahaya), baru ekstensi. Kalau dibalik, `.env` akan dilaporkan sebagai
 * "bukan berkas teks" - benar, tapi menyesatkan, dan yang penting: tidak
 * pernah disebut sebagai berkas rahasia.
 */
export function bolehDibacaKode(rel: unknown, akar = ''): HasilJalur {
  if (Array.isArray(rel)) {
    return {
      ok: false,
      rel: '',
      alasan: `hanya ${BATAS_BERKAS_PER_PANGGILAN} berkas per panggilan: kirim satu jalur string, bukan daftar.`,
    };
  }
  if (typeof rel !== 'string' || rel.trim() === '') {
    return { ok: false, rel: '', alasan: 'berkas kosong: sebutkan jalur relatif dari akar repo Zephyr.' };
  }
  if (/[\u0000-\u001f\u007f]/.test(rel)) {
    return { ok: false, rel: '', alasan: 'jalur ditolak: memuat byte kontrol.' };
  }
  /* Bentuk MENTAH diperiksa sebelum normalisasi, karena `normalJalur()` memang
   * membuang akar absolut dan merapikan pemisah - jejak aslinya hilang
   * sesudahnya. UNC (`//server/share`, `\\\\server\\share`) menjadi jalur
   * relatif yang tampak sah (`server/share/...`) kalau hanya normalisasi yang
   * dipakai, dan itu jenis jalur yang paling mudah lolos ke jembatan berkas. */
  const mentah = rel.replace(/\\/g, '/').trim();
  if (mentah.startsWith('//')) {
    return { ok: false, rel: '', alasan: `jalur UNC ditolak: ${rel}` };
  }
  if (mentah.startsWith('/') || /^[A-Za-z]:/.test(mentah)) {
    return { ok: false, rel: '', alasan: `jalur absolut ditolak (harus relatif dari akar repo): ${rel}` };
  }
  const p = normalJalur(rel);
  if (!p) {
    return { ok: false, rel: '', alasan: 'jalur ditolak: kosong sesudah dinormalkan.' };
  }
  /* Daftar blokir DIPINJAM, bukan disalin. `akar` bawaan `''` disengaja:
   * argumen itu hanya melebarkan pencocokan folder sistem (lihat catatan
   * panjang di `alasanBlokirRahasia`), dan akar repo Zephyr bukan folder
   * sistem. Jalur relatif tetap diperiksa terhadap folder ber-titik
   * (`/.git`, `/.ssh`, ...) lewat `periksaBaca()` di dalamnya. */
  const blokir = alasanBlokirRahasia(rel, akar);
  if (blokir) {
    return { ok: false, rel: p, alasan: `berkas ditolak (${blokir}): ${p}` };
  }
  /* FOLDER rahasia juga diperiksa, bukan cuma nama berkas terakhir. Tanpa ini
   * `src/.env/x.ts` lolos: nama berkasnya `.ts` (sah) dan berkas terakhirnya
   * bukan berkas rahasia - padahal ia berada DI DALAM folder `.env`. Yang
   * ditanyakan adalah tiap awalan jalur, jadi pemeriksaannya tetap MEMINJAM
   * daftar yang sama dan tidak ada daftar baru yang perlu dijaga sinkron.
   */
  const bagian = p.split('/');
  for (let i = 1; i < bagian.length; i++) {
    const prefiks = bagian.slice(0, i).join('/');
    const blokirFolder = alasanBlokirRahasia(prefiks, akar);
    if (blokirFolder) {
      return { ok: false, rel: p, alasan: `berkas ditolak (${blokirFolder} di folder ${prefiks}): ${p}` };
    }
  }
  if (!berekstensiTeks(p)) {
    return { ok: false, rel: p, alasan: `berkas ditolak: ${p} bukan berkas teks/kode yang boleh dibaca.` };
  }
  return { ok: true, rel: p, alasan: '' };
}

/* ------------------------------------------------------------------ */
/* Utilitas teks                                                       */
/* ------------------------------------------------------------------ */

/** Pemotong baris yang sadar CRLF/CR/LF dan tidak menghitung baris kosong
 *  terakhir sebagai baris (berkas berakhir `\n` tetap 1 baris lebih sedikit
 *  dari hasil `split`, dan angka itu yang dilaporkan peta kode). */
export function pisahBaris(isi: string): string[] {
  const bagian = String(isi ?? '').split(/\r\n|\r|\n/);
  if (bagian.length > 0 && bagian[bagian.length - 1] === '') bagian.pop();
  return bagian;
}

/** Tag isi deterministik (FNV-1a 32-bit, 8 heksadesimal).
 *
 *  Gunanya untuk MELACAK: dua pembacaan berkas yang sama menghasilkan tag yang
 *  sama, dan kalau berkasnya berubah, tag-nya berubah. Sengaja bukan
 *  `crypto`/`node:crypto` - modul ini harus jalan di browser juga. */
export function tagIsi(isi: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < isi.length; i++) {
    h ^= isi.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Apakah isi ini binary? Ukurannya sederhana dan deterministik: byte NUL,
 *  atau banjir karakter pengganti U+FFFD (gejala decode salah). */
export function apakahBiner(isi: string): boolean {
  if (isi.includes('\u0000')) return true;
  if (isi.length < 200) return false;
  let ganti = 0;
  for (let i = 0; i < isi.length; i++) if (isi.charCodeAt(i) === 0xfffd) ganti++;
  return ganti / isi.length > 0.02;
}

/** Pemisah ribuan versi sendiri: `1.234`. `toLocaleString` TIDAK dipakai
 *  karena keluarannya ikut locale mesin - keluaran modul ini harus sama di
 *  mesin mana pun. */
export function angkaTitik(n: number): string {
  const s = String(Math.trunc(Math.abs(n)));
  let keluar = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) keluar += '.';
    keluar += s[i];
  }
  return n < 0 ? `-${keluar}` : keluar;
}

/* ------------------------------------------------------------------ */
/* Potongan baris                                                      */
/* ------------------------------------------------------------------ */

export interface OpsiPotong {
  /** Baris awal (1-based, inklusif). */
  dari?: number;
  /** Baris akhir (1-based, inklusif). */
  sampai?: number;
  /** Nama simbol; kalau ada dan `dari` tidak diberikan, jendela dicari sendiri. */
  simbol?: string;
}

export interface PotonganKode {
  jalur: string;
  dari: number;
  sampai: number;
  totalBaris: number;
  /** Isi baris tanpa nomor, sudah dipangkas panjangnya. */
  baris: string[];
  /** Nomor baris nyata untuk tiap elemen `baris`. */
  nomor: number[];
  /** Nomor baris yang isinya dipangkas karena melebihi BATAS_KARAKTER_BARIS. */
  dipangkas: number[];
  /** Kenapa potongan ini tidak memuat seluruh rentang yang diminta. */
  sebabPotong: 'tidak' | 'batas-baris' | 'batas-karakter' | 'ujung-berkas';
  /** Baris simbol yang ditemukan (0 kalau tidak ada permintaan `simbol`). */
  simbolBaris: number;
  /** Nama simbol yang dicari. */
  simbol: string;
  /** Ukuran isi berkas (karakter). */
  byte: number;
  /** Tag isi berkas penuh - bukan hanya potongannya. */
  tag: string;
}

export type HasilPotong = { ok: true; potongan: PotonganKode } | { ok: false; alasan: string };

/**
 * Cari baris DEFINISI sebuah simbol, 1-based. 0 = tidak ketemu.
 *
 * Deterministik: pola dicoba berurutan, dan di dalam satu pola baris pertama
 * yang cocok yang menang (urutan berkas, bukan urutan kedekatan). Baris
 * komentar dilewati pada pencarian cadangan supaya sebutan di komentar tidak
 * menang atas kode.
 */
export function cariDefinisiBaris(baris: readonly string[], simbol: string): number {
  const s = String(simbol ?? '').trim();
  if (!s) return 0;
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pola: RegExp[] = [
    new RegExp(
      `^\\s*(?:export\\s+)?(?:default\\s+)?(?:declare\\s+)?(?:async\\s+)?` +
        `(?:function|class|const|let|var|interface|type|enum|namespace)\\s+${esc}\\b`,
    ),
    new RegExp(`^\\s*pub\\s+(?:async\\s+)?(?:fn|struct|enum|trait|impl|const|static|type|mod)\\s+${esc}\\b`),
    new RegExp(`^\\s*(?:async\\s+)?fn\\s+${esc}\\b`),
    new RegExp(`^\\s*(?:def|class)\\s+${esc}\\b`),
  ];
  for (const re of pola) {
    for (let i = 0; i < baris.length; i++) if (re.test(baris[i])) return i + 1;
  }
  const cadangan = new RegExp(`\\b${esc}\\b`);
  for (let i = 0; i < baris.length; i++) {
    const t = baris[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    if (cadangan.test(baris[i])) return i + 1;
  }
  return 0;
}

/** Bentuk satu baris berkode nomor, LEBAR tetap supaya kolomnya lurus. */
function formatBaris(nomor: number, lebar: number, teks: string): string {
  return `${String(nomor).padStart(lebar, '0')}| ${teks}`;
}

/**
 * Ambil potongan dari ISI berkas yang sudah dibaca. Murni - tidak menyentuh
 * disk; ini yang membuat aturan batas bisa diuji tanpa berkas besar di repo.
 */
export function bacaPotongan(isi: string, jalur: string, opsi: OpsiPotong = {}): HasilPotong {
  const semua = pisahBaris(isi);
  const total = semua.length;
  const tag = tagIsi(isi);
  const simbol = typeof opsi.simbol === 'string' ? opsi.simbol.trim() : '';

  if (total === 0) {
    return { ok: false, alasan: `berkas kosong (0 baris): ${jalur}` };
  }
  if (apakahBiner(isi)) {
    return { ok: false, alasan: `isi berkas bukan teks (ada byte NUL atau banjir U+FFFD): ${jalur}` };
  }

  const angka = (v: unknown): number => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : 0;
  };

  let dari = angka(opsi.dari);
  let sampai = angka(opsi.sampai);
  let simbolBaris = 0;

  if (simbol && dari <= 0) {
    simbolBaris = cariDefinisiBaris(semua, simbol);
    if (simbolBaris === 0) {
      return { ok: false, alasan: `simbol "${simbol}" tidak ditemukan di ${jalur} (${angkaTitik(total)} baris).` };
    }
    dari = Math.max(1, simbolBaris - JENDELA_SEBELUM_SIMBOL);
    sampai = Math.min(total, simbolBaris + JENDELA_SESUDAH_SIMBOL);
  } else {
    if (dari <= 0) dari = 1;
    if (sampai <= 0) sampai = dari + BATAS_BARIS_POTONGAN - 1;
  }

  if (dari > total) {
    return { ok: false, alasan: `baris ${angkaTitik(dari)} melebihi jumlah baris berkas ${jalur} (${angkaTitik(total)}).` };
  }

  let sebabPotong: PotonganKode['sebabPotong'] = 'tidak';
  if (sampai > total) {
    sampai = total;
    sebabPotong = 'ujung-berkas';
  }
  if (sampai < dari) {
    return { ok: false, alasan: `rentang terbalik: dari ${angkaTitik(dari)} sampai ${angkaTitik(sampai)}.` };
  }
  if (sampai - dari + 1 > BATAS_BARIS_POTONGAN) {
    sampai = dari + BATAS_BARIS_POTONGAN - 1;
    sebabPotong = 'batas-baris';
  }

  const baris: string[] = [];
  const nomor: number[] = [];
  const dipangkas: number[] = [];
  for (let n = dari; n <= sampai; n++) {
    const t = semua[n - 1] ?? '';
    if (t.length > BATAS_KARAKTER_BARIS) {
      dipangkas.push(n);
      baris.push(`${t.slice(0, BATAS_KARAKTER_BARIS - 1)}…`);
    } else {
      baris.push(t);
    }
    nomor.push(n);
  }

  /* Anggaran karakter dihitung dari bentuk RENDER-nya (nomor + pipa +
   * isi), karena itulah yang benar-benar masuk konteks model. Kalau lewat,
   * baris dibuang dari BELAKANG - deterministik, dan baris yang paling dekat
   * dengan permintaan (awal rentang / baris simbol) tetap terkirim. */
  const lebar = String(Math.max(total, 1)).length;
  let panjang = 0;
  for (const t of baris) panjang += formatBaris(0, lebar, t).length + 1;
  let dipotongKarakter = false;
  while (panjang > BATAS_CHAR_POTONGAN && baris.length > 1) {
    const t = baris.pop() as string;
    nomor.pop();
    panjang -= formatBaris(0, lebar, t).length + 1;
    dipotongKarakter = true;
  }
  if (dipotongKarakter) {
    sampai = nomor[nomor.length - 1];
    sebabPotong = 'batas-karakter';
  }

  return {
    ok: true,
    potongan: {
      jalur,
      dari,
      sampai,
      totalBaris: total,
      baris,
      nomor,
      dipangkas,
      sebabPotong,
      simbolBaris,
      simbol,
      byte: isi.length,
      tag,
    },
  };
}

/**
 * Rakit potongan jadi teks yang bisa dibaca model DAN diverifikasi manusia.
 *
 * Kepala barisnya menyebut asal-usul lengkap: versi kebijakan, jalur relatif,
 * rentang baris nyata, ukuran, dan tag isi. Tidak ada jalur absolut dan tidak
 * ada waktu - keluaran harus sama di mesin mana pun, dan tidak boleh
 * membocorkan nama folder user.
 */
export function rakitPotongan(p: PotonganKode): string {
  const lebar = String(Math.max(p.totalBaris, 1)).length;
  const kepala: string[] = [];
  kepala.push(
    `[baca_kode v${BACA_KODE_VERSI}] ${p.jalur}:${p.dari}-${p.sampai} ` +
      `(${angkaTitik(p.baris.length)} dari ${angkaTitik(p.totalBaris)} baris; ` +
      `${angkaTitik(p.byte)} B; tag ${p.tag}${p.simbolBaris > 0 ? `; simbol ${p.simbol}@${p.simbolBaris}` : ''})`,
  );
  for (let i = 0; i < p.baris.length; i++) kepala.push(formatBaris(p.nomor[i], lebar, p.baris[i]));
  if (p.sebabPotong === 'batas-baris') {
    kepala.push(`… potongan berhenti di baris ${angkaTitik(p.sampai)}: batas ${BATAS_BARIS_POTONGAN} baris/pembacaan.`);
  } else if (p.sebabPotong === 'batas-karakter') {
    kepala.push(
      `… potongan berhenti di baris ${angkaTitik(p.sampai)}: batas ${angkaTitik(BATAS_CHAR_POTONGAN)} karakter/pembacaan.`,
    );
  } else if (p.sebabPotong === 'ujung-berkas') {
    kepala.push(`… berkas berakhir di baris ${angkaTitik(p.totalBaris)} (tidak dipotong).`);
  }
  if (p.dipangkas.length > 0) {
    kepala.push(`… ${p.dipangkas.length} baris dipangkas pada ${BATAS_KARAKTER_BARIS} karakter: ${p.dipangkas.join(', ')}.`);
  }
  return kepala.join('\n');
}

/* ------------------------------------------------------------------ */
/* Anggaran per sesi                                                   */
/* ------------------------------------------------------------------ */

export interface AnggaranBaca {
  pakai(jalur: string): { ok: boolean; alasan: string };
  terpakai(): number;
  tersisa(): number;
  batas(): number;
}

/** Anggaran sederhana dan deterministik: hitungan, bukan waktu. */
export function buatAnggaranBaca(batas: number = BATAS_BACAAN_SESI): AnggaranBaca {
  const maks = Number.isFinite(batas) && batas > 0 ? Math.floor(batas) : BATAS_BACAAN_SESI;
  let pakai = 0;
  return {
    pakai(jalur: string) {
      if (pakai >= maks) {
        return {
          ok: false,
          alasan:
            `anggaran pembacaan sesi habis: ${maks} pembacaan sudah dipakai ` +
            `(permintaan "${jalur}" tidak dibaca).`,
        };
      }
      pakai++;
      return { ok: true, alasan: '' };
    },
    terpakai: () => pakai,
    tersisa: () => Math.max(0, maks - pakai),
    batas: () => maks,
  };
}

/* ------------------------------------------------------------------ */
/* Jembatan berkas (disuntikkan pemanggil)                             */
/* ------------------------------------------------------------------ */

/**
 * Tiga kemampuan yang harus disediakan pemanggil.
 *
 * `realpath` WAJIB, bukan opsional: tanpa bisa meminta jalur nyata, modul ini
 * tidak punya cara membedakan berkas di dalam repo dari symlink/junction yang
 * menunjuk keluar repo - dan `fs_stat` Tauri memakai `std::fs::metadata` yang
 * MENGIKUTI tautan, jadi ia tidak bisa dipakai mendeteksi. Kalau pemanggil
 * tidak punya `realpath`, lebih baik tool-nya mati daripada mengaku aman.
 */
export interface PerintahBacaKode {
  fsRead(path: string): Promise<{ content: string } | string>;
  fsStat(path: string): Promise<{ size: number; isDir?: boolean }>;
  realpath(path: string): Promise<string>;
}

export interface JembatanBacaKode {
  cmd: PerintahBacaKode;
  /** Akar repo Zephyr, bentuk apa pun yang dimengerti `realpath`. */
  akar: string;
}

export interface PermintaanBaca {
  berkas: string;
  dari?: number;
  sampai?: number;
  simbol?: string;
}

export interface HasilBaca {
  ok: boolean;
  /** Teks siap kirim ke model (atau pesan penolakan). */
  teks: string;
  alasan: string;
  potongan?: PotonganKode;
  /** Jejak jembatan: bukti apa yang benar-benar dipanggil, berurutan. */
  jejak: string[];
}

/** Buang awalan verbatim Windows (`\\?\`) dan samakan garis miring. */
export function rapikanJalurNyata(p: string): string {
  let s = String(p ?? '').replace(/\\/g, '/').replace(/^\/\/\?\//, '');
  s = s.replace(/\/{2,}/g, '/');
  if (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

/** Apakah `jalur` berada di dalam `akar`? Perbandingan huruf-kecil karena
 *  berkas Windows tidak membedakan besar-kecil huruf. */
export function diDalamAkar(jalur: string, akar: string): boolean {
  const j = rapikanJalurNyata(jalur).toLowerCase();
  const a = rapikanJalurNyata(akar).toLowerCase();
  if (!j || !a) return false;
  return j === a || j.startsWith(`${a}/`);
}

function isiDari(nilai: { content: string } | string): string {
  if (typeof nilai === 'string') return nilai;
  return String((nilai as { content?: unknown })?.content ?? '');
}

/**
 * Baca satu berkas kode dari repo Zephyr.
 *
 * Urutan langkahnya adalah keamanannya: periksa (murni, tanpa disk) ->
 * anggaran -> realpath akar -> realpath berkas -> pagar di dalam akar -> stat
 * (ukuran) -> baru baca -> periksa binary -> potong. Penolakan pada langkah
 * mana pun mengembalikan `jejak` yang menyebut sampai mana ia sampai; untuk
 * penolakan jalur/rahasia/anggaran, `jejak` KOSONG - bukti bahwa jembatan
 * tidak disentuh.
 */
export async function bacaBerkasKode(
  permintaan: PermintaanBaca,
  jembatan: JembatanBacaKode,
  anggaran?: AnggaranBaca,
): Promise<HasilBaca> {
  const jejak: string[] = [];
  const tolak = (alasan: string): HasilBaca => ({ ok: false, teks: `ditolak: ${alasan}`, alasan, jejak });

  const periksa = bolehDibacaKode(permintaan?.berkas);
  if (!periksa.ok) return tolak(periksa.alasan);
  const rel = periksa.rel;

  if (anggaran) {
    const izin = anggaran.pakai(rel);
    if (!izin.ok) return tolak(izin.alasan);
  }

  const cmd = jembatan?.cmd;
  const akar = String(jembatan?.akar ?? '');
  if (!cmd || typeof cmd.fsRead !== 'function' || typeof cmd.fsStat !== 'function' || typeof cmd.realpath !== 'function') {
    return tolak('jembatan berkas belum lengkap (butuh fsRead + fsStat + realpath).');
  }
  if (!akar) return tolak('akar repo belum dipasang.');

  const akarKotor = akar.replace(/\\/g, '/').replace(/\/+$/, '');
  const berkasKotor = `${akarKotor}/${rel}`;

  let akarNyata = '';
  try {
    jejak.push('realpath(akar)');
    akarNyata = rapikanJalurNyata(await cmd.realpath(akarKotor));
  } catch {
    return tolak(`akar repo tidak bisa dipastikan ada: ${rel} tidak dibaca.`);
  }
  if (!akarNyata) return tolak('akar repo tidak bisa dipastikan bentuk nyatanya.');

  let berkasNyata = '';
  try {
    jejak.push(`realpath(${rel})`);
    berkasNyata = rapikanJalurNyata(await cmd.realpath(berkasKotor));
  } catch {
    return tolak(`berkas tidak ada: ${rel}`);
  }
  if (!berkasNyata) return tolak(`berkas tidak bisa dipastikan bentuk nyatanya: ${rel}`);

  /* Pagar yang sesungguhnya: bentuk NYATA berkas harus tetap di dalam bentuk
   * NYATA akar. Inilah yang menutup symlink/junction keluar repo. */
  if (!diDalamAkar(berkasNyata, akarNyata)) {
    return tolak(`berkas menunjuk KELUAR akar repo (tautan keluar repo): ${rel}`);
  }

  let stat: { size: number; isDir?: boolean };
  try {
    jejak.push('fsStat');
    stat = await cmd.fsStat(berkasKotor);
  } catch {
    return tolak(`berkas tidak bisa dibaca statistiknya: ${rel}`);
  }
  if (stat?.isDir) return tolak(`itu folder, bukan berkas: ${rel}`);
  const ukuran = Number(stat?.size ?? 0);
  if (ukuran > BATAS_BYTE_BERKAS) {
    return tolak(
      `berkas terlalu besar: ${rel} ${angkaTitik(ukuran)} B > batas ${angkaTitik(BATAS_BYTE_BERKAS)} B ` +
        `(${BATAS_BYTE_BERKAS / 1024} KiB).`,
    );
  }

  let isi = '';
  try {
    jejak.push('fsRead');
    isi = isiDari(await cmd.fsRead(berkasKotor));
  } catch {
    return tolak(`berkas gagal dibaca: ${rel}`);
  }
  if (apakahBiner(isi)) return { ...tolak(`isi bukan teks (byte NUL): ${rel}`), jejak };

  const potong = bacaPotongan(isi, rel, { dari: permintaan.dari, sampai: permintaan.sampai, simbol: permintaan.simbol });
  if (!potong.ok) return { ...tolak(potong.alasan), jejak };
  const potongan = potong.potongan;

  return { ok: true, teks: rakitPotongan(potongan), alasan: '', potongan, jejak };
}

/* ------------------------------------------------------------------ */
/* Spesifikasi tool + handler                                          */
/* ------------------------------------------------------------------ */

export const SPEC_BACA_KODE: AgentToolSpec = {
  name: 'zephyr_kode',
  description:
    'Baca ISI kode ZEPHYR SENDIRI sebagai potongan baris bernomor - jangan menebak isi berkas dari peta kode. ' +
    'Pakai ini untuk menjawab "cara kerja X": sebutkan `berkas` (jalur relatif dari akar repo Zephyr, mis. src/components/shell/ActivityBar.tsx) ' +
    'plus `dari`/`sampai` ATAU `simbol` (jendela di sekitar definisi simbol). ' +
    'Batas: 120 baris/pembacaan, berkas <= 512 KiB, 1 berkas/panggilan, 12 pembacaan/sesi. Hanya berkas teks di dalam repo; berkas rahasia (.env, *.key, *.pem) dan jalur di luar repo DITOLAK.',
  parameters: {
    type: 'object',
    properties: {
      berkas: {
        type: 'string',
        description: 'Jalur RELATIF dari akar repo Zephyr, mis. "src/lib/konteksRepo.ts". Jalur absolut dan ".." ditolak.',
      },
      dari: { type: ['number', 'string'], description: 'Baris awal (1-based, inklusif). Bawaan 1.' },
      sampai: { type: ['number', 'string'], description: `Baris akhir (1-based, inklusif). Bawaan dari+${BATAS_BARIS_POTONGAN - 1}.` },
      simbol: { type: 'string', description: 'Nama simbol; jendela diambil di sekitar definisinya kalau `dari` tidak diberikan.' },
    },
    required: ['berkas'],
  },
};

/** Jembatan yang dipasang aplikasi saat start; null = tool belum bisa jalan. */
let JEMBATAN_SESI: JembatanBacaKode | null = null;
let ANGGARAN_SESI: AnggaranBaca = buatAnggaranBaca();

/**
 * Pasang jembatan + akar repo. Dipanggil sekali oleh aplikasi; di harness
 * fungsi ini yang menggantikan IPC Tauri.
 *
 * Kalau `jembatan` null, tool-nya DIMATIKAN (bukan dipasang dengan tebakan
 * akar): lebih baik model diberi tahu bahwa pembacaan tidak tersedia daripada
 * membaca berkas dari akar yang salah.
 */
export function pasangJembatanBacaKode(jembatan: JembatanBacaKode | null): void {
  JEMBATAN_SESI = jembatan;
  ANGGARAN_SESI = buatAnggaranBaca();
}

/* ------------------------------------------------------------------ */
/* Realpath SUNGGUHAN (seam dari `commands.ts`)                        */
/* ------------------------------------------------------------------ */

/**
 * Realpath sungguhan dari perintah Tauri `fs_realpath`, DISUNTIKKAN
 * `src/lib/commands.ts` lewat `pasangRealpathBacaKode`. Berkas ini sengaja
 * tidak mengimpornya sendiri: aturan 5 di atas melarang lapisan ini menyentuh
 * modul IPC Tauri, jadi penyambungannya lewat seam dan bukan lewat impor.
 *
 * `null` = belum ada. Dalam keadaan itu jalur tool MENOLAK membaca
 * (fail-closed): tanpa penyelesai tautan, symlink/junction ke luar repo tidak
 * bisa dibedakan dari berkas biasa.
 */
let REALPATH_NYATA: ((path: string) => Promise<string>) | null = null;

/** Pasang realpath sungguhan (`null` = cabut). Dipanggil `commands.ts`. */
export function pasangRealpathBacaKode(fn: ((path: string) => Promise<string>) | null): void {
  REALPATH_NYATA = typeof fn === 'function' ? fn : null;
}

/** Realpath sungguhan yang sedang terpasang (`null` = belum ada). */
export function realpathBacaKode(): ((path: string) => Promise<string>) | null {
  return REALPATH_NYATA;
}

export function resetAnggaranBaca(): void {
  ANGGARAN_SESI = buatAnggaranBaca();
}

export function jembatanBacaKode(): JembatanBacaKode | null {
  return JEMBATAN_SESI;
}

/**
 * Apakah `fn` benar-benar MENYELESAIKAN jalur, atau hanya mengembalikan
 * masukannya APA ADANYA?
 *
 * Bedanya menentukan. Pagar di `bacaBerkasKode` membandingkan bentuk NYATA
 * berkas dengan bentuk NYATA akar, jadi realpath identitas SELALU lolos -
 * termasuk untuk junction yang menunjuk keluar repo. Jembatan aplikasi
 * (`agentTools.ts`) memang memasang realpath identitas (dulu satu-satunya yang
 * tersedia, sebelum ada perintah `fs_realpath`), sementara jembatan uji bisa
 * membawa `realpathSync` yang sungguhan dan harus tetap dipakai.
 *
 * Ujinya deterministik, murni lokal, dan TIDAK membuat tautan apa pun: jalur
 * `<akar>/.` tidak mungkin dikembalikan apa adanya oleh penyelesai jalur
 * sungguhan - bentuk kanoniknya tanpa `/.` (di Windows bahkan bergaris miring
 * balik) - sedangkan identitas mengembalikannya persis.
 */
async function realpathMenyelesaikanJalur(
  fn: (path: string) => Promise<string>,
  akar: string,
): Promise<boolean> {
  const dasar = rapikanJalurNyata(akar).replace(/\/+$/, '');
  if (!dasar) return false;
  const uji = `${dasar}/.`;
  let hasil = '';
  try {
    hasil = String(await fn(uji));
  } catch {
    /* Tidak bisa dijawab = tidak bisa dipercaya. */
    return false;
  }
  return hasil.length > 0 && rapikanJalurNyata(hasil) !== uji;
}

/**
 * Jembatan yang dipakai lapisan TOOL (`jalankanBacaKode`) - bukan yang dipakai
 * `bacaBerkasKode` langsung, karena pemanggil langsung berhak menentukan
 * jembatannya sendiri (harness menuntut itu).
 *
 * `fsRead`/`fsStat` tetap milik pemanggil; hanya `realpath` yang dipastikan
 * SUNGGUHAN. Urutannya: realpath yang disuntikkan `commands.ts` menang; kalau
 * tidak ada, jembatan dipakai apa adanya HANYA kalau realpath-nya benar-benar
 * menyelesaikan jalur.
 *
 * Balik `null` = realpath sungguhan tidak tersedia, dan pembacaan harus
 * DITOLAK. Jembatan yang memang tidak lengkap (tanpa `realpath`) dibiarkan
 * lewat supaya inti yang menolaknya dengan pesan "belum lengkap" sendiri.
 */
async function jembatanRealpathNyata(jem: JembatanBacaKode): Promise<JembatanBacaKode | null> {
  const cmd = jem?.cmd;
  if (!cmd || typeof cmd.fsRead !== 'function' || typeof cmd.fsStat !== 'function') return jem;
  if (typeof cmd.realpath !== 'function') return jem;
  if (REALPATH_NYATA) {
    /* Suntikan pun diuji: realpath yang TIDAK menyelesaikan jalur (bentuk
       identitas, atau melempar karena perintahnya tidak ada di backend) tidak
       boleh dipakai - pagar symlink-nya cuma hiasan kalau begitu. */
    if (!(await realpathMenyelesaikanJalur(REALPATH_NYATA, String(jem.akar ?? '')))) return null;
    return { akar: jem.akar, cmd: { fsRead: cmd.fsRead, fsStat: cmd.fsStat, realpath: REALPATH_NYATA } };
  }
  if (await realpathMenyelesaikanJalur((p: string) => cmd.realpath(p), String(jem.akar ?? ''))) return jem;
  return null;
}

export async function jalankanBacaKode(args: Record<string, unknown> = {}): Promise<string> {
  const berkas = typeof args.berkas === 'string' ? args.berkas : '';
  const dari = args.dari === undefined || args.dari === null ? undefined : Number(args.dari);
  const sampai = args.sampai === undefined || args.sampai === null ? undefined : Number(args.sampai);
  const simbol = typeof args.simbol === 'string' ? args.simbol : undefined;

  if (!JEMBATAN_SESI) {
    return 'baca_kode belum tersambung: jembatan berkas belum dipasang. Tidak ada berkas yang dibaca.';
  }
  const efektif = await jembatanRealpathNyata(JEMBATAN_SESI);
  if (!efektif) {
    return (
      'ditolak: realpath sungguhan belum tersedia (perintah `fs_realpath` tidak terpasang), jadi ' +
      'symlink/junction yang menunjuk keluar repo tidak bisa ditolak. Tidak ada berkas yang dibaca.'
    );
  }
  const hasil = await bacaBerkasKode({ berkas, dari, sampai, simbol }, efektif, ANGGARAN_SESI);
  return hasil.teks;
}

/** Entri tool untuk `AGENT_TOOLS` (dipasang dari `agentTools.ts`). */
export const TOOL_BACA_KODE: {
  spec: AgentToolSpec;
  run: (args: Record<string, unknown>) => Promise<string>;
} = {
  spec: SPEC_BACA_KODE,
  run: jalankanBacaKode,
};
