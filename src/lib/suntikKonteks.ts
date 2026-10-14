/*
 * suntikKonteks.ts — menyusun SATU giliran agen dari tiga sumber.
 *
 * Masalah nyata yang file ini jawab: giliran agen dikirim ke provider sebagai
 * DAFTAR PESAN, dan tiga hal yang seharusnya ada di situ berasal dari tiga tempat
 * berbeda yang tidak saling tahu:
 *
 *   (a) riwayat percakapan  - yang sudah dibicarakan (bisa sangat panjang),
 *   (b) antrean pesan       - pesan yang diketik user SELAGI agen bekerja
 *                             (`src/lib/antreanPesan.ts`),
 *   (c) `.zephyr-context.md` - konteks workspace yang dikelola aplikasi
 *                             (`src/lib/konteksZephyr.ts`).
 *
 * Cara menyusunnya pernah salah dengan tiga akibat yang semuanya nyata:
 *   1. permintaan yang belum selesai HILANG saat riwayat dipotong untuk muat
 *      anggaran ukuran - user merasa sudah minta, agen tidak pernah mengerjakan;
 *   2. urutannya kacau (permintaan sekarang di depan, konteks di belakang, pesan
 *      antrean diselipkan di tengah riwayat), sehingga "lanjutkan" diproses
 *      sebelum perintah yang sebenarnya diminta lebih dulu;
 *   3. pemotongan dilakukan DIAM-DIAM: yang hilang tidak dilaporkan ke siapa pun,
 *      jadi tidak ada yang tahu jawabannya berubah karena anggaran.
 *
 * Karena itu seluruh aturan penyusunan dipisah ke sini sebagai fungsi MURNI:
 * tanpa Tauri, tanpa React, tanpa IO. Bahan datang sebagai argumen (riwayat,
 * keadaan antrean, isi berkas konteks) dan hasilnya adalah daftar pesan siap
 * kirim + LAPORAN apa yang diringkas/dibuang - pemotongan yang tidak terlihat
 * adalah pemotongan yang akan dicari user berjam-jam.
 *
 * ATURAN WAJIB yang dijaga modul ini:
 *   (i)   pekerjaan yang BELUM selesai (pesan mengantre, tugas yang belum beres,
 *         permintaan giliran ini) TIDAK PERNAH dibuang dan TIDAK PERNAH
 *         dipotong; kalau anggaran tidak cukup, yang dipotong adalah KONTEKS dan
 *         RIWAYAT, dan kelebihannya dilaporkan apa adanya (`melebihiAnggaran`).
 *   (ii)  urutannya: konteks -> riwayat -> pesan mengantre -> tugas belum selesai
 *         -> permintaan sekarang (terakhir, supaya giliran ini ditutup oleh
 *         pertanyaan yang sedang dijawab).
 *   (iii) pemotongan deterministik: ringkas dulu (dari riwayat TERLAMA), baru
 *         buang (riwayat terlamu dulu), lalu ringkas konteks, lalu buang konteks
 *         (konteks bisa dibuat ulang; permintaan tidak). Tidak ada yang senyap:
 *         setiap pemotongan masuk `laporan.diringkas` / `laporan.dibuang`.
 *   (iv)  rahasia tetap tersensor: SEMUA teks yang masuk ke daftar pesan lewat
 *         `saring()` dari `konteksZephyr.ts` lebih dulu. Tidak ada jalur tunda
 *         (mis. "konteks langsung saja") yang melewati penyaring itu, karena
 *         pernah terjadi: nilai `.env` ikut terkirim ke provider hanya karena
 *         diambil dari variabel lain.
 *
 * Idempotensi: fungsi ini tidak menyimpan keadaan apa pun. Memanggilnya dua kali
 * dengan bahan yang sama menghasilkan keluaran yang identik (dipakai sebagai uji:
 * dua giliran berturut-turut tidak boleh menggandakan pesan).
 *
 * Modul ini sekarang DISAMBUNGKAN ke `src/lib/aiStore.ts`: saat agen sedang bekerja
 * dan user mengetik pesan baru, giliran yang dikerjakan disusun dari antrean lewat
 * `giliranAntreanKeRiwayat` di bawah. Penyambungannya sengaja sempit - satu fungsi
 * pemanggil di store, satu titik sisip (`sisipKeDepanEkor`) - supaya susunan giliran
 * tetap satu tempat dan tidak lahir penyusun kedua di dalam store.
 */

