import type { LangId } from './types';
import { detectLang } from './lang';

/**
 * What has to happen before a file can be executed, described as data.
 *
 * WHY a table instead of code: the editor already knows how to spawn a process
 * (`tasks_run`) and how to show its output (the Output panel). What it never
 * had was the knowledge "a .cpp file needs `g++ -o <exe> <src>` first, then the
 * exe runs" - that knowledge lived only in the reader's head. Keeping it as a
 * table means adding a language is one row, not one branch in five files.
 */

/** One step in a language's pipeline. */
export type RunStep =
  | {
      /**
       * Compile step. `{src}` is the absolute source path, `{out}` the binary
       * we expect the tool to produce, `{dir}` the folder the source lives in,
       * `{base}` the source file name without its extension.
       */
      kind: 'compile';
      tool: string;
      args: string[];
      /** Where the produced binary lands, so we can hand it to the run step. */
      out: string;
    }
  | {
      /**
       * Run step. `{bin}` is the absolute path of the compiled binary, and is
       * only meaningful for a language that has a compile step.
       */
      kind: 'run';
      tool: string;
      args: string[];
    };

/**
 * How one language is executed from a single file.
 *
 * `cwd` is `'file'` when the program must start in the source file's folder
 * (anything that reads a sibling data file) and `'workspace'` when it should
 * start at the project root (`cargo run`, `go run ./cmd`). Getting this wrong
 * is invisible until a program depends on relative paths, so it is explicit
 * per row rather than guessed once for everybody.
 */
export interface RunRecipe {
  lang: LangId;
  label: string;
  /** `true` when the language needs a separate build before it can execute. */
  compiled: boolean;
  cwd: 'file' | 'workspace';
  steps: RunStep[];
  /**
   * Tool probed when the reader has not installed anything yet, shown in the
   * "toolchain missing" message. One per recipe, picked as the tool whose
   * absence actually stops the pipeline.
   */
  needs: string;
  /**
   * Problem matcher that understands this compiler's diagnostics, so errors
   * land in the Problems panel instead of only in the scrolling output.
   */
  matcher?: string;
}

const biner = (nama: string, ext = '.exe') => `{dir}/${nama}${ext}`;

/**
 * Every language the editor can highlight, plus the two it knows by name.
 *
 * Deliberately absent: JSON, YAML, TOML, XML, INI, CSS, HTML, Markdown, SQL.
 * Those are data or markup, not programs - a "Run" button that opened a
 * confused tool would be worse than no button. `plain` is absent for the same
 * reason. The Run command simply reports "no runner for this file" for them.
 */
