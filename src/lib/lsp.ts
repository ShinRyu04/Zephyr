export interface LspServerDef {
  
  id: string;
  
  label: string;
  
  languageId: string;
  
  langs: string[];
  
  extensions: string[];
  
  cmd: string[];
  
  initOptions?: Record<string, unknown>;
  
  install: string;
}

/*
 * ONE ROW PER LANGUAGE SERVER: how to recognise the files it serves, the command
 * to run, and the install instructions.
 *
 * `install` is DOCUMENTATION, and it is written for BOTH readers at once:
 *
 *   - the Settings dialog, which prints it line by line: `#` lines are the
 *     explanation, `>` lines are a command the reader can copy;
 *   - a person reading the source, who needs to know WHY a server cannot be
 *     installed in one step.
 *
 * Two rules keep it honest:
 *
 * 1. `cmd[0]` must be the binary the package ACTUALLY ships, character for
 *    character. The npm bundle backing css/html/json exports
 *    `vscode-<lang>-language-server` (hyphen before `server`), so an older name
 *    with no hyphen could never be satisfied by any install, however correct the
 *    user was.
 * 2. When one command cannot install the server, the instructions say WHERE to
 *    put the binary instead of ending in "put it on PATH": `%APPDATA%\zephyr\lsp\<id>\`
 *    is the private per-server slot `resolve_cmd` (src-tauri/src/lsp.rs) reads
 *    before PATH, so dropping the file there works without touching PATH.
 *
 * The same applies to installers that are correct but never reach the app's PATH
 * (`winget` does not edit PATH; `go install` and `gem install` land in their own
 * bin dirs): those instructions name the directory, and `resolve_cmd` searches
 * them.
 *
 * Servers that need a parent toolchain say so FIRST. "go install gopls" on a
 * machine without Go fails with `go: not found`, which tells the reader nothing;
 * naming the toolchain, and how to get it, is the part that unblocks them.
 */
