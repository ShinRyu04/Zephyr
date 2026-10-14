/**
 * hunkUnified.ts — review diff PER POTONGAN (hunk): terima/tolak per hunk, lalu
 * susun teks HASIL dari hunk yang diterima saja.
 *
 * Murni: tanpa React, tanpa Tauri, tanpa store, tanpa akses berkas. Semua fungsi
 * di berkas ini adalah fungsi teks → teks/daftar, jadi bisa diuji lewat Node
 * tanpa app hidup (lihat scripts/uji-hunk.mjs).
 *
 * ── Dua jalan masuk, satu arti ─────────────────────────────────────────────
 *
 * 1. `hunkDariDuaTeks(lama, baru)` — kalau pemanggil punya KEDUA isi berkas.
 *    Memakai ulang algoritme di src/lib/simpleDiff.ts: `barisDiff` (LCS baris),
 *    `bagiHunk` (potongan), `terapkanHunk` (susun ulang). Hunk = rentetan baris
 *    berubah yang berdempetan; satu baris konteks sudah memisahkan dua hunk,
 *    supaya perubahan pertama bisa diterima tanpa yang kedua.
 *
 * 2. `hunkUnified(teksUnified)` — kalau pemanggil hanya punya teks unified-diff
 *    (itulah yang dipegang panel SCM: `useGit.diff.text`). Di sini potongan
 *    ditentukan oleh header `@@ -lama,jumlah +baru,jumlah @@`, karena hanya
 *    teks unified yang tahu batas potongan asli — dengan konteks 0 baris pun
 *    (`-U0`) batas itu tetap benar, sedang `bagiHunk` akan menggabungkan dua
 *    potongan yang berdempetan.
 *
 * Terapkan-ulang:
 *
 *   * `terapkanHunkDuaTeks(lama, baru, diterima)` — punya kedua isi → langsung
 *     pakai `terapkanHunk` (satu baris per baris: konteks selalu keluar, baris
 *     tambah hanya bila hunk-nya diterima, baris hapus hanya bila hunk-nya
 *     DITOLAK, karena perubahan yang menolak penghapusan berarti baris lama
 *     tetap ada).
 *
 *   * `terapkanUnifiedKeIsi(isi, teksUnified, diterima, { sisi })` — hanya punya
 *     SATU isi. Ini yang dipakai panel SCM, dan ia punya dua arah:
 *       - `sisi: 'lama'` → `isi` adalah berkas LAMA (mis. versi HEAD); hunk yang
 *         diterima dijalankan (baris tambah masuk, baris hapus dibuang).
 *       - `sisi: 'baru'` → `isi` adalah berkas yang ADA SEKARANG (sisi baru dari
 *         diff); hunk yang TIDAK diterima dibalikkan (baris tambahnya dibuang,
 *         baris lamanya dikembalikan). Arah inilah yang dipakai DiffViewer,
 *         karena panel SCM memegang isi berkas kerja, bukan versi lama.
 *     Kedua arah menghasilkan teks yang sama bila inputnya konsisten — dan itu
 *     diuji di harness.
 *
 *     Sebelum sebuah hunk ditulis, baris konteks (dan baris sisi-isinya) dicocokkan
 *     dengan isi nyata pada nomor baris yang sama. Tidak cocok → `HunkUnifiedError`
 *     yang menyebut nomor barisnya, bukan hasil rusak yang diam-diam salah.
 *
 * ── Pagar: TIDAK ada jalur otomatis ke indeks ──────────────────────────────
 *
 * Modul ini tidak pernah memanggil aksi indeks apa pun, tidak mengimpor
 * commands.ts, dan tidak menyentuh tauri. Menerapkan hunk di sini = menghasilkan
 * STRING; siapa pun yang menulis string itu ke disk bertanggung jawab, dan di
 * lane ini penulisnya hanya `fs_write` (berkas kerja), bukan aksi indeks.
 * Pagar itu diperiksa otomatis oleh scripts/uji-hunk.mjs (kasus "pagar"): ia
 * membaca berkas NYATA dan GAGAL bila ada pemanggilan aksi indeks di jalur
 * terapkan.
 *
 * ── Selesai per berkas ────────────────────────────────────────────────────
 *
 * `statusSemuaBerkas` / `berkasSelesai` menjawab pertanyaan banyak-berkas:
 * berkas mana yang SEMUA hunk-nya sudah diputuskan (terima atau tolak). Berkas
 * yang diffnya biner tidak pernah dihitung selesai, karena potongan binernya
 * tidak punya arti terima/tolak.
 */

