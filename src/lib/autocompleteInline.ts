/*
 * Autocomplete inline — perencana permintaan + pengatur laju (governor).
 *
 * Ini menutup celah yang BELUM ada di mesin ghost text yang sudah hidup di repo
 * (`src/lib/ghostText.ts`, `src/lib/ghostPemasok.ts`,
 * `src/components/editor/dekorasiCopilot.ts`). Tiga mesin itu sudah punya jendela
 * konteks, debounce, batal-saat-ketik, dan sakelar on/off — tetapi TIDAK ada:
 *
 *   1. single-flight — penjaga agar permintaan kedua tidak menumpuk saat satu
 *      permintaan masih di jalan;
 *   2. anggaran byte terukur untuk BADAN yang benar-benar keluar, sehingga
 *      "berkas penuh tidak pernah dikirim" bisa diuji apa adanya.
 *
 * Modul ini murni dan sinkron (tanpa jaringan, tanpa timer, tanpa I/O), sehingga
 * bisa dijalankan di Node lewat harness `esbuild` tanpa Tauri maupun DOM hidup —
 * dan di front-end ia hanya mengisi dua peran itu tanpa mengubah jalur lama.
 *
 * Aturan yang ditegakkan (semuanya terukur):
 *   - Kirim JENDELA saja: sufiks baris/karakter terbatas, tidak pernah berkas
 *     penuh, tidak pernah seluruh dokumen.
 *   - Anggaran byte: `byte` = ukuran UTF-8 badan JSON yang keluar; dijaga
 *     <= `BATAS_BYTE_PAYLOAD` dengan memangkas jendela dari depan (deterministik).
 *   - Rahasia: nilai yang diberikan disamarkan dulu (pakai `saringRahasia`).
 *   - Determinisme: masukan sama -> badan & byte sama, tak ada Date/Math.random.
 *   - On/off: `keadaanAwal(false)` -> nol permintaan (alasan `mati`).
 *   - Single-flight: ada yang di jalan -> permintaan berikut ditolak (`terbang`).
 *   - Batal saat ketik: tiket generasi lama -> ditolak (`batal-ketik`).
 */

import { saringRahasia } from './ghostPemasok';

/** Jeda debounce yang disarankan (ms) sebelum permintaan benar-benar keluar. */
export const JEDA_MS = 220;

/** Batas keras ukuran BADAN permintaan, dalam byte UTF-8. */
export const BATAS_BYTE_PAYLOAD = 2048;

/** Jendela konteks: maksimum baris yang disertakan. */
export const BATAS_JENDELA_BARIS = 12;

/** Jendela konteks: maksimum karakter yang disertakan. */
export const BATAS_JENDELA_KARAKTER = 1200;

/** Panjang minimum baris-kursor (setelah trim) agar saran berharga diminta. */
export const PANJANG_MINIMUM_BARIS = 3;

/** Ukuran byte UTF-8 dari `teks`. */
export function bytePanjang(teks: string): number {
  return new TextEncoder().encode(teks).length;
}

/**
 * Jendela konteks: SUFIK pada kursor, dibatasi baris dan karakter.
 *
 * Dibangun dari ekor berkas ke belakang, jadi ia tidak pernah memuat seluruh
 * dokumen — hanya bagian tepat sebelum kursor, yang relevan untuk saran.
 */
export function jendelaKonteks(
  sebelum: string,
  maksBaris: number = BATAS_JENDELA_BARIS,
  maksChar: number = BATAS_JENDELA_KARAKTER,
): string {
  const teks = String(sebelum ?? '');
  const baris = teks.split('\n');
  const ambil = Math.max(1, Math.floor(maksBaris));
  let ekor = baris.slice(Math.max(0, baris.length - ambil)).join('\n');
  const batasChar = Math.max(1, Math.floor(maksChar));
  if (ekor.length > batasChar) {
    const potong = ekor.slice(ekor.length - batasChar);
    /* Buang sisa baris pertama yang terpenggal agar jendela mulai di batas baris. */
    const nl = potong.indexOf('\n');
    ekor = nl >= 0 && nl < potong.length - 1 ? potong.slice(nl + 1) : potong;
  }
  return ekor;
}

export interface PermintaanInline {
  /** Badan yang benar-benar keluar ke pemasok (JSON deterministik). */
  badan: string;
  /** Ukuran `badan` dalam byte UTF-8 — angka yang diaudit. */
  byte: number;
  /** Jendela konteks kecil yang ikut terkirim. */
  jendela: string;
  /** Bahasa yang dilaporkan. */
  bahasa: string;
  /** Nomor baris 1-basis posisi kursor (bukan seluruh berkas). */
  baris: number;
}

export interface OpsiPermintaan {
  /** Bahasa berkas (mis. dari ekstensi). Bawaan `plain`. */
  bahasa?: string;
  /** Nilai rahasia yang, bila muncul di jendela, disamarkan sebelum keluar. */
  rahasia?: readonly string[];
}

