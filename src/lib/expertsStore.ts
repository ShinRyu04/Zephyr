/**
 * Experts Mode — tim multi-agen ala Qoder, di atas mesin subagent Zephyr.
 *
 * Alurnya tiga babak, dan SEMUA eksekusi tetap milik `subagentStore`:
 *
 *   1. Lead        — satu panggilan `ai_tool_chat` tanpa tool memutuskan
 *                   CHAT (dijawab langsung) atau TUGAS (rencana JSON: daftar
 *                   tugas dengan dependensi `setelah`).
 *   2. `setujui()` — setelah user meninjau/mengubah rencana, tugas dijadwalkan
 *                   menjadi rantai (format `a -> b -> c` yang dipahami
 *                   `jalankan`) lalu dieksekusi paralel oleh mesin subagent:
 *                   paralel per rantai, konteks antar-gelombang, klaim berkas,
 *                   verdict — semuanya warisan. Auto-run tetap tersedia lewat
 *                   opsi Experts Settings, bukan jalur yang dipaksa.
 *   3. sintesis    — Lead menerima hasil tiap worker (status, berkas, laporan,
 *                   bukti) dan menulis jawaban akhir untuk user.
 *
 * Kenapa rantai berjenjang, bukan DAG bebas: `jalankan` menjalankan gelombang
 * per POSISI rantai (gelombang w+1 baru mulai setelah SEMUA gelombang w
 * selesai), jadi tugas yang diletakkan di posisi = kedalaman dependensinya
 * dijamin berjalan setelah induknya — walau ia berada di rantai lain. Rencana
 * yang butuh ketergantungan banyak dialihkan Lead ke satu tugas yang lebih
 * besar; kontrak promptnya melarang dua induk.
 *
 * Nama tampilan worker mengikuti Qoder: peran + nama manusia ("Researcher
 * Alex"), ditarik dari `pool` tiap ahli secara berurutan per run.
 */

import { create } from 'zustand';
import * as cmd from './commands';
import { useAi, fullUrlProvider } from './aiStore';
import { useStore } from './store';
import { useSubAgent, type SubStatus, type SubStep } from './subagentStore';
import { petaFitur } from './systemPrompt';
import type { PeranId } from './subagentRoles';
import { customAktif } from './subagentCustom';
import { MODEL_BY_ID } from './modelCatalog';

/* ------------------------------------------------------------------ */
/* Tim ahli bawaan                                                     */
/* ------------------------------------------------------------------ */

export type AhliId = 'lead' | 'researcher' | 'fullstack' | 'qa' | 'reviewer' | 'ui' | 'debug';

export interface AhliDef {
  id: AhliId;
  /** Label tampilan bahasa Inggris, seperti produk rujukan. */
  label: string;
  /** Peran subagent yang mewadahi ahli ini (persona + ikon + gerbang tulis). */
  peran: PeranId;
  /** True = ahli ini boleh (dan biasanya perlu) menulis berkas. */
  butuhTulis: boolean;
  /** Nama persona, ditarik berurutan per run ("Researcher Sam", lalu Alex). */
  pool: string[];
  deskripsi: string;
}

export const AHLI: AhliDef[] = [
  {
    id: 'lead',
    label: 'Lead Agent',
    peran: 'rencana',
    butuhTulis: false,
    pool: ['Nova'],
    deskripsi:
      'Memahami tujuan, memecah tugas ke ahli lain, menjaga mutu, dan menyatukan hasilnya.',
  },
  {
    id: 'researcher',
    label: 'Researcher',
    peran: 'cari',
    butuhTulis: false,
    pool: ['Sam', 'Alex'],
    deskripsi: 'Riset kode: cari pemakaian, petakan struktur dan dependensi, periksa environment.',
  },
  {
    id: 'fullstack',
    label: 'Full-Stack Engineer',
    peran: 'kerja',
    butuhTulis: true,
    pool: ['Jay', 'Felix'],
    deskripsi: 'Menulis dan mengubah kode frontend & backend, lalu memverifikasinya.',
  },
  {
    id: 'qa',
    label: 'QA',
    peran: 'audit',
    butuhTulis: false,
    pool: ['Mona'],
    deskripsi: 'Menjalankan test/typecheck dan mengumpulkan bukti validasi, bukan sekadar klaim.',
  },
  {
    id: 'reviewer',
    label: 'Code Reviewer',
    peran: 'telaah',
    butuhTulis: false,
    pool: ['Ivan'],
    deskripsi: 'Me-review perubahan: risiko, jalur yang terlewat, saran perbaikan dengan file:line.',
  },
  {
    id: 'ui',
    label: 'UI Operator',
    peran: 'jelajah',
    butuhTulis: false,
    pool: ['Oscar'],
    deskripsi: 'Validasi E2E lewat browser dan reproduksi bug visual.',
  },
  {
    id: 'debug',
    label: 'Debug Engineer',
    peran: 'telaah',
    butuhTulis: false,
    pool: ['Rex'],
    deskripsi: 'Mereproduksi kegagalan dan menelusuri root cause dengan bukti.',
  },
];

export const AHLI_BY_ID = new Map(AHLI.map((a) => [a.id, a]));

/* ------------------------------------------------------------------ */
/* Konfigurasi per ahli (localStorage — pola yang sama dengan          */
/* per-role model Subagents, supaya tidak menyentuh settings.rs)        */
/* ------------------------------------------------------------------ */

const KUNCI_CFG = 'zephyr.experts.cfg.v1';
const KUNCI_RUNS = 'zephyr.experts.runs.v1';
const KUNCI_OPSI = 'zephyr.experts.opts.v1';

export interface AhliCfg {
  /** Ahli nonaktif tidak pernah dipilih Lead. Lead sendiri tidak bisa mati. */
  aktif: boolean;
  /**
   * `''` = pakai model sesi; `'auto'` = biarkan router subagent memilih model
   * yang paling layak untuk tugas itu (tag `[model:auto]`). Selain itu = pin.
   */
  model: string;
  provider: string;
  /** Instruksi tambahan yang menempel pada tugas tiap worker ahli ini. */
  instruksi: string;
  /**
   * Aturan keras per ahli ("rules"), berbeda dari `instruksi`.
   *
   * `instruksi` adalah catatan gaya ("pakai komentar bahasa Indonesia");
   * `rules` adalah batasan yang harus dipatuhi ("jangan sentuh src-tauri",
   * "selalu jalankan npm test sebelum lapor"). Keduanya ditempel ke brief
   * worker, tetapi `rules` diberi penanda tegas supaya model membacanya
   * sebagai syarat, bukan saran.
   */
  rules: string[];
  /**
   * Kedalaman penalaran khusus ahli ini. `''` = ikut setelan reasoning global
   * (chip Reasoning di composer), selain itu menimpa hanya untuk worker ini —
   * QA yang menjalankan test tidak perlu `ultra`, Reviewer justru butuh.
   */
  effort: TingkatEffort;
  /** Nama skill yang wajib dibaca worker ini lebih dulu lewat `skill_view`. */
  skills: string[];
  /** Id server MCP yang boleh dipakai worker ini. Kosong = semua server aktif. */
  mcp: string[];
}

/** Sama dengan `ReasoningEffort` di aiStore, ditambah `''` = ikut global. */
export type TingkatEffort = '' | 'minimal' | 'low' | 'medium' | 'high' | 'ultra';

const TINGKAT_EFFORT: readonly TingkatEffort[] = ['', 'minimal', 'low', 'medium', 'high', 'ultra'];

function bacaEffort(v: unknown): TingkatEffort {
  return typeof v === 'string' && (TINGKAT_EFFORT as readonly string[]).includes(v)
    ? (v as TingkatEffort)
    : '';
}

/**
 * Opsi tingkat tim (bukan per ahli).
 *
 * `autoRun` sengaja **false** sebagai bawaan: dokumen Qoder menaruh konfirmasi
 * user di antara rencana dan eksekusi. Auto-run tetap tersedia sebagai opsi
 * yang bisa dinyalakan pembaca, bukan jalur yang dipaksa untuk semua orang.
 */
export interface OpsiExperts {
  autoRun: boolean;
}

export function bacaOpsiExperts(): OpsiExperts {
  try {
    const raw = localStorage.getItem(KUNCI_OPSI);
    if (!raw) return { autoRun: false };
    const p = JSON.parse(raw) as Partial<OpsiExperts>;
    return { autoRun: p.autoRun === true };
  } catch {
    return { autoRun: false };
  }
}

export function simpanOpsiExperts(sebagian: Partial<OpsiExperts>): void {
  const baru = { ...bacaOpsiExperts(), ...sebagian };
  try {
    localStorage.setItem(KUNCI_OPSI, JSON.stringify(baru));
  } catch {
    /* kuota penuh: opsi tetap hidup selama sesi lewat nilai yang dibaca ulang */
  }
}

function cfgDefault(): Record<AhliId, AhliCfg> {
  const out = {} as Record<AhliId, AhliCfg>;
  for (const a of AHLI)
    out[a.id] = {
      aktif: true,
      model: '',
      provider: '',
      instruksi: '',
      rules: [],
      effort: '',
      skills: [],
      mcp: [],
    };
  return out;
}

/** Nama-nama skill yang disimpan di config, dibersihkan dari entri kosong. */
function daftarNama(v: unknown): string[] {
  return Array.isArray(v)
    ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 24)
    : [];
}

/**
 * Aturan per ahli: teks bebas, tapi dibatasi supaya prompt tidak meledak.
 *
 * Batas 500 karakter per aturan dan 12 aturan per ahli. Aturan yang lebih
 * panjang dari itu bukan lagi "rule" — itu instruksi, dan tempatnya di field
 * `instruksi` yang memang untuk catatan panjang.
 */
