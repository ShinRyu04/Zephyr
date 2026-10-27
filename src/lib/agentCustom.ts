import { create } from 'zustand';
import { useStore } from './store';
import type { AlatId } from './subagentCustom';

/*
 * Custom AGENTS - the identities the reader picks in the composer, one of which
 * answers a chat at a time. Distinct from custom SUB-AGENTS (`subagentCustom`),
 * which are workers the orchestrator delegates to.
 *
 * WHY THE TWO WERE SPLIT
 *
 * They used to share one type and one list. The editor that creates them is the
 * Agents page ("Create Agent"), and the list it wrote to was read by
 * `SubAgentBar` as workers - so an agent the reader made to talk to appeared as
 * a delegatable sub-agent instead, which is not what it was. Keeping both roles
 * on one record is what made that possible; two stores make the roles two
 * things that cannot be confused again.
 *
 * A built-in agent is a fixed mode the app ships (Chat, Agent). A custom agent
 * is a name, a prompt, a tool allowlist, the MCP servers it may use and an
 * avatar. Picking one changes BOTH the prompt and the tools of that run.
 *
 * Storage lives under `settings.agentCustom`, next to the rest of the settings,
 * so a definition travels with the settings file.
 */

export interface CustomAgent {
  id: string;
  /** Shown on the row and in the composer picker. */
  nama: string;
  /** One line under the name. */
  deskripsi: string;
  /** Persona and rules; replaces the persona block for this agent. */
  prompt: string;
  /** Drawn mark id from `subagentIcons.ts`. Ignored when `avatar` is set. */
  ikon: string;
  /**
   * Uploaded avatar, as a file name under `%APPDATA%\zephyr\avatars\`.
   *
   * A file name, not a data URL: settings.json stays small and readable, and
   * the bytes live somewhere a user can delete without corrupting settings.
   * Empty means "use `ikon`".
   */
  avatar?: string;
  /** Tools this agent may call. Always an allowlist; `[]` is corrected on save. */
  alat: AlatId[];
  /**
   * MCP server ids this agent may use.
   *
   * `[]` means EVERY active server - deliberately, so an agent created before
   * this field existed does not silently lose the MCP tools it used to have.
   */
  mcp: string[];
  /**
   * Whether OTHER agents may delegate to this one.
   *
   * This is the one field that bridges the two roles, and it does so on
   * purpose: the reference offers it in the Create Agent form, and an agent
   * that is switched on here also becomes reachable to the orchestrator. It is
   * opt-in - an agent is not delegable unless the reader says so.
   */
  bisaDipanggil?: boolean;
  /** Stable machine name other agents use. */
  idInggris?: string;
  /** When another agent should call this one. */
  kapanDipanggil?: string;
  /** Model override; empty means "same as the chat". */
  model: string;
  /** Provider that goes with `model`; empty means the active provider. */
  provider: string;
  /** Whether the agent appears in the composer picker at all. */
  aktif: boolean;
}

export const AGENT_BAWAAN = [
  {
    id: 'chat',
    nama: 'Chat',
    deskripsi: 'Chat about your codebase',
    ikon: 'robot',
  },
  {
    id: 'agent',
    nama: 'Agent',
    deskripsi: 'End-to-end execution of development tasks, efficiently',
    ikon: 'robot',
  },
] as const;

export function kosongkanAgent(): Omit<CustomAgent, 'id'> {
  return {
    nama: '',
    deskripsi: '',
    prompt: '',
    ikon: 'robot',
    avatar: '',
    /*
     * A new agent starts with the same five the reference offers, not with an
     * empty list: an agent with no tools looks broken the moment it is used,
     * and the reader can still uncheck them.
     */
    alat: ['read_file', 'multi_edit', 'bash_run', 'browser', 'web_search'],
    mcp: [],
    bisaDipanggil: false,
    idInggris: '',
    kapanDipanggil: '',
    model: '',
    provider: '',
    aktif: true,
  };
}

