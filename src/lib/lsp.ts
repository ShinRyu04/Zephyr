// lsp.ts — registry bahasa + katalog language server (fase 21).
//
// TABEL MURNI + fungsi bebas efek samping. State runtime ada di lspStore.ts
// (pola yang sama dengan keybindings.ts vs keybindingStore.ts di fase 18).
//
// Keputusan yang perlu diingat:
//   * Binary language server TIDAK dibundel installer. Urutan pencarian:
//     override Settings → %APPDATA%\zephyr\lsp\<id>\ → PATH → (dev)
//     node_modules. Ini yang membuat installer tetap 7 MB.
//   * `cmd` selalu berisi executable + argumen; Rust yang me-resolve-nya.

export interface LspServerDef {
  /** id server (kunci settings + folder %APPDATA%\zephyr\lsp\<id>) */
  id: string;
  /** nama untuk UI */
  label: string;
  /** languageId LSP yang dikirim di didOpen */
  languageId: string;
  /** LangId internal Zephyr yang ditangani server ini (untuk display). */
  langs: string[];
  /** ekstensi file (dengan titik) */
  extensions: string[];
  /** perintah default; elemen 0 = executable */
  cmd: string[];
  /** initializationOptions bawaan */
  initOptions?: Record<string, unknown>;
  /** cara memasang, ditampilkan di UI kalau binary tidak ditemukan */
  install: string;
}

