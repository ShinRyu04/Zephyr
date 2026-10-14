import { create } from 'zustand';
import { useStore } from './store';
import type { PeranId } from './subagentRoles';

/*
 * Custom sub-agents: workers the user defines themselves, alongside the six
 * built-in roles. A built-in role is a fixed prompt Zephyr ships; a custom one
 * is a name, a one-line purpose, a tool allowlist and a system prompt the user
 * writes. The orchestrator treats both the same way once a task is launched, * only the prompt and the allowed tools differ.
 *
 * Storage lives under `settings.subagentCustom` so a definition travels with
 * the rest of the settings file and is restored by the same load path.
 */

/** Read-only tools a custom worker may be granted. Writing stays opt-in. */
export type AlatId =
  | 'read_file'
  | 'list_directory'
  | 'grep'
  | 'glob'
  | 'bash_logs'
  | 'bash_list'
  | 'notes_read'
  | 'web_fetch';

export interface AlatInfo {
  id: AlatId;
  label: string;
  hint: string;
  ikon: string;
}

/**
 * The tools offered in the picker. Deliberately read-only: a custom worker
 * runs with a fresh history and no supervision, so handing it write access by
 * default would be a foot-gun. `kerja` (the built-in writer role) still has it.
 */
export const ALAT: AlatInfo[] = [
  { id: 'read_file', label: 'Read a file', hint: 'Open the contents of one file', ikon: '▤' },
  { id: 'list_directory', label: 'List a folder', hint: 'List the contents of a folder', ikon: '☰' },
  { id: 'grep', label: 'Search text', hint: 'Search file contents across the workspace', ikon: '⌘' },
  { id: 'glob', label: 'Find files', hint: 'Find files by name or path pattern', ikon: '▭' },
  { id: 'bash_logs', label: 'Read a log', hint: 'Read the output of a background process', ikon: '≡' },
  { id: 'bash_list', label: 'List processes', hint: 'List background processes and their exit codes', ikon: '⚠' },
  { id: 'notes_read', label: 'Read memory', hint: 'Notes that persist across sessions', ikon: '◈' },
  { id: 'web_fetch', label: 'Fetch a page', hint: 'Fetch the text of one URL', ikon: '✦' },
];

export interface SubagentCustom {
  id: string;
  /** Shown as the badge on a task row and in the tool picker. */
  nama: string;
  /** One line. The orchestrator reads this to decide when to delegate here. */
  deskripsi: string;
  /** Which read-only tools this worker may call. */
  alat: AlatId[];
  /** Persona and rules. Replaces the built-in role prompt. */
  prompt: string;
  /**
   * Model override. Empty means "same as chat", which is the default: a
   * worker on the chat model costs nothing extra to configure.
   */
  model: string;
  /** Provider that goes with `model`; empty means the active provider. */
  provider: string;
  /** Whether the orchestrator may pick this worker at all. */
  aktif: boolean;
  /**
   * Icon id from `subagentIcons.ts`.
   *
   * Stored on the definition rather than derived from the name: two workers
   * called "Audit API" and "Audit UI" should be told apart at a glance in the
   * task list, and only the user knows which one is which.
   */
  ikon: string;
}

/** A blank definition, so the modal and the store agree on the shape. */
export function kosongkanSubagent(): Omit<SubagentCustom, 'id'> {
  return {
    nama: '',
    deskripsi: '',
    alat: ['read_file', 'list_directory'],
    prompt: '',
    model: '',
    provider: '',
    aktif: true,
    /*
     * The robot, not the star.
     *
     * A new worker is by definition an agent the user is about to describe, so
     * it starts on the mark that means "agent". The star stays available in the
     * picker for someone who wants a neutral badge.
     */
    ikon: 'robot',
  };
}

