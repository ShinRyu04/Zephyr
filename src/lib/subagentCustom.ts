import { create } from 'zustand';
import { tx } from './i18n';
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
  | 'web_fetch'
  /*
   * Write and shell access, available to a CUSTOM AGENT the reader defines.
   *
   * The built-in picker above stayed read-only on purpose: a worker spawned by
   * the orchestrator runs unsupervised, so handing it write access by default is
   * a foot-gun. An agent the READER creates and names is a different thing - it
   * is a role they chose, and the reference editor offers Read / Edit / Terminal
   * / Preview / Web search for exactly that reason.
   *
   * The guard is not removed by this: every write still passes the same approval
   * mode and tool gate as any other call. This only makes the CAPABILITY
   * selectable.
   */
  | 'multi_edit'
  | 'bash_run'
  | 'browser'
  | 'web_search';

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
  { id: 'web_fetch', label: 'Fetch a page', hint: 'Fetch the text of one URL', ikon: '✦' },
  { id: 'multi_edit', label: 'Edit files', hint: 'Change the contents of files', ikon: '✎' },
  { id: 'bash_run', label: 'Run commands', hint: 'Run a shell command and read its output', ikon: '⌨' },
  { id: 'browser', label: 'Open a page', hint: 'Load a URL in the built-in browser', ikon: '◉' },
  { id: 'web_search', label: 'Search the web', hint: 'Find pages by query', ikon: '⌕' },
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
  /**
   * Whether OTHER agents may delegate to this one.
   *
   * Distinct from `aktif`: `aktif` means "the reader may pick this worker",
   * this means "another agent may call it as a sub-agent". A worker that is
   * active but not callable is one the reader launches by hand - a distinction
   * the agent editor exposes because conflating the two made every worker
   * delegable, which is how a run ended up fanning out to six subagents.
   */
  bisaDipanggil?: boolean;
  /**
   * Stable identifier other agents use when calling this one.
   *
   * A machine name (`project-analyzer`), separate from the display `nama`,
   * because a model reading a tool list needs an unambiguous token and the
   * display name is free text that may contain spaces or change.
   */
  idInggris?: string;
  /**
   * The sentence that tells another agent WHEN to call this one.
   *
   * This is the routing text the orchestrator actually reads, so it is its own
   * field rather than being folded into `deskripsi` (which is the one-line
   * badge text shown in the task list).
   */
  kapanDipanggil?: string;
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

/**
 * True when a stored `subagentCustom` entry was really created as an AGENT.
 *
 * The Agents page ("Create Agent") used to write into this list, so an agent
 * the reader made to talk to showed up as a worker in `SubAgentBar`. The two
 * fields below are written ONLY by that editor, so their presence is the
 * reliable signal; the worker editor never touches them.
 *
 * This is a migration heuristic, not a rule: it runs once, and the entries it
 * moves are gone from this list afterwards.
 */
export function bergayaAgent(d: SubagentCustom): boolean {
  const punyaId = String((d as { idInggris?: string }).idInggris ?? '').trim() !== '';
  const punyaKapan = String((d as { kapanDipanggil?: string }).kapanDipanggil ?? '').trim() !== '';
  return punyaId || punyaKapan;
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
  return daftar
    .filter((d) => !bergayaAgent(d))
    .map((d) => ({
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
    d.alat.includes('multi_edit')
      ? 'You may edit files within the scope of your task only.'
      : 'You cannot write or edit any file. Report findings in your final answer.',
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
    const namaMentah = String(data.nama ?? '').trim();
    if (namaMentah.includes(']')) {
      useStore.getState().setStatus(tx('A custom sub-agent name cannot contain "]".'));
      return;
    }
    const namaSimpan = namaMentah.slice(0, 40);
    const dataSimpan = { ...data, nama: namaSimpan };
    const namaBersih = namaSimpan.toLowerCase();
    if (PERAN_BAWAAN.includes(namaBersih)) {
      useStore.getState().setStatus(`"${namaSimpan}" is a built-in role name - a custom sub-agent cannot take it.`);
      return;
    }

    /* Two custom workers under one name are equally ambiguous: `cariCustom`
       returns the first match, so the second is unreachable by name. */
    if (daftar.some((x) => x.id !== sunting && String(x.nama ?? '').trim().toLowerCase() === namaBersih)) {
      useStore.getState().setStatus(`Another custom sub-agent is already called "${namaSimpan}".`);
      return;
    }

    const next = sunting
      ? daftar.map((x) => (x.id === sunting ? { ...dataSimpan, id: sunting } : x))
      : [...daftar, { ...dataSimpan, id: idBaru() }];
    // Optimistic: the list is local state the modal already reflects, so the
    // panel does not wait on the settings round trip to show the new row.
    set({ daftar: next, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ subagentCustom: gabungDenganAgentTersimpan(next) } as never)
      .catch(() => useStore.getState().setStatus('could not save the custom sub-agent'));
  },

  hapus: async (id) => {
    const next = get().daftar.filter((x) => x.id !== id);
    set({ daftar: next, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ subagentCustom: gabungDenganAgentTersimpan(next) } as never)
      .catch(() => useStore.getState().setStatus('could not delete the custom sub-agent'));
  },

  setAktif: async (id, aktif) => {
    const next = get().daftar.map((x) => (x.id === id ? { ...x, aktif } : x));
    set({ daftar: next });
    await useStore
      .getState()
      .applySettings({ subagentCustom: gabungDenganAgentTersimpan(next) } as never)
      .catch(() => useStore.getState().setStatus('could not save the custom sub-agent'));
  },
}));

