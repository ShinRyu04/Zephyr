/*
 * zephyrDokumen.ts - pencarian LOKAL atas isi dokumen Zephyr yang dibundel.
 *
 * ## Kenapa
 *
 * Aplikasi yang dipasang user tidak membawa folder sumbernya: `docs/`, `README`,
 * dan `CHANGELOG` sengaja tidak ikut repo publik. Kalau Zeph ditanya "apa isi
 * KEPUTUSAN-MARKETPLACE-j5" atau "apa yang baru di 1.1.12", jawabannya tidak
 * bisa dicari di disk user - tidak ada di sana. Karena itu isinya dipanen saat
 * build (`scripts/gen-dokumen-bundel.mjs`) dan IKUT BUNDEL; modul ini yang
 * mencari di dalamnya.
 *
 * Ini lapis KEDUA, bukan pengganti lapis fakta:
 *   - zephyrIndeks.ts / zephyrCari.ts  -> fakta ringkas (label, setelan, pintasan)
 *   - zephyrDokumenData.ts / modul ini -> ISI DOKUMEN apa adanya (sub-bab, tabel,
 *     keputusan, spike, catatan rilis)
 *
 * ## Sifat yang disengaja
 *
 * - LOKAL: tidak ada jaringan, tidak ada permintaan ke mana pun; semuanya dari
 *   `DOKUMEN_BAGIAN` yang ikut bundel.
 * - DETERMINISTIK: pengurutan akhir memakai kunci (skor, berkas, baris), bukan
 *   urutan kedatangan; mesin atau bahasa sistem user tidak mengubah hasil.
 * - JUJUR: kata kueri yang tidak ada di dokumen dilaporkan lewat
 *   `kataTakDikenal()`; hasil yang cuma cocok separuh ditandai `cara: 'longgar'`
 *   supaya tidak diperlakukan sebagai bukti kuat.
 * - SETIAP POTONGAN BERNOMOR BARIS (`berkas:baris`), karena potongan yang tidak
 *   bisa ditunjuk kembali ke berkas aslinya tidak bisa dipercaya.
 *
 * Batas ukuran/jumlah adalah konstanta yang DIEKSPOR (lihat BATAS_*), bukan
 * angka yang disembunyikan di dalam fungsi - supaya bisa disebut di jawaban dan
 * diuji `scripts/cek-bundel-docs.mjs`.
 */
import {
  DOKUMEN_BAGIAN,
  DOKUMEN_BERKAS,
  DOKUMEN_VERSI,
  type DokumenBagian,
} from './zephyrDokumenData';

/** Hasil kalau pemanggil tidak menyebut batas. */
export const BATAS_HASIL_BAWAAN = 8;
/** Batas keras per pencarian - melindungi konteks dari kueri yang terlalu luas. */
export const BATAS_HASIL_MAKS = 30;
/** Anggaran karakter seluruh hasil yang diformat. */
export const BATAS_KARAKTER_HASIL = 6000;
/** Panjang maksimum satu potongan (karakter). */
export const BATAS_POTONGAN = 240;
/** Potongan untuk jawaban "apa yang baru" - sengaja lebih panjang. */
export const BATAS_POTONGAN_BARU = 400;
/** Kata kueri yang diperhatikan; sisanya dibuang (kueri panjang = tidak fokus). */
export const BATAS_KATA_KUERI = 12;
/** Bagian yang ikut suntikan otomatis ke prompt. */
export const BATAS_HASIL_SUNTIK = 6;
/** Anggaran karakter suntikan otomatis ke prompt. */
export const BATAS_KARAKTER_SUNTIK = 1500;
/** Bagian catatan rilis untuk jawaban "apa yang baru". */
export const BATAS_BARU_BAWAAN = 4;

/** Cara sebuah hasil cocok. `longgar` = cuma separuh kata kueri yang ketemu. */
export type CaraCocokDokumen = 'ketat' | 'longgar';

