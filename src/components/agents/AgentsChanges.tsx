import { useEffect, useMemo, useState } from 'react';
import { useGit } from '../../lib/gitStore';
import { useT } from '../../lib/i18n';
import * as cmd from '../../lib/commands';

/*
 * The Changes list — a FLAT list of changed files with line counts, not the
 * Source Control panel.
 *
 * The SCM panel is the right surface for staging, committing and syncing, and
 * it stays where it is (the main window's sidebar). What the Agents window
 * wants is the smaller thing the reference design shows: which files are dirty,
 * how much, and what kind of change — a reading view, not a commit workflow.
 * Reusing the SCM panel here put a commit box and a branch bar in a 288px
 * column that is mostly there to be glanced at.
 *
 * Counts come from `gitNumstat` (`git diff --numstat`), which is fetched
 * separately from the status list because `status` reports neither added nor
 * removed lines.
 */

/** `M` modified, `A` added, `D` deleted, `R` renamed, `U` conflicted. */
function kode(ch: { status: string; isNew: boolean; isDeleted: boolean }): string {
  if (ch.status === 'U') return 'U';
  if (ch.isNew) return 'A';
  if (ch.isDeleted) return 'D';
  if (ch.status === 'R') return 'R';
  return 'M';
}

export default function AgentsChanges() {
  const tr = useT();
  const status = useGit((s) => s.status);
  const refresh = useGit((s) => s.refresh);
  const openDiff = useGit((s) => s.openDiff);

  const [numstat, setNumstat] = useState<Record<string, [number, number]>>({});

  const changes = useMemo(() => status?.changes ?? [], [status]);
  const isRepo = status?.isRepo ?? false;

  /* Recount whenever the file set changes — the counts belong to those exact
     files, and a stale "+92" next to a file that is now clean is a lie. */
  const kunci = changes.map((c) => c.path).join('\u0000');
  useEffect(() => {
    if (!isRepo) return;
    let hidup = true;
    void cmd
      .gitNumstat(false)
      .then((m) => {
        if (hidup) setNumstat(m ?? {});
      })
      .catch(() => {
        /* Not a repo, or git refused: counts stay empty rather than wrong. */
      });
    return () => {
      hidup = false;
    };
  }, [isRepo, kunci]);

  if (!isRepo) {
    return (
      <div className="ag-changes-kosong" data-testid="ag-changes-empty">
        <p>{tr('Open a folder first to use git.')}</p>
      </div>
    );
  }

  return (
    <div className="ag-changes" data-testid="ag-changes">
      <div className="ag-changes-head">
        <span className="ag-changes-judul">{tr('Changes')}</span>
        <span className="ag-changes-jumlah">{changes.length}</span>
        <button
          className="ag-changes-refresh"
          data-testid="ag-changes-refresh"
          title={tr('common.refresh')}
          aria-label={tr('common.refresh')}
          onClick={() => void refresh()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7M13.2 2.2v3.2h-3.2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div className="ag-changes-list">
        {changes.length === 0 && <p className="ag-changes-bersih">{tr('No changes')}</p>}
        {changes.map((c) => {
          const [add, del] = numstat[c.path] ?? [0, 0];
          const nama = c.path.split('/').pop() ?? c.path;
          const dir = c.path.slice(0, Math.max(0, c.path.length - nama.length - 1));
          return (
            <button
              key={c.path}
              className="ag-changes-row"
              data-testid={`ag-changes-${c.path}`}
              title={c.path}
              onClick={() => void openDiff(c)}
            >
              <span className="ag-changes-nama">
                {nama}
                {dir && <span className="ag-changes-dir">{dir}</span>}
              </span>
              <span className="ag-changes-angka">
                {add > 0 && <span className="ag-plus">+{add}</span>}
                {del > 0 && <span className="ag-minus">-{del}</span>}
              </span>
              <span className={`ag-changes-kode kode-${kode(c)}`} aria-label={kode(c)}>
                {kode(c)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
