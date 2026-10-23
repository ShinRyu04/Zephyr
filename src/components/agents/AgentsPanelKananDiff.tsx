import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGit } from '../../lib/gitStore';
import * as cmd from '../../lib/commands';
import { ikonFile, ikonFolder } from '../../lib/fileIcons';
import { barisKomentar, sorotBaris } from '../../lib/sorotBaris';
import type { GitCommitFile, GitCommitInfo } from '../../lib/types';
import { useDiff, useDiffBerkas } from '../../lib/diffStore';
import { barisDiff } from '../../lib/simpleDiff';

/*
 * Diff View di panel kanan Agent window — meniru TRAE.
 * Kolom kiri: kartu per file yang berubah; klik kartu membuka diff-nya
 * (Split dua kolom / Unified satu kolom, dari menu Diff settings).
 */

function Ikon({
  children,
  size = 14,
  className,
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* Ikon generik di badge kuning kartu — sama untuk semua tipe file, seperti TRAE. */
function LencanaGenerik() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="10" height="10" rx="2.5" />
      <rect x="6.2" y="6.2" width="3.6" height="3.6" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ---- Pohon file kolom kanan (data dari git status, bukan daftar statis) ---- */

type NodePohon =
  | { jenis: 'folder'; nama: string; anak: NodePohon[] }
  | { jenis: 'file'; nama: string; path: string; status: string };

/* Titik status di ujung kanan baris file — warna dari jenis perubahan. */
/* Kelas warna badge kartu, dipisah dari `warnaStatus` karena badge memakai
   kelas CSS (bukan inline style): latar dan isinya perlu dua turunan warna
   yang sama, dan itu hanya bisa dijaga di satu tempat. */
function kelasStatus(status: string | undefined): string {
  if (!status) return '';
  if (status === 'A' || status === '?') return ' is-add';
  if (status === 'D') return ' is-del';
  return ' is-mod';
}

function warnaStatus(status: string): string {
  if (status === '?') return 'var(--accent)';
  if (status === 'D') return 'var(--deleted)';
  if (status === 'U') return 'var(--warning)';
  if (status === 'M') return 'var(--warning)';
  if (status === 'A') return 'var(--added)';
  return 'var(--text-muted)';
}

/* Urutan seperti TRAE: bandingkan per segmen path. `localeCompare` mengabaikan
   tanda baca sehingga `git.rs` bisa naik ke paling atas. */
function bandingPath(a: string, b: string): number {
  const sa = a.split(/[\\/]/);
  const sb = b.split(/[\\/]/);
  const n = Math.min(sa.length, sb.length);
  for (let i = 0; i < n; i++) {
    if (sa[i] === sb[i]) continue;
    return sa[i] < sb[i] ? -1 : 1;
  }
  return sa.length - sb.length;
}

/* ---- Parser patch git → baris diff ---- */

/* Satu baris hasil parse patch. `lado`/`lbaru` = nomor baris sisi lama/baru. */
type BarisPatch = {
  jenis: 'same' | 'add' | 'del';
  teks: string;
  lado: number | null;
  lbaru: number | null;
};

/* Parse output `git diff HEAD -- <path>` (juga diff sintetis file untracked
   dari git.rs). Satu file = satu patch, jadi cukup ambil hunk pertama..terakhir. */
function parsePatch(patch: string): BarisPatch[] {
  const out: BarisPatch[] = [];
  let lado = 0;
  let lbaru = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('@@')) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (m) {
        lado = parseInt(m[1], 10);
        lbaru = parseInt(m[2], 10);
      }
      continue;
    }
    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('rename ') ||
      line.startsWith('similarity ') ||
      line.startsWith('Binary') ||
      line.startsWith('… ')
    ) {
      continue;
    }
    if (line.startsWith('+')) {
      out.push({ jenis: 'add', teks: line.slice(1), lado: null, lbaru: lbaru++ });
    } else if (line.startsWith('-')) {
      out.push({ jenis: 'del', teks: line.slice(1), lado: lado++, lbaru: null });
    } else if (line.startsWith(' ')) {
      out.push({ jenis: 'same', teks: line.slice(1), lado: lado++, lbaru: lbaru++ });
    }
    /* Baris kosong di akhir patch (setelah \n terakhir) diabaikan. */
  }
  return out;
}

/* "Committed 23 hours ago" — meta baris commit di dropdown TRAE. */
function waktuCommit(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return `Committed ${iso.slice(0, 10)}`;
  const menit = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (menit < 1) return 'Committed just now';
  if (menit < 60) return `Committed ${menit} minute${menit === 1 ? '' : 's'} ago`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `Committed ${jam} hour${jam === 1 ? '' : 's'} ago`;
  const hari = Math.round(jam / 24);
  if (hari < 30) return `Committed ${hari} day${hari === 1 ? '' : 's'} ago`;
  const bulan = Math.round(hari / 30);
  if (bulan < 12) return `Committed ${bulan} month${bulan === 1 ? '' : 's'} ago`;
  const tahun = Math.round(bulan / 12);
  return `Committed ${tahun} year${tahun === 1 ? '' : 's'} ago`;
}

/* Folder path untuk kartu: segmen tanpa nama file. Truncation `…onents/agents`
   dikerjakan CSS (direction rtl) — kalau muat, path tampil utuh seperti `src/lib`. */
function folderPath(p: string): string {
  const segmen = p.split(/[\\/]/);
  segmen.pop();
  return segmen.join('/');
}

/* Satu baris diff berwarna: token dari sorotBaris, baris komentar diabukan. */
function BarisKode({ teks, warna }: { teks: string; warna: boolean }) {
  if (barisKomentar(teks)) {
    return <span className="agx-dv-tok agx-dv-tok-komentar">{teks || ' '}</span>;
  }
  if (!warna) return <>{teks || ' '}</>;
  const toks = sorotBaris(teks);
  if (toks.length === 0) return <>{teks || ' '}</>;
  return (
    <>
      {toks.map((t, i) =>
        t.jenis === null ? (
          <span key={i} className="agx-dv-tok">
            {t.teks}
          </span>
        ) : (
          <span key={i} className={`agx-dv-tok agx-dv-tok-${t.jenis}`}>
            {t.teks}
          </span>
        ),
      )}
    </>
  );
}

