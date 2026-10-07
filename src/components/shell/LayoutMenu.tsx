import { useEffect, useRef } from 'react';
import { useLayoutCustom, BARIS_LAYOUT } from '../../lib/layoutStore';
import { useTampilan } from '../../lib/tampilanStore';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';

import { useTerminal } from '../../lib/terminalStore';

/* Small layout glyphs for the Visibility tiles: an editor rectangle with the
   relevant surface emphasised. Keeps each tile readable at 16px. */
function LmVisIcon({ kunci }: { kunci: 'menuBar' | 'activityBar' | 'sidebar' | 'panel' | 'statusBar' }) {
  const s = { stroke: 'currentColor', strokeWidth: 1.3, fill: 'none' as const };
  const fill = { fill: 'currentColor', opacity: 0.4 };
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <rect x="1.8" y="2.4" width="12.4" height="11.2" rx="1.4" {...s} />
      {kunci === 'menuBar' && <rect x="1.8" y="2.4" width="12.4" height="2.6" rx="1.1" {...fill} />}
      {kunci === 'activityBar' && <rect x="1.8" y="2.4" width="2.6" height="11.2" rx="1.1" {...fill} />}
      {kunci === 'sidebar' && <rect x="1.8" y="2.4" width="4.2" height="11.2" rx="1.2" {...fill} />}
      {kunci === 'panel' && <rect x="1.8" y="9.8" width="12.4" height="3.8" rx="1.1" {...fill} />}
      {kunci === 'statusBar' && <rect x="1.8" y="11.6" width="12.4" height="2" rx="1" {...fill} />}
    </svg>
  );
}

