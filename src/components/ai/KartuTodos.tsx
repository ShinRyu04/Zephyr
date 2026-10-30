import { useState } from 'react';
import { useAi, type AgentTodo } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';

/*
 * Bentuk lingkaran status satu tugas, dari nilai `status`-nya:
 *   done        -> centang hijau (var(--success))
 *   in_progress -> titik penuh warna aksen (sedang dikerjakan)
 *   pending     -> lingkaran kosong (belum mulai)
 *   lain        -> ✕ redup (nilai tak dikenal harus tetap terbaca, bukan
 *                  hilang)
 */
function titikStatus(status: AgentTodo['status']): { kelas: string; glyph: string } {
  switch (status) {
    case 'done':
      return { kelas: 'is-done', glyph: '✓' };
    case 'in_progress':
      return { kelas: 'is-jalan', glyph: '' };
    case 'pending':
      return { kelas: 'is-pending', glyph: '' };
    default:
      return { kelas: 'is-lain', glyph: '✕' };
  }
}

/*
 * Kartu To-dos ala Qoder DI DALAM alur chat — daftar rencana kerja yang agen
 * tulis lewat tool `todo_write` (store `agentTodos`). Header: caret + judul
 * tebal + badge jumlah selesai; baris: lingkaran status + teks (baris selesai
 * diredupkan). Lipatnya lokal dan default TERBUKA — daftar yang disembunyikan
 * di balik lipatan justru menyulitkan memantau pekerjaan yang sedang jalan.
 */
export default function KartuTodos() {
  const tr = useT();
  /*
   * Daftar tugas milik RUN, bukan milik permukaan: identitas arraynya dijaga
   * stabil oleh store, jadi selector boleh mengembalikan array apa adanya
   * (pola yang sama dengan komentar `agentTodos` di AiPanel).
   */
  const todos = useAi((s) => s.agentTodos);
  const [buka, setBuka] = useState(true);

  if (todos.length === 0) return null;

  const selesai = todos.filter((t) => t.status === 'done').length;

  return (
    <section
      className={`experts-kartu exp-todo${buka ? ' is-buka' : ''}`}
      data-testid="experts-todos"
    >
      <button
        type="button"
        className="exp-todo-kepala"
        data-testid="experts-todos-toggle"
        aria-expanded={buka}
        onClick={() => setBuka((v) => !v)}
      >
        <span className="experts-progress-caret" aria-hidden="true">▾</span>
        <b>{tr('To-dos')}</b>
        <span className="experts-progress-badge" aria-hidden="true">
          {selesai}/{todos.length}
        </span>
      </button>
      {buka && (
        <div className="exp-todo-daftar" data-testid="experts-todos-list">
          {todos.map((t, i) => {
            const st = titikStatus(t.status);
            return (
              <div key={t.id ?? i} className={`exp-todo-baris ${st.kelas}`} title={t.content}>
                <span className={`exp-todo-titik ${st.kelas}`} aria-hidden="true">
                  {st.glyph}
                </span>
                <span className="exp-todo-teks">{t.content}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
