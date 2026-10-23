/*
 * Marketplace — jendela Extensions, satu halaman untuk delapan jenis isi:
 *
 *   Plugins · Skills · MCP · Icon Themes · Keymaps · Languages · Snippets · Themes
 *
 * Dua hal yang mirip namanya dan TIDAK boleh tertukar:
 *
 *   Languages  — paket ekstensi bahasa (grammar/syntax: `zephyr.lang-python`,
 *                `zephyr.lang-rust`, 88 entri di registri). Ini yang dipasang
 *                orang untuk mendapat penyorotan bahasa baru.
 *   Language server (LSP) — executable `tsserver`, `rust-analyzer`, … beserta
 *                hasil probe-nya. Daftar itu tinggal di Settings → Language dan
 *                TIDAK disalin ke sini, supaya tidak ada dua daftar yang sama.
 *
 * Bentuknya mengikuti acuan TRAE: judul + subjudul, `Manage` di kanan, deretan
 * tab bergaris bawah dengan kotak cari di ujung kanannya, chip kategori, lalu
 * baris item tiga kolom (ikon · nama/deskripsi · tombol aksi).
 *
 * ## Kenapa satu halaman, bukan tab terpisah
 *
 * Sebelumnya tema, ikon, keymap, dan snippet hanya bisa diubah lewat Settings,
 * sedangkan plugin/skill/MCP lewat jendela Extensions — dua tempat untuk benda
 * yang sama jenisnya. Di sini semuanya jadi tab: yang terpasang bisa dipakai
 * (Apply/Use), yang belum bisa dipasang, dan yang rusak tetap terlihat.
 *
 * ## Sumber data tiap tab (semuanya store yang sudah ada)
 *
 *   plugins      usePlugins.daftar + pasar
 *   skills       useSkills.daftar + katalog
 *   mcp          useMcp.servers + KATALOG_MCP_SERVER
 *   icon-themes  useIkonTema.packs + paket katalog berkategori Icon Themes
 *   keymaps      paket katalog berkategori Keymaps
 *   languages    paket katalog berkategori Languages
 *   snippets     paket katalog berkategori Snippets + bahasa yang punya snippet
 *   themes       semuaTema() + paket katalog berkategori Themes
 *
 * Tidak ada daftar kedua yang disimpan: setiap tab membaca store pemiliknya,
 * jadi memasang sesuatu dari sini sama dengan memasangnya dari Settings.
 */
import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { usePlugins } from '../../lib/pluginsStore';
import { useSkills } from '../../lib/skillsStore';
import { useMcp } from '../../lib/mcpStore';
import { KATALOG_MCP_SERVER, bisaDipasang, type KatalogMcpEntry } from '../../lib/katalogMcpServer';
import { KATALOG_BUNDLED, type KatalogItem } from '../../lib/extCatalog';
import { useExt19 } from '../../lib/extensionsStore19';
import { useStore } from '../../lib/store';
import { useIkonTema } from '../../lib/ikonTemaStore';
import { useSnip } from '../../lib/snippetStore';
import { semuaTema, resolveTheme } from '../../lib/themes';
import IkonExt from './IkonExt';
import { IkonPasar } from './IkonPasar';
import ExtMarketplaceManage from './ExtMarketplaceManage';

export type Tab =
  | 'plugins'
  | 'skills'
  | 'mcp'
  | 'icon-themes'
  | 'keymaps'
  | 'languages'
  | 'snippets'
  | 'themes';

/** Urutan tab mengikuti acuan TRAE, ditambah lima jenis lokal di belakangnya. */
const TAB: [Tab, string][] = [
  ['plugins', 'Plugins'],
  ['skills', 'Skills'],
  ['mcp', 'MCP'],
  ['icon-themes', 'Icon Themes'],
  ['keymaps', 'Keymaps'],
  ['languages', 'Languages'],
  ['snippets', 'Snippets'],
  ['themes', 'Themes'],
];

const SEMUA = '__semua';

interface Kartu {
  id: string;
  jenis: Tab;
  nama: string;
  ket: string;
  kategori: string[];
  terpasang: boolean;
  aktif?: boolean;
  /** Paket ekstensi di balik baris ini, kalau ada. */
  paket?: KatalogItem;
  /** Teks kecil di samping nama (mis. "Local", "v1.0.0"). */
  badge?: string;
}