/** Satu hasil pencarian dokumen. Selalu ada `berkas` + `baris` + `potongan`. */
export interface HasilDokumen {
  berkas: string;
  judul: string;
  /** Nomor baris (1-based) tempat potongan diambil di berkas aslinya. */
  baris: number;
  potongan: string;
  skor: number;
  cara: CaraCocokDokumen;
}

/** Metadata satu berkas yang ikut bundel. */
export interface MetaDokumen {
  berkas: string;
  ukuran: number;
  ubah: string;
  bagian: number;
  baris: number;
}

export interface OpsiCariDokumen {
  /** Batasi ke satu berkas (mis. 'CHANGELOG.md'); dibandingkan sama persis. */
  berkas?: string;
  /** Jumlah hasil maksimum; dijepit ke [1, BATAS_HASIL_MAKS]. */
  batas?: number;
}

/* ------------------------------------------------------------------ normalisasi */

/*
 * Kata tanya dan kata sambung dibuang dari kueri. Tanpa ini, kueri manusia
 * ("apa isi dokumen X?") menuntut setiap bagian memuat kata "apa", sehingga
 * hasilnya nol - dan model menyimpulkan "tidak ada di dokumen", yang salah.
 */
const KATA_UMUM = new Set([
  'a', 'ada', 'adakah', 'adalah', 'apa', 'apakah', 'atau', 'bagaimana', 'bagi',
  'bahwa', 'boleh', 'buka', 'cara', 'dalam', 'dan', 'dari', 'dengan', 'di',
  'dimana', 'dong', 'gimana', 'hal', 'ini', 'isi', 'itu', 'jelaskan', 'jika',
  'juga', 'kak', 'kalo', 'kalau', 'ke', 'kenapa', 'kok', 'lihat', 'mana',
  'mana?', 'mau', 'mengapa', 'mohon', 'nih', 'nya', 'pada', 'pakai', 'please',
  'sebutkan', 'sedang', 'sekitar', 'siapa', 'sih', 'saya', 'sebuah', 'supaya',
  'tentang', 'terkait', 'the', 'tolong', 'tuk', 'tulis', 'untuk', 'yang',
]);

const PEMISAH = /[^a-z0-9+.@_/-]+/g;

/** Normalisasi teks untuk pencocokan: huruf kecil, tanpa diakritik, kutip lurus. */
function normal(teks: string): string {
  return teks
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'");
}

/** Rapikan satu baris jadi potongan satu baris (spasi berturut jadi satu). */
export function rapikanBaris(baris: string): string {
  return baris.replace(/\s+/g, ' ').trim();
}

/**
 * Potong potongan di batas kata dan tandai `…`. Efeknya penting: inti potongan
 * selalu jadi AWALAN baris aslinya, sehingga bisa dicek balik ke berkas nyata
 * (itulah yang dilakukan `scripts/cek-bundel-docs.mjs`).
 */
export function potongPotongan(teks: string, batas: number = BATAS_POTONGAN): string {
  if (teks.length <= batas) return teks;
  const potong = teks.slice(0, batas);
  const spasi = potong.lastIndexOf(' ');
  return `${(spasi > batas * 0.5 ? potong.slice(0, spasi) : potong).trimEnd()}…`;
}

/** Pecah kueri jadi kata kunci: tanpa kata umum, unik, maksimum BATAS_KATA_KUERI. */
export function pecahKueri(kueri: string, batas: number = BATAS_KATA_KUERI): string[] {
  const keluar: string[] = [];
  for (const mentah of normal(kueri).split(PEMISAH)) {
    const kata = mentah.replace(/^[./-]+|[./-]+$/g, '');
    if (kata.length < 2) continue;
    if (KATA_UMUM.has(kata)) continue;
    if (keluar.includes(kata)) continue;
    keluar.push(kata);
    if (keluar.length >= batas) break;
  }
  return keluar;
}

/* --------------------------------------------------------------------- indeks */

interface BagianSiap {
  bagian: DokumenBagian;
  judul: string;
  teks: string;
}