import { bagiHunk, barisDiff, terapkanHunk } from './simpleDiff';
import type { DiffRow } from './simpleDiff';

/* ── Bentuk data ─────────────────────────────────────────────────────────── */

export type JenisBaris = 'konteks' | 'tambah' | 'hapus';
export type StatusHunk = 'belum' | 'terima' | 'tolak';
export type Sisi = 'lama' | 'baru';

/** Keputusan per hunk, dikunci oleh `HunkReview.id`. Hunk yang tidak ada di
 *  peta = 'belum'. */
export type PetaStatus = Readonly<Record<number, StatusHunk>>;

export interface BarisHunk {
  jenis: JenisBaris;
  teks: string;
  /** nomor baris (1-based) di berkas LAMA; null bila baris ini tidak ada di sisi lama */
  nomorLama: number | null;
  /** nomor baris (1-based) di berkas BARU; null bila baris ini tidak ada di sisi baru */
  nomorBaru: number | null;
}

export interface HunkReview {
  /** kunci stabil untuk peta keputusan */
  id: number;
  /** baris pertama hunk di sisi lama (1-based); null bila hunk tak menyentuh sisi lama */
  mulaiLama: number | null;
  /** berapa baris sisi lama yang dicakup hunk (konteks + hapus) */
  jumlahLama: number;
  /** baris pertama hunk di sisi baru (1-based); null bila hunk tak menyentuh sisi baru */
  mulaiBaru: number | null;
  /** berapa baris sisi baru yang dicakup hunk (konteks + tambah) */
  jumlahBaru: number;
  tambah: number;
  hapus: number;
  status: StatusHunk;
  /** baris-baris hunk berurutan, lengkap dengan nomor barisnya */
  baris: BarisHunk[];
}

/** Satu potongan (hunk) hasil pembacaan teks unified. */
export interface BlokUnified {
  lamaMulai: number;
  lamaJumlah: number;
  baruMulai: number;
  baruJumlah: number;
  /** indeks baris pertama blok ini di dalam `baris` */
  barisMulai: number;
  barisJumlah: number;
}

export interface HasilUrai {
  /** baris isi diff (konteks/tambah/hapus) semua blok, berurutan */
  baris: DiffRow[];
  blok: BlokUnified[];
  /** daftar galat; kosong = teks unified sah dan bisa diterapkan */
  galat: string[];
  biner: boolean;
  /** teks memuat lebih dari satu berkas; sisanya diabaikan */
  berkasGanda: boolean;
  /** sisi mana yang TIDAK diakhiri newline (`\ No newline at end of file`) */
  tanpaNewlineAkhir: { lama: boolean; baru: boolean };
}

export interface BerkasReview {
  path: string;
  /** isi lama (mis. dari HEAD); dipakai bila `teksUnified` ada dan sisi='lama' */
  isiLama?: string;
  /** isi baru; dipakai bila `teksUnified` ada dan sisi='baru', atau sebagai pasangan */
  isiBaru?: string;
  /** teks unified-diff berkas ini; bila ada, ia yang menentukan potongan */
  teksUnified?: string;
  status?: PetaStatus;
  sisi?: Sisi;
}

export interface StatusBerkas {
  path: string;
  jumlahHunk: number;
  terima: number;
  tolak: number;
  belum: number;
  /** true bila semua hunk sudah diputuskan dan tidak ada galat/biner */
  selesai: boolean;
  biner: boolean;
  /** pesan galat pembacaan diff, null bila tidak ada */
  galat: string | null;
}

export interface HasilTerap {
  path: string;
  /** teks hasil; '' bila `galat` tidak null */
  isi: string;
  galat: string | null;
}

/** Galat yang menyebut apa yang salah, bukan gagal diam-diam. */
export class HunkUnifiedError extends Error {
  readonly kode: string;

  constructor(pesan: string, kode: string) {
    super(pesan);
    this.name = 'HunkUnifiedError';
    this.kode = kode;
  }
}

/* ── Alat kecil ──────────────────────────────────────────────────────────── */

