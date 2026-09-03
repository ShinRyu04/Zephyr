// lang.ts — deteksi bahasa dari nama file + loader ekstensi CodeMirror.
//
// PENTING (target RAM/startup di PRD): paket bahasa di-import DINAMIS
// supaya bundle awal kecil dan parser hanya dimuat saat file bahasa itu
// benar-benar dibuka. detectLang/LANG_LABEL tetap sinkron (map string).

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
  txt: 'plain',
  log: 'plain',
};

/** Nama file khusus tanpa ekstensi. */
const BY_NAME: Record<string, LangId> = {
  dockerfile: 'shell',
  makefile: 'shell',
  '.gitignore': 'ini',
  '.npmrc': 'ini',
  '.env': 'ini',
  'cargo.lock': 'toml',
};

/** Deteksi bahasa dari ekstensi file. */
export function detectLang(nameOrPath: string | null): LangId {
  if (!nameOrPath) return 'plain';
  const base = nameOrPath.replace(/\\/g, '/').split('/').pop() ?? '';
  const lower = base.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'plain';
  return BY_EXT[lower.slice(dot + 1)] ?? 'plain';
}

/**
 * Bahasa dari EKSTENSI (fase 19) untuk file ini, kalau peta bawaan tidak tahu.
 *
 * Sengaja fungsi terpisah, bukan menyuntik BY_EXT: `detectLang` mengembalikan
 * `LangId` (union tertutup) yang dipakai StatusBar & LANG_LABEL, sedangkan
 * bahasa ekstensi id-nya bebas. Urutan 19.5 (Default → Extension) juga jadi
 * eksplisit: bawaan diperiksa lebih dulu, ekstensi tidak bisa membajak `.ts`.
 */
export function extLangUntuk(nameOrPath: string | null): ContribLanguage | null {
  if (!nameOrPath) return null;
  const base = nameOrPath.replace(/\\/g, '/').split('/').pop() ?? '';
  const lower = base.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = lower.slice(dot + 1);
  // Bawaan menang.
  if (BY_EXT[ext]) return null;
  return bahasaUntukExt(ext);
}

/** Label untuk StatusBar: bawaan, atau nama bahasa dari ekstensi. */
export function labelBahasa(nameOrPath: string | null): string {
  const l = detectLang(nameOrPath);
  if (l !== 'plain') return LANG_LABEL[l];
  const e = extLangUntuk(nameOrPath);
  return e ? e.label : LANG_LABEL.plain;
}

/** Label yang tampil di StatusBar. */
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
  plain: 'Plain Text',
};

const cache = new Map<LangId, Extension[]>();
/** Cache bahasa dari ekstensi, key = id bahasa ekstensi. */
const cacheExt = new Map<string, Extension[]>();

/** Muat ekstensi bahasa (dynamic import + cache). Plain text -> []. */
export async function loadLangExtension(lang: LangId): Promise<Extension[]> {
  const hit = cache.get(lang);
  if (hit) return hit;

  const ext = await build(lang);
  cache.set(lang, ext);
  return ext;
}

/**
 * Semua ekstensi CodeMirror untuk sebuah FILE: parser bawaan atau parser dari
 * ekstensi (fase 19), plus completion snippet kalau ada.
 *
 * Ini pintu tunggal yang dipakai CodeMirrorEditor — supaya urutan
 * Default → Extension cuma ditulis satu kali.
 */
export async function extensiUntukFile(
  nameOrPath: string | null,
): Promise<{ ext: Extension[]; langId: string; dariEkstensi: boolean }> {
  const bawaan = detectLang(nameOrPath);
  if (bawaan !== 'plain') {
    const ext = await loadLangExtension(bawaan);
    const snip = adaSnippet(bawaan) ? snippetTambahan(bawaan) : [];
    return { ext: [...ext, ...snip], langId: bawaan, dariEkstensi: false };
  }

  const e = extLangUntuk(nameOrPath);
  if (!e) return { ext: [], langId: 'plain', dariEkstensi: false };

  let ext = cacheExt.get(e.id);
  if (!ext) {
    ext = await muatCmBahasa(e);
    cacheExt.set(e.id, ext);
  }
  const snip = adaSnippet(e.id) ? snippetTambahan(e.id) : [];
  return { ext: [...ext, ...snip], langId: e.id, dariEkstensi: true };
}

/** Completion snippet dari ekstensi sebagai sumber tambahan CodeMirror. */
function snippetTambahan(lang: string): Extension[] {
  // `autocompletion` di CodeMirrorEditor sudah punya source bawaan; memakai
  // `override` akan MEMBUANG semuanya (kata di dokumen, LSP). Cara yang benar
  // adalah menambah source lewat facet `autocompletion({ override })` milik
  // bahasa — yaitu `languageData.autocomplete`, yang digabung CodeMirror.
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
    default:
      return [];
  }
}
