import { useEffect, useState, useRef } from 'react';
import { useAi } from '../../lib/aiStore';
import { useSubAgent } from '../../lib/subagentStore';
import { useT } from '../../lib/i18n';
import { formatElapsed, durasiMs } from '../../lib/waktu';
import StableText from './StableText';
import '../../styles/ai-todo-card.css';
import '../../styles/ai-composer-stack.css';

const KUNCI_LIPAT = 'zephyr.todoCard.collapsed';

/*
 * Whether the reader has ASKED to see the task list.
 *
 * OFF by default: the plan the agent writes is useful while debugging a run,
 * but as an always-on panel above the composer it pushed the answer down and
 * made every turn look busier than it was. Nothing here decides what the agent
 * does — this is display only.
 *
 * Persisted, because "I want to watch the plan" is a preference that should
 * survive a reload. `'1'` = shown; a missing key keeps it hidden.
 */
const KUNCI_TAMPIL = 'zephyr.todoCard.shown';

function bootTampil(): boolean {
  try {
    return localStorage.getItem(KUNCI_TAMPIL) === '1';
  } catch {
    return false;
  }
}

/**
 * ComposerStatusStack - Tumpukan Status Bersatu Docked di atas Input Composer ala Hermes.
 *
 * Menggabungkan seluruh indikator status sesi ke dalam SATU kapsul utuh:
 *   1. Checklist (Daftar tugas / todos agen)
 *   2. Server Process (Background task / subagent yang aktif)
 *   3. Sync (Indikator sinkronisasi / aktivitas subagent & streaming)
 *   4. Menu (...) di ujung kanan untuk tindakan cepat.
 */
