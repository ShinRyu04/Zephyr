import { create } from 'zustand';
import * as cmd from './commands';
import { agentToolSpecs } from './agentTools';
import { findModel } from './modelCatalog';
import { useStore } from './store';
import { infoPeran, tebakPeran, peranDariPrefix, modelDariPrefix, pisahPipeline, type PeranId } from './subagentRoles';
import { arahanCustom, cariCustom, bacaDaftar, pisahCustom } from './subagentCustom';
import { useAi, isDestructive } from './aiStore';

export const MAX_PARALLEL = 4;

/**
 * Last batch, kept so a restart does not lose the result of a long run. Only
 * finished/errored agents are worth restoring; a run interrupted by a restart
 * has no live provider call behind it, so its "running" rows are marked failed
 * on load rather than left spinning.
 */
const LS_KEY = 'zephyr.subagent.last.v1';

export function batasParalel(): number {
  const n = useStore.getState().settings.subagent?.maxParallel;
  return typeof n === 'number' && n >= 1 ? Math.min(8, Math.floor(n)) : MAX_PARALLEL;
}

export function batasLangkah(): number {
  const n = useStore.getState().settings.subagent?.maxSteps;
  return typeof n === 'number' && n >= 3 ? Math.min(50, Math.floor(n)) : MAX_SUB_STEPS;
}

export function bolehTulis(): boolean {
  return useStore.getState().settings.subagent?.allowWrite === true;
}

export const MAX_SUB_STEPS = 15;

const NAMA = [
  'Comet', 'Odyssey', 'Nova', 'Atlas', 'Orion', 'Vega',
  'Lyra', 'Pulsar', 'Zenith', 'Quasar', 'Helix', 'Cobalt',
];

export type SubStatus = 'menunggu' | 'jalan' | 'selesai' | 'gagal' | 'batal';

export interface SubStep {

  kind: 'pikir' | 'tool';

  nama?: string;
  args?: string;
  hasil?: string;
  ok?: boolean;

  teks?: string;
  at: number;
}

export interface SubAgent {
  id: string;
  nama: string;
  tugas: string;

  peran: PeranId;

  /**
   * Set when this worker came from Settings → Subagents rather than from the
   * shipped role list. `peran` still names the nearest built-in role, because
   * the panel, the icon set and the tool gate are all keyed on it — but the
   * persona, the tool allowlist and the model are the user's, and those are what
   * this id reaches. Null for a built-in worker.
   */
  customId: string | null;

  /** The user's own name for it, shown instead of the built-in role label. */
  customNama: string | null;

  /** Icon id from `subagentIcons.ts`, for a custom worker's own choice. */
  customIkon: string | null;

  status: SubStatus;
  langkah: SubStep[];

  hasil: string;

  error: string | null;
  mulai: number;
  selesai: number | null;

  nTool: number;

  /** Provider and model this subagent runs on; resolved at launch, per task. */
  provider: string;
  model: string;

  /**
   * What the agent's own steps show, not what its summary claims.
   * `terbukti` = it ran tools that succeeded; `sebagian` = some tools failed;
   * `tanpa-bukti` = it claimed a result without any successful tool call.
   */
  verdict: 'terbukti' | 'sebagian' | 'tanpa-bukti';
  /** Files this agent actually wrote, from its own tool calls. */
  fileDitulis: string[];
  /** Nesting depth: 0 for a top-level batch, higher inside `subagent_run`. */
  kedalaman: number;
  /**
   * The conversation this agent had, kept so a stopped or finished agent can be
   * continued with a follow-up message instead of starting over. Only populated
   * for a top-level agent: a nested one belongs to a batch that is already gone
   * by the time anyone could type at it.
   */
  riwayat?: { role: string; content: string; tool_call_id?: string; tool_calls?: unknown; name?: string }[];
  /** Follow-up messages the user sent after the first run, oldest first. */
  lanjutan?: { teks: string; waktu: number; hasil: string }[];
}

interface SubAgentState {

  agents: SubAgent[];

  sibuk: boolean;

  ringkasan: string | null;

  sesiId: string | null;

  jalankan: (tugas: string[], opts?: { bersarang?: boolean; kedalaman?: number }) => Promise<number>;

  batal: (id: string) => void;

  /**
   * Re-run one agent's task from scratch.
   *
   * A finished agent is not always a finished job: a failed one may work on a
   * retry, and a done one may need re-running after the code moved. Starting
   * over (rather than appending to the old conversation) keeps the two runs
   * separate in the step list, so it is clear which one produced which result.
   */
  ulangi: (id: string) => void;

