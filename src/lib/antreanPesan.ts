/*
 * antreanPesan.ts — aturan ANTREAN PESAN sebagai fungsi murni.
 *
 * Masalah nyata yang file ini jawab: user mengetik pesan kedua selagi agen masih
 * bekerja. Pilihan buruknya ada tiga, dan ketiganya pernah terjadi di panel:
 *   1. pesan kedua MENABRAK giliran yang sedang jalan (percakapan jadi rusak),
 *   2. pesan kedua DIBUANG diam-diam (user merasa sudah mengirim, tapi tidak ada
 *      jejaknya di mana pun),
 *   3. urutan keluarnya acak, sehingga "lanjutkan" keluar sebelum perintah yang
 *      sebenarnya diminta lebih dulu.
 *
 * Karena itu aturannya dipisah ke sini sebagai fungsi MURNI - tanpa store, tanpa
 * jaringan, tanpa Tauri - supaya bisa diuji habis (lihat
 * `scripts/uji-antrean-pesan.mjs`) dan dipakai ulang oleh panel mana pun.
 *
 * Kontraknya:
 *   * agen TIDAK sibuk  -> pesan langsung dikirim (`masukAntrean: false`);
 *   * agen SIBUK        -> pesan masuk antrean, giliran yang jalan tidak diganggu;
 *   * giliran selesai   -> pesan paling depan LANGSUNG diproses, sisanya menunggu;
 *   * tiap pesan punya `id` stabil, jadi bisa dibatalkan walau urutannya berubah.
 *
 * Semua fungsi mengembalikan KEADAAN BARU dan tidak mengubah argumennya: keadaan
 * lama yang masih dipegang pemanggil (mis. render React sebelumnya) tetap sah.
 */

/** Satu pesan yang menunggu giliran. */
export interface PesanAntrean {
  /**
   * Identitas baris, dibuat saat pesan masuk - bukan indeks array.
   *
   * Baris antrean bisa dinaikkan/diturunkan/dipromosikan, jadi indeks yang sama
   * bisa menunjuk pesan berbeda setelah reorder. Pembatalan harus mengikuti
   * PESANNYA, bukan posisinya: kalau tidak, "batalkan yang tadi" bisa membuang
   * pesan tetangga yang kebetulan sudah menempati indeks itu.
   */
  id: string;
  /** Teks yang diketik user, sudah di-trim. Tidak pernah diubah diam-diam. */
  teks: string;
  images: string[];
  /** Kapan masuk antrean (ms), dipakai untuk menampilkan umur baris. */
  masukPada: number;
  /**
   * Indeks baris ini di DAFTAR PANEL saat keadaan dibangun dari daftar panel
   * (`keadaanDariPanel`). Dipakai untuk membuang baris TERLAMA dari daftar panel
   * tanpa menebak: daftar panel bisa sudah bergeser (baris lain dibatalkan, baris
   * baru disisipkan), sehingga indeks yang dihitung ulang bisa menunjuk baris yang
   * salah - dan yang salah dibuang adalah pesan user.
   */
  indeksPanel?: number;
}

/** Seluruh keadaan antrean, cukup untuk dirender dan diuji. */
export interface KeadaanAntrean {
  daftar: PesanAntrean[];
  /** Apakah ada giliran agen yang sedang jalan. */
  sibuk: boolean;
  /** Batas jumlah pesan menunggu. */
  batas: number;
  /** Batas panjang satu pesan (karakter). */
  batasTeks: number;
  /**
   * Counter untuk `id`. Ikut disimpan di keadaan supaya fungsi tetap murni:
   * id yang sama tidak pernah lahir dua kali dari keadaan yang sama.
   */
  urut: number;
}

/** 20 pesan menunggu sudah jauh lebih banyak dari yang bisa dibaca user. */
export const BATAS_ANTREAN = 20;

/** Sama dengan batas pesan di panel, supaya satu pesan tidak lolos di sini saja. */
export const BATAS_TEKS = 8 * 1024;

export interface OpsiAntrean {
  batas?: number;
  batasTeks?: number;
  /** Mulai dalam keadaan agen sibuk (dipakai uji dan pemulihan sesi). */
  sibuk?: boolean;
}

