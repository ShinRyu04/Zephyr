/**
 * Pencarian fakta tentang Zephyr dari indeks yang IKUT DIBUNDEL di aplikasi.
 *
 * ## Kenapa berkas ini ada
 *
 * Pertanyaan "kenapa Zephyr begini" tidak boleh dijawab dari ingatan model, dan
 * tidak boleh menuntut user membuka folder proyek Zephyr: aplikasi yang dipasang
 * orang lain tidak membawa folder sumbernya. Karena itu fakta tentang Zephyr
 * dipanen saat build (`scripts/gen-fakta-zephyr.mjs` -> `zephyrIndeks.ts`) dan
 * dibundel bersama aplikasi; berkas ini yang mencarinya.
 *
 * ## Pembagian dua lapis, dengan angka
 *
 * - Blok inti (`zephyrFakta.ts`) SELALU ikut tiap giliran dan harus tetap kecil.
 *   Isinya: identitas, aturan, default setelan, pintasan, port, log, larangan
 *   mengarang.
 * - Indeks (berkas ini) TIDAK PERNAH ikut utuh - dan ada DUA jalur yang
 *   mengambil potongannya:
 *   (a) OTOMATIS: `suntikanIndeks()` dipanggil perakit prompt SETIAP giliran,
 *       lalu potongan yang cocok dengan kata-kata user disuntik ke prompt
 *       sistem. Inilah yang membuat Zeph tidak "bego": fakta Zephyr datang
 *       sendiri, tidak bergantung pada model yang ingat memanggil tool.
 *   (b) ATAS PERMINTAAN: tool `zephyr_self` memanggil `cariFakta()` saat model
 *       (atau user) memang bertanya lebih dalam. Keduanya mesin yang sama.
 *
 * ## Sifat pencarian (sengaja, bukan kebetulan)
 *
 * - LOKAL: tidak ada jaringan, tidak ada permintaan ke mana pun.
 * - DETERMINISTIK: kueri yang sama menghasilkan urutan yang sama, apa pun mesin
 *   dan bahasa sistemnya. Pengurutan akhir memakai (skor, kategori, kunci)
 *   sebagai kunci, bukan urutan kedatangan.
 * - SEMUA KATA ISI HARUS COCOK: kueri "Ctrl panel" tidak mengembalikan setiap
 *   entri yang menyebut "panel". Kalau tidak ada yang cocok, pencarian
 *   dilonggarkan sekali (separuh kata cukup) supaya salah tulis tidak langsung
 *   menghasilkan nol hasil; hasil longgar DITANDAI (`longgar`) agar model tidak
 *   memperlakukannya sebagai bukti kuat.
 * - KATA UMUM DIBUANG: pertanyaan manusia ("apa yang baru", "gimana cara ganti
 *   tema") penuh kata tanya. Tanpa penyaringan, permintaan itu dianggap menuntut
 *   entri yang memuat kata "apa" - dan jawabannya jadi nol. Kata isi tetap
 *   diwajibkan cocok.
 * - KATA YANG TIDAK ADA DI INDEKS DIJAWAB JUJUR (`kataTakDikenal`): kalau kueri
 *   memuat istilah yang memang tidak ada di fakta Zephyr, itu disebutkan apa
 *   adanya - bukan dikubur di bawah kecocokan longgar seolah-olah fiturnya ada.
 * - Hasilnya dibatasi (`BATAS_HASIL_MAKS`) supaya satu pencarian tidak bisa
 *   membanjiri konteks model.
 * - PERTANYAAN "APA YANG BARU" DIARAHKAN KE CATATAN RILIS: kata seperti "baru"
 *   cocok ke ratusan entri yang kebetulan memuat kata itu (judul dokumen, label),
 *   sehingga catatan rilis justru kalah dan pertanyaan "apa yang baru" dijawab
 *   dari bahan yang salah. Kalau kueri memang bertanya soal kebaruan/versi,
 *   entri dokumen dari CHANGELOG/RELEASE_NOTES dinaikkan - tetap deterministik,
 *   dan hanya berlaku untuk kueri pendek supaya tidak menyerobot pencarian biasa.
 */
import {
  FAKTA_HASH_BERKAS,
  FAKTA_INDEKS,
  FAKTA_KATEGORI,
  FAKTA_VERSI,
  type FaktaEntri,
  type FaktaKategori,
} from './zephyrIndeks';

export { FAKTA_HASH_BERKAS, FAKTA_KATEGORI, FAKTA_VERSI, type FaktaEntri, type FaktaKategori } from './zephyrIndeks';

/** Jumlah hasil yang dikirim kalau pemanggil tidak menyebut batasnya. */
export const BATAS_HASIL_BAWAAN = 8;
/** Batas keras: satu pencarian tidak boleh membanjiri konteks model. */
export const BATAS_HASIL_MAKS = 40;
/** Anggaran karakter untuk seluruh hasil (potongan, bukan seluruh indeks). */
export const BATAS_KARAKTER_HASIL = 6000;

