/*
 * ghostPemasok.ts — seam PENYEDIA saran inline (ghost text) untuk item 175.
 *
 * Kenapa berkas ini ada
 * ---------------------
 * Di `src/lib/ghostText.ts`, `mintaSaran` (baris 208-262) memanggil `cmd.aiChat`
 * langsung: saran hanya bisa datang dari jaringan + kunci API. Akibatnya fitur
 * TIDAK bisa diuji tanpa model, dan tidak bisa diumpankan dari sumber lokal.
 * Modul ini memisahkan "dari mana saran datang" dari "bagaimana saran
 * ditampilkan" lewat satu seam murni yang bisa ditukar.
 *
 * Batas keras modul ini (dijaga harness `scripts/uji-ghost-pemasok.mjs`):
 *   - NOL jaringan: tidak ada `fetch`, `XMLHttpRequest`, `@tauri-apps/*`,
 *     `./commands`, `./aiStore`, React, atau DOM. Semua fungsi sinkron/pure.
 *   - DETERMINISTIK: tidak ada `Date.now()`, `Math.random()`, atau waktu lain.
 *     Input sama ⇒ keluaran sama (byte demi byte).
 *   - TERBATAS: panjang saran dibatasi `BATAS_PANJANG_SARAN`, konteks yang
 *     dibaca dibatasi `BATAS_KONTEKS_KARAKTER` / `BATAS_KONTEKS_BARIS`.
 *   - RAHASIA tidak bocor: apa pun yang dikembalikan pemasok disaring dulu
 *     (daftar rahasia eksplisit + pola kunci API yang dikenal).
 *
 * Default modul ini SENGAJA tidak menghasilkan saran apa pun (`PEMASOK_MATI`).
 * Perilaku lama (jaringan) tetap utuh karena `ghostText.ts` mendaftarkan
 * pemasok jaringannya sendiri lewat `setPemasokSaran(PEMASOK_JARINGAN)` —
 * lihat usulan tambalan di `docs/GHOST-175.md`. Dengan begitu, mengimpor modul
 * ini tidak pernah diam-diam memanggil jaringan.
 */

/* ------------------------------------------------------------------ *
 * Batas (semua terukur, bukan angka hiasan)
 * ------------------------------------------------------------------ */

/** Panjang maksimum satu saran (karakter). Lebih dari ini dipotong. */
export const BATAS_PANJANG_SARAN = 120;
/** Maksimum karakter konteks yang dibaca dari teks sebelum kursor. */
export const BATAS_KONTEKS_KARAKTER = 4000;
/** Maksimum baris konteks yang dibaca dari teks sebelum kursor. */
export const BATAS_KONTEKS_BARIS = 40;

/*
 * Snooze hidup di modul terpisah (tanpa impor) dan HANYA dipakai sebagai gerbang
 * di `ambilSaran`. Batas "nol jaringan / nol jam di fungsi murni" tetap dijaga:
 * tidak ada fungsi pure di bawah yang membaca waktu.
 */
import { ghostDitunda } from './ghostSnooze';
/** Baris yang lebih pendek dari ini (setelah trim) tidak diberi saran. */
export const PANJANG_MINIMUM = 3;
/** Penanda pengganti rahasia yang ditemukan di dalam saran. */
export const PENANDA_RAHASIA = '***';

/* ------------------------------------------------------------------ *
 * Bentuk data seam
 * ------------------------------------------------------------------ */

/** Kunci konteks kecil dari editor. Semua opsional; `{}` sah. */
export interface KunciKonteks {
  /** Jalur berkas aktif (dipakai sebagai cadangan penentu bahasa). */
  path?: string;
  /** Satuan indentasi editor (mis. '  ' atau '\t'); cadangan saat baris kosong. */
  indentasi?: string;
  /** Nilai yang TIDAK BOLEH muncul di saran (kunci API milik pengguna, dll). */
  rahasia?: readonly string[];
}

/** Input pemasok: teks sebelum kursor + bahasa + kunci konteks. */
export interface PermintaanSaran {
  sebelum: string;
  bahasa: string;
  kunci: KunciKonteks;
}