export function buatAntrean(opsi: OpsiAntrean = {}): KeadaanAntrean {
  return {
    daftar: [],
    sibuk: opsi.sibuk ?? false,
    batas: opsi.batas ?? BATAS_ANTREAN,
    batasTeks: opsi.batasTeks ?? BATAS_TEKS,
    urut: 0,
  };
}

/** Sebab pesan ditolak. Dipakai UI untuk memilih kalimat, bukan untuk menebak. */
export type AlasanTolak = 'kosong' | 'terlalu-panjang' | 'penuh';

export interface HasilKirim {
  keadaan: KeadaanAntrean;
  ok: boolean;
  /**
   * `true` = pesan DUDUK DI ANTREAN; `false` = pesan langsung dikirim sekarang
   * karena agen tidak sibuk. Keduanya `ok: true`.
   */
  masukAntrean: boolean;
  alasan?: AlasanTolak;
  /** Kalimat siap tampil. Penolakan selalu punya sebab yang bisa dibaca. */
  pesan?: string;
  /** Terisi kalau pesan benar-benar diterima (langsung atau masuk antrean). */
  id?: string;
}

const idPesan = (keadaan: KeadaanAntrean, now: number): string =>
  `p${(keadaan.urut + 1).toString(36)}-${now.toString(36)}`;

/**
 * Kirim satu pesan.
 *
 * Urutan pemeriksaan sengaja: kosong -> terlalu panjang -> penuh. Pesan kosong
 * tidak boleh menghabiskan kuota antrean, dan pesan raksasa harus ditolak karena
 * panjangnya, bukan karena antreannya kebetulan penuh - dua sebab itu butuh
 * tindakan user yang berbeda.
 */
export function kirim(
  keadaan: KeadaanAntrean,
  teks: string,
  images: readonly string[] = [],
  now: number = Date.now(),
): HasilKirim {
  const bersih = (teks ?? '').trim();
  if (bersih.length === 0) {
    return {
      keadaan,
      ok: false,
      masukAntrean: false,
      alasan: 'kosong',
      pesan: 'Pesan kosong tidak dikirim - tulis sesuatu dulu.',
    };
  }
  if (bersih.length > keadaan.batasTeks) {
    return {
      keadaan,
      ok: false,
      masukAntrean: false,
      alasan: 'terlalu-panjang',
      pesan: `Pesan terlalu panjang (${bersih.length} karakter, batas ${keadaan.batasTeks}) - pendekkan dulu.`,
    };
  }
  if (!keadaan.sibuk) {
    return { keadaan, ok: true, masukAntrean: false };
  }
  if (keadaan.daftar.length >= keadaan.batas) {
    return {
      keadaan,
      ok: false,
      masukAntrean: false,
      alasan: 'penuh',
      pesan:
        `Antrean penuh (${keadaan.batas} pesan). Tunggu giliran ini selesai, ` +
        'atau batalkan satu pesan menunggu.',
    };
  }
  const id = idPesan(keadaan, now);
  const item: PesanAntrean = { id, teks: bersih, images: [...images], masukPada: now };
  return {
    keadaan: { ...keadaan, daftar: [...keadaan.daftar, item], urut: keadaan.urut + 1 },
    ok: true,
    masukAntrean: true,
    id,
  };
}

/** Tandai ada giliran agen yang mulai jalan. */
export function giliranMulai(keadaan: KeadaanAntrean): KeadaanAntrean {
  return keadaan.sibuk ? keadaan : { ...keadaan, sibuk: true };
}

export interface HasilGiliran {
  keadaan: KeadaanAntrean;
  /** Pesan yang LANGSUNG diproses begitu giliran selesai (paling depan), atau null. */
  langsungDiproses: PesanAntrean | null;
  /** Sisa pesan menunggu setelah pengambilan ini. */
  sisa: number;
  /**
   * `true` = panggilan ini tidak melakukan apa-apa karena tidak ada giliran yang
   * sedang jalan. Tanpa penanda ini, "giliran selesai" bisa dipanggil dua kali
   * (mis. dari loop agen DAN dari tombol Stop) dan memakan dua pesan sekaligus.
   */
  dilewati: boolean;
}

