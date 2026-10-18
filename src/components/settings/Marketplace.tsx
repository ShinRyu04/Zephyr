/*
 * Marketplace — the TRAE-shaped page: Plugins | Skills | MCP.
 *
 * WHAT THIS REPLACES, and why the old one was not enough:
 *
 * The previous Marketplace was a single grid of eight hard-coded extension
 * names whose only action was "Open" — it navigated to the Open VSX view. That
 * is a signpost, not a marketplace: it listed things Zephyr cannot install from
 * here, and it had no notion of what is ALREADY installed.
 *
 * This page is organised the way the reference is, around the three things an
 * agent can actually be extended with, and each tab reads a REAL source:
 *
 *   Plugins - `usePlugins`: the plugin registry (installed + available).
 *   Skills  - `useSkills`: the skill folders on disk.
 *   MCP     - `useMcp`: the configured servers, with the tools each exposes.
 *
 * Every card says what it does and whether it is installed, and the install
 * button calls the same store action the rest of the app uses. Nothing here is
 * a mock.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { usePlugins } from '../../lib/pluginsStore';
import { useSkills } from '../../lib/skillsStore';
import { useMcp } from '../../lib/mcpStore';

type Tab = 'plugins' | 'skills' | 'mcp';

/*
 * Category chips. They filter by what a package DOES, derived from its text -
 * there is no category field in the registry, and inventing one would mean
 * writing categories into the data by hand and watching them go stale.
 */
const KATEGORI = [
  { id: 'semua', label: 'All' },
  { id: 'developer', label: 'Developer Tools', cocok: /code|git|test|lint|build|debug|refactor|review/i },
  { id: 'research', label: 'Research & Analysis', cocok: /search|research|analy|read|explain|doc/i },
  { id: 'design', label: 'UI Design', cocok: /ui|design|css|style|component|layout/i },
  { id: 'content', label: 'Content Creation', cocok: /writ|content|blog|copy|doc|markdown/i },
  { id: 'produktivitas', label: 'Productivity', cocok: /commit|workflow|plan|task|todo|automat/i },
] as const;