/**
 * Bangun permintaan inline untuk teks sebelum kursor.
 *
 * Mengembalikan `null` bila baris-kursor terlalu pendek untuk diminta (hemat:
 * tidak ada permintaan untuk ketikan yang tak berharga), atau bila tidak aktif —
 * pemanggil yang mengurus on/off lewat `putuskanKirim`. Bila jendela mula-mula
 * melebihi anggaran byte (mis. berkas penuh karakter lebar), ia dipangkas dari
 * depan sampai muat, jadi `byte` SELALU <= `BATAS_BYTE_PAYLOAD`.
 */
export function bangunPermintaan(
  sebelum: string,
  opsi: OpsiPermintaan = {},
): PermintaanInline | null {
  const teks = String(sebelum ?? '');
  const barisSemua = teks.split('\n');
  const barisKini = barisSemua[barisSemua.length - 1] ?? '';
  if (barisKini.trim().length < PANJANG_MINIMUM_BARIS) return null;

  const bahasa = String(opsi.bahasa ?? 'plain');
  const noBaris = barisSemua.length;
  const rakit = (jendela: string) =>
    JSON.stringify({ bahasa, baris: noBaris, jendela });

  let jendela = saringRahasia(jendelaKonteks(teks), opsi.rahasia ?? []);
  let badan = rakit(jendela);
  let byte = bytePanjang(badan);

  /* Pangkas dari depan sampai muat. Jendela menyusut >= 1 char tiap iterasi,
   * jadi loop pasti berhenti. Pangkas di batas baris bila memungkinkan. */
  while (byte > BATAS_BYTE_PAYLOAD && jendela.length > 0) {
    const kelebihan = byte - BATAS_BYTE_PAYLOAD;
    const buang = Math.max(1, Math.min(jendela.length, kelebihan));
    let sisa = jendela.slice(buang);
    const nl = sisa.indexOf('\n');
    if (nl >= 0 && nl < sisa.length - 1) sisa = sisa.slice(nl + 1);
    if (sisa === jendela) sisa = jendela.slice(1);
    jendela = sisa;
    badan = rakit(jendela);
    byte = bytePanjang(badan);
  }

  return { badan, byte, jendela, bahasa, baris: noBaris };
}

/* ------------------------------------------------------------------------- *
 * Governor — sakelar on/off, single-flight, dan batal-saat-ketik.
 *
 * Ini adalah bentuk yang diuji; pemanggil di editor (lihat USULAN) menyimpan
 * satu `KeadaanInline` di closure dan meneruskan tiket generasi saat jadwal
 * debounce jatuh tempo. Tidak ada timer di sini — jeda ada di pemanggil, jadi
 * keputusan bisa diuji deterministik.
 * ------------------------------------------------------------------------- */

export interface KeadaanInline {
  /** Sakelar on/off. Saat `false`: nol permintaan keluar. */
  aktif: boolean;
  /** Naik satu tiap ketikan. Tiket yang lebih tua jadi basi (batal debounce). */
  generasi: number;
  /** Ada permintaan sedang di jalan (penjaga single-flight). */
  terbang: boolean;
}

export function keadaanAwal(aktif = true): KeadaanInline {
  return { aktif: !!aktif, generasi: 0, terbang: false };
}

/** Catat satu ketikan: semua tiket lama (permintaan menunggu) jadi basi. */
export function ketik(k: KeadaanInline): KeadaanInline {
  return { aktif: k.aktif, generasi: k.generasi + 1, terbang: k.terbang };
}

/** Ambil tiket untuk permintaan yang DIJADWALKAN sekarang. */
export function tiket(k: KeadaanInline): number {
  return k.generasi;
}

export type AlasanInline = 'ok' | 'mati' | 'batal-ketik' | 'terbang';

export interface KeputusanInline {
  kirim: boolean;
  alasan: AlasanInline;
}

/**
 * Putuskan apakah sebuah tiket boleh keluar SEKARANG.
 *
 * Urutan pemeriksaan penting: mati dulu (nol jaringan), lalu basi (user mengetik
 * lewat), lalu single-flight (jangan menumpuk).
 */
export function putuskanKirim(k: KeadaanInline, tiketJadwal: number): KeputusanInline {
  if (!k.aktif) return { kirim: false, alasan: 'mati' };
  if (k.generasi !== tiketJadwal) return { kirim: false, alasan: 'batal-ketik' };
  if (k.terbang) return { kirim: false, alasan: 'terbang' };
  return { kirim: true, alasan: 'ok' };
}

/** Tandai satu permintaan mulai berjalan. */
export function mulaiKirim(k: KeadaanInline): KeadaanInline {
  return { aktif: k.aktif, generasi: k.generasi, terbang: true };
}

/** Tandai permintaan selesai (berhasil, gagal, atau dibuang). */
export function selesaiKirim(k: KeadaanInline): KeadaanInline {
  return { aktif: k.aktif, generasi: k.generasi, terbang: false };
}

/** Nyalakan/matikan sakelar. Mematikan juga membatalkan yang sedang terbang. */
export function setAktif(k: KeadaanInline, aktif: boolean): KeadaanInline {
  return { aktif: !!aktif, generasi: k.generasi, terbang: aktif ? k.terbang : false };
}
