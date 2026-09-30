import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAi,
  extractCommand,
  isDestructive,
  IMAGE_MAX_BYTES,
} from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { matchPrompts, expandPrompt, matchSnippets, expandSnippet } from '../../lib/promptLibrary';
import { tokenAt, saringFile, muatFileWorkspace, type FileRef } from '../../lib/fileRefs';
import FileIkon from './FileIkon';
import CmdIkon from './CmdIkon';
import { activeSelection } from '../../lib/editorRegistry';
import ChatMessage from './ChatMessage';
import ModelSelector from './ModelSelector';
import TodoPanel from './TodoPanel';
import ContextMeter from './ContextMeter';
import { ModeMenu, IzinMenu } from './ModeMenu';
import { useDengar } from '../../lib/useDengar';
import { clipboardReadImage } from '../../lib/clipboard';
import { fileDialogOpen, folderDialogOpen, fsRead, scanDir } from '../../lib/commands';
import { useT, useTf } from '../../lib/i18n';
import AiIkon from './AiIkon';
import { useToolGate, SEMUA_TOOL } from '../../lib/toolGate';
import { useAiDebug } from '../../lib/aiDebugStore';
import { useSchedBuka } from '../../lib/schedStore';
import { useTerminal } from '../../lib/terminalStore';
import { infoAksi, sasaranAksi, KELAS_JENIS } from '../../lib/labelAksi';
import { runCommand } from '../../lib/commandRegistry';

/** The folder part of a workspace-relative path, for the picker's second column. */
function folderDari(path: string): string {
  const pisah = path.lastIndexOf('/');
  return pisah < 0 ? '' : path.slice(0, pisah);
}