/**
 * Merge the worker list back into what is on disk.
 *
 * `applySettings` imports a patch, and `subagentCustom` is an ARRAY - so
 * writing the filtered list would DELETE the agent-shaped entries that the
 * Agents-page editor left behind, wiping those definitions on the next save.
 * Carrying them over unchanged keeps them alive until `migrasiAgentLama` moves
 * them to their own key.
 */
function gabungDenganAgentTersimpan(next: SubagentCustom[]): SubagentCustom[] {
  const s = useStore.getState().settings as unknown as {
    subagentCustom?: SubagentCustom[];
  };
  const tersimpan = Array.isArray(s.subagentCustom) ? s.subagentCustom : [];
  const sisa = tersimpan.filter(bergayaAgent);
  return sisa.length === 0 ? next : [...next, ...sisa];
}

/**
 * Move agent-shaped entries out of the worker list into `settings.agentCustom`.
 *
 * Runs once per boot. Without it the entries would stay in `subagentCustom`
 * forever: `bacaDaftar` hides them from the worker paths, and the Agents page
 * would show an empty list while the user's agents sat right there on disk.
 *
 * Idempotent: after the first run there is nothing agent-shaped left to move,
 * so a second call writes nothing.
 */
export async function migrasiAgentLama(): Promise<number> {
  /*
   * READ FRESH, then pass the exact lists back in the SAME patch.
   *
   * `applySettings` merges into a pending payload that is written later, so any
   * value this function reads must be the one on disk right now, and every key
   * it changes must travel in one call. The earlier version sent two patches
   * (`agentCustom`/`subagentCustom`, then `agents.agentAktif`) against a store
   * snapshot that could already be stale - and an array key in a merge REPLACES
   * the whole array, so a stale write is silent data loss, not a merge.
   */
  const st = useStore.getState();
  let s: {
    subagentCustom?: SubagentCustom[];
    agentCustom?: unknown[];
    agents?: { agentAktif?: string };
  };
  try {
    s = (await st.reloadSettings(), useStore.getState().settings) as unknown as typeof s;
  } catch {
    s = useStore.getState().settings as unknown as typeof s;
  }
  const tersimpan = Array.isArray(s.subagentCustom) ? s.subagentCustom : [];
  const pindah = tersimpan.filter(bergayaAgent);
  if (pindah.length === 0) return 0;

  const sudahAda = Array.isArray(s.agentCustom) ? s.agentCustom : [];
  const namaSudah = new Set(
    sudahAda.map((a) => String((a as { nama?: string }).nama ?? '').trim().toLowerCase()),
  );

  const { dariSubagen } = await import('./agentCustom');
  const baru = pindah
    .filter((d) => !namaSudah.has(String(d.nama ?? '').trim().toLowerCase()))
    .map((d) => dariSubagen(d));

  /*
   * ONE atomic patch carrying both lists.
   *
   * `applySettings` merges into a pending payload and writes once. The earlier
   * version followed this with a SECOND patch for `agents.agentAktif` - and
   * because the pending payload is merged by key, a later write could carry a
   * stale `subagentCustom` array (the pre-migration one) back over the file.
   * Everything the migration changes now travels in a single call, so there is
   * no window where one list is written without the other.
   */
  const patch: Record<string, unknown> = {
    agentCustom: [...sudahAda, ...baru],
    subagentCustom: tersimpan.filter((d) => !bergayaAgent(d)),
  };
  if (!s.agents?.agentAktif && baru.length === 1) {
    patch.agents = { agentAktif: baru[0].id };
  }
  await st.applySettings(patch as never);
  return baru.length;
}


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
