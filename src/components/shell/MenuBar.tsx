// MenuBar.tsx — menu bar atas ala VS Code (fase 18.1).
//
// Aturan yang dipegang:
//   * Item HANYA memanggil commandId dari commandRegistry. Command yang tidak
//     ada = item DISABLED, bukan disembunyikan (18.1/V8).
//   * Accelerator DIAMBIL dari keybindingStore, bukan string literal — jadi
//     remap user langsung terlihat di menu (V7).
//   * Keyboard penuh: Alt menyorot, Alt+huruf membuka menu, panah pindah,
//     Enter memilih, Esc menutup (V2, aksesibilitas wajib).

import { useEffect, useRef, useState } from 'react';
import { MENUS, type MenuItem } from '../../lib/menu';
import { findCommand, runCommand } from '../../lib/commandRegistry';
import { useKb } from '../../lib/keybindingStore';
import { chordFor, displayChord } from '../../lib/keybindings';
import { usePalette } from '../../lib/paletteStore';
import { useStore } from '../../lib/store';
import { useTerminal } from '../../lib/terminalStore';
import Popover from './Popover';

/** Item yang bisa difokus (bukan separator). */
const bisaFokus = (it: MenuItem) => it.kind !== 'sep';

export default function MenuBar() {
  const bindings = useKb((s) => s.bindings);
  /** index menu yang terbuka; -1 = tertutup */
  const [buka, setBuka] = useState(-1);
  /** index item aktif di dalam dropdown; -1 = belum ada */
  const [idx, setIdx] = useState(-1);
  /** label submenu yang terbuka (View → Appearance) */
  const [sub, setSub] = useState<string | null>(null);
  /** Alt ditekan = mnemonic digarisbawahi */
  const [altAktif, setAltAktif] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layoutBtn = useRef<HTMLButtonElement>(null);
  const layoutMode = useStore((s) => s.settings.layout);
  const sbVisible = useStore((s) => s.sidebarVisible);
  const termVisible = useTerminal((s) => s.visible);

  const tutup = () => {
    setBuka(-1);
    setIdx(-1);
    setSub(null);
  };

  // Klik di luar menutup dropdown.
  useEffect(() => {
    if (buka < 0) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) tutup();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [buka]);

  // Alt & mnemonic. Ditangkap di fase CAPTURE supaya resolver chord global
  // tidak lebih dulu menelannya; Alt+huruf bukan chord app mana pun.
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

  // Navigasi keyboard saat dropdown terbuka.
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
    // "Ada tapi belum boleh dipakai" (enabled() false) DAN "belum ada sama
    // sekali" dua-duanya jadi disabled — user tetap melihat itemnya (18.1).
    const adaCommand = !!def;
    const bolehJalan = adaCommand && (def!.enabled ? def!.enabled() : true);
    const nonaktif = !!it.command && !bolehJalan;
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
            <span className="mb-label">{it.label}</span>
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
        title={nonaktif ? `${it.label} — belum tersedia` : it.label}
        onMouseEnter={() => !dalamSub && setIdx(i)}
        onClick={() => it.command && pilih(it.command)}
      >
        <span className="mb-label">{it.label}</span>
        {chord && (
          <span className="mb-chord" data-testid="mb-chord">
            {displayChord(chord)}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="menubar" ref={rootRef} data-testid="menubar" role="menubar">
      {MENUS.map((m, i) => {
        const mnemonicIdx = m.label.toLowerCase().indexOf(m.mnemonic);
        return (
          // FASE 31: role="none" WAJIB di wrapper.
          //
          // Spesifikasi ARIA: anak langsung `menubar` harus `menuitem` (atau
          // group/none). div pembungkus biasa membuat struktur menu rusak di
          // screen reader — axe menandainya `aria-required-children` critical.
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
                // Hover memindah antar menu HANYA saat sudah ada yang terbuka
                // (perilaku VS Code / Windows).
                if (buka >= 0 && buka !== i) {
                  setBuka(i);
                  setIdx(m.items.findIndex(bisaFokus));
                  setSub(null);
                }
              }}
            >
              {altAktif && mnemonicIdx >= 0 ? (
                <>
                  {m.label.slice(0, mnemonicIdx)}
                  <u>{m.label[mnemonicIdx]}</u>
                  {m.label.slice(mnemonicIdx + 1)}
                </>
              ) : (
                m.label
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

      {/* Layout: 4 preset + toggle custom. Sejajar File/Edit/dll. */}
      <div className="mb-menu mb-layout" role="none">
        <button
          className={`mb-top mb-layout-btn${layoutOpen ? ' is-open' : ''}`}
          data-testid="mb-layout"
          ref={layoutBtn}
          title="Layout — pilih preset atau atur manual"
          aria-label="Layout"
          aria-haspopup="menu"
          aria-expanded={layoutOpen}
          onClick={() => {
            tutup();
            setLayoutOpen((o) => !o);
          }}
        >
          <svg className="mb-layout-ic" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.6" y="2.2" width="12.8" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5.8 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M11 8.2v5.6M8.2 8.2h5.6" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        {layoutOpen && (
          <Popover
            anchor={layoutBtn.current}
            arah="down"
            sisi="left"
            testid="mb-layout-menu"
            onClose={() => setLayoutOpen(false)}
          >
            <div className="mb-layout-menu" role="menu">
              <div className="mb-lm-title">Preset</div>
              {(
                [
                  ['default', 'Default', 'sidebar kiri + panel bawah'],
                  ['focus', 'Focus', 'cuma editor, semua panel disembunyikan'],
                  ['term', 'Terminal dock', 'editor + terminal bawah'],
                  ['quad', 'Quad', 'sidebar + editor + terminal'],
                ] as const
              ).map(([mode, label, desc]) => (
                <button
                  key={mode}
                  className={`mb-lm-item${layoutMode === mode ? ' is-sel' : ''}`}
                  role="menuitemradio"
                  aria-checked={layoutMode === mode}
                  data-layout={mode}
                  onClick={() => {
                    void useStore.getState().applyLayout(mode);
                    setLayoutOpen(false);
                  }}
                >
                  <span className="mb-lm-label">{label}</span>
                  <span className="mb-lm-desc">{desc}</span>
                </button>
              ))}
              <div className="mb-lm-sep" role="separator" />
              <div className="mb-lm-title">Custom</div>
              <button
                className={`mb-lm-item mb-lm-check${sbVisible ? ' is-on' : ''}`}
                role="menuitemcheckbox"
                aria-checked={sbVisible}
                data-layout="cb-sidebar"
                onClick={() => {
                  void useStore.getState().applyLayout('default', { sidebar: !sbVisible });
                  setLayoutOpen(false);
                }}
              >
                <span className="mb-lm-label">Tampilkan sidebar</span>
              </button>
              <button
                className={`mb-lm-item mb-lm-check${termVisible ? ' is-on' : ''}`}
                role="menuitemcheckbox"
                aria-checked={termVisible}
                data-layout="cb-panel"
                onClick={() => {
                  void useStore.getState().applyLayout('default', { panel: !termVisible });
                  setLayoutOpen(false);
                }}
              >
                <span className="mb-lm-label">Tampilkan panel bawah</span>
              </button>
            </div>
          </Popover>
        )}
      </div>

      {/* Command center ala VS Code (fase 34): kotak di baris menu sejajar
          File/Edit/dll. Klik = buka Command Palette (mode command). */}
      <div className="mb-cc-wrap" role="none">
        <button
          className="mb-cc"
          data-testid="mb-command-center"
          title="Command Palette — cari perintah & file (Ctrl+Shift+P / Ctrl+P)"
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
          <span className="mb-cc-label">Cari file &amp; perintah…</span>
        </button>
      </div>
    </div>
  );
}
