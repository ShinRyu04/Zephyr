import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { scanDir, fsRead, fsWrite, fsCreateFile, fsCreateDir, fsDelete, fsRename, revealPath } from '../../lib/commands';
import { useStore } from '../../lib/store';
import { useAgxTabs } from '../../lib/agentsTabs';
import { ikonFile, ikonFolder } from '../../lib/fileIcons';
import { extensiUntukFile } from '../../lib/lang';
import { clipboardWrite } from '../../lib/clipboard';
import { mintaBukaDiEditor } from '../../lib/agentsWindow';
import { useAgxDraft } from '../../lib/agentsDraft';
import { zephyrHighlight, editorTheme } from '../../styles/editor-themes';
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

/* Isi menu klik kanan. Dua daftar BERBEDA: folder diberi aksi membuat isi
   baru, file diberi aksi membuka file itu. `pemisah` = garis tipis. */
type ItemKonteks = { id: string; label: string; bahaya?: boolean } | 'pemisah';

const MENU_KONTEKS: Record<'folder' | 'file', ItemKonteks[]> = {
  folder: [
    { id: 'new-file', label: 'New File…' },
    { id: 'new-folder', label: 'New Folder…' },
    'pemisah',
    { id: 'reveal', label: 'Reveal in Explorer' },
    { id: 'add-to-chat', label: 'Add to Chat' },
    { id: 'copy-path', label: 'Copy Path' },
    'pemisah',
    { id: 'rename', label: 'Rename' },
    { id: 'delete', label: 'Delete', bahaya: true },
  ],
  file: [
    { id: 'reveal', label: 'Reveal in Explorer' },
    { id: 'add-to-chat', label: 'Add to Chat' },
    { id: 'open-tab', label: 'Open in New Tab' },
    { id: 'copy-path', label: 'Copy Path' },
    'pemisah',
    { id: 'rename', label: 'Rename' },
    { id: 'delete', label: 'Delete', bahaya: true },
  ],
};

/* Satu baris di pohon: folder bisa dibuka (muat anak sekali), file bisa
   dipilih. Anak folder sudah punya indentasi dari induk, jadi baris ini
   tidak menambah padding kiri lagi. */
function BarisPohon({
  node,
  pilih,
  fileAktif,
  bukaMenu,
}: {
  node: DirNode;
  pilih: (p: string) => void;
  fileAktif: string | null;
  bukaMenu: (e: React.MouseEvent, node: DirNode) => void;
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
        <button
          className="agx-file-baris"
          data-testid="agx-file-folder"
          onClick={bukaFolder}
          onContextMenu={(e) => bukaMenu(e, node)}
        >
          <span className={`agx-file-panah${buka ? ' is-buka' : ''}`}>›</span>
          {/* SVG dari tabel hasil generate build (scripts/gen-file-icons.mjs),
              bukan input user. */}
          <span
            className="agx-file-glyph"
            data-ikon={ikonFolder(node.name).id}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: ikonFolder(node.name).svg ?? '' }}
          />
          <span className="agx-file-nama">{node.name}</span>
        </button>
        {buka && anak && (
          <div role="group">
            {anak.map((a) => (
              <BarisPohon
                key={a.path}
                node={a}
                pilih={pilih}
                fileAktif={fileAktif}
                bukaMenu={bukaMenu}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const ikonBerkas = ikonFile(node.name);
  return (
    <div role="treeitem">
      <button
        className={`agx-file-baris${fileAktif === node.path ? ' is-aktif' : ''}`}
        data-testid="agx-file-item"
        onClick={() => pilih(node.path)}
        onContextMenu={(e) => bukaMenu(e, node)}
      >
        <span className="agx-file-panah" aria-hidden="true" />
        {ikonBerkas.svg ? (
          <span
            className="agx-file-glyph"
            data-ikon={ikonBerkas.id}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: ikonBerkas.svg }}
          />
        ) : (
          <span className="agx-file-glyph" data-ikon={ikonBerkas.id} aria-hidden="true">
            {ikonBerkas.glyph ?? ''}
          </span>
        )}
        <span className="agx-file-nama">{node.name}</span>
      </button>
    </div>
  );
}

/*
 * Pratinjau isi file: CodeMirror read-only, jadi KODENYA BERWARNA dan
 * bergulir seperti editor. Dulu hanya `<pre>` polos — teks mentah tanpa
 * warna sama sekali, padahal file-nya sama dengan yang terbuka di editor.
 *
 * Ekstensi bahasa diambil dari `extensiUntukFile` — jalur yang sama dengan
 * editor utama — jadi tata bahasa (TypeScript, Rust, CSS, JSON, dst.)
 * mengikuti apa yang editor pakai.
 *
 * `extensiUntukFile` HANYA memuat tata bahasa (parser). Warna token datang
 * dari `zephyrHighlight` dan warna latar/teks dari `editorTheme` — dua
 * ekstensi yang dipasang `EditorTab` di jendela utama. Tanpa keduanya
 * parser tetap berjalan tapi tidak ada satu pun token yang diwarnai, persis
 * keluhan "teksnya masih hitam".
 */
function PratinjauKode({ nama, isi }: { nama: string; isi: string }) {
  const host = useRef<HTMLDivElement>(null);
  const tema = useStore((s) => s.activeTheme);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let batal = false;
    let view: EditorView | null = null;

    void extensiUntukFile(nama).then((r) => {
      if (batal) return;
      view = new EditorView({
        state: EditorState.create({
          doc: isi,
          extensions: [
            ...r.ext,
            zephyrHighlight,
            editorTheme(tema),
            EditorView.lineWrapping,
            EditorView.editable.of(false),
            EditorState.readOnly.of(true),
          ],
        }),
        parent: el,
      });
    });

    return () => {
      batal = true;
      view?.destroy();
    };
  }, [nama, isi, tema]);

  return <div className="agx-file-kode" ref={host} data-testid="agx-file-kode" />;
}

