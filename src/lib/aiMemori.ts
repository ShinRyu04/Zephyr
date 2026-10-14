/*
 * aiMemori.ts
 *
 * MEMORI PERSISTEN LINTAS SESI untuk Zeph AI (item backlog `ai-ingat-sesi`).
 *
 * MASALAHNYA. Setiap sesi Zeph AI mulai dari nol. Keputusan yang sudah
 * disepakati, preferensi user dan hasil kerja yang sudah selesai tidak terbaca
 * lagi di sesi berikutnya, jadi AI menanyakan hal yang sama dua kali dan
 * mengulang pekerjaan yang sama. Yang ada sekarang belum cukup:
 *
 *   - `todo_write` hilang begitu percakapan dipadatkan;
 *   - `.zephyr-context.md` harus dirawat MANUAL oleh model (lihat
 *     `konteksMemoriProyek()` di systemPrompt.ts), jadi isinya bergantung pada
 *     model ingat atau tidak;
 *   - `memory.md` (lihat src-tauri/src/memory.rs) memang lintas sesi, tapi teks
 *     bebas: tidak ada aturan KAPAN menulis, tidak ada lapis per-proyek, dan
 *     tidak ada pemilihan entri yang muat di prompt.
 *
 * YANG DIBANGUN DI SINI. Satu dokumen memori ber-versi, dua lapis, dengan
 * keputusan "kapan menulis" tinggal di KODE - bukan diserahkan ke model:
 *
 *   - Lapis GLOBAL: berlaku di semua proyek (preferensi user, keputusan lintas
 *     repo). Selalu ikut saat blok memori dirakit.
 *   - Lapis PROYEK: hanya untuk SATU root workspace, dikuncikan dari path root
 *     (`kunciProyek`). Pindah folder = pindah memori, dan TANPA folder terbuka
 *     modul ini tetap jalan dengan lapis global saja.
 *
 * DI MANA DISIMPAN, DAN KENAPA DI SANA.
 *
 * Memori TIDAK boleh ditulis ke dalam folder proyek user, jadi lokasinya harus
 * direktori data aplikasi (`%APPDATA%\zephyr\`). Di repo ini pembacaan sisi Node
 * dari direktori itu memang DITOLAK oleh penjaga path: lihat komentar di
 * `src/lib/commands.ts` pada `secretsSnapshot()` - "%APPDATA%\zephyr\ is outside
 * the workspace, so the path guard correctly refuses a Node-side read", dan
 * `fsRead`/`fsWrite` menolak SEMUA path saat tidak ada workspace terbuka.
 *
 * Perintah yang SUDAH ADA dan memang boleh menulis ke direktori data adalah
 * pasangan `memory_read`/`memory_write` (Rust: src-tauri/src/memory.rs, bagian
 * `memory` -> `<data_dir>/memory.md`). Dipakai di sini sebagai rumah dokumen:
 *
 *   - datanya di direktori data app, bukan di folder proyek;
 *   - TULISNYA ATOMIK: Rust memakai `tulis_aman::tulis_atomik_teks` (berkas
 *     sementara di direktori yang sama -> `sync_all` -> `rename`), jadi pembaca
 *     selalu melihat berkas lama yang utuh atau berkas baru yang utuh;
 *   - jalan TANPA workspace terbuka - justru itu syaratnya;
 *   - `agent_context` (src-tauri/src/skills.rs) sudah menyuntikkan isi
 *     `memory.md` ke prompt tiap giliran, jadi memori ini terbaca model bahkan
 *     sebelum baris penyambung di `blokMemori()` dipasang.
 *
 * CATATAN PENTING soal batas 2200 karakter `memory.md`: bagian itu dipakai
 * bersama catatan user sendiri (tool `notes_write`), jadi modul ini memakai
 * ANGGARAN SENDIRI yang lebih kecil (`ANGGARAN_BAWAAN`) dan memangkas entri
 * sendiri kalau lebih panjang - tidak pernah menghabiskan kuota user.
 *
 * BENTUK BERKAS. SATU entri di `memory.md` (entri = blok tanpa baris kosong,
 * dipisah "\n\n" oleh Rust), isinya:
 *
 *   <!-- zephyr-ai-memori v1 {"versi":1,"diperbarui":"...","dipangkas":0} -->
 *   - [2026-10-13] global/keputusan #a1b2c3 — <teks keputusan>
 *   - [2026-10-13] proyek:zephyr-7f3a91/kerja #d4e5f6 — <teks hasil kerja>
 *
 * Baris penanda + metadata JSON-nya dipakai sebagai penanda kepemilikan:
 * `memory_write` action `replace` dengan `oldText` penanda mengganti SELURUH
 * entri itu (tulis ulang penuh, tetap satu operasi atomik di Rust), sedangkan
 * berkas tanpa penanda sama sekali TIDAK disentuh (ditambahkan sebagai entri
 * baru), sehingga catatan user tidak pernah tertimpa.
 *
 * BENTUK MODUL, meniru `src/lib/aiZephyrState.ts`:
 *
 *   1. INTI MURNI (bagian 2-7): nol impor statis, nol DOM, nol jaringan, nol
 *      jam dinding. Waktu masuk lewat `opsi.sekarang`, I/O lewat `PortMemori`.
 *      Semua aturan (kunci proyek, dedupe, urutan, pemangkasan, cap blok,
 *      kriteria "layak diingat") bisa diuji di Node tanpa Tauri dan hasilnya
 *      deterministik.
 *   2. ADAPTER TIPIS (bagian 8-9): `portMemoriMd()` + API async `muatSemua`,
 *      `tambah`, `cari`, `hapus`, `blokMemori`. Semua `import()` di situ
 *      DINAMIS, jadi modul ini tetap bisa diimpor di Node murni.
 *
 * Dipakai harness `scripts/uji-memori-sesi.mjs` (node biasa, tanpa app).
 */

/* ───────────────────────────── 1. Tipe ───────────────────────────────── */

