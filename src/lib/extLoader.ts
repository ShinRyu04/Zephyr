import { snippetCompletion } from '@codemirror/autocomplete';
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import * as cmd from './commands';
import { tf } from './i18n';
import { setToolEkstensi } from './toolGate';
import type {
  ContribLanguage,
  ContribSnippet,
  ExtManifest,
  ExtManifestStatus,
} from './types';
import { THEMES, type ThemeInfo } from './themes';
import { petakanTemaVscode } from './vscodeThemeMap';
import { petakanTokenWarna } from './vscodeTokenMap';

import { useKb } from './keybindingStore';
import { commandIdAda, daftarkanCommandId } from './commandIds';
import { COMMANDS } from './commandRegistry';
import { perintahKeymap, dialihkan } from './keymapAlias';
import { setIkonExt, kosongkanIkonExt, ikonFileExt, jumlahIkonExt } from './extIkonFile';
import { MODE_IMPORTER, MODE_TERSEDIA } from './cmLegacyModes';
const themeTokens = new Map<string, Record<string, string>>();

const langByExt = new Map<string, ContribLanguage>();

const snippetsByLang = new Map<string, Completion[]>();

const extKeymap: Array<{ key: string; command: string; source: string }> = [];

/*
 * Which package claimed a file extension. Kept so a language pack that is
 * skipped (the extension already has an owner) can name the winner instead of
 * vanishing from the list without explanation.
 */
const langPemilik = new Map<string, string>();

export interface LoaderRingkasan {
  themes: string[];
  keymaps: number;
  snippets: number;
  languages: string[];
  commands: number;
  iconThemes: number;

  /*
   * Contributions the app accepted but cannot honour, reported instead of
   * silently swallowed.
   *
   * A TextMate grammar pack (`contributes.grammars`) installs, appears in the
   * list, and changes nothing: highlighting comes from the bundled CodeMirror
   * languages, and there is no TextMate engine. Saying so at load time is the
   * difference between "this pack is broken" and "this pack is not supported".
   */
  tidakDidukung: Array<{ id: string; fitur: string; alasan: string }>;

  gagal: Array<{ id: string; alasan: string }>;
}

let ringkasanTerakhir: LoaderRingkasan = {
  themes: [],
  keymaps: 0,
  snippets: 0,
  languages: [],
  commands: 0,
  iconThemes: 0,
  tidakDidukung: [],
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

/* Guard id tema memakai Set: O(1), dan tidak bisa bocor dua entri
 * ber-id sama walau dua pemuatan saling berselang-seling di tengah await. */
const idTemaTerdaftar = new Set<string>();

/*
 * Cari `tokenColors` di berkas tema.
 *
 * Berkas tema VS Code menaruhnya di akar, tetapi ada tema yang membungkusnya
 * (`{ theme: {...} }`) atau menumpangkannya pada `colors`. Kandidat diambil
 * berurutan dan yang pertama ada yang dipakai; `colors` hanya diperiksa kalau
 * memang objek lain, bukan alias dari `raw`.
 */
function tokenColorsTema(
  raw: Record<string, unknown>,
  colors: Record<string, unknown>,
): unknown {
  const kandidat: unknown[] = [];
  const tampung = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    kandidat.push((x as Record<string, unknown>).tokenColors);
  };
  tampung(raw);
  tampung(raw.theme);
  tampung(raw.tema);
  if (colors !== raw) tampung(colors);
  for (const k of kandidat) {
    if (k !== undefined && k !== null) return k;
  }
  return undefined;
}