/** Bagaimana sebuah hasil ditemukan. Dipakai `suntikanIndeks()` untuk memberi
 *  tahu model SEBERAPA KUAT kecocokannya, bukan cuma berapa banyak. */
export type CaraCocok = 'ketat' | 'nama' | 'longgar';

export interface HasilFakta {
  kategori: FaktaKategori;
  kunci: string;
  teks: string;
  skor: number;
  /** true = cocok sebagian saja (jalur `nama` atau `longgar`), bukan kecocokan
   *  SEMUA kata isi. Pertahankan untuk pemanggil lama; lihat `cara` untuk
   *  tahu jalur mana yang dipakai. */
  longgar?: boolean;
  /** Jalur pencarian yang menghasilkan entri ini:
   *  - `ketat`  - semua kata isi ada di entri ini (bisa dipercaya).
   *  - `nama`   - minimal satu NAMA dari pesan (ActivityBar, agents.maxPanes,
   *               MCP, 9222) ketemu; kata isi lain tidak wajib.
   *  - `longgar`- minimal separuh kata isi ketemu (paling lemah).
   *  `cara` sengaja tidak diisi untuk `ketat` supaya hasil lama tetap sama. */
  cara?: CaraCocok;
}

/** Karakter yang dianggap bagian dari sebuah kata: "Ctrl+J" dan
 *  "subagent.allowWrite" harus tetap utuh sebagai satu token. */
const PEMISAH = /[^a-z0-9+.@_-]+/g;

function normal(teks: string): string {
  return teks
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'");
}

/**
 * Kata tanya/umum yang tidak membawa isi. "apa yang baru" harus mencari
 * "baru", bukan menuntut setiap entri memuat "apa" dan "yang".
 *
 * Daftar ini menentukan HASIL, bukan kosmetik: `nilai()` menuntut SEMUA kata isi
 * ada di satu entri (AND), jadi satu kata umum yang lolos ke daftar token akan
 * membunuh seluruh hasil. Contoh nyata: "tombol apa saja di ActivityBar" dulu
 * menuntut entri memuat "tombol" - dan indeks Zephyr tidak pernah memakai kata
 * "tombol" (ia memakai "label"/"menu"/"perintah"), sehingga entri `[layar]
 * ActivityBar` yang justru jawabannya tidak pernah muncul.
 *
 * Karena itu kata BENDA sehari-hari yang tidak pernah jadi bagian nama di indeks
 * ikut masuk: user bertanya "tombol apa saja", "berapa", "daftar nama", dan
 * jawabannya ada di entri yang menyebut ATAU nama bendanya (`ActivityBar`),
 * bukan di entri yang kebetulan memuat kata tanya itu. Yang DIPERTAHANKAN sebagai
 * kata isi adalah kata yang benar-benar membedakan: nama fitur, nama setelan,
 * nama berkas, "pintasan", "ekstensi", "tema", "warna", "port" bukan - lihat
 * daftar di bawah.
 *
 * "port" dan "label" tetap masuk daftar ini walaupun indeks memakainya di
 * dalam teksnya (kategori `label`, kalimat "port 9222"): user memakainya sebagai
 * kata benda umum ("port-nya berapa"), dan `pecahKueri()` sudah menjaga kueri
 * yang HANYA berisi kata umum (ia memakai kata aslinya kalau daftar isi kosong).
 * Jadi "daftar label" tetap mencari "label", tetapi "tombol apa saja di
 * ActivityBar" tidak lagi dipaksa memuat "tombol".
 */
const KATA_UMUM = new Set([
  'apa', 'apakah', 'yang', 'itu', 'ini', 'di', 'ke', 'dari', 'dan', 'atau', 'untuk', 'dengan', 'pada',
  'adalah', 'ada', 'tidak', 'engga', 'enggak', 'gak', 'nggak', 'bisa', 'boleh', 'cara', 'gimana',
  'bagaimana', 'kenapa', 'mengapa', 'mana', 'saja', 'sih', 'dong', 'kah', 'nya', 'nya?', 'kok',
  'gua', 'gue', 'aku', 'saya', 'kamu', 'lu', 'kita', 'mohon', 'tolong', 'cek', 'lihat', 'kasih',
  'tau', 'tahu', 'lakuin', 'bikin', 'buat', 'apaan', 'banget',
  /* Kata benda/kata tanya umum yang tidak pernah jadi bagian nama di indeks. */
  'berapa', 'banyak', 'jumlahnya', 'tombol', 'fungsi', 'kegunaan', 'gunanya', 'artinya', 'maksudnya',
  'label', 'layar', 'tampilan', 'panel', 'menu', 'nama', 'daftar', 'daftarnya', 'sebutkan', 'sebut',
  'jelaskan', 'jelasin', 'terangkan', 'tampilkan', 'kelihatan', 'nampak', 'port', 'semua', 'semuanya',
  'defaultnya', 'pintasannya', 'hotkey', 'tombolnya', 'letaknya', 'posisinya', 'isinya', 'pakainya',
  'contohnya', 'misalnya', 'kira-kira', 'kira', 'kirakira', 'kayak', 'seperti', 'antara', 'tentang',
  'the', 'a', 'an', 'of', 'is', 'are', 'am', 'to', 'for', 'in', 'on', 'at', 'by', 'with', 'how',
  'what', 'why', 'when', 'where', 'does', 'do', 'can', 'i', 'you', 'it', 'and', 'or', 'that', 'this',
]);

