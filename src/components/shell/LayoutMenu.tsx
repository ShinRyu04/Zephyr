import { useEffect, useRef } from 'react';
import { useLayoutCustom, BARIS_LAYOUT } from '../../lib/layoutStore';
import { useTampilan } from '../../lib/tampilanStore';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';

import { useTerminal } from '../../lib/terminalStore';
export default function LayoutMenu({ onTutup }: { onTutup: () => void }) {
  const tr = useT();
  const L = useLayoutCustom();
  const zen = useTampilan((s) => s.mode === 'zen');

  const aiPos = useStore((s) => s.settings.general.aiPanel ?? 'bottom');
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
    <div className="layout-menu" ref={ref} data-testid="layout-menu">
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

      {/* ── Visibilitas ── */}
      <div className="lm-seksi">{tr('Visible')}</div>
      {BARIS_LAYOUT.map((b) => {
        const aktif = L[b.kunci];
        return (
          <button
            key={b.kunci}
            className={`lm-baris${aktif ? ' is-aktif' : ''}`}
            data-testid={`lm-${b.kunci}`}
            aria-pressed={aktif}
            onClick={() => ubah(b.kunci)}
          >
            <span className="lm-ikon" aria-hidden="true">
              {aktif ? '👁' : '⊘'}
            </span>
            <span className="lm-label">{tr(b.label)}</span>
            {b.shortcut && <kbd className="lm-kbd">{b.shortcut}</kbd>}
          </button>
        );
      })}

      {/* ── Panel info subagent (T4.1b) ──
          Terpisah dari BARIS_LAYOUT karena hanya relevan saat panel AI tampil
          di kolom kanan; kalau digabung, tombol reset tata letak akan ikut
          mematikannya padahal itu pilihan yang disengaja user. */}
      <div className="lm-seksi">{tr('AI panel')}</div>
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

      {/* ── Posisi panel AI ── */}
      <div className="lm-seksi">{tr('AI panel')}</div>
      <div className="lm-pil" data-testid="lm-posisi-ai">
        {(
          [
            ['bottom', tr('Bottom')],
            ['right', tr('Right')],
          ] as const
        ).map(([pos, label]) => (
          <button
            key={pos}
            className={`lm-pil-btn${aiPos === pos ? ' is-aktif' : ''}`}
            data-testid={`lm-ai-${pos}`}
            onClick={async () => {
              await useStore.getState().applySettings({ general: { aiPanel: pos } } as never);

              if (pos === 'right') {

                useTerminal.getState().setVisible(false);
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Posisi side bar ── */}
      <div className="lm-seksi">{tr('Side Bar Position')}</div>
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

      {/* ── Kerapatan ── */}
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

      {/* ── Mode ── */}
      <div className="lm-seksi">{tr('Mode')}</div>
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
  );
}
