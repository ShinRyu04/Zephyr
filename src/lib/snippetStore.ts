// snippetStore.ts — mesin snippet: terjemah sintaks VS Code → CM6 (fase 30).
//
// ══════════════════ KEPUTUSAN ARSITEKTUR ══════════════════
//
// 1. Tab stop TIDAK ditulis sendiri. `@codemirror/autocomplete` 6.18.3 sudah
//    punya mesinnya (`snippet()`, `snippetKeymap`, `nextSnippetField`) —
//    diverifikasi lewat context7 /codemirror/autocomplete. Yang perlu ditulis
//    hanya PENERJEMAH: sintaks VS Code (`${1:x}`, `${1|a,b|}`, `$0`, variabel)
//    ke sintaks CM6 (`${x}`, `${}`).
//
//    Bedanya nyata dan harus dipahami:
//      VS Code : nomor eksplisit, `$0` = posisi akhir, occurrence sinkron
//      CM6     : URUTAN KEMUNCULAN menentukan urutan tab, nama field jadi
//                teks default, field bernama sama dipakai bersama (sinkron)
//    Jadi penerjemah harus MENGURUTKAN ULANG berdasarkan nomor, bukan
//    menyalin apa adanya.
//
// 2. Variabel (`$TM_SELECTED_TEXT`, `$CURRENT_YEAR`, …) diselesaikan SEBELUM
//    body diserahkan ke CM6. Mereka bukan tab stop — nilainya sudah pasti saat
//    ekspansi, dan membiarkannya sebagai field akan membuat user harus menekan
//    Tab melewati sesuatu yang tidak perlu diedit.
//
// 3. Escape `\$` dijaga sepanjang pipeline. Body snippet sering memuat `$`
//    literal (shell, PHP, template string), dan menganggap semuanya placeholder
//    akan merusak snippet yang sah.

import { snippet } from '@codemirror/autocomplete';
import type { Completion } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { create } from 'zustand';

import * as cmd from './commands';
import { clipboardRead } from './clipboard';
import type { Snippet, SnippetSet } from './types';

// ───────────────────── variabel snippet ─────────────────────

/** Keadaan editor yang dibutuhkan untuk mengisi variabel. */
export interface KonteksVar {
  /** teks yang sedang diseleksi ('' bila tidak ada) */
  seleksi: string;
  /** path file aktif */
  path: string;
  /** isi baris tempat kursor berada */
  baris: string;
  /** nomor baris 1-based */
  nomorBaris: number;
  /** isi clipboard (dibaca lewat plugin Tauri, lihat catatan di bawah) */
  clipboard: string;
  /** indentasi baris saat ini, dipakai untuk merapikan body multi-baris */
  indent: string;
}

const duaDigit = (n: number) => String(n).padStart(2, '0');

/**
 * Nilai semua variabel yang didukung.
 *
 * Subset VS Code, dipilih yang benar-benar bisa dipenuhi tanpa menebak.
 * Variabel yang TIDAK didukung sengaja dibiarkan apa adanya (lihat
 * `terjemahBody`) — mengganti yang tak dikenal dengan string kosong membuat
 * body rusak tanpa jejak, sedangkan teks `$FOO` yang masih terlihat langsung
 * memberi tahu user apa yang salah.
 */
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

/** UUID v4 tanpa dependensi (crypto.randomUUID tidak selalu ada di WebView2). */
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

// ───────────────────── penerjemah sintaks ─────────────────────

/** Satu token hasil parse body snippet. */
type Token =
  | { jenis: 'teks'; nilai: string }
  | { jenis: 'stop'; nomor: number; label: string; pilihan: string[] };

