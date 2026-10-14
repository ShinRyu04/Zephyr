/**
 * Dekorasi kode ala Copilot (item 182): sorot baris yang berubah + teks bayangan
 * yang bisa diumpani.
 *
 * ## Dua dekorasi, satu sakelar masing-masing
 *
 *   * SOROT BARIS (`sorotBaris`) - latar tipis + garis tepi di baris yang
 *     ditambah/diubah terhadap HEAD. Datanya BUKAN diambil di sini: modul ini
 *     menerima daftar `BarisUbah` dari `src/lib/gitBars.ts`, jadi diff-nya tetap
 *     satu (`git diff HEAD` yang sama dengan batang di gutter). Dua perintah git
 *     untuk satu pertanyaan adalah dua jawaban yang cepat atau lambat berbeda.
 *
 *   * TEKS BAYANGAN (`usulanInline`) - usulan ditempel redup di posisi kursor,
 *     Tab menerima, Esc menolak.
 *
 * ## Kenapa saran TIDAK diambil dari jaringan di sini
 *
 * Sumbernya adalah FUNGSI YANG DIUMPANI (`pasangPenyediaUsulan`), bukan HTTP di
 * dalam modul ini. Alasannya bukan kehati-hatian berlebihan: jalur AI berjaringan
 * sudah ada dan dimiliki modul lain (`src/lib/ghostText.ts`), dan pengambilan
 * kedua di tempat ini akan memanggil model dua kali untuk satu ketikan - satu
 * saran dihargai dua permintaan. Dengan penyedia yang disuntikkan, logika
 * terima/tolak di sini bisa diuji tanpa model dan tanpa akun, dan pemanggil
 * bebas mengisi saran dari mana saja (fungsi lokal, papan klip, atau jalur AI
 * yang sudah ada). Tanpa penyedia terpasang, fiturnya diam - bukan memanggil
 * jaringan secara diam-diam.
 *
 * ## Warna
 *
 * Tidak ada warna keras di sini maupun di CSS-nya: sorot memakai `--added` /
 * `--modified` (variabel tema yang sudah ada), dan teks bayangan memakai kelas
 * `.cm-ghost*` yang sudah dipakai ghost text - satu gaya untuk satu makna, dan
 * warnanya ikut tema aktif seperti seluruh editor.
 */
import { StateEffect, StateField, type Extension, type Text } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type DecorationSet,
} from '@codemirror/view';
import type { BarisUbah } from '../../lib/gitBars';
import { barisUnik, kelasBaris, potongBelakang, usulanLayak } from './dekorasiMurni';

/* ─────────────────────────── sorot baris ─────────────────────────── */

const setSorot = StateEffect.define<BarisUbah[]>();

/**
 * Ubah nomor baris menjadi dekorasi baris.
 *
 * `Decoration.line().range()` menerima POSISI dokumen, bukan nomor baris -
 * berbeda dari penanda gutter di `gitBars.ts` yang justru menerima nomor baris.
 * Karena itu nomornya diterjemahkan lewat `doc.line(n).from` di sini; menyerahkan
 * nomornya langsung akan mewarnai baris yang salah begitu dokumen lebih panjang
 * daripada lebar sorotan.
 */
function dekoSorot(list: readonly BarisUbah[], doc: Text): DecorationSet {
  const baris = barisUnik(list, doc.lines);
  if (baris.length === 0) return Decoration.none;
  return Decoration.set(
    baris.map((b) => Decoration.line({ class: kelasBaris(b.jenis) }).range(doc.line(b.line).from)),
    true,
  );
}

/**
 * Baris berubah: `--added` untuk baris baru, `--modified` untuk yang diubah.
 *
 * Kebijakan perubahan dokumen sama dengan batang di gutter, dan alasannya sama:
 * setelah suntingan, nomor baris dari diff terhadap HEAD tidak lagi cocok dengan
 * buffer, jadi menyorot "kira-kira di situ" berarti menuduh baris yang tidak
 * disentuh siapa pun. Pemanggil mengambil ulang setelah simpan.
 */
export const sorotField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    const efek = tr.effects.find((e) => e.is(setSorot));
    if (efek) return dekoSorot(efek.value, tr.state.doc);
    if (tr.docChanged) return Decoration.none;
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Ganti daftar baris yang disorot dalam satu transaksi. */
export function dekorasiBarisUbah(list: BarisUbah[]) {
  return setSorot.of(list);
}

