/*
 * Manage — "what have I actually got installed?" for the Marketplace.
 *
 * This is the page behind `Manage` in the Agents window. It is a PAGE, not the
 * modal the main window uses, because the Agents canvas has the room and the
 * modal was a read-only list: the reference shows one tab per kind of thing,
 * with the switch that turns it off right there on the row.
 *
 * Every row is backed by the store that owns it, and every control is the same
 * action the Marketplace itself calls:
 *
 *   Plugins     usePlugins.daftar      -> aktifkan(name, on)
 *   Extensions  useExt19.manifests     -> setEnabled(id, on)
 *   Skills      useSkills.daftar       -> hapus(name)
 *   MCP         useMcp.servers         -> removeServer(id)
 *
 * Skills and MCP servers have NO enabled flag anywhere in Zephyr — a skill is
 * on disk and therefore in the prompt, an MCP server is configured and
 * therefore connectable. Inventing a switch for them would put a control on
 * screen that claims to do something nothing reads, so those two rows carry
 * their real state ("On disk" / "Configured") and the remove action that does
 * exist. Plugins and extensions do have a real on/off, and get the switch.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { IkonPasar } from './IkonPasar';
import { usePlugins } from '../../lib/pluginsStore';
import { useSkills } from '../../lib/skillsStore';
import { useMcp } from '../../lib/mcpStore';
import { useExt19 } from '../../lib/extensionsStore19';

type Tab = 'plugins' | 'skills' | 'mcp' | 'extensions';

/** Urutan tab mengikuti Marketplace; `extensions` menggantikan App Authorization,
 *  yang tidak ada di Zephyr — daftar lain yang tidak punya datanya akan kosong
 *  selamanya dan hanya menambah tab untuk dilewati. */
const TAB: [Tab, string][] = [
  ['plugins', 'Plugins'],
  ['skills', 'Skills'],
  ['mcp', 'MCP'],
  ['extensions', 'Extensions'],
];

/**
 * Sakelar lokal, bukan `Toggle` dari Settings.
 *
 * `Toggle` membawa kelas `.set-toggle` yang gayanya ada di `settings.css` — dan
 * berkas itu TIDAK dimuat jendela Agents (entry point-nya sendiri, hanya
 * `agents2.css`). Memakainya di sini akan menampilkan tombol tanpa bentuk di
 * jendela yang justru menjadi tempat halaman ini dipakai. Markup `role="switch"`
 * yang sama, gaya milik `.xmg` sendiri, jadi benar di kedua jendela.
 */
function Sakelar({
  checked,
  onChange,
  label,
  testid,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  testid?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`xmg-switch${checked ? ' is-on' : ''}`}
      data-testid={testid}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
    >
      <span className="xmg-switch-knob" />
    </button>
  );
}

