/**
 * alurVerifikasi.ts — aturan jalur yang memaksa agen Zeph memverifikasi
 * pekerjaannya SENDIRI sebelum mengaku selesai.
 *
 * ## Masalah yang dijawab
 *
 * Agen yang baru selesai mengubah berkas punya satu godaan: mengaku selesai
 * tanpa menjalankan apa pun. Kalimat "sudah saya perbaiki" tidak menyimpan
 * bukti, dan pemeriksa yang tidak pernah dijalankan tidak pernah bisa gagal —
 * jadi "hijau" tanpa basis. Modul ini memutus rantai itu:
 *
 * 1. **Setiap jenis perubahan punya pemeriksa.** Mengubah `.ts`/`.tsx` berarti
 *    `npx tsc --noEmit`; mengubah `.rs` berarti `cargo test --lib`; mengubah
 *    skrip uji berarti menjalankan skrip ITU. Perubahan yang jenisnya belum
 *    dipetakan tidak dianggap terverifikasi.
 * 2. **Keluaran dibaca, bukan diasumsikan.** Kode keluar bukan nol, keluaran
 *    yang memuat penanda gagal walau kode 0, atau proses yang tak pernah
 *    selesai (`kodeKeluar: null`, mis. timeout) semuanya berarti merah.
 *    "Hijau" hanya satu arti: selesai, kode 0, tanpa penanda gagal.
 * 3. **Merah menutup pintu.** Selama ada pemeriksa merah, putusan tidak pernah
 *    `boleh selesai`. Agen memperbaiki dulu. Setelah `BATAS_PERCOBAAN` (3 —
 *    angka yang sama dengan aturan kerja repo "3 percobaan gagal → stop &
 *    lapor") kegagalan yang sama berulang, putusannya `berhenti + lapor`:
 *    berhenti dan lapor bukti, bukan percobaan keempat.
 * 4. **Laporan akhir ikut diperiksa.** Kalimat penutup tanpa perintah dan
 *    keluaran nyata ditolak `validasiLaporan()`; `laporanAkhir()` bisa
 *    membangun laporan yang lolos pemeriksaan itu sendiri.
 *
 * ## Murni, tanpa app
 *
 * Tidak ada `import` sama sekali di berkas ini: tidak menjalankan proses,
 * tidak menyentuh `fs`, tidak tahu Zustand atau React. Ia hanya (a) memetakan
 * perubahan ke perintah, (b) menilai keluaran yang diserahkan runner, (c)
 * memutuskan, (d) menyusun/memeriksa laporan. Karena itu seluruhnya bisa
 * diuji dari `node scripts/uji-alur-verifikasi.mjs` tanpa app hidup — dan
 * justru HARUS begitu: aturan yang hanya bisa diuji lewat app adalah aturan
 * yang paling akhir diuji.
 *
 * ## Preseden: cocok pertama menang
 *
 * `ATURAN` dibaca atas ke bawah dan aturan PERTAMA yang cocok menentukan jenis
 * sebuah berkas — sama seperti `toolRules.ts`. Urutannya disengaja: aturan
 * skrip (`scripts/*.mjs`) harus dibaca SEBELUM aturan dokumen, kalau tidak
 * berkas uji akan dilabeli "dokumen" lalu lolos tanpa pernah dijalankan.
 */

/* ------------------------------------------------------------------------- */
/* Kosakata                                                                   */
/* ------------------------------------------------------------------------- */

export type JenisPeriksa = 'ts' | 'rust' | 'skrip' | 'dokumen' | 'tak-dikenal';

/**
 * Nilai satu kali jalan periksa.
 *
 * `belum-dijalankan` bukan nilai yang lebih ringan dari `merah` — ia sama-sama
 * menghalangi klaim selesai. Dibedakan karena sebabnya berbeda: yang satu
 * "gagal", yang satu "tidak pernah dicoba", dan agen yang membaca laporan
 * berhak tahu mana yang terjadi.
 */
export type Nilai = 'hijau' | 'merah' | 'tidak-jelas' | 'belum-dijalankan' | 'ditolak';

export type StatusPutusan = 'boleh selesai' | 'belum selesai' | 'berhenti + lapor' | 'ditolak';

/**
 * Batas percobaan untuk SATU perintah. Angkanya 3, sama dengan aturan kerja
 * repo; karena itu juga tidak ada percobaan keempat yang diam-diam diizinkan —
 * `putuskan()` yang menegakkan, bukan disiplin agen.
 */