export const ATURAN_MAKS_CHAR = 500;
export const ATURAN_MAKS = 12;

/**
 * Batas panjang instruksi tambahan per ahli.
 *
 * Produk rujukan memakai 10.000 karakter untuk Additional Prompt, dan batas
 * itu masuk akal: instruksi menempel di SETIAP brief worker, jadi teks yang
 * lebih panjang dari ini akan mendorong brief tugasnya sendiri keluar dari
 * anggaran konteks.
 */
export const MAKS_INSTRUKSI = 10000;

function daftarAturan(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x).trim().slice(0, ATURAN_MAKS_CHAR)).filter(Boolean))].slice(
    0,
    ATURAN_MAKS,
  );
}

export function bacaCfgAhli(): Record<AhliId, AhliCfg> {
  const dasar = cfgDefault();
  try {
    const raw = localStorage.getItem(KUNCI_CFG);
    if (!raw) return dasar;
    const parsed = JSON.parse(raw) as Partial<Record<AhliId, Partial<AhliCfg>>>;
    for (const a of AHLI) {
      const p = parsed[a.id];
      if (!p) continue;
      dasar[a.id] = {
        aktif: p.aktif !== false,
        model: typeof p.model === 'string' ? p.model : '',
        provider: typeof p.provider === 'string' ? p.provider : '',
        instruksi: typeof p.instruksi === 'string' ? p.instruksi.slice(0, MAKS_INSTRUKSI) : '',
        rules: daftarAturan(p.rules),
        effort: bacaEffort(p.effort),
        skills: daftarNama(p.skills),
        mcp: daftarNama(p.mcp),
      };
    }
  } catch {
    /* entry rusak: pakai default, jangan blok apa pun */
  }
  /*
   * Lead TIDAK bisa dikustomisasi (dokumen Qoder). Nilai lama yang sempat
   * tersimpan tidak boleh diam-diam masih dipakai: paksakan kosong, supaya
   * orkestrasi selalu memakai model sesi dan prompt Lead bawaan.
   */
  dasar.lead = {
    ...dasar.lead,
    aktif: true,
    model: '',
    provider: '',
    instruksi: '',
    rules: [],
    effort: '',
    skills: [],
    mcp: [],
  };
  return dasar;
}

export function simpanCfgAhli(id: AhliId, sebagian: Partial<AhliCfg>): void {
  if (id === 'lead') return; // Lead terkunci: halaman Experts tidak boleh mengubahnya.
  const semua = bacaCfgAhli();
  const gabung = { ...semua[id], ...sebagian };
  /* Batas ditegakkan di sini juga, bukan hanya di textarea: config bisa datang
     dari berkas/ DevTools, dan brief worker tetap harus patuh. */
  if (typeof gabung.instruksi === 'string') gabung.instruksi = gabung.instruksi.slice(0, MAKS_INSTRUKSI);
  semua[id] = gabung;
  try {
    localStorage.setItem(KUNCI_CFG, JSON.stringify(semua));
  } catch {
    /* kuota penuh: konfigurasi tetap hidup di memori selama sesi */
  }
}

/* ------------------------------------------------------------------ */
/* Bentuk run                                                          */
/* ------------------------------------------------------------------ */

export interface TugasAhli {
  id: string;
  judul: string;
  deskripsi: string;
  ahli: AhliId;
  /** Nama tampilan lengkap: "Researcher Alex". */
  nama: string;
  berkas: string[];
  /** Id tugas yang HARUS selesai dulu, atau null kalau paralel. */
  setelah: string | null;
  /** Id baris subagent setelah spawn — pintu ke status/langkah hidup. */
  agentId: string | null;

  /**
   * Worker kustom pembaca (bukan ahli bawaan). `ahli` tetap diisi peran
   * bawaan terdekat supaya ikon/gerbang tulis tetap punya bahasa yang sama;
   * nama, persona, dan model datang dari definisi kustomnya.
   */
  customId?: string | null;
  customNama?: string;
  customIkon?: string;

  /**
   * Snapshot akhir untuk bertahan melewati reload / batch berikutnya yang
   * mengganti isi `subagentStore`. Selama barisnya masih hidup, UI membaca
   * status LANGSUNG dari baris; snapshot hanya jalan cadangan.
   */
  statusAkhir?: SubStatus;
  hasil?: string;
  /**
   * Laporan disimpan terpotong (lihat `BATAK_HASIL_SIMPAN`). Tanpa tanda ini
   * laporan yang tiba-tiba berhenti di tengah kalimat setelah reload terbaca
   * seperti laporan yang memang selesai begitu.
   */
  hasilPendek?: boolean;
  nTool?: number;
  /**
   * Jumlah langkah pencarian (grep/glob/web) yang dilakukan worker — bahan
   * baris "Explored N searches" di kartu chat. Disimpan seperti `nTool`
   * supaya run lama setelah reload tetap bisa menunjukkan risetnya.
   */
  nCari?: number;
  /** Berkas yang BENAR-BENAR ditulis worker (bukti tool, bukan rencana). */
  berkasTulis?: string[];

  /**
   * Verdict bukti dari mesin subagent — dihitung dari LANGKAH TOOL yang benar
   * berhasil, bukan dari klaim laporan. Disimpan supaya kartu task tetap jujur
   * setelah reload (baris hidupnya sudah hilang).
   */
  verdictAkhir?: VerdictBukti;

  /**
   * Pemakaian token/biaya snapshot, disimpan seperti `statusAkhir` supaya
   * angka run tetap terbaca setelah reload — baris subagent hidupnya sudah
   * hilang saat itu. `null` = provider tidak melaporkan (bukan nol).
   */
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;

  /**
   * False = worker selesai tapi tidak meninggalkan bukti yang bisa dipercaya
   * (nol tool sukses, atau laporannya cuma janji "let me call the tools").
   * UI menampilkan "Unproven", bukan "Completed" — verdict harus jujur.
   */
  buktian?: boolean;
}

/** Sama dengan verdict di `subagentStore.SubAgent`. */
export type VerdictBukti = 'terbukti' | 'sebagian' | 'tanpa-bukti';

export type RunStatus = 'menyusun' | 'rencana' | 'jalan' | 'selesai' | 'gagal' | 'batal';

export interface EkspertRun {
  id: string;
  sessionId: string;
  /** Id pesan rencana di transcript — diubah jadi jawaban saat Lead memutus CHAT. */
  pesanId?: string;
  goal: string;
  status: RunStatus;
  intro: string;
  tugas: TugasAhli[];
  error: string | null;
  mulai: number;
  selesai: number | null;
  /**
   * Arahan yang dikirim pembaca SELAGI tim berjalan. Diteruskan ke worker yang
   * belum mulai dan ke sintesis akhir; worker yang sudah berjalan tidak bisa
   * diubah di tengah langkah, dan itu dinyatakan apa adanya di toast.
   */
  steer?: string[];
}

const RUN_JALAN: RunStatus[] = ['menyusun', 'rencana', 'jalan'];

/* ------------------------------------------------------------------ */
/* Rencana JSON dari Lead                                              */
/* ------------------------------------------------------------------ */

interface RencanaMentah {
  intro?: unknown;
  tasks?: unknown;
}

/** Satu tugas hasil normalisasi JSON Lead — tipe BERSIH, bukan mentahan. */
interface TugasBersih {
  judul: string;
  ahli: string;
  deskripsi: string;
  berkas: string[];
  setelah: string | null;
}