async function muatTema(
  m: ExtManifest,
  gagal: Array<{ id: string; alasan: string }>,
): Promise<string[]> {
  const out: string[] = [];
  for (const t of m.contributes.themes) {
    const id = themeId(m.id, t.label || 'tema');

    // Skip a built-in id, and skip one we have already added in this pass: two
    // manifests with the same id (a bundled copy and an installed copy) would
    // otherwise register the same theme twice and the picker would list it
    // twice.
    if (idTemaTerdaftar.has(id)) continue;
    if (THEMES.some((x) => x.id === id)) continue;
    try {
      const raw = (await cmd.extensionsReadContrib(m.id, t.path)) as Record<string, unknown>;
      
      const colors = (raw.colors ?? raw.tokens ?? raw) as Record<string, unknown>;
      
      const tok: Record<string, string> = petakanTemaVscode(colors);

      /*
       * tokenColors VS Code -> token sintaks (--syn-*).
       *
       * Tanpa langkah ini, memasang tema VS Code mengubah chrome editor tetapi
       * BUKAN warna kode: petakanTemaVscode hanya memetakan warna UI dan tidak
       * pernah menyentuh tokenColors. Digabung SETELAH petakanTemaVscode supaya
       * token sintaks menang atas warna UI yang kebetulan bernama sama, dan
       * hanya kunci `--syn-` yang disalin - kunci lain dari peta token tidak
       * boleh menimpa token non-sintaks milik peta tema.
       */
      const tokenSintaks = petakanTokenWarna(tokenColorsTema(raw, colors));
      for (const [k, v] of Object.entries(tokenSintaks)) {
        if (k.startsWith('--syn-')) tok[k] = v;
      }

      if (Object.keys(tok).length === 0) {
        gagal.push({
          id: m.id,
          alasan: `tema "${t.label || m.name}": ${t.path} tidak memuat warna yang dikenali loader`,
        });
        continue;
      }
      themeTokens.set(id, tok);
      idTemaTerdaftar.add(id);
      daftarThemeInfo.push({
        id,
        label: `${t.label || m.name} (${m.name})`,
        kind: t.kind === 'light' ? 'light' : 'dark',
        hint: `from extension ${m.id}`,
      });
      out.push(id);
    } catch (e) {
      gagal.push({
        id: m.id,
        alasan: `tema "${t.label || m.name}": ${cmd.asZephyrError(e).message}`,
      });
    }
  }
  return out;
}

export const keymapEkstensi = () => extKeymap.slice();

async function muatKeymap(
  m: ExtManifest,
  gagal: Array<{ id: string; alasan: string }>,
  tidakDidukung: Array<{ id: string; fitur: string; alasan: string }>,
): Promise<number> {
  let n = 0;
  for (const k of m.contributes.keymaps) {
    try {
      const raw = await cmd.extensionsReadContrib(m.id, k.path);
      
      const arr = Array.isArray(raw) ? raw : (raw as { keybindings?: unknown }).keybindings;
      if (!Array.isArray(arr)) continue;
      for (const b of arr) {
        const key = String((b as { key?: unknown }).key ?? '').trim();
        const asli = String((b as { command?: unknown }).command ?? '').trim();
        if (!key || !asli) continue;
        /*
         * A pack written for VS Code names commands the VS Code way. Translate
         * the names that have a Zephyr counterpart (`workbench.action.quickOpen`
         * -> `view.quickOpen`) before validating, so the pack's chords reach the
         * live bindings instead of being dropped as unknown.
         */
        const command = perintahKeymap(asli);
        /*
         * A binding to a command Zephyr does not implement is inert: the chord
         * does nothing and no error appears anywhere. Name it instead of
         * letting it pass for a working shortcut. The final say belongs to
         * `mergeBindings` (an extension may register its command later), so the
         * binding is still passed on - this is the snapshot a reader can see.
         */
        if (!commandIdAda(command)) {
          tidakDidukung.push({
            id: m.id,
            fitur: 'keymap',
            alasan: dialihkan(asli)
              ? `binding "${key}" -> "${asli}" tidak berlaku: tidak ada padanan perintah Zephyr`
              : `binding "${key}" -> "${command}" tidak berlaku: Zephyr tidak punya command itu`,
          });
        }
        extKeymap.push({ key, command, source: m.id });
        n++;
        if (n >= 200) break;
      }
    } catch (e) {
      gagal.push({ id: m.id, alasan: `keymap ${k.path}: ${cmd.asZephyrError(e).message}` });
    }
  }
  return n;
}

