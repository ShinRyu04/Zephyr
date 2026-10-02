/**
 * Registry Agent Tools Zephyr.
 *
 * ## Arsitektur
 *
 * Registry ini terdiri dari tepat 51 tools:
 *   1. 26 Built-in TEDI (diadaptasi ke backend Zephyr di src/lib/tediTools/builtins.ts)
 *   2. 14 MCP TEDI (diadaptasi ke window/state Zephyr di src/lib/tediTools/mcp.ts)
 *   3. 11 Web & Browser Zephyr (dipertahankan di src/lib/tediTools/web.ts)
 *
 * Tool Zephyr lama selain web/browser telah dipensiunkan agar tidak ada duplikasi
 * dan LLM memiliki set tool yang ringkas, bersih, dan konsisten.
 */
import type { AgentToolSpec } from './types';
import { TOOL_BAWAAN } from './tediTools/builtins';
import { TOOL_MCP } from './tediTools/mcp';
import { TOOL_WEB } from './tediTools/web';
import { useToolGate, TOOL_TULIS } from './toolGate';

export { TOOL_TULIS };

export interface AgentTool {
  spec: AgentToolSpec;
  run: (args: Record<string, unknown>) => Promise<string>;
}

/** Tepat 51 tools: 26 bawaan + 14 MCP + 11 web & browser. */
export const AGENT_TOOLS: AgentTool[] = [
  ...TOOL_BAWAAN,
  ...TOOL_MCP,
  ...TOOL_WEB,
];

/** Penampung gambar screenshot/upload yang menunggu dikirimkan ke model. */
let _gambarMenunggu: string[] = [];

export function simpanGambarMenunggu(base64List: string[]): void {
  _gambarMenunggu = [...base64List];
}

export function ambilGambarMenunggu(): string[] {
  return [..._gambarMenunggu];
}

export function clearGambarMenunggu(): void {
  _gambarMenunggu = [];
}

export interface AgentToolSpecsOptions {
  bolehTulis?: boolean;
  kedalaman?: number;
  alat?: string[];
}

/** Ambil seluruh spesifikasi tool untuk dikirim ke provider LLM. */
export function agentToolSpecs(
  optsOrWhitelist?: AgentToolSpecsOptions | string[],
): AgentToolSpec[] {
  let daftar = AGENT_TOOLS;
  if (!optsOrWhitelist) {
    const aktif = useToolGate.getState().aktif;
    daftar = daftar.filter((t) => aktif.has(t.spec.name));
  } else if (Array.isArray(optsOrWhitelist)) {
    daftar = daftar.filter((t) => optsOrWhitelist.includes(t.spec.name));
  } else {
    if (optsOrWhitelist.alat && optsOrWhitelist.alat.length > 0) {
      daftar = daftar.filter((t) => optsOrWhitelist.alat!.includes(t.spec.name));
    } else {
      const aktif = useToolGate.getState().aktif;
      daftar = daftar.filter((t) => aktif.has(t.spec.name));
    }
    if (optsOrWhitelist.bolehTulis === false) {
      daftar = daftar.filter((t) => !TOOL_TULIS.has(t.spec.name));
    }
  }
  return daftar.map((t) => t.spec);
}

/** Jalankan tool berdasarkan nama dan argumen. */
export async function jalankanAgentTool(
  nama: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const tool = AGENT_TOOLS.find((t) => t.spec.name === nama);
  if (!tool) {
    throw new Error(`Tool tidak ditemukan atau tidak didukung: "${nama}"`);
  }
  const aktif = useToolGate.getState().aktif;
  if (!aktif.has(nama)) {
    throw new Error(`Tool "${nama}" sedang dinonaktifkan di pengaturan tool.`);
  }
  return await tool.run(args);
}