/** Pecah kueri jadi kata isi. Kata umum dibuang; kalau kuerinya HANYA kata umum,
 *  kata aslinya dipakai lagi supaya pencarian tidak jadi kosong. */
export function pecahKueri(kueri: string): string[] {
  const kasar = normal(kueri)
    .split(PEMISAH)
    .filter((t) => t.length > 0);
  const isi = kasar.filter((t) => !KATA_UMUM.has(t));
  return isi.length ? isi : kasar;
}

/** Ciri token yang berbentuk NAMA, bukan kata biasa: huruf besar di tengah/kapital
 *  (`ActivityBar`, `MCP`, `Zephyr`), titik/pisah (`agents.maxPanes`, `view.palette`),
 *  atau angka (`9222`, `v1.1.13`). Dipakai `namaDalamKueri()`. */
const CIRI_NAMA = /[A-Z]|[0-9]|[._@]/;

/** Kueri dipecah TANPA di-lowercase, supaya huruf besar pembawa makna
 *  (`ActivityBar` vs `activitybar`) masih terbaca. */
const PEMISAH_NAMA = /[^A-Za-z0-9+.@_-]+/g;

/**
 * NAMA yang benar-benar disebut user di pesannya: token yang berbentuk pengenal
 * (CamelCase, bertitik, ALLCAPS, berangka) dan bukan kata umum.
 *
 * Kenapa perlu: kecocokan KETAT menuntut SEMUA kata isi ada di satu entri. Satu
 * kata biasa yang tidak ada di indeks - "tombol", "defaultnya", "berapa" -
 * langsung menolakkan seluruh hasil, walaupun pesannya menyebut nama nyata
 * (`ActivityBar`, `agents.maxPanes`). Daftar nama ini dipakai `cariFakta()`
 * sebagai percobaan KEDUA: minimal satu nama harus ketemu, sisanya boleh lewat.
 *
 * Hasilnya di-normalisasi (huruf kecil, tanpa titik di ujung) supaya bisa
 * dicocokkan dengan `normal()` seperti token lain. Token sepanjang 1 huruf
 * ("A", "I") dan kata yang sudah ada di `KATA_UMUM` dibuang.
 */
export function namaDalamKueri(kueri: string): string[] {
  const nama: string[] = [];
  for (const mentah of (kueri || '').split(PEMISAH_NAMA)) {
    const token = mentah.replace(/^[._-]+|[._-]+$/g, '');
    if (token.length < 2 || !CIRI_NAMA.test(token)) continue;
    const n = normal(token);
    if (n.length < 2 || KATA_UMUM.has(n) || nama.includes(n)) continue;
    nama.push(n);
  }
  return nama;
}

/** Cache kamus kata indeks - dihitung sekali dari `FAKTA_INDEKS`, lalu dipakai ulang
 *  tiap giliran. Ditambal 2026-10-14: berkas ini sempat MEMAKAI cache ini tanpa
 *  mendeklarasikannya (agen penulisnya mati di tengah suntingan), sehingga
 *  `suntikanIndeks()` melempar `ReferenceError: KAMUS_INDEKS is not defined` dan
 *  seluruh perakitan prompt gagal senyap - terbukti lewat bundle esbuild + node. */
let KAMUS_INDEKS: Set<string> | null = null;

/** Seluruh kata yang benar-benar ada di indeks (dihitung sekali, lalu disimpan).
 *  Sebuah token indeks ikut disimpan UTUH dan sebagai KOMPONENNYA:
 *  "src/lib/agentDorong.ts" menyumbang "src/lib/agentdorong.ts", "agentdorong",
 *  "ts", dst. Tanpa dekomposisi ini, nama yang user sebut dengan bentuk lain
 *  ("agentDorong" vs "agentDorong.ts") dilaporkan "tidak ada di indeks" padahal
 *  entrinya ada persis di blok yang sama - laporan palsu seperti itu persis yang
 *  bikin model ragu pada fakta yang benar. */
function kamusIndeks(): Set<string> {
  if (KAMUS_INDEKS) return KAMUS_INDEKS;
  const kamus = new Set<string>();
  const serap = (teks: string) => {
    for (const t of normal(teks).split(PEMISAH)) {
      if (!t) continue;
      kamus.add(t);
      if (!/[.@_-]/.test(t)) continue;
      for (const bagian of t.split(/[.@_-]+/)) if (bagian.length > 1) kamus.add(bagian);
    }
  };
  for (const e of FAKTA_INDEKS) {
    serap(e[1]);
    serap(e[2]);
  }
  KAMUS_INDEKS = kamus;
  return kamus;
}