/* ────────────────────────── teks bayangan ────────────────────────── */

/** Konteks yang dikirim ke penyedia saran. Sengaja teks, bukan state CodeMirror. */
export interface KonteksUsulan {
  /** Teks berkas dari awal sampai kursor (dipotong; lihat `potongBelakang`). */
  sebelum: string;
  /** Teks berkas setelah kursor, sepanjang yang dibutuhkan untuk menghindari duplikasi. */
  sesudah: string;
  /** Teks baris ini dari awal baris sampai kursor. */
  baris: string;
  /** Nomor baris kursor, 1-based. */
  line: number;
  /** Id bahasa buffer, bila pemanggil mengetahuinya (`tab.lang`). */
  lang?: string;
}

/**
 * Sumber saran. Boleh sinkron atau async; `null` berarti "tidak ada saran".
 *
 * Sengaja tidak menerima view CodeMirror: penyedianya tidak perlu tahu apa pun
 * tentang editor, dan itu yang membuatnya mudah diuji.
 */
export type PenyediaUsulan = (
  konteks: KonteksUsulan,
) => string | null | undefined | Promise<string | null | undefined>;

let penyedia: PenyediaUsulan | null = null;

/** Pasang (atau lepas, dengan `null`) sumber saran. Inilah titik umpannya. */
export function pasangPenyediaUsulan(f: PenyediaUsulan | null): void {
  penyedia = f;
}

/** Penyedia yang sedang terpasang, atau `null`. */
export function penyediaAktif(): PenyediaUsulan | null {
  return penyedia;
}

/**
 * Usulan aktif: teks yang akan ditempel dan dekorasi widget-nya.
 *
 * Teks dan dekorasi disimpan dalam SATU field, bukan dua. Dua field berarti
 * keduanya bisa berbeda - widget menggantung tanpa teks, atau teks yang tinggal
 * setelah Tab - dan perbedaan itu muncul sebagai bug yang hanya sesekali.
 */
interface UsulanAktif {
  teks: string;
  deko: DecorationSet;
}

/** Aksi yang dipasang widget supaya tombolnya bisa menekan Tab/Esc untuk pembaca. */
class UsulanWidget extends WidgetType {
  constructor(readonly teks: string) {
    super();
  }
  eq(other: UsulanWidget): boolean {
    return other.teks === this.teks;
  }
  toDOM(): HTMLElement {
    /* Kelas `.cm-ghost*` dipakai bersama ghost text model: satu gaya untuk satu
       makna, dan warna redupnya ikut tema aktif lewat variabel CSS. */
    const wrap = document.createElement('span');
    wrap.className = 'cm-ghost-wrap cm-usulan-wrap';

    const teks = document.createElement('span');
    teks.className = 'cm-ghost';
    teks.setAttribute('data-testid', 'usulan-zeph-teks');
    teks.textContent = this.teks;
    wrap.appendChild(teks);

    const hint = document.createElement('span');
    hint.className = 'cm-ghost-hint';
    hint.setAttribute('aria-hidden', 'true');

    const tombol = (label: string, kbd: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cm-ghost-hint-item';
      b.setAttribute('data-aksi', label.toLowerCase());
      b.appendChild(document.createTextNode(label));
      const k = document.createElement('kbd');
      k.textContent = kbd;
      b.appendChild(k);
      /* `mousedown`, bukan `click`: mousedown pada editor memindahkan kursor
         lebih dulu, dan pada saat `click` tiba posisinya sudah bukan posisi
         usulan. Ini pola yang sama dengan tombol ghost text model. */
      b.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const v = viewAktif;
        if (!v) return;
        if (label === 'Terima') terimaUsulan(v);
        else tolakUsulan(v);
      };
      return b;
    };

    hint.appendChild(tombol('Terima', 'Tab'));
    hint.appendChild(tombol('Tolak', 'Esc'));
    wrap.appendChild(hint);
    return wrap;
  }
  ignoreEvent(event: Event): boolean {
    const t = event.target as HTMLElement | null;
    if (t?.closest('.cm-ghost-hint')) return false;
    return true;
  }
}

const setUsulan = StateEffect.define<string | null>();

