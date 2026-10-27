import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAi,
  extractCommand,
  isDestructive,
  IMAGE_MAX_BYTES,
  type AntrianPesan,
  type AgentSurfaceState,
} from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { bukaPanel } from '../../lib/bukaPanel';
import { useSessionsSide } from '../../lib/sessionsSideStore';
import {
  matchPrompts,
  expandPrompt,
  matchSnippets,
  adaPemicuPrompt,
  expandSnippet,
  snippetTrigger,
  jenisPrompt,
  LABEL_PROMPT,
  URUTAN_PROMPT,
  type JenisPrompt,
  type PromptItem,
} from '../../lib/promptLibrary';
import {
  tokenAt,
  tulisRef,
  uraiToken,
  saringRef,
  ratakan,
  muatRef,
  refTerakhir,
  catatRefTerakhir,
  LABEL_JENIS,
  type RefItem,
  type SaringanJenis,
} from '../../lib/contextRefs';
import FileIkon from './FileIkon';
import CmdIkon from './CmdIkon';
import AskUserCard from './AskUserCard';
import { activeSelection } from '../../lib/editorRegistry';
import ChatMessage from './ChatMessage';
import PerubahanBerkas from './PerubahanBerkas';
import UbahReview from './UbahReview';
import { DayDivider } from './ChatStamp';
import type { ChatMsg } from '../../lib/types';
import { LoopStrip, GoalStrip } from './JobStrips';
import ModelSelector from './ModelSelector';
import BrowserContextChip from './BrowserContextChip';
import { ModeMenu, PermissionMenu } from './ModeMenu';
import { clipboardReadImage } from '../../lib/clipboard';
import { fileDialogOpen, folderDialogOpen, fsRead, scanDir, simpanGambarTemp } from '../../lib/commands';
import { useT, useTf } from '../../lib/i18n';
import { useDragPopup } from '../../lib/useDragPopup';
import AiIkon from './AiIkon';
import ZephyrLogo from '../shell/ZephyrLogo';
import { useSched, useSchedBuka } from '../../lib/schedStore';
import { useSubAgent } from '../../lib/subagentStore';
import { useGit } from '../../lib/gitStore';
import { runCommand } from '../../lib/commandRegistry';
/* `SubAgentInfo` tidak diimpor lagi: popover subagent di kepala panel sudah
   dibuang, dan isinya kini tampil di tumpukan status atas kotak input. Berkas
   komponennya sengaja TIDAK dihapus - ia masih dipakai di tempat lain. */
import ThinkingBar from './ThinkingBar';
import StatusArea from './StatusArea';


/*
 * A frozen empty list, so the message-list selector can return a STABLE
 * reference when there is no active session.
 *
 * Same reason as MSG_KOSONG in ContextMeter.tsx: zustand v5 compares the
 * selector's output with `===`, so `?? []` inside the selector allocates a new
 * array on every store write and reads as "changed" forever. The empty session
 * state (cleared chat, first run before init()) is exactly when that fires.
 */
const PESAN_KOSONG: ChatMsg[] = [];

/*
 * The "files changed" card for ONE turn, drawn after that turn's message.
 *
 * It used to be appended to the END of the transcript and fed from the live
 * session diff, so it followed the chat forever and always described the newest
 * run - scrolling back showed a single card that looked like every turn's work,
 * while older turns showed none.
 *
 * Now it is built once, when the run ends, and stored on the message
 * (`ChatMsg.perubahan`). Being part of the list is what makes it behave like a
 * message: it stays where it was inserted and scrolls away as the conversation
 * continues, which is what the reference does. No live store is read here, so a
 * later run can never rewrite an older card.
 */
function kartuPesan(m: ChatMsg, permukaan: 'main' | 'agents'): React.ReactNode {
  if (!m.perubahan || m.perubahan.length === 0) return null;
  return (
    <PerubahanBerkas key={`ubah-${m.id}`} daftar={m.perubahan} permukaan={permukaan} />
  );
}

/*
 * Same trick for the per-surface queue: a stable empty array, so the selector's
 * output does not change identity on every store write. A panel that has never
 * queued anything reads this on every render.
 */
const ANTRIAN_KOSONG: AntrianPesan[] = [];

/*
 * A surface with no run at all. A frozen constant, not an object literal inside
 * the selector: zustand compares with === and would re-render on every write.
 */
const AGENT_KOSONG: AgentSurfaceState = {
  steps: [],
  phase: 'idle',
  currentTool: null,
  stepIndex: 0,
  stepLimit: 0,
  lastProgressAt: null,
  startedAt: null,
  navigationOnly: false,
  tanya: null,
  confirm: null,
  todos: [],
};

/*
 * The transcript, and ONLY the transcript.
 *
 * WHY this is its own component: `onChunk` (aiStore) rewrites `sessions` on
 * every streamed token, so any component subscribed to `s.sessions` re-renders
 * per token. When that component was the whole AiPanel (2453 lines, 49
 * selectors), every single token re-rendered the entire panel - composer, model
 * menu, tool strip, todo cards - before React ever reached the memoised
 * ChatMessage children. On a long agent run that is the reported "freeze /
 * answer never appears": the main thread spends the whole stream re-rendering
 * the panel instead of painting tokens.
 *
 * Isolating the subscription here keeps the cost proportional to the
 * transcript. Everything else in AiPanel only re-renders when its own slice of
 * state changes.
 *
 * It also owns AUTO-SCROLL. The scroll must follow every token, so the
 * component that already re-renders per token is the natural place to drive it;
 * putting the tail-length subscription on AiPanelInner instead would make the
 * whole panel reconcile every frame - the exact cost this split removes. The
 * parent passes a getter for the scroll element so the refs stay where they
 * belong.
 */
