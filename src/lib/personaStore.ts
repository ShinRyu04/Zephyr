import { create } from 'zustand';
import { useStore } from './store';

/*
 * Personas: named identities the user can switch the assistant between.
 *
 * A persona is a layer on top of the built-in prompt, not a replacement. The
 * shipped prompt (systemPrompt.ts) keeps the tool list, the model block and the
 * project rules; a persona adds the "who am I talking to" part — the identity
 * and the way of working. That split matters: a persona must not be able to
 * accidentally drop the tool list, or the agent stops being able to act.
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
 * The personas that ship with Zephyr. Kept short on purpose: each one changes
 * the *approach*, not the competence. `umum` is the neutral default and is
 * what a fresh install runs on.
 */
export const PERSONA_BAWAAN: Persona[] = [
  {
    id: 'umum',
    nama: 'General',
    deskripsi: 'Balanced. Answer directly, explain only what is needed.',
    identitas: '',
    caraKerja: '',
    aturan: '',
    bawaan: true,
  },
  {
    id: 'ringkas',
    nama: 'Concise',
    deskripsi: 'Short answers, no filler, straight to the point.',
    identitas:
      'You are a very concise assistant. Answer as briefly as possible without losing accuracy.',
    caraKerja:
      'Get straight to the point. No preamble, no restating, no explanation nobody asked for. When the answer fits on one line, use one line.',
    aturan: "Never repeat the user's question. Do not offer next steps unless asked.",
    bawaan: true,
  },
  {
    id: 'teliti',
    nama: 'Thorough',
    deskripsi: 'Check before answering. Show the evidence.',
    identitas:
      'You are a thorough assistant. Every claim must rest on something that can be checked.',
    caraKerja:
      'Read the relevant files before answering. Name the file and line when you claim something about code. If you are not sure yet, say you are not sure and name what needs checking.',
    aturan: 'Do not guess file, function, or API names. If it is not in the repo, say it is not there.',
    bawaan: true,
  },
  {
    id: 'guru',
    nama: 'Teacher',
    deskripsi: 'Explain as you work, so the user follows along.',
    identitas:
      'You are a teaching assistant. The goal is not only to finish the task but to make the user understand it.',
    caraKerja:
      'Do the task, then briefly explain the reasoning behind your choices. Use precise terms and define each one the first time it appears.',
    aturan: 'Do not talk down to the reader. Do not ramble. One short explanation beats three paragraphs.',
    bawaan: true,
  },
];

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
  const kustom = tersimpan.filter((p) => !PERSONA_BAWAAN.some((b) => b.id === p.id));
  return [...bawaan, ...kustom];
}

function bacaAktif(): string {
  const s = useStore.getState().settings as unknown as { personaAktif?: string };
  return s.personaAktif ?? 'umum';
}

function idBaru(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const usePersona = create<PersonaState>((set, get) => ({
  daftar: [],
  aktif: 'umum',
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
    // Deleting the active persona falls back to the neutral default, so the
    // prompt never points at an id that no longer exists.
    const aktif = get().aktif === id ? 'umum' : get().aktif;
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
