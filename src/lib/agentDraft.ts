import { aiToolChat } from './commands';
import type { AgentMsg } from './types';
import { useAi } from './aiStore';
import { useStore } from './store';
import { findModel } from './modelCatalog';

/*
 * Draft generation for Agent Customizations.
 *
 * The reader describes what they want in plain language; this module turns that
 * into a STRUCTURED draft — a name, a description and a body — which the panel
 * then shows in the ordinary editor for review. Nothing here writes to disk and
 * nothing here runs anything: the draft is text the reader edits and saves
 * themselves, and the Save path is the same one a hand-typed entry goes through.
 *
 * ## Why `aiToolChat` and not `aiChat`
 *
 * `aiChat` streams its answer back over the `ai-chunk` event. That event carries
 * ONE global callback (`events.ts` stores it on `window`), so a draft request
 * running while the reader has the chat open would take the callback away from
 * the chat and the chat would stop receiving tokens mid-answer — a bug nowhere
 * near the button that caused it. `aiToolChat` is a plain request/response, so a
 * draft can be generated with the chat untouched.
 *
 * No tools are sent. The model is asked for text, and the only thing done with
 * that text is parse it and show it. That is also why this cannot change the
 * repository: there is no tool for it to call.
 */

/*
 * Room for a full draft. 8k tokens is several pages of markdown, which is more
 * than any of these shapes needs — the point is that running out mid-JSON is
 * not among the ways a generation can fail.
 *
 * The chat path caps at `def.maxOut` because a chat reply is prose the reader
 * watches arrive. A draft is JSON: a name, a description and a body, and BOTH
 * the wrapper and the body can be long. At the chat ceiling a longer request ran
 * the model out of room mid-object — the reply arrived cut off, `JSON.parse`
 * failed, and the reader got "model did not return a readable draft" for what
 * was really "the answer was truncated". Measured: a one-line request parsed, a
 * two-line one did not.
 */
const DRAFT_MAX = 8192;

export type DraftKind = 'skill' | 'agent' | 'hook';

export interface DraftHasil {
  name: string;
  description: string;
  /** The instruction body. For a hook this is the explanation of the command. */
  body: string;
  /** Hooks only: the lifecycle event the command would run on. */
  event?: string;
  /** Hooks only: the command itself, shown for review and never executed. */
  command?: string;
  /** Agents only: tool names the model suggests. Suggestions, never grants. */
  tools?: string[];
}

/*
 * The schema is stated in the prompt AND the answer is parsed defensively,
 * because a model that wraps its JSON in prose or a fenced block is the normal
 * case, not an exception. `parseDraft` below is what actually decides whether
 * the answer is usable; the prompt just makes a good answer likely.
 */
const SKEMA = `Balas HANYA dengan satu objek JSON, tanpa pagar kode, tanpa kalimat pengantar:
{
  "name": "nama-pendek-tanpa-spasi",
  "description": "satu kalimat: kapan ini dipakai",
  "body": "instruksi lengkap dalam markdown"
}`;

const SKEMA_AGENT = `Balas HANYA dengan satu objek JSON, tanpa pagar kode, tanpa kalimat pengantar:
{
  "name": "nama-peran",
  "description": "satu kalimat: peran ini untuk apa",
  "body": "instruksi peran dalam markdown: cara kerja, batasan, apa yang tidak boleh",
  "tools": ["nama_tool_yang_disarankan"]
}`;

const SKEMA_HOOK = `Balas HANYA dengan satu objek JSON, tanpa pagar kode, tanpa kalimat pengantar:
{
  "name": "nama-hook",
  "description": "satu kalimat: hook ini untuk apa",
  "body": "penjelasan dalam markdown: apa yang dilakukan, kapan, dan risikonya",
  "event": "salah satu dari: before-tool, after-tool, before-write, session-end",
  "command": "perintah yang akan dijalankan"
}`;

function promptSistem(kind: DraftKind): string {
  const dasar =
    'Kamu menyusun customization untuk Zephyr, sebuah code editor. ' +
    'Tulis dalam bahasa yang sama dengan permintaan pengguna. ' +
    'Jangan pernah menyertakan kunci API, token, atau rahasia apa pun. ';

  if (kind === 'skill') {
    return (
      dasar +
      'SKILL adalah prosedur yang dibaca agent saat tugas cocok dengannya. ' +
      'Buat yang SPESIFIK dan bisa diikuti, bukan nasihat umum. ' +
      'Nama: huruf kecil, angka, tanda hubung. ' +
      'Body: langkah yang jelas, dalam markdown, tanpa basa-basi.\n\n' +
      SKEMA
    );
  }
  if (kind === 'agent') {
    return (
      dasar +
      'AGENT adalah peran kerja dengan instruksi dan batasan sendiri. ' +
      'Body harus menyebut cara kerja, apa yang harus diperiksa, dan apa yang TIDAK boleh dilakukan. ' +
      'Untuk "tools", sebutkan HANYA nama tool yang benar-benar diperlukan; ini usulan, bukan izin. ' +
      'Mulai dari hak akses paling kecil.\n\n' +
      SKEMA_AGENT
    );
  }
  return (
    dasar +
    'HOOK adalah perintah yang dijalankan pada titik tertentu di siklus hidup agent. ' +
    'Perintah ini disimpan sebagai draft dan TIDAK dijalankan sampai pengguna memeriksanya. ' +
    'Tulis perintah yang aman: jangan hapus berkas, jangan kirim data ke jaringan, jangan ubah di luar workspace. ' +
    'Jelaskan di body apa yang dilakukan perintah itu dan apa risikonya.\n\n' +
    SKEMA_HOOK
  );
}

