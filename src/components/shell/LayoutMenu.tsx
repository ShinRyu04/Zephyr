import { useEffect, useState } from 'react';
import { useLayoutCustom, BARIS_LAYOUT } from '../../lib/layoutStore';
import { useTampilan } from '../../lib/tampilanStore';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { useDragEverywhere } from '../../lib/useDragPopup';
import AiIkon from '../ai/AiIkon';
import type { NamaAiIkon } from '../ai/AiIkon';

/*
 * Customize Layout.
 *
 * A large card with a section nav down the left, matching the shape of Agent
 * Customizations rather than the flat scrolling column this used to be.
 *
 * WHY the change: the old card was one narrow column of ten sections stacked
 * end to end, so "AI Chat Position" sat below the fold of a popup with no
 * scrollbar affordance — the reader had to guess there was more. Sections are
 * the natural unit here (surfaces, panels, chat, editor, view), and a nav makes
 * every one of them reachable in a single click at a fixed position.
 *
 * It is also draggable and maximizable now, both for the same reason: this is a
 * panel the reader adjusts WHILE WATCHING THE LAYOUT BEHIND IT change. A popup
 * anchored to one spot covers the thing being configured.
 */

/** Small layout glyphs for the Visibility tiles: an editor rectangle with the
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

type SeksiId = 'surfaces' | 'panels' | 'chat' | 'editor' | 'view';

const NAV: { id: SeksiId; label: string; icon: NamaAiIkon }[] = [
  { id: 'surfaces', label: 'Surfaces', icon: 'monitor' },
  { id: 'panels', label: 'Panels', icon: 'list' },
  { id: 'chat', label: 'AI Chat', icon: 'comment' },
  { id: 'editor', label: 'Editor', icon: 'code' },
  { id: 'view', label: 'View', icon: 'eye' },
];

/** One labelled row inside a pane. */
function Baris({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="lm-row">
      <div className="lm-row-teks">
        <span className="lm-row-label">{label}</span>
        {hint && <span className="lm-row-hint">{hint}</span>}
      </div>
      <div className="lm-row-kontrol">{children}</div>
    </div>
  );
}

/**
 * The heading at the top of every pane.
 *
 * Same shape as the one Agent Customizations uses — a 20px title with a
 * sentence under it — because the two are the same kind of surface and a reader
 * who has opened one should not have to re-learn the other. The sentence is not
 * decoration: "Surfaces" and "Panels" are close enough in meaning that the
 * titles alone do not say which one holds what.
 */
function JudulPane({ judul, desc }: { judul: string; desc: string }) {
  return (
    <>
      <h2 className="lm-pane-title">{judul}</h2>
      <p className="lm-pane-desc">{desc}</p>
    </>
  );
}

