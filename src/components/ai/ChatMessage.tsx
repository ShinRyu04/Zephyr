import { memo, useEffect, useMemo, useState } from 'react';
import { Fragment } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi, isDestructive } from '../../lib/aiStore';
import { bagiHunk, barisDiff, ringkasDiff, type DiffRow } from '../../lib/simpleDiff';
import { clipboardWrite } from '../../lib/clipboard';
import { findModel, ProviderLogo } from '../../lib/modelCatalog';
import type { AgentToolRun, ChatMsg } from '../../lib/types';
import AiIkon from './AiIkon';
import Lightbox from './Lightbox';
import ReasoningBlock from './ReasoningBlock';
import { MsgTime } from './ChatStamp';
import { ThinkingLine } from './CliTimeline';
import { ToolRow, EditDiff, toolGlyph, toolKind } from './claudeCodeUi';
import { infoAksi, namaPolos, perintahAksi, sasaranAksi } from '../../lib/labelAksi';
import { tx, tf, useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { RobotAvatar, UserAvatar } from './RobotAvatar';

const SHELL_LANGS = new Set([
  'bash',
  'sh',
  'shell',
  'zsh',
  'ps1',
  'powershell',
  'pwsh',
  'cmd',
  'bat',
  'console',
  'terminal',
]);

/*
 * A bare file reference in the closing answer, e.g. `src/lib/types.ts:12`.
 *
 * The path needs its OWN capture group. It did not have one: the only group
 * was `(\d+)` for the line number, so `ref[1]` was the line number (or
 * undefined when there was none) and the path was never captured. Every click
 * on such a reference passed `undefined` to `openPathAt`, which reached
 * `kunciPath(undefined).replace(...)` and threw.
 *
 * That throw was not contained: it killed the RUNNING AGENT LOOP, because the
 * click handler is reached while the loop streams its answer. The visible
 * symptom was an agent that stopped mid-plan, right after an answer that
 * mentioned a file - with no error, no toast, and no tool call to explain it.
 */
const REF_RE =
  /^((?:\.{0,2}\/|\.{0,2}\\)?[\w@./\\-]+(?:\.\w{1,8}))(?::(\d+))?$/;

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const runInTerminal = useAi((s) => s.runInTerminal);
  const setToast = useAi((s) => s.setToast);
  const isShell = SHELL_LANGS.has(lang);

  const [pratinjau, setPratinjau] = useState<DiffRow[] | null>(null);

  const terapkan = () => {
    void import('../../lib/store').then(({ useStore }) => {
      const s = useStore.getState();
      const id = s.activeTabId;
      if (!id) return setToast(tx('No active editor tab'));
      const tab = s.tabs.find((t) => t.id === id);
      const lama = tab?.content ?? '';
      if (lama === code) return setToast(tx('The file contents are already the same as this code'));
      setPratinjau(barisDiff(lama, code));
    });
  };

  const konfirmasiTerapkan = () => {
    setPratinjau(null);
    void import('../../lib/store').then(({ useStore }) => {
      const s = useStore.getState();
      const id = s.activeTabId;
      if (!id) return setToast(tx('No active editor tab'));
      s.updateTabContent(id, code);
      setToast(tx('Tab contents replaced - Ctrl+S to save'));
    });
  };

  /**
   * Apply only the accepted hunks.
   *
   * The text comes from `EditDiff`, which rebuilt it through
   * `terapkanHunk` — the rule for a rejected deletion is inverted from a
   * rejected addition, and keeping that rule in one place is why the diff
   * component reconstructs rather than the caller.
   */
  const terapkanSebagian = (teks: string, diterima: number) => {
    const total = pratinjau ? bagiHunk(pratinjau).length : 0;
    setPratinjau(null);
    void import('../../lib/store').then(({ useStore }) => {
      const s = useStore.getState();
      const id = s.activeTabId;
      if (!id) return setToast(tx('No active editor tab'));
      s.updateTabContent(id, teks);
      setToast(tf('{a} of {b} changes applied - Ctrl+S to save', { a: String(diterima), b: String(total) }));
    });
  };
  const sisipkan = () => {
    void import('../../lib/mcpStore').then(({ runAction }) => {
      void runAction('editor_insert', { text: code }).then((r) => {
        const rr = r as { tabId?: string } | null;
        setToast(rr?.tabId ? tx('Code inserted at the cursor') : tx('No active tab to insert into'));
      });
    });
  };

  return (
    <div className="ai-code" data-lang={lang || 'text'}>
      <div className="ai-code-head">
        <span className="ai-code-lang">{lang || 'text'}</span>
        {!isShell && (
          <>
            <button
              className="ai-code-btn"
              data-testid="ai-apply-code"
              title={tx('Replace the active editor tab contents with this code')}
              onClick={terapkan}
            >
              Apply
            </button>
            <button
              className="ai-code-btn"
              data-testid="ai-insert-code"
              title={tx('Insert the code at the cursor position')}
              onClick={sisipkan}
            >
              Insert
            </button>
          </>
        )}
        <button
          className="ai-code-btn"
          data-testid="ai-copy-code"
          onClick={() => {
            void clipboardWrite(code).then(() => setToast(tx('Code copied')));
          }}
        >
          Copy
        </button>
        {isShell && (
          <button
            className="ai-code-btn is-run"
            data-testid="ai-run-code"
            title={isDestructive(code) ? tx('Risky command - will ask for confirmation') : tx('Send to the active terminal pane')}
            onClick={() => void runInTerminal(code)}
          >
            {tx('Run in Terminal')}
          </button>
        )}
      </div>
      <pre className="ai-pre">
        <code>{code}</code>
      </pre>
      {pratinjau && (
        /*
         * The apply-preview, drawn with the SAME diff grid as every other
         * change in the app.
         *
         * This block had its own `ai-diff-*` markup — a second, slightly
         * different numbered-gutter table that had to be kept in step with the
         * CLI tab's `cli-diff` by hand. It now runs through the shared
         * `EditDiff`, so an edit previewed here and the same edit reported by
         * the hosted CLI are pixel-identical; only the header differs, because
         * only this one has anything to apply.
         */
        <div className="ai-diff" data-testid="ai-diff">
          <div className="ai-diff-head">
            <span className="ai-diff-sum">
              {ringkasDiff(pratinjau).tambah} lines added ·{' '}
              {ringkasDiff(pratinjau).hapus} lines removed
            </span>
            <button className="ai-code-btn is-run" data-testid="ai-diff-ok" onClick={konfirmasiTerapkan}>
              Apply
            </button>
            <button
              className="ai-code-btn"
              data-testid="ai-diff-cancel"
              onClick={() => setPratinjau(null)}
            >
              Cancel
            </button>
          </div>
          <EditDiff rows={pratinjau} testidPrefix="ai" onPickHunks={terapkanSebagian} />
        </div>
      )}
    </div>
  );
}