const PesanList = memo(function PesanList({
  composerId,
  ambilScroller,
}: {
  composerId: string;
  ambilScroller: () => HTMLDivElement | null;
}) {
  /*
   * THIS surface's transcript.
   *
   * It used to read `s.activeSession()`, which resolves the store's PRIMARY
   * `activeId` — the right column's chat. So both panels drew the column's
   * messages while their headers showed their own titles: the editor tab said
   * "PESAN_EDITOR_ENTER" at the top and listed the column's conversation
   * underneath, which is exactly the "editor still shows the right side's chat"
   * report. Resolved through `activeIds[composerId]`, the same key the header,
   * the composer and the send path already use.
   */
  const showDividers = useAi((s) => s.showDividers);
  /* Where a click on the card's arrow should open the diff - see `PerubahanBerkas`. */
  const permukaan: 'main' | 'agents' = composerId === 'agents' ? 'agents' : 'main';
  const msgs = useAi((s) => {
    const id = s.activeIds[composerId] ?? null;
    return (id ? s.sessions.find((x) => x.id === id)?.messages : null) ?? PESAN_KOSONG;
  });

  /*
   * Keep the newest output in view while the agent works.
   *
   * "Lengket ke bawah" (stick-to-bottom), bukan "cek jarak < 120px tiap render".
   * Ambang kecil itu bugnya: satu langkah agent sering menambah tinggi JAUH
   * lebih dari 120px sekaligus (diff berkas, hasil tool, blok kode), jadi tepat
   * setelah DOM tumbuh `scrollHeight - scrollTop - clientHeight` langsung > 120,
   * `nearBottom` jadi false, dan auto-scroll BERHENTI mengikuti - user harus
   * gulir manual terus seperti yang dilaporkan. Yang benar: ingat niat user
   * dalam sebuah ref. Selama `lengket` true, selalu susul ke dasar apa pun
   * seberapa besar lompatannya. Hanya gulir-ke-ATAS oleh user yang melepas
   * `lengket`; begitu ia kembali ke dasar, `lengket` menyala lagi.
   */
  const lengket = useRef(true);
  const scrollTerakhir = useRef(0);
  useEffect(() => {
    const el = ambilScroller();
    if (!el) return;
    const onScroll = () => {
      const sisa = el.scrollHeight - el.scrollTop - el.clientHeight;
      const naik = el.scrollTop < scrollTerakhir.current - 2;
      scrollTerakhir.current = el.scrollTop;
      /* Gulir ke atas = user mau membaca sesuatu, lepas kelengketan. Kembali ke
         dekat dasar (ambang longgar 160px) = sambung lagi. Lompatan DOM saat
         streaming bukan gulir user, jadi tidak pernah memicu `naik`. */
      if (naik && sisa > 160) lengket.current = false;
      else if (sisa < 160) lengket.current = true;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ambilScroller]);

  useEffect(() => {
    const el = ambilScroller();
    if (!el) return;
    if (lengket.current) el.scrollTop = el.scrollHeight;
  });

  /*
   * A day divider wherever the calendar day changes between two messages.
   *
   * Computed here, as a plain loop, rather than by giving every message a
   * `showDate` prop: the decision depends on the PREVIOUS message, and a
   * per-message boolean would have to be recomputed and threaded through the
   * whole tree on every appended token. One pass over the list is cheaper and
   * keeps `ChatMessage` unaware that days exist.
   *
   * The first message always gets one — a transcript that opens with a bare
   * question gives the reader no idea when it was asked.
   */
  const baris: React.ReactNode[] = [];
  let hariSebelumnya: number | null = null;
  /* From Chat Settings. Turning it off must actually remove the dividers. */
  if (!showDividers) {
    for (const m of msgs) {
      baris.push(<ChatMessage key={m.id} msg={m} permukaan={permukaan} />);
      const kartuTurn = kartuPesan(m, permukaan);
      if (kartuTurn) baris.push(kartuTurn);
    }
    return <>{baris}</>;
  }
  for (const m of msgs) {
    const t = new Date(m.at);
    /*
     * A message with an unusable `at` must NOT draw a divider.
     *
     * `new Date(undefined)` is Invalid Date, and `NaN !== NaN` is true — so
     * without this guard the FIRST malformed message made every subsequent
     * comparison unequal and a divider landed before EVERY message, the thing
     * that made the transcript look like it had swallowed 50px of dead air
     * between each pair of bubbles.
     */
    const hari = Number.isNaN(t.getTime()) ? null : t.setHours(0, 0, 0, 0);
    if (hari !== null && hari !== hariSebelumnya) {
      baris.push(<DayDivider key={`d-${m.id}`} at={m.at} />);
      hariSebelumnya = hari;
    }
    baris.push(<ChatMessage key={m.id} msg={m} permukaan={permukaan} />);
    const kartuTurn = kartuPesan(m, permukaan);
    if (kartuTurn) baris.push(kartuTurn);
  }
  return <>{baris}</>;
});

function AiPanelInner({ composerId = '' }: { composerId?: string }) {
  /* Chip Computer Use (Agent Customizations > Computer Use > showButton). */
  const cuSet = useStore((s) => s.settings.computerUse);
  const applySet = useStore((s) => s.applySettings);
  const tr = useT();
  const tf = useTf();
  /*
   * The active session is read as a primitive id, not as the session object.
   *
   * `s.sessions.find(...)` would hand back a fresh object on every token (the
   * immutable update rebuilds it), which reintroduces the per-token re-render
   * this component is being fixed for. `activeId` is a string, so it only
   * changes when the user actually switches chats - and the few derived values
   * that need a session read it lazily from the store inside `useMemo`.
   */
  /*
   * This SURFACE's active chat. Each mounted panel keeps its own, so the editor
   * tab and the right column can show two different conversations at once.
   */
  const activeId = useAi((s) => s.activeIds[composerId] ?? null);
  /*
   * This SURFACE's run state. The three flat values are the primary surface's
   * mirror; each panel reads its own record so a run started in the editor does
   * not put the column's Send button into Stop or fill the column's queue.
   */
  const pending = useAi((s) => s.pendings[composerId] ?? null);
  /*
   * The draft is this MOUNT's own, read through `drafts[composerId]`.
   *
   * A selector returning `s.drafts[composerId] ?? ''` keeps the primitive
   * comparison zustand needs, so the panel still only re-renders when its own
   * composer changes — a write to the OTHER surface's draft leaves this one
   * alone, which is the whole point.
   */
  const draft = useAi((s) => s.drafts[composerId] ?? '');
  const draftImages = useAi((s) => s.draftImages);
  const toast = useAi((s) => s.toast);
  const confirmCmd = useAi((s) => s.confirmCmd);
  /* The "Thinking … 12s" strip. OFF by default; see aiStore. */
  const showThinkingBar = useAi((s) => s.showThinkingBar);

  /*
   * Bound to THIS instance's composer id, so every `setDraft` call below writes
   * to this surface's own draft. The store's `setDraft(value, id)` is what
   * actually keys it; rebinding here keeps the ~20 call sites in this file
   * unchanged, which matters because they sit in callbacks (file insert,
   * dictation, the history walk, the slash menu) that have no reason to know
   * there is more than one surface.
   */
  const setDraftStore = useAi((s) => s.setDraft);
  const setDraft = useCallback((v: string) => setDraftStore(v, composerId), [setDraftStore, composerId]);
  const compactContext = useAi((s) => s.compactContext);
  const addDraftImage = useAi((s) => s.addDraftImage);
  const removeDraftImage = useAi((s) => s.removeDraftImage);
  const setToast = useAi((s) => s.setToast);
  const setConfirmCmd = useAi((s) => s.setConfirmCmd);
  const antrian = useAi((s) => s.antrians[composerId] ?? ANTRIAN_KOSONG);
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
  const todosAda = (useAi((s) => s.agentStates[composerId]?.todos.length) ?? 0) > 0;
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
  const lanjutkanAgent = useAi((s) => s.lanjutkanAgent);
  /* A checkpoint belongs to one conversation; the surface showing that
     conversation is the one that should offer Resume. */
  const adaCheckpoint = useAi((s) => s.agentResumes[composerId] != null);
  const kirimSekarang = useAi((s) => s.kirimSekarang);

  /*
   * Sends the draft TOGETHER with the chips above it.
   *
   * The chips are not part of the text any more, so they are folded back in
   * here, one `@ref` per token on their own line ahead of what was typed -
   * which is the same string the composer used to hold before a pick became a
   * chip. Clearing them before the call means a send always starts a clean
   * composer, even when the store refuses the message.
   */
  const kirimPesan = () => {
    const daftar = draftRefs.map((r) => tulisRef(r.sisip)).join(' ');
    const isi = [daftar, draft].filter((s) => s.trim()).join('\n');
    setDraftRefs([]);
    return kirimSekarang(isi, draftImages, composerId);
  };
  const historyUp = useAi((s) => s.historyUp);
  const historyDown = useAi((s) => s.historyDown);
  const exportChat = useAi((s) => s.exportChat);
  const newChat = useAi((s) => s.newChat);
  const selectChat = useAi((s) => s.selectChat);
  const deleteChat = useAi((s) => s.deleteChat);
  const forkChat = useAi((s) => s.forkChat);
  const setClearAllOpen = useAi((s) => s.setClearAllOpen);
  const runInTerminal = useAi((s) => s.runInTerminal);
  const agentBusy = useAi((s) => s.agentBusys[composerId] ?? false);
  /*
   * THIS surface's run, read from its own record.
   *
   * These were flat selectors reading the primary surface's run, so a run
   * started in the editor tab drew its step trail, its phase label and its tool
   * name in the right column as well — and an approval prompt appeared on both
   * panels at once. `agentStates[composerId]` is written by the loop through the
   * same mirror that handles `agentBusy`, so the two always agree.
   *
   * The record is a frozen constant when absent, not an object literal: zustand
   * compares selector output with `===`, and allocating here would re-render the
   * panel on every store write.
   */
  const kosong = useAi((s) => s.agentStates[composerId]) ?? AGENT_KOSONG;
  const agentPhase = kosong.phase;
  const agentCurrentTool = kosong.currentTool;
  const agentStepIndex = kosong.stepIndex;
  const agentStepLimit = kosong.stepLimit;
  const agentLastProgressAt = kosong.lastProgressAt;
  const agentStartedAt = kosong.startedAt;
  const agentConfirm = kosong.confirm;
  /* Dispatch is the agent, always - chat was retired, so this panel no longer
     switches on the mode; it only reads the run's own record (above). */
  const agentPutuskan = useAi((s) => s.agentPutuskan);
  /* Pertanyaan dari agen (tool ask_user): agen menahan langkahnya sampai user
     menjawab, jadi kartunya tidak boleh ikut disembunyikan saat panel sibuk. */
  const agentTanya = kosong.tanya;
  const jawabTanya = useAi((s) => s.jawabTanya);

  /*
   * Kartu ask_user muncul DI DALAM area gulir (bukan lagi menempel di atas
   * kotak ketik), jadi ia harus ditarik masuk ke pandangan saat muncul - kalau
   * tidak, user yang sedang membaca bagian atas tidak sadar ada pertanyaan
   * yang menunggu di dasar transkrip.
   */
  useEffect(() => {
    if (!agentTanya) return;
    const t = window.setTimeout(() => {
      document
        .querySelector('[data-testid="ai-agent-tanya"]')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [agentTanya]);

  const sibuk = pending || agentBusy;
  const [progressNow, setProgressNow] = useState(() => Date.now());
  const [loopBuka, setLoopBuka] = useState(false);
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
  /*
   * The HydraFusion stage running right now, if any.
   *
   * Read from the store rather than passed down: the runner reports it from
   * inside the send path, which has no access to this component's props - and
   * a prop would have to be threaded through every render between them.
   */
  const hydraTahap = useAi((s) => s.hydraTahap);
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
  /*
   * Gelombang 3: the status stack used to render even when every counter was
   * zero. `stackKosong` lets the whole block leave the DOM instead of drawing
   * four rows that only say "nothing is happening".
   *
   * The loop row is excluded on purpose after a run ends. It used to linger as
   * "Loop finished · 1 runs" above the composer, occupying a full row to say
   * that something had stopped - the reader can see that from the transcript
   * itself, and the finished bar pushed the composer down for no information.
   * The row (and its step detail) now exists only while the loop is running,
   * which is when the progress it shows is still news.
   */
  const stackKosong = !sibuk && backgroundCount === 0 && antrian.length === 0;

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
  // Elapsed wall time since the run started, plus a rough ETA from the mean
  // step cost so far. Uses completed steps only: dividing by the in-flight
  // step would drag the average toward zero at the start of every step.
  const runElapsedSec = sibuk && agentStartedAt ? Math.max(0, Math.floor((progressNow - agentStartedAt) / 1000)) : 0;
  const doneSteps = Math.max(0, agentStepIndex - 1);
  const avgStepSec = sibuk && agentStartedAt && doneSteps > 0
    ? Math.max(1, Math.round((progressNow - agentStartedAt) / 1000 / doneSteps))
    : 0;
  const etaSec = avgStepSec > 0 ? avgStepSec * Math.max(0, agentStepLimit - agentStepIndex) : 0;
  const fmtDur = (detik: number) => detik >= 3600
    ? `${Math.floor(detik / 3600)}:${String(Math.floor(detik % 3600 / 60)).padStart(2, '0')}:${String(detik % 60).padStart(2, '0')}`
    : `${Math.floor(detik / 60)}:${String(detik % 60).padStart(2, '0')}`;

  const provider = useAi((s) => s.provider);
  const keys = useAi((s) => s.keys);
  /*
   * `disk` = slot yang isinya ada di `secrets.json` (dibaca saat picker/panel
   * dibuka). Dibaca di sini supaya banner "Add an API key" IKUT berubah begitu
   * key ditemukan di disk, tanpa menunggu komponen lain memuat ulang.
   */
  const keyDiDisk = useAi((s) => s.disk);
  /*
 * "Add a key" opens the AI MODELS POP-UP, where the provider cards keep the
 * key.
 *
 * This banner is the place a user lands when a request failed with 401, so it
 * has to end in the field that fixes it. That field is the provider card in the
 * pop-up; sending the reader to a Settings page (first the editor-area one, then
 * Chat Settings -> Models) meant crossing the whole window to arrive somewhere
 * that no longer owned the row.
 */
const bukaModels = () => bukaPanel('models');
  /*
   * A missing key must be proven by the key list, not assumed from the snapshot.
   *
   * `keys` is refreshed on open/Refresh; between those moments it can be a stale
   * snapshot that says "no key" for a provider the reader has configured (a
   * decrypt failure is enough). `hasKey` also accepts a stored endpoint for
   * `custom*` gateways, so it is the honest answer here - otherwise the banner
   * reappears after every Refresh for a provider that works.
   */
  const providerTanpaKey = keys.length > 0 && !useAi.getState().hasKey(provider) && !keyDiDisk.has(provider);

  /*
   * Whether the reader has put the "no key" banner away, for THIS provider.
   *
   * The banner is a reminder, not a wall: it covers the top of the transcript
   * and stays there until a key appears, so a reader who has read it once and
   * means to add the key later had no way back to the conversation. Dismissing
   * hides it; switching provider clears the flag, because the next provider's
   * missing key is new information and deserves the reminder again.
   */
  const [nokeyDismissed, setNokeyDismissed] = useState(false);
  useEffect(() => {
    setNokeyDismissed(false);
  }, [provider]);

  /*
   * Baca ulang `secrets.json` setiap provider berganti.
   *
   * Banner ini satu-satunya tempat yang menyatakan "belum ada key", dan salinan
   * `keys` milik jendela ini bisa ketinggalan (key diketik di jendela lain).
   * Membaca disk di titik ini membuat pertanyaannya dijawab berkas yang
   * sebenarnya, bukan salinan lama.
   */
  useEffect(() => {
    void useAi.getState().segarkanDisk();
  }, [provider]);

  /*
   * What actually reaches the screen.
   *
   * `custom` is the "bring your own endpoint" slot: a local server or an
   * auth-free proxy answers without a key, so a missing key there is not an
   * error worth a warning over the transcript. The original `providerTanpaKey`
   * keeps its meaning ("no key on file"); this only narrows what is drawn.
   */
  const nokeyTampil = providerTanpaKey && provider !== 'custom' && !nokeyDismissed;

  /* The bottom-dock AI home is retired: every remaining home (the right column,
     the editor-area tab, the pop-out window) is a vertical panel, so the header
     always takes its column shape. */
  const aiMax = useStore((s) => s.aiMax);
  /* Maximize/Restore moved to the shared AiHost tab strip, so AiPanel no longer
     reads `aiMax` itself — the strip owns the toggle for all three tabs. */

  /*
   * `aiSempit`: the compact narrow reflow is now DISABLED everywhere.
   *
   * The user wants one layout — the roomy bottom-dock composer and header — in
   * every home: bottom, right column, editor-area tab, and the pop-out window.
   * The old `is-kanan` reflow squashed the header (wrapping rows, icon-only
   * buttons) and the composer whenever the chat was not at the bottom, so the
   * right column and the editor tab looked different from the dock. Keeping this
   * `false` means `.ai-panel` never gets `is-kanan`, so all four modes share the
   * single bottom-dock layout.
   */
  const aiSempit = false;

  /*
   * The sessions column, shown beside the expanded chat.
   *
   * The panel only carries the TOGGLE; App renders the column itself when
   * `aiMax` is on. Reading the flag here is what lets the button show its
   * pressed state and lets the reader reopen a column they closed.
   */
  const sesiSisiBuka = useSessionsSide((s) => s.buka);
  const setSesiSisiBuka = useSessionsSide((s) => s.setBuka);

  /*
   * How many messages the active chat holds.
   *
   * A PRIMITIVE selector, not the array: zustand v5 compares with `===`, so a
   * number only re-renders the panel when the count actually changes - which is
   * exactly when the empty-state must flip. Deriving this from the `activeId`
   * memo instead would leave it stale after the FIRST message of an
   * already-open empty chat (activeId does not change on send), so the
   * empty-state would keep covering the answer.
   */
  const jumlahPesan = useAi((s) => s.sessions.find((x) => x.id === (s.activeIds[composerId] ?? null))?.messages.length ?? 0);

  /*
   * Derived values that only decide WHICH action a button offers. Each is a
   * PRIMITIVE (string / number), so zustand v5's `===` comparison re-renders
   * the panel only when the value actually changes - not on every streamed
   * token. Reading them from the array identity instead would reintroduce the
   * per-token re-render, and memoising on `activeId` alone would leave them
   * stale (a message does not change `activeId`).
   */
  const judulSesi = useAi(
    (s) => s.sessions.find((x) => x.id === (s.activeIds[composerId] ?? null))?.title ?? '',
  );
  /* The last user message's text, for the loop strip. */
  const loopPrompt = useAi((s) => {
    const m = s.sessions.find((x) => x.id === (s.activeIds[composerId] ?? null))?.messages;
    if (!m) return '';
    for (let i = m.length - 1; i >= 0; i -= 1) {
      if (m[i].role === 'user') return (m[i].content ?? '').trim();
    }
    return '';
  });
  /*
   * The command from the newest assistant answer, for the "Run in Terminal"
   * bar. Extracted inside the selector so the panel subscribes to a STRING:
   * the derived command is stable while the answer streams (it only changes
   * when a fenced bash block is complete), so this does not re-render per
   * token the way subscribing to the message object would.
   */
  const lastCommand = useAi((s) => {
    const m = s.sessions.find((x) => x.id === (s.activeIds[composerId] ?? null))?.messages;
    if (!m) return null;
    for (let i = m.length - 1; i >= 0; i -= 1) {
      const msg = m[i];
      if (msg.role === 'assistant' && !msg.error) return extractCommand(msg.content);
    }
    return null;
  });
  /* The tool-gate count badge was removed from the header along with the wrench
     button; the tool list is reached from Agent Customizations now. */

  const scroller = useRef<HTMLDivElement | null>(null);
  /* Stable identity (ref is stable) so memoised PesanList is not re-rendered
     just because this callback was recreated. */
  const ambilScroller = useCallback(() => scroller.current, []);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const slashRef = useRef<HTMLDivElement | null>(null);
  /* The `@` popup's own box, so the highlighted row can be scrolled into view
     the same way the slash list's is. */
  const refBoxRef = useRef<HTMLDivElement | null>(null);
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
  const { popupRef: refSesi, onPointerDown: onDragSesi } = useDragPopup();
  const [sesiCari, setSesiCari] = useState('');
  /* The "..." menu, Copilot-style: move the chat into the editor area, pop it
     out to its own window, or dock it back to the right column. */

  /*
   * The chat-switch dropdown's list. Read from the store inside the memo (keyed
   * on the dialog being open + the search term) instead of subscribing to
   * `s.sessions`, so a streaming token in the active chat cannot re-render the
   * whole panel just to refresh a list that is usually closed.
   */
  const sesiTampil = useMemo(() => {
    if (!sesiBuka) return [];
    const q = sesiCari.trim().toLowerCase();
    return [...useAi.getState().sessions]
      .reverse()
      .filter(
        (s) =>
          !q ||
          s.title.toLowerCase().includes(q) ||
          s.messages.some((m) => m.content.toLowerCase().includes(q)),
      );
  }, [sesiBuka, sesiCari]);

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
      const d0 = useAi.getState().draftOf(composerId);
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
      const d1 = useAi.getState().draftOf(composerId);
      setDraft(`${d1 ? `${d1}\n\n` : ''}Files in ${nama}:\n${baris}`);
      setToast(tf('Attached {name}', { name: nama }));
    } catch {
      setToast(tr('Could not read that folder'));
    }
  };

  /*
   * Paste an image straight from the clipboard into the attachments.
   *
   * ## Why it also touches disk
   *
   * The attachment pipeline hands the model a data URL, which is all a
   * vision-capable model needs. But Zeph's `modlens` rule says images must be
   * read through the skill BEFORE answering about them, and `modlens` takes a
   * PATH or a URL - a data URL living only in the composer has neither. So the
   * rule promised something the pipeline could not deliver for pasted
   * screenshots, and the model was left describing an image it could not open.
   *
   * `simpanGambarTemp` (Rust, `gambar.rs`) already existed for the hosted CLI
   * path and does exactly what is needed: writes to `%TEMP%\zephyr-paste`,
   * content-addressed, returns the absolute path. Nothing new is invented here;
   * the existing command is wired into the paste path and the path is reported
   * in the toast so the reader (and the model, next turn) can refer to the file.
   *
   * A failure to write is NOT fatal: the attachment still works, it just has no
   * path to read from. Saying so beats a silent half-feature.
   */
  const tempelGambar = async () => {
    const url = await clipboardReadImage();
    if (!url) {
      setToast(tr('No image on the clipboard'));
      return;
    }
    addDraftImage(url);
    const jalur = await simpanJalurGambar(url);
    setToast(
      jalur
        ? tf('Screenshot attached ({path})', { path: jalur })
        : tr('Screenshot pasted as an attachment'),
    );
  };

  /**
   * Write a pasted data URL to a temp file and return its path, or `null`.
   *
   * Split out because BOTH paste routes need it: the clipboard button and the
   * composer's own `onPaste`. Returns `null` on anything unexpected - a missing
   * comma, an unsupported extension, a Rust error - so callers can fall back to
   * the plain toast instead of failing the attachment.
   */
  const simpanJalurGambar = async (dataUrl: string): Promise<string | null> => {
    const pisah = /^data:image\/([a-z0-9+.-]+);base64,(.*)$/i.exec(dataUrl);
    if (!pisah) return null;
    try {
      return await simpanGambarTemp(pisah[2], pisah[1]);
    } catch {
      return null;
    }
  };


  const { items: saranSlash } = matchPrompts(draft);
  const { items: saranSnippet } = matchSnippets(draft);
  const modeSnippet = saranSnippet.length > 0;
  const saranMentah = modeSnippet ? saranSnippet : saranSlash;

  /* The trigger symbol the user typed (`>` or `#`) so the rows echo it back. */
  const pemicuSnippet = modeSnippet ? snippetTrigger(draft) ?? '>' : '>';


  /*
   * Inline `@` references, in CATEGORIES.
   *
   * The token is read from the text BEFORE the caret, so an "@" typed
   * mid-sentence does not open the list - only one that starts a word does. The
   * reference list is fetched once per session and filtered locally, since the
   * workspace walk is far too slow to run per keystroke.
   */
  const [refs, setRefs] = useState<RefItem[]>([]);
  /*
   * References picked from the `@` list, held as CHIPS above the field.
   *
   * They used to be spliced into the draft as `@path`, which is where the raw
   * text came from: a sentence read "tolong lihat @.zephyr/uji/ ya" with the
   * path sitting in it like something the reader typed. Keeping them apart makes
   * the composer show what was attached, and `kirimPesan` prepends the tokens
   * to the outgoing text so the model still receives exactly the same message.
   */
  const [draftRefs, setDraftRefs] = useState<RefItem[]>([]);
  const [refTerbuka, setRefTerbuka] = useState(false);
  /*
   * Set by `tutupRef` for the ONE case `refTerbuka` cannot express.
   *
   * The popup is drawn while the suggestion list is non-empty, and a token is
   * still in the composer after Escape (the reader only pressed the key, they
   * did not delete the `@`). Without this flag the render kept drawing the
   * popup from the list contents alone, so Escape looked like it did nothing.
   * Cleared again whenever the token moves or the popup is reopened.
   */
  const [daftarTutup, setDaftarTutup] = useState(false);
  /*
   * Which kind the popup is narrowed to, or null for ALL of them.
   *
   * There is no chip any more: the reference product opens on the whole list,
   * and the reader narrows by TYPING a prefix (`@folder:`) or by pressing the
   * group heading. A chip row locked the first thing the reader saw to one
   * category, which is what made "@ never showed my folders".
   */
  const [jenisRef, setJenisRef] = useState<SaringanJenis>(null);
  /*
   * The popup's own search field.
   *
   * Separate from the composer on purpose: the reference product keeps a field
   * INSIDE the popup, and it earns its place. Typing `@` and then the name
   * means the composer now holds a half-typed path, so looking for one file and
   * then deciding against it leaves `@src/lib/aist` in the message to clean up.
   * With a field in the popup the composer keeps only `@`, the search is
   * thrown away on close, and Escape leaves nothing behind.
   */
  const [cariRef, setCariRef] = useState('');
  const cariRefBox = useRef<HTMLInputElement | null>(null);
  /*
   * The `/` popup gets the same field, for the same reason: `/` then Escape
   * used to wipe the whole draft, and a reader who was midway through a
   * sentence lost it just for peeking at the command list.
   */
  const [cariSlash, setCariSlash] = useState('');
  const cariSlashBox = useRef<HTMLInputElement | null>(null);
  /*
   * The `/` popup's own field filters the list too.
   *
   * A composer holding only "/" would otherwise show nineteen rows every time,
   * and the reader has to type into the composer to narrow it - which puts the
   * command name into the draft they may not send. Same rule as the `@` popup:
   * the field wins, the composer's text is the fallback.
   */
  /*
   * The popup's own field narrows the list.
   *
   * Kept next to the field's state because the grouped list below is built from
   * it - and building that grouping from the unfiltered list is exactly the bug
   * that made typing in the field change nothing on screen.
   */
  const kueriSlash = cariSlash.trim().toLowerCase();
  const saran = kueriSlash
    ? saranMentah.filter((p) => p.cmd.toLowerCase().includes(kueriSlash))
    : saranMentah;

  /*
   * The slash list, GROUPED.
   *
   * It used to be one flat list of nineteen rows, so "new chat" (which acts on
   * the conversation) sat next to "explain" (which writes a sentence) with
   * nothing saying they were different kinds of thing. Grouping is what the
   * reference product's `/` popup does, and it is the difference between a list
   * you read and a list you scan.
   *
   * Snippets are NOT grouped: they are all the same kind (text that gets
   * inserted), and a heading over one homogeneous list is noise.
   */
  const grupPrompt = useMemo(() => {
    if (modeSnippet) return [] as { jenis: JenisPrompt; items: PromptItem[] }[];
    const peta = new Map<JenisPrompt, PromptItem[]>();
    /*
     * Grouped from the FILTERED list (`saran`), not the raw one.
     *
     * `saranMentah` is what the composer's text alone matches, so drawing the
     * popup from it meant the search field did nothing at all: typing "rev" in
     * it narrowed `saran` - which the keyboard walked - while nineteen rows
     * stayed on screen. That is the reported "kotak cari / tidak nyaring", and
     * it is why the highlighted row and the visible list disagreed.
     */
    for (const p of saran) {
      const j = jenisPrompt(p);
      const ada = peta.get(j);
      if (ada) ada.push(p);
      else peta.set(j, [p]);
    }
    return URUTAN_PROMPT.filter((j) => peta.has(j)).map((j) => ({
      jenis: j,
      items: peta.get(j) as PromptItem[],
    }));
  }, [saran, modeSnippet]);

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
  /*
   * The grouped suggestions, and the flat list the keyboard walks.
   *
   * `uraiToken` reads an optional `rule:`/`agent:` prefix from what was typed,
   * so typing narrows the category as well as the text - faster than aiming at
   * a chip. The chip and the prefix are OR-ed: whichever the reader used last
   * decides, and the prefix wins because it is the more deliberate of the two.
   */
  const urai = token ? uraiToken(token.teks) : { jenis: null, q: '' };
  const jenisAktif: SaringanJenis = urai.jenis ?? jenisRef;
  /*
   * Closing the `@` popup, in ONE place.
   *
   * The filter and the search text used to be cleared one call site at a time -
   * `pakaiRef` cleared them, the Escape handler cleared only one, the
   * token-watcher cleared only the text. Whichever path a reader took (clicking
   * away, deleting the `@`, pressing Escape in the field), whatever that path
   * forgot stayed behind, so the next `@` opened already narrowed to the last
   * kind that was picked. That is the reported "popup nyangkut, harus refresh
   * dulu baru ilang": nothing was broken, the state simply outlived the popup.
   *
   * Every close goes through here now, and `tutupRef` also puts the caret back
   * in the composer so a stray focus cannot keep the old field alive.
   */
  const tutupRef = (fokusKeComposer = false) => {
    setRefTerbuka(false);
    setJenisRef(null);
    setCariRef('');
    setIdxSaran(0);
    /*
     * `tutupRef` juga menutup popup yang BUKAN popup `@`.
     *
     * Render memakai `saranRefSemua.length > 0 || ...`, jadi selama daftar
     * saran tidak kosong popup tetap tergambar walau `refTerbuka` sudah false.
     * Dulu semuanya tampak baik-baik saja karena `pakaiRef` ikut memindahkan
     * kursor keluar dari token; Escape tidak melakukan itu, sehingga popup
     * tertinggal di layar dengan daftar kosong. Menutupnya harus eksplisit.
     */
    setDaftarTutup(true);
    if (fokusKeComposer) {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };
  /*
   * What the list is filtered by: the popup's field when it has text, the
   * composer otherwise. The field WINS rather than being AND-ed with it, so a
   * half-typed `@src` plus "lib" in the field searches for "lib" - the field is
   * the more deliberate of the two, and the reader can see what it contains.
   */
  const kueriRef = cariRef.trim() || urai.q;
  const grupRef =
    token && refTerbuka
      ? saringRef(refs, { jenis: jenisAktif, q: kueriRef })
      : [];
  const saranRef = ratakan(grupRef);
  /*
   * The recent block, shown only while nothing has been typed.
   *
   * Once a query exists the reader is looking for something specific and the
   * recent rows are noise that pushes the matches down; with an empty query
   * they are the fastest route to what was being worked on a minute ago.
   */
  const recentRef = !kueriRef && !jenisAktif ? refTerakhir(refs) : [];
  const saranRefSemua = recentRef.length ? [...recentRef, ...saranRef] : saranRef;

  /*
   * The popup's FIRST screen: a category menu, like the reference.
   *
   * Pressing `@` used to drop the reader straight into a list of every kind at
   * once. Styling those rows differently never changed the impression, because
   * the SHAPE was the problem: the reference opens a small menu of kinds
   * (File / Folder / Rule / Agent) with a chevron on each, and only then shows
   * the searchable list with its kind named at the top. That is what this
   * renders. A query, or a pick from the menu, collapses it into the list.
   */
  const menuKategori =
    !kueriRef && !jenisAktif
      ? grupRef.map((g) => ({ jenis: g.jenis, jml: g.items.length }))
      : [];
  /* `idxSaran` walks whichever screen is showing, so the two never disagree
     about which row is highlighted. */
  const idxMenu = menuKategori.length ? idxSaran % menuKategori.length : 0;

  /*
   * Singular names for the menu rows and the list header.
   *
   * `LABEL_JENIS` is plural ("Files", "Rules") because it used to count rows in
   * a heading. A menu row and a header name ONE kind, so they read "Berkas",
   * "Aturan" - the same word the rest of the panel uses for that thing.
   */
  const LABEL_TUNGGAL: Record<'file' | 'folder' | 'rule' | 'agent', string> = {
    file: tr('Berkas'),
    folder: tr('Folder'),
    rule: tr('Aturan'),
    agent: tr('Agent'),
  };

  /* Opens a category and puts the caret in the search field, which is the only
     thing the reader wants next. */
  const pilihKategori = (j: NonNullable<SaringanJenis>) => {
    setJenisRef(j);
    setIdxSaran(0);
    window.requestAnimationFrame(() => cariRefBox.current?.focus());
  };

  /* Back to the menu: the category and the query go together, so the menu never
     reopens still holding the last search. */
  const kembaliMenu = () => {
    setJenisRef(null);
    setCariRef('');
    setIdxSaran(0);
    window.requestAnimationFrame(() => cariRefBox.current?.focus());
  };

  /*
   * The token being edited is what decides whether the list is open, so a
   * completed reference — "@package.json" followed by a space — closes it. The
   * previous version only closed on an explicit pick or Escape, so the list
   * stayed up after the path was already inserted.
   */
  useEffect(() => {
    if (!token || /\s/.test(token.teks)) {
      /* Closing through the shared path, so the filter cannot survive a close
         that happened by deleting the `@` instead of pressing Escape. */
      if (refTerbuka) tutupRef();
      return;
    }
    /*
     * Load the reference list ONCE, but keep looking for files afterwards.
     *
     * The old condition was `refs.length === 0`, and that was the bug: rules and
     * agents exist with no folder open, so the first "@" after launch returned
     * 20 rows (14 rules + 6 agents) and set `refs`. From then on `refs.length`
     * was non-zero, the loader was never called again, and FILES AND FOLDERS
     * NEVER APPEARED for the rest of the session - even after the reader opened
     * a workspace. Measured: `muatRef()` returned `{rule:14, agent:6}` with an
     * empty file list and no way back.
     *
     * `adaBerkas` is the flag that matters, not the total length.
     */
    const adaBerkas = refs.some((r) => r.jenis === 'file' || r.jenis === 'folder');
    /* Any new keystroke inside the token reopens a list closed by Escape. */
    setDaftarTutup(false);
    if (!adaBerkas) {
      void muatRef().then((f) => {
        setRefs(f);
        if (f.length > 0) setRefTerbuka(true);
      });
      return;
    }
    setRefTerbuka(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, posisi, token?.teks]);

  /*
   * Replaces the "@token" being typed with the chosen reference.
   *
   * A row that carries a `mode` also SWITCHES the composer to it. The two Agent
   * rows are the Chat/Agent switch reached from `@`, so picking one has to do
   * both things: mention it in the message and actually set the mode. Typing
   * "@agent" and getting the word inserted while the run stayed in Chat would be
   * a control that looks connected and is not.
   */
  const pakaiRef = (f: RefItem) => {
    const t = token;
    const el = inputRef.current;
    if (!t || !el) return;
    if (f.mode) useAi.getState().setAgentMode(f.mode);
    /*
     * A pick becomes a CHIP, not text.
     *
     * The reference used to be spliced in as `@src/lib/aiStore.ts`, so the
     * composer showed a raw path in the middle of the sentence - the reported
     * "masih mentah", and the one place the reference product never shows it
     * that way. The token is removed from the draft instead, and the picked
     * reference is kept in `draftRefs`, which draws the strip above the field
     * and is prepended to the message when it is sent.
     */
    const nilai = el.value;
    const sesudah = nilai.slice(posisi);
    const sisa = `${el.value.slice(0, t.mulai)}${sesudah.startsWith(' ') ? sesudah.slice(1) : sesudah}`;
    el.value = sisa;
    setDraft(sisa);
    setKursor(t.mulai);
    setDraftRefs((lama) => (lama.some((r) => r.sisip === f.sisip) ? lama : [...lama, f]));
    tutupRef();
    catatRefTerakhir(f.kunci);
    window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(t.mulai, t.mulai);
    }, 0);
  };

  useEffect(() => {
    const box = slashRef.current;
    if (!box) return;
    const aktif = box.querySelector<HTMLElement>('.ai-slash-item.is-on');
    aktif?.scrollIntoView({ block: 'nearest' });
  }, [idxSaran, saran.length]);

  /*
   * The same for the `@` list, and it is what was missing.
   *
   * The slash list scrolled its highlighted row into view; the `@` list never
   * did. With one flat list of files that was barely noticeable, because the
   * first rows are the ones you want. With four categories the list is far
   * longer, so arrowing down past the fold left the highlight off-screen and the
   * popup looked frozen - the "pas pake @ ga scroll ke bawah" report.
   */
  useEffect(() => {
    const box = refBoxRef.current;
    if (!box) return;
    const aktif = box.querySelector<HTMLElement>('.ai-slash-item.is-on');
    aktif?.scrollIntoView({ block: 'nearest' });
  }, [idxSaran, saranRef.length]);

  /* A new query or a new category restarts the highlight at the top, or the
     reader would keep a selection that no longer means the same row. */
  useEffect(() => setIdxSaran(0), [draft, jenisAktif, cariRef, cariSlash]);

  /*
   * Move the caret into the popup's field as soon as the list opens.
   *
   * The field is where the reader is going to type next, so leaving the caret
   * in the composer means the first keystroke lands in the message instead —
   * the same thing that made the old popup feel read-only. It is focused in an
   * effect (after the popup is in the DOM) rather than on the click that
   * opened it, because the field does not exist until `saranRef` is non-empty.
   */
  useEffect(() => {
    if (!refTerbuka) return;
    /* Only when the composer's token is bare (`@` or `@file:`): a token that
       already carries text is being typed there, and stealing focus would
       split one query across two inputs. */
    if (urai.q.trim()) return;
    const id = window.setTimeout(() => cariRefBox.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [refTerbuka, urai.q]);

  useEffect(() => {
    if (saran.length === 0 || modeSnippet) return;
    const id = window.setTimeout(() => cariSlashBox.current?.focus(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saran.length > 0, modeSnippet]);

  const pakaiPrompt = (p: { cmd: string; body: string; aksi?: string }) => {
    /*
     * The popup's search text goes with the pick.
     *
     * It used to stay behind: type `/`, narrow to "rev" in the field, press the
     * row - and `cariSlash` still held "rev". Two things followed from that. The
     * popup could not close, because the render keeps it alive while the field
     * has text even though the composer no longer holds a slash command. And the
     * next `/` reopened already filtered by a word the reader could not see in
     * the composer: the "ketinggalan" leftover. Clearing it here makes the pick
     * finish the popup instead of leaving half of it running.
     */
    setCariSlash('');
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
          /* The chips belong to the draft that is being thrown away. */
          setDraftRefs([]);
          newChat(composerId);
          break;
        case 'hapus-semua':
          setDraft('');
          setDraftRefs([]);
          setClearAllOpen(true);
          break;
        case 'padatkan':
          setDraft('');
          setDraftRefs([]);
          void compactContext(undefined, composerId);
          break;
        case 'ekspor':
          setDraft('');
          setDraftRefs([]);
          void exportChat(composerId);
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
          /* Chat history moved into the panel's own header switcher (the left
             'ai' sidebar is gone). Open that switcher instead. */
          useStore.getState().setSettingsOpen(false);
          window.dispatchEvent(new Event('zephyr-ai-history'));
          break;
        case 'bantuan':
          void runCommand('help.shortcuts');
          break;
        /*
         * `/browser` — the browser INSIDE Zephyr.
         *
         * Two targets, because the reader can be in either window:
         *
         *   - Agents window: the right column already has a Browser view
         *     (`AgentsRight`, Ctrl+Shift+B). Firing the same keydown the
         *     shortcut fires reuses that one code path instead of a second
         *     "open the browser tab" implementation that could drift from it.
         *
         *   - Main window: the browser is an editor TAB now (it used to be a
         *     pane in the bottom panel). `terminal.splitBrowser` kept its id
         *     but opens that tab, and it already carries the default URL.
         *
         * The event is dispatched rather than called directly because
         * `AgentsRight` binds its shortcut on `window`; a synthetic
         * `keydown` is the only thing that reaches it from here without
         * lifting the tab state out of that component.
         */
        case 'browser':
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'B', ctrlKey: true, shiftKey: true, bubbles: true }),
          );
          void runCommand('terminal.splitBrowser');
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

  /* Auto-scroll now lives inside PesanList, which already re-renders per token
     (see its comment). Doing it here would resubscribe the whole panel to a
     per-frame value. */

  /*
   * Whether the reader has fallen behind the newest output.
   *
   * The transcript auto-scrolls only while the reader is at the bottom (see the
   * effect in PesanList). That is the right rule - yanking someone away from the
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
    const t = window.setTimeout(() => setToast(null), 1000);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);

  useEffect(() => {
    const onFocusReq = () => inputRef.current?.focus();
    window.addEventListener('zephyr-ai-focus', onFocusReq);
    return () => window.removeEventListener('zephyr-ai-focus', onFocusReq);
  }, []);

  /* `/history` and the command palette open the chat-history switcher that now
     lives in the header (the left 'ai' sidebar was removed). */
  useEffect(() => {
    const onHist = () => {
      const btn = document.querySelector<HTMLElement>('[data-testid="ai-chat-name"]');
      const r = btn?.getBoundingClientRect();
      if (r) setSesiRect({ left: r.left, top: r.top, bottom: r.bottom });
      setSesiCari('');
      setSesiBuka(true);
    };
    window.addEventListener('zephyr-ai-history', onHist);
    return () => window.removeEventListener('zephyr-ai-history', onHist);
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
      className={`ai-panel${aiSempit ? ' is-kanan' : ''}${jumlahPesan === 0 ? ' is-kosong' : ''}`}
      data-testid="ai-panel"
      data-pos="kanan"
    >
      {/*
        * The panel's own header row — hidden while MAXIMISED.
        *
        * In the expanded layout the tab strip and the window controls are lifted
        * into one bar at the top of the column (App's `.ai-side-top`), and the
        * session switcher lives in the Sessions column. Keeping this row as well
        * left a second bar carrying a duplicate title, which read as a leftover
        * "New chat" strip stranded above the transcript.
        */}
      <div className="ai-head" hidden={aiMax}>
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
          <span className="ai-chatname-teks">{judulSesi ? tr(judulSesi) : '-'}</span>
          <AiIkon name="chev-down" size={12} />
        </button>

        {/*
          * Show/hide the sessions column, pinned to the RIGHT edge of this row.
          *
          * It used to live here and was removed once, on the argument that the
          * sessions column carries its own control. That is true only while the
          * column is OPEN - with it closed there was no way back to it from the
          * chat surface, which is the "the Show sessions button disappeared"
          * report. It is back, and it is the only way to reopen the column.
          */}
        <button
          type="button"
          className={`ai-ikon ai-head-sesi${sesiSisiBuka ? ' is-on' : ''}`}
          data-testid="ai-toggle-sessions-side"
          title={tr('Show Agent Sessions Sidebar')}
          aria-label={tr('Show Agent Sessions Sidebar')}
          aria-pressed={sesiSisiBuka}
          onClick={() => setSesiSisiBuka(!sesiSisiBuka)}
        >
          <AiIkon name="list" size={14} />
        </button>

        {sesiBuka && sesiRect && (
          <div
            ref={refSesi}
            className="ai-sesi-menu"
            data-testid="ai-sesi-menu"
            role="listbox"
            style={{
              left: Math.max(8, Math.min(sesiRect.left, window.innerWidth - 320)),
              top: sesiRect.bottom + 6,
              transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))',
            }}
          >
            <div className="ai-sesi-cari" data-drag-handle onPointerDown={onDragSesi} style={{ cursor: 'grab' }}>
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
                      selectChat(s.id, composerId);
                      setSesiBuka(false);
                    }}
                  >
                    <span className="ai-sesi-judul">{tr(s.title)}</span>
                    <span className="ai-sesi-info">{tf('{n} messages', { n: s.messages.length })}</span>
                  </button>
                  <button
                    type="button"
                    className="ai-sesi-hapus"
                    data-testid={`ai-sesi-fork-${s.id}`}
                    title={tr('Fork chat')}
                    /* Branch the conversation at its last turn: the fork keeps
                       every message so far and continues on its own. */
                    onClick={(e) => {
                      e.stopPropagation();
                      const akhir = s.messages[s.messages.length - 1];
                      if (!akhir) return;
                      forkChat(s.id, akhir.id, composerId);
                      setSesiBuka(false);
                    }}
                  >
                    <AiIkon name="git-branch" size={13} />
                  </button>
                  <button
                    type="button"
                    className="ai-sesi-hapus"
                    data-testid={`ai-sesi-hapus-${s.id}`}
                    title={tr('Delete')}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(s.id);
                      /*
                       * Close the list after a delete. `sesiTampil` is
                       * memoised on [sesiBuka, sesiCari] for the same
                       * isolation reason the transcript is; deleting a
                       * non-active chat changes neither, so the row would
                       * linger. Closing forces a fresh read on reopen.
                       */
                      setSesiBuka(false);
                    }}
                  >
                    <AiIkon name="trash" size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* The Chat Settings overlay used to mount here. It is its own window now
          (`bukaPanel('chat-settings')`), so there is nothing to draw inside the
          chat surface. */}

      <div className="ai-chat" ref={scroller} data-testid="ai-chat" onScroll={cekPosisi}>
        {nokeyTampil && (
          <div className="ai-nokey" data-testid="ai-nokey" role="alert">
            <button
              type="button"
              className="ai-nokey-dismiss"
              data-testid="ai-nokey-dismiss"
              title={tr('Close')}
              aria-label={tr('Close')}
              onClick={() => setNokeyDismissed(true)}
            >
              <AiIkon name="close" size={12} />
            </button>
            <p className="ai-nokey-title">{tr('This provider does not have an API key yet')}</p>
            <p className="ai-nokey-body">
              {tr('Add an API key for')} <strong>{provider}</strong>{' '}
              {tr('so the AI can answer. Without a key, every request will fail with 401.')}
            </p>
            <button
              className="btn btn-primary btn-sm"
              data-testid="ai-nokey-open"
              onClick={() => bukaModels()}
            >
              {tr('Open AI Models')}
            </button>
          </div>
        )}
        {jumlahPesan === 0 ? (
          <div className="ai-empty" data-testid="ai-empty">
            {/*
             * The intro: the product's initial, the title, one tagline, then
             * three lines about what this agent does.
             *
             * The title and tagline are the reference's wording by request. The
             * three lines are Zephyr's own - they describe what this agent
             * actually does here rather than repeating the reference's list.
             */}
            <div className="ai-intro" data-testid="ai-intro">
              <div className="ai-intro-head">
                <span className="ai-intro-z" aria-hidden="true">
                  <ZephyrLogo size={22} glyphOnly />
                </span>
                <span className="ai-intro-judul">{tr('Agent')}</span>
              </div>
              <p className="ai-intro-tagline">{tr('Deep understanding of complex tasks')}</p>
              <ul className="ai-intro-poin">
                <li>{tr('Reads your workspace and works in real files')}</li>
                <li>{tr('Runs commands, tests and fixes in one turn')}</li>
                <li>{tr('Keeps every change reviewable before it lands')}</li>
              </ul>
            </div>
          </div>
        ) : (
          /*
           * ONE renderer for tool calls: ChatMessage, inside each bubble.
           *
           * A second trail used to be drawn here from `agentSteps` (the
           * run-level list), which showed the SAME calls again in a different
           * layout - a seven-call turn read as fourteen rows, and the two
           * versions disagreed on icons, carets and meta. ChatMessage already
           * interleaves each call with its narration and now shows the file
           * diff too, so the trail here was pure duplication. opencode, Hermes
           * and Claude Code all keep tool output in the transcript and nowhere
           * else; this matches them.
           */
          <PesanList composerId={composerId} ambilScroller={ambilScroller} />
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

        {/*
          * Pertanyaan dari agen (tool ask_user) — DI DALAM alur chat.
          *
          * Agen BERHENTI dan menunggu: langkahnya benar-benar tertahan sampai
          * user menjawab atau membatalkan. Karena itu tombolnya harus selalu
          * ada - kalau kartunya gagal dirender, langkah agen menggantung
          * selamanya tanpa apa pun yang bisa user lakukan.
          *
          * Kartu ini adalah PESAN dari agen, jadi ia hidup di dalam area
          * gulir bersama riwayat: ikut naik-turun dengan pesan-pesan, dan
          * terbaca tepat di bawah konteks yang menimbulkan pertanyaannya.
          * Bentuk formulirnya - langkah bertahap, field per tipe, counter,
          * dan Submit - ada di `AskUserCard`; di sini hanya tempatnya.
          */}
        {agentTanya && (
          <AskUserCard tanya={agentTanya} onJawab={jawabTanya} tr={tr} tf={tf} />
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
        {sibuk && (
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
              /* Inside the `sibuk` guard above, so there is no finished state to
                 paint here: the row does not outlive the run. */
              className="ai-work-glyph is-running"
              aria-hidden="true"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9L14 6m0-4v4h-4" />
              </svg>
            </span>
            <span className="ai-work-title">
              {/* Ada loop sungguhan maupun tidak, baris ini berarti "satu run
                  sedang jalan" - jadi labelnya pun begitu. Versi lama menulis
                  "Loop running" pada SETIAP run biasa, dan menghitung langkah
                  sebagai "runs", sehingga user mengira ada loop terjadwal. */}
              {tr('Thinking')}
            </span>
          </button>
          </div>
          {/*
            * Which HydraFusion stage is running RIGHT NOW.
            *
            * The layered-streaming problem: a critique-and-revise run is three
            * requests, and only the last one streams into the transcript. Two
            * of the three produce nothing the reader can see, so without this
            * row the panel looks idle for the length of two whole answers - it
            * is the same "is it stuck or is it working" question the loop timer
            * answers for a normal run. It carries the honest denominator
            * (`total`) rather than the cost cap, and it exists only while the
            * run does: it is a state, not a receipt.
            */}
          {hydraTahap && (
            <div
              className="ai-work-hydra"
              data-testid="ai-work-hydra"
              title={[
                `HydraFusion phase: ${tf(hydraTahap.peran === 'draft' ? 'Main pass' : hydraTahap.peran === 'kritik' ? 'Review' : 'Revision', {})}`,
                `Phase is running`,
                `Model: ${hydraTahap.model}`,
                `Route: ${hydraTahap.jalur} (${hydraTahap.request} of ${hydraTahap.total})`,
                hydraTahap.catatan,
              ]
                .filter(Boolean)
                .join('\n')}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 1.8 14 5 8 8.2 2 5z" />
                <path d="M2.6 8.4 8 11.4l5.4-3" />
                <path d="M2.6 11.4 8 14.4l5.4-3" />
              </svg>
              <span data-testid="ai-work-hydra-tahap">
                {`${tf(hydraTahap.peran === 'draft' ? 'Main pass' : hydraTahap.peran === 'kritik' ? 'Review' : 'Revision', {})} · ${hydraTahap.model}`}
              </span>
              <span className="ai-work-meta" data-testid="ai-work-hydra-peran">
                {`${tf('Stage {n} of {m}', { n: hydraTahap.request, m: hydraTahap.total })}${runElapsedSec > 0 ? ` · ${fmtDur(runElapsedSec)}` : ''}`}
              </span>
            </div>
          )}
          {loopBuka && (
            <div id="ai-work-loop-body" className="ai-work-body" role="status" data-testid={sibuk ? 'ai-agent-progress' : undefined}>
              {/*
               * Gelombang 4: bar ini menggantikan baris teks diam yang hanya
               * menuliskan 'ThinkingStep 4/120'. Ia menyala HANYA saat sibuk,
               * memutar status yang bisa dibaca manusia setiap 6 detik, dan
               * menghitung detik berjalan supaya user tahu ia masih hidup -
               * bukan macet.
               */}
              {sibuk && showThinkingBar && (
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
                  {runElapsedSec > 0 ? ` · ${fmtDur(runElapsedSec)}` : ''}
                  {etaSec > 0 ? ` · ~${fmtDur(etaSec)}` : ''}
                </span>
                {sibuk && <span>{tf('{n}s', { n: progressElapsed })}</span>}
              </div>
              {agentCurrentTool && <code className="ai-work-tool">{agentCurrentTool}</code>}
              {/*
                * The step list moved INTO the transcript (see JejakKerja below,
                * rendered right after PesanList). It used to live here, inside
                * the work panel next to the composer, which split the story in
                * two: the answer scrolled in the chat while the steps and the
                * file diffs scrolled somewhere else. Copilot/Claude Code keep
                * them together - the steps ARE the answer as it is being
                * written - so the panel is shown in the conversation now.
                */}
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
              onClick={() => kosongkanAntrian(composerId)}
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
                        onClick={() => buangAntrian(a.id ?? i, composerId)}
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
                              ubahAntrian(a.id ?? i, cqDraft, composerId);
                              setCqEdit(null);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setCqEdit(null);
                            }
                          }}
                          onBlur={() => {
                            ubahAntrian(a.id ?? i, cqDraft, composerId);
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
                            onClick={() => void kirimAntrian(i, composerId)}
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
                          onClick={() => naikkanAntrian(a.id ?? i, composerId)}
                        >
                          <AiIkon name="chev-up" size={11} />
                        </button>
                        <button
                          className="ai-cq-move"
                          data-testid={`ai-antrian-turun-${i}`}
                          title={tr('Move down in the queue')}
                          aria-label={tr('Move down in the queue')}
                          disabled={i === antrian.length - 1}
                          onClick={() => turunkanAntrian(a.id ?? i, composerId)}
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
          * The agent's todo list moved INTO the turn review card (`UbahReview`
          * below, next to the composer): one card carries both the plan and the
          * files the turn wrote, so this dock would have duplicated it.
          */}
      </div>
      )}

      {/*
        * The job strips sit between the work stack and the composer: a loop
        * that is running and a goal that is set are both facts about the
        * session, and they stay visible while the conversation scrolls.
        */}
      <GoalStrip composerId={composerId} />
      <LoopStrip composerId={composerId} />

      {/*
        * The keep/undo decision for the turn that just finished, right above the
        * message box: the reader answers "do I keep this?" without scrolling a
        * long transcript first. Destination of its rows follows the surface -
        * editor tab in the main window, right panel in the Agents window.
        */}
      <UbahReview permukaan={composerId === 'agents' ? 'agents' : 'main'} />

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
        {/*
          * The browser page currently open in the Agents window, as context the
          * message can carry. Same row and shape as the branch chip: both name a
          * piece of context the prompt will be attached to, so they read as one
          * family rather than two features.
          */}
        <BrowserContextChip onSisip={(t) => setDraft(draft ? `${draft} ${t}` : t)} />
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
        {/*
          * The picked references, as chips above the field.
          *
          * This is the composer's answer to "why is the path still raw text".
          * Each chip names what was attached, carries the icon of its kind, and
          * has its own remove button; the draft itself stays clean prose. Sent
          * messages draw the same chip from the same `@token`, so a reference
          * looks identical before and after sending.
          */}
        {draftRefs.length > 0 && (
          <div className="ai-refstrip" data-testid="ai-refstrip">
            {draftRefs.map((r) => (
              <span
                className="ai-ref-chip-pesan is-draft"
                data-ref={r.sisip}
                data-testid={`ai-draft-ref-${r.sisip}`}
                title={r.sisip}
                key={r.kunci}
              >
                <span className="ai-ref-chip-pesan-ikon" aria-hidden="true">
                  {r.jenis === 'folder' ? (
                    <AiIkon name="folder" size={11} />
                  ) : r.jenis === 'rule' ? (
                    <AiIkon name="shield" size={11} />
                  ) : r.jenis === 'agent' ? (
                    <AiIkon name="robot" size={11} />
                  ) : (
                    <FileIkon nama={r.label} />
                  )}
                </span>
                <span className="ai-ref-chip-pesan-nama">{r.sisip.replace(/\/$/, '')}</span>
                <button
                  type="button"
                  className="ai-ref-chip-pesan-x"
                  data-testid={`ai-draft-ref-hapus-${r.sisip}`}
                  title={tr('Remove reference')}
                  aria-label={tr('Remove reference')}
                  onClick={() => setDraftRefs((lama) => lama.filter((x) => x.sisip !== r.sisip))}
                >
                  <AiIkon name="close" size={9} />
                </button>
              </span>
            ))}
          </div>
        )}
        {/*
          * References for an "@" token, ALL KINDS IN ONE LIST.
          *
          * There is no chip row. It used to sit above the list and lock the
          * popup to one category, so the first thing a reader saw after typing
          * "@" was a filtered slice - the reported "isinya udah di-filter
          * duluan, gabisa ngikutin kayak TRAE". Now every kind is on screen at
          * once, in order (files, folders, rules, agents), and the heading of
          * each kind is a button that narrows the list for anyone who wants it.
          *
          * The heading is the chip, moved inside the list where it labels the
          * rows it filters instead of floating above all of them.
          */}
        {(saranRefSemua.length > 0 || cariRef.length > 0) && !daftarTutup && (
          <div
            className={`ai-slash is-ref${menuKategori.length ? ' is-menu' : ''}`}
            data-pemicu="ref"
            data-layar={menuKategori.length ? 'menu' : 'daftar'}
            /*
             * Escape always wins, from anywhere inside the popup.
             *
             * Capture phase, and it does NOT branch on whether the search field
             * has text. It used to clear the query first and close on the second
             * press - but after a heading click the reader has a filtered list
             * with an EMPTY field, so the first Escape had nothing to clear and
             * only closed the filter, leaving the popup open with zero rows.
             * Measured: one Escape → filter cleared, popup still up, no rows.
             * Escape means "get me out of here", so it closes, every time.
             */
            onKeyDownCapture={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              e.stopPropagation();
              tutupRef(true);
            }}
          >
            {menuKategori.length > 0 ? (
              <>
                {recentRef.length > 0 && (
                  <div className="ai-ref-recent" data-testid="ai-ref-recent">
                    {/* No heading above the recents: the reference's first
                        screen opens with the last three files and nothing else
                        - a label there would read as a fifth category, and the
                        divider already says these rows are a different block. */}
                    {recentRef.map((f) => {
                      const i = saranRefSemua.indexOf(f);
                      return (
                        <button
                          key={`recent-${f.kunci}`}
                          role="option"
                          aria-selected={i === idxSaran}
                          className={`ai-slash-item${i === idxSaran ? ' is-on' : ''}`}
                          data-testid={`ai-ref-recent-${i}`}
                          data-ref={f.sisip}
                          onMouseEnter={() => setIdxSaran(i)}
                          onClick={() => pakaiRef(f)}
                        >
                          {f.jenis === 'file' ? (
                            <FileIkon nama={f.label} />
                          ) : (
                            <span className="ai-ref-ikon" aria-hidden="true">
                              <AiIkon name="folder" size={13} />
                            </span>
                          )}
                          <span className="ai-slash-cmd">{f.label}</span>
                          <span className="ai-slash-label">{f.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {/*
                 * The category menu - the first screen, as in the reference.
                 *
                 * It used to open straight into a list of every kind at once,
                 * with the categories doubling as headings. That is why the
                 * popup "looked like itself" no matter how the rows were
                 * styled: the shape was a list, and the reference is a MENU
                 * that drills into a list. Each row here is one kind, with a
                 * chevron saying it opens something, and the count saying how
                 * much is inside it.
                 */}
                <div className="ai-ref-menu" data-testid="ai-ref-menu" role="menu">
                  {menuKategori.map((k, ki) => (
                    <button
                      type="button"
                      key={k.jenis}
                      role="menuitem"
                      className={`ai-ref-menu-item${ki === idxMenu ? ' is-on' : ''}`}
                      data-testid={`ai-ref-menu-${k.jenis}`}
                      onMouseEnter={() => setIdxSaran(ki)}
                      onClick={() => pilihKategori(k.jenis)}
                    >
                      <span className="ai-ref-ikon" aria-hidden="true">
                        {k.jenis === 'file' ? (
                          <AiIkon name="file" size={14} />
                        ) : k.jenis === 'folder' ? (
                          <AiIkon name="folder" size={14} />
                        ) : k.jenis === 'rule' ? (
                          <AiIkon name="shield" size={14} />
                        ) : (
                          <AiIkon name="robot" size={14} />
                        )}
                      </span>
                      <span className="ai-ref-menu-nama">{LABEL_TUNGGAL[k.jenis]}</span>
                      <span className="ai-ref-menu-jml">{k.jml}</span>
                      <span className="ai-ref-menu-panah" aria-hidden="true">
                        <AiIkon name="chev-right" size={12} />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* The drilled-in screen: ONE kind's name at the top, then the
                    rows. The back arrow is what makes this a level rather than
                    a filter, so the reader is never stuck inside it. */}
                <div className="ai-ref-judul" data-testid="ai-ref-judul">
                  {jenisAktif && (
                    <button
                      type="button"
                      className="ai-ref-kembali"
                      data-testid="ai-ref-kembali"
                      title={tr('Kembali ke kategori')}
                      aria-label={tr('Kembali ke kategori')}
                      onClick={kembaliMenu}
                    >
                      <AiIkon name="arrow-left" size={12} />
                    </button>
                  )}
                  <span>{jenisAktif ? LABEL_TUNGGAL[jenisAktif] : tr('Semua')}</span>
                </div>
                <div
                  className="ai-ref-list"
                  data-testid="ai-file-list"
                  role="listbox"
                  ref={refBoxRef}
                  aria-label={tr('Context for this message')}
                >
                  {grupRef.map((g) => (
                    <div className="ai-ref-grup" key={g.jenis} data-jenis={g.jenis}>
                      {/* A heading only when the search spans kinds. Inside one
                          category the header above already names it, and a
                          second heading would repeat it. */}
                      {!jenisAktif && (
                        <div className="ai-ref-head" data-testid={`ai-ref-head-${g.jenis}`}>
                          {tr(LABEL_JENIS[g.jenis])}
                        </div>
                      )}
                      {g.items.map((f) => {
                        const i = saranRef.indexOf(f);
                        return (
                          <button
                            key={f.kunci}
                            role="option"
                            aria-selected={i === idxSaran}
                            className={`ai-slash-item${i === idxSaran ? ' is-on' : ''}`}
                            data-testid={`ai-ref-${f.jenis}-${i}`}
                            data-ref={f.sisip}
                            onMouseEnter={() => setIdxSaran(i)}
                            onClick={() => pakaiRef(f)}
                          >
                            {/* Icon, name, then the containing folder. The name
                                is NOT prefixed with "@": inside a popup that was
                                opened by "@", the symbol on every row is noise
                                - the reference prints the bare name and path. */}
                            {f.jenis === 'file' ? (
                              <FileIkon nama={f.label} />
                            ) : (
                              <span className="ai-ref-ikon" aria-hidden="true">
                                {f.jenis === 'folder' ? (
                                  <AiIkon name="folder" size={13} />
                                ) : f.jenis === 'rule' ? (
                                  <AiIkon name="shield" size={13} />
                                ) : (
                                  <AiIkon name="robot" size={13} />
                                )}
                              </span>
                            )}
                            <span className="ai-slash-cmd">{f.label}</span>
                            <span className="ai-slash-label">{f.detail}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {saranRefSemua.length === 0 && (
                    <p className="ai-ref-empty" data-testid="ai-ref-empty">
                      {tr('Tidak ada file atau folder yang cocok.')}
                    </p>
                  )}
                </div>
              </>
            )}
            {/* The search field lives at the BOTTOM of the popup, like the
                reference product: the list is the important part and the field
                is what you reach for once you know the list is long. */}
            <label className="ai-ref-cari">
              {/* The prefix names the open category, and on the menu screen
                  it is just "@" - the same bare token the composer holds. */}
              <span className="ai-ref-cari-label">
                {jenisAktif ? `@${LABEL_TUNGGAL[jenisAktif]}:` : '@'}
              </span>
              <input
                ref={cariRefBox}
                className="ai-ref-cari-input"
                data-testid="ai-ref-cari"
                value={cariRef}
                spellCheck={false}
                autoComplete="off"
                placeholder={tr('Masukkan nama untuk mencari')}
                aria-label={tr('Cari rujukan konteks')}
                onChange={(e) => setCariRef(e.target.value)}
                onKeyDown={(e) => {
                  /* The field is inside the popup, so the keys that walk the
                     list must keep working from here — otherwise typing a
                     query means the arrow keys stop responding. */
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    /* Closing ALWAYS reaches `tutupRef`, so the filter and the
                       text go together with the popup. It no longer clears the
                       query first: a filtered list with an empty field would
                       then need a second Escape to get out of. */
                    tutupRef(true);
                    return;
                  }
                  /*
                   * The menu takes the same keys as the list beneath it:
                   * arrows walk the categories, Enter opens the highlighted
                   * one. Without this the field accepted the keystrokes but the
                   * menu never moved, so the popup was mouse-only.
                   */
                  if (menuKategori.length > 0) {
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      e.preventDefault();
                      const nm = menuKategori.length;
                      setIdxSaran((i) =>
                        e.key === 'ArrowDown' ? (i + 1) % nm : (i - 1 + nm) % nm,
                      );
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      pilihKategori(menuKategori[idxMenu].jenis);
                    }
                    return;
                  }
                  /* Backspace in an empty field backs out of the category
                     instead of doing nothing: it is the one key a reader tries
                     when they want the previous screen. */
                  if (e.key === 'Backspace' && !cariRef && jenisAktif) {
                    e.preventDefault();
                    kembaliMenu();
                    return;
                  }
                  if (saranRefSemua.length === 0) return;
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const n = saranRefSemua.length;
                    setIdxSaran((i) =>
                      e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n,
                    );
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    pakaiRef(saranRefSemua[idxSaran]);
                  }
                }}
              />
            </label>
          </div>
        )}

        {/* A-8: slash command suggestions; Tab/Enter uses the highlighted one.
            T4.4: ">" (or "#") shows SNIPPETS - the text that gets inserted, not
            a new question. The trigger is marked on the first line of the list so the
            user knows which one is currently active, and the row prints the
            symbol actually typed. */}
        {/* The popup outlives its query only while the composer still holds the
            token: `adaPemicuPrompt` is what stops a leftover search from keeping
            the list open after the `/` is deleted. */}
        {saranRef.length === 0 &&
          (saran.length > 0 || (cariSlash.length > 0 && adaPemicuPrompt(draft))) && (
          <div
            className={`ai-slash${modeSnippet ? '' : ' is-cmd'}`}
            data-testid="ai-slash"
            data-pemicu={modeSnippet ? 'snippet' : 'slash'}
            aria-label={tr('Prompt commands')}
          >
          <div className="ai-slash-list" role="listbox" ref={slashRef}>
            {/*
              * Rows, grouped by what they DO when not showing snippets.
              *
              * `i` stays the index into the FLAT `saran` list, because that is
              * what the keyboard walks and what `idxSaran` counts. Numbering per
              * group would make the arrow keys jump back to row 0 at every
              * heading.
              */}
            {(grupPrompt.length > 0 ? grupPrompt : [{ jenis: null, items: saran }]).map((g) => (
              <div className="ai-ref-grup" key={g.jenis ?? 'snippet'}>
                {g.jenis && <div className="ai-ref-head">{tr(LABEL_PROMPT[g.jenis])}</div>}
                {g.items.map((p) => {
                  const i = saran.indexOf(p);
                  return (
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
                  );
                })}
              </div>
            ))}
            {saran.length === 0 && (
              <p className="ai-ref-empty" data-testid="ai-slash-empty">
                {tr('No matching commands.')}
              </p>
            )}
          </div>
          {/* Snippets are a text-insertion feature, not a command menu: no
              search field of their own. `is-cmd` marks the popup that has one. */}
          {!modeSnippet && (
            <label className="ai-ref-cari">
              <span className="ai-ref-cari-label">/</span>
              <input
                ref={cariSlashBox}
                className="ai-ref-cari-input"
                data-testid="ai-slash-cari"
                value={cariSlash}
                spellCheck={false}
                autoComplete="off"
                placeholder={tr('Ketik untuk mencari…')}
                aria-label={tr('Search commands')}
                onChange={(e) => setCariSlash(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    if (cariSlash) setCariSlash('');
                    else {
                      /* Close the popup WITHOUT wiping the draft. Escape here
                         used to clear the whole message, which punished the
                         reader for having looked at the list. */
                      setCariSlash('');
                      inputRef.current?.focus();
                    }
                    return;
                  }
                  if (saran.length === 0) return;
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const n = saran.length;
                    setIdxSaran((i) =>
                      e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n,
                    );
                    return;
                  }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    e.preventDefault();
                    pakaiPrompt(saran[idxSaran]);
                  }
                }}
              />
            </label>
          )}
          </div>
        )}
        <textarea
          ref={inputRef}
          className="ai-input"
          data-testid="ai-input"
          rows={1}
          placeholder={
            sibuk
              ? tr('Agent is working…')
              : tr('@ for context, / for commands')
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
            /*
             * Backspace on an EMPTY draft takes the last chip off.
             *
             * The reference is no longer in the text, so no key can reach it
             * otherwise - and a chip that can only be removed with the mouse is
             * the same complaint as a raw path nobody asked for.
             */
            if (
              e.key === 'Backspace' &&
              !draft &&
              draftRefs.length > 0 &&
              (e.currentTarget.selectionStart ?? 0) === 0
            ) {
              e.preventDefault();
              setDraftRefs((lama) => lama.slice(0, -1));
              return;
            }

            /*
             * The category menu owns the keys while it is showing.
             *
             * It is the first screen of the popup and no file row is on it, so
             * arrows must move between categories and Enter must open one -
             * otherwise Enter "inserted" a file that was not even visible.
             */
            if (menuKategori.length > 0 && !daftarTutup) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const nm = menuKategori.length;
                setIdxSaran((i) =>
                  e.key === 'ArrowDown' ? (i + 1) % nm : (i - 1 + nm) % nm,
                );
                return;
              }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault();
                pilihKategori(menuKategori[idxMenu].jenis);
                return;
              }
            }

            // The reference list takes the keys while it is open: Enter there
            // means "insert this reference", not "send".
            if (saranRefSemua.length > 0) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const nf = saranRefSemua.length;
                setIdxSaran((i) => (e.key === 'ArrowDown' ? (i + 1) % nf : (i - 1 + nf) % nf));
                return;
              }
              /*
               * Enter here INSERTS the highlighted row — which is right while
               * the reader is mid-`@`, and wrong the moment the popup was only
               * re-opened behind a finished message.
               *
               * The popup stays mounted on its suggestion list, so a stale
               * list after a send swallowed the Enter that was meant to send
               * the next message: the key inserted a path instead, and the
               * only way out was the mouse. `daftarTutup` says the reader has
               * already dismissed this one, so Enter goes back to sending.
               */
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !daftarTutup)) {
                e.preventDefault();
                pakaiRef(saranRefSemua[idxSaran]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                tutupRef();
                return;
              }
            }
            /* Escape with the `@` popup open but nothing to highlight still
               closes it — otherwise a failed search traps the reader in it. */
            if (e.key === 'Escape' && token && refTerbuka) {
              e.preventDefault();
              tutupRef();
              return;
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
            if (
              !e.shiftKey &&
              (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
              saran.length === 0 &&
              saranRefSemua.length === 0
            ) {
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
            /*
             * Escape closes the `/` popup without touching the draft.
             *
             * It used to call `setDraft('')`, which is a destructive answer to
             * a reader who only glanced at the command list — the sentence they
             * had typed was gone. Closing the list is what Escape means; the
             * text is not the list.
             */
            if (e.key === 'Escape' && saran.length > 0) {
              e.preventDefault();
              setCariSlash('');
              setDraft(draft.replace(/^[>#/][\w-]*$/, ''));
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              /*
               * Enter with an EMPTY draft falls through to the default.
               *
               * It used to `preventDefault()` unconditionally and then call
               * `kirimSekarang`, which returns at once when there is no text —
               * so Enter did nothing at all, visibly. The button is `disabled`
               * in the same state and that is fine; a key that is swallowed
               * silently is not. No text means no send, and nothing to block.
               */
              if (!draft.trim() && draftImages.length === 0 && draftRefs.length === 0) return;
              /*
               * While a run is in flight, Ctrl+Enter cuts it short and sends
               * this now; a plain Enter lines the message up behind it. Idle,
               * both do the same thing, because there is nothing to interrupt
               * and the queue only exists to wait for a run.
               */
              if (sibuk && (e.ctrlKey || e.metaKey)) {
                void kirimPesan();
              } else {
                /*
                 * Enter goes through `kirimSekarang` with this surface's id, the
                 * same call the Send button makes.
                 *
                 * It used to call `send()` — the store's raw action — which took
                 * no composer id and therefore resolved the session from the
                 * store's PRIMARY `activeId`. In the editor tab that sent the
                 * message into the right column's conversation, so Enter looked
                 * like it did nothing here while the reply appeared over there.
                 * One path for both keys, so they cannot disagree.
                 */
                void kirimPesan();
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
                if (!url) return;
                addDraftImage(url);
                /*
                 * Also write it to disk so `modlens` can open it.
                 *
                 * This is the paste route that actually matters: Ctrl+V into
                 * the composer produces a File with no path at all. The toast
                 * reports the temp path once the write lands, and falls back to
                 * the plain message when it does not - the attachment still
                 * works either way.
                 */
                void simpanJalurGambar(url).then((jalur) => {
                  setToast(
                    jalur
                      ? tf('Screenshot attached ({path})', { path: jalur })
                      : tr('Screenshot pasted as an attachment'),
                  );
                });
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

        <div className="ai-input-toolbar">
          {/*
           * Copilot-style toolbar: a horizontal row BELOW the textarea instead
           * of a vertical column beside it. Left to right — what goes INTO the
           * message ("+"), then a spacer, then how it goes out (model,
           * mode, permission, reasoning) and Send on the trailing edge.
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
                    const d2 = useAi.getState().draftOf(composerId);
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
                    const d3 = useAi.getState().draftOf(composerId);
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

          {/*
            * Left group: approval, then who runs it — packed tight.
            */}
          <PermissionMenu />
          <ModeMenu />
          {(() => {
            const cu = cuSet;
            if (!cu?.showButton) return null;
            return (
              <button
                type="button"
                className={`ai-cu-chip${cu.enabled ? ' is-on' : ''}`}
                data-testid="ai-cu-chip"
                title={cu.enabled ? tr('Computer Use is on') : tr('Computer Use is off')}
                onClick={() => void applySet({ computerUse: { ...(cu ?? { enabled: false, showButton: false }), enabled: !(cu?.enabled ?? false) } })}
              >
<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <rect x="1.8" y="2.8" width="12.4" height="8.4" rx="1.4" />
          <path d="M5.5 13.5h5M8 11.2v2.3" />
        </svg>
                Computer Use
              </button>
            );
          })()}

          <span className="ai-toolbar-spacer" aria-hidden="true" />

          {/* The model sits directly beside Send, at the trailing edge. */}
          <ModelSelector />

          <div className="ai-send-wrap">
            {!sibuk && adaCheckpoint && (
              <button
                className="ai-round-btn is-resume"
                data-testid="ai-resume"
                title={tr('Continue from where it stopped')}
                aria-label={tr('Continue from where it stopped')}
                onClick={() => void lanjutkanAgent()}
              >
                <AiIkon name="send" size={14} />
              </button>
            )}
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
                disabled={!draft.trim() && draftImages.length === 0 && draftRefs.length === 0}
                title={tr('Run')}
                aria-label={tr('Run')}
                onClick={() => void kirimPesan()}
              >
                <AiIkon name="arrow-up" size={15} />
              </button>
            )}

            {/*
              * Menu caret di dropdown Stop DIHAPUS atas permintaan user
              * ("tombol queue dll di dropdown tombol stop itu dihapus aja, dia
              * ga berguna"). Ketiga barisnya melakukan hal yang sudah bisa
              * dilakukan tombol Stop dan tombol Send sendiri, jadi bukan hanya
              * mubazir — "Add to queue" bahkan menjalankan jalur yang sama
              * dengan "Send now", yang membuat pilihannya menipu.
              */}
          </div>
        </div>

        {/*
          * `Local <folder>` — the SECOND box, below the control row.
          *
          * Measured on the reference (1.1.png at 1.25): box 1 is the typing
          * field (y 455-479, 24px), box 2 is the control row PLUS this line
          * (y 495-536, background #1E1E1E, border #3F4046). Two separate
          * boxes, not one — that is what makes the composer read as "where the
          * task is written" and "where it runs" rather than as a single field.
          *
          * It is a real control: it names the folder the agent will work in and
          * opens the folder picker on click, the same action the title bar's
          * folder name leads to. A row that only printed a name would be
          * decoration; this one changes the workspace.
          */}
      </div>

      {/*
        * NO status strip below the composer.
        *
        * It held the run mode (Interactive / Plan / Autopilot), the permission
        * level, the reasoning effort, the message count and the context ring -
        * five readouts in a strip that does not exist in the reference. The
        * reference's composer is one card and everything it carries is inside
        * it; a second bar underneath made the box look like it belonged to the
        * panel rather than to the message.
        *
        * All five settings are still real and still change behaviour. They are
        * reachable from Chat Settings, which is where a setting that is not
        * needed while typing belongs:
        *   run mode    -> Settings > Chat > Run mode     (cset-runmode)
        *   reasoning   -> Settings > Chat > Reasoning    (cset-reasoning)
        *   permissions -> Settings > Chat > Permissions  (cset-approval)
        *   persona     -> Settings > Agents
        */}

      {/*
        * Pertanyaan dari agen (tool ask_user) pindah ke dalam .ai-chat —
        * dirender sebagai bagian dari alur percakapan, bukan kapsul yang
        * menempel di kotak ketik. Alasannya: pertanyaan adalah PESAN dari
        * agen, jadi ia harus ikut menggulung bersama riwayat dan terbaca
        * di posisi bacaan user, bukan muncul dari bawah layar jauh dari
        * konteks pesan yang sedang dibaca. Kartu approval (agentConfirm)
        * tetap di sini karena itu keputusan keamanan, bukan percakapan.
        */}

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
    </div>
  );
}



/*
 * Memoised so the panel's parents (App.tsx, shell/Panel.tsx) cannot force a
 * re-render of the whole thing on unrelated store writes. The panel reads from
 * two stores through ~49 selectors, so without this a write anywhere in either
 * store reconciles all 2453 lines of JSX.
 */
const AiPanel = memo(AiPanelInner);
export default AiPanel;