import type { KeadaanAntrean, PesanAntrean } from './antreanPesan.ts';
import { saring, type TemuanRahasia } from './konteksZephyr.ts';

/** Anggaran byte untuk satu giliran yang dikirim ke provider. */
export const BATAS_BYTE_GILIRAN = 64 * 1024;

/** Riwayat yang lebih panjang dari ini diringkas lebih dulu (dari yang paling tua). */
export const RINGKAS_RIWAYAT_BYTE = 800;

/** Konteks workspace yang lebih panjang dari ini dipotong di batas baris. */
export const RINGKAS_KONTEKS_BYTE = 4 * 1024;

/** Perkiraan biaya tetap satu pesan di wire (peran + pembungkus). */
export const BIAYA_PESAN = 24;

/** Kepala blok konteks - ditulis eksplisit supaya model tahu dari mana isinya. */
export const KEPALA_KONTEKS =
  'Konteks workspace (.zephyr-context.md) - sudah otomatis dimuat, jangan minta user mengulang:';

/** Kepala blok tugas - mengingatkan bahwa ini BELUM beres. */
export const AWALAN_TUGAS = 'Tugas yang BELUM selesai - kerjakan sampai benar-benar beres:';

/** Dari mana satu blok pesan berasal. */
export type AsalPesan = 'konteks' | 'riwayat' | 'antrean' | 'tugas' | 'permintaan';

export type PeranPesan = 'system' | 'user' | 'assistant';

/** Satu pesan percakapan yang sudah ada (dari panel/riwayat sesi). */
export interface PesanRiwayat {
  id: string;
  peran: 'user' | 'assistant';
  teks: string;
}

/** Satu pesan masuk dari user (dipakai untuk permintaan giliran ini). */
export interface PesanMasuk {
  id: string;
  teks: string;
  images?: readonly string[];
}

/**
 * Semua bahan giliran. Bentuk `antrean` sengaja memakai `KeadaanAntrean` dari
 * `antreanPesan.ts` apa adanya - bukan salinan bentuk sendiri - supaya aturan
 * antrean (id stabil, urutan hasil promosikan, batas 20 pesan) tidak disalin dua
 * kali dan tidak bisa berbenturan.
 */
export interface BahanGiliran {
  /** Isi `.zephyr-context.md` (null/kosong = berkas belum ada; itu bukan error). */
  konteks?: string | null;
  /** Percakapan yang sudah ada, TERLAMA -> TERBARU. */
  riwayat?: readonly PesanRiwayat[];
  /** Keadaan antrean dari `src/lib/antreanPesan.ts`. */
  antrean?: KeadaanAntrean | null;
  /** Tugas yang diketahui belum selesai (mis. todo agen yang belum `done`). */
  tugasBelumSelesai?: readonly string[];
  /** Permintaan yang memicu giliran ini. */
  permintaan: PesanMasuk;
  /** Anggaran byte; default `BATAS_BYTE_GILIRAN`. Dipakai uji dengan nilai kecil. */
  batasByte?: number;
}

/** Satu pesan siap kirim. */
export interface PesanGiliran {
  /** Id stabil + ber-prefix asal, mis. `antrean:p3-1ab`, `minta:p4-2cd`. */
  id: string;
  peran: PeranPesan;
  asal: AsalPesan;
  teks: string;
  /**
   * `true` = pekerjaan yang belum selesai. Blok wajib tidak pernah dibuang dan
   * tidak pernah dipotong, walau anggaran byte sudah habis.
   */
  wajib: boolean;
  /** Byte isi SEMULA; ada kalau blok ini sudah diringkas. */
  ringkasDari?: number;
}

