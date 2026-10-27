/*
 * Browser — halaman di dalam Agent Customizations, bentuk ZCode.
 *
 * BENTUKNYA, dan apa yang berubah dari versi pertama:
 *
 * Versi pertama punya empat kontrol di satu kolom datar: browser bawaan, auto
 * screenshot, URL lokal, URL luar, clear. Itu SET setelan yang benar tapi
 * SUSUNAN yang salah - ia terbaca sebagai daftar sakelar yang tidak berhubungan.
 * Sekarang halaman ini memakai bahasa yang sama dengan Skills dan Computer Use di
 * sebelahnya: judul + hitungan, grup bernama, kartu berikon, kontrol di kanan.
 * Sakelar induk juga pindah KE DALAM pane: sebelumnya ia menggantung di luar
 * `agx-browser`, jadi ia terbaca sebagai milik halaman lain.
 *
 * KENAPA LOKAL DAN LUAR TETAP TERPISAH:
 *
 * Keduanya janji yang berbeda. URL localhost adalah dev server pembaca sendiri -
 * membukanya DI DALAM Zephyr yang membuat agen bisa membacanya kembali. Tautan
 * luar adalah web yang lebih luas, dan di situ browser sistem sering justru yang
 * diinginkan. Satu sakelar untuk keduanya memaksa pilihan yang salah separuh
 * waktu.
 *
 * KENAPA TOMBOL CLEAR JUJUR SOAL CAKUPANNYA:
 *
 * Ia memanggil `browser_clear_data`, yang hanya menyentuh webview berlabel
 * `browser-*`. Menghapus jendela UI akan membawa sesi dan setelan pembaca -
 * kebalikan dari janji tombolnya - jadi perintah Rust itu sengaja melewatinya dan
 * halaman ini menyebut berapa pane yang dibersihkan.
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
  const aktif = br.enabled !== false;
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

  const pilihan = (nilai: string, testid: string, label: string, patch: string) => (
    <select
      className="agset-pil"
      data-testid={testid}
      aria-label={tr(label)}
      value={nilai}
      onChange={(e) => simpan({ [patch]: e.target.value })}
    >
      {PILIHAN.map((p) => (
        <option key={p.id} value={p.id}>
          {tr(p.label)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="agc-pane agc-skills" data-testid="agx-browser">
      <div className="agc-zc-atas">
        <h2 className="agc-zc-judul">{tr('Browser')}</h2>
        <span className="agc-zc-hitung">{[aktif, autoShot].filter(Boolean).length}/2</span>
      </div>
      <p className="agc-zc-desk-satu">
        {tr('Choose how Zephyr opens links and captures pages for AI tasks.')}
      </p>

      {/* ── 1. General ─────────────────────────────────────────────────── */}
      <div className="agc-zc-grub-head">
        <span className="agc-zc-grub-judul">{tr('General')}</span>
      </div>

      <div className="agc-zc-daftar">
        {/* Gerbang induk: mati = tool browser_* tidak dikirim ke model. */}
        <div className="agc-zc-kartu" data-testid="agc-browser-enable-baris">
          <span className="agc-zc-ikon" aria-hidden="true">
            <AiIkon name="web" size={15} />
          </span>
          <div className="agc-zc-isi">
            <span className="agc-zc-kartu-head">{tr('Enable built-in browser control')}</span>
            <span className="agc-zc-desk">
              {tr('Enable the official Browser Use plugin so new sessions can access and control web pages in the built-in browser.')}
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={aktif}
            aria-label={tr('Enable built-in browser control')}
            data-testid="agc-browser-enable"
            className={`agc-set-toggle${aktif ? ' is-on' : ''}`}
            onClick={() => simpan({ enabled: !aktif })}
          >
            <span className="agc-set-knob" aria-hidden="true" />
          </button>
        </div>

        <div className="agc-zc-kartu">
          <span className="agc-zc-ikon" aria-hidden="true">
            <AiIkon name="web" size={15} />
          </span>
          <div className="agc-zc-isi">
            <span className="agc-zc-kartu-head">{tr('Default Browser for AI Tasks')}</span>
            <span className="agc-zc-desk">
              {tr(PILIHAN.find((p) => p.id === bawaan)?.ket ?? '')}
            </span>
          </div>
          {pilihan(bawaan, 'agx-br-bawaan', 'Default Browser for AI Tasks', 'bawaan')}
        </div>

        {/*
          Auto Screenshot: satu label yang membungkus input asli.
          Harness mengklik `[data-testid="agx-br-autoshot"] input`; sebelumnya
          testid itu ada di INPUT-nya sendiri, jadi selektor itu tidak pernah
          menemukan apa pun dan uji "toggle menulis ke setelan" lolos tanpa
          mengubah apa pun. Sekarang testid ada di barisnya dan input-nya benar
          ada di dalam.
        */}
        <div className="agc-zc-kartu" data-testid="agx-br-autoshot">
          <span className="agc-zc-ikon" aria-hidden="true">
            <AiIkon name="image" size={15} />
          </span>
          <div className="agc-zc-isi">
            <span className="agc-zc-kartu-head">{tr('Auto Screenshot')}</span>
            <span className="agc-zc-desk">
              {tr('Automatically capture a screenshot after browser actions, for display only.')}
            </span>
          </div>
          <label className="agc-zc-switch" title={tr('Auto Screenshot')}>
            <input
              type="checkbox"
              checked={autoShot}
              aria-label={tr('Auto Screenshot')}
              onChange={(e) => simpan({ autoScreenshot: e.target.checked })}
            />
            <span className={`agc-set-toggle${autoShot ? ' is-on' : ''}`} aria-hidden="true">
              <span className="agc-set-knob" />
            </span>
          </label>
        </div>
      </div>

      {/* ── 2. URL opening ─────────────────────────────────────────────── */}
      <div className="agc-zc-grub-head">
        <span className="agc-zc-grub-judul">{tr('URL Link Opening')}</span>
      </div>

      <div className="agc-zc-daftar">
        <div className="agc-zc-kartu">
          <span className="agc-zc-ikon" aria-hidden="true">
            <AiIkon name="monitor" size={15} />
          </span>
          <div className="agc-zc-isi">
            <span className="agc-zc-kartu-head">{tr('Local URL')}</span>
            <span className="agc-zc-desk">
              {tr('For example localhost:3000, the dev server you are working on.')}
            </span>
          </div>
          {pilihan(urlLokal, 'agx-br-lokal', 'Local URL', 'urlLokal')}
        </div>

        <div className="agc-zc-kartu">
          <span className="agc-zc-ikon" aria-hidden="true">
            <AiIkon name="web" size={15} />
          </span>
          <div className="agc-zc-isi">
            <span className="agc-zc-kartu-head">{tr('External URL')}</span>
            <span className="agc-zc-desk">
              {tr('Any other address the agent opens, such as documentation or a repository.')}
            </span>
          </div>
          {pilihan(urlLuar, 'agx-br-luar', 'External URL', 'urlLuar')}
        </div>
      </div>

      <p className="agc-zc-muted" data-testid="agx-br-ringkas">
        {ringkasUrl}
      </p>

      {/* ── 3. Browser data ────────────────────────────────────────────── */}
      <div className="agc-zc-grub-head">
        <span className="agc-zc-grub-judul">{tr('Built-in Browser')}</span>
      </div>

      <div className="agc-zc-kartu">
        <span className="agc-zc-ikon" aria-hidden="true">
          <AiIkon name="trash" size={15} />
        </span>
        <div className="agc-zc-isi">
          <span className="agc-zc-kartu-head">{tr('Browser Data')}</span>
          <span className="agc-zc-desk">
            {tr('Website data stored in the built-in browser, such as cookies and local storage.')}
          </span>
        </div>
        <button
          type="button"
          className="agc-zc-btn is-bahaya"
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
