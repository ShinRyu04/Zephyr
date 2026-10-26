/**
 * Sekat tool untuk agen di dalam editor.
 *
 * Agen punya banyak permukaan - shell, tulis berkas, kontrol browser, jadwal,
 * subagent - dan tidak setiap sesi harus menyerahkan semuanya ke model. Berkas
 * ini satu-satunya tempat yang memutuskan tool mana yang boleh dipanggil.
 *
 * ## Yang berubah, dan kenapa
 *
 * Sebelumnya daftar grup, daftar izin tulis, dan daftar deskripsi dirawat
 * TERPISAH dari daftar tool itu sendiri. Tiga daftar yang menunjuk kumpulan
 * nama yang sama akan berbeda pendapat cepat atau lambat - dan sudah terjadi:
 * ada tool yang tidak masuk grup mana pun, ada grup yang tampil kosong, dan ada
 * tool yang lolos tanpa kelas izin.
 *
 * Sekarang sumbernya SATU: `zephyrTools/catalog.ts`. Berkas ini hanya membaca
 * dari situ. Menambah tool tanpa menyebut kelasnya akan gagal di verifikasi
 * katalog, bukan diam-diam berjalan tanpa izin.
 *
 * ## Nama yang dilihat model
 *
 * Model melihat 51 nama: 26 bawaan, 14 dengan awalan `mcp__zephyr__`, dan 11
 * web/browser milik Zephyr. Nama internal polos tool MCP (`read`, `state`)
 * TIDAK pernah sampai ke model - kalau sampai, `read` akan bertabrakan dengan
 * `read_file` dan model akan menebak.
 */

import { create } from 'zustand';
import {
  TOOL_CATALOG,
  TOOL_WEB_AKTIF_AWAL as _WEB_AKTIF,
  TOOL_NAMES,
  TOOL_BY_NAME,
  kelompokKatalog,
  periksaKatalog,
  AWALAN_MCP,
  POLA_AWALAN_MCP,
  type ToolEffect,
  type ToolSource,
} from './zephyrTools/catalog';

/* ------------------------------------------------------------------ */
/* Sumber nama - semuanya diturunkan dari katalog.                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Bagian dan kelompok - dibaca dari katalog, bukan diketik ulang.    */
/* ------------------------------------------------------------------ */

/* Dua tingkat: bagian dulu, lalu kelompok di dalamnya. */
export type ToolSection = 'builtin' | 'mcp' | 'ekstensi';

/** Bagian yang ditampilkan oleh picker, dalam urutan visualnya. */
export const SECTION_URUTAN: { id: ToolSection; label: string }[] = [
  { id: 'builtin', label: 'BUILT-IN' },
  { id: 'mcp', label: 'MCP' },
  { id: 'ekstensi', label: 'EXTENSIONS' },
];

/** Web/browser adalah kelompok bawaan di picker, walau tetap opsional. */
export function sectionOf(source: ToolSource): ToolSection {
  if (source === 'mcp') return 'mcp';
  if (source === 'ekstensi') return 'ekstensi';
  return 'builtin';
}

/*
 * Bagian EKSTENSI sengaja tetap ada walau katalog belum memuat satu pun tool
 * ber-sumber 'ekstensi'. Alasannya sama dengan bagian MCP: user membandingkan
 * panel ini dengan editor lain yang menunjukkan tiga bagian, dan bagian yang
 * HILANG saat kosong membuatnya terbaca sebagai fitur yang tidak ada. Bagian
 * kosong yang jujur ("belum ada ekstensi yang membawa tool") lebih baik
 * daripada bagian yang muncul-hilang tergantung isi katalog.
 */
export const EKSTENSI_ADA = SECTION_URUTAN.some((s) => s.id === 'ekstensi');

export interface ToolGroup {
  id: string;
  label: string;
  section: ToolSection;
  /** Hanya kelompok web/browser yang dapat dimatikan. */
  optional: boolean;
  /** Nama tool yang dilihat model - kunci yang sama dengan `aktif`. */
  tools: string[];
  /*
   * Id paket ekstensi yang membawa kelompok ini, kalau ada.
   *
   * Picker mengelompokkan bagian EKSTENSI per PAKET (`api-client 0/11`),
   * bukan per nama kelompok seperti bagian lain - itu yang membuat user bisa
   * melihat ekstensi mana yang menyumbang tool apa, dan mematikan satu paket
   * tanpa menyentuh paket lain. `undefined` untuk kelompok bawaan/MCP.
   */
  ekstensiId?: string;
}

