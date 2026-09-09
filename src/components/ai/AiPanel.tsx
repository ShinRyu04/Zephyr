// AiPanel.tsx — panel AI di area bawah (tab "AI"), sejajar Terminal.
//
// Keputusan tempat (prompt fase 09 §9.2): pakai DOCK BAWAH, bukan panel kanan
// 340px — supaya hanya ada satu panel bawah (Terminal | AI) dan tidak ada
// container ketiga yang ikut memakan RAM & lebar editor.
//
// Isi: header (dropdown model + status key + [+] chat baru), area chat
// markdown streaming, action bar ("Jalankan di Terminal" untuk jawaban
// terakhir), dan input dengan Enter kirim / Shift+Enter baris baru.

import { useEffect, useRef } from 'react';
import { useAi, extractCommand, isDestructive } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useTerminal } from '../../lib/terminalStore';
import ChatMessage from './ChatMessage';
import ModelSelector from './ModelSelector';

export default function AiPanel() {
  const sessions = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeId);
  const pending = useAi((s) => s.pending);
  const draft = useAi((s) => s.draft);
  const attachActive = useAi((s) => s.attachActive);
  const toast = useAi((s) => s.toast);
  const confirmCmd = useAi((s) => s.confirmCmd);

  const setDraft = useAi((s) => s.setDraft);
  const setAttachActive = useAi((s) => s.setAttachActive);
  const setToast = useAi((s) => s.setToast);
  const setConfirmCmd = useAi((s) => s.setConfirmCmd);
  const send = useAi((s) => s.send);
  const cancel = useAi((s) => s.cancel);
  const runInTerminal = useAi((s) => s.runInTerminal);
  const agentMode = useAi((s) => s.agentMode);
  const approvalMode = useAi((s) => s.approvalMode);
  const agentBusy = useAi((s) => s.agentBusy);
  const agentSteps = useAi((s) => s.agentSteps);
  const agentConfirm = useAi((s) => s.agentConfirm);
  const setAgentMode = useAi((s) => s.setAgentMode);
  const setApprovalMode = useAi((s) => s.setApprovalMode);
  const agentPutuskan = useAi((s) => s.agentPutuskan);
  const sibuk = pending || agentBusy;

  const activeTab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  // JANGAN memakai selector yang membuat array/objek baru (mis. flatMap):
  // zustand v5 membandingkan hasil selector dengan === , jadi array baru tiap
  // render memicu "Maximum update depth exceeded". Ambil angka (primitif).
  const paneCount = useTerminal((s) => s.terminalTabs.reduce((n, t) => n + t.panes.length, 0));

  const session = sessions.find((s) => s.id === activeId) ?? null;
  const msgs = session?.messages ?? [];
  const lastBot = [...msgs].reverse().find((m) => m.role === 'assistant' && !m.error);
  const lastCommand = lastBot ? extractCommand(lastBot.content) : null;

  const scroller = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll saat token baru masuk (kecuali user sedang scroll ke atas).
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [msgs, pending]);

  // Toast hilang sendiri (pola sama dengan TerminalArea).
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  // Ctrl+I dari mana pun -> fokus input AI (§9.4). Panel sudah dibuka oleh
  // handler global; di sini cukup memindahkan fokus saat panel ter-mount.
  useEffect(() => {
    const onFocusReq = () => inputRef.current?.focus();
    window.addEventListener('zephyr-ai-focus', onFocusReq);
    return () => window.removeEventListener('zephyr-ai-focus', onFocusReq);
  }, []);

  return (
    <div className="ai-panel" data-testid="ai-panel">
      <div className="ai-head">
        <ModelSelector />

        {/* Mode: chat streaming biasa vs agent (tool loop, fase 35). */}
        <div className="ai-mode" role="group" aria-label="Mode AI">
          <button
            className={`ai-mode-btn${agentMode === 'chat' ? ' is-on' : ''}`}
            data-testid="ai-mode-chat"
            onClick={() => setAgentMode('chat')}
          >
            Chat
          </button>
          <button
            className={`ai-mode-btn${agentMode === 'agent' ? ' is-on' : ''}`}
            data-testid="ai-mode-agent"
            onClick={() => setAgentMode('agent')}
          >
            Agent
          </button>
        </div>
        {agentMode === 'agent' && (
          <select
            className="ai-approval"
            data-testid="ai-approval"
            value={approvalMode}
            aria-label="Mode persetujuan perintah agent"
            onChange={(e) => setApprovalMode(e.target.value as 'ask' | 'auto' | 'readonly')}
          >
            <option value="ask">Minta izin</option>
            <option value="auto">Auto</option>
            <option value="readonly">Read-only</option>
          </select>
        )}

        <div className="ai-head-right">
          {/* CATATAN UI (aturan user, sudah kena di fase 08): tombol aksi
              hidup di SATU tempat. "Chat baru" + riwayat ada di sidebar kiri
              (AiSidebar) — header ini hanya menampilkan status, tanpa tombol
              yang mengulang fungsi sidebar. */}
          <span className="ai-count" data-testid="ai-msg-count">
            {msgs.length} pesan
          </span>
          <span className="ai-chatname" data-testid="ai-chat-name">
            {session?.title ?? '—'}
          </span>
        </div>
      </div>

      <div className="ai-chat" ref={scroller} data-testid="ai-chat">
        {msgs.length === 0 ? (
          <div className="ai-empty" data-testid="ai-empty">
            <p className="ai-empty-title">Tanya apa saja soal kode ini.</p>
            <p className="ai-empty-sub">
              Enter kirim · Shift+Enter baris baru · Ctrl+I fokus ke sini.
              Jawaban berisi blok <code>bash</code> bisa langsung dijalankan di
              terminal.
            </p>
          </div>
        ) : (
          msgs.map((m) => <ChatMessage key={m.id} msg={m} />)
        )}
      </div>

      {/* Log langkah agent (fase 35): tool yang dipanggil + hasil singkat. */}
      {(agentBusy || agentSteps.length > 0) && (
        <div className="ai-agent" data-testid="ai-agent">
          {agentSteps.map((st, i) => (
            <div key={i} className={`ai-agent-step is-${st.kind}`} data-step-kind={st.kind}>
              {st.kind === 'tool' ? (
                <>
                  <span className="ai-agent-tool">{st.name}</span>
                  <code className="ai-agent-args">{st.args}</code>
                  {st.result !== undefined && (
                    <pre className={`ai-agent-result${st.ok ? '' : ' is-err'}`}>{st.result}</pre>
                  )}
                </>
              ) : st.kind === 'mulai' ? (
                <span className="ai-agent-note">Memikirkan langkah…</span>
              ) : (
                <span className="ai-agent-note">Tugas selesai.</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action bar: muncul hanya kalau jawaban terakhir memuat perintah. */}
      {lastCommand && (
        <div className="ai-actions" data-testid="ai-actions">
          <code className="ai-action-cmd" title={lastCommand}>
            {lastCommand.split('\n')[0].slice(0, 76)}
            {lastCommand.length > 76 ? '…' : ''}
          </code>
          <button
            className="btn btn-sm btn-primary"
            data-testid="ai-run-last"
            onClick={() => void runInTerminal(lastCommand)}
          >
            Jalankan di Terminal
          </button>
          {isDestructive(lastCommand) && (
            <span className="ai-risk" data-testid="ai-risk">
              berisiko
            </span>
          )}
        </div>
      )}

      <div className="ai-input-row">
        <textarea
          ref={inputRef}
          className="ai-input"
          data-testid="ai-input"
          rows={2}
          placeholder={
            sibuk
              ? agentMode === 'agent'
                ? 'Agent sedang bekerja…'
                : 'Menunggu jawaban…'
              : agentMode === 'agent'
                ? 'Ketik tugas untuk agent (Enter kirim)…'
                : 'Tulis pesan (Enter kirim, Shift+Enter baris baru)'
          }
          value={draft}
          spellCheck={false}
          aria-label="Pesan untuk AI"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />

        <div className="ai-input-side">
          {sibuk ? (
            <button
              className="btn btn-sm btn-danger"
              data-testid="ai-stop"
              onClick={() => void cancel()}
            >
              Stop
            </button>
          ) : (
            <button
              className="btn btn-sm btn-primary"
              data-testid="ai-send"
              disabled={!draft.trim() || agentBusy}
              onClick={() => void send()}
            >
              {agentMode === 'agent' ? 'Jalankan' : 'Kirim'}
            </button>
          )}

          <button
            className={`ai-attach${attachActive ? ' is-on' : ''}`}
            data-testid="ai-attach"
            aria-pressed={attachActive}
            title={
              activeTab
                ? `Lampirkan file aktif: ${activeTab.path ?? activeTab.name} (maks 12KB)`
                : 'Tidak ada file aktif'
            }
            onClick={() => setAttachActive(!attachActive)}
          >
            {attachActive ? '✓' : '+'} file aktif
          </button>

          {/* §9.4: kirim error TS ke AI. Hanya aktif kalau ada pane terminal
              (perintahnya dijalankan di sana lalu hasilnya diminta dianalisis). */}
          <button
            className="ai-attach"
            data-testid="ai-analyze-ts"
            disabled={!!pending}
            title="Jalankan npx tsc --noEmit di terminal lalu minta AI menganalisis error"
            onClick={() => {
              void runInTerminal('npx tsc --noEmit', { confirmed: true }).then((ok) => {
                if (!ok) return;
                setDraft(
                  'Saya baru menjalankan `npx tsc --noEmit` di terminal Zephyr. ' +
                    'Jelaskan penyebab error TypeScript yang muncul dan cara ' +
                    'memperbaikinya. Kalau perlu, minta saya menempelkan outputnya.',
                );
                inputRef.current?.focus();
              });
            }}
          >
            Analisis error TS
          </button>
          <span className="ai-panehint">{paneCount} pane terminal</span>
        </div>
      </div>

      {/* Persetujuan tool agent (fase 35): mode ask / perintah berbahaya. */}
      {agentConfirm && (
        <div className="ai-confirm" role="alertdialog" data-testid="ai-agent-confirm">
          <p className="ai-confirm-title">
            {agentConfirm.isDestructive
              ? 'Perintah berpotensi merusak — izinkan agent?'
              : `Agent minta izin menjalankan ${agentConfirm.tool}:`}
          </p>
          <code className="ai-confirm-cmd">{agentConfirm.argsText}</code>
          <div className="ai-confirm-btns">
            <button
              className="btn btn-sm btn-danger"
              data-testid="ai-agent-confirm-yes"
              onClick={() => agentPutuskan(true)}
            >
              Izinkan
            </button>
            <button
              className="btn btn-sm"
              data-testid="ai-agent-confirm-no"
              onClick={() => agentPutuskan(false)}
            >
              Tolak
            </button>
          </div>
        </div>
      )}

      {confirmCmd && (
        <div className="ai-confirm" role="alertdialog" data-testid="ai-confirm">
          <p className="ai-confirm-title">Perintah ini berpotensi merusak:</p>
          <code className="ai-confirm-cmd">{confirmCmd}</code>
          <div className="ai-confirm-btns">
            <button
              className="btn btn-sm btn-danger"
              data-testid="ai-confirm-yes"
              onClick={() => void runInTerminal(confirmCmd, { confirmed: true })}
            >
              Jalankan
            </button>
            <button
              className="btn btn-sm"
              data-testid="ai-confirm-no"
              onClick={() => setConfirmCmd(null)}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="ai-toast" role="status" data-testid="ai-toast">
          {toast}
        </div>
      )}
    </div>
  );
}
