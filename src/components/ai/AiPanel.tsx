import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useAi,
  extractCommand,
  isDestructive,
  IMAGE_MAX_BYTES,
} from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { matchPrompts, expandPrompt, matchSnippets, expandSnippet, snippetTrigger } from '../../lib/promptLibrary';
import { tokenAt, saringFile, muatFileWorkspace, type FileRef } from '../../lib/fileRefs';
import FileIkon from './FileIkon';
import CmdIkon from './CmdIkon';
import { activeSelection } from '../../lib/editorRegistry';
import ChatMessage from './ChatMessage';
import { LoopStrip, GoalStrip } from './JobStrips';
import BicaraHost from './BicaraHost';
import ModelSelector from './ModelSelector';
import { findModel } from '../../lib/modelCatalog';
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
import { useSched, useSchedBuka } from '../../lib/schedStore';
import { useTerminal } from '../../lib/terminalStore';
import { useSubAgent } from '../../lib/subagentStore';
import { useGit } from '../../lib/gitStore';
import { runCommand } from '../../lib/commandRegistry';
/* `SubAgentInfo` tidak diimpor lagi: popover subagent di kepala panel sudah
   dibuang, dan isinya kini tampil di tumpukan status atas kotak input. Berkas
   komponennya sengaja TIDAK dihapus - ia masih dipakai di tempat lain. */
import { infoAksi, KELAS_JENIS } from '../../lib/labelAksi';
import ToolCallCard from './ToolCallCard';
import DiffViewer from './DiffViewer';
import ThinkingBar from './ThinkingBar';
import StatusArea from './StatusArea';

/** The folder part of a workspace-relative path, for the picker's second column. */
function folderDari(path: string): string {
  const pisah = path.lastIndexOf('/');
  return pisah < 0 ? '' : path.slice(0, pisah);
}

/**
 * Gelombang 4: turn one recorded agent step into the shape ToolCallCard wants.
 *
 * `args` and `result` in the store are the raw strings the loop already kept -
 * the card decides how to present them. Two things are worth deriving here
 * rather than in the card, because only this layer knows the tool names:
 *
 * - a unified diff, when the tool rewrote a file (that is what DiffViewer is
 *   for; a raw JSON blob of an edit is unreadable);
 * - the exit code, when the result carries one.
 */