export const BATAS_PERCOBAAN = 3;

/* ------------------------------------------------------------------------- */
/* Daftar izin perintah                                                       */
/* ------------------------------------------------------------------------- */

/** Perintah tetap (tanpa argumen yang berubah-ubah). */
export const PERINTAH_TETAP: readonly string[] = ['npx tsc --noEmit', 'cargo test --lib'];

/** Perintah dinamis yang masih termasuk izin: menjalankan skrip uji repo. */
export const POLA_PERINTAH_DINAMIS: readonly RegExp[] = [/^node (?:scripts|testfiles)\/[\w./-]+\.mjs$/];

/**
 * Perintah hanya boleh dijalankan kalau ada di daftar izin.
 *
 * Alasannya bukan kekurangan imajinasi: modul ini menyusun perintah dari nama
 * berkas yang bisa datang dari mana saja. Tanpa daftar izin, berkas bernama
 * `scripts/x.mjs;rm -rf /` menghasilkan perintah yang "terlihat benar". Perintah
 * di luar izin menghasilkan `ditolak`, bukan dijalankan.
 */
export function perintahDiizinkan(perintah: string): boolean {
  const p = String(perintah ?? '').trim();
  if (!p) return false;
  if (PERINTAH_TETAP.includes(p)) return true;
  return POLA_PERINTAH_DINAMIS.some((rx) => rx.test(p));
}

/**
 * Penanda gagal di dalam keluaran — jaring kedua saat kode keluar 0.
 *
 * Kode keluar 0 dengan "error TS2322" di keluaran tetap bukan hijau: skrip
 * pembungkus, pipa, atau perintah yang menelan kegagalan anaknya bisa
 * melaporkan 0 untuk run yang gagal.
 *
 * Tapi jaring ini harus SEMPIT, dan bentuk sempitnya dibayar dengan pengalaman
 * nyata: versi pertamanya cuma `/\berror TS\d+\b/`, dan ia langsung salah
 * menuduh run yang HIJAU. `scripts/uji-alur-verifikasi.mjs` yang lulus 17/17
 * mencetak `error TS2322` — di dalam teks yang justru MENGUTIP kasus uji. Hasil
 * awalnya keliru: lulus, kode 0, tapi dinilai merah; agen lalu berputar
 * memperbaiki yang sudah hijau sampai batas percobaan habis. Karena itu setiap
 * penanda harus berbentuk baris yang HANYA bisa keluar dari alat yang gagal:
 *
 *   * tsc   : baris yang DIMULAI token jalur (tanpa spasi/kurung) langsung
 *              diikuti koordinat, bentuk non-pretty `berkas(12,7): error TS2322:`
 *              maupun pretty di TTY `berkas:12:7 - error TS2322:`. Kutipan di
 *              tengah prosa tidak dihitung — itu aturan yang sama dengan
 *              GAGAL/FAIL, dan itu yang membuat run hijau yang membahas error
 *              lama tetap hijau.
 *   * harness: baris yang DIMULAI `GAGAL` / `FAIL` (posisi kolom 0, bukan kutipan)
 *   * cargo : `test result: FAILED`, atau `panicked at <sesuatu>.rs:baris`
 */