/**
 * Giliran agen selesai.
 *
 * Kalau ada pesan menunggu, pesan paling depan LANGSUNG diproses - bukan menunggu
 * user menekan kirim lagi - dan sisanya tetap di antrean. Panjang antrean tetap
 * dijaga: satu giliran = satu pesan, sehingga urutannya tidak pernah kabur.
 */
export function giliranSelesai(keadaan: KeadaanAntrean): HasilGiliran {
  if (!keadaan.sibuk) {
    return { keadaan, langsungDiproses: null, sisa: keadaan.daftar.length, dilewati: true };
  }
  if (keadaan.daftar.length === 0) {
    return { keadaan: { ...keadaan, sibuk: false }, langsungDiproses: null, sisa: 0, dilewati: false };
  }
  const kepala = keadaan.daftar[0];
  const sisaDaftar = keadaan.daftar.slice(1);
  return {
    keadaan: { ...keadaan, sibuk: true, daftar: sisaDaftar },
    langsungDiproses: kepala,
    sisa: sisaDaftar.length,
    dilewati: false,
  };
}

export function jumlah(keadaan: KeadaanAntrean): number {
  return keadaan.daftar.length;
}

/** Pesan paling depan tanpa mengeluarkannya. */
export function kepala(keadaan: KeadaanAntrean): PesanAntrean | null {
  return keadaan.daftar.length > 0 ? keadaan.daftar[0] : null;
}

export function ada(keadaan: KeadaanAntrean, id: string): boolean {
  return keadaan.daftar.some((p) => p.id === id);
}

export interface HasilBatal {
  keadaan: KeadaanAntrean;
  ok: boolean;
  pesan?: string;
}

/**
 * Batalkan SATU pesan menunggu, dipilih dari `id`.
 *
 * Id yang tidak ada bukan error keras: pesan itu bisa sudah terkirim sendiri
 * (giliran sebelumnya selesai) atau sudah dibatalkan dari panel lain. Yang
 * penting: keadaan tidak berubah sama sekali, jadi pembatalan yang telat tidak
 * ikut membuang pesan berikutnya.
 */
export function batalkan(keadaan: KeadaanAntrean, id: string): HasilBatal {
  const pos = keadaan.daftar.findIndex((p) => p.id === id);
  if (pos < 0) {
    return {
      keadaan,
      ok: false,
      pesan: 'Pesan ini tidak ada lagi di antrean (mungkin sudah diproses atau sudah dibatalkan).',
    };
  }
  const sisa = keadaan.daftar.slice(0, pos).concat(keadaan.daftar.slice(pos + 1));
  return { keadaan: { ...keadaan, daftar: sisa }, ok: true };
}

export interface HasilKosongkan {
  keadaan: KeadaanAntrean;
  dibuang: number;
}

/** Buang seluruh antrean. Giliran yang sedang jalan TIDAK ikut dihentikan. */
export function kosongkan(keadaan: KeadaanAntrean): HasilKosongkan {
  if (keadaan.daftar.length === 0) return { keadaan, dibuang: 0 };
  return { keadaan: { ...keadaan, daftar: [] }, dibuang: keadaan.daftar.length };
}

/** Pindahkan item dari satu posisi ke posisi lain, sisanya tidak bergeser lebih jauh. */
function pindah(daftar: PesanAntrean[], dari: number, ke: number): PesanAntrean[] {
  const keluar = daftar.slice();
  const [item] = keluar.splice(dari, 1);
  keluar.splice(ke, 0, item);
  return keluar;
}

export interface HasilUrut {
  keadaan: KeadaanAntrean;
  ok: boolean;
  pesan?: string;
}

function geser(keadaan: KeadaanAntrean, id: string, langkah: number): HasilUrut {
  const pos = keadaan.daftar.findIndex((p) => p.id === id);
  if (pos < 0) return { keadaan, ok: false, pesan: 'Pesan tidak ada di antrean.' };
  const tujuan = pos + langkah;
  if (tujuan < 0 || tujuan >= keadaan.daftar.length) {
    return { keadaan, ok: true };
  }
  return { keadaan: { ...keadaan, daftar: pindah(keadaan.daftar, pos, tujuan) }, ok: true };
}