/** Usulan inline yang sudah dinormalkan oleh seam. */
export interface UsulanInline {
  /** Teks yang diusulkan. Tidak pernah kosong dan tidak pernah memuat rahasia. */
  teks: string;
  /** Awal rentang di `sebelum` yang DIGANTIKAN (offset absolut). */
  dari: number;
  /** Akhir rentang di `sebelum` yang digantikan. `dari === sampai` = sisip di kursor. */
  sampai: number;
  /** Label sebab: kenapa usulan ini muncul, atau sufiks '+dipotong'. */
  sebab: string;
}

/** Bentuk mentah yang boleh dikembalikan pemasok (longgar, biar mudah ditukar). */
export type SaranMentah =
  | string
  | { teks: string; dari?: number; sampai?: number; sebab?: string }
  | null;

export type PemasokSaran = (p: PermintaanSaran) =>
  | SaranMentah
  | Promise<SaranMentah>;

/* ------------------------------------------------------------------ *
 * Pemotongan konteks (batas yang dibaca)
 * ------------------------------------------------------------------ */

/**
 * Ambil ekor konteks: maksimum `BATAS_KONTEKS_BARIS` baris terakhir, lalu
 * maksimum `maksChar` karakter terakhir. Selalu berupa SUFIKSi dari `sebelum`
 * (tidak pernah mengubah teks, hanya memotong dari depan) sehingga offset
 * pemasok bisa digeser balik ke koordinat asli.
 */
export function potongKonteks(
  sebelum: string,
  maksChar: number = BATAS_KONTEKS_KARAKTER,
): string {
  const baris = sebelum.split('\n');
  let ekor = baris.slice(-BATAS_KONTEKS_BARIS).join('\n');
  if (ekor.length > maksChar) {
    const potong = ekor.slice(ekor.length - maksChar);
    const nl = potong.indexOf('\n');
    /* Buang baris pertama yang terpotong di tengah supaya yang dibaca utuh. */
    ekor = nl >= 0 && nl < potong.length - 1 ? potong.slice(nl + 1) : potong;
  }
  return ekor;
}

/* ------------------------------------------------------------------ *
 * Penyaring rahasia + pemotong panjang
 * ------------------------------------------------------------------ */

/** Bentuk kunci API yang dikenal. Sengaja longgar supaya gampang ditambah. */
const POLA_RAHASIA: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI / Anthropic (sk-, sk-ant-...)
  /\b[a-z]{2,4}_(?:live|test)_[A-Za-z0-9]{12,}/g, // Stripe-like
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bghp_[A-Za-z0-9]{20,}/g, // GitHub personal token
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/g, // Google API key
  /\bBearer\s+[A-Za-z0-9._-]{16,}/g, // header Authorization
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, // kunci privat
  // `apiKey = "..."` / `API_KEY: '...'` dengan nilai cukup panjang.
  /(?:api[_-]?key|token|secret)\s*[:=]\s*['"][^'"\n]{12,}['"]/gi,
];

/**
 * Ganti setiap rahasia dengan `PENANDA_RAHASIA`.
 *
 * Dua lapis: (1) daftar eksplisit dari `kunci.rahasia` — nilai yang pengguna
 * sendiri tandai, dicocokkan apa adanya (tanpa regex, jadi aman dari karakter
 * aneh); (2) pola kunci API yang dikenal, supaya pemasok tidak bisa membocorkan
 * kunci yang tidak terdaftar (mis. hasil mengulang konteks apa adanya).
 */
export function saringRahasia(teks: string, rahasia: readonly string[] = []): string {
  let hasil = teks;
  for (const r of rahasia) {
    if (!r || r.length < 4) continue;
    hasil = hasil.split(r).join(PENANDA_RAHASIA);
  }
  for (const pola of POLA_RAHASIA) {
    hasil = hasil.replace(pola, PENANDA_RAHASIA);
  }
  return hasil;
}

