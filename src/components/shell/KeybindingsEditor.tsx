// KeybindingsEditor.tsx — editor "Keyboard Shortcuts" (fase 18.4).
//
// Menampilkan SEMUA binding dari registry hasil merge (default ⊕ user), bisa
// dicari, di-remap dengan merekam chord langsung, dihapus, atau direset.
// Yang disimpan ke `keybindings.json` HANYA override user.
//
// Perekam chord memakai fase capture + preventDefault: kalau tidak, menekan
// Ctrl+S saat merekam malah menyimpan file (bug yang sama dengan flag
// `capturing` di Settings fase 08 — jangan diulang).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useKb } from '../../lib/keybindingStore';
import { findCommand } from '../../lib/commandRegistry';
import { chordConflicts, displayChord, normalizeChord, type KeyBinding } from '../../lib/keybindings';
import { eventToBinding } from '../../lib/shortcuts';

const LAYER_LABEL: Record<KeyBinding['layer'], string> = {
  app: 'App',
  editor: 'Editor',
  terminal: 'Terminal',
  stub: 'Belum ada',
};

export default function KeybindingsEditor() {
  const open = useKb((s) => s.editorOpen);
  const bindings = useKb((s) => s.bindings);
  const user = useKb((s) => s.user);
  const setOpen = useKb((s) => s.setEditorOpen);
  const remap = useKb((s) => s.remap);
  const removeBinding = useKb((s) => s.removeBinding);
  const resetOne = useKb((s) => s.resetOne);
  const resetAll = useKb((s) => s.resetAll);
  const kbError = useKb((s) => s.kbError);

  const [q, setQ] = useState('');
  /** command yang sedang merekam chord (null = tidak ada) */
  const [rekam, setRekam] = useState<string | null>(null);
  /** chord yang sudah tertangkap saat merekam (untuk sequence) */
  const [tangkap, setTangkap] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setRekam(null);
      setTangkap([]);
    }
  }, [open]);

  // Perekam chord. Capture + preventDefault supaya chord yang direkam tidak
  // ikut menjalankan aksinya.
  useEffect(() => {
    if (!rekam) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRekam(null);
        setTangkap([]);
        return;
      }
      if (e.key === 'Enter' && tangkap.length > 0) {
        void remap(rekam, tangkap.join(' '));
        setRekam(null);
        setTangkap([]);
        return;
      }
      const b = eventToBinding(e);
      if (!b) return;
      setTangkap((prev) => (prev.length >= 2 ? [b] : [...prev, b]));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [rekam, tangkap, remap]);

  const baris = useMemo(() => {
    const cari = q.trim().toLowerCase();
    const semua = bindings.map((b) => {
      const def = findCommand(b.command);
      return {
        ...b,
        title: def?.title ?? b.label ?? b.command,
        adaCommand: !!def,
        isUser: user.some((u) => u.command === b.command && !u.remove),
      };
    });
    if (!cari) return semua;
    return semua.filter(
      (b) =>
        b.command.toLowerCase().includes(cari) ||
        b.title.toLowerCase().includes(cari) ||
        b.chord.toLowerCase().includes(cari) ||
        b.when.toLowerCase().includes(cari),
    );
  }, [bindings, user, q]);

  if (!open) return null;

  const chordRekam = tangkap.join(' ');
  const konflik = rekam && chordRekam ? chordConflicts(rekam, chordRekam, 'global', bindings) : [];

  return (
    <div
      className="modal-backdrop kb-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !rekam) setOpen(false);
      }}
    >
      <div className="kb-panel" role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
        <header className="kb-head">
          <span className="kb-title">Keyboard Shortcuts</span>
          <input
            ref={inputRef}
            className="kb-search"
            data-testid="kb-search"
            placeholder="Cari command atau chord…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Cari keybinding"
          />
          <span className="kb-count" data-testid="kb-count">
            {baris.length}
          </span>
          <button className="btn btn-sm" data-testid="kb-reset-all" onClick={() => void resetAll()}>
            Reset semua
          </button>
          <button className="btn btn-sm" data-testid="kb-close" onClick={() => setOpen(false)}>
            Tutup
          </button>
        </header>

        {kbError && (
          <p className="set-note diag-err" data-testid="kb-error">
            {kbError}
          </p>
        )}

        {rekam && (
          <div className="kb-rekam" data-testid="kb-recording">
            <span>
              Merekam chord untuk <code>{rekam}</code> —{' '}
              {chordRekam ? (
                <code data-testid="kb-recorded">{chordRekam}</code>
              ) : (
                'tekan kombinasi tombol'
              )}
            </span>
            {konflik.length > 0 && (
              <span className="kb-konflik" data-testid="kb-conflict">
                bertabrakan dengan: {konflik.join(', ')}
              </span>
            )}
            <span className="side-muted">Enter = simpan · Esc = batal</span>
          </div>
        )}

        <div className="kb-table-wrap">
          <table className="kb-table" data-testid="kb-table">
            <thead>
              <tr>
                <th>Command</th>
                <th>Keybinding</th>
                <th>When</th>
                <th>Layer</th>
                <th>Sumber</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {baris.map((b) => (
                <tr key={`${b.command}-${b.chord}`} data-kb-row={b.command} data-testid="kb-row">
                  <td className="kb-cmd">
                    <span className="kb-cmd-title">{b.title}</span>
                    <code className="kb-cmd-id">{b.command}</code>
                  </td>
                  <td>
                    <kbd data-testid="kb-chord">{displayChord(b.chord)}</kbd>
                  </td>
                  <td className="kb-when">{b.when}</td>
                  <td className="kb-layer" data-layer={b.layer}>
                    {LAYER_LABEL[b.layer]}
                  </td>
                  <td className="kb-src" data-user={b.isUser ? '1' : '0'}>
                    {b.isUser ? 'User' : 'Default'}
                  </td>
                  <td className="kb-aksi">
                    <button
                      className="btn btn-sm"
                      data-testid="kb-edit"
                      title="Rekam chord baru"
                      onClick={() => {
                        setRekam(b.command);
                        setTangkap([]);
                      }}
                    >
                      Ubah
                    </button>
                    <button
                      className="btn btn-sm"
                      data-testid="kb-remove"
                      title="Hapus keybinding (command tetap ada di palette)"
                      onClick={() => void removeBinding(b.command)}
                    >
                      Hapus
                    </button>
                    {b.isUser && (
                      <button
                        className="btn btn-sm"
                        data-testid="kb-reset"
                        title="Kembalikan ke default"
                        onClick={() => void resetOne(b.command)}
                      >
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="kb-foot">
          <span className="side-muted">
            Tersimpan di <code>%APPDATA%\zephyr\keybindings.json</code>. Layer “Editor” ditangani
            CodeMirror, “Terminal” oleh xterm — resolver global tidak mencegatnya.
          </span>
        </footer>
      </div>
    </div>
  );
}

/** Dipakai harness: normalisasi chord dari luar komponen. */
export { normalizeChord };
