// DiffViewer.tsx — tampilan unified diff untuk satu file (fase 10).
//
// Menumpang area editor seperti halaman Settings: saat `git.diff` terisi, ia
// menggantikan editor. Rendernya `<pre>` beranotasi, bukan CodeMirror —
// diff read-only tidak butuh editing, dan ini jauh lebih murah untuk file
// besar (tidak membuat state editor baru per klik file).
//
// PENTING untuk harness fase 02/03: panel ini menutupi empty-state editor.
// verify10 wajib menutupnya (`closeDiff`) sebelum selesai.

import { useGit } from '../../lib/gitStore';

type Kind = 'add' | 'del' | 'hunk' | 'meta' | 'ctx';

function kindOf(line: string): Kind {
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta';
  if (
    line.startsWith('diff ') ||
    line.startsWith('index ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity ') ||
    line.startsWith('rename ') ||
    line.startsWith('old mode') ||
    line.startsWith('new mode') ||
    line.startsWith('Binary file') ||
    line.startsWith('\\ No newline')
  )
    return 'meta';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'del';
  return 'ctx';
}

export default function DiffViewer() {
  const diff = useGit((s) => s.diff);
  const closeDiff = useGit((s) => s.closeDiff);
  const stage = useGit((s) => s.stage);
  const unstage = useGit((s) => s.unstage);
  const setConfirm = useGit((s) => s.setConfirm);
  const busy = useGit((s) => s.busy);

  if (!diff) return null;

  const lines = diff.text.split('\n');
  // Buang baris kosong terakhir dari trailing newline agar tidak ada baris hampa.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  // fase 15.3: label khusus file biner supaya tidak terlihat seperti diff kosong.
  const isBinary = lines.some((l) => l.startsWith('Binary file'));

  let added = 0;
  let removed = 0;
  for (const l of lines) {
    const k = kindOf(l);
    if (k === 'add') added++;
    else if (k === 'del') removed++;
  }

  return (
    <section className="diff" data-testid="diff-view" data-path={diff.path}>
      <div className="diff-head">
        <span className="diff-path" data-testid="diff-path" title={diff.path}>
          {diff.path}
        </span>
        <span className={`diff-tag ${diff.staged ? 'is-staged' : ''}`} data-testid="diff-side">
          {diff.staged ? 'staged' : 'working tree'}
        </span>
        {isBinary && (
          <span className="diff-tag" data-testid="diff-binary">
            binary file
          </span>
        )}
        <span className="diff-stat" data-testid="diff-stat">
          <span className="diff-plus">+{added}</span> <span className="diff-minus">−{removed}</span>
        </span>

        <span className="sb-spacer" />

        <button
          className="btn btn-sm"
          data-testid="diff-stage-toggle"
          disabled={busy}
          onClick={() => void (diff.staged ? unstage([diff.path]) : stage([diff.path]))}
        >
          {diff.staged ? 'Unstage' : 'Stage'}
        </button>
        <button
          className="btn btn-sm btn-danger"
          data-testid="diff-revert"
          disabled={busy || diff.staged}
          title={
            diff.staged
              ? 'Unstage dulu sebelum membuang perubahan'
              : 'Buang perubahan file ini (permanen)'
          }
          onClick={() => setConfirm({ kind: 'discard', paths: [diff.path] })}
        >
          Revert file
        </button>
        <button className="btn btn-sm" data-testid="diff-close" onClick={closeDiff}>
          Tutup
        </button>
      </div>

      <div className="diff-body">
        {lines.length === 0 ? (
          <p className="side-muted diff-empty">Tidak ada perbedaan untuk file ini.</p>
        ) : (
          <pre className="diff-pre" data-testid="diff-pre">
            {lines.map((l, i) => {
              const k = kindOf(l);
              return (
                <span className={`diff-line is-${k}`} key={i} data-kind={k}>
                  {l === '' ? ' ' : l}
                  {'\n'}
                </span>
              );
            })}
          </pre>
        )}
      </div>
    </section>
  );
}