/**
 * Potong saran yang kepanjangan. Dipotong di batas spasi terakhir bila masih
 * menyisakan >= 60% panjang, kalau tidak dipotong keras — supaya saran tidak
 * berakhir di tengah pengenal yang tampak seperti kode rusak.
 */
export function potongSaran(
  teks: string,
  batas: number = BATAS_PANJANG_SARAN,
): { teks: string; dipotong: boolean } {
  if (teks.length <= batas) return { teks, dipotong: false };
  const kepala = teks.slice(0, batas);
  const sp = Math.max(
    kepala.lastIndexOf(' '),
    kepala.lastIndexOf('\n'),
    kepala.lastIndexOf('\t'),
  );
  const inti = sp >= Math.floor(batas * 0.6) ? kepala.slice(0, sp) : kepala;
  return { teks: inti.replace(/[ \t]+$/, ''), dipotong: true };
}

/* ------------------------------------------------------------------ *
 * Pemasok LOKAL (heuristik, tanpa jaringan)
 * ------------------------------------------------------------------ */

/** Penutup badan blok per bahasa. */
const PENUTUP_BADAN: Readonly<Record<string, string>> = {
  ts: ' {',
  js: ' {',
  java: ' {',
  go: ' {',
  c: ' {',
  rust: ' {',
  py: ':',
};

/** Kata yang biasa diakhiri ` {` / `:` dan belum punya badan. */
const KATA_KUNCI_BADAN: readonly string[] = ['else', 'try', 'do', 'finally'];

/** Normalkan nama bahasa (atau ekstensi berkas) menjadi satu kode. */
export function bahasaNormal(bahasa: string): string {
  const b = String(bahasa ?? '').toLowerCase().replace(/^\./, '');
  if (/^(ts|tsx|typescript|mts|cts)$/.test(b)) return 'ts';
  if (/^(js|jsx|javascript|mjs|cjs)$/.test(b)) return 'js';
  if (/^(py|pyi|python)$/.test(b)) return 'py';
  if (/^(rs|rust)$/.test(b)) return 'rust';
  if (/^(go|golang)$/.test(b)) return 'go';
  if (/^(java|kt|kotlin)$/.test(b)) return 'java';
  if (/^(c|h|cpp|cc|hpp|cs)$/.test(b)) return 'c';
  return b || 'plain';
}

function indentasiDari(baris: string): string {
  const i = baris.length - baris.trimStart().length;
  return baris.slice(0, i);
}

/** Heuristik 1: lanjutkan baris yang polanya sama persis di atas kursor. */
function ulangiBarisAtas(sebelum: string): { teks: string; sebab: string } | null {
  const baris = sebelum.split('\n');
  const kini = baris[baris.length - 1] ?? '';
  const inti = kini.trim();
  if (inti.length < PANJANG_MINIMUM) return null;
  const indent = indentasiDari(kini);

  for (let i = baris.length - 2; i >= 0; i--) {
    const l = baris[i];
    if (!l.trim()) continue;
    if (indentasiDari(l) !== indent) continue;
    const lInti = l.trim();
    if (lInti.length > inti.length && lInti.startsWith(inti)) {
      return { teks: lInti.slice(inti.length), sebab: 'ulangi-baris-atas' };
    }
  }
  return null;
}

/** Heuristik 2: tutup pasangan yang masih terbuka di ujung baris. */
function tutupPasangan(
  sebelum: string,
  kunci: KunciKonteks,
): { teks: string; sebab: string } | null {
  const baris = sebelum.split('\n');
  const kini = baris[baris.length - 1] ?? '';
  const inti = kini.trimEnd();
  if (!inti) return null;
  const indent = indentasiDari(kini) || kunci.indentasi || '';
  const ujung = inti[inti.length - 1];
  if (ujung === '{') return { teks: `\n${indent}}`, sebab: 'tutup-blok' };
  if (ujung === '(') return { teks: ')', sebab: 'tutup-kurung' };
  if (ujung === '[') return { teks: ']', sebab: 'tutup-kurung' };
  return null;
}

