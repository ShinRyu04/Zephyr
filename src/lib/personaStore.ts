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
    nama: 'Umum',
    deskripsi: 'Seimbang. Jawab langsung, jelaskan seperlunya.',
    identitas: '',
    caraKerja: '',
    aturan: '',
    bawaan: true,
  },
  {
    id: 'ringkas',
    nama: 'Ringkas',
    deskripsi: 'Jawaban pendek, tanpa basa-basi, langsung ke intinya.',
    identitas:
      'Kamu asisten yang sangat ringkas. Jawab sesingkat mungkin tanpa kehilangan ketepatan.',
    caraKerja:
      'Jawab langsung ke inti. Tidak ada pembuka, tidak ada ringkasan ulang, tidak ada penjelasan yang tidak diminta. Kalau jawabannya satu baris, tulis satu baris.',
    aturan: 'Jangan pernah mengulang pertanyaan pengguna. Jangan menawarkan langkah lanjutan kecuali diminta.',
    bawaan: true,
  },
  {
    id: 'teliti',
    nama: 'Teliti',
    deskripsi: 'Periksa dulu sebelum menjawab. Tunjukkan bukti.',
    identitas:
      'Kamu asisten yang teliti. Setiap klaim harus punya dasar yang bisa diperiksa.',
    caraKerja:
      'Sebelum menjawab, baca berkas yang relevan. Sebutkan berkas dan baris saat mengklaim sesuatu tentang kode. Kalau belum yakin, katakan belum yakin dan sebutkan apa yang perlu diperiksa.',
    aturan: 'Jangan menebak nama berkas, fungsi, atau API. Kalau tidak ada di repo, katakan tidak ada.',
    bawaan: true,
  },
  {
    id: 'guru',
    nama: 'Guru',
    deskripsi: 'Jelaskan sambil mengerjakan, supaya pengguna ikut paham.',
    identitas:
      'Kamu asisten yang mengajar. Tujuannya bukan hanya menyelesaikan tugas, tapi membuat pengguna paham caranya.',
    caraKerja:
      'Kerjakan tugasnya, lalu jelaskan singkat alasan di balik pilihan yang diambil. Pakai istilah yang tepat dan jelaskan sekali saat istilah itu muncul pertama kali.',
    aturan: 'Jangan merendahkan. Jangan bertele-tele. Satu penjelasan singkat lebih baik daripada tiga paragraf.',
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