/** Lapis memori: `global` = semua proyek, `proyek` = satu root workspace. */
export type LapisMemori = 'global' | 'proyek';

/** Jenis entri. Ini sumbu "kenapa ini disimpan", bukan kategori topik. */
export type JenisMemori = 'keputusan' | 'preferensi' | 'kerja' | 'lain';

/** Satu entri memori yang sudah tersimpan. */
export interface EntriMemori {
  /** Sidik jari stabil dari (lapis, proyek, teks) - lihat `idEntri()`. */
  id: string;
  /** Penanda tanggal `YYYY-MM-DD` (waktu lokal saat entri ditulis). */
  tanggal: string;
  /** Waktu lengkap ISO 8601 saat entri ditulis; dasar urutan "terbaru". */
  waktu: string;
  lapis: LapisMemori;
  /** Kunci proyek (`kunciProyek(root)`), `null` untuk entri global. */
  proyek: string | null;
  jenis: JenisMemori;
  teks: string;
}

/** Entri yang dikirim pemanggil ke `tambah()`. */
export interface EntriBaru {
  teks: string;
  /** Bila diisi, heuristik `layakDiingat()` tidak dipakai. */
  jenis?: JenisMemori;
  /** `global` untuk lintas proyek; `proyek` (bawaan) untuk root aktif. */
  lapis?: LapisMemori;
  /** Kunci proyek eksplisit; bawaan dari `opsi.root`. */
  proyek?: string | null;
  /** Waktu tulis ISO; bawaan `opsi.sekarang` atau jam berjalan. */
  waktu?: string;
}

/** Isi berkas memori setelah diurai. */
export interface DokumenMemori {
  versi: number;
  diperbarui: string | null;
  /** Berapa entri yang dibuang karena anggaran karakter (catatan kejujuran). */
  dipangkas: number;
  entri: EntriMemori[];
}

/** Hasil `uraiStore()`: dokumen + catatan masalah yang ditemukan (bukan lempar). */
export interface HasilUrai {
  dok: DokumenMemori;
  catatan: string[];
}

/** Satu-satunya I/O yang dibutuhkan inti: baca/tulis teks dokumen. */
export interface PortMemori {
  /** Teks dokumen, atau `null` kalau belum pernah ditulis. */
  baca(): Promise<string | null>;
  /** Tulis ulang seluruh teks dokumen (atomik, terserah pelaksananya). */
  tulis(teks: string): Promise<void>;
}

/**
 * I/O berkas mentah untuk port berbasis berkas. Dipisah dari `PortMemori`
 * supaya inti tidak pernah menyentuh `node:fs` atau `@tauri-apps/api`; harness
 * menyuntikkan implementasi Node, aplikasi menyuntikkan perintah Tauri.
 */
export interface IoBerkas {
  ada(jalur: string): Promise<boolean>;
  baca(jalur: string): Promise<string | null>;
  tulis(jalur: string, teks: string): Promise<void>;
  gantiNama(dari: string, ke: string): Promise<void>;
}

/** Opsi bersama semua API. Semua opsional - tanpa apa pun, adapter app dipakai. */
export interface OpsiMemori {
  /** Port I/O. Bila tidak diisi, `portMemoriMd()` (Tauri) dipakai. */
  port?: PortMemori;
  /** I/O berkas + jalur: cara harness Node memakai modul ini tanpa Tauri. */
  io?: IoBerkas;
  jalur?: string;
  /** Root workspace. `null` = tanpa folder terbuka (hanya lapis global). */
  root?: string | null;
  /** Waktu "sekarang" ISO - disuntikkan supaya hasilnya deterministik. */
  sekarang?: string;
  /** Anggaran karakter dokumen di store (bawaan `ANGGARAN_BAWAAN`). */
  anggaran?: number;
  /** Paksa simpan walau `layakDiingat()` menolak. */
  paksa?: boolean;
}

/* ──────────────────────────── 2. Konstanta ───────────────────────────── */

/** Versi format berkas. Naikkan kalau bentuk barisnya berubah. */
export const VERSI_MEMORI = 1;

/** Penanda kepemilikan dokumen di dalam store. */
export const MARKER_MEMORI = '<!-- zephyr-ai-memori v1';

/**
 * Anggaran karakter untuk dokumen kita sendiri di `memory.md`.
 *
 * `MEMORY_LIMIT` Rust = 2200 karakter untuk SELURUH bagian `memory` (dipakai
 * bersama catatan user). Modul ini mengambil porsi 1400 supaya menulis memori
 * tidak pernah membuat `notes_write` milik user gagal karena "memory is full".
 */
export const ANGGARAN_BAWAAN = 1400;

/** Batas bawaan blok prompt, dalam token perkiraan (1 token ~ 4 karakter). */
export const BATAS_TOKEN_BAWAAN = 1000;

/** Panjang maksimum satu teks entri; lebih dari ini dipotong (bukan ditolak). */
export const MAKS_TEKS = 240;

/** Batas jumlah entri di dokumen; penjaga berkas yang membengkak tak wajar. */
export const MAKS_ENTRI = 400;

/** Judul blok saat disuntikkan ke prompt. */
export const JUDUL_BLOK = '# Memori lintas sesi (Zeph AI)';

const AKHIR_PENANDA = '-->';
const PEMISAH_BARIS = '\n';
const PEMISAH_LAPIS = ' — ';

const RE_ENTRI =
  /^- \[(\d{4}-\d{2}-\d{2})\] (global|proyek:([A-Za-z0-9._-]+))\/(keputusan|preferensi|kerja|lain) #([0-9a-f]{6}(?:-\d+)?) — (.*)$/;

/* ──────────────────────── 3. Utilitas murni ──────────────────────────── */

