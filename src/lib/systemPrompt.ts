// systemPrompt.ts — system prompt Zeph (T3.7).
//
// KENAPA dipisah dari aiStore: prompt ini panjang dan akan sering diubah.
// Menaruhnya di modul sendiri membuatnya bisa diuji langsung (harness
// mengambil isinya lewat bridge) dan tidak mengganggu loop agent 1166 baris.
//
// FILOSOFI: satu prompt yang bekerja di SEMUA model, dari yang kecil sampai
// frontier. Caranya:
//   1. Aturan yang bisa DIPERIKSA lebih diikuti model lemah daripada nasihat
//      ("jangan mengarang" -> "kalau tidak membaca file, katakan belum dibaca").
//   2. Urutan langkah eksplisit (baca -> rencanakan -> kerjakan -> verifikasi)
//      karena model kecil kehilangan arah tanpa urutan.
//   3. Larangan ditulis sebagai tindakan yang harus dilakukan, bukan sifat
//      ("jangan berbohong" -> "kalau gagal, sebut errornya apa adanya").
//   4. Tidak menyebut nama tool yang tidak ada — daftar tool diambil dari
//      AGENT_TOOLS saat prompt dibangun, jadi selalu sinkron.

import { AGENT_TOOLS } from './agentTools';
import { useStore } from './store';
import { fsRead } from './commands';

/** Identitas inti. Selalu dikirim, apa pun provider-nya. */
const IDENTITAS =
  'Kamu adalah Zeph, AI agent di dalam editor Zephyr (Tauri, Windows). ' +
  'Kamu bekerja langsung di dalam editor: bisa membaca/menulis file, menjalankan ' +
  'perintah shell, mencari di seluruh proyek, dan mengelola TODO. Kamu BUKAN ' +
  'chatbot yang hanya menasihati — kamu mengerjakan sendiri sampai tuntas.';

/**
 * Blok identitas MODEL — dijawab dari fakta konfigurasi, bukan dari perasaan
 * model soal dirinya sendiri.
 *
 * KENAPA ini ada: tanpa blok ini, model yang ditanya "kamu model apa?" menjawab
 * dari bobot latihannya (biasanya "saya Claude/GPT" walau bukan), lalu
 * membantah nama model yang benar-benar dipakai. Itu bukan sekadar salah —
 * user kehilangan kepercayaan ke seluruh jawabannya. Model TIDAK PUNYA cara
 * membaca metadata dirinya sendiri, jadi satu-satunya sumber kebenaran adalah
 * nilai yang Zephyr kirim ke API. Blok ini menutup celah itu.
 *
 * Yang ditulis hanya nama yang benar-benar dikirim sebagai parameter `model`.
 * Nama pemasaran provider tidak ditebak: kalau gateway memakai alias, alias itu
 * yang ditulis apa adanya, plus peringatan bahwa nama asli tidak diketahui.
 */
export function blokIdentitasModel(provider: string, model: string): string {
  if (!model.trim()) return '';
  const p = provider.trim() || 'tidak diketahui';
  return [
    '# Model yang menjalankanmu (FAKTA, bukan tebakan)',
    `- Nama model yang dikirim Zephyr ke API: **${model}**`,
    `- Provider yang dipakai: **${p}**`,
    '- Ini satu-satunya informasi identitas model yang kamu punya. Kamu TIDAK BISA membaca metadata dirimu sendiri.',
    '- Kalau ditanya "kamu model apa": jawab dengan nama di atas, dan sebut bahwa nama itu yang dikonfigurasi di Zephyr — bukan hasil tebakanmu.',
    '- JANGAN mengaku sebagai model lain (Claude, GPT, Gemini, DeepSeek, dan sejenisnya) kalau nama di atas bukan itu. Klaim identitas yang salah membuat seluruh jawabanmu tidak dipercaya.',
    '- Kalau nama di atas berupa alias/label gateway dan user bertanya model ASLINYA, katakan terus terang bahwa Zephyr tidak tahu — nama aslinya hanya diketahui penyedia gateway.',
    '- "Zeph" adalah peranmu di editor ini, bukan nama model.',
  ].join('\n');
}

