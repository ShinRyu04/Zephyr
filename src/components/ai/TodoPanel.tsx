import { useEffect, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useT } from '../../lib/i18n';
import { formatElapsed, durasiMs } from '../../lib/waktu';
import StableText from './StableText';
import '../../styles/ai-todo-card.css';

/**
 * Daftar progres tugas agent - satu kartu di atas kotak ketik.
 *
 * Cara menyatukannya dengan kotak ketik diambil dari Hermes Agent
 * (`apps/desktop/src/app/chat/composer/status-stack/index.tsx`), yang memakai
 * satu trik: kartu status dan kotak ketik BERBAGI SATU GARIS.
 *
 *   card = rounded-t-2xl  border-b-0
 *   kotak ketik = rounded-b-2xl  border-t-0
 *
 * Sudut bawah kartu diluruskan, border bawahnya dihapus, dan tepi atas kotak
 * ketik yang jadi garis pemisahnya. Hasilnya keduanya terbaca sebagai satu
 * kapsul, bukan dua kotak yang kebetulan berdekatan.
 *
 * Karena itu komponen ini HARUS jadi saudara langsung kotak ketik, di dalam
 * kolom dock yang sama - bukan anak `.ai-chat`.
 */
const KUNCI_LIPAT = 'zephyr.todoCard.collapsed';

export default function TodoPanel() {
  const tr = useT();
  const todos = useAi((s) => s.agentTodos);

  const [lipat, setLipat] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KUNCI_LIPAT) === '1';
    } catch {
      return false;
    }
  });

  // Segarkan durasi tiap 10 detik. Interval mati saat terlipat: tidak ada
  // angka durasi yang terlihat, jadi tidak ada yang perlu dihitung.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (todos.length === 0 || lipat) return;
    const t = setInterval(() => setTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, [todos.length, lipat]);

  const ubahLipat = (nilai: boolean) => {
    setLipat(nilai);
    try {
      localStorage.setItem(KUNCI_LIPAT, nilai ? '1' : '0');
    } catch {
      /* localStorage bisa diblokir; lipat tetap jalan untuk sesi ini. */
    }
  };

  if (todos.length === 0) return null;

  const done = todos.filter((t) => t.status === 'done').length;
  const jalan = todos.some((t) => t.status === 'in_progress');

  /*
   * Durasi memakai `formatElapsed` tingkat modul, bukan aritmetika lokal.
   *
   * Versi sebelumnya memakai `Math.max(1, ...)`: tugas yang SELESAI dalam waktu
   * di bawah satu detik dilaporkan sebagai "1s", seolah berjalan lebih lama
   * daripada kenyataannya. `formatElapsed` melaporkan "0s" dengan jujur.
   *
   * Tugas yang BELUM PERNAH MULAI tidak punya durasi sama sekali, jadi
   * hasilnya string kosong - bukan "0s". Bagi user, "0s" berarti "barusan
   * mulai", sedangkan kenyataannya "belum jalan". Dua hal berbeda.
   */
  const dur = (t: { startedAt?: number; endedAt?: number; status: string }): string => {
    if (!t.startedAt) return '';
    return formatElapsed(durasiMs(t.startedAt, t.status === 'done' ? t.endedAt : undefined));
  };

  const statusTeks = (status: string) => {
    if (status === 'done') return tr('Done');
    if (status === 'in_progress') return tr('Running');
    return tr('Waiting');
  };

  return (
    <div className={`todo-dock${lipat ? ' is-lipat' : ''}`} data-testid="todo-panel">
      <button
        type="button"
        className="todo-dock-head"
        data-testid="todo-lipat"
        aria-expanded={!lipat}
        aria-controls="todo-daftar"
        title={lipat ? tr('Expand') : tr('Collapse')}
        onClick={() => ubahLipat(!lipat)}
      >
        <span className="todo-caret" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 16 16">
            <path
              d="M5.5 3.5L10 8l-4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="todo-caret-ikon" aria-hidden="true">
          {/* Ikon checklist, sama semangatnya dengan `checklist` codicon Hermes. */}
          <svg width="13" height="13" viewBox="0 0 16 16">
            <path
              d="M2.5 4.2l1.6 1.6 3-3.1M2.5 11.2l1.6 1.6 3-3.1M9 4.6h4.6M9 11.6h4.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="todo-judul">{tr('Task list')}</span>
        {/*
          * Hitungan hanya berguna kalau ada yang dihitung. "0/0" pada daftar
          * kosong tidak memberi tahu apa pun, jadi disembunyikan seluruhnya.
          * Saat ada isinya, ini satu-satunya tempat angka progres muncul -
          * baris "Tasks" yang kembar di area status sudah dibuang.
          */}
        {todos.length > 0 && (
          <span className="todo-count">
            {done}/{todos.length}
          </span>
        )}
        {jalan && !lipat && <span className="todo-jalan" aria-hidden="true" />}
      </button>

      <div className="todo-daftar" id="todo-daftar" data-testid="ai-todos" hidden={lipat}>
        {todos.map((t, i) => (
          <div key={i} className={`todo-row ${t.status}`} data-testid={`todo-${i}`}>
            <span className="todo-ic" aria-hidden="true">
              {t.status === 'done' ? (
                <svg width="14" height="14" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="7.2" fill="var(--success)" />
                  <path
                    d="M5 8.2l2 2 4-4.4"
                    stroke="var(--bg0)"
                    strokeWidth="1.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : t.status === 'in_progress' ? (
                <span className="spin" />
              ) : (
                <span className="todo-pend" />
              )}
            </span>
            <span className="todo-label" title={t.content}>
              {t.content}
            </span>
            <span className="todo-status">{statusTeks(t.status)}</span>
            <StableText className="todo-dur" teks={dur(t)} minSel={3} warnaDigit="var(--fg2)" judul={tr('Duration')} />
          </div>
        ))}
      </div>
    </div>
  );
}