let SIAP: BagianSiap[] | null = null;

/*
 * Normalisasi 283 KB teks itu murah, tapi tidak gratis: dihitung sekali saat
 * pencarian pertama lalu dipakai terus. Pola ini sama dengan zephyrCari.
 */
function siap(): BagianSiap[] {
  if (SIAP) return SIAP;
  SIAP = DOKUMEN_BAGIAN.map((bagian) => ({
    bagian,
    judul: normal(bagian[1]),
    teks: normal(bagian[4]),
  }));
  return SIAP;
}

/** Nomor baris (1-based) baris pertama teks sebuah bagian. */
export function barisTeksPertama(bagian: DokumenBagian): number {
  return bagian[3];
}

/** Nomor baris judul bagian; 0 kalau bagian itu memang tidak punya judul. */
export function barisJudulBagian(bagian: DokumenBagian): number {
  return bagian[2];
}

/**
 * Cari baris yang paling banyak memuat kata kunci (seri -> baris paling awal),
 * lalu kembalikan nomor baris mutlak + potongannya.
 */
function potonganTerbaik(
  bagian: DokumenBagian,
  kata: string[],
  batas: number,
): { baris: number; potongan: string } {
  const baris = bagian[4].split('\n');
  let pilih = -1;
  let terbaik = 0;
  for (let i = 0; i < baris.length; i++) {
    const isi = normal(baris[i]);
    if (!isi) continue;
    let cocok = 0;
    for (const k of kata) if (isi.includes(k)) cocok++;
    if (cocok > terbaik) {
      terbaik = cocok;
      pilih = i;
    }
  }
  if (pilih === -1) pilih = baris.findIndex((b) => rapikanBaris(b).length > 0);
  if (pilih === -1) pilih = 0;
  return {
    baris: barisTeksPertama(bagian) + pilih,
    potongan: potongPotongan(rapikanBaris(baris[pilih]), batas),
  };
}

function berkasDisebut(berkas: string, kata: string[]): boolean {
  const b = normal(berkas);
  return kata.some((k) => k.length >= 4 && b.includes(k));
}

/**
 * Skor satu bagian. Bobotnya sengaja kasar dan tetap: judul jauh lebih berarti
 * daripada isi, dan kecocokan judul penuh adalah sinyal terkuat yang ada.
 */
function nilai(
  s: BagianSiap,
  kata: string[],
  kueriNormal: string,
  temuan: number,
  kali: number,
): number {
  let skor = 0;
  if (kueriNormal.length >= 3 && s.judul.includes(kueriNormal)) skor += 180;
  if (s.judul === kueriNormal) skor += 600;
  let semuaDiJudul = true;
  for (const k of kata) {
    const diJudul = s.judul.includes(k);
    if (diJudul) skor += 40;
    else semuaDiJudul = false;
    if (s.teks.includes(k)) skor += 12 * kali;
    else if (!diJudul) skor -= 6;
  }
  if (semuaDiJudul) skor += 80;
  if (berkasDisebut(s.bagian[0], kata)) skor += 25;
  return skor + temuan * 5;
}

function jepitBatas(batas?: number): number {
  if (batas === undefined || !Number.isFinite(batas)) return BATAS_HASIL_BAWAAN;
  return Math.max(1, Math.min(BATAS_HASIL_MAKS, Math.floor(batas)));
}

/*
 * Kunci urutan: skor tertinggi dulu, lalu berkas + baris menaik. Bagian terakhir
 * itu yang membuat hasil bisa diulang persis di mesin mana pun.
 */
function urut(a: HasilDokumen, b: HasilDokumen): number {
  if (b.skor !== a.skor) return b.skor - a.skor;
  if (a.berkas !== b.berkas) return a.berkas < b.berkas ? -1 : 1;
  return a.baris - b.baris;
}

