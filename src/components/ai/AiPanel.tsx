// AiPanel.tsx — panel AI di area bawah (tab "AI"), sejajar Terminal.
//
// Keputusan tempat (prompt fase 09 §9.2): pakai DOCK BAWAH, bukan panel kanan
// 340px — supaya hanya ada satu panel bawah (Terminal | AI) dan tidak ada
// container ketiga yang ikut memakan RAM & lebar editor.
//
// Isi: header (dropdown model + status key + [+] chat baru), area chat
// markdown streaming, action bar ("Jalankan di Terminal" untuk jawaban
// terakhir), dan input dengan Enter kirim / Shift+Enter baris baru.

import { useEffect, useRef, useState } from 'react';
import {
  useAi,
  extractCommand,
  isDestructive,
  MAX_IMAGES,
  IMAGE_MAX_BYTES,
  type ReasoningEffort,
} from '../../lib/aiStore';
import type { ApprovalMode } from '../../lib/types';
import { useStore } from '../../lib/store';
import { useTerminal } from '../../lib/terminalStore';
import { matchPrompts, expandPrompt } from '../../lib/promptLibrary';
import { activeSelection } from '../../lib/editorRegistry';
import ChatMessage from './ChatMessage';
import ModelSelector from './ModelSelector';
import SubAgentBar from './SubAgentBar';
import SubAgentPanel from './SubAgentPanel';
import TodoPanel from './TodoPanel';
import { clipboardReadImage } from '../../lib/clipboard';
import { useT } from '../../lib/i18n';

