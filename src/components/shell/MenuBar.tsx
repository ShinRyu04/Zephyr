import { useEffect, useRef, useState } from 'react';
import { MENUS, type MenuItem } from '../../lib/menu';
import { findCommand, runCommand } from '../../lib/commandRegistry';
import { useKb } from '../../lib/keybindingStore';
import { chordFor, displayChord } from '../../lib/keybindings';
import { usePalette } from '../../lib/paletteStore';
import Tip from './Tip';
import WindowControls from './WindowControls';
import UpdateBtn from '../ai/UpdateBtn';
import { useLayoutCustom } from '../../lib/layoutStore';
import ZephyrLogo from './ZephyrLogo';
import { useT } from '../../lib/i18n';
import { useLabel } from '../../lib/labelI18n';

const bisaFokus = (it: MenuItem) => it.kind !== 'sep';

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

    // The menu is always active: an item is only "disabled" if its command really
    // is registered at all (dead item). Context gating (enabled()) is deliberately
    // is NOT used here - if the context does not exist yet, the command itself
    // handles it (no-op / gentle message), rather than locking the menu.
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
        key={it.id ?? it.command ?? it.label}
        className={`mb-item${idx === i && !dalamSub ? ' is-active' : ''}`}
        data-testid="mb-item"
        data-command={it.command}
        data-disabled={nonaktif ? '1' : '0'}
        data-chord={chord}
        role="menuitem"
        disabled={nonaktif}
        aria-disabled={nonaktif}
        title={nonaktif ? `${lbl(it.label)} - ${tr('not available yet')}` : lbl(it.label)}
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
      {/* Revision 1.1.10: the Z logo on the left of the menubar, next to "File". The
          native title bar is disabled, so this is the only identity marker.
          Uses glyphOnly: a boxed logo in a 28px bar only yields a
          Z letter ~7px (the box padding eats ~50% of the area). The 13px size was chosen
          from measuring VS Code on this machine: its logo is 19px = 1.58x the height of
          the menu text. Zephyr uses ~1.4x (a bit calmer, because the letter
          Z is wider than VS Code's ribbon glyph). */}
      <div className="mb-brand" role="none" aria-hidden="true">
        <ZephyrLogo size={13} glyphOnly />
      </div>
      {/* Build marker moved to the activity bar's bottom corner, above the
          GitHub account button. It used to sit here, between the logo and
          "File", which pushed EVERY menu 35px to the right: a dev build and a
          release build then had two different menubar layouts, so anything
          measured or arranged while developing did not match what shipped.
          The marker itself stays - the native title bar is off, and without it
          a dev build is indistinguishable from an installed one. */}
      {MENUS.map((m, i) => {
        /*
         * Menu labels are translated at render time. The mnemonic (the letter
         * underlined when Alt is held) is computed from the TRANSLATED
         * label: the same letter is not necessarily present in another language, so
         * if the index is not found it is -1 and no letter is underlined - better
         * than marking the wrong letter.
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

      {/* VS Code-style command center: a box on the menu row, in line with
          File/Edit/etc. Click = open the Command Palette (command mode). */}
      <div className="mb-cc-wrap" role="none">
        <button
          className="mb-cc"
          data-testid="mb-command-center"
          title={tr('Command Palette - search commands & files (Ctrl+Shift+P / Ctrl+P)')}
          aria-haspopup="dialog"
          onClick={() => {
            tutup();
            /* `true` = anchored: the palette drops directly under this box
               instead of opening as a centred modal over a dimmed editor. */
            void usePalette.getState().openPalette('command', true);
          }}
        >
          <svg className="mb-cc-ico" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M10.5 5.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zm-.8 3.9 4 4.1-1 1-4-4.1a5 5 0 0 1-6.7-6.7L1 7 1.9 5.6A5 5 0 0 1 8 1a5 5 0 0 1 5.5 4.3l.4 2.6-1.9.5-2.3.5z"
              fill="currentColor"
            />
          </svg>
          <span className="mb-cc-label">{tr('Search')}</span>
        </button>
      </div>

      {/* Layout controls collapse to a SINGLE "Customize Layout" button.
          The four always-visible panel-position buttons moved INTO that popup
          (VS Code style) so the menu bar no longer spends four slots on them. */}
      <div className="mb-layout" aria-label={tr('Layout')}>
        {/*
          * The Update button, in the title bar immediately left of Customize
          * Layout — VSCode's placement. It used to sit in the AI panel's tab
          * strip, which is only visible while that panel is open; the window
          * title bar is where a reader looks for "is there a new version", and
          * it is visible with the AI panel closed.
          *
          * Renders nothing unless the updater has found a release, so the bar
          * keeps its width when there is nothing to say.
          */}
        <UpdateBtn />
        {/* Customize Layout (VS Code style): one panel for ALL layout
            controls. Without this, the user has to know that "hide status
            bar" is in the command palette and "zen mode" is in the View menu. */}
        <Tip label={tr('Customize Layout…')}>
          <button
            className={`mb-layout-btn${layoutBuka ? ' is-aktif' : ''}`}
            data-testid="mb-customize-layout"
            aria-label={tr('Customize Layout…')}
            aria-expanded={layoutBuka}
            onClick={() => {
              tutup();
              setLayoutBuka(!layoutBuka);
            }}
          >
            <svg className="mb-layout-ic" viewBox="0 0 16 16" aria-hidden="true">
              {/* layout icon: two columns with a divider */}
              <rect x="1.8" y="2.2" width="12.4" height="11.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M6.4 2.2v11.6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M9.6 6.2h3.4M9.6 9.4h3.4" stroke="currentColor" strokeWidth="1.1" />
            </svg>
          </button>
        </Tip>
        {/*
          * "Agent ↗" — the way into the pop-out Agents window.
          *
          * TRAE's placement: AFTER Customize Layout, separated by a rule and
          * hard against the window controls. The arrow sits to the RIGHT of the
          * label and points up-away from the bar, which is exactly what the
          * glyph means here: this opens a separate WINDOW, not a panel.
          *
          * It replaces the old "Open in Agents" pill that lived beside Search.
          * Two buttons that open the same window in one bar is one too many, and
          * this slot is where TRAE puts it. Ctrl+Shift+A still does the same
          * thing, so the chord lives in the tooltip.
          *
          * BOXED, TRAE-style: the label sits inside its own hairline frame with
          * a rule on BOTH sides, which is what makes it read as a distinct
          * title-bar control rather than as loose text that happens to be there.
          */}
        <div className="mb-layout-sep" role="separator" />
        <Tip label={tr('Open in Agents Window')} kbd="Ctrl+Shift+A">
          <button
            className="mb-agent"
            data-testid="mb-open-agents"
            onClick={() => {
              tutup();
              void import('../../lib/agentsWindow').then((m) => m.bukaAgentsWindow());
            }}
          >
            <span className="mb-agent-label">{tr('Agent')}</span>
            <svg className="mb-agent-arrow" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M2.4 7.6 7.6 2.4M3.7 2.4h3.9v3.9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </Tip>
        <div className="mb-layout-sep" role="separator" />
      </div>

      {/* C-18: our own window buttons (the Windows title bar was removed). */}
      <WindowControls />
    </div>
  );
}
