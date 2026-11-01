/**
 * Satu panggilan Lead yang DI-STREAM untuk fase "menyusun" Experts.
 *
 * Kenapa tidak `aiToolChat` biasa: fase ini ditampilkan sebagai lipatan
 * "Creating research task" yang isinya PARAGRAF PIKIRAN Lead (acuan 044850).
 * `aiToolChat` hanya mengembalikan `{ content, toolCalls }` — reasoning model
 * tidak pernah sampai ke UI, jadi lipatan itu mustahil diisi dengan kalimat
 * asli dan hanya bisa jadi label kosong. `ai_tool_chat_stream` mengirim delta
 * `reasoning` (ai.rs, cabang tool stream) dan frame akhir berisi `content`,
 * jadi keduanya bisa ditangkap apa adanya tanpa mengarang teks.
 *
 * Kontrak yang penting: perintah Rust itu mengembalikan `()` SEGERA setelah
 * thread pengirim dijalankan (bukan setelah stream selesai). Karena itu janji
 * di sini diselesaikan oleh frame `done`/`err`, bukan oleh `await` invoke —
 * kalau tidak, fungsi ini akan mengembalikan teks kosong setiap kali.
 */
import * as cmd from './commands';
import { onAiChunk } from './events';

export interface HasilLeadStream {
  /** Teks jawaban penuh (JSON rencana atau balasan chat). */
  isi: string;
  /** Reasoning yang dikirim model selama menyusun. Bisa kosong. */
  pikir: string;
}

/** Batas tunggu frame akhir; provider lambat tetap harus punya ujung. */
const BATAS_MS = 240_000;

export async function panggilLeadStream(o: {
  provider: string;
  model: string;
  baseUrl?: string;
  fullUrl?: boolean;
  messages: { role: string; content: string }[];
  maxTokens: number;
  /** Dipanggil setiap potongan reasoning baru (teks AKUMULATIF). */
  onPikir?: (teks: string) => void;
  /** True = run sudah dibatalkan; stream berhenti menunggu. */
  batal?: () => boolean;
}): Promise<HasilLeadStream> {
  const id = `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let isi = '';
  let pikir = '';
  let galat = '';
  let selesai = false;

  let tandai: () => void = () => {};
  const akhir = new Promise<void>((r) => {
    tandai = r;
  });

  const timer = setTimeout(() => {
    if (!selesai) {
      galat = galat || 'Lead stream melewati batas waktu';
      tandai();
    }
  }, BATAS_MS);

  const lepas = await onAiChunk((c) => {
    if (c.id !== id) return;
    if (c.err) {
      galat = c.err;
      clearTimeout(timer);
      tandai();
      return;
    }
    if (c.reasoning) {
      pikir += c.reasoning;
      o.onPikir?.(pikir);
    }
    if (c.text) isi += c.text;
    /*
     * Frame akhir kadang membawa `content` utuh (bukan delta), dan kadang
     * kosong karena semuanya sudah dikirim sebagai `text`. Yang utuh menang:
     * menggabungkan keduanya akan menduplikasi jawaban.
     */
    if (c.done) {
      if (typeof c.content === 'string' && c.content.trim()) isi = c.content;
      selesai = true;
      clearTimeout(timer);
      tandai();
    }
  });

  try {
    await cmd.aiToolChatStream({
      id,
      provider: o.provider,
      model: o.model,
      messages: o.messages as never,
      tools: [],
      maxTokens: o.maxTokens,
      baseUrl: o.baseUrl,
      fullUrl: o.fullUrl,
    });
    await akhir;
    if (galat) throw new Error(galat);
    return { isi, pikir };
  } finally {
    clearTimeout(timer);
    lepas();
  }
}
