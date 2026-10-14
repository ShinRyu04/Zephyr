import { useT } from '../../lib/i18n';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useLsp } from '../../lib/lspStore';
import { getActiveView, revealPosition } from '../../lib/editorRegistry';
import { notifyError, notifyInfo, notifyWarn } from '../../lib/notificationStore';
import { SYMBOL_KIND, pathToUri } from '../../lib/lsp';
import {
  applyEdits,
  applyWorkspaceEdit,
  lspCallHierarchy,
  lspCodeActions,
  lspDocumentSymbols,
  lspPrepareCallHierarchy,
  lspRename,
  lspToOffset,
  type CallItem,
  type TextEditLsp,
} from '../../lib/lspCm';
import { useProblems, kunciPath } from '../../lib/problemsStore';
import * as cmd from '../../lib/commands';
import { tx } from '../../lib/i18n';

type Mode = null | 'rename' | 'action' | 'symbol' | 'calls';

interface ActionItem {
  title: string;
  raw: Record<string, unknown>;
}

interface SymbolItem {
  name: string;
  kind: string;
  line: number;
  column: number;
  detail?: string;
}

/** One side of a call hierarchy: the symbol, and the functions that call it
 *  (or that it calls). */
interface CallsState {
  simbol: string;
  pemanggil: SymbolItem[];
  dipanggil: SymbolItem[];
  /** Which of the two lists the keyboard is moving through. */
  arah: 'masuk' | 'keluar';
}