export const RESEP: Partial<Record<LangId, RunRecipe>> = {
  c: {
    lang: 'c',
    label: 'C',
    compiled: true,
    cwd: 'file',
    needs: 'gcc',
    matcher: '$gcc',
    steps: [
      {
        kind: 'compile',
        tool: 'gcc',
        // `-static` on Windows: without it the exe needs libgcc/libwinpthread
        // DLLs that live next to the compiler, and a process launched with a
        // shorter PATH fails with 0xC0000135 (DLL not found) instead of any
        // message that points at the real cause.
        args: ['{src}', '-o', biner('{base}'), '-O0', '-g', '-static'],
        out: biner('{base}'),
      },
      { kind: 'run', tool: '{bin}', args: [] },
    ],
  },
  csharp: {
    lang: 'csharp',
    label: 'C#',
    compiled: false,
    cwd: 'file',
    needs: 'dotnet',
    steps: [{ kind: 'run', tool: 'dotnet', args: ['run', '{src}'] }],
  },
  cpp: {
    lang: 'cpp',
    label: 'C++',
    compiled: true,
    cwd: 'file',
    needs: 'g++',
    matcher: '$gcc',
    steps: [
      {
        kind: 'compile',
        tool: 'g++',
        args: ['{src}', '-o', biner('{base}'), '-O0', '-g', '-std=c++17', '-static'],
        out: biner('{base}'),
      },
      { kind: 'run', tool: '{bin}', args: [] },
    ],
  },
  java: {
    lang: 'java',
    label: 'Java',
    compiled: true,
    cwd: 'file',
    needs: 'java',
    matcher: '$javac',
    steps: [
      {
        kind: 'compile',
        tool: 'javac',
        args: ['-encoding', 'UTF-8', '{src}'],
        // javac writes `<Class>.class` next to the source, and the class name
        // is not guaranteed to match the file name - but it is for any file
        // javac accepts as a compilation unit, which is the only case we run.
        out: '{dir}/{base}.class',
      },
      // `-cp {dir}` because the class lives next to its source, not at the cwd.
      { kind: 'run', tool: 'java', args: ['-cp', '{dir}', '{base}'] },
    ],
  },
  rust: {
    lang: 'rust',
    label: 'Rust',
    compiled: true,
    cwd: 'file',
    needs: 'rustc',
    matcher: '$rustc',
    steps: [
      {
        kind: 'compile',
        tool: 'rustc',
        args: ['{src}', '-o', biner('{base}'), '-g'],
        out: biner('{base}'),
      },
      { kind: 'run', tool: '{bin}', args: [] },
    ],
  },
  go: {
    lang: 'go',
    label: 'Go',
    compiled: true,
    cwd: 'file',
    needs: 'go',
    matcher: '$go',
    steps: [
      // `go run` compiles and executes in one step; the binary is temporary, so
      // there is nothing to clean up and no `{bin}` for the run step to use.
      { kind: 'run', tool: 'go', args: ['run', '{src}'] },
    ],
  },
  swift: {
    lang: 'swift',
    label: 'Swift',
    compiled: true,
    cwd: 'file',
    needs: 'swiftc',
    steps: [
      {
        kind: 'compile',
        tool: 'swiftc',
        args: ['{src}', '-o', biner('{base}')],
        out: biner('{base}'),
      },
      { kind: 'run', tool: '{bin}', args: [] },
    ],
  },
  kotlin: {
    lang: 'kotlin',
    label: 'Kotlin',
    compiled: true,
    cwd: 'file',
    needs: 'kotlinc',
    steps: [
      {
        kind: 'compile',
        tool: 'kotlinc',
        args: ['{src}', '-include-runtime', '-d', '{dir}/{base}.jar'],
        out: '{dir}/{base}.jar',
      },
      { kind: 'run', tool: 'java', args: ['-jar', '{bin}'] },
    ],
  },
  scala: {
    lang: 'scala',
    label: 'Scala',
    compiled: true,
    cwd: 'file',
    needs: 'scala',
    steps: [{ kind: 'run', tool: 'scala', args: ['{src}'] }],
  },
  dart: {
    lang: 'dart',
    label: 'Dart',
    compiled: false,
    cwd: 'file',
    needs: 'dart',
    steps: [{ kind: 'run', tool: 'dart', args: ['run', '{src}'] }],
  },
  python: {
    lang: 'python',
    label: 'Python',
    compiled: false,
    cwd: 'file',
    needs: 'python',
    steps: [{ kind: 'run', tool: 'python', args: ['-u', '{src}'] }],
  },
  javascript: {
    lang: 'javascript',
    label: 'JavaScript',
    compiled: false,
    cwd: 'file',
    needs: 'node',
    steps: [{ kind: 'run', tool: 'node', args: ['{src}'] }],
  },
  typescript: {
    lang: 'typescript',
    label: 'TypeScript',
    compiled: false,
    cwd: 'file',
    needs: 'tsx',
    // `tsx` rather than `ts-node`: it needs no tsconfig, handles ESM and CJS
    // the same way, and is a single dependency. A project that already has
    // `ts-node` is in the minority and can add its own task.
    steps: [{ kind: 'run', tool: 'npx', args: ['--yes', 'tsx', '{src}'] }],
  },
  ruby: {
    lang: 'ruby',
    label: 'Ruby',
    compiled: false,
    cwd: 'file',
    needs: 'ruby',
    steps: [{ kind: 'run', tool: 'ruby', args: ['{src}'] }],
  },
  lua: {
    lang: 'lua',
    label: 'Lua',
    compiled: false,
    cwd: 'file',
    needs: 'lua',
    steps: [{ kind: 'run', tool: 'lua', args: ['{src}'] }],
  },
  perl: {
    lang: 'perl',
    label: 'Perl',
    compiled: false,
    cwd: 'file',
    needs: 'perl',
    steps: [{ kind: 'run', tool: 'perl', args: ['{src}'] }],
  },
  shell: {
    lang: 'shell',
    label: 'Shell',
    compiled: false,
    cwd: 'file',
    needs: 'bash',
    // Absolute `{src}`: MSYS bash reads a bare `D:/...` fine, but a relative
    // path it resolves against its own mount table, not the Windows cwd.
    steps: [{ kind: 'run', tool: 'bash', args: ['{src}'] }],
  },
  php: {
    lang: 'php',
    label: 'PHP',
    compiled: false,
    cwd: 'file',
    needs: 'php',
    steps: [{ kind: 'run', tool: 'php', args: ['{src}'] }],
  },
  r: {
    lang: 'r',
    label: 'R',
    compiled: false,
    cwd: 'file',
    needs: 'Rscript',
    // `--vanilla` stops R from loading the reader's `.Rprofile` and saved
    // workspace: a script that prints one line should not also print whatever
    // was left in `.RData` from an earlier session.
    steps: [{ kind: 'run', tool: 'Rscript', args: ['--vanilla', '{src}'] }],
  },
  julia: {
    lang: 'julia',
    label: 'Julia',
    compiled: false,
    cwd: 'file',
    needs: 'julia',
    steps: [{ kind: 'run', tool: 'julia', args: ['{src}'] }],
  },
  haskell: {
    lang: 'haskell',
    label: 'Haskell',
    compiled: false,
    cwd: 'file',
    needs: 'runghc',
    /*
     * `runghc` (runhaskell) instead of `runhaskell`: on Windows GHC ships
     * `runghc.exe` only, and the `runhaskell` alias is a Unix shell shim.
     * It compiles to a temp dir and runs, so there is no `{bin}` to keep.
     */
    steps: [{ kind: 'run', tool: 'runghc', args: ['{src}'] }],
  },
  elixir: {
    lang: 'elixir',
    label: 'Elixir',
    compiled: false,
    cwd: 'file',
    needs: 'elixir',
    steps: [{ kind: 'run', tool: 'elixir', args: ['{src}'] }],
  },
};