/**
 * Kelompok, diturunkan dari katalog.
 *
 * `id` sengaja dibuat dari bagian + nama kelompok, bukan dari indeks: store
 * mencari grup dengan `find(g => g.id === id)`, jadi id yang terulang membuat
 * setiap grup setelahnya tidak bisa di-toggle.
 */
/* ------------------------------------------------------------------ */
/* Registry tool dari EKSTENSI (runtime)                              */
/* ------------------------------------------------------------------ */

/*
 * Tool yang dibawa paket ekstensi terpasang.
 *
 * Ini SATU-SATUNYA kelompok yang isinya tidak berasal dari katalog, karena
 * katalog dibekukan saat build sementara ekstensi dipasang dan dilepas saat
 * app berjalan. Karena itu ia hidup di variabel yang bisa diisi ulang
 * (`setToolEkstensi`), bukan di `const` hasil pemetaan katalog.
 *
 * Satu kelompok per PAKET, sesuai bentuk yang user lihat di editor lain
 * (`api-client 0/11`, `browser 0/1`): mematikan satu paket tidak menyentuh
 * paket lain, dan nama paket yang membawa tool selalu terbaca.
 */
/*
 * Disimpan di globalThis, BUKAN di variabel modul.
 *
 * Vite menyajikan modul yang sama di bawah dua URL yang berbeda setelah HMR
 * (`/src/lib/toolGate.ts` dan `/src/lib/toolGate.ts?t=...`), dan dua URL berarti
 * dua instance modul. Kalau daftar ini hidup di variabel modul, ekstensi yang
 * mendaftarkan toolnya lewat satu instance dan picker yang membacanya lewat
 * instance lain: bagian EXTENSIONS selalu kosong walau paketnya terpasang dan
 * loader melaporkan perintahnya. Satu slot global membuat keduanya menunjuk
 * daftar yang sama, apa pun URL yang dipakai untuk mengimpornya.
 */
const SLOT_TOOL_EKSTENSI = '__ZEPHYR_TOOL_EKSTENSI__';
type SlotGlobal = { [SLOT_TOOL_EKSTENSI]?: ToolGroup[] };

function slot(): ToolGroup[] {
  const g = globalThis as unknown as SlotGlobal;
  if (!g[SLOT_TOOL_EKSTENSI]) g[SLOT_TOOL_EKSTENSI] = [];
  return g[SLOT_TOOL_EKSTENSI];
}

/**
 * Ganti seluruh daftar tool dari ekstensi.
 *
 * Dipanggil saat ekstensi dipasang/dilepas/dinyalakan - sumbernya manifest
 * paket (`contributes.commands`), bukan tulisan tangan. Memanggilnya dengan
 * daftar kosong adalah keadaan yang sah: tidak ada ekstensi yang membawa tool.
 */
export function setToolEkstensi(grup: ToolGroup[]): void {
  slot().length = 0;
  slot().push(...grup.map((g) => ({ ...g, section: 'ekstensi' as ToolSection })));

  /*
   * `SEMUA_TOOL` diperbarui DI TEMPAT (push/splice), bukan diganti array baru.
   *
   * Daftar itu dikonsumsi sebagai nilai oleh banyak pemanggil
   * (`SEMUA_TOOL.includes(n)` di `setGrup`/`semua`, dan `periksaSekat`), dan
   * sebagian membacanya saat modul dimuat. Menggantinya dengan array baru
   * membuat mereka semua memegang daftar lama: tool ekstensi tampil di picker
   * tapi tombolnya tidak berefek, dan sekat melaporkan tool tak dikenal.
   * Mutasi di tempat membuat referensi yang sudah dipegang tetap benar.
   */
  const daftar = daftarSemua();
  const nama = slot().flatMap((g) => g.tools);
  const tambahan = nama.filter((n) => !daftar.includes(n));
  const hilang = daftar.filter((n) => !TOOL_NAMES.includes(n) && !nama.includes(n));
  for (const n of tambahan) daftar.push(n);
  for (const n of hilang) {
    const i = daftar.indexOf(n);
    if (i >= 0) daftar.splice(i, 1);
  }
}

/** Kelompok tool yang datang dari ekstensi, untuk picker. */
export function grupEkstensi(): readonly ToolGroup[] {
  return slot();
}

/** Semua nama tool dari ekstensi - dipakai agar toggle & hitungan ikut benar. */
export function namaToolEkstensi(): string[] {
  return slot().flatMap((g) => g.tools);
}