/** Heuristik 3: kata kunci yang menunggu badan (`else`, `try`, ...). */
function badanKataKunci(
  sebelum: string,
  bahasa: string,
): { teks: string; sebab: string } | null {
  const baris = sebelum.split('\n');
  const inti = (baris[baris.length - 1] ?? '').trimEnd();
  if (!inti) return null;
  const kata = inti.split(/\s+/).pop() ?? '';
  if (!KATA_KUNCI_BADAN.includes(kata)) return null;
  const b = bahasaNormal(bahasa);
  return { teks: PENUTUP_BADAN[b] ?? ' {', sebab: `kata-kunci:${b}` };
}

/**
 * Pemasok lokal: tiga heuristik murni, tanpa jaringan dan tanpa model.
 * Urutan tetap (deterministik): tutup pasangan → badan kata kunci → ulangi
 * baris atas. Tidak ada satu pun cabang yang melihat waktu atau acak.
 */
export const PEMASOK_LOKAL: PemasokSaran = (p: PermintaanSaran): SaranMentah => {
  const bahasa = p.bahasa || (p.kunci.path ? p.kunci.path.split('.').pop() ?? '' : '');
  const sebelum = p.sebelum ?? '';
  const intiBaris = (sebelum.split('\n').pop() ?? '').trim();
  if (intiBaris.length < PANJANG_MINIMUM) return null;

  const kandidat =
    tutupPasangan(sebelum, p.kunci) ??
    badanKataKunci(sebelum, bahasa) ??
    ulangiBarisAtas(sebelum);
  return kandidat ?? null;
};

/** Pemasok mati: selalu `null`. Ini default modul (tanpa jaringan). */
export const PEMASOK_MATI: PemasokSaran = () => null;

/* ------------------------------------------------------------------ *
 * Jalur hidup/mati + tukar-jalan pemasok
 * ------------------------------------------------------------------ */

let aktifPemasok: PemasokSaran = PEMASOK_MATI;
let hidup = true;

/** Pasang pemasok aktif. `null` mengembalikan default (mati, tanpa saran). */
export function setPemasokSaran(fn: PemasokSaran | null): void {
  aktifPemasok = fn ?? PEMASOK_MATI;
}

/** Pemasok yang sedang aktif. */
export function pemasokSaran(): PemasokSaran {
  return aktifPemasok;
}

/** Hidupkan/matikan fitur di level seam. */
export function setGhostAktif(on: boolean): void {
  hidup = Boolean(on);
}

/** Apakah seam hidup? */
export function ghostAktif(): boolean {
  return hidup;
}

/** Kembalikan seam ke keadaan awal (pemasok mati, hidup). Dipakai uji/teardown. */
export function aturUlangGhost(): void {
  aktifPemasok = PEMASOK_MATI;
  hidup = true;
}

/* ------------------------------------------------------------------ *
 * Jalur utama: minta saran (tanpa jaringan)
 * ------------------------------------------------------------------ */

function keUsulan(
  mentah: SaranMentah,
  sebelum: string,
  konteks: string,
  kunci: KunciKonteks,
): UsulanInline | null {
  const obj = typeof mentah === 'string' ? { teks: mentah } : mentah;
  if (!obj || typeof obj.teks !== 'string') return null;

  const bersih = saringRahasia(obj.teks, kunci.rahasia ?? []);
  /* Saran yang tinggal spasi/kosong bukan saran. */
  if (!bersih.trim()) return null;

  const { teks, dipotong } = potongSaran(bersih);
  if (!teks.trim()) return null;

  /* Offset pemasok relatif terhadap konteks yang DIPOTONG; geser balik ke
   * koordinat `sebelum` asli supaya rentang yang digantikan tetap benar. */
  const geser = sebelum.length - konteks.length;
  const panjangKonteks = konteks.length;
  const mentahDari = typeof obj.dari === 'number' ? obj.dari : panjangKonteks;
  const mentahSampai = typeof obj.sampai === 'number' ? obj.sampai : mentahDari;
  const batas = (n: number) => Math.max(0, Math.min(sebelum.length, Math.round(n)));
  const dari = batas(geser + mentahDari);
  const sampai = Math.max(dari, batas(geser + mentahSampai));

  const sebabDasar = obj.sebab && obj.sebab.trim() ? obj.sebab.trim() : 'pemasok';
  return {
    teks,
    dari,
    sampai,
    sebab: dipotong ? `${sebabDasar}+dipotong` : sebabDasar,
  };
}

