import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGit } from '../../lib/gitStore';
import { useStore } from '../../lib/store';
import {
  asZephyrError,
  folderDialogOpen,
  revealPath,
  worktreePrune,
  worktreeRootAdd,
  worktreeRootList,
  worktreeRootRemove,
  type WorktreeEntri,
} from '../../lib/commands';
import { useT, useTf } from '../../lib/i18n';

/*
 * Worktree manager for Source Control.
 *
 * Backend is the root-explicit `worktree_*` family (src-tauri/src/worktree.rs),
 * not `git_worktree_*`: it takes `root` explicitly, never throws for usage
 * errors and answers `{ berhasil, pesan, data }`. So every result is read via
 * `berhasil`; only a broken IPC becomes an exception.
 *
 * The list is deliberately collapsed by default. Source Control's job is the
 * change list; worktrees are a parallel-checkout tool you open when you need
 * them, and a permanently expanded panel would push the commit box off-screen.
 */
export default function WorktreeSection() {
  const tr = useT();
  const tf = useTf();
  const workspace = useStore((s) => s.workspace);
  const activeRepo = useGit((s) => s.activeRepo);

  /* `worktree_*` requires the REAL repo root. `activeRepo` is the selected repo
     in a multi-repo workspace; without one, the workspace itself is the root. */
  const root = activeRepo ?? workspace ?? '';

  const [buka, setBuka] = useState(false);
  const [daftar, setDaftar] = useState<WorktreeEntri[]>([]);
  const [akar, setAkar] = useState('');
  const [memuat, setMemuat] = useState(false);
  const [pesan, setPesan] = useState<{ jenis: 'info' | 'error'; teks: string } | null>(null);

  const [pathBaru, setPathBaru] = useState('');
  const [branch, setBranch] = useState('');
  const [buatCabang, setBuatCabang] = useState(true);

  const [hapus, setHapus] = useState<{ entri: WorktreeEntri; tahap: 1 | 2 } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const muat = useCallback(
    async (senyap = false) => {
      if (!root) {
        setDaftar([]);
        setAkar('');
        return;
      }
      if (!senyap) setMemuat(true);
      try {
        const h = await worktreeRootList(root);
        if (!h.berhasil) {
          setPesan({ jenis: 'error', teks: h.pesan });
          setDaftar([]);
          setAkar('');
          return;
        }
        setDaftar(h.data?.worktree ?? []);
        setAkar(h.data?.akar ?? root);
      } catch (e) {
        setPesan({ jenis: 'error', teks: asZephyrError(e).message });
      } finally {
        if (!senyap) setMemuat(false);
      }
    },
    [root],
  );

  /* Refresh when the panel is opened and whenever the selected repo changes.
     Silent when collapsed so switching repos does not flash a spinner in a
     section nobody is looking at. */
  useEffect(() => {
    if (!buka) return;
    void muat();
  }, [buka, muat]);

  useEffect(() => {
    if (!root) return;
    void muat(true);
  }, [root, muat]);

  /* A worktree is a checkout in its own folder; default the new path beside the
     repo (the common `repo-branch` layout), not inside it - Rust rejects that. */
  const usulPath = useMemo(() => {
    if (!akar) return '';
    const pemisah = akar.includes('\\') ? '\\' : '/';
    const induk = akar.slice(0, akar.lastIndexOf(pemisah));
    const nama = akar.slice(akar.lastIndexOf(pemisah) + 1);
    return induk ? `${induk}${pemisah}${nama}-wt` : '';
  }, [akar]);

  const pilihFolder = async () => {
    try {
      const hasil = await folderDialogOpen();
      if (hasil) setPathBaru(hasil);
    } catch (e) {
      setPesan({ jenis: 'error', teks: asZephyrError(e).message });
    }
  };

  const tambah = async () => {
    if (sibuk) return;
    const path = pathBaru.trim();
    const cabang = branch.trim();
    if (!path || !cabang) {
      setPesan({ jenis: 'error', teks: tr('Path and branch are required.') });
      return;
    }
    setSibuk(true);
    setPesan(null);
    try {
      const h = await worktreeRootAdd({
        root,
        path,
        branch: cabang,
        buatCabang,
      });
      setPesan({ jenis: h.berhasil ? 'info' : 'error', teks: h.pesan });
      if (h.berhasil) {
        setPathBaru('');
        setBranch('');
        await muat(true);
      }
    } catch (e) {
      setPesan({ jenis: 'error', teks: asZephyrError(e).message });
    } finally {
      setSibuk(false);
    }
  };

  const hapusWorktree = async (entri: WorktreeEntri, paksa: boolean) => {
    if (sibuk) return;
    setSibuk(true);
    setPesan(null);
    try {
      const h = await worktreeRootRemove({ root, path: entri.path, paksa });
      if (!h.berhasil) {
        /* Dirty tree: the first refusal is expected, not a dead end. Ask once
           more with an explicit warning before forcing the removal. */
        if (!paksa && (h.pesan.includes('belum di-commit') || h.pesan.includes('gagal-tertutup'))) {
          setHapus({ entri, tahap: 2 });
        } else {
          setPesan({ jenis: 'error', teks: h.pesan });
          setHapus(null);
        }
        return;
      }
      setPesan({ jenis: 'info', teks: h.pesan });
      setHapus(null);
      await muat(true);
    } catch (e) {
      setPesan({ jenis: 'error', teks: asZephyrError(e).message });
      setHapus(null);
    } finally {
      setSibuk(false);
    }
  };

  const prune = async () => {
    if (sibuk) return;
    setSibuk(true);
    setPesan(null);
    try {
      const teks = await worktreePrune();
      setPesan({ jenis: 'info', teks });
      await muat(true);
    } catch (e) {
      setPesan({ jenis: 'error', teks: asZephyrError(e).message });
    } finally {
      setSibuk(false);
    }
  };

  const bukaWorkspace = async (entri: WorktreeEntri) => {
    await useStore.getState().openWorkspace(entri.path);
  };

  const jumlahCabang = daftar.filter((w) => !w.isMain && !w.bare && !w.prunable).length;

  return (
    <div className="scm-worktree" data-testid="scm-worktree">
      <button
        type="button"
        className="scm-graph-lipat"
        data-testid="scm-worktree-toggle"
        aria-expanded={buka}
        title={buka ? tr('Collapse worktrees') : tr('Show worktrees')}
        onClick={() => setBuka((v) => !v)}
      >
        <span aria-hidden style={{ fontSize: '10px', width: '10px', textAlign: 'center' }}>
          {buka ? '−' : '+'}
        </span>
        <span aria-hidden style={{ transform: buka ? 'rotate(90deg)' : 'none', transition: 'transform .12s', fontSize: '9px' }}>
          ▶
        </span>
        <span>{tr('WORKTREES')}</span>
        <span className="scm-worktree-jumlah">
          {memuat ? tr('loading…') : tf('{n} extra', { n: jumlahCabang })}
        </span>
      </button>

      {buka && (
        <div className="scm-worktree-isi" data-testid="scm-worktree-body">
          {!root ? (
            <p className="side-muted">{tr('Open a folder first.')}</p>
          ) : (
            <>
              {pesan && (
                <p
                  className={pesan.jenis === 'error' ? 'scm-error' : 'scm-info'}
                  data-testid="scm-worktree-pesan"
                >
                  {pesan.teks}
                </p>
              )}

              {daftar.length === 0 && !memuat && (
                <p className="side-muted" data-testid="scm-worktree-kosong">
                  {tr('No worktrees yet.')}
                </p>
              )}

              <div className="scm-worktree-daftar">
                {daftar.map((w) => {
                  const nama = w.path.split(/[\\/]/).pop() || w.path;
                  const head = (w.head ?? '').slice(0, 7);
                  return (
                    <div
                      className="scm-worktree-baris"
                      data-testid="scm-worktree-baris"
                      data-path={w.path}
                      key={w.path}
                      title={w.path}
                    >
                      <div className="scm-worktree-info">
                        <div className="scm-worktree-nama">
                          <span>{nama}</span>
                          {w.isMain && <span className="scm-worktree-lencana">{tr('main')}</span>}
                          {w.detached && <span className="scm-worktree-lencana">{tr('detached')}</span>}
                          {w.locked && <span className="scm-worktree-lencana">{tr('locked')}</span>}
                          {w.prunable && <span className="scm-worktree-lencana scm-worktree-lencana-bahaya">{tr('prunable')}</span>}
                        </div>
                        <div className="scm-worktree-meta">
                          {w.branch ?? (w.detached ? `(${tr('detached')})` : '—')}
                          {head && <span className="scm-worktree-head">{head}</span>}
                        </div>
                      </div>
                      <div className="scm-worktree-aksi">
                        <button
                          type="button"
                          className="scm-worktree-btn"
                          data-testid="scm-worktree-reveal"
                          title={tr('Show in File Explorer')}
                          onClick={() => void revealPath(w.path)}
                        >
                          {tr('Show')}
                        </button>
                        {!w.isMain && !w.prunable && (
                          <button
                            type="button"
                            className="scm-worktree-btn"
                            data-testid="scm-worktree-open"
                            title={tr('Open this worktree as the workspace')}
                            onClick={() => void bukaWorkspace(w)}
                          >
                            {tr('Open')}
                          </button>
                        )}
                        {!w.isMain && (
                          <button
                            type="button"
                            className="scm-worktree-btn scm-worktree-btn-bahaya"
                            data-testid="scm-worktree-hapus"
                            disabled={sibuk}
                            title={tr('Remove this worktree')}
                            onClick={() => setHapus({ entri: w, tahap: 1 })}
                          >
                            {tr('Remove')}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="scm-worktree-form">
                <div className="scm-worktree-form-baris">
                  <input
                    className="input"
                    data-testid="scm-worktree-path"
                    placeholder={usulPath || tr('Absolute path for the new worktree')}
                    value={pathBaru}
                    onChange={(e) => setPathBaru(e.target.value)}
                  />
                  <button type="button" className="btn btn-sm" data-testid="scm-worktree-pilih" onClick={() => void pilihFolder()}>
                    {tr('Browse…')}
                  </button>
                </div>
                <div className="scm-worktree-form-baris">
                  <input
                    className="input"
                    data-testid="scm-worktree-branch"
                    placeholder={tr('branch name')}
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  />
                  <label className="scm-worktree-centang" title={tr('Create the branch from HEAD if it does not exist')}>
                    <input
                      type="checkbox"
                      data-testid="scm-worktree-buat-cabang"
                      checked={buatCabang}
                      onChange={(e) => setBuatCabang(e.target.checked)}
                    />
                    {tr('new branch')}
                  </label>
                </div>
                <div className="scm-worktree-form-aksi">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    data-testid="scm-worktree-tambah"
                    disabled={sibuk || !pathBaru.trim() || !branch.trim()}
                    onClick={() => void tambah()}
                  >
                    {sibuk ? tr('Working…') : tr('Add worktree')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    data-testid="scm-worktree-prune"
                    disabled={sibuk}
                    title={tr('Remove stale worktree records from git')}
                    onClick={() => void prune()}
                  >
                    {tr('Prune')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {hapus && (
        <div className="scm-worktree-konfirm" role="dialog" aria-modal="true" data-testid="scm-worktree-konfirm">
          <p>
            {hapus.tahap === 1
              ? tf('Remove worktree {nama}?', { nama: hapus.entri.path })
              : tf(
                  '{nama} still has changes that are not committed. Removing it deletes those changes permanently.',
                  { nama: hapus.entri.path },
                )}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className={hapus.tahap === 1 ? 'btn' : 'btn btn-danger'}
              data-testid={hapus.tahap === 1 ? 'scm-worktree-konfirm-ya' : 'scm-worktree-konfirm-paksa'}
              disabled={sibuk}
              onClick={() =>
                void (hapus.tahap === 1
                  ? hapusWorktree(hapus.entri, false)
                  : hapusWorktree(hapus.entri, true))
              }
            >
              {hapus.tahap === 1 ? tr('Remove') : tr('I understand, remove anyway')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="scm-worktree-konfirm-batal"
              disabled={sibuk}
              onClick={() => setHapus(null)}
            >
              {tr('Cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
