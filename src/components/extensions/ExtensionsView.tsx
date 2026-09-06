// ExtensionsView.tsx — panel Extensions di SIDEBAR KIRI (fase 19.1).
//
// LOKASI (prompt 19.1, jangan dipindah): ikon di ActivityBar tepi kiri →
// panel ini di Sidebar. Menu atas & Ctrl+Shift+X cuma pintasan ke sini.
// Settings → Extensions (fase 13) TETAP ada dan mengurus daftar bawaan; panel
// ini yang mengurus paket native: cari, install, enable, uninstall, details.
//
// Tiga grup sesuai 19.1: INSTALLED, RECOMMENDED (dari bahasa di workspace),
// MARKETPLACE (registry remote; kosong = "tidak tersedia", BUKAN error).

import { useEffect, useMemo } from 'react';
import { useExt19, setBahasaWorkspace, type ExtTab } from '../../lib/extensionsStore19';
import { KATALOG_BUNDLED, type KatalogItem } from '../../lib/extCatalog';
import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { detectLang } from '../../lib/lang';
import Popover from '../shell/Popover';
import { useRef, useState } from 'react';

const TAB_LABEL: Record<ExtTab, string> = {
  installed: 'Installed',
  recommended: 'Recommended',
  marketplace: 'Marketplace',
};

/** Kartu satu ekstensi (19.1 ExtensionCard). */
function ExtensionCard({ item }: { item: KatalogItem }) {
  const sudah = useExt19((s) => s.manifests.find((m) => m.manifest?.id === item.id) ?? null);
  const menuFor = useExt19((s) => s.menuFor);
  const setMenu = useExt19((s) => s.setMenu);
  const setDetail = useExt19((s) => s.setDetail);
  const installKatalog = useExt19((s) => s.installKatalog);
  const setEnabled = useExt19((s) => s.setEnabled);
  const uninstall = useExt19((s) => s.uninstall);
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
      <span className={`xc-logo${item.logoUrl ? ' has-img' : ''}`} aria-hidden="true">
        {item.logoUrl ? (
          <img
            src={item.logoUrl}
            alt=""
            loading="lazy"
            className="xc-logo-img"
            data-logo-src={item.id}
            // Logo gagal dimuat / diblokir → jatuh ke inisial (tidak ada
            // kotak kosong di daftar).
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.closest('.xc-logo');
              if (parent && parent.textContent === '') parent.textContent = item.logo;
            }}
            onLoad={(e) => {
              // naturalWidth 0 = gambar kosong/rusak walau "complete"
              if (e.currentTarget.naturalWidth === 0) {
                e.currentTarget.style.display = 'none';
                const parent = e.currentTarget.closest('.xc-logo');
                if (parent && parent.textContent === '') parent.textContent = item.logo;
              }
            }}
          />
        ) : (
          item.logo
        )}
      </span>

      <div className="xc-body">
        <span className="xc-nama">
          <span className="xc-nama-txt">{item.name}</span>
          {item.bundled && <span className="xc-tag">offline</span>}
          {rusak && <span className="xc-tag is-err">rusak</span>}
          <span className="xc-meta">
            {item.publisher} · v{sudah?.manifest?.version || item.version} ·{' '}
            {item.categories.join(', ')}
          </span>
        </span>
        <span className="xc-desc">{item.description}</span>
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
                ? 'Pasang dari katalog bundled'
                : item.url
                  ? `Unduh & pasang v${item.version}`
                  : 'Belum tersedia offline'
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
            title="Opsi ekstensi"
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
                    onClick={() => {
                      // Konfirmasi wajib (19.4) — hapus folder tidak bisa dibatalkan.
                      if (window.confirm(`Hapus ${item.name}?`)) void uninstall(item.id);
                    }}
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

/** Panel kanan: readme + daftar kontribusi (19.1 Show Details). */
function Details({ id }: { id: string }) {
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
          Tutup
        </button>
      </div>

      {!m ? (
        <p className="xd-note">
          Belum terpasang. {katalog?.description ?? ''} Pasang dulu untuk melihat kontribusi
          sebenarnya dari manifest.
        </p>
      ) : (
        <>
          <p className="xd-note">{m.description || '(tanpa deskripsi)'}</p>
          <dl className="xd-list">
            <div>
              <dt>id</dt>
              <dd>
                <code>{m.id}</code>
              </dd>
            </div>
            <div>
              <dt>versi</dt>
              <dd>{m.version || '-'}</dd>
            </div>
            <div>
              <dt>penerbit</dt>
              <dd>{m.publisher || '-'}</dd>
            </div>
            <div>
              <dt>engine</dt>
              <dd>
                {m.engine || '(bebas)'} {m.engineOk ? '✓' : '✗ tidak cocok'}
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

          <h4 className="xd-h4">Kontribusi</h4>
          <div className="xd-contribs" data-testid="ext-contribs">
            {baris.map(([nama, isi]) => (
              <div key={nama} className="xd-contrib" data-contrib={nama}>
                <span className="xd-contrib-nama">{nama}</span>
                <span className="xd-contrib-isi">
                  {isi.length === 0 ? <em>—</em> : isi.join(' · ')}
                </span>
              </div>
            ))}
          </div>

          <p className="xd-warn">
            Kode JS ekstensi tidak dijalankan (v1 manifest-only). Command yang terdaftar
            memakai handler bawaan Zephyr; handler milik ekstensi diabaikan.
          </p>
        </>
      )}
    </div>
  );
}

