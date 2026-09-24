import { AGENT_TOOLS } from './agentTools';
import { useStore } from './store';
import { fsRead } from './commands';

const IDENTITAS =
  'Kamu adalah Zeph, AI agent di dalam editor Zephyr (Tauri, Windows). ' +
  'Kamu bekerja langsung di dalam editor: bisa membaca/menulis file, menjalankan ' +
  'perintah shell, mencari di seluruh proyek, dan mengelola TODO. Kamu BUKAN ' +
  'chatbot yang hanya menasihati — kamu mengerjakan sendiri sampai tuntas.';

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

const CARA_KERJA = [
  '# Cara kerja',
  '1. PAHAMI dulu. Baca file yang relevan sebelum mengubah apa pun. Kalau soal itu tentang kode, cari dulu dengan pencarian teks — jangan menebak isi file.',
  '2. RENCANAKAN singkat (2-5 langkah) untuk tugas yang lebih dari sekadar pertanyaan. Tulis rencana di balasan, lalu langsung kerjakan — jangan minta izin untuk langkah yang sudah jelas.',
  '3. TULIS RENCANA ITU KE todo_write. Tugas yang butuh 3 langkah atau lebih WAJIB masuk todo_write, dan statusnya diperbarui setiap kali berubah (pending -> in_progress -> done). Ini bukan formalitas: user memantau pekerjaanmu dari panel TODO, dan tanpa itu ia tidak tahu kamu sedang di mana.',
  '4. KERJAKAN dengan tool. Satu langkah = satu tool. Jangan menyatakan sudah selesai sebelum benar-benar memanggil tool-nya.',
  '5. VERIFIKASI hasilnya: jalankan test/typecheck/build, atau baca ulang file yang kamu tulis. Perbaiki sendiri kalau gagal, jangan lapor gagal begitu saja.',
  '6. LAPOR hasil akhir: apa yang berubah, di file mana, dan apa yang sudah diverifikasi. Ringkas — tanpa mengulang isi seluruh file.',
].join('\n');

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

function instruksiBahasa(answerLang: string): string {
  if (!answerLang || answerLang === 'follow') return '';
  if (answerLang === 'id') return 'Selalu jawab dalam bahasa Indonesia (santai tapi jelas).';
  if (answerLang === 'en') return 'Always answer in English.';
  return `Selalu jawab dalam bahasa ${answerLang}.`;
}

function daftarTool(): string {
  const baris = AGENT_TOOLS.map((t) => `- ${t.spec.name}: ${t.spec.description.split('.')[0]}.`);
  return ['# Tool yang tersedia', ...baris].join('\n');
}

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

    blokIdentitasModel(provider, model),
    daftarTool(),
  ].filter(Boolean);
  const bhs = instruksiBahasa(answerLang);
  if (bhs) bagian.push(`# Bahasa\n${bhs}`);

  if (aturan.trim()) bagian.push(`# Aturan proyek (WAJIB diikuti)\n${aturan.trim()}`);
  if (konteks.trim()) bagian.push(`# Konteks proyek & memori\n${konteks.trim()}`);

  const ins = (ov?.instruksi ?? '').trim();
  if (ins) bagian.push(`# Instruksi dari saya\n${ins}`);
  return bagian.join('\n\n');
}

export const PROMPT_BAWAAN = {
  identitas: IDENTITAS,
  caraKerja: CARA_KERJA,
  aturan: ATURAN,
} as const;

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

export const IDENTITY_REMINDER = identityReminder();

const FILE_ATURAN = ['AGENTS.md', 'ZEPHYR.md', 'CLAUDE.md', 'TERAX.md', '.cursorrules'];
const ATURAN_MAX_CHARS = 6000;
let cacheAturan: { at: number; teks: string } | null = null;
const ATURAN_TTL_MS = 30000;

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

        break;
      }
    } catch {
      // File missing: move on to the next candidate.
    }
  }
  const hasil = bagian.join('\n\n');
  cacheAturan = { at: now, teks: hasil };
  return hasil;
}

export function resetAturanProyek() {
  cacheAturan = null;
}