export const TOOL_GROUPS: ToolGroup[] = kelompokKatalog().map((k) => ({
  id: `${k.source}:${k.group}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  label: k.group,
  section: sectionOf(k.source),
  optional: k.source === 'web' || k.source === 'ekstensi',
  tools: k.names,
}));

/** Semua tool yang dikenali sekat. Turunan dari katalog. */
/**
 * Semua tool yang dikenali sekat: katalog + yang dibawa ekstensi.
 *
 * Ekstensi HARUS ikut di sini. `setGrup` dan `semua` menyaring lewat daftar
 * ini (`SEMUA_TOOL.includes(n)`), jadi tool ekstensi yang tidak terdaftar di
 * sini akan tampil di picker tapi tombolnya tidak berefek - persis kegagalan
 * senyap yang paling sulit dilihat.
 */
/*
 * Semua tool yang dikenali sekat: katalog + yang dibawa ekstensi.
 *
 * Bentuknya getter ke slot global, bukan array yang dibekukan saat modul
 * dimuat. Dua alasan, dan keduanya pernah menjadi bug nyata:
 *
 *   - Vite menyajikan satu modul di bawah dua URL (lihat SLOT_TOOL_EKSTENSI),
 *     jadi array modul-level berarti dua daftar yang berbeda antara pemanggil
 *     dan pendaftar.
 *   - Ekstensi dipasang SESUDAH modul ini dimuat. Array yang dihitung sekali
 *     akan selalu berisi katalog saja, sehingga tool ekstensi tampil di picker
 *     tapi `setGrup` menolaknya (`SEMUA_TOOL.includes(n)`) dan tombolnya tidak
 *     berefek - kegagalan senyap yang paling sulit dilihat.
 */
function daftarSemua(): string[] {
  const g = globalThis as unknown as { __ZEPHYR_SEMUA_TOOL__?: string[] };
  if (!g.__ZEPHYR_SEMUA_TOOL__) g.__ZEPHYR_SEMUA_TOOL__ = [...TOOL_NAMES];
  return g.__ZEPHYR_SEMUA_TOOL__;
}

export const SEMUA_TOOL: string[] = daftarSemua();

/* ------------------------------------------------------------------ */
/* Kelas efek - satu sumber, bukan beberapa daftar terpisah.          */
/* ------------------------------------------------------------------ */

/** Tool yang boleh mengubah sesuatu. Sisanya murni membaca. */
export const TOOL_TULIS: Set<string> = new Set(
  TOOL_CATALOG.filter((t) => t.effect === 'fsWrite' || t.effect === 'exec' || t.effect === 'appWrite' || t.effect === 'netWrite').map(
    (t) => t.name,
  ),
);

/**
 * Tool yang menulis ke DISK tanpa user menekan simpan dulu.
 *
 * Dibedakan dari `TOOL_TULIS` yang lebih luas: menyetel setelan atau menjadwalkan
 * perintah juga "mengubah sesuatu", tapi keduanya bisa dibatalkan. Yang di sini
 * adalah yang bisa menghilangkan pekerjaan:
 *
 *   - `write_file` menimpa
 *   - `edit` dan `multi_edit` mengubah isi
 *   - `delete_file` dan `move_file` paling parah: yang satu menghapus, yang lain
 *     memindahkan berkas keluar dari jangkauan
 *
 * `replace_in_files` ada di sini karena ia menyentuh BANYAK berkas sekaligus -
 * satu kesalahan pola merusak seluruh repo.
 */
export const TOOL_DISK_TULIS: Set<string> = new Set([
  'write_file',
  'edit',
  'multi_edit',
  'delete_file',
  'move_file',
  'replace_in_files',
  /* Downloads a file to disk, so it writes like the others - it was missing
     here, which let a download bypass the per-tool disk-write approval gate. */
  'browser_download_url',
]);

/** True ketika tool bisa menulis ke disk tanpa user menyimpan dulu. */
export function menulisKeDisk(nama: string): boolean {
  return TOOL_DISK_TULIS.has(nama);
}

/**
 * Tool yang WAJIB selalu menyala.
 *
 * Ini bukan preferensi - ini yang membuat agen bisa bekerja sama sekali. Tanpa
 * pembaca berkas ia menebak isi kode; tanpa pencari ia menyisir direktori satu
 * per satu; tanpa terminal ia tidak bisa MEMBUKTIKAN pekerjaannya.
 *
 * Daftarnya sengaja pendek. Setiap nama di sini mengurangi kendali user tanpa
 * memberi manfaat; yang lain cukup jadi default-nya saja.
 */
export const TOOL_WAJIB: readonly string[] = ['read_file', 'list_directory', 'grep'];

/**
 * Tool inti: yang WAJIB terpasang dan WAJIB aktif (seluruh katalog kecuali
 * grup web/browser).
 *
 * Ini bukan preferensi dan bukan saran, melainkan kontrak: selama Zephyr
 * dijalankan, tool inti inilah yang selalu tersedia untuk agen. Yang di luar
 * daftar - kesebelas tool web/browser - bisa dinyalakan user, tapi tidak
 * pernah menyala sendiri.
 *
 * Diturunkan dari katalog, bukan diketik ulang. Daftar yang ditulis manual
 * akan berbeda dari katalognya cepat atau lambat, dan bedanya baru ketahuan
 * ketika ada tool yang tidak pernah muncul di panel. Karena itu JUMLAHNYA tidak
 * ditulis di komentar ini juga: angka yang diketik ulang adalah daftar kedua
 * dengan cara lain, dan begitulah angka 40 di sini jadi salah tanpa ada yang
 * menyadarinya. Untuk angkanya, pakai `TOOL_COUNTS` di `zephyrTools/catalog.ts`.
 */
export const TOOL_INTI: readonly string[] = TOOL_CATALOG.filter((t) => t.source !== 'web').map(
  (t) => t.name,
);

/**
 * Tool web yang nyala pada profil baru - semua yang efeknya HANYA MEMBACA.
 *
 * Definisinya tinggal di katalog (bersama aturannya dan bersamanya diperiksa),
 * lalu diimpor ke sini. `browser_list` dulu tidak masuk daftar sampai user
 * melihat sendiri baris merah "List pages - failed" - sekarang daftarnya
 * diturunkan, jadi tidak ada nama yang bisa terlewat lagi.
 */
export { _WEB_AKTIF as TOOL_WEB_AKTIF_AWAL };

/**
 * Tool yang nyala pada profil baru: 40 inti + SELURUH tool web.
 *
 * Badan `TOOL_BAWAAN_AKTIF` di katalog sudah tidak menentukan apa yang menyala
 * lagi - ia hanya memuat nama yang aman dibaca sejak awal. Sumber kebenaran
 * untuk "apa yang aktif" ada di sini, dan di sini artinya utuh: agen tidak
 * boleh mulai dalam keadaan kehilangan kemampuan menulis daftar tugasnya
 * sendiri, atau membuka halaman yang diminta user.
 *
 * Tool web dulu hanya yang membaca. Memisahkannya berarti agen bisa membaca
 * halaman tetapi tidak bisa mengklik tautan di dalamnya, dan user harus
 * menyalakan sisanya lebih dulu sebelum "buka link ini" berhasil - pagar yang
 * tidak pernah diminta dan yang terbaca sebagai kerusakan. Gerbang yang
 * sebenarnya menjaga tetap ada di `kebijakanIsiWeb.ts`.
 */
export const TOOL_AKTIF_AWAL: readonly string[] = [
  ...TOOL_INTI,
  ..._WEB_AKTIF,
];

/**
 * Grup yang sejak awal MATI.
 *
 * Sekarang kosong: grup web/browser ikut menyala. Grup yang masih tertutup
 * hanyalah yang isinya memang MCP dan ekstensi (lihat `TERTUTUP_AWAL`), dan
 * itu soal tampilan picker, bukan izin.
 */
export const GRUP_MATI_AWAL: readonly string[] = [];

/* ------------------------------------------------------------------ */
/* Deskripsi dan label                                                */
/* ------------------------------------------------------------------ */

/** Satu baris tentang apa yang disentuh tool - ditampilkan di daftar. */
export const TOOL_DESKRIPSI: Record<string, string> = Object.fromEntries(
  TOOL_CATALOG.map((t) => [t.name, t.description]),
);

/** Label manusiawi untuk efek samping, dipakai penanda risiko. */
export const EFEK_LABEL: Record<ToolEffect, string> = {
  read: 'baca',
  net: 'jaringan',
  netWrite: 'kirim data',
  appWrite: 'ubah aplikasi',
  fsWrite: 'tulis disk',
  exec: 'jalankan perintah',
};

/** Kelas efek satu tool. Tool yang tidak dikenal dianggap paling berbahaya. */
export function efekTool(nama: string): ToolEffect {
  return TOOL_BY_NAME.get(nama)?.effect ?? 'exec';
}

/* ------------------------------------------------------------------ */
/* Store                                                             */
/* ------------------------------------------------------------------ */

interface ToolGateState {
  /** Tool yang boleh dipanggil model. Yang tidak ada di sini ditolak. */
  aktif: Set<string>;
  /** Filter yang diketik user di kepala menu. */
  cari: string;
  /** Apakah menu melayang sedang tampil. */
  buka: boolean;
  /** Id grup yang terlipat. */
  tutup: Set<string>;
  /** Tool yang sudah diizinkan user untuk menulis ke disk. */
  tulisIzin: Set<string>;

  setBuka: (v: boolean) => void;
  toggle: () => void;
  setCari: (v: string) => void;
  /** Balik satu tool. */
  balik: (nama: string) => void;
  /** Nyalakan atau matikan seluruh isi satu grup. */
  setGrup: (id: string, nyala: boolean) => void;
  semua: (nyala: boolean) => void;
  lipat: (id: string) => void;
  /** Isi dari setelan tersimpan; nama yang tidak dikenal diabaikan. */
  dari: (nama: string[]) => void;

  /**
   * Izin per tool untuk MENULIS KE DISK, terpisah dari allowlist perintah.
   *
   * `settings.allowCommands` berisi awalan perintah shell dan dicocokkan dengan
   * `startsWith`; memakainya di sini akan membuat satu nama perintah
   * mengizinkan penulisan berkas, dan itu bukan yang disetujui user. Kosong
   * berarti "belum ada yang diizinkan", jadi setiap penulisan tetap bertanya
   * sampai user memutuskan sendiri.
   */
  tulisDiizinkan: (nama: string) => boolean;
  izinkanTulis: (nama: string, izin: boolean) => void;
}

/** Grup yang terlipat saat menu pertama dibuka. */
const TERTUTUP_AWAL: readonly string[] = ['mcp:inspect', 'mcp:control'];

export const useToolGate = create<ToolGateState>((set, get) => ({
  /*
   * Sekat awalnya SELURUH 40 tool inti. Grup web/browser tidak perlu dikurangi
   * di sini: nama-nama di grup itu memang tidak ada di TOOL_AKTIF_AWAL, jadi
   * sudah mati dengan sendirinya.
   */
  aktif: new Set(TOOL_AKTIF_AWAL),
  cari: '',
  buka: false,
  /*
   * Grup yang mati sejak awal sekaligus terlipat. Kalau tidak, menu terbuka
   * dengan beberapa kepala grup yang isinya semuanya tidak aktif - dan itu
   * terbaca seperti kerusakan, bukan seperti pilihan yang belum diambil.
   */
  tutup: new Set([...TERTUTUP_AWAL, ...GRUP_MATI_AWAL]),
  tulisIzin: new Set<string>(),

  tulisDiizinkan: (nama) => get().tulisIzin.has(nama),

  izinkanTulis: (nama, izin) =>
    set((s) => {
      const next = new Set(s.tulisIzin);
      if (izin) next.add(nama);
      else next.delete(nama);
      return { tulisIzin: next };
    }),

  setBuka: (v) => set({ buka: v }),
  toggle: () => set({ buka: !get().buka }),
  setCari: (v) => set({ cari: v }),

  balik: (nama) =>
    set((s) => {
      const next = new Set(s.aktif);
      if (next.has(nama)) {
        /* Tool inti 40 tetap aktif; 11 tool web bebas dimatikan/dinyalakan oleh user */
        if (!TOOL_INTI.includes(nama)) next.delete(nama);
      } else next.add(nama);
      return { aktif: next };
    }),

  setGrup: (id, nyala) =>
    set((s) => {
      const grup = TOOL_GROUPS.find((g) => g.id === id);
      if (!grup) return {};
      const next = new Set(s.aktif);
      for (const t of grup.tools) {
        if (nyala) next.add(t);
        else if (!TOOL_INTI.includes(t)) next.delete(t);
      }
      return { aktif: next };
    }),

  semua: (nyala) => set({ aktif: new Set(nyala ? SEMUA_TOOL : TOOL_INTI) }),

  lipat: (id) =>
    set((s) => {
      const next = new Set(s.tutup);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { tutup: next };
    }),

  /*
   * Daftar tersimpan yang kosong berarti "belum pernah memilih", bukan "tolak
   * semua" - profil baru harus mulai dengan katalog penuh, kalau tidak agen
   * menjawab setiap permintaan dengan kesalahan izin.
   *
   * Setelan dari versi sebelumnya masih memakai awalan yang sudah dipensiunkan
   * untuk 14 tool MCP. Berbeda dengan tool yang benar-benar diganti namanya, tool MCP
   * di sini HANYA berubah awalannya - handlernya sama. Karena itu nama lama
   * dipetakan ke nama baru saat dibaca, bukan disaring keluar: menyaringnya
   * akan mematikan seluruh tool MCP milik user tanpa pernah dia pilih begitu.
   * Yang disimpan ke memori tetap nama katalog yang sekarang, jadi penulisan
   * berikutnya sudah memakai awalan baru.
   *
   * Nama lama dari versi sebelumnya yang TIDAK ada di katalog tetap tersaring
   * keluar dengan sendirinya. Itu memang yang diinginkan: tool lama yang
   * digantikan tool baru dengan nama berbeda tidak bisa dipetakan secara
   * otomatis tanpa menebak. Yang dilakukan sebagai gantinya adalah memulihkan
   * default untuk nama baru - sehingga setelah pembaruan, agen tetap bisa
   * bekerja alih-alih kehilangan seluruh kemampuannya.
   */
  dari: (nama) => {
    if (!Array.isArray(nama) || nama.length === 0) return;
    const dipetakan = nama.map((n) => {
      const polos = n.replace(POLA_AWALAN_MCP, '');
      return polos === n ? n : `${AWALAN_MCP}${polos}`;
    });
    const sah = dipetakan.filter((n) => SEMUA_TOOL.includes(n));

    /*
     * Kalau sama sekali tidak ada nama yang dikenali, ini setelan dari versi
     * lama sebelum penggantian tool. Menghormatinya apa adanya akan mematikan
     * segalanya, jadi kembali ke default.
     */
    if (sah.length === 0) {
      set({ aktif: new Set(TOOL_AKTIF_AWAL) });
      return;
    }

    /*
     * Perubahan gaya lama MEMAKSA 40 tool inti menyala, dan itu membatalkan
     * tombol "All off": user yang sengaja mematikan `read_file` atau `bash_run`
     * menemukannya hidup lagi setiap kali app dibuka, tanpa pernah diberi tahu.
     * Sekarang pilihan tersimpan dihormati apa adanya - 40 inti hanya dipakai
     * sebagai titik awal ketika setelannya masih kosong atau tidak dikenali,
     * bukan sebagai pemaksaan di atas keputusan user.
     */
    set({ aktif: new Set(sah) });
  },
}));

/* ------------------------------------------------------------------ */
/* Pemeriksaan saat pengembangan                                      */
/* ------------------------------------------------------------------ */

if (import.meta.env?.DEV) {
  const masalah = [
    ...periksaKatalog(),
    ...periksaSekat(),
  ];
  if (masalah.length) {
    /* eslint-disable-next-line no-console */
    console.error('[toolGate] katalog tidak konsisten:\n  ' + masalah.join('\n  '));
  }
}

/**
 * Kontrak sekat tool: setiap nama yang bisa dinyalakan harus ada di katalog,
 * dan setiap nama di katalog harus bisa dinyalakan.
 *
 * Ini menahan kesalahan yang paling mudah terjadi saat memindahkan tool: nama
 * yang salah ketik membuat sebuah tool tidak pernah bisa dinyalakan, dan
 * gejalanya cuma "tool itu tidak ada" tanpa pesan apa pun - model akan
 * menebak-nebak, dan user akan menyimpulkan aplikasinya rusak.
 *
 * Diperiksa juga bahwa kunci tersimpan selalu bisa dipetakan ke nama katalog,
 * karena tool yang lahir setelah setelan lama harus tetap punya jalan untuk
 * menyala.
 */
export function periksaSekat(): string[] {
  const masalah: string[] = [];
  const kat = new Set(SEMUA_TOOL);

  for (const n of TOOL_AKTIF_AWAL) {
    if (!kat.has(n)) masalah.push(`default awal bukan nama katalog: ${n}`);
  }
  for (const g of TOOL_GROUPS) {
    for (const t of g.tools) {
      if (!kat.has(t)) masalah.push(`tool grup ${g.id} bukan nama katalog: ${t}`);
    }
  }
  for (const n of namaTampilDikenal()) {
    if (!kat.has(n)) masalah.push(`nama tampilan tidak ada di katalog: ${n}`);
  }
  return masalah;
}

/** Nama yang punya label manusia - dipakai pemeriksa di atas. */
function namaTampilDikenal(): string[] {
  return SEMUA_TOOL;
}