/** Catatan satu blok yang diringkas (dipotong sebagian, isinya masih ada). */
export interface RingkasanPotong {
  id: string;
  asal: AsalPesan;
  dariByte: number;
  keByte: number;
}

/** Catatan satu blok yang DIBUANG seluruhnya. */
export interface ItemDibuang {
  id: string;
  asal: AsalPesan;
  byte: number;
  sebab: 'anggaran-ukuran';
}

/** Apa yang terjadi pada giliran ini - dibaca UI/log, bukan ditebak. */
export interface LaporanSuntik {
  byteTotal: number;
  batasByte: number;
  /** `false` = anggaran dilewati karena blok wajib dibawa utuh. */
  muat: boolean;
  jumlahPesan: number;
  diringkas: RingkasanPotong[];
  dibuang: ItemDibuang[];
  /** Jumlah pekerjaan belum selesai yang tetap ada di keluaran. */
  tugasTerjaga: number;
  /** `true` = blok wajib sendiri sudah melebihi anggaran (dilaporkan, tidak dipotong). */
  melebihiAnggaran: boolean;
  /** Pesan yang muncul dari dua sumber sekaligus dan digabung jadi satu. */
  digabung: string[];
  /** Temuan rahasia; `contoh` sudah disensor - nilai aslinya tidak pernah ikut. */
  rahasia: TemuanRahasia[];
  /** Hal yang perlu dibaca manusia: konteks hilang, antrean tak terpakai, dll. */
  peringatan: string[];
}

export interface HasilSuntik {
  pesan: PesanGiliran[];
  laporan: LaporanSuntik;
}

export interface HasilPotongTeks {
  teks: string;
  terpotong: boolean;
  byteDibuang: number;
}

const encoder = new TextEncoder();

/** Ukuran byte UTF-8 sebuah teks (sama dengan ukuran di wire). */
export function byteTeks(teks: string): number {
  return encoder.encode(teks).length;
}

/**
 * Potong teks ke anggaran BYTE, sedapat mungkin di BATAS BARIS, lalu tandai.
 *
 * Dipotong di batas baris karena memotong di tengah baris bisa membelah sebuah
 * rahasia jadi dua potongan yang tidak lagi dikenali penyaring rahasia - dan
 * potongan yang tidak terlihat adalah potongan yang dicari user berjam-jam.
 * Berhenti di batas baris hanya kalau batas itu masih menyisakan >= 60% isi;
 * kalau tidak, potongan lurus lebih baik daripada kehilangan hampir semuanya.
 */
export function potongByte(teks: string, batas: number): HasilPotongTeks {
  const total = byteTeks(teks);
  if (total <= batas) return { teks, terpotong: false, byteDibuang: 0 };

  const titik = Array.from(teks);
  const batasAman = Math.max(0, batas);
  let dipakai = 0;
  let n = 0;
  while (n < titik.length) {
    const b = byteTeks(titik[n]);
    if (dipakai + b > batasAman) break;
    dipakai += b;
    n += 1;
  }
  const mentah = titik.slice(0, n).join('');
  const baris = mentah.lastIndexOf('\n');
  const kepala = baris > n * 0.6 ? mentah.slice(0, baris) : mentah;
  const byteKepala = byteTeks(kepala);
  const byteDibuang = total - byteKepala;
  return {
    teks: `${kepala}\n[… ringkas: ${byteDibuang} byte terakhir tidak dimuat]`,
    terpotong: true,
    byteDibuang,
  };
}

interface Blok {
  id: string;
  peran: PeranPesan;
  asal: AsalPesan;
  teks: string;
  wajib: boolean;
  /** Apa yang boleh dilakukan kalau anggaran kurang. */
  buang: 'tidak' | 'riwayat' | 'konteks';
  ringkasDari?: number;
}

/** Catatan gambar: jumlahnya dilaporkan, isinya tidak ikut ke teks. */
function gambarCatatan(n: number): string {
  return n > 0 ? `\n[${n} gambar dilampirkan]` : '';
}

function potongJudul(teks: string): string {
  return teks.length > 40 ? `${teks.slice(0, 40)}…` : teks;
}

