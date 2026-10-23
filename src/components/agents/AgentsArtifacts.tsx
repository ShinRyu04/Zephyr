import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../../lib/store';
import { revealPath } from '../../lib/commands';
import { mintaBukaDiEditor } from '../../lib/agentsWindow';
import {
  useArtifacts,
  type Artifact,
  type JenisArtifact,
  type JenisDibuat,
} from '../../lib/artifactStore';

/*
 * Halaman My Artifacts di jendela Agents — bentuknya mengikuti acuan TRAE:
 *
 *   My Artifacts
 *   Everything you create, all in one place.
 *   [Local] [Cloud]                                  [Search files…]
 *   [All] [HTML] [PPT] [Document] [Sheet] [Video] [Image]   Filter | ▦ ☰
 *
 * Daftarnya TIDAK disimpan di sini: `artifactStore` membaca folder
 * `<workspace>/artifacts`, jadi isi halaman selalu sama dengan isi disk. Tab
 * Cloud jujur kosong — Zephyr belum punya penyimpanan awan, dan kartu palsu di
 * sana akan membuat user mengira berkasnya sudah terunggah.
 */

type Tab = 'local' | 'cloud';
type Kategori = 'all' | JenisArtifact;
type Mode = 'grid' | 'list';
type Urut = 'baru' | 'lama' | 'nama';

const KATEGORI: [Kategori, string][] = [
  ['all', 'All'],
  ['html', 'HTML'],
  ['ppt', 'PPT'],
  ['doc', 'Document'],
  ['sheet', 'Sheet'],
  ['video', 'Video'],
  ['image', 'Image'],
];

const LABEL_JENIS: Record<JenisArtifact, string> = {
  html: 'HTML',
  ppt: 'PPT',
  doc: 'Document',
  sheet: 'Sheet',
  video: 'Video',
  image: 'Image',
};

function Ikon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
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

/* Ikon berkas untuk tiap kategori — dipakai di kartu, baris, dan empty-state. */
function IkonJenis({ jenis, size = 16 }: { jenis: JenisArtifact | 'kosong'; size?: number }) {
  if (jenis === 'image') {
    return (
      <Ikon size={size}>
        <rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.4" />
        <circle cx="6" cy="6.6" r="1.1" />
        <path d="M3.4 11.4l3.2-3 2.2 2 1.8-1.6 2.2 2" />
      </Ikon>
    );
  }
  if (jenis === 'video') {
    return (
      <Ikon size={size}>
        <rect x="2.4" y="4" width="8.4" height="8" rx="1.4" />
        <path d="M10.8 7.2l2.8-1.6v4.8l-2.8-1.6z" />
      </Ikon>
    );
  }
  return (
    <Ikon size={size}>
      <path d="M3.4 2.6h6l3.2 3.2v7.6a.8.8 0 0 1-.8.8H4.2a.8.8 0 0 1-.8-.8z" />
      <path d="M9.4 2.6v3.2h3.2" />
      {jenis === 'sheet' && <path d="M5.4 8.6h5.2M5.4 11h5.2" />}
      {jenis === 'ppt' && <path d="M5.2 6.4h2.4v2.4H5.2z" />}
      {jenis === 'html' && <path d="M6.2 8.2 4.8 9.6l1.4 1.4M9.8 8.2l1.4 1.4-1.4 1.4" />}
    </Ikon>
  );
}

