import { useEffect, useState, type ReactNode } from 'react';
import { scanDir, fsRead } from '../../lib/commands';
import { useStore } from '../../lib/store';
import type { DirNode } from '../../lib/types';

/*
 * Tampilan "File" di dalam panel kanan.
 *
 * Acuannya `Referensi TRAE Agent Window` (3 gambar terakhir user):
 * - Bar atas jadi TAB: pill `File` (tutup-x saat hover) + `+`.
 * - Baris kedua: label `File` + tombol collapse di kanan bawahnya.
 * - Isi: pratinjau di kiri ("File / Select a file from the tree to preview it
 *   here") dan pohon file di KANAN (kebalikan dari explorer IDE).
 * - Klik file: tab dan baris kedua otomatis ganti jadi nama file + tombol
 *   `Open` + collapse; pratinjau menampilkan isi file.
 *
 * Pohon memakai `scanDir` (Rust) dan baca file memakai `fsRead` — keduanya
 * dibatasi backend ke dalam workspace, jadi tidak ada jalur sembarangan.
 */

function Ikon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
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

/* Satu baris di pohon: folder bisa dibuka (muat anak sekali), file bisa
   dipilih. Anak folder sudah punya indentasi dari induk, jadi baris ini
   tidak menambah padding kiri lagi. */