const petik = (s: string): string => JSON.stringify(s);

/** Buang `\r` di ujung baris supaya perbandingan tidak gagal hanya karena CRLF. */
const tanpaCR = (s: string): string => (s.endsWith('\r') ? s.slice(0, -1) : s);

/**
 * Pisah isi menjadi baris-baris + ingat apakah berkas diakhiri newline.
 *
 * `''` diperlakukan sebagai NOL baris, bukan satu baris kosong: itulah satu-satunya
 * cara berkas kosong dan diff berkas baru (`@@ -0,0 +1,n @@`) bisa cocok.
 */
function pisahBaris(isi: string): { baris: string[]; akhirBaris: boolean } {
  if (isi === '') return { baris: [], akhirBaris: false };
  const baris = isi.split('\n');
  const akhirBaris = baris[baris.length - 1] === '';
  if (akhirBaris) baris.pop();
  return { baris, akhirBaris };
}

function gabungBaris(baris: string[], akhirBaris: boolean): string {
  const teks = baris.join('\n');
  return akhirBaris ? `${teks}\n` : teks;
}

/**
 * Indeks 0-based awal sebuah hunk di dalam isi.
 *
 * Rentang panjang-nol memakai konvensi git: `@@ -5,0 +6,1 @@` berarti sisipan
 * SESUDAH baris 5 sisi lama, jadi indeksnya 5 — bukan 4. Salah di sini menghasilkan
 * sisipan yang bergeser satu baris, dan itu jenis kerusakan yang paling sulit
 * terlihat saat ditinjau.
 */
function mulaiIndex(mulai: number, jumlah: number): number {
  return jumlah === 0 ? mulai : mulai - 1;
}

function keBarisHunk(r: DiffRow): BarisHunk {
  return {
    jenis: r.kind === 'same' ? 'konteks' : r.kind === 'add' ? 'tambah' : 'hapus',
    teks: r.text,
    nomorLama: r.a,
    nomorBaru: r.b,
  };
}

/** Nomor baris pertama sebuah hunk; null bila hunk tidak menyentuh sisi itu. */
function mulaiPertama(baris: BarisHunk[], sisiAwal: boolean): number | null {
  let out: number | null = null;
  for (const b of baris) {
    const n = sisiAwal ? b.nomorLama : b.nomorBaru;
    if (n === null) continue;
    if (out === null || n < out) out = n;
  }
  return out;
}

/* ── Baca teks unified ───────────────────────────────────────────────────── */

const RE_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Urai teks unified-diff menjadi baris + blok, mengumpulkan galat sebagai data.
 *
 * Yang sengaja diabaikan: baris meta sebelum hunk pertama (`diff --git`, `index`,
 * `---`, `+++`) dan `\ No newline at end of file`. Yang dianggap BUKAN satu berkas:
 * `diff --git` yang muncul setelah badan hunk — sisanya dilewati dan dilaporkan
 * lewat `berkasGanda`, karena menerapkan diff dua berkas ke satu isi berkas tidak
 * punya arti.
 */