export default function ComposerStatusStack() {
  const tr = useT();
  const todos = useAi((s) => s.agentTodos);
  const agentBusy = useAi((s) => s.agentBusy);
  /*
   * Penghapusan butuh jalur sendiri.
   *
   * `setAgentTodos([])` TIDAK mengosongkan daftar: setAgentTodos sengaja
   * menambal-balik tugas yang tidak ikut disebut, jadi kedua tombol "Clear ..."
   * di menu bawah ini dulu cuma menutup menu - barisnya tetap penuh. Jalur
   * eksplisitnya `kosongkanTodos`/`buangTodosSelesai`.
   */
  const kosongkanTodos = useAi((s) => s.kosongkanTodos);
  const buangTodosSelesai = useAi((s) => s.buangTodosSelesai);
  const subagents = useSubAgent((s) => s.agents);

  const [lipat, setLipat] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KUNCI_LIPAT) === '1';
    } catch {
      return false;
    }
  });

  /* Hidden unless the reader turned it on. See KUNCI_TAMPIL above. */
  const [tampil, setTampil] = useState<boolean>(bootTampil);

  /*
   * The panel can be opened from outside (the composer's "..." menu, a command,
   * or the keybinding) through a window event, so the control does not have to
   * live on a surface that is currently hidden.
   */
  useEffect(() => {
    const buka = () => {
      setTampil(true);
      try {
        localStorage.setItem(KUNCI_TAMPIL, '1');
      } catch {
        /* sesi ini saja */
      }
    };
    window.addEventListener('zephyr-todo-show', buka);
    return () => window.removeEventListener('zephyr-todo-show', buka);
  }, []);

  const [menuBuka, setMenuBuka] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-close menu when clicking outside
  useEffect(() => {
    if (!menuBuka) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuBuka(false);
      }
    };
    window.addEventListener('mousedown', handleClick);
    return () => window.removeEventListener('mousedown', handleClick);
  }, [menuBuka]);

  // Segarkan durasi berkala saat ada proses yang aktif
  const [, setTick] = useState(0);
  useEffect(() => {
    if (todos.length === 0 || lipat) return;
    const t = setInterval(() => setTick((x) => x + 1), 5_000);
    return () => clearInterval(t);
  }, [todos.length, lipat]);

  const ubahLipat = (nilai: boolean) => {
    setLipat(nilai);
    try {
      localStorage.setItem(KUNCI_LIPAT, nilai ? '1' : '0');
    } catch {
      // safe
    }
  };

  const runningSubagents = subagents.filter((i) => i.status === 'jalan');
  const hasActiveContent = todos.length > 0 || runningSubagents.length > 0;
  /* Hidden by default; the event above is how it is summoned. */
  if (!tampil) return null;
  if (!hasActiveContent) return null;

  const done = todos.filter((t) => t.status === 'done').length;
  const jalan = todos.some((t) => t.status === 'in_progress');

  const dur = (t: { startedAt?: number; endedAt?: number; status: string }): string => {
    if (!t.startedAt) return '';
    return formatElapsed(durasiMs(t.startedAt, t.status === 'done' ? t.endedAt : undefined));
  };

  const statusTeks = (status: string) => {
    if (status === 'done') return tr('Selesai');
    if (status === 'in_progress') return tr('Berjalan');
    return tr('Menunggu');
  };

  return (
    <div
      className={`composer-status-stack todo-dock${lipat ? ' is-collapsed is-lipat' : ''}`}
      data-testid="todo-panel"
    >
      <div className="composer-status-header">
        {/* Trigger kiri yang berfungsi sebagai tombol lipat accordion */}
        <button
          type="button"
          className="composer-status-left todo-dock-head"
          data-testid="todo-lipat"
          aria-expanded={!lipat}
          aria-controls="todo-daftar"
          title={lipat ? tr('Expand') : tr('Collapse')}
          onClick={() => ubahLipat(!lipat)}
        >
          {/* Caret rotasi */}
          <span className="composer-status-caret todo-caret" aria-hidden="true">
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

          {/* Ikon per jenis: sync, server-process, checklist */}
          <div className="composer-status-types">
            {/* 1. Ikon Checklist (Todos) */}
            {todos.length > 0 && (
              <span className={`composer-type-pill${jalan ? ' is-active' : ''}`} title="Tasks / Todos">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M2.5 4.2l1.6 1.6 3-3.1M2.5 11.2l1.6 1.6 3-3.1M9 4.6h4.6M9 11.6h4.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{done}/{todos.length}</span>
              </span>
            )}

            {/* 2. Ikon Server Process (Subagents / Background Tasks) */}
            {runningSubagents.length > 0 && (
              <span className="composer-type-pill is-active" title="Active Background Processes">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="2" y="2.5" width="12" height="5" rx="1.5" />
                  <rect x="2" y="9" width="12" height="5" rx="1.5" />
                  <circle cx="11.5" cy="5" r="1" fill="currentColor" />
                  <circle cx="11.5" cy="11.5" r="1" fill="currentColor" />
                </svg>
                <span>{runningSubagents.length}</span>
              </span>
            )}

            {/* 3. Ikon Sync (Loop / Stream / Busy) */}
            {agentBusy && (
              <span className="composer-type-pill is-active" title="Agent Sync / Loop Active">
                <svg className="spin-sync" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9L14 6m0-4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </div>

          <span className="composer-status-title todo-judul">{tr('Task list')}</span>
        </button>

        {/* Menu titik tiga (...) di ujung kanan */}
        <div className="composer-status-actions" ref={menuRef}>
          <button
            type="button"
            className="composer-action-btn"
            title="Options"
            aria-label="Options"
            onClick={() => setMenuBuka((v) => !v)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="3" cy="8" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="13" cy="8" r="1.5" />
            </svg>
          </button>

          {menuBuka && (
            <div className="composer-menu-popover">
              <button
                type="button"
                className="composer-menu-item"
                onClick={() => {
                  ubahLipat(!lipat);
                  setMenuBuka(false);
                }}
              >
                <span>{lipat ? tr('Expand') : tr('Collapse')}</span>
              </button>
              {done > 0 && (
                <button
                  type="button"
                  className="composer-menu-item"
                  onClick={() => {
                    buangTodosSelesai();
                    setMenuBuka(false);
                  }}
                >
                  <span>{tr('Clear completed tasks')}</span>
                </button>
              )}
              {todos.length > 0 && (
                <button
                  type="button"
                  className="composer-menu-item"
                  onClick={() => {
                    kosongkanTodos();
                    setMenuBuka(false);
                  }}
                >
                  <span>{tr('Clear all tasks')}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Badan tumpukan status saat tidak terlipat */}
      <div
        className="composer-status-body todo-daftar"
        id="todo-daftar"
        data-testid="ai-todos"
        hidden={lipat}
      >
        {/* Subagent / background processes jika ada */}
        {runningSubagents.length > 0 && (
          <div className="status-section-item">
            <div className="status-section-title">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2.5" width="12" height="5" rx="1.5" />
                <rect x="2" y="9" width="12" height="5" rx="1.5" />
              </svg>
              <span>{tr('Sub-agents')}</span>
            </div>
            {runningSubagents.map((sub) => (
              <div key={sub.id} className="composer-process-row">
                <div className="proc-left">
                  <span className="spin" style={{ width: 10, height: 10 }} />
                  <span className="proc-name">{sub.peran}: {sub.tugas.slice(0, 45)}</span>
                </div>
                <span className="proc-badge">{tr('Berjalan')}</span>
              </div>
            ))}
          </div>
        )}

        {/* Daftar tugas agent (Todos) */}
        {todos.map((t, i) => (
          <div
            key={t.id ?? i}
            className={`todo-row ${t.status}`}
            data-testid={`todo-${i}`}
          >
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
            <StableText
              className="todo-dur"
              teks={dur(t)}
              minSel={3}
              warnaDigit="var(--fg2)"
              judul={tr('Duration')}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