function rapikanTeks(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Guard klasifikasi: pertanyaan tidak boleh diserap jadi rencana       */
/* ------------------------------------------------------------------ */

/*
 * Sebuah PERTANYAAN harus dijawab Lead, bukan dipecah jadi tugas. Kasus
 * nyata: "expert bisa apa saja" dulu menjadi run 3 tugas kosong yang lalu
 * dieksekusi — kuota terbakar untuk pekerjaan yang tidak pernah diminta.
 *
 * Heuristik ini sengaja konservatif: kalau pesan memuat kata kerja aksi
 * (perbaiki, buat, tambah, fix, refactor, ...), pesan itu TUGAS walau ditulis
 * sebagai pertanyaan ("bisakah kamu perbaiki build?"). Yang dianggap chat hanya
 * pertanyaan murni tanpa aksi — persis kelas yang dulu salah diklasifikasi.
 */
const KATA_TANYA =
  /(^|\s)(apa|apakah|kenapa|mengapa|bagaimana|gimana|siapa|kapan|dimana|di mana|berapa|bisakah|bolehkah|what|why|how|who|when|where|which|can|could|would|should|does|do|is|are)\b/i;
const KATA_AKSI =
  /\b(buat|bikin|tambah|tambahkan|perbaiki|ubah|ganti|hapus|pindah|implement|implementasi|fix|add|build|create|refactor|rename|remove|delete|update|write|tulis|jalankan|run|test|uji|deploy|install|pasang|upgrade|migrate|kerjakan|selesaikan|selesaiin)\b/i;

/*
 * Sapaan / panggilan singkat. "halo expert" dulu lolos ke prompt rencana dan
 * berakhir sebagai kartu "Lead Agent — Plan" kosong; itu bukan jawaban, dan
 * user membacanya sebagai aplikasi yang membalas dengan template. Sapaan
 * adalah obrolan: jawab langsung, jangan minta Lead mengarang tugas.
 *
 * Hanya cocok kalau SELURUH pesan adalah sapaan (boleh diikuti "expert"/
 * "team"), jadi "halo, perbaiki build" tetap tugas karena ada kata aksi yang
 * sudah ditolak lebih dulu oleh KATA_AKSI.
 */
const SAPAAN =
  /^(?:halo|halohai|hai|hi|hello|hey|pagi|siang|sore|malam|selamat(?:\s+(?:pagi|siang|sore|malam))?|assalamualaikum|salam|ping|tes|test)(?:[\s,!.]+(?:expert|experts|team|semua|bro|kak|gan|sis))?[\s!.,?]*$/i;

/** True = pesan ini pertanyaan/obrolan murni, bukan perintah kerja. */
export function pesanTanya(teks: string): boolean {
  const t = rapikanTeks(teks);
  if (!t) return false;
  if (KATA_AKSI.test(t)) return false;
  if (SAPAAN.test(t)) return true;
  return /\?\s*$/.test(t) || (t.length <= 140 && KATA_TANYA.test(t));
}

/*
 * Judul tugas yang sebenarnya balasan obrolan ("Jawab pertanyaan user",
 * "Explain what Experts can do") bukan pekerjaan tim. Tugas seperti itu
 * ditolak sebelum run dibuat, sehingga rencana kosong tidak pernah dieksekusi.
 */
const JUDUL_META =
  /^(jawab|menjawab|jawaban|jelaskan|menjelaskan|explain|explaining|answer|answering|tell|beri tahu|sebutkan|klarifikasi|clarify|respon|respond)\b/i;

/** Tugas hanya masuk akal kalau punya judul + brief yang benar-benar berisi. */
function tugasMasukAkal(t: TugasBersih): boolean {
  return t.judul.length >= 4 && t.deskripsi.length >= 15 && !JUDUL_META.test(t.judul);
}

/*
 * Laporan yang isinya JANJI mengerjakan, bukan hasil. Contoh yang dilaporkan:
 * "Let me call the tools properly" — kalimat itu tidak membuktikan apa pun,
 * jadi worker seperti itu tidak boleh tampil Completed.
 *
 * Dibatasi ke laporan pendek: laporan panjang yang memuat kalimat ini biasanya
 * tetap membawa hasil di bagian lain, dan menghukumnya akan salah.
 */
const JANJI_AWAL =
  /\b(let me|allow me|i(?:'ll| will) now|i(?:'m| am) going to|saya akan|aku akan|mari saya|sekarang saya)\b/i;
const JANJI_AKSI =
  /\b(call|use|run|try|start|proceed|invoke|panggil|pakai|jalankan|coba|lanjut|kerjakan)\b/i;
function laporanJanji(hasil: string): boolean {
  const t = hasil.trim();
  if (!t || t.length > 400) return false;
  return JANJI_AWAL.test(t) && JANJI_AKSI.test(t);
}

/* Kata kerja yang MENGKLAIM perubahan berkas — dipakai memeriksa worker tulis. */
const KLAIM_UBAH =
  /\b(created|updated|changed|modified|added|fixed|wrote|implemented|membuat|mengubah|menambahkan|memperbaiki|menulis|mengimplementasikan)\b/i;

/**
 * Bukti cukup untuk menyebut satu tugas benar-benar selesai.
 *
 * Sumbernya langkah tool nyata (verdict mesin subagent), bukan ringkasan model:
 *   - status harus 'selesai' dan minimal satu tool sukses,
 *   - verdict 'tanpa-bukti' selalu ditolak,
 *   - laporan yang cuma janji ditolak,
 *   - worker yang butuh tulis tapi tidak menulis apa pun dan mengaku mengubah
 *     berkas juga ditolak (atau tulisnya ditolak gerbang izin).
 */
function buktiCukup(
  t: TugasAhli,
  a: {
    status: SubStatus;
    hasil: string;
    nTool: number;
    files: string[];
    verdict: VerdictBukti;
    tulisDitolak: number;
  },
): boolean {
  if (a.status !== 'selesai') return false;
  if (a.verdict === 'tanpa-bukti') return false;
  if (a.nTool === 0) return false;
  /*
   * Heuristik teks kalah dari BUKTI TOOL (Risiko 13): dulu laporan pendek yang
   * memuat kata janji ("Next: apply the same change to b.ts" sebagai catatan
   * penutup) menolak worker yang verdict-nya SUDAH 'terbukti' — tuduhan palsu
   * yang bisa membuat seluruh run gagal dengan "tidak ada bukti tool" padahal
   * mesin membuktikan sebaliknya. Heuristik tetap berguna untuk verdict
   * 'sebagian'/'tanpa-bukti', di situ langkah tool-nya memang lemah.
   */
  if (a.verdict !== 'terbukti' && laporanJanji(a.hasil)) return false;
  const def = AHLI_BY_ID.get(t.ahli);
  if (def?.butuhTulis && a.files.length === 0) {
    if (a.tulisDitolak > 0) return false;
    if (KLAIM_UBAH.test(a.hasil)) return false;
  }
  return true;
}

/*
 * Nama tool keluarga "cari" — bahan baris "Explored N searches" di kartu chat.
 * Sengaja longgar (awalan, bukan daftar tertutup): tool MCP baru yang bernama
 * search_* atau web_* ikut terhitung, dan itu memang riset juga.
 */
const AWALAN_CARI = /^(grep|glob|search|tool_search|find|cari|web|ambil_web|browsing|ingat)/i;

/** Berapa langkah tool di `langkah` yang termasuk keluarga pencarian. */
export function jumlahLangkahCari(langkah: SubStep[]): number {
  return langkah.filter((l) => l.kind === 'tool' && AWALAN_CARI.test(l.nama ?? '')).length;
}

/**
 * Teks yang layak ditampilkan sebagai jawaban chat saat Lead tidak memberi
 * rencana yang sah. JSON mentah tidak pernah dilempar ke bubble user; yang
 * diambil hanya `jawab`/`intro` bila ada.
 */
function teksJawaban(content: string): string {
  const bersih = content.trim();
  if (!bersih) return '';
  const json = potongJson(bersih);
  if (json) {
    try {
      const o = JSON.parse(json) as { jawab?: unknown; intro?: unknown };
      if (typeof o.jawab === 'string' && o.jawab.trim()) return o.jawab.trim();
      if (typeof o.intro === 'string' && o.intro.trim()) return o.intro.trim();
    } catch {
      /* bukan JSON: pakai teks apa adanya di bawah */
    }
    /* Blok JSON yang tidak bisa dibaca bukan jawaban yang layak tampil. */
    return '';
  }
  return bersih;
}

/**
 * Ambil objek JSON dari jawaban Lead — tanpa mengandalkan fence: model kadang
 * membungkus ```json, kadang menambah kalimat pembuka.
 */
function potongJson(teks: string): string | null {
  const awal = teks.indexOf('{');
  const akhir = teks.lastIndexOf('}');
  if (awal < 0 || akhir <= awal) return null;
  return teks.slice(awal, akhir + 1);
}

function parseRencana(
  content: string,
  tugasMaks: number,
): { jenis: 'chat'; jawab: string } | { jenis: 'rencana'; intro: string; mentah: TugasBersih[] } | null {
  const json = potongJson(content);
  if (!json) return null;
  let data: RencanaMentah & { chat?: unknown; jawab?: unknown };
  try {
    data = JSON.parse(json) as RencanaMentah & { chat?: unknown; jawab?: unknown };
  } catch {
    return null;
  }
  /*
   * Jalur CHAT: Lead memutuskan pesannya bukan tugas (pertanyaan/obrolan),
   * jadi dia menjawab langsung — Experts Mode TETAP BISA NGOBROL. Tanpa ini,
   * setiap "kenapa build gagal?" diserap mesin rencana dan panel terasa mati.
   */
  if (data.chat === true && typeof data.jawab === 'string' && data.jawab.trim()) {
    return { jenis: 'chat', jawab: data.jawab.trim() };
  }
  if (!Array.isArray(data.tasks)) return null;
  const mentah = data.tasks
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map(
      (t): TugasBersih => ({
        judul: rapikanTeks(t.judul),
        ahli: rapikanTeks(t.ahli).toLowerCase(),
        deskripsi: rapikanTeks(t.deskripsi),
        berkas: Array.isArray(t.berkas)
          ? t.berkas.map((b) => String(b).trim()).filter(Boolean).slice(0, 12)
          : [],
        setelah: typeof t.setelah === 'string' ? rapikanTeks(t.setelah) : null,
      }),
    )
    .filter((t) => t.judul && t.deskripsi)
    /* Tugas meta ("jawab pertanyaan", "jelaskan ...") bukan pekerjaan tim. */
    .filter(tugasMasukAkal)
    .slice(0, tugasMaks);
  if (mentah.length === 0) return null;
  return { jenis: 'rencana', intro: rapikanTeks(data.intro), mentah };
}

/**
 * Satu baris roster yang dilihat Lead. Ahli bawaan memakai `AhliId`; worker
 * kustom pembaca memakai id berawalan `kustom:` supaya tidak pernah bentrok
 * dengan id bawaan (termasuk kalau namanya kebetulan "fullstack").
 */
interface KandidatTim {
  id: string;
  label: string;
  deskripsi: string;
  butuhTulis: boolean;
}

/**
 * Path folder yang benar-benar terbuka di jendela ini.
 *
 * `petaFitur()` hanya peta fitur statis — tidak berisi workspace. Tanpa baris
 * ini Lead menjawab "D:\Games" (atau folder lama) sementara explorer membuka
 * proyek lain. Sumber kebenaran tetap `useStore.workspace`, bukan tebakan model.
 */
function barisWorkspace(): string {
  const ws = useStore.getState().workspace;
  return ws
    ? `CURRENT WORKSPACE: ${ws} (this is the folder open in the editor — answer about THIS folder)`
    : 'CURRENT WORKSPACE: (no folder is open) — say so instead of guessing a path';
}

/** Prompt Lead: putuskan CHAT vs TUGAS, konteks workspace + kontrak JSON. */
function promptLead(goal: string, roster: KandidatTim[], tugasMaks: number): string {
  const tim = roster
    .filter((a) => a.id !== 'lead')
    .map(
      (a) =>
        `- ${a.label} (id: "${a.id}"): ${a.deskripsi}${a.butuhTulis ? ' MAY write files.' : ' READ-ONLY.'}`,
    )
    .join('\n');
  return [
    "You are the LEAD AGENT of an expert team inside Zephyr, a desktop code editor (Tauri 2 + React + TypeScript) running on the user's machine.",
    petaFitur(),
    barisWorkspace(),
    '',
    'FIRST, DECIDE WHAT THIS MESSAGE IS:',
    '- A QUESTION / conversation (asking why, how, what; requesting an explanation or opinion; small talk): reply with EXACTLY {"chat": true, "jawab": "<answer directly, in the same language as the user>"} and NOTHING else. You are the Lead: answer it yourself, concise and technical, no plan, no team.',
    '- A TASK (build, fix, change, implement, refactor something in the workspace): reply with the plan JSON below.',
    '',
    `USER MESSAGE: ${goal}`,
    '',
    'YOUR TEAM (assign every task to exactly ONE of these; nobody else exists):',
    tim,
    '',
    'TASK PLAN — reply with ONE JSON object and NOTHING else (no prose, no code fence):',
    '{"intro": "<one short sentence, in the SAME language as the user goal, saying the plan is ready>", "tasks": [',
    '  {"judul": "<short task title>", "ahli": "<expert id>", "deskripsi": "<concrete self-contained brief: what to do, which files, how to verify>", "berkas": ["relative/path.ts"], "setelah": null}',
    ']}',
    '',
    'RULES:',
    `- 2..${tugasMaks} tasks. Merge small related work instead of splitting hair-thin.`,
    '- Independent tasks (setelah = null) run IN PARALLEL. A task that needs another task\'s output first MUST set "setelah" to that task\'s judul EXACTLY (string match).',
    '- A task may depend on AT MOST ONE other task (its chain). A task that would need two: merge them into one task instead.',
    '- Implementation work goes to Full-Stack Engineer. Use Researcher for read-only investigation, QA to run typecheck/tests AFTER an implementation task (setelah that task), Code Reviewer for risky changes, Debug Engineer to root-cause failures, UI Operator for browser validation.',
    '- An id starting with "kustom:" is one of the USER\'S OWN custom workers. Use it when its description fits; copy that exact id into "ahli".',
    '- Each deskripsi must be understandable WITHOUT the other tasks: the worker only sees its own text.',
    '- berkas = files the task will touch; empty array for research/review tasks.',
  ].join('\n');
}

/**
 * Prompt untuk pesan yang sudah pasti pertanyaan: satu balasan langsung,
 * tanpa rencana dan tanpa worker. Dipakai guard `pesanTanya` supaya Lead tidak
 * punya kesempatan mengubah "expert bisa apa saja" menjadi tiga tugas kosong.
 */
function promptJawab(goal: string): string {
  return [
    'You are the LEAD AGENT of an expert team inside Zephyr, a desktop code editor (Tauri 2 + React + TypeScript) running on the user\'s machine.',
    petaFitur(),
    barisWorkspace(),
    '',
    'THIS MESSAGE IS A QUESTION / CONVERSATION, NOT A TASK.',
    'Answer it yourself, directly and concisely, in the SAME language as the question. You may explain what the Experts team can do, how it works, or any technical question.',
    'Do NOT produce a plan, a task list, JSON, or talk about teammates being assigned work.',
    '',
    `USER MESSAGE: ${goal}`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Prompt sintesis                                                     */
/* ------------------------------------------------------------------ */

function promptSintesis(goal: string): string {
  return [
    'You are the LEAD AGENT of an expert team inside Zephyr. Your workers finished the plan; now you write the FINAL answer to the user.',
    barisWorkspace(),
    '',
    `USER GOAL: ${goal}`,
    '',
    "Below is every task with its worker, status, files involved, and the worker's own report. Write the final answer IN THE SAME LANGUAGE AS THE GOAL:",
    '- Lead with what was accomplished, not with process talk.',
    '- One short section per task (worker name + what it did). Name files changed with paths.',
    '- Report verification evidence honestly: a task with no successful tool step is UNPROVEN — say so instead of claiming success.',
    '- If some task failed or was refused (write permission), say exactly what remains and how the user can finish it.',
    '- Keep it compact: no JSON, no internal jargon (no "verdict", no task ids).',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

interface ExpertsState {
  runs: EkspertRun[];
  /** True kalau ada run yang sedang menyusun rencana atau mengeksekusi. */
  sedangJalan: () => boolean;
  /**
   * Buka run 'menyusun' SEKETIKA (kartu rencana langsung nempel di chat,
   * tutup gap "thinking") lalu proses Lead di latar: pertanyaan dijawab
   * langsung sebagai bubble chat biasa, tugas menjadi kartu rencana yang
   * MENUNGGU konfirmasi (auto-run hanya bila opsi di Experts Settings aktif).
   * Mengembalikan runId, atau '' kalau ditolak guard (toast dikirim).
   */
  buka: (o: {
    sessionId: string;
    goal: string;
    /** Ringkasan obrolan terakhir sebagai konteks Lead (obrolan & rencana). */
    riwayat?: string;
  }) => string;
  /** Babak 2: eksekusi rencana yang sudah dikonfirmasi user, lalu sintesis. */
  setujui: (runId: string) => Promise<void>;
  /**
   * Review/adjust: ganti daftar tugas sebelum tim jalan. Dipakai gerbang
   * rencana (edit judul/brief/ahli, hapus tugas, tambah tugas).
   */
  ubahTugas: (runId: string, tugas: TugasAhli[]) => void;
  /** Buang rencana yang belum dikonfirmasi — tidak ada worker yang dijalankan. */
  tolak: (runId: string) => void;
  /**
   * Steering saat run berjalan: teruskan arahan ke worker yang BELUM mulai dan
   * ke sintesis akhir. Worker yang sudah di tengah langkah tidak bisa diubah;
   * jumlah yang benar-benar menerima arahan dikembalikan apa adanya.
   */
  steer: (runId: string, teks: string) => number;
  /**
   * Buang satu arahan dari daftar steer ("Message queued N" di composer).
   * Hanya menghapus catatan: worker yang SUDAH menerima arahan ini lewat
   * prompt-nya tidak bisa ditarik kembali — itu dinyatakan apa adanya.
   */
  hapusSteer: (runId: string, indeks: number) => void;
  /** Hentikan run yang sedang jalan (worker di-batalSemua). */
  batal: (runId: string) => void;
  muatTersimpan: () => void;
}

export const useExperts = create<ExpertsState>((set, get) => ({
  runs: [],

  sedangJalan: () => get().runs.some((r) => RUN_JALAN.includes(r.status)),

  buka: ({ sessionId, goal, riwayat }) => {
    const ai = useAi.getState();
    if (!ai.hasKey()) {
      ai.setToast('Tambahkan API key di AI Models dulu — Lead Agent butuh model');
      return '';
    }
    /*
     * Bug 9: rencana yang MENUNGGU user ('rencana') bukan pekerjaan yang
     * berjalan — kartunya bisa di-Start/Discard kapan saja, dan mengunci SEMUA
     * chat karena itu berarti menuduh "sedang berjalan" padahal tidak. Yang
     * tetap menolak goal baru: run yang benar-benar mengeksekusi ('jalan')
     * atau Lead yang masih menyusun ('menyusun').
     */
    if (get().runs.some((r) => r.status === 'jalan' || r.status === 'menyusun')) {
      ai.setToast('Masih ada run Experts yang berjalan — hentikan dulu sebelum memberi tugas baru');
      return '';
    }

    const id = `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const run: EkspertRun = {
      id,
      sessionId,
      goal,
      status: 'menyusun',
      intro: '',
      tugas: [],
      error: null,
      mulai: Date.now(),
      selesai: null,
    };
    set((s) => ({ runs: [run, ...s.runs].slice(0, 20) }));
    // Lead diproses di latar — kartu 'menyusun' sudah tampil di chat sekarang.
    void prosesLead(id, { goal, riwayat });
    return id;
  },

  setujui: async (runId) => {
    const run = get().runs.find((r) => r.id === runId);
    if (!run || run.status !== 'rencana') return;
    if (run.tugas.length === 0) {
      useAi.getState().setToast('Rencana kosong — tidak ada yang bisa dijalankan');
      return;
    }
    if (useSubAgent.getState().sibuk) {
      useAi.getState().setToast('Subagent lain masih sibuk — tunggu batch itu selesai dulu');
      return;
    }
    const cfg = bacaCfgAhli();

    /* Teks langkah BERSIH per tugas. Urutan penyusunan barisnya penting:
       `@peran` di PALING AWAL (dibaca peranDariPrefix), teks tugas di tengah
       (jadi `tugas` baris subagent persis sama — dipakai memetakan agentId),
       dan tag `[model:p/id]` di UJUNG (modelDariPrefix mencarinya di mana
       pun, sedangkan pisahCustom hanya melahap `[...]` di awal baris). */
    const teksKeId = new Map<string, string>();
    const barisTugas = (t: TugasAhli): string => {
      const def = AHLI_BY_ID.get(t.ahli) ?? AHLI_BY_ID.get('fullstack')!;
      const cfgA = t.customId ? undefined : cfg[t.ahli];
      /*
       * Skills ditempel ke BRIEF, bukan ke prompt sistem: worker hanya melihat
       * teks tugasnya sendiri, dan `skill_view` adalah tool yang selalu dikirim.
       * Nama dikutip supaya skill dengan spasi tetap terbaca sebagai satu nama.
       */
      const skillNote = cfgA?.skills?.length
        ? ` Skills to read first: ${cfgA.skills.map((s) => `"${s}"`).join(', ')}. Call skill_view("<name>") for each before working.`
        : '';
      const catatan = cfgA?.instruksi?.trim() ? ` Note: ${cfgA.instruksi.trim()}` : '';
      /*
       * RULES ditempel sebagai syarat, bukan saran: penanda "MUST" membuat
       * model memperlakukannya sebagai batasan keras, dan penomoran menjaga
       * aturan tetap terbaca satu per satu alih-alih menyatu jadi paragraf.
       */
      const aturan =
        cfgA?.rules?.length
          ? ` RULES (must follow, no exceptions): ${cfgA.rules
              .map((r, i) => `${i + 1}) ${r}`)
              .join(' ')}`
          : '';
      const berkas = t.berkas.length ? ` Files involved: ${t.berkas.join(', ')}.` : '';
      const bersih = rapikanTeks(`${t.judul}. ${t.deskripsi}${berkas}${skillNote}${catatan}${aturan}`);
      teksKeId.set(bersih, t.id);
      /*
       * Pin model TANPA provider (Bug 6): UI menjanjikan "empty = session
       * provider", tapi tag dulu hanya keluar kalau DUA-DUANYA diisi —
       * konfigurasi paling wajar (isi model saja) diam-diam jadi no-op.
       *   - id ada di katalog   → provider resminya dipakai, supaya model
       *     OpenAI tidak dikirim ke provider sesi yang tidak melayaninya;
       *   - id di luar katalog  → provider SESI: id gateway kustom tidak
       *     mungkin ada di katalog, dan gateway user biasanya justru provider
       *     yang sedang aktif.
       */
      const modelTag = (() => {
        if (!cfgA?.model) return '';
        if (cfgA.model === 'auto') return ' [model:auto]';
        if (cfgA.provider) return ` [model:${cfgA.provider}/${cfgA.model}]`;
        const katalog = MODEL_BY_ID.get(cfgA.model);
        return ` [model:${katalog ? katalog.provider : useAi.getState().provider}/${cfgA.model}]`;
      })();
      /*
       * Tag MCP di paling ujung. `mcpDariTeks` di subagentStore memotongnya
       * lalu meneruskannya ke `agentToolSpecs({ mcp })`, jadi worker ini hanya
       * ditawari tool dari server yang dicentang pembaca.
       */
      const mcpTag = cfgA?.mcp?.length ? ` [mcp:${cfgA.mcp.join(',')}]` : '';
      /*
       * Effort per ahli. Ditaruh SETELAH mcp karena `mcpDariTeks` memotong
       * tag-nya sendiri lalu sisanya diteruskan; `effortDariTeks` membaca
       * tag ini dari sisa yang sama. Kosong = ikut chip Reasoning global.
       */
      const effortTag = cfgA?.effort ? ` [effort:${cfgA.effort}]` : '';
      const awalan = t.customNama ? `[${t.customNama}]` : `@${def.peran}`;
      /*
       * Token `[#tN]` di PALING UJUNG (Bug 5): identitas tugas untuk pemetaan
       * agentId. Dua tugas dengan brief identik dulu saling menimpa peta teks
       * (`teksKeId` last-writer-wins) sehingga tugas pertama tidak pernah
       * kebagian agentId — "Pending" selamanya tanpa error apa pun. Token
       * dicopot `buatAgent` sebelum worker melihat teksnya, disimpan di baris
       * sebagai `tokenTugas`, dan pemetaan memakainya sebagai kunci utama.
       */
      return `${awalan} ${bersih}${modelTag}${mcpTag}${effortTag} [#${t.id}]`;
    };

    /* Kedalaman dependensi: akar = 0; anak = induk + 1. Gelombang `jalankan`
       menjamin posisi w selesai dulu sebelum w+1, jadi tugas di posisi
       kedalamannya PASTI berjalan setelah induknya — walau rantainya beda. */
    const byId = new Map(run.tugas.map((t) => [t.id, t] as const));
    const kedalaman = new Map<string, number>();
    const ukurDepth = (t: TugasAhli, jejak: Set<string>): number => {
      const ada = kedalaman.get(t.id);
      if (ada !== undefined) return ada;
      if (!t.setelah || !byId.has(t.setelah) || jejak.has(t.id)) {
        kedalaman.set(t.id, 0);
        return 0;
      }
      jejak.add(t.id);
      const d = ukurDepth(byId.get(t.setelah)!, jejak) + 1;
      kedalaman.set(t.id, d);
      return d;
    };
    for (const t of run.tugas) ukurDepth(t, new Set());

    const level = new Map<number, TugasAhli[]>();
    for (const t of run.tugas) {
      const d = kedalaman.get(t.id) ?? 0;
      const arr = level.get(d) ?? [];
      arr.push(t);
      level.set(d, arr);
    }
    const batas = Math.max(1, Math.min(8, useStore.getState().settings.subagent?.maxParallel ?? 4));
    const jumlahRantai = Math.max(1, Math.min(batas, level.get(0)?.length ?? 1));
    /*
     * Bug 3 (kedalaman vs posisi): dulu rantai diisi "terpendek menang" TANPA
     * melihat kedalaman slotnya — contoh nyata A,B (akar), C setelah A, D
     * setelah C menghasilkan rantai0=[A,C], rantai1=[B,D], jadi D jalan
     * SERENTAK dengan induknya C dan komentar "PASTI berjalan setelah induknya"
     * itu bohong. Sekarang tugas ditempatkan di POSISI = KEDALAMAN: rantai
     * diberi celah `null` (dilewati pembangun gelombang di `jalankan`) sampai
     * panjangnya = kedalaman tugas, baru tugasnya masuk. Beban merata tetap
     * dihitung dari jumlah tugas NYATA per rantai (`isiRantai`).
     */
    const rantai: (TugasAhli | null)[][] = Array.from({ length: jumlahRantai }, () => []);
    const isiRantai = Array.from({ length: jumlahRantai }, () => 0);
    const tingkatMaks = Math.max(...level.keys());
    for (let d = 0; d <= tingkatMaks; d++) {
      for (const t of level.get(d) ?? []) {
        let pilih = 0;
        for (let k = 1; k < jumlahRantai; k++) {
          if (isiRantai[k] < isiRantai[pilih]) pilih = k;
        }
        while (rantai[pilih].length < d) rantai[pilih].push(null);
        rantai[pilih].push(t);
        isiRantai[pilih] += 1;
      }
    }
    /*
     * Bug 4 (brief berisi `->`): rantai TIDAK lagi di-encode sebagai teks
     * `a -> b -> c` — tiap rantai dikirim sebagai array langkah, jadi `->`
     * di dalam deskripsi tugas tidak mungkin salah dibaca pemisah rantai dan
     * tidak ada lagi worker hantu dengan brief terpotong + tugas "Pending"
     * karena teksKeId tidak cocok.
     */
    const baris = rantai
      .filter((r) => r.length > 0)
      .map((r) => r.map((t) => (t ? barisTugas(t) : '')));
    if (baris.length === 0) return;

    const delegasiId = `experts-${runId}`;
    set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, status: 'jalan', error: null } : r)) }));
    simpanRuns(get().runs);

    try {
      const janji = useSubAgent.getState().jalankan(baris, {
        delegasiId,
        batasOverride: 8,
        langkahOverride: 40,
      });
      /*
       * Baris agent dibuat SINKRON di awal `jalankan` (sebelum await gelombang
       * pertama), jadi begitu janji ada, peta tugas -> agentId bisa diisi.
       * Ini yang membuat kartu task & tab "Task N" hidup sejak detik pertama.
       */
      const rows = useSubAgent.getState().agents.filter((a) => a.delegasiId === delegasiId);
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === runId
            ? {
                ...r,
                tugas: r.tugas.map((t) => {
                  /* Kunci utama = token [#tN] (unik per tugas); teks brief
                     hanya cadangan untuk baris lama yang belum bertoken. */
                  const row =
                    rows.find((a) => a.tokenTugas === t.id) ??
                    rows.find((a) => teksKeId.get(a.tugas) === t.id);
                  return row ? { ...t, agentId: row.id } : t;
                }),
              }
            : r,
        ),
      }));
      simpanRuns(get().runs);

      await janji;

      /*
       * B1: Stop harus TETAP berhenti. `batal()` hanya menandai status — janji
       * `jalankan` tetap resolve normal, dan tanpa guard ini snapshot tetap
       * dijalankan, sintesis tetap menulis jawaban akhir ke chat, lalu blok
       * penutup MENIMPA status 'batal' jadi 'selesai'/'gagal': kartu sempat
       * "Cancelled" lalu berubah "Completed", dan status salahnya ikut
       * tersimpan sehingga setelah reload run tampak selesai.
       */
      if (get().runs.find((r) => r.id === runId)?.status === 'batal') return;

      /* Snapshot akhir per tugas (bertahan reload), lalu babak 3: sintesis. */
      const akhir = useSubAgent.getState().agents.filter((a) => a.delegasiId === delegasiId);
      const snapshot = new Map(
        akhir.map((a) => [
          a.id,
          {
            status: a.status,
            hasil: a.hasil || a.error || '',
            nTool: a.nTool,
            nCari: jumlahLangkahCari(a.langkah),
            files: a.fileDitulis,
            verdict: a.verdict,
            tulisDitolak: a.tulisDitolak ?? 0,
            inputTokens: a.inputTokens,
            outputTokens: a.outputTokens,
            costUsd: a.costUsd,
          },
        ]),
      );
      /*
       * Run hanya boleh disebut selesai kalau ADA tugas dengan bukti. Dulu
       * syaratnya sekadar satu status worker 'selesai', jadi tiga tugas kosong
       * yang tidak memanggil tool sama sekali tetap tampil "Completed 3/3".
       */
      let adaTerbukti = false;
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === runId
            ? {
                ...r,
                tugas: r.tugas.map((t) => {
                  const snap = t.agentId ? snapshot.get(t.agentId) : undefined;
                  if (!snap) return t;
                  const buktian = buktiCukup(t, snap);
                  if (buktian) adaTerbukti = true;
                  return {
                    ...t,
                    statusAkhir: snap.status,
                    hasil: snap.hasil,
                    nTool: snap.nTool,
                    nCari: snap.nCari,
                    berkasTulis: snap.files,
                    verdictAkhir: snap.verdict,
                    inputTokens: snap.inputTokens,
                    outputTokens: snap.outputTokens,
                    costUsd: snap.costUsd,
                    buktian,
                  };
                }),
              }
            : r,
        ),
      }));
      simpanRuns(get().runs);
      await sintesis(runId);
      /* B1: batal di tengah snapshot/sintesis tetap berhenti di sini. */
      if (get().runs.find((r) => r.id === runId)?.status === 'batal') return;
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === runId
            ? {
                ...r,
                status: adaTerbukti ? 'selesai' : 'gagal',
                error:
                  adaTerbukti || r.error
                    ? r.error
                    : 'Tidak ada tugas yang meninggalkan bukti tool yang sah — laporannya kosong, cuma janji, atau tanpa satu pun langkah tool yang berhasil.',
                selesai: Date.now(),
              }
            : r,
        ),
      }));
      simpanRuns(get().runs);
    } catch (e) {
      /* B1: kegagalan setelah Stop tidak boleh menimpa status 'batal'. */
      if (get().runs.find((r) => r.id === runId)?.status === 'batal') return;
      const pesan = cmd.asZephyrError(e).message;
      set((s) => ({
        runs: s.runs.map((r) =>
          r.id === runId ? { ...r, status: 'gagal', error: pesan, selesai: Date.now() } : r,
        ),
      }));
      simpanRuns(get().runs);
    }
  },

  ubahTugas: (runId, tugas) => {
    const run = get().runs.find((r) => r.id === runId);
    if (!run || run.status !== 'rencana') return;
    const bersih = tugas
      .filter((t) => t.judul.trim() && t.deskripsi.trim())
      .map((t, i) => ({ ...t, id: t.id || `t${i + 1}`, judul: rapikanTeks(t.judul), deskripsi: rapikanTeks(t.deskripsi) }));
    if (bersih.length === 0) {
      useAi.getState().setToast('Rencana harus punya minimal satu tugas');
      return;
    }
    /* Dependensi yang menunjuk tugas yang dihapus menjadi paralel, bukan
       menggantung ke id yang tidak ada (worker-nya tidak akan pernah jalan). */
    const ids = new Set(bersih.map((t) => t.id));
    const adaId = bersih.map((t) => ({ ...t, setelah: t.setelah && ids.has(t.setelah) ? t.setelah : null }));
    /* Rantai harus lurus. Membuat A menunggu B saat B menunggu A tidak "salah
       urutan" — ia membuat `ukurDepth` berputar dan gelombang tidak pernah
       mulai, jadi siklus diputus di sini, bukan dipercaya ke pemanggil. */
    const peta = new Map(adaId.map((t) => [t.id, t] as const));
    const rapi = adaId.map((t) => {
      const jejak = new Set<string>([t.id]);
      let induk = t.setelah;
      while (induk) {
        if (jejak.has(induk)) return { ...t, setelah: null };
        jejak.add(induk);
        induk = peta.get(induk)?.setelah ?? null;
      }
      return t;
    });
    set((s) => ({ runs: s.runs.map((r) => (r.id === runId ? { ...r, tugas: rapi } : r)) }));
    simpanRuns(get().runs);
  },

  tolak: (runId) => {
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId && r.status === 'rencana'
          ? {
              ...r,
              status: 'batal',
              /*
               * Tugas dibuang, bukan disimpan sebagai "Pending": rencana yang
               * dibatalkan belum pernah punya worker, jadi menampilkannya di
               * timeline atau Task Progress akan mengaku ada pekerjaan yang
               * sebenarnya tidak pernah dimulai.
               */
              tugas: [],
              error: 'Dibatalkan sebelum dijalankan',
              selesai: Date.now(),
            }
          : r,
      ),
    }));
    simpanRuns(get().runs);
  },

  steer: (runId, teks) => {
    const bersih = rapikanTeks(teks);
    if (!bersih) return 0;
    const run = get().runs.find((r) => r.id === runId);
    if (!run || run.status !== 'jalan') return 0;
    /*
     * Worker gelombang berikutnya belum membangun prompt/history-nya, jadi
     * brief mereka masih bisa ditambah arahan ini. Worker yang sudah berjalan
     * tidak diinterupsi — mengubah tugasnya di tengah langkah akan membuat
     * laporannya tidak lagi cocok dengan pekerjaan yang benar-benar dilakukan.
     */
    const delegasiId = `experts-${runId}`;
    let terkena = 0;
    useSubAgent.setState((s) => ({
      agents: s.agents.map((a) => {
        if (a.delegasiId !== delegasiId || a.status !== 'menunggu') return a;
        terkena += 1;
        return { ...a, tugas: `${a.tugas}\nSteering note from the user: ${bersih}` };
      }),
    }));
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId ? { ...r, steer: [...(r.steer ?? []), bersih] } : r,
      ),
    }));
    simpanRuns(get().runs);
    useAi
      .getState()
      .setToast(
        terkena > 0
          ? `Arahan diteruskan ke ${terkena} tugas yang belum mulai`
          : 'Arahan disimpan untuk laporan akhir — worker yang sudah berjalan tidak bisa diubah',
      );
    return terkena;
  },

  hapusSteer: (runId, indeks) => {
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId
          ? { ...r, steer: (r.steer ?? []).filter((_, i) => i !== indeks) }
          : r,
      ),
    }));
    simpanRuns(get().runs);
  },

  batal: (runId) => {
    /* Ber-scope ke delegasi run ini: dulu `batalSemua()` GLOBAL — membunuh
       batch subagent mana pun yang kebetulan hidup, dan di jendela sintesis
       (worker sudah selesai) tidak membunuh apa pun tapi tetap menimpa status.
       Guard 'batal' di `setujui` menutup sisanya. */
    useSubAgent.getState().batalDelegasi(`experts-${runId}`);
    set((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId && RUN_JALAN.includes(r.status) ? { ...r, status: 'batal', selesai: Date.now() } : r,
      ),
    }));
    simpanRuns(get().runs);
  },

  muatTersimpan: () => {
    if (get().runs.length > 0) return;
    try {
      const raw = localStorage.getItem(KUNCI_RUNS);
      if (!raw) return;
      const parsed = JSON.parse(raw) as EkspertRun[];
      if (!Array.isArray(parsed)) return;
      // Run yang tertangkap di tengah jalan tidak punya proses hidup lagi:
      // tandai gagal, sama seperti yang dilakukan mesin subagent.
      /*
       * Rencana yang pesannya sudah tidak ada di sesi mana pun = yatim. Kalau
       * dibiarkan, ia adalah kartu yang tidak pernah bisa dibuka lagi (pesan
       * pembawanya hilang) dan menggantung di setiap daftar run untuk selamanya.
       *
       * Hanya berlaku kalau sesi SUDAH termuat: saat pemulihan berjalan sebelum
       * sesi tiba, daftar kosong bukan bukti pesannya hilang — menyebut rencana
       * itu yatim berarti membuang rencana yang justru belum dijalankan.
       */
      const sesi = useAi.getState().sessions;
      const yatim = (r: EkspertRun) =>
        r.status === 'rencana' &&
        sesi.length > 0 &&
        !sesi.some((s) => s.id === r.sessionId && s.messages.some((m) => m.id === r.pesanId));
      /*
       * Risiko 11: SATU entri rusak dulu membuat selector di render melempar
       * error (r.tugas.length pada elemen tanpa tugas) dan SELURUH panel
       * crash. Validasi per elemen + normalisasi per tugas, pola yang sama
       * dengan `loadSessions` di aiStore: yang tidak bisa dipercaya dibuang,
       * yang masih bisa diselamatkan diberi nilai bawaan yang aman.
       */
      const sahRun = (r: unknown): r is EkspertRun => {
        if (!r || typeof r !== 'object') return false;
        const o = r as Partial<EkspertRun>;
        return (
          typeof o.id === 'string' &&
          typeof o.status === 'string' &&
          typeof o.sessionId === 'string' &&
          Array.isArray(o.tugas)
        );
      };
      const sahTugas = (t: unknown): TugasAhli => {
        const o = (t && typeof t === 'object' ? t : {}) as Partial<TugasAhli>;
        return {
          ...(o as TugasAhli),
          id: typeof o.id === 'string' && o.id ? o.id : 't?',
          judul: typeof o.judul === 'string' ? o.judul : '(tugas rusak)',
          deskripsi: typeof o.deskripsi === 'string' ? o.deskripsi : '',
          ahli: (typeof o.ahli === 'string' && o.ahli ? o.ahli : 'fullstack') as AhliId,
          nama: typeof o.nama === 'string' ? o.nama : '',
          berkas: Array.isArray(o.berkas) ? o.berkas.filter((b) => typeof b === 'string') : [],
          setelah: typeof o.setelah === 'string' ? o.setelah : null,
          agentId: typeof o.agentId === 'string' ? o.agentId : null,
        };
      };
      const runs = parsed
        .filter(sahRun)
        .filter((r) => !yatim(r))
        .slice(0, 20)
        .map((r) => ({
          ...r,
          tugas: r.tugas.filter((t) => !!t && typeof t === 'object').map(sahTugas),
        })
        )
        .map((r) =>
          /*
           * `rencana` adalah gerbang yang MENUNGGU user, bukan proses hidup
           * yang terputus. Menandainya gagal saat reload akan membuang rencana
           * yang justru sengaja belum dijalankan.
           */
          RUN_JALAN.includes(r.status) && r.status !== 'rencana'
            ? {
                ...r,
                status: 'gagal' as RunStatus,
                error: r.error ?? 'terputus oleh restart',
                selesai: r.selesai ?? Date.now(),
              }
            : r,
        );
      set({ runs });
    } catch {
      /* data rusak: mulai bersih */
    }
  },
}));

