/**
 * Registry Agent Tools Zephyr.
 *
 * ## Arsitektur
 *
 * Registry ini terdiri dari tepat 51 tools:
 *   1. 26 Built-in (diadaptasi ke backend Zephyr di src/lib/zephyrTools/builtins.ts)
 *   2. 14 MCP (diadaptasi ke window/state Zephyr di src/lib/zephyrTools/mcp.ts)
 *   3. 11 Web & Browser Zephyr (dipertahankan di src/lib/zephyrTools/web.ts)
 *
 * Tool Zephyr lama selain web/browser telah dipensiunkan agar tidak ada duplikasi
 * dan LLM memiliki set tool yang ringkas, bersih, dan konsisten.
 */
import type { AgentToolSpec } from './types';
import { TOOL_BAWAAN } from './zephyrTools/builtins';
import { TOOL_MCP } from './zephyrTools/mcp';
import { TOOL_WEB } from './zephyrTools/web';
import { useToolGate, TOOL_TULIS } from './toolGate';

export { TOOL_TULIS };

/*
 * Tabel label + ikon per tool diteruskan dari sini supaya bridge dev bisa
 * membacanya lewat modul yang sama dengan handler-nya. Harness yang mengukur
 * "apakah baris tool menggambar glyph berbeda" butuh tabel yang BENAR-BENAR
 * dipakai komponen, bukan salinan di dalam skrip uji.
 */
export { infoAksi } from './labelAksi';

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
  const clean = nama.replace(/^mcp__(?:tedi|zephyr)__/, '');
  const tool = AGENT_TOOLS.find(
    (t) =>
      t.spec.name === nama ||
      t.spec.name.replace(/^mcp__(?:tedi|zephyr)__/, '') === clean,
  );
  if (!tool) {
    throw new Error(`Tool tidak ditemukan atau tidak didukung: "${nama}"`);
  }
  const aktif = useToolGate.getState().aktif;
  const targetName = tool.spec.name;
  const targetClean = targetName.replace(/^mcp__(?:tedi|zephyr)__/, '');
  const diizinkan =
    aktif.has(targetName) ||
    aktif.has(targetClean) ||
    aktif.has(`mcp__tedi__${targetClean}`) ||
    aktif.has(`mcp__zephyr__${targetClean}`);
  if (!diizinkan) {
    throw new Error(`Tool "${nama}" sedang dinonaktifkan di pengaturan tool.`);
  }
  return await tool.run(args);
}
