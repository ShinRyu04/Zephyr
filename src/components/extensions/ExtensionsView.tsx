import { useEffect, useMemo } from 'react';
import {
  useExt19,
  setBahasaWorkspace,
  type ExtTab,
} from '../../lib/extensionsStore19';
import { KATALOG_BUNDLED, type KatalogItem } from '../../lib/extCatalog';
import { ikonEkstensi, inlineIkonDataUri } from '../../lib/extIkon';
import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { detectLang } from '../../lib/lang';
import { labelPaket } from '../../lib/labelPaket';
import { catatanBahasaTerpasang, type BarisGrammar } from './bahasaTerpasang';
import Popover from '../shell/Popover';
import { useRef, useState } from 'react';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { useT, useTf } from '../../lib/i18n';
import { grammarTersedia, type LoaderRingkasan } from '../../lib/extLoader';
import { KATALOG_MCP_SERVER } from '../../lib/katalogMcpServer';
import { usePlugins } from '../../lib/pluginsStore';
import { useSkills } from '../../lib/skillsStore';
import { useMcp } from '../../lib/mcpStore';
import ExtMarketplace from './ExtMarketplace';

/*
 * Penilai grammar untuk catatan bahasa: fungsi yang SAMA dengan yang dipakai
 * loader sebelum mendaftarkan ekstensi (`grammarTersedia`, extLoader.ts). Kalau
 * `cmLang` paket bukan salah satu paket bahasa yang diizinkan, loader tidak
 * mendaftarkan akhiran berkasnya - jadi catatan di panel detail tidak boleh
 * menjanjikan "menambah akhiran baru". Menyerahkan fungsi ini yang membuatnya
 * begitu; tanpa itu catatan hanya tahu soal bahasa bawaan, bukan soal grammar
 * yang bisa dimuat.
 */
const grammarBisaDimuat = (l: BarisGrammar): boolean =>
  grammarTersedia({
    id: l.cmLang ?? l.legacyMode ?? '',
    extensions: [],
    cmLang: l.cmLang ?? '',
    legacyMode: l.legacyMode ?? '',
    label: '',
  });

/*
 * The top row is a rail of KINDS, in the order the reader meets them:
 *
 *   Installed | Plugins | Skills | MCP | Recommended | Extensions
 *
 * MCP used to be its own top-level tab beside Marketplace, and Marketplace held
 * Plugins/Skills/MCP as SUB-tabs. That nested one tab inside another for the
 * same three kinds, and the reader had to scroll a page that was really a list
 * of kinds. Now every kind is ONE click away at the same level, and no tab
 * needs a second row of tabs to be useful.
 *
 * `marketplace` stays as an id because a stored session may hold it; it is
 * labelled "Extensions" because that is what it lists (themes, grammars,
 * keymaps - the extension PACKAGES).
 */
const TAB_LABEL: Record<ExtTab, string> = {
  installed: 'Installed',
  plugins: 'Plugins',
  skills: 'Skills',
  mcp: 'MCP',
  recommended: 'Recommended',
  marketplace: 'Extensions',
};

/** Which top-level tabs are drawn, in order. */
const TAB_TAMPIL: ExtTab[] = ['installed', 'plugins', 'skills', 'mcp', 'recommended', 'marketplace'];

