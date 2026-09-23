import { snippet } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { create } from 'zustand';

import * as cmd from './commands';
import { clipboardRead } from './clipboard';
import type { Snippet, SnippetSet } from './types';

export interface KonteksVar {
  
  seleksi: string;
  
  path: string;
  
  baris: string;
  
  nomorBaris: number;
  
  clipboard: string;
  
  indent: string;
}

const duaDigit = (n: number) => String(n).padStart(2, '0');

export function nilaiVariabel(k: KonteksVar): Record<string, string> {
  const now = new Date();
  const namaFile = k.path.split(/[\\/]/).pop() ?? '';
  const titik = namaFile.lastIndexOf('.');
  const dir = k.path.replace(/[\\/][^\\/]*$/, '');

  return {
    TM_SELECTED_TEXT: k.seleksi,
    SELECTION: k.seleksi,
    TM_CURRENT_LINE: k.baris,
    LINE: k.baris,
    TM_LINE_INDEX: String(Math.max(0, k.nomorBaris - 1)),
    TM_LINE_NUMBER: String(k.nomorBaris),
    LINE_NUMBER: String(k.nomorBaris),
    TM_FILENAME: namaFile,
    TM_FILENAME_BASE: titik > 0 ? namaFile.slice(0, titik) : namaFile,
    TM_FILEPATH: k.path,
    TM_DIRECTORY: dir,
    RELATIVE_FILEPATH: k.path,
    CLIPBOARD: k.clipboard,
    CURRENT_YEAR: String(now.getFullYear()),
    CURRENT_YEAR_SHORT: String(now.getFullYear()).slice(-2),
    CURRENT_MONTH: duaDigit(now.getMonth() + 1),
    CURRENT_DATE: duaDigit(now.getDate()),
    CURRENT_HOUR: duaDigit(now.getHours()),
    CURRENT_MINUTE: duaDigit(now.getMinutes()),
    CURRENT_SECOND: duaDigit(now.getSeconds()),
    CURRENT_DAY_NAME: now.toLocaleDateString('id-ID', { weekday: 'long' }),
    CURRENT_MONTH_NAME: now.toLocaleDateString('id-ID', { month: 'long' }),
    CURRENT_TIMESTAMP: now.toISOString(),
    CURRENT_SECONDS_UNIX: String(Math.floor(now.getTime() / 1000)),
    BLOCK_COMMENT_START: '/*',
    BLOCK_COMMENT_END: '*/',
    LINE_COMMENT: '//',
    UUID: uuidSederhana(),
  };
}

function uuidSederhana(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else s += h[Math.floor(Math.random() * 16)];
  }
  return s;
}

type Token =
  | { jenis: 'teks'; nilai: string }
  | { jenis: 'stop'; nomor: number; label: string; pilihan: string[] };

export function parseBody(body: string): Token[] {
  const out: Token[] = [];
  let teks = '';
  let i = 0;

  const dorongTeks = () => {
    if (teks) {
      out.push({ jenis: 'teks', nilai: teks });
      teks = '';
    }
  };

  while (i < body.length) {
    const c = body[i];

    if (c === '\\' && i + 1 < body.length && '$}\\'.includes(body[i + 1])) {
      teks += body[i + 1];
      i += 2;
      continue;
    }

    if (c !== '$') {
      teks += c;
      i++;
      continue;
    }

    const m1 = /^\$(\d+)/.exec(body.slice(i));
    if (m1) {
      dorongTeks();
      out.push({ jenis: 'stop', nomor: Number(m1[1]), label: '', pilihan: [] });
      i += m1[0].length;
      continue;
    }

    const m2 = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(body.slice(i));
    if (m2) {
      dorongTeks();
      
      out.push({ jenis: 'teks', nilai: `\u0000VAR:${m2[1]}\u0000` });
      i += m2[0].length;
      continue;
    }

    if (body[i + 1] === '{') {
      const tutup = cariTutup(body, i + 2);
      if (tutup < 0) {
        
        teks += c;
        i++;
        continue;
      }
      const isi = body.slice(i + 2, tutup);
      i = tutup + 1;
      dorongTeks();
      out.push(...parseKurung(isi));
      continue;
    }

    teks += c;
    i++;
  }
  dorongTeks();
  return out;
}

function cariTutup(s: string, dari: number): number {
  let dalam = 1;
  for (let i = dari; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      continue;
    }
    if (s[i] === '{') dalam++;
    else if (s[i] === '}') {
      dalam--;
      if (dalam === 0) return i;
    }
  }
  return -1;
}

function parseKurung(isi: string): Token[] {
  
  const mc = /^(\d+)\|(.*)\|$/.exec(isi);
  if (mc) {
    const pilihan = mc[2].split(',').map((x) => x.trim()).filter(Boolean);
    return [
      {
        jenis: 'stop',
        nomor: Number(mc[1]),
        
        label: pilihan[0] ?? '',
        pilihan,
      },
    ];
  }

  const md = /^(\d+):([\s\S]*)$/.exec(isi);
  if (md) {
    const dalam = parseBody(md[2]);
    
    const label = dalam
      .map((t) => (t.jenis === 'teks' ? t.nilai : t.label))
      .join('');
    return [{ jenis: 'stop', nomor: Number(md[1]), label, pilihan: [] }];
  }

  const mn = /^(\d+)$/.exec(isi);
  if (mn) {
    return [{ jenis: 'stop', nomor: Number(mn[1]), label: '', pilihan: [] }];
  }

  const mv = /^([A-Za-z_][A-Za-z0-9_]*)(?::([\s\S]*))?$/.exec(isi);
  if (mv) {
    return [{ jenis: 'teks', nilai: `\u0000VAR:${mv[1]}:${mv[2] ?? ''}\u0000` }];
  }

  return [{ jenis: 'teks', nilai: `\${${isi}}` }];
}