/** A readable id that cannot collide with a built-in role name. */
function idBaru(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

interface CustomState {
  daftar: SubagentCustom[];
  /** Id being edited, or null when the modal is closed. */
  sunting: string | null;
  /** True while the modal is open for a brand-new definition. */
  baru: boolean;
  muat: () => void;
  bukaBaru: () => void;
  bukaSunting: (id: string) => void;
  tutup: () => void;
  simpan: (data: Omit<SubagentCustom, 'id'>) => Promise<void>;
  hapus: (id: string) => Promise<void>;
  setAktif: (id: string, aktif: boolean) => Promise<void>;
}

/** The stored list, tolerating a settings file written before this existed. */
export function bacaDaftar(): SubagentCustom[] {
  const s = useStore.getState().settings as unknown as {
    subagentCustom?: SubagentCustom[];
  };
  const daftar = Array.isArray(s.subagentCustom) ? s.subagentCustom : [];
  /*
   * `fetch` dan `web_fetch` adalah tool yang sama; yang pertama dihapus dan
   * definisi lama masih menyimpan id itu. Tanpa penerjemahan di sini, pekerja
   * yang dulu diberi izin "Fetch a page" kehilangan toolnya diam-diam -
   * penyaring nama tidak mengenali id itu dan hasilnya daftar kosong, tanpa
   * satu pun pesan bahwa ada yang hilang.
   */
  return daftar.map((d) => ({
    ...d,
    alat: (Array.isArray(d.alat) ? d.alat : []).map((a) =>
      String(a) === 'fetch' ? ('web_fetch' as AlatId) : a,
    ),
  }));
}

/**
 * The workers the orchestrator is allowed to reach, by name.
 *
 * This is the only bridge between the settings page and the runtime. Until it
 * existed the definitions were written and never read again: `subagent_run`
 * spawned generic workers, the custom ones sat in Settings, and there was no
 * path from one to the other. Case-insensitive on purpose, a model writing
 * `[ryuga]` should not silently get a generic worker instead of failing.
 */
export function customAktif(): SubagentCustom[] {
  return bacaDaftar().filter((d) => d.aktif && d.nama.trim());
}

/** Find one by the name the model typed, or null when nothing matches. */
export function cariCustom(nama: string): SubagentCustom | null {
  const kunci = nama.trim().toLowerCase();
  if (!kunci) return null;
  return customAktif().find((d) => d.nama.trim().toLowerCase() === kunci) ?? null;
}

/**
 * Split a `[Ryuga] do the thing` task line into the worker and the task.
 *
 * Same shape as the built-in `[cari]` prefix, so one task line can name either
 * kind of worker and the caller does not care which it got. Built-in roles are
 * tried first: a user is free to name a custom worker "Cari", and silently
 * shadowing the shipped role would be a worse surprise than the duplicate.
 */
export function pisahCustom(tugas: string): { custom: SubagentCustom | null; sisa: string } {
  const m = /^\s*\[([^\]]{1,40})\]\s*/.exec(tugas);
  if (!m) return { custom: null, sisa: tugas };
  const nama = m[1];
  if (PERAN_BAWAAN.includes(nama.trim().toLowerCase())) return { custom: null, sisa: tugas };
  return { custom: cariCustom(nama), sisa: tugas.slice(m[0].length) };
}

/**
 * The six built-in role names, lowercase.
 *
 * Single source of truth. `simpan` refuses to create a custom worker under one
 * of these names, and the delegation prompt lists the same six - when these were
 * written out separately they could drift, and the drift would show up as a
 * worker silently losing its brief rather than as a mismatch anyone could see.
 */
export const PERAN_BAWAAN = ['cari', 'telaah', 'rencana', 'audit', 'kerja', 'jelajah'];

/**
 * The persona block that replaces the built-in role prompt.
 *
 * ALWAYS IN ENGLISH, whatever the interface language is. This text is not shown
 * to anyone - it is an instruction to a model - and the interface language has
 * no business reaching it. It used to switch to Indonesian when `uiLang` was
 * `id`, which meant a user who set Indonesian got a worker briefed in
 * Indonesian while every other user got one briefed in English. That is a
 * difference in BEHAVIOUR that follows a display preference, and it is not one
 * the user asked for or could see. Two users running the same task should get
 * the same worker.
 *
 * When a definition has no prompt of its own it says so rather than leaving the
 * worker with nothing: an empty persona makes it behave like a generic reader,
 * which is the same result as never wiring it up at all, and the user would
 * have no way to tell the two apart.
 */
