import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';

/*
 * Right-click menu for a session row in the Agents window.
 *
 * WHY a custom menu and not the browser's: the native context menu offers
 * Reload/Inspect, none of which act on a conversation. The reference product
 * shows the operations that belong to the row itself.
 *
 * Positioning rules that matter:
 *  - Opens at the pointer, but is FLIPPED when it would leave the viewport.
 *    A menu whose bottom half is off-screen looks broken and hides the very
 *    item the reader right-clicked for (measured problem elsewhere in this
 *    window: the model dropdown used to be cut off the same way).
 *  - Closes on Escape, on an outside click, and on scroll — a menu that stays
 *    pinned to a stale position after the list scrolls is worse than no menu.
 *  - Focus moves into the menu so Escape and arrow keys work without a mouse.
 */

export type AksiSesi =
  | 'rename'
  | 'duplicate'
  | 'pin'
  | 'unpin'
  | 'copyTitle'
  | 'copyId'
  | 'delete';

interface Props {
  x: number;
  y: number;
  /** Title shown in the menu header, so the reader knows which row this is. */
  judul: string;
  /** True when this session is already pinned. */
  dipin: boolean;
  onAksi: (aksi: AksiSesi) => void;
  onTutup: () => void;
}

export default function SessionContextMenu({ x, y, judul, dipin, onAksi, onTutup }: Props) {
  const tr = useT();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  /* Flip before paint, so the menu never flashes in the wrong place. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const lebar = r.width || 220;
    const tinggi = r.height || 240;
    const sisaKanan = window.innerWidth - x;
    const sisaBawah = window.innerHeight - y;
    setPos({
      left: sisaKanan < lebar + 8 ? Math.max(8, x - lebar) : x,
      top: sisaBawah < tinggi + 8 ? Math.max(8, y - tinggi) : y,
    });
  }, [x, y]);

  useEffect(() => {
    const el = ref.current;
    el?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onTutup();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onTutup();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('scroll', onTutup, true);
    window.addEventListener('resize', onTutup);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('scroll', onTutup, true);
      window.removeEventListener('resize', onTutup);
    };
  }, [onTutup]);

  const item = (aksi: AksiSesi, label: string, opsi?: { bahaya?: boolean; testid?: string }) => (
    <button
      type="button"
      role="menuitem"
      className={`ag-ctx-item${opsi?.bahaya ? ' is-bahaya' : ''}`}
      data-testid={opsi?.testid ?? `ag-ctx-${aksi}`}
      onClick={() => {
        onAksi(aksi);
        onTutup();
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      className="ag-ctx"
      role="menu"
      tabIndex={-1}
      data-testid="ag-session-ctx"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="ag-ctx-head" title={judul}>
        {judul}
      </div>
      {item('rename', tr('Rename…'))}
      {item('duplicate', tr('Duplicate'))}
      {dipin ? item('unpin', tr('Unpin')) : item('pin', tr('Pin'))}
      <div className="ag-ctx-sep" />
      {item('copyTitle', tr('Copy title'))}
      {item('copyId', tr('Copy session ID'))}
      <div className="ag-ctx-sep" />
      {item('delete', tr('Delete'), { bahaya: true, testid: 'ag-ctx-delete' })}
    </div>
  );
}