/* ------------------------------------------------------------------ */
/* Sintesis + persistensi                                              */
/* ------------------------------------------------------------------ */

async function sintesis(runId: string): Promise<void> {
  const run = useExperts.getState().runs.find((r) => r.id === runId);
  if (!run) return;
  /*
   * B1: sintesis adalah JAWABAN AKHIR untuk run yang benar-benar selesai
   * mengerjakan. Run yang dibatalkan tidak boleh menghasilkan ringkasan
   * pekerjaan yang sudah dihentikan — guard ini yang dulu tidak ada, jadi
   * jawaban sintesis tetap masuk chat setelah user menekan Stop.
   */
  if (run.status !== 'jalan') return;
  const ai = useAi.getState();
  try {
    const cfg = bacaCfgAhli();
    const steer = run.steer?.length
      ? `\n\nUSER STEERING SENT WHILE THE TEAM WAS RUNNING (honour it in the answer):\n${run.steer.map((s) => `- ${s}`).join('\n')}`
      : '';
    const laporan = run.tugas
      .map((t) => {
        /* Bukti ditulis eksplisit: Lead tidak boleh menyimpulkan "selesai" dari
           status worker kalau worker itu tidak meninggalkan bukti tool. */
        const status =
          t.buktian === false
            ? `${t.statusAkhir ?? 'selesai'} TANPA BUKTI (no successful tool step)`
            : (t.statusAkhir ?? 'menunggu');
        const files = t.berkas.length ? `\nFiles: ${t.berkas.join(', ')}` : '';
        const tools = t.nTool !== undefined ? `, ${t.nTool} tool steps` : '';
        return `- [${t.nama}] ${t.judul} — ${status}${tools}${files}\nReport: ${(t.hasil || '(no report)').slice(0, 1200)}`;
      })
      .join('\n\n');
    const provider = cfg.lead.provider || ai.provider;
    const model = cfg.lead.model || ai.model;
    /* baseUrl/fullUrl wajib — alasan sama dengan panggilan Lead di `susun`. */
    const provCfg = useStore.getState().settings.models.providers[provider] ?? {};
    const res = await cmd.aiToolChat({
      provider,
      model,
      baseUrl: (provCfg as { baseUrl?: string }).baseUrl || undefined,
      fullUrl: fullUrlProvider(provider),
      messages: [
        { role: 'system', content: promptSintesis(run.goal) },
        { role: 'user', content: `${laporan}${steer}` },
      ] as never,
      tools: [],
      maxTokens: 2048,
    });
    const isi = (res.content ?? '').trim();
    if (isi) {
      useAi.getState().tambahPesanSesi(run.sessionId, {
        role: 'assistant',
        content: isi,
        model,
      });
    }
  } catch {
    /* sintesis gagal: kartu task & snapshot tugas tetap menunjukkan hasilnya;
       jangan timbulkan error baru di atas kegagalan worker */
  }
}