/**
 * Shells to try, in order, when the primary `bash` turns out to be a stub.
 *
 * On Windows `bash.exe` in `System32` is the WSL launcher, not a shell: it
 * translates `D:/x/uji.sh` into a Linux path, cannot see `D:` unless a
 * distro is installed and mounted, and answers "No such file or directory"
 * for a file that plainly exists. Git for Windows ships a real MSYS bash that
 * takes the same Windows path, so the Run command falls back to it.
 */
export const SHELL_ALTERNATIF: { tool: string; arg: (src: string) => string[] }[] = [
  { tool: 'C:/Program Files/Git/bin/bash.exe', arg: (src) => [src] },
  { tool: 'C:/Program Files (x86)/Git/bin/bash.exe', arg: (src) => [src] },
];

/** Languages a recipe exists for, in a stable order for menus and tests. */
export const BAHASA_RUN = Object.keys(RESEP) as LangId[];

/** True when `path` is the Windows WSL launcher rather than a real bash. */
export const bashWsl = (path: string) => /[\\/]system32[\\/]bash\.exe$/i.test(path);

/**
 * Recipe for a file, or `null` when the file is not something we can execute.
 *
 * Detection goes through `detectLang` so the Run button and the syntax
 * highlighter always agree on what a file is: two separate extension maps is
 * how a `.hpp` ends up highlighted as C++ and run as something else.
 */