export default function LspOverlay() {
  const tr = useT();
  const [mode, setMode] = useState<Mode>(null);
  const [nilai, setNilai] = useState('');
  const [aksi, setAksi] = useState<ActionItem[]>([]);
  const [simbol, setSimbol] = useState<SymbolItem[]>([]);
  const [calls, setCalls] = useState<CallsState | null>(null);
  const [idx, setIdx] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const tutup = () => {
    setMode(null);
    setAksi([]);
    setSimbol([]);
    setIdx(0);
    setNilai('');
    getActiveView()?.focus();
  };

  const pathAktif = () => {
    const s = useStore.getState();
    return s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null;
  };

  useEffect(() => {
    const onRename = () => {
      const view = getActiveView();
      if (!view) return;
      
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      const teks = line.text;
      const off = pos - line.from;
      let a = off;
      let b = off;
      while (a > 0 && /[\w$]/.test(teks[a - 1])) a--;
      while (b < teks.length && /[\w$]/.test(teks[b])) b++;
      setNilai(teks.slice(a, b));
      setMode('rename');
      window.setTimeout(() => inputRef.current?.select(), 40);
    };
    window.addEventListener('zephyr-lsp-rename', onRename);
    return () => window.removeEventListener('zephyr-lsp-rename', onRename);
  }, []);

  const jalankanRename = async () => {
    const path = pathAktif();
    const view = getActiveView();
    const baru = nilai.trim();
    if (!path || !view || !baru) return tutup();
    setSibuk(true);
    try {
      const { perFile, total } = await lspRename(
        path,
        view,
        view.state.selection.main.head,
        baru,
      );
      if (total === 0) {
        notifyWarn(tx('The server returned no changes'), { source: 'LSP' });
        return tutup();
      }

      let fileLain = 0;
      for (const [file, edits] of Object.entries(perFile)) {
        if (edits.length === 0) continue;
        if (kunciPath(file) === kunciPath(path)) {
          applyEdits(view, edits);
          continue;
        }
        
        try {
          const isi = await cmd.fsRead(file);
          const teksBaru = terapkanKeTeks(isi.content, edits);
          await cmd.fsWrite(file, teksBaru);
          fileLain++;
        } catch (e) {
          notifyError(`Failed to write ${file}`, { source: 'LSP', detail: cmd.asZephyrError(e).message });
        }
      }
      notifyInfo(
        `Rename → "${baru}": ${total} changes in ${Object.keys(perFile).length} files` +
          (fileLain > 0 ? ` (${fileLain} files written directly to disk)` : ''),
        { source: 'LSP' },
      );
      tutup();
    } catch (e) {
      notifyError(tx('Rename failed'), { source: 'LSP', detail: cmd.asZephyrError(e).message });
      tutup();
    } finally {
      setSibuk(false);
    }
  };

  useEffect(() => {
    const onAction = async () => {
      const path = pathAktif();
      const view = getActiveView();
      if (!path || !view) return;
      setSibuk(true);
      setMode('action');
      try {
        const sel = view.state.selection.main;
        const line = view.state.doc.lineAt(sel.head).number;
        const diags = useProblems
          .getState()
          .forFile(path)
          .filter((d) => d.line === line);
        const res = await lspCodeActions(path, view, sel.from, sel.to, diags);
        const items: ActionItem[] = res
          .map((r) => {
            const o = r as Record<string, unknown>;
            return { title: String(o.title ?? o.command ?? ''), raw: o };
          })
          .filter((x) => x.title);
        setAksi(items);
        setIdx(0);
        if (items.length === 0) notifyInfo(tx('No quick fix at this position'), { source: 'LSP' });
      } catch (e) {
        notifyError(tx('Quick Fix failed'), { source: 'LSP', detail: cmd.asZephyrError(e).message });
        setMode(null);
      } finally {
        setSibuk(false);
      }
    };
    window.addEventListener('zephyr-lsp-codeaction', onAction);
    return () => window.removeEventListener('zephyr-lsp-codeaction', onAction);
  }, []);

  const jalankanAksi = async (item: ActionItem) => {
    const view = getActiveView();
    const path = pathAktif();
    if (!view || !path) return tutup();
    try {
      /*
       * The edit is applied through the shared helper, not inline.
       *
       * This block was copied into `lspCm.lspFixAll` when fix-all-on-save
       * needed the same thing, and two copies of "apply these ranges in reverse
       * order, skipping other files" is exactly the shape where one copy ends
       * up with the sort backwards and silently corrupts a buffer. The helper
       * ignores edits for other files, which is what this did too.
       */
      const diterapkan = applyWorkspaceEdit(
        view,
        path,
        item.raw.edit as Record<string, unknown> | undefined,
      );

      const command = item.raw.command;
      if (command) {
        const c =
          typeof command === 'string'
            ? { command, arguments: [] }
            : (command as { command: string; arguments?: unknown[] });
        await useLsp.getState().req(path, 'workspace/executeCommand', {
          command: c.command,
          arguments: c.arguments ?? [],
        });
      }
      notifyInfo(
        diterapkan > 0 ? `"${item.title}" - ${diterapkan} changes` : `"${item.title}" executed`,
        { source: 'LSP' },
      );
    } catch (e) {
      notifyError(tx('Code action failed'), { source: 'LSP', detail: cmd.asZephyrError(e).message });
    }
    tutup();
  };

  useEffect(() => {
    const onSymbols = async () => {
      const path = pathAktif();
      if (!path) return;
      setSibuk(true);
      setMode('symbol');
      try {
        const res = await lspDocumentSymbols(path);
        const out: SymbolItem[] = [];
        const jelajah = (arr: unknown[], prefix = '') => {
          for (const raw of arr) {
            const o = raw as Record<string, unknown>;
            const nama = String(o.name ?? '');
            
            const range =
              (o.selectionRange as Record<string, Record<string, number>> | undefined) ??
              (o.range as Record<string, Record<string, number>> | undefined) ??
              ((o.location as Record<string, unknown> | undefined)?.range as
                | Record<string, Record<string, number>>
                | undefined);
            const start = range?.start;
            if (nama && start) {
              out.push({
                name: prefix ? `${prefix} › ${nama}` : nama,
                kind: SYMBOL_KIND[Number(o.kind ?? 0)] ?? '',
                line: (start.line ?? 0) + 1,
                column: (start.character ?? 0) + 1,
                detail: typeof o.detail === 'string' ? o.detail : undefined,
              });
            }
            const anak = o.children;
            if (Array.isArray(anak)) jelajah(anak, nama);
          }
        };
        jelajah(res);
        setSimbol(out);
        setIdx(0);
        if (out.length === 0) notifyInfo(tx('No symbols in this file'), { source: 'LSP' });
      } catch (e) {
        notifyError(tx('Go to Symbol failed'), { source: 'LSP', detail: cmd.asZephyrError(e).message });
        setMode(null);
      } finally {
        setSibuk(false);
      }
    };
    window.addEventListener('zephyr-lsp-symbols', onSymbols);
    return () => window.removeEventListener('zephyr-lsp-symbols', onSymbols);
  }, []);

  /*
   * Call hierarchy: who calls the symbol at the cursor, and what it calls.
   *
   * Both directions are fetched up front rather than on demand, because the
   * question "who calls this" is almost always followed by "and what does it
   * call" — and a second round trip after the panel is already open reads as
   * the panel being slow rather than as a second question being asked.
   *
   * `tabIndex` is not used to pick the symbol: the CURSOR is, which is where
   * the reader is already looking. A position picker would be a second thing to
   * explain for a command that has one obvious answer.
   */
  useEffect(() => {
    const onCalls = async () => {
      const path = pathAktif();
      const view = getActiveView();
      if (!path || !view) {
        notifyWarn(tx('Open a file first'), { source: 'LSP' });
        return;
      }
      setSibuk(true);
      setMode('calls');
      try {
        const pos = view.state.selection.main.head;
        const item = await lspPrepareCallHierarchy(path, view, pos);
        if (item.length === 0) {
          setCalls(null);
          notifyInfo(tx('No function under the cursor.'), {
            source: 'LSP',
            detail: tx('Call hierarchy needs the cursor on a function or method name, not inside its body.'),
          });
          return;
        }
        const utama = item[0];
        const [masuk, keluar] = await Promise.all([
          lspCallHierarchy(path, utama, 'incoming'),
          lspCallHierarchy(path, utama, 'outgoing'),
        ]);
        const ke = (d: CallItem[]): SymbolItem[] =>
          d.map((c) => ({ name: c.name, kind: c.kind, line: c.line, column: c.column, detail: c.detail }));
        setCalls({
          simbol: utama.detail ? `${utama.name} — ${utama.detail}` : utama.name,
          pemanggil: ke(masuk),
          dipanggil: ke(keluar),
          arah: masuk.length > 0 ? 'masuk' : 'keluar',
        });
        setIdx(0);
      } catch (e) {
        notifyError(tx('Call hierarchy failed'), {
          source: 'LSP',
          detail: cmd.asZephyrError(e).message,
        });
        setMode(null);
      } finally {
        setSibuk(false);
      }
    };
    window.addEventListener('zephyr-lsp-calls', onCalls);
    return () => window.removeEventListener('zephyr-lsp-calls', onCalls);
  }, []);

  useEffect(() => {
    if (mode !== 'action' && mode !== 'symbol' && mode !== 'calls') return;
    /*
     * Call hierarchy has TWO lists, so the arrow keys move through whichever
     * one the reader last touched — tracked in `calls.arah`. Flattening the two
     * into one list would make Down walk from "called by" into "calls" without
     * saying so, and Enter would jump somewhere the reader did not pick.
     *
     * `aksi` (code actions) has no location of its own — running one is what
     * navigates — so it is kept separate rather than forced into the same
     * shape with dummy coordinates.
     */
    const lokasi: SymbolItem[] =
      mode === 'symbol'
        ? simbol
        : mode === 'calls' && calls
          ? calls.arah === 'masuk'
            ? calls.pemanggil
            : calls.dipanggil
          : [];
    const panjang = mode === 'action' ? aksi.length : lokasi.length;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        tutup();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx((i) => (panjang === 0 ? 0 : (i + 1) % panjang));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((i) => (panjang === 0 ? 0 : (i - 1 + panjang) % panjang));
      } else if (e.key === 'Tab') {
        /* Tab flips between the two call-hierarchy lists. Only meaningful in
           that mode; in the others it must stay the browser's Tab. */
        if (mode !== 'calls' || !calls) return;
        e.preventDefault();
        setCalls((c) => (c ? { ...c, arah: c.arah === 'masuk' ? 'keluar' : 'masuk' } : c));
        setIdx(0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'action') {
          if (aksi[idx]) void jalankanAksi(aksi[idx]);
        } else if (lokasi[idx]) {
          const s = lokasi[idx];
          tutup();
          window.setTimeout(() => revealPosition(s.line, s.column), 40);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, aksi, simbol, calls, idx]);

  if (!mode) return null;

  return (
    <div
      className="modal-backdrop lsp-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && tutup()}
    >
      {mode === 'rename' && (
        <div className="lsp-rename" role="dialog" aria-modal="true" aria-label="Rename Symbol">
          <label className="lsp-label" htmlFor="lsp-rename-input">
            New name
          </label>
          <input
            id="lsp-rename-input"
            ref={inputRef}
            className="lsp-input"
            data-testid="lsp-rename-input"
            value={nilai}
            autoFocus
            disabled={sibuk}
            onChange={(e) => setNilai(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void jalankanRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                tutup();
              }
            }}
          />
          <div className="lsp-row-btn">
            <button
              className="btn btn-sm"
              data-testid="lsp-rename-ok"
              disabled={sibuk || !nilai.trim()}
              onClick={() => void jalankanRename()}
            >
              {sibuk ? 'Processing…' : 'Rename'}
            </button>
            <button className="btn btn-sm" data-testid="lsp-rename-cancel" onClick={tutup}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'action' && (
        <div className="lsp-list" role="dialog" aria-modal="true" aria-label="Quick Fix">
          <div className="lsp-list-head">Quick Fix / Code Action</div>
          {sibuk ? (
            <p className="lsp-empty">Asking the server…</p>
          ) : aksi.length === 0 ? (
            <p className="lsp-empty" data-testid="lsp-action-empty">
              {tr('No actions at this position.')}
            </p>
          ) : (
            <div className="lsp-items">
              {aksi.map((a, i) => (
                <button
                  key={`${a.title}-${i}`}
                  className={`lsp-item${i === idx ? ' is-active' : ''}`}
                  data-testid="lsp-action-item"
                  onMouseMove={() => setIdx(i)}
                  onClick={() => void jalankanAksi(a)}
                >
                  {a.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'symbol' && (
        <div className="lsp-list" role="dialog" aria-modal="true" aria-label="Go to Symbol">
          <div className="lsp-list-head">
            Go to Symbol{simbol.length > 0 ? ` (${simbol.length})` : ''}
          </div>
          {sibuk ? (
            <p className="lsp-empty">Fetching symbols…</p>
          ) : simbol.length === 0 ? (
            <p className="lsp-empty" data-testid="lsp-symbol-empty">
              {tr('No symbols.')}
            </p>
          ) : (
            <div className="lsp-items">
              {simbol.slice(0, 400).map((s, i) => (
                <button
                  key={`${s.name}-${s.line}-${i}`}
                  className={`lsp-item${i === idx ? ' is-active' : ''}`}
                  data-testid="lsp-symbol-item"
                  onMouseMove={() => setIdx(i)}
                  onClick={() => {
                    tutup();
                    window.setTimeout(() => revealPosition(s.line, s.column), 40);
                  }}
                >
                  <span className="lsp-sym-kind">{s.kind}</span>
                  <span className="lsp-sym-name">{s.name}</span>
                  <span className="lsp-sym-loc">:{s.line}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === 'calls' && (
        <div className="lsp-list lsp-calls" role="dialog" aria-modal="true" aria-label="Call Hierarchy">
          <div className="lsp-list-head">
            {calls ? calls.simbol : tr('Call Hierarchy')}
          </div>
          {sibuk ? (
            <p className="lsp-empty">{tr('Asking the language server…')}</p>
          ) : !calls ? (
            /*
             * Said in full rather than shown as two empty sections. A server
             * that does not implement call hierarchy answers an empty list, and
             * an empty list rendered as "no callers" would tell the reader the
             * function is unused — a conclusion the server never made.
             */
            <p className="lsp-empty" data-testid="lsp-calls-empty">
              {tr('No call hierarchy here. This needs the cursor on a function name, and a language server that supports it.')}
            </p>
          ) : (
            <>
              {(
                [
                  ['masuk', tr('Called by'), calls.pemanggil],
                  ['keluar', tr('Calls'), calls.dipanggil],
                ] as const
              ).map(([arah, judul, daftar]) => (
                <div className="lsp-calls-sec" key={arah}>
                  <div
                    className={`lsp-calls-title${calls.arah === arah ? ' is-aktif' : ''}`}
                    /* Clicking the heading switches which list the arrow keys
                       move through, so the whole panel is reachable without
                       reaching for the mouse. */
                    onClick={() => {
                      setCalls((c) => (c ? { ...c, arah } : c));
                      setIdx(0);
                    }}
                  >
                    {judul} ({daftar.length})
                  </div>
                  {daftar.length === 0 ? (
                    <p className="lsp-calls-none">{tr('Nothing.')}</p>
                  ) : (
                    <div className="lsp-items">
                      {daftar.slice(0, 200).map((s, i) => {
                        const aktif = calls.arah === arah && i === idx;
                        return (
                          <button
                            key={`${arah}-${s.name}-${s.line}-${i}`}
                            className={`lsp-item${aktif ? ' is-active' : ''}`}
                            data-testid={`lsp-call-${arah}`}
                            data-file={undefined}
                            onMouseMove={() => {
                              setCalls((c) => (c ? { ...c, arah } : c));
                              setIdx(i);
                            }}
                            onClick={() => {
                              tutup();
                              window.setTimeout(() => revealPosition(s.line, s.column), 40);
                            }}
                          >
                            <span className="lsp-sym-kind">{s.kind}</span>
                            <span className="lsp-sym-name">{s.name}</span>
                            <span className="lsp-sym-loc">:{s.line}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function terapkanKeTeks(isi: string, edits: TextEditLsp[]): string {
  const baris = isi.split('\n');
  const offsetBaris: number[] = [];
  let acc = 0;
  for (const b of baris) {
    offsetBaris.push(acc);
    acc += b.length + 1;
  }
  const off = (p: { line: number; character: number }) => {
    const ln = Math.min(Math.max(p.line, 0), baris.length - 1);
    return Math.min(offsetBaris[ln] + Math.max(p.character, 0), isi.length);
  };
  const konv = edits
    .map((e) => ({ from: off(e.range.start), to: off(e.range.end), text: e.newText }))
    .sort((a, b) => b.from - a.from);
  let out = isi;
  for (const e of konv) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}

export { pathToUri, lspToOffset };
