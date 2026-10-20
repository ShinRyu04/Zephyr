import { AgentsIcon, type AgentsIconName } from './AgentsIcon';

/**
 * "Start here" — the right column's first screen.
 *
 * WHY THIS EXISTS AT ALL: with no work in progress the right column used to be
 * a Changes/Files split showing "Open a file to see it here" twice, which is
 * 700px of nothing. The reference answers the question the reader actually has
 * at that moment — "what can this column DO?" — with six named surfaces, each
 * one sentence long. Picking one opens its tab; nothing here runs by itself.
 *
 * The list is six because the reference's is six, in its order: File, Task
 * Summary, Side Chat, Browser, Terminal, Diff View. Terminal is the odd one
 * out (it becomes a tab like the rest) and is wired by the caller.
 *
 * Every description is ONE short line: the reference clips its Side Chat text
 * mid-sentence, and a card that has to be read across three wrapped lines is
 * no longer scannable, which is the only thing this list is for.
 */
export interface KartuMulai {
  id: 'files' | 'task' | 'sidechat' | 'browser' | 'terminal' | 'diff';
  label: string;
  desc: string;
  icon: AgentsIconName;
}

export const KARTU_MULAI: KartuMulai[] = [
  {
    id: 'files',
    label: 'File',
    desc: 'Browse and preview task files',
    icon: 'folder',
  },
  {
    id: 'task',
    label: 'Task Summary',
    desc: 'View task progress, output summary, and related information',
    icon: 'clock',
  },
  {
    id: 'sidechat',
    label: 'Side Chat',
    desc: 'Ask alongside the main task without interrupting it',
    icon: 'spark',
  },
  {
    id: 'browser',
    label: 'Browser',
    desc: 'Browse and debug web pages',
    icon: 'cube',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    desc: 'Run commands and scripts',
    icon: 'panel',
  },
  {
    id: 'diff',
    label: 'Diff View',
    desc: 'Review pending, committed, and AI changes',
    icon: 'map',
  },
];

export function AgentsStartHere({
  onPilih,
  tr,
}: {
  onPilih: (id: KartuMulai['id']) => void;
  tr: (s: string) => string;
}) {
  return (
    <div className="ag-start" data-testid="ag-start-here">
      <div className="ag-start-judul">{tr('Start here')}</div>
      <div className="ag-start-daftar">
        {KARTU_MULAI.map((k) => (
          <button
            key={k.id}
            type="button"
            className="ag-start-kartu"
            data-testid={`ag-start-${k.id}`}
            onClick={() => onPilih(k.id)}
          >
            <span className="ag-start-ikon" aria-hidden="true">
              <AgentsIcon name={k.icon} size={15} />
            </span>
            <span className="ag-start-teks">
              <span className="ag-start-nama">{tr(k.label)}</span>
              <span className="ag-start-desc">{tr(k.desc)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
