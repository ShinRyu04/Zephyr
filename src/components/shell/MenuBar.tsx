import { useEffect, useRef, useState } from 'react';
import { MENUS, type MenuItem } from '../../lib/menu';
import { findCommand, runCommand } from '../../lib/commandRegistry';
import { useKb } from '../../lib/keybindingStore';
import { chordFor, displayChord } from '../../lib/keybindings';
import { usePalette } from '../../lib/paletteStore';
import { useStore } from '../../lib/store';
import WindowControls from './WindowControls';
import { useLayoutCustom } from '../../lib/layoutStore';
import ZephyrLogo from './ZephyrLogo';
import { useT } from '../../lib/i18n';
import { useLabel } from '../../lib/labelI18n';

const bisaFokus = (it: MenuItem) => it.kind !== 'sep';

const POSISI_PANEL: { id: 'left' | 'right' | 'top' | 'bottom'; label: string; desc: string }[] = [
  { id: 'left', label: 'Kiri', desc: 'panel di samping kiri editor' },
  { id: 'right', label: 'Kanan', desc: 'panel di samping kanan editor' },
  { id: 'top', label: 'Atas', desc: 'panel di atas editor' },
  { id: 'bottom', label: 'Bawah', desc: 'panel di bawah editor' },
];

export default function MenuBar() {
  const tr = useT();
  const lbl = useLabel();
  const bindings = useKb((s) => s.bindings);

  const [buka, setBuka] = useState(-1);

  const layoutBuka = useLayoutCustom((s) => s.menuBuka);
  const setLayoutBuka = useLayoutCustom((s) => s.setMenuBuka);

  const [idx, setIdx] = useState(-1);

  const [sub, setSub] = useState<string | null>(null);

  const [altAktif, setAltAktif] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const posPanel = useStore((s) => s.settings.sidebar);
  const setSidebarVisible = useStore((s) => s.setSidebarVisible);
  const applySettings = useStore((s) => s.applySettings);

  const tutup = () => {
    setBuka(-1);
    setIdx(-1);
    setSub(null);
  };

  useEffect(() => {
    if (buka < 0) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) tutup();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [buka]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey) {
        setAltAktif(true);
        return;
      }
      if (e.altKey && !e.ctrlKey && e.key.length === 1) {
        const i = MENUS.findIndex((m) => m.mnemonic === e.key.toLowerCase());
        if (i >= 0) {
          e.preventDefault();
          e.stopPropagation();
          setBuka(i);
          setIdx(MENUS[i].items.findIndex(bisaFokus));
          setSub(null);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltAktif(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, []);

  useEffect(() => {
    if (buka < 0) return;
    const items = MENUS[buka].items;
    const onKey = (e: KeyboardEvent) => {
      const geser = (arah: 1 | -1) => {
        let n = idx;
        for (let i = 0; i < items.length; i++) {
          n = (n + arah + items.length) % items.length;
          if (bisaFokus(items[n])) break;
        }
        setIdx(n);
      };
      if (e.key === 'Escape') {
        e.preventDefault();
        tutup();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        geser(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        geser(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const it = items[idx];
        if (it?.children) {
          setSub(it.label ?? null);
        } else {
          const n = (buka + 1) % MENUS.length;
          setBuka(n);
          setIdx(MENUS[n].items.findIndex(bisaFokus));
          setSub(null);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (sub) {
          setSub(null);
        } else {
          const n = (buka - 1 + MENUS.length) % MENUS.length;
          setBuka(n);
          setIdx(MENUS[n].items.findIndex(bisaFokus));
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[idx];
        if (it?.children) setSub(it.label ?? null);
        else if (it?.command) pilih(it.command);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [buka, idx, sub]);

  const pilih = (command: string) => {
    tutup();
    void runCommand(command);
  };

  const renderItem = (it: MenuItem, i: number, dalamSub = false) => {
    if (it.kind === 'sep') return <div className="mb-sep" key={`sep-${i}`} role="separator" />;

    const def = it.command ? findCommand(it.command) : undefined;

    // Menu selalu aktif: item hanya "nonaktif" kalau command-nya memang tidak
    // terdaftar sama sekali (item mati). Gating konteks (enabled()) sengaja
    // TIDAK dipakai di sini — kalau konteksnya belum ada, command-nya sendiri
    // yang menangani (no-op / pesan lembut), bukan mengunci menunya.
    const adaCommand = !!def;
    const nonaktif = !!it.command && !adaCommand;
    const chord = it.command ? chordFor(it.command, bindings) : '';

    if (it.children) {
      const terbuka = sub === it.label;
      return (
        <div className="mb-sub-wrap" key={it.label} role="none">
          <button
            className={`mb-item mb-has-sub${idx === i && !dalamSub ? ' is-active' : ''}`}
            data-testid="mb-item"
            data-command="submenu"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={terbuka}
            onMouseEnter={() => {
              setIdx(i);
              setSub(it.label ?? null);
            }}
            onClick={() => setSub(terbuka ? null : (it.label ?? null))}
          >
            <span className="mb-label">{lbl(it.label)}</span>
            <span className="mb-arrow" aria-hidden="true">
              ›
            </span>
          </button>
          {terbuka && (
            <div className="mb-dropdown mb-submenu" role="menu" data-testid="mb-submenu">
              {it.children.map((c, j) => renderItem(c, j, true))}
            </div>
          )}
        </div>
      );
    }

    return (
      <button
        key={it.command ?? it.label}
        className={`mb-item${idx === i && !dalamSub ? ' is-active' : ''}`}
        data-testid="mb-item"
        data-command={it.command}
        data-disabled={nonaktif ? '1' : '0'}
        data-chord={chord}
        role="menuitem"
        disabled={nonaktif}
        aria-disabled={nonaktif}
        title={nonaktif ? `${lbl(it.label)} — ${tr('belum tersedia')}` : lbl(it.label)}
        onMouseEnter={() => !dalamSub && setIdx(i)}
        onClick={() => it.command && pilih(it.command)}
      >
        <span className="mb-label">{lbl(it.label)}</span>
        {chord && (
          <span className="mb-chord" data-testid="mb-chord">
            {displayChord(chord)}
          </span>
        )}
      </button>
    );
  };

  return (

    <div
      className="menubar"
      ref={rootRef}
      data-testid="menubar"
      role="menubar"
      data-tauri-drag-region
    >
      {/* Revisi 1.1.10: logo Z di kiri menubar, sebelah "File". Title bar
          native sudah dimatikan, jadi ini satu-satunya penanda identitas.
          Pakai glyphOnly: logo ber-kotak di bar 28px hanya menghasilkan
          huruf Z ~7px (padding kotak memakan ~50% area). Ukuran 13px dipilih
          dari pengukuran VS Code di mesin ini: logonya 19px = 1.58x tinggi
          teks menunya. Zephyr pakai ~1.4x (sedikit lebih kalem, karena huruf
          Z lebih lebar daripada glyph pita VS Code). */}
      <div className="mb-brand" role="none" aria-hidden="true">
        <ZephyrLogo size={13} glyphOnly />
      </div>
      {MENUS.map((m, i) => {
        /*
         * Label menu diterjemahkan saat render. Mnemonic (huruf bergaris
         * bawah saat Alt ditekan) dihitung dari label TERJEMAHAN: huruf yang
         * sama belum tentu ada di bahasa lain, jadi kalau tidak ketemu
         * indeksnya -1 dan tidak ada huruf yang digarisbawahi — lebih baik
         * daripada menandai huruf yang salah.
         */
        const labelMenu = lbl(m.label);
        const mnemonicIdx = labelMenu.toLowerCase().indexOf(m.mnemonic);
        return (

          <div className="mb-menu" key={m.label} role="none">
            <button
              className={`mb-top${buka === i ? ' is-open' : ''}`}
              data-testid="mb-top"
              data-menu={m.label}
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={buka === i}
              onClick={() => {
                if (buka === i) tutup();
                else {
                  setBuka(i);
                  setIdx(m.items.findIndex(bisaFokus));
                  setSub(null);
                }
              }}
              onMouseEnter={() => {

                if (buka >= 0 && buka !== i) {
                  setBuka(i);
                  setIdx(m.items.findIndex(bisaFokus));
                  setSub(null);
                }
              }}
            >
              {altAktif && mnemonicIdx >= 0 ? (
                <>
                  {labelMenu.slice(0, mnemonicIdx)}
                  <u>{labelMenu[mnemonicIdx]}</u>
                  {labelMenu.slice(mnemonicIdx + 1)}
                </>
              ) : (
                labelMenu
              )}
            </button>

            {buka === i && (
              <div className="mb-dropdown" role="menu" data-testid="mb-dropdown">
                {m.items.map((it, j) => renderItem(it, j))}
              </div>
            )}
          </div>
        );
      })}

      {/* Command center ala VS Code: kotak di baris menu sejajar
          File/Edit/dll. Klik = buka Command Palette (mode command). */}
      <div className="mb-cc-wrap" role="none">
        <button
          className="mb-cc"
          data-testid="mb-command-center"
          title={tr('Command Palette — cari perintah & file (Ctrl+Shift+P / Ctrl+P)')}
          aria-haspopup="dialog"
          onClick={() => {
            tutup();
            void usePalette.getState().openPalette('command');
          }}
        >
          <svg className="mb-cc-ico" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M10.5 5.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-.8 3.9 4 4.1-1 1-4-4.1a5 5 0 0 1-6.7-6.7L1 7 1.9 5.6A5 5 0 0 1 8 1a5 5 0 0 1 5.5 4.3l.4 2.6-1.9.5-2.3.5z"
              fill="currentColor"
            />
          </svg>
          <span className="mb-cc-label">{tr('Cari file & perintah…')}</span>
        </button>
      </div>

      {/* Layout panel — 4 tombol posisi SELALU TERLIHAT di kanan atas menu
          bar (bukan popover): klik langsung pindah, tanpa buka menu dulu.
          Posisi aktif ditandai; tombol mata di ujung = sembunyikan panel. */}
      <div className="mb-layout" role="radiogroup" aria-label={tr('Posisi panel')}>
        {POSISI_PANEL.map((p) => (
          <button
            key={p.id}
            className={`mb-layout-btn${posPanel === p.id ? ' is-on' : ''}`}
            data-testid={`mb-layout-${p.id}`}
            title={`${tr('Panel')} ${tr(p.label)} — ${tr(p.desc)}`}
            aria-label={`${tr('Panel')} ${tr(p.label)}`}
            role="radio"
            aria-checked={posPanel === p.id}
            onClick={() => {
              tutup();
              void applySettings({ sidebar: p.id });
              setSidebarVisible(true);
            }}
          >
            <svg className="mb-layout-ic" viewBox="0 0 16 16" aria-hidden="true">
              {/* ikon layout: panel kiri/kanan/atas/bawah di sekitar editor */}
              <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              {p.id === 'left' && <path d="M5.8 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />}
              {p.id === 'right' && <path d="M10.2 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />}
              {p.id === 'top' && <path d="M2.2 5.8h11.6" stroke="currentColor" strokeWidth="1.3" />}
              {p.id === 'bottom' && <path d="M2.2 10.2h11.6" stroke="currentColor" strokeWidth="1.3" />}
            </svg>
          </button>
        ))}
        <div className="mb-layout-sep" role="separator" />
        {/* Customize Layout (ala VS Code): satu panel untuk SEMUA kontrol
            tata letak. Tanpa ini, user harus tahu bahwa "sembunyikan status
            bar" ada di command palette dan "zen mode" di menu View. */}
        <button
          className={`mb-layout-btn${layoutBuka ? ' is-aktif' : ''}`}
          data-testid="mb-customize-layout"
          title={tr('Customize Layout…')}
          aria-label={tr('Customize Layout…')}
          aria-expanded={layoutBuka}
          onClick={() => {
            tutup();
            setLayoutBuka(!layoutBuka);
          }}
        >
          <svg className="mb-layout-ic" viewBox="0 0 16 16" aria-hidden="true">
            {/* ikon tata letak: dua kolom dengan pembagi */}
            <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6.4 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.6 6.2h3.4M9.6 9.4h3.4" stroke="currentColor" strokeWidth="1.1" />
          </svg>
        </button>
        <div className="mb-layout-sep" role="separator" />
        <button
          className="mb-layout-btn"
          data-testid="mb-layout-hide"
          title={tr('Sembunyikan panel')}
          aria-label={tr('Sembunyikan panel')}
          onClick={() => {
            tutup();
            setSidebarVisible(false);
          }}
        >
          <svg className="mb-layout-ic" viewBox="0 0 16 16" aria-hidden="true">
            {/* mata dicoret = panel disembunyikan */}
            <path d="M1.6 8s2.1-3.4 6.4-3.4 6.4 3.4 6.4 3.4-2.1 3.4-6.4 3.4S1.6 8 1.6 8z" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      {/* C-18: tombol window sendiri (title bar Windows dihapus). */}
      <WindowControls />
    </div>
  );
}
