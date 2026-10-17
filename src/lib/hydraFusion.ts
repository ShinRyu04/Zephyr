/*
 * HydraFusion — adaptive model orchestration for the MAIN chat.
 *
 * WHAT IT IS. The reader writes a task; this module decides which model runs it
 * and in what shape. Three routes, all decided here so the store stays thin:
 *
 *   - `satu`          : one model, one request. Cheap tasks.
 *   - `eskalasi`      : cheap first; a request that FAILS (provider error, empty
 *                       answer, or the model declaring doubt) is retried on a
 *                       stronger rung of the ladder, up to the cost cap.
 *   - `kritik-revisi` : model A drafts, model B critiques, model A revises.
 *                       Three requests, each reported as its own stage.
 *
 * `subagentRouter.ts` already classifies task text and scores a model against a
 * category, so the classification half of HydraFusion is REUSED here rather
 * than re-implemented — a second copy would drift from the subagent router the
 * first time either is tuned. What is new here is the chat-side routing: the
 * difficulty tier, the ladder, the critique/revision prompts, and the cost cap.
 *
 * FAILURE IS AMBIGUOUS, AND THIS MODULE DOES NOT PRETEND OTHERWISE. A model can
 * answer confidently and be wrong, and nothing here tries to detect that by
 * reading the answer — guessing from prose is exactly the kind of fake verdict
 * that makes an escalation loop burn money silently. The three signals that DO
 * count are all observable:
 *   1. the provider raised an error,
 *   2. the answer came back empty,
 *   3. the model itself SAID it was unsure, in the one machine-readable form
 *      this module asks it for (`HYDRA_PENANDA_RAGU`).
 * Anything else is treated as a success and stays the reader's call.
 */

import { capabilityScore, classifySubagentTask, type SubagentModelCandidate, type SubagentTaskCategory } from './subagentRouter';
import { PROVIDERS, providerSiap, isPlaceholderModel } from './modelCatalog';
import type { AiMessage, AiChunk } from './types';

export type HydraTier = 'cheap' | 'mid' | 'strong';
export type HydraJalur = 'satu' | 'eskalasi' | 'kritik-revisi';
export type HydraPeran = 'draft' | 'kritik' | 'revisi';

/** Requests a run may spend by default. Three is the critique-revision shape. */
export const HYDRA_MAX_REQUESTS_BAWAAN = 3;
/** Ceiling for the cost cap, so a typed-in number cannot uncap escalation. */
export const HYDRA_MAX_REQUESTS_LIMIT = 6;
/** Escalations beyond this per run are refused regardless of the cap. */
export const HYDRA_MAKS_ESKALASI = 2;
/**
 * The only self-declared doubt this module accepts.
 *
 * It is not a vibe read off the sentence: the draft prompt ASKS for this exact
 * line, so seeing it means the model chose to signal low confidence. Absent the
 * line, the answer stands — see the header on why nothing is inferred from
 * content.
 */
export const HYDRA_PENANDA_RAGU = 'HYDRA-CONFIDENCE: LOW';
/** Prefix on the request ids of the passes that must not land in the bubble. */
export const HYDRA_ID_PREFIX = 'hydra:';

const INSTRUKSI_RAGU =
  `If you are NOT confident that your answer is correct and complete, put the exact line ` +
  `"${HYDRA_PENANDA_RAGU}" on the first line of your reply and nothing else on that line, then answer anyway. ` +
  `Do not write that line when you are confident.`;

const INSTRUKSI_KRITIK =
  'You are the reviewer. Below is a draft answer to the same task. Point out concrete ' +
  'defects only: wrong claims, missing steps, unstated assumptions, code that would not ' +
  'run. Number them. Do not rewrite the answer, do not praise it, and do not restate it. ' +
  'End with a line "VERDICT: OK" or "VERDICT: FIX".';

const INSTRUKSI_REVISI =
  'Below are your own draft and a review of it. Produce the final answer to the original ' +
  'task: fix every defect the review identified and keep what was already right. Answer the ' +
  'original task directly — no mention of drafts, reviews or this instruction.';

export interface HydraPengaturan {
  enabled?: boolean;
  /** Explicit mapping, `provider/model`. Empty or absent = derived from the catalog. */
  tiers?: Partial<Record<HydraTier, string>>;
  /** Cost cap: requests a single run may spend. */
  maxRequests?: number;
}

