import { useEffect, useState, type ReactNode } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { folderDialogOpen, revealPath } from '../../lib/commands';
import { useT } from '../../lib/i18n';
import type { TampilanAgents } from '../../lib/agentsWindow';

/*
 * Sidebar jendela Agents.
 *
 * Bentuknya mengikuti acuan TRAE (`Referensi TRAE Agent Window/Kiri TRAE.png`):
 *
 *   New task · Marketplace · Automation · My Artifacts
 *   Projects ⌄                    [collapse] [view options]
 *     Zephyr ⌄            ⋯  ⊕
 *        Test        ⋮
 *        Halo        ⋮
 *   Default ⌄
 *     ...
 *
 * Yang penting di berkas ini:
 *
 * 1. PERCAKAPAN TAMPIL DI BAWAH PROYEKNYA. Dulu baris proyek hanya mewakili
 *    percakapan terbarunya, jadi folder "Zephyr" tidak pernah memperlihatkan
 *    chat-chat di dalamnya — persis keluhan "di kiri Zephyr chat-nya belum
 *    muncul". Sekarang tiap proyek punya chevron yang membuka daftar chat-nya.
 *
 * 2. MENU HOVER seperti acuan: baris tugas punya ⋮ (Pin / Open in Explorer /
 *    File Management / Rename / Delete Task) dan kartu info (Local Task, path,
 *    "Updated at"). Baris proyek punya ⋯ (Create a new task / File Management /
 *    Open in Explorer / Add Folder / Delete) plus tombol ⊕.
 *
 * 3. View Options di kepala daftar: Grouped View ⇄ List View, Filter All/Local.
 *    Cloud sengaja tidak bisa dipilih: Zephyr belum punya task cloud, dan
 *    pilihan yang tidak mengubah apa pun lebih buruk daripada tidak ada.
 *
 * 4. IKON LINE-STYLE ABU-ABU (permintaan user) — `currentColor`, ikut redup
 *    bersama barisnya.
 *
 * 5. Footer akun dihapus atas permintaan user.
 */

/* Composer id permukaan Agents. Sama dengan yang dipakai `mirrorRun` di
   `aiStore`, jadi draft dan sesi aktif tinggal memakai kunci yang sudah ada. */
const COMPOSER = 'agents';

function Ikon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="agx-ikon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IkonPlusBulat = () => (
  <Ikon>
    <circle cx="8" cy="8" r="5.9" />
    <path d="M8 5.4v5.2M5.4 8h5.2" />
  </Ikon>
);

const IkonPasar = () => (
  <Ikon>
    <rect x="1.8" y="1.8" width="5.2" height="5.2" rx="0.8" />
    <rect x="1.8" y="9" width="5.2" height="5.2" rx="0.8" />
    <rect x="9" y="9" width="5.2" height="5.2" rx="0.8" />
    <rect x="9.6" y="1.2" width="5.2" height="5.2" rx="0.8" strokeDasharray="2 1.4" />
  </Ikon>
);

const IkonJam = () => (
  <Ikon>
    <circle cx="8" cy="8" r="5.9" />
    <path d="M8 4.8V8l2.2 1.5" />
  </Ikon>
);

const IkonKotak = () => (
  <Ikon>
    <path d="M2.6 5.1 8 2.3l5.4 2.8v5.8L8 13.7l-5.4-2.8z" />
    <path d="M2.6 5.1 8 7.9l5.4-2.8M8 7.9v5.8" />
  </Ikon>
);

const IkonFolder = () => (
  <Ikon>
    <path d="M2.4 4.6a1 1 0 0 1 1-1h2.5l1.3 1.6h5.4a1 1 0 0 1 1 1v5.6a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1z" />
  </Ikon>
);

const IkonChevron = ({ buka }: { buka: boolean }) => (
  <Ikon>
    <path d={buka ? 'M4.6 6.4 8 9.8l3.4-3.4' : 'M6.4 4.6 9.8 8l-3.4 3.4'} />
  </Ikon>
);

