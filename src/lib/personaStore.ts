import { create } from 'zustand';
import { useStore } from './store';

/*
 * Personas: named identities the user can switch the assistant between.
 *
 * A persona is a layer on top of the built-in prompt, not a replacement. The
 * shipped prompt (systemPrompt.ts) keeps the tool list, the model block and the
 * project rules; a persona adds the "who am I talking to" part - the identity
 * and the way of working. That split matters: a persona must not be able to
 * accidentally drop the tool list, or the agent stops being able to act.
 *
 * "Layer" is literal: the identity and way-of-working blocks are STACKED, not
 * chosen between. `lapisan()` in systemPrompt.ts emits the persona's text, then
 * whatever the user typed under Settings -> Prompt, and falls back to the
 * shipped prose only when neither above it said anything. So editing Settings
 * still takes effect even while a persona is active - which is the point, and
 * was not true when these were an `||` chain.
 *
 * The active persona lives in `settings.personaAktif`; the definitions live in
 * `settings.personas`. Both travel with the rest of the settings file.
 */

export interface Persona {
  id: string;
  nama: string;
  /** One line shown under the name in the list. */
  deskripsi: string;
  /** Replaces the identity block of the system prompt. */
  identitas: string;
  /** Optional: replaces the "how it works" block. Empty keeps the default. */
  caraKerja: string;
  /** Optional: extra rules appended after the built-in ones. */
  aturan: string;
  /** Built-in personas cannot be deleted, only copied. */
  bawaan: boolean;
}

/**
 * The personas that ship with Zephyr. Zephyr ships a single built-in persona,
 * Zeph, the orchestrator that owns the task end to end. It is what a fresh
 * install runs on. Users are still free to add their own personas in Settings.
 */
export const PERSONA_BAWAAN: Persona[] = [
  {
    id: 'zeph',
    nama: 'Zeph',
    deskripsi:
      'Orchestrator. Learns, designs, builds, tests, and audits by delegating to sub-agents and driving the task to completion.',
    identitas:
      'You are Zeph, the primary orchestrator. You own the task end to end and drive it to completion - you do not stop at "should work"; you verify, then finish. You can take on anything - learning and reading the codebase, designing, implementing, testing, and auditing.',
    caraKerja: [
      '- Work from the goal, not a recipe. Decompose the work, then run independent parts in parallel.',
      '- If `run_subagents` is in your tool list, route each kind of work to the agent whose category fits it (the roster is in that tool\'s description), then synthesize their summaries yourself. Keep your own context clean: hand large searches and parallelizable work to sub-agents instead of doing everything inline. If it is not in your tool list, do the work inline and never mention sub-agents.',
      '- Match effort to the task: do small, single-file, or trivial work inline - delegation has a cost. Be terse; the approval card is the confirmation.',
    ].join('\n'),
    aturan: '',
    bawaan: true,
  },
];

/** Ids of built-in personas that older Zephyr versions shipped. */
const ID_LAMA = ['umum', 'ringkas', 'teliti', 'guru'];

interface PersonaState {
  daftar: Persona[];
  /** Id of the persona currently applied to the system prompt. */
  aktif: string;
  /** Id being edited, or null when the editor is closed. */
  sunting: string | null;
  /** True while the editor is open for a brand-new persona. */
  baru: boolean;
  muat: () => void;
  setAktif: (id: string) => Promise<void>;
  bukaBaru: () => void;
  bukaSunting: (id: string) => void;
  tutup: () => void;
  simpan: (data: Omit<Persona, 'id' | 'bawaan'>) => Promise<void>;
  hapus: (id: string) => Promise<void>;
  /** Duplicate a built-in so it can be edited without losing the original. */
  duplikat: (id: string) => Promise<void>;
}