export interface HydraKandidat extends SubagentModelCandidate {}

export interface HydraSinyal {
  panjangPrompt: number;
  berkas: number;
  blokKode: number;
  kataKunci: string[];
}

export interface HydraKlasifikasi {
  kategori: SubagentTaskCategory;
  tingkat: HydraTier;
  sinyal: HydraSinyal;
  alasan: string;
}

export interface HydraLangkah {
  peran: HydraPeran;
  tier: HydraTier;
  provider: string;
  model: string;
  label: string;
  kenapa: string;
}

/* ------------------------------------------------------------------ *
 * Candidates
 * ------------------------------------------------------------------ */

/**
 * Every model HydraFusion may route to, in the shape the router expects.
 *
 * WHY this lives HERE and not in the store. The store used to build the list as
 * `PROVIDERS.flatMap(p => p.models.map(...))`, and that is the catalogue's
 * PLACEHOLDER rows for the free-text providers: `custom` ships exactly one
 * model, literally called "Type a model name" (`custom-model`), and `local`
 * ships "Type a local model name". A reader driving HydraFusion through a custom
 * OpenAI-compatible gateway — the common case — therefore handed the router a
 * single fake entry per provider: every rung resolved to that placeholder, the
 * ladder collapsed to one rung, and a "strong" task with a 3-request cap could
 * not build draft → critique → revision at all. The feature looked broken while
 * it was running correctly on an empty candidate list.
 *
 * The configured model ids are the real ones: they are what the reader typed and
 * what `models.providers[provider].model` stores. Placeholder ids are dropped so
 * they can never be picked as a rung.
 */
export function kandidatHydra(
  providers: Record<string, { baseUrl?: string; model?: string } | undefined>,
  adaKey: (id: string) => boolean,
): HydraKandidat[] {
  const out: HydraKandidat[] = [];
  for (const p of PROVIDERS) {
    if (!providerSiap(p, adaKey(p.id), providers)) continue;
    const konfigurasi = providers[p.id];
    const ids: string[] = [];
    const pilih = (konfigurasi?.model ?? '').trim();
    if (pilih && !isPlaceholderModel(pilih)) ids.push(pilih);
    for (const m of p.models ?? []) {
      if (!isPlaceholderModel(m.id)) ids.push(m.id);
    }
    for (const id of new Set(ids)) {
      const meta = (p.models ?? []).find((m) => m.id === id);
      out.push({
        id,
        provider: p.id,
        label: meta?.label || id,
        note: meta?.note,
        available: true,
      });
    }
  }
  return out;
}

/**
 * The `provider/model` a provider is configured to use, for the settings rows.
 *
 * Returns `''` when it is still the placeholder, so the row shows the derived
 * value instead of "custom/custom-model".
 */
export function pilihanTersimpan(
  provider: string,
  providers: Record<string, { model?: string } | undefined>,
): string {
  const m = (providers[provider]?.model ?? '').trim();
  if (!m || isPlaceholderModel(m)) return '';
  return `${provider}/${m}`;
}

export interface HydraRencana {
  jalur: HydraJalur;
  kategori: SubagentTaskCategory;
  tingkat: HydraTier;
  /** The sequence actually attempted, in order. */
  langkah: HydraLangkah[];
  /** The full cheap→strong ladder, for the escalation route. */
  tangga: HydraLangkah[];
  /** Strongest available rung, used when a pass fails inside `kritik-revisi`. */
  kuat: HydraLangkah | null;
  batasRequest: number;
  alasan: string;
  /**
   * The plan cannot run as designed, and this says why in words the reader can
   * act on. `null` means the plan is valid.
   *
   * WHY the plan is validated BEFORE it executes (GitHub's "validated routing"):
   * a route can name a model whose provider has no key, or a model the catalogue
   * no longer carries. Starting anyway spends the first request only to fail
   * inside the ladder, and the reader sees a provider error instead of "you have
   * no key for this provider" — a diagnosis that points at the wrong thing.
   */
  tolak: string | null;
}

export interface HydraLapor {
  request: number;
  total: number;
  jalur: HydraJalur;
  peran: HydraPeran;
  provider: string;
  model: string;
  catatan: string;
}

