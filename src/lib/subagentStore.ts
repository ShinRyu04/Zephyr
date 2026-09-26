import { create } from 'zustand';
import * as cmd from './commands';
import { agentToolSpecs } from './agentTools';
import { findModel } from './modelCatalog';
import { useStore } from './store';
import { infoPeran, tebakPeran, peranDariPrefix, type PeranId } from './subagentRoles';
import { useAi, isDestructive } from './aiStore';

export const MAX_PARALLEL = 4;

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
  status: SubStatus;
  langkah: SubStep[];

  hasil: string;

  error: string | null;
  mulai: number;
  selesai: number | null;

  nTool: number;
}

interface SubAgentState {

  agents: SubAgent[];

  sibuk: boolean;

  ringkasan: string | null;

  sesiId: string | null;

  jalankan: (tugas: string[], opts?: { bersarang?: boolean }) => Promise<number>;

  batal: (id: string) => void;

  batalSemua: () => void;

  bersihkan: () => void;
}

const resolvers = new Map<string, (r: AgentStepResult) => void>();

const batalSet = new Set<string>();

const AGENT_IDLE_MS = 90_000;
const watchdogs = new Map<string, ReturnType<typeof setTimeout>>();

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
        r({
          content: '',
          toolCalls: [],
          cancelled: false,
          error: 'Provider tidak menjawab dalam 90 detik (timeout idle)',
        });
      }
    }, AGENT_IDLE_MS),
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

function promptSub(tugas: string, total: number, peran: PeranId): string {
  const p = infoPeran(peran);
  const baris = [
    'Kamu adalah SUBAGENT dari sebuah tugas paralel.',
    p ? `PERANMU: ${p.label} — ${p.hint}` : '',
    p ? p.arahan : '',
    '',
    `Tugasmu (${total} subagent berjalan bersamaan): ${tugas}`,
    '',
    'ATURAN:',
    '- Kerjakan HANYA tugas di atas. Jangan mengerjakan tugas subagent lain.',
    '- KERJAKAN DENGAN TOOL, bukan cuma menjelaskan. Pakai file_read/file_list untuk melihat, search untuk mencari, dan shell_exec untuk menjalankan perintah. Jangan menjawab dari ingatan kalau bisa memeriksa.',
    p?.butuhTulis
      ? '- Kamu boleh mengubah file sebatas lingkup tugasmu.'
      : '- Jangan menulis file apa pun (editor_write/file_write/file_edit/file_patch ditolak).',
    '- BEKERJA SAMPAI SELESAI lalu berhenti. Jangan memanggil tool setelah kamu punya jawabannya.',
    '- Laporkan temuan sejelas mungkin di jawaban AKHIR: apa yang kamu temukan,',
    '  di file mana, dan kesimpulan singkatnya. Sebutkan path dan nomor baris bila ada.',
    '- Kalau tugas tidak bisa diselesaikan, katakan alasannya — jangan mengarang.',
  ];
  return baris.filter(Boolean).join('\n');
}

export const useSubAgent = create<SubAgentState>((set, get) => ({
  agents: [],
  sibuk: false,
  ringkasan: null,
  sesiId: null,

  jalankan: async (tugas, opts) => {
    const daftar = tugas.map((t) => t.trim()).filter(Boolean).slice(0, batasParalel());
    if (daftar.length === 0) return 0;
    // `bersarang` dipakai subagent yang memanggil subagent: ia tidak boleh
    // diblokir oleh sibuk global (yang justru diset oleh pemanggilnya).
    if (get().sibuk && !opts?.bersarang) return 0;

    const ai = useAi.getState();

    const setSub = useStore.getState().settings.subagent;
    const subModel = (setSub?.model ?? '').trim();
    const def = subModel
      ? findModel(subModel, (setSub?.provider ?? '').trim() || undefined)
      : findModel(ai.model, ai.provider);
    const cfg = useStore.getState().settings.models.providers[def.provider] ?? {};
    const sesiId = ai.activeId ?? ai.newChat();

    const agents: SubAgent[] = daftar.map((t, i) => ({
      id: `sub-${i}-${Math.random().toString(36).slice(2, 8)}`,
      nama: NAMA[i % NAMA.length],
      tugas: t,

      peran: peranDariPrefix(t).peran ?? tebakPeran(t),
      status: 'menunggu',
      langkah: [],
      hasil: '',
      error: null,
      mulai: Date.now(),
      selesai: null,
      nTool: 0,
    }));

    set({ agents, sibuk: true, ringkasan: null, sesiId });

    await Promise.allSettled(
      agents.map((a) =>
        jalankanSatu(a, {
          provider: def.provider,
          model: def.id,
          baseUrl: cfg.baseUrl || undefined,
          maxTokens: def.maxOut ?? 2048,
          effort: ai.reasoningEffort ?? undefined,
          set,
          get,
        }),
      ),
    );

    const akhir = get().agents;
    const bagian = akhir.map((a) => {
      const statusTeks =
        a.status === 'selesai' ? 'SELESAI' : a.status === 'batal' ? 'DIBATALKAN' : 'GAGAL';
      const isi = a.hasil || a.error || '(tidak ada hasil)';
      return `## ${a.nama} — ${statusTeks}\nTugas: ${a.tugas}\n\n${isi}`;
    });
    const ringkasan = bagian.join('\n\n---\n\n');

    set({ sibuk: false, ringkasan });

    return daftar.length;
  },

  batal: (id) => {
    batalSet.add(id);
    disarmWatchdog(id);
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

  bersihkan: () => set({ agents: [], ringkasan: null, sibuk: false, sesiId: null }),
}));

async function jalankanSatu(
  agent: SubAgent,
  ctx: {
    provider: string;
    model: string;
    baseUrl?: string;
    maxTokens: number;
    effort?: 'minimal' | 'low' | 'medium' | 'high' | 'ultra';
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
    { role: 'system', content: promptSub(agent.tugas, get().agents.length, agent.peran) },
    { role: 'user', content: agent.tugas },
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
            tools: agentToolSpecs(),
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
        let hasil: string;
        let ok = true;
        if (dilarang) {
          hasil = tulisTool
            ? '(ditolak: subagent paralel tidak boleh menulis file; aktifkan allowWrite di Settings → Subagents kalau memang perlu)'
            : '(ditolak: perintah merusak tidak diizinkan untuk subagent paralel)';
          ok = false;
        } else {
          try {
            const { jalankanAgentTool } = await import('./agentTools');
            hasil = await jalankanAgentTool(tc.name, argsObj);
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