function BarisPohon({
  node,
  kedalaman,
  kunci,
  tutup,
  toggleFolder,
  terpilih,
  toggleSatu,
  onBuka,
  bisaPilih,
}: {
  node: NodePohon;
  kedalaman: number;
  kunci: string;
  tutup: Set<string>;
  toggleFolder: (k: string) => void;
  terpilih: Set<string>;
  toggleSatu: (p: string) => void;
  /* Klik file = buka kartunya di kiri; dipakai Pending maupun Committed. */
  onBuka: (p: string) => void;
  /* Committed Changes tidak punya aksi commit, jadi tidak ada ceklis file. */
  bisaPilih: boolean;
}) {
  if (node.jenis === 'folder') {
    const terbuka = !tutup.has(kunci);
    return (
      <div role="treeitem" aria-expanded={terbuka}>
        <button
          className="agx-dv-tree-baris is-folder"
          style={{ paddingLeft: 8 + kedalaman * 14 }}
          onClick={() => toggleFolder(kunci)}
        >
          <span className={`agx-dv-tree-panah${terbuka ? ' is-buka' : ''}`}>
            <Ikon size={12}>
              <path d="M6 4l4 4-4 4" />
            </Ikon>
          </span>
          <span
            className="agx-dv-tree-glyph"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: ikonFolder(node.nama).svg ?? '' }}
          />
          <span className="agx-dv-tree-nama">{node.nama}</span>
        </button>
        {terbuka && (
          <div
            role="group"
            className="agx-dv-tree-group"
            /* Garis indent vertikal di bawah chevron folder induknya. */
            style={{ ['--agx-dv-indent' as string]: `${8 + kedalaman * 14 + 6}px` }}
          >
            {node.anak.map((a) => (
              <BarisPohon
                key={a.jenis === 'file' ? a.path : `${kunci}/${a.nama}`}
                node={a}
                kedalaman={kedalaman + 1}
                kunci={a.jenis === 'file' ? a.path : `${kunci}/${a.nama}`}
                tutup={tutup}
                toggleFolder={toggleFolder}
                terpilih={terpilih}
                toggleSatu={toggleSatu}
                onBuka={onBuka}
                bisaPilih={bisaPilih}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const ikon = ikonFile(node.nama);
  return (
    <button
      className="agx-dv-tree-baris"
      style={{ paddingLeft: 8 + kedalaman * 14 }}
      data-testid="agx-dv-tree-file"
      data-path={node.path}
      onClick={() => {
        /* Di Committed tidak ada ceklis, jadi tanpa ini klik file di pohon
           tidak menghasilkan apa pun. Sekarang selalu membuka kartunya. */
        if (bisaPilih) toggleSatu(node.path);
        onBuka(node.path);
      }}
    >
      <span className="agx-dv-tree-panah" aria-hidden="true" />
      {bisaPilih && (
        <input
          type="checkbox"
          className="agx-dv-tree-cek agx-dv-tree-cek-file"
          checked={terpilih.has(node.path)}
          onChange={() => toggleSatu(node.path)}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {ikon.svg ? (
        <span
          className="agx-dv-tree-glyph"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: ikon.svg }}
        />
      ) : (
        <span className="agx-dv-tree-glyph">{ikon.glyph ?? ''}</span>
      )}
      <span className="agx-dv-tree-nama">{node.nama}</span>
      <span
        className="agx-dv-tree-titik"
        data-status={node.status}
        style={{ background: warnaStatus(node.status) }}
        aria-hidden="true"
      />
    </button>
  );
}

/* ---- Kartu satu file: header + isi diff yang bisa dibuka/tutup ---- */

function KartuDiff({
  path,
  status,
  plus,
  min,
  terbuka,
  toggle,
  split,
  abaikanSpasi,
  bungkus,
  hash,
  ai,
  sebelumAi,
  sesudahAi,
  onKeep,
  onRevert,
}: {
  path: string;
  /** Kode status git: A/? baru, D dihapus, M/U diubah. */
  status?: string;
  plus: number;
  min: number;
  terbuka: boolean;
  toggle: () => void;
  split: boolean;
  abaikanSpasi: boolean;
  bungkus: boolean;
  /* Diisi hanya di Committed Changes: diff diambil dari commit, bukan HEAD. */
  hash?: string | null;
  /* AI Changes: diff disusun dari snapshot sebelum/sesudah, bukan dari git. */
  ai?: boolean;
  sebelumAi?: string | null;
  sesudahAi?: string | null;
  onKeep?: () => void;
  onRevert?: () => void;
}) {
  /* Patch diambil saat kartu pertama dibuka; diff besar jarang, tapi tetap
     dibatalkan bila kartu ditutup di tengah jalan. */
  const [baris, setBaris] = useState<BarisPatch[] | null>(null);
  const [gagal, setGagal] = useState(false);
  /* "Expand all" bisa membuka ratusan kartu sekaligus. Memuat semua diff-nya
     berarti ratusan proses git dan hitungan menit, jadi isi baru dimuat saat
     kartu benar-benar mendekati layar (IntersectionObserver). */
  const ref = useRef<HTMLDivElement | null>(null);
  const [terlihat, setTerlihat] = useState(false);

  useEffect(() => {
    if (!terbuka || terlihat) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setTerlihat(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setTerlihat(true);
          io.disconnect();
        }
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [terbuka, terlihat]);

  /* Mode AI tidak memakai git: barisnya dihitung dari snapshot diffStore. */
  const barisAi = useMemo(
    () =>
      ai
        ? barisDiff(sebelumAi ?? '', sesudahAi ?? '').map((r) => ({
            jenis: r.kind,
            teks: r.text,
            lado: r.a,
            lbaru: r.b,
          }))
        : null,
    [ai, sebelumAi, sesudahAi],
  );
  const isi = ai ? barisAi : baris;
  const galat = ai ? false : gagal;

  useEffect(() => {
    if (ai) return;
    if (!terbuka || !terlihat) return;
    let batal = false;
    setGagal(false);
    /* Commit lain = isi lama tidak boleh tampil selama patch baru dimuat. */
    setBaris(null);
    const janji = hash
      ? cmd.gitDiffCommit(hash, path, abaikanSpasi)
      : cmd.gitDiffHead(path, abaikanSpasi);
    void janji
      .then((patch) => {
        if (!batal) setBaris(parsePatch(patch));
      })
      .catch(() => {
        if (!batal) setGagal(true);
      });
    return () => {
      batal = true;
    };
  }, [ai, terbuka, terlihat, path, abaikanSpasi, hash]);

  const segmen = path.split(/[\\/]/);
  const nama = segmen[segmen.length - 1];
  const folder = folderPath(path);

  const clsBaris = (j: BarisPatch['jenis']) =>
    j === 'add' ? ' is-add' : j === 'del' ? ' is-del' : '';

  return (
    <div
      ref={ref}
      className={`agx-dv-kartu${terbuka ? ' is-buka' : ''}`}
      data-testid="agx-dv-kartu"
      data-path={path}
    >
      <button
        className="agx-dv-kartu-kepala"
        data-testid="agx-dv-kartu-kepala"
        aria-expanded={terbuka}
        onClick={toggle}
      >
        <span className="agx-dv-kartu-toggle" aria-hidden="true">
          {terbuka ? (
            <Ikon size={13}>
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
            </Ikon>
          ) : (
            <Ikon size={13}>
              <path d="M6.5 4L3 8l3.5 4" />
              <path d="M9.5 4L13 8l-3.5 4" />
            </Ikon>
          )}
        </span>
        <span className={`agx-dv-kartu-lencana${kelasStatus(status)}`} aria-hidden="true">
          <LencanaGenerik />
        </span>
        <span className="agx-dv-kartu-nama">{nama}</span>
        <span className="agx-dv-kartu-jalur" title={path}>
          {folder}
        </span>
        <span className="agx-dv-kartu-stat">
          <span className="agx-dv-plus">+{plus}</span>
          <span className="agx-dv-min">-{min}</span>
        </span>
      </button>

      {terbuka && (
        <div className="agx-dv-kartu-badan" data-testid="agx-dv-kartu-badan">
          {ai && (
            <div className="agx-dv-ai-aksi" data-testid="agx-dv-ai-aksi">
              <span className="agx-dv-ai-aksi-ket">
                {sebelumAi == null ? 'New file' : sesudahAi == null ? 'Deleted file' : 'Modified by AI'}
              </span>
              <button
                className="agx-dv-btn"
                data-testid="agx-dv-ai-revert"
                onClick={onRevert}
              >
                Revert
              </button>
              <button
                className="agx-dv-btn agx-dv-commit"
                data-testid="agx-dv-ai-keep"
                onClick={onKeep}
              >
                Keep
              </button>
            </div>
          )}
          {galat && <div className="agx-dv-kartu-pesan">Failed to load diff.</div>}
          {!galat && isi === null && <div className="agx-dv-kartu-pesan">Loading…</div>}
          {!galat && isi !== null && isi.length === 0 && (
            <div className="agx-dv-kartu-pesan">No changes.</div>
          )}
          {!galat && isi !== null && isi.length > 0 && (
            <div className={`agx-dv-diff${bungkus ? ' is-bungkus' : ''}`}>
              {split ? (
                <div className="agx-dv-diff-split" data-testid="agx-dv-diff-split">
                  <SplitSisi baris={isi} sisi="lama" />
                  <SplitSisi baris={isi} sisi="baru" />
                </div>
              ) : (
                <div className="agx-dv-diff-unified" data-testid="agx-dv-diff-unified">
                  {isi.map((b, i) => (
                    <div key={i} className={`agx-dv-diff-baris${clsBaris(b.jenis)}`}>
                      <span className="agx-dv-diff-no">{b.lado ?? ''}</span>
                      <span className="agx-dv-diff-no">{b.lbaru ?? ''}</span>
                      <span className="agx-dv-diff-teks">
                        <BarisKode teks={b.teks} warna={b.jenis !== 'same'} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* Satu sisi (lama / baru) di mode Split: baris punya nomor sendiri; sisi yang
   tidak punya baris untuk posisi itu diberi baris kosong supaya sejajar. */
function SplitSisi({ baris, sisi }: { baris: BarisPatch[]; sisi: 'lama' | 'baru' }) {
  const sel: { no: number | null; teks: string; jenis: BarisPatch['jenis'] | 'kosong' }[] = [];
  for (const b of baris) {
    if (sisi === 'lama') {
      if (b.jenis === 'add') sel.push({ no: null, teks: '', jenis: 'kosong' });
      else sel.push({ no: b.lado, teks: b.teks, jenis: b.jenis });
    } else {
      if (b.jenis === 'del') sel.push({ no: null, teks: '', jenis: 'kosong' });
      else sel.push({ no: b.lbaru, teks: b.teks, jenis: b.jenis });
    }
  }
  const cls = sisi === 'lama' ? ' is-del' : ' is-add';
  return (
    <div className="agx-dv-diff-sisi">
      {sel.map((s, i) => (
        <div key={i} className={`agx-dv-diff-baris${s.jenis === 'kosong' ? '' : cls}`}>
          <span className="agx-dv-diff-no">{s.no ?? ''}</span>
          <span className="agx-dv-diff-teks">
            <BarisKode teks={s.teks} warna={s.jenis !== 'same' && s.jenis !== 'kosong'} />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function AgentsPanelKananDiff({ bar }: { bar?: ReactNode | null }) {
  const status = useGit((s) => s.status);
  const busy = useGit((s) => s.busy);
  const refresh = useGit((s) => s.refresh);
  const setConfirm = useGit((s) => s.setConfirm);
  const resolveConfirm = useGit((s) => s.resolveConfirm);
  const setScmError = useGit((s) => s.setError);
  /* Berkas yang diubah AI di giliran terakhir — sumber mode "AI Changes". */
  const berkasAi = useDiffBerkas();
  const stage = useGit((s) => s.stage);
  const commit = useGit((s) => s.commit);
  const commitWithAi = useGit((s) => s.commitWithAi);
  const push = useGit((s) => s.push);
  const pesanCommit = useGit((s) => s.message);
  const setPesanCommit = useGit((s) => s.setMessage);

  const [menuMode, setMenuMode] = useState(false);
  const [menuAtur, setMenuAtur] = useState(false);
  const [menuCommit, setMenuCommit] = useState(false);
  const [tanyaDiscard, setTanyaDiscard] = useState(false);
  /* Pop-up commit: 'commit' | 'push' | 'commit-push' — satu dialog, aksi beda. */
  const [dialogCommit, setDialogCommit] = useState<null | 'commit' | 'push' | 'commit-push'>(null);

  /* Mode tampilan: Pending (working tree) / Committed (riwayat commit) /
     AI Changes (belum diimplementasi). Sumber kartu + pohon mengikuti mode. */
  const [mode, setMode] = useState<'pending' | 'committed' | 'ai'>('pending');
  /* Committed Changes: daftar commit + berkas commit yang dipilih. */
  const [commitList, setCommitList] = useState<GitCommitInfo[]>([]);
  const [commitTerpilih, setCommitTerpilih] = useState<string | null>(null);
  const [berkasCommit, setBerkasCommit] = useState<GitCommitFile[]>([]);
  const [memuatLog, setMemuatLog] = useState(false);
  const [memuatBerkas, setMemuatBerkas] = useState(false);
  const [segarkanCommit, setSegarkanCommit] = useState(0);
  const [menuPilihCommit, setMenuPilihCommit] = useState(false);
  const [cariCommit, setCariCommit] = useState('');
  /* Pohon file bisa disembunyikan (tombol pohon di ujung kanan bar). */
  const [pohonTampil, setPohonTampil] = useState(true);
  const [split, setSplit] = useState(true);
  const [abaikanSpasi, setAbaikanSpasi] = useState(false);
  const [bungkusBaris, setBungkusBaris] = useState(false);
  const [tambah, setTambah] = useState(0);
  const [hapus, setHapus] = useState(0);
  /* +N/-N per path untuk kartu. */
  const [numstat, setNumstat] = useState<Record<string, [number, number]>>({});
  /* Kartu diff yang terbuka. Boleh lebih dari satu: TRAE membiarkan beberapa
     kartu terbuka sekaligus, dan Collapse/Expand all bekerja atas himpunan ini. */
  const [buka, setBuka] = useState<Set<string>>(new Set());
  /* Penanda muat ulang numstat (tombol Refresh di Pending). */
  const [segarkanStat, setSegarkanStat] = useState(0);
  const [memuatStat, setMemuatStat] = useState(false);

  const perubahan = status?.changes ?? [];
  const adaPerubahan = perubahan.length > 0;

  /* ---- Pohon file (kolom kanan) ---- */
  const [saring, setSaring] = useState('');
  /* Satu perubahan per path (unstaged menang). Committed memakai berkas
     commit yang dipilih; AI Changes belum punya sumber data. */
  const daftar = useMemo(() => {
    if (mode === 'committed') {
      return berkasCommit
        .map((f) => [f.path, f.status] as [string, string])
        .sort((a, b) => bandingPath(a[0], b[0]));
    }
    if (mode === 'ai') {
      /* Status turunan dari snapshot: belum ada sebelumnya = A (baru),
         dihapus = D, sisanya M — sama dengan huruf di Pending. */
      return berkasAi
        .map(
          (b) =>
            [b.path, b.sebelum === null ? 'A' : b.sesudah === null ? 'D' : 'M'] as [
              string,
              string,
            ],
        )
        .sort((a, b) => bandingPath(a[0], b[0]));
    }
    if (mode !== 'pending') return [];
    const lihat = new Map<string, string>();
    for (const c of perubahan) {
      if (!lihat.has(c.path)) lihat.set(c.path, c.status);
    }
    return [...lihat.entries()].sort((a, b) => bandingPath(a[0], b[0]));
  }, [mode, perubahan, berkasCommit, berkasAi]);

  const terSaring = useMemo(() => {
    const q = saring.trim().toLowerCase();
    if (!q) return daftar;
    return daftar.filter(([p]) => p.toLowerCase().includes(q));
  }, [daftar, saring]);

  /* ---- Kartu kiri: buka/tutup per kartu, atau semua sekaligus ---- */
  const toggleKartu = (p: string) =>
    setBuka((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  const tutupSemuaKartu = () => setBuka(new Set());
  const bukaSemuaKartu = () => setBuka(new Set(terSaring.map(([p]) => p)));
  const semuaKartuTerbuka = terSaring.length > 0 && terSaring.every(([p]) => buka.has(p));
  /* Klik file di pohon: buka kartunya di kiri lalu gulir ke sana. */
  const bukaDanGulir = (p: string) => {
    setBuka((s) => new Set(s).add(p));
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-testid="agx-dv-kartu"][data-path="${CSS.escape(p)}"]`,
      );
      el?.scrollIntoView({ block: 'nearest' });
    });
  };

  const pohon = useMemo<NodePohon[]>(() => {
    const buatFolder = (nama: string): NodePohon & { jenis: 'folder' } => ({
      jenis: 'folder',
      nama,
      anak: [],
    });
    const akar: NodePohon[] = [];
    const cariAtauBuat = (list: NodePohon[], nama: string): NodePohon & { jenis: 'folder' } => {
      const ada = list.find((x): x is NodePohon & { jenis: 'folder' } => x.jenis === 'folder' && x.nama === nama);
      if (ada) return ada;
      const n = buatFolder(nama);
      list.push(n);
      return n;
    };
    /* Indeks gabungan: `src > components > agents` -> node folder. */
    const indeks = new Map<string, NodePohon & { jenis: 'folder' }>();
    const folderUntuk = (segmen: string[], induk: NodePohon[]): NodePohon & { jenis: 'folder' } => {
      const kunci = segmen.join('/');
      const ada = indeks.get(kunci);
      if (ada) return ada;
      const n = cariAtauBuat(induk, segmen[segmen.length - 1]);
      indeks.set(kunci, n);
      return n;
    };
    for (const [p, st] of terSaring) {
      const segmen = p.split(/[\\/]/);
      const nama = segmen.pop()!;
      let induk = akar;
      let jalur: string[] = [];
      for (const s of segmen) {
        jalur.push(s);
        induk = folderUntuk(jalur, induk).anak;
      }
      induk.push({ jenis: 'file', nama, path: p, status: st });
    }
    const urutkan = (list: NodePohon[]): NodePohon[] => {
      for (const n of list) {
        if (n.jenis === 'folder') n.anak = urutkan(n.anak);
      }
      /* Folder dulu, lalu abjad tanpa peduli besar/kecil huruf (seperti VS Code). */
      return [...list].sort((a, b) => {
        if (a.jenis !== b.jenis) return a.jenis === 'folder' ? -1 : 1;
        const na = a.nama.toLowerCase();
        const nb = b.nama.toLowerCase();
        return na < nb ? -1 : na > nb ? 1 : 0;
      });
    };
    return urutkan(akar);
  }, [terSaring]);

  /* ---- Ceklis: header = select all, per file = pilih file masuk commit ---- */
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  useEffect(() => {
    /* Daftar berubah (filter/refresh): buang path yang tidak ada lagi. */
    setTerpilih((lama) => {
      const hidup = new Set(daftar.map(([p]) => p));
      const n = new Set([...lama].filter((p) => hidup.has(p)));
      return n.size === lama.size ? lama : n;
    });
  }, [daftar]);
  const semuaTerpilih = daftar.length > 0 && terpilih.size >= daftar.length;
  const toggleSemua = () => {
    setTerpilih(semuaTerpilih ? new Set() : new Set(daftar.map(([p]) => p)));
  };
  const toggleSatu = (p: string) => {
    setTerpilih((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  };

  const [tutupFolder, setTutupFolder] = useState<Set<string>>(new Set());
  const toggleFolder = (kunci: string) => {
    setTutupFolder((s) => {
      const n = new Set(s);
      if (n.has(kunci)) n.delete(kunci);
      else n.add(kunci);
      return n;
    });
  };

  /* ---- Resize garis pembatas kiri pohon (tarik untuk melebar/menyempit) ---- */
  const [lebarSisi, setLebarSisi] = useState(260);
  const mulaiResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const mulaiX = e.clientX;
    const mulaiLebar = lebarSisi;
    const gerak = (ev: PointerEvent) => {
      const dx = mulaiX - ev.clientX;
      setLebarSisi(Math.min(480, Math.max(120, mulaiLebar + dx)));
    };
    const naik = () => {
      el.removeEventListener('pointermove', gerak);
      el.removeEventListener('pointerup', naik);
      el.removeEventListener('pointercancel', naik);
    };
    el.addEventListener('pointermove', gerak);
    el.addEventListener('pointerup', naik);
    el.addEventListener('pointercancel', naik);
  };

  const discard = async () => {
    setTanyaDiscard(false);
    setConfirm({ kind: 'discard-all', paths: perubahan.map((c) => c.path) });
    await resolveConfirm();
  };

  /*
   * Aksi dari pop-up commit. TRAE tidak pakai staging: semua file yang
   * tercentang masuk commit. Karena store Zephyr mensyaratkan file staged,
   * pop-up men-stage pilihan dulu, lalu commit.
   *
   * Pesan kosong = generate otomatis lewat AI (commitWithAi), ditampilkan
   * balik di kotak — persis janji placeholder TRAE.
   */
  const jalankanCommit = async (): Promise<boolean> => {
    const pilihan = terpilih.size > 0 ? [...terpilih] : daftar.map(([p]) => p);
    if (pesanCommit.trim() === '') {
      const ok = await commitWithAi();
      if (!ok) return false;
    }
    await stage(pilihan);
    return commit();
  };

  const aksiDialog = async () => {
    if (!dialogCommit) return;
    const mode = dialogCommit;
    setDialogCommit(null);
    if (mode === 'push') {
      await push();
      return;
    }
    const ok = await jalankanCommit();
    if (ok && mode === 'commit-push') await push();
  };

  /* Sidik jari daftar perubahan: numstat harus dimuat ulang bukan hanya saat
     jumlah file berubah, tapi juga saat isinya berubah atau Refresh ditekan —
     kalau tidak, angka +/− bisa tertinggal dari daftarnya. */
  const capPerubahan = perubahan.map((c) => `${c.path}:${c.status}`).join('|');

  /* Total +/- untuk judul, dari satu panggilan numstat. */
  useEffect(() => {
    let batal = false;
    if (perubahan.length === 0) {
      setTambah(0);
      setHapus(0);
      setNumstat({});
      setMemuatStat(false);
      return;
    }
    setMemuatStat(true);
    void cmd
      .gitNumstat(false)
      .then((s) => {
        if (batal) return;
        let a = 0;
        let d = 0;
        for (const [t, h] of Object.values(s)) {
          if (t > 0) a += t;
          if (h > 0) d += h;
        }
        setTambah(a);
        setHapus(d);
        setNumstat(s);
        setMemuatStat(false);
      })
      .catch(() => {
        /* git bukan repo atau gagal — biarkan 0. */
        if (!batal) setMemuatStat(false);
      });
    return () => {
      batal = true;
    };
  }, [capPerubahan, segarkanStat]);

  /* AI Changes: kembalikan berkas ke isi sebelum tulisan agen (atau hapus
     berkas yang memang baru dibuat), lalu keluarkan dari daftar review. */
  const kembalikanAi = async (p: string) => {
    const b = berkasAi.find((x) => x.path === p);
    if (!b) return;
    try {
      if (b.sebelum === null) await cmd.fsDelete([p]);
      else await cmd.fsWrite(p, b.sebelum, undefined, undefined, { wasExisting: true });
      useDiff.getState().buang(p);
      setBuka((s) => {
        const n = new Set(s);
        n.delete(p);
        return n;
      });
      void refresh();
    } catch (e) {
      setScmError(cmd.asZephyrError(e).message);
    }
  };

  /* ---- Committed Changes: daftar commit, lalu berkas commit terpilih ---- */
  useEffect(() => {
    if (mode !== 'committed') return;
    let batal = false;
    setMemuatLog(true);
    void cmd
      .gitLog(50)
      .then((list) => {
        if (batal) return;
        setCommitList(list);
        /* HEAD tetap terpilih selama masih ada di daftar baru. */
        setCommitTerpilih((lama) =>
          lama && list.some((c) => c.hash7 === lama) ? lama : list[0]?.hash7 ?? null,
        );
      })
      .catch(() => {
        if (batal) return;
        setCommitList([]);
        setCommitTerpilih(null);
      })
      .finally(() => {
        if (!batal) setMemuatLog(false);
      });
    return () => {
      batal = true;
    };
  }, [mode, segarkanCommit]);

  useEffect(() => {
    if (mode !== 'committed' || !commitTerpilih) {
      setBerkasCommit([]);
      return;
    }
    let batal = false;
    setBerkasCommit([]);
    setMemuatBerkas(true);
    void cmd
      .gitCommitFiles(commitTerpilih)
      .then((f) => {
        if (!batal) setBerkasCommit(f);
      })
      .catch(() => {
        if (!batal) setBerkasCommit([]);
      })
      .finally(() => {
        if (!batal) setMemuatBerkas(false);
      });
    return () => {
      batal = true;
    };
  }, [mode, commitTerpilih, segarkanCommit]);

  const commitAktif = useMemo(
    () => commitList.find((c) => c.hash7 === commitTerpilih) ?? null,
    [commitList, commitTerpilih],
  );
  /* Numstat kartu/pohon mengikuti sumber mode: working tree atau commit. */
  const numstatCommit = useMemo(() => {
    const m: Record<string, [number, number]> = {};
    for (const f of berkasCommit) m[f.path] = [f.add, f.del];
    return m;
  }, [berkasCommit]);
  const numstatAi = useMemo(() => {
    const m: Record<string, [number, number]> = {};
    for (const b of berkasAi) m[b.path] = [b.tambah, b.hapus];
    return m;
  }, [berkasAi]);
  const numstatAktif =
    mode === 'committed' ? numstatCommit : mode === 'ai' ? numstatAi : numstat;
  const aiTambah = berkasAi.reduce((n, b) => n + b.tambah, 0);
  const aiHapus = berkasAi.reduce((n, b) => n + b.hapus, 0);
  const statTambah = mode === 'committed' ? berkasCommit.reduce((n, f) => n + f.add, 0) : tambah;
  const statHapus = mode === 'committed' ? berkasCommit.reduce((n, f) => n + f.del, 0) : hapus;
  const memuatCommit = memuatLog || memuatBerkas;
  const commitTersaring = useMemo(() => {
    const q = cariCommit.trim().toLowerCase();
    if (!q) return commitList;
    return commitList.filter(
      (c) => c.subject.toLowerCase().includes(q) || c.hash7.toLowerCase().includes(q),
    );
  }, [commitList, cariCommit]);

  /* Menu ditutup saat klik di luar baris atas. */
  useEffect(() => {
    if (!menuMode && !menuAtur && !menuCommit && !menuPilihCommit) return;
    const tutup = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.agx-dv-bar')) {
        setMenuMode(false);
        setMenuAtur(false);
        setMenuCommit(false);
        setMenuPilihCommit(false);
      }
    };
    document.addEventListener('mousedown', tutup);
    return () => document.removeEventListener('mousedown', tutup);
  }, [menuMode, menuAtur, menuCommit, menuPilihCommit]);

  /* Tombol + menu Diff settings dipakai bersama Pending dan Committed:
     Split/Unified, lalu Ignore Whitespace/Word Wrap. */
  const tombolAturDiff = (
    <div className="agx-dv-dd-wadah">
      <button
        className="agx-dv-ikon"
        title="Diff settings"
        aria-label="Diff settings"
        aria-expanded={menuAtur}
        data-testid="agx-dv-atur"
        data-aktif={menuAtur || undefined}
        onClick={() => {
          setMenuAtur((o) => !o);
          setMenuMode(false);
          setMenuCommit(false);
          setMenuPilihCommit(false);
        }}
      >
        <Ikon>
          <path d="M3 5h10M3 11h10" />
          <circle cx="6" cy="5" r="1.8" />
          <circle cx="10" cy="11" r="1.8" />
        </Ikon>
      </button>
      {menuAtur && (
        <div className="agx-dv-menu agx-dv-menu-atur" role="menu">
          <button
            className="agx-dv-menu-item"
            role="menuitemradio"
            aria-checked={split}
            data-testid="agx-dv-split"
            onClick={() => setSplit(true)}
          >
            <span className="agx-dv-menu-teks">
              <Ikon size={14}>
                <rect x="2.5" y="3" width="4.5" height="10" rx="1" fill="var(--deleted)" stroke="none" />
                <rect x="9" y="3" width="4.5" height="10" rx="1" fill="var(--added)" stroke="none" />
              </Ikon>
              Split
            </span>
            {split && (
              <Ikon size={14}>
                <path d="M3 8.5l3 3 7-7" />
              </Ikon>
            )}
          </button>
          <button
            className="agx-dv-menu-item"
            role="menuitemradio"
            aria-checked={!split}
            data-testid="agx-dv-unified"
            onClick={() => setSplit(false)}
          >
            <span className="agx-dv-menu-teks">
              <Ikon size={14}>
                <rect x="2.5" y="3" width="11" height="4" rx="1" fill="var(--deleted)" stroke="none" />
                <rect x="2.5" y="9" width="11" height="4" rx="1" fill="var(--added)" stroke="none" />
              </Ikon>
              Unified
            </span>
            {!split && (
              <Ikon size={14}>
                <path d="M3 8.5l3 3 7-7" />
              </Ikon>
            )}
          </button>
          <div className="agx-dv-menu-garis" />
          <button
            className="agx-dv-menu-item"
            role="switch"
            aria-checked={abaikanSpasi}
            data-testid="agx-dv-spasi"
            onClick={() => setAbaikanSpasi((v) => !v)}
          >
            Ignore Whitespace
            <span className="agx-dv-toggle" aria-hidden="true">
              <span className="agx-dv-toggle-pin" />
            </span>
          </button>
          <button
            className="agx-dv-menu-item"
            role="switch"
            aria-checked={bungkusBaris}
            data-testid="agx-dv-bungkus"
            onClick={() => setBungkusBaris((v) => !v)}
          >
            Word Wrap
            <span className="agx-dv-toggle" aria-hidden="true">
              <span className="agx-dv-toggle-pin" />
            </span>
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {bar}
      <div className="agx-dv-bar" data-mode={mode} data-testid="agx-dv-bar">
        <div className="agx-dv-bar-kiri">
        <div className="agx-dv-dd-wadah">
          <button
            className="agx-dv-dd"
            aria-expanded={menuMode}
            data-testid="agx-dv-mode"
            onClick={() => {
              setMenuMode((o) => !o);
              setMenuAtur(false);
              setMenuCommit(false);
              setMenuPilihCommit(false);
            }}
          >
            {mode === 'committed' ? 'Committed Changes' : mode === 'ai' ? 'AI Changes' : 'Pending Changes'}
            <Ikon size={12}>
              <path d="M4 6l4 4 4-4" />
            </Ikon>
          </button>
          {menuMode && (
            <div className="agx-dv-menu" role="menu">
              <button
                className="agx-dv-menu-item"
                role="menuitemradio"
                aria-checked={mode === 'pending'}
                data-testid="agx-dv-mode-pending"
                onClick={() => {
                  setMode('pending');
                  setMenuMode(false);
                }}
              >
                Pending Changes
                {mode === 'pending' && (
                  <Ikon size={13}>
                    <path d="M3 8.5l3 3 7-7" />
                  </Ikon>
                )}
              </button>
              <button
                className="agx-dv-menu-item"
                role="menuitemradio"
                aria-checked={mode === 'committed'}
                data-testid="agx-dv-mode-committed"
                onClick={() => {
                  setMode('committed');
                  setMenuMode(false);
                }}
              >
                Committed Changes
                {mode === 'committed' && (
                  <Ikon size={13}>
                    <path d="M3 8.5l3 3 7-7" />
                  </Ikon>
                )}
              </button>
              <button
                className="agx-dv-menu-item"
                role="menuitemradio"
                aria-checked={mode === 'ai'}
                data-testid="agx-dv-mode-ai"
                onClick={() => {
                  setMode('ai');
                  setMenuMode(false);
                }}
              >
                AI Changes
                {mode === 'ai' && (
                  <Ikon size={13}>
                    <path d="M3 8.5l3 3 7-7" />
                  </Ikon>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Committed Changes (TRAE): pemilih commit di samping dropdown mode. */}
        {mode === 'committed' && (
          <>
            <span className="agx-dv-garis-vert" aria-hidden="true" />
            <div className="agx-dv-dd-wadah agx-dv-commit-wadah">
              <button
                className="agx-dv-commit-pil"
                data-testid="agx-dv-commit-pil"
                aria-expanded={menuPilihCommit}
                title={commitAktif ? `${commitAktif.hash7} ${commitAktif.subject}` : 'Select commit'}
                onClick={() => {
                  setCariCommit('');
                  setMenuPilihCommit((o) => !o);
                  setMenuMode(false);
                  setMenuAtur(false);
                  setMenuCommit(false);
                }}
              >
                <Ikon size={14}>
                  <path d="M1.5 8h4M10.5 8h4" />
                  <circle cx="8" cy="8" r="2.4" />
                </Ikon>
                <span className="agx-dv-commit-subjek">
                  {commitAktif?.subject ?? (memuatLog ? 'Loading commits…' : 'No commits yet')}
                </span>
                {commitAktif && (
                  <span className="agx-dv-commit-stat">
                    <span className="agx-dv-judul-plus">+{statTambah}</span>
                    <span className="agx-dv-judul-min">-{statHapus}</span>
                  </span>
                )}
              </button>
              {menuPilihCommit && (
                <div className="agx-dv-menu agx-dv-menu-pilih" role="menu" data-testid="agx-dv-commit-list">
                  <div className="agx-dv-menu-cari">
                    <Ikon size={13}>
                      <circle cx="7.2" cy="7.2" r="4.2" />
                      <path d="M10.4 10.4 13.2 13.2" />
                    </Ikon>
                    <input
                      className="agx-dv-menu-cari-input"
                      data-testid="agx-dv-commit-cari"
                      placeholder="Search by commit message"
                      value={cariCommit}
                      spellCheck={false}
                      autoFocus
                      onChange={(e) => setCariCommit(e.target.value)}
                    />
                  </div>
                  {commitList.length === 0 && (
                    <div className="agx-dv-menu-kosong">No commits yet</div>
                  )}
                  {commitList.length > 0 && commitTersaring.length === 0 && (
                    <div className="agx-dv-menu-kosong">No matching commits</div>
                  )}
                  {commitTersaring.map((c) => (
                    <button
                      key={c.hash7}
                      className="agx-dv-menu-item agx-dv-commit-item"
                      role="menuitemradio"
                      aria-checked={c.hash7 === commitTerpilih}
                      data-testid="agx-dv-commit-item"
                      data-hash={c.hash7}
                      onClick={() => {
                        setCommitTerpilih(c.hash7);
                        /* Ganti commit = kartu lama menampilkan diff commit lain. */
                        tutupSemuaKartu();
                        setMenuPilihCommit(false);
                      }}
                    >
                      <span className="agx-dv-commit-item-teks">
                        <span className="agx-dv-commit-item-subjek">{c.subject}</span>
                        <span className="agx-dv-commit-item-meta">
                          {c.hash7} · {waktuCommit(c.date)}
                        </span>
                      </span>
                      {c.hash7 === commitTerpilih && (
                        <Ikon size={13}>
                          <path d="M3 8.5l3 3 7-7" />
                        </Ikon>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        </div>

        <div className="agx-dv-aksi">
          {mode === 'committed' ? (
            <>
              {tombolAturDiff}
              <button
                className="agx-dv-ikon"
                title="Collapse all files"
                aria-label="Collapse all files"
                data-testid="agx-dv-collapse-committed"
                disabled={buka.size === 0}
                onClick={tutupSemuaKartu}
              >
                <Ikon>
                  <path d="M8 3v3.5M8 6.5l-2-2M8 6.5l2-2" />
                  <path d="M8 13V9.5M8 9.5l-2 2M8 9.5l2 2" />
                </Ikon>
              </button>
              <button
                className="agx-dv-ikon"
                title="Expand all files"
                aria-label="Expand all files"
                data-testid="agx-dv-expand-committed"
                disabled={terSaring.length === 0 || semuaKartuTerbuka}
                onClick={bukaSemuaKartu}
              >
                <Ikon>
                  <path d="M8 6.5V3M8 3L6 5M8 3l2 2" />
                  <path d="M8 9.5V13M8 13l-2-2M8 13l2-2" />
                </Ikon>
              </button>
              <button
                className="agx-dv-ikon"
                title="Refresh"
                aria-label="Refresh"
                data-testid="agx-dv-refresh-committed"
                disabled={memuatCommit}
                onClick={() => setSegarkanCommit((n) => n + 1)}
              >
                <Ikon>
                  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
                  <path d="M13.5 2.5v3h-3" />
                </Ikon>
              </button>
              <span className="agx-dv-garis-vert" aria-hidden="true" />
              <button
                className="agx-dv-ikon"
                title="Toggle file tree"
                aria-label="Toggle file tree"
                data-testid="agx-dv-pohon-committed"
                data-aktif={pohonTampil || undefined}
                onClick={() => setPohonTampil((v) => !v)}
              >
                <Ikon>
                  <path d="M3 4h10M3 8h5M3 12h5" />
                  <path d="M10 10.5l1.6 1.6L15 8.6" />
                </Ikon>
              </button>
            </>
          ) : (
            <>
          {tombolAturDiff}
          <button
            className="agx-dv-ikon"
            title="Collapse all files"
            aria-label="Collapse all files"
            data-testid="agx-dv-collapse"
            disabled={buka.size === 0}
            onClick={tutupSemuaKartu}
          >
            <Ikon>
              <path d="M8 3v3.5M8 6.5l-2-2M8 6.5l2-2" />
              <path d="M8 13V9.5M8 9.5l-2 2M8 9.5l2 2" />
            </Ikon>
          </button>
          <button
            className="agx-dv-ikon"
            title="Expand all files"
            aria-label="Expand all files"
            data-testid="agx-dv-expand"
            disabled={!adaPerubahan || semuaKartuTerbuka}
            onClick={bukaSemuaKartu}
          >
            <Ikon>
              <path d="M8 6.5V3M8 3L6 5M8 3l2 2" />
              <path d="M8 9.5V13M8 13l-2-2M8 13l2-2" />
            </Ikon>
          </button>
          <button
            className="agx-dv-ikon"
            title="Refresh"
            aria-label="Refresh"
            data-testid="agx-dv-refresh"
            disabled={busy || memuatStat}
            onClick={() => {
              /* refresh() memperbarui status git; numstat dimuat ulang setelah
                 itu supaya angka +/− ikut berubah, bukan hanya daftar filenya. */
              void refresh().then(() => setSegarkanStat((n) => n + 1));
            }}
          >
            <Ikon>
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
              <path d="M13.5 2.5v3h-3" />
            </Ikon>
          </button>
          {/* Aksi commit hanya milik Pending: AI Changes direview per berkas. */}
          {mode === 'pending' && (
            <>
          <button
            className="agx-dv-btn"
            data-testid="agx-dv-discard"
            disabled={!adaPerubahan || busy}
            onClick={() => setTanyaDiscard(true)}
          >
            Discard Changes
          </button>
          <div className="agx-dv-split">
            <button
              className="agx-dv-btn agx-dv-commit"
              data-testid="agx-dv-commit"
              disabled={!adaPerubahan || busy}
              title="Commit"
              onClick={() => setDialogCommit('commit')}
            >
              Commit
            </button>
            <div className="agx-dv-dd-wadah">
              <button
                className="agx-dv-split-ujung"
                aria-label="Commit options"
                aria-expanded={menuCommit}
                data-testid="agx-dv-commit-menu"
                disabled={!adaPerubahan || busy}
                onClick={() => {
                  setMenuCommit((o) => !o);
                  setMenuMode(false);
                  setMenuAtur(false);
                }}
              >
                <Ikon size={12}>
                  <path d="M4 6l4 4 4-4" />
                </Ikon>
              </button>
              {menuCommit && (
                <div className="agx-dv-menu agx-dv-menu-commit" role="menu">
                  <button
                    className="agx-dv-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuCommit(false);
                      setDialogCommit('commit');
                    }}
                  >
                    Commit
                    <Ikon size={13}>
                      <path d="M3 8.5l3 3 7-7" />
                    </Ikon>
                  </button>
                  <button
                    className="agx-dv-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuCommit(false);
                      setDialogCommit('push');
                    }}
                  >
                    Push
                  </button>
                  <button
                    className="agx-dv-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setMenuCommit(false);
                      setDialogCommit('commit-push');
                    }}
                  >
                    Commit and Push
                  </button>
                </div>
              )}
            </div>
          </div>
            </>
          )}
          <span className="agx-dv-garis-vert" aria-hidden="true" />
          <button
            className="agx-dv-ikon"
            title="Toggle file tree"
            aria-label="Toggle file tree"
            data-testid="agx-dv-pohon"
            data-aktif={pohonTampil || undefined}
            onClick={() => setPohonTampil((v) => !v)}
          >
            <Ikon>
              <path d="M3 4h10M3 8h5M3 12h5" />
              <path d="M10 10.5l1.6 1.6L15 8.6" />
            </Ikon>
          </button>
            </>
          )}
        </div>
      </div>

      <div className="agx-dv-judul" data-testid="agx-dv-judul">
        <div className="agx-dv-judul-branch">{status?.branch ?? 'Tidak ada branch'}</div>
        {mode === 'pending' && adaPerubahan && (
          <div className="agx-dv-judul-stat">
            <span className="agx-dv-judul-jml">{perubahan.length} Files Changed</span>
            <span className="agx-dv-judul-plus">+{tambah}</span>
            <span className="agx-dv-judul-min">−{hapus}</span>
          </div>
        )}
        {mode === 'committed' && commitAktif && (
          <div className="agx-dv-judul-stat">
            <span className="agx-dv-judul-jml">{daftar.length} Files Changed</span>
            <span className="agx-dv-judul-plus">+{statTambah}</span>
            <span className="agx-dv-judul-min">−{statHapus}</span>
          </div>
        )}
        {mode === 'ai' && berkasAi.length > 0 && (
          <div className="agx-dv-judul-stat">
            <span className="agx-dv-judul-jml">{berkasAi.length} Files Changed</span>
            <span className="agx-dv-judul-plus">+{aiTambah}</span>
            <span className="agx-dv-judul-min">−{aiHapus}</span>
          </div>
        )}
      </div>

      {/* TRAE: mode AI tanpa perubahan = satu empty-state di tengah, bukan
          daftar kosong + pohon kosong. */}
      {mode === 'ai' && berkasAi.length === 0 && (
        <div className="agx-dv-ai-kosong" data-testid="agx-dv-ai-kosong">
          <span className="agx-dv-ai-kosong-ikon" aria-hidden="true">
            <Ikon size={22}>
              <rect x="2.6" y="3" width="10.8" height="10" rx="1.6" />
              <path d="M5 6.2h6M5 8.4h4M5 10.6h5" />
            </Ikon>
          </span>
          <div className="agx-dv-ai-kosong-judul">No changes yet</div>
          <div className="agx-dv-ai-kosong-ket">Your local AI changes will appear here.</div>
        </div>
      )}

      {/* Body dua kolom: kiri = kartu diff, kanan = pohon. */}
      <div
        className={`agx-dv-isi${mode === 'ai' && berkasAi.length === 0 ? ' is-ai-kosong' : ''}`}
        data-testid="agx-dv-isi"
      >
        <div className="agx-dv-kiri" data-testid="agx-dv-kiri">
          {terSaring.map(([p, st]) => {
            const aiBerkas = mode === 'ai' ? berkasAi.find((b) => b.path === p) : undefined;
            return (
              <KartuDiff
                key={p}
                path={p}
                status={st}
                plus={numstatAktif[p]?.[0] ?? 0}
                min={numstatAktif[p]?.[1] ?? 0}
                terbuka={buka.has(p)}
                toggle={() => toggleKartu(p)}
                split={split}
                abaikanSpasi={abaikanSpasi}
                bungkus={bungkusBaris}
                hash={mode === 'committed' ? commitTerpilih : null}
                ai={mode === 'ai'}
                sebelumAi={aiBerkas?.sebelum ?? null}
                sesudahAi={aiBerkas?.sesudah ?? null}
                onKeep={() => useDiff.getState().buang(p)}
                onRevert={() => void kembalikanAi(p)}
              />
            );
          })}
          {terSaring.length === 0 && (
            <div className="agx-dv-kiri-kosong">
              {memuatCommit ? 'Loading changes…' : daftar.length > 0 ? 'No matching files' : 'No changes'}
            </div>
          )}
        </div>
        {pohonTampil && (
          <>
        <div
          className="agx-dv-resize"
          role="separator"
          aria-orientation="vertical"
          data-testid="agx-dv-resize"
          onPointerDown={mulaiResize}
        />
        {/* Kolom kanan: filter + pohon file yang berubah. */}
        <div className="agx-dv-sisi" data-testid="agx-dv-sisi" style={{ flexBasis: lebarSisi }}>
        <div className="agx-dv-saring">
          <Ikon size={13}>
            <circle cx="7.2" cy="7.2" r="4.2" />
            <path d="M10.4 10.4 13.2 13.2" />
          </Ikon>
          <input
            className="agx-dv-saring-input"
            data-testid="agx-dv-saring"
            placeholder="Filter change files"
            value={saring}
            spellCheck={false}
            onChange={(e) => setSaring(e.target.value)}
          />
        </div>
        <label className="agx-dv-tree-kepala" data-testid="agx-dv-tree-kepala">
          {mode === 'pending' && (
            <input
              type="checkbox"
              className="agx-dv-tree-cek"
              checked={semuaTerpilih}
              onChange={toggleSemua}
            />
          )}
          <span className="agx-dv-tree-kepala-teks">
            {mode === 'pending' ? perubahan.length : daftar.length} Files Changed
          </span>
        </label>
        <div className="agx-dv-tree" role="tree" data-testid="agx-dv-tree">
          {pohon.map((n) => (
            <BarisPohon
              key={n.jenis === 'file' ? n.path : n.nama}
              node={n}
              kedalaman={0}
              kunci={n.jenis === 'file' ? n.path : n.nama}
              tutup={tutupFolder}
              toggleFolder={toggleFolder}
              terpilih={terpilih}
              toggleSatu={toggleSatu}
              onBuka={bukaDanGulir}
              bisaPilih={mode === 'pending'}
            />
          ))}
          {pohon.length === 0 && (
            <div className="agx-dv-tree-kosong">
              {memuatCommit ? 'Loading changes…' : daftar.length > 0 ? 'No matching files' : 'No changes'}
            </div>
          )}
        </div>
        </div>
          </>
        )}
      </div>

      {tanyaDiscard && (
        <div className="agx-dv-dialog-lapis" data-testid="agx-dv-discard-dialog">
          <div className="agx-dv-dialog" role="dialog" aria-modal="true">
            <div className="agx-dv-dialog-kepala">
              <span className="agx-dv-dialog-ikon" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" fill="var(--accent)" />
                  <rect x="7" y="4" width="2" height="5" rx="1" fill="var(--bg)" />
                  <circle cx="8" cy="11.6" r="1.1" fill="var(--bg)" />
                </svg>
              </span>
              <h3>Discard changes?</h3>
              <button
                className="agx-dv-dialog-tutup"
                aria-label="Close"
                data-testid="agx-dv-discard-tutup"
                onClick={() => setTanyaDiscard(false)}
              >
                <Ikon size={13}>
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </Ikon>
              </button>
            </div>
            <div className="agx-dv-dialog-isi">
              <p className="agx-dv-dialog-teks">
                Selected changes will be restored to HEAD and cannot be recovered.
              </p>
              <div className="agx-dv-dialog-daftar" data-testid="agx-dv-discard-daftar">
                {daftar.map(([p]) => {
                  const [plus, min] = numstat[p] ?? [0, 0];
                  const ikon = ikonFile(p);
                  const nm = p.split(/[\\/]/).pop() ?? p;
                  return (
                    <div key={p} className="agx-dv-dialog-file" data-path={p}>
                      <span
                        className="agx-dv-dialog-file-glyph"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: ikon.svg ?? '' }}
                      />
                      <span className="agx-dv-dialog-file-path">
                        {nm} <span className="agx-dv-dialog-file-dir">{folderPath(p)}</span>
                      </span>
                      <span className="agx-dv-dialog-file-stat">
                        <span className="agx-dv-plus">+{plus}</span>
                        <span className="agx-dv-min">-{min}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="agx-dv-dialog-aksi">
              <button
                className="agx-dv-btn"
                data-testid="agx-dv-discard-batal"
                onClick={() => setTanyaDiscard(false)}
              >
                Cancel
              </button>
              <button
                className="agx-dv-btn agx-dv-commit"
                data-testid="agx-dv-discard-ya"
                onClick={() => void discard()}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {dialogCommit !== null && (
        <div className="agx-dv-dialog-lapis" data-testid="agx-dv-commit-dialog">
          <div className="agx-dv-dialog" role="dialog" aria-modal="true">
            <div className="agx-dv-dialog-kepala">
              <span className="agx-dv-dialog-ikon" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" fill="var(--accent)" />
                  <circle cx="8" cy="8" r="2.6" fill="var(--bg)" />
                </svg>
              </span>
              <h3>Commit change</h3>
              <button
                className="agx-dv-dialog-tutup"
                aria-label="Close"
                data-testid="agx-dv-commit-tutup"
                onClick={() => setDialogCommit(null)}
              >
                <Ikon size={13}>
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </Ikon>
              </button>
            </div>
            <div className="agx-dv-dialog-isi">
              <div className="agx-dv-dialog-ringkas">
                <span className="agx-dv-dialog-branch">{status?.branch ?? '—'}</span>
                <span className="agx-dv-dialog-jml">{daftar.length} files changed</span>
                <span className="agx-dv-plus">+{tambah}</span>
                <span className="agx-dv-min">-{hapus}</span>
              </div>
              <div className="agx-dv-dialog-daftar" data-testid="agx-dv-commit-daftar">
                {daftar.map(([p]) => {
                  const [plus, min] = numstat[p] ?? [0, 0];
                  const ikon = ikonFile(p);
                  const nm = p.split(/[\\/]/).pop() ?? p;
                  return (
                    <div key={p} className="agx-dv-dialog-file" data-path={p}>
                      <span
                        className="agx-dv-dialog-file-glyph"
                        aria-hidden="true"
                        dangerouslySetInnerHTML={{ __html: ikon.svg ?? '' }}
                      />
                      <span className="agx-dv-dialog-file-path">
                        {nm} <span className="agx-dv-dialog-file-dir">{folderPath(p)}</span>
                      </span>
                      <span className="agx-dv-dialog-file-stat">
                        <span className="agx-dv-plus">+{plus}</span>
                        <span className="agx-dv-min">-{min}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <label className="agx-dv-dialog-label" htmlFor="agx-dv-commit-pesan">
                Commit message
              </label>
              <textarea
                id="agx-dv-commit-pesan"
                className="agx-dv-dialog-pesan"
                data-testid="agx-dv-commit-pesan"
                placeholder="Commit message (leave blank to generate automatically)"
                value={pesanCommit}
                spellCheck={false}
                onChange={(e) => setPesanCommit(e.target.value)}
              />
            </div>
            <div className="agx-dv-dialog-aksi">
              <button
                className="agx-dv-btn"
                data-testid="agx-dv-commit-batal"
                onClick={() => setDialogCommit(null)}
              >
                Cancel
              </button>
              <button
                className="agx-dv-btn agx-dv-commit"
                data-testid="agx-dv-commit-ya"
                disabled={busy}
                onClick={() => void aksiDialog()}
              >
                {dialogCommit === 'push' ? 'Push' : dialogCommit === 'commit-push' ? 'Commit and Push' : 'Commit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