/*
 * Markdown props, declared once.
 *
 * A message renders Markdown twice: the narration above each tool row, and the
 * answer at the end. Both were written out in full, so the plugin array, the
 * `pre` passthrough and the `a` override existed in two identical copies - and
 * were rebuilt on every render, for every message in the transcript, since
 * `remarkPlugins={[remarkGfm]}` and a fresh object literal allocate each time.
 * A 200-message transcript paid that twice per message per render for props
 * whose values never change. Only the `code` handler genuinely differs: the
 * narration blocks stay plain code, while the answer turns a single-word code
 * span into a clickable file reference.
 */
const MD_PLUGINS = [remarkGfm];

/* `pre` exists only to be unwrapped: CodeBlock renders its own <pre>. */
const MdPre: NonNullable<Components['pre']> = ({ children }) => <>{children}</>;

const MdLink: NonNullable<Components['a']> = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer noopener">
    {children}
  </a>
);

/*
 * Tabel jawaban dibungkus pembungkus yang bisa digeser mendatar.
 *
 * Panel AI lebih sering sempit daripada tabelnya, dan tanpa pembungkus ini
 * kolom terakhir terpotong begitu saja - tanpa cara melihat sisanya. Dulu
 * MD_JAWABAN sama sekali tidak menimpa `table`, jadi react-markdown memakai
 * bawaannya dan tabel langsung berada di dalam kolom yang sempit.
 * `data-testid` dipakai scripts/ukur-mutu-jawaban.mjs (mode --uji-tabel-perender)
 * untuk membuktikan override ini benar-benar terpakai saat merender tabel.
 */
const MdTabel: NonNullable<Components['table']> = ({ children }) => (
  <div className="ai-tabel-bungkus" data-testid="ai-tabel-bungkus" style={{ overflowX: 'auto' }}>
    <table>{children}</table>
  </div>
);

const KODE_LANG = /language-([\w-]+)/;

/**
 * Narration between tool rows.
 *
 * Inline code STAYS inline. This used to render every code span through
 * `CodeBlock`, so a `panel.height` mentioned mid-sentence came out as a full
 * code CARD - header, Apply/Insert/Copy buttons, its own box - and one
 * paragraph that named three keys was chopped into six boxes with prose
 * crumbs between them. That is the reported "text is cut off, then rejoined"
 * bug, and it is a RENDER bug: the paragraph arrived whole.
 *
 * Only a real fence (```lang) or a multi-line span is a block. A span longer
 * than 80 chars with no fence is not code either: it is the sentence a lone
 * stray backtick swallowed (a shortcut like Ctrl+` typed bare), and it comes
 * back as PLAIN TEXT - monospacing a whole sentence would keep the words but
 * still look broken.
 */
const MD_NARASI: Components = {
  pre: MdPre,
  table: MdTabel,
  code: ({ className, children }) => {
    const text = String(children ?? '').replace(/\n$/, '');
    const m = KODE_LANG.exec(className ?? '');
    if (m || text.includes('\n')) {
      return <CodeBlock code={text} lang={(m?.[1] ?? '').toLowerCase()} />;
    }
    if (text.length > 80) return <>{text}</>;
    return <code className="ai-inline">{text}</code>;
  },
  a: MdLink,
};

/**
 * The closing answer, where a bare path like `src/lib/types.ts:12` opens the
 * file instead of sitting there as plain text.
 */
