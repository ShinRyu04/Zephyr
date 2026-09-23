import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  keymap,
  type DecorationSet,
} from '@codemirror/view';
import { listen } from '@tauri-apps/api/event';
import * as cmd from './commands';
import { useAi } from './aiStore';
import { useStore } from './store';
import { findModel } from './modelCatalog';
import type { AiChunk, AiMessage } from './types';

const KONTEKS_BARIS = 40;

const setGhost = StateEffect.define<string | null>();

class GhostWidget extends WidgetType {
  constructor(readonly teks: string) {
    super();
  }
  eq(other: GhostWidget) {
    return other.teks === this.teks;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-ghost';
    span.textContent = this.teks;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

const ghostField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let next = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setGhost)) continue;
      next = e.value
        ? Decoration.set([
            Decoration.widget({ widget: new GhostWidget(e.value), side: 1 }).range(
              tr.state.selection.main.head,
            ),
          ])
        : Decoration.none;
    }

    if (tr.docChanged && !tr.effects.some((e) => e.is(setGhost))) {
      next = Decoration.none;
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

let aktif: string | null = null;
let akumulasi = '';
let listenerSiap = false;
let viewAktif: EditorView | null = null;

function pastikanListener() {
  if (listenerSiap) return;
  listenerSiap = true;
  listen<AiChunk>('ai-chunk', (ev) => {
    const c = ev.payload;
    if (!aktif || c.id !== aktif) return;
    if (c.err) {
      bersihkan();
      return;
    }
    if (c.text) {

      akumulasi += c.text;
      const satuBaris = akumulasi.split('\n')[0];
      if (satuBaris !== akumulasi) {
        tampilkan(satuBaris);
        bersihkan();
        return;
      }
      tampilkan(satuBaris);
    }
    if (c.done) bersihkan();
  });
}

function tampilkan(teks: string) {
  if (!viewAktif) return;
  viewAktif.dispatch({ effects: setGhost.of(teks) });
}

function bersihkan() {
  aktif = null;
  akumulasi = '';
  if (viewAktif) viewAktif.dispatch({ effects: setGhost.of(null) });
}

export function buangGhost(view: EditorView) {
  aktif = null;
  akumulasi = '';
  view.dispatch({ effects: setGhost.of(null) });
}

function konteksSekitar(view: EditorView): string {
  const pos = view.state.selection.main.head;
  const baris = view.state.doc.lineAt(pos);
  const mulai = Math.max(1, baris.number - KONTEKS_BARIS);
  const potongan: string[] = [];
  for (let n = mulai; n <= baris.number; n++) potongan.push(view.state.doc.line(n).text);

  potongan[potongan.length - 1] = baris.text.slice(0, pos - baris.from);
  return potongan.join('\n');
}

async function mintaSaran(view: EditorView) {
  const ai = useAi.getState();
  const def = findModel(ai.model, ai.provider);
  const cfg = (useStore.getState().settings.models.providers ?? {})[def.provider] ?? {};
  if (!ai.hasKey(def.provider)) {
    ai.onChunk({ id: 'ghost', err: `Belum ada API key untuk ${def.label}` });
    return;
  }

  pastikanListener();
  viewAktif = view;
  akumulasi = '';
  aktif = `ghost-${Date.now()}`;

  const path = view.dom.closest('.zephyr-cm-host')?.getAttribute('data-path') ?? 'file';
  const pesan: AiMessage[] = [
    {
      role: 'system',
      content:
        'Lanjutkan kode pada posisi kursor. Balas HANYA lanjutan teks yang ' +
        'harus diketik berikutnya, tanpa penjelasan, tanpa blok markdown, ' +
        'tanpa mengulang kode yang sudah ada. Maksimal satu baris.',
    },
    { role: 'user', content: `File: ${path}\n\n${konteksSekitar(view)}` },
  ];

  try {
    await cmd.aiChat({
      id: aktif,
      provider: def.provider,
      model: def.id,
      messages: pesan,
      baseUrl: cfg.baseUrl || undefined,
      maxTokens: 64,
    });
  } catch {
    bersihkan();
  }
}

function adaGhost(view: EditorView): boolean {
  const deco = view.state.field(ghostField, false);
  return !!deco && deco.size > 0;
}

function terimaGhost(view: EditorView): boolean {
  const deco = view.state.field(ghostField, false);
  if (!deco || deco.size === 0) return false;
  let teks = '';
  deco.between(0, view.state.doc.length, (_from: number, _to: number, value: Decoration) => {
    const w = (value.spec?.widget as unknown) ?? null;
    if (w instanceof GhostWidget) teks = w.teks;
  });
  if (!teks) return false;
  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: teks },
    selection: { anchor: pos + teks.length },
    effects: setGhost.of(null),
  });
  aktif = null;
  akumulasi = '';
  return true;
}

export const ghostTextKeymap = keymap.of([
  {
    key: 'Alt-\\',
    run: (view) => {
      void mintaSaran(view);
      return true;
    },
  },

  { key: 'Tab', run: (view) => (adaGhost(view) ? terimaGhost(view) : false) },
  {
    key: 'Escape',
    run: (view) => {
      if (!adaGhost(view)) return false;
      buangGhost(view);
      return true;
    },
  },
]);

export function ghostText(on: boolean): Extension[] {
  return on ? [ghostField, ghostTextKeymap] : [];
}

export function lepasGhost(view: EditorView) {
  if (viewAktif === view) {
    viewAktif = null;
    aktif = null;
    akumulasi = '';
  }
}