/** NAMA dari kueri yang tidak ada SAMA SEKALI di indeks. Ini yang membuat jawaban
 *  "fitur itu tidak ada" mungkin: kecocokan longgar di bawahnya jangan
 *  disalahartikan sebagai bukti fiturnya ada.
 *
 *  Kandidatnya DUA macam dan digabung: (1) token NAMA (`ActivityBar`,
 *  `agents.maxPanes`, `MCP`, `9222`) lewat `namaDalamKueri()`, dan (2) kata isi
 *  biasa lewat `pecahKueri()`. Yang menyaring kata sehari-hari adalah `KATA_UMUM`
 *  - di sanalah tempatnya, bukan di sini. Versi sebelumnya (keliru) HANYA
 *  melaporkan token NAMA, dan akibatnya istilah KARANGAN berhuruf kecil seperti
 *  "teleportasi" tidak pernah dilaporkan: model lalu bebas menyajikannya sebagai
 *  fitur Zephyr yang benar-benar ada - persis kebalikan dari tujuan fungsi ini.
 *  Harness anti-ngarang `scripts/uji-tahu-zephyr.mjs` menangkapnya
 *  (`asing: ['teleportasi']`), dan peringatan palsu lama ("defaultnya") tidak
 *  kembali karena kata itu memang sudah masuk `KATA_UMUM`. */
export function kataTakDikenal(kueri: string): string[] {
  const kamus = kamusIndeks();
  const kandidat = [...pecahKueri(kueri), ...namaDalamKueri(kueri)];
  const luar: string[] = [];
  for (const t of kandidat) if (!kamus.has(t) && !luar.includes(t)) luar.push(t);
  return luar;
}

export function jumlahEntri(): number {
  return FAKTA_INDEKS.length;
}

export function versiFakta(): { aplikasi: string; hashSumber: string } {
  return { aplikasi: FAKTA_VERSI.aplikasi, hashSumber: FAKTA_VERSI.hashSumber };
}

/** Cap yang tercatat di artefak (tanpa I/O): versi app + hash sumber + angka
 *  yang dilaporkan generator saat indeks ini dibuat. */
export function capTersimpan(): { aplikasi: string; hashSumber: string; berkas: number; entri: number } {
  return {
    aplikasi: FAKTA_VERSI.aplikasi,
    hashSumber: FAKTA_VERSI.hashSumber,
    /* Angka ini SENGAJA tidak ditaruh sebagai field FAKTA_VERSI: checker luar
     * (scripts/cek-indeks-sinkron.mjs, scripts/uji-versi-indeks.mjs) membaca cap
     * dengan pola TERTUTUP '{ aplikasi: ..., hashSumber: ... }', jadi field
     * tambahan di baris itu membuat capnya tidak terbaca. Keduanya diturunkan
     * dari artefak yang sama (bukan salinan tangan), jadi tetap angka nyata:
     * daftar berkas yang masuk hash + jumlah entri indeks. */
    berkas: FAKTA_HASH_BERKAS.length,
    entri: FAKTA_INDEKS.length,
  };
}

/**
 * Bandingkan cap tersimpan dengan cap NYATA. Murni: tidak membaca berkas, tidak
 * menulis apa pun, tidak menyentuh jaringan - jadi aman dipanggil berkali-kali.
 *
 * `capNyata` = cap yang dihitung dari pohon sumber SEKARANG (mis. keluaran
 * `gen-fakta-zephyr.mjs --print-cakupan`, atau hitungan ulang dari
 * `FAKTA_HASH_BERKAS` saat repo terbuka). `null` = pohon sumber tidak ada di sini
 * (aplikasi terpasang): JANGAN mengaku segar - katakan tidak bisa diverifikasi.
 */
export function capBasi(capNyata: { aplikasi: string; hashSumber: string } | null): {
  basi: boolean;
  bisaDiverifikasi: boolean;
  alasan: string;
} {
  const cap = capTersimpan();
  if (capNyata === null) {
    return {
      basi: false,
      bisaDiverifikasi: false,
      alasan: `cap tersimpan ${cap.aplikasi} / ${cap.hashSumber}; pohon sumber tidak ada di sini, jadi kesegaran hash TIDAK bisa diverifikasi - jangan bilang "segar"`,
    };
  }
  if (capNyata.hashSumber !== cap.hashSumber) {
    return {
      basi: true,
      bisaDiverifikasi: true,
      alasan: `hash sumber BEDA: tersimpan ${cap.hashSumber} vs nyata ${capNyata.hashSumber} - indeks dibuat dari sumber yang lebih lama`,
    };
  }
  if (capNyata.aplikasi !== cap.aplikasi) {
    return {
      basi: true,
      bisaDiverifikasi: true,
      alasan: `versi BEDA: tersimpan ${cap.aplikasi} vs app ${capNyata.aplikasi} (hash sama, jadi hanya versi yang naik)`,
    };
  }
  return { basi: false, bisaDiverifikasi: true, alasan: `segar: ${cap.aplikasi} / ${cap.hashSumber} sama dengan sumber sekarang` };
}

/** Isi kategori yang benar-benar ada di indeks, beserta jumlahnya. Dipakai untuk
 *  menjawab "kategori apa saja yang bisa ditanya" tanpa menebak. */