/**
 * Cari di seluruh dokumen yang dibundel. Kueri kosong / cuma kata umum
 * mengembalikan daftar kosong (bukan semua dokumen - pemanggil yang menentukan
 * mau menyuntik apa).
 */
export function cariDokumen(kueri: string, opsi: OpsiCariDokumen = {}): HasilDokumen[] {
  const kata = pecahKueri(kueri);
  if (!kata.length) return [];
  const kueriNormal = normal(kueri).trim();
  const batas = jepitBatas(opsi.batas);
  const kandidat = siap().filter(
    (s) => !opsi.berkas || s.bagian[0] === opsi.berkas,
  );

  const ketat: HasilDokumen[] = [];
  const longgar: HasilDokumen[] = [];
  for (const s of kandidat) {
    /* Bagian tanpa badan (judul saja) dilewati: tidak ada baris yang bisa
     * dikutip, jadi hasilnya cuma potongan kosong yang menyesatkan. */
    if (!s.bagian[4].trim()) continue;
    let temuan = 0;
    for (const k of kata) if (s.judul.includes(k) || s.teks.includes(k)) temuan++;
    if (temuan === kata.length) {
      const p = potonganTerbaik(s.bagian, kata, BATAS_POTONGAN);
      ketat.push({
        berkas: s.bagian[0],
        judul: s.bagian[1],
        baris: p.baris,
        potongan: p.potongan,
        skor: nilai(s, kata, kueriNormal, temuan, 2),
        cara: 'ketat',
      });
    } else if (temuan >= Math.ceil(kata.length / 2)) {
      const p = potonganTerbaik(s.bagian, kata, BATAS_POTONGAN);
      longgar.push({
        berkas: s.bagian[0],
        judul: s.bagian[1],
        baris: p.baris,
        potongan: p.potongan,
        skor: nilai(s, kata, kueriNormal, temuan, 1),
        cara: 'longgar',
      });
    }
  }

  /* Kalau ada yang ketat, hasil longgar tidak ditampilkan: mencampur keduanya
   * membuat model mengutip bagian yang cuma nyerempet. */
  const dipakai = ketat.length ? ketat : longgar;
  return dipakai.sort(urut).slice(0, batas);
}

/** Jumlah bagian yang memuat kueri, tanpa memotong daftar hasil. */
export function hitungCocok(kueri: string, opsi: OpsiCariDokumen = {}): number {
  const kata = pecahKueri(kueri);
  if (!kata.length) return 0;
  let n = 0;
  for (const s of siap()) {
    if (opsi.berkas && s.bagian[0] !== opsi.berkas) continue;
    if (!s.bagian[4].trim()) continue;
    let temuan = 0;
    for (const k of kata) if (s.judul.includes(k) || s.teks.includes(k)) temuan++;
    if (temuan === kata.length) n++;
  }
  return n;
}

/** Kata kueri yang TIDAK ada di dokumen mana pun - dasar jawaban jujur. */
export function kataTakDikenal(kueri: string): string[] {
  const kata = pecahKueri(kueri);
  const daftar = siap();
  return kata.filter(
    (k) => !daftar.some((s) => s.judul.includes(k) || s.teks.includes(k)),
  );
}

/** Semua kata kunci kueri (setelah kata umum dibuang) - untuk pesan ke user. */
export function kataKunciDokumen(kueri: string): string[] {
  return pecahKueri(kueri);
}

/* ----------------------------------------------------------------- "apa yang baru" */

const NIAT_BARU = new Set([
  'baru', 'terbaru', 'update', 'updates', 'rilis', 'release', 'releases',
  'changelog', 'versi', 'version', 'riwayat', 'perubahan', 'diubah',
]);

/**
 * Apakah kueri ini menanyakan kebaruan? Sengaja SEMPIT (maks 3 kata isi):
 * dengan penanda luas, "apa isi dokumen X" ikut dianggap tanya rilis.
 */