function kartuTool(
  step: { name?: string; args?: string; result?: string; ok?: boolean; at: number; durasiMs?: number; exitCode?: number; cwd?: string },
  okText: string,
  gagalText: string,
  /** Set when this call is the one currently executing, so the card can show
   *  the running state (pulsing chip, moving glyph) instead of "Selesai". */
  jalan = false,
): {
  name: string;
  input: string;
  output: string;
  ok?: boolean;
  running?: boolean;
  durationMs?: number;
  exitCode?: number;
  cwd?: string;
  diff?: string;
} {
  const nama = step.name ?? '';
  const hasil = step.result ?? '';
  const info = infoAksi(nama);
  /*
   * Nama yang MASUK ke kartu sudah polos, tapi tiap pemakaian pola di bawah
   * tetap butuh nama APA ADANYA.
   *
   * `mcp__tedi__open_file` mengandung `open_file`, bukan `open`; kalau yang
   * polos yang diuji, sebuah pemanggilan yang menyunting berkas berhenti
   * terdeteksi sebagai penyunting dan diffnya tidak pernah dirender. Jadi
   * pengujian pola memakai `nama`, dan yang ditampilkan memakai `info.label`.
   */
  const menyunting = info.jenis === 'tulis' || /edit|write|patch|replace|apply/i.test(nama);
  const adaHunk = /(^|\n)(diff --git|@@ -\d+)/.test(hasil);
  const diff = menyunting && adaHunk ? hasil : undefined;

  let keluaran = hasil;
  let exitCode = step.exitCode;
  if (exitCode == null) {
    const cocok = /"exit_?code"\s*:\s*(-?\d+)/.exec(hasil);
    if (cocok) exitCode = Number(cocok[1]);
  }

  if (step.ok === false && !keluaran) keluaran = gagalText;
  else if (step.ok !== false && !keluaran) keluaran = okText;

  return {
    name: nama,
    input: step.args ?? '',
    output: keluaran,
    /*
     * `ok` is only asserted once the call has actually returned.
     *
     * This used to be `step.ok !== false`, which is true for a call that is
     * still in flight (its `ok` is `undefined`). Every running call therefore
     * rendered as finished - the pill said "Selesai" while the command was
     * still executing, and the row got no running animation. Leaving `ok`
     * undefined until the result arrives is what lets the card tell the two
     * apart, and the running state is what drives the pill's colour and the
     * icon's motion.
     */
    ok: step.ok,
    running: jalan,
    durationMs: step.durasiMs,
    exitCode,
    cwd: step.cwd,
    diff,
  };
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
  const kirimAntrian = useAi((s) => s.kirimAntrian);
  const naikkanAntrian = useAi((s) => s.naikkanAntrian);
  const turunkanAntrian = useAi((s) => s.turunkanAntrian);
  /*
   * Whether the task list has anything to show.
   *
   * Read as a primitive count rather than the array itself: zustand v5
   * compares selector results with `===`, and returning `s.agentTodos` is fine
   * only because the store keeps that array identity stable. A count is immune
   * to the phase-09 trap either way, and it is all this needs - the stack is
   * kept on screen when the plan exists even if nothing else is running, so a
   * plan does not vanish the moment the run pauses.
   */
  const todosAda = useAi((s) => s.agentTodos.length > 0);
  /*
   * The branch the workspace is on, shown in the composer.
   *
   * Hermes puts a `main` chip inside the composer box, above the input row
   * (`composer/scope.tsx`), so the context a prompt will be attached to is
   * visible at the moment of typing. Zephyr only showed the branch in the
   * status bar at the bottom of the window - far from the composer, and easy to
   * miss while writing. `null` when the folder is not a repo, which hides the
   * chip rather than printing an empty one.
   */
  const gitBranch = useGit((s) => (s.status?.isRepo ? s.status?.branch ?? null : null));
  const ubahAntrian = useAi((s) => s.ubahAntrian);
  const cancel = useAi((s) => s.cancel);
  const kirimSekarang = useAi((s) => s.kirimSekarang);
  const historyUp = useAi((s) => s.historyUp);
  const historyDown = useAi((s) => s.historyDown);
  const exportChat = useAi((s) => s.exportChat);
  const newChat = useAi((s) => s.newChat);
  const selectChat = useAi((s) => s.selectChat);
  const deleteChat = useAi((s) => s.deleteChat);
  const setClearAllOpen = useAi((s) => s.setClearAllOpen);
  const runInTerminal = useAi((s) => s.runInTerminal);
  const agentMode = useAi((s) => s.agentMode);
  const agentBusy = useAi((s) => s.agentBusy);
  const agentPhase = useAi((s) => s.agentPhase);
  const agentCurrentTool = useAi((s) => s.agentCurrentTool);
  const agentStepIndex = useAi((s) => s.agentStepIndex);
  const agentStepLimit = useAi((s) => s.agentStepLimit);
  const agentLastProgressAt = useAi((s) => s.agentLastProgressAt);
  const agentSteps = useAi((s) => s.agentSteps);
/* Berapa aksi terakhir yang tampil penuh di jejak tool; sisa-nya jadi 'N more actions'. */
const JEJAK_TOOL_MAKS = 4;
  const agentConfirm = useAi((s) => s.agentConfirm);
  /* Mode switching lives in ModeMenu; AiPanel only reads the mode to pick the
     placeholder and the send label. */
  const agentPutuskan = useAi((s) => s.agentPutuskan);
  /* Pertanyaan dari agen (tool ask_user): agen menahan langkahnya sampai user
     menjawab, jadi kartunya tidak boleh ikut disembunyikan saat panel sibuk. */
  const agentTanya = useAi((s) => s.agentTanya);
  const jawabTanya = useAi((s) => s.jawabTanya);
  const [jawabanTanya, setJawabanTanya] = useState('');
  const sibuk = pending || agentBusy;
  const [bukaSendMenu, setBukaSendMenu] = useState(false);
  const [progressNow, setProgressNow] = useState(() => Date.now());
  const [loopBuka, setLoopBuka] = useState(false);
  const [loopMenuBuka, setLoopMenuBuka] = useState(false);
  const [backgroundBuka, setBackgroundBuka] = useState(false);
  /*
   * The queue opens expanded.
   *
   * It used to start collapsed, which kept the composer short but meant a
   * queued message was invisible until you clicked the header - the count said
   * "3 Queued" while the three messages stayed hidden. Hermes shows the queued
   * items themselves (`session-control-queue.tsx` renders the chip rail, not
   * just a count), and the point of parking a message is being able to see it
   * is parked. Collapsing is still one click away for a long queue.
   */
  const [cqLipat, setCqLipat] = useState(false);
  /*
   * `subagentsSibuk` tidak lagi dipakai header.
   *
   * Popover subagent di kepala panel sudah dibuang - isinya pindah ke
   * tumpukan status di atas kotak input. Jadi yang tersisa di sini hanya daftar
   * agennya, untuk menghitung berapa yang sedang jalan.
   */
  const subagents = useSubAgent((s) => s.agents);
  const jadwal = useSched((s) => s.daftar);
  const muatJadwal = useSched((s) => s.muat);
  const subagentsAktif = subagents.filter((a) => a.status === 'jalan' || a.status === 'menunggu');
  const jadwalAktif = jadwal.filter((j) => j.enabled);
  const backgroundCount = subagentsAktif.length + jadwalAktif.length;
  const loopRuns = agentSteps.filter((step) => step.kind === 'mulai').length;
  const loopFinished = !sibuk && agentSteps.some((step) => step.kind === 'selesai');
  /*
   * Prompt and cadence for the loop section.
   *
   * Hermes shows the loop's own prompt and cadence inside the section body
   * (apps/desktop/src/app/chat/composer/status-stack/session-control-loop.tsx):
   * the reader asked for this run and should see WHAT it was asked to do, not
   * just that a loop exists. Zephyr has no loop scheduler yet, so the prompt is
   * the message that started the current run and the cadence is self-paced by
   * definition - the agent works until its task list is done rather than on a
   * timer. Reading them from real state keeps the row honest: when a scheduled
   * loop arrives, only `cadence` changes.
   */
  /* Jejak tool: hanya beberapa terakhir yang dirender, sisanya diringkas. */
  const jejakTool = agentSteps.filter((step) => step.kind === 'tool');
  const jejakToolTerlihat = jejakTool.slice(-JEJAK_TOOL_MAKS);
  /*
   * Gelombang 3: the status stack used to render even when every counter was
   * zero. `stackKosong` lets the whole block leave the DOM instead of drawing
   * four rows that only say "nothing is happening".
   */
  const stackKosong = !sibuk && !loopFinished && backgroundCount === 0 && antrian.length === 0;

  useEffect(() => {
    if (!sibuk || !agentLastProgressAt) return;
    setProgressNow(Date.now());
    const timer = window.setInterval(() => setProgressNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sibuk, agentLastProgressAt]);

  useEffect(() => {
    void muatJadwal();
  }, [muatJadwal]);

  const agentPhaseLabel = tr({
    idle: pending ? 'Waiting for answer' : 'Ready',
    thinking: 'Thinking',
    'running-tool': 'Running tool',
    'waiting-confirmation': 'Waiting for confirmation',
    cancelling: 'Cancelling',
  }[agentPhase]);
  const progressElapsed = agentLastProgressAt ? Math.max(0, Math.floor((progressNow - agentLastProgressAt) / 1000)) : 0;

  /*
   * Close the send menu the moment the run ends. It only exists while a run
   * is in flight, so leaving it open over an idle composer would show a menu
   * whose rows no longer describe anything.
   */
  useEffect(() => {
    if (!sibuk) setBukaSendMenu(false);
  }, [sibuk]);

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
  /*
   * Prompt and cadence for the loop section.
   *
   * Hermes shows the loop's own prompt and cadence inside the section body
   * (apps/desktop/src/app/chat/composer/status-stack/session-control-loop.tsx):
   * the reader asked for this run and should see WHAT it was asked to do, not
   * just that a loop exists. Zephyr has no loop scheduler yet, so the prompt is
   * the message that started the current run and the cadence is self-paced by
   * definition - the agent works until its task list is done rather than on a
   * timer. Reading both from real state keeps the row honest: when a scheduled
   * loop arrives, only the cadence changes.
   */
  const pesanUserTerakhir = [...msgs].reverse().find((m) => m.role === 'user');
  const loopPrompt = (pesanUserTerakhir?.content ?? '').trim();
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
  /*
   * The dictation language comes from settings, not a constant.
   *
   * The recogniser listens for exactly one language and never detects it: with
   * `id-ID` set while speaking English it does not fail, it returns confident
   * nonsense. The old hardcoded `id-ID` therefore made dictation useless for
   * anyone not speaking Indonesian, with no visible cause.
   *
   * Read as a primitive - `useStore` with a selector returning a string - because
   * zustand v5 compares selector results with `===` and an object here would
   * re-render the whole composer on every unrelated settings write.
   */
  const voiceAktif = useStore((s) => s.settings?.voice?.enabled !== false);
  const bahasaMic = useStore((s) => s.settings?.mic?.lang ?? '');
  const bahasaLama = useStore((s) => s.settings?.voice?.inputLang ?? 'en-US');
  const bahasaDengar = bahasaMic || bahasaLama;
  const micAktif = useStore((s) => s.settings?.mic?.enabled !== false);
  const micAutoSend = useStore((s) => s.settings?.mic?.autoSend === true);

  /*
   * Dictation, with the active model as its transcription target.
   *
   * The provider and endpoint are read from the store at record time rather
   * than captured here: the user can switch models while a clip is being
   * recorded, and the audio should be transcribed by whichever model is
   * selected when the recording ENDS.
   */
  const { dengar, bisa: bisaDengar, toggle: toggleDengar, galat: galatDengar } = useDengar(
    (teks, final) => {
      const d = useAi.getState().draft;
      const hasil = final ? d.replace(/\s*\S*$/, '') + ' ' + teks : d + teks;
      setDraft(hasil);
      if (final && micAutoSend && hasil.trim()) {
        void send();
      }
    },
    bahasaDengar,
    {
      get provider() {
        return useStore.getState().settings?.mic?.provider || provider;
      },
      get model() {
        return useStore.getState().settings?.mic?.model || useAi.getState().model;
      },
      get baseUrl() {
        const st = useAi.getState();
        const def = findModel(st.model, st.provider);
        return useStore.getState().settings.models.providers[def.provider]?.baseUrl ?? undefined;
      },
    },
  );

  /*
   * A dictation failure has to be visible.
   *
   * The button silently un-lighting is the worst outcome: the user speaks, the
   * mic goes dark, and nothing says whether the audio was heard, the provider
   * refused, or the key is missing. Each cause gets its own short message.
   */
  useEffect(() => {
    if (!galatDengar) return;
    const pesan =
      galatDengar === 'izin'
        ? tr('Microphone permission was refused')
        : galatDengar === 'tanpa-provider'
          ? tr('Pick a model first - dictation needs one to transcribe with')
          : galatDengar === 'key-audio'
            ? tr('Voice key rejected for audio - set a voice key in Mic settings')
            : galatDengar === 'kosong'
            ? tr('Nothing was recorded')
            : tr('Could not transcribe the recording');
    setToast(pesan);
  }, [galatDengar, setToast, tr]);

  const { items: saranSlash } = matchPrompts(draft);
  const { items: saranSnippet } = matchSnippets(draft);
  const modeSnippet = saranSnippet.length > 0;
  const saran = modeSnippet ? saranSnippet : saranSlash;
  /* The trigger symbol the user typed (`>` or `#`) so the rows echo it back. */
  const pemicuSnippet = modeSnippet ? snippetTrigger(draft) ?? '>' : '>';

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
   * The chip being edited, and the text in its field.
   *
   * Clicking a chip's text swaps it for an input in place, so the queue does not
   * have to be torn down to fix one word. The index is held rather than a flag
   * per chip because only one chip may be open at a time — turning a second one
   * into an input while the first is still open would leave two fields
   * competing for the same commit. -1 means "none".
   */
  /*
   * Identitas baris antrian memakai id stabil milik item, bukan indeks array.
   * Dulu `cqEdit` menyimpan indeks: begitu baris dinaikkan/diturunkan, indeks
   * yang sama menunjuk pesan lain sehingga draft bisa tersimpan ke pesan yang
   * salah. Item lama yang belum punya id jatuh ke indeks sebagai cadangan.
   */
  const [cqEdit, setCqEdit] = useState<number | string | null>(null);
  const [cqDraft, setCqDraft] = useState('');
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

        /*
         * These three stay in the composer as COMMANDS, not as replacement text.
         *
         * They used to overwrite the draft with a fixed sentence, so picking
         * `/loop` left you with a paragraph and no command - you could not see
         * what you had chosen, could not add your own instruction, and could not
         * pick a second command without retyping the slash. The user asked for
         * the reference behaviour, and it is the better one: the command stays,
         * the cursor lands after it, and what you type next becomes the argument.
         *
         * The expansion to the full instruction happens at send time
         * (`expandPromptBody`), which is also where the editor selection is
         * available.
         */
        case 'loop':
          setDraft('/loop ');
          break;
        case 'goal':
          setDraft('/goal ');
          break;
        case 'btw':
          setDraft('/btw ');
          break;
      }
      inputRef.current?.focus();
      return;
    }

    /*
     * A picked template stays in the composer as `/cmd `, with the cursor after
     * it. The body is applied when the message is sent, not here - see
     * `expandPrompt` and `perluasPerintah`. This is what lets the user type an
     * argument next to the command instead of replacing the whole line.
     */
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

  /*
   * Whether the reader has fallen behind the newest output.
   *
   * The transcript auto-scrolls only while the reader is at the bottom (see the
   * effect above). That is the right rule - yanking someone away from the
   * passage they are reading is worse than making them scroll - but it leaves
   * them stuck: once they look away while the agent is still working, new rows
   * arrive below the fold and there is no way back except dragging the bar.
   *
   * This flag drives a jump-to-bottom button. It is read from the live scroll
   * position rather than from a timer, so the button appears the instant the
   * bottom leaves the viewport and disappears the instant it returns.
   */
  const [diBawah, setDiBawah] = useState(true);

  const cekPosisi = () => {
    const el = scroller.current;
    if (!el) return;
    const sisa = el.scrollHeight - el.scrollTop - el.clientHeight;
    setDiBawah(sisa < 120);
  };

  const lompatKeBawah = () => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setDiBawah(true);
  };

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
            * Compact, as an icon rather than a menu row.
            *
            * It used to live only behind `/compact` and the command palette,
            * which meant a user looking at a long chat had no way to find it.
            * The header is where someone worried about context already looks —
            * the meter is right there — so the control belongs next to it.
            * The button is always enabled: what it would do is not knowable
            * from the outside (it depends on how many messages the active
            * session holds), and a disabled icon with no reason is worse than
            * a click that explains itself.
            */}
          <button
            className="ai-ikon"
            data-testid="ai-compact"
            title={tr('Compact context')}
            aria-label={tr('Compact context')}
            onClick={() => {
              const n = compactContext();
              if (n > 0) setToast(tf('{n} messages compacted', { n }));
            }}
          >
            <AiIkon name="compact" size={14} />
          </button>

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

          {/*
            * Pemicu popover subagent DIBUANG dari header.
            *
            * Dua alasan. Pertama, isinya sudah ada di tempat yang lebih baik:
            * tumpukan status di atas kotak input menampilkan subagent yang
            * sedang jalan dengan ikon server-process, dan itu tepat di sebelah
            * tempat user mengetik - bukan di sudut yang harus dicari.
            *
            * Kedua, popover kosong ("none yet") memakan ruang lebar di kepala
            * panel dan terbaca seperti kerusakan, bukan seperti keadaan yang
            * wajar. Header sekarang hanya memuat yang benar-benar dipakai.
            */}

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

      <div className="ai-chat" ref={scroller} data-testid="ai-chat" onScroll={cekPosisi}>
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

        {/* Panel TODO: MUST be outside the agent-busy condition. The task list is written
            by the agent mid-task, but once the task finishes the user still needs
            to see what was done - if the panel disappears with it,
            the TODO cannot be monitored at all. */}
        {/*
          * Jump to the newest output.
          *
          * It floats at the BOTTOM CENTRE of the transcript, not in a corner:
          * the reader's eye is already in the middle of the panel when they
          * realise they have fallen behind, and the composer below occupies the
          * full width - a corner button would sit either over the input box or
          * over the scrollbar. Centre-bottom is the one spot that is always
          * clear of both, and it is where every chat UI already puts it.
          *
          * It only exists while the bottom is out of view (`diBawah`), so a
          * reader who is caught up never sees a control that would do nothing.
          */}
        {!diBawah && (
          <div className="ai-jump-wrap">
            <button
              type="button"
              className="ai-jump-bottom"
              data-testid="ai-jump-bottom"
              title={tr('Go to the newest')}
              aria-label={tr('Go to the newest')}
              onClick={lompatKeBawah}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3v9" />
                <path d="M4.2 8.4 8 12.2l3.8-3.8" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/*
        The step-by-step tool log that used to live here is GONE on purpose.
        ChatMessage already renders every tool call of the turn as a collapsible
        .ai-toolrun card with its input, output and duration. This block showed
        the same calls a second time, in a different layout and with a different
        icon set, so a seven-call turn read as fourteen rows and the two versions
        disagreed on colours, carets and right-hand meta. One renderer, one look.
      */}

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
              {tr('risky')}
            </span>
          )}
        </div>
      )}

      {/*
        * Gelombang 3: the status stack only exists while something is actually
        * happening. Before this it always rendered four rows of zeroes ("Loop
        * idle, 0 runs", "0 Background, 0 running subagents, 0 scheduled jobs",
        * "0 Queued"), which read as broken instead of idle. Each section keeps
        * its own guard so one active row cannot drag the empty ones back.
        */}
      {/*
        * One stack, one card.
        *
        * Hermes keeps every status group - the session loop, the todo tree,
        * subagents, background processes, the queue - inside a SINGLE stack
        * (apps/desktop/src/app/chat/composer/status-stack/index.tsx pushes each
        * group into one `sections` array and renders them in one surface). The
        * stack owns the rounded top and the composer below owns the body, so
        * the two read as one card.
        *
        * Zephyr rendered the task list as its own separate card above the
        * composer (`<TodoPanel />` as a sibling), so the panel showed two
        * unrelated boxes stacked on top of each other. The task list is now a
        * section INSIDE this stack, which is what makes it fold together with
        * the loop above it.
        */}

      {(!stackKosong || todosAda) && (
      <div className="ai-work-stack" data-testid="ai-work-stack">
        {(sibuk || loopFinished) && (
        <section className="ai-work-section" data-testid="ai-work-stack-loop">
          {/*
            * Header row: trigger + action menu on ONE line.
            *
            * Hermes' `status-section.tsx` does exactly this - the header is
            * `flex items-center gap-1 pr-1`, the trigger is
            * `flex min-w-0 flex-1`, and the accessory (the ellipsis menu) is
            * `shrink-0` at the end of the same row. Without the row wrapper the
            * trigger hugged its text and the menu dropped to a line of its own,
            * so the header showed a wide empty band with a stray `⋯` floating
            * at its right edge.
            */}
          <div className="ai-work-head">
          <button
            className="ai-work-summary"
            aria-expanded={loopBuka}
            aria-controls="ai-work-loop-body"
            onClick={() => setLoopBuka((v) => !v)}
          >
            {/*
             * Chevron PINDAH ke kanan teks, dan judulnya menyatu dengan
             * jumlahnya.
             *
             * Dulu chevronnya menempel di ujung kanan baris, jauh dari teks
             * yang dibukanya - sehingga hubungan antara panah dan judulnya
             * hilang, dan baris selebar panel terbaca sebagai tiga hal
             * terpisah yang kebetulan sebaris. Pola Hermes
             * (`components/chat/disclosure-row.tsx`) menaruh caret tepat di
             * sebelah judulnya, di dalam tombol yang lebarnya mengikuti
             * teksnya: "max-w-fit so the click target hugs the title text
             * width - no background fill, just the cursor + the affordance
             * caret".
             *
             * Yang membuatnya terbaca sebagai satu kesatuan: caret duduk di
             * sebelah kanan judul, judul dan jumlahnya berbagi satu baris tanpa
             * pemisah terpisah, dan hover-nya hanya selebar teks itu.
             */}
            {/*
              * Header row shaped like Hermes', left to right:
              * caret, status icon, label, then the count.
              *
              * Hermes' StatusSection (components/chat/status-section.tsx) puts
              * the disclosure caret FIRST, then the glyph, then the label, and
              * colours the glyph by state - muted when the loop is done,
              * emerald while it runs (session-control-loop.tsx `iconClass`).
              * Zephyr had the caret on the right and a status dot on the left,
              * which reads as a different widget next to the Background and
              * Queue rows. Matching the order and the icon is what makes the
              * three rows scan as one stack.
              */}
            <span className="ai-work-caret" aria-hidden="true">
              {loopBuka ? '▾' : '▸'}
            </span>
            <span
              className={`ai-work-glyph${sibuk ? ' is-running' : ' is-done'}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9L14 6m0-4v4h-4" />
              </svg>
            </span>
            <span className="ai-work-title">
              {tr(sibuk ? 'Loop running' : 'Loop finished')}
              {loopRuns > 0 && <span className="ai-work-meta">· {tf('{n} runs', { n: loopRuns })}</span>}
            </span>
          </button>
          {/*
            * Loop actions, mirroring Hermes' ellipsis menu.
            *
            * Hermes puts pause/resume/stop on the loop section
            * (session-control-loop.tsx, `renderMenuItems`). Zephyr's loop has no
            * scheduler to pause, so the only honest action is stopping the run
            * that is in flight - and the menu is hidden entirely when nothing
            * is running, because a menu whose single item does nothing reads as
            * broken.
            */}
          {sibuk && (
            <button
              className="ai-work-menu"
              data-testid="ai-work-menu"
              title={tr('Loop actions')}
              aria-label={tr('Loop actions')}
              aria-haspopup="menu"
              aria-expanded={loopMenuBuka}
              onClick={() => setLoopMenuBuka((v) => !v)}
            >
              <span aria-hidden="true">⋯</span>
            </button>
          )}
          {sibuk && loopMenuBuka && (
            <div className="ai-work-menu-pop" role="menu" data-testid="ai-work-menu-pop">
              <button
                className="ai-work-menu-item is-danger"
                role="menuitem"
                data-testid="ai-work-stop"
                onClick={() => {
                  setLoopMenuBuka(false);
                  void cancel();
                }}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" />
                  <path d="M6 6h4v4H6z" />
                </svg>
                {tr('Stop loop')}
              </button>
            </div>
          )}
          </div>
          {loopBuka && (
            <div id="ai-work-loop-body" className="ai-work-body" role="status" data-testid={sibuk ? 'ai-agent-progress' : undefined}>
              {/*
               * Gelombang 4: bar ini menggantikan baris teks diam yang hanya
               * menuliskan 'ThinkingStep 4/120'. Ia menyala HANYA saat sibuk,
               * memutar status yang bisa dibaca manusia setiap 6 detik, dan
               * menghitung detik berjalan supaya user tahu ia masih hidup -
               * bukan macet.
               */}
              {sibuk && (
                <ThinkingBar
                  active
                  startedAt={agentLastProgressAt ?? undefined}
                  statuses={[
                    tr('Reading the files that matter'),
                    tr('Planning the next step'),
                    tr('Working through the workspace'),
                    tr('Writing the change'),
                    tr('Checking the result'),
                  ]}
                  tr={tr}
                  tf={tf}
                />
              )}
              {/*
                * The loop's own prompt, then its cadence.
                *
                * Hermes renders both rows inside the loop section
                * (session-control-loop.tsx): a `comment` row with the prompt and
                * a `clock` row with `Cadence: self-paced`. Without the prompt
                * the section only says a loop happened; the reader cannot tell
                * WHAT it was working on without scrolling up to find the
                * message that started it. Self-paced is the accurate cadence
                * here - this loop runs until the agent's task list is done, not
                * on a timer - so it is stated rather than left blank.
                */}
              {loopPrompt && (
                <div className="ai-work-prompt" data-testid="ai-work-prompt">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
                  </svg>
                  <span>{loopPrompt}</span>
                </div>
              )}
              <div className="ai-work-cadence" data-testid="ai-work-cadence">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                  <circle cx="8" cy="8" r="5.5" />
                  <path d="M8 5v3l2 1.5" />
                </svg>
                <span>{tr('Cadence')}: {tr('self-paced')}</span>
              </div>
              <div className="ai-work-detail">
                <span>{agentPhaseLabel}</span>
                {/*
                  * "Progress 2 of 120" DIGANTI, bukan diterjemahkan.
                  *
                  * Angka itu adalah batas langkah internal agen, dan bagi user
                  * tidak berarti apa-apa: "2 dari 120" membuat pekerjaan
                  * terlihat seperti baru 2% selesai padahal langkah berikutnya
                  * bisa jadi yang terakhir. Batas itu juga plafon keamanan,
                  * bukan rencana - agen yang selesai di langkah 3 dari 120
                  * sudah SELESAI, bukan 2,5% jadi.
                  *
                  * Yang berguna bagi user adalah sudah berapa langkah
                  * DIKERJAKAN. Plafonnya hanya disebut kalau sudah mendekati,
                  * karena di situ ia benar-benar jadi peringatan.
                  */}
                <span className="ai-work-step" data-testid="ai-work-step">
                  {agentStepIndex === 0
                    ? tr('Starting')
                    : agentStepIndex === 1
                      ? tr('1 step done')
                      : tf('{n} steps done', { n: agentStepIndex })}
                  {agentStepLimit > 0 && agentStepIndex >= Math.floor(agentStepLimit * 0.8)
                    ? ' · ' + tf('{left} steps left', { left: Math.max(0, agentStepLimit - agentStepIndex) })
                    : ''}
                </span>
                {sibuk && <span>{tf('{n}s', { n: progressElapsed })}</span>}
              </div>
              {agentCurrentTool && <code className="ai-work-tool">{agentCurrentTool}</code>}
              {jejakTool.length > 0 ? (
                <ul className="ai-agent ai-agent-cards">
                  {/*
                   * Hanya beberapa aksi terakhir yang ditampilkan.
                   *
                   * Dulu SEMUA langkah dirender, jadi setelah belasan tool call
                   * daftarnya mendorong isi panel keluar layar. Sisa-nya
                   * diringkas jadi satu baris 'N more actions'.
                   *
                   * Gelombang 4: tiap aksi kini satu ToolCallCard yang bisa
                   * dibuka - tertutup ia tetap satu baris ringkas, dibuka ia
                   * memperlihatkan Input/Output, exit status, cwd dan durasi.
                   * DiffViewer dipakai saat tool itu mengubah berkas, jadi
                   * perubahannya terbaca sebagai baris merah/hijau, bukan
                   * tembok JSON.
                   */}
                  {jejakToolTerlihat.map((step, i) => {
                    const info = infoAksi(step.name);
                    /*
                     * The last call in the list is the one in flight.
                     *
                     * The store appends a step only when the call RETURNS, so a
                     * finished list has nothing running - but while the agent
                     * works, `agentCurrentTool` names the call being executed
                     * right now and it is always the newest entry. Marking it
                     * running is what gives that row the moving glyph and the
                     * "Berjalan" pill; without it every row claims to be done.
                     */
                    const jalan = Boolean(
                      sibuk && i === jejakToolTerlihat.length - 1 && step.name === agentCurrentTool,
                    );
                    const kartu = kartuTool(step, tr('Selesai'), tr('Gagal'), jalan);
                    return (
                      <li className="ai-agent-card-item" key={`${step.at}-${i}`}>
                        <ToolCallCard
                          call={kartu}
                          tr={tr}
                          tf={tf}
                          defaultOpen={false}
                          className={`is-jenis-${KELAS_JENIS[info.jenis] ?? 'lain'}`}
                        />
                        {kartu.diff && <DiffViewer text={kartu.diff} tr={tr} tf={tf} />}
                      </li>
                    );
                  })}
                  {jejakTool.length > jejakToolTerlihat.length && (
                    <li className="ai-agent-step">
                      <span className="ai-agent-note">
                        {tf('{n} more actions', { n: jejakTool.length - jejakToolTerlihat.length })}
                      </span>
                    </li>
                  )}
                </ul>
              ) : null}
            </div>
          )}
        </section>
        )}

        {backgroundCount > 0 && (
        <section className="ai-work-section" data-testid="ai-work-stack-background">
          <div className="ai-work-head">
          <button
            className="ai-work-summary"
            aria-expanded={backgroundBuka}
            aria-controls="ai-work-background-body"
            onClick={() => setBackgroundBuka((v) => !v)}
          >
            <span className="ai-work-caret" aria-hidden="true">{backgroundBuka ? '▾' : '▸'}</span>
            <span className={`ai-work-glyph${subagentsAktif.length ? ' is-running' : ' is-done'}`} aria-hidden="true">
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2.5" width="12" height="5" rx="1.5" />
                <rect x="2" y="9" width="12" height="5" rx="1.5" />
              </svg>
            </span>
            <span className="ai-work-title">{tf('{n} Background', { n: backgroundCount })}</span>
            {subagentsAktif.length > 0 && (
              <span className="ai-work-meta">
                · {tf('{n} running subagents', { n: subagentsAktif.length })}
              </span>
            )}
            {jadwalAktif.length > 0 && (
              <span className="ai-work-meta">
                · {tf('{n} scheduled jobs', { n: jadwalAktif.length })}
              </span>
            )}
          </button>
          </div>
          {backgroundBuka && (
            <div id="ai-work-background-body" className="ai-work-body">
              {/*
                * Gelombang 4: one StatusArea replaces the two hand-rolled job
                * rows. It reads the REAL subagent records (name, the task it was
                * given, when it started, its live status) and the real scheduled
                * jobs, and it renders nothing at all when both are empty - the
                * section above is already gated on backgroundCount, so this can
                * never contribute an empty shell.
                */}
              <StatusArea
                subagents={{
                  active: subagentsAktif.length > 0,
                  items: subagentsAktif.map((agent) => ({
                    id: agent.id,
                    name: agent.nama,
                    description: agent.tugas,
                    durationMs: Date.now() - agent.mulai,
                    status: agent.status === 'jalan' ? ('running' as const) : ('pending' as const),
                  })),
                }}
                background={{
                  active: jadwalAktif.length > 0,
                  items: jadwalAktif.map((job) => ({
                    id: job.id,
                    /*
                     * The command the job actually runs, not a friendly alias.
                     *
                     * This used to send `every {n} minutes`, which told the user
                     * the schedule but never what would run - so a list of jobs
                     * was a list of intervals that could not be told apart. The
                     * whole point of showing a background job is knowing what is
                     * about to happen on your machine. The interval moves into
                     * the name slot, where it reads as a subtitle.
                     */
                    name: tf('every {n} minutes', { n: job.every_minutes }),
                    command: job.command,
                    status: 'pending' as const,
                  })),
                }}
                tr={tr}
                tf={tf}
              />
            </div>
          )}
        </section>
        )}

        {antrian.length > 0 && (
        <section className="ai-work-section" data-testid="ai-work-stack-queue">
          <div className="ai-cq" data-testid="ai-antrian" data-collapsed={cqLipat ? '1' : '0'}>
            {/*
             * The queue folds away.
             *
             * Hermes collapses its queue header instead of hiding the strip, and
             * the count stays visible either way: the queue is state the user
             * needs to remember they set up, but a long queue should not push
             * the composer off the screen while they read the answer. Collapsed
             * it is a single header line; expanded it is the chip rail.
             */}
            {/*
              * Queue header, drawn like the Background section above it.
              *
              * Hermes' status stack is one list of identical disclosure rows:
              * a status glyph, a bold title, a dim count, then the caret
              * (status-section.tsx + session-control-queue.tsx). Zephyr's queue
              * used a different header shape with its own icon and no status
              * dot, so the three sections read as three unrelated widgets
              * instead of one stack. Matching the row shape is what makes the
              * stack scan as a single object.
              */}
            <div className="ai-work-head">
            <button
              className="ai-work-summary"
              data-testid="ai-cq-toggle"
              aria-expanded={!cqLipat}
              aria-controls="ai-work-queue-body"
              onClick={() => setCqLipat((v) => !v)}
            >
              <span className="ai-work-caret" aria-hidden="true">
                {cqLipat ? '▸' : '▾'}
              </span>
              <span className="ai-work-glyph is-done" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" />
                </svg>
              </span>
              <span className="ai-work-title">
                {tf('{n} Queued', { n: antrian.length })}
              </span>
            </button>
            {/*
              * Clear-all, on the trailing edge of the header.
              *
              * It used to be a lone `✕` below the list, which made a row of its
              * own and left a band of empty space under the last queued message.
              * Hermes puts a section's bulk action in the header's accessory
              * slot instead (`StatusSection`'s `accessory`, used by
              * queue-panel.tsx for its Resume button), where it costs no extra
              * height and sits with the count it acts on.
              */}
            <button
              className="ai-work-menu ai-cq-clear"
              data-testid="ai-antrian-clear"
              title={tr('Clear the queue')}
              aria-label={tr('Clear the queue')}
              onClick={kosongkanAntrian}
            >
              ✕
            </button>
            </div>
            {!cqLipat && (
              <>
                {/*
                  * One row per queued message, shaped like Hermes' StatusRow.
                  *
                  * Hermes renders each queued prompt as a full-width row
                  * (`queue-panel.tsx`): the dismiss `✕` sits on the LEADING edge,
                  * then a comment glyph, then the text, and the actions
                  * (edit / send-now / reorder) sit on the trailing edge where
                  * they only appear on hover. The queue reads top-to-bottom like
                  * a list of sentences.
                  *
                  * Zephyr drew each entry as a horizontal chip in a scrolling
                  * rail. That works for two or three short entries but breaks
                  * down as soon as a message is long: the chip is a fixed-width
                  * pill, so the text is clipped mid-word and the reader has to
                  * hover to find out what they queued. A row gives the text the
                  * whole width and wraps to a second line when it needs to.
                  *
                  * The row order also matches the dismissal affordance the eye
                  * expects - `✕` first, like every other removable row in the
                  * stack - where the chip had it trailing after two reorder
                  * arrows.
                  */}
                <div className="ai-cq-list" id="ai-work-queue-body" data-testid="ai-antrian">
                  {antrian.map((a, i) => (
                    <div className="ai-cq-row" key={a.id ?? i} data-testid={`ai-antrian-${i}`}>
                      <button
                        className="ai-cq-x"
                        data-testid={`ai-antrian-hapus-${i}`}
                        title={tr('Remove from the queue')}
                        aria-label={tr('Remove from the queue')}
                        onClick={() => buangAntrian(a.id ?? i)}
                      >
                        ✕
                      </button>
                      <span className="ai-cq-glyph" aria-hidden="true">
                        <AiIkon name="comment" size={12} />
                      </span>
                      {a.images.length > 0 && (
                        <span
                          className="ai-cq-images"
                          data-testid={`ai-antrian-images-${i}`}
                          title={tf('{n} image attachments', { n: a.images.length })}
                          aria-label={tf('{n} image attachments', { n: a.images.length })}
                        >
                          <AiIkon name="image" size={11} /> {a.images.length}
                        </span>
                      )}
                      {cqEdit === (a.id ?? String(i)) ? (
                        /*
                         * Inline edit of one queued message.
                         *
                         * The field replaces the row's text rather than opening
                         * a dialog: the queue is a list of short lines, and the
                         * cheapest way to fix one is to type over it where it
                         * sits. Enter or blur commits, Escape cancels, and a
                         * blank commit keeps the original so the message cannot
                         * be erased by clearing the box.
                         */
                        <input
                          className="ai-cq-edit"
                          data-testid={`ai-antrian-edit-${i}`}
                          autoFocus
                          value={cqDraft}
                          aria-label={tr('Edit the queued message')}
                          onChange={(e) => setCqDraft(e.target.value)}
                          onKeyDown={(e) => {
                            /*
                             * The composer listens for Enter on its textarea to
                             * send; this field is not that textarea, so the key
                             * has to be kept from bubbling up to it or editing a
                             * queued message would fire a whole new send.
                             */
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              ubahAntrian(a.id ?? i, cqDraft);
                              setCqEdit(null);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setCqEdit(null);
                            }
                          }}
                          onBlur={() => {
                            ubahAntrian(a.id ?? i, cqDraft);
                            setCqEdit(null);
                          }}
                        />
                      ) : (
                        <span
                          className="ai-cq-t"
                          data-testid={`ai-antrian-teks-${i}`}
                          title={a.teks}
                          role="button"
                          tabIndex={0}
                          aria-label={tr('Edit the queued message')}
                          onClick={() => {
                            setCqEdit(a.id ?? String(i));
                            setCqDraft(a.teks);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter' && e.key !== ' ') return;
                            e.preventDefault();
                            setCqEdit(a.id ?? String(i));
                            setCqDraft(a.teks);
                          }}
                        >
                          {a.teks}
                        </span>
                      )}
                      {/*
                        * Row actions, revealed on hover - the same rule Hermes
                        * uses for its `trailing` slot (`status-row.tsx`:
                        * `opacity-0 group-hover/status-row:opacity-100`). Two
                        * reorder arrows and a send arrow on every row would
                        * out-shout the message text; hidden until the row is
                        * hovered, they are there when wanted and invisible when
                        * reading. Reordering is still one step at a time,
                        * because the queue is read as a numbered list.
                        */}
                      <span className="ai-cq-aksi">
                        {!sibuk && (
                          <button
                            className="ai-cq-send"
                            data-testid={`ai-antrian-kirim-${i}`}
                            title={tr('Send this now')}
                            aria-label={tr('Send this now')}
                            onClick={() => void kirimAntrian(i)}
                          >
                            <AiIkon name="send" size={11} />
                          </button>
                        )}
                        <button
                          className="ai-cq-move"
                          data-testid={`ai-antrian-naik-${i}`}
                          title={tr('Move up in the queue')}
                          aria-label={tr('Move up in the queue')}
                          disabled={i === 0}
                          onClick={() => naikkanAntrian(a.id ?? i)}
                        >
                          <AiIkon name="chev-up" size={11} />
                        </button>
                        <button
                          className="ai-cq-move"
                          data-testid={`ai-antrian-turun-${i}`}
                          title={tr('Move down in the queue')}
                          aria-label={tr('Move down in the queue')}
                          disabled={i === antrian.length - 1}
                          onClick={() => turunkanAntrian(a.id ?? i)}
                        >
                          <AiIkon name="chev-down" size={11} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
        )}

        {/*
          * The task list rides inside the same stack.
          *
          * Hermes renders its todo tree as one of the stack's own sections
          * (`groupStatusItems` emits a `todo` group and the stack renders it
          * with the same StatusSection chrome as the rest), which is why the
          * plan and the loop read as one object. Keeping it here - rather than
          * as a sibling card - is what makes the todo collapse and expand in
          * the same box as everything else.
          */}
        <TodoPanel />
      </div>
      )}

      {/*
        * The job strips sit between the work stack and the composer: a loop
        * that is running and a goal that is set are both facts about the
        * session, and they stay visible while the conversation scrolls.
        */}
      <GoalStrip />
      <LoopStrip />

      <div className="ai-input-row">
        {/*
          * The branch chip, inside the composer box and above the field.
          *
          * Hermes renders a `main` chip as the first row of its composer
          * (`composer/scope.tsx`), separated from the field by a hairline: the
          * branch is part of the message's context, so it belongs where the
          * message is written, not only in the status bar at the window edge.
          * Hidden entirely outside a repo, and hidden while there is no branch
          * to name, so it never draws an empty pill.
          */}
        {gitBranch && (
          <div className="ai-branch-chip" data-testid="ai-branch-chip" title={tf('On branch {name}', { name: gitBranch })}>
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="4.6" cy="3.4" r="1.7" />
              <circle cx="4.6" cy="12.6" r="1.7" />
              <circle cx="11.4" cy="6.4" r="1.7" />
              <path d="M4.6 5.1v5.8M11.4 8.1c0 2.2-1.8 3.2-3.6 3.4" />
            </svg>
            <span>{gitBranch}</span>
          </div>
        )}
        {draftImages.length > 0 && (
          <div className="ai-imgstrip" data-testid="ai-imgstrip">
            {draftImages.map((src, i) => (
              <div className="ai-imgpreview" key={i} data-testid="ai-imgpreview">
                <img src={src} alt={tf('Image attachment {n}', { n: i + 1 })} />
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
            T4.4: ">" (or "#") shows SNIPPETS - the text that gets inserted, not
            a new question. The trigger is marked on the first line of the list so the
            user knows which one is currently active, and the row prints the
            symbol actually typed. */}
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
                  {modeSnippet ? `${pemicuSnippet}${p.cmd}` : `/${p.cmd}`}
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

            // Prompt History Navigation
            const st = useAi.getState();
            const inHistory = st.promptHistoryIdx >= 0 && draft === st.promptHistory[st.promptHistoryIdx];
            if (!e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && saran.length === 0 && saranFile.length === 0) {
              if (draft === '' || inHistory) {
                e.preventDefault();
                const nextDraft = e.key === 'ArrowUp' ? historyUp() : historyDown();
                if (nextDraft !== null) setDraft(nextDraft);
                else setDraft(''); // if we go down past 0, clear it
                return;
              }
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
              /*
               * While a run is in flight, Ctrl+Enter cuts it short and sends
               * this now; a plain Enter lines the message up behind it. Idle,
               * both do the same thing, because there is nothing to interrupt
               * and the queue only exists to wait for a run.
               */
              if (sibuk && (e.ctrlKey || e.metaKey)) {
                void kirimSekarang(draft, draftImages);
              } else {
                void send();
              }
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
          {bisaDengar && voiceAktif && micAktif && (
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

          <div className="ai-send-wrap">
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

            {/*
              * The caret only exists while a run is in flight.
              *
              * With nothing running, Enter and the button do the same thing
              * and a menu with one meaningful row would be noise. While a run
              * is in flight the real question is "do I want this to replace
              * that answer, or follow it?" — and that is a choice worth a
              * second click.
              */}
            {sibuk && (
              <button
                className="ai-send-caret"
                data-testid="ai-send-menu"
                aria-haspopup="menu"
                aria-expanded={bukaSendMenu}
                title={tr('Send options')}
                aria-label={tr('Send options')}
                onClick={() => setBukaSendMenu((v) => !v)}
              >
                <AiIkon name="chev-down" size={11} />
              </button>
            )}

            {sibuk && bukaSendMenu && (
              <>
                <div className="ai-plus-backdrop" onClick={() => setBukaSendMenu(false)} />
                <div className="ai-send-menu" data-testid="ai-send-menu-list" role="menu">
                  <button
                    className="ai-send-item"
                    data-testid="ai-send-now"
                    role="menuitem"
                    onClick={() => {
                      setBukaSendMenu(false);
                      void kirimSekarang(draft, draftImages);
                    }}
                  >
                    <AiIkon name="stop" size={13} />
                    <span className="ai-send-item-text">
                      <span className="ai-send-item-label">{tr('Send now (interrupt)')}</span>
                      <span className="ai-send-item-hint">{tr('Stop the current run, then send this')}</span>
                    </span>
                  </button>

                  <button
                    className="ai-send-item"
                    data-testid="ai-send-queue"
                    role="menuitem"
                    onClick={() => {
                      setBukaSendMenu(false);
                      void send();
                    }}
                  >
                    <AiIkon name="queue" size={13} />
                    <span className="ai-send-item-text">
                      <span className="ai-send-item-label">{tr('Add to queue')}</span>
                      <span className="ai-send-item-hint">{tr('Run after the current run finishes')}</span>
                    </span>
                    <kbd className="ai-send-item-kbd">Ctrl+Enter</kbd>
                  </button>

                  <button
                    className="ai-send-item"
                    data-testid="ai-send-plain"
                    role="menuitem"
                    onClick={() => {
                      setBukaSendMenu(false);
                      void cancel();
                    }}
                  >
                    <AiIkon name="x" size={13} />
                    <span className="ai-send-item-text">
                      <span className="ai-send-item-label">{tr('Just stop')}</span>
                      <span className="ai-send-item-hint">{tr('Stop the current run and keep this typed')}</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/*
       * Queued messages are NOT rendered under the transcript.
       *
       * A strip above the composer read as part of the chat: it pushed the
       * transcript up, it looked like a second message list, and it duplicated
       * what the composer already says. The queue now lives ABOVE the composer
       * as a compact row of chips inside the input area, which is where the
       * messages were typed and where the user looks when adding another.
       */}

      {/*
        * Pertanyaan dari agen (tool ask_user).

        * Agen BERHENTI dan menunggu di sini: langkahnya benar-benar tertahan
        * sampai user menjawab atau membatalkan. Karena itu tombolnya harus
        * selalu ada - kalau kartunya gagal dirender, langkah agen menggantung
        * selamanya tanpa apa pun yang bisa user lakukan.
        *
        * Pilihan cepat HANYA muncul kalau model mengirim daftarnya. Pertanyaan
        * bebas tetap bisa dijawab lewat kotak ketik di bawah.
        */}
      {agentTanya && (
        <div className="ai-tanya" role="alertdialog" data-testid="ai-agent-tanya">
          <p className="ai-tanya-label">{tr('The agent needs your answer')}</p>
          <p className="ai-tanya-isi">{agentTanya.pertanyaan}</p>
          {agentTanya.pilihan.length > 0 && (
            <div className="ai-tanya-pilihan">
              {agentTanya.pilihan.map((p, i) => (
                <button
                  key={i}
                  className="btn btn-sm"
                  data-testid={`ai-tanya-pilih-${i}`}
                  onClick={() => jawabTanya(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="ai-tanya-isi-jawab">
            <input
              className="input input-sm"
              data-testid="ai-tanya-jawab"
              value={jawabanTanya}
              placeholder={tr('Type your answer...')}
              onChange={(e) => setJawabanTanya(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && jawabanTanya.trim()) {
                  e.preventDefault();
                  jawabTanya(jawabanTanya.trim());
                }
              }}
            />
            <button
              className="btn btn-sm btn-primary"
              data-testid="ai-tanya-kirim"
              disabled={!jawabanTanya.trim()}
              onClick={() => jawabTanya(jawabanTanya.trim())}
            >
              {tr('Send')}
            </button>
            {/* Batal mengirim null, dan tool-nya membedakan itu dari jawaban
                kosong: agen tidak boleh menganggap "dibatalkan" sama dengan
                "terserah kamu". */}
            <button
              className="btn btn-sm"
              data-testid="ai-tanya-batal"
              onClick={() => jawabTanya(null)}
            >
              {tr('Cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Agent tool approval: ask mode / dangerous command. */}
      {agentConfirm && (
        <div className="ai-confirm" role="alertdialog" data-testid="ai-agent-confirm">
          <p className="ai-confirm-title">
            {agentConfirm.isDestructive
              ? tr('This command is potentially destructive - allow the agent?')
              : agentConfirm.isWrite
                ? tf('The agent wants to write to disk with {tool}:', { tool: agentConfirm.tool })
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

      {/* Renders nothing. It owns the speech engine's lifetime, so the engine
          exists exactly while this panel does - unmounting stops any answer that
          is still being read aloud, which is what closing the thing that was
          talking should do. */}
      <BicaraHost />
    </div>
  );
}