export function kategoriTersedia(): Array<{ kategori: FaktaKategori; jumlah: number }> {
  const hitung = new Map<FaktaKategori, number>();
  for (const e of FAKTA_INDEKS) hitung.set(e[0], (hitung.get(e[0]) ?? 0) + 1);
  return FAKTA_KATEGORI.map((k) => ({ kategori: k, jumlah: hitung.get(k) ?? 0 }));
}

/** Kata niat "apa yang baru" - memicu pengarahan ke catatan rilis. */
const NIAT_RILIS = new Set([
  'baru', 'terbaru', 'barusan', 'new', 'update', 'upgrade', 'rilis', 'release',
  'changelog', 'versi', 'version', 'histori', 'history', 'news',
]);

/** Entri dokumen yang memang catatan rilis (bukan dokumen biasa). */
const BERKAS_RILIS = /^(changelog|release_notes)/;

/**
 * Bonus untuk pertanyaan soal kebaruan: catatan rilis naik di atas entri yang
 * cuma kebetulan memuat kata "baru". Sengaja sempit - hanya kueri pendek (<= 3
 * kata isi) yang boleh memicunya, jadi pencarian biasa tidak ikut tergeser.
 */
function bonusNiat(entri: FaktaEntri, tokens: string[]): number {
  if (tokens.length > 3) return 0;
  if (!tokens.some((t) => NIAT_RILIS.has(t))) return 0;
  if (entri[0] !== 'dokumen') return 0;
  const kunci = normal(entri[1]);
  if (BERKAS_RILIS.test(kunci)) return 150;
  return kunci.includes('versi') ? 60 : 0;
}

function nilai(entri: FaktaEntri, tokens: string[], kueri: string): number {
  const kunci = normal(entri[1]);
  const teks = normal(entri[2]);
  if (!tokens.length) return 0;
  if (kunci === kueri) return 1000;
  let skor = 0;
  if (kunci.startsWith(kueri)) skor += 220;
  else if (kunci.includes(kueri)) skor += 140;
  for (const t of tokens) {
    const diKunci = kunci.includes(t);
    const diTeks = teks.includes(t);
    if (!diKunci && !diTeks) return -1;
    if (diKunci) skor += kunci === t ? 90 : 30;
    if (diTeks) skor += 8;
  }
  return skor + bonusNiat(entri, tokens);
}

function nilaiLonggar(entri: FaktaEntri, tokens: string[]): number {
  const kunci = normal(entri[1]);
  const teks = normal(entri[2]);
  let ketemu = 0;
  let skor = 0;
  for (const t of tokens) {
    if (kunci.includes(t)) {
      ketemu += 1;
      skor += 25;
    } else if (teks.includes(t)) {
      ketemu += 1;
      skor += 5;
    }
  }
  const cukup = Math.max(1, Math.ceil(tokens.length / 2));
  return ketemu >= cukup ? skor : -1;
}

/**
 * Percobaan KEDUA: minimal satu NAMA dari pesan harus ketemu, kata isi lain
 * tidak wajib - malah hanya menaikkan peringkat.
 *
 * Ini menjawab kegagalan yang paling sering: "tombol apa saja di ActivityBar"
 * atau "agents.maxPanes defaultnya berapa". Kata "tombol"/"defaultnya" tidak
 * pernah ada di indeks, jadi jalur KETAT menolak semua entri, padahal pesannya
 * menyebut `ActivityBar` / `agents.maxPanes` yang JUSTRU ada. Nama adalah
 * jangkar terkuat yang bisa diberikan user, jadi ia yang jadi syarat minimum.
 *
 * Peringkat: nama di KUNCI jauh lebih kuat daripada di teks; jumlah nama yang
 * ketemu menaikkan; kata isi ikut menaikkan tapi tidak pernah jadi syarat.
 */
function nilaiNama(entri: FaktaEntri, nama: string[], isi: string[], kueri: string): number {
  const kunci = normal(entri[1]);
  const teks = normal(entri[2]);
  let namaDiKunci = 0;
  let namaDiTeks = 0;
  for (const n of nama) {
    if (kunci.includes(n)) namaDiKunci += 1;
    else if (teks.includes(n)) namaDiTeks += 1;
  }
  if (!namaDiKunci && !namaDiTeks) return -1;
  let skor = 0;
  if (namaDiKunci) skor += 300 + 100 * namaDiKunci;
  if (namaDiTeks) skor += 60 + 20 * namaDiTeks;
  for (const t of isi) {
    if (kunci === t) skor += 90;
    else if (kunci.includes(t)) skor += 30;
    if (teks.includes(t)) skor += 8;
  }
  if (kunci === kueri) skor += 1000;
  else if (kunci.startsWith(kueri)) skor += 220;
  else if (kunci.includes(kueri)) skor += 140;
  return skor + bonusNiat(entri, isi);
}