  batalSemua: () => void;

  bersihkan: () => void;

  /**
   * Pin an agent to a model without re-running it.
   *
   * The model is resolved at launch, so before this the only way to change it
   * was to cancel the batch and retype every task with a `@model` prefix. A
   * running agent keeps the model it started with (the request is already in
   * flight); the change applies to the next run, a retry, or a follow-up.
   */
  gantiModel: (id: string, model: string, provider: string) => void;

  /**
   * Send a follow-up to an agent that stopped or finished. Its stored history
   * is the conversation so far, so the model keeps the context it built instead
   * of starting from the task text again.
   */
  lanjutkan: (id: string, teks: string) => Promise<boolean>;

  /** Restore the last batch from localStorage, once, at start-up. */
  muatTersimpan: () => void;
}

const resolvers = new Map<string, (r: AgentStepResult) => void>();

const batalSet = new Set<string>();

/**
 * Which writing subagent owns which file.
 *
 * Two subagents running at once can be handed overlapping tasks and both write
 * the same file. The last writer wins and the other agent's work vanishes with
 * no error. Holding a file for the first writer makes the collision visible as
 * a refused tool call instead of silent data loss. The path is lowercased
 * because Windows paths are case-insensitive.
 */
const pemilikFile = new Map<string, string>();

function kunciPath(p: string): string {
  return p.trim().replace(/\//g, '\\').toLowerCase();
}

/** The agent that owns this file, or null when it is free. */
function pemilikSaatIni(path: string): string | null {
  return pemilikFile.get(kunciPath(path)) ?? null;
}

/** Claim a file for an agent. Returns false when another agent holds it. */
function klaimFile(agentId: string, path: string): boolean {
  const kunci = kunciPath(path);
  const pemilik = pemilikFile.get(kunci);
  if (pemilik && pemilik !== agentId) return false;
  pemilikFile.set(kunci, agentId);
  return true;
}

/** Release every file this agent holds — called when it finishes. */
function lepasFileAgen(agentId: string): void {
  for (const [kunci, pemilik] of [...pemilikFile]) {
    if (pemilik === agentId) pemilikFile.delete(kunci);
  }
}

/** The files a write tool is about to touch. `path` covers every disk tool. */
function pathDitulis(namaTool: string, args: Record<string, unknown>): string | null {
  const toolTulis =
    namaTool === 'file_write' ||
    namaTool === 'file_edit' ||
    namaTool === 'file_patch';
  if (!toolTulis) return null;
  const p = String(args.path ?? '').trim();
  return p || null;
}

const AGENT_IDLE_MS = 90_000;
const watchdogs = new Map<string, ReturnType<typeof setTimeout>>();

/** Idle limit in ms; the Subagents setting wins when it is a sane number. */
function idleBatasMs(): number {
  const n = useStore.getState().settings.subagent?.idleSecs;
  return typeof n === 'number' && n >= 10 ? Math.min(600, Math.floor(n)) * 1000 : AGENT_IDLE_MS;
}

function armWatchdog(id: string) {
  const lama = watchdogs.get(id);
  if (lama) clearTimeout(lama);
  watchdogs.set(
    id,
    setTimeout(() => {
      watchdogs.delete(id);
      const r = resolvers.get(id);
      if (r) {
        resolvers.delete(id);
        const detik = Math.round(idleBatasMs() / 1000);
        r({
          content: '',
          toolCalls: [],
          cancelled: false,
          error: `Provider did not respond within ${detik} seconds (idle timeout)`,
        });
      }
    }, idleBatasMs()),
  );
}

function disarmWatchdog(id: string) {
  const t = watchdogs.get(id);
  if (t) clearTimeout(t);
  watchdogs.delete(id);
}

interface AgentStepResult {
  content: string;
  toolCalls: { id: string; name: string; args: unknown }[];
  cancelled: boolean;
  error?: string;
}

function promptSub(tugas: string, total: number, peran: PeranId, customId?: string | null): string {
  /*
   * A custom worker's own persona replaces the shipped role prompt outright.
   *
   * Not merged on top of it. The role prompt says "do not change anything" and
   * the general rules repeat that; a user who writes a persona saying their
   * worker is allowed to draft files would get both instructions at once and
   * the safer one would win, which makes the persona look broken. What the
   * definition cannot be trusted to remember for itself — the tool allowlist
   * and the no-write rule — is still stated after it.
   */
  const custom = customId ? bacaDaftar().find((d) => d.id === customId) ?? null : null;
  const p = custom ? null : infoPeran(peran);
  const inggris = (useStore.getState().settings.general.uiLang || 'en') !== 'id';
  const tulis = p?.butuhTulis
    ? inggris
      ? 'You may change files within the scope of your task only.'
      : 'Kamu boleh mengubah file sebatas lingkup tugasmu.'
    : inggris
      ? 'Do not write any file (editor_write/file_write/file_edit/file_patch are rejected).'
      : 'Jangan menulis file apa pun (editor_write/file_write/file_edit/file_patch ditolak).';
  const baris = inggris
    ? [
        'You are a SUBAGENT in a parallel task.',
        p ? `YOUR ROLE: ${p.label}` : '',
        p ? p.arahan : custom ? arahanCustom(custom, total) : '',
        '',
        `Your task (${total} subagents run at the same time): ${tugas}`,
        '',
        'RULES:',
        '- Do only the task above. Do not do another subagent task.',
        '- WORK WITH TOOLS, do not just explain. Use file_read/file_list to look, search to find, and shell_exec to run commands. Do not answer from memory when you can check.',
        tulis,
        '- WORK UNTIL DONE, then stop. Do not call tools after you have the answer.',
        '- Report findings clearly in your FINAL answer: what you found, in which file,',
        '  and a short conclusion. Give paths and line numbers where relevant.',
        '- If the task cannot be done, say why. Do not make things up.',
      ]
    : [
        'Kamu adalah SUBAGENT dari sebuah tugas paralel.',
        p ? `PERANMU: ${p.label}` : '',
        p ? p.arahan : custom ? arahanCustom(custom, total) : '',
        '',
        `Tugasmu (${total} subagent berjalan bersamaan): ${tugas}`,
        '',
        'ATURAN:',
        '- Kerjakan HANYA tugas di atas. Jangan mengerjakan tugas subagent lain.',
        '- KERJAKAN DENGAN TOOL, bukan cuma menjelaskan. Pakai file_read/file_list untuk melihat, search untuk mencari, dan shell_exec untuk menjalankan perintah. Jangan menjawab dari ingatan kalau bisa memeriksa.',
        tulis,
        '- BEKERJA SAMPAI SELESAI lalu berhenti. Jangan memanggil tool setelah kamu punya jawabannya.',
        '- Laporkan temuan sejelas mungkin di jawaban AKHIR: apa yang kamu temukan,',
        '  di file mana, dan kesimpulan singkatnya. Sebutkan path dan nomor baris bila ada.',
        '- Kalau tugas tidak bisa diselesaikan, katakan alasannya. Jangan mengarang.',
      ];
  return baris.filter(Boolean).join('\n');
}

export const useSubAgent = create<SubAgentState>((set, get) => ({
  agents: [],
  sibuk: false,
  ringkasan: null,
  sesiId: null,

  jalankan: async (tugas, opts) => {
    // Each line may be a chain: `a -> b -> c`. Split every line, then group by
    // position: all step-1 tasks run together, then all step-2 tasks, and so on.
    // A step after `->` receives the run's earlier results as context.
    const rantai = tugas
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, batasParalel())
      .map((t) => pisahPipeline(t))
      .filter((langkah) => langkah.length > 0);
    if (rantai.length === 0) return 0;
    // `bersarang` is for a subagent that calls another subagent: it must not be
    // blocked by the global busy flag (which its own caller set).
    if (get().sibuk && !opts?.bersarang) return 0;

    const ai = useAi.getState();

    const setSub = useStore.getState().settings.subagent;
    const subModel = (setSub?.model ?? '').trim();
    // The batch default: the Subagents setting if set, otherwise the AI panel's
    // own model. A task can override it with the [model:...] tag below.
    const defDefault = subModel
      ? findModel(subModel, (setSub?.provider ?? '').trim() || undefined)
      : findModel(ai.model, ai.provider);
    const sesiId = ai.activeId ?? ai.newChat();

    const buatAgent = (teks: string, i: number): SubAgent => {
      /*
       * A custom worker wins over the built-in guess, but only when the `[Name]`
       * actually matches a definition the user enabled. A typo then falls
       * through to the ordinary role guess rather than dying, which is the
       * friendlier failure: the work still gets done, just not by the persona
       * that was asked for.
       */
      const { custom, sisa: tanpaPrefix } = pisahCustom(teks);
      const { peran } = peranDariPrefix(teks);
      const defModel = custom?.model
        ? findModel(custom.model, custom.provider || undefined)
        : undefined;
      const { model, provider, sisa } = modelDariPrefix(tanpaPrefix);
      const def = defModel ?? (model ? findModel(model, provider ?? undefined) : defDefault);
      const tugasBersih =
        (custom ? sisa : sisa).replace(/^\s*@(cari|telaah|rencana|audit|kerja|jelajah)\b\s*/i, '').trim() ||
        teks;

      return {
        id: `sub-${i}-${Math.random().toString(36).slice(2, 8)}`,
        nama: NAMA[i % NAMA.length],
        tugas: tugasBersih,
        peran: custom ? peran ?? 'cari' : peran ?? tebakPeran(tugasBersih),
        customId: custom?.id ?? null,
        customNama: custom?.nama ?? null,
        customIkon: custom?.ikon ?? null,
        status: 'menunggu' as SubStatus,
        langkah: [],
        hasil: '',
        error: null,
        mulai: Date.now(),
        selesai: null,
        nTool: 0,
        provider: def.provider,
        model: def.id,
        verdict: 'tanpa-bukti' as const,
        fileDitulis: [],
        kedalaman: opts?.kedalaman ?? 0,
      };
    };

    // Every agent is created up front so the panel shows the whole plan, then
    // each wave flips its agents to running.
    const agents: SubAgent[] = [];
    const waves: number[][] = [];
    const maksPanjang = Math.max(...rantai.map((r) => r.length));
    for (let w = 0; w < maksPanjang; w++) {
      const indeks: number[] = [];
      for (const langkah of rantai) {
        if (!langkah[w]) continue;
        indeks.push(agents.length);
        agents.push(buatAgent(langkah[w], agents.length));
      }
      waves.push(indeks);
    }

    set({ agents, sibuk: true, ringkasan: null, sesiId });

    for (let wi = 0; wi < waves.length; wi++) {
      const gelombang = waves[wi];
      // Context for a later step: the results of every agent that already ran.
      const konteks =
        wi > 0
          ? get()
              .agents.filter((a) => a.selesai !== null)
              .map((a) => `- ${a.nama} (${a.tugas}): ${(a.hasil || a.error || '').slice(0, 400)}`)
              .join('\n')
          : '';
      await Promise.allSettled(
        gelombang.map((idx) => {
          const a = get().agents[idx];
          const cfg = useStore.getState().settings.models.providers[a.provider] ?? {};
          const defA = findModel(a.model, a.provider);
          return jalankanSatu(a, {
            provider: a.provider,
            model: a.model,
            baseUrl: cfg.baseUrl || undefined,
            maxTokens: defA.maxOut ?? 2048,
            effort: ai.reasoningEffort ?? undefined,
            konteks,
            set,
            get,
          });
        }),
      );
    }

    const akhir = get().agents;
    const bagian = akhir.map((a) => {
      const statusTeks =
        a.status === 'selesai' ? 'SELESAI' : a.status === 'batal' ? 'DIBATALKAN' : 'GAGAL';
      const isi = a.hasil || a.error || '(tidak ada hasil)';
      // State the evidence next to the claim, so a reader can tell a verified
      // result from an agent that only talked.
      const bukti =
        a.verdict === 'terbukti'
          ? `${a.nTool} langkah tool, semua berhasil`
          : a.verdict === 'sebagian'
            ? `${a.nTool} langkah tool, ada yang gagal — periksa`
            : 'TIDAK ADA langkah tool yang berhasil — hasil belum terbukti';
      const file = a.fileDitulis.length ? `\nFile ditulis: ${a.fileDitulis.join(', ')}` : '';
      return `## ${a.nama} — ${statusTeks}\nTugas: ${a.tugas}\nBukti: ${bukti}${file}\n\n${isi}`;
    });
    const ringkasan = bagian.join('\n\n---\n\n');

    set({ sibuk: false, ringkasan });

    // Persist the finished batch so a restart does not lose it.
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ agents: get().agents, ringkasan }));
    } catch {
      // Quota or private mode; the in-memory result is still there.
    }

    return agents.length;
  },

  batal: (id) => {
    batalSet.add(id);
    disarmWatchdog(id);
    lepasFileAgen(id);
    const a = get().agents.find((x) => x.id === id);
    if (a) {
      const r = resolvers.get(id);
      resolvers.delete(id);
      r?.({ content: '', toolCalls: [], cancelled: true });
      void cmd.aiCancel(id);
      set((s) => ({
        agents: s.agents.map((x) =>
          x.id === id ? { ...x, status: 'batal', selesai: Date.now() } : x,
        ),
      }));
    }
  },

  batalSemua: () => {
    for (const a of get().agents) {
      if (a.status === 'jalan' || a.status === 'menunggu') get().batal(a.id);
    }
  },

  ulangi: (id) => {
    const agent = get().agents.find((a) => a.id === id);
    if (!agent) return;
    // Only a stopped agent can be re-run: a live one already owns its slot, and
    // the batch cap would be exceeded by starting a second copy.
    if (agent.status === 'jalan' || agent.status === 'menunggu') return;
    if (get().sibuk && get().agents.filter((a) => a.status === 'jalan').length >= batasParalel()) return;

    /*
     * Reset in place, then hand the SAME task to the normal runner. Reusing the
     * runner (instead of duplicating its loop) is what keeps retry behaviour
     * identical to a first run — including the write permission rules and the
     * file-claim bookkeeping.
     */
    set((s) => ({
      agents: s.agents.map((x) =>
        x.id === id
          ? {
              ...x,
              status: 'menunggu',
              error: null,
              hasil: '',
              selesai: null,
              mulai: Date.now(),
              langkah: [],
            }
          : x,
      ),
    }));

    void get().jalankan([agent.tugas]);
  },

  bersihkan: () => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* nothing to clear */
    }
    set({ agents: [], ringkasan: null, sibuk: false, sesiId: null });
  },

  gantiModel: (id, model, provider) => {
    /*
     * Only the pin changes; the conversation is left alone.
     *
     * Swapping the model mid-run would not take effect anyway (the request is
     * already out), and clearing the history to force one would throw away the
     * files the agent just read. The next run, retry or follow-up picks the new
     * model up from these two fields.
     */
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, model, provider } : a)),
    }));
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ agents: get().agents, ringkasan: get().ringkasan }));
    } catch {
      /* quota full: the pin still applies for this session */
    }
  },

  /*
   * Continue a stopped or finished agent with a follow-up message.
   *
   * The stored history is the whole point: without it the follow-up would be a
   * fresh agent that knows nothing about the files it just read. The system
   * prompt is refreshed in place so a persona or tool change since the first
   * run still applies, then the follow-up is appended as a user turn and the
   * same step loop runs again.
   */
  lanjutkan: async (id, teks) => {
    const bersih = teks.trim();
    if (!bersih) return false;
    const agent = get().agents.find((a) => a.id === id);
    if (!agent || !agent.riwayat || agent.riwayat.length === 0) return false;
    // A follow-up needs the slot: refuse rather than queue, so the row cannot
    // sit in "menunggu" behind a batch the user already forgot about.
    if (agent.status === 'jalan' || agent.status === 'menunggu') return false;

    const ai = useAi.getState();
    const setSub = useStore.getState().settings.subagent;
    const pilih = agent.model
      ? findModel(agent.model, agent.provider || undefined)
      : findModel(ai.model, ai.provider);

    const history = agent.riwayat.slice();
    // Refresh the system turn: a persona switch or a tool change since the
    // first run has to reach the model, and index 0 is always the system turn.
    if (history[0]?.role === 'system') {
      history[0] = {
        role: 'system',
        content: promptSub(agent.tugas, get().agents.length, agent.peran, agent.customId),
      };
    }
    history.push({ role: 'user', content: bersih });

    const catat = (fn: (a: SubAgent) => SubAgent) =>
      set((s) => ({ agents: s.agents.map((x) => (x.id === id ? fn(x) : x)) }));

    catat((a) => ({
      ...a,
      status: 'jalan',
      error: null,
      selesai: null,
      langkah: [
        ...a.langkah,
        { kind: 'pikir', teks: `lanjutan: ${bersih}`, ok: true, at: Date.now() },
      ],
      lanjutan: [...(a.lanjutan ?? []), { teks: bersih, waktu: Date.now(), hasil: '' }],
    }));
    set({ sibuk: true });
    batalSet.delete(id);

    try {
      const maksLangkah = batasLangkah();
      let terakhir = '';
      for (let langkah = 0; langkah < maksLangkah; langkah++) {
        if (batalSet.has(id)) {
          catat((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
          return true;
        }
        const res = await new Promise<AgentStepResult>((resolve) => {
          resolvers.set(id, resolve);
          armWatchdog(id);
          cmd.aiToolChatStream({
            id,
            provider: pilih.provider,
            model: pilih.id,
            messages: history as never,
            tools: agentToolSpecs({
              bolehTulis: bolehTulis() && (infoPeran(agent.peran)?.butuhTulis ?? false),
              kedalaman: agent.kedalaman ?? 0,
              alat: agent.customId ? cariCustom(agent.customId)?.alat : undefined,
            }),
            maxTokens: setSub?.maxSteps ? 8192 : 8192,
            effort: undefined,
          });
        });
        disarmWatchdog(id);
        resolvers.delete(id);

        if (res.error) {
          catat((a) => ({ ...a, status: 'gagal', error: res.error ?? null, selesai: Date.now() }));
          return true;
        }
        if (res.cancelled) {
          catat((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
          return true;
        }

        if (res.content.trim()) {
          terakhir = res.content.trim();
          catat((a) => ({ ...a, hasil: terakhir }));
        }

        if (!res.toolCalls || res.toolCalls.length === 0) {
          // No tools this turn: the model answered, so the follow-up is done.
          catat((a) => ({
            ...a,
            status: 'selesai',
            hasil: terakhir || a.hasil,
            selesai: Date.now(),
            riwayat: history.slice(),
            lanjutan: (a.lanjutan ?? []).map((x, i, arr) =>
              i === arr.length - 1 ? { ...x, hasil: terakhir } : x,
            ),
          }));
          return true;
        }

        history.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls });
        for (const tc of res.toolCalls) {
          if (batalSet.has(id)) {
            catat((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
            return true;
          }
          const argsObj = (tc.args ?? {}) as Record<string, unknown>;
          const perintahSub = String(argsObj.command ?? '');
          const toolShell = tc.name === 'shell_exec' || tc.name === 'terminal_exec';
          const tulisTool =
            tc.name === 'editor_write' ||
            tc.name === 'file_write' ||
            tc.name === 'file_edit' ||
            tc.name === 'file_patch';
          const shellBahaya = toolShell && isDestructive(perintahSub);
          const dilarang = !bolehTulis() && (tulisTool || shellBahaya);
          const fileTarget = pathDitulis(tc.name, argsObj);
          const konflik = fileTarget ? pemilikSaatIni(fileTarget) : null;
          const fileMilikLain = !!konflik && konflik !== id;

          let hasil: string;
          let ok = true;
          if (dilarang) {
            hasil = tulisTool
              ? '(ditolak: subagent paralel tidak boleh menulis file; aktifkan allowWrite di Settings → Subagents kalau memang perlu)'
              : '(ditolak: perintah merusak tidak diizinkan untuk subagent paralel)';
            ok = false;
          } else if (fileMilikLain) {
            const pemilik = get().agents.find((a) => a.id === konflik);
            hasil =
              `(ditolak: ${fileTarget} sedang dikerjakan subagent "${pemilik?.nama ?? konflik}". ` +
              'Kerjakan file lain atau tunggu subagent itu selesai.)';
            ok = false;
          } else {
            if (fileTarget) klaimFile(id, fileTarget);
            try {
              const { jalankanAgentTool } = await import('./agentTools');
              hasil = await jalankanAgentTool(tc.name, argsObj);
              if (fileTarget) {
                catat((a) => ({
                  ...a,
                  fileDitulis: a.fileDitulis.includes(fileTarget)
                    ? a.fileDitulis
                    : [...a.fileDitulis, fileTarget],
                }));
              }
            } catch (e) {
              hasil = `ERROR: ${cmd.asZephyrError(e).message}`;
              ok = false;
            }
          }

          catat((a) => ({
            ...a,
            nTool: a.nTool + 1,
            langkah: [
              ...a.langkah,
              {
                kind: 'tool',
                nama: tc.name,
                args: JSON.stringify(argsObj).slice(0, 300),
                hasil: hasil.slice(0, 2000),
                ok,
                at: Date.now(),
              },
            ],
          }));
          history.push({
            role: 'tool',
            content: hasil,
            tool_call_id: tc.id,
            name: tc.name,
          });
        }
      }
      catat((a) => ({
        ...a,
        status: 'gagal',
        error: `melewati batas ${maksLangkah} langkah`,
        selesai: Date.now(),
        riwayat: history.slice(),
      }));
    } catch (e) {
      catat((a) => ({
        ...a,
        status: 'gagal',
        error: cmd.asZephyrError(e).message,
        selesai: Date.now(),
      }));
    } finally {
      disarmWatchdog(id);
      resolvers.delete(id);
      batalSet.delete(id);
      set({ sibuk: false });
      lepasFileAgen(id);
    }
    return true;
  },

  muatTersimpan: () => {
    // Restore once; a later run overwrites this.
    if (get().agents.length > 0 || get().sibuk) return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { agents?: SubAgent[]; ringkasan?: string | null };
      if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) return;
      const agents = parsed.agents.map((a) =>
        // A row still "running" when the app closed has no live call. Show it
        // as failed with a reason, not as endlessly spinning.
        a.status === 'jalan' || a.status === 'menunggu'
          ? { ...a, status: 'gagal' as SubStatus, error: a.error ?? 'interrupted by a restart', selesai: a.selesai ?? Date.now() }
          : a,
      );
      set({ agents, ringkasan: parsed.ringkasan ?? null, sibuk: false, sesiId: null });
    } catch {
      // A corrupt entry must never block start-up.
    }
  },
}));