export default function ExtMarketplace({
  /*
   * Bagaimana `Manage` dibuka.
   *
   * Jendela utama memakai modal: Marketplace-nya hidup di dalam kolom yang
   * sempit, dan modal adalah cara termurah untuk melihat daftar terpasang tanpa
   * meninggalkan halaman. Jendela Agents punya kanvas penuh, dan di sana modal
   * hanya menyisakan jendela kecil di tengah layar besar — jadi halaman ini
   * menerima `manageSebagaiHalaman` dan menampilkan Manage sebagai halaman
   * penuh dengan tombol kembali.
   *
   * Bawaannya `false`, jadi jalur jendela utama (beserta harness yang menguji
   * modal `xmkt-manage-modal`) tidak berubah sama sekali.
   */
  manageSebagaiHalaman = false,
  /*
   * Tab mana yang ditampilkan. Kosong = semua delapan.
   *
   * Jendela Agents hanya boleh memuat yang memang bisa dipakai AGEN — plugin,
   * skill, server MCP. Ikut Themes/Icon Themes/Keymaps/Languages/Snippets di
   * sana salah tempat: kelimanya mengubah TAMPILAN EDITOR di jendela utama
   * (tema aktif, ikon pohon berkas, peta tombol, grammar bahasa, potongan
   * kode), dan jendela Agents tidak punya editor untuk mengubahnya. Yang ada
   * di sana hanya delapan tab yang setengahnya tidak berefek apa pun pada
   * halaman yang sedang dilihat.
   */
  tabTampil,
}: {
  manageSebagaiHalaman?: boolean;
  tabTampil?: Tab[];
}) {
  const tr = useT();

  const [tab, setTab] = useState<Tab>('plugins');
  const [cari, setCari] = useState('');
  const [kategori, setKategori] = useState<string>(SEMUA);
  const [manageBuka, setManageBuka] = useState(false);
  const [kelolaHalaman, setKelolaHalaman] = useState(false);
  /* Daftar 8 entri, disaring sekali per render — bukan memo, karena `tabTampil`
     dari pemanggil bisa array baru setiap render dan memo-nya justru tidak
     pernah kena. */
  const daftarTab = tabTampil ? TAB.filter(([id]) => tabTampil.includes(id)) : TAB;
  /* Label tab yang sedang dibuka, untuk placeholder pencarian: kotak yang
     bertuliskan "Cari Marketplace" di tab Themes menyuruh orang mencari di
     delapan tab sekaligus, padahal isinya hanya tab itu. */
  const labelAktif = (daftarTab.find(([id]) => id === tab) ?? daftarTab[0])[1];
  const [menuBuka, setMenuBuka] = useState(false);
  const [sibukMcp, setSibukMcp] = useState<string | null>(null);

  /* ── Plugins ───────────────────────────────────────────────────────────── */
  const plugins = usePlugins((s) => s.daftar);
  const pasar = usePlugins((s) => s.pasar);
  const muatPlugin = usePlugins((s) => s.muat);
  const pasangBawaan = usePlugins((s) => s.pasangBawaan);
  const aktifkanPlugin = usePlugins((s) => s.aktifkan);
  const sibukPlugin = usePlugins((s) => s.sibuk !== null);

  /* ── Skills ────────────────────────────────────────────────────────────── */
  const skills = useSkills((s) => s.daftar);
  const katalogSkill = useSkills((s) => s.katalog);
  const muatSkill = useSkills((s) => s.muatKatalog);
  const pasangSkill = useSkills((s) => s.pasang);
  const hapusSkill = useSkills((s) => s.hapus);

  /* ── MCP ───────────────────────────────────────────────────────────────── */
  const mcpTerpasang = useMcp((s) => s.servers);
  const saveServer = useMcp((s) => s.saveServer);
  const mcpError = useMcp((s) => s.mcpError);

  /* ── Paket ekstensi (tema, ikon, keymap, snippet) ──────────────────────── */
  const manifests = useExt19((s) => s.manifests);
  const remote = useExt19((s) => s.remote);
  const installExt = useExt19((s) => s.installKatalog);
  const uninstallExt = useExt19((s) => s.uninstall);
  const setEnabledExt = useExt19((s) => s.setEnabled);
  const installDariDialog = useExt19((s) => s.installDariDialog);
  const refreshExt = useExt19((s) => s.refresh);

  /* ── Tema, ikon, snippet ───────────────────────────────────────────────── */
  const settings = useStore((s) => s.settings);
  const packs = useIkonTema((s) => s.packs);
  const ikonAktif = useIkonTema((s) => s.aktif);
  const pilihIkon = useIkonTema((s) => s.pilih);
  const bahasaSnippet = useSnip((s) => s.bahasaBawaan);
  const bahasaSnippetUser = useSnip((s) => s.bahasaUser);
  const muatSnippet = useSnip((s) => s.muatDaftar);

  useEffect(() => {
    void muatPlugin();
    void muatSkill();
    void useMcp.getState().refreshServers();
    void useExt19.getState().muatRemote();
    void muatSnippet();
  }, [muatPlugin, muatSkill, muatSnippet]);

  const temaAktif = resolveTheme(settings.general, settings.theme);

  /* Paket dari katalog: bundel + registri, registri menang pada id yang sama. */
  const paket = useMemo(() => {
    const dariRemote = (remote ?? []).filter((it) => !it.perluRuntime);
    const idRemote = new Set(dariRemote.map((x) => x.id));
    return [...dariRemote, ...KATALOG_BUNDLED.filter((it) => !idRemote.has(it.id))];
  }, [remote]);

  const paketKategori = (kategoriPaket: string) =>
    paket.filter((p) => (p.categories ?? []).includes(kategoriPaket));

  const idPaketTerpasang = useMemo(
    () => new Set(manifests.filter((m) => m.manifest).map((m) => m.manifest?.id ?? '')),
    [manifests],
  );
  const aktifPaket = useMemo(() => {
    const peta = new Map<string, boolean>();
    for (const m of manifests) if (m.manifest) peta.set(m.manifest.id, m.enabled);
    return peta;
  }, [manifests]);

  /* ── Baris per tab ─────────────────────────────────────────────────────── */

  const kartu = useMemo<Kartu[]>(() => {
    const dariPaket = (kategoriPaket: string, jenis: Tab): Kartu[] =>
      paketKategori(kategoriPaket).map((p) => ({
        id: `paket:${p.id}`,
        jenis,
        nama: p.name,
        ket: p.description,
        kategori: [p.publisher === 'zephyr' ? 'Bundled' : 'Registry'],
        terpasang: idPaketTerpasang.has(p.id),
        aktif: aktifPaket.get(p.id) ?? false,
        paket: p,
      }));

    if (tab === 'plugins') {
      const terpasang = new Set(plugins.map((p) => p.name));
      const kategoriPasar = new Map((pasar ?? []).map((p) => [p.name, p.category || 'Installed']));
      const lokal: Kartu[] = plugins.map((p) => ({
        id: p.name,
        jenis: 'plugins',
        nama: p.name,
        ket: p.description ?? '',
        kategori: [kategoriPasar.get(p.name) ?? 'Installed'],
        terpasang: true,
        aktif: p.enabled === true,
        badge: p.version,
      }));
      const baru: Kartu[] = (pasar ?? [])
        .filter((p) => !terpasang.has(p.name))
        .map((p) => ({
          id: p.id || p.name,
          jenis: 'plugins',
          nama: p.name,
          ket: p.description ?? '',
          kategori: [p.category || 'Other'],
          terpasang: false,
          badge: p.version,
        }));
      return [...lokal, ...baru];
    }

    if (tab === 'skills') {
      const terpasang = new Set(skills.map((s) => s.name));
      const lokal: Kartu[] = skills.map((s) => ({
        id: s.name,
        jenis: 'skills',
        nama: s.name,
        ket: s.description,
        kategori: [s.scope === 'workspace' ? 'Workspace' : 'User'],
        terpasang: true,
      }));
      const baru: Kartu[] = katalogSkill
        .filter((s) => !terpasang.has(s.name))
        .map((s) => ({
          id: `katalog:${s.name}`,
          jenis: 'skills',
          nama: s.name,
          ket: s.description || s.catatan,
          kategori: ['Bundled'],
          terpasang: false,
        }));
      return [...lokal, ...baru];
    }

    if (tab === 'mcp') {
      const idTerpasang = new Set((mcpTerpasang ?? []).map((s) => s.id));
      return KATALOG_MCP_SERVER.map((m) => ({
        id: m.id,
        jenis: 'mcp',
        nama: m.nama,
        ket: m.deskripsi,
        kategori: [m.kategori || 'Other'],
        terpasang: idTerpasang.has(m.id),
        badge: m.transport === 'stdio' ? 'Local' : 'HTTP',
      }));
    }

    if (tab === 'themes') {
      const bawaan: Kartu[] = semuaTema().map((t) => ({
        id: `tema:${t.id}`,
        jenis: 'themes',
        nama: t.label,
        ket: t.kind === 'dark' ? 'Dark theme' : 'Light theme',
        kategori: [t.kind === 'dark' ? 'Dark' : 'Light'],
        terpasang: true,
        aktif: temaAktif === t.id,
      }));
      return [...bawaan, ...dariPaket('Themes', 'themes')];
    }

    if (tab === 'icon-themes') {
      const bawaan: Kartu[] = [
        {
          id: 'ikon:',
          jenis: 'icon-themes',
          nama: 'Zephyr Icons',
          ket: 'The icons that ship with the app.',
          kategori: ['Built-in'],
          terpasang: true,
          aktif: ikonAktif === null,
        },
        ...packs.map((p) => ({
          id: `ikon:${p.extId}`,
          jenis: 'icon-themes' as const,
          nama: p.label,
          ket: `${p.jumlahSvg} drawn icons`,
          kategori: ['Installed'],
          terpasang: true,
          aktif: ikonAktif === p.extId,
        })),
      ];
      return [...bawaan, ...dariPaket('Icon Themes', 'icon-themes')];
    }

    if (tab === 'keymaps') return dariPaket('Keymaps', 'keymaps');

    if (tab === 'languages') return dariPaket('Languages', 'languages');

    if (tab === 'snippets') {
      const bahasa = [...new Set([...bahasaSnippet, ...bahasaSnippetUser])];
      const lokal: Kartu[] = bahasa.map((b) => ({
        id: `bahasa:${b}`,
        jenis: 'snippets',
        nama: b,
        ket: bahasaSnippetUser.includes(b) ? 'Your own snippet file' : 'Bundled snippets',
        kategori: [bahasaSnippetUser.includes(b) ? 'User' : 'Bundled'],
        terpasang: true,
      }));
      return [...lokal, ...dariPaket('Snippets', 'snippets')];
    }

    return [];
  }, [
    tab,
    plugins,
    pasar,
    skills,
    katalogSkill,
    mcpTerpasang,
    paket,
    idPaketTerpasang,
    aktifPaket,
    semuaTema,
    temaAktif,
    packs,
    ikonAktif,
    bahasaSnippet,
    bahasaSnippetUser,
  ]);

  /* ── Filter ────────────────────────────────────────────────────────────── */

  const chips = useMemo(() => {
    const unik = [...new Set(kartu.flatMap((k) => k.kategori).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
    return [{ id: SEMUA, label: 'All' }, ...unik.map((k) => ({ id: k, label: k }))];
  }, [kartu]);

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

  /* ── Aksi ──────────────────────────────────────────────────────────────── */

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

  const pakaiTema = (id: string) => {
    const info = semuaTema().find((t) => t.id === id);
    void useStore.getState().applySettings({
      theme: { current: id },
      general: { theme: info?.kind === 'light' ? 'light' : 'dark' },
    });
  };

  const hapusPaket = (k: Kartu) => {
    if (k.paket) void uninstallExt(k.paket.id);
  };

  /* ── Manage: semua yang terpasang, satu daftar ─────────────────────────── */

  const terpasangSemua = useMemo(() => {
    const ext = manifests
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

  const kosong = (() => {
    if (cari.trim() || kategori !== SEMUA) return 'Nothing matches that filter.';
    if (tab === 'languages') return 'No language packs in the catalogue.';
    if (tab === 'mcp') return 'No MCP servers in the catalogue.';
    return 'Nothing here yet.';
  })();

  /* ── Render ────────────────────────────────────────────────────────────── */

  /* Halaman Manage menutupi Marketplace selama dibuka, bukan menumpuk di
     atasnya: keduanya memakai `.xmkt` dan akan saling menimpa padding serta
     kepala halaman kalau dirender bersamaan. `onKembali` mengembalikan tab,
     pencarian, dan chip ke keadaan sebelumnya karena state-nya tinggal di sini. */
  if (manageSebagaiHalaman && kelolaHalaman) {
    return (
      <ExtMarketplaceManage
        onKembali={() => setKelolaHalaman(false)}
        /* Manage hanya boleh menawarkan apa yang juga ada di Marketplace-nya:
           daftar Marketplace yang dipangkas (jendela Agents) juga tidak
           menampilkan paket ekstensi, karena paket itu hidup di tab yang di
           sana tidak ada. */
        denganEkstensi={!tabTampil}
      />
    );
  }

  return (
    <div className="xmkt" data-testid="ext-marketplace">
      <header className="xmkt-head">
        <div className="xmkt-head-teks">
          <h1 className="xmkt-judul">{tr('Marketplace')}</h1>
          <p className="xmkt-sub">
            {tr(
              "Discover and install plugins, skills, and MCP servers to extend Zephyr's capabilities.",
            )}
          </p>
        </div>
        <div className="xmkt-head-aksi">
          <button
            type="button"
            className="xmkt-kelola"
            data-testid="xmkt-manage"
            onClick={() => (manageSebagaiHalaman ? setKelolaHalaman(true) : setManageBuka(true))}
          >
            <AiIkon name="gear" size={13} />
            {tr('Manage')}
          </button>
          <div className="xmkt-menu-wrap">
            <button
              type="button"
              className="xmkt-titik"
              data-testid="ext-actions-btn"
              aria-haspopup="menu"
              aria-expanded={menuBuka}
              aria-label={tr('Extension actions')}
              onClick={() => setMenuBuka((v) => !v)}
            >
              ⋮
            </button>
            {menuBuka && (
              <div className="xmkt-menu" role="menu" data-testid="ext-actions-menu">
                <button
                  data-testid="ext-install-folder"
                  onClick={() => {
                    setMenuBuka(false);
                    void installDariDialog(true);
                  }}
                >
                  Install from Folder…
                </button>
                <button
                  data-testid="ext-install-zext"
                  onClick={() => {
                    setMenuBuka(false);
                    void installDariDialog(false);
                  }}
                >
                  Install from .zext…
                </button>
                <div className="xmkt-menu-pisah" />
                <button
                  data-testid="ext-reload-list"
                  onClick={() => {
                    setMenuBuka(false);
                    void refreshExt();
                  }}
                >
                  Reload
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="xmkt-bar">
        <div className="xmkt-tab" role="tablist" aria-label={tr('Marketplace sections')}>
          {daftarTab.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`xmkt-tab-btn${tab === id ? ' is-on' : ''}`}
              data-testid={`ext-tab-${id}`}
              onClick={() => {
                setTab(id);
                setKategori(SEMUA);
              }}
            >
              {tr(label)}
            </button>
          ))}
        </div>

        <label className="xmkt-cari-wrap">
          <AiIkon name="search" size={13} />
          <input
            className="xmkt-cari"
            data-testid="ext-search"
            placeholder={`${tr('Search')} ${tr(labelAktif)}`}
            aria-label={tr('Search marketplace')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </label>
      </div>

      <div className="xmkt-chips" data-testid="xmkt-chips">
        {chips.map((k) => (
          <button
            key={k.id}
            type="button"
            className={`xmkt-chip${kategori === k.id ? ' is-on' : ''}`}
            data-testid={`xmkt-chip-${k.id}`}
            aria-pressed={kategori === k.id}
            onClick={() => setKategori(k.id === SEMUA ? SEMUA : k.id)}
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
          <span>{tr(kosong)}</span>
        </div>
      ) : (
        <div className="xmkt-grid" data-testid="xmkt-grid">
          {tampil.map((k) => (
            <article
              className="xmkt-kartu"
              key={k.id}
              data-testid={`xmkt-kartu-${k.id}`}
              title={k.ket}
            >
              {/* Logo paket dipakai apa adanya; selain itu ikon merek/tema/
                  monogram dari `IkonPasar` — lihat berkas itu untuk aturannya. */}
              <span
                className={`xmkt-logo${k.paket && k.jenis !== 'keymaps' ? ' xmkt-logo-ext' : ''}`}
                aria-hidden="true"
              >
                {/* Keymap adalah pengecualian: artwork paketnya satu tanda
                    keyboard yang sama untuk keempat paket, jadi di sini dipakai
                    ikon merek (Sublime/Vim/Emacs/JetBrains) supaya barisnya
                    bisa dibedakan sekilas. Paket lain memakai artwork aslinya. */}
                {k.paket && k.jenis !== 'keymaps' ? (
                  <IkonExt item={k.paket} logoUrl={k.paket.logoUrl} />
                ) : (
                  <IkonPasar jenis={k.jenis} id={k.id} nama={k.nama} />
                )}
              </span>

              <div className="xmkt-info">
                <span className="xmkt-nama">
                  {k.nama}
                  {k.paket?.publisher === 'zephyr' && (
                    <span className="xmkt-badge">{tr('Bundled')}</span>
                  )}
                  {k.badge && <span className="xmkt-badge">{k.badge}</span>}
                </span>
                <span className="xmkt-ket">{k.ket}</span>
              </div>

              <span className="xmkt-aksi">
                {/* ── Plugins ── */}
                {k.jenis === 'plugins' &&
                  (k.terpasang ? (
                    <button
                      type="button"
                      className="xmkt-pasang is-terpasang"
                      data-testid={`xmkt-aktif-${k.id}`}
                      disabled={sibukPlugin}
                      onClick={() => void aktifkanPlugin(k.id, !k.aktif)}
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

                {/* ── Skills ── */}
                {k.jenis === 'skills' &&
                  (k.terpasang ? (
                    <button
                      type="button"
                      className="xmkt-pasang is-terpasang"
                      data-testid={`xmkt-skill-hapus-${k.id}`}
                      onClick={() => void hapusSkill(k.id)}
                    >
                      {tr('Remove')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="xmkt-pasang"
                      data-testid={`xmkt-skill-install-${k.id}`}
                      onClick={() => void pasangSkill(k.nama)}
                    >
                      + {tr('Install')}
                    </button>
                  ))}

                {/* ── MCP ── */}
                {k.jenis === 'mcp' &&
                  (k.terpasang ? (
                    <span className="xmkt-terpasang-chip">{tr('Installed')}</span>
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

                {/* ── Tema bawaan: Apply / Active ── */}
                {k.jenis === 'themes' &&
                  (k.id.startsWith('tema:') ? (
                    k.aktif ? (
                      <span className="xmkt-terpasang-chip">{tr('Active')}</span>
                    ) : (
                      <button
                        type="button"
                        className="xmkt-pasang is-terpasang"
                        data-testid={`xmkt-tema-pakai-${k.id.slice(5)}`}
                        onClick={() => pakaiTema(k.id.slice(5))}
                      >
                        {tr('Apply')}
                      </button>
                    )
                  ) : (
                    <AksiPaket k={k} onPasang={installExt} onHapus={hapusPaket} onToggle={setEnabledExt} />
                  ))}

                {/* ── Ikon: Use / In use, lalu paket ── */}
                {k.jenis === 'icon-themes' &&
                  (k.id.startsWith('ikon:') ? (
                    k.aktif ? (
                      <span className="xmkt-terpasang-chip">{tr('In use')}</span>
                    ) : (
                      <button
                        type="button"
                        className="xmkt-pasang is-terpasang"
                        data-testid={`xmkt-ikon-pakai-${k.id.slice(5) || 'bawaan'}`}
                        onClick={() => pilihIkon(k.id === 'ikon:' ? null : k.id.slice(5))}
                      >
                        {tr('Use')}
                      </button>
                    )
                  ) : (
                    <AksiPaket k={k} onPasang={installExt} onHapus={hapusPaket} onToggle={setEnabledExt} />
                  ))}

                {/* ── Keymap & snippet: paket ekstensi ── */}
                {(k.jenis === 'keymaps' ||
                  k.jenis === 'languages' ||
                  (k.jenis === 'snippets' && k.paket)) && (
                  <AksiPaket k={k} onPasang={installExt} onHapus={hapusPaket} onToggle={setEnabledExt} />
                )}

                {/* ── Snippet bahasa (bukan paket): penanda saja ── */}
                {k.jenis === 'snippets' && !k.paket && (
                  <span className="xmkt-terpasang-chip">{tr('Available')}</span>
                )}

              </span>
            </article>
          ))}
        </div>
      )}

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

/* Tombol untuk baris paket ekstensi: pasang, atau aktif/nonaktif + hapus. */
function AksiPaket({
  k,
  onPasang,
  onHapus,
  onToggle,
}: {
  k: Kartu;
  onPasang: (p: KatalogItem) => unknown;
  onHapus: (k: Kartu) => void;
  onToggle: (id: string, on: boolean) => void | Promise<void>;
}) {
  if (!k.paket) return null;
  if (!k.terpasang) {
    return (
      <button
        type="button"
        className="xmkt-pasang"
        data-testid={`xmkt-ext-install-${k.paket.id}`}
        onClick={() => void onPasang(k.paket!)}
      >
        + Install
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        className="xmkt-pasang is-terpasang"
        data-testid={`xmkt-ext-toggle-${k.paket.id}`}
        onClick={() => void onToggle(k.paket!.id, k.aktif === false)}
      >
        {k.aktif === false ? 'Enable' : 'Disable'}
      </button>
      <button
        type="button"
        className="xmkt-hapus-kecil"
        data-testid={`xmkt-ext-hapus-${k.paket.id}`}
        onClick={() => onHapus(k)}
      >
        Remove
      </button>
    </>
  );
}