export function arahanCustom(d: SubagentCustom, total: number): string {
  const alat = ALAT.filter((a) => d.alat.includes(a.id)).map((a) => a.id).join(', ');
  const prompt = d.prompt.trim();
  const inti = prompt
    ? prompt
    : 'You have no specific persona. Be thorough and report only what the task asked for.';

  return [
    `YOUR WORKER IDENTITY: ${d.nama}`,
    prompt ? '' : '(no system prompt set for this worker - the Settings page is where to add one)',
    '',
    inti,
    '',
    `You may call ONLY these tools: ${alat}. Anything else is rejected.`,
    'You cannot write or edit any file. Report findings in your final answer.',
    `${total} subagent(s) are running at the same time; stay on your own task.`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export const useSubagentCustom = create<CustomState>((set, get) => ({
  daftar: [],
  sunting: null,
  baru: false,

  muat: () => set({ daftar: bacaDaftar() }),

  bukaBaru: () => set({ sunting: null, baru: true }),

  bukaSunting: (id) => set({ sunting: id, baru: false }),

  tutup: () => set({ sunting: null, baru: false }),

  simpan: async (data) => {
    const { sunting, daftar } = get();

    /*
     * A custom worker may not take a built-in role's name.
     *
     * `pisahCustom` matches roles by NAME, so a custom worker called `kerja`
     * does not sit alongside the built-in one - it quietly replaces the label,
     * icon and brief of every task that names `kerja`. This is why editing was
     * once removed outright: the only guard lived in the READ path, where it
     * could not prevent the collision, only lose to it.
     *
     * Guarding the WRITE is the actual fix. The built-in role wins the tie,
     * matching the precedence `pisahCustom` documents, so the user is told now,
     * while the name is still in front of them - instead of discovering later
     * that a task ran under the wrong brief.
     */
    const namaBersih = String(data.nama ?? '').trim().toLowerCase();
    if (PERAN_BAWAAN.includes(namaBersih)) {
      useStore.getState().setStatus(`"${data.nama}" is a built-in role name - a custom sub-agent cannot take it.`);
      return;
    }

    /* Two custom workers under one name are equally ambiguous: `cariCustom`
       returns the first match, so the second is unreachable by name. */
    if (daftar.some((x) => x.id !== sunting && String(x.nama ?? '').trim().toLowerCase() === namaBersih)) {
      useStore.getState().setStatus(`Another custom sub-agent is already called "${data.nama}".`);
      return;
    }

    const next = sunting
      ? daftar.map((x) => (x.id === sunting ? { ...data, id: sunting } : x))
      : [...daftar, { ...data, id: idBaru() }];
    // Optimistic: the list is local state the modal already reflects, so the
    // panel does not wait on the settings round trip to show the new row.
    set({ daftar: next, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ subagentCustom: next } as never)
      .catch(() => useStore.getState().setStatus('could not save the custom sub-agent'));
  },

  hapus: async (id) => {
    const next = get().daftar.filter((x) => x.id !== id);
    set({ daftar: next, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ subagentCustom: next } as never)
      .catch(() => useStore.getState().setStatus('could not delete the custom sub-agent'));
  },

  setAktif: async (id, aktif) => {
    const next = get().daftar.map((x) => (x.id === id ? { ...x, aktif } : x));
    set({ daftar: next });
    await useStore
      .getState()
      .applySettings({ subagentCustom: next } as never)
      .catch(() => useStore.getState().setStatus('could not save the custom sub-agent'));
  },
}));

/**
 * The custom worker whose name matches a task prefix, if any. The orchestrator
 * writes `nama: task` for a built-in role and `@nama: task` for a custom one,
 * so a custom worker is never shadowed by a role that happens to share a name.
 */
export function customDariPrefix(teks: string): { custom: SubagentCustom; tugas: string } | null {
  const m = /^@([\p{L}\p{N}_-]+)\s*:\s*([\s\S]+)$/u.exec(teks.trim());
  if (!m) return null;
  const [, nama, tugas] = m;
  const found = useSubagentCustom
    .getState()
    .daftar.find((x) => x.nama.toLowerCase() === nama.toLowerCase());
  return found ? { custom: found, tugas: tugas.trim() } : null;
}

/**
 * Every worker the orchestrator may choose from: the six built-in roles plus
 * the enabled custom ones. Used to build the delegation prompt so the model
 * knows the custom workers by name.
 */
export function daftarPekerja(): { id: string; label: string; hint: string; ikon: string; custom: boolean }[] {
  /*
   * The six built-in roles. Labels are the stable English ids the orchestrator
   * writes into a task line, NOT translated text: `cari`, `telaah` and the rest
   * are matched by name in `peranBawaan`, so translating the label here would
   * break the match while looking like it had been tidied up.
   */
  const bawaan = [
    { id: 'cari', label: 'Cari', hint: 'Telusuri kode', ikon: '⌕', custom: false },
    { id: 'telaah', label: 'Telaah', hint: 'Analisis mendalam', ikon: '◈', custom: false },
    { id: 'rencana', label: 'Rencana', hint: 'Susun langkah', ikon: '≡', custom: false },
    { id: 'audit', label: 'Audit', hint: 'Periksa mutu', ikon: '✓', custom: false },
    { id: 'kerja', label: 'Kerja', hint: 'Change a file', ikon: '⚒', custom: false },
    { id: 'jelajah', label: 'Jelajah', hint: 'Petakan proyek', ikon: '⊕', custom: false },
  ];
  const kustom = (() => {
    /*
     * The store is the fast path, not the source of truth.
     *
     * It starts empty and is only filled when Settings → Subagents is opened, so
     * a user who defines a worker and goes straight to the AI panel got an empty
     * roster, the definition existed on disk the whole time. Reading the file
     * here is what makes a custom worker usable in the session that defines it.
     */
    const di = useSubagentCustom.getState().daftar;
    const sumber = di.length > 0 ? di : bacaDaftar();
    if (di.length === 0 && sumber.length > 0) {
      useSubagentCustom.setState({ daftar: sumber });
    }
    return sumber
      .filter((x) => x.aktif)
      .map((x) => ({
        id: x.id,
        label: x.nama,
        hint: x.deskripsi,
        // `custom` keys the robot glyph in peranIcons; a star character here
        // was the one mark in the picker that came from a font instead of the
        // SVG set, so it sat at a different weight than every icon beside it.
        ikon: 'custom',
        custom: true,
      }));
  })();
  return [...bawaan, ...kustom];
}

export type { PeranId };
