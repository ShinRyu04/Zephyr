import { useId, useState } from 'react';
import '../../styles/ai-tool-cards.css';

export type TaskStatus = 'pending' | 'in_progress' | 'done';
export type WorkStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface StatusTask {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface StatusSubagent {
  id: string;
  name: string;
  description?: string;
  durationMs?: number;
  status: WorkStatus;
}

export interface StatusBackgroundJob {
  id: string;
  /** The actual command being executed, not a friendly alias. */
  command: string;
  durationMs?: number;
  status: WorkStatus;
}

export interface LoopStatusData {
  active: boolean;
  status: string;
  current?: number;
  total?: number;
  durationMs?: number;
}

export interface TaskStatusData {
  active: boolean;
  items: readonly StatusTask[];
}

export interface SubagentStatusData {
  active: boolean;
  items: readonly StatusSubagent[];
}

export interface BackgroundStatusData {
  active: boolean;
  items: readonly StatusBackgroundJob[];
}

export interface StatusAreaProps {
  loop?: LoopStatusData;
  tasks?: TaskStatusData;
  subagents?: SubagentStatusData;
  background?: BackgroundStatusData;
  defaultOpen?: boolean;
  className?: string;
  tr: (text: string) => string;
  tf: (template: string, values: Record<string, string | number>) => string;
}

function duration(ms: number | undefined, tf: StatusAreaProps['tf']): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms < 1000) return tf('{n} ms', { n: Math.max(0, Math.round(ms)) });
  return tf('{n}s', { n: Math.floor(ms / 1000) });
}

function statusLabel(status: TaskStatus | WorkStatus, tr: StatusAreaProps['tr']): string {
  if (status === 'in_progress') return tr('In progress');
  if (status === 'pending') return tr('Pending');
  if (status === 'running') return tr('Running');
  if (status === 'done') return tr('Done');
  if (status === 'failed') return tr('Failed');
  return tr('Cancelled');
}

export default function StatusArea({
  loop,
  tasks,
  subagents,
  background,
  defaultOpen = false,
  className = '',
  tr,
  tf,
}: StatusAreaProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const showLoop = loop?.active === true;
  const showTasks = tasks?.active === true && tasks.items.length > 0;
  const showSubagents = subagents?.active === true && subagents.items.length > 0;
  const showBackground = background?.active === true && background.items.length > 0;
  if (!showLoop && !showTasks && !showSubagents && !showBackground) return null;

  const sectionCount = Number(showLoop) + Number(showTasks) + Number(showSubagents) + Number(showBackground);
  return (
    <aside className={`w4-status${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="w4-status-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="w4-status-pulse" aria-hidden="true" />
        <span>{tr('Activity status')}</span>
        <span className="w4-status-count">{sectionCount}</span>
        <span className="w4-status-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="w4-status-body" id={bodyId}>
          {showLoop && loop && (
            <section className="w4-status-section">
              <h4>{tr('Loop')}</h4>
              <div className="w4-status-row">
                <span className="w4-status-dot is-running" aria-hidden="true" />
                <span className="w4-status-main">{loop.status}</span>
                {loop.current != null && loop.total != null && <span>{tf('{current} of {total}', { current: loop.current, total: loop.total })}</span>}
                {duration(loop.durationMs, tf) && <time>{duration(loop.durationMs, tf)}</time>}
              </div>
            </section>
          )}
          {/*
            * Baris "Tasks" DIHAPUS. Isinya menghitung hal yang sama dengan
            * kartu daftar tugas di atas kotak ketik ("Task list 0/3"), jadi di
            * layar muncul dua angka progres untuk pekerjaan yang sama dengan
            * dua penamaan berbeda. Kartunya lebih kaya (berisi label tiap tugas
            * dan durasinya), jadi dia yang dipertahankan.
            *
            * `showTasks` sengaja TETAP dipakai di perhitungan sectionCount dan
            * gerbang `return null` di atas: selama masih ada tugas, area status
            * tetap boleh tampil membawa section lain (loop, subagent, latar).
            */}
          {showTasks && tasks && null}
          {showSubagents && subagents && (
            <section className="w4-status-section">
              <h4>{tr('Subagents')}</h4>
              <ul>
                {subagents.items.map((agent) => (
                  <li className="w4-status-row" key={agent.id}>
                    <span className={`w4-status-dot is-${agent.status}`} aria-hidden="true" />
                    <span className="w4-status-main"><strong>{agent.name}</strong>{agent.description && <small>{agent.description}</small>}</span>
                    <span>{statusLabel(agent.status, tr)}</span>
                    {duration(agent.durationMs, tf) && <time>{duration(agent.durationMs, tf)}</time>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {showBackground && background && (
            <section className="w4-status-section">
              <h4>{tr('Background')}</h4>
              <ul>
                {background.items.map((job) => (
                  <li className="w4-status-row" key={job.id}>
                    <span className={`w4-status-dot is-${job.status}`} aria-hidden="true" />
                    <code className="w4-status-main" title={job.command}>{job.command}</code>
                    <span>{statusLabel(job.status, tr)}</span>
                    {duration(job.durationMs, tf) && <time>{duration(job.durationMs, tf)}</time>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