function bacaPersona(): Persona[] {
  const s = useStore.getState().settings as unknown as {
    personas?: Persona[];
  };
  const tersimpan = Array.isArray(s.personas) ? s.personas : [];
  // Built-ins always present, in their shipped order; a stored copy with the
  // same id wins so an edit to a built-in survives a restart.
  const olehId = new Map(tersimpan.map((p) => [p.id, p]));
  const bawaan = PERSONA_BAWAAN.map((p) => olehId.get(p.id) ?? p);
  // Custom personas are kept, but stored copies of the old built-ins are
  // dropped so they do not linger in the list. Legacy ids that may still sit
  // in `settings.personaAktif` are remapped in `bacaAktif`.
  const kustom = tersimpan.filter(
    (p) => !PERSONA_BAWAAN.some((b) => b.id === p.id) && !ID_LAMA.includes(p.id),
  );
  return [...bawaan, ...kustom];
}

function bacaAktif(): string {
  const s = useStore.getState().settings as unknown as { personaAktif?: string };
  const id = s.personaAktif ?? 'zeph';
  // Legacy ids from older versions ('umum', 'ringkas', 'teliti', 'guru') and
  // any id that no longer resolves to a known persona fall back to Zeph. A
  // custom persona still in the list keeps its own id.
  if (ID_LAMA.includes(id)) return 'zeph';
  const dikenal =
    PERSONA_BAWAAN.some((p) => p.id === id) ||
    bacaPersona().some((p) => p.id === id);
  return dikenal ? id : 'zeph';
}

function idBaru(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const usePersona = create<PersonaState>((set, get) => ({
  daftar: [],
  aktif: 'zeph',
  sunting: null,
  baru: false,

  muat: () => set({ daftar: bacaPersona(), aktif: bacaAktif() }),

  setAktif: async (id) => {
    set({ aktif: id });
    await useStore
      .getState()
      .applySettings({ personaAktif: id } as never)
      .catch(() => useStore.getState().setStatus('could not save the active persona'));
  },

  bukaBaru: () => set({ sunting: null, baru: true }),

  bukaSunting: (id) => set({ sunting: id, baru: false }),

  tutup: () => set({ sunting: null, baru: false }),

  simpan: async (data) => {
    const { sunting, daftar } = get();
    const next = sunting
      ? daftar.map((x) => (x.id === sunting ? { ...x, ...data } : x))
      : [...daftar, { ...data, id: idBaru(), bawaan: false }];
    set({ daftar: next, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ personas: next } as never)
      .catch(() => useStore.getState().setStatus('could not save the persona'));
  },

  hapus: async (id) => {
    const target = get().daftar.find((x) => x.id === id);
    if (target?.bawaan) return;
    const next = get().daftar.filter((x) => x.id !== id);
    // Deleting the active persona falls back to the built-in orchestrator, so
    // the prompt never points at an id that no longer exists.
    const aktif = get().aktif === id ? 'zeph' : get().aktif;
    set({ daftar: next, aktif, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ personas: next, personaAktif: aktif } as never)
      .catch(() => useStore.getState().setStatus('could not delete the persona'));
  },

  duplikat: async (id) => {
    const src = get().daftar.find((x) => x.id === id);
    if (!src) return;
    const salinan: Persona = {
      ...src,
      id: idBaru(),
      nama: `${src.nama} (salinan)`,
      bawaan: false,
    };
    const next = [...get().daftar, salinan];
    set({ daftar: next });
    await useStore
      .getState()
      .applySettings({ personas: next } as never)
      .catch(() => useStore.getState().setStatus('could not duplicate the persona'));
  },
}));

/** The active persona, or the neutral default when the id is unknown. */
export function personaAktif(): Persona {
  const { daftar, aktif } = usePersona.getState();
  return daftar.find((p) => p.id === aktif) ?? PERSONA_BAWAAN[0];
}

/**
 * The blocks a persona contributes to the system prompt. Empty strings mean
 * "keep the built-in block", which is what the neutral persona returns.
 */
export function blokPersona(): { identitas: string; caraKerja: string; aturan: string } {
  const p = personaAktif();
  return {
    identitas: p.identitas.trim(),
    caraKerja: p.caraKerja.trim(),
    aturan: p.aturan.trim(),
  };
}
