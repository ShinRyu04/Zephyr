import { useEffect, useRef, useState } from 'react';
import {
  useAi,
  extractCommand,
  isDestructive,
  MAX_IMAGES,
  IMAGE_MAX_BYTES,
} from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useTerminal } from '../../lib/terminalStore';
import { matchPrompts, expandPrompt, matchSnippets, expandSnippet } from '../../lib/promptLibrary';
import { activeSelection } from '../../lib/editorRegistry';
import ChatMessage from './ChatMessage';
import ModelSelector from './ModelSelector';
import TodoPanel from './TodoPanel';
import ContextMeter from './ContextMeter';
import { ApprovalPicker, EffortPicker } from './AgentControls';
import { clipboardReadImage } from '../../lib/clipboard';
import { useT } from '../../lib/i18n';
import { infoAksi, sasaranAksi, KELAS_JENIS } from '../../lib/labelAksi';

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
  const agentBusy = useAi((s) => s.agentBusy);
  const agentSteps = useAi((s) => s.agentSteps);
  const agentConfirm = useAi((s) => s.agentConfirm);
  const setAgentMode = useAi((s) => s.setAgentMode);
  const agentPutuskan = useAi((s) => s.agentPutuskan);
  const sibuk = pending || agentBusy;

  const activeTab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);

  const paneCount = useTerminal((s) => s.terminalTabs.reduce((n, t) => n + t.panes.length, 0));

  const aiDiKanan = useStore((s) => s.settings.general.aiPanel === 'right');
  const aiMax = useStore((s) => s.aiMax);
  const setAiMax = useStore((s) => s.setAiMax);
  const applySettings = useStore((s) => s.applySettings);

  const session = sessions.find((s) => s.id === activeId) ?? null;
  const msgs = session?.messages ?? [];
  const lastBot = [...msgs].reverse().find((m) => m.role === 'assistant' && !m.error);
  const lastCommand = lastBot ? extractCommand(lastBot.content) : null;

  const scroller = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const slashRef = useRef<HTMLDivElement | null>(null);
  const [idxSaran, setIdxSaran] = useState(0);

  const { items: saranSlash } = matchPrompts(draft);
  const { items: saranSnippet } = matchSnippets(draft);
  const modeSnippet = saranSnippet.length > 0;
  const saran = modeSnippet ? saranSnippet : saranSlash;

  useEffect(() => {
    const box = slashRef.current;
    if (!box) return;
    const aktif = box.querySelector<HTMLElement>('.ai-slash-item.is-on');
    aktif?.scrollIntoView({ block: 'nearest' });
  }, [idxSaran, saran.length]);
  useEffect(() => setIdxSaran(0), [draft]);

  const pakaiPrompt = (p: { cmd: string; body: string }) => {

    setDraft(
      modeSnippet
        ? expandSnippet(draft, activeSelection())
        : expandPrompt(`/${p.cmd} `, activeSelection()),
    );
    inputRef.current?.focus();
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [msgs, pending]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  useEffect(() => {
    const onFocusReq = () => inputRef.current?.focus();
    window.addEventListener('zephyr-ai-focus', onFocusReq);
    return () => window.removeEventListener('zephyr-ai-focus', onFocusReq);
  }, []);

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
    <div
      className={`ai-panel${aiDiKanan ? ' is-kanan' : ''}`}
      data-testid="ai-panel"
      data-pos={aiDiKanan ? 'kanan' : 'bawah'}
    >
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
        {agentMode === 'agent' && <ApprovalPicker />}

        {/* T3.11: tingkat penalaran lewat popover kustom, bukan <select>.
            <select> native merender daftar <option> dengan gaya OS (putih di
            tema gelap) dan tidak bisa distyle — itu keluhan "ga kliatan bnget". */}
        <EffortPicker />

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
              <>
                <span className="ai-tokens" data-testid="ai-token-count" title="Perkiraan token (jumlah karakter ÷ 4)">
                  · ≈{Math.round(msgs.reduce((n, m) => n + m.content.length, 0) / 4)} token
                </span>
                <ContextMeter />
              </>
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
          {/* Sembunyikan panel AI dari panel itu sendiri (ala VS Code).
              Tanpa ini, satu-satunya cara menutup panel adalah Ctrl+J atau
              tombol di menu View — tidak terlihat dari dalam panel. */}
          {/* Maximize: kolom kanan memenuhi lebar (ala VS Code). Hanya
              berguna saat chat memang di kolom kanan — di dock bawah ia tidak
              punya arti, jadi tidak ditampilkan. */}
          {aiDiKanan && (
            <button
              className="ai-export"
              data-testid="ai-max"
              title={aiMax ? tr('Kembalikan ukuran') : tr('Lebarkan penuh')}
              aria-label={aiMax ? tr('Kembalikan ukuran') : tr('Lebarkan penuh')}
              onClick={() => setAiMax(!aiMax)}
            >
              {aiMax ? '⇥' : '⤢'}
            </button>
          )}
          <button
            className="ai-hide"
            data-testid="ai-hide"
            title={tr('Sembunyikan panel AI')}
            aria-label={tr('Sembunyikan panel AI')}
            onClick={() => {
              if (aiDiKanan) {
                void applySettings({ general: { aiPanel: 'bottom' } } as never);
              } else {
                useTerminal.getState().setVisible(false);
              }
            }}
          >
            ✕
          </button>
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

      {/* Panel TODO: HARUS di luar kondisi agent-busy. Daftar tugas ditulis
          agent di tengah tugas, tapi setelah tugas selesai user masih perlu
          melihat apa yang sudah dikerjakan — kalau panelnya ikut hilang,
          TODO-nya tidak bisa dipantau sama sekali. */}
      <TodoPanel />

      {/* Log langkah agent: tool yang dipanggil + hasil singkat. */}
      {(agentBusy || agentSteps.length > 0) && (
        <div className="ai-agent" data-testid="ai-agent">
          {agentSteps.map((st, i) => {

            const info = infoAksi(st.name);
            const sasaran = sasaranAksi(st.args);
            const namaFile = sasaran.replace(/^.*[\/]/, '') || sasaran;
            return (
              <div
                key={i}
                className={`ai-agent-step is-${st.kind} ${KELAS_JENIS[info.jenis]}`}
                data-step-kind={st.kind}
                data-aksi={info.label}
                data-jenis={info.jenis}
              >
                {st.kind === 'tool' ? (
                  <>
                    <span className="ai-agent-ikon" aria-hidden="true">
                      {info.ikon}
                    </span>
                    <span className="ai-agent-tool">{info.label}</span>
                    {sasaran && (
                      <span className="ai-agent-sasaran" title={sasaran}>
                        {namaFile}
                      </span>
                    )}
                    {st.result !== undefined && (
                      <details className="ai-agent-hasil">
                        <summary>{tr('hasil')}</summary>
                        <pre className={`ai-agent-result${st.ok ? '' : ' is-err'}`}>{st.result}</pre>
                      </details>
                    )}
                  </>
                ) : st.kind === 'mulai' ? (
                  <span className="ai-agent-note">{tr('Memikirkan langkah…')}</span>
                ) : (
                  <span className="ai-agent-note">{tr('Tugas selesai.')}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* T2.1: kartu subagent paralel. */}

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
        {/* A-8: saran slash command; Tab/Enter memakai yang tersorot.
            T4.4: ">" menampilkan SNIPPET — teks yang disisipkan, bukan
            pertanyaan baru. Pemicunya ditandai di baris pertama daftar supaya
            user tahu mana yang sedang aktif. */}
        {saran.length > 0 && (
          <div
            className="ai-slash"
            data-testid="ai-slash"
            data-pemicu={modeSnippet ? 'snippet' : 'slash'}
            role="listbox"
            ref={slashRef}
            aria-label={tr('Perintah prompt')}
          >
            {saran.map((p, i) => (
              <button
                key={p.cmd}
                role="option"
                aria-selected={i === idxSaran}
                className={`ai-slash-item${i === idxSaran ? ' is-on' : ''}`}
                data-testid={`${modeSnippet ? 'ai-snippet' : 'ai-slash'}-${p.cmd}`}
                onMouseEnter={() => setIdxSaran(i)}
                onClick={() => pakaiPrompt(p)}
              >
                <span className="ai-slash-cmd">
                  {modeSnippet ? `>${p.cmd}` : `/${p.cmd}`}
                </span>
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
