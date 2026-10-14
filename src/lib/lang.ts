import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { ContribLanguage, LangId } from './types';
import { bahasaUntukExt, muatCmBahasa, snippetSource, adaSnippet } from './extLoader';

const BY_EXT: Record<string, LangId> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  htm: 'html',
  vue: 'html',
  svelte: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  py: 'python',
  pyw: 'python',
  rs: 'rust',
  go: 'go',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  svg: 'xml',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'cpp',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'shell',
  bat: 'shell',
  cmd: 'shell',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  env: 'ini',
  properties: 'ini',
  
  dart: 'dart',
  rb: 'ruby',
  lua: 'lua',
  perl: 'perl',
  pl: 'perl',
  pm: 'perl',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  txt: 'plain',
  log: 'plain',
};

const BY_NAME: Record<string, LangId> = {
  dockerfile: 'shell',
  makefile: 'shell',
  '.gitignore': 'ini',
  '.npmrc': 'ini',
  '.env': 'ini',
  'cargo.lock': 'toml',
};

export function detectLang(nameOrPath: string | null): LangId {
  if (!nameOrPath) return 'plain';
  const base = nameOrPath.replace(/\\/g, '/').split('/').pop() ?? '';
  const lower = base.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'plain';
  return BY_EXT[lower.slice(dot + 1)] ?? 'plain';
}

export function extLangUntuk(nameOrPath: string | null): ContribLanguage | null {
  if (!nameOrPath) return null;
  const base = nameOrPath.replace(/\\/g, '/').split('/').pop() ?? '';
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = lower.slice(dot + 1);

  /*
   * The built-in map wins for any extension Zephyr already handles, and the
   * contributed language is consulted only for the rest.
   *
   * This used to read `if (!BY_EXT[ext]) return null; return bahasaUntukExt(ext)`,
   * so the lookup bailed out for every extension the built-in map did not know:
   * a contributed language for `.apl`, `.z80` or `.cbl` was installed, listed in
   * the UI, and never activated. Removing the gate alone flipped the problem
   * around - a pack claiming `.css` or `.py` then overrode the built-in grammar
   * with its own. What the shelf needs is a rule with no silent losers either
   * way, and it is this one: the built-in language keeps every extension it
   * knows, a pack only ever adds extensions nothing else claims.
   */
  if (detectLang(nameOrPath) !== 'plain') return null;
  return bahasaUntukExt(ext);
}

export function labelBahasa(nameOrPath: string | null): string {
  const e = extLangUntuk(nameOrPath);
  if (e) return e.label;
  return LANG_LABEL[detectLang(nameOrPath)];
}

export const LANG_LABEL: Record<LangId, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  jsx: 'JavaScript JSX',
  tsx: 'TypeScript JSX',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
  markdown: 'Markdown',
  python: 'Python',
  rust: 'Rust',
  go: 'Go',
  sql: 'SQL',
  yaml: 'YAML',
  toml: 'TOML',
  xml: 'XML',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  shell: 'Shell',
  ini: 'INI',
  dart: 'Dart',
  ruby: 'Ruby',
  lua: 'Lua',
  perl: 'Perl',
  swift: 'Swift',
  kotlin: 'Kotlin',
  scala: 'Scala',
  plain: 'Plain Text',
};

const cache = new Map<LangId, Extension[]>();

const cacheExt = new Map<string, Extension[]>();

export async function loadLangExtension(lang: LangId): Promise<Extension[]> {
  const hit = cache.get(lang);
  if (hit) return hit;

  const ext = await build(lang);
  cache.set(lang, ext);
  return ext;
}

export async function extensiUntukFile(
  nameOrPath: string | null,
): Promise<{ ext: Extension[]; langId: string; dariEkstensi: boolean }> {
  /*
   * Order matters here exactly as much as in `extLangUntuk`, and the two agree:
   * the built-in map answers first, a contributed language only fills the gaps.
   *
   * This block used to argue the opposite - a pack claiming `.sql` should be
   * able to re-map it to its own dialect grammar - but the bundled packs never
   * carried a grammar better than the built-in one, so all the precedence
   * bought was a real CodeMirror language (css, python, javascript) being
   * replaced by a legacy stream mode. A pack wins an extension nothing else
   * claims, and `extLangUntuk` is the single place that decides it.
   */
  const e = extLangUntuk(nameOrPath);
  if (!e) {
    const bawaan = detectLang(nameOrPath);
    if (bawaan === 'plain') return { ext: [], langId: 'plain', dariEkstensi: false };
    const ext = await loadLangExtension(bawaan);
    const snip = adaSnippet(bawaan) ? snippetTambahan(bawaan) : [];
    return { ext: [...ext, ...snip], langId: bawaan, dariEkstensi: false };
  }

  let ext = cacheExt.get(e.id);
  if (!ext) {
    ext = await muatCmBahasa(e);
    cacheExt.set(e.id, ext);
  }
  const snip = adaSnippet(e.id) ? snippetTambahan(e.id) : [];
  return { ext: [...ext, ...snip], langId: e.id, dariEkstensi: true };
}