function formatUnduhan(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

/*
 * The mark inside the card's logo box.
 *
 * A language pack borrows the file icon the editor already draws for that
 * language, so it comes out in the theme's own colours rather than in a flat
 * grey. The four non-language kinds get a drawn mark instead of initials.
 */
function IkonExt({ item, logoUrl }: { item: KatalogItem; logoUrl?: string }) {
  const { svg, id, warna, tinta, inisial } = ikonEkstensi(item.id, item.categories);

  /*
   * The icon the catalogue itself shipped wins over anything drawn here.
   *
   * It is decoded and inlined rather than handed to an `<img>`, because the
   * bundled language marks are base64 SVGs and an `<img>` of an SVG cannot be
   * tinted from the outside — SVG's initial fill is black. Inlined, the real
   * artwork survives and still gets a colour pushed into it.
   */
  if (logoUrl) {
    /*
     * Resolve the colour off `item.id`, not off `id` from `ikonEkstensi`.
     *
     * That `id` is a mark name, already rewritten by the time we get here —
     * `inisial-asterisk`, `inisial-cobol` — so stripping a `zephyr.lang-`
     * prefix off it does nothing and every lookup missed, falling to the hash.
     */
    const nama = item.id.startsWith('zephyr.lang-')
      ? item.id.slice('zephyr.lang-'.length)
      : item.id;
    const asli = inlineIkonDataUri(logoUrl, nama);
    if (asli) {
      return (
        <span
          className="xc-gambar xc-gambar-asli"
          data-ikon={id}
          data-dari="katalog"
          style={asli.tint ? { color: tinta } : undefined}
          dangerouslySetInnerHTML={{ __html: asli.svg }}
        />
      );
    }
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        className="xc-logo-img"
        data-logo-src={item.id}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  if (inisial) {
    return (
      <span
        className="xc-inisial"
        data-ikon={id}
        style={{ background: tinta }}
        aria-hidden="true"
      >
        {inisial}
      </span>
    );
  }

  if (svg) {
    return (
      <span
        className="xc-gambar"
        data-ikon={id}
        // The theme leaves most marks on `currentColor`; on a card that reads as
        // a black blob, so the language's own colour is set on the wrapper and
        // the mark inherits it. Marks that already carry a `fill` ignore this.
        style={tinta ? { color: tinta } : undefined}
        // From the generated material-icon-theme table, not user input.
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }

  /*
   * The drawn marks: key, snippets, and the fallback. They stroke and fill with
   * `currentColor`, so the group colour has to reach the wrapper for them to be
   * anything but grey.
   */
  return (
    <svg
      viewBox="0 0 16 16"
      className="xc-gambar"
      data-ikon={id}
      style={tinta ? { color: tinta } : undefined}
      aria-hidden="true"
    >
      {warna === 'theme' && (
        <>
          <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 2.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" />
        </>
      )}
      {warna === 'ikon' && (
        <>
          <rect x="2.6" y="2.6" width="4.6" height="4.6" rx="1.2" fill="#e06c75" />
          <rect x="8.8" y="2.6" width="4.6" height="4.6" rx="1.2" fill="#98c379" />
          <rect x="2.6" y="8.8" width="4.6" height="4.6" rx="1.2" fill="#61afef" />
          <rect x="8.8" y="8.8" width="4.6" height="4.6" rx="1.2" fill="#c678dd" />
        </>
      )}
      {warna === 'keymap' && (
        <rect
          x="1.4"
          y="4"
          width="13.2"
          height="8"
          rx="1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      )}
      {warna === 'keymap' &&
        [4.4, 7.1, 9.8].map((y) =>
          [3.6, 6.3, 9, 11.7].map((x) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="1.9" height="1.9" rx="0.4" fill="currentColor" />
          )),
        )}
      {warna === 'snippet' && (
        <path
          d="M5.6 3.4L2.2 8l3.4 4.6M10.4 3.4L13.8 8l-3.4 4.6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {warna === 'dap' && (
        <>
          {/* The debug "play with a bug" mark: a rounded body with legs. */}
          <rect
            x="4.6"
            y="5.4"
            width="6.8"
            height="7"
            rx="3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M4.6 8.2H2.4M11.4 8.2h2.2M4.6 11H2.6M11.4 11h2M6.4 5.4L5 3.6M9.6 5.4L11 3.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </>
      )}
      {warna === 'lain' && (
        <rect
          x="2.8"
          y="2.8"
          width="10.4"
          height="10.4"
          rx="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      )}
    </svg>
  );
}

/*
 * Penanda jujur untuk paket bahasa di daftar ekstensi.
 *
 * Tabelnya pindah ke `src/lib/labelPaket.ts` supaya bisa diuji tanpa aplikasi
 * (`scripts/uji-katalog-ekstensi-jujur.mjs` menurunkan ulang status tiap paket
 * dari sumber katalog lalu menuntut tabel itu setuju, termasuk daftar ekstensi
 * sisanya yang persis). Di sini hanya ditampilkan; paketnya tetap bisa
 * dipasang/dilepas seperti biasa.
 */

/* Nama jenis kontribusi apa adanya dari loader (kind = token di
   `ext_pkg.rs`/`extLoader.ts`), dipetakan ke kata yang bisa dibaca di kartu.
   Yang tidak dikenal tetap ditampilkan mentah - lebih baik mentah daripada
   hilang. */
const JENIS_KATA: Record<string, string> = {
  theme: 'theme',
  iconTheme: 'icons',
  snippet: 'snippets',
  keymap: 'keys',
  language: 'language',
  script: 'script',
  debugAdapter: 'debug adapter',
};

/*
 * Mirror of `bawaan_untuk` in `src-tauri/src/dap.rs`: which built-in adapter
 * answers for a debug `type`. Only the `type` string matters — that is the key
 * a launch.json configuration uses and the key the registry is looked up by.
 *
 * It is a mirror and not a second opinion: `dap.rs` has the test
 * `adapter_bawaan_sepakat_dengan_registry_yang_dipakai_dap_start`, which holds
 * this list still, so the panel cannot claim a type is served when the debugger
 * would refuse it (or the other way round).
 */
const DAP_BAWAAN: Record<string, string> = {
  node: 'node',
  'pwa-node': 'node',
  'node-terminal': 'node',
  'pwa-chrome': 'node',
  python: 'python',
  debugpy: 'python',
};

function ExtensionCard({
  item,
  onUninstall,
}: {
  item: KatalogItem;
  onUninstall: (item: KatalogItem) => void;
}) {
  const tr = useT();
  const tf = useTf();
  const sudah = useExt19((s) => s.manifests.find((m) => m.manifest?.id === item.id) ?? null);
  const menuFor = useExt19((s) => s.menuFor);
  const setMenu = useExt19((s) => s.setMenu);
  const setDetail = useExt19((s) => s.setDetail);
  const installKatalog = useExt19((s) => s.installKatalog);
  const setEnabled = useExt19((s) => s.setEnabled);
  const [sibuk, setSibuk] = useState(false);
  const btnGear = useRef<HTMLButtonElement | null>(null);

  const terpasang = !!sudah;
  const aktif = sudah?.enabled ?? false;
  const rusak = !!sudah?.error;

  /*
   * Installed and inert: the package is in the list, enabled, and applies
   * nothing. That is a state the card has to show, because it is
   * indistinguishable from a working package otherwise - the reason a user
   * files "I installed it and nothing happened".
   */
  const kosong = terpasang && !rusak && (sudah.pengaruh?.didukung.length ?? 0) === 0;

  /*
   * Jenis kontribusi yang benar-benar berlaku di sini, dibaca dari `pengaruh`
   * (hasil pemuatan loader), bukan dari `item.categories`: kategori katalog
   * bilang "apa ini di rak", ini bilang "apa yang berubah di editor". Kartu
   * yang cuma menambah dua snippet tidak lagi terlihat sama dengan kartu yang
   * mengganti tema.
   */
  const jenisBerlaku = Array.from(new Set((sudah?.pengaruh?.didukung ?? []).map((i) => i.kind).filter(Boolean)));
  /*
   * Label jujur dari `src/lib/labelPaket.ts` ("no-op" / "sudah didukung
   * bawaan"). Hanya paket bahasa yang kartunya menjanjikan lebih dari yang
   * diberikannya yang punya label; pemasangan/pelepasan tidak dipengaruhi.
   */
  const label = labelPaket(item.id);

  return (
    <article
      className={`xc${rusak ? ' is-broken' : ''}`}
      data-ext-card={item.id}
      data-terpasang={terpasang ? '1' : '0'}
      data-enabled={aktif ? '1' : '0'}
      data-inert={kosong ? '1' : '0'}
    >
      <span
        className={`xc-logo${item.logoUrl ? ' has-img' : ''}${item.logoColor ? ' has-color' : ''}`}
        aria-hidden="true"
        style={item.logoColor && !item.logoUrl ? { background: item.logoColor } : undefined}
      >
        <IkonExt item={item} logoUrl={item.logoUrl} />
      </span>

      <div className="xc-body">
        <span className="xc-nama">
          <span className="xc-nama-txt">{tr(item.name)}</span>
          {item.bundled && <span className="xc-tag">OFFLINE</span>}
          {item.perluRuntime && <span className="xc-tag is-err">needs runtime</span>}
          {rusak && <span className="xc-tag is-err">broken</span>}
          {/*
            * ENABLED / DISABLED, stated.
            *
            * WHY this chip exists: the only thing on the card that reflected the
            * switch was the ACTION BUTTON, which reads "Disable" while the
            * package is on. A reader scanning the list took that for a status
            * badge — "it says Disable, so it must be off" — and then reported
            * that installed extensions did nothing. The button says what a click
            * will do; this chip says what is true right now. Two different
            * questions, so two different places.
            */}
          {terpasang && !rusak && (
            <span
              className={`xc-tag${aktif ? ' is-on' : ' is-off'}`}
              data-testid={`xc-status-${item.id}`}
              data-enabled={aktif ? '1' : '0'}
            >
              {tr(aktif ? 'Enabled' : 'Disabled')}
            </span>
          )}
          {kosong && <span className="xc-tag is-err">no effect</span>}
          {jenisBerlaku.length > 0 && (
            <span
              className="xc-tag"
              data-jenis={jenisBerlaku.join(' ')}
              title={`contributions that take effect here: ${jenisBerlaku.map((k) => JENIS_KATA[k] ?? k).join(', ')}`}
            >
              {jenisBerlaku.map((k) => JENIS_KATA[k] ?? k).join('+')}
            </span>
          )}
          <span className="xc-pub-badge">{item.publisher}</span>
          <span className="xc-ver-badge">• v{sudah?.manifest?.version || item.version}</span>
          {item.categories[0] && <span className="xc-cat-badge">{item.categories[0]}</span>}
          {typeof item.unduhan === 'number' && item.unduhan > 0 && (
            <span className="xc-ver-badge">• {formatUnduhan(item.unduhan)}↓</span>
          )}
        </span>
        <span className="xc-desc">{tr(item.description)}</span>
        {label && (
          <span
            className={`xc-desc xc-label-jujur is-${label.jenis}`}
            data-testid={`xc-catatan-${item.id}`}
            data-jenis-label={label.jenis}
          >
            {label.teks}
          </span>
        )}
        {rusak && (
          <span className="xc-err" data-testid={`xc-err-${item.id}`}>
            {sudah?.error}
          </span>
        )}
        {kosong && (
          <span className="xc-err" data-testid={`xc-inert-${item.id}`}>
            Installed, but nothing in this package is applied here - open Details for the list of
            contributions Zephyr ignores and why.
          </span>
        )}
      </div>

      <div className="xc-aksi">
        {!terpasang ? (
          <button
            className="btn btn-sm btn-primary"
            data-testid={`xc-install-${item.id}`}
            disabled={sibuk || (!item.bundled && !item.url)}
            title={
              item.bundled
                ? tr('Install from the bundled catalog')
                : item.url
                  ? tf('Download & install v{version}', { version: item.version })
                  : tr('Not available offline')
            }
            onClick={async () => {
              setSibuk(true);
              await installKatalog(item);
              setSibuk(false);
            }}
          >
            {sibuk ? '…' : item.bundled ? 'Install' : 'Install'}
          </button>
        ) : (
          <button
            className="btn btn-sm"
            data-testid={`xc-toggle-${item.id}`}
            disabled={sibuk || rusak}
            onClick={async () => {
              setSibuk(true);
              await setEnabled(item.id, !aktif);
              setSibuk(false);
            }}
          >
            {aktif ? 'Disable' : 'Enable'}
          </button>
        )}

        <div className="xc-gear-wrap">
          <button
            ref={btnGear}
            className="xc-gear"
            data-testid={`xc-gear-${item.id}`}
            data-anchor-active={menuFor === item.id ? 'true' : 'false'}
            title={tr('Extension options')}
            aria-haspopup="menu"
            aria-expanded={menuFor === item.id}
            onClick={() => setMenu(menuFor === item.id ? null : item.id)}
          >
            <svg viewBox="0 0 16 16" className="xc-gear-ic" aria-hidden="true">
              <path
                d="M6.72 1.12L9.28 1.12L8.94 2.94L10.92 3.76L11.96 2.23L13.77 4.04L12.24 5.08L13.06 7.06L14.88 6.72L14.88 9.28L13.06 8.94L12.24 10.92L13.77 11.96L11.96 13.77L10.92 12.24L8.94 13.06L9.28 14.88L6.72 14.88L7.06 13.06L5.08 12.24L4.04 13.77L2.23 11.96L3.76 10.92L2.94 8.94L1.12 9.28L1.12 6.72L2.94 7.06L3.76 5.08L2.23 4.04L4.04 2.23L5.08 3.76L7.06 2.94Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          {menuFor === item.id && (
            <Popover
              anchor={btnGear.current}
              arah="down"
              sisi="right"
              className="xc-menu"
              testid={`xc-menu-${item.id}`}
              onClose={() => setMenu(null)}
            >
              <button
                className="xc-menu-item"
                role="menuitem"
                data-testid={`xc-details-${item.id}`}
                onClick={() => setDetail(item.id)}
              >
                Show Details
              </button>
              {terpasang && (
                <>
                  <button
                    className="xc-menu-item"
                    role="menuitem"
                    onClick={() => void setEnabled(item.id, !aktif)}
                  >
                    {aktif ? 'Disable' : 'Enable'}
                  </button>
                  <div className="xc-menu-sep" />
                  <button
                    className="xc-menu-item is-danger"
                    role="menuitem"
                    data-testid={`xc-uninstall-${item.id}`}
                    onClick={() => onUninstall(item)}
                  >
                    Uninstall
                  </button>
                </>
              )}
            </Popover>
          )}
        </div>
      </div>
    </article>
  );
}

/*
 * Satu entri katalog MCP sebagai kartu.
 *
 * Bentuknya sengaja mengikuti kartu ekstensi di atasnya (logo, nama, tag,
 * deskripsi, tombol aksi) supaya rak ini terbaca sebagai bagian dari panel yang
 * sama, bukan panel lain yang kebetulan menempel.
 *
 * Dua hal yang tidak ada di kartu ekstensi tapi wajib di sini:
 *
 *  - TRANSPORT ditampilkan apa adanya. "http" dan "stdio" bukan jargon untuk
 *    dihias: http berarti server sudah hidup di suatu URL dan Zephyr hanya
 *    menghubunginya, stdio berarti Zephyr yang menjalankan perintahnya di
 *    mesin ini. Pembaca berhak tahu mana yang terjadi sebelum menekan Install.
 *
 *  - BARIS JALAN diperlihatkan utuh (url atau `npx -y paket`). Tombol "Install"
 *    yang menyembunyikan perintah yang akan dijalankan meminta kepercayaan
 *    tanpa bukti; baris ini yang menjadikannya bisa diperiksa.
 */

function Details({ id }: { id: string }) {
  const tr = useT();
  const st = useExt19((s) => s.manifests.find((m) => m.manifest?.id === id) ?? null);
  const setDetail = useExt19((s) => s.setDetail);
  const katalog = KATALOG_BUNDLED.find((k) => k.id === id);
  const m = st?.manifest;

  const c = m?.contributes;

  /*
   * Catatan jujur per baris bahasa, dihitung dari manifest yang terpasang
   * (`.py` yang sudah dipegang bahasa bawaan tidak bisa diklaim lagi oleh
   * paket - lihat `bahasaTerpasang.ts`). Tabel tangan `labelPaket.ts` hanya
   * menutup 7 id bawaan; ini menutup paket lain, termasuk yang diunduh.
   */
  const catatanBahasa = catatanBahasaTerpasang(c, grammarBisaDimuat);

  /*
   * The same report the install panel shows, kept with the package so it is
   * still there tomorrow: what this package applies here (with the counts read
   * from its own files) and what Zephyr ignores, each with the reason.
   */
  const pengaruh = st?.pengaruh;

  const baris: Array<[string, string[]]> = [
    ['Themes', c?.themes.map((x) => x.label) ?? []],
    ['Keymaps', c?.keymaps.map((x) => x.label) ?? []],
    ['Snippets', c?.snippets.map((x) => x.language) ?? []],
    ['Languages', c?.languages.map((x) => `${x.label} (.${x.extensions.join(', .')})`) ?? []],
    ['Icon Themes', c?.iconThemes.map((x) => x.label) ?? []],
    ['Debug Adapters', (c?.debugAdapters ?? []).map((d) => (d.label ? `${d.label} (${d.type})` : d.type))],
    ['Commands', c?.commands.map((x) => x.title) ?? []],
  ];

  return (
    <div className="xd" data-testid="ext-details" data-ext-detail={id}>
      <div className="xd-head">
        <strong className="xd-title">{m?.name ?? katalog?.name ?? id}</strong>
        <button className="btn btn-sm" data-testid="ext-details-close" onClick={() => setDetail(null)}>
          Close
        </button>
      </div>

      {!m ? (
        <p className="xd-note">
          {tr('Not installed yet.')} {katalog ? tr(katalog.description) : ''}{' '}
          {tr('Install first to see the actual contributions from the manifest.')}
        </p>
      ) : (
        <>
          <p className="xd-note">{m.description ? tr(m.description) : tr('(no description)')}</p>
          <dl className="xd-list">
            <div>
              <dt>id</dt>
              <dd>
                <code>{m.id}</code>
              </dd>
            </div>
            <div>
              <dt>version</dt>
              <dd>{m.version || '-'}</dd>
            </div>
            <div>
              <dt>publisher</dt>
              <dd>{m.publisher || '-'}</dd>
            </div>
            <div>
              <dt>engine</dt>
              <dd>
                {m.engine || '(any)'} {m.engineOk ? '✓' : '✗ does not match'}
              </dd>
            </div>
            <div>
              <dt>manifest</dt>
              <dd>
                <code>{m.manifestFile}</code>
              </dd>
            </div>
            <div>
              <dt>folder</dt>
              <dd title={st!.path}>
                <code className="xd-path">{st!.path}</code>
              </dd>
            </div>
          </dl>

          <h4 className="xd-h4">Contributions</h4>
          <div className="xd-contribs" data-testid="ext-contribs">
            {baris.map(([nama, isi]) => (
              <div key={nama} className="xd-contrib" data-contrib={nama}>
                <span className="xd-contrib-nama">{nama}</span>
                <span className="xd-contrib-isi">
                  {isi.length === 0 ? <em>-</em> : isi.join(' · ')}
                </span>
              </div>
            ))}
          </div>

          {catatanBahasa.length > 0 && (
            <>
              <h4 className="xd-h4">Bahasa vs bawaan</h4>
              <div className="xd-contribs" data-testid="ext-catatan-bahasa">
                {catatanBahasa.map((n) => (
                  <div
                    key={n.label}
                    className="xd-contrib"
                    data-bahasa={n.label}
                    data-bahasa-noefek={n.noEfek ? '1' : '0'}
                    data-bahasa-grammar={
                      n.grammarBisaDimuat === null ? 'tidak-diperiksa' : n.grammarBisaDimuat ? 'bisa-dimuat' : 'tidak-bisa-dimuat'
                    }
                  >
                    <span className="xd-contrib-nama">{n.label}</span>
                    <span className="xd-contrib-isi">{n.teks}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/*
            * Debug Adapters get their own section, not just a row in the
            * Contributions list.
            *
            * A row reading "Acme Debugger (acme-dap)" looks exactly like a row
            * that works. It does not: Zephyr's debug registry is fixed
            * (`dap::adapter_bawaan` — node and python only) and no code path
            * reads `program`/`runtime` out of a manifest, so an adapter from a
            * package is never started. The status line below says which of the
            * two situations this is, so the panel never implies a working
            * debugger that is not there.
            */}
          {(c?.debugAdapters?.length ?? 0) > 0 && (
            <>
              <h4 className="xd-h4">Debug Adapters</h4>
              <div className="xd-contribs" data-testid="ext-debug-adapters">
                {c!.debugAdapters!.map((d, n) => {
                  const bawaan = DAP_BAWAAN[d.type?.trim().toLowerCase() ?? ''];
                  const asal = d.program
                    ? `${d.program}${d.runtime ? ` (runtime ${d.runtime})` : ''}`
                    : d.runtime
                      ? `runtime ${d.runtime}, no program`
                      : 'no program declared';
                  return (
                    <div
                      key={`${d.type}-${n}`}
                      className="xd-contrib"
                      data-dap={d.type}
                      data-dap-bawaan={bawaan ?? '0'}
                    >
                      <span className="xd-contrib-nama">{d.label || d.type}</span>
                      <span className="xd-contrib-isi">
                        type <code>{d.type}</code> · {asal} ·{' '}
                        {bawaan
                          ? `not started: type "${d.type}" is served by Zephyr's built-in ${bawaan} adapter, not by this package.`
                          : `not started: type "${d.type}" is not in Zephyr's fixed debug registry (node, python), and an adapter from a package is never launched.`}
                        {d.languages.length > 0 ? ` Languages: ${d.languages.join(', ')}.` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <h4 className="xd-h4">What this changes here</h4>
          <div className="xd-contribs" data-testid="ext-pengaruh">
            {(pengaruh?.didukung.length ?? 0) === 0 ? (
              <div className="xd-contrib" data-pengaruh="kosong">
                <span className="xd-contrib-nama">nothing</span>
                <span className="xd-contrib-isi">
                  This package is installed but Zephyr applies none of it: the window does not
                  change, now or after a reload.
                </span>
              </div>
            ) : (
              pengaruh!.didukung.map((i, n) => (
                <div key={`${i.kind}-${n}`} className="xd-contrib" data-pengaruh="didukung">
                  <span className="xd-contrib-nama">{i.kind}</span>
                  <span className="xd-contrib-isi">
                    {i.label} — {i.detail}
                  </span>
                </div>
              ))
            )}
          </div>

          {(pengaruh?.diabaikan.length ?? 0) > 0 && (
            <>
              <h4 className="xd-h4">Ignored here</h4>
              <ul className="xv-ringkas-skip" data-testid="ext-pengaruh-diabaikan">
                {pengaruh!.diabaikan.map((i, n) => (
                  <li key={`${i.kind}-${n}`}>
                    <b>{i.kind}</b> ({i.label}): {i.detail}
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="xd-warn">
            {m.main
              ? 'A main script ships with this package: Zephyr asks for approval and then runs it in the sandboxed extension host worker, so its own command handlers are the ones that answer.'
              : 'This package ships no main script, so the commands it declares have no handler: Zephyr shows no command for it and the declared ids do nothing.'}
          </p>
        </>
      )}
    </div>
  );
}

/*
 * What the loader actually did.
 *
 * Installing a package used to change nothing visible: a theme whose tokens the
 * loader did not recognise, a keymap bound to a command Zephyr does not have, a
 * language whose extension already had an owner - all of them were skipped in
 * silence, and the panel looked exactly the same before and after. Two lists fix
 * that: `gagal` (something broke) and `tidakDidukung` (it loaded, but this
 * version cannot use it), both with the reason in words.
 *
 * `ringkasan` is rebuilt on every refresh, so it answers "why did nothing
 * happen when I installed this" directly under the toolbar.
 */
function RingkasLoader({ ringkasan }: { ringkasan: LoaderRingkasan }) {
  const { themes, keymaps, snippets, languages, commands, iconThemes, gagal, tidakDidukung } =
    ringkasan;

  /* How many of each contribution the loader took. Zero-count rows are dropped
     so the line reads as a summary rather than a spreadsheet. */
  const semuaJumlah: Array<[string, number]> = [
    ['themes', themes.length],
    ['languages', languages.length],
    ['snippets', snippets],
    ['keymaps', keymaps],
    ['icon themes', iconThemes],
    ['commands', commands],
  ];
  const jumlah = semuaJumlah.filter((baris) => baris[1] > 0);

  const adaMasalah = gagal.length > 0 || tidakDidukung.length > 0;
  if (jumlah.length === 0 && !adaMasalah) return null;

  /* Both lists are unbounded in principle - one bad registry can produce
     hundreds of rows - so they are cut off with a count of what is hidden. */
  const BATAS = 12;
  const sisaGagal = gagal.length - BATAS;
  const sisaSkip = tidakDidukung.length - BATAS;

  return (
    <div className="xv-ringkas" data-testid="ext-ringkas" role="status">
      <div className="xv-ringkas-judul">Loader report</div>
      {jumlah.length > 0 && (
        <div className="xv-ringkas-baris" data-testid="ext-ringkas-jumlah">
          {jumlah.map(([label, n]) => `${n} ${label}`).join(' \u00b7 ')}
        </div>
      )}
      {gagal.length > 0 && (
        <ul className="xv-ringkas-gagal" data-testid="ext-ringkas-gagal">
          {gagal.slice(0, BATAS).map((g, i) => (
            <li key={`${g.id}-${i}`}>
              <b>{g.id}</b>: {g.alasan}
            </li>
          ))}
          {sisaGagal > 0 && <li>+{sisaGagal} more failures</li>}
        </ul>
      )}
      {tidakDidukung.length > 0 && (
        <ul className="xv-ringkas-skip" data-testid="ext-ringkas-skip">
          {tidakDidukung.slice(0, BATAS).map((g, i) => (
            <li key={`${g.id}-${i}`}>
              <b>{g.id}</b> ({g.fitur}): {g.alasan}
            </li>
          ))}
          {sisaSkip > 0 && <li>+{sisaSkip} more skipped entries</li>}
        </ul>
      )}
      {!adaMasalah && (
        <div className="xv-ringkas-baris" data-testid="ext-ringkas-bersih">
          Every installed package loaded. Nothing was skipped.
        </div>
      )}
    </div>
  );
}

export default function ExtensionsView() {
  const tr = useT();
  const q = useExt19((s) => s.q);
  const tab = useExt19((s) => s.tab);
  const loading = useExt19((s) => s.loading);
  const err = useExt19((s) => s.err);
  const perluReload = useExt19((s) => s.perluReload);
  const detailFor = useExt19((s) => s.detailFor);
  const remoteUrl = useExt19((s) => s.remoteUrl);
  const remoteErr = useExt19((s) => s.remoteErr);
  
  const remote = useExt19((s) => s.remote);
  const jmlManifest = useExt19((s) => s.manifests.length);
  const ringkasan = useExt19((s) => s.ringkasan);

  const setQ = useExt19((s) => s.setQ);
  const setTab = useExt19((s) => s.setTab);
  const kategori = useExt19((s) => s.kategori);
  const setKategori = useExt19((s) => s.setKategori);
  const refresh = useExt19((s) => s.refresh);
  const installDariDialog = useExt19((s) => s.installDariDialog);
  const reloadWindow = useExt19((s) => s.reloadWindow);
  const [menuAksi, setMenuAksi] = useState(false);
  const btnAksi = useRef<HTMLButtonElement | null>(null);

  /*
   * Satu dialog hapus untuk DUA rak.
   *
   * Kartu ekstensi dan kartu server MCP sama-sama menawarkan Uninstall, dan
   * keduanya memakai dialog ini - bukan dua dialog yang harus dijaga agar
   * sama bunyinya. `jenis` yang membedakan: `ext` menghapus folder paket,
   * `mcp` menghapus entri dari settings.json.
   */
  const [uninstallTarget, setUninstallTarget] = useState<
    { jenis: 'ext'; item: KatalogItem } | { jenis: 'mcp'; id: string; nama: string } | null
  >(null);
  const [sibukUninstall, setSibukUninstall] = useState(false);
  const uninstallTrapRef = useFocusTrap<HTMLDivElement>({
    aktif: !!uninstallTarget,
    onEscape: () => setUninstallTarget(null),
  });

  const workspace = useStore((s) => s.workspace);
  const anakRoot = useExplorer((s) => (workspace ? s.children[workspace] : undefined));
  const bahasa = useMemo(() => {
    const set = new Set<string>();
    for (const n of anakRoot ?? []) {
      if (n.isDir) continue;
      const l = detectLang(n.name);
      if (l !== 'plain') set.add(l);
    }
    return Array.from(set);
  }, [anakRoot]);

  useEffect(() => {
    setBahasaWorkspace(bahasa);
  }, [bahasa]);

  useEffect(() => {
    if (jmlManifest === 0) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Load the catalogue on mount, not only when the marketplace tab is open.
   *
   * The fetch was gated on `tab === 'marketplace'`, so the Installed and
   * Recommended tabs rendered empty until the user happened to visit the third
   * tab first: `hasil()` reads the remote list, which was still unset. One
   * request on mount — and again whenever the search text or a category filter
   * changes, since the backend filters — makes all three tabs answer
   * immediately. The guard keeps a keystroke from queueing a request per letter
   * when the list is already filtered by the same query.
   */
  useEffect(() => {
    const st = useExt19.getState();
    if (st.remoteErr) return;
    if (st.remote && st.remote.length > 0 && st.remoteUrl === 'native' && !q) return;
    void st.muatRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, kategori]);

  const daftar = useExt19.getState().hasil();

  const remoteBersih = (remote ?? []).filter((it) => !it.perluRuntime);

  /*
   * The Category dropdown lists every category in the whole catalogue, not just
   * the ones left after the current query.
   *
   * It used to be derived from `remoteBersih`, which the search box rewrites on
   * every keystroke: typing "rust" narrowed the list to extensions matching
   * "rust", the dropdown was rebuilt from that subset, and every other category
   * disappeared from the menu mid-search. Categories are a property of the
   * catalogue, so they are computed from the unfiltered catalogue instead.
   */
  const semuaKategori = Array.from(
    new Set((remote ?? []).flatMap((it) => it.categories)),
  ).sort();

  /*
   * A count on each tab.
   *
   * Without one, "Installed" and "Recommended" were indistinguishable from
   * "Marketplace" until opened, and a tab that turns out to be empty reads as a
   * broken panel rather than an empty one. These are the unfiltered totals —
   * the count should not move as the user types in the search box, otherwise
   * the badge becomes a second, noisier search result.
   */
  const JUMLAH: Record<ExtTab, number> = {
    installed: jmlManifest,
    recommended: useExt19.getState().rekomendasi.length,
    marketplace: remoteBersih.length,
    /*
     * The three kind tabs are counted from their own stores. These are read
     * through `getState()` rather than hooks because `JUMLAH` is a plain object
     * built during render - calling a hook inside an object literal would make
     * the hook order depend on the branch, which React forbids.
     */
    plugins: usePlugins.getState().daftar.length + usePlugins.getState().pasar.length,
    skills: useSkills.getState().daftar.length,
    mcp: KATALOG_MCP_SERVER.length,
  };

  void q;
  void tab;
  void jmlManifest;
  void remote;

  return (
    <div className="xv" data-testid="extensions-view">
      <div className="xv-head">
        <input
          className="xv-search"
          data-testid="ext-search"
          placeholder={tr('Search extensions…')}
          aria-label={tr('Search extensions')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="xv-actions-menu">
          <button
            ref={btnAksi}
            className="xv-actions-btn"
            data-testid="ext-actions-btn"
            data-anchor-active={menuAksi ? 'true' : 'false'}
            title={tr('Extension actions')}
            aria-haspopup="menu"
            aria-expanded={menuAksi}
            onClick={() => setMenuAksi(!menuAksi)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <circle cx="8" cy="3" r="1.4" fill="currentColor" />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" />
              <circle cx="8" cy="13" r="1.4" fill="currentColor" />
            </svg>
          </button>
          {menuAksi && (
            <Popover
              anchor={btnAksi.current}
              arah="down"
              sisi="right"
              className="xv-actions-pop"
              testid="ext-actions-menu"
              onClose={() => setMenuAksi(false)}
            >
              <button
                data-testid="ext-install-folder"
                onClick={() => {
                  setMenuAksi(false);
                  void installDariDialog(true);
                }}
              >
                Install from Folder…
              </button>
              <button
                data-testid="ext-install-zext"
                onClick={() => {
                  setMenuAksi(false);
                  void installDariDialog(false);
                }}
              >
                Install from .zext…
              </button>
              <div className="xc-menu-sep" />
              <button data-testid="ext-reload-list" onClick={() => void refresh()}>
                Reload
              </button>
            </Popover>
          )}
        </div>
      </div>

      <div className="xv-tabs" role="tablist" aria-label={tr('Extension groups')}>
        {TAB_TAMPIL.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`xv-tab${tab === t ? ' is-active' : ''}`}
            data-testid={`ext-tab-${t}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
            <span className="xv-tab-jumlah">{JUMLAH[t]}</span>
          </button>
        ))}
      </div>

    {perluReload && (
        <div className="xv-reload" data-testid="ext-reload-bar" role="status">
          <button className="btn btn-sm btn-primary" data-testid="ext-reload" onClick={reloadWindow}>
            Reload
          </button>
        </div>
      )}

      {err && (
        <p className="xv-err" data-testid="ext-err" role="alert">
          {err}
        </p>
      )}
      {/*
        * The loader report is about EXTENSION packages — how many themes,
        * languages and snippets the loader took. It belongs on the Extensions
        * tab only: on Plugins/Skills/MCP it would sit under a list of something
        * else and read as a report about THAT.
        */}
      {(tab === 'installed' || tab === 'marketplace' || tab === 'recommended') && (
        <RingkasLoader ringkasan={ringkasan} />
      )}

      {/*
        * The bundled catalog lives in this tab, so an empty registry is no
        * longer an error state — it just means the list is bundled-only. The
        * note stays because the user should know why the list is short.
        */}
      {tab === 'marketplace' && !remoteUrl && (
        <p className="xv-note" data-testid="ext-market-off">
          {tr('No extension registry is configured - showing the packages bundled with Zephyr. Install from .zext or a folder also works.')}
        </p>
      )}
      {tab === 'marketplace' && remoteUrl && remoteErr && (
        <p className="xv-note" data-testid="ext-market-err">
          Registry could not be read: {remoteErr}
        </p>
      )}
      {tab === 'recommended' && bahasa.length === 0 && (
        <p className="xv-note" data-testid="ext-rec-empty">
          {tr('Open a project folder first - recommendations are computed from the file languages in the workspace.')}
        </p>
      )}

      {tab === 'marketplace' && remoteBersih.length > 0 && (
        <div className="xv-filter" data-testid="ext-filter">
          <label htmlFor="ext-filter-kat">Category</label>
          <select
            id="ext-filter-kat"
            value={kategori}
            onChange={(e) => setKategori(e.target.value)}
            data-testid="ext-filter-select"
          >
            <option value="">All</option>
            {semuaKategori.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
          </select>
        </div>
      )}

      {/*
        * ONE KIND PER TAB, one card layout for all of them.
        *
        * The outer rail already names the kind (Plugins, Skills, MCP,
        * Extensions), so each branch renders that kind alone with no inner tab
        * row - which is what removes the extra scrolling: a sub-tab row under a
        * tab row costs vertical space and says nothing the rail did not say.
        */}
      {tab === 'plugins' || tab === 'skills' || tab === 'mcp' || tab === 'marketplace' ? (
        <ExtMarketplace hanya={tab === 'marketplace' ? 'extensions' : tab} />
      ) : (
        <div className="xv-list" data-testid="ext-cards">
          {loading && daftar.length === 0 && <p className="xv-note">Loading…</p>}
          {daftar.map((it) => (
            <ExtensionCard
              key={it.id}
              item={it}
              onUninstall={(x) => setUninstallTarget({ jenis: 'ext', item: x })}
            />
          ))}
          {!loading && daftar.length === 0 && (
            <p className="xv-note" data-testid="ext-kosong">
              Nothing matches “{q}”.
            </p>
          )}
        </div>
      )}

      {uninstallTarget && (
        <div
          className="modal-backdrop"
          role="presentation"
          data-testid="ext-uninstall-confirm"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setUninstallTarget(null);
          }}
        >
          <div
            className="modal"
            ref={uninstallTrapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ext-uninstall-title"
          >
            <h2 className="modal-title" id="ext-uninstall-title" data-testid="ext-uninstall-title">
              {uninstallTarget.jenis === 'mcp'
                ? `Delete ${uninstallTarget.nama}?`
                : `Delete ${uninstallTarget.item.name}?`}
            </h2>
            <div className="modal-actions">
              <button
                className="btn btn-danger"
                data-testid="ext-uninstall-ok"
                disabled={sibukUninstall}
                onClick={async () => {
                  setSibukUninstall(true);
                  if (uninstallTarget.jenis === 'mcp') {
                    await useMcp.getState().removeServer(uninstallTarget.id);
                  } else {
                    await useExt19.getState().uninstall(uninstallTarget.item.id);
                  }
                  setSibukUninstall(false);
                  setUninstallTarget(null);
                }}
              >
                {sibukUninstall ? '…' : tr('Delete')}
              </button>
              <button
                className="btn"
                data-testid="ext-uninstall-cancel"
                onClick={() => setUninstallTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {detailFor && <Details id={detailFor} />}
    </div>
  );
}