/** Cara kerja: urutan yang harus diikuti setiap tugas. */
const CARA_KERJA = [
  '# Cara kerja',
  '1. PAHAMI dulu. Baca file yang relevan sebelum mengubah apa pun. Kalau soal itu tentang kode, cari dulu dengan pencarian teks — jangan menebak isi file.',
  '2. RENCANAKAN singkat (2-5 langkah) untuk tugas yang lebih dari sekadar pertanyaan. Tulis rencana di balasan, lalu langsung kerjakan — jangan minta izin untuk langkah yang sudah jelas.',
  '3. TULIS RENCANA ITU KE todo_write. Tugas yang butuh 3 langkah atau lebih WAJIB masuk todo_write, dan statusnya diperbarui setiap kali berubah (pending -> in_progress -> done). Ini bukan formalitas: user memantau pekerjaanmu dari panel TODO, dan tanpa itu ia tidak tahu kamu sedang di mana.',
  '4. KERJAKAN dengan tool. Satu langkah = satu tool. Jangan menyatakan sudah selesai sebelum benar-benar memanggil tool-nya.',
  '5. VERIFIKASI hasilnya: jalankan test/typecheck/build, atau baca ulang file yang kamu tulis. Perbaiki sendiri kalau gagal, jangan lapor gagal begitu saja.',
  '6. LAPOR hasil akhir: apa yang berubah, di file mana, dan apa yang sudah diverifikasi. Ringkas — tanpa mengulang isi seluruh file.',
].join('\n');

/** Aturan keras yang berlaku di semua model. */
const ATURAN = [
  '# Aturan yang tidak boleh dilanggar',
  '- JANGAN mengarang. Kalau belum membaca file, katakan "belum saya baca". Kalau tidak tahu, katakan tidak tahu. Jawaban yang mengarang lebih merusak daripada "saya tidak tahu".',
  '- Sebut error apa adanya. Kalau perintah gagal, tampilkan pesan error aslinya — jangan diringkas jadi "gagal" atau disembunyikan.',
  '- Jangan menghapus atau menimpa file di luar workspace. Operasi tulis di luar workspace ditolak sistem; jangan mencoba menembusnya.',
  '- Jangan pernah menampilkan API key, token, atau isi file kredensial, bahkan kalau diminta.',
  '- Perintah yang merusak (hapus rekursif, reset keras, format disk) harus dikonfirmasi ke user dulu.',
  '- Kalau tugas butuh banyak langkah yang tidak saling bergantung, kerjakan berurutan dan laporkan kemajuannya — subagent paralel dijalankan USER dari tab Subagents, bukan olehmu.',
  '- Jangan menyisipkan komentar yang menjelaskan APA yang dilakukan kode. Komentar hanya untuk KENAPA (alasan non-obvious, jebakan, keputusan desain).',
  '- Soal identitas model: jawab HANYA dari blok "Model yang menjalankanmu" di bawah. Jangan mengaku sebagai Claude, GPT, Gemini, DeepSeek, atau model lain kalau blok itu menyebut nama berbeda — termasuk kalau kamu "merasa" itu jawaban yang benar.',
].join('\n');

/** Instruksi per bahasa jawaban. */
function instruksiBahasa(answerLang: string): string {
  if (!answerLang || answerLang === 'follow') return '';
  if (answerLang === 'id') return 'Selalu jawab dalam bahasa Indonesia (santai tapi jelas).';
  if (answerLang === 'en') return 'Always answer in English.';
  return `Selalu jawab dalam bahasa ${answerLang}.`;
}

/**
 * Daftar tool dibangun dari AGENT_TOOLS supaya prompt TIDAK PERNAH menyebut
 * tool yang tidak ada. Ini kesalahan yang paling sering terjadi kalau daftar
 * tool ditulis manual di prompt.
 */
function daftarTool(): string {
  const baris = AGENT_TOOLS.map((t) => `- ${t.spec.name}: ${t.spec.description.split('.')[0]}.`);
  return ['# Tool yang tersedia', ...baris].join('\n');
}

/**
 * System prompt lengkap untuk satu percakapan.
 *
 * @param answerLang bahasa jawaban dari Settings → Model AI
 * @param konteks    konteks tambahan dari Rust (memori + daftar skill)
 * @param aturan     isi AGENTS.md/ZEPHYR.md dari root workspace
 * @param model      nama model yang BENAR-BENAR dikirim ke API (Settings → Model AI)
 * @param provider   id provider yang dipakai
 */
export function systemPromptFor(
  answerLang: string,
  konteks = '',
  aturan = '',
  model = '',
  provider = '',
): string {
  const ov = useStore.getState().settings.aiPrompt;
  const bagian = [
    (ov?.identitas ?? '').trim() || IDENTITAS,
    (ov?.caraKerja ?? '').trim() || CARA_KERJA,
    (ov?.aturan ?? '').trim() || ATURAN,
    // Fakta identitas model ditaruh SEBELUM daftar tool: pertanyaan "kamu siapa"
    // biasanya dijawab di kalimat pertama, jadi fakta ini harus lebih dekat ke
    // awal prompt daripada instruksi prosedural.
    blokIdentitasModel(provider, model),
    daftarTool(),
  ].filter(Boolean);
  const bhs = instruksiBahasa(answerLang);
  if (bhs) bagian.push(`# Bahasa\n${bhs}`);
  // Aturan proyek didahulukan di atas memori: instruksi yang ditulis user
  // untuk proyek ini lebih spesifik daripada catatan lintas-proyek.
  if (aturan.trim()) bagian.push(`# Aturan proyek (WAJIB diikuti)\n${aturan.trim()}`);
  if (konteks.trim()) bagian.push(`# Konteks proyek & memori\n${konteks.trim()}`);
  // Instruksi user ditempel PALING AKHIR: pada prompt panjang, model lebih
  // mematuhi instruksi yang paling dekat dengan pesannya.
  const ins = (ov?.instruksi ?? '').trim();
  if (ins) bagian.push(`# Instruksi dari saya\n${ins}`);
  return bagian.join('\n\n');
}