export function uraiUnified(teksUnified: string): HasilUrai {
  const galat: string[] = [];
  const baris: DiffRow[] = [];
  const blok: BlokUnified[] = [];
  let biner = false;
  let berkasGanda = false;
  const tanpaNewlineAkhir = { lama: false, baru: false };

  const mentah = teksUnified.split('\n');
  if (mentah.length > 0 && mentah[mentah.length - 1] === '') mentah.pop();

  let diBadan = false;
  let kepala: Omit<BlokUnified, 'barisJumlah'> | null = null;
  let nomorLama = 0;
  let nomorBaru = 0;
  let jalanLama = 0;
  let jalanBaru = 0;

  const tutup = (): void => {
    if (!kepala) return;
    if (jalanLama !== kepala.lamaJumlah || jalanBaru !== kepala.baruJumlah) {
      galat.push(
        `Header hunk #${blok.length} (@@ -${kepala.lamaMulai},${kepala.lamaJumlah} ` +
          `+${kepala.baruMulai},${kepala.baruJumlah} @@) tidak cocok dengan isinya: ` +
          `terbaca ${jalanLama} baris sisi lama / ${jalanBaru} baris sisi baru.`,
      );
    }
    blok.push({ ...kepala, barisJumlah: baris.length - kepala.barisMulai });
    kepala = null;
  };

  for (const l of mentah) {
    if (l.startsWith('Binary file') || l.startsWith('GIT binary patch')) {
      biner = true;
      continue;
    }
    if (l.startsWith('diff --git ') || l.startsWith('diff --zephyr ')) {
      if (diBadan) {
        berkasGanda = true;
        break;
      }
      continue;
    }

    const m = RE_HEADER.exec(l);
    if (m) {
      tutup();
      kepala = {
        lamaMulai: Number(m[1]),
        lamaJumlah: m[2] === undefined ? 1 : Number(m[2]),
        baruMulai: Number(m[3]),
        baruJumlah: m[4] === undefined ? 1 : Number(m[4]),
        barisMulai: baris.length,
      };
      nomorLama = kepala.lamaMulai;
      nomorBaru = kepala.baruMulai;
      jalanLama = 0;
      jalanBaru = 0;
      diBadan = true;
      continue;
    }

    if (!kepala) continue; /* meta sebelum hunk pertama */
    if (l.startsWith('\\')) {
      /* "\ No newline at end of file": berlaku untuk baris terakhir sisi yang
       * barusan ditulis. Baris konteks menandai kedua sisi. */
      const t = baris[baris.length - 1];
      if (!t || t.kind === 'same') {
        tanpaNewlineAkhir.lama = true;
        tanpaNewlineAkhir.baru = true;
      } else if (t.kind === 'add') {
        tanpaNewlineAkhir.baru = true;
      } else {
        tanpaNewlineAkhir.lama = true;
      }
      continue;
    }

    if (l.startsWith('+')) {
      baris.push({ kind: 'add', text: l.slice(1), a: null, b: nomorBaru });
      nomorBaru += 1;
      jalanBaru += 1;
      continue;
    }
    if (l.startsWith('-')) {
      baris.push({ kind: 'del', text: l.slice(1), a: nomorLama, b: null });
      nomorLama += 1;
      jalanLama += 1;
      continue;
    }
    /* ' ' = konteks; baris kosong di dalam badan diff juga konteks (baris kosong). */
    baris.push({ kind: 'same', text: l.startsWith(' ') ? l.slice(1) : l, a: nomorLama, b: nomorBaru });
    nomorLama += 1;
    nomorBaru += 1;
    jalanLama += 1;
    jalanBaru += 1;
  }
  tutup();

  /* Hunk harus urut. Bila urut, cukup membandingkan hunk yang berdempetan untuk
   * membuktikan tidak ada yang tumpang tindih. */
  for (let i = 1; i < blok.length; i += 1) {
    const p = blok[i - 1];
    const k = blok[i];
    if (k.lamaMulai < p.lamaMulai + Math.max(1, p.lamaJumlah)) {
      galat.push(
        `Hunk #${i} tumpang tindih dengan hunk #${i - 1} di sisi lama: hunk #${i - 1} menempati baris ` +
          `${p.lamaMulai}..${p.lamaMulai + Math.max(1, p.lamaJumlah) - 1} (${p.lamaJumlah} baris), ` +
          `hunk #${i} mulai di baris ${k.lamaMulai} (${k.lamaJumlah} baris).`,
      );
    } else if (k.baruMulai < p.baruMulai + Math.max(1, p.baruJumlah)) {
      galat.push(
        `Hunk #${i} tumpang tindih dengan hunk #${i - 1} di sisi baru: hunk #${i - 1} menempati baris ` +
          `${p.baruMulai}..${p.baruMulai + Math.max(1, p.baruJumlah) - 1} (${p.baruJumlah} baris), ` +
          `hunk #${i} mulai di baris ${k.baruMulai} (${k.baruJumlah} baris).`,
      );
    }
  }

  return { baris, blok, galat, biner, berkasGanda, tanpaNewlineAkhir };
}

/** Baris isi diff dari teks unified; melempar bila teksnya tidak sah. */
export function parseUnified(teksUnified: string): DiffRow[] {
  const u = uraiUnified(teksUnified);
  if (u.galat.length > 0) throw new HunkUnifiedError(u.galat.join(' '), 'unified-tidak-valid');
  return u.baris;
}

