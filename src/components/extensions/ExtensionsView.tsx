import { useEffect, useMemo } from 'react';
import { useExt19, setBahasaWorkspace, type ExtTab } from '../../lib/extensionsStore19';
import { KATALOG_BUNDLED, type KatalogItem } from '../../lib/extCatalog';
import { ikonEkstensi, inlineIkonDataUri } from '../../lib/extIkon';
import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { detectLang } from '../../lib/lang';
import Popover from '../shell/Popover';
import { useRef, useState } from 'react';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { useT, useTf } from '../../lib/i18n';

const TAB_LABEL: Record<ExtTab, string> = {
  installed: 'Installed',
  recommended: 'Recommended',
  marketplace: 'Marketplace',
};

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

  return (
    <article
      className={`xc${rusak ? ' is-broken' : ''}`}
      data-ext-card={item.id}
      data-terpasang={terpasang ? '1' : '0'}
      data-enabled={aktif ? '1' : '0'}
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
          <span className="xc-pub-badge">{item.publisher}</span>
          <span className="xc-ver-badge">• v{sudah?.manifest?.version || item.version}</span>
          {item.categories[0] && <span className="xc-cat-badge">{item.categories[0]}</span>}
          {typeof item.unduhan === 'number' && item.unduhan > 0 && (
            <span className="xc-ver-badge">• {formatUnduhan(item.unduhan)}↓</span>
          )}
        </span>
        <span className="xc-desc">{tr(item.description)}</span>
        {rusak && (
          <span className="xc-err" data-testid={`xc-err-${item.id}`}>
            {sudah?.error}
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

function Details({ id }: { id: string }) {
  const tr = useT();
  const st = useExt19((s) => s.manifests.find((m) => m.manifest?.id === id) ?? null);
  const setDetail = useExt19((s) => s.setDetail);
  const katalog = KATALOG_BUNDLED.find((k) => k.id === id);
  const m = st?.manifest;

  const c = m?.contributes;
  const baris: Array<[string, string[]]> = [
    ['Themes', c?.themes.map((x) => x.label) ?? []],
    ['Keymaps', c?.keymaps.map((x) => x.label) ?? []],
    ['Snippets', c?.snippets.map((x) => x.language) ?? []],
    ['Languages', c?.languages.map((x) => `${x.label} (.${x.extensions.join(', .')})`) ?? []],
    ['Icon Themes', c?.iconThemes.map((x) => x.label) ?? []],
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

          <p className="xd-warn">
            The extension JS code is not executed (v1 manifest-only). Registered commands
            use Zephyr's built-in handlers; the extension's own handlers are ignored.
          </p>
        </>
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
  const info = useExt19((s) => s.info);
  const perluReload = useExt19((s) => s.perluReload);
  const detailFor = useExt19((s) => s.detailFor);
  const remoteUrl = useExt19((s) => s.remoteUrl);
  const remoteErr = useExt19((s) => s.remoteErr);
  
  const remote = useExt19((s) => s.remote);
  const jmlManifest = useExt19((s) => s.manifests.length);

  const setQ = useExt19((s) => s.setQ);
  const setTab = useExt19((s) => s.setTab);
  const kategori = useExt19((s) => s.kategori);
  const setKategori = useExt19((s) => s.setKategori);
  const refresh = useExt19((s) => s.refresh);
  const installDariDialog = useExt19((s) => s.installDariDialog);
  const reloadWindow = useExt19((s) => s.reloadWindow);
  const [menuAksi, setMenuAksi] = useState(false);
  const btnAksi = useRef<HTMLButtonElement | null>(null);

  const [uninstallTarget, setUninstallTarget] = useState<KatalogItem | null>(null);
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
  const tersembunyiRuntime = (remote ?? []).filter((it) => it.perluRuntime).length;

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
        {(Object.keys(TAB_LABEL) as ExtTab[]).map((t) => (
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
          <span>{tr('Theme/keymap/language changes take effect after reload.')}</span>
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
      {info && !err && (
        <p className="xv-info" data-testid="ext-info" role="status">
          {info}
        </p>
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
            {Array.from(new Set(remoteBersih.flatMap((it) => it.categories)))
              .sort()
              .map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
          </select>
        </div>
      )}

      <div className="xv-list" data-testid="ext-cards">
        {loading && daftar.length === 0 && <p className="xv-note">Loading…</p>}
        {daftar.map((it) => (
          <ExtensionCard key={it.id} item={it} onUninstall={setUninstallTarget} />
        ))}
        {!loading && daftar.length === 0 && tab !== 'marketplace' && (
          <p className="xv-note" data-testid="ext-kosong">
            Nothing matches “{q}”.
          </p>
        )}
        {!loading && daftar.length === 0 && tab === 'marketplace' && remote && (
          <p className="xv-note" data-testid="ext-market-empty">
            {tersembunyiRuntime > 0
              ? `Showing manifest-only extensions. ${tersembunyiRuntime} extensions are hidden because they need an external runtime (Python/Java/Node/Docker) that Zephyr v1 does not support.`
              : `No manifest-only extension matches “${q}”. Use the bundled catalog or Install from .zext/folder.`}
          </p>
        )}
      </div>

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
              Delete {uninstallTarget.name}?
            </h2>
            <p className="modal-body" data-testid="ext-uninstall-body">
              {tr('The extension folder will be deleted PERMANENTLY (cannot be undone).')}
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-danger"
                data-testid="ext-uninstall-ok"
                disabled={sibukUninstall}
                onClick={async () => {
                  setSibukUninstall(true);
                  await useExt19.getState().uninstall(uninstallTarget.id);
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
