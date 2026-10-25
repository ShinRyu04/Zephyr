import { create } from 'zustand';
import * as cmd from './commands';
import { useStore } from './store';
import { useAi, baseUrlModel, fullUrlProvider } from './aiStore';
import { findModel, MODEL_FALLBACK } from './modelCatalog';
import { onChunkBanding } from './chunkBus';
import type { AiMessage } from './types';

/*
 * Compare: one prompt, two models, side by side.
 *
 * WHY THIS DOES NOT GO THROUGH `send()`: that path owns ONE conversation — it
 * appends the user bubble and the streaming reply to a session, sets `pending`,
 * and updates the surface's composer. A comparison needs the same prompt
 * answered TWICE at once, so calling `send()` twice would put two answers in
 * one transcript and make the second send refuse ("still answering"). The
 * request itself is the same Rust command every chat turn uses, so this file
 * builds the same payload shape and reads the same `ai-chunk` events — only
 * the bookkeeping is its own.
 *
 * Results are kept in localStorage: the reason to compare is choosing a model
 * for a while, and that decision outlives one window.
 */

const KUNCI = 'zephyr.compare';
const MAKS_ENTRI = 20;

export interface SisiBanding {
  provider: string;
  model: string;
  label: string;
  teks: string;
  err: string | null;
  selesai: boolean;
  ms: number | null;
}

export interface EntriBanding {
  id: string;
  prompt: string;
  at: number;
  kiri: SisiBanding;
  kanan: SisiBanding;
}

interface BandingState {
  buka: boolean;
  prompt: string;
  /** Chosen models. Empty means "whatever the chat is using right now". */
  modelKiri: string;
  modelKanan: string;
  providerKiri: string;
  providerKanan: string;
  berjalan: boolean;
  entri: EntriBanding[];
  setBuka: (v: boolean) => void;
  setPrompt: (v: string) => void;
  setModel: (sisi: 'kiri' | 'kanan', model: string, provider: string) => void;
  jalankan: () => Promise<void>;
  hentikan: () => Promise<void>;
  hapus: (id: string) => void;
}

export const labelDari = (model: string, provider: string) => {
  const def = findModel(model, provider || undefined);
  return `${def.providerLabel ?? def.provider} · ${def.label ?? def.id}`;
};

function muat(): EntriBanding[] {
  try {
    const raw = localStorage.getItem(KUNCI);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (e): e is EntriBanding => !!e && typeof e === 'object' && typeof (e as EntriBanding).id === 'string',
    );
  } catch {
    return [];
  }
}

function simpan(entri: EntriBanding[]): void {
  try {
    localStorage.setItem(KUNCI, JSON.stringify(entri.slice(0, MAKS_ENTRI)));
  } catch {
    /* Storage full or blocked: the comparison still works for this run. */
  }
}

/**
 * Request ids of the run in flight, mapped to which column they feed.
 *
 * A module-level map rather than a component subscription: chunks can arrive
 * on the very first frame after `ai_chat` resolves, so the collector has to be
 * listening before the request is sent — waiting for a mounted component to
 * subscribe would drop the beginning of the answer.
 */
const rute = new Map<string, { entri: string; sisi: 'kiri' | 'kanan' }>();
const mulai = new Map<string, number>();
let seq = 0;
const nextReq = () => `cmp-${Date.now().toString(36)}-${++seq}`;

let terpasang = false;

function pasangSekali(): void {
  if (terpasang) return;
  terpasang = true;
  onChunkBanding((c) => {
    const r = rute.get(c.id);
    if (!r) return;
    const st = useBanding.getState();
    const entri = st.entri.find((e) => e.id === r.entri);
    if (!entri) return;
    const kini = entri[r.sisi];
    const patch: Partial<SisiBanding> = {};
    if (c.text) patch.teks = kini.teks + c.text;
    if (c.err) patch.err = c.err;
    if (c.done || c.err) {
      patch.selesai = true;
      patch.ms = Date.now() - (mulai.get(c.id) ?? Date.now());
      rute.delete(c.id);
      /*
       * The run is over when BOTH columns have landed. Counting here rather
       * than awaiting `ai_chat` is what makes the Stop button and the spinner
       * honest: `ai_chat` resolves when the provider stream closes, but the
       * text arrives through these frames.
       */
      const sisa = [...rute.values()].filter((x) => x.entri === r.entri).length;
      if (sisa === 0) useBanding.setState({ berjalan: false });
    }
    useBanding.setState({
      entri: st.entri.map((e) => (e.id === r.entri ? { ...e, [r.sisi]: { ...kini, ...patch } } : e)),
    });
    if (patch.selesai) simpan(useBanding.getState().entri);
  });
}