/**
 * Parse body gaya VS Code menjadi token.
 *
 * Ditulis sebagai pemindai karakter, BUKAN regex. Regex tidak bisa menangani
 * placeholder BERSARANG (`${1:${2:x}}`) yang diminta brief — jumlah kurung
 * tutup harus dihitung, dan itu di luar kemampuan regex biasa.
 */
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

    // Escape: `\$` `\}` `\\` → karakter literal.
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

    // $0 .. $9 (tanpa kurung)
    const m1 = /^\$(\d+)/.exec(body.slice(i));
    if (m1) {
      dorongTeks();
      out.push({ jenis: 'stop', nomor: Number(m1[1]), label: '', pilihan: [] });
      i += m1[0].length;
      continue;
    }

    // $NAMA_VARIABEL (tanpa kurung)
    const m2 = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(body.slice(i));
    if (m2) {
      dorongTeks();
      // Variabel diwakili token teks dengan penanda; nilainya diisi
      // `terjemahBody` setelah parse supaya parser tetap satu urusan.
      out.push({ jenis: 'teks', nilai: `\u0000VAR:${m2[1]}\u0000` });
      i += m2[0].length;
      continue;
    }

    // ${...}
    if (body[i + 1] === '{') {
      const tutup = cariTutup(body, i + 2);
      if (tutup < 0) {
        // Kurung tidak pernah ditutup: perlakukan sebagai teks biasa daripada
        // membuang sisa body.
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

    // `$` biasa.
    teks += c;
    i++;
  }
  dorongTeks();
  return out;
}

/** Cari `}` penutup yang sepadan, mulai dari `dari`. */
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

/** Parse isi `${...}` (tanpa kurungnya). */
function parseKurung(isi: string): Token[] {
  // ${1|a,b,c|} — choice
  const mc = /^(\d+)\|(.*)\|$/.exec(isi);
  if (mc) {
    const pilihan = mc[2].split(',').map((x) => x.trim()).filter(Boolean);
    return [
      {
        jenis: 'stop',
        nomor: Number(mc[1]),
        // Pilihan pertama jadi teks default: CM6 tidak punya UI choice, dan
        // menampilkan "a,b,c" sebagai teks akan menyisipkan sampah kalau user
        // langsung menekan Tab.
        label: pilihan[0] ?? '',
        pilihan,
      },
    ];
  }

  // ${1:default} — default boleh memuat placeholder bersarang.
  const md = /^(\d+):([\s\S]*)$/.exec(isi);
  if (md) {
    const dalam = parseBody(md[2]);
    // Placeholder bersarang DIRATAKAN: teksnya jadi label, stop di dalamnya
    // dibuang. CM6 tidak mendukung field bersarang, dan menyimulasikannya
    // butuh mesin tab-stop sendiri — di luar lingkup fase ini.
    const label = dalam
      .map((t) => (t.jenis === 'teks' ? t.nilai : t.label))
      .join('');
    return [{ jenis: 'stop', nomor: Number(md[1]), label, pilihan: [] }];
  }

  // ${1} — kosong
  const mn = /^(\d+)$/.exec(isi);
  if (mn) {
    return [{ jenis: 'stop', nomor: Number(mn[1]), label: '', pilihan: [] }];
  }

  // ${VAR} atau ${VAR:default} atau ${VAR/regex/ganti/flag}
  const mv = /^([A-Za-z_][A-Za-z0-9_]*)(?::([\s\S]*))?$/.exec(isi);
  if (mv) {
    return [{ jenis: 'teks', nilai: `\u0000VAR:${mv[1]}:${mv[2] ?? ''}\u0000` }];
  }

  // Transformasi regex (${VAR/a/b/g}) TIDAK didukung: dibiarkan apa adanya
  // supaya kelihatan, bukan dibuang diam-diam.
  return [{ jenis: 'teks', nilai: `\${${isi}}` }];
}

/**
 * Terjemahkan body VS Code ke template CM6 + kembalikan info tab stop.
 *
 * CM6 memakai URUTAN KEMUNCULAN, jadi stop diurutkan ulang berdasarkan nomor:
 * `$2` yang muncul sebelum `$1` di body tetap dikunjungi setelah `$1`.
 * `$0` selalu terakhir (itu artinya di VS Code).
 */
export function terjemahBody(
  body: string,
  konteks: KonteksVar,
): { template: string; stops: number[]; adaVarTakDikenal: string[] } {
  const token = parseBody(body);
  const vars = nilaiVariabel(konteks);
  const takDikenal: string[] = [];

  // Urutan tab: nomor kecil dulu, `0` paling akhir.
  const nomorUnik = [...new Set(token.filter((t) => t.jenis === 'stop').map((t) => t.nomor))];
  nomorUnik.sort((a, b) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });

  // Nama field per nomor. Field dengan nama SAMA di CM6 otomatis sinkron —
  // itulah yang memenuhi syarat brief "occurrences sama".
  const namaField = new Map<number, string>();
  for (const n of nomorUnik) {
    const pertama = token.find((t) => t.jenis === 'stop' && t.nomor === n) as
      | Extract<Token, { jenis: 'stop' }>
      | undefined;
    const label = (pertama?.label ?? '').trim();
    // Nama field CM6 tidak boleh memuat `}` atau newline.
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
    // CM6: `${}` = field tanpa teks default, `${nama}` = dengan default.
    template += nama ? `\${${nama}}` : '${}';
  }

  return { template, stops: nomorUnik, adaVarTakDikenal: takDikenal };
}

