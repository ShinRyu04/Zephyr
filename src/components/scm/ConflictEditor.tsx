import { useEffect, useState } from 'react';
import { gitConflictRead, gitConflictTake, type ConflictHunk } from '../../lib/commands';
import { useT } from '../../lib/i18n';

export default function ConflictEditor({
  path,
  onClose,
  onResolved,
}: {
  path: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const tr = useT();
  const [hunks, setHunks] = useState<ConflictHunk[]>([]);
  const [galat, setGalat] = useState('');
  const [pilih, setPilih] = useState<Record<number, 'ours' | 'theirs' | ''>>({});

  useEffect(() => {
    void (async () => {
      try {
        setHunks(await gitConflictRead(path));
      } catch (e) {
        setGalat(String((e as Error)?.message ?? e));
      }
    })();
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ambilSemua = async (side: 'ours' | 'theirs') => {
    try {
      await gitConflictTake(path, side);
      onResolved();
      onClose();
    } catch (e) {
      setGalat(String((e as Error)?.message ?? e));
    }
  };

  return (
    <div className="modal-backdrop" data-modal-terbuka="1" onClick={onClose}>
      <div
        className="conflict-editor"
        data-testid="conflict-editor"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ce-head">
          <span className="ce-title">{tr('Resolve conflict')}</span>
          <code className="ce-path" title={path}>
            {path}
          </code>
          <span className="ce-spacer" />
          <button className="btn btn-sm" data-testid="ce-ours-all" onClick={() => void ambilSemua('ours')}>
            {tr('Take all ours')}
          </button>
          <button className="btn btn-sm" data-testid="ce-theirs-all" onClick={() => void ambilSemua('theirs')}>
            {tr('Take all theirs')}
          </button>
          <button className="btn btn-sm" data-testid="ce-close" onClick={onClose}>
            {tr('Close')}
          </button>
        </div>

        {galat && (
          <p className="ce-error" data-testid="ce-error">
            {galat}
          </p>
        )}

        <div className="ce-body">
          {hunks.length === 0 && !galat && (
            <p className="side-muted" data-testid="ce-empty">
              {tr('No conflict markers left in this file.')}
            </p>
          )}
          {hunks.map((h, i) => (
            <div className="ce-hunk" data-testid={`ce-hunk-${i}`} key={i}>
              <div className="ce-col is-ours" data-pilih={pilih[i] === 'ours' ? '1' : '0'}>
                <div className="ce-col-head">
                  <span>{tr('Ours')}</span>
                  <button
                    className="btn btn-sm"
                    data-testid={`ce-take-ours-${i}`}
                    onClick={() => setPilih((s) => ({ ...s, [i]: 'ours' }))}
                  >
                    {tr('Use ours')}
                  </button>
                </div>
                <pre>{h.ours || tr('(empty)')}</pre>
              </div>
              {h.base ? (
                <div className="ce-col is-base">
                  <div className="ce-col-head">
                    <span>{tr('Base')}</span>
                  </div>
                  <pre>{h.base}</pre>
                </div>
              ) : null}
              <div className="ce-col is-theirs" data-pilih={pilih[i] === 'theirs' ? '1' : '0'}>
                <div className="ce-col-head">
                  <span>{tr('Theirs')}</span>
                  <button
                    className="btn btn-sm"
                    data-testid={`ce-take-theirs-${i}`}
                    onClick={() => setPilih((s) => ({ ...s, [i]: 'theirs' }))}
                  >
                    {tr('Use theirs')}
                  </button>
                </div>
                <pre>{h.theirs || tr('(empty)')}</pre>
              </div>
            </div>
          ))}
        </div>

        <p className="ce-hint">
          {tr('Picking a side for a hunk writes that version into the file. Use "Take all" to resolve the whole file quickly, then stage it.')}
        </p>
      </div>
    </div>
  );
}