const IkonPanahKeluar = () => (
  <Ikon>
    <path d="M9.4 2.8h3.8v3.8M13.2 2.8 8.2 7.8" />
    <path d="M12 9.6v2.6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2.6" />
  </Ikon>
);

const IkonFilter = () => (
  <Ikon>
    <path d="M3 4.4h10M5 8h6M6.6 11.6h2.8" />
  </Ikon>
);

/* Titik-tiga vertikal untuk menu baris tugas. */
const IkonTitik = () => (
  <Ikon>
    <circle cx="8" cy="3.4" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="12.6" r="0.9" fill="currentColor" stroke="none" />
  </Ikon>
);

/* Titik-tiga horizontal untuk menu baris proyek. */
const IkonTitikJajar = () => (
  <Ikon>
    <circle cx="3.4" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12.6" cy="8" r="0.9" fill="currentColor" stroke="none" />
  </Ikon>
);

const IkonPin = () => (
  <Ikon>
    <path d="M9.4 2.4 13 6l-1.4 1.4-1.2-.4-2.3 2.3.5 2-1.2 1.2-3.9-3.9 1.2-1.2 2 .5 2.3-2.3-.4-1.2z" />
  </Ikon>
);

const IkonPena = () => (
  <Ikon>
    <path d="M10.6 2.9 13.1 5.4 5.9 12.6l-3.3.8.8-3.3z" />
  </Ikon>
);

const IkonSampah = () => (
  <Ikon>
    <path d="M2.8 4.4h10.4M6.4 4.4V3.1a.7.7 0 0 1 .7-.7h1.8a.7.7 0 0 1 .7.7v1.3" />
    <path d="M4.3 4.4l.6 8.1a.9.9 0 0 0 .9.8h4.4a.9.9 0 0 0 .9-.8l.6-8.1" />
    <path d="M6.8 7v4M9.2 7v4" />
  </Ikon>
);

const IkonDaftar = () => (
  <Ikon>
    <path d="M5.6 4.2h8M5.6 8h8M5.6 11.8h8" />
    <circle cx="2.9" cy="4.2" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="2.9" cy="8" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="2.9" cy="11.8" r="0.8" fill="currentColor" stroke="none" />
  </Ikon>
);

/* Nama pendek folder terakhir dari sebuah path, untuk label grup. */
function namaFolder(akar: string): string {
  const bagian = akar.split(/[\\/]+/).filter(Boolean);
  return bagian[bagian.length - 1] ?? akar;
}

/* Kunci pengelompokan. Path yang sama bisa tersimpan dengan garis miring
   berbeda (`D:\ZephyrDesktop` dan `D:/ZephyrDesktop` sudah terjadi di data
   nyata), dan tanpa disamakan keduanya muncul sebagai dua proyek terpisah. */
const kunciPath = (akar: string) => akar.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();

/* "14:03", bukan "14.03": jam di kartu info mengikuti acuan TRAE, dan
   `toLocaleTimeString` mengikuti locale mesin (di sini memakai titik). */
const jam = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* Satu menu kontekstual yang diposisikan di layar (fixed), sama seperti TRAE:
   dropdown-nya keluar dari sidebar yang sempit tanpa terpotong `overflow`. */
type Menu = { top: number; left: number } | null;