export const usulanField = StateField.define<UsulanAktif | null>({
  create: () => null,
  update(val, tr) {
    const efek = tr.effects.find((e) => e.is(setUsulan));
    if (efek) {
      if (!efek.value) return null;
      const pos = tr.state.selection.main.head;
      return {
        teks: efek.value,
        deko: Decoration.set([Decoration.widget({ widget: new UsulanWidget(efek.value), side: 1 }).range(pos)]),
      };
    }
    /* Pindah kursor atau mengetik membatalkan usulan: saran itu menjawab posisi
       lama, dan menempelkannya di posisi baru menghasilkan kode yang tidak
       diminta siapa pun. */
    if (tr.docChanged || tr.selection) return null;
    return val;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v?.deko ?? Decoration.none),
});

/** Apakah ada usulan yang sedang menunggu diterima. */
export function adaUsulan(view: EditorView): boolean {
  return view.state.field(usulanField, false) != null;
}

/** Teks usulan yang menunggu, atau `null`. Dipakai harness. */
export function usulanTeks(view: EditorView): string | null {
  return view.state.field(usulanField, false)?.teks ?? null;
}

/**
 * Minta saran dari penyedia terpasang dan tampilkan sebagai teks bayangan.
 *
 * Mengembalikan `false` bila tidak ada penyedia terpasang - bukan mengembalikan
 * promise kosong yang tak bisa dibedakan dari "model menjawab kosong".
 */
export function mintaUsulan(view: EditorView, lang?: string): boolean {
  const p = penyediaAktif();
  if (!p) return false;
  const state = view.state;
  const pos = state.selection.main.head;
  const baris = state.doc.lineAt(pos);
  const konteks: KonteksUsulan = {
    sebelum: potongBelakang(state.doc.sliceString(0, pos), 4000),
    sesudah: state.doc.sliceString(pos, Math.min(state.doc.length, pos + 400)),
    baris: baris.text.slice(0, pos - baris.from),
    line: baris.number,
    lang,
  };
  void (async () => {
    let jawab: string | null | undefined;
    try {
      jawab = await p(konteks);
    } catch (e) {
      /* Penyedia yang melempar bukan alasan untuk membuang ketikan pembaca;
         usulan hanya tidak muncul. */
      console.error('penyedia usulan gagal', e);
      return;
    }
    const teks = typeof jawab === 'string' ? jawab : '';
    const awalBaris = view.state.doc.lineAt(view.state.selection.main.head).from;
    const kepala = view.state.selection.main.head;
    const sisa = usulanLayak(teks, {
      sebelum: view.state.doc.sliceString(awalBaris, kepala),
      sesudah: view.state.doc.sliceString(kepala, view.state.doc.lineAt(kepala).to),
    });
    if (!sisa) return;
    view.dispatch({ effects: setUsulan.of(sisa) });
  })();
  return true;
}

/**
 * Terima usulan: tempel di posisi kursor, lalu bersihkan widget-nya.
 *
 * Usulan disisipkan pada posisi KURSOR SAAT INI, bukan posisi saat saran
 * diminta. Sebuah field yang dibatalkan oleh perpindahan kursor membuat
 * keduanya sama; memakai posisi sekarang berarti, seandainya itu berubah,
 * teksnya tetap masuk di tempat yang dilihat pembaca.
 */
export function terimaUsulan(view: EditorView): boolean {
  const aktif = view.state.field(usulanField, false);
  if (!aktif) return false;
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: aktif.teks },
    selection: { anchor: pos + aktif.teks.length },
    effects: setUsulan.of(null),
    userEvent: 'input.complete',
  });
  return true;
}

/** Tolak usulan: buang widget-nya saja, dokumen tidak disentuh. */
export function tolakUsulan(view: EditorView): boolean {
  if (!adaUsulan(view)) return false;
  view.dispatch({ effects: setUsulan.of(null) });
  return true;
}

/**
 * Saran otomatis setelah berhenti mengetik - hanya bila ada penyedia.
 *
 * Tanpa penjaga itu, setiap editor memasang timer yang tidak akan pernah
 * menghasilkan apa pun. Jeda lebih panjang daripada ghost text model karena
 * penyedia yang diumpan bisa berupa apa saja, termasuk yang lambat.
 */
const JEDA_MS = 900;
let timer: number | null = null;
let viewAktif: EditorView | null = null;