function ukuranTeks(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function waktuTeks(ms: number): string {
  const d = new Date(ms);
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    d.getMonth()
  ];
  return `${bulan} ${d.getDate()}, ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

function namaFolder(akar: string | null): string {
  if (!akar) return '';
  const bagian = akar.split(/[\\/]+/).filter(Boolean);
  return bagian[bagian.length - 1] ?? akar;
}

export default function AgentsArtifacts() {
  const workspace = useStore((s) => s.workspace);
  const daftar = useArtifacts((s) => s.daftar);
  const memuat = useArtifacts((s) => s.memuat);
  const galat = useArtifacts((s) => s.galat);
  const buat = useArtifacts((s) => s.buat);
  const hapus = useArtifacts((s) => s.hapus);
  const muat = useArtifacts((s) => s.muat);

  const [tab, setTab] = useState<Tab>('local');
  const [kategori, setKategori] = useState<Kategori>('all');
  const [cari, setCari] = useState('');
  const [mode, setMode] = useState<Mode>('grid');
  const [urut, setUrut] = useState<Urut>('baru');
  const [menuUrut, setMenuUrut] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [nama, setNama] = useState('');
  const [jenis, setJenis] = useState<JenisDibuat>('html');
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  /* Dibaca ulang tiap workspace berganti dan tiap kali tab Local dibuka —
     berkas bisa berubah di editor selama halaman ini tersembunyi. */
  useEffect(() => {
    if (tab === 'local') void muat(workspace);
  }, [workspace, tab, muat]);

  const labelFolder = namaFolder(workspace);

  const tersaring = useMemo(() => {
    const cariMurah = cari.trim().toLowerCase();
    const hasil = daftar.filter((a) => {
      if (kategori !== 'all' && a.jenis !== kategori) return false;
      if (!cariMurah) return true;
      return `${a.nama}.${a.ekstensi}`.toLowerCase().includes(cariMurah);
    });
    const salin = [...hasil];
    if (urut === 'nama') salin.sort((a, b) => a.nama.localeCompare(b.nama));
    else if (urut === 'lama') salin.sort((a, b) => a.mtime - b.mtime);
    else salin.sort((a, b) => b.mtime - a.mtime);
    return salin;
  }, [daftar, kategori, cari, urut]);

  const bukaDialog = () => {
    setNama('');
    setJenis('html');
    setPesan(null);
    setDialog(true);
  };

  const simpan = async () => {
    if (!workspace) {
      setPesan('Open a folder first — artifacts are stored inside the workspace.');
      return;
    }
    setSibuk(true);
    setPesan(null);
    try {
      const path = await buat(workspace, nama || 'artifact', jenis);
      setDialog(false);
      setKategori('all');
      /* Berkasnya langsung dibuka di JENDELA EDITOR: jendela Agents tidak punya
         tab editor, jadi `useStore.openPath` di sini hanya akan mengubah store
         jendela ini tanpa ada yang menampilkannya. */
      void mintaBukaDiEditor(path).catch(() => undefined);
    } catch (e) {
      setPesan(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(false);
    }
  };

  const buka = (a: Artifact) => {
    setMenu(null);
    void mintaBukaDiEditor(a.path).catch(() => undefined);
  };

  const kosong = (jenisKosong: 'lokal' | 'cari' | 'awan') => (
    <div className="agx-art-kosong" data-testid="agx-art-kosong">
      <span className="agx-art-kosong-ikon" aria-hidden="true">
        {jenisKosong === 'awan' ? (
          <Ikon size={22}>
            <path d="M5 11.6h6.2a2.4 2.4 0 0 0 .3-4.8 3.4 3.4 0 0 0-6.5-.8A2.6 2.6 0 0 0 5 11.6z" />
          </Ikon>
        ) : (
          <IkonJenis jenis="kosong" size={22} />
        )}
      </span>
      <div className="agx-art-kosong-judul">
        {jenisKosong === 'cari'
          ? 'No matching files'
          : jenisKosong === 'awan'
            ? 'No cloud artifacts yet'
            : 'No files yet'}
      </div>
      <div className="agx-art-kosong-ket">
        {jenisKosong === 'cari'
          ? 'Try another name or category.'
          : jenisKosong === 'awan'
            ? 'Cloud storage is not connected in Zephyr yet.'
            : 'Files you create will appear here'}
      </div>
      {jenisKosong === 'lokal' && (
        <button className="agx-art-tombol is-terang" data-testid="agx-art-mulai" onClick={bukaDialog}>
          Create
        </button>
      )}
    </div>
  );

  return (
    <div className="agx-art" data-testid="agx-art">
      <div className="agx-art-kepala">
        <h1>My Artifacts</h1>
        <p>Everything you create, all in one place.</p>
      </div>

      <div className="agx-art-baris-atas">
        <div className="agx-art-tabs" role="tablist">
          {(
            [
              [
                'local',
                'Local',
                <Ikon key="l" size={14}>
                  <rect x="1.8" y="2.8" width="12.4" height="8.4" rx="1.4" />
                  <path d="M5.6 13.4h4.8M8 11.2v2.2" />
                </Ikon>,
              ],
              [
                'cloud',
                'Cloud',
                <Ikon key="c" size={14}>
                  <path d="M5 11.6h6.2a2.4 2.4 0 0 0 .3-4.8 3.4 3.4 0 0 0-6.5-.8A2.6 2.6 0 0 0 5 11.6z" />
                </Ikon>,
              ],
            ] as [Tab, string, ReactNode][]
          ).map(([id, label, ikon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`agx-art-tab${tab === id ? ' is-aktif' : ''}`}
              data-testid={`agx-art-tab-${id}`}
              onClick={() => setTab(id)}
            >
              {ikon}
              {label}
            </button>
          ))}
        </div>

        <label className="agx-art-cari">
          <Ikon size={14}>
            <circle cx="7" cy="7" r="4.2" />
            <path d="M10.2 10.2l3 3" />
          </Ikon>
          <input
            type="search"
            data-testid="agx-art-cari"
            placeholder="Search files..."
            value={cari}
            onChange={(e) => setCari(e.target.value)}
          />
        </label>
      </div>

      <div className="agx-art-saring">
        <div className="agx-art-chip-baris" role="group" aria-label="File type">
          {KATEGORI.map(([id, label]) => (
            <button
              key={id}
              className={`agx-art-chip${kategori === id ? ' is-aktif' : ''}`}
              data-testid={`agx-art-chip-${id}`}
              aria-pressed={kategori === id}
              onClick={() => setKategori(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="agx-art-alat">
          <div className="agx-art-urut">
            <button
              className={`agx-art-filter${menuUrut ? ' is-aktif' : ''}`}
              data-testid="agx-art-filter"
              aria-expanded={menuUrut}
              onClick={() => setMenuUrut((v) => !v)}
            >
              <Ikon size={14}>
                <path d="M3 4.6h10M5 8h6M6.6 11.4h2.8" />
              </Ikon>
              Filter
            </button>
            {menuUrut && (
              <div className="agx-art-menu is-urut" data-testid="agx-art-menu-urut">
                {(
                  [
                    ['baru', 'Newest first'],
                    ['lama', 'Oldest first'],
                    ['nama', 'Name A–Z'],
                  ] as [Urut, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={urut === id ? 'is-aktif' : ''}
                    onClick={() => {
                      setUrut(id);
                      setMenuUrut(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="agx-art-pisah" aria-hidden="true" />

          <button
            className={`agx-art-mode${mode === 'grid' ? ' is-aktif' : ''}`}
            title="Grid view"
            aria-label="Grid view"
            aria-pressed={mode === 'grid'}
            data-testid="agx-art-mode-grid"
            onClick={() => setMode('grid')}
          >
            <Ikon size={14}>
              <rect x="2.4" y="2.4" width="4.6" height="4.6" rx="0.8" />
              <rect x="9" y="2.4" width="4.6" height="4.6" rx="0.8" />
              <rect x="2.4" y="9" width="4.6" height="4.6" rx="0.8" />
              <rect x="9" y="9" width="4.6" height="4.6" rx="0.8" />
            </Ikon>
          </button>
          <button
            className={`agx-art-mode${mode === 'list' ? ' is-aktif' : ''}`}
            title="List view"
            aria-label="List view"
            aria-pressed={mode === 'list'}
            data-testid="agx-art-mode-list"
            onClick={() => setMode('list')}
          >
            <Ikon size={14}>
              <path d="M2.6 4h1.2M5.8 4h7.6M2.6 8h1.2M5.8 8h7.6M2.6 12h1.2M5.8 12h7.6" />
            </Ikon>
          </button>
        </div>
      </div>

      <div className="agx-art-isi" data-testid="agx-art-isi">
        {galat && <div className="agx-art-galat">{galat}</div>}

        {tab === 'cloud' && kosong('awan')}

        {tab === 'local' &&
          (memuat && daftar.length === 0 ? (
            <div className="agx-art-memuat">Loading…</div>
          ) : daftar.length === 0 ? (
            kosong('lokal')
          ) : tersaring.length === 0 ? (
            kosong('cari')
          ) : mode === 'grid' ? (
            <div className="agx-art-grid" data-testid="agx-art-grid">
              {tersaring.map((a) => (
                <article
                  className="agx-art-kartu"
                  key={a.path}
                  data-testid="agx-art-kartu"
                  title={a.path}
                >
                  <button className="agx-art-pratinjau" onClick={() => buka(a)}>
                    <span className={`agx-art-pratinjau-ikon is-${a.jenis}`}>
                      <IkonJenis jenis={a.jenis} size={26} />
                    </span>
                    <span className="agx-art-pratinjau-ext">{a.ekstensi || 'file'}</span>
                  </button>
                  <div className="agx-art-kartu-kaki">
                    <span className={`agx-art-kartu-ikon is-${a.jenis}`} aria-hidden="true">
                      <IkonJenis jenis={a.jenis} size={14} />
                    </span>
                    <span className="agx-art-kartu-teks">
                      <span className="agx-art-kartu-nama">{a.nama}</span>
                      <span className="agx-art-kartu-meta">
                        <Ikon size={11}>
                          <path d="M2.4 4.6a1 1 0 0 1 1-1h2.5l1.3 1.6h5.4a1 1 0 0 1 1 1v5.6a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1z" />
                        </Ikon>
                        {labelFolder} · {waktuTeks(a.mtime)}
                      </span>
                    </span>
                    <button
                      className="agx-art-titik"
                      aria-label="More actions"
                      data-testid="agx-art-menu-tombol"
                      onClick={() => setMenu(menu === a.path ? null : a.path)}
                    >
                      …
                    </button>
                  </div>
                  {menu === a.path && (
                    <div className="agx-art-menu" data-testid="agx-art-menu">
                      <button onClick={() => buka(a)}>Open</button>
                      <button
                        onClick={() => {
                          setMenu(null);
                          void revealPath(a.path).catch(() => undefined);
                        }}
                      >
                        Show in Explorer
                      </button>
                      <button
                        className="is-bahaya"
                        onClick={() => {
                          setMenu(null);
                          void hapus(a).catch(() => undefined);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="agx-art-daftar" data-testid="agx-art-daftar">
              {tersaring.map((a) => (
                <div className="agx-art-baris" key={a.path} data-testid="agx-art-baris" title={a.path}>
                  <span className={`agx-art-kartu-ikon is-${a.jenis}`} aria-hidden="true">
                    <IkonJenis jenis={a.jenis} size={14} />
                  </span>
                  <button className="agx-art-baris-nama" onClick={() => buka(a)}>
                    {a.nama}
                    <span className="agx-art-baris-ext">.{a.ekstensi}</span>
                  </button>
                  <span className="agx-art-baris-jenis">{LABEL_JENIS[a.jenis]}</span>
                  <span className="agx-art-baris-ukuran">{ukuranTeks(a.ukuran)}</span>
                  <span className="agx-art-baris-waktu">{waktuTeks(a.mtime)}</span>
                  <button
                    className="agx-art-titik"
                    aria-label="More actions"
                    data-testid="agx-art-menu-tombol"
                    onClick={() => setMenu(menu === a.path ? null : a.path)}
                  >
                    …
                  </button>
                  {menu === a.path && (
                    <div className="agx-art-menu is-baris">
                      <button onClick={() => buka(a)}>Open</button>
                      <button
                        onClick={() => {
                          setMenu(null);
                          void revealPath(a.path).catch(() => undefined);
                        }}
                      >
                        Show in Explorer
                      </button>
                      <button
                        className="is-bahaya"
                        onClick={() => {
                          setMenu(null);
                          void hapus(a).catch(() => undefined);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
      </div>

      {dialog && (
        <div className="agx-art-lapis" data-testid="agx-art-dialog">
          <div className="agx-art-dialog" role="dialog" aria-modal="true">
            <div className="agx-art-dialog-kepala">
              <h2>Create artifact</h2>
              <button
                className="agx-art-dialog-tutup"
                aria-label="Close"
                data-testid="agx-art-dialog-tutup"
                onClick={() => setDialog(false)}
              >
                <Ikon size={13}>
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </Ikon>
              </button>
            </div>

            <label className="agx-art-lapangan">
              <span>Name</span>
              <input
                data-testid="agx-art-nama"
                value={nama}
                autoFocus
                placeholder="Untitled"
                onChange={(e) => setNama(e.target.value)}
              />
            </label>

            <div className="agx-art-lapangan">
              <span>Type</span>
              <div className="agx-art-jenis">
                {(
                  [
                    ['html', 'HTML page'],
                    ['doc', 'Document'],
                    ['sheet', 'Sheet'],
                  ] as [JenisDibuat, string][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    className={`agx-art-chip${jenis === id ? ' is-aktif' : ''}`}
                    data-testid={`agx-art-jenis-${id}`}
                    aria-pressed={jenis === id}
                    onClick={() => setJenis(id)}
                  >
                    <IkonJenis jenis={id} size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <p className="agx-art-catatan">
              Saved to <span className="agx-art-path">{labelFolder || 'workspace'}/artifacts</span>. PPT
              and video files can only appear here when a tool writes them.
            </p>

            {pesan && (
              <div className="agx-art-galat" data-testid="agx-art-pesan">
                {pesan}
              </div>
            )}

            <div className="agx-art-dialog-aksi">
              <button className="agx-art-tombol" onClick={() => setDialog(false)}>
                Cancel
              </button>
              <button
                className="agx-art-tombol is-terang"
                data-testid="agx-art-simpan"
                disabled={sibuk}
                onClick={() => void simpan()}
              >
                {sibuk ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
