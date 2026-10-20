import { useState, type ReactNode } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';

/*
 * Sidebar jendela Agents.
 *
 * Bentuknya mengikuti acuan `Referensi TRAE Agent Window/Kiri TRAE.png`:
 *
 *   New task · Marketplace · Automation · My Artifacts
 *   Projects ⌄                      [expand] [filter]
 *     Nuoriva · Zephyr (titik biru) · Abel (redup)
 *   Default ›
 *
 * Catatan yang berlaku untuk seluruh berkas:
 *
 * 1. IKONNYA LINE-STYLE DAN ABU-ABU, diminta eksplisit ("icon ga perlu sama
 *    gpp tpi kita buat dia abu" kek gtu dan halus"). Warnanya `currentColor`
 *    sehingga ikut redup/terang bersama teks barisnya tanpa satu nilai pun
 *    ditulis ke SVG.
 *
 * 2. FOOTER AKUN DIHAPUS atas permintaan user ("untuk dikiri bawah yg ada
 *    shinryu04 itu di hpus ya").
 *
 * 3. "My Artifacts" DITAMPILKAN walau fiturnya belum ada — keputusan user:
 *    "hrs tampilkan dlu, itu nnti kita buat fitur nya". Sama seperti
 *    Marketplace dan Automation, ia belum punya aksi, jadi tombolnya diberi
 *    `disabled` dan gaya redup — bukan tombol yang bisa diklik lalu diam.
 *
 * 4. Daftar proyek memakai `session.workspace` yang sudah ada di tipe dan
 *    diisi `newChat`. Sesi lama tanpa workspace masuk ke kelompok "Default",
 *    jadi tidak ada percakapan yang hilang dari daftar.
 */

/* Composer id permukaan Agents. Sama dengan yang dipakai `mirrorRun` di
   `aiStore`, jadi draft dan sesi aktif tinggal memakai kunci yang sudah ada. */
const COMPOSER = 'agents';

/* Satu grid ikon untuk semua baris: 16px, stroke 1.2, tanpa isi. Ukuran dan
   ketebalan yang sama di tiap ikon itulah yang membuat baris terasa tenang —
   ikon campuran 14/15/16px dengan stroke berbeda terlihat kasar. */
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

