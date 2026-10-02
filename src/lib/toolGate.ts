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
 * Sekarang sumbernya SATU: `tediTools/catalog.ts`. Berkas ini hanya membaca
 * dari situ. Menambah tool tanpa menyebut kelasnya akan gagal di verifikasi
 * katalog, bukan diam-diam berjalan tanpa izin.
 *
 * ## Nama yang dilihat model
 *
 * Model melihat 51 nama: 26 bawaan, 14 dengan awalan `mcp__tedi__`, dan 11
 * web/browser milik Zephyr. Nama internal polos tool MCP (`read`, `state`)
 * TIDAK pernah sampai ke model - kalau sampai, `read` akan bertabrakan dengan
 * `read_file` dan model akan menebak.
 */

import { create } from 'zustand';
import {
  TOOL_CATALOG,
  TOOL_NAMES,
  TOOL_BY_NAME,
  kelompokKatalog,
  periksaKatalog,
  type ToolEffect,
  type ToolSource,
} from './tediTools/catalog';

/* ------------------------------------------------------------------ */
/* Sumber nama - semuanya diturunkan dari katalog.                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Bagian dan kelompok - dibaca dari katalog, bukan diketik ulang.    */
/* ------------------------------------------------------------------ */

/* Dua tingkat, seperti TEDI: bagian dulu, lalu kelompok di dalamnya. */
export type ToolSection = 'builtin' | 'mcp';

/** Dua bagian yang ditampilkan oleh picker, dalam urutan visualnya. */
export const SECTION_URUTAN: { id: ToolSection; label: string }[] = [
  { id: 'builtin', label: 'BUILT-IN' },
  { id: 'mcp', label: 'MCP' },
];

/** Web/browser adalah kelompok bawaan di picker, walau tetap opsional. */
export function sectionOf(source: ToolSource): ToolSection {
  return source === 'mcp' ? 'mcp' : 'builtin';
}

export interface ToolGroup {
  id: string;
  label: string;
  section: ToolSection;
  /** Hanya kelompok web/browser yang dapat dimatikan. */
  optional: boolean;
  /** Nama tool yang dilihat model - kunci yang sama dengan `aktif`. */
  tools: string[];
}

/**
 * Kelompok, diturunkan dari katalog.
 *
 * `id` sengaja dibuat dari bagian + nama kelompok, bukan dari indeks: store
 * mencari grup dengan `find(g => g.id === id)`, jadi id yang terulang membuat
 * setiap grup setelahnya tidak bisa di-toggle.
 */
export const TOOL_GROUPS: ToolGroup[] = kelompokKatalog().map((k) => ({
  id: `${k.source}:${k.group}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  label: k.group,
  section: sectionOf(k.source),
  optional: k.source === 'web',
  tools: k.names,
}));

/** Semua tool yang dikenali sekat. Turunan dari katalog. */
export const SEMUA_TOOL: string[] = [...TOOL_NAMES];

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
 * 40 tool inti: yang WAJIB terpasang dan WAJIB aktif.
 *
 * Ini bukan preferensi dan bukan saran, melainkan kontrak: selama Zephyr
 * dijalankan, 40 tool inilah yang selalu tersedia untuk agen. Yang di luar
 * daftar - kesebelas tool web/browser - bisa dinyalakan user, tapi tidak
 * pernah menyala sendiri.
 *
 * Diturunkan dari katalog, bukan diketik ulang. Daftar yang ditulis manual
 * akan berbeda dari katalognya cepat atau lambat, dan bedanya baru ketahuan
 * ketika ada tool yang tidak pernah muncul di panel.
 */
export const TOOL_INTI: readonly string[] = TOOL_CATALOG.filter((t) => t.source !== 'web').map(
  (t) => t.name,
);

/**
 * Tool yang nyala pada profil baru: SELURUH 40 tool inti.
 *
 * Badan `TOOL_BAWAAN_AKTIF` di katalog sudah tidak menentukan apa yang menyala
 * lagi - ia hanya memuat nama yang aman dibaca sejak awal. Sumber kebenaran
 * untuk "apa yang aktif" ada di sini, dan di sini artinya utuh: agen tidak
 * boleh mulai dalam keadaan kehilangan kemampuan menulis daftar tugasnya
 * sendiri.
 */
export const TOOL_AKTIF_AWAL: readonly string[] = TOOL_INTI;

/**
 * Grup yang sejak awal MATI: hanya web/browser.
 *
 * Kesebelas tool ini bisa membuka halaman apa pun, mengirim data ke luar, dan
 * menulis berkas dari internet. Semuanya kemampuan yang pantas DIPILIH user,
 * bukan diwariskan. Satu klik menghidupkannya per grup atau satu per satu.
 *
 * Mencari berdasarkan `section` dan bukan dengan menuliskan sebelas namanya:
 * menambah tool web baru lewat katalog akan otomatis ikut mati, tanpa ada
 * daftar kedua yang harus diperbarui.
 */
export const GRUP_MATI_AWAL: readonly string[] = TOOL_GROUPS.filter((g) => g.optional).map((g) => g.id);

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
   * Nama lama dari versi sebelumnya tidak lagi ada di katalog, jadi ia
   * tersaring keluar dengan sendirinya. Itu memang yang diinginkan: tool lama
   * yang digantikan tool baru dengan nama berbeda tidak bisa dipetakan secara
   * otomatis tanpa menebak. Yang dilakukan sebagai gantinya adalah memulihkan
   * default untuk nama baru - sehingga setelah pembaruan, agen tetap bisa
   * bekerja alih-alih kehilangan seluruh kemampuannya.
   */
  dari: (nama) => {
    if (!Array.isArray(nama) || nama.length === 0) return;
    const sah = nama.filter((n) => SEMUA_TOOL.includes(n));

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
     * Empat puluh tool inti dipastikan ikut, apa pun isi setelan tersimpan.
     *
     * Ini yang menepati janjinya: setelan lama - dari sebelum penggantian tool
     * - pasti tidak memuat nama-nama baru, dan menghormatinya apa adanya akan
     * mematikan sebagian besar kemampuan agen. Nama web/browser TIDAK
     * ditambahkan di sini, karena itu memang bukan bagian dari 40 dan
     * keputusannya milik user.
     */
    const intiHilang = TOOL_AKTIF_AWAL.filter((n) => !sah.includes(n));
    set({ aktif: new Set([...sah, ...intiHilang]) });
  },
}));

/* ------------------------------------------------------------------ */
/* Pemeriksaan saat pengembangan                                      */
/* ------------------------------------------------------------------ */

if (import.meta.env?.DEV) {
  const masalah = [
    ...periksaKatalog(),
  ];
  if (masalah.length) {
    /* eslint-disable-next-line no-console */
    console.error('[toolGate] katalog tidak konsisten:\n  ' + masalah.join('\n  '));
  }
}
