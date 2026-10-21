import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { useLsp } from '../../lib/lspStore';
import { DEFAULT_LSP_SETTINGS, LSP_SERVERS, effectiveSpec, type LspServerDef, type LspSettings } from '../../lib/lsp';
import { lspJenisResep, lspPasang, lspPenghalang, type LspJenisResep } from '../../lib/commands';
import { Section, Toggle } from './SettingsControls';
import ToolchainPanel from './ToolchainPanel';

/*
 * The backend's report for one in-app install (`lsp_pasang`).
 *
 * `keluar` is npm's exit code (null when npm had to be killed at the timeout)
 * and `log` its last lines of output; `exe` is the binary actually found in the
 * app's slot afterwards. A missing `exe` with an exit code of 0 is still a
 * failed install, which is why `ok` is a separate field rather than something
 * the dialog derives.
 */
type LaporanPasang = {
  ok: boolean;
  slot?: string;
  paket?: string[];
  keluar?: number | null;
  exe?: string | null;
  log?: string;
};

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

  /*
   * A server the machine can actually run, whether or not it is switched on.
   *
   * This is deliberately NOT the same question as `statusServer`. That one asks
   * "is it running right now"; this one asks "is the binary on PATH". The green
   * tick in the row is driven by THIS, because the useful thing to know when
   * scanning the list is which languages are ready to use on this machine - a
   * server that is installed but idle is a different situation from one that
   * was never installed, and the old design showed both as the same grey.
   */
  const terpasang = (id: string) => probe[id]?.ok === true;

  /* Re-probing one row. `probeAll` is still the store's only probe entry point,
   * so a per-row button re-probes everything and then the row reads its own
   * value - the button does not invent a probe path the backend does not have.
   * The busy set exists only so the button can say it is working: a spinner on
   * a row that silently does nothing for a second reads as a dead button. */
  const [sedangPeriksa, setSedangPeriksa] = useState<string | null>(null);
  const periksaUlang = async (id: string) => {
    setSedangPeriksa(id);
    try {
      await probeAll();
    } finally {
      setSedangPeriksa(null);
    }
  };

  /* The row whose install dialog is open. `null` means no dialog. */
  const [dialogPasang, setDialogPasang] = useState<LspServerDef | null>(null);

  /*
   * Which servers this build can fetch by itself, and how.
   *
   * Asked of the backend (`lsp_jenis_resep`), not derived from a list here: the
   * question "can Zephyr install this one?" is answered by whether an installer
   * recipe exists, and the backend owns the recipes. `prasyarat` matters for the
   * `induk` strategy (gopls needs Go, solargraph needs Ruby, languageserver
   * needs R): the dialog shows HOW to get the toolchain instead of an install
   * button that would fail on spawn.
   */
  const [resepApp, setResepApp] = useState<LspJenisResep[]>([]);
  useEffect(() => {
    let hidup = true;
    void lspJenisResep()
      .then((r) => {
        if (hidup) setResepApp(Array.isArray(r) ? r : []);
      })
      .catch(() => {
        /* No recipes is the safe reading: every row falls back to showing the
         * command, so a broken backend cannot hide the manual path. */
        if (hidup) setResepApp([]);
      });
    return () => {
      hidup = false;
    };
  }, []);

  /* The recipe for one server, or undefined when this build has none. */
  const resepDari = (id: string) => resepApp.find((r) => r.id === id);

  /*
   * Install one server from inside the app, then re-probe so the row's tick
   * reflects what landed on disk rather than what we hoped for.
   *
   * The backend's report is handed back verbatim: on failure it carries npm's
   * exit code and its last lines of output, which is the difference between
   * "install failed" and knowing why.
   */
  const pasangLewatApp = async (def: LspServerDef): Promise<LaporanPasang> => {
    const hasil = await lspPasang(effectiveSpec(def, useLsp.getState().settings()));
    await probeAll();
    return hasil as LaporanPasang;
  };

  /*
   * Probe once when the page opens.
   *
   * Without this the list renders with no installed markers at all until
   * somebody clicks a re-check button, so the green ticks - the fastest way to
   * see which languages this machine can actually handle - only appear if you
   * already knew to ask for them. Probing is a PATH lookup per server and takes
   * a moment, which is exactly why it belongs on mount rather than on every
   * render.
   *
   * Guarded by "only if we have nothing yet": the store's probe map survives
   * navigation, so coming back to the page must not re-probe twenty servers and
   * flash the list back to blank. The dependency is a primitive boolean, not
   * the map object, so this cannot re-run when the store writes an equivalent
   * map - a new object identity every write would loop.
   */
  const sudahAdaProbe = Object.keys(probe).length > 0;
  useEffect(() => {
    if (sudahAdaProbe) return;
    void probeAll();
  }, [sudahAdaProbe, probeAll]);

  /*
   * Why an installed server still does not start.
   *
   * The probe only answers "is the binary there", and that question does NOT
   * require the workspace folder to be trusted - so a row can be green while
   * every start attempt is refused. That refusal used to reach the LSP output
   * log only, which is why "I installed it and it still does not work" was
   * impossible to diagnose from this page. Asked separately, and asked again
   * whenever the folder changes, because trust is per folder.
   */
  const root = useStore((s) => s.workspace);
  const [penghalang, setPenghalang] = useState<string | null>(null);
  useEffect(() => {
    let hidup = true;
    void lspPenghalang(root ?? undefined)
      .then((r) => {
        if (hidup) setPenghalang(r?.ok ? null : (r?.alasan ?? null));
      })
      .catch(() => {
        /* Non-Tauri or older backend: no extra reason to show. */
        if (hidup) setPenghalang(null);
      });
    return () => {
      hidup = false;
    };
  }, [root]);

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

      {/*
        With the master switch off, every per-server control is inert: the
        toggle above gates them, so a row that LOOKS clickable and silently
        does nothing is the same lie as a button that lies. The rows go
        visually dim and every control goes `disabled`, and this line says what
        to do about it - a user who cannot find the cause concludes the screen
        is broken, and they are right from what they can see.
      */}
      {!semua && (
        <div className="lsp-mati-nota" data-testid="lsp-mati-nota">
          {tr('IntelliSense is off. Turn it on above to change the servers below.')}
        </div>
      )}

      {/* A green row that never starts is the confusing case, so the reason is
          stated once above the list instead of being buried in a log. */}
      {semua && penghalang && (
        <div className="lsp-mati-nota" data-testid="lsp-penghalang">
          {tr('Servers can be found but not started')}: {penghalang}
        </div>
      )}

      {grup.map(([bahasa, daftar]) => (
        <div className={`lsp-grup${semua ? '' : ' is-mati'}`} key={bahasa} data-testid={`lsp-grup-${bahasa}`}>
          <div className="lsp-grup-head">
            <span className="lsp-grup-nama">{bahasa}</span>
            <span className="lsp-grup-jumlah">{daftar.length}</span>
          </div>

          {daftar.map((s) => {
            const st = statusServer(s.id);
            const kustom = !!ov[s.id]?.cmd;
            const exe = probe[s.id]?.exe ?? s.cmd[0];
            /* The language's own name, used for the installed marker. The
             * label carries a tool name in brackets - "JSON (vscode-json)" -
             * and the tick belongs next to the LANGUAGE, so the bracket part
             * would only get in the way. */
            const bahasa = s.label.split(' (')[0];
            const siap = terpasang(s.id);
            return (
              <div className="lsp-baris" key={s.id} data-testid={`lsp-${s.id}`}>
                <span className={`lsp-dot lsp-dot-${st}`} data-testid={`lsp-${s.id}-dot`} aria-hidden="true" />
                <div className="lsp-info">
                  <span className="lsp-nama">
                    {bahasa}
                    {/*
                     * The installed marker, and the reason it is a separate
                     * element from the status dot: the dot answers "running?",
                     * which is about this session. This answers "installed?",
                     * which is about the machine and stays true when the server
                     * is idle. One dot cannot say both, and the old design
                     * collapsed them into the same grey.
                     *
                     * Rendered only when true. The green dot is the exception,
                     * not the rule: on a machine with three of twenty servers
                     * installed, a column of eleven grey dots is noise that
                     * makes the three green ones harder to find.
                     */}
                    {siap && (
                      <span
                        className="lsp-siap"
                        data-testid={`lsp-${s.id}-siap`}
                        title={tr('Installed on this machine')}
                      >
                        {'\u2022'}
                      </span>
                    )}
                  </span>
                  <span className="lsp-meta">
                    {/*
                     * The full path when we have it, because the PATH lookup is
                     * the thing people actually need when two versions are
                     * installed and the wrong one keeps winning. The `title`
                     * carries the whole command with its flags, which are what
                     * make it long and are not what anyone is looking for.
                     */}
                    <code title={kustom ? s.cmd.join(' ') : probe[s.id]?.exe ?? s.cmd.join(' ')}>{exe}</code>
                    <span className={`lsp-status lsp-status-${st}`}>{labelStatus(st)}</span>
                    {kustom && <span className="lsp-kustom">{tr('custom')}</span>}
                  </span>
                  {/* The install hint appears only when the command was probed
                      AND NOT FOUND, and never for a custom command: telling
                      someone how to install a tool they replaced on purpose is
                      noise, and it would be wrong advice. */}
                  {/* The hint says what to run. The probe's own message says
                      WHERE Zephyr looked and missed - the second half is what
                      turns "install it and it still says not found" into
                      something the user can act on, so it rides along as the
                      tooltip on the same row rather than as a new sentence that
                      would need translating ten times. */}
                  {st === 'hilang' && !kustom && (
                    <span className="lsp-install" title={probe[s.id]?.error ?? undefined}>
                      {tr('Install')}: <code>{perintahPertama(s.install)}</code>
                    </span>
                  )}
                </div>

                {/*
                  Every control here is inert while the master switch is off,
                  so each one is really `disabled` rather than merely having no
                  effect. A control that accepts a click and then does nothing
                  reads as a broken screen; a disabled one reads as "not yet".
                  `disabled` also takes them out of the tab order, so keyboard
                  users are not walked through buttons that cannot act.
                */}
                <div className="lsp-aksi">
                  {st === 'hidup' && (
                    <button
                      className="btn btn-sm"
                      data-testid={`lsp-${s.id}-stop`}
                      disabled={!semua}
                      onClick={() => void stop(s.id)}
                    >
                      {tr('Stop server')}
                    </button>
                  )}
                  {/*
                   * The re-probe button is an icon, not the word "Re-check".
                   *
                   * The word was repeated on all twenty rows, and it is the
                   * widest thing in the row - twenty copies of the same six
                   * letters pushed every row's real content to the left and
                   * made the list read as a wall of buttons. An icon says the
                   * same thing once per row and leaves the width to the path,
                   * which is the part that actually differs between rows.
                   *
                   * The accessible name is kept in words via aria-label and
                   * title, so nothing is lost for a screen reader or a tooltip.
                   * `probeAll` is the store's only probe entry point, so this
                   * re-probes everything and the row reads its own value.
                   */}
                  <button
                    className={`lsp-ikon-btn${sedangPeriksa === s.id ? ' is-putar' : ''}`}
                    data-testid={`lsp-${s.id}-reload`}
                    disabled={!semua || sedangPeriksa !== null}
                    aria-label={tr('Re-check')}
                    title={tr('Re-check')}
                    onClick={() => void periksaUlang(s.id)}
                  >
                    {/* Two arrows chasing each other - the universal "refresh"
                        glyph, drawn here rather than pulled from a font so it
                        inherits the row's colour and size like every other
                        icon in the app. */}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                      <path d="M21 3v6h-6" />
                    </svg>
                  </button>
                  <Toggle
                    label={tr('Enabled')}
                    testid={`lsp-${s.id}-toggle`}
                    /*
                     * A checked switch must mean "this server can actually run".
                     *
                     * The old expression only looked at the saved override. A
                     * missing override defaults to enabled, so EVERY server was
                     * drawn checked - including ones whose binary was not on
                     * PATH. That made the list claim twenty active servers on a
                     * machine that only had six.
                     *
                     * Installed servers still respect an explicit user-off
                     * override. Missing servers stay unchecked; clicking one
                     * opens the install dialog above instead of presenting a
                     * state that cannot work.
                     */
                    checked={semua && siap && ov[s.id]?.enabled !== false}
                    disabled={!semua}
                    onChange={(v) => {
                      /*
                       * Switching a server ON that the machine cannot run opens
                       * the install dialog instead of silently flipping a
                       * switch that can never do anything. This is the whole
                       * point of the dialog: a toggle that succeeds while the
                       * feature stays dead is the failure mode where the user
                       * concludes the app is broken.
                       *
                       * Switching OFF, or switching on something installed,
                       * goes straight through - the dialog must not stand in
                       * the way of the normal case.
                       */
                      if (v && !siap && !kustom) {
                        setDialogPasang(s);
                        return;
                      }
                      ubah(s.id, { enabled: v });
                    }}
                  />
                </div>

                {kustom && (
                  <button
                    className="lsp-balik"
                    data-testid={`lsp-${s.id}-reset`}
                    disabled={!semua}
                    onClick={() => ubah(s.id, { cmd: null })}
                  >
                    {tr('Reset to the built-in command')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {dialogPasang && (
        <DialogPasang
          server={dialogPasang}
          tr={tr}
          sedang={sedangPeriksa !== null}
          kiniSiap={terpasang(dialogPasang.id)}
          resep={resepDari(dialogPasang.id)}
          onPasang={() => pasangLewatApp(dialogPasang)}
          onPeriksa={() => void periksaUlang(dialogPasang.id)}
          onTutup={() => setDialogPasang(null)}
        />
      )}

      {/*
        The compiler/DAP half of the same question, below the servers.
        "The Python server is green but my program will not run" is answered
        here rather than on a second page nobody would think to open: both
        halves are called IntelliSense by the person looking for them.
      */}
      <ToolchainPanel />
    </Section>
  );
}

/*
 * The "cannot run it yet" dialog.
 *
 * Shown when someone switches on a server whose binary is not on PATH. The
 * switch is NOT flipped in that case - the point is to say why it cannot work
 * yet and to give the exact command that fixes it, rather than accepting a
 * click that cannot lead anywhere.
 *
 * The copy button is the reason this is worth building at all: the install
 * line for a language server is long, easy to mistype, and different per
 * manager (`npm i -g`, `pip install`, `rustup component add`). Handing over the
 * exact text is the difference between "install it yourself" and a fix that
 * actually happens.
 */
/*
 * The one command worth showing inside a row.
 *
 * `install` is now a multi-step recipe (`#` notes, `>` commands). A row is one
 * line tall; dropping the whole recipe into it turned a five-line block into a
 * wall of text that pushed the actions off-screen. The row shows the FIRST
 * command - the one that actually installs something - and the dialog shows
 * the rest. A single-line hint with no `>` marker is returned unchanged, so an
 * older definition still renders.
 */
function perintahPertama(teks: string): string {
  for (const l of teks.split('\n')) {
    const t = l.trim();
    if (t.startsWith('>')) return t.slice(1).trim();
  }
  return teks.trim();
}

/*
 * The install instructions, one line at a time.
 *
 * `install` is written for two readers: `#` lines are the explanation and `>`
 * lines are commands. Printing it as one `<pre>` block made a five-line recipe
 * read as one long sentence, and the command - the only part anyone copies
 * twice - was buried in the middle of it.
 *
 * A command line is rendered in its own monospace row; an explanation is a
 * muted paragraph above it. Unknown lines fall through as text, so an older
 * single-line hint still renders exactly as it did.
 */
function InstruksiPasang({ teks }: { teks: string }) {
  const baris = teks.split('\n').filter((l) => l.trim() !== '');
  return (
    <div className="lsp-langkah" data-testid="lsp-dialog-langkah">
      {baris.map((l, i) => {
        const t = l.trim();
        if (t.startsWith('>')) {
          return (
            <code className="lsp-langkah-cmd" key={i}>
              {t.slice(1).trim()}
            </code>
          );
        }
        if (t.startsWith('#')) {
          return (
            <p className="lsp-langkah-note" key={i}>
              {t.slice(1).trim()}
            </p>
          );
        }
        return (
          <p className="lsp-langkah-note" key={i}>
            {t}
          </p>
        );
      })}
    </div>
  );
}

/*
 * What pressing "Install with Zephyr" will actually do, in one sentence.
 *
 * The old copy said "installs it with npm" for every row, which became a lie
 * the moment winget, toolchains and archives were added: a reader who pressed
 * it for C/C++ was told npm would handle it and then winget ran. Each strategy
 * says its own thing, including WHERE the result lands, because that is the
 * next question.
 */
function catatanCara(resep: LspJenisResep | undefined, tr: (s: string) => string): string {
  switch (resep?.jenis) {
    case 'npm':
      return tr("Zephyr installs it with npm into Zephyr's own folder. No PATH changes.");
    case 'winget':
      return tr(
        'Zephyr runs winget. The tool installs machine-wide and Zephyr looks for it in the WinGet folder afterwards - no restart needed.',
      );
    case 'induk':
      return tr(
        'Zephyr runs the toolchain\'s own install command. Depending on the toolchain this can take a minute; the log below shows what it said.',
      );
    case 'zip':
      return tr('Zephyr downloads the release archive and unpacks it into its own folder. No PATH changes.');
    default:
      return '';
  }
}

function DialogPasang({
  server,
  resep,
  onPeriksa,
  onPasang,
  onTutup,
  sedang,
  kiniSiap,
  tr,
}: {
  server: LspServerDef;
  resep: LspJenisResep | undefined;
  onPeriksa: () => void;
  onPasang: () => Promise<LaporanPasang>;
  onTutup: () => void;
  sedang: boolean;
  kiniSiap: boolean;
  tr: (s: string) => string;
}) {
  const [tersalin, setTersalin] = useState(false);
  const bisaPasang = !!resep;
  /* The toolchain this server is installed FROM (`go`, `gem`, `Rscript`), when
   * the recipe says one is needed. Shown above the button so the reader learns
   * the prerequisite before pressing it, not from the error afterwards. */
  const prasyarat = resep?.prasyarat ?? null;
  /* Where to read about the toolchain. The `cara` sentence already carries the
   * winget id and often a URL; this keeps a clickable page next to it so the
   * reader is not asked to retype a link out of a sentence. */
  const tautanInduk =
    prasyarat?.tool === 'go'
      ? { href: 'https://go.dev/dl/', label: 'go.dev/dl' }
      : prasyarat?.tool === 'gem'
        ? { href: 'https://rubyinstaller.org/downloads/', label: 'rubyinstaller.org' }
        : prasyarat?.tool === 'Rscript'
          ? { href: 'https://cloud.r-project.org/', label: 'cloud.r-project.org' }
          : null;

  /* The in-app install run: idle, working, or finished with the backend's own
   * report. Kept here because the overlay covers the row behind it - an outcome
   * shown only on the row would be invisible. */
  const [jalanPasang, setJalanPasang] = useState(false);
  const [laporan, setLaporan] = useState<LaporanPasang | null>(null);

  const pasangSekarang = async () => {
    setJalanPasang(true);
    setLaporan(null);
    try {
      setLaporan(await onPasang());
    } catch (e) {
      /* A rejected invoke still has to say something, and the text comes from
       * the backend ("npm is not installed", "no automatic install for ..."). */
      setLaporan({ ok: false, keluar: null, log: e instanceof Error ? e.message : String(e) });
    } finally {
      setJalanPasang(false);
    }
  };

  /* The dialog stays open after a successful re-check so the outcome is
   * visible; closing it on success would make the button look like it did
   * nothing. Only when the user is done do they close it. */
  const salin = async () => {
    try {
      /* The Tauri clipboard plugin, not `navigator.clipboard`: the latter
       * always fails in WebView2 when the document is not focused, which is
       * the normal state for a settings panel opened by the app itself. */
      const { clipboardWrite } = await import('../../lib/clipboard');
      await clipboardWrite(server.install);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 1600);
    } catch {
      /* Nothing to do: the command is on screen and selectable. A failed
       * clipboard is not worth an error dialog when the text is right there. */
    }
  };

  return (
    <div className="lsp-dialog-latar" data-testid="lsp-dialog-pasang" onClick={onTutup}>
      {/* Clicking the backdrop closes; clicking the panel must not. */}
      <div
        className="lsp-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={tr('Install the language server')}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="lsp-dialog-x" data-testid="lsp-dialog-tutup" aria-label={tr('Close')} onClick={onTutup}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <h3 className="lsp-dialog-judul">
          {tr('Install')} {server.label} {tr('language server')}
        </h3>
        <p className="lsp-dialog-teks">
          {tr('Zephyr could not find')} <code>{server.cmd[0]}</code> {tr('on your PATH. Install it, then check again to enable this server.')}
        </p>

        {bisaPasang && (
          <div className="lsp-dialog-pasang-blok">
            {prasyarat && (
              <div className="lsp-dialog-prasyarat" data-testid="lsp-dialog-prasyarat">
                <p className="lsp-dialog-catatan">
                  {tr('Needs this first')}: <code>{prasyarat.tool}</code>
                </p>
                <p className="lsp-langkah-note">{prasyarat.cara}</p>
                {tautanInduk && (
                  <a className="lsp-dialog-doc" href={tautanInduk.href} target="_blank" rel="noreferrer">
                    {tautanInduk.label}
                  </a>
                )}
              </div>
            )}
            <button
              className="btn"
              data-testid="lsp-dialog-install"
              disabled={jalanPasang || sedang}
              onClick={() => void pasangSekarang()}
            >
              {jalanPasang ? tr('Installing...') : tr('Install with Zephyr')}
            </button>
            <p className="lsp-dialog-catatan">{catatanCara(resep, tr)}</p>
          </div>
        )}

        <div className="lsp-dialog-perintah">
          <InstruksiPasang teks={server.install} />
          <button
            className="lsp-dialog-salin"
            data-testid="lsp-dialog-salin"
            aria-label={tr('Copy')}
            title={tr('Copy')}
            onClick={() => void salin()}
          >
            {tersalin ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            )}
          </button>
        </div>

        {!bisaPasang && (
          <p className="lsp-dialog-catatan" data-testid="lsp-dialog-manual">
            {tr('Zephyr cannot install this one automatically - run the command above yourself.')}
          </p>
        )}

        {/* The outcome of the last re-check, in words. The row behind this
            dialog also shows it, but the dialog covers the row. */}
        {kiniSiap && (
          <p className="lsp-dialog-ok" data-testid="lsp-dialog-ok">
            {tr('Found it. Switch this server on to use it.')}
          </p>
        )}

        {/* The outcome of an in-app install. On failure this carries npm's own
            words, so "it did not work" is never all the user gets. */}
        {laporan && (
          <div className="lsp-dialog-hasil" data-testid="lsp-dialog-hasil">
            <p
              className={laporan.ok ? 'lsp-dialog-ok' : 'lsp-dialog-gagal'}
              data-testid={laporan.ok ? 'lsp-dialog-pasang-ok' : 'lsp-dialog-pasang-gagal'}
            >
              {laporan.ok
                ? tr('Found it. Switch this server on to use it.')
                : `${tr('Install failed')}${
                    laporan.keluar === null || laporan.keluar === undefined
                      ? ''
                      : ` (npm exit ${laporan.keluar})`
                  }`}
            </p>
            {laporan.slot && (
              <p className="lsp-dialog-catatan" data-testid="lsp-dialog-slot">
                {laporan.slot}
              </p>
            )}
            {!laporan.ok && laporan.log ? (
              <pre className="lsp-dialog-log" data-testid="lsp-dialog-log">
                {laporan.log.slice(-1200)}
              </pre>
            ) : null}
          </div>
        )}

        <div className="lsp-dialog-aksi">
          <a
            className="lsp-dialog-doc"
            href="https://microsoft.github.io/language-server-protocol/implementors/servers/"
            target="_blank"
            rel="noreferrer"
          >
            {tr('Documentation')}
          </a>
          <span className="lsp-dialog-spacer" />
          <button className="btn" data-testid="lsp-dialog-periksa" disabled={sedang} onClick={onPeriksa}>
            {/* Same refresh glyph as the row button: one symbol for one idea. */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
            <span>{sedang ? tr('Checking...') : tr('Check again')}</span>
          </button>
          <button className="btn" data-testid="lsp-dialog-selesai" onClick={onTutup}>
            {tr('Done')}
          </button>
        </div>
      </div>
    </div>
  );
}
