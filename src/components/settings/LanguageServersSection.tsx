import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { useLsp } from '../../lib/lspStore';
import { DEFAULT_LSP_SETTINGS, LSP_SERVERS, type LspSettings } from '../../lib/lsp';
import { Section, Toggle } from './SettingsControls';

/*
 * Language Servers, grouped by language, with a live status dot per server.
 *
 * Keys are ENGLISH SENTENCES, not dotted names. That is the convention this page
 * already used (`tr('Enable IntelliSense (LSP)')`), and it matters here: the
 * translations live in `i18n-extra.ts` keyed by the source sentence, so a
 * dotted name like `set.lspTitle` would simply not be found and would fall
 * through to Indonesian for every language. Following the existing convention
 * means all ten languages work with no dictionary edit at all.
 *
 * What changed from the previous version, and why:
 *
 * 1. GROUPED BY LANGUAGE. It was a flat run of rows. Nobody thinks "I need the
 *    third one", they think "the Python one is broken" - and the language is the
 *    name they actually have for it.
 *
 * 2. THE DOT HAS THREE MEANINGS. Before, the only state shown was whether the
 *    command existed on PATH. That answers "could this ever work", not "is it
 *    working now" - a server that probed fine and then crashed looked identical
 *    to a healthy one. Now: green running (from the live process list), red
 *    missing, grey off.
 *
 * 3. EVERY SERVER HAS A SWITCH. `lsp.servers` is a map of overrides and there
 *    was no UI for it, so turning one server off meant hand-editing JSON.
 */

/* `lsp.servers[id] = { enabled, cmd, initOptions }`, plus the global switch. */
type KonfigLsp = LspSettings & {
  servers: Record<string, { enabled?: boolean; cmd?: string[]; initOptions?: Record<string, unknown> }>;
};