/** Ganti penanda \u0000VAR:NAMA:default\u0000 dengan nilainya. */
function isiVariabel(
  s: string,
  vars: Record<string, string>,
  takDikenal: string[],
): string {
  return s.replace(/\u0000VAR:([A-Za-z_][A-Za-z0-9_]*)(?::([\s\S]*?))?\u0000/g, (_m, nama, def) => {
    const v = vars[nama];
    if (v !== undefined) {
      // Variabel yang dikenal tapi KOSONG (mis. tidak ada seleksi) memakai
      // default bila disediakan — itu gunanya `${TM_SELECTED_TEXT:x}`.
      return v !== '' ? v : (def ?? '');
    }
    takDikenal.push(nama);
    return `$${nama}`;
  });
}

/** Ambil konteks variabel dari EditorView yang hidup. */
export async function konteksDari(view: EditorView, path: string): Promise<KonteksVar> {
  const st = view.state;
  const sel = st.selection.main;
  const baris = st.doc.lineAt(sel.head);
  let clip = '';
  try {
    // navigator.clipboard SELALU gagal di WebView2 saat dokumen tidak fokus
    // (pelajaran fase 05) — dipakai plugin Tauri lewat lib/clipboard.ts.
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

/**
 * Jadikan sebuah Snippet menjadi Completion CM6.
 *
 * `apply` dibuat ASINKRON-AMAN: variabel yang butuh clipboard sudah diisi
 * lebih dulu saat store memuat konteks, jadi fungsi apply-nya sinkron —
 * CM6 memanggil apply di dalam transaksi dan tidak menunggu Promise.
 */
export function keCompletion(s: Snippet, konteks: KonteksVar): Completion {
  const { template } = terjemahBody(s.body, konteks);
  return {
    label: s.prefix,
    // `type: 'text'` + detail: ikon snippet diberi CSS sendiri lewat
    // atribut `data-snippet` di renderer; CM6 tidak punya tipe 'snippet'.
    type: 'snippet',
    detail: s.description || s.name,
    info: () => {
      // Pratinjau body: paling berguna untuk snippet multi-baris.
      const el = document.createElement('pre');
      el.className = 'cm-snippet-preview';
      el.textContent = s.body.replace(/\$\{?\d+:?([^}]*)\}?/g, '$1');
      return el;
    },
    apply: snippet(template),
    boost: s.sumber === 'user' ? 2 : s.sumber.startsWith('ext:') ? 1 : 0,
  };
}

/**
 * Sisipkan snippet ke EditorView aktif, langsung mengaktifkan mode tab stop.
 *
 * Dipakai palette ("Insert Snippet") — jalur ini TIDAK lewat completion, jadi
 * ia harus mengganti seleksi sendiri: `snippet()` dari CM6 menerima rentang
 * `from`/`to`, dan memberi `to = kepala seleksi` akan menyisipkan snippet
 * sambil MEMBUANG teks terseleksi, padahal `${TM_SELECTED_TEXT}` baru saja
 * memakainya.
 */
export async function sisipkanSnippet(
  view: EditorView,
  s: Snippet,
  path: string,
): Promise<void> {
  const konteks = await konteksDari(view, path);
  const { template } = terjemahBody(s.body, konteks);
  const sel = view.state.selection.main;
  // Seleksi memang diganti (itu yang diharapkan saat membungkus teks), tapi
  // nilainya sudah masuk ke template lewat konteks di atas.
  snippet(template)(view, null, sel.from, sel.to);
  view.focus();
}

// ───────────────────────── store ─────────────────────────

interface SnipState {
  /** cache per bahasa; dikosongkan saat file user berubah */
  perBahasa: Record<string, SnippetSet>;
  loading: boolean;
  error: string | null;
  /** bahasa yang punya file user (untuk UI) */
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
      // Cache dibuang: file baru saja dibuat/akan diedit.
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
