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

  /*
   * `kotak` is a BOX, not code.
   *
   * The model produces it with the `kotak` tool: a title, an optional one-line
   * summary, then rows of `label | value`. Rendering it through the code path
   * would give it a language chip, Apply/Insert/Copy buttons and monospace - all
   * wrong for what is a formatted answer block. So it is drawn as its own thing
   * and returns before any of that machinery runs.
   */
  if (lang === 'kotak') return <KotakKotak teks={code} />;

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
 *
 * The `overflowX` used to be an INLINE style here, and that was the bug: an
 * inline style beats the stylesheet, so the wrapper could never gain the
 * `width: max-content` / `min-width: 100%` rules that make columns keep their
 * words whole. Inline styles are now gone - the class carries everything, in
 * one place, where a later rule can still override it.
 *
 * `data-testid` dipakai scripts/ukur-mutu-jawaban.mjs (mode --uji-tabel-perender)
 * untuk membuktikan override ini benar-benar terpakai saat merender tabel.
 */
const MdTabel: NonNullable<Components['table']> = ({ children }) => (
  <div className="ai-tabel-bungkus" data-testid="ai-tabel-bungkus">
    <table>{children}</table>
  </div>
);

const KODE_LANG = /language-([\w-]+)/;

/**
 * A `kotak` block: title, optional summary, then `label | value` rows.
 *
 * The parser lives HERE rather than in the tool because the tool's job is to
 * emit a string and this component's job is to read it - two places that both
 * parse would be two places to disagree. A row without `|` is a SECTION heading,
 * which is what lets one box group a long list without nesting.
 *
 * Malformed input never throws: a fence the model wrote by hand (wrong separator,
 * stray text) degrades to the plain lines it actually contains, because a broken
 * box is worse than an unstyled one.
 */
