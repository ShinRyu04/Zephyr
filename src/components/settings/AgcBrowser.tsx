/*
 * Browser — the TRAE-shaped page inside Agent Customizations.
 *
 * THE SHAPE, and what changed from the first pass:
 *
 * The first version had four controls in a flat column: default browser, auto
 * screenshot, local URL, external URL, clear. That is the right SET of settings
 * but the wrong ORGANISATION - it reads as a list of unrelated switches.
 *
 * The reference groups them by the question they answer:
 *
 *   GENERAL       what browser AI tasks use, and whether actions capture a shot
 *   URL OPENING   local vs external, as a pair with a stated default
 *   BROWSER DATA  one destructive button, set apart
 *
 * WHY LOCAL AND EXTERNAL ARE SEPARATE, and stay separate:
 *
 * They are different promises. A localhost URL is the reader's own dev server -
 * opening it INSIDE Zephyr is what lets the agent read it back. An external link
 * is the wider web, where the OS browser is often what the reader actually
 * wants. One switch for both would force a choice that is wrong half the time.
 *
 * WHY THE CLEAR BUTTON IS HONEST ABOUT ITS SCOPE:
 *
 * It calls `browser_clear_data`, which only touches webviews labelled
 * `browser-*`. Wiping the UI windows would take the reader's sessions and
 * settings with it - the opposite of what the button promises - so the Rust
 * command deliberately skips them and this page says how many panes it cleared.
 */
import { useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useStore } from '../../lib/store';
import { invoke as tauriInvoke } from '@tauri-apps/api/core';

const PILIHAN = [
  { id: 'builtin', label: 'Built-in Browser', ket: 'Opens inside Zephyr, where the agent can read it.' },
  { id: 'sistem', label: 'System Browser', ket: 'Opens in the browser you use for everything else.' },
] as const;