export default function AgentsSidebar({
  lebar,
  tampilan,
  onTampilan,
}: {
  lebar: number;
  tampilan: TampilanAgents;
  onTampilan: (t: TampilanAgents) => void;
}) {
  const sessions = useAi((s) => s.sessions);
  const aktif = useAi((s) => s.activeIds[COMPOSER] ?? null);
  const pilihSesi = useAi((s) => s.selectChat);
  const sesiBaru = useAi((s) => s.newChat);
  const ikutiWorkspace = useAi((s) => s.ikutiWorkspace);
  const hapusSesi = useAi((s) => s.deleteChat);
  const gantiJudul = useAi((s) => s.renameChat);
  const pinSesi = useAi((s) => s.setChatPinned);
  const workspace = useStore((s) => s.workspace);
  /*
   * Label sidebar ikut bahasa UI.
   *
   * Jendela Agents dulu menulis semuanya sebagai teks Inggris mati ("New task",
   * "Marketplace", "My Artifacts", ...), jadi mengganti bahasa di Setelan hanya
   * mengubah jendela utama — jendela ini tetap Inggris. Yang benar adalah
   * `tr()` di sini, sama seperti komponen lain.
   */
  const tr = useT();

  /* Proyek yang dibuka. Bawaannya terbuka: kelompok yang tertutup rapi tidak
     memberi jalan kembali ke percakapan yang sedang berjalan. */
  const [tutupProyek, setTutupProyek] = useState<Record<string, boolean>>({});
  const [bukaDefault, setBukaDefault] = useState(true);

  const [menuSesi, setMenuSesi] = useState<(Menu & { id: string }) | null>(null);
  const [menuProyek, setMenuProyek] = useState<(Menu & { kunci: string; jalur: string }) | null>(null);
  const [menuOpsi, setMenuOpsi] = useState<Menu>(null);
  const [kartu, setKartu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [rename, setRename] = useState<{ id: string; nilai: string } | null>(null);

  const [mode, setMode] = useState<'grouped' | 'list'>('grouped');
  const [filter, setFilter] = useState<'all' | 'local'>('all');

  /* Klik di luar menutup menu. Listener dipasang setelah satu tick supaya klik
     yang MEMBUKA menu tidak langsung menutupnya. */
  useEffect(() => {
    if (!menuSesi && !menuProyek && !menuOpsi) return;
    const tutup = () => {
      setMenuSesi(null);
      setMenuProyek(null);
      setMenuOpsi(null);
    };
    const t = window.setTimeout(() => window.addEventListener('pointerdown', tutup), 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', tutup);
    };
  }, [menuSesi, menuProyek, menuOpsi]);

  /* Dikelompokkan menurut folder. Urutan di dalam grup: yang di-pin dulu, lalu
     yang terbaru — sama seperti daftar riwayat pada umumnya. */
  const grup = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const kunci = s.workspace ? kunciPath(s.workspace) : '';
    const isi = grup.get(kunci);
    if (isi) isi.push(s);
    else grup.set(kunci, [s]);
  }
  const urut = (a: { pinned?: boolean; createdAt: number }, b: { pinned?: boolean; createdAt: number }) =>
    Number(!!b.pinned) - Number(!!a.pinned) || b.createdAt - a.createdAt;

  const grupProyek = [...grup.entries()]
    .filter(([k]) => !!k)
    .map(([k, v]) => {
      /* Path asli diambil dari sesi terbaru supaya labelnya memakai ejaan yang
         benar-benar dipakai user, bukan versi yang sudah dinormalkan. */
      const terbaru = [...v].sort(urut)[0];
      return {
        kunci: k,
        nama: namaFolder(terbaru.workspace ?? k),
        jalur: terbaru.workspace ?? k,
        sesi: [...v].sort(urut),
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));
  const grupDefault = [...(grup.get('') ?? [])].sort(urut);

  const namaDefault = workspace ? namaFolder(workspace) : 'Default';
  const kunciWorkspace = workspace ? kunciPath(workspace) : '';
  const namaProyekSaja = grupProyek.map((g) => g.nama);
  const labelDefault = namaProyekSaja.includes(namaDefault) ? 'Default' : namaDefault;

  /*
   * Judul sesi yang masih bawaan ikut bahasa UI.
   *
   * "New chat" tersimpan sebagai JUDUL sesi saat dibuat, jadi ia bukan teks
   * UI dan tidak pernah diterjemahkan — daftar tetap Inggris walau chromenya
   * sudah Indonesia. Hanya judul bawaan yang diterjemahkan; judul yang diketik
   * reader dibiarkan apa adanya.
   */
  const judul = (t: string) =>
    t.trim() ? (t === 'New chat' ? tr('New chat') : t) : tr('New task');
  const aktifDiRiwayat = grupDefault.some((s) => s.id === aktif);

  /* Waktu tersentuh terakhir sebuah percakapan: pesan terakhir kalau ada,
     kalau tidak waktu pembuatannya. */
  const waktu = (s: (typeof sessions)[number]) =>
    (s.messages[s.messages.length - 1] as { at?: number } | undefined)?.at ?? s.createdAt;

  const semuaTerbuka = grupProyek.every((g) => !tutupProyek[g.kunci]);

  const buka = (kunci: string) =>
    setTutupProyek((m) => ({ ...m, [kunci]: !m[kunci] }));

  const tutupSemua = () => {
    setTutupProyek(Object.fromEntries(grupProyek.map((g) => [g.kunci, true])));
    setBukaDefault(false);
  };

  const bukaSemua = () => {
    setTutupProyek({});
    setBukaDefault(true);
  };

  /* Pilih percakapan: canvas harus kembali dari Automation/Artifacts ke chat. */
  const pilih = (id: string) => {
    pilihSesi(id, COMPOSER);
    onTampilan('chat');
  };

  /*
   * Baris percakapan.
   *
   * Struktur div + dua tombol (bukan satu <button>): tombol ⋮ tidak boleh
   * bersarang di tombol baris. Hover baris membuka ⋮ dan kartu info, sama
   * seperti acuan.
   */
  const barisSesi = (s: (typeof sessions)[number]) => {
    const sedangRename = rename?.id === s.id;
    /*
     * Sedang bekerja = masih ada bubble asisten yang streaming di percakapan
     * ini. Dibaca dari pesannya, bukan dari `agentBusys[permukaan]`: penanda
     * permukaan hanya tahu kotak yang sedang dilihat, sedangkan cincin di
     * daftar harus menyala untuk tugas yang berjalan di latar belakang juga.
     */
    const berjalan = s.messages.some((m) => m.streaming);
    return (
      <div
        key={s.id}
        className={`agx-baris${s.id === aktif ? ' is-aktif' : ''}${s.pinned ? ' is-pin' : ''}`}
        data-testid="agx-baris-sesi"
        onMouseEnter={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setKartu({ id: s.id, top: r.top, left: r.right + 8 });
        }}
        onMouseLeave={() => setKartu((k) => (k?.id === s.id ? null : k))}
      >
        {sedangRename ? (
          <input
            className="agx-rename"
            autoFocus
            data-testid="agx-rename-input"
            value={rename.nilai}
            onChange={(e) => setRename({ id: s.id, nilai: e.target.value })}
            onBlur={() => {
              const t = rename.nilai.trim();
              if (t && t !== s.title) gantiJudul(s.id, t);
              setRename(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              if (e.key === 'Escape') setRename(null);
            }}
          />
        ) : (
          <button
            className="agx-baris-utama"
            data-testid="agx-sesi-riwayat"
            title={judul(s.title)}
            onClick={() => pilih(s.id)}
          >
            <span className="agx-sesi-judul">{judul(s.title)}</span>
          </button>
        )}

        {/* Cincin berputar: agen masih mengerjakan tugas ini (bentuk TRAE di
            gambar acuan). Hanya muncul saat berjalan — baris diam tidak
            mendapat hiasan apa pun. */}
        {berjalan && (
          <span
            className="agx-sesi-ring"
            data-testid="agx-sesi-berjalan"
            aria-label="Agent is working"
            title={tr('Agent is working')}
          />
        )}

        <button
          className="agx-baris-aksi"
          data-testid="agx-sesi-menu"
          aria-label="Task options"
          title={tr('Task options')}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setKartu(null);
            setMenuSesi({ id: s.id, top: r.bottom + 4, left: r.left - 150 });
          }}
        >
          <IkonTitik />
        </button>
      </div>
    );
  };

  const menu = (isi: ReactNode, pos: NonNullable<Menu>, testid: string) => (
    <div
      className="agx-ctx"
      data-testid={testid}
      role="menu"
      style={{ top: pos.top, left: Math.max(8, pos.left) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {isi}
    </div>
  );

  return (
    <aside className="agx-sidebar" data-testid="agx-sidebar" style={{ width: lebar }}>
      <nav className="agx-side-nav" data-testid="agx-side-nav">
        <button
          className={`agx-nav${tampilan === 'chat' ? ' is-aktif' : ''}`}
          data-testid="agx-new-task"
          onClick={() => {
            sesiBaru(COMPOSER);
            onTampilan('chat');
          }}
        >
          <IkonPlusBulat />
          <span>{tr('New task')}</span>
        </button>
        <button
          className={`agx-nav${tampilan === 'marketplace' ? ' is-aktif' : ''}`}
          data-testid="agx-marketplace"
          onClick={() => onTampilan('marketplace')}
        >
          <IkonPasar />
          <span>{tr('Marketplace')}</span>
        </button>
        <button
          className={`agx-nav${tampilan === 'automation' ? ' is-aktif' : ''}`}
          data-testid="agx-automation"
          onClick={() => onTampilan('automation')}
        >
          <IkonJam />
          <span>{tr('Automation')}</span>
        </button>
        <button
          className={`agx-nav${tampilan === 'artifacts' ? ' is-aktif' : ''}`}
          data-testid="agx-artifacts"
          onClick={() => onTampilan('artifacts')}
        >
          <IkonKotak />
          <span>{tr('My Artifacts')}</span>
        </button>
      </nav>

      <div className="agx-side-daftar">
        <div className="agx-daftar-kepala" data-testid="agx-daftar-kepala">
          <span className="agx-daftar-judul">{mode === 'list' ? tr('Chats') : tr('Projects')}</span>
          <span className="agx-grup-aksi">
            <button
              className="agx-ikon-btn"
              data-testid="agx-collapse-all"
              title={semuaTerbuka ? tr('Collapse All') : tr('Expand All')}
              aria-label={semuaTerbuka ? tr('Collapse All') : tr('Expand All')}
              onClick={() => (semuaTerbuka ? tutupSemua() : bukaSemua())}
            >
              <IkonPanahKeluar />
            </button>
            <button
              className={`agx-ikon-btn${menuOpsi ? ' is-on' : ''}`}
              data-testid="agx-view-options"
              title={tr('View Options')}
              aria-label={tr('View Options')}
              aria-expanded={!!menuOpsi}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setMenuOpsi(menuOpsi ? null : { top: r.bottom + 6, left: Math.max(8, r.right - 176) });
              }}
            >
              <IkonFilter />
            </button>
          </span>
        </div>

        {mode === 'list'
          ? [...sessions].sort(urut).map((s) => barisSesi(s))
          : (
            <>
              {grupProyek.map((g) => {
                const terbuka = !tutupProyek[g.kunci];
                const redup = !!kunciWorkspace && g.kunci !== kunciWorkspace;
                const aktifDiGrup = !aktifDiRiwayat && g.sesi.some((s) => s.id === aktif);
                return (
                  <section className="agx-grup" key={g.kunci} data-testid="agx-grup-proyek">
                    <div
                      className={`agx-baris agx-baris-proyek${redup ? ' is-redup' : ''}${aktifDiGrup ? ' is-aktif' : ''}`}
                      data-testid="agx-proyek"
                    >
                      <button
                        className="agx-proyek-utama"
                        title={g.jalur}
                        aria-expanded={terbuka}
                        onClick={() => buka(g.kunci)}
                      >
                        <IkonChevron buka={terbuka} />
                        {/* Tanpa ikon folder: acuan TRAE hanya memakai chevron +
                            nama, dan di baris 30px ikon kedua itu membuat
                            proyek dan percakapan di bawahnya terlihat sejajar
                            padahal berbeda tingkat. */}
                        <span className="agx-sesi-judul">{g.nama}</span>
                        {g.kunci === kunciWorkspace && (
                          <span className="agx-titik" aria-label="Active workspace" />
                        )}
                      </button>
                      <span className="agx-proyek-aksi">
                        <button
                          className="agx-baris-aksi"
                          data-testid="agx-proyek-menu"
                          aria-label="Project options"
                          title={tr('Project options')}
                          onClick={(e) => {
                            e.stopPropagation();
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuProyek({ kunci: g.kunci, jalur: g.jalur, top: r.bottom + 4, left: r.left - 150 });
                          }}
                        >
                          <IkonTitikJajar />
                        </button>
                        <button
                          className="agx-baris-aksi"
                          data-testid="agx-proyek-baru"
                          aria-label="New task in this project"
                          title={tr('New task')}
                          onClick={(e) => {
                            e.stopPropagation();
                            ikutiWorkspace(g.jalur);
                            onTampilan('chat');
                          }}
                        >
                          <IkonPlusBulat />
                        </button>
                      </span>
                    </div>
                    {terbuka && g.sesi.map((s) => barisSesi(s))}
                  </section>
                );
              })}

              <section className="agx-grup" data-testid="agx-grup-default">
                <div className="agx-baris agx-baris-proyek">
                  <button
                    className="agx-proyek-utama"
                    aria-expanded={bukaDefault}
                    onClick={() => setBukaDefault((v) => !v)}
                  >
                    <IkonChevron buka={bukaDefault} />
                    <span className="agx-grup-nama">{labelDefault}</span>
                  </button>
                </div>
                {bukaDefault && grupDefault.map((s) => barisSesi(s))}
              </section>
            </>
          )}
      </div>

      {/* Kartu info: muncul saat pointer berhenti di satu baris tugas. */}
      {kartu &&
        (() => {
          const s = sessions.find((x) => x.id === kartu.id);
          if (!s) return null;
          return (
            <div
              className="agx-kartu"
              data-testid="agx-kartu-sesi"
              style={{ top: kartu.top, left: kartu.left }}
              aria-hidden="true"
            >
              <div className="agx-kartu-judul">{judul(s.title)}</div>
              <div className="agx-kartu-baris">
                <IkonKotak />
                <span>{tr('Local Task')}</span>
              </div>
              {s.workspace && (
                <div className="agx-kartu-baris">
                  <IkonFolder />
                  <span>{s.workspace}</span>
                </div>
              )}
              <div className="agx-kartu-baris">
                <IkonJam />
                <span>Updated at {jam(waktu(s))}</span>
              </div>
            </div>
          );
        })()}

      {/* Menu baris tugas. */}
      {menuSesi &&
        (() => {
          const s = sessions.find((x) => x.id === menuSesi.id);
          if (!s) return null;
          return menu(
            <>
              <button
                className="agx-ctx-item"
                data-testid="agx-menu-pin"
                onClick={() => {
                  pinSesi(s.id, !s.pinned);
                  setMenuSesi(null);
                }}
              >
                <IkonPin />
                {s.pinned ? 'Unpin task' : 'Pin task'}
              </button>
              <button
                className="agx-ctx-item"
                data-testid="agx-menu-explorer"
                onClick={() => {
                  const p = s.workspace ?? workspace;
                  if (p) void revealPath(p).catch(() => {});
                  setMenuSesi(null);
                }}
              >
                <IkonPanahKeluar />
                Open in Explorer
              </button>
              <button
                className="agx-ctx-item"
                data-testid="agx-menu-file"
                onClick={() => {
                  const p = s.workspace ?? workspace;
                  if (p) void revealPath(p).catch(() => {});
                  setMenuSesi(null);
                }}
              >
                <IkonDaftar />
                File Management
              </button>
              <button
                className="agx-ctx-item"
                data-testid="agx-menu-rename"
                onClick={() => {
                  setRename({ id: s.id, nilai: s.title });
                  setMenuSesi(null);
                }}
              >
                <IkonPena />
                Rename
              </button>
              <button
                className="agx-ctx-item is-bahaya"
                data-testid="agx-menu-hapus"
                onClick={() => {
                  hapusSesi(s.id);
                  setMenuSesi(null);
                }}
              >
                <IkonSampah />
                Delete Task
              </button>
            </>,
            menuSesi,
            'agx-menu-sesi',
          );
        })()}

      {/* Menu baris proyek. */}
      {menuProyek &&
        menu(
          <>
            <button
              className="agx-ctx-item"
              data-testid="agx-menu-baru"
              onClick={() => {
                ikutiWorkspace(menuProyek.jalur);
                onTampilan('chat');
                setMenuProyek(null);
              }}
            >
              <IkonPlusBulat />
              Create a new task
            </button>
            <button
              className="agx-ctx-item"
              data-testid="agx-menu-proyek-file"
              onClick={() => {
                void revealPath(menuProyek.jalur).catch(() => {});
                setMenuProyek(null);
              }}
            >
              <IkonDaftar />
              File Management
            </button>
            <button
              className="agx-ctx-item"
              data-testid="agx-menu-proyek-explorer"
              onClick={() => {
                void revealPath(menuProyek.jalur).catch(() => {});
                setMenuProyek(null);
              }}
            >
              <IkonPanahKeluar />
              Open in Explorer
            </button>
            <div className="agx-ctx-pisah" />
            <button
              className="agx-ctx-item"
              data-testid="agx-menu-tambah-folder"
              onClick={() => {
                const jalur = menuProyek.jalur;
                setMenuProyek(null);
                void folderDialogOpen()
                  .then((dir) => {
                    if (!dir) return;
                    ikutiWorkspace(dir);
                    onTampilan('chat');
                  })
                  .catch(() => {
                    /* dialog ditutup / dibatalkan: tidak ada yang berubah */
                  });
                /* `jalur` sengaja dibaca sebelum dialog: menu ditutup duluan. */
                void jalur;
              }}
            >
              <IkonFolder />
              Add Folder to Zephyr
            </button>
            <div className="agx-ctx-pisah" />
            <button
              className="agx-ctx-item is-bahaya"
              data-testid="agx-menu-proyek-hapus"
              onClick={() => {
                const { kunci } = menuProyek;
                setMenuProyek(null);
                const isi = sessions.filter((s) => s.workspace && kunciPath(s.workspace) === kunci);
                if (!isi.length) return;
                if (!window.confirm(`Delete ${isi.length} task in this project?`)) return;
                for (const s of isi) hapusSesi(s.id);
              }}
            >
              <IkonSampah />
              Delete
            </button>
          </>,
          menuProyek,
          'agx-menu-proyek',
        )}

      {/* View Options. */}
      {menuOpsi &&
        menu(
          <>
            <div className="agx-ctx-judul">{tr('View')}</div>
            <button
              className="agx-ctx-item"
              data-testid="agx-view-grouped"
              aria-pressed={mode === 'grouped'}
              onClick={() => {
                setMode('grouped');
                setMenuOpsi(null);
              }}
            >
              <IkonFolder />
              Grouped View
              {mode === 'grouped' && <span className="agx-ctx-cek">✓</span>}
            </button>
            <button
              className="agx-ctx-item"
              data-testid="agx-view-list"
              aria-pressed={mode === 'list'}
              onClick={() => {
                setMode('list');
                setMenuOpsi(null);
              }}
            >
              <IkonDaftar />
              List View
              {mode === 'list' && <span className="agx-ctx-cek">✓</span>}
            </button>
            <div className="agx-ctx-pisah" />
            <div className="agx-ctx-judul">{tr('Filter')}</div>
            <button
              className="agx-ctx-item"
              data-testid="agx-filter-all"
              aria-pressed={filter === 'all'}
              onClick={() => {
                setFilter('all');
                setMenuOpsi(null);
              }}
            >
              <IkonKotak />
              All
              {filter === 'all' && <span className="agx-ctx-cek">✓</span>}
            </button>
            <button
              className="agx-ctx-item is-mati"
              data-testid="agx-filter-cloud"
              disabled
              title={tr('Cloud tasks are not available yet')}
            >
              <IkonJam />
              Cloud
            </button>
            <button
              className="agx-ctx-item"
              data-testid="agx-filter-local"
              aria-pressed={filter === 'local'}
              onClick={() => {
                setFilter('local');
                setMenuOpsi(null);
              }}
            >
              <IkonFolder />
              Local
              {filter === 'local' && <span className="agx-ctx-cek">✓</span>}
            </button>
          </>,
          menuOpsi,
          'agx-menu-opsi',
        )}
    </aside>
  );
}