/*
 * Risiko 12: payload run tidak dibatasi dulu — laporan worker penuh (bisa
 * puluhan KB per tugas) × 20 run dengan mudah melewati kuota localStorage,
 * dan QuotaExceededError dulu ditelan senyap sehingga memori bilang "selesai"
 * sementara disk masih menyimpan snapshot 'jalan' lama yang akan dibaca
 * sebagai "terputus oleh restart" saat reload. Laporan dipotong saat disimpan
 * (UI membaca snapshot penuh dari memori selama sesi hidup), dan kegagalan
 * kuota diberitahukan SEKALI, bukan didiamkan.
 */
const BATAK_HASIL_SIMPAN = 2000;
let sudahPeringatanKuota = false;

function simpanRuns(runs: EkspertRun[]): void {
  const ringkas = runs.slice(0, 20).map((r) => ({
    ...r,
    steer: r.steer?.map((s) => s.slice(0, 500)).slice(0, 20),
    tugas: r.tugas.map((t) => ({
      ...t,
      hasil: t.hasil ? t.hasil.slice(0, BATAK_HASIL_SIMPAN) : t.hasil,
      ...(t.hasil && t.hasil.length > BATAK_HASIL_SIMPAN ? { hasilPendek: true } : {}),
      berkasTulis: t.berkasTulis?.slice(0, 50),
    })),
  }));
  try {
    localStorage.setItem(KUNCI_RUNS, JSON.stringify(ringkas));
  } catch (e) {
    console.warn('simpanRuns: localStorage penuh — riwayat run tidak tersimpan', e);
    if (!sudahPeringatanKuota) {
      sudahPeringatanKuota = true;
      useAi.getState().setToast('Penyimpanan penuh — riwayat run Experts tidak ikut tersimpan');
    }
  }
}