/**
 * Susun satu giliran agen.
 *
 * Urutan blok yang dihasilkan SELALU: konteks -> riwayat (lama ke baru) -> pesan
 * mengantre (urutan antrean apa adanya, termasuk hasil `promosikan`) -> tugas
 * belum selesai -> permintaan sekarang. Pesan mengantre yang id-nya sama dengan
 * permintaan sekarang digabung jadi satu blok (itu pesan yang sama, bukan dua).
 */
export function susunGiliran(bahan: BahanGiliran): HasilSuntik {
  const batas = bahan.batasByte === undefined ? BATAS_BYTE_GILIRAN : bahan.batasByte;
  const diringkas: RingkasanPotong[] = [];
  const dibuang: ItemDibuang[] = [];
  const digabung: string[] = [];
  const peringatan: string[] = [];
  const rahasia: TemuanRahasia[] = [];
  const kunciRahasia = new Set<string>();

  /*
   * SATU-SATUNYA jalan masuk teks ke daftar pesan. `saring()` mengganti nilai
   * rahasia dengan `«disensor»` dan mengembalikan NAMA aturan + cuplikan yang
   * sudah disensor; nilai aslinya tidak pernah ikut ke mana-mana.
   */
  const sensor = (teks: string): string => {
    const s = saring(teks);
    for (const t of s.temuan) {
      const kunci = `${t.aturan}|${t.contoh}`;
      if (kunciRahasia.has(kunci)) continue;
      kunciRahasia.add(kunci);
      rahasia.push(t);
    }
    return s.teks;
  };

  const permintaan = bahan.permintaan;
  const idMinta = (permintaan?.id ?? '').trim();
  const teksMinta = (permintaan?.teks ?? '').trim();

  const blok: Blok[] = [];

  /* ── (1) konteks workspace ───────────────────────────────────────────── */
  const isiKonteks = (bahan.konteks ?? '').trim();
  if (isiKonteks.length > 0) {
    blok.push({
      id: 'konteks',
      peran: 'system',
      asal: 'konteks',
      wajib: false,
      buang: 'konteks',
      teks: `${KEPALA_KONTEKS}\n${sensor(isiKonteks)}`,
    });
  } else {
    peringatan.push(
      'Konteks workspace belum ada (`.zephyr-context.md` tidak diberikan/kosong) - giliran ini jalan tanpa konteks, bukan error.',
    );
  }

  /* ── (2) riwayat percakapan ─────────────────────────────────────────── */
  const riwayat = bahan.riwayat ?? [];
  for (let i = 0; i < riwayat.length; i += 1) {
    const p = riwayat[i];
    const teks = (p.teks ?? '').trim();
    if (teks.length === 0) continue;
    blok.push({
      id: (p.id ?? '').trim() || `riwayat:${i}`,
      peran: p.peran,
      asal: 'riwayat',
      wajib: false,
      buang: 'riwayat',
      teks: sensor(teks),
    });
  }

  /* ── (3) pesan yang mengantre (belum selesai - WAJIB dibawa) ────────── */
  const daftarAntrean: readonly PesanAntrean[] = bahan.antrean?.daftar ?? [];
  let jumlahAntrean = 0;
  for (const item of daftarAntrean) {
    const teks = (item.teks ?? '').trim();
    if (teks.length === 0) continue;
    if (idMinta.length > 0 && item.id === idMinta) {
      digabung.push(`antrean:${item.id} == permintaan giliran sekarang`);
      continue;
    }
    jumlahAntrean += 1;
    blok.push({
      id: `antrean:${item.id}`,
      peran: 'user',
      asal: 'antrean',
      wajib: true,
      buang: 'tidak',
      teks: sensor(teks) + gambarCatatan(item.images?.length ?? 0),
    });
  }
  if (bahan.antrean && daftarAntrean.length > 0 && !bahan.antrean.sibuk) {
    peringatan.push(
      `Antrean berisi ${daftarAntrean.length} pesan padahal agen tidak sibuk - pesannya tetap dibawa supaya tidak hilang, tapi pengosongan antrean perlu diperiksa.`,
    );
  }

  /* ── (4) tugas yang belum selesai ───────────────────────────────────── */
  let jumlahTugas = 0;
  for (const t of bahan.tugasBelumSelesai ?? []) {
    const bersih = (t ?? '').trim();
    if (bersih.length === 0) continue;
    if (bersih === teksMinta) {
      digabung.push(`tugas == permintaan sekarang: ${potongJudul(bersih)}`);
      continue;
    }
    jumlahTugas += 1;
    blok.push({
      id: `tugas:${jumlahTugas}`,
      peran: 'user',
      asal: 'tugas',
      wajib: true,
      buang: 'tidak',
      teks: `${AWALAN_TUGAS}\n- ${sensor(bersih)}`,
    });
  }

  /* ── (5) permintaan sekarang ────────────────────────────────────────── */
  if (teksMinta.length > 0) {
    blok.push({
      id: idMinta.length > 0 ? `minta:${idMinta}` : 'minta',
      peran: 'user',
      asal: 'permintaan',
      wajib: true,
      buang: 'tidak',
      teks: sensor(teksMinta) + gambarCatatan(permintaan?.images?.length ?? 0),
    });
  } else {
    peringatan.push('Permintaan giliran ini kosong - tidak ada blok permintaan yang dibuat.');
  }

  /*
   * ── Anggaran ukuran: ringkas dulu, baru buang ────────────────────────
   * Urutannya tetap: (1) ringkas riwayat dari yang TERLAMA, (2) buang riwayat
   * dari yang TERLAMA, (3) ringkas konteks, (4) buang konteks. Riwayat lebih dulu
   * karena yang paling tua paling kecil kemungkinan masih relevan; konteks
   * dibuang paling akhir karena isinya bisa dibuat ulang, sementara permintaan
   * tidak bisa dibuat ulang oleh siapa pun.
   */
  const biaya = (b: Blok): number => byteTeks(b.teks) + BIAYA_PESAN;
  const totalByte = (): number => blok.reduce((n, b) => n + biaya(b), 0);

  for (const b of blok) {
    if (totalByte() <= batas) break;
    if (b.buang !== 'riwayat') continue;
    const lama = byteTeks(b.teks);
    if (lama <= RINGKAS_RIWAYAT_BYTE) continue;
    const p = potongByte(b.teks, RINGKAS_RIWAYAT_BYTE);
    if (!p.terpotong) continue;
    b.ringkasDari = lama;
    b.teks = p.teks;
    diringkas.push({ id: b.id, asal: b.asal, dariByte: lama, keByte: byteTeks(b.teks) });
  }

  {
    let i = 0;
    while (i < blok.length && totalByte() > batas) {
      const b = blok[i];
      if (b.buang !== 'riwayat') {
        i += 1;
        continue;
      }
      dibuang.push({ id: b.id, asal: b.asal, byte: byteTeks(b.teks), sebab: 'anggaran-ukuran' });
      blok.splice(i, 1);
    }
  }

  const blokKonteks = blok.find((b) => b.buang === 'konteks');
  if (blokKonteks && totalByte() > batas) {
    const lama = byteTeks(blokKonteks.teks);
    const p = potongByte(blokKonteks.teks, RINGKAS_KONTEKS_BYTE);
    if (p.terpotong) {
      blokKonteks.ringkasDari = lama;
      blokKonteks.teks = p.teks;
      diringkas.push({ id: blokKonteks.id, asal: 'konteks', dariByte: lama, keByte: byteTeks(p.teks) });
    }
  }
  if (blokKonteks && totalByte() > batas) {
    dibuang.push({ id: blokKonteks.id, asal: 'konteks', byte: byteTeks(blokKonteks.teks), sebab: 'anggaran-ukuran' });
    blok.splice(blok.indexOf(blokKonteks), 1);
  }

  const byteTotal = totalByte();
  const muat = byteTotal <= batas;
  if (!muat) {
    peringatan.push(
      `Anggaran ${batas} byte DILEWATI (${byteTotal} byte): blok wajib (antrean/tugas/permintaan) dibawa utuh dan tidak dipotong - lebih baik minta user memperpendek daripada menghapus pekerjaan yang belum selesai.`,
    );
  }
  if (
    dibuang.some((d) => d.asal === 'riwayat') &&
    (bahan.tugasBelumSelesai ?? []).every((t) => (t ?? '').trim().length === 0)
  ) {
    peringatan.push(
      'Riwayat dibuang untuk muat anggaran, tapi tidak satu pun tugas belum selesai diberikan - kalau ada pekerjaan yang belum beres di riwayat itu, isinya ikut hilang. Kirim `tugasBelumSelesai` supaya dijaga.',
    );
  }

  const pesan: PesanGiliran[] = blok.map((b) => {
    const p: PesanGiliran = { id: b.id, peran: b.peran, asal: b.asal, teks: b.teks, wajib: b.wajib };
    if (b.ringkasDari !== undefined) p.ringkasDari = b.ringkasDari;
    return p;
  });

  /* Pemeriksaan diri: pekerjaan belum selesai yang dibawa harus SAMA jumlahnya
     dengan yang diminta. Kalau tidak, ada yang hilang di jalan - dan itu harus
     terdengar, bukan lewat diam-diam. */
  const wajibDiminta = jumlahAntrean + jumlahTugas + (teksMinta.length > 0 ? 1 : 0);
  const tugasTerjaga = pesan.filter((p) => p.wajib).length;
  if (tugasTerjaga !== wajibDiminta) {
    peringatan.push(
      `BUG di suntikKonteks: pekerjaan belum selesai diminta ${wajibDiminta} tapi dibawa ${tugasTerjaga} - ada yang hilang.`,
    );
  }

  return {
    pesan,
    laporan: {
      byteTotal,
      batasByte: batas,
      muat,
      jumlahPesan: pesan.length,
      diringkas,
      dibuang,
      tugasTerjaga,
      melebihiAnggaran: !muat,
      digabung,
      rahasia,
      peringatan,
    },
  };
}

