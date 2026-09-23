// subagentStore.ts — subagent paralel (T2.1).
//
// KONSEP: satu tugas besar dipecah jadi N subagent yang berjalan BERSAMAAN.
// Tiap subagent punya: nama, tugas, status, dan daftar langkahnya sendiri.
// Hasil akhirnya dikumpulkan jadi satu ringkasan.
//
// KENAPA STORE TERPISAH, bukan menambah ke aiStore:
//   aiStore menyimpan `agentStepResolve` dan `agentBatal` sebagai variabel
//   MODUL (bukan per-percakapan). Dua agent yang jalan bersamaan akan saling
//   menimpa resolver itu — agent pertama menerima hasil agent kedua. Memperbaiki
//   itu berarti mengubah agent loop 1166 baris yang sudah terverifikasi 74 tes.
//   Store terpisah dengan map per-agent memberi paralelisme TANPA menyentuh
//   jalur yang sudah stabil.
//
// ISOLASI: tiap subagent memakai id request sendiri (`sub-<n>-<rand>`), jadi
//   Rust membatalkannya secara independen (ai_reqs = HashMap per-id).
//
// PEMBATASAN yang disengaja:
//   * Subagent berjalan dalam mode READ-ONLY terhadap file: ia boleh membaca
//     dan menjalankan perintah, tapi `editor_write`/`file_write` ditolak.
//     Alasannya: N agent yang menulis file yang sama secara bersamaan
//     menghasilkan konflik yang tidak bisa diselesaikan otomatis.
//   * Batas jumlah subagent = MAX_PARALLEL (4). Lebih dari itu: rate limit
//     provider + RAM naik tanpa manfaat.

import { create } from 'zustand';
import * as cmd from './commands';
import { agentToolSpecs } from './agentTools';
import { findModel } from './modelCatalog';
import { useStore } from './store';
import { infoPeran, tebakPeran, peranDariPrefix, type PeranId } from './subagentRoles';
import { useAi } from './aiStore';

/** Batas subagent yang berjalan bersamaan. */
export const MAX_PARALLEL = 4;
/** Nilai efektif dari Settings (jatuh ke konstanta kalau settings belum siap). */
export function batasParalel(): number {
  const n = useStore.getState().settings.subagent?.maxParallel;
  return typeof n === 'number' && n >= 1 ? Math.min(8, Math.floor(n)) : MAX_PARALLEL;
}

/** Batas langkah efektif dari Settings. */
export function batasLangkah(): number {
  const n = useStore.getState().settings.subagent?.maxSteps;
  return typeof n === 'number' && n >= 3 ? Math.min(50, Math.floor(n)) : MAX_SUB_STEPS;
}

/** Apakah subagent boleh menulis file (Settings). */
export function bolehTulis(): boolean {
  return useStore.getState().settings.subagent?.allowWrite === true;
}

/** Batas langkah per subagent (penjaga biaya & loop tak berujung). */
export const MAX_SUB_STEPS = 15;

/** Nama panggilan tiap subagent — memberi identitas supaya user bisa
 *  menyebutnya saat membaca progres ("Comet sedang apa?"). */
const NAMA = [
  'Comet', 'Odyssey', 'Nova', 'Atlas', 'Orion', 'Vega',
  'Lyra', 'Pulsar', 'Zenith', 'Quasar', 'Helix', 'Cobalt',
];

export type SubStatus = 'menunggu' | 'jalan' | 'selesai' | 'gagal' | 'batal';

/** Satu langkah yang dikerjakan subagent. */
export interface SubStep {
  /** 'pikir' = teks model; 'tool' = pemanggilan tool */
  kind: 'pikir' | 'tool';
  /** untuk kind='tool' */
  nama?: string;
  args?: string;
  hasil?: string;
  ok?: boolean;
  /** untuk kind='pikir' */
  teks?: string;
  at: number;
}

/** Satu subagent. */
export interface SubAgent {
  id: string;
  nama: string;
  tugas: string;
  /** T4.2: peran kerja — menentukan prompt + boleh-tulis. */
  peran: PeranId;
  status: SubStatus;
  langkah: SubStep[];
  /** jawaban akhir (diisi saat selesai) */
  hasil: string;
  /** pesan error kalau gagal */
  error: string | null;
  mulai: number;
  selesai: number | null;
  /** jumlah langkah tool yang sudah dipakai */
  nTool: number;
}

interface SubAgentState {
  /** daftar subagent pada tugas paralel aktif */
  agents: SubAgent[];
  /** true = ada tugas paralel berjalan */
  sibuk: boolean;
  /** ringkasan gabungan setelah semua selesai */
  ringkasan: string | null;
  /** id sesi chat tempat subagent menempel */
  sesiId: string | null;

  /** Jalankan N tugas secara paralel. Mengembalikan jumlah yang diterima. */
  jalankan: (tugas: string[]) => Promise<number>;
  /** Batalkan satu subagent. */
  batal: (id: string) => void;
  /** Batalkan semua. */
  batalSemua: () => void;
  /** Bersihkan daftar (setelah user menutup panelnya). */
  bersihkan: () => void;
}

/** Resolver per-agent: map id → resolve. Ini pengganti `agentStepResolve`
 *  global di aiStore, sehingga N agent tidak saling menimpa. */
