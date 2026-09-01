// lang.ts — deteksi bahasa dari nama file + loader ekstensi CodeMirror.
//
// PENTING (target RAM/startup di PRD): paket bahasa di-import DINAMIS
// supaya bundle awal kecil dan parser hanya dimuat saat file bahasa itu
// benar-benar dibuka. detectLang/LANG_LABEL tetap sinkron (map string).

import type { Extension } from '@codemirror/state';
import type { LangId } from './types';

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

export function detectLang(nameOrPath: string | null): LangId {
  if (!nameOrPath) return 'plain';
  const base = nameOrPath.replace(/\\/g, '/').split('/').pop() ?? '';
  const lower = base.toLowerCase();
  if (BY_NAME[lower]) return BY_NAME[lower];
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return 'plain';
  return BY_EXT[lower.slice(dot + 1)] ?? 'plain';
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

/** Muat ekstensi bahasa (dynamic import + cache). Plain text -> []. */
export async function loadLangExtension(lang: LangId): Promise<Extension[]> {
  const hit = cache.get(lang);
  if (hit) return hit;

  const ext = await build(lang);
  cache.set(lang, ext);
  return ext;
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