function BarisPohon({
  node,
  pilih,
  fileAktif,
}: {
  node: DirNode;
  pilih: (p: string) => void;
  fileAktif: string | null;
}) {
  const [buka, setBuka] = useState(false);
  const [anak, setAnak] = useState<DirNode[] | null>(null);

  const bukaFolder = () => {
    setBuka((v) => {
      if (!anak && !v) {
        void scanDir(node.path).then(setAnak).catch(() => setAnak([]));
      }
      return !v;
    });
  };

  if (node.isDir) {
    return (
      <div role="treeitem" aria-expanded={buka}>
        <button className="agx-file-baris" data-testid="agx-file-folder" onClick={bukaFolder}>
          <span className={`agx-file-panah${buka ? ' is-buka' : ''}`}>›</span>
          <Ikon>
            <path d="M2.2 4.4h4.2l1.2 1.5h6.2v6.1H2.2z" />
          </Ikon>
          <span className="agx-file-nama">{node.name}</span>
        </button>
        {buka && anak && (
          <div role="group">
            {anak.map((a) => (
              <BarisPohon key={a.path} node={a} pilih={pilih} fileAktif={fileAktif} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div role="treeitem">
      <button
        className={`agx-file-baris${fileAktif === node.path ? ' is-aktif' : ''}`}
        data-testid="agx-file-item"
        onClick={() => pilih(node.path)}
      >
        <span className="agx-file-panah" aria-hidden="true" />
        <Ikon>
          <path d="M3.6 2.4h5.6L12.4 5.6v8H3.6z" />
        </Ikon>
        <span className="agx-file-nama">{node.name}</span>
      </button>
    </div>
  );
}

export default function AgentsPanelKananFile({
  onKembali,
  tombolKanan,
}: {
  onKembali: () => void;
  /* Tombol panel kanan pindahan dari `AgentsPanelKanan`: selama tampilan File
     aktif, tombolnya berada di baris tab ini — mengkliknya menutup panel. */
  tombolKanan: ReactNode;
}) {
  const workspace = useStore((s) => s.workspace);
  const [akar, setAkar] = useState<DirNode[]>([]);
  const [pohonTersembunyi, setPohonTersembunyi] = useState(false);
  const [fileAktif, setFileAktif] = useState<string | null>(null);
  const [isi, setIsi] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [sedangBaca, setSedangBaca] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setAkar([]);
    void scanDir(workspace)
      .then(setAkar)
      .catch(() => setAkar([]));
  }, [workspace]);

  useEffect(() => {
    if (!fileAktif) {
      setIsi('');
      setGalat(null);
      return;
    }
    let hidup = true;
    setSedangBaca(true);
    setGalat(null);
    fsRead(fileAktif)
      .then((r) => {
        if (!hidup) return;
        setIsi(r.content);
      })
      .catch((e: unknown) => {
        if (!hidup) return;
        setGalat(e instanceof Error ? e.message : String(e));
        setIsi('');
      })
      .finally(() => hidup && setSedangBaca(false));
    return () => {
      hidup = false;
    };
  }, [fileAktif]);

  const namaFile = fileAktif ? fileAktif.split(/[\\/]/).pop() ?? fileAktif : 'File';

  return (
    <div className="agx-file" data-testid="agx-file">
      {/* Baris 1: tab + `+` — `+` sengaja tanpa aksi (dropdownnya ada di tab
          `Start here`); di sini cuma penanda lokasi tombol seperti acuan. */}
      <div className="agx-kanan-bar">
        <span className="agx-file-tab">
          <span className="agx-file-tab-ikon">
            <Ikon>
              <path d="M3.6 2.4h5.6L12.4 5.6v8H3.6z" />
            </Ikon>
          </span>
          <span className="agx-file-tab-nama">{namaFile}</span>
          <button className="agx-file-tab-x" data-testid="agx-file-tab-x" title="Close" aria-label="Close" onClick={onKembali}>
            <Ikon>
              <path d="M4 4l8 8M12 4l-8 8" />
            </Ikon>
          </button>
        </span>
        <span className="agx-file-tab-kanan">
          <button className="agx-kanan-ikon" data-testid="agx-kanan-tambah" title="New" aria-label="New">
            <Ikon>
              <path d="M8 3.4v9.2M3.4 8h9.2" />
            </Ikon>
          </button>
          {tombolKanan}
        </span>
      </div>

      {/* Baris 2: label panel; saat file dipilih diganti nama file + `Open`. */}
      <div className="agx-file-kepala" data-testid="agx-file-kepala">
        <span className="agx-file-kepala-nama">{namaFile}</span>
        {fileAktif && (
          <span className="agx-file-kepala-aksi">
            <button className="agx-file-open" data-testid="agx-file-open" title="Open in editor">
              Open
            </button>
            <button
              className="agx-kanan-ikon"
              data-testid="agx-file-collapse"
              title="Collapse file tree"
              aria-label="Collapse file tree"
              aria-pressed={pohonTersembunyi}
              onClick={() => setPohonTersembunyi((v) => !v)}
            >
              <Ikon>
                <path d="M6.4 3.6v8.8M6.4 5.2 3.6 8l2.8 2.8M6.4 10.8l2.8-2.8M9.6 4.4h3.4M9.6 8h3.4M9.6 11.6h3.4" />
              </Ikon>
            </button>
          </span>
        )}
      </div>

      <div className={`agx-file-isi${pohonTersembunyi ? ' is-pohon-sembunyi' : ''}`}>
        {/* Pratinjau di kiri: kosong = ajakan pilih file. */}
        <div className="agx-file-pratinjau" data-testid="agx-file-pratinjau">
          {!fileAktif ? (
            <div className="agx-file-kosong">
              <span className="agx-file-kosong-ikon">
                <Ikon>
                  <path d="M3.6 2.4h5.6L12.4 5.6v8H3.6z" />
                </Ikon>
              </span>
              <b>File</b>
              <span>Select a file from the tree to preview it here</span>
            </div>
          ) : galat ? (
            <div className="agx-file-kosong">
              <span>{galat}</span>
            </div>
          ) : (
            <pre className="agx-file-kode" data-testid="agx-file-kode">
              {sedangBaca ? 'Loading…' : isi}
            </pre>
          )}
        </div>

        {/* Pohon file di KANAN (kebalikan explorer IDE). */}
        <div className="agx-file-pohon" data-testid="agx-file-pohon">
          <div className="agx-file-pohon-kepala" data-testid="agx-file-pohon-kepala">
            <span>{workspace ? (workspace.split(/[\\/]/).pop() ?? 'Workspace') : '—'}</span>
            <Ikon>
              <circle cx="7.2" cy="7.2" r="4.2" />
              <path d="M10.4 10.4 13.2 13.2" />
            </Ikon>
          </div>
          <div className="agx-file-pohon-isi" role="tree" data-testid="agx-file-pohon-isi">
            {akar.length === 0 && <div className="agx-file-pohon-kosong">No workspace folder</div>}
            {akar.map((n) => (
              <BarisPohon key={n.path} node={n} pilih={setFileAktif} fileAktif={fileAktif} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