/** FNV-1a 32-bit, heksadesimal. Cukup untuk sidik jari pendek, bukan kripto. */
function hash32(teks: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Bentuk kanonik teks entri: spasi putih dirapikan jadi satu spasi, dipotong
 * `MAKS_TEKS`. Dipakai untuk sidik jari DAN untuk dedupe, jadi dua teks yang
 * bedanya cuma spasi dianggap entri yang sama - dan itu memang yang diinginkan.
 */
export function normalisasiTeks(teks: string): string {
  const bersih = String(teks ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (bersih.length <= MAKS_TEKS) return bersih;
  return `${bersih.slice(0, MAKS_TEKS - 1).trimEnd()}…`;
}

/**
 * Kunci proyek dari root workspace: `<slug>-<6 hex>`.
 *
 * Kenapa slug + hash, bukan path penuh: kuncinya ikut masuk ke BARIS di dalam
 * berkas memori, dan path Windows penuh (`D:\Kerja\Zephyr`) membuat berkasnya
 * tidak terbaca manusia. Slug memberi bagian yang bisa dibaca mata, hash
 * memberi bagian yang tidak bisa tertukar antara dua folder bernama sama.
 * Normalisasi huruf besar/kecil dan garis miring, jadi `D:\Zephyr` dan
 * `d:/zephyr/` menghasilkan kunci yang sama.
 *
 * @returns kunci, atau `null` kalau tidak ada root (tanpa folder terbuka).
 */
export function kunciProyek(root: string | null | undefined): string | null {
  if (root == null) return null;
  const bersih = String(root).trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!bersih) return null;
  const bagian = bersih.split('/').filter(Boolean);
  const ekor = (bagian[bagian.length - 1] ?? '').toLowerCase();
  const slug =
    ekor
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 14) || 'akar';
  return `${slug}-${hash32(bersih.toLowerCase()).slice(0, 6)}`;
}

/**
 * Sidik jari entri: stabil terhadap (lapis, proyek, teks).
 *
 * Dua manfaat sekaligus. (1) DEDUPE tanpa perlu membandingkan semua entri:
 * teks yang sama di lapis yang sama menghasilkan id yang sama, jadi "entri
 * terbaru menang" cukup ditulis sekali. (2) `hapus(id)` tetap bekerja walau
 * entri ditulis ulang berkali-kali.
 */
export function idEntri(lapis: LapisMemori, proyek: string | null, teks: string): string {
  return hash32(`${lapis}|${proyek ?? ''}|${normalisasiTeks(teks)}`).slice(0, 6);
}

/** Urutan prioritas "kenapa disimpan" saat memilih entri yang layak masuk blok. */
function prioritasJenis(j: JenisMemori): number {
  switch (j) {
    case 'preferensi':
      return 3;
    case 'keputusan':
      return 2;
    case 'kerja':
      return 1;
    default:
      return 0;
  }
}

/**
 * Urutan PEMANGKASAN (kebalikannya): yang dibuang dulu kalau ruang habis.
 * Hasil kerja paling cepat basi, preferensi paling lama berguna.
 */
function prioritasPangkas(j: JenisMemori): number {
  return 3 - prioritasJenis(j);
}