export default function AgentsPanelKananFile() {
  const workspace = useStore((s) => s.workspace);
  const [akar, setAkar] = useState<DirNode[]>([]);
  const [pohonTersembunyi, setPohonTersembunyi] = useState(false);
  /* File terpilih disimpan di tab File (store), bukan state lokal: label tab
     ikut berganti jadi nama file, dan pilihan tetap ada saat panel ditutup-buka. */
  const tabFileId = useAgxTabs((s) => s.tabs.find((t) => t.tampilan === 'file')?.id ?? null);
  const fileAktif = useAgxTabs((s) => s.tabs.find((t) => t.tampilan === 'file')?.path ?? null);
  const setFileAktif = (path: string | null) => {
    if (tabFileId) useAgxTabs.getState().setFile(tabFileId, path);
  };
  const [isi, setIsi] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const [sedangBaca, setSedangBaca] = useState(false);
  /* Lebar pratinjau dalam % (pohon = sisa) — di-drag lewat splitter. */
  const [lebarPratinjau, setLebarPratinjau] = useState(55);
  const dragRef = useRef(false);

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

  /* Drag splitter pratinjau ↔ pohon (persen dihitung terhadap `.agx-file-isi`). */
  const onPointerMoveSplit = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const w = e.currentTarget.parentElement;
    if (!w) return;
    const r = w.getBoundingClientRect();
    const persen = ((e.clientX - r.left) / r.width) * 100;
    setLebarPratinjau(Math.min(80, Math.max(20, persen)));
  };

  /*
   * Menu klik kanan: isinya BERBEDA untuk folder dan file — persis dua acuan
   * yang diminta user.
   *
   *   folder : New File…, New Folder…, Reveal in Explorer, Add to Chat,
   *            Copy Path, Rename, Delete
   *   file   : Reveal in Explorer, Add to Chat, Open in New Tab,
   *            Copy Path, Rename, Delete
   *
   * Semua aksi memakai command yang sudah ada (`fsCreateFile`, `fsCreateDir`,
   * `revealPath`, `fsRename`, `fsDelete`) — backend yang membatasi ke dalam
   * workspace, jadi tidak ada jalur path bebas dari sini. Satu-satunya aksi
   * yang butuh input teks ("…") memakai dialog di komponen ini, bukan
   * `window.prompt` (tidak tersedia di WebView2).
   */
  const [menuKonteks, setMenuKonteks] = useState<{ x: number; y: number; node: DirNode } | null>(
    null,
  );
  const [dialog, setDialog] = useState<{ judul: string; node: DirNode; jenis: 'file' | 'folder' | 'rename' } | null>(null);
  const [dialogNilai, setDialogNilai] = useState('');

  const bukaMenu = (e: React.MouseEvent, node: DirNode) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuKonteks({ x: e.clientX, y: e.clientY, node });
  };

  // Menu tertutup oleh klik di mana pun, Escape, atau scroll.
  useEffect(() => {
    if (!menuKonteks) return;
    const tutup = () => setMenuKonteks(null);
    const tombol = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuKonteks(null);
    };
    document.addEventListener('mousedown', tutup);
    window.addEventListener('keydown', tombol);
    window.addEventListener('resize', tutup);
    return () => {
      document.removeEventListener('mousedown', tutup);
      window.removeEventListener('keydown', tombol);
      window.removeEventListener('resize', tutup);
    };
  }, [menuKonteks]);

  const muatUlang = async (pilihPath?: string) => {
    if (!workspace) return;
    setAkar(await scanDir(workspace).catch(() => [] as DirNode[]));
    if (pilihPath) setFileAktif(pilihPath);
  };

  const mintaNama = (node: DirNode, jenis: 'file' | 'folder' | 'rename') => {
    setMenuKonteks(null);
    setDialogNilai(jenis === 'rename' ? node.name : '');
    setDialog({
      judul: jenis === 'file' ? 'New File' : jenis === 'folder' ? 'New Folder' : 'Rename',
      node,
      jenis,
    });
  };

  const jalankanDialog = () => {
    const nama = dialogNilai.trim();
    if (!dialog) return;
    const { node, jenis } = dialog;
    setDialog(null);
    if (!nama) return;
    /* Folder tujuan: untuk New File/New Folder = folder itu sendiri, untuk
       file biasa = folder induknya. Rename juga memakai induk yang sama. */
    const indukDari = (p: string) => p.replace(/[\\/][^\\/]+$/, '');
    const induk = node.isDir ? node.path : indukDari(node.path);
    const sep = induk.includes('\\') ? '\\' : '/';
    void (async () => {
      try {
        if (jenis === 'rename') {
          const tujuan = `${induk}${sep}${nama}`;
          if (tujuan !== node.path) {
            await fsRename(node.path, tujuan);
            await muatUlang(tujuan);
          }
          return;
        }
        const tujuan = `${induk}${sep}${nama}`;
        if (jenis === 'folder') {
          await fsCreateDir(tujuan);
          await muatUlang();
        } else {
          await fsCreateFile(tujuan, '');
          await muatUlang(tujuan);
        }
      } catch {
        /* diamkan: backend menolak (nama bentrok / di luar workspace) */
      }
    })();
  };

  const aksiMenu = (aksi: string, node: DirNode) => {
    setMenuKonteks(null);
    switch (aksi) {
      case 'new-file':
        return mintaNama(node, 'file');
      case 'new-folder':
        return mintaNama(node, 'folder');
      case 'rename':
        return mintaNama(node, 'rename');
      case 'reveal':
        void revealPath(node.path).catch(() => {});
        return;
      case 'copy-path':
        void clipboardWrite(node.path);
        return;
      case 'add-to-chat':
        /* "Add to Chat" = tempel path relatif ke draft composer chat utama.
           Draft disimpan di store modul (`useAgxDraft`) supaya jendela ini
           bisa menitipkannya tanpa menyentuh komponen chat. */
        useAgxDraft.getState().setDraft(
          [useAgxDraft.getState().draft, node.path].filter(Boolean).join(' '),
        );
        return;
      case 'open-tab':
        void mintaBukaDiEditor(node.path).catch(() => {});
        return;
      case 'delete':
        void fsDelete([node.path], node.isDir)
          .then(() => {
            if (fileAktif === node.path) setFileAktif(null);
            return muatUlang();
          })
          .catch(() => {});
        return;
    }
  };

  /*
   * New file: file kosong bernama "untitled-N.ts" di root workspace, lalu
   * dipilih di pohon supaya pratinjau langsung menampilkannya. `fsWrite`
   * dibatasi backend ke dalam workspace, jadi tidak ada jalur di luar.
   */
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const bikinFileBaru = () => {
    if (!workspace) return;
    void (async () => {
      const sep = workspace.includes('\\') ? '\\' : '/';
      const tujuan = `${workspace}${sep}untitled-${Date.now().toString(36)}.ts`;
      try {
        await fsWrite(tujuan, '');
        // Muat ulang akar pohon supaya file baru muncul.
        setAkar(await scanDir(workspace));
        setFileAktif(tujuan);
      } catch {
        /* diamkan: file tidak jadi dibuat (misal workspace tertutup) */
      }
    })();
  };
  const refresh = () => {
    if (!workspace) return;
    setAkar([]);
    void scanDir(workspace).then(setAkar).catch(() => setAkar([]));
  };
  // Menu "…" tertutup saat klik di luarnya.
  useEffect(() => {
    if (!menu) return;
    const luar = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', luar);
    return () => document.removeEventListener('mousedown', luar);
  }, [menu]);

  return (
    <div className="agx-file" data-testid="agx-file">
      {/* Baris 2: label panel; saat file dipilih diganti nama file + `Open`.
          Tombol collapse pohon TIDAK ikut dikondisikan: di acuan TRAE ikonnya
          selalu ada di baris ini, jadi pohon bisa dilipat kapan saja - bukan
          hanya setelah ada file yang dipilih.
          (Bar TAB sudah pindah ke `AgentsPanelKanan` — deretan tab + `+`.) */}
      <div className="agx-file-kepala" data-testid="agx-file-kepala">
        <span className="agx-file-kepala-nama">{fileAktif ? namaFile : 'File'}</span>
        <span className="agx-file-kepala-aksi">
          {fileAktif && (
            <button className="agx-file-open" data-testid="agx-file-open" title="Open in editor">
              Open
            </button>
          )}
          <button
            className="agx-kanan-ikon agx-file-collapse"
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
      </div>

      <div className={`agx-file-isi${pohonTersembunyi ? ' is-pohon-sembunyi' : ''}`}>
        {/* Pratinjau di kiri: kosong = ajakan pilih file. */}
        <div
          className="agx-file-pratinjau"
          data-testid="agx-file-pratinjau"
          style={pohonTersembunyi ? undefined : { flex: `0 0 ${lebarPratinjau}%` }}
        >
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
            <PratinjauKode nama={namaFile} isi={sedangBaca ? '' : isi} />
          )}
        </div>

        {/* Splitter: tarik untuk mengubah lebar pratinjau vs pohon. */}
        {!pohonTersembunyi && (
          <div
            className="agx-splitter agx-splitter-h"
            data-testid="agx-file-splitter"
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize"
            onPointerDown={(e) => {
              dragRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            onPointerMove={onPointerMoveSplit}
            onPointerUp={(e) => {
              dragRef.current = false;
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={() => {
              dragRef.current = false;
            }}
          />
        )}

        {/* Pohon file di KANAN (kebalikan explorer IDE). */}
        <div className="agx-file-pohon" data-testid="agx-file-pohon">
          <div className="agx-file-pohon-kepala" data-testid="agx-file-pohon-kepala">
            <span>{workspace ? (workspace.split(/[\\/]/).pop() ?? 'Workspace') : '—'}</span>
            <span className="agx-file-pohon-kepala-aksi">
              <button
                className="agx-kanan-ikon"
                data-testid="agx-file-search"
                title="Search file names"
                aria-label="Search file names"
              >
                <Ikon>
                  <circle cx="7.2" cy="7.2" r="4.2" />
                  <path d="M10.4 10.4 13.2 13.2" />
                </Ikon>
              </button>
              {/* "…" = more actions (tooltip-nya persis tulisan itu di acuan
                  TRAE). Isinya: Add file (folder baru), New file, Refresh. */}
              <div className="agx-file-menu-wadah" ref={menuRef}>
                <button
                  className="agx-kanan-ikon"
                  data-testid="agx-file-more"
                  title="More actions"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  onClick={() => setMenu((v) => !v)}
                >
                  <Ikon>
                    <path d="M3.4 8h.01M8 8h.01M12.6 8h.01" />
                  </Ikon>
                </button>
                {menu && (
                  <div className="agx-file-menu" role="menu" data-testid="agx-file-menu">
                    <button
                      className="agx-file-menu-item"
                      role="menuitem"
                      data-testid="agx-file-menu-addfile"
                      onClick={() => { setMenu(false); bikinFileBaru(); }}
                    >
                      <Ikon>
                        <path d="M3.6 2.4h5.6L12.4 5.6v8H3.6z" />
                        <path d="M8 7v4M6 9h4" />
                      </Ikon>
                      Add file
                    </button>
                    <button
                      className="agx-file-menu-item"
                      role="menuitem"
                      data-testid="agx-file-menu-newfile"
                      onClick={() => { setMenu(false); bikinFileBaru(); }}
                    >
                      <Ikon>
                        <path d="M3.6 2.4h5.6L12.4 5.6v8H3.6z" />
                        <path d="M8 7v4M6 9h4" />
                      </Ikon>
                      New file
                    </button>
                    <button
                      className="agx-file-menu-item"
                      role="menuitem"
                      data-testid="agx-file-menu-refresh"
                      onClick={() => { setMenu(false); refresh(); }}
                    >
                      <Ikon>
                        <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.6V5h-2.4" />
                      </Ikon>
                      Refresh
                    </button>
                  </div>
                )}
              </div>
            </span>
          </div>
          <div className="agx-file-pohon-isi" role="tree" data-testid="agx-file-pohon-isi">
            {akar.length === 0 && <div className="agx-file-pohon-kosong">No workspace folder</div>}
            {akar.map((n) => (
              <BarisPohon
                key={n.path}
                node={n}
                pilih={setFileAktif}
                fileAktif={fileAktif}
                bukaMenu={bukaMenu}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Menu klik kanan (posisi = kursor) — isinya dipilih dari `node.isDir`,
          jadi folder dan file memang mendapat dua daftar berbeda. */}
      {menuKonteks && (
        <div
          className="agx-tree-menu"
          role="menu"
          data-testid="agx-tree-menu"
          data-jenis={menuKonteks.node.isDir ? 'folder' : 'file'}
          style={{ left: menuKonteks.x, top: menuKonteks.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {MENU_KONTEKS[menuKonteks.node.isDir ? 'folder' : 'file'].map((m) =>
            m === 'pemisah' ? (
              <div key={`p-${Math.random()}`} className="agx-tree-menu-pemisah" role="separator" />
            ) : (
              <button
                key={m.id}
                className={`agx-tree-menu-item${m.bahaya ? ' is-bahaya' : ''}`}
                role="menuitem"
                data-testid={`agx-tree-menu-${m.id}`}
                onClick={() => aksiMenu(m.id, menuKonteks.node)}
              >
                {m.label}
              </button>
            ),
          )}
        </div>
      )}

      {/* Dialog nama: pengganti `window.prompt` (tidak ada di WebView2). */}
      {dialog && (
        <div className="agx-dialog-latar" data-testid="agx-file-dialog">
          <div className="agx-dialog" role="dialog" aria-modal="true">
            <div className="agx-dialog-judul">{dialog.judul}</div>
            <input
              className="agx-dialog-input"
              data-testid="agx-file-dialog-input"
              value={dialogNilai}
              autoFocus
              spellCheck={false}
              onChange={(e) => setDialogNilai(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') jalankanDialog();
                if (e.key === 'Escape') setDialog(null);
              }}
            />
            <div className="agx-dialog-aksi">
              <button
                className="agx-dialog-btn"
                data-testid="agx-file-dialog-batal"
                onClick={() => setDialog(null)}
              >
                Cancel
              </button>
              <button
                className="agx-dialog-btn is-utama"
                data-testid="agx-file-dialog-ok"
                onClick={jalankanDialog}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