function pemicuOtomatis(lang?: string): Extension {
  return EditorView.updateListener.of((u) => {
    viewAktif = u.view;
    if (!u.docChanged && !u.selectionSet) return;
    if (penyediaAktif() === null) return;
    if (timer !== null) window.clearTimeout(timer);
    if (adaUsulan(u.view)) tolakUsulan(u.view);
    timer = window.setTimeout(() => {
      timer = null;
      const v = u.view;
      if (!v.hasFocus || penyediaAktif() === null) return;
      const baris = v.state.doc.lineAt(v.state.selection.main.head);
      /* Baris kosong tidak memberi penyedia apa pun untuk dilanjutkan. */
      if (baris.text.trim().length < 3) return;
      mintaUsulan(v, lang);
    }, JEDA_MS);
  });
}

const batalSaatBlur = EditorView.domEventHandlers({
  blur: (_e, view) => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (adaUsulan(view)) tolakUsulan(view);
    return false;
  },
});

/** Tab menerima, Esc menolak, Alt+\ meminta. Sama dengan ghost text model. */
function petaTombol(lang?: string): Extension {
  return keymap.of([
    {
      key: 'Alt-\\',
      run: (view) => mintaUsulan(view, lang),
    },
    { key: 'Tab', run: (view) => terimaUsulan(view) },
    { key: 'Escape', run: (view) => tolakUsulan(view) },
  ]);
}

/**
 * Gaya kedua dekorasi.
 *
 * Warnanya SELURUHNYA dari variabel tema - tidak ada satu pun nilai warna keras
 * di sini. Tema terang dan tema gelap mendefinisikan `--added` / `--modified`
 * dengan nilai berbeda (lihat `src/styles/theme*.css`), dan karena dekorasi ini
 * memakai variabel yang sama dengan batang di gutter, baris yang disorot dan
 * batangnya tidak bisa berbeda warna satu sama lain.
 *
 * Latarnya memakai `var(--added-tipis, color-mix(...))`: bila suatu saat tema
 * mendefinisikan token latar tipisnya sendiri, token itu yang menang; selama
 * belum, `color-mix` menurunkannya dari warna tepi - jadi tidak ada tema yang
 * perlu disunting hanya supaya dekorasi ini kelihatan benar.
 *
 * Dipasang lewat `EditorView.baseTheme`, bukan berkas CSS terpisah: gayanya
 * hanya ada saat fiturnya dipasang, dan tidak mungkin tertinggal di bundel untuk
 * pengguna yang mematikan kedua sakelarnya.
 */
const gayaDekorasi = EditorView.baseTheme({
  '.cm-line.cm-dekorasi-baru': {
    backgroundColor: 'var(--added-tipis, color-mix(in srgb, var(--added) 14%, transparent))',
    boxShadow: 'inset 2px 0 0 0 var(--added)',
  },
  '.cm-line.cm-dekorasi-ubah': {
    backgroundColor: 'var(--modified-tipis, color-mix(in srgb, var(--modified) 14%, transparent))',
    boxShadow: 'inset 2px 0 0 0 var(--modified)',
  },
});

export interface OpsiDekorasi {
  /** Sorot baris baru/berubah (sakelar: `editor.gitGutter` di Settings). */
  sorotBaris?: boolean;
  /** Teks bayangan usulan (sakelar: `editor.ghostText` di Settings). */
  usulanInline?: boolean;
  /** `tab.lang`, diteruskan ke penyedia sebagai konteks. */
  lang?: string;
}

/**
 * Rakit ekstensi dekorasi.
 *
 * Mengembalikan array KOSONG saat kedua sakelar mati - itulah jalur
 * hidup/mati-nya: tidak ada field, tidak ada keymap, tidak ada timer yang
 * dipasang ketika fiturnya tidak diinginkan.
 */
export function dekorasiCopilot(opsi: OpsiDekorasi = {}): Extension[] {
  const sorot = opsi.sorotBaris === true;
  const usulan = opsi.usulanInline === true;
  if (!sorot && !usulan) return [];
  const out: Extension[] = [gayaDekorasi];
  if (sorot) out.push(sorotField);
  if (usulan) out.push(usulanField, petaTombol(opsi.lang), pemicuOtomatis(opsi.lang), batalSaatBlur);
  return out;
}