/** Pull the first JSON object out of an answer, fence or prose included. */
export function parseDraft(teks: string): DraftHasil | null {
  const bersih = teks.trim();

  /*
   * The RAW text is tried first, and the fence is only stripped if that fails.
   *
   * The other order looks more robust and is not: a draft's BODY is markdown,
   * and markdown contains fenced code blocks. A regex looking for ``` around the
   * payload finds the fence INSIDE the body first, slices the answer down to the
   * fragment between two of the body's own fences, and the `JSON.parse` that
   * follows fails on a fragment that was never meant to be the whole object.
   * Measured: a one-line request parsed and a request whose answer included a
   * `cargo test` block did not, which is the "model did not return a readable
   * draft" report on an answer that was perfectly well formed.
   */
  const langsung = potongJson(bersih);
  if (langsung) return langsung;

  /* Only now: a fence the model added around the whole object. */
  const pagar = /```(?:json)?\s*([\s\S]*?)```/.exec(bersih);
  if (pagar) {
    const dariPagar = potongJson(pagar[1]);
    if (dariPagar) return dariPagar;
  }

  /*
   * Last resort: the answer was wrapped in prose, so the object is not the
   * outermost text. Taking the first `{` and the last `}` is the widest window
   * the text allows, and it recovers an answer like "Sure! Here it is: {...}."
   */
  return potongJson(bersih);
}

/** Parse the outermost object in `kandidat`, or null if there is not one. */
function potongJson(kandidat: string): DraftHasil | null {
  const mulai = kandidat.indexOf('{');
  const akhir = kandidat.lastIndexOf('}');
  if (mulai < 0 || akhir <= mulai) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(kandidat.slice(mulai, akhir + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const name = str(obj.name);
  const body = str(obj.body);
  /*
   * A draft with no name or no body is not a draft. Accepting it would put an
   * empty form on screen and let the reader save an entry called "" — which
   * `skill_write` rejects, so the failure would surface later and further away.
   */
  if (!name || !body) return null;
  const tools = Array.isArray(obj.tools)
    ? obj.tools.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    : undefined;
  return {
    name,
    description: str(obj.description),
    body,
    event: str(obj.event) || undefined,
    command: str(obj.command) || undefined,
    tools,
  };
}

export interface OpsiDraft {
  kind: DraftKind;
  permintaan: string;
  /** Earlier turns, so a follow-up correction has context. */
  riwayat?: AgentMsg[];
  /** Extra line for follow-ups like "make the description shorter". */
  koreksi?: string;
}

/**
 * Ask the active provider for a draft.
 *
 * Throws with a plain message on failure; the caller shows it. There is no
 * fallback model and no retry: a draft is something the reader asked for and is
 * waiting on, so a failure should say what went wrong rather than quietly try
 * something else and take twice as long.
 */
export async function buatDraft({ kind, permintaan, riwayat, koreksi }: OpsiDraft): Promise<DraftHasil> {
  const st = useAi.getState();
  const def = findModel(st.model, st.provider);
  const cfg = useStore.getState().settings.models.providers[def.provider];

  const isi = koreksi ? `${permintaan}\n\nPerbaikan yang diminta: ${koreksi}` : permintaan;
  const pesan: AgentMsg[] = [
    { role: 'system', content: promptSistem(kind) },
    ...(riwayat ?? []),
    { role: 'user', content: isi },
  ];

  const hasil = await aiToolChat({
    provider: def.provider,
    model: def.id,
    messages: pesan,
    tools: [],
    baseUrl: cfg?.baseUrl || undefined,
    maxTokens: Math.max(def.maxOut ?? 2048, DRAFT_MAX),
    effort: st.reasoningEffort ?? undefined,
  });

  const draft = parseDraft(hasil.content ?? '');
  if (!draft) {
    /*
     * Distinguish the two failures, because they need different responses from
     * the reader. A TRUNCATED answer (an opening brace with no closing one)
     * means the ceiling was hit and asking again the same way will hit it again;
     * unparseable text means the model ignored the format, where a rephrase is
     * what helps.
     */
    const mentah = (hasil.content ?? '').trim();
    const terpotong = mentah.length > 0 && mentah.lastIndexOf('}') < mentah.indexOf('{');
    throw new Error(
      terpotong
        ? 'Jawaban model terpotong sebelum draftnya selesai. Coba minta lebih ringkas.'
        : 'Model tidak mengembalikan draft yang bisa dibaca. Coba lagi, atau tulis permintaannya lebih spesifik.',
    );
  }
  return draft;
}
