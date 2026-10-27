import { useStore } from './store';
import { AGENT_BAWAAN, agentAktifList, bacaAgent, type CustomAgent } from './agentCustom';
import type { AlatId } from './subagentCustom';

/*
 * The list the composer's agent picker shows, in ONE place.
 *
 * Built-ins first (Chat, Agent), then the reader's own agents - the order the
 * reference uses. The picker and the resolver below read the same list, so the
 * row that is highlighted and the agent that actually answers cannot disagree.
 */

export interface PilihanAgent {
  id: string;
  nama: string;
  deskripsi: string;
  /** Drawn mark id; `avatar` wins when it is set. */
  ikon: string;
  avatar?: string;
  /** True for Chat / Agent. */
  bawaan: boolean;
  /**
   * Tools this agent may call, or `null` for "use the normal tool gate".
   *
   * A built-in gets `null`: its capability is decided by the switches in
   * Settings, not by a checklist someone saved. A custom agent gets its
   * allowlist, which is what makes "this agent only reads" true.
   */
  alat: AlatId[] | null;
  /** MCP server ids; `[]` means every active server. */
  mcp: string[];
}

export function daftarAgent(): PilihanAgent[] {
  const bawaan: PilihanAgent[] = AGENT_BAWAAN.map((b) => ({
    id: b.id,
    nama: b.nama,
    deskripsi: b.deskripsi,
    ikon: b.ikon,
    bawaan: true,
    alat: null,
    mcp: [],
  }));
  const kustom: PilihanAgent[] = agentAktifList().map((a) => ({
    id: a.id,
    nama: a.nama,
    deskripsi: a.deskripsi,
    ikon: a.ikon || 'robot',
    avatar: a.avatar || '',
    bawaan: false,
    alat: a.alat,
    mcp: a.mcp ?? [],
  }));
  return [...bawaan, ...kustom];
}

/**
 * Id of the agent that should answer, normalised.
 *
 * An empty value is the legacy "no picker choice" and resolves to the built-in
 * Agent, which is what every install ran before this existed. An id whose agent
 * was deleted falls back the same way: the composer must never point at
 * something that is not in its own list.
 */
export function agentTerpilih(): string {
  const s = useStore.getState().settings;
  const id = s.agents?.agentAktif ?? '';
  if (!id) return 'agent';
  if (AGENT_BAWAAN.some((b) => b.id === id)) return id;
  return bacaAgent().some((a) => a.id === id && a.aktif) ? id : 'agent';
}

/** The chosen agent resolved to a definition, or the built-in Agent. */
export function agentTerdetail(): PilihanAgent {
  const id = agentTerpilih();
  /*
   * ONE build, reused.
   *
   * This used to call `daftarAgent()` twice - once for the lookup and once for
   * the fallback - and each call re-reads settings and rebuilds every entry. It
   * runs once per agent step, so the waste was per-step and invisible until a
   * long run. The fallback is the built-in Agent, which is entry 1 of the same
   * list, so it needs no second pass.
   */
  const semua = daftarAgent();
  return semua.find((a) => a.id === id) ?? semua[1];
}

/** The custom agent behind `id`, or null when it is a built-in. */
export function agentKustomAktif(): CustomAgent | null {
  const id = agentTerpilih();
  return bacaAgent().find((a) => a.id === id && a.aktif) ?? null;
}

/**
 * Tools a run may see, narrowed to the agent's allowlist.
 *
 * Applied BEFORE the per-task subset (`pilihToolTugas`): the subset trims by
 * task shape, this trims by what the agent is allowed to do at all. Doing it in
 * the other order would let a task shape re-introduce a tool the agent was
 * explicitly not granted.
 *
 * `null` (built-in) leaves the list untouched.
 */
export function saringAlatAgent(aktif: string[], alat: AlatId[] | null): string[] {
  if (!alat) return aktif;
  const boleh = new Set<string>(alat);
  return aktif.filter((n) => boleh.has(n));
}