export function naikkan(keadaan: KeadaanAntrean, id: string): HasilUrut {
  return geser(keadaan, id, -1);
}

export function turunkan(keadaan: KeadaanAntrean, id: string): HasilUrut {
  return geser(keadaan, id, 1);
}

/** Bawa satu pesan ke paling depan - "yang ini yang penting, jalankan dulu". */
export function promosikan(keadaan: KeadaanAntrean, id: string): HasilUrut {
  const pos = keadaan.daftar.findIndex((p) => p.id === id);
  if (pos < 0) return { keadaan, ok: false, pesan: 'Pesan tidak ada di antrean.' };
  if (pos === 0) return { keadaan, ok: true };
  return { keadaan: { ...keadaan, daftar: pindah(keadaan.daftar, pos, 0) }, ok: true };
}

/**
 * Tulis ulang satu pesan DI TEMPAT: slot antreannya tetap, jadi user yang
 * memperbaiki salah ketik di baris kelima tidak perlu menyusun ulang sisanya.
 * Teks kosong ditolak supaya kotak yang dikosongkan tidak membuang pesan diam-diam.
 */
export function ubah(keadaan: KeadaanAntrean, id: string, teks: string): HasilUrut {
  const bersih = (teks ?? '').trim();
  if (bersih.length === 0) {
    return { keadaan, ok: false, pesan: 'Pesan kosong tidak disimpan - tulis sesuatu dulu.' };
  }
  if (bersih.length > keadaan.batasTeks) {
    return {
      keadaan,
      ok: false,
      pesan: `Pesan terlalu panjang (${bersih.length} karakter, batas ${keadaan.batasTeks}).`,
    };
  }
  const pos = keadaan.daftar.findIndex((p) => p.id === id);
  if (pos < 0) return { keadaan, ok: false, pesan: 'Pesan tidak ada di antrean.' };
  const daftar = keadaan.daftar.slice();
  daftar[pos] = { ...daftar[pos], teks: bersih };
  return { keadaan: { ...keadaan, daftar }, ok: true };
}

/** Salinan teks semua pesan menunggu, berurutan - dipakai uji dan log. */
export function ringkasTeks(keadaan: KeadaanAntrean): string[] {
  return keadaan.daftar.map((p) => p.teks);
}

/* ══════════════════════════════════════════════════════════════════════════
 * JEMBATAN KE PANEL (`src/lib/aiStore.ts`)
 *
 * Panel menyimpan antreannya sebagai DAFTAR BIASA (`AntrianPesan`: id/teks/images
 * di `src/lib/aiStore.ts`), sementara aturan di atas bekerja pada `KeadaanAntrean`.
 * Menyalin aturannya ke panel dilarang: dua salinan pasti berbenturan, dan yang
 * berbenturan selalu salinan yang terakhir diubah. Jadi jembatannya ada di sini -
 * daftar panel dibungkus jadi keadaan, aturan yang sudah diuji
 * (`scripts/uji-antrean-pesan.mjs`) dijalankan, lalu hasilnya dikembalikan sebagai
 * RENCANA yang bisa langsung ditulis panel.
 *
 * Fungsi di bawah tetap MURNI: tidak menyentuh store, tidak mengirim apa pun, tidak
 * mengubah argumennya. Panel yang menulis, panel yang mengirim.
 *
 * Dua aturan di sini lahir dari keluhan nyata - pesan yang diketik selagi agen
 * bekerja hilang tanpa jejak, atau duduk sampai run kelar:
 *   * penuh BUKAN alasan menolak pesan yang BARU diketik: yang dibuang adalah
 *     pesan TERLAMA (`kirimSaatSibuk`), dan pembuangannya dilaporkan;
 *   * giliran selesai BUKAN berarti pesan menunggu ikut selesai: kepala antrean
 *     LANGSUNG diambil untuk diproses (`giliranSelesaiPanel`), sisanya menunggu
 *     dengan urutan utuh.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Satu baris antrean seperti disimpan panel (`AntrianPesan` di `aiStore.ts`). */