/**
 * Minta saran dari pemasok aktif. Selalu `null` saat seam dimatikan. Pemasok
 * yang melempar TIDAK menjatuhkan pemanggil: hasilnya `null` (editor tidak
 * boleh mati gara-gara penyedia saran gagal).
 */
export async function ambilSaran(
  sebelum: string,
  bahasa: string,
  kunci: KunciKonteks = {},
): Promise<UsulanInline | null> {
  if (!hidup) return null;
  /* Snooze berlaku juga untuk saran lokal (tanpa jaringan). */
  if (ghostDitunda()) return null;
  const konteks = potongKonteks(sebelum);
  let mentah: SaranMentah = null;
  try {
    mentah = await aktifPemasok({ sebelum: konteks, bahasa, kunci });
  } catch {
    return null;
  }
  return keUsulan(mentah, sebelum, konteks, kunci);
}

/* ------------------------------------------------------------------ *
 * Jalur terima/tolak (fungsi murni, mengembalikan keadaan SESUDAHNYA)
 * ------------------------------------------------------------------ */

/** Keadaan saran yang menunggu keputusan pengguna. */
export interface KeadaanSaran {
  /** Fitur hidup? Saat mati, terima/tolak tidak mengubah apa pun. */
  aktif: boolean;
  /** Usulan yang sedang ditampilkan, atau `null`. */
  menunggu: UsulanInline | null;
  /** Berapa kali pengguna menerima (jejak untuk UI/uji). */
  diterima: number;
  /** Berapa kali pengguna menolak. */
  ditolak: number;
}

export function keadaanAwal(aktif = true): KeadaanSaran {
  return { aktif, menunggu: null, diterima: 0, ditolak: 0 };
}

/** Pasang usulan sebagai yang menunggu (mis. sesudah `ambilSaran`). */
export function pasangSaran(
  keadaan: KeadaanSaran,
  usulan: UsulanInline | null,
): KeadaanSaran {
  return { ...keadaan, menunggu: usulan };
}

/** Hasil satu keputusan: keadaan sesudahnya + teks dokumen sesudahnya. */
export interface HasilKeputusan {
  keadaan: KeadaanSaran;
  /** Teks sebelum kursor setelah keputusan (tolak = identik dengan semula). */
  teks: string;
  /** Apakah saran benar-benar diterapkan. */
  diterapkan: boolean;
}

/**
 * Terima saran: ganti rentang `[dari, sampai)` di `sebelum` dengan teks saran,
 * lalu bersihkan yang menunggu dan catat penerimaan.
 */
export function terimaSaran(sebelum: string, keadaan: KeadaanSaran): HasilKeputusan {
  const u = keadaan.menunggu;
  if (!keadaan.aktif || !u) return { keadaan, teks: sebelum, diterapkan: false };
  const dari = Math.max(0, Math.min(sebelum.length, u.dari));
  const sampai = Math.max(dari, Math.min(sebelum.length, u.sampai));
  const teks = sebelum.slice(0, dari) + u.teks + sebelum.slice(sampai);
  return {
    keadaan: { ...keadaan, menunggu: null, diterima: keadaan.diterima + 1 },
    teks,
    diterapkan: true,
  };
}

/**
 * Tolak saran: teks kembali seperti semula (tidak ada perubahan dokumen), yang
 * menunggu dibersihkan, penolakan dicatat.
 */
export function tolakSaran(sebelum: string, keadaan: KeadaanSaran): HasilKeputusan {
  if (!keadaan.aktif || !keadaan.menunggu) {
    return { keadaan, teks: sebelum, diterapkan: false };
  }
  return {
    keadaan: { ...keadaan, menunggu: null, ditolak: keadaan.ditolak + 1 },
    teks: sebelum,
    diterapkan: false,
  };
}