const IkonSimpul = () => (
  <Ikon>
    <circle cx="4.6" cy="5.3" r="2.1" />
    <circle cx="11.4" cy="10.7" r="2.1" />
    <path d="M6.2 6.8l3.6 2.4" />
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

/** chevron: `arah` menentukan apakah ia menunjuk ke bawah (terbuka) atau ke
    kanan (tertutup). */
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

/** Nama pendek folder terakhir dari sebuah path, untuk label grup. */
function namaFolder(akar: string): string {
  const bagian = akar.split(/[\\/]+/).filter(Boolean);
  return bagian[bagian.length - 1] ?? akar;
}

/* Kunci pengelompokan. Path yang sama bisa tersimpan dengan garis miring
   berbeda (`D:\ZephyrDesktop` dan `D:/ZephyrDesktop` sudah terjadi di data
   nyata), dan tanpa disamakan keduanya muncul sebagai dua proyek terpisah. */
const kunciPath = (akar: string) => akar.replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase();

export default function AgentsSidebar() {
  const sessions = useAi((s) => s.sessions);
  const aktif = useAi((s) => s.activeIds[COMPOSER] ?? null);
  const pilihSesi = useAi((s) => s.selectChat);
  const sesiBaru = useAi((s) => s.newChat);
  const workspace = useStore((s) => s.workspace);

  const [bukaProyek, setBukaProyek] = useState(true);
  /* Default dibuka: isinya percakapan aktif, dan kelompok yang tertutup rapi
     tidak memberi jalan kembali ke percakapan yang sedang berjalan. */
  const [bukaDefault, setBukaDefault] = useState(true);

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
      return { kunci: k, nama: namaFolder(terbaru.workspace ?? k), sesi: [...v].sort(urut) };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));
  const grupDefault = [...(grup.get('') ?? [])].sort(urut);

  /* Label kelompok Default mengikuti workspace aktif; tanpa folder ia harfiah
     "Default" supaya tidak mengaku sebagai sesuatu yang tidak ada. */
  const namaDefault = workspace ? namaFolder(workspace) : 'Default';
  const kunciWorkspace = workspace ? kunciPath(workspace) : '';

  /* Kedua kelompok bisa berlabel sama — persis kasus di data nyata, ketika
     percakapan lama dibuat tanpa workspace tetapi jendela sedang membuka
     folder yang sama. Dua kepala grup bertulisan "ZephyrDesktop" bertumpuk
     terlihat seperti bug, jadi kepala kedua memakai label tetap "Default". */
  const namaProyekSaja = grupProyek.map((g) => g.nama);
  const labelDefault = namaProyekSaja.includes(namaDefault) ? 'Default' : namaDefault;

  const judul = (t: string) => (t.trim() ? t : 'New task');

  /* Satu baris saja yang boleh bertanda aktif. Baris proyek mewakili sesi
     terbarunya, jadi keduanya bisa menunjuk percakapan yang sama; tanpa
     pemilihan eksplisit di sini baris riwayat menang supaya yang disorot
     adalah percakapan yang benar-benar sedang dibuka. */
  const aktifDiRiwayat = grupDefault.some((s) => s.id === aktif);

  return (
    <aside className="agx-sidebar" data-testid="agx-sidebar">
      <nav className="agx-side-nav" data-testid="agx-side-nav">
        <button
          className="agx-nav is-aktif"
          data-testid="agx-new-task"
          onClick={() => sesiBaru(COMPOSER)}
        >
          <IkonPlusBulat />
          <span>New task</span>
        </button>
        <button className="agx-nav" data-testid="agx-marketplace" disabled>
          <IkonSimpul />
          <span>Marketplace</span>
        </button>
        <button className="agx-nav" data-testid="agx-automation" disabled>
          <IkonJam />
          <span>Automation</span>
        </button>
        <button className="agx-nav" data-testid="agx-artifacts" disabled>
          <IkonKotak />
          <span>My Artifacts</span>
        </button>
      </nav>

      <div className="agx-side-daftar">
        {grupProyek.length > 0 && (
          <section className="agx-grup" data-testid="agx-grup-proyek">
            <div className="agx-grup-bar">
              <button
                className="agx-grup-head"
                aria-expanded={bukaProyek}
                onClick={() => setBukaProyek((v) => !v)}
              >
                <IkonChevron buka={bukaProyek} />
                <span className="agx-grup-nama">Projects</span>
              </button>
              <span className="agx-grup-aksi">
                <button className="agx-ikon-btn" title="Expand all" aria-label="Expand all" disabled>
                  <IkonPanahKeluar />
                </button>
                <button className="agx-ikon-btn" title="Filter projects" aria-label="Filter projects" disabled>
                  <IkonFilter />
                </button>
              </span>
            </div>

            {bukaProyek &&
              grupProyek.map((g) => {
                /* Folder yang tidak sedang dibuka diredupkan — di acuan, "Abel"
                   lebih pucat daripada dua proyek lain. */
                const redup = !!kunciWorkspace && g.kunci !== kunciWorkspace;
                /* Baris proyek mewakili percakapan terbarunya, jadi ia juga
                   ditandai aktif kalau percakapan itu yang sedang dibuka. */
                const aktifDiGrup = !aktifDiRiwayat && g.sesi.some((s) => s.id === aktif);
                return (
                  <button
                    key={g.kunci}
                    className={`agx-sesi${redup ? ' is-redup' : ''}${aktifDiGrup ? ' is-aktif' : ''}`}
                    data-testid="agx-sesi"
                    title={g.sesi[0]?.workspace ?? g.kunci}
                    onClick={() => {
                      const pertama = g.sesi[0];
                      if (pertama) pilihSesi(pertama.id, COMPOSER);
                    }}
                  >
                    <IkonFolder />
                    <span className="agx-sesi-judul">{g.nama}</span>
                    {g.kunci === kunciWorkspace && (
                      <span className="agx-titik" aria-label="Active workspace" />
                    )}
                  </button>
                );
              })}
          </section>
        )}

        <section className="agx-grup" data-testid="agx-grup-default">
          <div className="agx-grup-bar">
            <button
              className="agx-grup-head"
              aria-expanded={bukaDefault}
              onClick={() => setBukaDefault((v) => !v)}
            >
              <IkonChevron buka={bukaDefault} />
              <span className="agx-grup-nama">{labelDefault}</span>
            </button>
          </div>

          {bukaDefault &&
            grupDefault.map((s) => (
              <button
                key={s.id}
                className={`agx-sesi${s.id === aktif ? ' is-aktif' : ''}`}
                data-testid="agx-sesi-riwayat"
                title={judul(s.title)}
                onClick={() => pilihSesi(s.id, COMPOSER)}
              >
                <span className="agx-sesi-judul">{judul(s.title)}</span>
              </button>
            ))}
        </section>
      </div>
    </aside>
  );
}
