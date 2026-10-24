/*
 * In-app confirm / prompt.
 *
 * WHY THIS EXISTS
 *
 * `window.confirm` and `window.prompt` are WebView2's own dialogs. In a Tauri
 * window they do not look like the app, they are not themed, they are not
 * translated by the app's own dictionary, and they block the renderer while
 * they are open - the editor underneath stops repainting. Worse, the ones that
 * mattered most were the destructive ones (delete every conversation, delete a
 * provider and its API key), so the one question a reader must actually read
 * was rendered by the browser, not by Zephyr.
 *
 * Every other confirmation in the app already goes through a real dialog
 * (`ConfirmDialog`, `DeleteConfirmDialog`, `ScmConfirmDialog`). This store is
 * the small generic sibling for the two remaining shapes: a bare yes/no, and a
 * one-line text question.
 *
 * USAGE
 *
 *   const tanya = useTanya((s) => s.tanya);
 *   if (await tanya({ judul: 'Delete provider X?' })) { ... }
 *
 * `tanya()` resolves `true`/`false` (confirm) or the typed string / `null`
 * (prompt). The promise ALWAYS settles: Escape, backdrop, Cancel and the
 * programmatic `selesai()` all resolve, so an `await` can never hang.
 */
import { create } from 'zustand';

export interface TanyaPermintaan {
  judul: string;

  isi?: string;

  ok?: string;

  batal?: string;

  bahaya?: boolean;

  prompt?: {
    nilaiAwal?: string;

    placeholder?: string;
  };
}

interface TanyaState {
  aktif: (TanyaPermintaan & { id: number }) | null;

  nilai: string;

  setNilai: (v: string) => void;

  tanya: (p: TanyaPermintaan) => Promise<boolean>;

  mintaTeks: (p: TanyaPermintaan & { prompt: NonNullable<TanyaPermintaan['prompt']> }) => Promise<
    string | null
  >;

  selesai: (ok: boolean) => void;
}

let urut = 0;
let resolusi: ((v: boolean | string | null) => void) | null = null;

/*
 * A second question while one is open would leave the first promise pending
 * forever (the dialog can only show one). Cancelling the old one first is the
 * honest answer: the reader moved on.
 */
function batalkanYangLama() {
  const r = resolusi;
  resolusi = null;
  r?.(null);
}

export const useTanya = create<TanyaState>((set, get) => ({
  aktif: null,

  nilai: '',

  setNilai: (v) => set({ nilai: v }),

  tanya: (p) =>
    new Promise<boolean>((resolve) => {
      batalkanYangLama();
      resolusi = (v) => resolve(v === true);
      set({ aktif: { ...p, id: ++urut }, nilai: '' });
    }),

  mintaTeks: (p) =>
    new Promise<string | null>((resolve) => {
      batalkanYangLama();
      resolusi = (v) => resolve(typeof v === 'string' ? v : null);
      set({ aktif: { ...p, id: ++urut }, nilai: p.prompt.nilaiAwal ?? '' });
    }),

  selesai: (ok) => {
    const permintaan = get().aktif;
    const r = resolusi;
    resolusi = null;
    set({ aktif: null, nilai: '' });
    if (!r) return;
    if (permintaan?.prompt) r(ok ? get().nilai : null);
    else r(ok);
  },
}));