/** Tanggal lokal `YYYY-MM-DD` dari waktu ISO. Penanda tanggal di tiap baris. */
export function tanggalDari(waktuIso: string): string {
  const d = new Date(waktuIso);
  if (Number.isNaN(d.getTime())) return String(waktuIso ?? '').slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Waktu "sekarang": disuntikkan lewat opsi, atau jam berjalan milik pemanggil. */
function waktuSekarang(opsi?: OpsiMemori): string {
  const s = opsi?.sekarang;
  if (s) return s;
  return new Date().toISOString();
}

/* ─────────────────── 4. Aturan TULIS (kapan diingat) ─────────────────── */

/**
 * "Kapan Zeph AI menulis memori" - ditulis di sini sebagai aturan yang bisa
 * dieksekusi (`layakDiingat`), bukan diserahkan ke model.
 *
 * Alasannya praktis: kalau model yang memutuskan, sebagian besar giliran tidak
 * menulis apa-apa (memori kosong) dan sesekali menulis hal yang bisa dibaca
 * ulang dari repo (memori penuh berisi sampah). Keduanya sama-sama merugikan,
 * jadi keputusannya diambil kode dan hasilnya bisa diuji.
 */
export interface AturanTulis {
  kode: JenisMemori;
  kapan: string;
  contoh: string[];
  jangan: string;
}

export const ATURAN_TULIS: AturanTulis[] = [
  {
    kode: 'keputusan',
    kapan:
      'Pilihan teknis yang SUDAH disepakati dan akan mengikat pekerjaan berikutnya: pendekatan yang dipilih, batas kepemilikan berkas, alasan sebuah jalur ditolak.',
    contoh: [
      'Kita putuskan pakai patch, bukan sed.',
      'State AI disatukan di aiStore; bridge tidak boleh impor builtins.',
    ],
    jangan: 'Mencatat opsi yang masih dibahas - itu belum keputusan.',
  },
  {
    kode: 'preferensi',
    kapan:
      'Cara kerja yang user minta berlaku TERUS, bukan sekali: bahasa jawaban, gaya, alat yang dilarang/diwajibkan, alur kerja yang diulang.',
    contoh: ['Jawab dalam bahasa Indonesia.', 'Selalu jalankan npx tsc --noEmit sebelum lapor selesai.'],
    jangan: 'Menyimpulkan preferensi dari satu permintaan yang jelas sekali pakai.',
  },
  {
    kode: 'kerja',
    kapan:
      'Hasil kerja yang tidak bisa disimpulkan lagi dari repo: berkas yang dibuat, hasil uji, keputusan di tengah jalan. Satu baris: apa yang jadi dan di mana.',
    contoh: ['scripts/uji-memori-sesi.mjs: harness memori lulus 12/12, exit 0.'],
    jangan: 'Menyalin isi berkas atau keluaran panjang - itu bisa dibaca ulang.',
  },
  {
    kode: 'lain',
    kapan:
      'Fakta tahan-lama tentang proyek yang tidak terbaca dari kode: konvensi tim, alasan historis, jebakan lingkungan.',
    contoh: ['Di mesin ini python3 tidak ada; pakai python.'],
    jangan: 'Menyimpan status sementara, rencana, atau TODO - itu tugas todo_write.',
  },
];

/** Teks ringkas aturan yang layak disuntik ke prompt (dipakai bila perlu). */
export const ATURAN_TULIS_PROMPT: string = [
  '# Kapan kamu menulis memori lintas sesi',
  'Tulis memori hanya untuk empat hal, satu baris masing-masing:',
  ...ATURAN_TULIS.map((a) => `- ${a.kode}: ${a.kapan}`),
  'JANGAN tulis: isi berkas atau keluaran panjang yang bisa dibaca ulang dari repo, status sementara atau TODO (itu todo_write), percakapan atau pertanyaan, dan rahasia apa pun (kunci, token, kata sandi, connection string).',
].join('\n');

/**
 * Penilaian deterministik "apakah kalimat ini layak diingat".
 *
 * Dipakai `tambah()`: teks yang tidak lolos ditolak dengan alasan yang terbaca,
 * kecuali pemanggil menyebut `jenis` eksplisit atau memakai `{ paksa: true }`.
 * Regex-nya sengaja sederhana dan konservatif - lebih baik menolak sesekali
 * daripada mengisi memori dengan obrolan.
 */
export function layakDiingat(teks: string): { layak: boolean; jenis: JenisMemori; alasan: string } {
  const t = normalisasiTeks(teks);
  const kcl = t.toLowerCase();
  if (t.length < 25) {
    return { layak: false, jenis: 'lain', alasan: 'terlalu pendek untuk berarti di sesi lain' };
  }
  if (/\?$/.test(t)) {
    return { layak: false, jenis: 'lain', alasan: 'berbentuk pertanyaan, bukan fakta' };
  }
  if (/\b(kunci rahasia|api key|apikey|token|kata sandi|password|secret)\b/i.test(t)) {
    return { layak: false, jenis: 'lain', alasan: 'mengandung calon rahasia - jangan pernah ditulis ke memori' };
  }
  if (/\b(kita|kami|saya)\b[^.]{0,30}\b(putuskan|putus|pilih|pakai|gunakan|sepakat|setuju|tetap(?:kan|i))\b/.test(kcl)) {
    return { layak: true, jenis: 'keputusan', alasan: 'berisi pilihan yang disepakati' };
  }
  if (/\b(disepakati|diputuskan|dipilih|keputusan(?:nya)?)\b/.test(kcl)) {
    return { layak: true, jenis: 'keputusan', alasan: 'menyebut keputusan' };
  }
  if (/\b(mulai sekarang|ke depan|setiap kali|selalu|jangan pernah|jangan pakai|preferensi|gaya jawaban)\b/.test(kcl)) {
    return { layak: true, jenis: 'preferensi', alasan: 'berisi permintaan yang berlaku terus' };
  }
  const adaJejakKerja = /(\/|\\|\.ts\b|\.tsx\b|\.mjs\b|\.rs\b|\(\s*\))/.test(t);
  if (/\b(selesai|lulus|berhasil|sudah (?:dibuat|ditulis|diperbaiki|dipasang|dijalankan)|dibuat|menambah|implementasi)\b/.test(kcl) && adaJejakKerja) {
    return { layak: true, jenis: 'kerja', alasan: 'hasil kerja yang tidak terbaca lagi dari repo' };
  }
  return { layak: false, jenis: 'lain', alasan: 'bukan keputusan, preferensi, atau hasil kerja' };
}

/* ─────────────────── 5. Urai / rangkai / operasi dokumen ─────────────── */

function dokumenKosong(): DokumenMemori {
  return { versi: VERSI_MEMORI, diperbarui: null, dipangkas: 0, entri: [] };
}

function barisEntri(e: EntriMemori): string {
  const lapis = e.lapis === 'global' ? 'global' : `proyek:${e.proyek ?? 'tanpa-kunci'}`;
  return `- [${e.tanggal}] ${lapis}/${e.jenis} #${e.id}${PEMISAH_LAPIS}${e.teks}`;
}

/**
 * Rangkai dokumen jadi teks store. TIDAK ada baris kosong di dalamnya dengan
 * sengaja: Rust memecah `memory.md` atas "\n\n", jadi satu entri = satu blok
 * utuh yang bisa diganti satu operasi `replace`.
 */
export function rangkaikanStore(dok: DokumenMemori): string {
  const meta = JSON.stringify({
    versi: dok.versi,
    diperbarui: dok.diperbarui,
    dipangkas: dok.dipangkas,
  });
  const kepala = `${MARKER_MEMORI} ${meta} ${AKHIR_PENANDA}`;
  if (dok.entri.length === 0) return kepala;
  return [kepala, ...dok.entri.map(barisEntri)].join(PEMISAH_BARIS);
}

/**
 * Urai teks store jadi dokumen. TIDAK PERNAH melempar.
 *
 * Tahan berkas korup: baris yang tidak dikenali dilewati dan DICATAT, metadata
 * JSON yang rusak direset ke bawaan sambil entri yang masih terbaca
 * dipertahankan, dan berkas tanpa penanda sama sekali dianggap bukan milik
 * modul ini (dokumen kosong + catatan) - jadi catatan user tidak pernah
 * tertelan, apalagi sampai aplikasi mati karena berkas memori yang rusak.
 */
export function uraiStore(teks: string | null | undefined): HasilUrai {
  const catatan: string[] = [];
  const dok = dokumenKosong();
  const mentah = typeof teks === 'string' ? teks : '';
  if (!mentah.trim()) return { dok, catatan };

  const baris = mentah.split(/\r?\n/).map((b) => b.trim()).filter(Boolean);
  const adaPenanda = baris.some((b) => b.startsWith(MARKER_MEMORI));
  if (!adaPenanda) {
    catatan.push('berkas tanpa penanda zephyr-ai-memori: dokumen dimulai dari kosong (isi lama tidak disentuh)');
    return { dok, catatan };
  }

  const perId = new Map<string, EntriMemori>();
  for (const b of baris) {
    if (b.startsWith(MARKER_MEMORI)) {
      const isi = b.slice(MARKER_MEMORI.length).replace(/-->\s*$/, '').trim();
      try {
        const m = JSON.parse(isi) as { versi?: unknown; diperbarui?: unknown; dipangkas?: unknown };
        if (typeof m.versi === 'number' && Number.isFinite(m.versi)) dok.versi = m.versi;
        if (typeof m.diperbarui === 'string') dok.diperbarui = m.diperbarui;
        if (typeof m.dipangkas === 'number' && Number.isFinite(m.dipangkas)) dok.dipangkas = m.dipangkas;
      } catch {
        catatan.push('metadata JSON di baris penanda rusak: direset ke bawaan, entri yang masih terbaca dipertahankan');
      }
      continue;
    }
    const c = RE_ENTRI.exec(b);
    if (!c) {
      catatan.push(`baris tidak dikenali, dilewati: ${b.slice(0, 60)}`);
      continue;
    }
    const [, tanggal, lapisMentah, proyek, jenis, id, teksEntri] = c;
    const entri: EntriMemori = {
      id,
      tanggal,
      waktu: `${tanggal}T00:00:00.000Z`,
      lapis: lapisMentah === 'global' ? 'global' : 'proyek',
      proyek: lapisMentah === 'global' ? null : (proyek ?? null),
      jenis: jenis as JenisMemori,
      teks: teksEntri.trim(),
    };
    /* "Entri terbaru menang": kalau id yang sama muncul dua kali, yang dibaca
       BELAKANGAN menggantikan yang di depan. Tanpa ini, duplikat hasil tulis
       yang gagal separuh akan menumpuk selamanya. */
    perId.set(id, entri);
  }
  dok.entri = [...perId.values()].slice(0, MAKS_ENTRI);
  return { dok, catatan };
}

/**
 * Pangkas dokumen sampai teksnya muat di `anggaran` karakter.
 *
 * Yang dibuang lebih dulu adalah yang paling cepat basi: hasil kerja, lalu
 * fakta lain, lalu keputusan, dan preferensi terakhir - itu yang paling lama
 * berguna. `dok.dipangkas` bertambah, jadi berkasnya jujur soal apa yang
 * hilang alih-alih diam-diam kehilangan data.
 */
export function pangkas(dok: DokumenMemori, anggaran: number): DokumenMemori {
  const hasil: DokumenMemori = { ...dok, entri: [...dok.entri] };
  const urut = [...hasil.entri].sort((a, b) => {
    const p = prioritasPangkas(a.jenis) - prioritasPangkas(b.jenis);
    if (p !== 0) return p;
    return a.waktu.localeCompare(b.waktu);
  });
  let i = 0;
  while (rangkaikanStore(hasil).length > anggaran && i < urut.length) {
    const buang = urut[i++];
    hasil.entri = hasil.entri.filter((e) => e.id !== buang.id);
    hasil.dipangkas += 1;
  }
  return hasil;
}

/** Entri yang terlihat dari root yang sedang aktif (global selalu terlihat). */
export function terlihat(dok: DokumenMemori, root: string | null | undefined): EntriMemori[] {
  const kunci = kunciProyek(root);
  return dok.entri.filter((e) => e.lapis === 'global' || (kunci !== null && e.proyek === kunci));
}

/**
 * Tambah entri ke dokumen (murni, tanpa I/O).
 *
 * Aturannya: teks dinormalisasi, `jenis`/`lapis`/`proyek` ditentukan, id dihitung,
 * lalu entri dengan id yang sama DIBUANG dulu - jadi menambah hal yang sama dua
 * kali tidak pernah menghasilkan dua baris. Kalau id bertabrakan dengan teks
 * yang BERBEDA (hash 6 heksadesimal bisa bertabrakan), id-nya diberi akhiran
 * angka supaya entri yang sudah ada tidak ikut tertimpa.
 */
export function tambahKeDokumen(
  dok: DokumenMemori,
  baru: EntriBaru,
  opsi?: OpsiMemori,
): { dok: DokumenMemori; entri: EntriMemori | null; ditolak: string | null } {
  const teks = normalisasiTeks(baru.teks);
  if (!teks) {
    return { dok, entri: null, ditolak: 'teks entri kosong' };
  }
  if (!baru.jenis && !opsi?.paksa) {
    const nilai = layakDiingat(teks);
    if (!nilai.layak) return { dok, entri: null, ditolak: nilai.alasan };
  }
  const jenis: JenisMemori = (baru.jenis ?? layakDiingat(teks).jenis) as JenisMemori;
  const lapis: LapisMemori = baru.lapis ?? (opsi?.root ? 'proyek' : 'global');
  const kunci = lapis === 'global' ? null : (baru.proyek ?? kunciProyek(opsi?.root));
  const waktu = baru.waktu ?? waktuSekarang(opsi);

  let id = idEntri(lapis, kunci, teks);
  if (dok.entri.some((e) => e.id === id && normalisasiTeks(e.teks) !== teks)) {
    let n = 2;
    while (dok.entri.some((e) => e.id === `${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  const entri: EntriMemori = {
    id,
    tanggal: tanggalDari(waktu),
    waktu,
    lapis,
    proyek: kunci,
    jenis,
    teks,
  };
  const entri0 = dok.entri.filter((e) => e.id !== id);
  return { dok: { ...dok, entri: [entri, ...entri0] }, entri, ditolak: null };
}

/** Cari entri yang id-nya cocok (juga menerima awalan id yang unik). */
export function hapusDiDokumen(dok: DokumenMemori, id: string): { dok: DokumenMemori; terhapus: boolean } {
  const kunci = String(id ?? '').trim().replace(/^#/, '');
  if (!kunci) return { dok, terhapus: false };
  const cocok = dok.entri.filter((e) => e.id === kunci);
  const target = cocok.length ? cocok : dok.entri.filter((e) => e.id.startsWith(kunci));
  if (target.length !== 1) return { dok, terhapus: false };
  const buang = target[0];
  return { dok: { ...dok, entri: dok.entri.filter((e) => e !== buang) }, terhapus: true };
}

/**
 * Cari entri (murni). Semua kata di `kueri` harus ada di salah satu entri
 * (AND), dicocokkan tanpa peduli huruf besar/kecil. Urutan hasil: relevansi
 * turun, lalu terbaru dulu, lalu id (supaya deterministik).
 */
export function cariDiDokumen(
  dok: DokumenMemori,
  kueri: string,
  opsi?: OpsiMemori & { batas?: number },
): EntriMemori[] {
  const kandidat = terlihat(dok, opsi?.root);
  const kata = String(kueri ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const dinilai = kandidat
    .map((e) => {
      if (kata.length === 0) return { e, skor: 1 };
      const kcl = e.teks.toLowerCase();
      let skor = 0;
      for (const k of kata) {
        if (!kcl.includes(k)) return { e, skor: -1 };
        skor += Math.min(kcl.split(k).length - 1, 3);
      }
      return { e, skor };
    })
    .filter((r) => r.skor >= 0);
  dinilai.sort((a, b) => b.skor - a.skor || b.e.waktu.localeCompare(a.e.waktu) || a.e.id.localeCompare(b.e.id));
  const batas = opsi?.batas ?? dinilai.length;
  return dinilai.slice(0, Math.max(0, batas)).map((r) => r.e);
}

/**
 * Pilih entri yang layak disuntik ke prompt (murni).
 *
 * Urutannya: preferensi dulu, lalu keputusan, hasil kerja, sisanya; di dalam
 * satu jenis yang TERBARU menang. Preferensi didahulukan karena itu yang bikin
 * jawaban terasa "kenal user" - hasil kerja lama justru paling cepat basi.
 * Bila `kueri` diisi, entri yang relevan dengan kueri itu diprioritaskan.
 */
export function pilihUntukBlok(
  dok: DokumenMemori,
  opsi?: OpsiMemori & { kueri?: string },
): EntriMemori[] {
  const kandidat = terlihat(dok, opsi?.root);
  const kueri = (opsi?.kueri ?? '').trim();
  const relevan = kueri ? new Set(cariDiDokumen(dok, kueri, opsi).map((e) => e.id)) : null;
  return [...kandidat].sort((a, b) => {
    if (relevan) {
      const ra = relevan.has(a.id) ? 1 : 0;
      const rb = relevan.has(b.id) ? 1 : 0;
      if (ra !== rb) return rb - ra;
    }
    const p = prioritasJenis(b.jenis) - prioritasJenis(a.jenis);
    if (p !== 0) return p;
    return b.waktu.localeCompare(a.waktu) || a.id.localeCompare(b.id);
  });
}

/**
 * Blok teks siap suntik ke prompt (murni).
 *
 * Kontrak yang dipegang fungsi ini dan diuji harness:
 *   - panjangnya SELALU <= `batasToken * 4` karakter, dan tidak pernah memotong
 *     satu baris di tengah (baris yang tidak muat dilewati, bukan digunting);
 *   - hanya entri yang TERLIHAT dari root aktif (global + proyek yang cocok);
 *   - tiap baris membawa penanda tanggal `[YYYY-MM-DD]`;
 *   - mengembalikan string KOSONG kalau tidak ada satu pun entri yang muat -
 *     supaya pemanggil bisa menyambungkannya tanpa harus memeriksa panjang.
 */
export function blokDariDokumen(
  dok: DokumenMemori,
  opsi?: OpsiMemori & { batasToken?: number; kueri?: string },
): string {
  const token = Math.max(0, Math.floor(opsi?.batasToken ?? BATAS_TOKEN_BAWAAN));
  const batas = token * 4;
  if (batas <= JUDUL_BLOK.length + 1) return '';
  const kandidat = pilihUntukBlok(dok, opsi);
  const baris: string[] = [JUDUL_BLOK];
  let total = JUDUL_BLOK.length;
  for (const e of kandidat) {
    const asal = e.lapis === 'global' ? 'global' : `proyek ${e.proyek}`;
    const barisBaru = `- [${e.tanggal}] ${asal} / ${e.jenis}: ${e.teks}`;
    if (total + 1 + barisBaru.length > batas) continue;
    baris.push(barisBaru);
    total += 1 + barisBaru.length;
  }
  if (baris.length === 1) return '';
  return baris.join(PEMISAH_BARIS);
}

/* ───────────────────────── 6. I/O lewat port ─────────────────────────── */

/**
 * Nama berkas sementara untuk tulis atomik.
 *
 * Nonce-nya sengaja tidak memakai apa pun dari lingkungan runtime (`process`
 * tidak ada di tipe browser/DOM, dan tipe itulah yang dipakai proyek ini):
 * penghitung + waktu + sedikit acak sudah cukup untuk memisahkan penulis yang
 * berjalan bersamaan dalam satu direktori.
 */
let urutanTmp = 0;
export function jalurSementara(jalur: string, nonce?: string): string {
  if (nonce) return `${jalur}.tmp-${nonce}`;
  urutanTmp += 1;
  return `${jalur}.tmp-${Date.now().toString(36)}-${urutanTmp}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Tulis atomik LEWAT PORT: tulis ke berkas sementara di direktori yang sama,
 * baru `rename` ke nama tujuan. `rename` di dalam satu volume atomik, jadi
 * pembaca tidak pernah melihat berkas separuh.
 *
 * Ini jalur yang dipakai adapter berkas (harness Node, dan nanti perintah data
 * dir kalau sudah ada). Adapter `memory.md` tidak memerlukannya: Rust sudah
 * menulis atomik di `tulis_aman::tulis_atomik_teks`.
 */
export async function simpanAtomik(io: IoBerkas, jalur: string, teks: string): Promise<void> {
  const tmp = jalurSementara(jalur);
  await io.tulis(tmp, teks);
  await io.gantiNama(tmp, jalur);
}

/** Port berbasis berkas: seluruh berkas adalah dokumennya. */
export function portBerkas(io: IoBerkas, jalur: string): PortMemori {
  return {
    async baca() {
      if (!(await io.ada(jalur))) return null;
      return io.baca(jalur);
    },
    async tulis(teks: string) {
      await simpanAtomik(io, jalur, teks);
    },
  };
}

/**
 * Jalur yang DIUSULKAN untuk perintah data dir khusus memori (lihat laporan):
 * satu berkas global + satu berkas per proyek, di direktori data app. Belum
 * dipakai siapa pun hari ini - `fs_read`/`fs_write` menolak path di luar
 * workspace, dan perintah itu belum ada, jadi jalurnya disiapkan di sini
 * sebagai kontrak, bukan diam-diam dipakai.
 */
export function jalurMemori(dirData: string, root: string | null | undefined): {
  global: string;
  proyek: string | null;
  kunci: string | null;
} {
  const dir = String(dirData).replace(/[/\\]+$/, '').replace(/\\/g, '/');
  const kunci = kunciProyek(root);
  return {
    global: `${dir}/ai-memori.json`,
    proyek: kunci ? `${dir}/ai-memori-${kunci}.json` : null,
    kunci,
  };
}

/* ─────────────── 7. Muat / simpan dokumen lewat port ─────────────────── */

/**
 * Muat dokumen dari port + catatan masalahnya. Tidak melempar: port yang gagal
 * diperlakukan seperti store kosong, karena memori yang hilang jauh lebih baik
 * daripada percakapan yang gagal start.
 */
export async function muatDariPort(port: PortMemori): Promise<{ dok: DokumenMemori; catatan: string[] }> {
  let teks: string | null = null;
  const catatan: string[] = [];
  try {
    teks = await port.baca();
  } catch (e) {
    catatan.push(`gagal membaca store: ${pesanError(e)}`);
  }
  const hasil = uraiStore(teks);
  return { dok: hasil.dok, catatan: [...catatan, ...hasil.catatan] };
}

function pesanError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Benar kalau pesan error Rust berarti bagian memori sudah penuh. */
function penuh(e: unknown): boolean {
  const m = pesanError(e).toLowerCase();
  return m.includes('is full') || m.includes('penuh') || m.includes('melebihi batas');
}

/**
 * Simpan dokumen lewat port, dengan kemunduran yang jujur.
 *
 * Bila store MENOLAK karena penuh (di `memory.md`, bagian `memory` dipakai
 * bersama catatan user), anggaran dipotong dan percobaan diulang dua kali
 * sebelum menyerah dengan pesan yang terbaca. Yang penting: kegagalan di sini
 * tidak menghapus isi store yang lama, karena tulisnya atomik dan gagal sebelum
 * apa pun berpindah.
 */
export async function simpanDokumen(
  port: PortMemori,
  dok: DokumenMemori,
  opsi?: OpsiMemori,
): Promise<DokumenMemori> {
  let anggaran = Math.max(200, Math.floor(opsi?.anggaran ?? ANGGARAN_BAWAAN));
  let siap = pangkas({ ...dok, diperbarui: dok.diperbarui ?? waktuSekarang(opsi) }, anggaran);
  for (let i = 0; i < 3; i++) {
    try {
      await port.tulis(rangkaikanStore(siap));
      return siap;
    } catch (e) {
      if (!penuh(e) || i === 2) throw e;
      anggaran = Math.max(200, Math.floor(anggaran * 0.6));
      siap = pangkas(siap, anggaran);
    }
  }
  return siap;
}

/* ────────────────── 8. Adapter Tauri (dinamis, tipis) ────────────────── */

/** Cari entri pemilik dokumen di dalam `memory.md` (entri dipisah baris kosong). */
export function entriStore(memoryMd: string): string | null {
  const blok = String(memoryMd ?? '').split(/\n{2,}/);
  const punya = blok.find((b) => b.includes(MARKER_MEMORI));
  return punya ? punya.trim() : null;
}

/**
 * Port default aplikasi: bagian `memory` di `<data_dir>/memory.md` lewat
 * perintah yang SUDAH ADA (`memory_read`/`memory_write`). Impornya DINAMIS
 * supaya modul ini bisa diimpor di Node tanpa Tauri.
 *
 * `tulis` melakukan tulis ulang PENUH: entri ber-penanda diganti dengan
 * `action: 'replace'` (satu operasi, tetap atomik di Rust). Kalau penandanya
 * belum ada - berkas kosong, atau `memory.md` berisi catatan user - dokumen
 * ditambahkan sebagai entri BARU, jadi catatan itu tidak pernah tertimpa.
 */
export function portMemoriMd(): PortMemori {
  return {
    async baca() {
      const cmd = await import('./commands');
      const m = await cmd.memoryRead();
      return entriStore(m.memory);
    },
    async tulis(teks: string) {
      const cmd = await import('./commands');
      const m = await cmd.memoryRead();
      if (entriStore(m.memory) !== null) {
        await cmd.memoryWrite({ section: 'memory', action: 'replace', oldText: MARKER_MEMORI, content: teks });
      } else {
        await cmd.memoryWrite({ section: 'memory', action: 'add', content: teks });
      }
    },
  };
}

/** Port + root + waktu untuk satu panggilan: injeksi dulu, adapter app kemudian. */
async function siapkan(opsi?: OpsiMemori): Promise<{ port: PortMemori; opsi: OpsiMemori }> {
  let port = opsi?.port;
  if (!port && opsi?.io && opsi.jalur) port = portBerkas(opsi.io, opsi.jalur);
  if (!port) port = portMemoriMd();
  let root: string | null = opsi?.root ?? null;
  if (!opsi?.root) {
    try {
      const st = await import('./store');
      root = st.useStore.getState().workspace ?? null;
    } catch {
      root = null;
    }
  }
  return { port, opsi: { ...opsi, root } };
}

/** Catatan dari pemuatan terakhir - untuk panel/diagnosa, bukan untuk prompt. */
let catatanTerakhir: string[] = [];
export function catatanMemori(): string[] {
  return [...catatanTerakhir];
}

/**
 * Dokumen hasil pemuatan/penulisan terakhir, disimpan di memori.
 *
 * `systemPromptFor()` di `src/lib/systemPrompt.ts` adalah fungsi SINKRON, jadi
 * ia tidak bisa `await blokMemori()`. Cache inilah yang membuat penyambungannya
 * cukup DUA baris sinkron: panggil `muatLengkap()` sekali saat chat dimulai
 * (atau biarkan `tambah()`/`hapus()` mengisi cache), lalu rakit bloknya di sini.
 */
let dokumenTerakhir: DokumenMemori | null = null;

/** Dokumen yang sedang di-cache (null = belum pernah dimuat di sesi ini). */
export function dokumenTersimpan(): DokumenMemori | null {
  return dokumenTerakhir;
}

/** Isi cache secara manual (dipakai tes/diagnosa). */
export function pasangDokumenTersimpan(dok: DokumenMemori | null): void {
  dokumenTerakhir = dok;
}

/**
 * Blok memori SINKRON dari dokumen yang sudah dimuat - untuk perakit prompt yang
 * tidak async. Mengembalikan string kosong kalau cache belum terisi, supaya
 * pemanggil tidak perlu tahu apa-apa soal memori.
 */
export function blokMemoriTersimpan(
  batasToken: number = BATAS_TOKEN_BAWAAN,
  opsi?: { root?: string | null; kueri?: string },
): string {
  if (!dokumenTerakhir) return '';
  return blokDariDokumen(dokumenTerakhir, {
    root: opsi?.root ?? null,
    kueri: opsi?.kueri,
    batasToken,
  });
}

/* ─────────────── 9. API publik (async, siap dipanggil) ───────────────── */

/** Muat seluruh dokumen (global + semua proyek). */
export async function muatSemua(opsi?: OpsiMemori): Promise<DokumenMemori> {
  return (await muatLengkap(opsi)).dok;
}

/** Muat dokumen + catatan kerusakan yang ditemukan saat mengurai. */
export async function muatLengkap(
  opsi?: OpsiMemori,
): Promise<{ dok: DokumenMemori; catatan: string[] }> {
  const { port } = await siapkan(opsi);
  const hasil = await muatDariPort(port);
  catatanTerakhir = hasil.catatan;
  dokumenTerakhir = hasil.dok;
  return hasil;
}

/**
 * Tambah satu entri ke memori (lapis global atau proyek aktif).
 *
 * Menolak teks yang tidak lolos `layakDiingat()` dengan alasan yang terbaca;
 * panggil dengan `{ paksa: true }` (atau isi `jenis`) kalau pemanggil tahu
 * lebih baik. Mengembalikan entri yang benar-benar tersimpan.
 */
export async function tambah(entri: EntriBaru, opsi?: OpsiMemori): Promise<EntriMemori> {
  const { port, opsi: o } = await siapkan(opsi);
  const { dok, catatan } = await muatDariPort(port);
  const rencana = tambahKeDokumen(dok, entri, o);
  if (!rencana.entri) {
    const alasan = rencana.ditolak ?? 'alasan tidak diketahui';
    catatanTerakhir = [...catatan, `ditolak: ${alasan}`];
    throw new Error(`entri tidak layak diingat (${alasan}); pakai tambah(entri, { paksa: true }) kalau ini memang harus disimpan`);
  }
  const waktu = entri.waktu ?? waktuSekarang(o);
  const simpan = await simpanDokumen(
    port,
    { ...rencana.dok, diperbarui: waktu, dipangkas: rencana.dok.dipangkas },
    o,
  );
  dokumenTerakhir = simpan;
  const dipangkasKaliIni = simpan.dipangkas - dok.dipangkas;
  catatanTerakhir = [
    ...catatan,
    ...(dipangkasKaliIni > 0 ? [`${dipangkasKaliIni} entri lama dipangkas agar muat anggaran`] : []),
  ];
  return rencana.entri;
}

/** Cari entri: global selalu ikut, entri proyek hanya dari root yang aktif. */
export async function cari(kueri: string, opsi?: OpsiMemori & { batas?: number }): Promise<EntriMemori[]> {
  const { port, opsi: o } = await siapkan(opsi);
  const { dok, catatan } = await muatDariPort(port);
  catatanTerakhir = catatan;
  return cariDiDokumen(dok, kueri, o);
}

/** Hapus satu entri berdasarkan id (atau awalan id yang unik). */
export async function hapus(id: string, opsi?: OpsiMemori): Promise<boolean> {
  const { port, opsi: o } = await siapkan(opsi);
  const { dok, catatan } = await muatDariPort(port);
  const hasil = hapusDiDokumen(dok, id);
  if (!hasil.terhapus) {
    catatanTerakhir = [...catatan, `tidak ada entri dengan id '${id}'`];
    return false;
  }
  dokumenTerakhir = await simpanDokumen(port, { ...hasil.dok, diperbarui: waktuSekarang(o) }, o);
  catatanTerakhir = catatan;
  return true;
}

/**
 * Blok siap suntik ke prompt: muat store, pilih entri yang muat, kembalikan
 * teksnya (atau string kosong kalau tidak ada yang layak). Panjangnya <=
 * `batasToken * 4` karakter.
 */
export async function blokMemori(
  batasToken = BATAS_TOKEN_BAWAAN,
  opsi?: OpsiMemori & { kueri?: string },
): Promise<string> {
  const { port, opsi: o } = await siapkan(opsi);
  const { dok, catatan } = await muatDariPort(port);
  catatanTerakhir = catatan;
  return blokDariDokumen(dok, { ...o, batasToken });
}

/** Nama yang dipakai baris penyambung di perakit prompt (lihat laporan). */
export async function blokMemoriSiapPakai(
  batasToken = BATAS_TOKEN_BAWAAN,
  opsi?: OpsiMemori & { kueri?: string },
): Promise<string> {
  return blokMemori(batasToken, opsi);
}