export function pertanyaanBaru(kueri: string): boolean {
  const kata = pecahKueri(kueri, 4);
  if (!kata.length || kata.length > 3) return false;
  if (/apa\s+yang\s+baru/i.test(kueri)) return true;
  return kata.some((k) => NIAT_BARU.has(k));
}

/** Bagian blok rilis teratas CHANGELOG.md, mis. '[Unreleased]' atau '1.1.12'. */
export function versiTeratas(): string {
  const s = siap().find((x) => x.bagian[0] === 'CHANGELOG.md' && RILIS.test(x.bagian[1]));
  return s ? s.bagian[1] : '(tidak ada judul rilis di CHANGELOG.md)';
}

const BARU = /changelog/i;
/** Judul blok rilis: '[Unreleased]', '[1.1.12] - 2026-09-30', 'v1.2.0'. */
const RILIS = /^\[?(unreleased|\d)/i;

/**
 * Bagian-bagian CHANGELOG.md dari blok rilis TERATAS, urut berkas - jawaban
 * "apa yang baru" adalah KUTIPAN baris CHANGELOG, bukan ringkasan.
 *
 * Kenapa menelusuri blok, bukan sekadar mengambil judul yang cocok: di CHANGELOG
 * nyata blok rilis sering TIDAK berbadan (`## [Unreleased]` langsung disusul
 * `### Security`), jadi isi rilis terbaru hidup di sub-bagian `###`. Rencana yang
 * cuma mencari judul `## [...]` akan melompat ke rilis pertama (1.0.0) dan
 * menjawab "apa yang baru" dengan perubahan setahun lalu.
 * Penelusuran berhenti di judul blok rilis berikutnya, jadi tidak pernah
 * meluber ke rilis lama.
 */
export function apaYangBaru(batas: number = BATAS_BARU_BAWAAN): HasilDokumen[] {
  const semua = DOKUMEN_BAGIAN.filter((b) => BARU.test(b[0]));
  const awal = semua.findIndex((b) => RILIS.test(b[1]));
  if (awal === -1) return [];
  const n = Math.max(1, Math.min(12, Math.floor(batas) || BATAS_BARU_BAWAAN));
  const keluar: HasilDokumen[] = [];
  for (let i = awal; i < semua.length && keluar.length < n; i++) {
    const b = semua[i];
    if (i > awal && RILIS.test(b[1])) break; // blok rilis berikutnya (yang lebih lama)
    if (!b[4].trim()) continue; // judul tanpa badan: tidak ada yang bisa dikutip
    const kata = pecahKueri(b[1]);
    const p = potonganTerbaik(b, kata.length ? kata : ['a'], BATAS_POTONGAN_BARU);
    keluar.push({
      berkas: b[0],
      judul: b[1],
      baris: p.baris,
      potongan: p.potongan,
      skor: 1000 - i,
      cara: 'ketat',
    });
  }
  return keluar;
}

/**
 * Jawaban "apa yang baru" dalam bentuk teks siap kirim. Semua isinya kutipan
 * baris `CHANGELOG.md` (dengan nomor baris), jadi bisa diverifikasi pembaca.
 * Tanpa bagian rilis yang bisa dibaca, jawabannya mengaku tidak tahu.
 */
export function jawabApaYangBaru(kueri?: string): string {
  const bagian = apaYangBaru();
  if (!bagian.length) {
    return 'CHANGELOG.md tidak memuat bagian rilis yang bisa dibaca; tidak ada yang bisa dikutip.';
  }
  const baris = [
    `APA YANG BARU - kutipan dari CHANGELOG.md (rilis teratas: ${versiTeratas()}).`,
  ];
  if (kueri) baris.push(`Kueri: ${kueri}`);
  baris.push(`Bundel: hash ${DOKUMEN_VERSI.hashSumber}, ${DOKUMEN_VERSI.jumlahBerkas} berkas / ${DOKUMEN_VERSI.jumlahBagian} bagian.`);
  for (const b of bagian) baris.push(`- ${b.berkas}:${b.baris} · ${b.judul} — ${b.potongan}`);
  baris.push(
    'Semua di atas kutipan baris apa adanya dari CHANGELOG.md. Jangan menyebut perubahan ' +
      'yang tidak ada di potongan di atas.',
  );
  return baris.join('\n');
}

/* --------------------------------------------------------------------- format */

/** Format hasil jadi teks ringkas beranggaran karakter. */
export function formatHasilDokumen(
  hasil: readonly HasilDokumen[],
  batasKarakter: number = BATAS_KARAKTER_HASIL,
): string {
  const baris: string[] = [];
  let panjang = 0;
  for (const h of hasil) {
    const tanda = h.cara === 'longgar' ? ' (longgar)' : '';
    const t = `- ${h.berkas}:${h.baris} · ${h.judul}${tanda} — ${h.potongan}`;
    if (panjang + t.length > batasKarakter && baris.length) break;
    baris.push(t);
    panjang += t.length + 1;
  }
  return baris.join('\n');
}

/**
 * Suntikan konteks untuk prompt (bentuknya sengaja sama dengan
 * `suntikanIndeks()` di zephyrCari): dipanggil lane prompt, bukan dari sini.
 * Pertanyaan kebaruan dijawab dari CHANGELOG lebih dulu.
 */
export function suntikanDokumen(kueri: string, opsi: OpsiCariDokumen = {}): string {
  if (pertanyaanBaru(kueri)) return jawabApaYangBaru(kueri).slice(0, BATAS_KARAKTER_SUNTIK);
  const hasil = cariDokumen(kueri, { ...opsi, batas: opsi.batas ?? BATAS_HASIL_SUNTIK });
  if (!hasil.length) {
    const asing = kataTakDikenal(kueri);
    return asing.length
      ? `Dokumen Zephyr (bundel ${DOKUMEN_VERSI.hashSumber}) tidak memuat kata: ${asing.join(', ')}.`
      : `Dokumen Zephyr (bundel ${DOKUMEN_VERSI.hashSumber}) tidak punya bagian yang cocok dengan kueri itu.`;
  }
  const kepala =
    `Dokumen Zephyr (bundel ${DOKUMEN_VERSI.hashSumber}, ${DOKUMEN_VERSI.jumlahBerkas} berkas) — ` +
    `potongan apa adanya dari berkas nyata:`;
  const isi = formatHasilDokumen(hasil, BATAS_KARAKTER_SUNTIK - kepala.length);
  return `${kepala}\n${isi}`;
}

/* -------------------------------------------------------------------- metadata */

/** Metadata semua berkas yang ikut bundel (ukuran, waktu ubah, jumlah bagian). */
export function daftarBerkas(): MetaDokumen[] {
  return DOKUMEN_BERKAS.map((b) => ({
    berkas: b[0],
    ukuran: b[1],
    ubah: b[2],
    bagian: b[3],
    baris: b[4],
  }));
}

/** Metadata satu berkas, atau null kalau berkas itu tidak ikut bundel. */
export function metaBerkas(nama: string): MetaDokumen | null {
  return daftarBerkas().find((b) => b.berkas === nama) ?? null;
}

/** Jumlah berkas dokumen di bundel. */
export function jumlahBerkas(): number {
  return DOKUMEN_BERKAS.length;
}

/** Jumlah bagian dokumen di bundel. */
export function jumlahBagian(): number {
  return DOKUMEN_BAGIAN.length;
}

/** Cap bundel: hash sumber, waktu panen, jumlah berkas/bagian, total byte. */
export function versiDokumen(): {
  dihasilkan: string;
  hashSumber: string;
  jumlahBerkas: number;
  jumlahBagian: number;
  totalByte: number;
} {
  return { ...DOKUMEN_VERSI };
}

/** Cek cepat: bundel kosong = ada yang salah saat generate. */
export function bundelKosong(): boolean {
  return DOKUMEN_BAGIAN.length === 0 || DOKUMEN_BERKAS.length === 0;
}

export type { DokumenBagian };
