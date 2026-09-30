import { StateEffect, StateField, Transaction, type Extension } from '@codemirror/state';
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

import { getActiveView } from './editorRegistry';

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
    /*
     * The suggestion, then the keys that accept it.
     *
     * Ghost text on its own leaves the reader guessing how to take it — the
     * reference editor trains people with a small "Accept [Tab]" strip and the
     * habit does not transfer for free. The hint rides along with the widget,
     * so it appears exactly when there is something to accept and cannot drift.
     */
    const span = document.createElement('span');
    span.className = 'cm-ghost-wrap';

    const teks = document.createElement('span');
    teks.className = 'cm-ghost';
    teks.textContent = this.teks;
    span.appendChild(teks);

    const hint = document.createElement('span');
    hint.className = 'cm-ghost-hint';
    hint.setAttribute('aria-hidden', 'true');

    const navPrev = document.createElement('span');
    navPrev.className = 'cm-ghost-nav';
    navPrev.textContent = '<';
    hint.appendChild(navPrev);

    const navNext = document.createElement('span');
    navNext.className = 'cm-ghost-nav';
    navNext.textContent = '>';
    hint.appendChild(navNext);

    const tambah = (label: string, kbd: string[], onKlik?: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cm-ghost-hint-item';
      b.appendChild(document.createTextNode(label));
      for (const k of kbd) {
        const el = document.createElement('kbd');
        el.textContent = k;
        b.appendChild(el);
      }
      if (onKlik) {
        b.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onKlik();
        };
      }
      hint.appendChild(b);
    };

    tambah('Accept', ['Tab'], () => {
      const v = getActiveView();
      if (v) terimaGhost(v);
    });
    tambah('Accept Word', ['Ctrl', '→'], () => {
      const v = getActiveView();
      if (v) terimaSatuKata(v);
    });

    const dots = document.createElement('span');
    dots.className = 'cm-ghost-nav';
    dots.textContent = '•••';
    hint.appendChild(dots);

    span.appendChild(hint);
    return span;
  }
  ignoreEvent(event: Event) {
    const t = event.target as HTMLElement | null;
    if (t?.closest('.cm-ghost-hint')) return false;
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
      tampilkan(satuBaris);
      /*
       * Keep the widget when the stream ends.
       *
       * It used to be removed on `done`, so a suggestion that arrived correctly
       * vanished the instant the reply finished and the feature read as broken:
       * the DOM observer caught four mounts and no ghost at rest. The widget is
       * cleared by Tab (accepted), Escape (dismissed), further typing, or blur —
       * all of which are the user's decision, which is where that belongs.
       */
      if (satuBaris !== akumulasi) bersihkan();
      return;
    }
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
    ai.onChunk({ id: 'ghost', err: `No API key yet for ${def.label}` });
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
        'Continue the code at the cursor. Reply with ONLY the continuation text that ' +
        'should be typed next, with no explanation, no markdown block, ' +
        'and without repeating the code that is already there. One line at most.',
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
  } catch (e) {
    /*
     * Surface the failure instead of swallowing it.
     *
     * The old `catch {}` dropped the reason, so a ghost that never appeared
     * looked identical to a ghost still loading — no suggestion, no clue. The
     * failure lands on the AI panel's chunk channel, which is what turns it
     * into a visible message.
     */
    useAi.getState().onChunk({ id: aktif, err: String(e) });
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

/*
 * Accept one word of the suggestion.
 *
 * The hint advertises `Ctrl+→`, so it has to exist: taking the whole line is
 * usually wrong when only the first identifier is right, and without a
 * partial accept the only options were "everything" or "nothing". The word is
 * the run of non-space characters at the head of the suggestion, and the rest
 * stays as a fresh widget so the user can keep accepting.
 */
function terimaSatuKata(view: EditorView): boolean {
  const deco = view.state.field(ghostField, false);
  if (!deco || deco.size === 0) return false;
  let teks = '';
  deco.between(0, view.state.doc.length, (_from: number, _to: number, value: Decoration) => {
    const w = (value.spec?.widget as unknown) as GhostWidget | null;
    if (w instanceof GhostWidget) teks = w.teks;
  });
  if (!teks) return false;

  const m = /^\s*\S+/.exec(teks);
  if (!m) return false;
  const potong = m[0];
  const sisa = teks.slice(potong.length);

  const pos = view.state.selection.main.head;
  view.dispatch({
    changes: { from: pos, insert: potong },
    selection: { anchor: pos + potong.length },
    effects: setGhost.of(sisa || null),
  });
  /* Keep the accumulation in step so the next chunk replaces, not appends. */
  akumulasi = sisa;
  if (!sisa) aktif = null;
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
    /*
     * Ctrl+ArrowRight takes one word — on macOS Cmd+ArrowRight, which is what
     * the platform's own completion chords use.
     */
    key: navigator.platform.includes('Mac') ? 'Mod-ArrowRight' : 'Ctrl-ArrowRight',
    run: (view) => (adaGhost(view) ? terimaSatuKata(view) : false),
  },
  {
    key: 'Escape',
    run: (view) => {
      if (!adaGhost(view)) return false;
      buangGhost(view);
      return true;
    },
  },
]);

/*
 * Ask for a suggestion after a pause in typing.
 *
 * The feature existed but had to be summoned with `Alt+\`, which nobody
 * discovers: the same wiring sat unused and the panel read as "no inline
 * completions". Debouncing on input is what makes it behave like the
 * completions people expect — stop typing, a grey continuation appears, Tab
 * accepts it. A pending request is cancelled as soon as typing resumes so the
 * suggestion never describes stale text.
 */
const JEDA_MS = 700;
let timerSaran: number | null = null;

const pemicuOtomatis = EditorView.updateListener.of((u) => {
  if (!u.docChanged && !u.selectionSet) return;
  if (timerSaran !== null) window.clearTimeout(timerSaran);
  if (adaGhost(u.view)) buangGhost(u.view);

  /* Never suggest while the user is mid-word or pasting a block. */
  const tr = u.transactions[u.transactions.length - 1];
  const pengguna = tr?.annotation(Transaction.userEvent);
  if (pengguna && !/input|delete|select/.test(pengguna)) return;

  timerSaran = window.setTimeout(() => {
    timerSaran = null;
    const v = u.view;
    if (!v.hasFocus) return;
    const head = v.state.selection.main.head;
    const baris = v.state.doc.lineAt(head);
    /* A line with nothing on it gives the model no anchor to continue from. */
    if (baris.text.trim().length < 3) return;
    void mintaSaran(v);
  }, JEDA_MS);
});

const batalSaatBlur = EditorView.domEventHandlers({
  blur: (_e, view) => {
    if (timerSaran !== null) {
      window.clearTimeout(timerSaran);
      timerSaran = null;
    }
    if (adaGhost(view)) buangGhost(view);
    return false;
  },
});

export function ghostText(on: boolean): Extension[] {
  return on ? [ghostField, ghostTextKeymap, pemicuOtomatis, batalSaatBlur] : [];
}

export function lepasGhost(view: EditorView) {
  if (viewAktif === view) {
    viewAktif = null;
    aktif = null;
    akumulasi = '';
  }
}
