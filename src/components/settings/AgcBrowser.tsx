/*
 * Browser — the TRAE-shaped page inside Agent Customizations.
 *
 * Three blocks:
 *
 *   1. GENERAL       - which browser AI tasks use, and whether actions capture a
 *                      screenshot.
 *   2. URL OPENING   - local vs external links, separately. They are separate
 *                      because they are different promises: a localhost URL is
 *                      the reader's own dev server (open it inside Zephyr), while
 *                      an external link is the wider web (the OS browser may be
 *                      what they want).
 *   3. BROWSER DATA  - one button that clears cookies and storage.
 *
 * The settings live under `settings.browser` and are read by the link-opening
 * path (`open_link`) and by the browser pane, so each control changes real
 * behaviour rather than decorating a page.
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
   * could not check, so the failure path reports the actual error.
   */
  const bersihkan = async () => {
    setSibuk(true);
    setPesan(null);
    try {
      await tauriInvoke('browser_clear_data');
      setPesan(tr('Browser data cleared.'));
    } catch (e) {
      setPesan(tr('Could not clear browser data: ') + String(e));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="agc-pane agx-pane" data-testid="agx-browser">
      <h2 className="agc-pane-title">
        {tr('Browser')}{' '}
        <span className="agx-tanya" title={tr('How the agent opens and captures web pages.')}>
          ?
        </span>
      </h2>

      {/* ── 1. General ─────────────────────────────────────────────────── */}
      <h3 className="agx-seksi">{tr('General')}</h3>
      <label className="agx-field">
        <span className="agx-field-label">{tr('Default Browser for AI Tasks')}</span>
        <select
          className="agx-pil"
          data-testid="agx-br-bawaan"
          value={bawaan}
          onChange={(e) => simpan({ bawaan: e.target.value })}
        >
          {PILIHAN.map((p) => (
            <option key={p.id} value={p.id}>
              {tr(p.label)}
            </option>
          ))}
        </select>
        <span className="agx-baris-desk">{tr(PILIHAN.find((p) => p.id === bawaan)?.ket ?? '')}</span>
      </label>

      <label className="agx-tool-baris agx-tool-pil" data-testid="agx-br-autoshot">
        <input
          type="checkbox"
          checked={autoShot}
          onChange={(e) => simpan({ autoScreenshot: e.target.checked })}
        />
        <span className="agx-baris-teks">
          <span className="agx-baris-nama">{tr('Auto Screenshot')}</span>
          <span className="agx-baris-desk">
            {tr('Automatically captures screenshots after browser actions, for display only.')}
          </span>
        </span>
      </label>

      {/* ── 2. URL opening ─────────────────────────────────────────────── */}
      <h3 className="agx-seksi">{tr('URL Link Opening')}</h3>
      <label className="agx-field">
        <span className="agx-field-label">{tr('Local URL')}</span>
        <select
          className="agx-pil"
          data-testid="agx-br-lokal"
          value={urlLokal}
          onChange={(e) => simpan({ urlLokal: e.target.value })}
        >
          {PILIHAN.map((p) => (
            <option key={p.id} value={p.id}>
              {tr(p.label)}
            </option>
          ))}
        </select>
      </label>
      <label className="agx-field">
        <span className="agx-field-label">{tr('External URL')}</span>
        <select
          className="agx-pil"
          data-testid="agx-br-luar"
          value={urlLuar}
          onChange={(e) => simpan({ urlLuar: e.target.value })}
        >
          {PILIHAN.map((p) => (
            <option key={p.id} value={p.id}>
              {tr(p.label)}
            </option>
          ))}
        </select>
      </label>

      {/* ── 3. Browser data ────────────────────────────────────────────── */}
      <h3 className="agx-seksi">{tr('Built-in Browser')}</h3>
      <div className="agx-log-baris">
        <div className="agx-baris-teks">
          <span className="agx-baris-nama">{tr('Browser Data')}</span>
          <span className="agx-baris-desk">
            {tr('Website data stored in the built-in browser, such as cookies and local storage.')}
          </span>
        </div>
        <button
          type="button"
          className="agx-btn-hapus"
          data-testid="agx-br-clear"
          disabled={sibuk}
          onClick={() => void bersihkan()}
        >
          <AiIkon name="trash" size={12} />
          {sibuk ? tr('Clearing…') : tr('Clear')}
        </button>
      </div>
      {pesan && (
        <p className="agx-log" data-testid="agx-br-pesan">
          {pesan}
        </p>
      )}
    </div>
  );
}