function snippetTambahan(lang: string): Extension[] {
  
  return [
    EditorState.languageData.of(() => [{ autocomplete: snippetSource(lang) }]),
  ];
}

async function build(lang: LangId): Promise<Extension[]> {
  switch (lang) {
    case 'javascript':
      return [(await import('@codemirror/lang-javascript')).javascript()];
    case 'jsx':
      return [(await import('@codemirror/lang-javascript')).javascript({ jsx: true })];
    case 'typescript':
      return [(await import('@codemirror/lang-javascript')).javascript({ typescript: true })];
    case 'tsx':
      return [
        (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true }),
      ];
    case 'json':
      return [(await import('@codemirror/lang-json')).json()];
    case 'html':
      return [(await import('@codemirror/lang-html')).html()];
    case 'css':
      return [(await import('@codemirror/lang-css')).css()];
    case 'markdown':
      return [(await import('@codemirror/lang-markdown')).markdown()];
    case 'python':
      return [(await import('@codemirror/lang-python')).python()];
    case 'rust':
      return [(await import('@codemirror/lang-rust')).rust()];
    case 'go':
      return [(await import('@codemirror/lang-go')).go()];
    case 'sql':
      return [(await import('@codemirror/lang-sql')).sql()];
    case 'yaml':
      return [(await import('@codemirror/lang-yaml')).yaml()];
    case 'xml':
      return [(await import('@codemirror/lang-xml')).xml()];
    case 'java':
      return [(await import('@codemirror/lang-java')).java()];
    case 'cpp':
    case 'c':
      return [(await import('@codemirror/lang-cpp')).cpp()];
    case 'toml': {
      const { StreamLanguage } = await import('@codemirror/language');
      const { toml } = await import('@codemirror/legacy-modes/mode/toml');
      return [StreamLanguage.define(toml)];
    }
    case 'shell': {
      const { StreamLanguage } = await import('@codemirror/language');
      const { shell } = await import('@codemirror/legacy-modes/mode/shell');
      return [StreamLanguage.define(shell)];
    }
    case 'ini': {
      const { StreamLanguage } = await import('@codemirror/language');
      const { properties } = await import('@codemirror/legacy-modes/mode/properties');
      return [StreamLanguage.define(properties)];
    }
    case 'ruby': {
      const { StreamLanguage } = await import('@codemirror/language');
      const { ruby } = await import('@codemirror/legacy-modes/mode/ruby');
      return [StreamLanguage.define(ruby)];
    }
    case 'lua': {
      const { StreamLanguage } = await import('@codemirror/language');
      const { lua } = await import('@codemirror/legacy-modes/mode/lua');
      return [StreamLanguage.define(lua)];
    }
    case 'perl': {
      const { StreamLanguage } = await import('@codemirror/language');
      const { perl } = await import('@codemirror/legacy-modes/mode/perl');
      return [StreamLanguage.define(perl)];
    }
    case 'swift': {
      const { StreamLanguage } = await import('@codemirror/language');
      const { swift } = await import('@codemirror/legacy-modes/mode/swift');
      return [StreamLanguage.define(swift)];
    }
    
    case 'dart': {
      const { StreamLanguage } = await import('@codemirror/language');
      const clike = (await import('@codemirror/legacy-modes/mode/clike')) as unknown as Record<
        string,
        Parameters<typeof StreamLanguage.define>[0]
      >;
      return [StreamLanguage.define(clike.dart)];
    }
    case 'kotlin': {
      const { StreamLanguage } = await import('@codemirror/language');
      const clike = (await import('@codemirror/legacy-modes/mode/clike')) as unknown as Record<
        string,
        Parameters<typeof StreamLanguage.define>[0]
      >;
      return [StreamLanguage.define(clike.kotlin)];
    }
    case 'scala': {
      const { StreamLanguage } = await import('@codemirror/language');
      const clike = (await import('@codemirror/legacy-modes/mode/clike')) as unknown as Record<
        string,
        Parameters<typeof StreamLanguage.define>[0]
      >;
      return [StreamLanguage.define(clike.scala)];
    }
    default:
      return [];
  }
}