export default function ExtensionsView() {
  const q = useExt19((s) => s.q);
  const tab = useExt19((s) => s.tab);
  const loading = useExt19((s) => s.loading);
  const err = useExt19((s) => s.err);
  const info = useExt19((s) => s.info);
  const perluReload = useExt19((s) => s.perluReload);
  const detailFor = useExt19((s) => s.detailFor);
  const remoteUrl = useExt19((s) => s.remoteUrl);
  const remoteErr = useExt19((s) => s.remoteErr);
  // Subscribe ke `remote` — TANPA ini daftar Marketplace tidak pernah muncul:
  // `daftar` dihitung dari getState().hasil() di bawah, dan render baru hanya
  // terjadi kalau ada state yang di-subscribe berubah. `muatRemote()` mengubah
  // `remote` secara async; tanpa subscribe, komponen diam walau data sudah
  // datang (bug: tab Marketplace tampak kosong).
  const remote = useExt19((s) => s.remote);
  const jmlManifest = useExt19((s) => s.manifests.length);

  const setQ = useExt19((s) => s.setQ);
  const setTab = useExt19((s) => s.setTab);
  const refresh = useExt19((s) => s.refresh);
  const installDariDialog = useExt19((s) => s.installDariDialog);
  const reloadWindow = useExt19((s) => s.reloadWindow);
  const [menuAksi, setMenuAksi] = useState(false);
  const btnAksi = useRef<HTMLButtonElement | null>(null);

  // Bahasa di workspace → dasar tab RECOMMENDED (19.1).
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

  // Marketplace: muat registry remote setiap kali tabnya dibuka (dan saat
  // pencarian berubah) supaya daftar tidak basi.
  useEffect(() => {
    if (tab === 'marketplace') {
      void useExt19.getState().muatRemote();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, q, remoteUrl]);

  // `hasil()` FUNGSI, bukan selector — selector yang mengembalikan array baru
  // memicu "Maximum update depth exceeded" di zustand v5 (pelajaran fase 09).
  const daftar = useExt19.getState().hasil();
  // Dipaksa ikut render ulang saat state yang relevan berubah.
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
          placeholder="Cari ekstensi…"
          aria-label="Cari ekstensi"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="xv-actions-menu">
          <button
            ref={btnAksi}
            className="xv-actions-btn"
            data-testid="ext-actions-btn"
            title="Tindakan ekstensi"
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
                Install from .vsix…
              </button>
              <div className="xc-menu-sep" />
              <button data-testid="ext-reload-list" onClick={() => void refresh()}>
                Muat ulang
              </button>
            </Popover>
          )}
        </div>
      </div>

      <div className="xv-tabs" role="tablist" aria-label="Kelompok ekstensi">
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
          </button>
        ))}
      </div>

    {perluReload && (
        <div className="xv-reload" data-testid="ext-reload-bar" role="status">
          <span>Perubahan tema/keymap/bahasa berlaku setelah reload.</span>
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

      {tab === 'marketplace' && !remoteUrl && (
        <p className="xv-note" data-testid="ext-market-off">
          Marketplace tidak tersedia — belum ada URL registry yang dikonfigurasi. Katalog
          bundled dan install dari folder/.zext tetap berfungsi.
        </p>
      )}
      {tab === 'marketplace' && remoteUrl && remoteErr && (
        <p className="xv-note" data-testid="ext-market-err">
          Registry tidak bisa dibaca: {remoteErr}
        </p>
      )}
      {tab === 'recommended' && bahasa.length === 0 && (
        <p className="xv-note" data-testid="ext-rec-empty">
          Buka folder proyek dulu — rekomendasi dihitung dari bahasa file di workspace.
        </p>
      )}

      <div className="xv-list" data-testid="ext-cards">
        {loading && daftar.length === 0 && <p className="xv-note">Memuat…</p>}
        {daftar.map((it) => (
          <ExtensionCard key={it.id} item={it} />
        ))}
        {!loading && daftar.length === 0 && tab !== 'marketplace' && (
          <p className="xv-note" data-testid="ext-kosong">
            Tidak ada yang cocok dengan “{q}”.
          </p>
        )}
      </div>

      {detailFor && <Details id={detailFor} />}
    </div>
  );
}