export interface BarisAntreanPanel {
  id?: string;
  teks: string;
  images?: readonly string[];
  /** Kapan masuk antrean; baris lama dari sesi sebelumnya tidak mencatatnya. */
  masukPada?: number;
}

/**
 * Bungkus daftar antrean panel jadi `KeadaanAntrean`.
 *
 * Pemetaan baris -> pesan 1:1: TIDAK ada baris yang dilewati, walau teksnya
 * kosong. Alasannya bukan kerapian - `indeksPanel` harus selalu sama dengan indeks
 * di daftar panel, dan panel memang bisa menyimpan baris bergambar tanpa teks.
 * Melewati satu baris akan membuat "buang yang TERLAMA" membuang baris yang salah.
 *
 * `masukPada` yang tidak dicatat diisi 0, BUKAN `Date.now()`: waktu masuknya memang
 * tidak diketahui, dan mengarang waktu akan membuat umur baris di panel berbohong.
 */
export function keadaanDariPanel(
  baris: readonly BarisAntreanPanel[],
  opsi: OpsiAntrean & { urut?: number } = {},
): KeadaanAntrean {
  const dasar = buatAntrean(opsi);
  const daftar: PesanAntrean[] = baris.map((a, i) => ({
    id: (a?.id ?? '').trim() || `panel-${i}`,
    teks: (a?.teks ?? '').trim(),
    images: [...(a?.images ?? [])],
    masukPada: typeof a?.masukPada === 'number' ? a.masukPada : 0,
    indeksPanel: i,
  }));
  return { ...dasar, daftar, urut: opsi.urut ?? daftar.length };
}

export interface HasilKirimSibuk extends HasilKirim {
  /** Pesan TERLAMA yang dibuang karena antrean penuh (aturan: buang yang TERLAMA). */
  dibuangTerlama?: PesanAntrean;
}

/** Judul pendek untuk kalimat laporan - memotong JUDUL, bukan isi pesannya. */
const judulSingkat = (teks: string): string => {
  const satuBaris = teks.replace(/\s+/g, ' ').trim();
  return satuBaris.length <= 40 ? satuBaris : `${satuBaris.slice(0, 40)}…`;
};

/**
 * Kirim selagi agen SIBUK, dengan aturan "penuh -> buang yang TERLAMA".
 *
 * `kirim()` menolak pesan ke-21 (`alasan: 'penuh'`). Itu jawaban yang benar untuk
 * sebuah API, tapi jawaban yang salah untuk user yang baru saja mengetik: yang
 * mereka minta adalah pesannya MASUK, bukan penjelasan kenapa tidak bisa. Karena
 * itu pesan TERLAMA dibuang lebih dulu (paling mungkin sudah tidak relevan), pesan
 * BARU tetap masuk, dan pembuangannya dilaporkan lewat `dibuangTerlama` + `pesan` -
 * tidak ada yang hilang diam-diam.
 *
 * Penolakan lain diteruskan apa adanya: pesan kosong dan pesan terlalu panjang
 * bukan soal antrean penuh, dan user butuh sebab yang tepat untuk memperbaikinya.
 * Semua langkah di sini memakai fungsi yang sudah ada (`kirim`, `kepala`,
 * `batalkan`) - tidak ada aturan yang disalin.
 */
export function kirimSaatSibuk(
  keadaan: KeadaanAntrean,
  teks: string,
  images: readonly string[] = [],
  now: number = Date.now(),
): HasilKirimSibuk {
  const pertama = kirim(keadaan, teks, images, now);
  if (pertama.ok || pertama.alasan !== 'penuh') return pertama;

  const terlama = kepala(keadaan);
  if (!terlama) return pertama;
  const buang = batalkan(keadaan, terlama.id);
  if (!buang.ok) return pertama;
  const kedua = kirim(buang.keadaan, teks, images, now);
  if (!kedua.ok) return pertama;
  return {
    ...kedua,
    dibuangTerlama: terlama,
    pesan:
      `Antrean penuh (${keadaan.batas} pesan): pesan TERLAMA dibuang supaya pesan ` +
      `baru ini tetap masuk - "${judulSingkat(terlama.teks)}".`,
  };
}

