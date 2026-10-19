/*
 * Extensions → Plugins | Skills | MCP | Extensions, one card layout for all.
 *
 * WHY THIS FILE EXISTS SEPARATELY from `SectionsExtensions.tsx`: the previous
 * attempt edited the Marketplace inside SETTINGS, which is not the surface the
 * reader opens. Extensions lives in the activity bar (Ctrl+Shift+X) and is
 * rendered by `ExtensionsView.tsx`. Editing the other one was a real mistake —
 * the reader opened Extensions, saw no change, and had no way to know a
 * different screen had been rebuilt.
 *
 * FILTERING, and why it was rebuilt:
 *
 * The first version had six hard-coded regex chips over name+description. They
 * read as broken: "test-first" matched `developer`, "Paper Theme" matched
 * `design`, and most chips emptied the grid entirely. The chips are now DERIVED
 * from the categories the data already carries (`category` on a plugin,
 * `categories[]` on a package, `kategori` on an MCP entry), so every chip the
 * reader can click returns rows. A filter that can produce an empty list from
 * every option is worse than no filter.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { usePlugins } from '../../lib/pluginsStore';
import { useSkills } from '../../lib/skillsStore';
import { useMcp } from '../../lib/mcpStore';
import { KATALOG_MCP_SERVER, bisaDipasang, type KatalogMcpEntry } from '../../lib/katalogMcpServer';
import { KATALOG_BUNDLED } from '../../lib/extCatalog';
import { useExt19 } from '../../lib/extensionsStore19';
import IkonExt from './IkonExt';

type Tab = 'plugins' | 'skills' | 'mcp' | 'extensions';

const SEMUA = '__semua';

/** One clickable card, normalised across the four kinds. */
interface Kartu {
  id: string;
  nama: string;
  ket: string;
  /** Category values this card belongs to; the chips are built from these. */
  kategori: string[];
  terpasang: boolean;
  aktif?: boolean;
  scope?: string;
  catatan?: string;
  /** Only for extension packages: their real artwork. */
  paket?: (typeof KATALOG_BUNDLED)[number];
}