export function cariFakta(
  kueri: string,
  opsi: { kategori?: FaktaKategori | 'semua'; batas?: number } = {},
): HasilFakta[] {
  const tokens = pecahKueri(kueri);
  const kueriNormal = normal(kueri).trim();
  const batas = Math.min(
    BATAS_HASIL_MAKS,
    Math.max(1, Math.floor(opsi.batas ?? BATAS_HASIL_BAWAAN)),
  );
  const kategori = opsi.kategori && opsi.kategori !== 'semua' ? opsi.kategori : undefined;

  const kumpul = (fn: (e: FaktaEntri) => number): HasilFakta[] => {
    const hasil: HasilFakta[] = [];
    for (const e of FAKTA_INDEKS) {
      if (kategori && e[0] !== kategori) continue;
      const s = fn(e);
      if (s >= 0) hasil.push({ kategori: e[0], kunci: e[1], teks: e[2], skor: s });
    }
    return hasil;
  };

  let hasil = tokens.length ? kumpul((e) => nilai(e, tokens, kueriNormal)) : [];
  let cara: CaraCocok = 'ketat';
  if (!hasil.length && tokens.length) {
    /* Percobaan KEDUA: NAMA sebagai syarat minimum (bukan semua kata isi).
     * Hanya dijalankan kalau KETAT benar-benar kosong, jadi hasil yang sudah
     * benar tidak pernah tergeser oleh jalur yang lebih lemah ini. */
    const nama = namaDalamKueri(kueri);
    if (nama.length) {
      hasil = kumpul((e) => nilaiNama(e, nama, tokens, kueriNormal));
      if (hasil.length) cara = 'nama';
    }
  }
  if (!hasil.length && tokens.length) {
    hasil = kumpul((e) => nilaiLonggar(e, tokens));
    cara = 'longgar';
  }

  hasil.sort(
    (a, b) =>
      b.skor - a.skor ||
      (a.kategori < b.kategori ? -1 : a.kategori > b.kategori ? 1 : 0) ||
      (a.kunci < b.kunci ? -1 : a.kunci > b.kunci ? 1 : 0),
  );
  return hasil
    .slice(0, batas)
    .map((h) => (cara === 'ketat' ? h : { ...h, longgar: true, cara }));
}

/** Berapa hasil yang sebenarnya cocok, sebelum dipotong `batas`. Dipakai supaya
 *  jawabannya bisa jujur menyebut "ada N, ini M". */
export function hitungCocok(kueri: string, kategori?: FaktaKategori | 'semua'): number {
  const tokens = pecahKueri(kueri);
  if (!tokens.length) return 0;
  const kueriNormal = normal(kueri).trim();
  const kat = kategori && kategori !== 'semua' ? kategori : undefined;
  let n = 0;
  for (const e of FAKTA_INDEKS) {
    if (kat && e[0] !== kat) continue;
    if (nilai(e, tokens, kueriNormal) >= 0) n += 1;
  }
  return n;
}

/** Format hasil untuk model: satu fakta per baris, dipotong pada anggaran
 *  karakter supaya satu pencarian tidak menelan konteks giliran. */
export function formatHasil(hasil: HasilFakta[], batasKarakter = BATAS_KARAKTER_HASIL): string {
  const baris: string[] = [];
  let panjang = 0;
  for (const h of hasil) {
    const teks = `[${h.kategori}] ${h.kunci}: ${h.teks}`;
    if (panjang + teks.length + 1 > batasKarakter) break;
    baris.push(teks);
    panjang += teks.length + 1;
  }
  return baris.join('\n');
}

/** Pintasan yang paling sering dipakai model: bertanya "X diimplementasikan di
 *  berkas mana". Kategori kode saja, supaya jawabannya tidak tercampur label. */
export function cariKode(kueri: string, batas = BATAS_HASIL_BAWAAN): HasilFakta[] {
  return cariFakta(kueri, { kategori: 'kode', batas });
}

/* ───────────── Suntikan otomatis ke prompt, tiap giliran ───────────── */

/**
 * Anggaran karakter blok indeks yang disuntik ke prompt TIAP giliran.
 *
 * Blok ini ikut di SETIAP permintaan, jadi angkanya sengaja kecil: cukup untuk
 * beberapa fakta yang cocok dengan kata-kata user, tidak cukup untuk menyeret
 * seluruh indeks (ratusan KB) ke dalam konteks. Entri diisi satu per satu
 * selama anggarannya muat, jadi kepala dan penutupnya tidak pernah terpotong.
 */
export const BATAS_KARAKTER_SUNTIK = 1200;

/** Jumlah maksimum entri yang ikut dalam satu suntikan otomatis. */
export const BATAS_HASIL_SUNTIK = 10;

/* AI-TAHU-100-7: jalur `suntikanIndeks()` dulu tanpa cache - tiap giliran
 * menghitung ulang blok deterministik yang sama. Cache per sesi ini menyimpan
 * blok per (kueri, anggaran, batas, versi, hash sumber). Nama-namanya DIBEDAKAN
 * dari cache jalur TOOL (ukuranCacheSesi/bersihkanCacheSesi) supaya tidak saling
 * menimpa; sesi baru WAJIB memanggil bersihkanCacheSuntikSesi(). */
