// LspOverlay.tsx — UI kecil untuk fitur LSP (fase 21).
//
// Tiga hal dalam satu komponen karena semuanya modal ringan di atas editor dan
// dipicu lewat event window dari commandRegistry:
//   * Rename (F2)            — input inline, BUKAN window.prompt (fase 27).
//   * Quick Fix (Ctrl+.)     — daftar code action dari server.
//   * Go to Symbol (Ctrl+Shift+O) — daftar simbol dokumen.
//
// Kenapa lewat event window, bukan store: commandRegistry tidak boleh
// mengimport komponen (lingkaran import — pelajaran fase 13 dengan mcpStore →
// paletteStore), dan ketiga aksi ini butuh EditorView yang hidup.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useLsp } from '../../lib/lspStore';
import { getActiveView, revealPosition } from '../../lib/editorRegistry';
import { notifyError, notifyInfo, notifyWarn } from '../../lib/notificationStore';
import { SYMBOL_KIND, pathToUri, uriToPath } from '../../lib/lsp';
import {
  applyEdits,
  lspCodeActions,
  lspDocumentSymbols,
  lspRename,
  lspToOffset,
  type TextEditLsp,
} from '../../lib/lspCm';
import { useProblems, kunciPath } from '../../lib/problemsStore';
import * as cmd from '../../lib/commands';

type Mode = null | 'rename' | 'action' | 'symbol';

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

export default function LspOverlay() {
  const [mode, setMode] = useState<Mode>(null);
  const [nilai, setNilai] = useState('');
  const [aksi, setAksi] = useState<ActionItem[]>([]);
  const [simbol, setSimbol] = useState<SymbolItem[]>([]);
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

  // ── Rename ──
  useEffect(() => {
    const onRename = () => {
      const view = getActiveView();
      if (!view) return;
      // Isi awal = kata di posisi kursor.
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
        notifyWarn('Server tidak mengembalikan perubahan apa pun', { source: 'LSP' });
        return tutup();
      }

      let fileLain = 0;
      for (const [file, edits] of Object.entries(perFile)) {
        if (edits.length === 0) continue;
        if (kunciPath(file) === kunciPath(path)) {
          applyEdits(view, edits);
          continue;
        }
        // File yang tidak terbuka: baca → terapkan edit di teks → tulis.
        // Ini SATU-SATUNYA jalur tulis di luar editor; tanpa itu rename lintas
        // file cuma berlaku separuh dan proyek jadi tidak konsisten.
        try {
          const isi = await cmd.fsRead(file);
          const teksBaru = terapkanKeTeks(isi.content, edits);
          await cmd.fsWrite(file, teksBaru);
          fileLain++;
        } catch (e) {
          notifyError(`Gagal menulis ${file}`, { source: 'LSP', detail: String(e) });
        }
      }
      notifyInfo(
        `Rename → "${baru}": ${total} perubahan di ${Object.keys(perFile).length} file` +
          (fileLain > 0 ? ` (${fileLain} file ditulis langsung ke disk)` : ''),
        { source: 'LSP' },
      );
      tutup();
    } catch (e) {
      notifyError('Rename gagal', { source: 'LSP', detail: String(e) });
      tutup();
    } finally {
      setSibuk(false);
    }
  };

  // ── Quick Fix ──
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
        if (items.length === 0) notifyInfo('Tidak ada quick fix di posisi ini', { source: 'LSP' });
      } catch (e) {
        notifyError('Quick Fix gagal', { source: 'LSP', detail: String(e) });
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
      const edit = item.raw.edit as Record<string, unknown> | undefined;
      let diterapkan = 0;
      if (edit) {
        const changes = edit.changes as Record<string, TextEditLsp[]> | undefined;
        if (changes) {
          for (const [uri, edits] of Object.entries(changes)) {
            if (kunciPath(uriToPath(uri)) === kunciPath(path)) {
              diterapkan += applyEdits(view, edits);
            }
          }
        }
        const dc = edit.documentChanges as unknown[] | undefined;
        if (Array.isArray(dc)) {
          for (const d of dc) {
            const o = d as Record<string, unknown>;
            const uri = (o.textDocument as Record<string, unknown> | undefined)?.uri as
              | string
              | undefined;
            const edits = o.edits as TextEditLsp[] | undefined;
            if (uri && edits && kunciPath(uriToPath(uri)) === kunciPath(path)) {
              diterapkan += applyEdits(view, edits);
            }
          }
        }
      }
      // Action bisa berupa command server-side (mis. organizeImports).
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
        diterapkan > 0 ? `"${item.title}" — ${diterapkan} perubahan` : `"${item.title}" dijalankan`,
        { source: 'LSP' },
      );
    } catch (e) {
      notifyError('Code action gagal', { source: 'LSP', detail: String(e) });
    }
    tutup();
  };

  // ── Go to Symbol ──
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
            // DocumentSymbol punya `range`/`selectionRange`; SymbolInformation
            // punya `location.range`. Tangani keduanya.
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
        if (out.length === 0) notifyInfo('Tidak ada simbol di file ini', { source: 'LSP' });
      } catch (e) {
        notifyError('Go to Symbol gagal', { source: 'LSP', detail: String(e) });
        setMode(null);
      } finally {
        setSibuk(false);
      }
    };
    window.addEventListener('zephyr-lsp-symbols', onSymbols);
    return () => window.removeEventListener('zephyr-lsp-symbols', onSymbols);
  }, []);

  // Navigasi keyboard daftar (action & symbol).
  useEffect(() => {
    if (mode !== 'action' && mode !== 'symbol') return;
    const daftar = mode === 'action' ? aksi : simbol;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        tutup();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIdx((i) => (daftar.length === 0 ? 0 : (i + 1) % daftar.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIdx((i) => (daftar.length === 0 ? 0 : (i - 1 + daftar.length) % daftar.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'action' && aksi[idx]) void jalankanAksi(aksi[idx]);
        else if (mode === 'symbol' && simbol[idx]) {
          const s = simbol[idx];
          tutup();
          window.setTimeout(() => revealPosition(s.line, s.column), 40);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, aksi, simbol, idx]);

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
            Nama baru
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
              {sibuk ? 'Memproses…' : 'Rename'}
            </button>
            <button className="btn btn-sm" data-testid="lsp-rename-cancel" onClick={tutup}>
              Batal
            </button>
          </div>
        </div>
      )}

      {mode === 'action' && (
        <div className="lsp-list" role="dialog" aria-modal="true" aria-label="Quick Fix">
          <div className="lsp-list-head">Quick Fix / Code Action</div>
          {sibuk ? (
            <p className="lsp-empty">Menanyakan server…</p>
          ) : aksi.length === 0 ? (
            <p className="lsp-empty" data-testid="lsp-action-empty">
              Tidak ada aksi di posisi ini.
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
            <p className="lsp-empty">Mengambil simbol…</p>
          ) : simbol.length === 0 ? (
            <p className="lsp-empty" data-testid="lsp-symbol-empty">
              Tidak ada simbol.
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
    </div>
  );
}

/** Terapkan TextEdit LSP ke string biasa (untuk file yang tidak terbuka).
 *  Edit diurutkan dari BELAKANG supaya offset tidak bergeser. */
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

/** Dipakai harness: konversi posisi tanpa membuka overlay. */
export { pathToUri, lspToOffset };
