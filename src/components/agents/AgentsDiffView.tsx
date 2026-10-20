import { useMemo, useState } from 'react';
import { useGit } from '../../lib/gitStore';
import { useStore } from '../../lib/store';
import { useT, tf } from '../../lib/i18n';
import * as cmd from '../../lib/commands';

/**
 * Diff View — the review surface for what the last turns changed.
 *
 * The reference row is the whole brief: "Pending Changes", two actions
 * (Discard Changes, Commit), a totals line ("56 Files Changed +18773 −0"), a
 * filter, and a per-file diff switch.
 *
 * ## Everything is the REAL git state
 *
 * The list is `useGit.status.changes`, the numbers are a live `git diff
 * --numstat`, Discard goes through the same confirmation the Source Control
 * panel uses (`confirm.kind: 'discard'`, so its own dialog and its own
 * "changes discarded" result apply), and Commit stages what is listed and
 * commits with the message typed here. No private copy of the file list: a
 * review surface that can disagree with `git status` is worse than none.
 *
 * ## Why "Show file diff" is a switch, not a per-row click
 *
 * Clicking a row already opens that file's diff in the editor half (that is
 * what `openDiff` is for, and it works from Changes too). This switch answers
 * the OTHER question — "give me the patch itself, inline" — so it renders the
 * unified diff under the file instead of making the reader leave the list.
 */

/** Same code letters the Changes list uses: A/M/D/R/U. */
const BATAS_BARIS = 400;
function kode(c: { status: string; isNew: boolean; isDeleted: boolean }): string {
  if (c.status === 'U') return 'U';
  if (c.isNew) return 'A';
  if (c.isDeleted) return 'D';
  if (c.status === 'R') return 'R';
  return 'M';
}