export default function LanguageServersSection() {
  const tr = useT();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);

  const probe = useLsp((s) => s.probe);
  const aktif = useLsp((s) => s.aktif);
  const starting = useLsp((s) => s.starting);
  const probeAll = useLsp((s) => s.probeAll);
  const stop = useLsp((s) => s.stop);

  /*
   * A running server is keyed `id::root`, not by id, because one server can run
   * once per workspace root. Asking `aktif[server.id]` would come back empty
   * for every server that is actually running - the exact wrong answer.
   */
  const hidup = useMemo(() => {
    const ids = new Set<string>();
    for (const v of Object.values(aktif)) ids.add(v.id);
    for (const k of Object.keys(starting)) if (starting[k]) ids.add(k.split('::')[0]);
    return ids;
  }, [aktif, starting]);

  const cfg = ((settings as unknown as { lsp?: KonfigLsp }).lsp ??
    (DEFAULT_LSP_SETTINGS as KonfigLsp)) as KonfigLsp;
  const semua = !!cfg.enabled;
  const ov = cfg.servers ?? {};

  const [cari, setCari] = useState('');

  /*
   * Probe once per mount. Empty deps on purpose: `probeAll` writes to the store
   * it reads from, so depending on its identity (new on every render) would
   * re-probe in a loop. The answer only changes when the machine does.
   */
  useEffect(() => {
    void probeAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return LSP_SERVERS;
    return LSP_SERVERS.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.extensions.some((e) => e.toLowerCase().includes(q)),
    );
  }, [cari]);

  /*
   * Group heading is the FIRST language id the server claims, untranslated.
   *
   * Deliberate: the same word appears in `langs` on the row beneath it, so a
   * translated heading would disagree with the row it heads.
   */
  const grup = useMemo(() => {
    const m = new Map<string, typeof LSP_SERVERS>();
    for (const s of tersaring) {
      const kunci = s.langs[0] ?? 'other';
      const arr = m.get(kunci) ?? [];
      arr.push(s);
      m.set(kunci, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tersaring]);

  const ubah = (id: string, patch: { enabled?: boolean; cmd?: string[] | null }) =>
    applySettings({ lsp: { servers: { [id]: patch } } } as never);

  /*
   * A missing command and a switched-off server are different problems with
   * different fixes, so they must not share a colour.
   */
  const statusServer = (id: string): 'hidup' | 'mati' | 'hilang' | 'nonaktif' => {
    if (!semua || ov[id]?.enabled === false) return 'nonaktif';
    if (hidup.has(id)) return 'hidup';
    if (probe[id] && probe[id].ok === false) return 'hilang';
    return 'mati';
  };

  const labelStatus = (st: ReturnType<typeof statusServer>) =>
    st === 'hidup'
      ? tr('running')
      : st === 'nonaktif'
        ? tr('off')
        : st === 'hilang'
          ? tr('not found')
          : tr('idle');

  return (
    <Section title={tr('Language Servers')}>
      <div className="set-row">
        <div className="set-row-label">
          <span className="set-row-title">{tr('Enable IntelliSense (LSP)')}</span>
          <span className="set-hint">
            {tr(
              'A running server gives you completion, go-to-definition, and errors while you type. With this off, the editor still opens and edits files: it just does not know your language.',
            )}
          </span>
        </div>
        <Toggle
          label={tr('Enable IntelliSense (LSP)')}
          testid="lsp-global"
          checked={semua}
          onChange={(v) => applySettings({ lsp: { enabled: v } } as never)}
        />
      </div>

      {/* The filter only appears when there is enough to filter. A search box
          over nine rows is clutter that makes the screen feel heavier than the
          list it searches. */}
      {LSP_SERVERS.length > 8 && (
        <div className="set-row">
          <input
            className="set-input"
            data-testid="lsp-cari"
            placeholder={tr('Filter by language or extension')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
          <button className="btn btn-sm" data-testid="lsp-reload-all" onClick={() => void probeAll()}>
            {tr('Re-check')}
          </button>
        </div>
      )}

      {grup.length === 0 && <span className="set-hint">{tr('No server matches that filter.')}</span>}

      {grup.map(([bahasa, daftar]) => (
        <div className="lsp-grup" key={bahasa} data-testid={`lsp-grup-${bahasa}`}>
          <div className="lsp-grup-head">
            <span className="lsp-grup-nama">{bahasa}</span>
            <span className="lsp-grup-jumlah">{daftar.length}</span>
          </div>

          {daftar.map((s) => {
            const st = statusServer(s.id);
            const kustom = !!ov[s.id]?.cmd;
            const exe = probe[s.id]?.exe ?? s.cmd[0];
            return (
              <div className="lsp-baris" key={s.id} data-testid={`lsp-${s.id}`}>
                <span className={`lsp-dot lsp-dot-${st}`} data-testid={`lsp-${s.id}-dot`} aria-hidden="true" />
                <div className="lsp-info">
                  <span className="lsp-nama">{s.label}</span>
                  <span className="lsp-meta">
                    {/* `title` carries the whole command: the row shows only the
                        executable, because the flags are what make it long and
                        they are not what anyone is looking for. */}
                    <code title={s.cmd.join(' ')}>{exe}</code>
                    <span className={`lsp-status lsp-status-${st}`}>{labelStatus(st)}</span>
                    {kustom && <span className="lsp-kustom">{tr('custom')}</span>}
                  </span>
                  {/* The install hint appears only when the command was probed
                      AND NOT FOUND, and never for a custom command: telling
                      someone how to install a tool they replaced on purpose is
                      noise, and it would be wrong advice. */}
                  {st === 'hilang' && !kustom && (
                    <span className="lsp-install">
                      {tr('Install')}: <code>{s.install}</code>
                    </span>
                  )}
                </div>

                <div className="lsp-aksi">
                  {st === 'hidup' && (
                    <button className="btn btn-sm" data-testid={`lsp-${s.id}-stop`} onClick={() => void stop(s.id)}>
                      {tr('Stop all servers')}
                    </button>
                  )}
                  {/* Re-check re-probes. `probeAll` is the only probe entry point
                      in the store; filtering its result per row would be
                      inventing state, so the button says what it really does. */}
                  <button className="btn btn-sm" data-testid={`lsp-${s.id}-reload`} onClick={() => void probeAll()}>
                    {tr('Re-check')}
                  </button>
                  <Toggle
                    label={tr('Enabled')}
                    testid={`lsp-${s.id}-toggle`}
                    checked={semua && ov[s.id]?.enabled !== false}
                    onChange={(v) => ubah(s.id, { enabled: v })}
                  />
                </div>

                {kustom && (
                  <button className="lsp-balik" data-testid={`lsp-${s.id}-reset`} onClick={() => ubah(s.id, { cmd: null })}>
                    {tr('Reset to the built-in command')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </Section>
  );
}
