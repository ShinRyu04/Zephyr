import { snippetCompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import * as cmd from './commands';
import type {
  ContribLanguage,
  ContribSnippet,
  ExtManifest,
  ExtManifestStatus,
} from './types';
import { THEMES, type ThemeInfo } from './themes';
import { petakanTemaVscode } from './vscodeThemeMap';

const themeTokens = new Map<string, Record<string, string>>();

const langByExt = new Map<string, ContribLanguage>();

const snippetsByLang = new Map<string, Completion[]>();

const extKeymap: Array<{ key: string; command: string; source: string }> = [];

const iconTheme = new Map<string, { glyph: string; color: string }>();

export interface LoaderRingkasan {
  themes: string[];
  keymaps: number;
  snippets: number;
  languages: string[];
  commands: number;
  iconThemes: number;
  
  gagal: Array<{ id: string; alasan: string }>;
}

let ringkasanTerakhir: LoaderRingkasan = {
  themes: [],
  keymaps: 0,
  snippets: 0,
  languages: [],
  commands: 0,
  iconThemes: 0,
  gagal: [],
};

export const ringkasanLoader = () => ringkasanTerakhir;

const themeId = (extId: string, label: string) =>
  `ext.${extId}.${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

export function terapkanTokenEkstensi(id: string): boolean {
  const tok = id ? themeTokens.get(id) : undefined;
  const root = document.documentElement;
  
  for (const nama of Array.from(tokenTerpakai)) {
    if (!tok || !(nama in tok)) {
      root.style.removeProperty(nama);
      tokenTerpakai.delete(nama);
    }
  }
  if (!tok) return false;
  for (const [k, v] of Object.entries(tok)) {
    const nama = k.startsWith('--') ? k : `--${k}`;
    root.style.setProperty(nama, v);
    tokenTerpakai.add(nama);
  }
  return true;
}

const tokenTerpakai = new Set<string>();

export const themesEkstensi = (): ThemeInfo[] => daftarThemeInfo.slice();
const daftarThemeInfo: ThemeInfo[] = [];

async function muatTema(m: ExtManifest): Promise<string[]> {
  const out: string[] = [];
  for (const t of m.contributes.themes) {
    const id = themeId(m.id, t.label || 'tema');
    
    if (THEMES.some((x) => x.id === id)) continue;
    try {
      const raw = (await cmd.extensionsReadContrib(m.id, t.path)) as Record<string, unknown>;
      
      const colors = (raw.colors ?? raw.tokens ?? raw) as Record<string, unknown>;
      
      const tok: Record<string, string> = petakanTemaVscode(colors);
      if (Object.keys(tok).length === 0) continue;
      themeTokens.set(id, tok);
      daftarThemeInfo.push({
        id,
        label: `${t.label || m.name} (${m.name})`,
        kind: t.kind === 'light' ? 'light' : 'dark',
        hint: `dari ekstensi ${m.id}`,
      });
      out.push(id);
    } catch {
      /* file tema rusak — dicatat pemanggil sebagai gagal */
    }
  }
  return out;
}

export const keymapEkstensi = () => extKeymap.slice();

async function muatKeymap(m: ExtManifest): Promise<number> {
  let n = 0;
  for (const k of m.contributes.keymaps) {
    try {
      const raw = await cmd.extensionsReadContrib(m.id, k.path);
      
      const arr = Array.isArray(raw) ? raw : (raw as { keybindings?: unknown }).keybindings;
      if (!Array.isArray(arr)) continue;
      for (const b of arr) {
        const key = String((b as { key?: unknown }).key ?? '').trim();
        const command = String((b as { command?: unknown }).command ?? '').trim();
        if (!key || !command) continue;
        extKeymap.push({ key, command, source: m.id });
        n++;
        if (n >= 200) break;
      }
    } catch {
      /* diabaikan; pemanggil mencatat */
    }
  }
  return n;
}

async function muatSnippet(m: ExtManifest): Promise<number> {
  let n = 0;
  for (const s of m.contributes.snippets as ContribSnippet[]) {
    try {
      const raw = (await cmd.extensionsReadContrib(m.id, s.path)) as Record<string, unknown>;
      const lang = (s.language || 'plain').toLowerCase();
      const list = snippetsByLang.get(lang) ?? [];
      
      for (const [nama, isi] of Object.entries(raw)) {
        const o = isi as { prefix?: unknown; body?: unknown; description?: unknown };
        const prefix = String(o.prefix ?? nama);
        const body = Array.isArray(o.body) ? o.body.join('\n') : String(o.body ?? '');
        if (!prefix || !body) continue;
        list.push(
          snippetCompletion(body, {
            label: prefix,
            detail: `snippet · ${m.name}`,
            info: String(o.description ?? ''),
            type: 'snippet',
          }),
        );
        n++;
        if (n >= 500) break;
      }
      snippetsByLang.set(lang, list);
    } catch {
      /* diabaikan */
    }
  }
  return n;
}

export function snippetSource(lang: string) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const list = snippetsByLang.get(lang.toLowerCase());
    if (!list || list.length === 0) return null;
    const kata = ctx.matchBefore(/[\w$-]+/);
    if (!kata && !ctx.explicit) return null;
    return {
      from: kata ? kata.from : ctx.pos,
      options: list,
      validFor: /^[\w$-]*$/,
    };
  };
}

export const adaSnippet = (lang: string) => (snippetsByLang.get(lang.toLowerCase())?.length ?? 0) > 0;
export const jumlahSnippet = () => {
  let n = 0;
  for (const v of snippetsByLang.values()) n += v.length;
  return n;
};

export const bahasaEkstensi = () => Array.from(langByExt.values());

export function bahasaUntukExt(ext: string): ContribLanguage | null {
  return langByExt.get(ext.toLowerCase().replace(/^\./, '')) ?? null;
}

const PAKET_DIIZINKAN: Record<string, () => Promise<Extension[]>> = {
  '@codemirror/lang-css': async () => [(await import('@codemirror/lang-css')).css()],
  '@codemirror/lang-html': async () => [(await import('@codemirror/lang-html')).html()],
  '@codemirror/lang-json': async () => [(await import('@codemirror/lang-json')).json()],
  '@codemirror/lang-java': async () => [(await import('@codemirror/lang-java')).java()],
  '@codemirror/lang-sql': async () => [(await import('@codemirror/lang-sql')).sql()],
  '@codemirror/lang-xml': async () => [(await import('@codemirror/lang-xml')).xml()],
  '@codemirror/lang-yaml': async () => [(await import('@codemirror/lang-yaml')).yaml()],
};

const MODE_LEGACY = new Set([
  'apl',
  'asciiarmor',
  'asterisk',
  'brainfuck',
  'clike',
  'clojure',
  'cmake',
  'cobol',
  'coffeescript',
  'commonlisp',
  'crystal',
  'css',
  'cypher',
  'd',
  'diff',
  'dockerfile',
  'dtd',
  'dylan',
  'ebnf',
  'ecl',
  'eiffel',
  'elm',
  'erlang',
  'factor',
  'fcl',
  'forth',
  'fortran',
  'gas',
  'gherkin',
  'go',
  'groovy',
  'haskell',
  'haxe',
  'http',
  'idl',
  'javascript',
  'jinja2',
  'julia',
  'livescript',
  'lua',
  'mathematica',
  'mbox',
  'mirc',
  'mllike',
  'modelica',
  'mscgen',
  'mumps',
  'nginx',
  'nsis',
  'ntriples',
  'octave',
  'oz',
  'pascal',
  'pegjs',
  'perl',
  'pig',
  'powershell',
  'properties',
  'protobuf',
  'pug',
  'puppet',
  'python',
  'q',
  'r',
  'rpm',
  'ruby',
  'rust',
  'sas',
  'sass',
  'scheme',
  'shell',
  'sieve',
  'smalltalk',
  'solr',
  'sparql',
  'spreadsheet',
  'sql',
  'stex',
  'stylus',
  'swift',
  'tcl',
  'textile',
  'tiddlywiki',
  'tiki',
  'toml',
  'troff',
  'ttcn',
  'ttcn-cfg',
  'turtle',
  'vb',
  'vbscript',
  'velocity',
  'verilog',
  'vhdl',
  'wast',
  'webidl',
  'xml',
  'xquery',
  'yacas',
  'yaml',
  'z80'
]);

export async function muatCmBahasa(l: ContribLanguage): Promise<Extension[]> {
  if (l.cmLang && PAKET_DIIZINKAN[l.cmLang]) {
    try {
      return await PAKET_DIIZINKAN[l.cmLang]();
    } catch {
      return [];
    }
  }
  if (l.legacyMode && MODE_LEGACY.has(l.legacyMode)) {
    try {
      const { StreamLanguage } = await import('@codemirror/language');
      const mod = (await import(
         `@codemirror/legacy-modes/mode/${l.legacyMode}`
      )) as Record<string, unknown>;
      
      const parser = Object.values(mod).find(
        (v) => v && typeof v === 'object' && 'token' in (v as object),
      );
      if (!parser) return [];
      return [StreamLanguage.define(parser as never)];
    } catch {
      return [];
    }
  }
  return [];
}

function muatBahasa(m: ExtManifest): string[] {
  const out: string[] = [];
  for (const l of m.contributes.languages) {
    if (!l.id) continue;
    let dipakai = false;
    for (const e of l.extensions) {
      const key = e.toLowerCase().replace(/^\./, '');
      if (!key || langByExt.has(key)) continue;
      langByExt.set(key, l);
      dipakai = true;
    }
    if (dipakai) out.push(l.id);
  }
  return out;
}

export const ikonUntukExt = (ext: string) =>
  iconTheme.get(ext.toLowerCase().replace(/^\./, '')) ?? null;
export const adaIconTheme = () => iconTheme.size > 0;

async function muatIconTheme(m: ExtManifest): Promise<number> {
  let n = 0;
  for (const it of m.contributes.iconThemes) {
    try {
      const raw = (await cmd.extensionsReadContrib(m.id, it.path)) as Record<string, unknown>;
      
      const peta = (raw.icons ?? raw) as Record<string, unknown>;
      for (const [ext, def] of Object.entries(peta)) {
        const d = def as { glyph?: unknown; color?: unknown };
        const glyph = String(d.glyph ?? '').slice(0, 3);
        if (!glyph) continue;
        iconTheme.set(ext.toLowerCase().replace(/^\./, ''), {
          glyph,
          color: String(d.color ?? 'var(--fg2)').slice(0, 40),
        });
        n++;
      }
    } catch {
      /* diabaikan */
    }
  }
  return n;
}

const extCommands: Array<{ id: string; title: string; description: string; extId: string }> = [];
export const commandsEkstensi = () => extCommands.slice();

export async function muatSemuaEkstensi(): Promise<LoaderRingkasan> {
  
  themeTokens.clear();
  daftarThemeInfo.length = 0;
  langByExt.clear();
  snippetsByLang.clear();
  extKeymap.length = 0;
  iconTheme.clear();
  extCommands.length = 0;

  const hasil: LoaderRingkasan = {
    themes: [],
    keymaps: 0,
    snippets: 0,
    languages: [],
    commands: 0,
    iconThemes: 0,
    gagal: [],
  };

  let daftar: ExtManifestStatus[] = [];
  try {
    daftar = await cmd.extensionsManifests();
  } catch (e) {
    hasil.gagal.push({ id: '(daftar)', alasan: cmd.asZephyrError(e).message });
    ringkasanTerakhir = hasil;
    return hasil;
  }

  for (const st of daftar) {
    if (st.error || !st.manifest) {
      hasil.gagal.push({
        id: st.path.split(/[\\/]/).pop() ?? st.path,
        alasan: st.error ?? 'manifest tidak terbaca',
      });
      continue;
    }
    
    if (!st.enabled) continue;
    const m = st.manifest;
    if (!m.engineOk) {
      hasil.gagal.push({ id: m.id, alasan: `butuh Zephyr ${m.engine}` });
      continue;
    }

    hasil.themes.push(...(await muatTema(m)));
    hasil.keymaps += await muatKeymap(m);
    hasil.snippets += await muatSnippet(m);
    hasil.languages.push(...muatBahasa(m));
    hasil.iconThemes += await muatIconTheme(m);

    for (const c of m.contributes.commands) {
      extCommands.push({ ...c, extId: m.id });
      hasil.commands++;
    }
  }

  ringkasanTerakhir = hasil;

  const { daftarkanTemaEkstensi } = await import('./themes');
  daftarkanTemaEkstensi(daftarThemeInfo.slice(), terapkanTokenEkstensi);

  try {
    const { useKb } = await import('./keybindingStore');
    const { mergeBindings } = await import('./keybindings');
    useKb.setState({ bindings: mergeBindings(useKb.getState().user, extKeymap.slice()) });
  } catch {
    /* keybindingStore belum siap saat boot paling awal — load() akan merge */
  }

  try {
    const { naikkanExtVersi } = await import('../components/editor/CodeMirrorEditor');
    naikkanExtVersi();
  } catch {
    /* di luar UI (harness/node) tidak ada editor */
  }

  try {
    const { muatEkstensiRuntime } = await import('./extHost');
    await muatEkstensiRuntime(daftar);
  } catch {
    /* non-fatal */
  }

  return hasil;
}