/*
 * Pulihkan run tersimpan sekali setelah seluruh modul selesai dievaluasi.
 *
 * Dulu panggilan ini berdiri langsung di sini, dan tidak pernah berhasil:
 * `aiStore` mengimpor `useExperts` (siklus impor), jadi saat modul ini
 * dievaluasi `useAi` belum tentu terinisialisasi. `muatTersimpan()` lalu
 * melempar TypeError di `useAi.getState()`, lemparan itu ditelan `catch`
 * validator, dan SELURUH riwayat run hilang setiap restart — tanpa satu pesan.
 * Microtask berjalan setelah evaluasi modul tuntas, jadi binding-nya sudah ada.
 */
queueMicrotask(() => useExperts.getState().muatTersimpan());

/* ------------------------------------------------------------------ */
/* Proses Lead di latar: CHAT (pesan rencana berubah jadi jawaban)     */
/* atau TUGAS (run berhenti di gerbang; auto-run = opsi Settings).     */
/* ------------------------------------------------------------------ */

/** Ubah satu pesan di sesi (dipakai mengubah pesan rencana jadi jawaban). */
function ubahPesanRun(
  sessionId: string,
  pesanId: string,
  sebagian: {
    content?: string;
    expertsPlan?: string | undefined;
    streaming?: boolean;
    error?: string | undefined;
    model?: string;
  },
): void {
  useAi.setState((s) => ({
    sessions: s.sessions.map((x) =>
      x.id === sessionId
        ? { ...x, messages: x.messages.map((m) => (m.id === pesanId ? { ...m, ...sebagian } : m)) }
        : x,
    ),
  }));
}