export default function ExtMarketplace({
  tabAwal = 'plugins',
  tampilTab = true,
  hanya = null,
}: {
  /** Which sub-tab opens first. The outer rail already chose a kind. */
  tabAwal?: Tab;
  /** Hide the inner tab row when the outer rail is the only navigator. */
  tampilTab?: boolean;
  /** Render ONLY this kind, with no inner navigation at all. */
  hanya?: Tab | null;
} = {}) {
  const tr = useT();
  /*
   * `hanya` is the OUTER choice, so it wins on every render, not just the first.
   * `useState(hanya ?? tabAwal)` reads the prop once; when the outer rail moved
   * from Plugins to Skills the component re-rendered with a new `hanya` while its
   * internal tab still held the old value — so every kind tab showed whatever
   * the FIRST one had rendered.
   */
  const [tabDalam, setTab] = useState<Tab>(tabAwal);
  const tab = hanya ?? tabDalam;

  const [cari, setCari] = useState('');
  const [kategori, setKategori] = useState<string>(SEMUA);
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

  /* Extension packages */
  const manifests = useExt19((s) => s.manifests);
  const remote = useExt19((s) => s.remote);
  const installExt = useExt19((s) => s.installKatalog);
  const uninstallExt = useExt19((s) => s.uninstall);

  useEffect(() => {
    void muatPlugin();
    void muatSkill();
    void useMcp.getState().refreshServers();
    void useExt19.getState().muatRemote();
  }, [muatPlugin, muatSkill]);

  /* ── Build the cards, one kind at a time ──────────────────────────────── */

  const kartu = useMemo<Kartu[]>(() => {
    if (tab === 'plugins') {
      const terpasang = new Set(plugins.map((p) => p.name));
      /*
       * `InstalledPlugin` carries no category — only `MarketPlugin` does. An
       * installed plugin is joined back to its marketplace entry by NAME, which
       * is the same key `pasangBawaan` uses. Falling back to 'Installed' keeps
       * a hand-installed package from disappearing behind a chip that cannot
       * name it.
       */
      const kategoriPasar = new Map((pasar ?? []).map((p) => [p.name, p.category || 'Installed']));
      const lokal: Kartu[] = plugins.map((p) => ({
        id: p.name,
        nama: p.name,
        ket: p.description ?? '',
        kategori: [kategoriPasar.get(p.name) ?? 'Installed'],
        terpasang: true,
        aktif: p.enabled === true,
      }));
      const pasarSaja: Kartu[] = (pasar ?? [])
        .filter((p) => !terpasang.has(p.name))
        .map((p) => ({
          id: p.id || p.name,
          nama: p.name,
          ket: p.description ?? '',
          kategori: [p.category || 'Other'],
          terpasang: false,
        }));
      return [...lokal, ...pasarSaja];
    }

    if (tab === 'skills') {
      /* Skills have no category field; scope is the real grouping. */
      return skills.map((s) => ({
        id: s.name,
        nama: s.name,
        ket: s.description,
        kategori: [s.scope === 'workspace' ? 'Workspace' : 'User'],
        terpasang: true,
        scope: s.scope,
      }));
    }

    if (tab === 'mcp') {
      const idTerpasang = new Set((mcpTerpasang ?? []).map((s) => s.id));
      return KATALOG_MCP_SERVER.map((m) => ({
        id: m.id,
        nama: m.nama,
        ket: m.deskripsi,
        kategori: [m.kategori || 'Other'],
        terpasang: idTerpasang.has(m.id),
      }));
    }

    /*
     * Extensions: the BUNDLED catalogue joined with the registry. Remote wins on
     * id — a registry package may ship a newer version of one Zephyr bundles, and
     * showing both would offer two buttons for one thing.
     */
    const idTerpasang = new Set(
      (manifests ?? []).filter((m) => m.manifest).map((m) => m.manifest?.id ?? ''),
    );
    const dariRemote = (remote ?? []).filter((it) => !it.perluRuntime);
    const idRemote = new Set(dariRemote.map((x) => x.id));
    const dariBundel = KATALOG_BUNDLED.filter((it) => !idRemote.has(it.id));
    return [...dariRemote, ...dariBundel].map((k) => ({
      id: k.id,
      nama: k.name,
      ket: k.description,
      kategori: k.categories?.length ? k.categories : ['Other'],
      terpasang: idTerpasang.has(k.id),
      paket: k,
    }));
  }, [tab, plugins, pasar, skills, mcpTerpasang, manifests, remote]);

  /* ── Filter ───────────────────────────────────────────────────────────── */

  const chips = useMemo(() => {
    const semua = kartu.flatMap((k) => k.kategori);
    const unik = [...new Set(semua.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return [{ id: SEMUA, label: 'All' }, ...unik.map((k) => ({ id: k, label: k }))];
  }, [kartu]);

  /* A chip that no longer exists in this tab must not keep filtering. */
  useEffect(() => {
    if (kategori !== SEMUA && !chips.some((c) => c.id === kategori)) setKategori(SEMUA);
  }, [chips, kategori]);

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return kartu.filter((k) => {
      if (kategori !== SEMUA && !k.kategori.includes(kategori)) return false;
      if (!q) return true;
      return (k.nama + ' ' + k.ket).toLowerCase().includes(q);
    });
  }, [kartu, cari, kategori]);

  /* ── Actions ──────────────────────────────────────────────────────────── */

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

  /*
   * Everything installed, in one list. That is the question the Manage button
   * answers — "what have I got?" — and no single tab can answer it.
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

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div className="xmkt" data-testid="ext-marketplace">
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
                ['extensions', 'Extensions'],
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
        </div>
      )}

      <div className="xmkt-bar">
        <input
          className="xmkt-cari xmkt-cari-lebar"
          data-testid="xmkt-cari"
          placeholder={tr('Search…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>

      {/*
        * The chips come from the data. Every one of them returns rows, which is
        * the whole point — a filter whose every option can produce an empty grid
        * is indistinguishable from a broken one.
        */}
      <div className="xmkt-chips" data-testid="xmkt-chips">
        {chips.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`xmkt-chip${kategori === k.id ? ' is-on' : ''}`}
            data-testid={`xmkt-chip-${k.id}`}
            onClick={() => setKategori(k.id)}
          >
            {k.id === SEMUA ? tr('All') : k.label}
          </button>
        ))}
      </div>

      {mcpError && tab === 'mcp' && (
        <p className="xmkt-galat" data-testid="xmkt-mcp-err" role="alert">
          {mcpError}
        </p>
      )}

      {tampil.length === 0 ? (
        <div className="xmkt-kosong" data-testid="xmkt-kosong">
          <AiIkon name="puzzle" size={22} />
          <span>
            {cari.trim() || kategori !== SEMUA
              ? tr('Nothing matches that filter.')
              : tab === 'mcp'
                ? tr('No MCP servers in the catalogue.')
                : tab === 'extensions'
                  ? tr('No extension packages found.')
                  : tr('Nothing here yet.')}
          </span>
        </div>
      ) : (
        <div className="xmkt-grid" data-testid="xmkt-grid">
          {tampil.map((k) => (
            <article className="xmkt-kartu" key={k.id} data-testid={`xmkt-kartu-${k.id}`} title={k.ket}>
              <span className="xmkt-logo xmkt-logo-ext" aria-hidden="true">
                {tab === 'extensions' && k.paket ? (
                  /*
                   * The package's REAL artwork. `IkonExt` is the same component
                   * the Installed list uses, so a theme shows its own mark here
                   * too — drawing two letters instead made the marketplace look
                   * like a different product from the list it views.
                   */
                  <IkonExt item={k.paket} logoUrl={k.paket.logoUrl} />
                ) : tab === 'skills' ? (
                  <AiIkon name="thought" size={14} />
                ) : tab === 'mcp' ? (
                  <AiIkon name="terminal" size={14} />
                ) : (
                  k.nama.slice(0, 2).toUpperCase()
                )}
              </span>

              <div className="xmkt-info">
                <span className="xmkt-nama">{k.nama}</span>
                <span className="xmkt-ket">{k.ket}</span>
              </div>

              {tab === 'plugins' &&
                (k.terpasang ? (
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
                ))}

              {tab === 'skills' && (
                <button
                  type="button"
                  className="xmkt-pasang is-terpasang"
                  data-testid={`xmkt-skill-hapus-${k.id}`}
                  title={tr('Uninstall')}
                  onClick={() => void hapusSkill(k.id)}
                >
                  {tr('Remove')}
                </button>
              )}

              {tab === 'mcp' &&
                (k.terpasang ? (
                  <span className="xmkt-chip-kecil">{tr('Installed')}</span>
                ) : (
                  <button
                    type="button"
                    className="xmkt-pasang"
                    data-testid={`xmkt-mcp-install-${k.id}`}
                    disabled={sibukMcp === k.id}
                    onClick={() => {
                      const e = KATALOG_MCP_SERVER.find((x) => x.id === k.id);
                      if (e) void pasangMcp(e);
                    }}
                  >
                    {sibukMcp === k.id ? tr('Installing…') : `+ ${tr('Install')}`}
                  </button>
                ))}

              {tab === 'extensions' &&
                (k.terpasang ? (
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
                    onClick={() => {
                      if (k.paket) void installExt(k.paket);
                    }}
                  >
                    + {tr('Install')}
                  </button>
                ))}
            </article>
          ))}
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