/** Daftar hunk dari teks unified-diff, siap ditampilkan. */
export function hunkUnified(teksUnified: string, status?: PetaStatus): HunkReview[] {
  const u = uraiUnified(teksUnified);
  if (u.galat.length > 0) throw new HunkUnifiedError(u.galat.join(' '), 'unified-tidak-valid');

  return u.blok.map((b, i) => {
    const baris = u.baris
      .slice(b.barisMulai, b.barisMulai + b.barisJumlah)
      .map(keBarisHunk);
    return {
      id: i,
      mulaiLama: b.lamaJumlah > 0 ? b.lamaMulai : null,
      jumlahLama: b.lamaJumlah,
      mulaiBaru: b.baruJumlah > 0 ? b.baruMulai : null,
      jumlahBaru: b.baruJumlah,
      tambah: baris.filter((x) => x.jenis === 'tambah').length,
      hapus: baris.filter((x) => x.jenis === 'hapus').length,
      status: status?.[i] ?? 'belum',
      baris,
    };
  });
}

/* ── Daftar hunk dari dua teks ───────────────────────────────────────────── */

/**
 * Daftar hunk dari sepasang isi berkas (lama → baru).
 *
 * Hunk di sini = rentetan baris berubah yang berdempetan, hasil `bagiHunk` di
 * simpleDiff, jadi id-nya sejajar dengan id yang dipakai `terapkanHunk`.
 */
export function hunkDariDuaTeks(lama: string, baru: string, status?: PetaStatus): HunkReview[] {
  const rows = barisDiff(lama, baru);
  return bagiHunk(rows).map((h) => {
    const baris = h.rows.map((i) => keBarisHunk(rows[i]));
    return {
      id: h.id,
      mulaiLama: mulaiPertama(baris, true),
      jumlahLama: baris.filter((b) => b.jenis !== 'tambah').length,
      mulaiBaru: mulaiPertama(baris, false),
      jumlahBaru: baris.filter((b) => b.jenis !== 'hapus').length,
      tambah: h.tambah,
      hapus: h.hapus,
      status: status?.[h.id] ?? 'belum',
      baris,
    };
  });
}

/* ── Terapkan-ulang ──────────────────────────────────────────────────────── */

/** Himpunan hunk yang diterima dari sebuah peta status. */
export function diterimaDari(status?: PetaStatus): Set<number> {
  const out = new Set<number>();
  if (!status) return out;
  for (const kunci of Object.keys(status)) {
    if (status[Number(kunci)] === 'terima') out.add(Number(kunci));
  }
  return out;
}

/** Teks hasil dari hunk yang DITERIMA saja (pemanggil punya kedua teks). */
export function terapkanHunkDuaTeks(
  lama: string,
  baru: string,
  diterima: ReadonlySet<number>,
): string {
  return terapkanHunk(barisDiff(lama, baru), diterima);
}

/** Terapkan berdasarkan peta status hunk (bukan himpunan id). */
export function terapkanStatusDuaTeks(lama: string, baru: string, status?: PetaStatus): string {
  return terapkanHunkDuaTeks(lama, baru, diterimaDari(status));
}

export interface OpsiTerap {
  /** sisi mana yang diwakili `isi`: 'lama' (default) atau 'baru'. */
  sisi?: Sisi;
}

/**
 * Susun teks hasil dari hunk yang diterima, dengan hanya SATU isi sebagai titik
 * tolak: `isi` adalah sisi lama (default) atau sisi baru dari diff.
 *
 * Yang terjadi per baris hunk, pada sisi 'lama':
 *   konteks → selalu keluar (tidak pernah jadi keputusan);
 *   tambah  → keluar bila hunk diterima;
 *   hapus   → keluar bila hunk DITOLAK (baris lama bertahan karena penghapusannya
 *             ditolak).
 * Pada sisi 'baru' cerminannya: tambah keluar bila hunk diterima, hapus keluar
 * bila hunk ditolak.
 *
 * Baris-baris di luar hunk disalin apa adanya, jadi hasilnya tetap berkas utuh —
 * bukan penggalan hunk. Akhir baris mengikuti `isi`, dan berkas ber-CRLF tetap
 * CRLF; khusus hunk yang habis tepat di akhir berkas, akhir barisnya mengikuti
 * sisi yang dipakai (`\ No newline at end of file` di diff), sehingga berkas baru
 * tidak kehilangan newline terakhirnya.
 */
