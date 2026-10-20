import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePalette, type PaletteItem } from '../../lib/paletteStore';
import { useT } from '../../lib/i18n';
import { useLabel } from '../../lib/labelI18n';

const WINDOW = 40;
const ROW_H = 34;

/*
 * Anchored width — the drop-down under the Search box.
 *
 * The box is only 140px wide (it is labelled, not a field), and a panel that
 * matched it was unreadable: nearly every command label was truncated and the
 * detail column had no room at all. The panel is a scrolling list, so it is
 * sized for its CONTENT instead — wide enough for a typical command name plus
 * its "Group: detail" tail and the chord — and still clamped to the window so
 * it never runs off the right edge (the box itself is measured from, so the
 * panel is clamped so it stays on screen).
 */
const ANCHOR_W = 520;
const ANCHOR_MIN_W = 380;
const VIEWPORT_PAD = 12;

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
  const lbl = useLabel();
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
        <Highlighted text={lbl(item.label)} hits={item.hits} />
      </span>
      <span className="cp-detail">{item.detail}</span>
      {item.binding ? <kbd className="cp-kbd">{item.binding}</kbd> : null}
    </button>
  );
}

export default function CommandPalette() {
  const tr = useT();
  const open = usePalette((s) => s.open);
  const mode = usePalette((s) => s.mode);
  const query = usePalette((s) => s.query);
  const index = usePalette((s) => s.index);
  const loading = usePalette((s) => s.loadingFiles);
  const filesError = usePalette((s) => s.filesError);
  // Subscribed so the list repaints when the lazy command registry lands.
  const rev = usePalette((s) => s.rev);

  void rev;
  const setQuery = usePalette((s) => s.setQuery);
  const setIndex = usePalette((s) => s.setIndex);
  const move = usePalette((s) => s.move);
  const accept = usePalette((s) => s.accept);
  const acceptItem = usePalette((s) => s.acceptItem);
  /**
   * Run the highlighted entry without recording it as recently used.
   *
   * Reads the index at call time rather than closing over it: the palette
   * re-renders on every keystroke, and a stale index would run whatever was
   * selected when the handler was created — which after typing a query is a
   * different row from the one on screen.
   */
  const acceptSekali = () => {
    const st = usePalette.getState();
    const item = st.items()[st.index];
    if (!item) return Promise.resolve();
    return acceptItem(item, true);
  };
  const close = usePalette((s) => s.close);
  const anchored = usePalette((s) => s.anchored);

  /*
   * Anchored geometry: the panel is positioned under the title-bar search box.
   *
   * Measured on every open (and on resize) rather than cached, because the box
   * moves with the window width and the menu row's own contents. Falling back to
   * the centred modal when the box is not on screen keeps Ctrl+Shift+P working
   * from any layout, including the agent window where there is no menu row.
   */
  const [kotak, setKotak] = useState<{ left: number; top: number; width: number } | null>(null);
  useEffect(() => {
    if (!open || !anchored) {
      setKotak(null);
      return;
    }
    const ukur = () => {
      const el = document.querySelector<HTMLElement>('[data-testid="mb-command-center"]');
      if (!el) {
        setKotak(null);
        return;
      }
      const r = el.getBoundingClientRect();
      /* Wider than the box, so the width is chosen here and then clamped: a
         panel anchored at the box's left edge would otherwise run past the
         right of a narrow window. `left` is pulled back only when it has to be. */
      const width = Math.min(ANCHOR_W, window.innerWidth - VIEWPORT_PAD * 2);
      const left = Math.max(VIEWPORT_PAD, Math.min(r.left, window.innerWidth - width - VIEWPORT_PAD));
      setKotak({
        left,
        top: r.bottom + 6,
        width: Math.max(Math.min(ANCHOR_MIN_W, window.innerWidth - VIEWPORT_PAD * 2), width),
      });
    };
    ukur();
    window.addEventListener('resize', ukur);
    return () => window.removeEventListener('resize', ukur);
  }, [open, anchored]);
  
  const items = open ? usePalette.getState().items() : [];

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, mode]);

  useLayoutEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('.cp-row.is-active')
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, index, query]);

  if (!open) return null;

  const start = Math.max(0, Math.min(index - Math.floor(WINDOW / 2), Math.max(0, items.length - WINDOW)));
  const visible = items.slice(start, start + WINDOW);

  /*
   * Anchored mode has no scrim: the click target outside the panel covers the
   * whole window but is fully transparent, so clicking anywhere else closes the
   * palette while the editor stays readable behind it. The centred modal keeps
   * its dimming overlay.
   */
  const pakaiAnchor = Boolean(anchored && kotak);

  return (
    <div
      className={`cp-overlay${pakaiAnchor ? ' is-anchored' : ''}`}
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
        data-anchored={pakaiAnchor ? '1' : '0'}
        style={
          pakaiAnchor && kotak
            ? {
                position: 'fixed',
                left: kotak.left,
                top: kotak.top,
                width: kotak.width,
                maxHeight: `calc(100vh - ${kotak.top + 16}px)`,
              }
            : undefined
        }
      >
        <div className="cp-inputrow">
          {/* Not a ">" prefix: this list mixes files and commands, and a command
              prompt in front of a file name read as a mode the user had to know.
              A magnifier says "search", which is what the box in the title bar
              says too. It turns into the accent chevron in command mode only. */}
          <svg className="cp-prefix-ico" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M10.5 5.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-.8 3.9 4 4.1-1 1-4-4.1a5 5 0 0 1-6.7-6.7L1 7 1.9 5.6A5 5 0 0 1 8 1a5 5 0 0 1 5.5 4.3l.4 2.6-1.9.5-2.3.5z"
              fill="currentColor"
            />
          </svg>
          <input
            ref={inputRef}
            className="cp-input"
            data-testid="cp-input"
            value={query}
            spellCheck={false}
            autoComplete="off"
            placeholder={
              mode === 'file'
                ? tr('Search files by name')
                : tr('Search commands, or type > for a command')
            }
            aria-label={mode === 'file' ? tr('Search files') : tr('Search commands')}
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
                /*
                 * Ctrl/Cmd+Enter is the ONE-SHOT: run it, but do not record it
                 * as recently used.
                 *
                 * The recent list drives the palette's ordering, so a command
                 * fired repeatedly in one sitting (a task, a formatter) would
                 * otherwise crowd out the commands the reader actually reaches
                 * for. Plain Enter is the ordinary run.
                 */
                const sekali = e.ctrlKey || e.metaKey;
                void (sekali ? acceptSekali() : accept());
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
                ? tr('Loading file list…')
                : (filesError ??
                  (mode === 'file'
                    ? tr('No matching files.')
                    : tr('No matching commands.')))}
            </p>
          )}
        </div>

        <div className="cp-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {tr('navigate')}
          </span>
          <span>
            <kbd>Enter</kbd> {tr('open')}
          </span>
          {/* The one-shot has to be discoverable, or the only way to find it is
              to have read the source. Muted styling so it reads as secondary
              without being hidden. */}
          <span className="cp-foot-once" data-testid="cp-foot-once">
            <kbd>Ctrl</kbd>
            <kbd>Enter</kbd> {tr('run without remembering')}
          </span>
          <span>
            <kbd>Esc</kbd> {tr('close')}
          </span>
          <span className="cp-foot-mode">
            {mode === 'file'
              ? tr('Ctrl+Shift+P for commands')
              : tr('Ctrl+P to search files')}
          </span>
        </div>
      </div>
    </div>
  );
}
