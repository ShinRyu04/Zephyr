import { useEffect, useRef, useState } from 'react';
import { useDebug } from '../../lib/debugStore';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { useDragEverywhere } from '../../lib/useDragPopup';

/*
 * Breakpoint options: condition, hit count, log message.
 *
 * WHY this is a dialog and not three inline fields: a breakpoint is one gutter
 * dot, and its options have to be reachable from that dot. Opening this on
 * right-click keeps the normal click as a plain toggle (the thing people do
 * hundreds of times a day) while the rarely-used options stay one click deep.
 *
 * The dialog reads the breakpoint from the store on every render rather than
 * copying it into local state once: `simpanBreakpointOpsi` may CREATE the
 * breakpoint (right-click on a line that has none), and the fields must show
 * the values the store now holds.
 */
export default function BreakpointOptionsDialog() {
  const editBp = useDebug((s) => s.editBp);
  const tutup = useDebug((s) => s.tutupEditBreakpoint);
  const simpan = useDebug((s) => s.simpanBreakpointOpsi);
  const hapus = useDebug((s) => s.hapusBreakpoint);
  /* Nilai awal disalin sekali per pembukaan; mengetik tidak boleh dipantulkan
     balik dari store, kalau tidak kursor melompat ke ujung tiap ketukan. */
  const [condition, setCondition] = useState('');
  const [hit, setHit] = useState('');
  const [log, setLog] = useState('');
  const awalRef = useRef<string | null>(null);

  const kunci = editBp ? `${editBp.path}:${editBp.line}` : null;
  useEffect(() => {
    if (!kunci) {
      awalRef.current = null;
      return;
    }
    if (awalRef.current === kunci) return;
    awalRef.current = kunci;
    const b = useDebug
      .getState()
      .breakpoints.find((x) => x.path === editBp!.path && x.line === editBp!.line);
    setCondition(b?.condition ?? '');
    setHit(b?.hitCondition ?? '');
    setLog(b?.logMessage ?? '');
  }, [kunci, editBp]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!editBp,
    onEscape: () => tutup(),
  });
  const { popupRef, onPointerDown } = useDragEverywhere();

  if (!editBp) return null;

  const nama = editBp.path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || editBp.path;
  const kirim = () =>
    void simpan(editBp.path, editBp.line, {
      condition,
      hitCondition: hit,
      logMessage: log,
    });

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onKeyDown={(e) => {
        if (e.key === 'Escape') tutup();
      }}
    >
      <div
        className="modal bp-opsi"
        ref={(el) => {
          /* Satu node, dua ref: focus trap menjaga Tab di dalam, hook drag
             memindahkannya. Pembungkus terpisah akan merusak batas trap. */
          trapRef.current = el;
          popupRef.current = el;
        }}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        onPointerDown={onPointerDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bp-opsi-judul"
        data-testid="bp-opsi"
      >
        <h2 className="modal-title" id="bp-opsi-judul">
          Breakpoint — {nama}:{editBp.line}
        </h2>
        <p className="modal-body">
          Leave a field empty to use the plain breakpoint. A log message turns it
          into a logpoint: the line prints instead of stopping.
        </p>

        <label className="bp-opsi-baris">
          <span className="bp-opsi-label">Condition</span>
          <input
            className="bp-opsi-input"
            data-testid="bp-opsi-condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="e.g. i === 3 || name === 'Zephyr'"
            spellCheck={false}
          />
        </label>

        <label className="bp-opsi-baris">
          <span className="bp-opsi-label">Hit count</span>
          <input
            className="bp-opsi-input"
            data-testid="bp-opsi-hit"
            value={hit}
            onChange={(e) => setHit(e.target.value)}
            placeholder="e.g. 5, >=3, %2"
            spellCheck={false}
          />
        </label>

        <label className="bp-opsi-baris">
          <span className="bp-opsi-label">Log message</span>
          <input
            className="bp-opsi-input"
            data-testid="bp-opsi-log"
            value={log}
            onChange={(e) => setLog(e.target.value)}
            placeholder="e.g. i is {i}, value is {value}"
            spellCheck={false}
          />
        </label>

        <div className="modal-actions">
          <button className="btn btn-primary" data-testid="bp-opsi-simpan" onClick={kirim}>
            Save
          </button>
          <button
            className="btn"
            data-testid="bp-opsi-hapus"
            onClick={() => void hapus(editBp.path, editBp.line)}
          >
            Remove
          </button>
          <button className="btn" data-testid="bp-opsi-batal" onClick={tutup}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