export const useBanding = create<BandingState>((set, get) => ({
  buka: false,
  prompt: '',
  modelKiri: '',
  modelKanan: '',
  providerKiri: '',
  providerKanan: '',
  berjalan: false,
  entri: muat(),

  setBuka: (v) => set({ buka: v }),
  setPrompt: (v) => set({ prompt: v }),

  setModel: (sisi, model, provider) =>
    set(
      sisi === 'kiri'
        ? { modelKiri: model, providerKiri: provider }
        : { modelKanan: model, providerKanan: provider },
    ),

  jalankan: async () => {
    pasangSekali();
    const st = get();
    const prompt = st.prompt.trim();
    if (!prompt || st.berjalan) return;

    const ai = useAi.getState();
    /*
     * The left column defaults to the chat's current pick, so a first
     * comparison needs no setup. The right column defaults to a DIFFERENT
     * model that has a key — two identical columns compare nothing.
     */
    const kiri = { model: st.modelKiri || ai.model, provider: st.providerKiri || ai.provider };
    const kanan = st.modelKanan
      ? { model: st.modelKanan, provider: st.providerKanan || ai.provider }
      : { model: '', provider: '' };

    if (!kanan.model) {
      /*
       * Candidates come from `MODEL_FALLBACK`, which splits each catalogue
       * entry by provider and skips the "type a name" placeholders. A provider
       * counts only when it has a key AND an endpoint; if none does, the first
       * different catalogue model is still better than two identical columns.
       */
      const beda = MODEL_FALLBACK.filter(
        (m) => !m.freeText && (m.id !== kiri.model || m.provider !== kiri.provider),
      );
      const siap =
        beda.find((m) => ai.hasKey(m.provider)) ?? beda[0] ?? { id: kiri.model, provider: kiri.provider };
      kanan.model = siap.id;
      kanan.provider = siap.provider;
    }

    set({
      modelKiri: kiri.model,
      providerKiri: kiri.provider,
      modelKanan: kanan.model,
      providerKanan: kanan.provider,
    });

    const id = `cmp-entri-${Date.now().toString(36)}-${++seq}`;
    const sisi = (m: { model: string; provider: string }): SisiBanding => ({
      ...m,
      label: labelDari(m.model, m.provider),
      teks: '',
      err: null,
      selesai: false,
      ms: null,
    });
    set((s) => ({
      entri: [{ id, prompt, at: Date.now(), kiri: sisi(kiri), kanan: sisi(kanan) }, ...s.entri].slice(
        0,
        MAKS_ENTRI,
      ),
      berjalan: true,
    }));
    simpan(get().entri);

    const satu = async (sisiNama: 'kiri' | 'kanan', m: { model: string; provider: string }) => {
      const reqId = nextReq();
      rute.set(reqId, { entri: id, sisi: sisiNama });
      mulai.set(reqId, Date.now());
      const def = findModel(m.model, m.provider);
      const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};
      const pesan: AiMessage[] = [{ role: 'user', content: prompt }];
      try {
        await cmd.aiChat({
          id: reqId,
          provider: def.provider,
          model: def.id,
          messages: pesan,
          baseUrl: baseUrlModel(def.provider, def.id, cfg.baseUrl),
          fullUrl: fullUrlProvider(def.provider),
          maxTokens: def.maxOut ?? 2048,
        });
        /*
         * Some providers close the stream without a `done` frame. Mark the
         * column finished here too, but only if it has not already been marked
         * — the frame path is more accurate because it knows the last token.
         */
        const e = get().entri.find((x) => x.id === id);
        const kini = e?.[sisiNama];
        if (kini && !kini.selesai) {
          rute.delete(reqId);
          set((s) => ({
            entri: s.entri.map((x) =>
              x.id === id
                ? {
                    ...x,
                    [sisiNama]: { ...x[sisiNama], selesai: true, ms: Date.now() - (mulai.get(reqId) ?? Date.now()) },
                  }
                : x,
            ),
          }));
          if (![...rute.values()].some((x) => x.entri === id)) set({ berjalan: false });
          simpan(get().entri);
        }
      } catch (err) {
        rute.delete(reqId);
        set((s) => ({
          entri: s.entri.map((x) =>
            x.id === id
              ? {
                  ...x,
                  [sisiNama]: {
                    ...x[sisiNama],
                    err: cmd.asZephyrError(err).message,
                    selesai: true,
                    ms: Date.now() - (mulai.get(reqId) ?? Date.now()),
                  },
                }
              : x,
          ),
        }));
        if (![...rute.values()].some((x) => x.entri === id)) set({ berjalan: false });
        simpan(get().entri);
      }
    };

    await Promise.all([satu('kiri', kiri), satu('kanan', kanan)]);
  },

  hentikan: async () => {
    const ids = [...rute.keys()];
    for (const id of ids) {
      try {
        await cmd.aiCancel(id);
      } catch {
        /* Already finished; nothing to cancel. */
      }
    }
    rute.clear();
    set((s) => ({
      berjalan: false,
      entri: s.entri.map((e, i) =>
        i === 0
          ? {
              ...e,
              kiri: { ...e.kiri, selesai: true },
              kanan: { ...e.kanan, selesai: true },
            }
          : e,
      ),
    }));
    simpan(get().entri);
  },

  hapus: (id) => {
    set((s) => ({ entri: s.entri.filter((e) => e.id !== id) }));
    simpan(get().entri);
  },
}));
