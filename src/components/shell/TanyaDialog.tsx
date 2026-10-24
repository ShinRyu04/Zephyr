import { useEffect, useRef } from 'react';
import { useT } from '../../lib/i18n';
import { useTanya } from '../../lib/tanyaStore';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { useDragEverywhere } from '../../lib/useDragPopup';

/*
 * Renders the question `useTanya` is holding. Mounted once per window (App,
 * AgentsWindow, PanelWindow) the same way `ConfirmDialog` is, so a question
 * opened from any surface appears in the window that asked it.
 */
export default function TanyaDialog() {
  const tr = useT();
  const aktif = useTanya((s) => s.aktif);
  const nilai = useTanya((s) => s.nilai);
  const setNilai = useTanya((s) => s.setNilai);
  const selesai = useTanya((s) => s.selesai);
  const okRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { popupRef, onPointerDown } = useDragEverywhere();

  useEffect(() => {
    if (!aktif) return;
    if (aktif.prompt) inputRef.current?.select();
    else okRef.current?.focus();
  }, [aktif]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!aktif,
    onEscape: () => selesai(false),
  });

  if (!aktif) return null;

  const judulId = `tanya-judul-${aktif.id}`;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      data-testid="tanya-dialog"
      onKeyDown={(e) => {
        if (e.key === 'Escape') selesai(false);
      }}
    >
      <div
        className="modal"
        ref={(el) => {
          trapRef.current = el;
          popupRef.current = el;
        }}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        onPointerDown={onPointerDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={judulId}
      >
        <h2 className="modal-title" id={judulId} data-testid="tanya-title">
          {tr(aktif.judul)}
        </h2>
        {aktif.isi && (
          <p className="modal-body" data-testid="tanya-body">
            {tr(aktif.isi)}
          </p>
        )}
        {aktif.prompt && (
          <input
            ref={inputRef}
            className="inp"
            data-testid="tanya-input"
            value={nilai}
            placeholder={aktif.prompt.placeholder ? tr(aktif.prompt.placeholder) : undefined}
            onChange={(e) => setNilai(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                selesai(true);
              }
            }}
            style={{ width: '100%', marginBottom: 12 }}
          />
        )}
        <div className="modal-actions">
          <button
            ref={okRef}
            className={aktif.bahaya ? 'btn btn-danger' : 'btn btn-primary'}
            data-testid="tanya-ok"
            onClick={() => selesai(true)}
          >
            {tr(aktif.ok ?? 'OK')}
          </button>
          <button className="btn" data-testid="tanya-cancel" onClick={() => selesai(false)}>
            {tr(aktif.batal ?? 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