const MD_JAWABAN: Components = {
  pre: MdPre,
  table: MdTabel,
  code: ({ className, children }) => {
    const text = String(children ?? '').replace(/\n$/, '');
    const m = KODE_LANG.exec(className ?? '');
    if (!m && !text.includes('\n')) {
      /* A lone stray backtick swallows the sentence after it; that is text,
         not a file reference and not a code span (same rule as MD_NARASI). */
      if (text.length > 80) return <>{text}</>;
      const ref = REF_RE.exec(text);
      if (ref) {
        return (
          <button
            className="ai-file-ref"
            data-testid="ai-file-ref"
            title={`Open ${ref[1]}${ref[2] ? `:${ref[2]}` : ''}`}
            onClick={() => {
              void import('../../lib/store').then(({ useStore }) => {
                const line = ref[2] ? Number(ref[2]) : 1;
                /* ref[1] = path, ref[2] = nomor baris opsional. Keduanya
                   diperiksa: referensi yang tidak lengkap harus tidak bisa
                   diklik, bukan melempar saat diklik. */
                const berkasRef = ref[1];
                if (berkasRef) void useStore.getState().openPathAt(berkasRef, line);
              });
            }}
          >
            {text}
          </button>
        );
      }
      return <code className="ai-inline">{text}</code>;
    }
    return <CodeBlock code={text} lang={(m?.[1] ?? '').toLowerCase()} />;
  },
  a: MdLink,
};

/*
 * Read-only tools that get folded together when they run back to back.
 *
 * This is the opencode/Hermes idea (their CONTEXT_GROUP_TOOLS): a run of plain
 * reads - read a file, list a folder, grep, glob, web_fetch - is one act of
 * gathering, not five facts. Drawing five separate rows for it buries the rows
 * that DO matter (the write, the edit with its diff, the command) under a pile
 * of "Read x / Read y / List z". Folding the run into one "Explored 3 files"
 * line keeps the transcript about the work, not the bookkeeping.
 *
 * Deliberately NARROW: only passive reads. `bash_run` is exec (it can change
 * the world), edits/writes carry diffs the reader must see, asking the user
 * and subagents are decisions - none of those fold. A tool that has a diff, failed,
 * or is the newest in flight never joins a group either (see the grouping
 * function), so a broken step is never hidden inside a summary.
 */
const TOOL_BACA_DIKELOMPOKKAN = new Set([
  'read_file',
  'list_directory',
  'grep',
  'glob',
  'web_fetch',
]);

type SegmenTool =
  | { jenis: 'tunggal'; i: number }
  | { jenis: 'baca'; items: number[] };

/*
 * Group consecutive foldable reads into runs; everything else stays its own
 * segment, in place. A run of one is left as a normal row - a "1 file" summary
 * is longer than the row it replaces.
 *
 * `indeksSibuk` is the tool currently running (if any): it must never be folded
 * away into a summary, because it is the one row the reader is watching.
 */
function kelompokkanTools(
  tools: readonly AgentToolRun[],
  indeksSibuk: number,
): SegmenTool[] {
  const segmen: SegmenTool[] = [];
  let run: number[] = [];
  const tutupRun = () => {
    if (run.length >= 2) segmen.push({ jenis: 'baca', items: run });
    else for (const i of run) segmen.push({ jenis: 'tunggal', i });
    run = [];
  };
  for (let i = 0; i < tools.length; i += 1) {
    const t = tools[i];
    const bolehGabung =
      TOOL_BACA_DIKELOMPOKKAN.has(namaPolos(t.name)) &&
      t.ok &&
      i !== indeksSibuk;
    if (bolehGabung) {
      run.push(i);
    } else {
      tutupRun();
      segmen.push({ jenis: 'tunggal', i });
    }
  }
  tutupRun();
  return segmen;
}

/*
 * One row for a run of plain reads: "Explored 3 files".
 *
 * Collapsed it is a single line; expanded it lists each file, so nothing is
 * hidden, just folded. Kept visual weight BELOW a normal tool row (no stat
 * column, muted) so the eye skips it and lands on the edits and commands that
 * matter. The reader who wants the detail clicks once.
 */
function BarisBacaBerkelompok({
  jumlah,
  tools,
  tr,
  tf,
}: {
  jumlah: number;
  tools: readonly AgentToolRun[];
  tr: (s: string) => string;
  tf: (s: string, v: Record<string, string | number>) => string;
}) {
  /* The collapsed row's target: the first few files this run touched, so the
     reader can tell WHICH reads these were without expanding. */
  const ringkas =
    tools
      .map((t) => sasaranAksi(t.args) || infoAksi(t.name).label)
      .slice(0, 3)
      .join(' · ') + (tools.length > 3 ? tr(' …') : '');
  return (
    /*
     * A run of read-only steps, folded into ONE row of the shared kit.
     *
     * This used to be hand-rolled `ai-toolrun is-grup` markup — the last place
     * in Chat AI still drawing a tool row by hand after every single-call row
     * moved to `claudeCodeUi`. Keeping it meant the two spellings could drift
     * apart, and a summary row that does not look like the rows it summarises
     * reads as a different kind of thing rather than the same thing collapsed.
     *
     * The kit draws the row; the individual steps ride along as children, so
     * the group keeps its "Explored N items" header AND its expanded list while
     * matching the CLI tab down to the caret and glyph.
     */
    <ToolRow
      name={
        jumlah === 1
          ? tf('Explored {n} item', { n: jumlah })
          : tf('Explored {n} items', { n: jumlah })
      }
      title={ringkas}
      onImage={() => {}}
    >
      <div className="ai-grup-isi">
        {tools.map((t, k) => {
          const info = infoAksi(t.name);
          const target = sasaranAksi(t.args);
          return (
            /*
             * The kit's own classes, not the retired `ai-toolrun-*` family.
             *
             * `ai-toolrun-*` is the markup the shared kit replaced, and it is
             * still present only because this one nested list was missed. Using
             * it here meant the icon colour came from a rule that the kit's own
             * `.cli-tool-ikon.is-<kind>` also sets — two families describing the
             * same thing, with the loser decided by stylesheet order. The kit's
             * classes are what every other row in both transcripts uses.
             */
            <div className="ai-grup-baris" key={k}>
              <span className={`cli-tool-ikon is-${toolKind(t.name)}`} aria-hidden="true">
                <AiIkon name={toolGlyph(t.name) as never} size={12} />
              </span>
              <span className="cli-tool-name">{info.label}</span>
              {target && <code className="ai-grup-args" title={target}>{target}</code>}
              {!t.ok && <span className="cli-tool-fail">{tx('failed')}</span>}
            </div>
          );
        })}
      </div>
    </ToolRow>
  );
}