export interface HydraHasil {
  teks: string;
  err: string | null;
  jalur: HydraJalur;
  request: number;
  dipakai: HydraLangkah[];
  /** Why each escalation happened, in order. Empty when nothing failed. */
  eskalasi: string[];
  /** One line per finished stage, for the UI's stage trail. */
  catatanTahap: string[];
  berhenti: 'selesai' | 'batas' | 'batal' | 'gagal';
}

/** What one run decided, kept after it ends so the UI can explain the last answer. */
export interface HydraTerakhir {
  jalur: HydraJalur;
  tingkat: HydraTier;
  kategori: string;
  /** The model that produced the landed text, or the last one tried. */
  provider: string;
  model: string;
  /** The plan's overall reason: why THIS route for THIS task. */
  alasan: string;
  request: number;
  berhenti: string;
  catatanTahap: string[];
  eskalasi: string[];
  /**
   * Tokens spent by every leg of this run, summed.
   *
   * WHY it is here and not only in a log: "complete accounting" is the promise
   * that makes a multi-model run trustworthy — the reader paid for the critique
   * and the revision too. Only token counts are reported; Zephyr does not know
   * any provider's price list, so it does not invent a money figure. Absent or
   * `0/0` means the provider reported no usage, which is stated as such.
   */
  pemakaian?: { input: number; output: number };
}

/* ------------------------------------------------------------------ *
 * Settings and tier mapping
 * ------------------------------------------------------------------ */

/** Normalise the raw settings blob, so callers never read half a value. */
export function bacaPengaturan(raw: HydraPengaturan | undefined): {
  enabled: boolean;
  tiers: Partial<Record<HydraTier, string>>;
  maxRequests: number;
} {
  const n = Number(raw?.maxRequests ?? HYDRA_MAX_REQUESTS_BAWAAN);
  return {
    enabled: raw?.enabled === true,
    tiers: raw?.tiers ?? {},
    maxRequests: Math.min(HYDRA_MAX_REQUESTS_LIMIT, Math.max(1, Number.isFinite(n) ? Math.trunc(n) : HYDRA_MAX_REQUESTS_BAWAAN)),
  };
}

/** `provider/model` → parts. Returns null for anything unusable. */
export function parseTierRef(ref: string | undefined): { provider: string; model: string } | null {
  const t = (ref ?? '').trim();
  const i = t.indexOf('/');
  if (i <= 0 || i === t.length - 1) return null;
  return { provider: t.slice(0, i), model: t.slice(i + 1) };
}

const R_MAHAL = /(pro|opus|reason|thinking|penalar|flagship|max|agentik|ultra|large|heavy)/;
const R_MURAH = /(mini|nano|flash|lite|hemat|fast|cepat|small|kecil|haiku|instan|instant)/;

/**
 * Which rung a model belongs on, read from its own catalog metadata.
 *
 * The note/label/id are what the model list already says about the model, so
 * this adds no second source of truth — and an unmarked model lands on `mid`,
 * which is the honest answer: unknown is not "cheap".
 */
export function tingkatKandidat(c: { id: string; label?: string; note?: string }): HydraTier {
  const t = `${c.id} ${c.label ?? ''} ${c.note ?? ''}`.toLowerCase();
  if (R_MURAH.test(t) && !R_MAHAL.test(t)) return 'cheap';
  if (R_MAHAL.test(t)) return 'strong';
  return 'mid';
}

/** Suggestions for the settings UI: one `provider/model` per rung. */
export function usulTingkat(kandidat: HydraKandidat[]): Partial<Record<HydraTier, string>> {
  const pakai = kandidat.filter((c) => c.available !== false && c.provider && c.id);
  const out: Partial<Record<HydraTier, string>> = {};
  for (const tier of ['cheap', 'mid', 'strong'] as const) {
    const k = pakai.find((c) => tingkatKandidat(c) === tier);
    if (k) out[tier] = `${k.provider}/${k.id}`;
  }
  return out;
}

function pilihUntukTier(tier: HydraTier, kandidat: HydraKandidat[], kategori: SubagentTaskCategory): HydraKandidat | null {
  const pakai = kandidat.filter((c) => c.available !== false && c.provider && c.id);
  const sekelas = pakai.filter((c) => tingkatKandidat(c) === tier);
  if (sekelas.length === 0) return null;
  if (tier === 'strong') {
    return [...sekelas].sort((a, b) => capabilityScore(b, kategori) - capabilityScore(a, kategori))[0];
  }
  return sekelas[0];
}