/** Satu baris laporan untuk log/UI - pemotongan tidak boleh terjadi dalam senyap. */
export function ringkasLaporan(laporan: LaporanSuntik): string {
  const bagian = [
    `${laporan.jumlahPesan} pesan, ${laporan.byteTotal}/${laporan.batasByte} byte${laporan.muat ? '' : ' (MELEBIHI ANGGARAN, blok wajib utuh)'}`,
    `pekerjaan belum selesai yang terjaga: ${laporan.tugasTerjaga}`,
    `diringkas: ${laporan.diringkas.length}${laporan.diringkas.length > 0 ? ` (${laporan.diringkas.map((d) => `${d.asal} ${d.dariByte}->${d.keByte}b`).join(', ')})` : ''}`,
    `dibuang: ${laporan.dibuang.length}${laporan.dibuang.length > 0 ? ` (${laporan.dibuang.map((d) => `${d.asal} ${d.byte}b`).join(', ')})` : ''}`,
    `digabung: ${laporan.digabung.length}`,
    `rahasia tersensor: ${laporan.rahasia.length}`,
  ];
  for (const p of laporan.peringatan) bagian.push(`PERINGATAN: ${p}`);
  return bagian.join('; ');
}

/* ══════════════════════════════════════════════════════════════════════════
 * GILIRAN BERIKUTNYA DARI ANTREAN (`src/lib/aiStore.ts`)
 *
 * Saat agen sibuk, pesan user masuk antrean (`src/lib/antreanPesan.ts`) alih-alih
 * menunggu run kelar atau hilang. Yang mengubah antrean itu menjadi GILIRAN yang
 * bisa dikerjakan ada di sini - dan susunannya tetap satu tempat: `susunGiliran`
 * (urutan konteks -> riwayat -> antrean -> tugas -> permintaan, sensor rahasia,
 * blok wajib tidak dipotong). Tidak ada penyusun kedua.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Blok yang WAJIB ada di riwayat: pekerjaan yang belum selesai. */