const CACHE_SUNTIK = new Map<string, string>();
export function ukuranCacheSuntikSesi(): number { return CACHE_SUNTIK.size; }
export function bersihkanCacheSuntikSesi(): void { CACHE_SUNTIK.clear(); }

/**
 * Baris kepala blok suntikan; DIPISAH JADI FUNGSI supaya teksnya punya satu
 * tempat. Dipakai `suntikanIndeks()` dan bisa dites terpisah.
 *
 * TODO(i18n - PROMPT 7): teks ini masih Inggris dan belum punya kunci kamus,
 * sama seperti blok fakta (`zephyrFakta.ts`) dan kepala blok keadaan
 * (`zephyrRuntime.ts` / `aiZephyrState.ts`). Usulan kunci kamus:
 * `ai.index.suntikHead` untuk baris kepala ini dan `ai.index.suntikKosong` /
 * `ai.index.suntikPakai` untuk dua kalimat penutup di `suntikanIndeks()`.
 * Setelah kunci itu masuk kamus, fungsi INI yang mengembalikannya - jangan
 * menyalin teksnya ke perakit prompt.
 */
export function kepalaSuntikanIndeks(): string {
  return "# Zephyr knowledge index - excerpt injected automatically for THIS turn";
}

/** Peta kategori + jumlahnya dalam satu baris. Dihitung sekali (indeks statis). */
let PETA_INDEKS: string | null = null;
export function petaIndeks(): string {
  if (PETA_INDEKS === null) {
    PETA_INDEKS = kategoriTersedia()
      .filter((k) => k.jumlah > 0)
      .map((k) => `${k.kategori} ${k.jumlah}`)
      .join(', ');
  }
  return PETA_INDEKS;
}

export interface OpsiSuntikan {
  /** Anggaran karakter untuk SELURUH blok (kepala + meta + entri + penutup). */
  batasKarakter?: number;
  /** Jumlah maksimum entri yang ikut. */
  batas?: number;
}

/**
 * Blok indeks yang disuntik ke prompt sistem SETIAP giliran, dibangun dari
 * kata-kata pesan user - TANPA model perlu memanggil tool apa pun.
 *
 * Kenapa begini, bukan diserahkan ke model:
 * - Kalau indeks hanya bisa dicapai lewat tool, jawabannya bergantung pada
 *   model yang ingat memanggilnya. Pertanyaan seperti "di mana setelan panel"
 *   sering dijawab dari ingatan lebih dulu - dan nama setelan karangan lebih
 *   mahal bagi user daripada satu potongan konteks tambahan.
 * - Isinya SELALU ada, termasuk saat tidak ada entri yang cocok: meta indeks
 *   (jumlah entri, versi, hash sumber, peta kategori) memberi tahu model APA
 *   yang tersedia, dan kalimat "tidak ada yang cocok" mencegahnya menganggap
 *   fitur karangan itu ada.
 * - Deterministik: kueri yang sama menghasilkan blok yang sama, jadi prompt
 *   tidak bergoyang antar giliran.
 *
 * Blok ini BUKAN pengganti tool: ia satu potongan, dan saat gap-nya terasa
 * (nama yang ditanya user tidak ada di potongan), model masih bisa memanggil
 * `zephyr_self` untuk potongan yang lebih lebar.
 */