export default function AgentsDiffView() {
  const tr = useT();
  const status = useGit((s) => s.status);
  const refresh = useGit((s) => s.refresh);
  const setConfirm = useGit((s) => s.setConfirm);
  const busak = useGit((s) => s.busy);
  const [numstat, setNumstat] = useState<Record<string, [number, number]>>({});
  const [filter, setFilter] = useState('');
  const [tampilDiff, setTampilDiff] = useState(false);
  const [pesan, setPesan] = useState('');
  const [commitErr, setCommitErr] = useState('');
  const [committing, setCommitting] = useState(false);

  const changes = useMemo(() => status?.changes ?? [], [status]);
  const isRepo = status?.isRepo ?? false;

  /*
   * Re-stat on every change of the file SET, not on a timer: the totals belong
   * to those exact files, and a total that lags the list behind it is a number
   * the reader will try to reconcile and cannot.
   */
  const kunci = changes.map((c) => `${c.path}:${c.staged ? 1 : 0}`).join('\u0000');
  useMemo(() => {
    if (!isRepo) return;
    let hidup = true;
    void cmd
      .gitNumstat(false)
      .then((m) => {
        if (hidup) setNumstat(m ?? {});
      })
      .catch(() => {
        /* Not a repo / git refused: no counts rather than invented ones. */
      });
    return () => {
      hidup = false;
    };
  }, [isRepo, kunci]);

  const tampak = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? changes.filter((c) => c.path.toLowerCase().includes(q)) : changes;
  }, [changes, filter]);
  /*
   * Render at most `BATAS_BARIS` rows.
   *
   * A repository can be 9000 files dirty (this one is), and mounting 9000 rows
   * at once — each with two spans and a button — takes long enough to freeze
   * the column, which then reads as a broken panel. The list says how many
   * more there are and the filter is the way to narrow down; that is honest
   * about the cap instead of pretending the file set ended.
   */
  const baris = useMemo(() => tampak.slice(0, BATAS_BARIS), [tampak]);
  const lebih = tampak.length - baris.length;

  const total = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const c of changes) {
      const [a, d] = numstat[c.path] ?? [0, 0];
      add += a;
      del += d;
    }
    return { add, del };
  }, [changes, numstat]);

  const buang = () => {
    if (changes.length === 0) return;
    /* The confirmation the SCM panel raises — the same dialog, so "Discard"
       cannot mean something gentler here than it does there. */
    setConfirm({ kind: 'discard', paths: changes.map((c) => c.path) });
  };

  const commit = async () => {
    if (changes.length === 0 || committing) return;
    const msg = pesan.trim();
    if (!msg) {
      setCommitErr(tr('Write a commit message first'));
      return;
    }
    setCommitErr('');
    setCommitting(true);
    try {
      await cmd.gitStage(changes.map((c) => c.path));
      await cmd.gitCommit(msg);
      setPesan('');
      await refresh();
    } catch (e) {
      setCommitErr(cmd.asZephyrError(e).message);
    } finally {
      setCommitting(false);
    }
  };

  if (!isRepo) {
    return (
      <div className="ag-diff-kosong" data-testid="ag-diff-empty">
        <p>{tr('Open a folder first to use git.')}</p>
      </div>
    );
  }

  return (
    <div className="ag-diff" data-testid="ag-diff">
      <header className="ag-diff-head">
        <span className="ag-diff-judul">{tr('Pending Changes')}</span>
        <button
          type="button"
          className="ag-diff-aksi"
          data-testid="ag-diff-discard"
          disabled={changes.length === 0 || busak}
          onClick={buang}
        >
          {tr('Discard Changes')}
        </button>
        <button
          type="button"
          className="ag-diff-aksi is-utama"
          data-testid="ag-diff-commit"
          disabled={changes.length === 0 || committing}
          onClick={() => void commit()}
        >
          {tr('Commit')}
        </button>
      </header>

      {/* Commit message: the Commit button above is meaningless without it, so
          the field sits directly under the actions rather than in a dialog. */}
      <div className="ag-diff-pesan">
        <input
          className="ag-diff-input"
          data-testid="ag-diff-message"
          placeholder={tr('Commit message')}
          value={pesan}
          spellCheck={false}
          onChange={(e) => setPesan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
        />
      </div>
      {commitErr && (
        <p className="ag-diff-galat" role="alert" data-testid="ag-diff-error">
          {commitErr}
        </p>
      )}

      <div className="ag-diff-total" data-testid="ag-diff-total">
        {tf('{n} Files Changed', { n: changes.length })}{' '}
        <span className="ag-plus">+{total.add}</span> <span className="ag-minus">-{total.del}</span>
      </div>

      <div className="ag-diff-alat">
        <input
          className="ag-diff-filter"
          data-testid="ag-diff-filter"
          placeholder={tr('Filter change files')}
          value={filter}
          spellCheck={false}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="ag-diff-sakelar" title={tr('Show file diff')}>
          <input
            type="checkbox"
            data-testid="ag-diff-toggle-diff"
            checked={tampilDiff}
            onChange={(e) => setTampilDiff(e.target.checked)}
          />
          <span>{tr('Show file diff')}</span>
        </label>
      </div>

      <div className="ag-diff-list" data-testid="ag-diff-list">
        {tampak.length === 0 && (
          <p className="ag-diff-bersih">
            {changes.length === 0 ? tr('No changes') : tr('No file matches this filter')}
          </p>
        )}
        {lebih > 0 && (
          <p className="ag-diff-bersih" data-testid="ag-diff-more">
            {tf('{n} more files — narrow the list with the filter', { n: lebih })}
          </p>
        )}
        {baris.map((c) => {
          const [add, del] = numstat[c.path] ?? [0, 0];
          const nama = c.path.split('/').pop() ?? c.path;
          const dir = c.path.slice(0, Math.max(0, c.path.length - nama.length - 1));
          const abs =
            status?.repoRoot && !/^[a-zA-Z]:[\\/]/.test(c.path)
              ? `${status.repoRoot.replace(/[\\/]+$/, '')}\\${c.path.replace(/\//g, '\\')}`
              : c.path;
          return (
            <div key={c.path} className="ag-diff-item">
              <button
                type="button"
                className="ag-diff-row"
                data-testid={`ag-diff-${c.path}`}
                title={c.path}
                onClick={() => {
                  void useGit.getState().openDiff(c);
                  void useStore.getState().openPath(abs);
                }}
              >
                <span className="ag-diff-nama">
                  {nama}
                  {dir && <span className="ag-diff-dir">{dir}</span>}
                </span>
                <span className="ag-diff-angka">
                  {add > 0 && <span className="ag-plus">+{add}</span>}
                  {del > 0 && <span className="ag-minus">-{del}</span>}
                </span>
                <span className={`ag-diff-kode kode-${kode(c)}`}>{kode(c)}</span>
              </button>
              {tampilDiff && (
                <pre className="ag-diff-patch" data-testid={`ag-diff-patch-${c.path}`}>
                  <PatchTeks path={c.path} />
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One file's unified diff, loaded when the switch is on.
 *
 * `gitDiffFile` is the same call `openDiff` uses; keeping it here means the
 * inline patch and the editor's diff cannot describe different versions of the
 * file. A failure prints the reason instead of an empty box.
 */
function PatchTeks({ path }: { path: string }) {
  const tr = useT();
  const [isi, setIsi] = useState<string | null>(null);
  const [galat, setGalat] = useState('');
  useMemo(() => {
    let hidup = true;
    /* Against HEAD, not the index: a STAGED file has no index diff, and the
       review surface must still show what it changed.
     *
     * Git runs ONE process at a time (see AGENTS.md), so a patch requested
     * while a scan is still going gets "another git process is running". The
     * switch can be turned on over 9000 rows at once, which is exactly when
     * that happens — so a busy answer is retried a few times instead of being
     * printed as the patch's content. */
    const ambil = async (sisa: number) => {
      try {
        const d = await cmd.gitDiffHead(path);
        if (hidup) setIsi(d ?? '');
      } catch (e) {
        const msg = cmd.asZephyrError(e).message;
        const sibuk = /proses git lain|another git process|index\.lock/i.test(msg);
        if (sibuk && sisa > 0) {
          await new Promise((r) => setTimeout(r, 400));
          if (hidup) await ambil(sisa - 1);
          return;
        }
        if (hidup) setGalat(msg);
      }
    };
    void ambil(6);
    return () => {
      hidup = false;
    };
  }, [path]);
  if (galat) return <>{galat}</>;
  if (isi === null) return <>{tr('Loading…')}</>;
  if (isi.trim() === '') return <>{tr('No diff for this file')}</>;
  return <>{isi}</>;
}
