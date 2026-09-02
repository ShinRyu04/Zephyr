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
            pending ? 'Menunggu jawaban…' : 'Tulis pesan (Enter kirim, Shift+Enter baris baru)'
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
          {pending ? (
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
              disabled={!draft.trim()}
              onClick={() => void send()}
            >
              Kirim
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