export function terjemahBody(
  body: string,
  konteks: KonteksVar,
): { template: string; stops: number[]; adaVarTakDikenal: string[] } {
  const token = parseBody(body);
  const vars = nilaiVariabel(konteks);
  const takDikenal: string[] = [];

  const nomorUnik = [...new Set(token.filter((t) => t.jenis === 'stop').map((t) => t.nomor))];
  nomorUnik.sort((a, b) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });

  const namaField = new Map<number, string>();
  for (const n of nomorUnik) {
    const pertama = token.find((t) => t.jenis === 'stop' && t.nomor === n) as
      | Extract<Token, { jenis: 'stop' }>
      | undefined;
    const label = (pertama?.label ?? '').trim();
    
    const bersih = label.replace(/[\r\n}]/g, ' ').trim();
    namaField.set(n, bersih);
  }

  let template = '';
  for (const t of token) {
    if (t.jenis === 'teks') {
      template += isiVariabel(t.nilai, vars, takDikenal);
      continue;
    }
    const nama = namaField.get(t.nomor) ?? '';
    
    template += nama ? `\${${nama}}` : '${}';
  }

  return { template, stops: nomorUnik, adaVarTakDikenal: takDikenal };
}

function isiVariabel(
  s: string,
  vars: Record<string, string>,
  takDikenal: string[],
): string {
  return s.replace(/\u0000VAR:([A-Za-z_][A-Za-z0-9_]*)(?::([\s\S]*?))?\u0000/g, (_m, nama, def) => {
    const v = vars[nama];
    if (v !== undefined) {
      
      return v !== '' ? v : (def ?? '');
    }
    takDikenal.push(nama);
    return `$${nama}`;
  });
}

export async function konteksDari(view: EditorView, path: string): Promise<KonteksVar> {
  const st = view.state;
  const sel = st.selection.main;
  const baris = st.doc.lineAt(sel.head);
  let clip = '';
  try {
    
    clip = await clipboardRead();
  } catch {
    clip = '';
  }
  return {
    seleksi: sel.empty ? '' : st.sliceDoc(sel.from, sel.to),
    path,
    baris: baris.text,
    nomorBaris: baris.number,
    clipboard: clip,
    indent: /^[\t ]*/.exec(baris.text)?.[0] ?? '',
  };
}

export function keCompletion(s: Snippet, konteks: KonteksVar): Completion {
  const { template } = terjemahBody(s.body, konteks);
  return {
    label: s.prefix,
    
    type: 'snippet',
    detail: s.description || s.name,
    info: () => {
      
      const el = document.createElement('pre');
      el.className = 'cm-snippet-preview';
      el.textContent = s.body.replace(/\$\{?\d+:?([^}]*)\}?/g, '$1');
      return el;
    },
    apply: snippet(template),
    boost: s.sumber === 'user' ? 2 : s.sumber.startsWith('ext:') ? 1 : 0,
  };
}

export async function sisipkanSnippet(
  view: EditorView,
  s: Snippet,
  path: string,
): Promise<void> {
  const konteks = await konteksDari(view, path);
  const { template } = terjemahBody(s.body, konteks);
  const sel = view.state.selection.main;
  
  snippet(template)(view, null, sel.from, sel.to);
  view.focus();
}

interface SnipState {
  
  perBahasa: Record<string, SnippetSet>;
  loading: boolean;
  error: string | null;
  
  bahasaUser: string[];
  bahasaBawaan: string[];
}

interface SnipActions {
  muat: (lang: string, paksa?: boolean) => Promise<SnippetSet | null>;
  untuk: (lang: string) => Snippet[];
  bukaFileUser: (lang: string) => Promise<string | null>;
  muatDaftar: () => Promise<void>;
  bersihkanCache: () => void;
}

export const useSnip = create<SnipState & SnipActions>((set, get) => ({
  perBahasa: {},
  loading: false,
  error: null,
  bahasaUser: [],
  bahasaBawaan: [],

  muat: async (lang, paksa = false) => {
    const key = (lang || 'global').toLowerCase();
    if (!paksa && get().perBahasa[key]) return get().perBahasa[key];
    set({ loading: true, error: null });
    try {
      const setb = await cmd.snippetsLoad(key);
      set((s) => ({
        perBahasa: { ...s.perBahasa, [key]: setb },
        loading: false,
      }));
      return setb;
    } catch (e) {
      set({ loading: false, error: cmd.asZephyrError(e).message });
      return null;
    }
  },

  untuk: (lang) => get().perBahasa[(lang || 'global').toLowerCase()]?.snippets ?? [],

  bukaFileUser: async (lang) => {
    try {
      const p = await cmd.snippetsUserFile(lang || 'global');
      
      get().bersihkanCache();
      await get().muatDaftar();
      return p;
    } catch (e) {
      set({ error: cmd.asZephyrError(e).message });
      return null;
    }
  },

  muatDaftar: async () => {
    try {
      const [user, bawaan] = await Promise.all([
        cmd.snippetsUserList(),
        cmd.snippetsBuiltinLangs(),
      ]);
      set({ bahasaUser: user, bahasaBawaan: bawaan });
    } catch {
      /* daftar hanya untuk UI — gagal bukan alasan mengganggu editor */
    }
  },

  bersihkanCache: () => set({ perBahasa: {} }),
}));