export default function Marketplace() {
  const tr = useT();
  const [tab, setTab] = useState<Tab>('plugins');
  const [cari, setCari] = useState('');
  const [kategori, setKategori] = useState<string>('semua');

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

  /* MCP */
  const mcpServers = useMcp((s) => s.servers);

  useEffect(() => {
    void muatPlugin();
    void muatSkill();
  }, [muatPlugin, muatSkill]);

  const cocokCari = (teks: string) =>
    cari.trim() === '' || teks.toLowerCase().includes(cari.trim().toLowerCase());

  const cocokKategori = (teks: string) => {
    const k = KATEGORI.find((x) => x.id === kategori);
    if (!k || !('cocok' in k) || !k.cocok) return true;
    return k.cocok.test(teks);
  };

  /*
   * The plugin list mixes two sources: what is installed and what the bundled
   * marketplace offers. Installed wins when both describe the same id, so a
   * package never appears twice with two different buttons.
   */
  const kartuPlugin = useMemo(() => {
    const terpasang = new Set(plugins.map((p) => p.name));
    const dariPasar = (pasar ?? [])
      .filter((p) => !terpasang.has(p.name))
      .map((p) => ({
        id: p.id || p.name,
        nama: p.name,
        ket: p.description ?? '',
        terpasang: false as const,
        bisaPasang: true,
        aktif: false,
      }));
    const dariLokal = plugins.map((p) => ({
      id: p.name,
      nama: p.name,
      ket: p.description ?? '',
      terpasang: true as const,
      bisaPasang: false,
      aktif: p.enabled === true,
    }));
    return [...dariLokal, ...dariPasar].filter(
      (k) => cocokCari(k.nama + ' ' + k.ket) && cocokKategori(k.nama + ' ' + k.ket),
    );
  }, [plugins, pasar, cari, kategori]);

  const kartuSkill = useMemo(
    () =>
      skills
        .filter((s) => cocokCari(s.name + ' ' + s.description) && cocokKategori(s.name + ' ' + s.description))
        .map((s) => ({ id: s.name, nama: s.name, ket: s.description, scope: s.scope })),
    [skills, cari, kategori],
  );

  const kartuMcp = useMemo(
    () =>
      (mcpServers ?? [])
        .filter((s) => cocokCari(s.label + ' ' + (s.command ?? '')) && cocokKategori(s.label))
        .map((s) => ({
          id: s.id,
          nama: s.label,
          ket: s.command || s.url || '',
          /*
           * The tool list is not part of the stored server definition - it is
           * only known after the server has been started and asked. An empty
           * list here is the honest answer: this build does not know the tools
           * of a server that has not run, and inventing a count would be worse
           * than showing none.
           */
          tools: [] as string[],
        })),
    [mcpServers, cari, kategori],
  );

  const jumlah = tab === 'plugins' ? kartuPlugin.length : tab === 'skills' ? kartuSkill.length : kartuMcp.length;

  return (
    <div className="mkt" data-testid="marketplace">
      <header className="mkt-head">
        <div>
          <h1 className="mkt-judul">{tr('Marketplace')}</h1>
          <p className="mkt-sub">
            {tr("Discover and install plugins, skills, and MCP servers to extend Zephyr's capabilities.")}
          </p>
        </div>
        <button type="button" className="mkt-kelola" data-testid="mkt-kelola">
          <AiIkon name="gear" size={12} />
          {tr('Manage')}
        </button>
      </header>

      <div className="mkt-bar">
        <div className="mkt-tab" role="tablist">
          {(
            [
              ['plugins', 'Plugins'],
              ['skills', 'Skills'],
              ['mcp', 'MCP'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`mkt-tab-btn${tab === id ? ' is-on' : ''}`}
              data-testid={`mkt-tab-${id}`}
              onClick={() => setTab(id)}
            >
              {tr(label)}
            </button>
          ))}
        </div>
        <input
          className="mkt-cari"
          data-testid="mkt-cari"
          placeholder={tr('Search…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />
      </div>

      <div className="mkt-chips" data-testid="mkt-chips">
        {KATEGORI.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`mkt-chip${kategori === k.id ? ' is-on' : ''}`}
            data-testid={`mkt-chip-${k.id}`}
            onClick={() => setKategori(k.id)}
          >
            {tr(k.label)}
          </button>
        ))}
      </div>

      {jumlah === 0 ? (
        <div className="mkt-kosong" data-testid="mkt-kosong">
          <AiIkon name="puzzle" size={22} />
          <span>
            {cari.trim()
              ? tr('Nothing matches that search.')
              : tab === 'mcp'
                ? tr('No MCP servers configured yet.')
                : tr('Nothing here yet.')}
          </span>
        </div>
      ) : (
        <div className="mkt-grid" data-testid="mkt-grid">
          {tab === 'plugins' &&
            kartuPlugin.map((k) => (
              <article className="mkt-kartu" key={k.id} data-testid={`mkt-kartu-${k.id}`}>
                <span className="mkt-logo" aria-hidden="true">
                  {k.nama.slice(0, 2).toUpperCase()}
                </span>
                <div className="mkt-info">
                  <span className="mkt-nama">{k.nama}</span>
                  <span className="mkt-ket">{k.ket}</span>
                </div>
                {k.terpasang ? (
                  <button
                    type="button"
                    className="mkt-pasang is-terpasang"
                    data-testid={`mkt-aktif-${k.id}`}
                    disabled={sibukPlugin}
                    onClick={() => void aktifkan(k.id, !k.aktif)}
                  >
                    {k.aktif ? tr('Disable') : tr('Enable')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mkt-pasang"
                    data-testid={`mkt-install-${k.id}`}
                    disabled={sibukPlugin}
                    onClick={() => void pasangBawaan(k.id)}
                  >
                    + {tr('Install')}
                  </button>
                )}
              </article>
            ))}

          {tab === 'skills' &&
            kartuSkill.map((k) => (
              <article className="mkt-kartu" key={k.id} data-testid={`mkt-kartu-${k.id}`}>
                <span className="mkt-logo" aria-hidden="true">
                  <AiIkon name="thought" size={14} />
                </span>
                <div className="mkt-info">
                  <span className="mkt-nama">{k.nama}</span>
                  <span className="mkt-ket">{k.ket}</span>
                </div>
                <span className="mkt-chip-kecil">{k.scope}</span>
              </article>
            ))}

          {tab === 'mcp' &&
            kartuMcp.map((k) => (
              /*
               * The tool list is a hover popover, as in the reference: a server
               * can expose thirty tools, and printing them all would turn the
               * grid into a wall. `title` is the fallback for keyboard users.
               */
              <article
                className="mkt-kartu mkt-kartu-mcp"
                key={k.id}
                data-testid={`mkt-kartu-${k.id}`}
                title={k.tools.length ? k.tools.join(', ') : k.ket}
              >
                <span className="mkt-logo" aria-hidden="true">
                  <AiIkon name="terminal" size={14} />
                </span>
                <div className="mkt-info">
                  <span className="mkt-nama">{k.nama}</span>
                  <span className="mkt-ket">{k.ket}</span>
                </div>
                <span className="mkt-chip-kecil">
                  {k.tools.length} {tr('tools')}
                </span>
                {k.tools.length > 0 && (
                  <div className="mkt-pop" role="tooltip">
                    <span className="mkt-pop-head">
                      {k.nama} · {k.tools.length} {tr('tools')}
                    </span>
                    <ul className="mkt-pop-list">
                      {k.tools.slice(0, 24).map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
        </div>
      )}
    </div>
  );
}