export default function LayoutMenu({ onTutup }: { onTutup: () => void }) {
  const tr = useT();
  const L = useLayoutCustom();
  const zen = useTampilan((s) => s.mode === 'zen');
  const { popupRef, onPointerDown } = useDragEverywhere();
  const [seksi, setSeksi] = useState<SeksiId>('surfaces');
  const [besar, setBesar] = useState(false);

  const aiPos = useStore((s) => s.settings.general.aiPanel ?? 'right');
  const aiKolomVisible = useStore((s) => s.aiKolomVisible);
  const panelPos = useStore((s) => s.settings.sidebar ?? 'left');
  const wordWrap = useStore((s) => s.settings.editor.wordWrap);
  const minimap = useStore((s) => s.settings.editor.minimap);
  const breadcrumbs = useStore((s) => s.settings.editor.breadcrumbs);
  const zoom = useStore((s) => s.settings.general.zoom ?? 100);
  const setZen = useTampilan((s) => s.setMode);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTutup();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onTutup]);

  const ubah = (kunci: Parameters<typeof L.toggle>[0]) => {
    L.toggle(kunci);
    void useLayoutCustom.getState().simpan();
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      data-testid="layout-menu-backdrop"
      /*
       * A backdrop press closes, matching every other dialog in the app. The
       * card itself stops the event so a drag that starts inside it does not
       * close the popup mid-gesture.
       */
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onTutup();
      }}
    >
      <div
        className={`modal lm-modal${besar ? ' is-besar' : ''}`}
        ref={popupRef as React.RefObject<HTMLDivElement>}
        onPointerDown={onPointerDown}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        role="dialog"
        aria-modal="true"
        aria-label={tr('Customize Layout')}
        data-testid="layout-menu"
      >
        <div className="lm-head">
          <span className="lm-head-judul">
            <AiIkon name="monitor" size={15} />
            {tr('Customize Layout')}
          </span>
          <span className="lm-head-spacer" />
          <button
            className="ai-ikon"
            data-testid="lm-reset"
            title={tr('Reset layout to default')}
            aria-label={tr('Reset layout to default')}
            onClick={() => {
              L.reset();
              void useLayoutCustom.getState().simpan();
            }}
          >
            <AiIkon name="refresh" size={14} />
          </button>
          <button
            className="ai-ikon"
            data-testid="lm-max"
            title={besar ? tr('Restore size') : tr('Maximize')}
            aria-label={besar ? tr('Restore size') : tr('Maximize')}
            aria-pressed={besar}
            onClick={() => {
              /* A card that fills the screen while still carrying a drag offset
                 would hang off the edge, so the offset is cleared with it. */
              const el = popupRef.current as HTMLElement | null;
              el?.style.removeProperty('--drag-x');
              el?.style.removeProperty('--drag-y');
              setBesar((v) => !v);
            }}
          >
            <AiIkon name={besar ? 'restore' : 'maximize'} size={14} />
          </button>
          <button
            className="ai-ikon"
            data-testid="lm-close"
            title={tr('Close')}
            aria-label={tr('Close')}
            onClick={onTutup}
          >
            <AiIkon name="close" size={14} />
          </button>
        </div>

        <div className="lm-body">
          <nav className="lm-nav" aria-label={tr('Customize Layout')}>
            {NAV.map((n) => (
              <button
                key={n.id}
                className={`lm-nav-item${seksi === n.id ? ' is-active' : ''}`}
                data-testid={`lm-nav-${n.id}`}
                aria-current={seksi === n.id}
                onClick={() => setSeksi(n.id)}
              >
                <span className="lm-nav-ikon">
                  <AiIkon name={n.icon} size={14} />
                </span>
                <span className="lm-nav-label">{tr(n.label)}</span>
              </button>
            ))}
          </nav>

          <div className="lm-content" data-testid="lm-content">
            {/* ── Surfaces ─────────────────────────────────────────────────
                A compact grid of toggle tiles rather than a tall list: each
                surface is a small icon tile that lights up when shown. */}
            {seksi === 'surfaces' && (
              <div className="lm-pane" data-testid="lm-pane-surfaces">
                <JudulPane
                  judul={tr('Surfaces')}
                  desc={tr('Show or hide each part of the window: menu bar, activity bar, side bars, panel and status bar.')}
                />
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
              </div>
            )}

            {/* ── Panels ───────────────────────────────────────────────────
                Where the two side bars live, plus the density of everything. */}
            {seksi === 'panels' && (
              <div className="lm-pane" data-testid="lm-pane-panels">
                <JudulPane
                  judul={tr('Panels')}
                  desc={tr('Which edge each side bar takes, and how tightly the interface packs.')}
                />
                <Baris
                  label={tr('Panel Position')}
                  hint={tr('Which edge the bottom panel and the activity bar take.')}
                >
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
                </Baris>

                <Baris label={tr('Primary Side Bar Position')}>
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
                </Baris>

                <Baris label={tr('Layout Density')}>
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
                </Baris>
              </div>
            )}

            {/* ── AI Chat ──────────────────────────────────────────────────
                Where the chat lives. The legacy "bottom" dock is GONE on
                purpose: the user never wants the chat to collapse into the
                terminal panel again. The migration in `store.ts` rewrites any
                saved `bottom` to `right`, so an old profile cannot land back
                there. */}
            {seksi === 'chat' && (
              <div className="lm-pane" data-testid="lm-pane-chat">
                <JudulPane
                  judul={tr('AI Chat')}
                  desc={tr('Where the chat lives: the right column, an editor tab, or its own window.')}
                />
                <Baris label={tr('AI panel position')}>
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
                          /*
                           * Do NOT hide the terminal here.
                           *
                           * This line used to call `setVisible(false)` on every
                           * AI-position change, with the note "the terminal
                           * panel is always freed up". That note confused
                           * FREEING SPACE with KILLING THE PANEL: choosing where
                           * the chat lives says nothing about whether the reader
                           * wants their terminal, and the panel never came back
                           * afterwards - it stayed gone until it was toggled by
                           * hand. That is the reported "the bottom panel
                           * disappeared".
                           *
                           * The AI column and the bottom dock are independent
                           * regions of the layout, so there is nothing to free:
                           * leaving `visible` alone keeps the reader's panel
                           * exactly as they left it.
                           */
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Baris>

                {/* Only meaningful while the chat is a column. */}
                {aiPos === 'right' && (
                  <Baris label={tr('Subagent info to the right of chat')}>
                    <button
                      className={`lm-toggle${L.subKanan ? ' is-aktif' : ''}`}
                      data-testid="lm-subKanan"
                      aria-pressed={L.subKanan}
                      onClick={() => {
                        L.setSubKanan(!L.subKanan);
                        void useLayoutCustom.getState().simpan();
                      }}
                    >
                      <span className="lm-toggle-knob" aria-hidden="true" />
                    </button>
                  </Baris>
                )}
              </div>
            )}

            {/* ── Editor ───────────────────────────────────────────────────
                Quick toggles for the editor surface, so the common view options
                are reachable without opening the full Settings page. */}
            {seksi === 'editor' && (
              <div className="lm-pane" data-testid="lm-pane-editor">
                <JudulPane
                  judul={tr('Editor')}
                  desc={tr('Quick view options for the editor surface, without opening the full Settings page.')}
                />
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
              </div>
            )}

            {/* ── View ─────────────────────────────────────────────────────
                Zoom and the full-window modes. */}
            {seksi === 'view' && (
              <div className="lm-pane" data-testid="lm-pane-view">
                <JudulPane
                  judul={tr('View')}
                  desc={tr('Window scale, and the full-window modes that hide every panel.')}
                />
                <Baris label={tr('Zoom')}>
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
                </Baris>

                <Baris label={tr('Zen Mode')} hint={tr('Hide every panel and keep only the text. Ctrl+K Z')}>
                  <button
                    className={`lm-toggle${zen ? ' is-aktif' : ''}`}
                    data-testid="lm-zen"
                    aria-pressed={zen}
                    aria-label={tr('Zen Mode')}
                    onClick={() => setZen(zen ? 'normal' : 'zen')}
                  >
                    <span className="lm-toggle-knob" aria-hidden="true" />
                  </button>
                </Baris>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