export function terapkanUnifiedKeIsi(
  isi: string,
  teksUnified: string,
  diterima: ReadonlySet<number>,
  opsi?: OpsiTerap,
): string {
  const sisi: Sisi = opsi?.sisi ?? 'lama';
  const u = uraiUnified(teksUnified);
  if (u.galat.length > 0) throw new HunkUnifiedError(u.galat.join(' '), 'unified-tidak-valid');
  if (u.biner) {
    throw new HunkUnifiedError(
      'Diff berkas biner: tidak ada potongan yang bisa diterima/ditolak satu per satu.',
      'biner',
    );
  }

  const { baris: isiBaris, akhirBaris } = pisahBaris(isi);
  const crlf = isi.includes('\r\n');
  const keluar: string[] = [];
  let pos = 0;

  const cocok = (r: DiffRow, n: number, i: number): void => {
    const nyata = isiBaris[i];
    if (nyata === undefined || tanpaCR(nyata) !== tanpaCR(r.text)) {
      throw new HunkUnifiedError(
        `Isi sisi ${sisi} tidak cocok dengan diff pada hunk #${n} baris ${i + 1}: ` +
          `diff mengharapkan ${petik(r.text)}, isi nyata ` +
          `${nyata === undefined ? '(habis)' : petik(nyata)}. ` +
          'Muat ulang diff (berkas berubah setelah diff dibuka) lalu ulangi.',
        'isi-tak-cocok',
      );
    }
  };

  /* Baris dari diff tidak membawa `\r`; bila berkasnya CRLF, kembalikan `\r`-nya
   * supaya menulis hasil tidak mengubah gaya akhir baris seluruh berkas. */
  const tulis = (teks: string): void => {
    keluar.push(crlf && !teks.endsWith('\r') ? `${teks}\r` : teks);
  };

  for (let n = 0; n < u.blok.length; n += 1) {
    const b = u.blok[n];
    const mulai =
      sisi === 'lama' ? mulaiIndex(b.lamaMulai, b.lamaJumlah) : mulaiIndex(b.baruMulai, b.baruJumlah);

    if (mulai > isiBaris.length) {
      throw new HunkUnifiedError(
        `Diff melewati akhir isi: hunk #${n} mulai di baris ${mulai + 1}, ` +
          `isi hanya ${isiBaris.length} baris.`,
        'lewat-akhir',
      );
    }
    if (mulai < pos) {
      throw new HunkUnifiedError(
        `Hunk #${n} menimpa isi yang sudah dipakai hunk sebelumnya ` +
          `(mulai baris ${mulai + 1}, posisi baris ${pos + 1}).`,
        'tumpang-tindih',
      );
    }
    while (pos < mulai) {
      keluar.push(isiBaris[pos]);
      pos += 1;
    }

    const acc = diterima.has(n);
    for (const r of u.baris.slice(b.barisMulai, b.barisMulai + b.barisJumlah)) {
      if (r.kind === 'same') {
        cocok(r, n, pos);
        keluar.push(isiBaris[pos]);
        pos += 1;
      } else if (sisi === 'lama') {
        if (r.kind === 'del') {
          cocok(r, n, pos);
          if (!acc) keluar.push(isiBaris[pos]);
          pos += 1;
        } else if (acc) {
          tulis(r.text);
        }
      } else if (r.kind === 'add') {
        cocok(r, n, pos);
        if (acc) tulis(r.text);
        pos += 1;
      } else if (!acc) {
        tulis(r.text);
      }
    }
  }

  while (pos < isiBaris.length) {
    keluar.push(isiBaris[pos]);
    pos += 1;
  }

  /*
   * Akhir baris hasil. Bila masih ada ekor isi yang disalin, gaya akhir baris
   * isi itu yang berlaku. Bila hunk terakhir justru habis tepat di akhir berkas,
   * yang menentukan adalah sisi yang barusan dipakai: pada mode 'lama' hunk yang
   * DITERIMA berakhir di sisi baru, dan pada mode 'baru' hunk yang DITOLAK
   * berakhir di sisi lama. `\ No newline at end of file` hanya bisa dibaca dari
   * diff, jadi tanpa aturan ini berkas baru hasil terapan kehilangan newline
   * terakhirnya (atau mendapatkannya padahal aslinya tidak ada).
   */
  let akhir = akhirBaris;
  if (pos >= isiBaris.length && u.blok.length > 0) {
    const accTerakhir = diterima.has(u.blok.length - 1);
    const barisTerakhir = u.baris[u.baris.length - 1];
    if (sisi === 'lama' && accTerakhir && barisTerakhir?.kind === 'add') {
      akhir = !u.tanpaNewlineAkhir.baru;
    } else if (sisi === 'baru' && !accTerakhir && barisTerakhir?.kind === 'del') {
      akhir = !u.tanpaNewlineAkhir.lama;
    }
  }
  return gabungBaris(keluar, akhir);
}