export function suntikanIndeks(kueri: string, opsi: OpsiSuntikan = {}): string {
  const batasKarakter = Math.max(
    300,
    Math.min(BATAS_KARAKTER_HASIL, Math.floor(opsi.batasKarakter ?? BATAS_KARAKTER_SUNTIK)),
  );
  const batas = Math.max(1, Math.min(BATAS_HASIL_MAKS, Math.floor(opsi.batas ?? BATAS_HASIL_SUNTIK)));
  const kepala = kepalaSuntikanIndeks();
  const v = versiFakta();

  /* AI-TAHU-100-7: blok ini deterministik per (kueri, anggaran, batas, versi,
   * hash) - cache per sesi supaya giliran berikutnya dengan kueri sama tidak
   * menghitung ulang. Kunci memuat versi + hash sumber sehingga blok dari indeks
   * LAMA tidak tersaji setelah indeks di-regenerate. */
  const kunciSuntik = `${kueri}|${batasKarakter}|${batas}|${v.aplikasi}|${v.hashSumber}`;
  const tersimpanSuntik = CACHE_SUNTIK.get(kunciSuntik);
  if (tersimpanSuntik !== undefined) return tersimpanSuntik;

  /* AI-TAHU-100-2: meta WAJIB memuat versi + hash sumber (bahan cap BASI), tetapi
   * peta kategori boleh dilepas lebih dulu kalau anggaran terlalu ketat - entri
   * yang diminta user lebih penting daripada daftar kategori. */
  const metaPenuh =
    `Index ${jumlahEntri()} entries, app ${v.aplikasi}, source hash ${v.hashSumber}` +
    ` | categories: ${petaIndeks()}`;
  const metaRingkas = `Index ${jumlahEntri()} entries, app ${v.aplikasi}, source hash ${v.hashSumber}`;
  const meta = kepala.length + 1 + metaPenuh.length <= batasKarakter ? metaPenuh : metaRingkas;
  const basis = `${kepala}\n${meta}`;
  const tokens = pecahKueri(kueri);
  const hasil = tokens.length ? cariFakta(kueri, { batas }) : [];
  const takDikenal = kataTakDikenal(kueri);
  const total = tokens.length ? hitungCocok(kueri) : 0;
  /* Jalur yang dipakai cariFakta() untuk hasil ini: `ketat` (semua kata isi),
   * `nama` (minimal satu nama dari pesan), atau `longgar` (separuh kata isi).
   * Dipakai untuk memilih peringatan yang jujur di penutup blok. */
  const caraBlok: CaraCocok | null = hasil.length ? hasil[0].cara ?? 'ketat' : null;
  const kata = tokens.slice(0, 8).join(', ');

  if (!hasil.length) {
    /* AI-TAHU-100-2: cabang tanpa hasil dulu mengembalikan SEMUA kalimat apa pun
     * anggarannya (654 char saat batasKarakter:300). Sekarang tiap kalimat
     * tambahan hanya ikut kalau anggarannya masih muat. */
    const sisaBaris: string[] = [];
    if (!tokens.length) {
      sisaBaris.push(
        'This turn carries no search words (empty or non-text message), so nothing was matched against the index.',
      );
    } else {
      sisaBaris.push(
        `No index entry matched this message's words (searched: ${kata}). A miss usually means the message is not about Zephyr itself - the index only holds what Zephyr SHIPS (settings, shortcuts, commands, labels, panels, ports, tools, bundled extensions and docs).`,
      );
    }
    sisaBaris.push(
      'Answer Zephyr questions from the facts above; never invent a setting, shortcut, command, port or label name that is not in them.',
    );
    if (takDikenal.length) {
      sisaBaris.push(
        `These NAMES appear nowhere in the index: ${takDikenal.slice(0, 8).join(', ')} - do not present them as existing Zephyr features. (Only names are checked here; ordinary question words are ignored.)`,
      );
    }
    sisaBaris.push(
      "For more, call `zephyr_self` with the user's own words: it searches this same index and returns more lines.",
    );
    const rakitKosong: string[] = [basis];
    let panjangKosong = basis.length;
    for (const b of sisaBaris) {
      if (panjangKosong + 1 + b.length > batasKarakter) break;
      rakitKosong.push(b);
      panjangKosong += 1 + b.length;
    }
    const keluaranKosong = rakitKosong.join('\n');
    CACHE_SUNTIK.set(kunciSuntik, keluaranKosong);
    return keluaranKosong;
  }

  /* AI-TAHU-100-2: penutup dibelah jadi INTI dan TAMBAHAN. INTI = penjaga "jangan
   * mengarang" (outrank + jangan sebut nama di luar daftar); TAMBAHAN = bacaan +
   * peringatan cara-cocok + hitungan. Keduanya ikut DIBEBANKAN ke anggaran blok -
   * INTI hanya dilepas kalau anggarannya bahkan tidak cukup untuk kepala+meta+INTI. */
  const penutupInti =
    'These entries come from Zephyr\'s own sources, so they outrank anything you remember about Zephyr. ' +
    'If the name the user asks for is not among them, call `zephyr_self` before naming it - never invent a setting, shortcut, command or port.';
  const penutupTambahan =
    ' They are a SLICE of the index, not the whole of it: read them in English, answer in the language the user wrote in.' +
    (caraBlok === 'nama'
      ? ' These matched on a NAME taken from the message (an identifier, setting, screen name or number); the other words of the sentence were NOT required to match - read each entry before you use it.'
      : '') +
    (caraBlok === 'longgar' ? ' These matched on PART of the words only, so treat them as a hint, not proof.' : '') +
    (total > hasil.length ? ` ${total} entries match in total, ${hasil.length} are shown.` : '');

  /* Anggaran SELURUH blok: kepala+meta WAJIB; INTI ikut kalau muat; entri mengisi
   * sisanya; TAMBAHAN hanya kalau masih muat SESUDAH entri. Urutan ini
   * memaksimalkan entri yang diminta user tanpa pernah melewati batasKarakter. */
  let penutup = '';
  let jatahEntri = batasKarakter - basis.length;
  if (basis.length + 1 + penutupInti.length <= batasKarakter) {
    penutup = penutupInti;
    jatahEntri -= penutupInti.length + 1;
  }
  const baris: string[] = [];
  let panjang = 0;
  for (const h of hasil) {
    const teks = `[${h.kategori}] ${h.kunci}: ${h.teks}`;
    if (panjang + 1 + teks.length > jatahEntri) break;
    baris.push(teks);
    panjang += 1 + teks.length;
  }
  if (penutup !== '' && basis.length + panjang + 1 + penutup.length + penutupTambahan.length <= batasKarakter) {
    penutup += penutupTambahan;
  }
  const keluaran = penutup ? [basis, ...baris, penutup].join('\n') : [basis, ...baris].join('\n');
  CACHE_SUNTIK.set(kunciSuntik, keluaran);
  return keluaran;
}