export function resepUntuk(path: string | null): RunRecipe | null {
  if (!path) return null;
  return RESEP[detectLang(path)] ?? null;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');

/** Fill `{src}`, `{dir}`, `{base}`, `{bin}` in one argument list. */
export function isiArg(args: string[], nilai: Record<string, string>): string[] {
  return args.map((a) => a.replace(/\{(\w+)\}/g, (utuh, k: string) => nilai[k] ?? utuh));
}

export interface RencanaJalan {
  recipe: RunRecipe;
  /** Resolved compile arguments, or `null` when there is nothing to build. */
  compile: { tool: string; args: string[]; out: string } | null;
  /** Resolved run arguments; `{bin}` already substituted when compiled. */
  run: { tool: string; args: string[] };
  cwd: string;
}

/**
 * Turn a recipe plus a real file path into concrete commands.
 *
 * Compile must run before run, and the binary path is only known after the
 * compile step's `out` template is filled in - that is why the plan is built
 * here in one pass instead of being read off the table at call time.
 */
export function rencanaJalan(path: string, workspace: string | null): RencanaJalan | null {
  const recipe = resepUntuk(path);
  if (!recipe) return null;

  const src = norm(path);
  const slash = src.lastIndexOf('/');
  const dir = slash >= 0 ? src.slice(0, slash) : src;
  const nama = slash >= 0 ? src.slice(slash + 1) : src;
  const dot = nama.lastIndexOf('.');
  const base = dot > 0 ? nama.slice(0, dot) : nama;

  const dasar: Record<string, string> = { src, dir, base, nama };

  const langkahKompilasi = recipe.steps.find((s) => s.kind === 'compile');
  const out = langkahKompilasi && langkahKompilasi.kind === 'compile'
    ? isiArg([langkahKompilasi.out], dasar)[0]
    : '';

  const nilai: Record<string, string> = { ...dasar, bin: out };

  const compile = langkahKompilasi && langkahKompilasi.kind === 'compile'
    ? {
        tool: langkahKompilasi.tool,
        args: isiArg(langkahKompilasi.args, nilai),
        out,
      }
    : null;

  const langkahRun = recipe.steps.find((s) => s.kind === 'run');
  if (!langkahRun || langkahRun.kind !== 'run') return null;

  const cwd =
    recipe.cwd === 'workspace' && workspace ? workspace : dir;

  return {
    recipe,
    compile,
    run: { tool: isiArg([langkahRun.tool], nilai)[0], args: isiArg(langkahRun.args, nilai) },
    cwd,
  };
}

/**
 * Quote one argument for a PowerShell command line.
 *
 * `D:/a/b.cpp` needs no quotes, but any argument with a space, a `(`, `;` or a
 * backtick does - and the previous version of this helper quoted only when it
 * saw whitespace, so a path like `D:/My (notes)/x.cpp` split the command. The
 * conservative version quotes everything that is not plainly safe, and escapes
 * the two characters PowerShell still treats specially inside double quotes
 * (`` ` `` and `"`).
 */
export function kutipArg(a: string): string {
  if (a === '') return '""';
  /*
   * Plain-safe set: letters, digits and the punctuation that appears in real
   * flags and paths (`-std=c++17`, `-O0`, `D:/a/b.cpp`, `@file`). `=` and `+`
   * MUST be here - quoting `-std=c++17` produced `"-std=c++17"`, and the
   * compiler then reported an unknown option.
   */
  if (/^[A-Za-z0-9_./:\\=+@,%-]+$/.test(a)) return a;
  return `"${a.replace(/`/g, '``').replace(/"/g, '`"')}"`;
}

/**
 * One command line that compiles (when needed) and then runs the file, ready to
 * be typed into a REAL terminal pane.
 *
 * Why this exists next to `rencanaJalan`: the Run panel gives the program a
 * pipe and an input box, which is fine for a script that reads one line but is
 * not a terminal - `cin`, interactive prompts, arrow keys and Ctrl+C in the
 * program all expect the console the reader is looking at. The terminal path
 * (what VS Code does for every language) hands the program the pane's own
 * console, so typing works exactly as it does in a shell.
 *
 * PowerShell, not cmd: the pane's default shell here is PowerShell, and the
 * first version of this line used `_()` (a cmd construct) which PowerShell
 * rejected with "The term '_' is not recognized". `$?` after the compile is
 * the PowerShell way to ask "did that succeed", and `if (...) {...}` keeps the
 * line on one row so the whole command lands as ONE line in the pane - a
 * multi-line string would be executed line by line, and the second line would
 * arrive as a command of its own.
 */
export function perintahTerminal(rencana: RencanaJalan, penanda?: string): string {
  const kutip = (cmd: { tool: string; args: string[] }) =>
    [kutipArg(cmd.tool), ...cmd.args.map(kutipArg)].join(' ');

  const jalan = kutip(rencana.run);
  const inti = !rencana.compile
    ? jalan
    : `${kutip(rencana.compile)}; if ($?) { ${jalan} }`;

  /*
   * Penanda selesai. Program dijalankan DI DALAM shell pane, jadi tidak ada
   * `pty-exit` untuk tiap perintah - pane hidup terus. Tanpa penanda, status
   * Run menggantung "running" selamanya (tombol Run berikutnya jadi Stop).
   * Baris penanda dicetak SESUDAH program keluar, dan pemanggil memantaunya
   * dari buffer pane; string acak supaya output program tidak bisa memicunya.
   */
  if (!penanda) return inti;
  return `${inti}; Write-Output "${penanda}"`;
}