/** Terapkan berdasarkan peta status hunk pada teks unified. */
export function terapkanStatusUnified(
  isi: string,
  teksUnified: string,
  status?: PetaStatus,
  opsi?: OpsiTerap,
): string {
  return terapkanUnifiedKeIsi(isi, teksUnified, diterimaDari(status), opsi);
}

/* ── Banyak berkas: siapa yang sudah selesai ─────────────────────────────── */

const ADA_BINER = /^\s*(Binary file|GIT binary patch)/m;

function hunkBerkas(b: BerkasReview): HunkReview[] {
  if (b.teksUnified !== undefined) return hunkUnified(b.teksUnified, b.status);
  return hunkDariDuaTeks(b.isiLama ?? '', b.isiBaru ?? '', b.status);
}

/** Status tinjauan satu berkas: berapa hunk sudah diputuskan, sudah selesai belum. */
export function statusBerkas(b: BerkasReview): StatusBerkas {
  const biner = b.teksUnified !== undefined && ADA_BINER.test(b.teksUnified);
  let hunk: HunkReview[] = [];
  let galat: string | null = null;
  try {
    hunk = hunkBerkas(b);
  } catch (e) {
    galat = e instanceof Error ? e.message : String(e);
  }

  let terima = 0;
  let tolak = 0;
  for (const h of hunk) {
    if (h.status === 'terima') terima += 1;
    else if (h.status === 'tolak') tolak += 1;
  }
  const belum = hunk.length - terima - tolak;

  return {
    path: b.path,
    jumlahHunk: hunk.length,
    terima,
    tolak,
    belum,
    selesai: galat === null && !biner && belum === 0,
    biner,
    galat,
  };
}

/** Status semua berkas sekaligus, urut seperti masukannya. */
export function statusSemuaBerkas(daftar: BerkasReview[]): StatusBerkas[] {
  return daftar.map(statusBerkas);
}

/** Path berkas yang SEMUA hunk-nya sudah diputuskan (terima atau tolak). */
export function berkasSelesai(daftar: BerkasReview[]): string[] {
  return statusSemuaBerkas(daftar)
    .filter((s) => s.selesai)
    .map((s) => s.path);
}

export function semuaBerkasSelesai(daftar: BerkasReview[]): boolean {
  return statusSemuaBerkas(daftar).every((s) => s.selesai);
}

/** Teks hasil satu berkas dari hunk yang diterima saja. */
export function terapkanBerkas(b: BerkasReview): HasilTerap {
  const diterima = diterimaDari(b.status);
  try {
    const isi =
      b.teksUnified !== undefined
        ? terapkanUnifiedKeIsi(
            (b.sisi === 'baru' ? b.isiBaru : b.isiLama) ?? '',
            b.teksUnified,
            diterima,
            { sisi: b.sisi },
          )
        : terapkanHunkDuaTeks(b.isiLama ?? '', b.isiBaru ?? '', diterima);
    return { path: b.path, isi, galat: null };
  } catch (e) {
    return { path: b.path, isi: '', galat: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Berkas yang perlu ditulis: hanya yang punya hunk diterima atau punya galat.
 * Berkas yang seluruh hunknya ditolak tidak pernah muncul di sini — menulisnya
 * berarti menulis ulang berkas tanpa satu pun perubahan yang diminta.
 */
export function hasilPerBerkas(daftar: BerkasReview[]): HasilTerap[] {
  const out: HasilTerap[] = [];
  for (const b of daftar) {
    const s = statusBerkas(b);
    if (s.terima === 0 && s.galat === null) continue;
    out.push(terapkanBerkas(b));
  }
  return out;
}