export const PENANDA_GAGAL: readonly RegExp[] = [
  /^[^\s(]{1,300}\(\d+,\d+\): error TS\d{3,}/m,
  /^[^\s(]{1,300}:\d+:\d+ - error TS\d{3,}/m,
  /^FAIL\b/m,
  /^\s*GAGAL\b/m,
  /test result: FAILED/,
  /\bpanicked at [^\n]*\.rs:\d+/,
];

/* ------------------------------------------------------------------------- */
/* Peta perubahan -> pemeriksa                                                */
/* ------------------------------------------------------------------------- */

/** Potongan jalur yang menandai akar repo; dipakai menormalkan jalur absolut. */
const DIR_REPO: readonly string[] = ['scripts/', 'src-tauri/', 'src/', 'docs/', 'testfiles/', 'public/'];

/**
 * Normalkan jalur: backslash -> slash, dan buang awalan absolut.
 *
 * Agen sering menulis `D:\Zephyr\src\lib\a.ts` atau `/d/zephyr/src/lib/a.ts`.
 * Tanpa normalisasi, aturan `^scripts/` tidak pernah kena dan skrip uji lolos
 * sebagai "dokumen". Dicari potongan direktori repo yang dikenal, bukan pola
 * drive hardcoded, supaya worktree di path lain ikut benar.
 */
export function normJalur(jalur: string): string {
  const p = String(jalur ?? '').replace(/\\/g, '/');
  for (const d of DIR_REPO) {
    const i = p.indexOf(d);
    if (i >= 0) return p.slice(i);
  }
  return p.replace(/^[A-Za-z]:\//, '').replace(/^\/+/, '').replace(/^\.\//, '');
}

interface Aturan {
  id: string;
  jenis: JenisPeriksa;
  /** Perintahnya ada? Dokumen tidak butuh pemeriksa, jadi `wajib: false`. */
  wajib: boolean;
  cocok: (jalur: string) => boolean;
  /** Untuk aturan dinamis (nama skrip); aturan tetap cukup mengembalikan konstanta. */
  perintah?: (jalur: string) => string;
  /** Direktori kerja perintah; '' = akar repo. */
  cwd?: string;
  alasan: string;
}

const ATURAN: readonly Aturan[] = [
  {
    id: 'ts',
    jenis: 'ts',
    wajib: true,
    cocok: (j) => /\.tsx?$/.test(j),
    perintah: () => 'npx tsc --noEmit',
    cwd: '',
    alasan:
      'TypeScript diperiksa penuh oleh tsc pada konfigurasi repo (tsconfig.json, include: ["src"]) — ' +
      'jadi berkas .ts lain yang mengimpor berkas yang diubah ikut terbaca, bukan hanya berkas itu.',
  },
  {
    id: 'rust',
    jenis: 'rust',
    wajib: true,
    cocok: (j) => /\.rs$/.test(j),
    perintah: () => 'cargo test --lib',
    cwd: 'src-tauri',
    alasan:
      'Crate Rust diuji lewat unit test lib-nya. cwd WAJIB src-tauri — dijalankan dari akar repo, cargo ' +
      'mengeluh "could not find Cargo.toml" dan itu terlihat seperti gagal padahal cuma salah tempat.',
  },
  {
    id: 'skrip-uji',
    jenis: 'skrip',
    wajib: true,
    cocok: (j) => j.startsWith('scripts/') && /\.(mjs|cjs|js)$/.test(j),
    perintah: (j) => `node ${j}`,
    cwd: '',
    alasan:
      'Skrip uji membuktikan dirinya sendiri saat dijalankan: harness yang diubah lalu tidak dijalankan ' +
      'adalah klaim, bukan bukti. Dijalankan dari akar repo supaya impor relatif `./lib-cdp.mjs` dan ' +
      '`../src/lib/*.ts` tetap benar.',
  },
  {
    id: 'dokumen',
    jenis: 'dokumen',
    wajib: false,
    cocok: (j) =>
      j.startsWith('docs/') ||
      /\.(md|txt|svg|png|ico|jpg|jpeg|gif|css|html|json|lock)$/.test(j) ||
      j === 'LICENSE' ||
      j === '.gitignore',
    alasan:
      'Dokumen/aset tidak punya pemeriksa otomatis yang dipetakan di sini; mengubah prosa tidak bisa ' +
      'membuat kompilasi merah. Ini BUKAN izin mengaku "terverifikasi": yang benar adalah "tidak ada ' +
      'pemeriksa otomatis untuk perubahan ini".',
  },
];

export interface PermintaanPeriksa {
  jalur: string;
  jenis: JenisPeriksa;
  /** null = tidak ada perintah yang berhak dijalankan untuk jenis ini. */
  perintah: string | null;
  cwd: string;
  wajib: boolean;
  alasan: string;
}

/** Petakan SATU berkas ke jenisnya dan perintah yang relevan. */
export function periksaBerkas(jalur: string): PermintaanPeriksa {
  const j = normJalur(jalur);
  for (const a of ATURAN) {
    if (!a.cocok(j)) continue;
    return {
      jalur: j,
      jenis: a.jenis,
      perintah: a.perintah ? a.perintah(j) : null,
      cwd: a.cwd ?? '',
      wajib: a.wajib,
      alasan: a.alasan,
    };
  }
  return {
    jalur: j,
    jenis: 'tak-dikenal',
    perintah: null,
    cwd: '',
    wajib: true,
    alasan:
      'Jenis berkas ini belum dipetakan ke pemeriksa. Aturannya: JANGAN menebak perintah (menebak ' +
      'menghasilkan hijau yang tidak berarti), dan JANGAN mengaku selesai seolah sudah diverifikasi — ' +
      'lapor apa yang bisa diperiksa manual, atau tambahkan aturannya di sini lebih dulu.',
  };
}

export interface PerintahRencana {
  perintah: string;
  cwd: string;
  jenis: JenisPeriksa;
  /** Berkas yang memicu perintah ini; satu perintah bisa melayani banyak berkas. */
  sebab: string[];
}

export interface Rencana {
  /** Perintah unik yang wajib dijalankan, urutan tetap. */
  perintah: PerintahRencana[];
  dokumen: PermintaanPeriksa[];
  takDikenal: PermintaanPeriksa[];
  /** Ada minimal satu perintah wajib? */
  wajib: boolean;
}

const URUT_JENIS: Record<string, number> = { ts: 0, rust: 1, skrip: 2 };

/**
 * Susun rencana verifikasi untuk sekumpulan berkas yang berubah.
 *
 * Perintah di-DEDUPE: sepuluh berkas `.ts` tetap satu `npx tsc --noEmit`.
 * Menjalankan tsc sepuluh kali tidak menambah bukti sedikit pun dan membuat
 * agen membuang jatah waktu; satu run sudah memeriksa seluruh proyek, jadi di
 * sini dedupe bukan optimasi tapi kebenaran.
 */
export function rencanaVerifikasi(jalurBerkas: string[]): Rencana {
  const daftar = (Array.isArray(jalurBerkas) ? jalurBerkas : []).map(periksaBerkas);
  const peta = new Map<string, PerintahRencana>();
  const dokumen: PermintaanPeriksa[] = [];
  const takDikenal: PermintaanPeriksa[] = [];

  for (const p of daftar) {
    if (p.jenis === 'dokumen') {
      dokumen.push(p);
      continue;
    }
    if (p.jenis === 'tak-dikenal' || !p.perintah) {
      takDikenal.push(p);
      continue;
    }
    const kunci = `${p.cwd}|${p.perintah}`;
    const ada = peta.get(kunci);
    if (ada) ada.sebab.push(p.jalur);
    else peta.set(kunci, { perintah: p.perintah, cwd: p.cwd, jenis: p.jenis, sebab: [p.jalur] });
  }

  const perintah = [...peta.values()].sort((a, b) => {
    const ja = URUT_JENIS[a.jenis] ?? 9;
    const jb = URUT_JENIS[b.jenis] ?? 9;
    if (ja !== jb) return ja - jb;
    if (a.perintah !== b.perintah) return a.perintah < b.perintah ? -1 : 1;
    return a.cwd < b.cwd ? -1 : a.cwd > b.cwd ? 1 : 0;
  });

  return { perintah, dokumen, takDikenal, wajib: perintah.length > 0 };
}

/* ------------------------------------------------------------------------- */
/* Menilai keluaran                                                          */
/* ------------------------------------------------------------------------- */

/** Nilai satu hasil jalan. `perintah` ikut diperiksa ke daftar izin. */
export function nilaiKeluaran(perintah: string, kodeKeluar: number | null, keluaran: string): Nilai {
  if (!perintahDiizinkan(perintah)) return 'ditolak';
  if (kodeKeluar === null || typeof kodeKeluar !== 'number' || !Number.isFinite(kodeKeluar)) {
    return 'tidak-jelas';
  }
  const teks = String(keluaran ?? '');
  if (kodeKeluar !== 0) return 'merah';
  for (const p of PENANDA_GAGAL) if (p.test(teks)) return 'merah';
  return 'hijau';
}

/* ------------------------------------------------------------------------- */
/* Berkas mana yang merah                                                     */
/* ------------------------------------------------------------------------- */

const RX_BERKAS_TS = [
  /^([^\s(]{1,300})\(\d+,\d+\): error TS\d{3,}/m,
  /^([^\s(]{1,300}):\d+:\d+ - error TS\d{3,}/m,
];

/**
 * Ambil nama berkas dari baris diagnostik di keluaran — siapa yang sebenarnya merah.
 *
 * Ini bukan hiasan laporan. Di repo ini beberapa lane mengedit bersamaan dan
 * `npx tsc --noEmit` itu repo-wide: merah bisa datang dari berkas yang BUKAN
 * milik yang menjalankannya. Aturannya tetap tidak berubah (pohon merah = tidak
 * boleh mengaku selesai — hijau berarti hijau), tapi laporan yang menyebut
 * "tsc merah" saja membuat manusia harus menebak siapa yang harus berhenti.
 * Dengan daftar ini, laporan bisa menyebut berkasnya.
 */
export function berkasBermasalah(keluaran: string): string[] {
  const teks = String(keluaran ?? '');
  const keluar = new Set<string>();
  for (const rx of RX_BERKAS_TS) {
    const semua = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    for (const m of teks.matchAll(semua)) keluar.add(m[1]);
  }
  return [...keluar].sort();
}

/* ------------------------------------------------------------------------- */
/* Keputusan                                                                  */
/* ------------------------------------------------------------------------- */

export interface HasilJalankan {
  perintah: string;
  /** null = proses tidak pernah selesai (timeout / dibunuh). */
  kodeKeluar: number | null;
  keluaran: string;
}

export interface Ubah {
  /** Berkas yang diubah, jalur relatif repo (absolut pun dinormalkan). */
  jalur: string[];
  /** Hasil jalan yang benar-benar terjadi, urut waktu. */
  hasil?: HasilJalankan[];
}

export interface NilaiPerintah {
  perintah: string;
  nilai: Nilai;
  /** Berapa kali perintah ini dijalankan. */
  jalankan: number;
}

export interface Putusan {
  status: StatusPutusan;
  bolehSelesai: boolean;
  wajib: boolean;
  perintah: string[];
  nilai: NilaiPerintah[];
  /** Jumlah jalan terbanyak untuk satu perintah wajib. */
  percobaan: number;
  batasPercobaan: number;
  /** Laporan akhir diminta DAN lolos validasi? */
  laporanSiap: boolean;
  /** Berkas yang disebut baris diagnostik pada hasil yang tidak hijau. */
  berkasMerah: string[];
  dokumen: string[];
  takDikenal: string[];
  alasan: string;
}

const URUT_STATUS: Record<StatusPutusan, number> = {
  'boleh selesai': 0,
  'belum selesai': 1,
  'berhenti + lapor': 2,
  ditolak: 3,
};

/**
 * Putuskan boleh-tidaknya mengaku selesai.
 *
 * Urutan pemeriksaan penting karena beberapa masalah bisa muncul bersamaan;
 * `naikkan()` hanya menaikkan status ke yang lebih berat, jadi laporkan
 * sebabnya dari yang paling mematikan ke yang paling ringan.
 */
export function putuskan(ubah: Ubah, opsi: { laporan?: string } = {}): Putusan {
  const rencana = rencanaVerifikasi(ubah && Array.isArray(ubah.jalur) ? ubah.jalur : []);
  const hasil: HasilJalankan[] = ubah && Array.isArray(ubah.hasil) ? ubah.hasil : [];

  let status: StatusPutusan = 'boleh selesai';
  let alasan = rencana.wajib
    ? 'semua pemeriksa wajib hijau'
    : 'tidak ada berkas yang butuh pemeriksa otomatis; perubahan dokumen diterima tanpa jalur uji';
  const naikkan = (s: StatusPutusan, a: string) => {
    if (URUT_STATUS[s] > URUT_STATUS[status]) {
      status = s;
      alasan = a;
    }
  };

  /* 1. Jenis berkas yang belum dipetakan: tidak ada jalur verifikasi sama
        sekali, jadi klaim "sudah diverifikasi" tidak punya dasar. */
  if (rencana.takDikenal.length) {
    naikkan(
      'ditolak',
      `jenis berkas belum dipetakan ke pemeriksa: ${rencana.takDikenal.map((x) => x.jalur).join(', ')} — ` +
        `tidak ada perintah yang boleh dijalankan untuk berkas itu, jadi jangan mengaku selesai`,
    );
  }

  /* 2. Perintah di luar daftar izin: tolak, jangan dijalankan. */
  const asing = hasil.map((h) => String(h && h.perintah)).filter((p) => !perintahDiizinkan(p));
  if (asing.length) {
    naikkan(
      'ditolak',
      `perintah di luar daftar izin: ${[...new Set(asing)].join(', ')} — tidak dijalankan, dan hasilnya ` +
        `tidak dihitung sebagai bukti`,
    );
  }

  /* 3. Tiap perintah wajib: pernah jalan? nilainya apa? sudah berapa kali? */
  const nilai: NilaiPerintah[] = [];
  let percobaan = 0;
  for (const p of rencana.perintah) {
    const semua = hasil.filter((h) => h && h.perintah === p.perintah);
    if (!semua.length) {
      nilai.push({ perintah: p.perintah, nilai: 'belum-dijalankan', jalankan: 0 });
      naikkan(
        'belum selesai',
        `pemeriksa "${p.perintah}" belum dijalankan padahal ${p.sebab.join(', ')} berubah — jalankan dulu, ` +
          `baca keluarannya, baru boleh bicara selesai`,
      );
      continue;
    }
    const terakhir = semua[semua.length - 1];
    const n = nilaiKeluaran(terakhir.perintah, terakhir.kodeKeluar, terakhir.keluaran);
    nilai.push({ perintah: p.perintah, nilai: n, jalankan: semua.length });
    percobaan = Math.max(percobaan, semua.length);

    if (n === 'ditolak') {
      naikkan('ditolak', `perintah "${p.perintah}" tidak ada di daftar izin — hasilnya tidak sah sebagai bukti`);
    } else if (n === 'merah' || n === 'tidak-jelas' || n === 'belum-dijalankan') {
      const rincian =
        n === 'merah'
          ? `keluaran merah (kode ${terakhir.kodeKeluar})`
          : n === 'tidak-jelas'
            ? 'keluaran tidak bisa dinilai: proses tak pernah selesai (kode keluar null/timeout)'
            : 'belum dijalankan';
      if (semua.length >= BATAS_PERCOBAAN) {
        naikkan(
          'berhenti + lapor',
          `"${p.perintah}" sudah ${semua.length} kali (batas ${BATAS_PERCOBAAN}) dan masih belum hijau (${rincian}) — ` +
            `berhenti, jangan percobaan ke-${semua.length + 1}; laporkan perintah + keluaran nyatanya`,
        );
      } else {
        naikkan(
          'belum selesai',
          `"${p.perintah}" ${rincian} pada percobaan ${semua.length}/${BATAS_PERCOBAAN} — perbaiki dulu, ` +
            `lalu jalankan ulang dan baca keluarannya`,
        );
      }
    }
  }

  /* 4. Laporan akhir yang diminta wajib memuat perintah + keluaran nyata. */
  let laporanSiap = false;
  if (opsi.laporan !== undefined) {
    const v = validasiLaporan(opsi.laporan, hasil);
    laporanSiap = v.ok;
    if (!v.ok) {
      naikkan(
        'belum selesai',
        `laporan akhir belum memuat bukti nyata (${v.kurang.join('; ')}) — sertakan perintah dan keluaran apa ` +
          `adanya, bukan ringkasan yang meyakinkan`,
      );
    }
  }

  /* 5. Siapa yang sebenarnya merah: dipakai laporan supaya merah di berkas
        lane lain tidak disalahartikan sebagai milik pelapor. */
  const berkasMerah = new Set<string>();
  for (const h of hasil) {
    if (!h) continue;
    if (nilaiKeluaran(h.perintah, h.kodeKeluar, h.keluaran) === 'hijau') continue;
    for (const b of berkasBermasalah(h.keluaran)) berkasMerah.add(b);
  }

  return {
    status,
    bolehSelesai: status === 'boleh selesai',
    wajib: rencana.wajib,
    perintah: rencana.perintah.map((p) => p.perintah),
    nilai,
    percobaan,
    batasPercobaan: BATAS_PERCOBAAN,
    laporanSiap,
    berkasMerah: [...berkasMerah].sort(),
    dokumen: rencana.dokumen.map((d) => d.jalur),
    takDikenal: rencana.takDikenal.map((d) => d.jalur),
    alasan,
  };
}

/* ------------------------------------------------------------------------- */
/* Laporan akhir                                                              */
/* ------------------------------------------------------------------------- */

const POTONGAN_MAKS = 60;
const KELUARAN_MAKS = 8000;
const TANPA_KELUARAN = '(tanpa keluaran)';

/** Baris pertama yang tidak kosong, dipotong pendek — sidik jari bukti. */
function potongan(teks: string): string {
  const baris = String(teks ?? '')
    .split(/\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!baris.length) return '';
  return baris[0].slice(0, POTONGAN_MAKS);
}

/**
 * Periksa kelengkapan laporan akhir.
 *
 * Yang dituntut untuk SETIAP hasil: perintahnya disebut apa adanya, potongan
 * keluaran nyatanya ada, dan kode keluarnya tertulis. Tiga hal itu persis yang
 * hilang dari laporan karangan — dan yang membuat pembaca bisa mengecek ulang
 * tanpa memercayai penulisnya.
 */
export function validasiLaporan(laporan: string, hasil: HasilJalankan[]): { ok: boolean; kurang: string[] } {
  const teks = String(laporan ?? '');
  const kurang: string[] = [];
  if (!teks.trim()) return { ok: false, kurang: ['laporan kosong'] };

  for (const h of Array.isArray(hasil) ? hasil : []) {
    if (!h) continue;
    const p = String(h.perintah ?? '');
    if (!p) continue;
    if (!teks.includes(p)) {
      kurang.push(`perintah "${p}" tidak disebut`);
      continue;
    }
    if (h.kodeKeluar === null || typeof h.kodeKeluar !== 'number') {
      if (!/kode[^0-9]{0,12}timeout/i.test(teks)) kurang.push(`kode keluar "${p}" (timeout) tidak ditulis`);
    } else if (!new RegExp(`kode[^0-9]{0,12}(?<!\\d)${h.kodeKeluar}(?!\\d)`).test(teks)) {
      kurang.push(`kode keluar ${h.kodeKeluar} untuk "${p}" tidak ditulis`);
    }
    const pot = potongan(h.keluaran);
    if (pot) {
      if (!teks.includes(pot)) kurang.push(`keluaran nyata "${p}" tidak disertakan`);
    } else if (!teks.includes(TANPA_KELUARAN)) {
      kurang.push(`"${p}" tidak disertai penanda ${TANPA_KELUARAN}`);
    }
  }
  return { ok: kurang.length === 0, kurang };
}

/** Bangun laporan akhir yang lolos `validasiLaporan()` — sudah termasuk perintah + keluaran. */
export function laporanAkhir(putusan: Putusan, hasil: HasilJalankan[]): string {
  const baris: string[] = [];
  baris.push(`## Verifikasi mandiri — ${putusan.status}`);
  baris.push('');
  baris.push(`- Wajib diperiksa: ${putusan.wajib ? 'ya' : 'tidak (tidak ada perintah yang dipetakan)'}`);
  baris.push(`- Perintah: ${putusan.perintah.length ? putusan.perintah.map((p) => `\`${p}\``).join(', ') : '(tidak ada)'}`);
  baris.push(`- Percobaan: ${putusan.percobaan}/${putusan.batasPercobaan}`);
  if (putusan.dokumen.length) baris.push(`- Dokumen (tanpa pemeriksa otomatis): ${putusan.dokumen.join(', ')}`);
  if (putusan.berkasMerah.length) baris.push(`- Berkas yang disebut merah: ${putusan.berkasMerah.join(', ')}`);
  if (putusan.takDikenal.length) baris.push(`- Belum dipetakan: ${putusan.takDikenal.join(', ')}`);
  baris.push(`- Alasan: ${putusan.alasan}`);
  baris.push('');
  baris.push('### Keluaran nyata');
  baris.push('');

  const urut = [...(Array.isArray(hasil) ? hasil : [])].sort((a, b) => (a.perintah < b.perintah ? -1 : a.perintah > b.perintah ? 1 : 0));
  urut.forEach((h, i) => {
    const n = nilaiKeluaran(h.perintah, h.kodeKeluar, h.keluaran);
    const kode = h.kodeKeluar === null || typeof h.kodeKeluar !== 'number' ? 'kode timeout' : `kode ${h.kodeKeluar}`;
    baris.push(`#### ${i + 1}. \`${h.perintah}\` — ${kode} (${n})`);
    baris.push('');
    let isi = String(h.keluaran ?? '').replace(/\s+$/, '');
    if (!isi.trim()) isi = TANPA_KELUARAN;
    if (isi.length > KELUARAN_MAKS) isi = `${isi.slice(0, KELUARAN_MAKS)}\n… (dipotong, ${isi.length} karakter)`;
    baris.push('```');
    baris.push(isi);
    baris.push('```');
    baris.push('');
  });

  return baris.join('\n');
}