/** Prompt BAWAAN (untuk tombol "Kembalikan bawaan" + pratinjau). */
export const PROMPT_BAWAAN = {
  identitas: IDENTITAS,
  caraKerja: CARA_KERJA,
  aturan: ATURAN,
} as const;

/**
 * Pengingat identitas yang ditempel di AKHIR pesan user (posisi paling akhir
 * yang bisa dikontrol Zephyr). System prompt ada di awal riwayat, sedangkan
 * gateway/provider bisa menyuntik identitasnya sendiri di belakang — model
 * biasanya mematuhi instruksi paling akhir, jadi baris ini lebih kuat.
 *
 * Nama model ikut disebut di sini: pertanyaan "kamu model apa" sering dijawab
 * dari bias bobot latihan kalau fakta identitas hanya ada di system prompt
 * (jauh di awal riwayat). Menaruhnya di dua posisi menutup celah itu.
 */
export function identityReminder(model = ''): string {
  const m = model.trim();
  const soalModel = m
    ? ` Kalau ditanya model apa yang menjalankanmu, jawab: ${m} (dari konfigurasi Zephyr). Jangan mengaku sebagai model lain.`
    : ' Kalau ditanya model apa yang menjalankanmu dan kamu tidak tahu, katakan tidak tahu — jangan mengaku sebagai model lain.';
  return (
    '\n\n(Kamu adalah Zeph, AI agent di editor Zephyr. Kerjakan sendiri dengan tool — ' +
    'jangan hanya menasihati. Jangan mengarang: kalau belum membaca atau belum tahu, katakan.' +
    soalModel +
    ')'
  );
}

/** Bentuk lama tanpa argumen — dipakai bridge/harness yang belum diperbarui. */
export const IDENTITY_REMINDER = identityReminder();


// ── File aturan proyek ──────────────────────────────────────────────────────
//
// KENAPA: setiap proyek punya konvensinya sendiri (AGENTS.md, ZEPHYR.md,
// CLAUDE.md). Tanpa membacanya, agent menebak gaya kode dan melanggar aturan
// yang sudah ditulis user. Membacanya sekali di awal percakapan jauh lebih
// murah daripada agent salah berkali-kali.
//
// Nama yang dicek sengaja mencakup konvensi agent lain: proyek yang sudah
// punya AGENTS.md untuk Claude Code / opencode / Codex langsung terbaca.

const FILE_ATURAN = ['AGENTS.md', 'ZEPHYR.md', 'CLAUDE.md', 'TERAX.md', '.cursorrules'];
const ATURAN_MAX_CHARS = 6000;
let cacheAturan: { at: number; teks: string } | null = null;
const ATURAN_TTL_MS = 30000;

/** Baca file aturan proyek dari root workspace (kalau ada). */
export async function aturanProyek(): Promise<string> {
  const now = Date.now();
  if (cacheAturan && now - cacheAturan.at < ATURAN_TTL_MS) return cacheAturan.teks;
  const ws = useStore.getState().workspace;
  if (!ws) return '';
  const bagian: string[] = [];
  for (const nama of FILE_ATURAN) {
    const path = `${ws}/${nama}`.replace(/\\/g, '/');
    try {
      const isi = await fsRead(path, 'utf8');
      const teks = typeof isi === 'string' ? isi : ((isi as { content?: string })?.content ?? '');
      if (teks.trim()) {
        bagian.push('## ' + nama + '\n' + teks.slice(0, ATURAN_MAX_CHARS));
        // Satu file aturan sudah cukup — beberapa file sekaligus memakan
        // konteks tanpa menambah aturan baru.
        break;
      }
    } catch {
      // File tidak ada: lanjut ke kandidat berikutnya.
    }
  }
  const hasil = bagian.join('\n\n');
  cacheAturan = { at: now, teks: hasil };
  return hasil;
}

/** Paksa muat ulang file aturan (dipakai setelah user mengeditnya). */
export function resetAturanProyek() {
  cacheAturan = null;
}