export function blokWajib(hasil: HasilSuntik): PesanGiliran[] {
  return hasil.pesan.filter((p) => p.wajib);
}

export interface BahanGiliranAntrean {
  /** Kepala antrean yang diproses giliran ini (dari `giliranSelesaiPanel`). */
  langsungDiproses: PesanMasuk;
  /** Keadaan antrean SESUDAH kepala diambil: sisanya masih menunggu. */
  antrean: KeadaanAntrean;
  /** Tugas yang belum selesai (mis. todo agen yang belum `done`). */
  tugasBelumSelesai?: readonly string[];
  konteks?: string | null;
  riwayat?: readonly PesanRiwayat[];
  batasByte?: number;
}

export interface HasilGiliranAntrean {
  hasil: HasilSuntik;
  /** Blok yang DISUNTIKKAN ke riwayat yang sedang berjalan (semuanya `wajib`). */
  blok: PesanGiliran[];
  /** Satu baris laporan (`ringkasLaporan`) untuk log/UI. */
  ringkas: string;
}

/**
 * Susun giliran dari kepala antrean + sisanya.
 *
 * `konteks`/`riwayat` sengaja boleh kosong: pemanggil di tengah run sudah punya
 * keduanya di riwayat yang sedang jalan, dan menyuntikkannya lagi akan menggandakan
 * isi. Yang disuntikkan adalah yang BELUM ada di riwayat - pekerjaan yang belum
 * selesai: pesan antrean, tugas, dan permintaan giliran ini.
 *
 * Idempoten seperti `susunGiliran`: bahan yang sama -> keluaran yang sama, jadi dua
 * langkah berturut-turut tidak menggandakan pesan.
 */
