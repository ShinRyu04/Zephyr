import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import {
  RUNTIME_DAFTAR,
  SERVICE_DAFTAR,
  ringkasDevenv,
  useDevenv,
  type BarisRuntime,
  type BarisService,
} from '../../lib/devenvStore';
import type { DevenvServiceId, DevenvServer } from '../../lib/types';
import { BrandIkon, FolderLogo, CronLogo, TerminalLogo, ToolsLogo } from './BrandIkon';
import { useTerminal } from '../../lib/terminalStore';
import { usePorts } from '../../lib/portsStore';
import { usePanel } from '../../lib/panelStore';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import * as cmd from '../../lib/commands';

/** Green tick when the row is healthy, amber triangle when it needs a look. */
function IkonStatus({ oke }: { oke: boolean }) {
  return (
    <span className={`dv-status ${oke ? 'is-ok' : 'is-warn'}`} aria-hidden="true">
      {oke ? '✓' : '▲'}
    </span>
  );
}

/** The "..." popover for one row. Closes on pick, on outside click, or on Esc. */
function MenuBaris({
  buka,
  item,
  onTutup,
}: {
  buka: boolean;
  item: { label: string; run: () => void }[];
  onTutup: () => void;
}) {
  if (!buka) return null;
  return (
    <div className="dv-menu" role="menu" data-dv-menu-root>
      {item.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          className="dv-menu-item"
          onClick={() => {
            it.run();
            onTutup();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function DevEnvView() {
  const tr = useT();
  const setDomain = useDevenv((s) => s.setDomain);
  const setServer = useDevenv((s) => s.setServer);
  const setAutoStart = useDevenv((s) => s.setAutoStart);
  const services = useDevenv((s) => s.services);
  const startService = useDevenv((s) => s.startService);
  const stopService = useDevenv((s) => s.stopService);
  const pesan = useDevenv((s) => s.pesan);
  const projects = useDevenv((s) => s.projects);
  // A selector must return a primitive: `allPanes()` builds a new array on
  // every call, and zustand v5 compares with ===, so returning it here caused
  // "Maximum update depth exceeded". Count the panes instead, then read the
  // list once per render from the store's own snapshot.
  const jumlahPane = useTerminal((s) => s.terminalTabs.reduce((n, t) => n + t.panes.length, 0));
  const panes = useMemo(
    () => (jumlahPane > 0 ? useTerminal.getState().allPanes() : []),
    [jumlahPane],
  );
  // PaneMeta has no back-pointer to its tab, so resolve it from the tab list.
  const tabDariPane = (paneId: string) =>
    useTerminal.getState().terminalTabs.find((t) => t.panes.some((x) => x.id === paneId))?.id ?? '';
  const focusTerminal = useTerminal((s) => s.setActivePane);
  const ports = usePorts((s) => s.ports);
  const bukaUrl = useTerminal((s) => s.addPane);
  const muat = useDevenv((s) => s.muat);
  const refresh = useDevenv((s) => s.refresh);
  const memindai = useDevenv((s) => s.memindai);
  const startAll = useDevenv((s) => s.startAll);
  const stopAll = useDevenv((s) => s.stopAll);
  const buatProyek = useDevenv((s) => s.buatProyek);
  const bukaSettings = useDevenv((s) => s.bukaSettings);
  const registerShim = useDevenv((s) => s.registerShim);
  const openPath = useDevenv((s) => s.openPath);
  const bukaBaris = useDevenv((s) => s.bukaBaris);
  const pilihPathRuntime = useDevenv((s) => s.pilihPathRuntime);
  const setServiceVersi = useDevenv((s) => s.setServiceVersi);
  const setProjectVersi = useDevenv((s) => s.setProjectVersi);
  const setRuntimeVersi = useDevenv((s) => s.setRuntimeVersi);
  const runtimes = useDevenv((s) => s.runtimes);

  /*
   * Options for a project row's PHP/Node picker: the versions the runtime row
   * found, plus whatever the project is set to now (usually "global", which
   * means the machine default). Deduped so the current value never appears
   * twice, and "global" stays first because that is the default.
   */
  const versionOpsi = (id: 'php' | 'node', sekarang: string): string[] => {
    const r = runtimes.find((x) => x.id === id);
    const out: string[] = ['global'];
    for (const v of r?.daftarVersi ?? []) {
      if (!out.includes(v)) out.push(v);
    }
    if (sekarang && !out.includes(sekarang)) out.push(sekarang);
    return out;
  };

  // Detection is a spawn per runtime (3s+). The store caches by configuration,
  // so re-opening the panel is instant; a real re-scan only happens from the
  // Refresh buttons or after a config/service change.
  useEffect(() => {
    void muat();
  }, [muat]);

  const [cari, setCari] = useState('');
  const [namaProyekBaru, setNamaProyekBaru] = useState('');
  const [formProyekBaru, setFormProyekBaru] = useState(false);
  // The row whose "..." menu is open, or null. A single id (not a set) keeps at
  // most one menu on screen, so two popovers can never overlap.
  const [menuBaris, setMenuBaris] = useState<string | null>(null);

  // Clicking anywhere else closes the open row menu. Registered once and driven
  // by state, so no per-row listener is needed.
  useEffect(() => {
    if (!menuBaris) return;
    const tutup = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest?.('[data-dv-menu-root]')) return;
      setMenuBaris(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuBaris(null);
    };
    window.addEventListener('mousedown', tutup);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', tutup);
      window.removeEventListener('keydown', esc);
    };
  }, [menuBaris]);

  const salin = async (teks: string) => {
    try {
      await navigator.clipboard.writeText(teks);
      useStore.getState().setStatus(`Copied: ${teks}`);
    } catch {
      useStore.getState().setStatus('could not copy to the clipboard');
    }
    setMenuBaris(null);
  };

  const ringkas = ringkasDevenv();
  // The subtitle is "server · domain · folder", so read the pieces from the
  // settings rather than splitting the formatted string: a root folder can
  // contain the separator.
  const c = useDevenv((s) => s.cfg);
  const server = c.server === 'none' ? 'no server' : c.server;
  const domain = c.domain.startsWith('.') ? `*${c.domain}` : `.${c.domain}`;
  const rootFolder = c.rootFolder;

  const coreAda = useMemo(
    () => runtimes.filter((r) => r.inti && r.terpasang).length > 0,
    [runtimes],
  );

  const terpasang = runtimes.filter((r) => r.terpasang).length;
  const totalRuntime = runtimes.length;
  const semuaRuntime = terpasang === totalRuntime;

  const jalan = services.filter((s) => s.status === 'running').length;
  const ada = services.filter((s) => s.status !== 'not-installed').length;
  const semuaJalan = jalan > 0 && jalan === services.length;

  const proyekTersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.nama.toLowerCase().includes(q));
  }, [cari, projects]);

  return (
    <div className="dv" data-testid="dv-root">
      {/* ── header ── */}
      <header className="dv-head">
        <div className="dv-head-teks">
          <h1 className="dv-title">{tr('Dev Environment')}</h1>
          <p className="dv-sub" data-testid="dv-ringkas">
            {ringkas}
          </p>
        </div>
        <div className="dv-head-aksi">
          <button
            className="btn btn-sm"
            data-testid="dv-scan-again"
            onClick={() => refresh()}
            disabled={memindai}
          >
            {tr('Scan again')}
          </button>
          <button
            className="btn btn-sm"
            data-testid="dv-open-www"
            onClick={() => void openPath(`${rootFolder}\\www`)}
          >
            {tr('Open www')}
          </button>
          <button className="btn btn-sm" data-testid="dv-settings" onClick={() => bukaSettings()}>
            {tr('Settings')}
          </button>
        </div>
      </header>

      {/* ── 1. SETUP ── */}
      <section className="dv-seksi" data-testid="dv-setup">
        <h2 className="dv-seksi-judul">{tr('Setup')}</h2>

        <div className="dv-baris" data-testid="dv-row-root">
          <span className="dv-brand" aria-hidden="true">
            <FolderLogo />
          </span>
          <IkonStatus oke={true} />
          <div className="dv-baris-teks">
            <span className="dv-baris-judul">{tr('Root folder')}</span>
            <span className="dv-baris-ket">
              {tr('Where runtimes, projects, databases, certificates, and logs live.')}
            </span>
          </div>
          <div className="dv-baris-aksi">
            <code className="dv-chip" data-testid="dv-root-path">
              {rootFolder}
            </code>
            <button className="btn btn-sm" data-testid="dv-root-open" onClick={() => void cmd.revealPath(rootFolder).catch(() => {})}>
              {tr('Open')}
            </button>
            <button className="btn btn-sm" data-testid="dv-root-change" onClick={() => bukaSettings()}>
              {tr('Change')}
            </button>
          </div>
        </div>

        <div className="dv-baris" data-testid="dv-row-runtimes">
          <span className="dv-brand" aria-hidden="true">
            <ToolsLogo />
          </span>
          <IkonStatus oke={coreAda} />
          <div className="dv-baris-teks">
            <span className="dv-baris-judul">{tr('Runtimes & tools')}</span>
            <span className="dv-baris-ket" data-testid="dv-runtime-ringkas">
              {runtimes.filter((r) => r.terpasang).map((r) => `${r.label} ${r.versi}`).join(', ') ||
                tr('none')}
            </span>
          </div>
          <div className="dv-baris-aksi">
            <span className="dv-ringkas">{tr('Detected')}</span>
          </div>
        </div>

        <div className="dv-baris" data-testid="dv-row-path">
          <span className="dv-brand" aria-hidden="true">
            <TerminalLogo />
          </span>
          <IkonStatus oke={false} />
          <div className="dv-baris-teks">
            <span className="dv-baris-judul">{tr('Terminal PATH')}</span>
            <span className="dv-baris-ket">
              {tr('Commands typed in the terminal only resolve to this setup while its shim folder is on the user PATH.')}
            </span>
          </div>
          <div className="dv-baris-aksi">
            <code className="dv-chip" data-testid="dv-path-shim">
              {rootFolder}\bin
            </code>
            <button className="btn btn-sm" data-testid="dv-path-register" onClick={() => registerShim()}>
              {tr('Register')}
            </button>
          </div>
        </div>

        <div className="dv-pilih">
          <label className="dv-pilih-item">
            <span>{tr('Server')}</span>
            <select
              className="dv-select"
              data-testid="dv-server"
              value={server === 'no server' ? 'none' : server}
              onChange={(e) => setServer(e.target.value as DevenvServer)}
            >
              {(['nginx', 'apache', 'none'] as DevenvServer[]).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label className="dv-pilih-item">
            <span>{tr('Domain')}</span>
            <input
              className="dv-input"
              data-testid="dv-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </label>
        </div>
      </section>

      {/* ── 2. RUNTIMES ── */}
      <section className="dv-seksi" data-testid="dv-runtimes">
        <div className="dv-seksi-head">
          <h2 className="dv-seksi-judul">{tr('Runtimes')}</h2>
          <span className="dv-ringkas" data-testid="dv-runtime-status">
            {semuaRuntime
              ? tr('Everything available is installed')
              : tr('Some runtimes are not installed')}
          </span>
        </div>

        {RUNTIME_DAFTAR.map((info) => {
          const r: BarisRuntime | undefined = runtimes.find((x) => x.id === info.id);
          if (!r) return null;
          return (
            <div className="dv-baris" key={info.id} data-testid={`dv-rt-${info.id}`}>
              {/* The runtime's own mark, so the row is recognisable at a glance. */}
              <span className="dv-brand" aria-hidden="true">
                <BrandIkon id={info.id} />
              </span>
              <IkonStatus oke={r.terpasang} />
              <div className="dv-baris-teks">
                <span className="dv-baris-judul">{info.label}</span>
                <span className="dv-baris-ket">
                  {r.terpasang
                    ? `${r.daftarVersi.length} ${tr('installed')} · ${r.path}`
                    : tr('not installed')}
                </span>
              </div>
              <div className="dv-baris-aksi">
                {r.terpasang ? (
                  <>
                    <select
                      className="dv-select"
                      data-testid={`dv-rt-${info.id}-versi`}
                      defaultValue={r.daftarVersi.includes(r.versi) ? r.versi : r.daftarVersi[0] ?? r.versi}
                      onChange={(e) => setRuntimeVersi(info.id, e.target.value)}
                    >
                      {r.daftarVersi.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-sm"
                      data-testid={`dv-rt-${info.id}-aksi`}
                      onClick={() => void cmd.revealPath(r.path).catch(() => {})}
                      title={r.path}
                    >
                      {tr('Folder')}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-sm"
                    data-testid={`dv-rt-${info.id}-locate`}
                    onClick={() => void pilihPathRuntime(info.id)}
                  >
                    {tr('Locate…')}
                  </button>
                )}
                <div className="dv-aksi-rel" data-dv-menu-root>
                  <button
                    className="btn btn-sm"
                    data-testid={`dv-rt-${info.id}-more`}
                    aria-haspopup="menu"
                    aria-expanded={menuBaris === `rt-${info.id}`}
                    onClick={() =>
                      setMenuBaris((v) => (v === `rt-${info.id}` ? null : `rt-${info.id}`))
                    }
                  >
                    …
                  </button>
                  <MenuBaris
                    buka={menuBaris === `rt-${info.id}`}
                    onTutup={() => setMenuBaris(null)}
                    item={[
                      { label: tr('Open folder'), run: () => void bukaBaris(r.path) },
                      { label: tr('Copy path'), run: () => void salin(r.path) },
                      {
                        label: tr('Locate in Settings'),
                        run: () => {
                          useStore.getState().setSettingsOpen(true);
                          useStore.getState().setActivity('settings');
                          useSettingsUi.getState().setSection('devenv');
                        },
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── 3. SERVICES ── */}
      <section className="dv-seksi" data-testid="dv-services">
        <div className="dv-seksi-head">
          <h2 className="dv-seksi-judul">{tr('Services')}</h2>
          <div className="dv-seksi-aksi">
            <span className="dv-ringkas" data-testid="dv-service-status">
              {semuaJalan ? tr('All services running') : `${jalan}/${ada} ${tr('running')}`}
            </span>
            <button className="btn btn-sm" data-testid="dv-start-all" onClick={() => void startAll()} disabled={memindai}>
              {tr('Start all')}
            </button>
            <button className="btn btn-sm" data-testid="dv-stop-all" onClick={() => void stopAll()} disabled={memindai}>
              {tr('Stop all')}
            </button>
          </div>
        </div>

        {SERVICE_DAFTAR.map((info) => {
          const s: BarisService | undefined = services.find((x) => x.id === info.id);
          if (!s) return null;
          const hidup = s.status === 'running';
          return (
            <div className="dv-baris" key={info.id} data-testid={`dv-svc-${info.id}`}>
              <label className="dv-centang">
                <input
                  type="checkbox"
                  data-testid={`dv-svc-${info.id}-auto`}
                  // Was `checked`, which reverts visually until the round trip
                  // (setAutoStart -> applySettings -> disk -> getSettings) lands.
                  // On a slow settings write the box looks frozen. defaultValue
                  // keeps it uncontrolled: the click flips instantly and the
                  // store catches up. Keyed by the stored value so an external
                  // change still re-renders it.
                  defaultChecked={s.autoStart}
                  key={`${info.id}-${s.autoStart}`}
                  onChange={(e) => setAutoStart(info.id as DevenvServiceId, e.target.checked)}
                />
              </label>
              {/* The service's own mark: nginx, apache, mysql, redis, or a clock
                  for the job scheduler. */}
              <span className="dv-brand" aria-hidden="true">
                <BrandIkon id={info.id} />
              </span>
              <span
                className={`dv-lampu ${hidup ? 'is-on' : 'is-off'}`}
                title={hidup ? tr('running') : tr('stopped')}
                aria-hidden="true"
              />
              <div className="dv-baris-teks">
                <span className="dv-baris-judul">{info.label}</span>
                <span className="dv-baris-ket" data-testid={`dv-svc-${info.id}-status`}>
                  {s.id === 'cron'
                    ? `${s.jumlahJob ?? 0} ${tr('jobs')}`
                    : s.status === 'not-installed'
                      ? tr('not installed')
                      : hidup
                        ? `${s.versi} · ${s.port}`
                        : tr('stopped')}
                </span>
              </div>
              <div className="dv-baris-aksi">
                {s.status === 'not-installed' ? (
                  <button
                    className="btn btn-sm"
                    data-testid={`dv-svc-${info.id}-locate`}
                    onClick={() => void pilihPathRuntime(info.id as never)}
                  >
                    {tr('Locate…')}
                  </button>
                ) : (
                  <>
                    <select
                      className="dv-select"
                      data-testid={`dv-svc-${info.id}-versi`}
                      defaultValue={s.versi || '—'}
                      onChange={(e) => void setServiceVersi(s.id, e.target.value)}
                    >
                      {(s.versions && s.versions.length > 0 ? s.versions : [s.versi || '—']).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {s.port > 0 && <span className="dv-port">{s.port}</span>}
                    <button
                      className={`btn btn-sm ${hidup ? 'is-stop' : 'is-start'}`}
                      data-testid={`dv-svc-${info.id}-toggle`}
                      /*
                       * Enabled whenever the row can act. A service Zephyr did
                       * not start used to disable this, which left PostgreSQL
                       * (a Windows service, so never spawned here) with a dead
                       * Stop button. The Rust side now routes those rows
                       * through `sc`, and anything it genuinely must not touch
                       * comes back as a message instead of a silent no-op.
                       */
                      onClick={() => void (hidup ? stopService(s.id) : startService(s.id))}
                    >
                      {hidup ? tr('Stop') : tr('Start')}
                    </button>
                  </>
                )}
                <div className="dv-aksi-rel" data-dv-menu-root>
                  <button
                    className="btn btn-sm"
                    data-testid={`dv-svc-${info.id}-more`}
                    aria-haspopup="menu"
                    aria-expanded={menuBaris === `svc-${info.id}`}
                    onClick={() =>
                      setMenuBaris((v) => (v === `svc-${info.id}` ? null : `svc-${info.id}`))
                    }
                  >
                    …
                  </button>
                  <MenuBaris
                    buka={menuBaris === `svc-${info.id}`}
                    onTutup={() => setMenuBaris(null)}
                    item={[
                      {
                        label: hidup ? tr('Stop') : tr('Start'),
                        run: () => void (hidup ? stopService(s.id) : startService(s.id)),
                      },
                      { label: tr('Copy name'), run: () => void salin(s.label) },
                      {
                        label: tr('Open data folder'),
                        run: () => void bukaBaris(`${rootFolder}\\data`),
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── 5. TERMINALS ── read-only: the panes the terminal panel already
          manages, listed here so the whole environment is in one place. */}
      <section className="dv-seksi" data-testid="dv-terminals">
        <div className="dv-seksi-head">
          <h2 className="dv-seksi-judul">{tr('Terminals')}</h2>
          <span className="dv-ringkas" data-testid="dv-term-status">
            {panes.length} {tr('open')}
          </span>
        </div>
        {panes.length === 0 && <p className="dv-kosong">{tr('No terminals open')}</p>}
        {panes.map((p) => (
          <div className="dv-baris" key={p.id} data-testid={`dv-term-${p.id}`}>
            <span className="{`dv-lampu ${p.status === 'running' ? 'is-on' : 'is-off'}`}" aria-hidden="true" />
            <div className="dv-baris-teks">
              <span className="dv-baris-judul">{p.title || p.kind}</span>
              <span className="dv-baris-ket">{p.cwd || p.kind}</span>
            </div>
            <div className="dv-baris-aksi">
              {p.pid ? <span className="dv-port">pid {p.pid}</span> : null}
              <button
                className="btn btn-sm"
                data-testid={`dv-term-${p.id}-focus`}
                onClick={() => { usePanel.getState().focusTab('terminal'); focusTerminal(tabDariPane(p.id), p.id); }}
              >
                {tr('Focus')}
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* ── 6. PORTS ── read-only: what the system is actually listening on. */}
      <section className="dv-seksi" data-testid="dv-ports">
        <div className="dv-seksi-head">
          <h2 className="dv-seksi-judul">{tr('Ports')}</h2>
          <span className="dv-ringkas" data-testid="dv-ports-status">
            {ports.length} {tr('listening')}
          </span>
        </div>
        {ports.length === 0 && <p className="dv-kosong">{tr('Nothing is listening')}</p>}
        {ports.map((p) => (
          <div className="dv-baris" key={p.id} data-testid={`dv-port-${p.hostPort}`}>
            <span className="dv-brand" aria-hidden="true">
              <CronLogo />
            </span>
            <div className="dv-baris-teks">
              <span className="dv-baris-judul">{p.hostPort}</span>
              <span className="dv-baris-ket">
                {p.process} · {p.source}
              </span>
            </div>
            <div className="dv-baris-aksi">
              <span className="dv-chip">{p.protocol}</span>
              <button
                className="btn btn-sm"
                data-testid={`dv-port-${p.hostPort}-open`}
                onClick={() => void bukaUrl('browser', { url: `http://localhost:${p.hostPort}` })}
              >
                {tr('Open')}
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* ── 4. PROJECTS ── */}
      <section className="dv-seksi" data-testid="dv-projects">
        <div className="dv-seksi-head">
          <h2 className="dv-seksi-judul">{tr('Projects')}</h2>
          <div className="dv-seksi-aksi">
            <input
              className="dv-search"
              data-testid="dv-project-search"
              placeholder={tr('Search N projects').replace('N', String(projects.length))}
              value={cari}
              onChange={(e) => setCari(e.target.value)}
            />
            <button className="btn btn-sm" data-testid="dv-project-refresh" onClick={() => refresh()}>
              {tr('Refresh')}
            </button>
            <button
              className="btn btn-sm"
              data-testid="dv-project-new"
              onClick={() => setFormProyekBaru((v) => !v)}
            >
              + {tr('New project')}
            </button>
          </div>
        </div>

        {formProyekBaru && (
          <div className="dv-baris" data-testid="dv-project-new-form">
            <div className="dv-baris-teks">
              <span className="dv-baris-judul">{tr('New project name')}</span>
            </div>
            <div className="dv-baris-aksi">
              <input
                className="dv-input"
                data-testid="dv-project-new-name"
                placeholder="my-app"
                value={namaProyekBaru}
                onChange={(e) => setNamaProyekBaru(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && namaProyekBaru.trim()) {
                    void buatProyek(namaProyekBaru).then(() => {
                      setNamaProyekBaru('');
                      setFormProyekBaru(false);
                    });
                  }
                }}
              />
              <button
                className="btn btn-sm"
                data-testid="dv-project-new-create"
                disabled={!namaProyekBaru.trim()}
                onClick={() =>
                  void buatProyek(namaProyekBaru).then(() => {
                    setNamaProyekBaru('');
                    setFormProyekBaru(false);
                  })
                }
              >
                {tr('Create')}
              </button>
              <button
                className="btn btn-sm"
                data-testid="dv-project-new-cancel"
                onClick={() => {
                  setNamaProyekBaru('');
                  setFormProyekBaru(false);
                }}
              >
                {tr('Cancel')}
              </button>
            </div>
          </div>
        )}

        {proyekTersaring.length === 0 && <p className="dv-kosong">{tr('No projects found')}</p>}

        {proyekTersaring.map((p) => (
          <div className="dv-baris" key={p.path} data-testid={`dv-proj-${p.nama}`}>
            <span className="dv-brand" aria-hidden="true">
              <FolderLogo />
            </span>
            <div className="dv-baris-teks">
              <span className="dv-baris-judul">
                {p.nama}
                {p.composer && <span className="dv-tag">composer</span>}
                {p.package && <span className="dv-tag">npm</span>}
              </span>
            <span className="dv-baris-ket">
              {/* The Rust side already built the URL from the domain setting. */}
              {p.url || `https://${p.nama}${domain}`}
            </span>
            </div>
            <div className="dv-baris-aksi">
              <select
                className="dv-select"
                data-testid={`dv-proj-${p.nama}-php`}
                defaultValue={p.php}
                onChange={(e) => void setProjectVersi(p.nama, 'php', e.target.value)}
              >
                {versionOpsi('php', p.php).map((v) => (
                  <option key={v} value={v}>{`PHP: ${v}`}</option>
                ))}
              </select>
              <select
                className="dv-select"
                data-testid={`dv-proj-${p.nama}-node`}
                defaultValue={p.node}
                onChange={(e) => void setProjectVersi(p.nama, 'node', e.target.value)}
              >
                {versionOpsi('node', p.node).map((v) => (
                  <option key={v} value={v}>{`Node: ${v}`}</option>
                ))}
              </select>
              <button
                className="btn btn-sm"
                data-testid={`dv-proj-${p.nama}-open`}
                onClick={() => void bukaBaris(p.path)}
              >
                {tr('Open')}
              </button>
              <div className="dv-aksi-rel" data-dv-menu-root>
                <button
                  className="btn btn-sm"
                  data-testid={`dv-proj-${p.nama}-more`}
                  aria-haspopup="menu"
                  aria-expanded={menuBaris === `proj-${p.nama}`}
                  onClick={() =>
                    setMenuBaris((v) => (v === `proj-${p.nama}` ? null : `proj-${p.nama}`))
                  }
                >
                  …
                </button>
                <MenuBaris
                  buka={menuBaris === `proj-${p.nama}`}
                  onTutup={() => setMenuBaris(null)}
                  item={[
                    { label: tr('Open folder'), run: () => void bukaBaris(p.path) },
                    { label: tr('Copy path'), run: () => void salin(p.path) },
                    {
                      label: tr('Open in browser'),
                      run: () => {
                        const url = p.url || `https://${p.nama}${domain}`;
                        void bukaUrl('browser', { url });
                      },
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Anything a start/stop attempt refused to do, stated plainly. */}
      {pesan && (
        <p className="dv-kosong" data-testid="dv-pesan" role="status">
          {pesan}
        </p>
      )}
    </div>
  );
}
