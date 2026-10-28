/*
 * Which debugger (if any) can start a given file.
 *
 * The old `buatLaunch()` wrote `{ type: 'node', program: '${file}' }` for EVERY
 * file without a marker, then `muatLaunch()` auto-selected it. A `.cpp` file
 * therefore got a Node configuration that looked ready, Start Debugging was
 * enabled, and pressing F5 produced "The Node adapter (js-debug) is not
 * present…" - a message about a tool the user never asked for. The real
 * answer was "there is no C++ debugger here"; the UI just never said so.
 *
 * This module owns that answer. It is a table, not logic: `dap` is the
 * configuration type to WRITE into launch.json, `adapter` is the built-in DAP
 * adapter that must exist in Rust (`dap.rs` -> `bawaan_untuk`) to serve it.
 * When `adapter` is empty there is no debugger for that language yet, and the
 * caller must say that instead of inventing one - Run (Ctrl+Shift+B) still
 * works for those files.
 */

export interface DeteksiDebug {
  /** `type` written into launch.json. */
  dap: string;
  /** Human label shown in the config name. */
  label: string;
  /** Build a configuration for `path`, or null if `dap` is unsupported. */
  konfig: (path: string) => Record<string, unknown>;
  /** Built-in adapter id required in `dap.rs`, or '' when none exists. */
  adapter: string;
}

const dasar = { request: 'launch', console: 'integratedTerminal' };

function ekstensi(path: string): string {
  const nama = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const titik = nama.lastIndexOf('.');
  return titik < 0 ? '' : nama.slice(titik + 1).toLowerCase();
}

const NODE: DeteksiDebug = {
  dap: 'node',
  label: 'Node',
  adapter: 'node',
  konfig: (path) => ({ ...dasar, type: 'node', name: 'Debug Current File (Node)', program: path }),
};

const PYTHON: DeteksiDebug = {
  dap: 'debugpy',
  label: 'Python',
  adapter: 'python',
  konfig: (path) => ({
    ...dasar,
    type: 'debugpy',
    name: 'Debug Current File (Python)',
    program: path,
  }),
};

/*
 * C/C++ and Rust go through codelldb, which debugs a BINARY, not a source
 * file. The configuration therefore points at the build output next to the
 * source (`a.cpp` -> `a.exe`), because that is what `g++ a.cpp` and
 * `cargo build` leave behind; `cargo` is passed as `cargo.args` for Rust so
 * codelldb rebuilds first and the binary is never stale.
 */
const C_CPP: DeteksiDebug = {
  dap: 'cppdbg',
  label: 'C/C++',
  adapter: 'codelldb',
  konfig: (path) => ({
    ...dasar,
    type: 'cppdbg',
    name: 'Debug Current File (C/C++)',
    program: path.replace(/\.[^./\\]+$/, '.exe'),
    cwd: path.replace(/[\\/][^\\/]+$/, ''),
    /*
     * `integratedTerminal`, not the default REPL console.
     *
     * The debug console shows program output but is NOT the program's stdin:
     * typing there only reaches the debugger as an expression, so a beginner
     * program that does `cin >>` sits forever with no way to answer it (the
     * exact complaint "output tidak bisa diketik"). With this, the debuggee
     * gets a real console and typing works - the same default VS Code uses.
     */
    console: 'integratedTerminal',
  }),
};

const RUST: DeteksiDebug = {
  dap: 'rust',
  label: 'Rust',
  adapter: 'codelldb',
  konfig: (path) => ({
    ...dasar,
    type: 'rust',
    name: 'Debug Current File (Rust)',
    program: '${workspaceFolder}/target/debug/${workspaceFolderBasename}.exe',
    cwd: path.replace(/[\\/][^\\/]+$/, ''),
    cargo: { args: ['build'] },
  }),
};

const GO: DeteksiDebug = {
  dap: 'go',
  label: 'Go',
  adapter: 'dlv',
  konfig: (path) => ({
    ...dasar,
    type: 'go',
    name: 'Debug Current File (Go)',
    mode: 'auto',
    program: path.replace(/[\\/][^\\/]+$/, ''),
  }),
};

const JAVA: DeteksiDebug = {
  dap: 'java',
  label: 'Java',
  adapter: 'java-debug',
  konfig: (path) => ({
    ...dasar,
    type: 'java',
    name: 'Debug Current File (Java)',
    mainClass: path.replace(/^.*[\\/]src[\\/]main[\\/]java[\\/]/, '').replace(/\.java$/, '').replace(/[\\/]/g, '.'),
  }),
};

const CSHARP: DeteksiDebug = {
  dap: 'coreclr',
  label: 'C#',
  adapter: 'netcoredbg',
  konfig: (path) => ({
    ...dasar,
    type: 'coreclr',
    name: 'Debug Current File (C#)',
    program: '${workspaceFolder}/bin/Debug/net8.0/${workspaceFolderBasename}.dll',
    cwd: path.replace(/[\\/][^\\/]+$/, ''),
  }),
};

/** Languages with a known `type` but no built-in adapter (yet). */
const TERDAFTAR_TANPA_ADAPTER: Record<string, { dap: string; label: string }> = {
  rb: { dap: 'ruby', label: 'Ruby' },
  php: { dap: 'php', label: 'PHP' },
  r: { dap: 'r', label: 'R' },
  jl: { dap: 'julia', label: 'Julia' },
  hs: { dap: 'haskell', label: 'Haskell' },
  ex: { dap: 'elixir', label: 'Elixir' },
  exs: { dap: 'elixir', label: 'Elixir' },
};

/**
 * Debug metadata for a file, or null when nothing can debug it.
 *
 * `adapter === ''` means "recognised language, no debugger installed in this
 * build" - callers show the Run hint rather than a Node error.
 */
export function deteksiDebug(path: string | null): DeteksiDebug | null {
  if (!path) return null;
  const ext = ekstensi(path);

  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return NODE;
    case 'ts':
    case 'mts':
    case 'cts':
    case 'tsx':
      return {
        ...NODE,
        konfig: (p) => ({
          ...dasar,
          type: 'node',
          name: 'Debug Current File (Node)',
          program: p,
          runtimeExecutable: 'npx',
          runtimeArgs: ['--yes', 'tsx'],
        }),
      };
    case 'py':
    case 'pyw':
      return PYTHON;
    case 'c':
    case 'h':
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return C_CPP;
    case 'rs':
      return RUST;
    case 'go':
      return GO;
    case 'java':
      return JAVA;
    case 'cs':
      return CSHARP;
    default: {
      const t = TERDAFTAR_TANPA_ADAPTER[ext];
      if (!t) return null;
      return {
        dap: t.dap,
        label: t.label,
        adapter: '',
        konfig: (p) => ({ ...dasar, type: t.dap, name: `Debug Current File (${t.label})`, program: p }),
      };
    }
  }
}