async function jalankanSatu(
  agent: SubAgent,
  ctx: {
    provider: string;
    model: string;
    baseUrl?: string;
    maxTokens: number;
    effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
    /** Results of earlier pipeline steps that this task depends on. */
    konteks?: string;
    set: (fn: (s: SubAgentState) => Partial<SubAgentState>) => void;
    get: () => SubAgentState;
  },
): Promise<void> {
  const { set, get } = ctx;
  const ubah = (fn: (a: SubAgent) => SubAgent) =>
    set((s) => ({ agents: s.agents.map((x) => (x.id === agent.id ? fn(x) : x)) }));

  const tambahLangkah = (l: SubStep) =>
    ubah((a) => ({ ...a, langkah: [...a.langkah, l] }));

  ubah((a) => ({ ...a, status: 'jalan', mulai: Date.now() }));

  const history: {
    role: string;
    content: string;
    tool_call_id?: string;
    tool_calls?: unknown;
    name?: string;
  }[] = [
    {
      role: 'system',
      content: promptSub(agent.tugas, get().agents.length, agent.peran, agent.customId),
    },
    {
      role: 'user',
      content: ctx.konteks
        ? `${agent.tugas}\n\nHasil langkah sebelumnya (pakai ini, jangan mengerjakan ulang):\n${ctx.konteks}`
        : agent.tugas,
    },
  ];

  try {
    const maksLangkah = batasLangkah();
    for (let langkah = 0; langkah < maksLangkah; langkah++) {
      if (batalSet.has(agent.id)) {
        ubah((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
        return;
      }

      const res = await new Promise<AgentStepResult>((resolve) => {
        resolvers.set(agent.id, resolve);
        armWatchdog(agent.id);
        cmd
          .aiToolChatStream({
            id: agent.id,
            provider: ctx.provider,
            model: ctx.model,
            messages: history as never,
            // Offer only the tools this agent may use: a read-only role never
            // sees a write tool, so it cannot spend a turn calling one.
            tools: agentToolSpecs({
              bolehTulis: bolehTulis() && (infoPeran(agent.peran)?.butuhTulis ?? false),
              kedalaman: agent.kedalaman ?? 0,
              alat: agent.customId ? cariCustom(agent.customId)?.alat : undefined,
            }),
            baseUrl: ctx.baseUrl,
            maxTokens: ctx.maxTokens,
            effort: ctx.effort,
          })
          .catch((e) => {
            if (resolvers.get(agent.id) === resolve) {
              resolvers.delete(agent.id);
              disarmWatchdog(agent.id);
              resolve({
                content: '',
                toolCalls: [],
                cancelled: false,
                error: cmd.asZephyrError(e).message,
              });
            }
          });
      });
      disarmWatchdog(agent.id);

      if (res.error) throw new Error(res.error);
      if (res.cancelled) {
        ubah((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
        return;
      }

      if (res.content.trim()) {
        tambahLangkah({ kind: 'pikir', teks: res.content, at: Date.now() });
      }

      history.push({ role: 'assistant', content: res.content, tool_calls: res.toolCalls });
      if (res.toolCalls.length === 0) {

        ubah((a) => ({
          ...a,
          status: 'selesai',
          hasil: res.content.trim() || a.hasil,
          selesai: Date.now(),
        }));
        return;
      }

      for (const tc of res.toolCalls) {
        if (batalSet.has(agent.id)) {
          ubah((a) => ({ ...a, status: 'batal', selesai: Date.now() }));
          return;
        }
        const argsObj = (tc.args ?? {}) as Record<string, unknown>;
        const perintahSub = String(argsObj.command ?? '');
        const toolShell = tc.name === 'shell_exec' || tc.name === 'terminal_exec';

        const tulisTool =
          tc.name === 'editor_write' ||
          tc.name === 'file_write' ||
          tc.name === 'file_edit' ||
          tc.name === 'file_patch';
        const shellBahaya = toolShell && isDestructive(perintahSub);
        const dilarang = !bolehTulis() && (tulisTool || shellBahaya);
        // Claim the file for this agent. A second agent handed the same file is
        // refused rather than allowed to overwrite the first agent's work.
        const fileTarget = pathDitulis(tc.name, argsObj);
        const konflik = fileTarget ? pemilikSaatIni(fileTarget) : null;
        const fileMilikLain = !!konflik && konflik !== agent.id;
        let hasil: string;
        let ok = true;
        if (dilarang) {
          hasil = tulisTool
            ? '(ditolak: subagent paralel tidak boleh menulis file; aktifkan allowWrite di Settings → Subagents kalau memang perlu)'
            : '(ditolak: perintah merusak tidak diizinkan untuk subagent paralel)';
          ok = false;
        } else if (fileMilikLain) {
          const pemilik = get().agents.find((a) => a.id === konflik);
          hasil =
            `(ditolak: ${fileTarget} sedang dikerjakan subagent "${pemilik?.nama ?? konflik}". ` +
            'Kerjakan file lain atau tunggu subagent itu selesai.)';
          ok = false;
        } else {
          if (fileTarget) klaimFile(agent.id, fileTarget);
          try {
            const { jalankanAgentTool } = await import('./agentTools');
            hasil = await jalankanAgentTool(tc.name, argsObj);
            // A write tool that actually succeeded is evidence for the verdict.
            if (fileTarget) {
              ubah((a) => ({ ...a, fileDitulis: a.fileDitulis.includes(fileTarget) ? a.fileDitulis : [...a.fileDitulis, fileTarget] }));
            }
          } catch (e) {
            hasil = `ERROR: ${cmd.asZephyrError(e).message}`;
            ok = false;
          }
        }

        tambahLangkah({
          kind: 'tool',
          nama: tc.name,
          args: JSON.stringify(argsObj).slice(0, 300),
          hasil: hasil.slice(0, 2000),
          ok,
          at: Date.now(),
        });
        ubah((a) => ({ ...a, nTool: a.nTool + 1 }));

        history.push({
          role: 'tool',
          content: hasil,
          tool_call_id: tc.id,
          name: tc.name,
        });
      }
    }

    ubah((a) => ({
      ...a,
      status: 'gagal',
      error: `melewati batas ${maksLangkah} langkah`,
      selesai: Date.now(),
    }));
  } catch (e) {
    ubah((a) => ({
      ...a,
      status: 'gagal',
      error: cmd.asZephyrError(e).message,
      selesai: Date.now(),
    }));
  } finally {
    disarmWatchdog(agent.id);
    resolvers.delete(agent.id);
    batalSet.delete(agent.id);
    // The verdict reads the agent's own steps, not its summary: a claim of
    // "done" backed by failed tools is not a result.
    ubah((a) => {
      const gagal = a.langkah.filter((l) => l.kind === 'tool' && l.ok === false).length;
      const sukses = a.langkah.filter((l) => l.kind === 'tool' && l.ok === true).length;
      const verdict = sukses === 0 ? 'tanpa-bukti' : gagal > 0 ? 'sebagian' : 'terbukti';
      /*
       * Keep the conversation for a top-level agent so the user can send a
       * follow-up after it stops or finishes. A nested agent is skipped: its
       * parent batch owns the run, and nothing can type at it afterwards.
       */
      const simpanRiwayat = (agent.kedalaman ?? 0) === 0 && history.length > 2;
      return {
        ...a,
        verdict,
        ...(simpanRiwayat ? { riwayat: history.slice() } : {}),
      };
    });
    // Free every file this agent held so a later batch can use it.
    lepasFileAgen(agent.id);
  }
}

export function subagentOnChunk(c: {
  id: string;
  toolDone?: boolean;
  content?: string;
  toolCalls?: { id: string; name: string; args: unknown }[];
  cancelled?: boolean;
  err?: string;
}): boolean {
  const r = resolvers.get(c.id);
  if (!r) return false;
  if (!c.toolDone) {
    armWatchdog(c.id);
    return true;
  }
  disarmWatchdog(c.id);
  resolvers.delete(c.id);
  if (c.err) {
    r({ content: '', toolCalls: [], cancelled: false, error: c.err });
    return true;
  }
  r({
    content: c.content ?? '',
    toolCalls: c.toolCalls ?? [],
    cancelled: !!c.cancelled,
  });
  return true;
}

/**
 * The file-ownership table for diagnostics and tests. Keys are normalised
 * paths, values are the owning subagent id. Empty when nothing is mid-write.
 */
export function pemilikFileSnapshot(): Record<string, string> {
  return Object.fromEntries(pemilikFile);
}
