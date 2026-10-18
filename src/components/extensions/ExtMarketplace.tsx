/*
 * Extensions → Marketplace: Plugins | Skills | MCP.
 *
 * WHY THIS FILE EXISTS SEPARATELY from `SectionsExtensions.tsx`:
 *
 * The previous attempt edited the Marketplace inside SETTINGS, which is not the
 * surface the reader opens. Extensions lives in the activity bar (Ctrl+Shift+X)
 * and is rendered by `ExtensionsView.tsx`. Editing the other one was a real
 * mistake - the reader opened Extensions, saw no change, and had no way to know
 * a different screen had been rebuilt. This component is mounted where the
 * reader actually is.
 *
 * The three tabs read three REAL sources:
 *   Plugins - `usePlugins` (bundled marketplace + what is installed)
 *   Skills  - `useSkills`  (the skill folders on disk)
 *   MCP     - `KATALOG_MCP_SERVER` + `useMcp.servers`
 *
 * and every Install button calls the store action that does the work. Nothing
 * here is a mock: if a button cannot install, it says so instead of pretending.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { usePlugins } from '../../lib/pluginsStore';
import { useSkills } from '../../lib/skillsStore';
import { useMcp } from '../../lib/mcpStore';
import {
  KATALOG_MCP_SERVER,
  bisaDipasang,
  type KatalogMcpEntry,
} from '../../lib/katalogMcpServer';
import { KATALOG_BUNDLED } from '../../lib/extCatalog';
import { useExt19 } from '../../lib/extensionsStore19';

type Tab = 'plugins' | 'skills' | 'mcp' | 'extensions';

const KATEGORI = [
  { id: 'semua', label: 'All' },
  { id: 'developer', label: 'Developer Tools', cocok: /code|git|test|lint|build|debug|refactor|review|commit/i },
  { id: 'research', label: 'Research & Analysis', cocok: /search|research|analy|read|explain|doc|wiki/i },
  { id: 'design', label: 'UI Design', cocok: /ui|design|css|style|component|layout|theme/i },
  { id: 'content', label: 'Content Creation', cocok: /writ|content|blog|copy|markdown|snippet/i },
  { id: 'produktivitas', label: 'Productivity', cocok: /workflow|plan|task|todo|automat|keymap|memory/i },
] as const;

export default function ExtMarketplace({
  slotEkstensi,
  tabAwal = 'plugins',
  tampilTab = true,
  hanya = null,
}: {
  slotEkstensi?: React.ReactNode;
  /** Which sub-tab opens first. The outer rail already chose a kind. */
  tabAwal?: Tab;
  /** Hide the inner tab row when the outer rail is the only navigator. */
  tampilTab?: boolean;
  /** Render ONLY this kind, with no inner navigation at all. */
  hanya?: Tab | null;
} = {}) {
  const tr = useT();
  /*
   * `hanya` is the OUTER choice, so it must win on every render, not just the
   * first one.
   *
   * `useState(hanya ?? tabAwal)` reads the prop once. When the outer rail moved
   * from Plugins to Skills, the component was re-rendered with a new `hanya`
   * while its internal `tab` still held the old value - so every kind tab
   * showed whatever the FIRST one had rendered. Deriving the shown tab from the
   * prop fixes that: with `hanya` set there is no internal state to drift.
   */
  const [tabDalam, setTab] = useState<Tab>(hanya ?? tabAwal);
  const tab = hanya ?? tabDalam;
  const [cari, setCari] = useState('');
  const [kategori, setKategori] = useState<string>('semua');
  const [manageBuka, setManageBuka] = useState(false);
  const [sibukMcp, setSibukMcp] = useState<string | null>(null);

  /* Plugins */
  const plugins = usePlugins((s) => s.daftar);
  const pasar = usePlugins((s) => s.pasar);
  const muatPlugin = usePlugins((s) => s.muat);
  const pasangBawaan = usePlugins((s) => s.pasangBawaan);
  const aktifkan = usePlugins((s) => s.aktifkan);
  const sibukPlugin = usePlugins((s) => s.sibuk !== null);

  /* Skills */
  const skills = useSkills((s) => s.daftar);
  const muatSkill = useSkills((s) => s.muat);
  const hapusSkill = useSkills((s) => s.hapus);

  /* MCP */
  const mcpTerpasang = useMcp((s) => s.servers);
  const saveServer = useMcp((s) => s.saveServer);
  const mcpError = useMcp((s) => s.mcpError);

  /* Extension packages (themes, keymaps, grammars) - what `installed` shows */
  const manifests = useExt19((s) => s.manifests);
  const remote = useExt19((s) => s.remote);
  const installExt = useExt19((s) => s.installKatalog);
  const uninstallExt = useExt19((s) => s.uninstall);

  /*
   * `terpasang` for extension packages comes from `manifests`, which is the
   * loader's own answer - not a local guess about what an install did.
   */
  const idExtTerpasang = useMemo(
    () => new Set((manifests ?? []).filter((m) => m.manifest).map((m) => m.manifest?.id ?? '')),
    [manifests],
  );

  useEffect(() => {
    void muatPlugin();
    void muatSkill();
    /*
     * `useMcp.init()` only refreshes status and CLI list, NOT `servers`. Without
     * this the MCP tab shows an installed server as not installed and offers an
     * Install button for something already in settings.json.
     */
    void useMcp.getState().refreshServers();
    /*
     * The Extensions tab lists the registry as well as the bundled catalogue.
     * `remote` is only filled by `muatRemote()`, which used to run only when the
     * store's OWN tab was 'marketplace' - so opening this panel directly showed
     * 21 bundled packages and nothing else. Loading it here is what makes the
     * list as long as the registry really is.
     */
    void useExt19.getState().muatRemote();
  }, [muatPlugin, muatSkill]);

  const cocok = (teks: string) => {
    if (cari.trim() && !teks.toLowerCase().includes(cari.trim().toLowerCase())) return false;
    const k = KATEGORI.find((x) => x.id === kategori);
    if (!k || !('cocok' in k) || !k.cocok) return true;
    return k.cocok.test(teks);
  };

  const kartuPlugin = useMemo(() => {
    const terpasang = new Set(plugins.map((p) => p.name));
    const pasarSaja = (pasar ?? [])
      .filter((p) => !terpasang.has(p.name))
      .map((p) => ({
        id: p.id || p.name,
        nama: p.name,
        ket: p.description ?? '',
        terpasang: false as const,
        aktif: false,
        bisaInstall: true,
      }));
    const lokal = plugins.map((p) => ({
      id: p.name,
      nama: p.name,
      ket: p.description ?? '',
      terpasang: true as const,
      aktif: p.enabled === true,
      bisaInstall: false,
    }));
    return [...lokal, ...pasarSaja].filter((k) => cocok(k.nama + ' ' + k.ket));
  }, [plugins, pasar, cari, kategori]);

  const kartuSkill = useMemo(
    () => skills.filter((s) => cocok(s.name + ' ' + s.description)),
    [skills, cari, kategori],
  );

  /*
   * MCP: the catalogue is the browsable list; `terpasang` comes from the stored
   * servers, matched by id (the same id the catalogue writes on install).
   */
  const idMcpTerpasang = useMemo(
    () => new Set((mcpTerpasang ?? []).map((s) => s.id)),
    [mcpTerpasang],
  );

  const kartuMcp = useMemo(
    () => KATALOG_MCP_SERVER.filter((m) => cocok(m.nama + ' ' + m.deskripsi)),
    [cari, kategori],
  );

  /*
   * Extension PACKAGES (themes, grammars, keymaps): the BUNDLED catalogue plus
   * whatever the remote registry served.
   *
   * The previous version read only `KATALOG_BUNDLED`, which is why the tab
   * looked short - 21 packages instead of the full registry. The store's
   * `hasil()` does this join, but calling it inside a selector returns a NEW
   * array every render and locks the WebView in a render loop, so the join is
   * done here over two STABLE reads (`remote` from the store, `KATALOG_BUNDLED`
   * a module constant).
   *
   * Remote entries win on id: a registry package may ship a newer version of
   * one Zephyr bundles, and showing both would offer two buttons for one thing.
   */
  const kartuExt = useMemo(() => {
    const dariRemote = (remote ?? []).filter((it) => !it.perluRuntime);
    const idRemote = new Set(dariRemote.map((x) => x.id));
    const dariBundel = KATALOG_BUNDLED.filter((it) => !idRemote.has(it.id));
    return [...dariRemote, ...dariBundel].filter((k) =>
      cocok(k.name + ' ' + k.description + ' ' + k.publisher),
    );
  }, [remote, cari, kategori]);

  const pasangMcp = async (e: KatalogMcpEntry) => {
    if (!bisaDipasang(e)) return;
    setSibukMcp(e.id);
    if (e.transport === 'stdio') {
      await saveServer({
        id: e.id,
        label: e.nama,
        url: '',
        token: '',
        command: e.command,
        args: e.args,
      });
    } else {
      await saveServer({ id: e.id, label: e.nama, url: e.url, token: '' });
    }
    setSibukMcp(null);
  };

  const jumlah =
    tab === 'plugins'
      ? kartuPlugin.length
      : tab === 'skills'
        ? kartuSkill.length
        : tab === 'mcp'
          ? kartuMcp.length
          : kartuExt.length;

  /*
   * What "Manage" shows: everything installed, across every kind, in one list.
   * That is the question the button answers - "what have I got?" - and it
   * cannot be answered from any single tab.
   */
  const terpasangSemua = useMemo(() => {
    const ext = (manifests ?? [])
      .filter((m) => m.manifest)
      .map((m) => ({
        jenis: 'Extension' as const,
        id: m.manifest?.id ?? m.path,
        nama: m.manifest?.name ?? m.path,
        ket: m.manifest?.description ?? '',
        aktif: m.enabled,
      }));
    return [
      ...plugins.map((p) => ({
        jenis: 'Plugin' as const,
        id: p.name,
        nama: p.name,
        ket: p.description ?? '',
        aktif: p.enabled === true,
      })),
      ...skills.map((s) => ({
        jenis: 'Skill' as const,
        id: s.name,
        nama: s.name,
        ket: s.description,
        aktif: true,
      })),
      ...(mcpTerpasang ?? []).map((s) => ({
        jenis: 'MCP' as const,
        id: s.id,
        nama: s.label,
        ket: s.command || s.url || '',
        aktif: true,
      })),
      ...ext,
    ];
  }, [plugins, skills, mcpTerpasang, manifests]);

  return (
    <div className="xmkt" data-testid="ext-marketplace">
      {/*
        * With `hanya` set, the outer rail already names the kind, so a second
        * title saying the same thing is noise. Manage stays: it answers a
        * question about the WHOLE install, which no single tab can.
        */}
      <header className="xmkt-head">
        <div>
          {!hanya && <h2 className="xmkt-judul">{tr('Marketplace')}</h2>}
          {!hanya && (
            <p className="xmkt-sub">
              {tr("Discover and install plugins, skills, and MCP servers to extend Zephyr's capabilities.")}
            </p>
          )}
        </div>
        <button
          type="button"
          className="xmkt-kelola"
          data-testid="xmkt-manage"
          onClick={() => setManageBuka(true)}
        >
          <AiIkon name="gear" size={12} />
          {tr('Manage')}
        </button>
      </header>

      {tampilTab && !hanya && (
        <div className="xmkt-bar">
          <div className="xmkt-tab" role="tablist">
            {(
              [
                ['plugins', 'Plugins'],
                ['skills', 'Skills'],
                ['mcp', 'MCP'],
                ...(slotEkstensi ? ([['extensions', 'Extensions']] as [Tab, string][]) : []),
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`xmkt-tab-btn${tab === id ? ' is-on' : ''}`}
                data-testid={`xmkt-tab-${id}`}
                onClick={() => setTab(id)}
              >
                {tr(label)}
              </button>
            ))}
          </div>
          <input
            className="xmkt-cari"
            data-testid="xmkt-cari"
            placeholder={tr('Search…')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>
      )}

      {(!tampilTab || hanya) && (
        <div className="xmkt-bar">
          <input
            className="xmkt-cari xmkt-cari-lebar"
            data-testid="xmkt-cari"
            placeholder={tr('Search…')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </div>
      )}

      {tab !== 'extensions' && (
        <div className="xmkt-chips" data-testid="xmkt-chips">
          {KATEGORI.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`xmkt-chip${kategori === k.id ? ' is-on' : ''}`}
              data-testid={`xmkt-chip-${k.id}`}
              onClick={() => setKategori(k.id)}
            >
              {tr(k.label)}
            </button>
          ))}
        </div>
      )}

      {mcpError && tab === 'mcp' && (
        <p className="xmkt-galat" data-testid="xmkt-mcp-err" role="alert">
          {mcpError}
        </p>
      )}

      {/*
        * Every kind renders in the SAME card grid, including Extensions.
        *
        * Extensions used to be handed in as a `slotEkstensi` from the caller,
        * which meant it kept the old tall `ExtensionCard` list and its own
        * detail pane - a different layout inside the same panel. The reference
        * keeps one card shape for all four kinds, so the reader learns the
        * layout once. The slot is still accepted for callers that want to
        * inject something custom, but this component now renders extensions
        * itself from `useExt19`.
        */}
      {jumlah === 0 ? (
        <div className="xmkt-kosong" data-testid="xmkt-kosong">
          <AiIkon name="puzzle" size={22} />
          <span>
            {cari.trim()
              ? tr('Nothing matches that search.')
              : tab === 'mcp'
                ? tr('No MCP servers in the catalogue.')
                : tab === 'extensions'
                  ? tr('No extension packages bundled.')
                  : tr('Nothing here yet.')}
          </span>
        </div>
      ) : (
        <div className="xmkt-grid" data-testid="xmkt-grid">
          {tab === 'plugins' &&
            kartuPlugin.map((k) => (
              <article className="xmkt-kartu" key={k.id} data-testid={`xmkt-kartu-${k.id}`}>
                <span className="xmkt-logo" aria-hidden="true">
                  {k.nama.slice(0, 2).toUpperCase()}
                </span>
                <div className="xmkt-info">
                  <span className="xmkt-nama">{k.nama}</span>
                  <span className="xmkt-ket">{k.ket}</span>
                </div>
                {k.terpasang ? (
                  <button
                    type="button"
                    className="xmkt-pasang is-terpasang"
                    data-testid={`xmkt-aktif-${k.id}`}
                    disabled={sibukPlugin}
                    onClick={() => void aktifkan(k.id, !k.aktif)}
                  >
                    {k.aktif ? tr('Disable') : tr('Enable')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="xmkt-pasang"
                    data-testid={`xmkt-install-${k.id}`}
                    disabled={sibukPlugin}
                    onClick={() => void pasangBawaan(k.id)}
                  >
                    + {tr('Install')}
                  </button>
                )}
              </article>
            ))}

          {tab === 'skills' &&
            kartuSkill.map((s) => (
              <article className="xmkt-kartu" key={s.name} data-testid={`xmkt-kartu-${s.name}`}>
                <span className="xmkt-logo" aria-hidden="true">
                  <AiIkon name="thought" size={14} />
                </span>
                <div className="xmkt-info">
                  <span className="xmkt-nama">{s.name}</span>
                  <span className="xmkt-ket">{s.description}</span>
                </div>
                <span className="xmkt-chip-kecil">{s.scope}</span>
                <button
                  type="button"
                  className="xmkt-pasang is-terpasang"
                  data-testid={`xmkt-skill-hapus-${s.name}`}
                  title={tr('Uninstall')}
                  onClick={() => void hapusSkill(s.name)}
                >
                  {tr('Remove')}
                </button>
              </article>
            ))}

          {tab === 'mcp' &&
            kartuMcp.map((m) => {
              const terpasang = idMcpTerpasang.has(m.id);
              const bisa = bisaDipasang(m);
              return (
                <article
                  className="xmkt-kartu"
                  key={m.id}
                  data-testid={`xmkt-kartu-${m.id}`}
                  title={m.deskripsi}
                >
                  <span className="xmkt-logo" aria-hidden="true">
                    <AiIkon name="terminal" size={14} />
                  </span>
                  <div className="xmkt-info">
                    <span className="xmkt-nama">{m.nama}</span>
                    <span className="xmkt-ket">{m.deskripsi}</span>
                  </div>
                  {terpasang ? (
                    <span className="xmkt-chip-kecil">{tr('Installed')}</span>
                  ) : (
                    <button
                      type="button"
                      className="xmkt-pasang"
                      data-testid={`xmkt-mcp-install-${m.id}`}
                      disabled={!bisa || sibukMcp === m.id}
                      title={bisa ? '' : tr('This server needs a transport this build does not run.')}
                      onClick={() => void pasangMcp(m)}
                    >
                      {sibukMcp === m.id ? tr('Installing…') : `+ ${tr('Install')}`}
                    </button>
                  )}
                </article>
              );
            })}

          {tab === 'extensions' &&
            kartuExt.map((k) => {
              const terpasang = idExtTerpasang.has(k.id);
              return (
                <article
                  className="xmkt-kartu"
                  key={k.id}
                  data-testid={`xmkt-kartu-${k.id}`}
                  title={k.description}
                >
                  <span className="xmkt-logo" aria-hidden="true">
                    {k.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="xmkt-info">
                    <span className="xmkt-nama">{k.name}</span>
                    <span className="xmkt-ket">{k.description}</span>
                  </div>
                  {terpasang ? (
                    <button
                      type="button"
                      className="xmkt-pasang is-terpasang"
                      data-testid={`xmkt-ext-hapus-${k.id}`}
                      onClick={() => void uninstallExt(k.id)}
                    >
                      {tr('Remove')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="xmkt-pasang"
                      data-testid={`xmkt-ext-install-${k.id}`}
                      onClick={() => void installExt(k)}
                    >
                      + {tr('Install')}
                    </button>
                  )}
                </article>
              );
            })}
        </div>
      )}

      {/* ── Manage: everything installed, in one list ─────────────────────── */}
      {manageBuka && (
        <div className="modal-backdrop" role="presentation" data-testid="xmkt-manage-modal">
          <div className="modal xmkt-manage" role="dialog" aria-modal="true" aria-label={tr('Installed')}>
            <h2 className="modal-title">{tr('Installed')}</h2>
            <p className="xmkt-sub" style={{ marginBottom: 12 }}>
              {tr(
                'Everything Zephyr currently has installed, across plugins, skills, MCP servers and extensions.',
              )}
            </p>
            {terpasangSemua.length === 0 ? (
              <p className="xmkt-kosong" data-testid="xmkt-manage-kosong">
                {tr('Nothing installed yet.')}
              </p>
            ) : (
              <ul className="xmkt-manage-list" data-testid="xmkt-manage-list">
                {terpasangSemua.map((t) => (
                  <li key={t.jenis + ':' + t.id}>
                    <span className="xmkt-manage-jenis">{t.jenis}</span>
                    <span className="xmkt-manage-teks">
                      <span className="xmkt-manage-nama">{t.nama}</span>
                      {t.ket && <span className="xmkt-manage-ket">{t.ket}</span>}
                    </span>
                    <span className={`xmkt-manage-status${t.aktif ? ' is-on' : ''}`}>
                      {t.aktif ? tr('Enabled') : tr('Disabled')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="modal-actions">
              <button className="btn" data-testid="xmkt-manage-tutup" onClick={() => setManageBuka(false)}>
                {tr('Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
