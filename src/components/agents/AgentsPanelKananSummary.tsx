import { type ReactNode } from 'react';
import { useAi } from '../../lib/aiStore';

/*
 * Task Summary di panel kanan.
 *
 * "Isi chat AI di agent": ringkasan percakapan agent yang sedang jalan —
 * daftar todo langkah (pending / in_progress / done) plus file yang sedang
 * disentuh percakapan itu. Semua dibaca dari store AI yang sama dengan
 * composer jendela Agents, jadi tanpa salin data.
 */

const STATUS_LABEL: Record<string, string> = {
  pending: 'Queued',
  in_progress: 'Running',
  done: 'Done',
};

export default function AgentsPanelKananSummary({ bar }: { bar?: ReactNode | null }) {
  const todos = useAi((s) => s.agentTodos);

  return (
    <>
      {bar}
      <div className="agx-view-isi" data-testid="agx-summary-view">
        <div className="agx-view-judul">Task Summary</div>
        {todos.length === 0 ? (
          <div className="agx-view-kosong">
            <span>No task is running. Start one from the composer.</span>
          </div>
        ) : (
          <ul className="agx-summary-list" data-testid="agx-summary-todos">
            {todos.map((t, i) => (
              <li key={t.id ?? i} className={`agx-summary-item is-${t.status}`}>
                <span className="agx-summary-status">{STATUS_LABEL[t.status] ?? t.status}</span>
                <span className="agx-summary-teks">{t.content}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