function KotakKotak({ teks }: { teks: string }) {
  const baris = teks.split(/\r?\n/);
  const pisah = baris.findIndex((b) => b.trim() === '---');
  const kepala = (pisah >= 0 ? baris.slice(0, pisah) : baris).filter((b) => b.trim());
  const isi = pisah >= 0 ? baris.slice(pisah + 1).filter((b) => b.trim()) : [];
  const judul = kepala[0] ?? '';
  const ringkas = kepala.slice(1).join(' ');

  return (
    <div className="ai-kotak" data-testid="ai-kotak">
      <div className="ai-kotak-head">
        <span className="ai-kotak-judul">{judul}</span>
        {ringkas && <span className="ai-kotak-ringkas">{ringkas}</span>}
      </div>
      <div className="ai-kotak-isi">
        {isi.map((b, i) => {
          /* Split on the FIRST unescaped pipe: a value may itself contain one. */
          const m = /^(.*?[^\\])\|(.*)$/.exec(b);
          if (!m) {
            return (
              <div className="ai-kotak-bagian" key={i}>
                {b.replace(/\\\|/g, '|')}
              </div>
            );
          }
          return (
            <div className="ai-kotak-baris" key={i}>
              <span className="ai-kotak-label">{m[1].replace(/\\\|/g, '|').trim()}</span>
              <span className="ai-kotak-nilai">{m[2].replace(/\\\|/g, '|').trim()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
 * ── "Worked for 6s" ─ the TRAE / VS Code accordion ────────────────────────
 *
 * A finished turn used to render every tool as its own bordered card stacked
 * down the transcript. Eight calls meant eight cards, and the answer the reader
 * actually wanted was pushed below a wall of chrome. Measured in the side
 * column: ten collapsed rows filled an entire 912px screen.
 *
 * TRAE, Cursor and VS Code's Copilot all solve this the same way, and it is the
 * right shape: ONE summary line for the whole run of work ("Worked for 6s"),
 * collapsed by default once the run is done, with the individual steps
 * available on one click. The answer then sits directly under a single thin
 * line instead of under eight cards.
 *
 * Three deliberate choices:
 *
 *  1. It stays OPEN while the run is live. The reader is watching progress; a
 *     summary that hides the step in flight would be a step backwards.
 *  2. The steps inside are FLAT rows (icon + label + target), not cards. The
 *     card border is what made the wall feel heavy - the same information at
 *     22px per row reads as a list, which is what it is.
 *  3. A failure keeps the group open and shows the count, because a run that
 *     ended badly must not look tidy.
 */
function GrupKerja({
  tools,
  tr,
  tf,
  live,
}: {
  tools: readonly AgentToolRun[];
  tr: (s: string) => string;
  tf: (s: string, v: Record<string, string | number>) => string;
  live: boolean;
}) {
  /* A click is the reader taking control; before that, live-ness decides. */
  const [pilihan, setPilihan] = useState<boolean | null>(null);
  const terbuka = pilihan ?? live;

  const jumlah = tools.length;
  const gagal = tools.filter((t) => t.ok === false).length;
  const totalMs = tools.reduce((n, t) => n + (typeof t.ms === 'number' ? t.ms : 0), 0);

  /* The one-line summary, in the words a reader uses: what was touched. */
  const berkas = new Set<string>();
  let perintah = 0;
  let lain = 0;
  for (const t of tools) {
    const nama = namaPolos(t.name);
    if (nama === 'bash_run' || nama === 'sh') perintah += 1;
    else {
      const target = sasaranAksi(t.args);
      if (target) berkas.add(target);
      else lain += 1;
    }
  }
  const bagian: string[] = [];
  if (berkas.size) bagian.push(tf('{n} files', { n: berkas.size }));
  if (perintah) bagian.push(tf('{n} commands', { n: perintah }));
  if (lain) bagian.push(tf('{n} steps', { n: lain }));
  const ringkas = bagian.join(' · ');

  /* "Worked for 6s" / "Worked for 1m 4s" - the duration the reader sees first. */
  const durasi =
    totalMs >= 60000
      ? `${Math.floor(totalMs / 60000)}m ${Math.round((totalMs % 60000) / 1000)}s`
      : `${Math.max(1, Math.round(totalMs / 1000))}s`;
  const judul = live
    ? tf('Working… {t}', { t: durasi })
    : tf('Worked for {t}', { t: durasi });

  return (
    <div
      className={`ai-kerja${terbuka ? ' is-open' : ''}${gagal ? ' is-gagal' : ''}`}
      data-testid="ai-kerja"
      data-open={terbuka ? '1' : '0'}
      data-jumlah={jumlah}
    >
      <button
        type="button"
        className="ai-kerja-head"
        data-testid="ai-kerja-toggle"
        aria-expanded={terbuka}
        onClick={() => setPilihan(!terbuka)}
        title={ringkas || judul}
      >
        <span className="ai-kerja-caret" aria-hidden="true">
          {terbuka ? '▾' : '▸'}
        </span>
        <span className="ai-kerja-judul">{judul}</span>
        {ringkas && <span className="ai-kerja-ringkas">{ringkas}</span>}
        {gagal > 0 && (
          <span className="ai-kerja-gagal">
            {tf('{n} failed', { n: gagal })}
          </span>
        )}
      </button>

      {terbuka && (
        <div className="ai-kerja-isi" data-testid="ai-kerja-isi">
          {tools.map((t, k) => {
            const info = infoAksi(t.name);
            const target = sasaranAksi(t.args);
            return (
              <div
                className={`ai-grup-baris${t.ok === false ? ' is-gagal' : ''}`}
                key={k}
                data-testid="ai-kerja-baris"
              >
                <span className={`cli-tool-ikon is-${toolKind(t.name)}`} aria-hidden="true">
                  <AiIkon name={toolGlyph(t.name) as never} size={12} />
                </span>
                <span className="cli-tool-name">{info.label}</span>
                {target && (
                  <code className="ai-grup-args" title={target}>
                    {target}
                  </code>
                )}
                {t.ok === false && <span className="cli-tool-fail">{tr('failed')}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/*
 * The one-line fact strip for a tool row: "42 lines · 1.2KB · +3 -1".
 *
 * Only numbers the tool actually reported go in, so a call with no measurable
 * output shows nothing rather than a false zero. Extracted from the render body
 * because both layouts (the interleaved rows and the accordion's list) describe
 * the same facts, and two copies would drift.
 */
function statUntuk(t: AgentToolRun, tf: (s: string, v: Record<string, string | number>) => string): string {
  const bit: string[] = [];
  if (typeof t.lines === 'number' && t.lines > 1) bit.push(tf('{n} lines', { n: t.lines }));
  if (typeof t.bytes === 'number' && t.bytes >= 1024) bit.push(`${(t.bytes / 1024).toFixed(1)}KB`);
  if (typeof t.additions === 'number' && t.additions > 0) bit.push(`+${t.additions}`);
  if (typeof t.deletions === 'number' && t.deletions > 0) bit.push(`-${t.deletions}`);
  return bit.join(' · ');
}

/*
 * Split a message's tools into groups, where a group is "the calls that ran
 * after one sentence of narration".
 *
 * WHY groups and not one block: the reader's screenshot showed the failure of
 * the all-or-nothing approach. A message that narrated ONCE rendered every tool
 * as a bordered card, so three shell commands stacked into three boxes. But a
 * message that narrated NOTHING folded into a single line. Two layouts for the
 * same thing, chosen by whether one sentence happened to be present.
 *
 * TRAE's shape is uniform: narration starts a new group, and every group folds
 * into its own thin summary line. That is what this produces - the sentence
 * stays on screen, and the calls under it are a list behind one bar.
 *
 * `indeksSibuk` (the call in flight) is never folded away: it is the one row
 * the reader is watching.
 */
function kelompokPerNarasi(
  tools: readonly AgentToolRun[],
  narasi: readonly string[],
  indeksSibuk: number,
): Array<{ narasi: string; items: number[] }> {
  const grup: Array<{ narasi: string; items: number[] }> = [];
  let kini: { narasi: string; items: number[] } | null = null;
  for (let i = 0; i < tools.length; i += 1) {
    const teks = (narasi[i] ?? '').trim();
    /*
     * A sentence opens a group. A tool with no sentence joins the current one,
     * and if there is none yet it starts an unnamed group - which is exactly
     * the "plan, then execute a batch" shape.
     */
    if (teks || !kini) {
      kini = { narasi: teks, items: [] };
      grup.push(kini);
    }
    kini.items.push(i);
  }
  /* The call in flight must stay visible: pull it out of its group. */
  if (indeksSibuk >= 0 && indeksSibuk < tools.length) {
    for (const g of grup) {
      const pos = g.items.indexOf(indeksSibuk);
      if (pos >= 0) {
        g.items.splice(pos, 1);
        break;
      }
    }
  }
  return grup.filter((g) => g.items.length > 0 || g.narasi !== '');
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
  /*
   * The same tools, grouped by narration instead of by kind.
   *
   * `segmenTools` answers "which reads can share a summary"; this answers "which
   * calls ran after one sentence", which is what the accordion needs. Both are
   * kept because `BarisBacaBerkelompok` still uses the first for its read-run
   * summary inside a group.
   */
  const indeksToolSibuk = indeksSibuk;
  const grupTools = useMemo(
    () => kelompokPerNarasi(msg.tools ?? [], potongNarasi, indeksSibuk),
    // `potongNarasi` is rebuilt each render from `msg.content`; keying on the
    // content and the tools is what keeps this from recomputing on every tick.
    [msg.tools, msg.content, indeksSibuk],
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
            /*
             * Groups, each folding into its own "Worked for Xs" bar.
             *
             * A sentence of narration STARTS a group and stays on screen; the
             * calls that follow it are a flat list behind one thin bar. That is
             * the shape TRAE uses, and it fixes the case the reader sent: three
             * shell commands after one sentence no longer become three bordered
             * cards - they become one "Worked for 4s · 3 commands" row.
             */
            <div className="ai-toolruns" data-testid="ai-toolruns">
              {grupTools.map((g, gi) => {
                const items = g.items.map((i) => msg.tools![i]);
                const sibukDiSini = g.items.includes(indeksToolSibuk);
                return (
                  <Fragment key={`g-${gi}`}>
                    {g.narasi ? (
                      <div className="ai-segmen" data-testid="ai-segmen">
                        <Markdown remarkPlugins={MD_PLUGINS} components={MD_NARASI}>
                          {g.narasi}
                        </Markdown>
                      </div>
                    ) : null}
                    {/*
                     * The call in flight stays a full row: it is the one the
                     * reader is watching, and folding it away would hide the
                     * progress they came to see. A finished group folds.
                     */}
                    {sibukDiSini ? (
                      <ToolRow
                        name={namaPolos(items[0].name)}
                        labelName={infoAksi(items[0].name).label}
                        title={sasaranAksi(items[0].args) || perintahAksi(items[0].name, items[0].args)}
                        input={perintahAksi(items[0].name, items[0].args) ? '' : items[0].args}
                        output={items[0].result}
                        status={items[0].ok ? 'ok' : 'fail'}
                        exitCode={items[0].exitCode}
                        diffPatch={items[0].result}
                        stat={statUntuk(items[0], tf)}
                        ms={items[0].ms}
                        onImage={setGambarBuka}
                      />
                    ) : items.length === 1 ? (
                      /* A group of one is its own row, not a summary of one. */
                      <ToolRow
                        name={namaPolos(items[0].name)}
                        labelName={infoAksi(items[0].name).label}
                        title={sasaranAksi(items[0].args) || perintahAksi(items[0].name, items[0].args)}
                        input={perintahAksi(items[0].name, items[0].args) ? '' : items[0].args}
                        output={items[0].result}
                        status={items[0].ok ? 'ok' : 'fail'}
                        exitCode={items[0].exitCode}
                        diffPatch={items[0].result}
                        stat={statUntuk(items[0], tf)}
                        ms={items[0].ms}
                        onImage={setGambarBuka}
                      />
                    ) : (
                      <GrupKerja
                        tools={items}
                        tr={tr}
                        tf={tf}
                        live={Boolean(msg.streaming) && gi === grupTools.length - 1}
                      />
                    )}
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