/** Rencana yang bisa langsung ditulis panel - keputusannya sudah diambil di sini. */
export interface RencanaMasukSibuk {
  ok: boolean;
  /** Keadaan sesudah keputusan (dipakai uji/log; panel menulis daftarnya sendiri). */
  keadaan: KeadaanAntrean;
  /** Baris yang harus DITAMBAHKAN ke daftar panel, atau null kalau ditolak. */
  item: PesanAntrean | null;
  /** Indeks baris yang harus DIBUANG dari daftar panel (yang TERLAMA), atau null. */
  buangIndeks: number | null;
  alasan?: AlasanTolak;
  pesan?: string;
}

/**
 * Keputusan satu pesan yang datang selagi agen sibuk, siap ditulis panel.
 *
 * `opsi.now` bisa diisi uji supaya hasilnya deterministik; panel memakai jam
 * sungguhan. Urutan keluarnya tetap FIFO: baris baru SELALU di belakang, dan
 * hanya saat penuh baris TERLAMA yang keluar.
 */
export function rencanaMasukSaatSibuk(
  baris: readonly BarisAntreanPanel[],
  teks: string,
  images: readonly string[] = [],
  opsi: OpsiAntrean & { urut?: number; now?: number } = {},
): RencanaMasukSibuk {
  const now = opsi.now ?? Date.now();
  const keadaan = keadaanDariPanel(baris, { ...opsi, sibuk: true });
  const hasil = kirimSaatSibuk(keadaan, teks, images, now);
  const diterima = hasil.ok && hasil.id ? hasil.keadaan.daftar[hasil.keadaan.daftar.length - 1] : null;
  if (!diterima) {
    return { ok: false, keadaan, item: null, buangIndeks: null, alasan: hasil.alasan, pesan: hasil.pesan };
  }
  return {
    ok: true,
    keadaan: hasil.keadaan,
    item: {
      id: hasil.id as string,
      teks: diterima.teks,
      images: [...diterima.images],
      masukPada: diterima.masukPada,
    },
    buangIndeks: hasil.dibuangTerlama?.indeksPanel ?? null,
    pesan: hasil.pesan,
  };
}

export interface HasilGiliranPanel {
  keadaan: KeadaanAntrean;
  /** Pesan yang LANGSUNG diproses begitu giliran selesai, atau null. */
  langsungDiproses: PesanAntrean | null;
  /** Pesan yang MASIH menunggu sesudah pengambilan itu (urutan tetap). */
  sisa: PesanAntrean[];
  dilewati: boolean;
  /** Satu kalimat siap ditulis ke log/UI - siapa yang diambil, berapa yang sisa. */
  laporan: string;
}

/**
 * Giliran agen selesai: ambil kepala antrean untuk LANGSUNG diproses.
 *
 * `opsi.sibuk` harus diisi `true` oleh pemanggil yang TAHU ada giliran yang baru
 * saja selesai: daftar panel tidak menyimpan penanda itu, dan tanpa penanda
 * `giliranSelesai` menolak bekerja (`dilewati: true`) supaya satu pesan tidak
 * termakan dua kali oleh dua pemanggil yang berbeda (mis. loop agen dan tombol
 * Stop). Bawaannya `false` justru supaya lupa mengisi tidak memakan pesan.
 */
export function giliranSelesaiPanel(
  baris: readonly BarisAntreanPanel[],
  opsi: OpsiAntrean & { urut?: number } = {},
): HasilGiliranPanel {
  const keadaan = keadaanDariPanel(baris, { ...opsi, sibuk: opsi.sibuk ?? false });
  const hasil = giliranSelesai(keadaan);
  const langsung = hasil.langsungDiproses;
  const laporan = hasil.dilewati
    ? 'Tidak ada giliran yang sedang jalan - antrean tidak digeser.'
    : langsung
      ? `Giliran selesai: "${judulSingkat(langsung.teks)}" langsung diproses; ${hasil.sisa} pesan tetap menunggu.`
      : 'Giliran selesai: tidak ada pesan menunggu (antrean kosong).';
  return {
    keadaan: hasil.keadaan,
    langsungDiproses: langsung,
    sisa: hasil.keadaan.daftar,
    dilewati: hasil.dilewati,
    laporan,
  };
}