/**
 * Tutup run sebagai JAWABAN CHAT: pesan rencana berubah jadi jawaban biasa,
 * run dibuang. Dipakai semua jalur non-tugas supaya tidak ada salinan logika
 * yang bisa berbeda diam-diam.
 */
function jawabLangsung(
  runId: string,
  sessionId: string,
  pesanId: string | undefined,
  jawab: string,
  model: string,
): void {
  if (pesanId) {
    ubahPesanRun(sessionId, pesanId, {
      content: jawab,
      expertsPlan: undefined,
      streaming: false,
      error: undefined,
      model,
    });
  }
  useExperts.setState((s) => ({ runs: s.runs.filter((r) => r.id !== runId) }));
  simpanRuns(useExperts.getState().runs);
}

async function prosesLead(
  runId: string,
  o: { goal: string; riwayat?: string },
): Promise<void> {
  const awal = useExperts.getState().runs.find((r) => r.id === runId);
  if (!awal) return;
  /*
   * `pesanId` diisi `sendExperts` SETELAH `buka()` kembali, sedangkan proses
   * ini sudah mulai lebih dulu. Membaca salinan `awal` membuat id pesan selalu
   * undefined, sehingga jawaban chat tidak pernah menggantikan placeholder dan
   * kartu rencana kosong tertinggal. Selalu baca ulang dari store.
   */
  const pesanSekarang = () =>
    useExperts.getState().runs.find((r) => r.id === runId)?.pesanId;
  const ai = useAi.getState();
  try {
    const cfg = bacaCfgAhli();
    const kustom = customAktif();
    /*
     * Worker kustom pembaca ikut roster Experts — dokumen Qoder membolehkan
     * Lead memanggil sub-agent buatan user. Id-nya diberi awalan `kustom:`
     * supaya tidak pernah bertabrakan dengan id ahli bawaan.
     */
    const roster: KandidatTim[] = [
      ...AHLI.filter((a) => a.id === 'lead' || cfg[a.id]?.aktif !== false)
        .filter((a) => a.id !== 'lead')
        .map((a) => ({
          id: a.id,
          label: a.label,
          deskripsi: a.deskripsi,
          butuhTulis: a.butuhTulis,
        })),
      ...kustom.map((c) => ({
        id: `kustom:${c.id}`,
        label: `${c.nama} (custom worker)`,
        deskripsi: c.deskripsi || c.prompt.slice(0, 120),
        butuhTulis: c.alat.includes('multi_edit'),
      })),
    ];
    const TUGAS_MAKS = 6;
    const provider = cfg.lead.provider || ai.provider;
    const model = cfg.lead.model || ai.model;
    /* baseUrl WAJIB ikut: provider kustom sah di gateway SENDIRI — tanpa ini
       request Lead mendarat di endpoint default dan ditolak 401. */
    const leadProvCfg = useStore.getState().settings.models.providers[provider] ?? {};
    /*
     * Guard PERTANYAAN: chat murni dijawab dengan prompt balasan langsung,
     * bukan prompt rencana. Tanpa ini, model bisa mengarang 3 tugas kosong
     * untuk sekadar menjelaskan kemampuannya — lalu scheduler menjalankannya.
     */
    const tanya = pesanTanya(o.goal);
    const res = await cmd.aiToolChat({
      provider,
      model,
      baseUrl: (leadProvCfg as { baseUrl?: string }).baseUrl || undefined,
      fullUrl: fullUrlProvider(provider),
      messages: [
        {
          role: 'system',
          content: tanya ? promptJawab(o.goal) : promptLead(o.goal, roster, TUGAS_MAKS),
        },
        {
          role: 'user',
          content: o.riwayat
            ? `CONVERSATION SO FAR:\n${o.riwayat}\n\nMESSAGE: ${o.goal}`
            : o.goal,
        },
      ] as never,
      tools: [],
      maxTokens: 4096,
    });
    const keluaran = res.content ?? '';

    /*
     * B1 (jalur 'menyusun'): Stop saat Lead masih berpikir dulu tidak punya
     * efek berarti — proses ini melanjutkan, menulis kartu rencana, dan
     * (dengan auto-run) MENJALANKANNYA, membatalkan Stop yang barusan ditekan.
     * Begitu Lead kembali, status 'batal' menghentikan semuanya di sini dan
     * placeholder thinking ditutup sebagai "(dibatalkan)".
     */
    if (useExperts.getState().runs.find((r) => r.id === runId)?.status === 'batal') {
      const pesanStop = pesanSekarang();
      if (pesanStop) {
        ubahPesanRun(awal.sessionId, pesanStop, {
          content: '(dibatalkan)',
          streaming: false,
          expertsPlan: undefined,
          error: undefined,
        });
      }
      return;
    }

    if (tanya) {
      let jawab = teksJawaban(keluaran);
      /* Satu percobaan ulang, bukan error merah: model kadang membalas kosong
         untuk pertanyaan singkat. Kalau tetap kosong, balas sebagai bubble
         biasa supaya chat tidak terlihat rusak. */
      if (!jawab) {
        const res2 = await cmd.aiToolChat({
          provider,
          model,
          baseUrl: (leadProvCfg as { baseUrl?: string }).baseUrl || undefined,
          fullUrl: fullUrlProvider(provider),
          messages: [
            { role: 'system', content: promptJawab(o.goal) },
            { role: 'user', content: o.goal },
          ] as never,
          tools: [],
          maxTokens: 2048,
        });
        jawab = teksJawaban(res2.content ?? '');
      }
      jawabLangsung(
        runId,
        awal.sessionId,
        pesanSekarang(),
        jawab || 'Maaf, model belum mengembalikan jawaban. Coba kirim ulang pertanyaannya.',
        model,
      );
      return;
    }

    const parsed = parseRencana(keluaran, TUGAS_MAKS);

    /*
     * JSON tidak sah / semua tugas tidak nyambung: JANGAN buat run. Prosa yang
     * dikembalikan Lead (kalau ada) dipakai sebagai jawaban chat; JSON rusak
     * tidak pernah ditampilkan mentah. Run kosong = kuota terbakar tanpa hasil.
     */
    if (!parsed) {
      /*
       * Prosa murni = jawaban yang layak dipakai apa adanya. JSON (walau
       * isinya cuma intro / tasks kosong) BUKAN jawaban: meminta balasan
       * langsung sekali lagi jauh lebih benar daripada menampilkan "rencana
       * siap" sebagai jawaban chat — dan tetap tanpa satu pun worker.
       */
      let jawab = potongJson(keluaran) ? '' : keluaran.trim();
      if (!jawab) {
        const res2 = await cmd.aiToolChat({
          provider,
          model,
          baseUrl: (leadProvCfg as { baseUrl?: string }).baseUrl || undefined,
          fullUrl: fullUrlProvider(provider),
          messages: [
            { role: 'system', content: promptJawab(o.goal) },
            { role: 'user', content: o.goal },
          ] as never,
          tools: [],
          maxTokens: 2048,
        });
        jawab = teksJawaban(res2.content ?? '');
      }
      if (jawab) {
        jawabLangsung(runId, awal.sessionId, pesanSekarang(), jawab, model);
        return;
      }
      throw new Error('Lead tidak mengembalikan rencana atau jawaban yang bisa dibaca');
    }

    /* CHAT: pesan rencana BERUBAH jadi jawaban biasa, run dibuang. */
    if (parsed.jenis === 'chat') {
      jawabLangsung(runId, awal.sessionId, pesanSekarang(), parsed.jawab, model);
      return;
    }

    /* TUGAS: normalisasi persona + dependensi, lalu LANGSUNG eksekusi. */
    const hitung = new Map<AhliId, number>();
    const cariKustom = (id: string): (typeof kustom)[number] | undefined => {
      const kunci = id.trim().toLowerCase();
      return kustom.find((c) => `kustom:${c.id}`.toLowerCase() === kunci || c.nama.toLowerCase() === kunci);
    };
    const tugas: TugasAhli[] = parsed.mentah.map((t, i) => {
      const custom = cariKustom(t.ahli);
      if (custom) {
        /* Worker kustom: persona/model/tool datang dari definisinya; peran
           bawaan hanya jembatan untuk ikon + gerbang tulis. */
        const bisaTulis = custom.alat.includes('multi_edit');
        const jembatan = AHLI_BY_ID.get(bisaTulis ? 'fullstack' : 'researcher')!;
        return {
          id: `t${i + 1}`,
          judul: t.judul,
          deskripsi: t.deskripsi,
          ahli: jembatan.id,
          nama: custom.nama,
          berkas: t.berkas,
          setelah: null,
          agentId: null,
          customId: custom.id,
          customNama: custom.nama,
          customIkon: custom.ikon,
        };
      }
      const mentah = AHLI_BY_ID.get((t.ahli || '') as AhliId);
      const cfgA = mentah ? cfg[mentah.id] : undefined;
      const sah = !!mentah && mentah.id !== 'lead' && cfgA?.aktif !== false;
      const defFinal = sah ? mentah! : AHLI_BY_ID.get('fullstack')!;
      const urut = hitung.get(defFinal.id) ?? 0;
      hitung.set(defFinal.id, urut + 1);
      return {
        id: `t${i + 1}`,
        judul: t.judul,
        deskripsi: t.deskripsi,
        ahli: defFinal.id,
        nama: `${defFinal.label} ${defFinal.pool[urut % defFinal.pool.length]}`,
        berkas: t.berkas,
        setelah: null,
        agentId: null,
      };
    });
    for (let i = 0; i < tugas.length; i++) {
      const judulDepan = parsed.mentah[i].setelah;
      if (!judulDepan) continue;
      const target = tugas.find((t) => t.judul.toLowerCase() === judulDepan.toLowerCase());
      if (target && target.id !== tugas[i].id) tugas[i].setelah = target.id;
    }

    const intro = parsed.intro || 'Tim Experts bekerja.';
    useExperts.setState((s) => ({
      runs: s.runs.map((r) => (r.id === runId ? { ...r, status: 'rencana', intro, tugas } : r)),
    }));
    simpanRuns(useExperts.getState().runs);

    /*
     * Pesan placeholder yang tadi berputar sebagai "thinking" berubah menjadi
     * kartu rencana — bukan pesan baru. Selama Lead masih menyusun, pesannya
     * tampil seperti balasan Agent biasa (typing dots); kartu Experts baru ada
     * ketika memang ada pekerjaan untuk ditunjukkan.
     */
    const pesanRencana = pesanSekarang();
    if (pesanRencana) {
      ubahPesanRun(awal.sessionId, pesanRencana, {
        content: '',
        streaming: false,
        expertsPlan: runId,
        error: undefined,
        model,
      });
    }

    /*
     * Gerbang rencana (bawaan) vs auto-run (opsi). Dokumen Qoder menaruh
     * konfirmasi user di antara rencana dan eksekusi; auto-run tetap hidup
     * untuk pembaca yang memang menginginkannya lewat Experts Settings.
     */
    /*
     * Ala acuan, TANPA gerbang: Lead selesai menulis rencana, tim LANGSUNG
       jalan (Creating research task → Created N tasks → kartu muncul satu-satu).
       Toggle Auto-run + tombol Start/Edit/Discard dihapus — keputusan user:
       Qoder tidak punya persetujuan manual.
     */
    await useExperts.getState().setujui(runId);
  } catch (e) {
    /* B1: kegagalan setelah Stop tidak boleh menimpa status 'batal'. */
    if (useExperts.getState().runs.find((r) => r.id === runId)?.status === 'batal') return;
    const pesan = cmd.asZephyrError(e).message;
    /* Placeholder "thinking" harus berhenti berputar dan mengatakan alasannya;
       kalau tidak, pesan kosong berputar selamanya saat Lead gagal. */
    const pesanGagal = pesanSekarang();
    if (pesanGagal) {
      ubahPesanRun(awal.sessionId, pesanGagal, {
        content: pesan,
        streaming: false,
        expertsPlan: undefined,
        error: pesan,
      });
    }
    useExperts.setState((s) => ({
      runs: s.runs.map((r) =>
        r.id === runId ? { ...r, status: 'gagal', error: pesan, selesai: Date.now() } : r,
      ),
    }));
  }
}