function ChatMessageInner({ msg }: { msg: ChatMsg }) {
  /*
   * Transcript appearance, from Chat Settings.
   *
   * Read here, at the leaf that draws each piece, rather than threaded down as
   * props: the three switches were live in the settings page but nothing in the
   * transcript ever asked for them, so turning "Show thinking" off left the
   * reasoning block on screen.
   */
  const showThinking = useAi((s) => s.showThinking);
  const showStamps = useAi((s) => s.showStamps);
  /*
   * Narration slices, one per tool, from the `atChar` offsets stamped at
   * append time (see aiStore). `potongNarasi[i]` is the text that arrived
   * before tool i ran; the tool loop below renders it above that tool's row.
   * `ekorNarasi` is whatever arrived after the last tool. Messages without
   * offsets (written before `atChar`) slice nothing and the tail carries the
   * whole text - the legacy layout: all tools, then all text. Computed ONCE
   * per render so both the tool block and the tail read the same numbers.
   *
   * `atChar` is an offset into the message TEXT, so that first sentence is a
   * promise: each offset has to still point at the same place in the text that
   * is on screen, otherwise the rows and the prose stop describing the same
   * run. Two ways to break it, both repaired here rather than in aiStore -
   * this is the one place that knows how a row and a slice are supposed to
   * line up, and aiStore only ever appends to the text:
   *
   *   - The text is shorter than it was. An offset then points past the end of
   *     what is left, and the row's narration reads as empty. The clamp below
   *     pulls the offset onto the last character that still exists instead.
   *   - The offsets stopped ascending. They are stamped in call order, so they
   *     only move backwards when the same message is stamped again after its
   *     text restarted - a retry or a resumed run keeps the old rows and
   *     counts the new text from zero. This used to sort the offsets and then
   *     index that sorted list by ROW position, which handed the first run's
   *     rows the second run's opening text. Walking the rows in order and
   *     flooring every bound at the running cursor gives each row its OWN text:
   *     nothing is handed to the wrong tool, and no span is used twice.
   */
  const alatNarasi = msg.tools ?? [];
  const isiNarasi = msg.content ?? '';
  const adaOffsetNarasi = alatNarasi.some((x) => typeof x.atChar === 'number');
  const potongNarasi: string[] = alatNarasi.map(() => '');
  let ekorNarasi = adaOffsetNarasi ? '' : isiNarasi;
  if (adaOffsetNarasi) {
    let a0 = 0;
    for (const [i, run] of alatNarasi.entries()) {
      /* No offset means no position is known for this row: it claims no
         narration and the cursor stays where the previous row left it. */
      const kasar = typeof run.atChar === 'number' ? run.atChar : a0;
      const b1 = Math.max(a0, Math.min(isiNarasi.length, kasar));
      potongNarasi[i] = isiNarasi.slice(a0, b1);
      a0 = b1;
    }
    ekorNarasi = isiNarasi.slice(a0);
  }
  /* Which attachment is open full-size, if any. `null` = the viewer is closed. */
  const [gambarBuka, setGambarBuka] = useState<string | null>(null);
  const tr = useT();
  const isUser = msg.role === 'user';
  const def = msg.model ? findModel(msg.model) : null;
  const regenerate = useAi((s) => s.regenerate);
  const setToast = useAi((s) => s.setToast);

  /**
   * Put every file this turn changed back the way it was.
   *
   * The two outcomes are reported differently on purpose. A clean restore says
   * how many files moved; a PARTIAL one names the failures, because a reader
   * who thinks everything was undone and finds one file still edited has lost
   * the very thing the button promised.
   */
  const pulihkan = async (cp: import('../../lib/checkpoint').Checkpoint) => {
    const { pulihkanCheckpoint } = await import('../../lib/checkpoint');
    const hasil = await pulihkanCheckpoint(cp, async (path) => {
      const { fsDelete } = await import('../../lib/commands');
      await fsDelete([path], false);
    });
    const jumlah = hasil.dipulihkan.length + hasil.dihapus.length;
    if (hasil.gagal.length === 0) {
      setToast(tf('{x} file dikembalikan', { x: String(jumlah) }));
      return;
    }
    const { useNotif } = await import('../../lib/notificationStore');
    useNotif.getState().notify({
      severity: 'error',
      message: tx('Sebagian berkas gagal dikembalikan'),
      detail: hasil.gagal.map((g) => `${g.path}: ${g.pesan}`).join('\n'),
      source: 'Checkpoint',
    });
  };

  /*
   * Tool rows after folding: runs of consecutive plain reads become one summary
   * segment, everything else stays its own row in place. Computed here rather
   * than per render so the DOM order stays stable across re-renders.
   */
  const indeksSibuk = msg.streaming ? (msg.tools?.length ?? 0) - 1 : -1;
  const segmenTools = useMemo(
    () => kelompokkanTools(msg.tools ?? [], indeksSibuk),
    [msg.tools, indeksSibuk],
  );

  /*
   * Seconds since this message started streaming.
   *
   * The thinking line prints a live count, and it has to come from a timer
   * rather than from a timestamp comparison at render time: the component
   * re-renders when tokens arrive, which on a slow provider can be seconds
   * apart, so a render-time diff would freeze the number exactly when the
   * reader is watching it. The interval only runs while the message is
   * streaming and nothing has arrived yet — the same condition that shows the
   * line — so an idle transcript is not waking up once a second for nothing.
   */
  const [detik, setDetik] = useState(0);
  useEffect(() => {
    if (!msg.streaming || msg.content || msg.reasoning) {
      setDetik(0);
      return;
    }
    const mulai = Date.now();
    const t = window.setInterval(() => {
      setDetik(Math.floor((Date.now() - mulai) / 1000));
    }, 1000);
    return () => window.clearInterval(t);
  }, [msg.streaming, msg.content, msg.reasoning]);

  /*
   * The avatar and the bubble are SIBLINGS inside a row wrapper.
   *
   * Not a child of `.ai-msg`, and that is the whole point: `.ai-msg` is a flex
   * COLUMN, so an avatar placed inside it stacks above the message instead of
   * sitting beside it. The row owns the horizontal axis and `.ai-msg` keeps the
   * vertical one it already had, so none of the bubble layout below changes.
   *
   * `row-reverse` mirrors the row for the user, which is what puts their avatar
   * on the right without reordering anything in the DOM.
   *
   * The marks are hidden entirely when the user has switched avatars off - see
   * `settings.agents.chatAvatar`. Rendering them and hiding them with CSS would
   * leave the gutter in place, which is the opposite of what "off" should mean.
   */
  /*
   * Read as `!== false`, not `=== true`: a missing value means ON.
   *
   * The Rust default is what actually applies on upgrade (`deep_merge` merges
   * rather than replaces), so a user who never touched this setting has no
   * `chatAvatar` key at all - and treating that as "off" would hide avatars from
   * everyone who did not ask for them to be hidden.
   */
  const pesanAvatar = useStore((s) => s.settings?.agents?.chatAvatar !== false);
  const fotoSaya = useStore((s) => s.settings?.agents?.userAvatarPath ?? null);

  /*
   * Voice, read field by field.
   *
   * NOT `useStore((s) => s.settings?.voice)`: that returns a fresh object on
   * every settings write, and zustand v5 compares selector results with `===`,
   * so every keystroke in Settings would re-render every message in the
   * transcript. Primitives only.
   */
  return (
    <div
      className={`ai-row${isUser ? ' is-user' : ''}${msg.error ? ' is-error' : ''}`}
      data-ai-row={msg.id}
    >
      {pesanAvatar && (
        <span className="ai-avatar" data-testid={isUser ? 'ai-avatar-saya' : 'ai-avatar-bot'}>
          {/*
            * 28px, not the old 22: at 22 a photo was too small to recognise, and
            * the whole point of setting one is being able to see it. The avatar
            * is still a mark beside the message, not a portrait - it stays well
            * inside the gutter the row reserves for it.
            */}
          {isUser ? <UserAvatar src={fotoSaya} name="" size={28} /> : <RobotAvatar size={28} />}
        </span>
      )}
      <div
        className={`ai-msg is-${msg.role}${msg.error ? ' is-error' : ''}`}
        data-ai-msg={msg.id}
        data-role={msg.role}
      >
      <div className="ai-msg-head">
        {isUser ? (
          <span className="ai-who">{tr('Kamu')}</span>
        ) : (
          <>
            <ProviderLogo id={def?.provider ?? 'generic'} size={14} />
            <span className="ai-who">{def?.label ?? 'Assistant'}</span>
          </>
        )}
        <span className="ai-msg-actions">
          {/*
            * When the message arrived, in the same row as the actions.
            *
            * Placed here — rather than as its own line — because this row is
            * already collapsed to zero height (ai-streaming.css) and its
            * children are absolutely positioned, so a timestamp costs no
            * vertical space and cannot re-open the gap that was just removed.
            * It settles on the side the message came from, next to the buttons
            * that belong to it.
            */}
          {showStamps && <MsgTime at={msg.at} />}
          {/*
            * The receipt for a HydraFusion turn, beside the timestamp exactly
            * where the reference product puts it ("11:49 AM · HydraFusion ·
            * 444 credits").
            *
            * WHY here and not only in Chat Settings: `hydraTerakhir` describes
            * the newest run, so a reader scrolling an old answer would see the
            * newest route attached to it. The message carries its own copy, so
            * every bubble tells the truth about what produced it.
            *
            * The figure is TOKENS, not credits: Zephyr has no billing and does
            * not know any provider's price list, so inventing a money number
            * would be a lie the reader cannot check. `0/0` is stated as "not
            * reported" rather than printed as zero spend.
            */}
          {!isUser && msg.hydra && (
            <span
              className="ai-msg-hydra"
              data-testid="ai-msg-hydra"
              data-jalur={msg.hydra.jalur}
              title={[
                'Response details',
                `Model: ${msg.hydra.model}`,
                `Route: ${msg.hydra.jalur} · ${msg.hydra.request} request(s) · ${msg.hydra.berhenti}`,
                msg.hydra.pemakaian && msg.hydra.pemakaian.input + msg.hydra.pemakaian.output > 0
                  ? `Tokens: ${msg.hydra.pemakaian.input} in / ${msg.hydra.pemakaian.output} out`
                  : 'Tokens: the provider reported no token usage',
                ...(msg.hydra.catatanTahap ?? []),
              ].join('\n')}
            >
              {(() => {
                const t = msg.hydra.pemakaian;
                const total = t ? t.input + t.output : 0;
                return total > 0 ? `${total} ${tr('tokens')}` : tr('no token usage reported');
              })()}
            </span>
          )}
          {/*
            * Undo everything THIS turn changed.
            *
            * Sits on the turn rather than in a global toolbar because the reader
            * decides to undo while looking at the answer they are unhappy with —
            * the button belongs where their eye already is.
            *
            * Only shown when the turn actually wrote something: a read-only turn
            * has no checkpoint, and a button that does nothing is worse than no
            * button.
            */}
          {!isUser && !msg.streaming && msg.checkpoint && (
            <button
              className="ai-msg-act"
              data-testid="ai-restore-checkpoint"
              data-files={msg.checkpoint.berkas.length}
              title={tx('Put back every file this turn changed')}
              onClick={() => void pulihkan(msg.checkpoint!)}
            >
              ⎌
            </button>
          )}
          {!isUser && !msg.streaming && !msg.error && (
            <button
              className="ai-msg-act"
              data-testid="ai-regenerate"
              title={tr('Buat ulang jawaban ini')}
              onClick={() => void regenerate()}
            >
              ↻
            </button>
          )}
          {!msg.streaming && !msg.error && (
            <button
              className="ai-msg-act"
              data-testid="ai-copy-msg"
              title={tx('Copy the answer contents')}
              onClick={() => {
                void clipboardWrite(msg.content).then(() => setToast(tx('Copied')));
              }}
            >
              ⧉
            </button>
          )}
          {/*
            Read this answer aloud.
            *
            * Only on a finished, non-error assistant reply: a streaming answer
            * read out loud is restarted on every chunk, so the user would hear
            * the first sentence over and over and never reach the second, and an
            * error message is not something anyone wants spoken.
            *
            * AND ONLY WHEN THERE IS SOMETHING TO READ. A reply can finish with no
            * text at all - a run that was cancelled after the tool calls, or a
            * provider that returned an empty body. The button used to appear
            * anyway and then do nothing when pressed, because the text it was
            * handed was empty: a control that looks live and is silent reads as
            * broken, and the user has no way to tell "nothing to say" from "the
            * feature does not work". Worse, this was reported as exactly that -
            * voice not working - when the real state was a message with no words
            * in it.
            *
            * The button reflects THIS message being spoken, not speech in
            * general: the engine's queue is global, so a row reporting only its
            * own state would claim to be silent while a different answer played.
            */}
        </span>
        {msg.attached && (
          <span className="ai-attach-chip" title={msg.attached.path} data-testid="ai-attach-chip">
            {msg.attached.path.split(/[\\/]/).pop()}
            {msg.attached.truncated ? ' (12KB)' : ''}
          </span>
        )}
        {msg.streaming && (
          <span className="ai-typing" data-testid="ai-typing" role="status">
            {/*
             * Eight cells, because .ai-dots is a 4x2 grid with a staggered
             * delay per child — one <i> rendered a single square and the wave
             * had nothing to travel across, which is why "thinking" looked
             * static. The count is fixed by the CSS; change both together.
             */}
            <span className="ai-dots" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            {tx('Thinking')}
          </span>
        )}
      </div>

      {msg.error ? (
        <p className="ai-error" data-testid="ai-error">
          {msg.error}
        </p>
      ) : (
        <div className="ai-body" data-ai-body={msg.id}>
          {(() => {
            
            const imgs = msg.images?.length ? msg.images : msg.image ? [msg.image] : [];
            if (imgs.length === 0) return null;
            return (
              <div className="ai-msg-imgs" data-testid="ai-msg-imgs">
                {imgs.map((src, i) => (
                  /*
                   * Clicking an attachment opens it full-size.
                   *
                   * The thumbnail is 88px - enough to confirm the image arrived,
                   * nowhere near enough to read what is in it. Before this the
                   * click did nothing, so the only way to actually look at a
                   * screenshot the user attached was to find the file on disk.
                   */
                  <img
                    className="ai-msg-img"
                    key={i}
                    src={src}
                    alt={`Attachment ${i + 1}`}
                    data-testid="ai-msg-img"
                    role="button"
                    tabIndex={0}
                    title={tr('Click to open')}
                    onClick={() => setGambarBuka(src)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      setGambarBuka(src);
                    }}
                  />
                ))}
              </div>
            );
          })()}
          {msg.tools && msg.tools.length > 0 && (
            <div className="ai-toolruns" data-timeline data-testid="ai-toolruns">
              {/*
                * While streaming, the newest tool is the one in flight - it must
                * stay a full row so the reader watches it, not a summary.
                */}
              {segmenTools.map((seg) => {
                if (seg.jenis === 'baca') {
                  /*
                   * The narration belongs to the FIRST tool of the run - it is
                   * the sentence that motivated gathering, and it has to stay in
                   * front of the summary or the reader loses the "why" the
                   * sentence carried. Later tools in the run have no narration
                   * of their own (their atChar equals the first's).
                   */
                  const narasiGrup = potongNarasi[seg.items[0]] ?? '';
                  return (
                    <Fragment key={`grp-${seg.items[0]}`}>
                      {narasiGrup.trim() ? (
                        <div className="ai-segmen" data-testid="ai-segmen" data-segmen={seg.items[0]}>
                          <Markdown remarkPlugins={MD_PLUGINS} components={MD_NARASI}>
                            {narasiGrup}
                          </Markdown>
                        </div>
                      ) : null}
                      <BarisBacaBerkelompok
                        jumlah={seg.items.length}
                        tools={seg.items.map((i) => msg.tools![i])}
                        tr={tr}
                        tf={tf}
                      />
                    </Fragment>
                  );
                }
                const i = seg.i;
                const t = msg.tools![i];
                /*
                 * Facts about the call, on one line.
                 *
                 * A collapsed row that shows only a tool name does not say
                 * whether the read was twelve lines or four hundred. Only
                 * numbers the tool actually reported go in, so a call with no
                 * measurable output shows nothing rather than a false zero.
                 */
                const bit: string[] = [];
                if (typeof t.lines === 'number' && t.lines > 1) {
                  bit.push(tf('{n} lines', { n: t.lines }));
                }
                if (typeof t.bytes === 'number' && t.bytes >= 1024) {
                  bit.push(`${(t.bytes / 1024).toFixed(1)}KB`);
                }
                if (typeof t.additions === 'number' && t.additions > 0) {
                  bit.push(`+${t.additions}`);
                }
                if (typeof t.deletions === 'number' && t.deletions > 0) {
                  bit.push(`-${t.deletions}`);
                }
                const stat = bit.join(' · ');
                /*
                 * The narration that arrived before this tool ran, rendered as
                 * the row's SIBLING - not its child. As a child, the DOM order
                 * reads tool-then-text (the row opens before its own header),
                 * which confuses every order-based check and inherits the row
                 * styling into the prose. As a sibling inside one Fragment,
                 * the key stays on the Fragment, so React still reconciles
                 * each teks/tool pair as one unit.
                 */
                const narasi = potongNarasi[i] ?? '';
                return (
                <Fragment key={i}>
                  {narasi.trim() ? (
                    <div className="ai-segmen" data-testid="ai-segmen" data-segmen={i}>
                      <Markdown remarkPlugins={MD_PLUGINS} components={MD_NARASI}>
                        {narasi}
                      </Markdown>
                    </div>
                  ) : null}
                  {/*
                    * One tool call, drawn by the SAME component the hosted
                    * Claude Code tab uses.
                    *
                    * This row used to be its own thing: `ai-toolrun` markup
                    * with a hand-rolled header, INPUT/OUTPUT panels in the
                    * body, and a separate `DiffViewer` card bolted underneath
                    * for file edits. Alongside the CLI tab's timeline it read
                    * as the older, worse half of the app - which is backwards,
                    * since Chat AI is what most Zephyr users actually run
                    * (the hosted CLI needs a Claude subscription they may not
                    * have).
                    *
                    * The kit in `claudeCodeUi.tsx` is the CLI tab's renderer,
                    * lifted out so both call it: caret, kind-coloured glyph,
                    * tool name, the target it acted on, a +N/-N stat, elapsed
                    * time, exit code - and a body that shows the input, an
                    * inline zoomable image, or the VSCode-style diff. A file
                    * edit opens expanded, exactly like the extension.
                    *
                    * Chat AI's own extras (copy output / copy input / open in
                    * terminal) ride along as children, so nothing was lost in
                    * the swap.
                    */}
                  <ToolRow
                    /*
                     * The RAW tool name, not `infoAksi().label`.
                     *
                     * The label is localised prose ("Run", "Read", "Search")
                     * and it was being handed to `ToolRow` as the tool's
                     * identity. The kit picks the glyph and the colour from the
                     * name, and it knows the tool as `bash_run` — not `Run` —
                     * so every shell call in Chat AI came out with the READ
                     * colour and a document glyph. The row still READS as
                     * "Run npm test" because the label is what the eye wants;
                     * it just is not what the icon lookup needs. `labelName`
                     * carries the human word separately.
                     */
                    name={namaPolos(t.name)}
                    labelName={infoAksi(t.name).label}
                    title={sasaranAksi(t.args) || perintahAksi(t.name, t.args)}
                    input={perintahAksi(t.name, t.args) ? '' : t.args}
                    output={t.result}
                    status={t.ok ? 'ok' : 'fail'}
                    exitCode={t.exitCode}
                    diffPatch={t.result}
                    stat={stat}
                    ms={t.ms}
                    onImage={setGambarBuka}
                  >
                    <div className="cli-tool-act">
                      <button
                        className="cli-tool-btn"
                        data-testid="ai-toolrun-copy"
                        title={tx('Copy the output')}
                        onClick={() => {
                          void clipboardWrite(t.result).then(() => setToast(tx('Output copied')));
                        }}
                      >
                        <AiIkon name="clipboard" size={12} />
                        {tx('Copy')}
                      </button>
                      <button
                        className="cli-tool-btn"
                        data-testid="ai-toolrun-copy-in"
                        title={tx('Copy the input')}
                        onClick={() => {
                          void clipboardWrite(t.args).then(() => setToast(tx('Input copied')));
                        }}
                      >
                        <AiIkon name="clipboard" size={12} />
                        {tx('Copy input')}
                      </button>
                      <button
                        className="cli-tool-btn"
                        data-testid="ai-toolrun-open"
                        title={tx('Open a terminal pane in the bottom panel')}
                        onClick={() => {
                          void import('../../lib/panelStore').then((m) => {
                            m.usePanel.getState().focusTab('terminal');
                          });
                        }}
                      >
                        <AiIkon name="chev-right" size={12} />
                        {tx('Open in terminal')}
                      </button>
                    </div>
                  </ToolRow>
                </Fragment>
                );
              })}
            </div>
          )}
          {isUser ? (
            <p className="ai-plain">{msg.content}</p>
          ) : (
            <>
              {/*
               * The reasoning block, folded by default.
               *
               * It used to be thrown away entirely: the comment here argued the
               * model's thinking is written for the model, so it was suppressed
               * and only the answer was shown. That hid the one thing that makes
               * a long agent run legible — WHY it did what it did — and it made
               * the transcript jump straight from the user's question to a pile
               * of tool calls with nothing explaining the gap.
               *
               * Hermes keeps it, collapsed, behind a one-line header that says
               * how long it took. The reader who wants the reasoning clicks once;
               * the reader who does not is never made to scroll past it.
               */}
              {/* Shown WHILE streaming too, not only after. Waiting for the
                  stream to finish hid the reasoning during the exact window it
                  is useful in, and hid it permanently on runs that ended in an
                  error - which is when "it was thinking about X" matters most.
                  Wrapped in the shared timeline container so the rail and the
                  dashed thinking node reach it here exactly as they do in the
                  hosted Claude Code tab - without it the block was the one row
                  whose text the rail ran straight through. */}
              {showThinking && msg.reasoning && (
                <div className="ai-timeline" data-timeline data-testid="ai-timeline-reason">
                  <ReasoningBlock teks={msg.reasoning} ms={msg.reasoningMs} berjalan={msg.streaming} />
                </div>
              )}
              <Markdown remarkPlugins={MD_PLUGINS} components={MD_JAWABAN}>
              {ekorNarasi}
            </Markdown>
            </>
          )}

          {/*
            * Thinking state, in the middle of the transcript.
            *
            * It used to live only in the header row, which sits at the top of
            * the bubble — on a long conversation that is off-screen while the
            * user waits, so the panel looked frozen. It belongs where the
            * answer will appear: the eye is already there.
            *
            * Only shown when there is nothing yet to read. Once tokens start
            * arriving the text itself is the progress indicator, and two
            * signals at once is noise.
            *
            * It is the SAME component the hosted Claude Code tab uses, so the
            * two transcripts waited differently before and cannot drift again.
            * Chat AI used to print "Thinking about the next step" beside three
            * blinking dots — a cursor, which reads as a box waiting for input
            * rather than a model working. The sparkle sweeps instead, and the
            * only difference between the panels is the colour, which comes
            * from `--think-accent` in CSS.
            */}
          {!isUser && msg.streaming && !msg.content && !msg.reasoning && (
            <div className="ai-think-wrap" data-testid="ai-think-body">
              <ThinkingLine />
              {/*
               * How long this has been going.
               *
               * The line reads "✻ Thinking…   6s" — the same sentence plus a
               * live count. Without it the line looks the same at two seconds
               * and at two minutes, and the reader cannot tell a slow provider
               * from a stuck one. It only appears once the wait is worth
               * mentioning: a sub-second flash of a number reads as a glitch.
               */}
              {detik > 0 && (
                <span className="ai-think-sec" data-testid="ai-think-sec">
                  {detik}s
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {/*
        * The full-size viewer, mounted only while an image is open.
        *
        * Mounted at the END of the message rather than at the panel level so it
        * needs no store of its own - the message already owns the list of
        * attachments, and one component that opens its own images is smaller
        * than a global viewer plus the plumbing to feed it a source.
        */}
      {gambarBuka && <Lightbox src={gambarBuka} onClose={() => setGambarBuka(null)} />}
      </div>
    </div>
  );
}

export default memo(ChatMessageInner);