function langkahDari(tier: HydraTier, c: HydraKandidat, kenapa: string): HydraLangkah {
  return {
    peran: 'draft',
    tier,
    provider: c.provider,
    model: c.id,
    label: c.label || c.id,
    kenapa,
  };
}

/* ------------------------------------------------------------------ *
 * Classification
 * ------------------------------------------------------------------ */

const KATA_KUNCI = ['refactor', 'debug', 'arsitektur', 'architecture', 'kenapa', 'why', 'analisis', 'analysis'];

/** Files the prompt names, by path shape rather than by a hardcoded list. */
function hitungBerkas(t: string): number {
  const m = t.match(/[\w.-]+\/[\w./-]*[\w-]/g) ?? [];
  const nama = t.match(/\b[\w-]+\.(ts|tsx|js|jsx|mjs|rs|json|css|md|py|go|java)\b/g) ?? [];
  return new Set([...m, ...nama].map((x) => x.toLowerCase())).size;
}

function potong(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

/**
 * Chat-side classification: reuse the subagent categoriser, add the difficulty.
 *
 * The category comes straight from `classifySubagentTask` (one classifier for
 * both halves of the app). The TIER is what is new: it reads the size of the
 * ask — prompt length, how many files are named, whether code was pasted, and
 * the words that mark a heavy task in any language the reader types in.
 */
export function klasifikasiChat(text: string): HydraKlasifikasi {
  const t = (text ?? '').toLowerCase();
  const kategori = classifySubagentTask(text ?? '');
  const sinyal: HydraSinyal = {
    panjangPrompt: (text ?? '').length,
    berkas: hitungBerkas(t),
    blokKode: (text.match(/```/g) ?? []).length / 2,
    kataKunci: KATA_KUNCI.filter((k) => t.includes(k)),
  };

  const berat =
    sinyal.panjangPrompt >= 600 ||
    sinyal.berkas >= 3 ||
    sinyal.blokKode >= 1 ||
    sinyal.kataKunci.length >= 2;
  const ringan = kategori === 'fast-simple' && sinyal.panjangPrompt < 160 && sinyal.berkas === 0 && !berat;

  if (ringan) {
    return { kategori, tingkat: 'cheap', sinyal, alasan: `Small ${kategori} ask (${sinyal.panjangPrompt} chars, no files): one cheap model.` };
  }
  if (berat || kategori === 'planning-review') {
    return {
      kategori,
      tingkat: 'strong',
      sinyal,
      alasan: `Heavy ${kategori} ask (${sinyal.panjangPrompt} chars, ${sinyal.berkas} files${sinyal.kataKunci.length ? `, keywords ${sinyal.kataKunci.join('/')}` : ''}): draft, critique, revise.`,
    };
  }
  return { kategori, tingkat: 'mid', sinyal, alasan: `Ordinary ${kategori} ask: start mid, escalate on failure.` };
}

/* ------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------ */

export interface HydraMasuk {
  teks: string;
  kandidat: HydraKandidat[];
  /** The chat's own model, used when a rung has no candidate. */
  cadangan: { provider: string; model: string };
  pengaturan: HydraPengaturan;
  /**
   * Is this provider usable right now (key present, or an endpoint that needs
   * none)? Optional: without it the plan is not pre-flighted, which is the old
   * behaviour and keeps the pure tests able to call this without a key store.
   */
  providerSiap?: (provider: string) => boolean;
}

function langkahTier(
  tier: HydraTier,
  masuk: HydraMasuk,
  kategori: SubagentTaskCategory,
): HydraLangkah {
  const eksplisit = parseTierRef(masuk.pengaturan.tiers?.[tier]);
  if (eksplisit) {
    const known = masuk.kandidat.find((c) => c.provider === eksplisit.provider && c.id === eksplisit.model);
    return {
      peran: 'draft',
      tier,
      provider: eksplisit.provider,
      model: eksplisit.model,
      label: known?.label || eksplisit.model,
      kenapa: `Rung "${tier}" from the HydraFusion setting.`,
    };
  }
  const c = pilihUntukTier(tier, masuk.kandidat, kategori);
  if (c) return langkahDari(tier, c, `Rung "${tier}": ${c.label || c.id} is marked ${tier} in the model list.`);
  return {
    peran: 'draft',
    tier,
    provider: masuk.cadangan.provider,
    model: masuk.cadangan.model,
    label: masuk.cadangan.model,
    kenapa: `Rung "${tier}": no model is mapped to it, so the chat model stands in.`,
  };
}

const samaLangkah = (a: HydraLangkah, b: HydraLangkah) => a.provider === b.provider && a.model === b.model;

/**
 * Is the plan runnable right now? Returns a reader-facing reason, or null.
 *
 * Checks the things that can be known BEFORE the first request: every rung's
 * provider must be usable (a key, or a local endpoint that needs none), and its
 * model must not be the catalogue's placeholder row. A plan that fails this is
 * refused up front with the provider named — see `HydraRencana.tolak`.
 */
export function periksaRencana(
  tangga: HydraLangkah[],
  siapProvider: (provider: string) => boolean,
): string | null {
  if (tangga.length === 0) return 'No model is available to run this task.';
  const tidakSiap = [...new Set(tangga.filter((l) => !siapProvider(l.provider)).map((l) => l.provider))];
  if (tidakSiap.length > 0) {
    return (
      `HydraFusion cannot run: no usable key/endpoint for ${tidakSiap.join(', ')}. ` +
      'Add a key for that provider, or map the tiers to a provider that has one.'
    );
  }
  const kosong = tangga.filter((l) => !l.model.trim() || isPlaceholderModel(l.model));
  if (kosong.length > 0) {
    return (
      'HydraFusion cannot run: a tier resolves to a placeholder model name. ' +
      'Pick a real model for that tier (or leave it on Auto).'
    );
  }
  return null;
}

/**
 * Decide the route. Pure: same input, same plan — which is what makes the
 * ladder and the cap testable without an app.
 */
export function rencanaHydra(masuk: HydraMasuk): HydraRencana {
  const { maxRequests } = bacaPengaturan(masuk.pengaturan);
  const k = klasifikasiChat(masuk.teks);
  const murah = langkahTier('cheap', masuk, k.kategori);
  const sedang = langkahTier('mid', masuk, k.kategori);
  const kuat = langkahTier('strong', masuk, k.kategori);

  /* The ladder keeps at most three rungs and never repeats one: paying twice for
     the same model is not an escalation. */
  const tangga: HydraLangkah[] = [];
  for (const l of [murah, sedang, kuat]) {
    if (tangga.length === 0 || !tangga.some((x) => samaLangkah(x, l))) tangga.push(l);
  }

  /*
   * Validate BEFORE choosing a route, so a refused plan never claims a route it
   * was never going to run. `masuk.providerSiap` is optional: a caller that does
   * not pass it gets the old behaviour (no pre-flight check) rather than a
   * verdict based on an assumption.
   */
  const tolak = masuk.providerSiap ? periksaRencana(tangga, masuk.providerSiap) : null;
  if (tolak) {
    return {
      jalur: 'satu',
      kategori: k.kategori,
      tingkat: k.tingkat,
      langkah: [],
      tangga,
      kuat,
      batasRequest: maxRequests,
      alasan: tolak,
      tolak,
    };
  }

  if (k.tingkat === 'cheap') {
    const satu = { ...murah, peran: 'draft' as const };
    return {
      jalur: 'satu',
      kategori: k.kategori,
      tingkat: k.tingkat,
      langkah: [satu],
      tangga,
      kuat,
      batasRequest: maxRequests,
      alasan: `${k.alasan} One request, no escalation.`,
      tolak: null,
    };
  }

  /* Critique-revision needs three requests to exist at all: a plan that cannot
     afford the critique is not a critique-revision plan, it is an escalation —
     saying otherwise would show three stages that never run. */
  if (k.tingkat === 'strong' && maxRequests >= 3 && tangga.length >= 2) {
    const drafter = tangga[0];
    const kritikus = samaLangkah(drafter, kuat) ? tangga[tangga.length - 1] : kuat;
    return {
      jalur: 'kritik-revisi',
      kategori: k.kategori,
      tingkat: k.tingkat,
      langkah: [
        { ...drafter, peran: 'draft', kenapa: `${drafter.kenapa} Drafts the answer.` },
        { ...kritikus, peran: 'kritik', kenapa: `${kritikus.kenapa} Reviews the draft.` },
        { ...drafter, peran: 'revisi', kenapa: `${drafter.kenapa} Revises with the review in hand.` },
      ],
      tangga,
      kuat,
      batasRequest: maxRequests,
      alasan: `${k.alasan} Draft → critique → revision on ${drafter.label} and ${kritikus.label}.`,
      tolak: null,
    };
  }

  const tanggaDipakai = tangga.slice(0, maxRequests);
  return {
    jalur: 'eskalasi',
    kategori: k.kategori,
    tingkat: k.tingkat,
    langkah: tanggaDipakai,
    tangga,
    kuat,
    batasRequest: maxRequests,
    alasan:
      `${k.alasan} Ladder: ${tanggaDipakai.map((l) => l.label).join(' → ')}` +
      (k.tingkat === 'strong' && maxRequests < 3 ? ` (cost cap ${maxRequests} is below the 3 a critique-revision needs).` : '.'),
    tolak: null,
  };
}

/* ------------------------------------------------------------------ *
 * Prompts per stage
 * ------------------------------------------------------------------ */

interface HydraKonteks {
  awal: AiMessage[];
  draft?: string;
  kritik?: string;
}

export function pesanUntuk(langkah: HydraLangkah, konteks: HydraKonteks): AiMessage[] {
  if (langkah.peran === 'draft') {
    return [...konteks.awal, { role: 'system', content: INSTRUKSI_RAGU }];
  }
  const draft = konteks.draft ?? '';
  if (langkah.peran === 'kritik') {
    return [...konteks.awal, { role: 'assistant', content: draft }, { role: 'user', content: INSTRUKSI_KRITIK }];
  }
  return [
    ...konteks.awal,
    { role: 'assistant', content: draft },
    { role: 'user', content: `Review of your draft:\n${konteks.kritik ?? '(none)'}\n\n${INSTRUKSI_REVISI}` },
  ];
}

/** Strip the doubt marker: the reader sees the answer, not the protocol. */
export function bersihkanPenanda(teks: string): string {
  return (teks ?? '')
    .split('\n')
    .filter((l) => l.trim() !== HYDRA_PENANDA_RAGU)
    .join('\n')
    .replace(/^\s*\n/, '');
}

/**
 * Is this pass a failure? THE ONLY THREE SIGNALS COUNTED — pass the RAW text.
 *
 * `bersihkanPenanda` strips the doubt marker, so handing the cleaned string to
 * this function would hide the third signal entirely. Nothing is inferred from
 * how the answer reads: a confident wrong answer is not detectable here, and
 * pretending otherwise is how an escalation loop spends money in silence.
 */
export function deteksiGagal(teks: string, err: string | null | undefined): { gagal: boolean; sebab: string | null } {
  if (err && err.trim()) return { gagal: true, sebab: `provider error: ${potong(err.trim(), 140)}` };
  if (!(teks ?? '').trim()) return { gagal: true, sebab: 'empty answer' };
  if ((teks ?? '').split('\n').some((l) => l.trim() === HYDRA_PENANDA_RAGU)) {
    return { gagal: true, sebab: 'the model declared low confidence' };
  }
  return { gagal: false, sebab: null };
}

/* ------------------------------------------------------------------ *
 * The runner
 * ------------------------------------------------------------------ */

export interface HydraDeps {
  /**
   * Send ONE pass and return what came back. The caller owns the transport
   * (`cmd.aiChat`), so this module never touches Tauri and stays testable.
   */
  kirim: (langkah: HydraLangkah, pesan: AiMessage[], id: string) => Promise<{ teks: string; err: string | null }>;
  lapor?: (l: HydraLapor) => void;
  /** The user stopped the run: checked before every request. */
  batalkan?: () => boolean;
  /** Request ids. The last pass should use the bubble's id so it streams there. */
  id?: (request: number) => string;
}

/**
 * Run the plan.
 *
 * Budget is counted in REQUESTS, not in rungs, so the cap holds however the
 * route is shaped. Every stage is reported before it starts, which is what lets
 * the UI say "stage 3 of 3 — revising" instead of going quiet for three calls
 * and then printing a finished answer.
 */
export async function jalankanHydra(
  rencana: HydraRencana,
  pesanAwal: AiMessage[],
  deps: HydraDeps,
): Promise<HydraHasil> {
  const idUntuk = deps.id ?? ((n) => `${HYDRA_ID_PREFIX}${rencana.jalur}-${n}`);
  const antre: HydraLangkah[] = [...rencana.langkah];
  const dipakai: HydraLangkah[] = [];
  const eskalasi: string[] = [];
  const catatanTahap: string[] = [];
  const totalSekarang = (n: number, sisa: number) => Math.max(n, Math.min(rencana.batasRequest, n + sisa));
  let konteks: HydraKonteks = { awal: pesanAwal };
  let request = 0;
  let teks = '';
  let err: string | null = null;
  let berhenti: HydraHasil['berhenti'] = 'gagal';

  while (antre.length > 0) {
    if (deps.batalkan?.()) {
      berhenti = 'batal';
      break;
    }
    if (request >= rencana.batasRequest) {
      catatanTahap.push(`Cost cap reached: ${rencana.batasRequest} request(s) per run, so escalation stopped.`);
      berhenti = 'batas';
      break;
    }
    const langkah = antre.shift() as HydraLangkah;
    request += 1;
    deps.lapor?.({
      request,
      /* "Stage 2 of 3", not "of the cap": the honest denominator is how many
         requests this run is on track for right now. */
      total: totalSekarang(request, antre.length),
      jalur: rencana.jalur,
      peran: langkah.peran,
      provider: langkah.provider,
      model: langkah.model,
      catatan: langkah.kenapa,
    });
    const hasil = await deps.kirim(langkah, pesanUntuk(langkah, konteks), idUntuk(request));
    dipakai.push(langkah);
    /*
     * Judge the RAW text, then clean it.
     *
     * Order matters and is not cosmetic: `bersihkanPenanda` deletes the very
     * line `deteksiGagal` looks for, so judging the cleaned string would make
     * the doubt signal unreachable — the one machine-readable failure this
     * module can trust would silently never fire.
     */
    const g = deteksiGagal(hasil.teks ?? '', hasil.err);
    const bersih = bersihkanPenanda(hasil.teks ?? '');

    if (langkah.peran === 'kritik') {
      /* A review that failed costs the run its critique but not its answer: the
         revision goes ahead and revises nothing, which is honest — and it is
         why the critique pass is never the one that decides the run's fate. */
      konteks = { ...konteks, kritik: g.gagal ? '' : bersih };
      if (g.gagal) {
        eskalasi.push(`critique skipped (${g.sebab})`);
        catatanTahap.push(`Stage ${request} (critique by ${langkah.label}) failed: ${g.sebab}. Revising without it.`);
      } else {
        /* Recorded even when it worked: this stage is a whole request the
           reader paid for, and a trail that only lists the two stages whose
           output survives would hide the third of the cost. */
        catatanTahap.push(`Stage ${request} (critique by ${langkah.label}) succeeded.`);
      }
      continue;
    }

    teks = bersih;
    err = hasil.err;
    if (!g.gagal) {
      catatanTahap.push(`Stage ${request} (${langkah.peran}, ${langkah.label}) succeeded.`);
      /*
       * A draft that succeeded is NOT the end of a critique-revision run. The
       * answer on that route is the revision - the draft is only the thing the
       * critique and the revision work on. Ending here would announce success
       * after stage 1 and leave the two stages the route is named after never
       * executed, which is the quietest way a plan can lie about what it did.
       */
      if (langkah.peran === 'draft' && rencana.jalur === 'kritik-revisi') {
        konteks = { ...konteks, draft: bersih };
        continue;
      }
      berhenti = 'selesai';
      break;
    }

    catatanTahap.push(`Stage ${request} (${langkah.peran}, ${langkah.label}) failed: ${g.sebab}.`);
    if (langkah.peran === 'draft') konteks = { ...konteks, draft: bersih };

    if (eskalasi.length >= HYDRA_MAKS_ESKALASI) {
      catatanTahap.push(`Escalation limit ${HYDRA_MAKS_ESKALASI} reached; stopping with what we have.`);
      break;
    }
    eskalasi.push(`${langkah.peran} on ${langkah.label}: ${g.sebab}`);

    if (rencana.jalur === 'satu') break;

    if (langkah.peran === 'draft') {
      if (rencana.jalur === 'kritik-revisi') {
        /* The draft is the input to both later stages, so a failed draft makes
           the critique pointless: collapse the rest of the plan into ONE
           stronger attempt that answers the task outright. */
        if (rencana.kuat && !samaLangkah(rencana.kuat, langkah)) {
          antre.length = 0;
          antre.push({ ...rencana.kuat, peran: 'revisi', kenapa: 'draft failed, so one stronger model answers directly.' });
          catatanTahap.push('Draft failed: the critique is moot, so the strongest rung answers in one pass.');
        }
        continue;
      }
      continue; /* eskalasi route: the next rung is already queued. */
    }

    /* A revision that failed gets one rung up, if the ladder has one left. */
    const naik = rencana.tangga.find((l) => !dipakai.some((d) => samaLangkah(d, l)));
    if (naik) {
      antre.push({ ...naik, peran: langkah.peran, kenapa: `${langkah.kenapa} Escalated after failure.` });
      catatanTahap.push(`Escalating to ${naik.label}.`);
    }
  }

  return { teks, err, jalur: rencana.jalur, request, dipakai, eskalasi, catatanTahap, berhenti };
}

/* ------------------------------------------------------------------ *
 * Streaming capture for the intermediate passes
 * ------------------------------------------------------------------ */

/*
 * `cmd.aiChat` streams through the global 'ai-chunk' event, so a pass that must
 * NOT appear in the bubble needs its text collected somewhere else. That is
 * what this registry is: the store routes chunks to `hydraCatat` first (the same
 * shape `subagentOnChunk` already uses), the pass is buffered here by request
 * id, and the final pass uses the bubble's id so it streams to the reader.
 */
interface HydraBuf {
  teks: string;
  err: string | null;
  selesai: boolean;
  /**
   * Token usage the provider reported for this pass, if any.
   *
   * Kept per buffer so a caller can sum every leg of a run — the promise behind
   * "complete accounting". `undefined` means the provider did not report it,
   * which is not the same as zero.
   */
  usage?: { input: number; output: number };
  /**
   * A LIVE pass: this one is also being rendered in the chat bubble, so its
   * chunks must be recorded here AND passed on. A single-request plan is always
   * live — nothing can supersede it, so the reader gets normal token streaming.
   * Every other pass is buffered, because showing a draft that a later stage
   * may overrule would make the transcript flicker through three answers.
   */
  live: boolean;
}
const hydraBuf = new Map<string, HydraBuf>();

export function hydraSiapkan(id: string, live = false): void {
  hydraBuf.set(id, { teks: '', err: null, selesai: false, live });
}

export function hydraLupakan(id: string): void {
  hydraBuf.delete(id);
}

/** True when this chunk belonged to a buffered hydra pass and was consumed. */
export function hydraCatat(c: AiChunk): boolean {
  const buf = hydraBuf.get(c.id);
  if (!buf) return false;
  if (c.text) buf.teks += c.text;
  if (c.err) buf.err = buf.err ?? c.err;
  /* Last report wins: providers that send usage repeatedly send a running total. */
  if (c.usage) buf.usage = c.usage;
  if (c.done) buf.selesai = true;
  return !buf.live;
}

/**
 * Peek at a pass WITHOUT consuming it.
 *
 * `hydraAmbil` deletes the entry, so a caller that only wants to know whether
 * the terminal frame has landed yet needs this: it polls until `selesai` is
 * true and only then takes the result.
 */
export function hydraLihat(id: string):
  | { teks: string; err: string | null; selesai: boolean; live: boolean; usage?: { input: number; output: number } }
  | undefined {
  const buf = hydraBuf.get(id);
  return buf
    ? { teks: buf.teks, err: buf.err, selesai: buf.selesai, live: buf.live, usage: buf.usage }
    : undefined;
}

/** What a finished pass produced. Never throws: a missing buffer reads empty. */
export function hydraAmbil(id: string): { teks: string; err: string | null } {
  const buf = hydraBuf.get(id);
  hydraBuf.delete(id);
  return { teks: buf?.teks ?? '', err: buf?.err ?? null };
}

/** Ids in flight, for the harness and for diagnostics. */
export function hydraAktif(): string[] {
  return [...hydraBuf.keys()];
}
