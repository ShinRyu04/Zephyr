/**
 * Tools from EXTERNAL MCP servers, offered to the agent.
 *
 * ## The gap this closes
 *
 * A reader can register MCP servers in Settings, and Zephyr will list their
 * tools, test the connection and show the names — but the AGENT was never told
 * they exist. `AGENT_TOOLS` is a static array built from Zephyr's own modules,
 * so every server the reader configured was, from the model's point of view,
 * invisible. The reader could see "12 tools available" in Settings and the model
 * could not call one of them.
 *
 * ## Why a registry rather than a static array
 *
 * The list is not known at import time: servers are stored on disk, their tools
 * come over the network, and either can change while the app runs. A module
 * array cannot express that. This holds the current set and is refreshed when
 * the MCP store refreshes, which is the moment the answer actually changes.
 *
 * ## Naming
 *
 * `mcp__<serverId>__<toolName>`, matching the shape Zephyr's own MCP tools
 * already use (`mcp__zephyr__*`). Two reasons for the whole path rather than
 * the bare tool name: two servers may legitimately expose a tool with the same
 * name, and the agent needs to see which server a call will reach — a bare
 * `search` says nothing about whose `search` it is.
 */
import type { AgentToolSpec } from './types';

/** One tool from an external server, as the server described it. */
export interface McpExternalTool {
  serverId: string;
  serverLabel: string;
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

/**
 * The live set.
 *
 * Module-level and mutable on purpose: `agentToolSpecs` is called from the
 * agent loop, which is not a React render, and reading a store there would
 * subscribe the loop to re-renders it does not have.
 */
let daftar: McpExternalTool[] = [];

/*
 * B5 - berapa tool per server luar yang BOLEH dikirim ke model.
 *
 * Sebelum batas ini ada, seluruh isi katalog tiap server pihak ketiga dikirim
 * apa adanya di SETIAP permintaan: satu server dengan 300 tool menambahkan 300
 * skema ke tiap request, menggerus konteks dan mengaburkan tool Zephyr sendiri -
 * dan pembaca tidak punya cara melihat bahwa itu terjadi. Empat puluh adalah
 * batas yang cukup longgar untuk server wajar (GitHub, filesystem, browser ada
 * di bawahnya) dan cukup ketat untuk menahan server yang memuntahkan katalog.
 *
 * Yang TIDAK dikirim tidak hilang diam-diam: angkanya dibaca panel Setelan
 * (McpPanel) dan blok prompt, jadi pembaca melihat "server X: 40 dari 300" -
 * bukan kegagalan senyap.
 */
export const BATAS_TOOL_PER_SERVER = 40;

/** Batas yang sedang berlaku; `0` = tanpa batas. Diisi dari setelan pengguna. */
let batasAktif = BATAS_TOOL_PER_SERVER;

export function mcpBatas(): number {
  return batasAktif;
}

/** Ringkasan per server: berapa tool yang dikirim, berapa yang ditahan. */
export interface McpRingkas {
  serverId: string;
  serverLabel: string;
  total: number;
  dipakai: number;
  dibuang: number;
  /* Beberapa nama yang ditahan, supaya pembaca tahu APA yang hilang. */
  contohDibuang: string[];
}

let ringkas: McpRingkas[] = [];

/*
 * Dihitung saat daftar dipasang, bukan saat specs diminta.
 *
 * Panel Setelan perlu angka yang sama dengan yang dipakai pengiriman, dan
 * menghitungnya di dua tempat adalah cara paling pasti membuat keduanya
 * berbeda. Satu hitungan, dua pembaca.
 *
 * Urutan kemunculan server dipertahankan: server pertama yang didaftarkan
 * tetap yang pertama di daftar, supaya urutan tool di panel tidak berubah-ubah
 * tiap refresh.
 */
function hitungRingkas(list: McpExternalTool[]): McpRingkas[] {
  const batas = batasAktif;
  /* `0` = tanpa batas: seluruh tool server itu dikirim, tanpa baris peringatan. */
  const jatahUntuk = (total: number) => (batas > 0 ? Math.min(total, batas) : total);
  const urut: string[] = [];
  const perServer = new Map<string, McpExternalTool[]>();
  for (const t of list) {
    if (!perServer.has(t.serverId)) {
      perServer.set(t.serverId, []);
      urut.push(t.serverId);
    }
    perServer.get(t.serverId)!.push(t);
  }
  return urut.map((id) => {
    const semua = perServer.get(id)!;
    const dipakai = jatahUntuk(semua.length);
    return {
      serverId: id,
      serverLabel: semua[0].serverLabel,
      total: semua.length,
      dipakai,
      dibuang: semua.length - dipakai,
      contohDibuang: semua.slice(dipakai, dipakai + 3).map((t) => t.name),
    };
  });
}

export function setMcpExternalTools(list: McpExternalTool[], batas?: number): void {
  daftar = list;
  if (typeof batas === 'number' && Number.isFinite(batas) && batas >= 0) {
    batasAktif = Math.floor(batas);
  }
  ringkas = hitungRingkas(list);
}

/** Ringkasan tiap server luar, termasuk yang dipotong batas. */
export function mcpRingkas(): readonly McpRingkas[] {
  return ringkas;
}

/** Hanya server yang benar-benar dipotong - dipakai panel & blok prompt. */
export function mcpTerpotong(): McpRingkas[] {
  return ringkas.filter((r) => r.dibuang > 0);
}


/** The tool name the agent sees and calls. */
function namaToolMcp(serverId: string, tool: string): string {
  return `mcp__${serverId}__${tool}`;
}

/**
 * Split a name built by `namaToolMcp` back into its parts.
 *
 * Returns null when the name is not one of ours, so a caller can fall through
 * to Zephyr's own tools without having to know the prefix rules. The split is
 * on the FIRST `__` after the `mcp__` prefix, because a tool name may itself
 * contain `__` and the server id may not (ids are validated when saved).
 */
export function pecahNamaMcp(nama: string): { serverId: string; tool: string } | null {
  if (!nama.startsWith('mcp__')) return null;
  const sisa = nama.slice('mcp__'.length);
  const pisah = sisa.indexOf('__');
  if (pisah <= 0) return null;
  const serverId = sisa.slice(0, pisah);
  const tool = sisa.slice(pisah + 2);
  if (!serverId || !tool) return null;
  /* Zephyr's own namespace is not an external server. */
  if (serverId === 'zephyr') return null;
  return { serverId, tool };
}

/**
 * The specs, in the shape the agent loop sends.
 *
 * `serverIds` narrows the list to the servers an agent was granted. It is an
 * ALLOWLIST from the agent editor, and an EMPTY array means "every server" -
 * deliberately: an agent created before the field existed used to see them all,
 * and hiding them now would break agents nobody edited.
 */
export function mcpExternalSpecs(serverIds: string[] = []): AgentToolSpec[] {
  const izin = serverIds.length > 0 ? new Set(serverIds) : null;
  /* Jatah per server dikonsumsi berurutan, jadi yang dikirim persis sama dengan
     angka `dipakai` yang dibaca panel Setelan - bukan cuma sama panjangnya. */
  const jatah = new Map(ringkas.map((r) => [r.serverId, r.dipakai]));
  const keluar: AgentToolSpec[] = [];
  for (const t of daftar) {
    if (izin && !izin.has(t.serverId)) continue;
    const sisa = jatah.get(t.serverId) ?? 0;
    if (sisa <= 0) continue;
    jatah.set(t.serverId, sisa - 1);
    keluar.push({
      name: namaToolMcp(t.serverId, t.name),
      description:
        `[${t.serverLabel}] ${t.description || t.name}`.trim(),
      parameters:
        Object.keys(t.schema).length > 0
          ? t.schema
          : { type: 'object', properties: {} },
    });
  }
  return keluar;
}

/**
 * Run one external tool.
 *
 * Returned as a STRING because that is what the agent loop expects from every
 * tool — the result goes back to the model as text. The JSON is pretty-printed
 * rather than compact so a nested object stays readable in the transcript,
 * which is where the reader debugs a wrong call.
 */
export async function jalankanToolMcp(
  serverId: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<string> {
  const { mcpClientCall } = await import('./commands');
  try {
    const hasil = await mcpClientCall(serverId, tool, args);
    /*
     * MCP returns `{content: [{type:'text', text:'...'}]}`. Unwrapping it here
     * means the model sees the server's text rather than the protocol envelope
     * — the envelope is our concern, not the model's.
     */
    const isi = (hasil as { content?: unknown } | null)?.content;
    if (Array.isArray(isi)) {
      const teks = isi
        .map((c) => {
          const o = c as { type?: string; text?: string };
          return o.type === 'text' && typeof o.text === 'string' ? o.text : JSON.stringify(c);
        })
        .join('\n');
      return teks || '(server mengembalikan konten kosong)';
    }
    return typeof hasil === 'string' ? hasil : JSON.stringify(hasil, null, 2);
  } catch (e) {
    const { asZephyrError } = await import('./commands');
    /* Named, so a failing call in the transcript says WHICH server failed. */
    return `ERROR memanggil ${serverId}.${tool}: ${asZephyrError(e).message}`;
  }
}

/** Kept so callers importing the type from here keep working. */
export type { AgentToolSpec };
