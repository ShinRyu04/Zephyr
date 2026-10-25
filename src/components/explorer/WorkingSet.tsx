import { useEffect, useState } from 'react';
import { useStore } from '../../lib/store';
import { useT } from '../../lib/i18n';
import {
  bacaKerja,
  hapusKerja,
  langgananKerja,
  sematKerja,
  type EntriKerja,
} from '../../lib/workingSet';

const baseOf = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

/**
 * "Working Set": the handful of files this workspace keeps coming back to.
 *
 * WHY IT IS NOT JUST "RECENT FILES": recents are chronological, so the two
 * files being edited back and forth fall off the list behind every file merely
 * looked at once. This list is ordered by how often a file was opened, and a
 * pin puts an entry above everything else - which is what makes it usable as a
 * shortcut instead of a history.
 *
 * The store (lib/workingSet.ts) is a plain module with its own listener rather
 * than a zustand store: it is written from non-React code paths (tab opens,
 * deletes) and read from exactly one component, so a store would be a second
 * mechanism for the same thing.
 */
export default function WorkingSet() {
  const tr = useT();
  const workspace = useStore((s) => s.workspace);
  /* The folder list, not just the first root, is what decides which entries
     belong here; a workspace rename must re-read the list. */
  const kunci = workspace ?? '';
  const [entri, setEntri] = useState<EntriKerja[]>(() => bacaKerja(kunci));

  useEffect(() => {
    setEntri(bacaKerja(kunci));
    return langgananKerja(() => setEntri(bacaKerja(kunci)));
  }, [kunci]);

  if (entri.length === 0) {
    return (
      <p className="ws-kosong" data-testid="working-set-empty">
        {tr('explorer.workingSetEmpty')}
      </p>
    );
  }

  return (
    <ul className="ws-list" data-testid="working-set-list" data-count={entri.length}>
      {entri.map((e) => (
        <li key={e.path} className="ws-row" data-path={e.path} data-pinned={e.pinned ? '1' : '0'}>
          <button
            type="button"
            className="ws-item"
            title={e.path}
            onClick={() => void useStore.getState().openPath(e.path, { preview: false })}
          >
            <span className="ws-name">{baseOf(e.path)}</span>
            <span className="ws-dir">{e.path.slice(0, Math.max(0, e.path.length - baseOf(e.path).length - 1))}</span>
          </button>
          <button
            type="button"
            className={`ws-pin${e.pinned ? ' is-on' : ''}`}
            title={e.pinned ? tr('explorer.workingSetUnpin') : tr('explorer.workingSetPin')}
            aria-label={e.pinned ? tr('explorer.workingSetUnpin') : tr('explorer.workingSetPin')}
            aria-pressed={e.pinned}
            data-testid="ws-pin"
            onClick={() => sematKerja(kunci, e.path, !e.pinned)}
          >
            <svg viewBox="0 0 16 16" className="ws-icon" aria-hidden="true">
              <path
                d="M6 2h4M8 2v4l2.5 2.5v1.5h-5V8.5L8 6V2zM8 10v4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="ws-drop"
            title={tr('explorer.workingSetUnpin')}
            aria-label={tr('explorer.workingSetUnpin')}
            data-testid="ws-remove"
            onClick={() => hapusKerja(kunci, e.path)}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