export default function AgcBrowser() {
  const tr = useT();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const br = (settings.browser ?? {}) as Record<string, unknown>;
  const bawaan = String(br.bawaan ?? 'builtin');
  const autoShot = br.autoScreenshot === true;
  const urlLokal = String(br.urlLokal ?? 'builtin');
  const urlLuar = String(br.urlLuar ?? 'sistem');

  const simpan = (patch: Record<string, unknown>) => {
    void applySettings({ browser: { ...br, ...patch } } as never);
  };

  /*
   * Clearing browser data is a real command, not a toast.
   *
   * The WebView2 profile holds cookies and localStorage for every page the pane
   * has loaded. A button that only said "cleared" would be a lie the reader
   * could not check, so the answer - how many panes were cleared - is printed.
   * Zero is a valid, honest answer: no pane has been opened this session.
   */
  const bersihkan = async () => {
    setSibuk(true);
    setPesan(null);
    try {
      const n = await tauriInvoke<number>('browser_clear_data');
      setPesan(
        n === 0
          ? tr('No browser pane has been opened this session, so there was nothing to clear.')
          : tr('Browser data cleared in ') + n + tr(' pane(s).'),
      );
    } catch (e) {
      setPesan(tr('Could not clear browser data: ') + String(e));
    } finally {
      setSibuk(false);
    }
  };

  /* A one-line explanation of what the pair of URL settings currently means. */
  const ringkasUrl =
    urlLokal === 'builtin' && urlLuar === 'sistem'
      ? tr('Local links open in Zephyr; external links open in your system browser.')
      : urlLokal === urlLuar
        ? urlLokal === 'builtin'
          ? tr('Every link opens inside Zephyr.')
          : tr('Every link opens in your system browser.')
        : tr('Local and external links open in different places.');

  return (
    <div className="agc-pane agset-pane" data-testid="agx-browser">
      <h2 className="agc-pane-title">
        {tr('Browser')}{' '}
        <span className="agset-tanya" title={tr('How the agent opens and captures web pages.')}>
          ?
        </span>
      </h2>
      <p className="agc-pane-desc">
        {tr('Choose how Zephyr opens links and captures pages for AI tasks.')}
      </p>

      {/* ── 1. General ─────────────────────────────────────────────────── */}
      <h3 className="agset-seksi">{tr('General')}</h3>

      <div className="agset-kartu-setelan">
        <div className="agset-kartu-baris">
          <div className="agset-baris-teks">
            <span className="agset-baris-nama">{tr('Default Browser for AI Tasks')}</span>
            <span className="agset-baris-desk">
              {tr(PILIHAN.find((p) => p.id === bawaan)?.ket ?? '')}
            </span>
          </div>
          <select
            className="agset-pil"
            data-testid="agx-br-bawaan"
            aria-label={tr('Default Browser for AI Tasks')}
            value={bawaan}
            onChange={(e) => simpan({ bawaan: e.target.value })}
          >
            {PILIHAN.map((p) => (
              <option key={p.id} value={p.id}>
                {tr(p.label)}
              </option>
            ))}
          </select>
        </div>

        <div className="agset-kartu-baris">
          <div className="agset-baris-teks">
            <span className="agset-baris-nama">{tr('Auto Screenshot')}</span>
            <span className="agset-baris-desk">
              {tr('Automatically capture a screenshot after browser actions, for display only.')}
            </span>
          </div>
          <label className="agset-switch" title={tr('Auto Screenshot')}>
            <input
              type="checkbox"
              data-testid="agx-br-autoshot"
              checked={autoShot}
              onChange={(e) => simpan({ autoScreenshot: e.target.checked })}
            />
            <span />
          </label>
        </div>
      </div>

      {/* ── 2. URL opening ─────────────────────────────────────────────── */}
      <h3 className="agset-seksi">{tr('URL Link Opening')}</h3>

      <div className="agset-kartu-setelan">
        <div className="agset-kartu-baris">
          <div className="agset-baris-teks">
            <span className="agset-baris-nama">{tr('Local URL')}</span>
            <span className="agset-baris-desk">
              {tr('For example localhost:3000, the dev server you are working on.')}
            </span>
          </div>
          <select
            className="agset-pil"
            data-testid="agx-br-lokal"
            aria-label={tr('Local URL')}
            value={urlLokal}
            onChange={(e) => simpan({ urlLokal: e.target.value })}
          >
            {PILIHAN.map((p) => (
              <option key={p.id} value={p.id}>
                {tr(p.label)}
              </option>
            ))}
          </select>
        </div>

        <div className="agset-kartu-baris">
          <div className="agset-baris-teks">
            <span className="agset-baris-nama">{tr('External URL')}</span>
            <span className="agset-baris-desk">
              {tr('Any other address the agent opens, such as documentation or a repository.')}
            </span>
          </div>
          <select
            className="agset-pil"
            data-testid="agx-br-luar"
            aria-label={tr('External URL')}
            value={urlLuar}
            onChange={(e) => simpan({ urlLuar: e.target.value })}
          >
            {PILIHAN.map((p) => (
              <option key={p.id} value={p.id}>
                {tr(p.label)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="agset-muted" data-testid="agx-br-ringkas">
        {ringkasUrl}
      </p>

      {/* ── 3. Browser data ────────────────────────────────────────────── */}
      <h3 className="agset-seksi">{tr('Built-in Browser')}</h3>

      <div className="agset-log-baris">
        <div className="agset-baris-teks">
          <span className="agset-baris-nama">{tr('Browser Data')}</span>
          <span className="agset-baris-desk">
            {tr('Website data stored in the built-in browser, such as cookies and local storage.')}
          </span>
        </div>
        <button
          type="button"
          className="agset-btn-hapus"
          data-testid="agx-br-clear"
          disabled={sibuk}
          onClick={() => void bersihkan()}
        >
          <AiIkon name="trash" size={12} />
          {sibuk ? tr('Clearing…') : tr('Clear')}
        </button>
      </div>
      {pesan && (
        <p className="agset-log" data-testid="agx-br-pesan" role="status">
          {pesan}
        </p>
      )}
    </div>
  );
}