export default function AiPanel() {
  const tr = useT();
  const tf = useTf();
  const sessions = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeId);
  const pending = useAi((s) => s.pending);
  const draft = useAi((s) => s.draft);
  const draftImages = useAi((s) => s.draftImages);
  const toast = useAi((s) => s.toast);
  const confirmCmd = useAi((s) => s.confirmCmd);

  const setDraft = useAi((s) => s.setDraft);
  const compactContext = useAi((s) => s.compactContext);
  const addDraftImage = useAi((s) => s.addDraftImage);
  const removeDraftImage = useAi((s) => s.removeDraftImage);
  const setToast = useAi((s) => s.setToast);
  const setConfirmCmd = useAi((s) => s.setConfirmCmd);
  const send = useAi((s) => s.send);
  const antrian = useAi((s) => s.antrian);
  const buangAntrian = useAi((s) => s.buangAntrian);
  const kosongkanAntrian = useAi((s) => s.kosongkanAntrian);
  const cancel = useAi((s) => s.cancel);
  const exportChat = useAi((s) => s.exportChat);
  const newChat = useAi((s) => s.newChat);
  const selectChat = useAi((s) => s.selectChat);
  const deleteChat = useAi((s) => s.deleteChat);
  const setClearAllOpen = useAi((s) => s.setClearAllOpen);
  const runInTerminal = useAi((s) => s.runInTerminal);
  const agentMode = useAi((s) => s.agentMode);
  const agentBusy = useAi((s) => s.agentBusy);
  const agentSteps = useAi((s) => s.agentSteps);
  const agentConfirm = useAi((s) => s.agentConfirm);
  /* Mode switching lives in ModeMenu; AiPanel only reads the mode to pick the
     placeholder and the send label. */
  const agentPutuskan = useAi((s) => s.agentPutuskan);
  const sibuk = pending || agentBusy;

  const provider = useAi((s) => s.provider);
  const keys = useAi((s) => s.keys);
  const bukaSettings = useStore((s) => s.setSettingsOpen);
  const providerTanpaKey =
    keys.length > 0 && !keys.some((k) => k.provider === provider && k.hasKey);

  const aiDiKanan = useStore((s) => s.settings.general.aiPanel === 'right');
  const aiMax = useStore((s) => s.aiMax);
  const setAiMax = useStore((s) => s.setAiMax);
  const applySettings = useStore((s) => s.applySettings);

  const session = sessions.find((s) => s.id === activeId) ?? null;
  const msgs = session?.messages ?? [];
  /*
   * Count the enabled tools through a Set rather than a selector that builds an
   * array: zustand v5 compares selector results with ===, so a fresh array here
   * would re-render on every store write (the phase-09 trap).
   */
  const toolAktif = useToolGate((s) => s.aktif);
  const jumlahToolNyala = SEMUA_TOOL.reduce((n, t) => (toolAktif.has(t) ? n + 1 : n), 0);
  const lastBot = [...msgs].reverse().find((m) => m.role === 'assistant' && !m.error);
  const lastCommand = lastBot ? extractCommand(lastBot.content) : null;

  const scroller = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const slashRef = useRef<HTMLDivElement | null>(null);
  const [idxSaran, setIdxSaran] = useState(0);

  /*
   * Session switcher.
   *
   * The chat history lived only in the sidebar, so changing conversation meant
   * leaving the panel, and the header carried no hint that more than one
   * conversation existed. This puts the list where the title is: the newest
   * first, a search box, and a per-row delete that only appears on hover so it
   * cannot be hit by accident.
   */
  const [sesiBuka, setSesiBuka] = useState(false);
  const [sesiRect, setSesiRect] = useState<{ left: number; top: number; bottom: number } | null>(null);
  const [sesiCari, setSesiCari] = useState('');

  const sesiTampil = useMemo(() => {
    const q = sesiCari.trim().toLowerCase();
    return [...sessions]
      .reverse()
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.messages.some((m) => m.content.toLowerCase().includes(q)),
      );
  }, [sessions, sesiCari]);

  /* Click-away and Escape close the list. */
  useEffect(() => {
    if (!sesiBuka) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.ai-sesi-menu') || t?.closest('[data-testid="ai-chat-name"]')) return;
      setSesiBuka(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSesiBuka(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [sesiBuka]);

  /* The "+" menu in the composer: file, image, dictation. */
  const [bukaPlus, setBukaPlus] = useState(false);

  /*
   * Attach a file the user picks. The file is read through fsRead and pasted
   * into the draft as a fenced block, the same way an inline @file reference
   * ends up looking — so the model sees the contents and the user sees exactly
   * what was attached.
   */
  const pilihFile = async () => {
    const paths = await fileDialogOpen(false).catch(() => null);
    const p = paths?.[0];
    if (!p) return;
    try {
      const isi = await fsRead(p);
      const nama = p.split(/[\\/]/).pop() ?? p;
      const d0 = useAi.getState().draft;
      setDraft(`${d0 ? `${d0}\n\n` : ''}${'```'}\n// ${nama}\n${isi}\n${'```'}`);
      setToast(tf('Attached {name}', { name: nama }));
    } catch {
      setToast(tf('Could not read {name}', { name: p.split(/[\\/]/).pop() ?? p }));
    }
  };

  /*
   * Attach a whole folder: the file list becomes the context, not the contents,
   * since a folder can be thousands of files.
   */
  const pilihFolder = async () => {
    const dir = await folderDialogOpen().catch(() => null);
    if (!dir) return;
    try {
      const daftar = await scanDir(dir);
      const nama = dir.split(/[\\/]/).filter(Boolean).pop() ?? dir;
      const baris = daftar
        .slice(0, 300)
        .map((e) => `- ${e.name}${e.isDir ? '/' : ''}`)
        .join('\n');
      const d1 = useAi.getState().draft;
      setDraft(`${d1 ? `${d1}\n\n` : ''}Files in ${nama}:\n${baris}`);
      setToast(tf('Attached {name}', { name: nama }));
    } catch {
      setToast(tr('Could not read that folder'));
    }
  };

  /* Paste an image straight from the clipboard into the attachments. */
  const tempelGambar = async () => {
    const url = await clipboardReadImage();
    if (!url) {
      setToast(tr('No image on the clipboard'));
      return;
    }
    addDraftImage(url);
    setToast(tr('Screenshot pasted as an attachment'));
  };

  /*
   * Dictation writes into the draft: interim segments append, final segments
   * replace the interim tail so no words are duplicated.
   *
   * The draft is read from the store at event time rather than captured, since
   * setDraft takes a value (not an updater) and recognition runs outside React.
   */
  /*
   * The return value is kept this time.
   *
   * It used to be discarded, so recognition was wired up and had no way to be
   * started: the hook ran, `toggle` was thrown away, and the feature existed on
   * paper only. `bisa` gates the button on browsers with SpeechRecognition.
   */
  const { dengar, bisa: bisaDengar, toggle: toggleDengar } = useDengar((teks, final) => {
    const d = useAi.getState().draft;
    setDraft(final ? d.replace(/\s*\S*$/, '') + ' ' + teks : d + teks);
  });

  const { items: saranSlash } = matchPrompts(draft);
  const { items: saranSnippet } = matchSnippets(draft);
  const modeSnippet = saranSnippet.length > 0;
  const saran = modeSnippet ? saranSnippet : saranSlash;

  /*
   * Inline file references. The token is read from the text BEFORE the caret,
   * so an "@" typed mid-sentence does not open the list — only one that starts
   * a word does. The file list is fetched once per session and filtered
   * locally, since the workspace walk is far too slow to run per keystroke.
   */
  const [fileRefs, setFileRefs] = useState<FileRef[]>([]);
  const [fileTerbuka, setFileTerbuka] = useState(false);

  /*
   * The caret position is tracked in state, not read from the DOM during
   * render: reading `selectionStart` on the live element made the token depend
   * on a value React had not seen yet, so the list failed to open on the first
   * "@" and only appeared after an unrelated re-render.
   */
  const [kursor, setKursor] = useState(0);
  /*
   * When the draft grows, the caret is assumed to be at the end unless the
   * textarea has reported otherwise. Without this the first "@" typed by any
   * means other than a real keypress (paste, dictation, scripted input) never
   * produced a token, so the file list stayed shut.
   */
  const posisi = kursor > 0 && kursor <= draft.length ? kursor : draft.length;
  const token = tokenAt(draft.slice(0, posisi));
  const saranFile = token && fileTerbuka ? saringFile(fileRefs, token.teks) : [];

  /*
   * The token being edited is what decides whether the list is open, so a
   * completed reference — "@package.json" followed by a space — closes it. The
   * previous version only closed on an explicit pick or Escape, so the list
   * stayed up after the path was already inserted.
   */
  useEffect(() => {
    if (!token || /\s/.test(token.teks)) {
      setFileTerbuka(false);
      return;
    }
    // The caret is inside a token: make sure the list exists, then show it.
    if (fileRefs.length === 0) {
      void muatFileWorkspace().then((f) => {
        setFileRefs(f);
        if (f.length > 0) setFileTerbuka(true);
      });
      return;
    }
    setFileTerbuka(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, posisi, token?.teks]);

  /* Replaces the "@token" being typed with the chosen path. */
  const pakaiFile = (f: FileRef) => {
    const t = token;
    if (!t) return;
    const sesudah = draft.slice(posisi);
    const teks = `${draft.slice(0, t.mulai)}@${f.path}${sesudah.startsWith(' ') ? '' : ' '}${sesudah}`;
    setDraft(teks);
    setFileTerbuka(false);
    /*
     * Move the caret past the inserted path. Without this the tracked position
     * still pointed inside the old "@pack" token, so the token was recomputed
     * from stale text and the list reopened the moment it was dismissed.
     */
    const ujung = t.mulai + 1 + f.path.length + (sesudah.startsWith(' ') ? 0 : 1);
    setKursor(ujung);
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(ujung, ujung);
  };

  useEffect(() => {
    const box = slashRef.current;
    if (!box) return;
    const aktif = box.querySelector<HTMLElement>('.ai-slash-item.is-on');
    aktif?.scrollIntoView({ block: 'nearest' });
  }, [idxSaran, saran.length]);
  useEffect(() => setIdxSaran(0), [draft]);

  const pakaiPrompt = (p: { cmd: string; body: string; aksi?: string }) => {
    /*
     * Session commands (/new, /clear, /compact, /export) act immediately and
     * clear the composer. They replaced the header buttons: the header is down
     * to a title, the usage meter and close, and typing the command is quicker
     * than aiming at an icon.
     *
     * The workspace commands (/mcp, /schedule, /history, /help) open a panel
     * instead — they leave the conversation alone, so they do not touch the
     * draft either. /loop, /goal and /btw are the three that DO write to the
     * composer, because they are sentence starters rather than actions.
     */
    if (p.aksi) {
      switch (p.aksi) {
        case 'baru':
          setDraft('');
          newChat();
          break;
        case 'hapus-semua':
          setDraft('');
          setClearAllOpen(true);
          break;
        case 'padatkan':
          setDraft('');
          void compactContext();
          break;
        case 'ekspor':
          setDraft('');
          void exportChat();
          break;

        // Zephyr surfaces. Each one reuses the command palette action so the
        // slash list and Ctrl+Shift+P stay in step by construction.
        case 'mcp':
          void runCommand('mcp.panel');
          break;
        case 'jadwal':
          /* The floating schedule panel, opened from the title-bar clock. */
          useSchedBuka.getState().setBuka(true);
          break;
        case 'riwayat':
          useStore.getState().setSettingsOpen(false);
          useStore.getState().setActivity('ai');
          useStore.getState().setSidebarVisible(true);
          break;
        case 'bantuan':
          void runCommand('help.shortcuts');
          break;

        // These three fill the composer instead of acting, so the user can see
        // and edit the text before sending.
        case 'loop':
          setDraft('Continue the previous task until it is actually done. Do not stop halfway.');
          break;
        case 'goal':
          setDraft('Write a step-by-step plan for this task, then work through it one step at a time.');
          break;
        case 'btw':
          setDraft('Ngomong-ngomong, ');
          break;
      }
      inputRef.current?.focus();
      return;
    }

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
        {/*
         * Header = what this conversation is, how full the context is, and how
         * to close it. Everything else (new chat, delete all, compact, export,
         * maximise) moved into the "…" menu: they are occasional actions, and
         * six icon buttons crowded a row that has to hold a title at 340px.
         */}
        {/*
         * The title is the session switcher.
         *
         * "Which conversation am I in" and "switch conversation" are the same
         * question, so the answer is also the control: clicking the title opens
         * the list, newest first, with a search box and a delete that only
         * shows on hover. `data-testid="ai-chat-name"` stays on the button so
         * older checks still find it.
         */}
        <button
          type="button"
          className="ai-chatname ai-chatname-btn"
          data-testid="ai-chat-name"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setSesiRect({ left: r.left, top: r.top, bottom: r.bottom });
            setSesiBuka((v) => !v);
            setSesiCari('');
          }}
        >
          <span className="ai-chatname-teks">{session ? tr(session.title) : '-'}</span>
          <AiIkon name="chev-down" size={12} />
        </button>

        {sesiBuka && sesiRect && (
          <div
            className="ai-sesi-menu"
            data-testid="ai-sesi-menu"
            role="listbox"
            style={{ left: Math.max(8, Math.min(sesiRect.left, window.innerWidth - 320)), top: sesiRect.bottom + 6 }}
          >
            <div className="ai-sesi-cari">
              <AiIkon name="search" size={12} />
              <input
                autoFocus
                data-testid="ai-sesi-cari"
                placeholder={tr('Search chats…')}
                value={sesiCari}
                onChange={(e) => setSesiCari(e.target.value)}
              />
            </div>
            <div className="ai-sesi-daftar">
              {sesiTampil.length === 0 && (
                <p className="ai-sesi-kosong" data-testid="ai-sesi-kosong">
                  {tr('No chats match.')}
                </p>
              )}
              {sesiTampil.map((s) => (
                <div
                  key={s.id}
                  className={`ai-sesi-baris${s.id === activeId ? ' is-aktif' : ''}`}
                  data-testid={`ai-sesi-baris-${s.id}`}
                >
                  <button
                    type="button"
                    className="ai-sesi-pilih"
                    onClick={() => {
                      selectChat(s.id);
                      setSesiBuka(false);
                    }}
                  >
                    <span className="ai-sesi-judul">{tr(s.title)}</span>
                    <span className="ai-sesi-info">{tf('{n} messages', { n: s.messages.length })}</span>
                  </button>
                  <button
                    type="button"
                    className="ai-sesi-hapus"
                    data-testid={`ai-sesi-hapus-${s.id}`}
                    title={tr('Delete')}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(s.id);
                    }}
                  >
                    <AiIkon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="ai-sesi-baru"
              data-testid="ai-sesi-baru"
              onClick={() => {
                newChat();
                setSesiBuka(false);
              }}
            >
              <AiIkon name="plus" size={13} />
              {tr('New chat')}
            </button>
          </div>
        )}

        <div className="ai-head-right">
          <span className="ai-count" data-testid="ai-msg-count">
            {tf('{n} messages', { n: msgs.length })}
          </span>
          {/* Always shown: the ring answers "how full is this?" before the
              first message, and hiding it made the header change shape. */}
          <ContextMeter />

          {/*
            * Tool gate. The count rides next to the wrench because the number
            * is the useful part: "40/40" answers "can the agent do X?" without
            * opening the list, and a short count is the cue to open it.
            */}
          <button
            className="ai-ikon ai-ikon-gate"
            data-testid="ai-toolgate"
            title={tr('AI tools')}
            aria-label={tr('AI tools')}
            onClick={() => useToolGate.getState().toggle()}
          >
            <AiIkon name="wrench" size={14} />
            <span className="ai-gate-angka" data-testid="ai-toolgate-angka">
              {jumlahToolNyala}/{SEMUA_TOOL.length}
            </span>
          </button>

          <button
            className="ai-ikon"
            data-testid="ai-debug"
            title={tr('Debug requests')}
            aria-label={tr('Debug requests')}
            onClick={() => useAiDebug.getState().toggle()}
          >
            <AiIkon name="bug" size={14} />
          </button>

          {/*
            * Maximise, only as a right-hand column.
            *
            * In the bottom dock the panel already spans the full width, so a
            * maximise would be a no-op; as a column it trades the editor for
            * chat width, which is the one thing the narrow layout cannot do.
            */}
          {aiDiKanan && (
            <button
              className="ai-ikon"
              data-testid="ai-max"
              title={aiMax ? tr('Restore AI panel') : tr('Maximise AI panel')}
              aria-label={aiMax ? tr('Restore AI panel') : tr('Maximise AI panel')}
              aria-pressed={aiMax}
              onClick={() => setAiMax(!aiMax)}
            >
              <AiIkon name={aiMax ? 'restore' : 'maximize'} size={14} />
            </button>
          )}

          {/*
            * Close the panel. The same action the dock's own tab strip offers,
            * kept here because this is where the eye goes when the panel is
            * already open and in the way.
            */}
          <button
            className="ai-ikon"
            data-testid="ai-hide"
            title={tr('Hide AI panel')}
            aria-label={tr('Hide AI panel')}
            onClick={() => {
              if (aiDiKanan) {
                void applySettings({ general: { aiPanel: 'bottom' } } as never);
              } else {
                useTerminal.getState().setVisible(false);
              }
            }}
          >
            <AiIkon name="close" />
          </button>
        </div>
      </div>

      <div className="ai-chat" ref={scroller} data-testid="ai-chat">
        {providerTanpaKey && (
          <div className="ai-nokey" data-testid="ai-nokey" role="alert">
            <p className="ai-nokey-title">{tr('This provider does not have an API key yet')}</p>
            <p className="ai-nokey-body">
              {tr('Add an API key for')} <strong>{provider}</strong>{' '}
              {tr('so the AI can answer. Without a key, every request will fail with 401.')}
            </p>
            <button
              className="btn btn-primary btn-sm"
              data-testid="ai-nokey-open"
              onClick={() => bukaSettings(true)}
            >
              {tr('Open Settings → AI Models')}
            </button>
          </div>
        )}
        {msgs.length === 0 ? (
          <div className="ai-empty" data-testid="ai-empty">
            {/*
             * A mark, a line of purpose, then three things to do. The panel used
             * to open on two lines of grey hint text, which read as an error
             * state rather than as a starting point. The suggestions are the
             * real prompts the panel already supports — clicking one fills the
             * composer rather than sending, so the user can edit first.
             */}
            <div className="ai-empty-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="30" height="30" fill="none">
                <path
                  d="M16 3.4l3.4 7.2 7.2 3.4-7.2 3.4L16 24.6l-3.4-7.2L5.4 14l7.2-3.4L16 3.4z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <circle cx="16" cy="14" r="2.4" fill="currentColor" />
              </svg>
            </div>
            <p className="ai-empty-title">{tr('Ask about this code.')}</p>
            <p className="ai-empty-sub">
              {tr('Enter sends · Shift+Enter new line · Ctrl+I focuses here.')}{' '}
              {tr('A')} <code>bash</code> {tr('block runs in the terminal.')}
            </p>
            <div className="ai-saran" role="list">
              {[
                { id: 'jelaskan', label: 'Explain this file', sub: 'Walk through what it does', isi: 'Explain what this file does, step by step.' },
                { id: 'error', label: 'Find the bug', sub: 'Look at the current errors', isi: 'Look at the errors in this file and explain the cause, then propose a fix.' },
                { id: 'tes', label: 'Write a test', sub: 'Cover the main path', isi: 'Write a test for the main path in this file.' },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="listitem"
                  className="ai-saran-kartu"
                  data-testid={`ai-saran-${s.id}`}
                  onClick={() => {
                    setDraft(tr(s.isi));
                    inputRef.current?.focus();
                  }}
                >
                  <span className="ai-saran-teks">
                    <span className="ai-saran-label">{tr(s.label)}</span>
                    <span className="ai-saran-sub">{tr(s.sub)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m) => <ChatMessage key={m.id} msg={m} />)
        )}
      </div>

      {/* Panel TODO: MUST be outside the agent-busy condition. The task list is written
          by the agent mid-task, but once the task finishes the user still needs
          to see what was done - if the panel disappears with it,
          the TODO cannot be monitored at all. */}
      <TodoPanel />

      {/* Agent step log: the tool that was called + a short result. */}
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
                        <summary>{tr('result')}</summary>
                        <pre className={`ai-agent-result${st.ok ? '' : ' is-err'}`}>{st.result}</pre>
                      </details>
                    )}
                  </>
                ) : st.kind === 'mulai' ? (
                  <span className="ai-agent-note is-thinking" data-testid="ai-agent-thinking">
                    {tr('Thinking about the next step…')}
                  </span>
                ) : (
                  <span className="ai-agent-note">{tr('Task complete.')}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* T2.1: kartu subagent paralel. */}

      {/* Action bar: appears only when the last answer carries commands. */}
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
            {tr('Run in Terminal')}
          </button>
          {isDestructive(lastCommand) && (
            <span className="ai-risk" data-testid="ai-risk">
              risky
            </span>
          )}
        </div>
      )}

      <div className="ai-input-row">
        {draftImages.length > 0 && (
          <div className="ai-imgstrip" data-testid="ai-imgstrip">
            {draftImages.map((src, i) => (
              <div className="ai-imgpreview" key={i} data-testid="ai-imgpreview">
                <img src={src} alt={`Image attachment ${i + 1}`} />
                <button
                  className="ai-imgremove"
                  data-testid="ai-imgremove"
                  title={tr('Remove image')}
                  onClick={() => removeDraftImage(i)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {/* File suggestions for an "@" token. Same row shape as the prompt
            list, so the two never look like different features. */}
        {saranFile.length > 0 && (
          <div
            className="ai-slash"
            data-testid="ai-file-list"
            data-pemicu="file"
            role="listbox"
            aria-label={tr('Files in this workspace')}
          >
            {saranFile.map((f, i) => (
              <button
                key={f.path}
                role="option"
                aria-selected={i === idxSaran}
                className={`ai-slash-item${i === idxSaran ? ' is-on' : ''}`}
                data-testid={`ai-file-${i}`}
                data-path={f.path}
                onMouseEnter={() => setIdxSaran(i)}
                onClick={() => pakaiFile(f)}
              >
                {/*
                 * Icon, name, then the folder it lives in.
                 *
                 * The second column used to print the whole relative path, so a
                 * row read "@package.json  package.json" — the name twice. The
                 * folder is the part that actually distinguishes two files with
                 * the same name.
                 */}
                <FileIkon nama={f.name} />
                <span className="ai-slash-cmd">@{f.name}</span>
                <span className="ai-slash-label">{folderDari(f.path)}</span>
              </button>
            ))}
          </div>
        )}

        {/* A-8: slash command suggestions; Tab/Enter uses the highlighted one.
            T4.4: ">" shows SNIPPETS - the text that gets inserted, not
            a new question. The trigger is marked on the first line of the list so the
            user knows which one is currently active. */}
        {saranFile.length === 0 && saran.length > 0 && (
          <div
            className="ai-slash"
            data-testid="ai-slash"
            data-pemicu={modeSnippet ? 'snippet' : 'slash'}
            role="listbox"
            ref={slashRef}
            aria-label={tr('Prompt commands')}
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
                <CmdIkon nama={p.ikon} />
                <span className="ai-slash-cmd">
                  {modeSnippet ? `>${p.cmd}` : `/${p.cmd}`}
                </span>
                <span className="ai-slash-label">{tr(p.label)}</span>
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
                ? tr('Agent is working…')
                : tr('Waiting for an answer…')
              : agentMode === 'agent'
                ? tr('Type a task for the agent (Enter to send)…')
                : tr('Write a message (Enter to send, Shift+Enter for a new line) - type @ to attach a file')
                          }
          value={draft}
          spellCheck={false}
          aria-label={tr('Message for the AI')}
          onChange={(e) => {
            setDraft(e.target.value);
            setKursor(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) => setKursor(e.currentTarget.selectionStart ?? 0)}
          onClick={(e) => setKursor(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={(e) => {

            // The file list takes the keys while it is open: Enter there means
            // "insert this path", not "send".
            if (saranFile.length > 0) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const nf = saranFile.length;
                setIdxSaran((i) => (e.key === 'ArrowDown' ? (i + 1) % nf : (i - 1 + nf) % nf));
                return;
              }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                pakaiFile(saranFile[idxSaran]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setFileTerbuka(false);
                return;
              }
            }
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
            const items = e.clipboardData?.items;
            let file: File | null = null;
            if (items) {
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                  file = items[i].getAsFile();
                  break;
                }
              }
            }
            if (file) {
              e.preventDefault();
              const f = file;
              const reader = new FileReader();
              reader.onload = () => {
                const url = typeof reader.result === 'string' ? reader.result : null;
                if (url) {
                  addDraftImage(url);
                  setToast(tr('Screenshot pasted as an attachment'));
                }
              };
              reader.readAsDataURL(f);
              return;
            }
            void clipboardReadImage().then((url) => {
              if (url) {
                addDraftImage(url);
                setToast(tr('Screenshot pasted as an attachment'));
              }
            });
          }}
        />

        <div className="ai-input-side">
          {/*
           * Layout, left to right: what goes INTO the message, then how it goes
           * out — "+" (attach a file, an image or your voice), the mode switch,
           * permissions + reasoning, the model, Send.
           *
           * The "+" opens a small menu rather than sitting as three separate
           * icon buttons. Three look-alike icons in a row read as decoration;
           * one "+" says "add something" and keeps the bar to a single line,
           * which is the shape the reference composer uses.
           */}
          <button
            className={`ai-plus${bukaPlus ? ' is-on' : ''}`}
            data-testid="ai-plus"
            aria-haspopup="menu"
            aria-expanded={bukaPlus}
            title={tr('Add a file, an image or dictate')}
            aria-label={tr('Add a file, an image or dictate')}
            onClick={() => setBukaPlus((v) => !v)}
          >
            <AiIkon name="plus" />
          </button>

          {/*
            * Dictation gets its own button, not just a menu entry.
            *
            * The hook was already wired into the draft, but nothing could start
            * it. It sits next to "+" because it fills the same slot — both put
            * content into the message — and it only renders where the browser
            * actually offers speech recognition.
            */}
          {bisaDengar && (
            <button
              className={`ai-plus ai-mic${dengar ? ' is-on' : ''}`}
              data-testid="ai-mic"
              aria-pressed={dengar}
              title={dengar ? tr('Stop dictation') : tr('Start dictation')}
              aria-label={dengar ? tr('Stop dictation') : tr('Start dictation')}
              onClick={() => {
                toggleDengar();
                inputRef.current?.focus();
              }}
            >
              <AiIkon name="mic" />
            </button>
          )}

          {bukaPlus && (
            <>
              <div className="ai-plus-backdrop" onClick={() => setBukaPlus(false)} />
              <div className="ai-plus-menu" data-testid="ai-plus-menu" role="menu">
                <div className="pick-seksi">{tr('Attach')}</div>

                <button
                  className="ai-plus-item"
                  data-testid="ai-plus-file"
                  role="menuitem"
                  onClick={() => {
                    setBukaPlus(false);
                    void pilihFile();
                  }}
                >
                  <AiIkon name="file" />
                  <span className="ai-plus-label">{tr('Files…')}</span>
                </button>

                <button
                  className="ai-plus-item"
                  data-testid="ai-plus-folder"
                  role="menuitem"
                  onClick={() => {
                    setBukaPlus(false);
                    void pilihFolder();
                  }}
                >
                  <AiIkon name="folder" />
                  <span className="ai-plus-label">{tr('Folder…')}</span>
                </button>

                <button
                  className="ai-plus-item"
                  data-testid="ai-photo"
                  role="menuitem"
                  onClick={() => {
                    setBukaPlus(false);
                    photoRef.current?.click();
                  }}
                >
                  <AiIkon name="image" />
                  <span className="ai-plus-label">{tr('Images…')}</span>
                </button>

                <button
                  className="ai-plus-item"
                  data-testid="ai-plus-paste"
                  role="menuitem"
                  onClick={() => {
                    setBukaPlus(false);
                    void tempelGambar();
                  }}
                >
                  <AiIkon name="clipboard" />
                  <span className="ai-plus-label">{tr('Paste image')}</span>
                </button>

                <button
                  className="ai-plus-item"
                  data-testid="ai-plus-url"
                  role="menuitem"
                  onClick={() => {
                    setBukaPlus(false);
                    // The URL is asked for in the composer rather than a modal:
                    // it lands where the message is written, so the user sees
                    // exactly what will be fetched.
                    const d2 = useAi.getState().draft;
                    setDraft((d2 ? `${d2} ` : '') + '@url:');
                    inputRef.current?.focus();
                  }}
                >
                  <AiIkon name="link" />
                  <span className="ai-plus-label">{tr('URL…')}</span>
                </button>

                <div className="mode-div" aria-hidden="true" />

                <button
                  className="ai-plus-item"
                  data-testid="ai-plus-snippet"
                  role="menuitem"
                  onClick={() => {
                    setBukaPlus(false);
                    const d3 = useAi.getState().draft;
                    setDraft((d3 ? `${d3} ` : '') + '>');
                    inputRef.current?.focus();
                  }}
                >
                  <AiIkon name="snippet" />
                  <span className="ai-plus-label">{tr('Prompt snippets…')}</span>
                </button>

                <div className="mode-div" aria-hidden="true" />

                <div className="ai-plus-tip">
                  {tr('Tip: type')} <kbd>@</kbd> {tr('to reference files inline')}
                </div>
              </div>
            </>
          )}

          {/* Voice, the image picker and the active-file toggle now live in the
              "+" menu above; only the hidden file input stays here. */}

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
                  setToast(tf('"{name}" is larger than 3.5 MB - skipped', { name: f.name }));
                  continue;
                }
                const r = new FileReader();
                r.onload = () => addDraftImage(String(r.result));
                r.readAsDataURL(f);
              }
            }}
          />

          <span className="ai-toolbar-spacer" aria-hidden="true" />

          {/*
            * Model first, then mode, then permissions.
            *
            * The model is the control a reader changes most often, and it was
            * the last of the three on the row — a glance had to cross the mode
            * and the approval state to reach it. Moving it to the front puts
            * the most-used control where the eye lands first and leaves the
            * rarely changed settings trailing toward the send button.
            */}
          <ModelSelector />
          <ModeMenu />
          <IzinMenu />

          {sibuk ? (
            <button
              className="ai-round-btn is-stop"
              data-testid="ai-stop"
              title={tr('Stop')}
              aria-label={tr('Stop')}
              onClick={() => void cancel()}
            >
              <AiIkon name="stop" size={14} />
            </button>
          ) : (
            <button
              className="ai-round-btn is-send"
              data-testid="ai-send"
              disabled={!draft.trim() && draftImages.length === 0}
              title={agentMode === 'agent' ? tr('Run') : tr('Send')}
              aria-label={agentMode === 'agent' ? tr('Run') : tr('Send')}
              onClick={() => void send()}
            >
              <AiIkon name="send" size={15} />
            </button>
          )}
        </div>
      </div>

      {/*
       * The outgoing queue. Each row is one message waiting for the current
       * answer to finish; it can be dropped before it goes.
       */}
      {antrian.length > 0 && (
        <div className="ai-antrian" data-testid="ai-antrian">
          <div className="ai-antrian-head">
            <AiIkon name="queue" size={13} />
            <span className="ai-antrian-judul">
              {tf('{n} waiting', { n: antrian.length })}
            </span>
            {/*
             * Say what the queue is for.
             *
             * The strip appeared only once something was already queued, so the
             * feature had no way of announcing itself — people asked how it was
             * meant to be used. One short line answers that at the moment it
             * matters, and it goes out with the messages rather than taking a
             * permanent row in the composer.
             */}
            <span className="ai-antrian-hint">
              {tr('sends when the current turn ends')}
            </span>
            <button
              className="ai-antrian-act"
              data-testid="ai-antrian-clear"
              title={tr('Clear the queue')}
              onClick={kosongkanAntrian}
            >
              {tr('Clear')}
            </button>
          </div>
          {antrian.map((a, i) => (
            <div className="ai-antrian-item" key={i} data-testid={`ai-antrian-${i}`}>
              <span className="ai-antrian-teks">{a.teks}</span>
              <button
                className="ai-antrian-x"
                data-testid={`ai-antrian-hapus-${i}`}
                title={tr('Remove from the queue')}
                aria-label={tr('Remove from the queue')}
                onClick={() => buangAntrian(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Agent tool approval: ask mode / dangerous command. */}
      {agentConfirm && (
        <div className="ai-confirm" role="alertdialog" data-testid="ai-agent-confirm">
          <p className="ai-confirm-title">
            {agentConfirm.isDestructive
              ? tr('This command is potentially destructive - allow the agent?')
              : tf('The agent is asking permission to run {tool}:', { tool: agentConfirm.tool })}
          </p>
          <code className="ai-confirm-cmd">{agentConfirm.argsText}</code>
          <div className="ai-confirm-btns">
            <button
              className="btn btn-sm btn-danger"
              data-testid="ai-agent-confirm-yes"
              onClick={() => agentPutuskan(true)}
            >
              {tr('Allow')}
            </button>
            <button
              className="btn btn-sm"
              data-testid="ai-agent-confirm-no"
              onClick={() => agentPutuskan(false)}
            >
              {tr('Deny')}
            </button>
          </div>
        </div>
      )}

      {confirmCmd && (
        <div className="ai-confirm" role="alertdialog" data-testid="ai-confirm">
          <p className="ai-confirm-title">{tr('This command is potentially destructive:')}</p>
          <code className="ai-confirm-cmd">{confirmCmd}</code>
          <div className="ai-confirm-btns">
            <button
              className="btn btn-sm btn-danger"
              data-testid="ai-confirm-yes"
              onClick={() => void runInTerminal(confirmCmd, { confirmed: true })}
            >
              {tr('Run')}
            </button>
            <button
              className="btn btn-sm"
              data-testid="ai-confirm-no"
              onClick={() => setConfirmCmd(null)}
            >
              {tr('Cancel')}
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