export default function ExtMarketplaceManage({
  onKembali,
  /*
   * Jendela Agents tidak menampilkan tab Extensions di Marketplace-nya (itu
   * milik jendela utama, tempat ekstensi benar-benar mengubah editor), jadi
   * Manage di sana tidak boleh menawarkan daftar yang tidak bisa dibuka dari
   * mana pun.
   */
  denganEkstensi = true,
}: {
  onKembali: () => void;
  denganEkstensi?: boolean;
}) {
  const tr = useT();
  const [tab, setTab] = useState<Tab>('plugins');
  const [cari, setCari] = useState('');

  const plugins = usePlugins((s) => s.daftar);
  const muatPlugin = usePlugins((s) => s.muat);
  const aktifkanPlugin = usePlugins((s) => s.aktifkan);
  const sibukPlugin = usePlugins((s) => s.sibuk);

  const skills = useSkills((s) => s.daftar);
  const muatSkill = useSkills((s) => s.muatKatalog);
  const hapusSkill = useSkills((s) => s.hapus);
  const sibukSkill = useSkills((s) => s.sibuk);

  const servers = useMcp((s) => s.servers);
  const refreshServers = useMcp((s) => s.refreshServers);
  const removeServer = useMcp((s) => s.removeServer);
  const sibukMcp = useMcp((s) => s.busy);

  const manifests = useExt19((s) => s.manifests);
  const refreshExt = useExt19((s) => s.refresh);
  const setEnabledExt = useExt19((s) => s.setEnabled);

  /*
   * Re-read all four lists on open. The page is reachable long after the
   * Marketplace loaded, and a plugin installed (or a server removed) in another
   * window since then must not be missing here — this page exists precisely to
   * be the one place that answers "what is installed right now".
   */
  useEffect(() => {
    void muatPlugin();
    void muatSkill();
    void refreshServers();
    void refreshExt();
  }, [muatPlugin, muatSkill, refreshServers, refreshExt]);

  const ekstensi = useMemo(
    () => manifests.filter((m) => m.manifest && !m.error),
    [manifests],
  );

  const jumlah: Record<Tab, number> = {
    plugins: plugins.length,
    skills: skills.length,
    mcp: (servers ?? []).length,
    extensions: ekstensi.length,
  };

  const daftarTab = denganEkstensi ? TAB : TAB.filter(([id]) => id !== 'extensions');

  const q = cari.trim().toLowerCase();
  const cocok = (...teks: (string | undefined)[]) =>
    q === '' || teks.filter(Boolean).join(' ').toLowerCase().includes(q);

  /* Satu kotak cari dipakai bersama, dan isinya direset saat tab berganti:
     kata kunci untuk plugin hampir tidak pernah berguna di daftar skill, dan
     kotak yang tetap berisi teks lama membuat daftar tampak kosong tanpa sebab. */
  const gantiTab = (t: Tab) => {
    setTab(t);
    setCari('');
  };

  return (
    <div className="xmg" data-testid="xmg-page">
      <button type="button" className="xmg-balik" data-testid="xmg-kembali" onClick={onKembali}>
        <span aria-hidden="true">‹</span> {tr('Back to Marketplace')}
      </button>

      <h1 className="xmkt-judul">{tr('Manage')}</h1>
      <p className="xmkt-sub">
        {tr(
          'Manage added extensions, including plugins, skills, MCP servers and extensions.',
        )}
      </p>

      <div className="xmkt-bar xmg-bar">
        <div className="xmkt-tab" role="tablist" aria-label={tr('Installed things')}>
          {daftarTab.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`xmkt-tab-btn${tab === id ? ' is-on' : ''}`}
              data-testid={`xmg-tab-${id}`}
              onClick={() => gantiTab(id)}
            >
              {tr(label)}
              <span className="xmg-hitung" data-testid={`xmg-hitung-${id}`}>
                {jumlah[id]}
              </span>
            </button>
          ))}
        </div>

        <label className="xmkt-cari-wrap">
          <AiIkon name="search" size={13} />
          <input
            className="xmkt-cari"
            data-testid="xmg-cari"
            placeholder={`${tr('Search')} ${tr(daftarTab.find((t) => t[0] === tab)![1])}`}
            aria-label={tr('Search installed things')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </label>
      </div>

      <div className="xmg-daftar" data-testid="xmg-daftar">
        {tab === 'plugins' &&
          plugins
            .filter((p) => cocok(p.name, p.description, p.version))
            .map((p) => (
              <article className="xmg-baris" key={p.name} data-testid={`xmg-row-plugins-${p.name}`}>
                <span className="xmkt-logo" aria-hidden="true">
                  <IkonPasar jenis="plugins" id={p.name} nama={p.name} />
                </span>
                <div className="xmkt-info">
                  <span className="xmkt-nama">
                    {p.name}
                    {p.version && <span className="xmkt-badge">{p.version}</span>}
                    {p.missing && (
                      <span className="xmkt-badge xmg-rusak">{tr('Missing files')}</span>
                    )}
                  </span>
                  <span className="xmkt-ket">{p.description}</span>
                </div>
                <div className="xmg-aksi">
                  <Sakelar
                    checked={p.enabled === true}
                    disabled={sibukPlugin !== null}
                    onChange={(v) => void aktifkanPlugin(p.name, v)}
                    label={p.enabled ? `Disable ${p.name}` : `Enable ${p.name}`}
                    testid={`xmg-toggle-plugin-${p.name}`}
                  />
                </div>
              </article>
            ))}

        {tab === 'skills' &&
          skills
            .filter((s) => cocok(s.name, s.description))
            .map((s) => (
              <article className="xmg-baris" key={s.name} data-testid={`xmg-row-skills-${s.name}`}>
                <span className="xmkt-logo" aria-hidden="true">
                  <IkonPasar jenis="skills" id={s.name} nama={s.name} />
                </span>
                <div className="xmkt-info">
                  <span className="xmkt-nama">
                    {s.name}
                    <span className="xmkt-badge">
                      {s.scope === 'workspace' ? tr('Workspace') : tr('User')}
                    </span>
                  </span>
                  <span className="xmkt-ket">{s.description}</span>
                </div>
                <div className="xmg-aksi">
                  <span className="xmkt-terpasang-chip">{tr('On disk')}</span>
                  <button
                    type="button"
                    className="xmkt-hapus-kecil"
                    data-testid={`xmg-hapus-skill-${s.name}`}
                    disabled={sibukSkill}
                    onClick={() => void hapusSkill(s.name)}
                  >
                    {tr('Remove')}
                  </button>
                </div>
              </article>
            ))}

        {tab === 'mcp' &&
          (servers ?? [])
            .filter((s) => cocok(s.label, s.command, s.url))
            .map((s) => (
              <article className="xmg-baris" key={s.id} data-testid={`xmg-row-mcp-${s.id}`}>
                <span className="xmkt-logo" aria-hidden="true">
                  <IkonPasar jenis="mcp" id={s.id} nama={s.label} />
                </span>
                <div className="xmkt-info">
                  <span className="xmkt-nama">
                    {s.label}
                    <span className="xmkt-badge">
                      {s.command ? tr('Local') : tr('HTTP')}
                    </span>
                  </span>
                  <span className="xmkt-ket">{s.command ? `${s.command} ${(s.args ?? []).join(' ')}` : s.url}</span>
                </div>
                <div className="xmg-aksi">
                  <span className="xmkt-terpasang-chip">{tr('Configured')}</span>
                  <button
                    type="button"
                    className="xmkt-hapus-kecil"
                    data-testid={`xmg-hapus-mcp-${s.id}`}
                    disabled={sibukMcp}
                    onClick={() => void removeServer(s.id)}
                  >
                    {tr('Remove')}
                  </button>
                </div>
              </article>
            ))}

        {tab === 'extensions' &&
          ekstensi
            .filter((m) => cocok(m.manifest?.name, m.manifest?.description, m.manifest?.id))
            .map((m) => (
              <article
                className="xmg-baris"
                key={m.manifest!.id}
                data-testid={`xmg-row-extensions-${m.manifest!.id}`}
              >
                <span className="xmkt-logo" aria-hidden="true">
                  <AiIkon name="puzzle" size={15} />
                </span>
                <div className="xmkt-info">
                  <span className="xmkt-nama">
                    {m.manifest!.name}
                    {m.manifest!.version && (
                      <span className="xmkt-badge">{m.manifest!.version}</span>
                    )}
                  </span>
                  <span className="xmkt-ket">{m.manifest!.description}</span>
                </div>
                <div className="xmg-aksi">
                  <Sakelar
                    checked={m.enabled}
                    onChange={(v) => void setEnabledExt(m.manifest!.id, v)}
                    label={
                      m.enabled
                        ? `Disable ${m.manifest!.name}`
                        : `Enable ${m.manifest!.name}`
                    }
                    testid={`xmg-toggle-ext-${m.manifest!.id}`}
                  />
                </div>
              </article>
            ))}

        {jumlah[tab] === 0 && (
          <div className="xmkt-kosong" data-testid="xmg-kosong">
            <AiIkon name="puzzle" size={22} />
            <span>
              {tab === 'mcp'
                ? tr('No MCP servers configured yet.')
                : tr('Nothing installed yet.')}
            </span>
          </div>
        )}

        {jumlah[tab] > 0 &&
          !(
            tab === 'plugins'
              ? plugins.some((p) => cocok(p.name, p.description, p.version))
              : tab === 'skills'
                ? skills.some((s) => cocok(s.name, s.description))
                : tab === 'mcp'
                  ? (servers ?? []).some((s) => cocok(s.label, s.command, s.url))
                  : ekstensi.some((m) =>
                      cocok(m.manifest?.name, m.manifest?.description, m.manifest?.id),
                    )
          ) && (
            <div className="xmkt-kosong" data-testid="xmg-tak-cocok">
              <AiIkon name="puzzle" size={22} />
              <span>{tr('Nothing matches that search.')}</span>
            </div>
          )}
      </div>
    </div>
  );
}