export const LSP_SERVERS: LspServerDef[] = [
  {
    id: 'typescript',
    label: 'TypeScript / JavaScript',
    languageId: 'typescript',
    langs: ['typescript', 'javascript', 'tsx', 'jsx'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'],
    
    cmd: ['typescript-language-server', '--stdio'],
    install: `# Butuh Node.js (npm). Cek dulu:
> node --version
# Lalu pasang server + TypeScript-nya:
> npm i -g typescript-language-server typescript
# Sudah terpasang? klik "Install with Zephyr" - hasilnya masuk ke folder Zephyr sendiri.`,
  },
  {
    id: 'python',
    label: 'Python (Pyright)',
    languageId: 'python',
    langs: ['python'],
    extensions: ['.py', '.pyi'],
    cmd: ['pyright-langserver', '--stdio'],
    install: `# Butuh Node.js (npm). Cek dulu:
> node --version
# Lalu pasang pyright:
> npm i -g pyright
# Alternatif resmi: instalasi "pyright" lewat pip juga menyediakan pyright-langserver.`,
  },
  {
    id: 'rust',
    label: 'Rust (rust-analyzer)',
    languageId: 'rust',
    langs: ['rust'],
    extensions: ['.rs'],
    cmd: ['rust-analyzer'],
    install: `# rust-analyzer dikirim bersama toolchain Rust (rustup).
# Tanpa rustup, tidak ada jalan otomatis - pasang rustup dulu:
> winget install Rustlang.Rustup
# Lalu tambahkan komponennya:
> rustup component add rust-analyzer`,
  },
  {
    id: 'go',
    label: 'Go (gopls)',
    languageId: 'go',
    langs: ['go'],
    extensions: ['.go'],
    cmd: ['gopls'],
    install: `# Butuh toolchain Go dulu - gopls adalah paket Go, bukan npm:
> winget install GoLang.Go
# Buka terminal BARU (PATH baru terbaca), lalu:
> go install golang.org/x/tools/gopls@latest
# Hasilnya di %USERPROFILE%\\go\\bin - Zephyr mencari di sana juga.`,
  },
  {
    id: 'clangd',
    label: 'C / C++ (clangd)',
    languageId: 'cpp',
    langs: ['c', 'cpp'],
    extensions: ['.c', '.h', '.cpp', '.cc', '.cxx', '.hpp', '.hh'],
    cmd: ['clangd', '--background-index'],
    install: `# clangd dikirim bersama LLVM:
> winget install LLVM.LLVM
# clangd.exe ada di C:\\Program Files\\LLVM\\bin - Zephyr mencari di sana juga.
# Sesudah LLVM terpasang, klik "Install with Zephyr" (Zephyr menjalankan winget untuk ini).`,
  },
  {
    id: 'bash',
    label: 'Shell (bash-language-server)',
    languageId: 'shellscript',
    langs: ['shell'],
    extensions: ['.sh', '.bash'],
    cmd: ['bash-language-server', 'start'],
    install: `# Butuh Node.js (npm):
> npm i -g bash-language-server`,
  },
  {
    id: 'json',
    label: 'JSON',
    languageId: 'json',
    langs: ['json'],
    extensions: ['.json', '.jsonc'],
    cmd: ['vscode-json-language-server', '--stdio'],
    install: `# Butuh Node.js (npm). Paket ini berisi JSON, HTML, dan CSS sekaligus:
> npm i -g vscode-langservers-extracted`,
  },
  {
    id: 'yaml',
    label: 'YAML',
    languageId: 'yaml',
    langs: ['yaml'],
    extensions: ['.yaml', '.yml'],
    cmd: ['yaml-language-server', '--stdio'],
    install: `# Butuh Node.js (npm):
> npm i -g yaml-language-server`,
  },
  {
    id: 'html',
    label: 'HTML',
    languageId: 'html',
    langs: ['html'],
    extensions: ['.html', '.htm'],
    cmd: ['vscode-html-language-server', '--stdio'],
    install: `# Butuh Node.js (npm). Paket ini berisi JSON, HTML, dan CSS sekaligus:
> npm i -g vscode-langservers-extracted`,
  },
  {
    id: 'css',
    label: 'CSS',
    languageId: 'css',
    langs: ['css'],
    extensions: ['.css', '.scss', '.less'],
    cmd: ['vscode-css-language-server', '--stdio'],
    install: `# Butuh Node.js (npm). Paket ini berisi JSON, HTML, dan CSS sekaligus:
> npm i -g vscode-langservers-extracted`,
  },
  {
    id: 'dart',
    label: 'Dart',
    languageId: 'dart',
    langs: ['dart'],
    extensions: ['.dart'],
    
    cmd: ['dart', 'language-server', '--protocol=lsp'],
    install: `# Dart SDK sudah membawa language server-nya sendiri:
> winget install Google.DartSDK
# Alternatif: https://dart.dev/get-dart
# Zephyr menjalankan winget ini untuk Anda.`,
  },
  {
    id: 'php',
    label: 'PHP (Intelephense)',
    languageId: 'php',
    langs: ['php'],
    extensions: ['.php'],
    cmd: ['intelephense', '--stdio'],
    install: `# Butuh Node.js (npm):
> npm i -g intelephense
# Intelephense juga butuh PHP terpasang (untuk membaca konfigurasi proyek):
> winget install PHP.PHP`,
  },
  {
    id: 'java',
    label: 'Java (jdtls)',
    languageId: 'java',
    langs: ['java'],
    extensions: ['.java'],
    cmd: ['jdtls'],
    install: `# jdtls TIDAK bisa dipasang otomatis dari Zephyr - tidak ada di winget/npm.
# 1) Butuh JDK 17+ :
> winget install EclipseAdoptium.Temurin.21.JDK
# 2) Unduh rilis jdtls: https://download.eclipse.org/jdtls/snapshots/
# 3) Ekstrak ke: %APPDATA%\\zephyr\\lsp\\java\\  sampai ada jdtls.bat di situ
# 4) Klik Re-check di halaman ini`,
  },
  {
    id: 'csharp',
    label: 'C# (OmniSharp)',
    languageId: 'csharp',
    langs: ['csharp'],
    extensions: ['.cs'],
    cmd: ['omnisharp'],
    install: `# Zephyr bisa mengunduh ini untuk Anda (tombol Install with Zephyr).
# Manual: unduh rilis omnisharp-roslyn (win-x64), taruh OmniSharp.exe di:
#   %APPDATA%\\zephyr\\lsp\\csharp\\
# Butuh .NET 6+ runtime:
> winget install Microsoft.DotNet.Runtime.6`,
  },
  {
    id: 'ruby',
    label: 'Ruby (solargraph)',
    languageId: 'ruby',
    langs: ['ruby'],
    extensions: ['.rb'],
    cmd: ['solargraph', 'stdio'],
    install: `# Butuh Ruby dulu - solargraph adalah gem:
> winget install RubyInstallerTeam.Ruby
# Buka terminal BARU, lalu:
> gem install solargraph
# Hasilnya di %USERPROFILE%\\.gem\\ruby\\<versi>\\bin - Zephyr mencari di sana juga.`,
  },
  {
    id: 'lua',
    label: 'Lua (lua-language-server)',
    languageId: 'lua',
    langs: ['lua'],
    extensions: ['.lua'],
    cmd: ['lua-language-server'],
    install: `# Tidak butuh Node/Ruby:
> winget install LuaLS.lua-language-server
# Zephyr menjalankan winget ini untuk Anda.`,
  },
  {
    id: 'kotlin',
    label: 'Kotlin (kotlin-language-server)',
    languageId: 'kotlin',
    langs: ['kotlin'],
    extensions: ['.kt', '.kts'],
    cmd: ['kotlin-language-server'],
    install: `# Tidak ada paket winget/npm untuk yang ini.
# 1) Butuh JDK 17+ :
> winget install EclipseAdoptium.Temurin.21.JDK
# 2) Unduh rilis: https://github.com/fwcd/kotlin-language-server/releases
# 3) Ekstrak ke %APPDATA%\\zephyr\\lsp\\kotlin\\  sampai ada bin\\kotlin-language-server.bat`,
  },
  {
    id: 'swift',
    label: 'Swift (sourcekit-lsp)',
    languageId: 'swift',
    langs: ['swift'],
    extensions: ['.swift'],
    cmd: ['sourcekit-lsp'],
    install: `# sourcekit-lsp hanya dikirim bersama Xcode (macOS).
# Di Windows praktis tidak ada distribusi resmi - Zephyr tidak bisa memasangnya.
# Kalau Swift toolchain resmi sudah ada, sourcekit-lsp ikut di dalamnya.`,
  },
  {
    id: 'r',
    label: 'R (languageserver)',
    languageId: 'r',
    langs: ['r'],
    extensions: ['.r', '.R'],
    cmd: ['R', '--no-echo', '-e', 'languageserver::run()'],
    install: `# Butuh R dulu - language server ini adalah paket R:
> winget install RProject.R
# Buka terminal BARU, lalu:
> Rscript -e "install.packages('languageserver', repos='https://cloud.r-project.org')"`,
  },
  {
    id: 'docker',
    label: 'Docker (dockerfile-language-server)',
    languageId: 'dockerfile',
    langs: ['dockerfile'],
    extensions: ['.dockerfile'],
    cmd: ['docker-langserver', '--stdio'],
    install: `# Butuh Node.js (npm):
> npm i -g dockerfile-language-server-nodejs
# Zephyr menjalankan npm ini untuk Anda (tombol Install with Zephyr).`,
  },
  {
    id: 'vue',
    label: 'Vue (volar)',
    languageId: 'vue',
    langs: ['vue'],
    extensions: ['.vue'],
    cmd: ['vue-language-server', '--stdio'],
    install: `# Butuh Node.js (npm):
> npm i -g @vue/language-server
# Zephyr menjalankan npm ini untuk Anda (tombol Install with Zephyr).`,
  },
];

export const SERVER_BY_ID = new Map(LSP_SERVERS.map((s) => [s.id, s]));

export function serverForPath(path: string): LspServerDef | null {
  const m = /\.[^.\\/]+$/.exec(path.toLowerCase());
  if (!m) {
    /*
     * A file with no extension can still have a server: `Dockerfile` is the whole
     * reason the docker row exists, and matching it by extension alone made that
     * row unreachable - the server could be installed and probed green while no
     * file in the editor could ever select it.
     */
    const nama = path.toLowerCase().replace(/\\/g, '/').split('/').pop() ?? '';
    return nama === 'dockerfile' ? SERVER_BY_ID.get('docker') ?? null : null;
  }
  const ext = m[0];
  return LSP_SERVERS.find((s) => s.extensions.includes(ext)) ?? null;
}

export interface LspOverride {
  enabled?: boolean;
  cmd?: string[];
  initOptions?: Record<string, unknown>;
}

export interface LspSettings {
  
  enabled: boolean;
  
  idleSeconds: number;
  servers: Record<string, LspOverride>;
}

export const DEFAULT_LSP_SETTINGS: LspSettings = {
  enabled: true,
  idleSeconds: 300,
  servers: {},
};

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

export function uriToPath(uri: string): string {
  if (!uri.startsWith('file://')) return uri;
  let p = decodeURIComponent(uri.slice('file://'.length));
  
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  return p.replace(/\//g, '\\');
}

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