export default function AiPanel() {
  const tr = useT();
  const sessions = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeId);
  const pending = useAi((s) => s.pending);
  const draft = useAi((s) => s.draft);
  const attachActive = useAi((s) => s.attachActive);
  const draftImages = useAi((s) => s.draftImages);
  const toast = useAi((s) => s.toast);
  const confirmCmd = useAi((s) => s.confirmCmd);

  const setDraft = useAi((s) => s.setDraft);
  const setAttachActive = useAi((s) => s.setAttachActive);
  const addDraftImage = useAi((s) => s.addDraftImage);
  const removeDraftImage = useAi((s) => s.removeDraftImage);
  const setToast = useAi((s) => s.setToast);
  const setConfirmCmd = useAi((s) => s.setConfirmCmd);
  const send = useAi((s) => s.send);
  const cancel = useAi((s) => s.cancel);
  const exportChat = useAi((s) => s.exportChat);
  const newChat = useAi((s) => s.newChat);
  const setClearAllOpen = useAi((s) => s.setClearAllOpen);
  const sessionCount = useAi((s) => s.sessions.length);
  const runInTerminal = useAi((s) => s.runInTerminal);
  const agentMode = useAi((s) => s.agentMode);
  const approvalMode = useAi((s) => s.approvalMode);
  const agentBusy = useAi((s) => s.agentBusy);
  const agentSteps = useAi((s) => s.agentSteps);
  const agentConfirm = useAi((s) => s.agentConfirm);
  const setAgentMode = useAi((s) => s.setAgentMode);
  const setApprovalMode = useAi((s) => s.setApprovalMode);
  const reasoningEffort = useAi((s) => s.reasoningEffort);
  const setReasoningEffort = useAi((s) => s.setReasoningEffort);
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
  const photoRef = useRef<HTMLInputElement | null>(null);

  // A-8: saran slash command di atas input.
  const [idxSaran, setIdxSaran] = useState(0);
  const { items: saran } = matchPrompts(draft);
  useEffect(() => setIdxSaran(0), [draft]);

  const pakaiPrompt = (p: { cmd: string; body: string }) => {
    setDraft(expandPrompt(`/${p.cmd} `, activeSelection()));
    inputRef.current?.focus();
  };

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

  // A-3: quick chat dari seleksi editor (klik kanan -> Jelaskan/Perbaiki/
  // Refactor). Editor mengirim teks yang dipilih; panel yang mengubahnya jadi
  // prompt karena promptLibrary hidup di sini.
  useEffect(() => {
    const onSel = (e: Event) => {
      const { cmd, text } = (e as CustomEvent<{ cmd: string; text: string }>).detail;
      setDraft(expandPrompt(`/${cmd} `, text));
      inputRef.current?.focus();
    };
    window.addEventListener('zephyr-ai-sel', onSel);
    return () => window.removeEventListener('zephyr-ai-sel', onSel);
  }, [setDraft]);

  return (
    <div className="ai-panel" data-testid="ai-panel">
      <div className="ai-head">
        <ModelSelector />

        {/* Mode: chat streaming biasa vs agent (tool loop). */}
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
            title="Kerja langsung: perintah aman dijalankan sendiri, yang berisiko tetap minta izin"
            onChange={(e) => setApprovalMode(e.target.value as ApprovalMode)}
          >
            <option value="work">Kerja langsung</option>
            <option value="ask">Minta izin</option>
            <option value="auto">Auto (tanpa tanya)</option>
            <option value="readonly">Read-only</option>
          </select>
        )}

        {/* T1.1: tingkat penalaran. "Default" = jangan kirim parameter apa pun
            supaya provider lama yang tidak mengenal field ini tetap jalan. */}
        <select
          className="ai-effort"
          data-testid="ai-effort"
          data-aktif={reasoningEffort ? 'true' : 'false'}
          value={reasoningEffort ?? ''}
          aria-label={tr('Tingkat penalaran')}
          title={tr(
            'Seberapa dalam model berpikir sebelum menjawab. Naikkan untuk tugas sulit, turunkan untuk hemat waktu.',
          )}
          onChange={(e) =>
            setReasoningEffort((e.target.value || null) as ReasoningEffort | null)
          }
        >
          <option value="">{tr('Penalaran: default')}</option>
          <option value="minimal">Minimal</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="ultra">Ultra</option>
        </select>

        <div className="ai-head-right">
          {/* Tombol sesi juga ADA DI SINI (panel bawah), bukan cuma di sidebar
              kiri. Aturan fase 08 (aksi hidup di satu tempat) tetap berlaku
              untuk NAVIGASI PANEL; yang ini aksi SESI CHAT — user memakai
              panel AI tanpa pernah membuka sidebar, jadi keduanya harus
              tersedia di tempat ia sedang melihat. */}
          <button
            className="ai-export"
            data-testid="ai-new-chat-panel"
            title={tr('Mulai percakapan baru')}
            onClick={() => newChat()}
          >
            {tr('+ Chat baru')}
          </button>
          <button
            className="ai-export"
            data-testid="ai-clear-all-panel"
            disabled={sessionCount === 0}
            title={tr('Hapus semua riwayat chat')}
            onClick={() => setClearAllOpen(true)}
          >
            {tr('Hapus semua')}
          </button>
          <span className="ai-count" data-testid="ai-msg-count">
            {msgs.length} pesan
            {msgs.length > 0 && (
              <span className="ai-tokens" data-testid="ai-token-count" title="Perkiraan token (jumlah karakter ÷ 4)">
                · ≈{Math.round(msgs.reduce((n, m) => n + m.content.length, 0) / 4)} token
              </span>
            )}
          </span>
          <button
            className="ai-export"
            data-testid="ai-export"
            disabled={msgs.length === 0 || !!pending}
            title={tr('Salin seluruh chat sebagai markdown ke clipboard')}
            onClick={() => void exportChat()}
          >
            Ekspor
          </button>
          <span className="ai-chatname" data-testid="ai-chat-name">
            {session?.title ?? '—'}
          </span>
        </div>
      </div>

      <SubAgentBar />

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

      {/* Log langkah agent: tool yang dipanggil + hasil singkat. */}
      {(agentBusy || agentSteps.length > 0) && (
        <div className="ai-agent" data-testid="ai-agent">
          {/* Panel Todo ala opencode (item 24): daftar tugas yang di-update
              agent lewat tool todo_write terlihat selama tugas berjalan. */}
          <TodoPanel />
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

      {/* T2.1: kartu subagent paralel. */}
      <SubAgentPanel />

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
        {draftImages.length > 0 && (
          <div className="ai-imgstrip" data-testid="ai-imgstrip">
            {draftImages.map((src, i) => (
              <div className="ai-imgpreview" key={i} data-testid="ai-imgpreview">
                <img src={src} alt={`Lampiran gambar ${i + 1}`} />
                <button
                  className="ai-imgremove"
                  data-testid="ai-imgremove"
                  title={tr('Hapus gambar')}
                  onClick={() => removeDraftImage(i)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {/* A-8: saran slash command; Tab/Enter memakai yang tersorot. */}
        {saran.length > 0 && (
          <div className="ai-slash" data-testid="ai-slash" role="listbox" aria-label={tr('Perintah prompt')}>
            {saran.map((p, i) => (
              <button
                key={p.cmd}
                role="option"
                aria-selected={i === idxSaran}
                className={`ai-slash-item${i === idxSaran ? ' is-on' : ''}`}
                data-testid={`ai-slash-${p.cmd}`}
                onMouseEnter={() => setIdxSaran(i)}
                onClick={() => pakaiPrompt(p)}
              >
                <span className="ai-slash-cmd">/{p.cmd}</span>
                <span className="ai-slash-label">{p.label}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          className="ai-input"
          data-testid="ai-input"
          rows={2}
          placeholder={
            sibuk
              ? agentMode === 'agent'
                ? tr('Agent sedang bekerja…')
                : 'Menunggu jawaban…'
              : agentMode === 'agent'
                ? 'Ketik tugas untuk agent (Enter kirim)…'
                : tr('Tulis pesan (Enter kirim, Shift+Enter baris baru) — ketik @ untuk lampirkan file')
                          }
          value={draft}
          spellCheck={false}
          aria-label={tr('Pesan untuk AI')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // A-8: menu slash command ikut keyboard.
            if (saran.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              const n = saran.length;
              setIdxSaran((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n));
              return;
            }
            if (saran.length > 0 && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey))) {
              e.preventDefault();
              pakaiPrompt(saran[idxSaran]);
              return;
            }
            if (e.key === 'Escape' && saran.length > 0) {
              e.preventDefault();
              setDraft('');
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          onPaste={(e) => {
            // Win+Shift+S lalu Ctrl+V: tempel screenshot jadi lampiran gambar.
            void clipboardReadImage().then((url) => {
              if (url) {
                e.preventDefault();
                addDraftImage(url);
                setToast(tr('Screenshot ditempel sebagai lampiran'));
              }
            });
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
              disabled={(!draft.trim() && draftImages.length === 0) || agentBusy}
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
                : tr('Tidak ada file aktif')
            }
            onClick={() => setAttachActive(!attachActive)}
          >
            {attachActive ? '✓' : '+'} file aktif
          </button>

          <button
            className="ai-photo"
            data-testid="ai-photo"
            title={`Lampiran gambar (maks ${MAX_IMAGES} gambar, 3,5 MB masing-masing) — atau Win+Shift+S lalu Ctrl+V`}
            onClick={() => photoRef.current?.click()}
          >
            + gambar
          </button>
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="ai-photo-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length === 0) return;
              for (const f of files) {
                if (f.size > IMAGE_MAX_BYTES) {
                  setToast(`"${f.name}" lebih dari 3,5 MB — dilewati`);
                  continue;
                }
                const r = new FileReader();
                r.onload = () => addDraftImage(String(r.result));
                r.readAsDataURL(f);
              }
            }}
          />

          {/* §9.4: kirim error TS ke AI. Hanya aktif kalau ada pane terminal
              (perintahnya dijalankan di sana lalu hasilnya diminta dianalisis). */}
          <button
            className="ai-attach"
            data-testid="ai-analyze-ts"
            disabled={!!pending}
            title={tr('Jalankan npx tsc --noEmit di terminal lalu minta AI menganalisis error')}
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

      {/* Persetujuan tool agent: mode ask / perintah berbahaya. */}
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
          <p className="ai-confirm-title">{tr('Perintah ini berpotensi merusak:')}</p>
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