export const LSP_SERVERS: LspServerDef[] = [
  {
    id: 'typescript',
    label: 'TypeScript / JavaScript',
    languageId: 'typescript',
    langs: ['typescript', 'javascript', 'tsx', 'jsx'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'],
    // typescript-language-server adalah wrapper LSP resmi di atas tsserver.
    cmd: ['typescript-language-server', '--stdio'],
    install: 'npm i -g typescript-language-server typescript',
  },
  {
    id: 'python',
    label: 'Python (Pyright)',
    languageId: 'python',
    langs: ['python'],
    extensions: ['.py', '.pyi'],
    cmd: ['pyright-langserver', '--stdio'],
    install: 'npm i -g pyright',
  },
  {
    id: 'rust',
    label: 'Rust (rust-analyzer)',
    languageId: 'rust',
    langs: ['rust'],
    extensions: ['.rs'],
    cmd: ['rust-analyzer'],
    install: 'rustup component add rust-analyzer',
  },
  {
    id: 'go',
    label: 'Go (gopls)',
    languageId: 'go',
    langs: ['go'],
    extensions: ['.go'],
    cmd: ['gopls'],
    install: 'go install golang.org/x/tools/gopls@latest',
  },
  {
    id: 'clangd',
    label: 'C / C++ (clangd)',
    languageId: 'cpp',
    langs: ['c', 'cpp'],
    extensions: ['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hh'],
    cmd: ['clangd', '--background-index'],
    install: 'winget install LLVM.LLVM (atau pasang clangd)',
  },
  {
    id: 'bash',
    label: 'Shell (bash-language-server)',
    languageId: 'shellscript',
    langs: ['shell'],
    extensions: ['.sh', '.bash'],
    cmd: ['bash-language-server', 'start'],
    install: 'npm i -g bash-language-server',
  },
  {
    id: 'json',
    label: 'JSON',
    languageId: 'json',
    langs: ['json'],
    extensions: ['.json', '.jsonc'],
    cmd: ['vscode-json-languageserver', '--stdio'],
    install: 'npm i -g vscode-langservers-extracted',
  },
  {
    id: 'yaml',
    label: 'YAML',
    languageId: 'yaml',
    langs: ['yaml'],
    extensions: ['.yaml', '.yml'],
    cmd: ['yaml-language-server', '--stdio'],
    install: 'npm i -g yaml-language-server',
  },
  {
    id: 'html',
    label: 'HTML',
    languageId: 'html',
    langs: ['html'],
    extensions: ['.html', '.htm'],
    cmd: ['vscode-html-languageserver', '--stdio'],
    install: 'npm i -g vscode-langservers-extracted',
  },
  {
    id: 'css',
    label: 'CSS',
    languageId: 'css',
    langs: ['css'],
    extensions: ['.css', '.scss', '.less'],
    cmd: ['vscode-css-languageserver', '--stdio'],
    install: 'npm i -g vscode-langservers-extracted',
  },
  {
    id: 'dart',
    label: 'Dart',
    languageId: 'dart',
    langs: ['dart'],
    extensions: ['.dart'],
    // Dart SDK menyertakan analysis server. Flutter menaruhnya di PATH.
    cmd: ['dart', 'language-server', '--protocol=lsp'],
    install: 'Pasang Dart SDK (atau Flutter) — dart harus ada di PATH',
  },
  {
    id: 'php',
    label: 'PHP (Intelephense)',
    languageId: 'php',
    langs: ['php'],
    extensions: ['.php'],
    cmd: ['intelephense', '--stdio'],
    install: 'npm i -g intelephense',
  },
  {
    id: 'java',
    label: 'Java (jdtls)',
    languageId: 'java',
    langs: ['java'],
    extensions: ['.java'],
    cmd: ['jdtls'],
    install: 'Pasang Eclipse JDT LS (jdtls) dan taruh di PATH',
  },
  {
    id: 'csharp',
    label: 'C# (OmniSharp)',
    languageId: 'csharp',
    langs: ['csharp'],
    extensions: ['.cs'],
    cmd: ['omnisharp'],
    install: 'Pasang OmniSharp (omnisharp-roslyn) dan taruh di PATH',
  },
  {
    id: 'ruby',
    label: 'Ruby (solargraph)',
    languageId: 'ruby',
    langs: ['ruby'],
    extensions: ['.rb'],
    cmd: ['solargraph', 'stdio'],
    install: 'gem install solargraph',
  },
  {
    id: 'lua',
    label: 'Lua (lua-language-server)',
    languageId: 'lua',
    langs: ['lua'],
    extensions: ['.lua'],
    cmd: ['lua-language-server'],
    install: 'Pasang lua-language-server (winget/choco) dan taruh di PATH',
  },
  {
    id: 'kotlin',
    label: 'Kotlin (kotlin-language-server)',
    languageId: 'kotlin',
    langs: ['kotlin'],
    extensions: ['.kt', '.kts'],
    cmd: ['kotlin-language-server'],
    install: 'Pasang kotlin-language-server dan taruh di PATH',
  },
  {
    id: 'swift',
    label: 'Swift (sourcekit-lsp)',
    languageId: 'swift',
    langs: ['swift'],
    extensions: ['.swift'],
    cmd: ['sourcekit-lsp'],
    install: 'sourcekit-lsp ikut Xcode (macOS) — Windows butuh build manual',
  },
  {
    id: 'r',
    label: 'R (languageserver)',
    languageId: 'r',
    langs: ['r'],
    extensions: ['.r', '.R'],
    cmd: ['R', '--no-echo', '-e', 'languageserver::run()'],
    install: 'install.packages("languageserver") di R',
  },
  {
    id: 'docker',
    label: 'Docker (dockerfile-language-server)',
    languageId: 'dockerfile',
    langs: ['dockerfile'],
    extensions: ['dockerfile'],
    cmd: ['docker-langserver', '--stdio'],
    install: 'npm i -g dockerfile-language-server-nodejs',
  },
  {
    id: 'vue',
    label: 'Vue (volar)',
    languageId: 'vue',
    langs: ['vue'],
    extensions: ['.vue'],
    cmd: ['vue-language-server', '--stdio'],
    install: 'npm i -g @vue/language-server',
  },
];

export const SERVER_BY_ID = new Map(LSP_SERVERS.map((s) => [s.id, s]));

/** Ekstensi file → definisi server ('' kalau tidak ada). */
export function serverForPath(path: string): LspServerDef | null {
  const m = /\.[^.\\/]+$/.exec(path.toLowerCase());
  if (!m) return null;
  const ext = m[0];
  return LSP_SERVERS.find((s) => s.extensions.includes(ext)) ?? null;
}

/** Override user dari settings.lsp.servers[id]. */
export interface LspOverride {
  enabled?: boolean;
  cmd?: string[];
  initOptions?: Record<string, unknown>;
}

export interface LspSettings {
  /** matikan seluruh fitur LSP */
  enabled: boolean;
  /** detik idle sebelum server dimatikan */
  idleSeconds: number;
  servers: Record<string, LspOverride>;
}

export const DEFAULT_LSP_SETTINGS: LspSettings = {
  enabled: true,
  idleSeconds: 300,
  servers: {},
};

/** Spesifikasi efektif setelah override user. */
export function effectiveSpec(
  def: LspServerDef,
  settings: LspSettings | undefined,
): { id: string; cmd: string[]; lang: string; enabled: boolean; initOptions?: Record<string, unknown> } {
  const ov = settings?.servers?.[def.id] ?? {};
  return {
    id: def.id,
    lang: def.languageId,
    cmd: ov.cmd && ov.cmd.length > 0 ? ov.cmd : def.cmd,
    enabled: ov.enabled !== false,
    initOptions: ov.initOptions ?? def.initOptions,
  };
}

// ───────────────────────── konversi LSP ↔ Zephyr ─────────────────────────

/** severity LSP (1..4) → severity problemsStore. */
export function severityFromLsp(n: number | undefined): 'error' | 'warning' | 'info' | 'hint' {
  switch (n) {
    case 1:
      return 'error';
    case 2:
      return 'warning';
    case 3:
      return 'info';
    default:
      return 'hint';
  }
}

/** file:// URI → path Windows. */
export function uriToPath(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  let p = decodeURIComponent(uri.slice('file://'.length));
  // file:///D:/x → /D:/x → D:/x
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  return p.replace(/\//g, '\\');
}

/** path → file:// URI (harus sama dengan path_to_uri di lsp.rs). */
export function pathToUri(path: string): string {
  const s = path.replace(/\\/g, '/');
  const withSlash = s.startsWith('/') ? s : `/${s}`;
  let out = 'file://';
  for (const ch of withSlash) {
    if (/[a-zA-Z0-9/:\-_.~]/.test(ch)) out += ch;
    else if (ch === ' ') out += '%20';
    else {
      for (const b of new TextEncoder().encode(ch)) {
        out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    }
  }
  return out;
}

/** CompletionItemKind LSP → label pendek untuk ikon. */
export const COMPLETION_KIND: Record<number, string> = {
  1: 'text',
  2: 'method',
  3: 'function',
  4: 'ctor',
  5: 'field',
  6: 'var',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  11: 'unit',
  12: 'value',
  13: 'enum',
  14: 'keyword',
  15: 'snippet',
  16: 'color',
  17: 'file',
  18: 'ref',
  19: 'folder',
  20: 'enumMember',
  21: 'const',
  22: 'struct',
  23: 'event',
  24: 'operator',
  25: 'typeParam',
};

/** SymbolKind LSP → label (dipakai Go to Symbol + breadcrumbs fase 24). */
export const SYMBOL_KIND: Record<number, string> = {
  1: 'file',
  2: 'module',
  3: 'namespace',
  4: 'package',
  5: 'class',
  6: 'method',
  7: 'property',
  8: 'field',
  9: 'constructor',
  10: 'enum',
  11: 'interface',
  12: 'function',
  13: 'variable',
  14: 'constant',
  15: 'string',
  16: 'number',
  17: 'boolean',
  18: 'array',
  19: 'object',
  20: 'key',
  21: 'null',
  22: 'enumMember',
  23: 'struct',
  24: 'event',
  25: 'operator',
  26: 'typeParameter',
};

/** Ambil teks dari `Hover.contents` yang bentuknya bermacam-macam. */
export function hoverText(contents: unknown): string {
  if (!contents) return '';
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) return contents.map(hoverText).filter(Boolean).join('\n\n');
  if (typeof contents === 'object') {
    const o = contents as Record<string, unknown>;
    if (typeof o.value === 'string') return o.value;
    if (typeof o.language === 'string' && typeof o.value === 'string') return String(o.value);
  }
  return '';
}