const resolvers = new Map<string, (r: AgentStepResult) => void>();
/** Flag batal per-agent. */
const batalSet = new Set<string>();

interface AgentStepResult {
  content: string;
  toolCalls: { id: string; name: string; args: unknown }[];
  cancelled: boolean;
  error?: string;
}

/** Sistem prompt khusus subagent: menegaskan batas peran. */
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
    p?.butuhTulis
      ? '- Kamu boleh mengubah file sebatas lingkup tugasmu.'
      : '- Jangan menulis file apa pun (editor_write/file_write ditolak).',
    '- Laporkan temuan sejelas mungkin di jawaban AKHIR: apa yang kamu temukan,',
    '  di file mana, dan kesimpulan singkatnya.',
    '- Kalau tugas tidak bisa diselesaikan, katakan alasannya — jangan mengarang.',
  ];
  return baris.filter(Boolean).join('\n');
}

export const useSubAgent = create<SubAgentState>((set, get) => ({
  agents: [],
  sibuk: false,
  ringkasan: null,
  sesiId: null,

  jalankan: async (tugas) => {
    const daftar = tugas.map((t) => t.trim()).filter(Boolean).slice(0, batasParalel());
    if (daftar.length === 0) return 0;
    if (get().sibuk) return 0;

    const ai = useAi.getState();
    // Model subagent bisa dipisah dari model chat (Settings → Subagent).
    // Kalau kosong, ikut model chat seperti sebelumnya — perilaku lama tetap.
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
      // Peran bisa dipaksa user lewat prefix "@cari ..." / "@kerja ...";
      // kalau tidak, ditebak dari kata kunci tugasnya.
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

    // Jalankan SEMUA bersamaan. Promise.allSettled: satu subagent gagal tidak
    // membatalkan yang lain — itu inti manfaat paralel.
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

    // Susun ringkasan gabungan dari semua subagent.
    const akhir = get().agents;
    const bagian = akhir.map((a) => {
      const statusTeks =
        a.status === 'selesai' ? 'SELESAI' : a.status === 'batal' ? 'DIBATALKAN' : 'GAGAL';
      const isi = a.hasil || a.error || '(tidak ada hasil)';
      return `## ${a.nama} — ${statusTeks}\nTugas: ${a.tugas}\n\n${isi}`;
    });
    const ringkasan = bagian.join('\n\n---\n\n');

    set({ sibuk: false, ringkasan });

    // TIDAK ADA injeksi ke chat.
    //
    // KENAPA: subagent dan chat AI adalah dua hal yang BERDIRI SENDIRI. Kalau
    // ringkasan disuntikkan ke riwayat percakapan, model membaca pekerjaan yang
    // tidak pernah ia minta sebagai konteks — dan user yang membuka chat lain
    // ikut melihatnya. Ringkasan tetap ada di `ringkasan` (dipakai tab
    // Subagents), tempat pekerjaan itu memang hidup.
    return daftar.length;
  },

  batal: (id) => {
    batalSet.add(id);
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

/** Jalankan satu subagent sampai selesai (loop tool). */
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

      // Panggil satu langkah agent lewat jalur yang SAMA seperti aiStore
      // (ai_tool_chat_stream), tapi dengan id unik milik subagent ini.
      const res = await new Promise<AgentStepResult>((resolve) => {
        resolvers.set(agent.id, resolve);
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
              resolve({
                content: '',
                toolCalls: [],
                cancelled: false,
                error: cmd.asZephyrError(e).message,
              });
            }
          });
      });

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
        // Tidak ada tool lagi = subagent selesai.
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

        // Subagent DILARANG menulis — lihat catatan di kepala file.
        // Guard tulis: default MELARANG, bisa dinyalakan di Settings →
        // Subagent. `file_edit` ikut dilarang karena juga mengubah disk.
        const dilarang = !bolehTulis() &&
          (tc.name === 'editor_write' || tc.name === 'file_write' || tc.name === 'file_edit');
        let hasil: string;
        let ok = true;
        if (dilarang) {
          hasil = '(ditolak: subagent paralel tidak boleh menulis file)';
          ok = false;
        } else {
          try {
            const { jalankanAgentTool } = await import('./agentTools');
            hasil = await jalankanAgentTool(tc.name, argsObj);
          } catch (e) {
            hasil = `ERROR: ${(e as Error).message ?? String(e)}`;
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

    // Kehabisan langkah — laporkan apa adanya, jangan mengarang.
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
      error: (e as Error).message ?? String(e),
      selesai: Date.now(),
    }));
  } finally {
    resolvers.delete(agent.id);
    batalSet.delete(agent.id);
  }
}

/** Handler untuk event `ai-chunk` — dipanggil dari onChunk aiStore. */
export function subagentOnChunk(c: {
  id: string;
  toolDone?: boolean;
  content?: string;
  toolCalls?: { id: string; name: string; args: unknown }[];
  cancelled?: boolean;
  err?: string;
}): boolean {
  const r = resolvers.get(c.id);
  if (!r) return false; // bukan milik subagent
  if (!c.toolDone) return true; // potongan teks: ditangani jalur bubble biasa
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
