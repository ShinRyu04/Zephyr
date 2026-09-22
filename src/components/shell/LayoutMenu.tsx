// LayoutMenu.tsx — panel "Customize Layout" (ala VS Code).
//
// KENAPA ada: Zephyr sudah punya semua kemampuan ini (sembunyikan sidebar,
// panel, zen mode) TAPI tersebar di menu View, command palette, dan Settings.
// User yang ingin "atur tata letak" harus tahu di mana masing-masing berada.
// Panel ini mengumpulkan semuanya dalam satu tempat, persis seperti VS Code —
// termasuk tombol reset.
//
// YANG DITAMPILKAN: setiap baris punya ikon mata (terlihat/sembunyi) supaya
// status saat ini terbaca tanpa membuka menu lain.

import { useEffect, useRef } from 'react';
import { useLayoutCustom, BARIS_LAYOUT } from '../../lib/layoutStore';
import { useTampilan } from '../../lib/tampilanStore';
import { useT } from '../../lib/i18n';

export default function LayoutMenu({ onTutup }: { onTutup: () => void }) {
  const tr = useT();
  const L = useLayoutCustom();
  const zen = useTampilan((s) => s.mode === 'zen');
  const setZen = useTampilan((s) => s.setMode);
  const ref = useRef<HTMLDivElement>(null);

  // Tutup saat klik di luar atau Escape — tanpa ini panel mengambang menutupi
  // title bar dan user harus mengklik tombolnya lagi untuk menutup.
  useEffect(() => {
    const luar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onTutup();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onTutup();
    };
    // `setTimeout 0`: klik yang MEMBUKA panel ini juga terdeteksi sebagai klik
    // di luar kalau listener dipasang langsung.
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
          title={tr('Kembalikan tata letak bawaan')}
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
      <div className="lm-seksi">{tr('Terlihat')}</div>
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

      {/* ── Posisi side bar ── */}
      <div className="lm-seksi">{tr('Posisi Side Bar')}</div>
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
            {p === 'left' ? tr('Kiri') : tr('Kanan')}
          </button>
        ))}
      </div>

      {/* ── Kerapatan ── */}
      <div className="lm-seksi">{tr('Kerapatan')}</div>
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
            {k === 'default' ? tr('Normal') : tr('Rapat')}
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
