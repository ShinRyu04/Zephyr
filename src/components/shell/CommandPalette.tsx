// CommandPalette.tsx — modal Command Palette (Ctrl+Shift+P) & Quick Open
// (Ctrl+P), fase 12.
//
// Daftar hasil di-virtualisasi sederhana: hanya jendela ~40 baris di sekitar
// item aktif yang dirender. Untuk 5.000 file itu bedanya terasa — tanpa ini
// setiap ketikan me-mount ribuan node.

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePalette, type PaletteItem } from '../../lib/paletteStore';

const WINDOW = 40;
const ROW_H = 30;

function GroupIcon({ group }: { group?: string }) {
  const p = { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none' as const };
  const st = { stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round' as const };
  switch (group) {
    case 'File':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M4 2h5l3 3v9H4z" {...st} />
          <path d="M9 2v3h3" {...st} />
        </svg>
      );
    case 'Terminal':
      return (
        <svg {...p} aria-hidden="true">
          <rect x="1.8" y="2.8" width="12.4" height="10.4" rx="1.5" {...st} />
          <path d="M4.4 6l2 2-2 2M8.4 10h3.2" {...st} />
        </svg>
      );
    case 'Git':
      return (
        <svg {...p} aria-hidden="true">
          <circle cx="4.4" cy="4" r="1.7" {...st} />
          <circle cx="4.4" cy="12" r="1.7" {...st} />
          <circle cx="11.6" cy="8" r="1.7" {...st} />
          <path d="M4.4 5.7v4.6M6.1 4.6c3.2 0 3.7 1.8 3.8 3" {...st} />
        </svg>
      );
    case 'AI':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M8 2l1.5 3.3L13 6.8l-2.5 2.4.6 3.5L8 11l-3.1 1.7.6-3.5L3 6.8l3.5-1.5z" {...st} />
        </svg>
      );
    case 'MCP':
      return (
        <svg {...p} aria-hidden="true">
          <path d="M2.6 11.4V6.2a2 2 0 012-2h6.8a2 2 0 012 2v5.2" {...st} />
          <path d="M5.4 11.4V7.6M8 11.4V6.8M10.6 11.4V8.4" {...st} />
        </svg>
      );
    case 'Settings':
      return (
        <svg {...p} aria-hidden="true">
          <circle cx="8" cy="8" r="2.2" {...st} />
          <path d="M8 1.9v1.7M8 12.4v1.7M1.9 8h1.7M12.4 8h1.7M3.7 3.7l1.2 1.2M11.1 11.1l1.2 1.2M12.3 3.7l-1.2 1.2M4.9 11.1l-1.2 1.2" {...st} />
        </svg>
      );
    default:
      return (
        <svg {...p} aria-hidden="true">
          <rect x="2.4" y="2.4" width="11.2" height="11.2" rx="2" {...st} />
          <path d="M5.4 8h5.2" {...st} />
        </svg>
      );
  }
}

/** Label dengan karakter yang cocok ditebalkan. */
function Highlighted({ text, hits }: { text: string; hits: number[] }) {
  if (hits.length === 0) return <>{text}</>;
  const set = new Set(hits);
  return (
    <>
      {[...text].map((ch, i) =>
        set.has(i) ? (
          <mark key={i} className="cp-hit">
            {ch}
          </mark>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

function Row({
  item,
  active,
  onPick,
  onHover,
}: {
  item: PaletteItem;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      className={`cp-row${active ? ' is-active' : ''}`}
      data-testid="cp-row"
      data-cp-id={item.id}
      data-active={active ? '1' : '0'}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onPick}
      title={item.detail}
    >
      <GroupIcon group={item.group} />
      <span className="cp-label">
        <Highlighted text={item.label} hits={item.hits} />
      </span>
      <span className="cp-detail">{item.detail}</span>
      {item.binding ? <kbd className="cp-kbd">{item.binding}</kbd> : null}
    </button>
  );
}

export default function CommandPalette() {
  const open = usePalette((s) => s.open);
  const mode = usePalette((s) => s.mode);
  const query = usePalette((s) => s.query);
  const index = usePalette((s) => s.index);
  const loading = usePalette((s) => s.loadingFiles);
  const filesError = usePalette((s) => s.filesError);
  const setQuery = usePalette((s) => s.setQuery);
  const setIndex = usePalette((s) => s.setIndex);
  const move = usePalette((s) => s.move);
  const accept = usePalette((s) => s.accept);
  const close = usePalette((s) => s.close);
  // items() dihitung dari state lain; ambil lewat getState supaya selector
  // tidak mengembalikan array baru tiap render (aturan zustand v5, fase 09).
  const items = open ? usePalette.getState().items() : [];

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, mode]);

  // Jaga item aktif tetap terlihat.
  useLayoutEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('.cp-row.is-active')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, index, query]);

  if (!open) return null;

  // Jendela render di sekitar index (virtualisasi sederhana).
  const start = Math.max(0, Math.min(index - Math.floor(WINDOW / 2), Math.max(0, items.length - WINDOW)));
  const visible = items.slice(start, start + WINDOW);

  return (
    <div
      className="cp-overlay"
      data-testid="cp-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="cp-modal"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'file' ? 'Quick Open' : 'Command Palette'}
        data-testid="cp-modal"
        data-mode={mode}
      >
        <div className="cp-inputrow">
          <span className="cp-prefix" aria-hidden="true">
            {mode === 'file' ? '' : '>'}
          </span>
          <input
            ref={inputRef}
            className="cp-input"
            data-testid="cp-input"
            value={query}
            spellCheck={false}
            autoComplete="off"
            placeholder={
              mode === 'file' ? 'Ketik nama file…' : 'Ketik nama perintah, mis. "git commit"'
            }
            aria-label={mode === 'file' ? 'Cari file' : 'Cari perintah'}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                move(-1);
              } else if (e.key === 'PageDown') {
                e.preventDefault();
                move(8);
              } else if (e.key === 'PageUp') {
                e.preventDefault();
                move(-8);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                void accept();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
          />
          <span className="cp-count" data-testid="cp-count">
            {items.length}
          </span>
        </div>

        <div className="cp-list" ref={listRef} role="listbox" data-testid="cp-list">
          {start > 0 && <div className="cp-spacer" style={{ height: start * ROW_H }} />}
          {visible.map((it, i) => (
            <Row
              key={it.id}
              item={it}
              active={start + i === index}
              onPick={() => void accept(start + i)}
              onHover={() => setIndex(start + i)}
            />
          ))}
          {items.length > start + WINDOW && (
            <div className="cp-spacer" style={{ height: (items.length - start - WINDOW) * ROW_H }} />
          )}

          {items.length === 0 && (
            <p className="cp-empty" data-testid="cp-empty">
              {loading
                ? 'Memuat daftar file…'
                : (filesError ??
                  (mode === 'file'
                    ? 'Tidak ada file yang cocok.'
                    : 'Tidak ada perintah yang cocok.'))}
            </p>
          )}
        </div>

        <div className="cp-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> pilih
          </span>
          <span>
            <kbd>Enter</kbd> jalankan
          </span>
          <span>
            <kbd>Esc</kbd> tutup
          </span>
          <span className="cp-foot-mode">
            {mode === 'file' ? 'Ctrl+Shift+P untuk perintah' : 'Ctrl+P untuk cari file'}
          </span>
        </div>
      </div>
    </div>
  );
}