function idBaru(): string {
  return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Stored agents, tolerating a settings file written before this existed. */
export function bacaAgent(): CustomAgent[] {
  const s = useStore.getState().settings as unknown as {
    agentCustom?: CustomAgent[];
  };
  if (!Array.isArray(s.agentCustom)) return [];
  return s.agentCustom.map((a) => ({
    ...a,
    alat: Array.isArray(a.alat) ? a.alat : [],
    mcp: Array.isArray(a.mcp) ? a.mcp : [],
    ikon: typeof a.ikon === 'string' && a.ikon ? a.ikon : 'robot',
    aktif: a.aktif !== false,
  }));
}

/** The agents the composer may offer, in stored order. */
export function agentAktifList(): CustomAgent[] {
  return bacaAgent().filter((a) => a.aktif && a.nama.trim());
}

/** One agent by id, built-ins excluded. */
export function cariAgent(id: string): CustomAgent | null {
  return bacaAgent().find((a) => a.id === id) ?? null;
}

/**
 * Convert an entry that was created by the Agents page while it still wrote to
 * `settings.subagentCustom`.
 *
 * Only the fields both shapes share are carried over. `mcp: []` means "every
 * active server", which is also what such an entry had before the field
 * existed, so its capabilities do not change.
 */
export function dariSubagen(d: {
  id: string;
  nama: string;
  deskripsi?: string;
  prompt?: string;
  ikon?: string;
  avatar?: string;
  alat?: AlatId[];
  bisaDipanggil?: boolean;
  idInggris?: string;
  kapanDipanggil?: string;
  model?: string;
  provider?: string;
  aktif?: boolean;
}): CustomAgent {
  return {
    id: `a-${d.id.replace(/^c-/, '')}`,
    nama: d.nama ?? '',
    deskripsi: d.deskripsi ?? '',
    prompt: d.prompt ?? '',
    ikon: d.ikon || 'robot',
    avatar: d.avatar ?? '',
    alat: Array.isArray(d.alat) ? d.alat : kosongkanAgent().alat,
    mcp: [],
    bisaDipanggil: d.bisaDipanggil === true,
    idInggris: d.idInggris ?? '',
    kapanDipanggil: d.kapanDipanggil ?? '',
    model: d.model ?? '',
    provider: d.provider ?? '',
    aktif: d.aktif !== false,
  };
}


interface AgentState {
  daftar: CustomAgent[];
  /**
   * True once `daftar` has been loaded from settings.
   *
   * Saves are REFUSED until this is set. The store starts as an empty array,
   * and `applySettings` treats an array key as a replace - so a save that runs
   * before the load would write `[]` over every saved agent. That is not
   * hypothetical: it is how a real agent was lost during this change.
   */
  dimuat: boolean;
  sunting: string | null;
  baru: boolean;
  /**
   * Set by "Create Agent" in the composer.
   *
   * That door names a SECTION (`agents`), not a screen, so the window opened on
   * the list and the reader still had to press Create. This flag carries the
   * intent one step further: the Agents page consumes it on mount and opens the
   * editor straight away. It is not persisted - an intent to create does not
   * survive a restart, and remembering it would make the editor reappear
   * unasked every time that page was opened.
   */
  mintaBaru: boolean;
  muat: () => void;
  bukaBaru: () => void;
  bukaSunting: (id: string) => void;
  tutup: () => void;
  /** "Create Agent" from another window: consume once, then open the editor. */
  mintaCreate: () => void;
  ambilMintaCreate: () => boolean;
  simpan: (data: Omit<CustomAgent, 'id'>) => Promise<void>;
  hapus: (id: string) => Promise<void>;
  setAktif: (id: string, aktif: boolean) => Promise<void>;
}

export const useAgentCustom = create<AgentState>((set, get) => ({
  daftar: [],
  dimuat: false,
  sunting: null,
  baru: false,
  mintaBaru: false,

  muat: () => set({ daftar: bacaAgent(), dimuat: true }),

  bukaBaru: () => set({ sunting: null, baru: true }),

  bukaSunting: (id) => set({ sunting: id, baru: false }),

  tutup: () => set({ sunting: null, baru: false }),

  mintaCreate: () => set({ mintaBaru: true }),

  ambilMintaCreate: () => {
    const ya = get().mintaBaru;
    if (ya) set({ mintaBaru: false });
    return ya;
  },

  simpan: async (data) => {
    /*
     * Refuse to write a list that was never loaded.
     *
     * An array in `applySettings` replaces the whole array, so saving from an
     * unloaded store writes `[]` and every saved agent is gone with no undo.
     * Loading here (once) is cheaper than explaining that afterwards.
     */
    if (!get().dimuat) get().muat();
    const { sunting, daftar } = get();
    const namaBersih = String(data.nama ?? '').trim().toLowerCase();

    /* Built-in agent names are the ids the composer matches on, so a custom
       agent under one of them would be unreachable while looking saved. */
    if (AGENT_BAWAAN.some((b) => b.nama.toLowerCase() === namaBersih)) {
      useStore
        .getState()
        .setStatus(`"${data.nama}" is a built-in agent name - a custom agent cannot take it.`);
      return;
    }

    if (
      daftar.some(
        (x) => x.id !== sunting && x.nama.trim().toLowerCase() === namaBersih,
      )
    ) {
      useStore.getState().setStatus(`Another agent is already called "${data.nama}".`);
      return;
    }

    const next = sunting
      ? daftar.map((x) => (x.id === sunting ? { ...data, id: sunting } : x))
      : [...daftar, { ...data, id: idBaru() }];
    set({ daftar: next, sunting: null, baru: false });
    await useStore
      .getState()
      .applySettings({ agentCustom: next } as never)
      .catch(() => useStore.getState().setStatus('could not save the agent'));
  },

  hapus: async (id) => {
    if (!get().dimuat) get().muat();
    const next = get().daftar.filter((x) => x.id !== id);
    set({ daftar: next, sunting: null, baru: false });
    /*
     * ONE atomic patch, not two.
     *
     * `applySettings` merges into a pending payload that is written later, and
     * `agents` is an object inside it. Sending `agents.agentAktif` in its own
     * call and the list in another meant the two could be flushed in an order
     * that dropped the cleared selection - leaving the composer pointing at an
     * agent that no longer existed. Both facts travel together here.
     */
    const st = useStore.getState();
    const patch: Record<string, unknown> = { agentCustom: next };
    if (st.settings.agents?.agentAktif === id) {
      patch.agents = { agentAktif: '' };
    }
    await useStore
      .getState()
      .applySettings(patch as never)
      .catch(() => useStore.getState().setStatus('could not delete the agent'));
  },

  setAktif: async (id, aktif) => {
    if (!get().dimuat) get().muat();
    const next = get().daftar.map((x) => (x.id === id ? { ...x, aktif } : x));
    set({ daftar: next });
    await useStore
      .getState()
      .applySettings({ agentCustom: next } as never)
      .catch(() => useStore.getState().setStatus('could not save the agent'));
  },
}));