export default function LayoutMenu({ onTutup }: { onTutup: () => void }) {
  const tr = useT();
  const L = useLayoutCustom();
  const zen = useTampilan((s) => s.mode === 'zen');

  const aiPos = useStore((s) => s.settings.general.aiPanel ?? 'right');
  const aiKolomVisible = useStore((s) => s.aiKolomVisible);
  const panelPos = useStore((s) => s.settings.sidebar ?? 'left');
  const wordWrap = useStore((s) => s.settings.editor.wordWrap);
  const minimap = useStore((s) => s.settings.editor.minimap);
  const breadcrumbs = useStore((s) => s.settings.editor.breadcrumbs);
  const zoom = useStore((s) => s.settings.general.zoom ?? 100);
  const setZen = useTampilan((s) => s.setMode);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const luar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onTutup();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTutup();
    };

    const t = setTimeout(() => document.addEventListener('mousedown', luar), 0);
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', luar);
      document.removeEventListener('keydown', esc);
    };
  }, [onTutup]);

  const ubah = (kunci: Parameters<typeof L.toggle>[0]) => {
    L.toggle(kunci);
    void useLayoutCustom.getState().simpan();
  };

  return (
    <div className="lm-backdrop" data-testid="layout-menu-backdrop">
    <div className="layout-menu" ref={ref} data-testid="layout-menu" role="dialog" aria-modal="true" aria-label={tr('Customize Layout')}>
      <div className="lm-head">
        <span className="lm-judul">{tr('Customize Layout')}</span>
        <span className="sub-spacer" />
        <button
          className="api-mini"
          data-testid="lm-reset"
          title={tr('Reset layout to default')}
          onClick={() => {
            L.reset();
            void useLayoutCustom.getState().simpan();
          }}
        >
          ↺
        </button>
        <button className="api-mini" data-testid="lm-close" onClick={onTutup}>
          ✕
        </button>
      </div>
      <div className="lm-body">

      {/* ── Visibility ──
          A COMPACT grid of toggle tiles instead of a tall vertical list: each
          surface is a small icon tile that lights up when shown. Far shorter
          down the page than one full-width row per item. The AI "Secondary Side
          Bar" is included when the chat lives in the right column. */}
      <div className="lm-seksi">{tr('Visibility')}</div>
      <div className="lm-grid" data-testid="lm-visibility">
        {BARIS_LAYOUT.map((b) => {
          const aktif = L[b.kunci];
          return (
            <button
              key={b.kunci}
              className={`lm-tile${aktif ? ' is-aktif' : ''}`}
              data-testid={`lm-${b.kunci}`}
              aria-pressed={aktif}
              title={b.shortcut ? `${tr(b.label)} · ${b.shortcut}` : tr(b.label)}
              onClick={() => ubah(b.kunci)}
            >
              <span className="lm-tile-ic" aria-hidden="true">
                <LmVisIcon kunci={b.kunci} />
              </span>
              <span className="lm-tile-label">{tr(b.label)}</span>
            </button>
          );
        })}
        {aiPos === 'right' && (
          <button
            className={`lm-tile${aiKolomVisible ? ' is-aktif' : ''}`}
            data-testid="lm-secondary"
            aria-pressed={aiKolomVisible}
            title={`${tr('Secondary Side Bar (AI)')} · Ctrl+Alt+B`}
            onClick={() => useStore.getState().toggleAiKolom()}
          >
            <span className="lm-tile-ic" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="16" height="16">
                <rect x="1.8" y="2.4" width="12.4" height="11.2" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
                <rect x="10" y="2.4" width="4.2" height="11.2" rx="1.2" fill="currentColor" opacity="0.4" />
              </svg>
            </span>
            <span className="lm-tile-label">{tr('AI Sidebar')}</span>
          </button>
        )}
      </div>

      {/* ── Panel Position ──
          The four buttons that used to live ALWAYS-VISIBLE in the menu bar are
          here now (left / right / top / bottom), so the top bar is not spending
          four slots on them. This writes root `sidebar`, the same key the old
          top-bar buttons wrote. */}
      <div className="lm-seksi">{tr('Panel Position')}</div>
      <div className="lm-pil lm-pil-icons" data-testid="lm-panel-pos">
        {(['left', 'right', 'top', 'bottom'] as const).map((p) => (
          <button
            key={p}
            className={`lm-pil-btn${panelPos === p ? ' is-aktif' : ''}`}
            data-testid={`lm-panelpos-${p}`}
            title={tr(p === 'left' ? 'Left' : p === 'right' ? 'Right' : p === 'top' ? 'Top' : 'Bottom')}
            aria-label={tr(p === 'left' ? 'Left' : p === 'right' ? 'Right' : p === 'top' ? 'Top' : 'Bottom')}
            onClick={() => {
              void useStore.getState().applySettings({ sidebar: p } as never);
              useStore.getState().setSidebarVisible(true);
            }}
          >
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              {p === 'left' && <path d="M5.8 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />}
              {p === 'right' && <path d="M10.2 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />}
              {p === 'top' && <path d="M2.2 5.8h11.6" stroke="currentColor" strokeWidth="1.3" />}
              {p === 'bottom' && <path d="M2.2 10.2h11.6" stroke="currentColor" strokeWidth="1.3" />}
            </svg>
          </button>
        ))}
      </div>

      {/* ── AI chat home ──
          Where the chat lives: the right column (Secondary Side Bar), the
          editor area as a tab, or its own floating window.

          The legacy "bottom" dock is GONE on purpose: the user never wants the
          chat to collapse into the terminal panel again, so it is no longer an
          option here. The migration in `store.ts` rewrites any saved `bottom`
          setting to `right`, so an old profile cannot land back in that mode. */}
      <div className="lm-seksi">{tr('AI Chat Position')}</div>
      <div className="lm-pil" data-testid="lm-posisi-ai">
        {(
          [
            ['right', tr('Right')],
            ['editor', tr('Editor')],
            ['window', tr('Window')],
          ] as const
        ).map(([pos, label]) => (
          <button
            key={pos}
            className={`lm-pil-btn${aiPos === pos ? ' is-aktif' : ''}`}
            data-testid={`lm-ai-${pos}`}
            onClick={async () => {
              await useStore.getState().applySettings({ general: { aiPanel: pos } } as never);
              useStore.getState().setAiKolomVisible(true);
              if (pos === 'window') {
                void import('../../lib/aiWindow').then((m) => m.bukaAiWindow());
              } else {
                void import('../../lib/aiWindow').then((m) => m.tutupAiWindow());
              }
              /* None of the remaining homes live in the bottom dock, so the
                 terminal panel is always freed up. */
              useTerminal.getState().setVisible(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Subagent info panel (T4.1b): only meaningful while the chat is a column. */}
      {aiPos === 'right' && (
        <button
          className={`lm-baris${L.subKanan ? ' is-aktif' : ''}`}
          data-testid="lm-subKanan"
          aria-pressed={L.subKanan}
          onClick={() => {
            L.setSubKanan(!L.subKanan);
            void useLayoutCustom.getState().simpan();
          }}
        >
          <span className="lm-ikon" aria-hidden="true">
            {L.subKanan ? '👁' : '⊘'}
          </span>
          <span className="lm-label">{tr('Subagent info to the right of chat')}</span>
        </button>
      )}

      {/* ── Primary Side Bar position ── */}
      <div className="lm-seksi">{tr('Primary Side Bar Position')}</div>
      <div className="lm-pil" data-testid="lm-posisi">
        {(['left', 'right'] as const).map((p) => (
          <button
            key={p}
            className={`lm-pil-btn${L.posisiSidebar === p ? ' is-aktif' : ''}`}
            data-testid={`lm-pos-${p}`}
            onClick={() => {
              L.set({ posisiSidebar: p });
              void useLayoutCustom.getState().simpan();
            }}
          >
            {p === 'left' ? tr('Left') : tr('Right')}
          </button>
        ))}
      </div>

      {/* ── Density ── */}
      <div className="lm-seksi">{tr('Layout Density')}</div>
      <div className="lm-pil" data-testid="lm-kerapatan">
        {(['default', 'compact'] as const).map((k) => (
          <button
            key={k}
            className={`lm-pil-btn${L.kerapatan === k ? ' is-aktif' : ''}`}
            data-testid={`lm-rapat-${k}`}
            onClick={() => {
              L.set({ kerapatan: k });
              void useLayoutCustom.getState().simpan();
            }}
          >
            {k === 'default' ? tr('Default') : tr('Compact')}
          </button>
        ))}
      </div>

      {/* ── Editor display ──
          Quick toggles for the editor surface, so the common view options are
          reachable without opening the full Settings page. */}
      <div className="lm-seksi">{tr('Editor')}</div>
      <div className="lm-grid" data-testid="lm-editor">
        {(
          [
            ['wordWrap', tr('Word Wrap'), wordWrap],
            ['minimap', tr('Minimap'), minimap],
            ['breadcrumbs', tr('Breadcrumbs'), breadcrumbs],
          ] as const
        ).map(([key, label, on]) => (
          <button
            key={key}
            className={`lm-tile${on ? ' is-aktif' : ''}`}
            data-testid={`lm-editor-${key}`}
            aria-pressed={on}
            onClick={() => void useStore.getState().applySettings({ editor: { [key]: !on } } as never)}
          >
            <span className="lm-tile-ic" aria-hidden="true">
              {key === 'wordWrap' && (
                <svg viewBox="0 0 16 16" width="16" height="16"><path d="M2.5 4h11M2.5 8h8.5a2 2 0 010 4H8M8 10l-1.6 2M8 14l-1.6-2M2.5 12h2.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
              {key === 'minimap' && (
                <svg viewBox="0 0 16 16" width="16" height="16"><rect x="2" y="2.4" width="12" height="11.2" rx="1.3" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M9.6 4h2.6M9.6 6.2h2.6M9.6 8.4h2M4 4h3.6M4 6.2h3M4 8.4h3.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
              )}
              {key === 'breadcrumbs' && (
                <svg viewBox="0 0 16 16" width="16" height="16"><path d="M2.5 8h3l1.5 2M2.5 8l1.5-2M8 8h2.5M8 8l-1 2M8 8l-1-2M13.5 8h-1" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="3" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="13" cy="8" r="1" fill="currentColor" /></svg>
              )}
            </span>
            <span className="lm-tile-label">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Zoom ── */}
      <div className="lm-seksi">{tr('Zoom')}</div>
      <div className="lm-stepper" data-testid="lm-zoom">
        <button
          className="lm-step-btn"
          data-testid="lm-zoom-out"
          aria-label={tr('Zoom out')}
          onClick={() => void useStore.getState().applySettings({ general: { zoom: Math.max(50, zoom - 10) } } as never)}
        >
          −
        </button>
        <span className="lm-step-val">{zoom}%</span>
        <button
          className="lm-step-btn"
          data-testid="lm-zoom-in"
          aria-label={tr('Zoom in')}
          onClick={() => void useStore.getState().applySettings({ general: { zoom: Math.min(200, zoom + 10) } } as never)}
        >
          +
        </button>
        <button
          className="lm-step-reset"
          data-testid="lm-zoom-reset"
          onClick={() => void useStore.getState().applySettings({ general: { zoom: 100 } } as never)}
        >
          {tr('Reset')}
        </button>
      </div>

      {/* ── Mode ── */}
      <div className="lm-seksi">{tr('Modes')}</div>
      <button
        className={`lm-baris${zen ? ' is-aktif' : ''}`}
        data-testid="lm-zen"
        aria-pressed={zen}
        onClick={() => setZen(zen ? 'normal' : 'zen')}
      >
        <span className="lm-ikon" aria-hidden="true">
          {zen ? '👁' : '⊘'}
        </span>
        <span className="lm-label">{tr('Zen Mode')}</span>
        <kbd className="lm-kbd">Ctrl+K Z</kbd>
      </button>
      </div>
    </div>
    </div>
  );
}