async function muatSnippet(
  m: ExtManifest,
  gagal: Array<{ id: string; alasan: string }>,
): Promise<number> {
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
    } catch (e) {
      gagal.push({ id: m.id, alasan: `snippet ${s.path}: ${cmd.asZephyrError(e).message}` });
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

/*
 * The list of loadable legacy modes is not written down twice: it is
 * `MODE_TERSEDIA`, the keys of the importer table in cmLegacyModes.ts. A
 * hand-maintained copy here could accept a mode that no importer can load,
 * which is how a pack ends up installed, listed, and inert.
 */


/*
 * Whether a contributed language can actually produce highlight. Asked before a
 * pack's extensions are registered, so a pack without a loadable grammar is
 * reported instead of installed-and-inert.
 */
export function grammarTersedia(l: ContribLanguage): boolean {
  if (l.cmLang && PAKET_DIIZINKAN[l.cmLang]) return true;
  return !!l.legacyMode && MODE_TERSEDIA.has(l.legacyMode);
}

export async function muatCmBahasa(l: ContribLanguage): Promise<Extension[]> {
  if (l.cmLang && PAKET_DIIZINKAN[l.cmLang]) {
    try {
      return await PAKET_DIIZINKAN[l.cmLang]();
    } catch {
      return [];
    }
  }
  const muatMode = l.legacyMode ? MODE_IMPORTER[l.legacyMode] : undefined;
  if (muatMode) {
    try {
      const { StreamLanguage } = await import('@codemirror/language');
      const mod = (await muatMode()) as Record<string, unknown>;
      
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

function muatBahasa(
  m: ExtManifest,
  tidakDidukung: Array<{ id: string; fitur: string; alasan: string }>,
): string[] {
  const out: string[] = [];
  for (const l of m.contributes.languages) {
    if (!l.id) continue;
    if (!grammarTersedia(l)) {
      tidakDidukung.push({
        id: m.id,
        fitur: 'bahasa',
        alasan: `bahasa "${l.id}" tidak punya grammar yang bisa dimuat (legacyMode: ${l.legacyMode ?? '-'})`,
      });
      continue;
    }
    let dipakai = false;
    for (const e of l.extensions) {
      const key = e.toLowerCase().replace(/^\./, '');
      if (!key) continue;
      if (langByExt.has(key)) {
        const pemilik = langPemilik.get(key) ?? 'another package';
        tidakDidukung.push({
          id: m.id,
          fitur: 'bahasa',
          /*
           * Translated, not a literal Indonesian sentence.
           *
           * This string is RENDERED in the Marketplace panel, so it has to
           * follow `uiLang` like every other visible line. It used to be built
           * inline in Indonesian, which meant an English reader saw Indonesian
           * text in the middle of the extension card - measured by
           * `verify-bahasa-ui` as "Marketplace bocor".
           */
          alasan: tf('extension {ext} (language "{lang}") ignored: {ext} is already claimed by {owner}', {
            ext: `.${key}`,
            lang: l.id,
            owner: `"${pemilik}"`,
          }),
        });
        continue;
      }
      langByExt.set(key, l);
      langPemilik.set(key, m.id);
      dipakai = true;
    }
    if (dipakai) out.push(l.id);
  }
  return out;
}

export const ikonUntukExt = (ext: string) => ikonFileExt(ext);
export const adaIconTheme = () => jumlahIkonExt() > 0;

/*
 * The packs read by the last load, and which one is active.
 *
 * Module-level because the loader writes it and the picker reads it; it is not
 * React state. `useIkonTema` (ikonTemaStore.ts) is what the UI subscribes to -
 * the loader hands its result over after each load, so the picker always shows
 * exactly what is installed rather than a list assembled somewhere else.
 */
const paketIkon: Array<{
  extId: string;
  label: string;
  ikon: Record<string, { glyph?: string; color?: string; svg?: string }>;
  jumlahSvg: number;
}> = [];

/**
 * Decode a VS Code `fontCharacter` into the single character it draws.
 *
 * The field is a string holding one or more codepoints, written as `"\\e001"`,
 * `"\\uE001"`, or a literal character. It is what an icon-font theme uses
 * instead of Zephyr's `glyph`, and it is the difference between a VS Code pack
 * changing the tree and being refused. Multi-codepoint strings (ligatures) are
 * kept whole — the font resolves them, and truncating would break the ligature.
 */
function glyphDariFontChar(s: string): string {
  const t = s.trim();
  if (!t) return '';
  /* "\\e001" / "\\uE001" / "\\u{E001}": parse every escape, keep any literal. */
  const out: string[] = [];
  const re = /\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([0-9a-fA-F]+))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push(t.slice(last, m.index));
    const hex = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
    const cp = parseInt(hex, 16);
    if (Number.isFinite(cp) && cp > 0) {
      try {
        out.push(String.fromCodePoint(cp));
      } catch {
        /* Out of range: drop the escape rather than throw mid-load. */
      }
    }
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out.join('');
}

async function muatIconTheme(
  m: ExtManifest,
  gagal: Array<{ id: string; alasan: string }>,
): Promise<number> {
  let n = 0;
  for (const it of m.contributes.iconThemes) {
    try {
      const raw = (await cmd.extensionsReadContrib(m.id, it.path)) as Record<string, unknown>;

      /*
       * VS Code shape first, because it is what the marketplace actually ships.
       *
       * An icon theme from open-vsx declares `iconDefinitions` (each with either
       * `iconPath` pointing at an SVG file, or a `fontCharacter`), plus the
       * `fileExtensions` / `fileNames` / `folderNames` maps that point at them.
       * Reading only Zephyr's own `glyph` shape - which is what this did - meant
       * every real pack registered zero icons and the tree never changed.
       *
       * Order matters: a DRAWING beats a text mark. A pack that has both should
       * show its art, not its letter.
       */
      const defs = (raw.iconDefinitions ?? {}) as Record<
        string,
        { fontCharacter?: unknown; fontColor?: unknown; iconPath?: unknown }
      >;

      /* SVG bodies are read once per distinct path, not once per mapping: a pack
         maps dozens of extensions onto one `_file` definition. */
      const svgCache = new Map<string, string | null>();
      const bacaSvg = async (rel: string): Promise<string | null> => {
        if (svgCache.has(rel)) return svgCache.get(rel) ?? null;
        let isi: string | null = null;
        try {
          /* Reuse the contributor reader: same sandbox, same 512KB cap, same
             path guard (`resolve_in_ext` rejects `..` and absolute paths). */
          const teks = await cmd.extensionsReadMain(m.id, rel);
          isi = normalisasiSvg(teks);
        } catch {
          /* An unreadable icon file is not a reason to fail the whole pack: the
             other definitions still load. The count below reports what landed. */
          isi = null;
        }
        svgCache.set(rel, isi);
        return isi;
      };

      const ikonDari = async (
        idDef: string,
      ): Promise<{ glyph?: string; color?: string; svg?: string } | null> => {
        const def = defs[idDef];
        if (!def) return null;
        const color = String(def.fontColor ?? '').slice(0, 40) || undefined;
        const path = typeof def.iconPath === 'string' ? def.iconPath : '';
        if (path) {
          const svg = await bacaSvg(path);
          if (svg) return { svg, ...(color ? { color } : {}) };
        }
        const glyph = glyphDariFontChar(String(def.fontCharacter ?? ''));
        if (glyph) return { glyph, ...(color ? { color } : {}) };
        return null;
      };

      /*
       * Collected into a PACK, not written straight into the render map.
       *
       * The render map holds one set of icons, so writing every pack into it as
       * it loads made the last pack win - with three installed there was no way
       * to choose, and switching away from one left its icons behind for every
       * extension the next pack did not name. A pack is kept whole so the picker
       * can switch between them.
       */
      const ikon: Record<string, { glyph?: string; color?: string; svg?: string }> = {};
      let jumlahSvg = 0;
      const tambah = (kunci: string, ik: { glyph?: string; color?: string; svg?: string }) => {
        ikon[kunci.toLowerCase().replace(/^\./, '')] = ik;
        if (ik.svg) jumlahSvg += 1;
        n += 1;
      };

      /*
       * The generic slots. `file` / `folder` / `folderExpanded` are what a pack
       * falls back to for anything it does not name, and they are the icons the
       * reader sees most - a pack that changes only these has still changed the
       * whole tree.
       *
       * `raw.folderExpanded` is the VS Code spelling; `raw['folder-open']` is
       * Zephyr's own. Both are accepted because a pack may be written either way
       * and refusing one spelling silently leaves every folder on the default
       * drawing - the exact complaint this path exists to fix.
       */
      for (const [kunci, idDef] of [
        ['file', raw.file],
        ['folder', raw.folder],
        ['folder-open', raw.folderExpanded ?? raw['folder-open']],
      ] as const) {
        if (typeof idDef !== 'string') continue;
        const ik = await ikonDari(idDef);
        if (ik) tambah(kunci, ik);
      }

      /* Exact file names, then extensions, then folder names. */
      for (const [nama, idDef] of Object.entries((raw.fileNames ?? {}) as Record<string, unknown>)) {
        const ik = await ikonDari(String(idDef));
        if (ik) tambah(nama, ik);
      }
      for (const [ext, idDef] of Object.entries((raw.fileExtensions ?? {}) as Record<string, unknown>)) {
        const ik = await ikonDari(String(idDef));
        if (ik) tambah(ext, ik);
      }
      for (const [nama, idDef] of Object.entries((raw.folderNames ?? {}) as Record<string, unknown>)) {
        const ik = await ikonDari(String(idDef));
        if (ik) tambah(`folder:${nama}`, ik);
      }

      if (Object.keys(ikon).length === 0) {
        /*
         * Zephyr's own compact shape: `icons` (or the file itself) mapping an
         * extension straight to `{ glyph, color }`. Kept as the LAST branch so
         * the VS Code shape above wins when a pack somehow carries both.
         */
        const peta = (raw.icons ?? raw) as Record<string, unknown>;
        for (const [ext, def] of Object.entries(peta)) {
          const d = def as { glyph?: unknown; color?: unknown };
          const glyph = String(d.glyph ?? '').slice(0, 3);
          if (!glyph) continue;
          tambah(ext, { glyph, color: String(d.color ?? 'var(--fg2)').slice(0, 40) });
        }

        /*
         * `folderNames` BELONGS HERE TOO, and leaving it out was the bug.
         *
         * A pack in Zephyr's shape carries its generic folder marks inside
         * `icons` (as `folder` / `folder-open`), which the loop above already
         * picked up - but the PER-NAME folder map is a separate key, and this
         * branch never read it. The result was that installing a pack changed
         * file icons and left every folder on Zephyr's default drawing, which
         * reads exactly as "the icon theme does not change folders".
         *
         * The keys are stored as `folder:<name>` so they cannot collide with a
         * file extension that happens to share the name.
         */
        for (const [nama, def] of Object.entries((raw.folderNames ?? {}) as Record<string, unknown>)) {
          const d = def as { glyph?: unknown; color?: unknown };
          const glyph = String(d.glyph ?? '').slice(0, 3);
          if (!glyph) continue;
          tambah(`folder:${nama}`, { glyph, color: String(d.color ?? 'var(--accent)').slice(0, 40) });
        }
      }

      if (Object.keys(ikon).length > 0) {
        const label = String((it as { label?: unknown }).label ?? m.name ?? m.id);
        paketIkon.push({
          extId: `${m.id}::${label}`,
          label,
          ikon,
          jumlahSvg,
        });
      }
    } catch (e) {
      gagal.push({ id: m.id, alasan: `icon theme ${it.path}: ${cmd.asZephyrError(e).message}` });
    }
  }
  return n;
}

/**
 * Apply the CHOSEN pack to the render map.
 *
 * Clearing first is the whole point: the map holds one set of icons, and a
 * switch has to remove the previous pack's entries rather than layer on top of
 * them. Without the clear, choosing pack B after pack A left A's icons for every
 * extension B did not name - a hybrid belonging to no pack, with nothing on
 * screen to say so.
 */
export function terapkanIkonTema(extId: string | null): void {
  kosongkanIkonExt();
  if (!extId) return;
  const paket = paketIkon.find((p) => p.extId === extId);
  if (!paket) return;
  for (const [kunci, ik] of Object.entries(paket.ikon)) {
    setIkonExt(kunci, ik);
  }
}

/** The packs read by the last load, for the picker. */
export const daftarPaketIkon = () => paketIkon.slice();

function normalisasiSvg(teks: string): string | null {
  const t = teks.trim();
  if (!t.startsWith('<svg') && !t.startsWith('<?xml')) return null;
  const bersih = t
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
  /* Keep only the svg element itself: an XML prolog or a DOCTYPE would be
     invalid inside innerHTML. */
  const mulai = bersih.indexOf('<svg');
  if (mulai < 0) return null;
  const akhir = bersih.lastIndexOf('</svg>');
  if (akhir < mulai) return null;
  return bersih.slice(mulai, akhir + '</svg>'.length);
}

const extCommands: Array<{ id: string; title: string; description: string; extId: string }> = [];
export const commandsEkstensi = () => extCommands.slice();

/* Tool dari paket, dirakit selama pemuatan lalu diserahkan sekali di akhir. */
const hasilToolEkstensi: Array<{ id: string; label: string; tools: string[] }> = [];

/*
 * B2 - pemuatan bersifat serial.
 *
 * `muatSemuaEkstensi()` dipanggil dari paling tidak dua tempat yang bisa
 * tumpang-tindih: pemuatan awal app dan `refresh()` setelah pasang/aktif.
 * Seluruh state modul (daftarThemeInfo, themeTokens, extCommands) di-reset
 * di awal lalu diisi ulang lewat beberapa await - dua pemuatan yang
 * bersinggungan bisa menimpa satu sama lain dan mendaftarkan tema yang
 * sama dua kali (kartu tema tampil dobel di picker) atau kehilangan token.
 * Antrean di bawah menjamin hanya satu pemuatan aktif pada satu waktu;
 * pemanggil berikutnya tetap mendapat jalankan sendiri yang segar, bukan
 * hasil basi dari pemuatan sebelum pasang.
 */
let antreMuat: Promise<unknown> = Promise.resolve();
export function muatSemuaEkstensi(): Promise<LoaderRingkasan> {
  const jalan = antreMuat.then(
    () => muatSemuaEkstensiAsli(),
    () => muatSemuaEkstensiAsli(),
  );
  antreMuat = jalan.catch(() => {});
  return jalan;
}

async function muatSemuaEkstensiAsli(): Promise<LoaderRingkasan> {
  /*
   * Guarantee the id set is complete before a single extension keymap is
   * validated.
   *
   * commandRegistry.ts publishes its ids into COMMAND_IDS when that module is
   * first evaluated, and this import keeps that module on the load path even
   * on a start where the command palette is never opened. Without it a binding
   * made in Settings would be accepted while the same binding replayed from an
   * extension manifest could be dropped.
   */
  for (const c of COMMANDS) daftarkanCommandId(c.id);

  themeTokens.clear();
  daftarThemeInfo.length = 0;
  idTemaTerdaftar.clear();
  langByExt.clear();
  snippetsByLang.clear();
  extKeymap.length = 0;
  kosongkanIkonExt();
  /* The pack list is rebuilt on every load: a pack that was uninstalled must be
     gone from the picker, not left over from the previous load. */
  paketIkon.length = 0;
  langPemilik.clear();
  extCommands.length = 0;

  /* Daftar dibangun ulang tiap pemuatan: paket yang sudah dilepas harus
     benar-benar hilang dari picker, bukan menumpuk dari pemuatan sebelumnya. */
  hasilToolEkstensi.length = 0;

  const hasil: LoaderRingkasan = {
    themes: [],
    keymaps: 0,
    snippets: 0,
    languages: [],
    commands: 0,
    iconThemes: 0,
    tidakDidukung: [],
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
        alasan: st.error ?? 'the manifest could not be read',
      });
      continue;
    }
    
    if (!st.enabled) continue;
    const m = st.manifest;
    if (!m.engineOk) {
      hasil.gagal.push({ id: m.id, alasan: `butuh Zephyr ${m.engine}` });
      continue;
    }

    hasil.themes.push(...(await muatTema(m, hasil.gagal)));
    hasil.keymaps += await muatKeymap(m, hasil.gagal, hasil.tidakDidukung);
    hasil.snippets += await muatSnippet(m, hasil.gagal);
    hasil.languages.push(...muatBahasa(m, hasil.tidakDidukung));
    hasil.iconThemes += await muatIconTheme(m, hasil.gagal);

    for (const c of m.contributes.commands) {
      extCommands.push({ ...c, extId: m.id });
      hasil.commands++;
    }

    /*
     * Perintah paket juga menjadi TOOL yang dilihat agen.
     *
     * Sebelum ini `contributes.commands` hanya masuk `extCommands` - daftar
     * yang dibaca palet perintah, bukan loop agen. Akibatnya paket yang membawa
     * perintah tampil di kartunya dan tidak menambah satu kemampuan pun yang
     * bisa dipanggil model: bentuk kegagalan yang paling sulit dilihat, karena
     * tidak ada yang error.
     */
    const toolPaket = m.contributes.commands
      .filter((c) => (c.id ?? '').trim().length > 0)
      .map((c) => {
        /*
         * Buang awalan yang Rust tambahkan ke id perintah (`ext.<paket>.`).
         * Tanpa ini nama tool berisi paketnya dua kali
         * (`ext__zephyr.zephyr.uji__ext.zephyr.zephyr.uji.satu`), dan yang
         * dibaca model adalah jalur paket, bukan nama aksinya.
         */
        const awalan = `ext.${m.id}.`;
        const bersih = c.id.startsWith(awalan) ? c.id.slice(awalan.length) : c.id;
        return `ext__${m.id}__${bersih}`;
      });
    if (toolPaket.length > 0) {
      hasilToolEkstensi.push({ id: m.id, label: m.name || m.id, tools: toolPaket });
    }

    /*
     * TextMate grammars are parsed by Rust (`contributes.grammars`) but nothing
     * in the editing stack consumes them. Report that plainly rather than
     * letting the user conclude the pack does nothing.
     */
    const grammars = (m.contributes as { grammars?: unknown[] }).grammars ?? [];
    if (grammars.length > 0) {
      hasil.tidakDidukung.push({
        id: m.id,
        fitur: 'grammars',
        alasan: `paket ini menyumbang ${grammars.length} grammar TextMate, tetapi Zephyr belum punya mesin TextMate - penyorotan warna tetap memakai bahasa bawaan.`,
      });
    }

    /*
     * Debug adapters (`contributes.debuggers` / `contributes.debugAdapters`).
     *
     * The loader does not start them - nothing does - so this list is the only
     * place a user finds out. The reason is not "unsupported": Zephyr speaks
     * DAP (`dap.rs`), but its adapter registry is fixed (node via js-debug,
     * python via debugpy) and `dap_start` builds the command line from
     * `spec_node`/`spec_python`; no code path reads `program`/`runtime` out of
     * a manifest. Saying that is the difference between "this pack is broken"
     * and "this pack is detected but never started".
     */
    const dap = (m.contributes as { debugAdapters?: Array<{ type?: string; label?: string }> })
      .debugAdapters ?? [];
    if (dap.length > 0) {
      const nama = dap
        .map((d) => (d.label ?? '').trim() || (d.type ?? '').trim() || '(unnamed)')
        .join(', ');
      hasil.tidakDidukung.push({
        id: m.id,
        fitur: 'debugAdapters',
        alasan: `paket ini menyumbang ${dap.length} debug adapter (${nama}), tetapi Zephyr belum menjalankan adapter dari paket: registry-nya tetap (node, python) dan tidak ada jalur kode yang membaca program/runtime dari manifest - adapter terdeteksi, belum dijalankan.`,
      });
    }
  }

  /*
   * Serahkan tool paket ke sekat tool SEKALI di akhir pemuatan.
   *
   * Per paket, bukan per tool: picker menampilkan bagian EXTENSIONS sebagai
   * satu kelompok per ekstensi (`api-client 0/11`), jadi user bisa mematikan
   * satu paket tanpa menyentuh paket lain - dan nama paket yang membawa tool
   * selalu terbaca.
   */
  setToolEkstensi(
    hasilToolEkstensi.map((g) => ({
      id: `ekstensi-${g.id}`,
      label: g.label,
      section: 'ekstensi' as const,
      optional: true,
      tools: g.tools,
      ekstensiId: g.id,
    })),
  );

  ringkasanTerakhir = hasil;

  const { daftarkanTemaEkstensi } = await import('./themes');
  daftarkanTemaEkstensi(daftarThemeInfo.slice(), terapkanTokenEkstensi);

  try {

    const { mergeBindings } = await import('./keybindings');
    useKb.setState({ bindings: mergeBindings(useKb.getState().user, extKeymap.slice()) });
  } catch {
    /* keybindingStore is not ready yet at the earliest boot — load() will merge */
  }

  try {
    const { naikkanExtVersi } = await import('../components/editor/CodeMirrorEditor');
    naikkanExtVersi();
  } catch {
    /* outside the UI (harness/node) there is no editor */
  }

  try {
    const { muatEkstensiRuntime } = await import('./extHost');
    await muatEkstensiRuntime(daftar);
  } catch {
    /* non-fatal */
  }

  /*
   * Hand the packs to the picker, and apply whichever one is chosen.
   *
   * The loader no longer writes icons straight into the render map - it collects
   * packs, and this is the one place that decides which pack the tree draws.
   * `aktif` survives a reload if that pack is still installed; `terapkanIkonTema`
   * clears the map first, so a pack that was uninstalled takes its icons with it.
   */
  try {
    const { useIkonTema } = await import('./ikonTemaStore');
    const store = useIkonTema.getState();
    store.setPacks(daftarPaketIkon());
    terapkanIkonTema(useIkonTema.getState().aktif);
  } catch {
    /* non-fatal: the tree keeps Zephyr's own icons */
  }

  return hasil;
}
