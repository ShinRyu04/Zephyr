import { LSP_SERVERS, type LspServerDef } from './lsp';
import { RESEP } from './runLanguages';

/*
 * Toolchain: everything a language needs to be COMPLETE in Zephyr, in one list.
 *
 * WHY this exists: "why can't I run this file" has three different answers, and
 * they lived in three different screens. The compiler is probed by Run, the
 * language server is probed by the LSP page, and the debugger was not probed at
 * all - so a language could be half-installed (server green, compiler missing)
 * with nothing anywhere saying so. One row per language, all three answers side
 * by side, is the only shape that makes "half installed" visible.
 *
 * The rows are DERIVED, not written out again: `LSP_SERVERS` owns the server
 * definitions and `RESEP` owns the run recipes, so a language added to either
 * one shows up here without a second list to keep in step.
 */

export type Peran = 'compiler' | 'runner' | 'lsp';

export interface AlatToolchain {
  /** Executable name as it would appear on PATH. */
  tool: string;
  peran: Peran;
  /** LSP server id, so the row can open the install dialog that already exists. */
  serverId?: string;
}

export interface BarisToolchain {
  id: string;
  label: string;
  /** Extensions the tree knows for this language, for the "covers" line. */
  extensions: string[];
  alat: AlatToolchain[];
  /** Debug adapter that would run this language, when Zephyr has one. */
  debug: string | null;
}

/** Compiler/runner names that differ from the recipe language id. */
const TOOL_RUN: Record<string, string> = {
  c: 'gcc',
  cpp: 'g++',
  shell: 'bash',
};

/**
 * Debug adapters Zephyr ships a recipe for.
 *
 * Only languages whose adapter runs on Windows with no extra IDE: `codelldb`
 * (C/C++, Rust), `dlv` (Go), `java-debug` (Java, through jdtls). C# is listed
 * as `netcoredbg` because that is the adapter that works without Visual Studio,
 * but it is marked not-bundled, so the row says which one and does not claim it
 * is installed.
 */
export const DAP_TOOLS: Record<string, { adapter: string; tool: string; paket: string }> = {
  c: { adapter: 'codelldb', tool: 'codelldb', paket: 'vadimcn.vscode-lldb' },
  cpp: { adapter: 'codelldb', tool: 'codelldb', paket: 'vadimcn.vscode-lldb' },
  rust: { adapter: 'codelldb', tool: 'codelldb', paket: 'vadimcn.vscode-lldb' },
  go: { adapter: 'dlv', tool: 'dlv', paket: 'go install github.com/go-delve/delve/cmd/dlv@latest' },
  java: { adapter: 'java-debug', tool: 'jdtls', paket: 'jdtls (bundles java-debug)' },
  csharp: { adapter: 'netcoredbg', tool: 'netcoredbg', paket: 'Samsung.netcoredbg' },
};

/** Language ids whose LSP server is a DIFFERENT language id in `LSP_SERVERS`. */
const LSP_PER_LANG: Record<string, string> = {
  javascript: 'typescript',
  typescript: 'typescript',
  c: 'clangd',
  cpp: 'clangd',
  shell: 'bash',
  ruby: 'ruby',
  r: 'r',
  lua: 'lua',
};

const serverUntuk = (lang: string): LspServerDef | undefined => {
  const id = LSP_PER_LANG[lang] ?? lang;
  return LSP_SERVERS.find((s) => s.id === id);
};

/**
 * One row per language the editor can run OR lint.
 *
 * Languages that only have a server (Docker, Vue, YAML, ...) are included: the
 * page is about toolchains, and "server installed, nothing to run" is a real
 * answer that saves someone hunting for a Run button that does not exist.
 */
export function barisToolchain(): BarisToolchain[] {
  const peta = new Map<string, BarisToolchain>();

  const ambil = (id: string, label: string): BarisToolchain => {
    const ada = peta.get(id);
    if (ada) return ada;
    const s = serverUntuk(id);
    const baris: BarisToolchain = {
      id,
      label,
      extensions: s?.extensions ?? [],
      alat: [],
      debug: DAP_TOOLS[id]?.adapter ?? null,
    };
    peta.set(id, baris);
    return baris;
  };

  for (const [lang, r] of Object.entries(RESEP) as [string, NonNullable<(typeof RESEP)[keyof typeof RESEP]>][]) {
    if (!r) continue;
    const baris = ambil(lang, r.label);
    const nama = TOOL_RUN[lang] ?? r.needs;
    baris.alat.push({
      tool: nama,
      peran: r.compiled ? 'compiler' : 'runner',
    });
    /* Java's compile step needs `javac`, but the RUN needs `java`; the row has
       to list both or "javac found, java missing" still reads as ready. */
    if (lang === 'java' && !baris.alat.some((a) => a.tool === 'java')) {
      baris.alat.push({ tool: 'java', peran: 'runner' });
    }
    const server = serverUntuk(lang);
    if (server && !baris.alat.some((a) => a.tool === server.cmd[0])) {
      baris.alat.push({ tool: server.cmd[0], peran: 'lsp', serverId: server.id });
    }
  }

  /* Servers without a Run recipe: still toolchains, just not runnable here. */
  for (const s of LSP_SERVERS) {
    const lang = s.langs[0] ?? s.id;
    if (peta.has(lang)) continue;
    ambil(lang, s.label.split(' (')[0]);
  }

  return [...peta.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Every distinct executable above, for one `run_tool_status` call. */
export function semuaTool(baris: BarisToolchain[]): string[] {
  const set = new Set<string>();
  for (const b of baris) for (const a of b.alat) set.add(a.tool);
  for (const d of Object.values(DAP_TOOLS)) set.add(d.tool);
  set.add('git');
  return [...set];
}