export function giliranAntreanKeRiwayat(bahan: BahanGiliranAntrean): HasilGiliranAntrean {
  const hasil = susunGiliran({
    konteks: bahan.konteks ?? null,
    riwayat: bahan.riwayat ?? [],
    antrean: bahan.antrean,
    tugasBelumSelesai: bahan.tugasBelumSelesai ?? [],
    permintaan: bahan.langsungDiproses,
    ...(bahan.batasByte === undefined ? {} : { batasByte: bahan.batasByte }),
  });
  return { hasil, blok: blokWajib(hasil), ringkas: ringkasLaporan(hasil.laporan) };
}

/**
 * Sisipkan blok ke DEPAN EKOR riwayat.
 *
 * Arti "di depan ekor" diputuskan di sini, dan alasannya perlu ditulis karena
 * pilihan yang salah merusak whole wire: provider menolak riwayat yang pasangan
 * `assistant`-dengan-tool-call dan hasil tool-nya terbelah. Kalau ekor riwayat
 * adalah hasil tool (`ujungTool`), blok user di depannya akan membelah pasangan itu
 * - jadi blok ditaruh SESUDAHNYA, dan itu tetap di ujung, bukan di tengah riwayat.
 * Kalau ekor riwayat `user`/`assistant` biasa, blok ditaruh TEPAT SEBELUMNYA - arti
 * harfiah "di depan ekor": pesan terakhir yang sudah ada TETAP di ujung, dan giliran
 * baru masuk persis di depannya. Ini pilihan sadar, bukan efek samping: jalur normal
 * loop agen selalu berakhir dengan hasil tool (cabang di atas), jadi cabang ini hanya
 * terpakai saat riwayat berakhir dengan percakapan biasa.
 *
 * Fungsi murni: argumen tidak diubah, hasilnya array baru (riwayat lama yang masih
 * dipegang pemanggil tetap sah).
 */
export function sisipKeDepanEkor<T>(
  riwayat: readonly T[],
  blok: readonly T[],
  ujungTool: (m: T) => boolean,
): T[] {
  const hasil = [...riwayat];
  if (blok.length === 0) return hasil;
  if (hasil.length === 0) return [...blok];
  const ekor = hasil[hasil.length - 1];
  if (ujungTool(ekor)) return [...hasil, ...blok];
  return [...hasil.slice(0, -1), ...blok, ekor];
}
