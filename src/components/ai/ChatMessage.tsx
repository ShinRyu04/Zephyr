import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Fragment } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi, isDestructive } from '../../lib/aiStore';
import { bagiHunk, barisDiff, ringkasDiff, type DiffRow } from '../../lib/simpleDiff';
import { clipboardWrite } from '../../lib/clipboard';
import { findModel, ProviderLogo } from '../../lib/modelCatalog';
import type { AgentToolRun, ChatMsg } from '../../lib/types';
import AiIkon from './AiIkon';
import FileIkon from './FileIkon';
import Lightbox from './Lightbox';
import ReasoningBlock from './ReasoningBlock';
import { MsgTime } from './ChatStamp';
import { ThinkingLine } from './CliTimeline';
import { EditDiff, IkonBerkas, ikonSasaran, toolGlyph, toolKind } from './claudeCodeUi';
import { infoAksi, namaPolos, perintahAksi, sasaranAksi } from '../../lib/labelAksi';
import { tx, tf, useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { useSubAgent } from '../../lib/subagentStore';
import { bukaPanelAgx } from '../../lib/agxPanel';
import { useExplorer } from '../../lib/explorerStore';
import ExpertsPlanCard from './ExpertsPlanCard';
import ExpertsTimeline from './ExpertsTimeline';

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
  /* The file the preview belongs to, for the diff's head strip. */
  const [pratinjauPath, setPratinjauPath] = useState('');

  const terapkan = () => {
    void import('../../lib/store').then(({ useStore }) => {
      const s = useStore.getState();
      const id = s.activeTabId;
      if (!id) return setToast(tx('No active editor tab'));
      const tab = s.tabs.find((t) => t.id === id);
      const lama = tab?.content ?? '';
      if (lama === code) return setToast(tx('The file contents are already the same as this code'));
      setPratinjauPath(tab?.path ?? '');
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
          <EditDiff
            rows={pratinjau}
            path={pratinjauPath}
            testidPrefix="ai"
            onPickHunks={terapkanSebagian}
          />
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

/*
 * A link the model writes opens in a new tab, as it always did.
 */
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
/*
 * Satu entri garis waktu kronologis giliran: fase pikir (ReasoningBlock),
 * kalimat model (narasi), atau satu panggilan tool.
 */
type KejadianGarisWaktu =
  | { jenis: 'thought'; kunci: string; teks: string; ms?: number; hidup: boolean }
  | { jenis: 'narasi'; kunci: string; teks: string }
  | { jenis: 'tool'; kunci: string; run: AgentToolRun; hidup: boolean };

/* Kartu persetujuan plan yang di-dismiss pembaca, per id pesan. Set modul:
   komponen per-pesan tidak boleh membangkitkan kartu yang sudah ditutup. */
const PLAN_IZIN_TUTUP = new Set<string>();

/*
 * Baris SubAgent (tool `run_subagent`): bentuk ZCode - ikon robot, label
 * "SubAgent", jenis/permukaannya berwarna, lalu tugasnya. Statusnya LIVE dari
 * subagentStore (spinner = jalan, centang = selesai, merah = gagal). Klik =
 * buka detail: panel kanan di Agent window, tab editor di jendela utama.
 */
function BarisSubagent({
  run,
  hidup,
  permukaan,
}: {
  run: AgentToolRun;
  hidup: boolean;
  permukaan: 'main' | 'agents';
}) {
  const tr = useT();
  const args = (() => {
    try {
      return JSON.parse(run.args) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const prompt = typeof args.prompt === 'string' ? args.prompt : run.args;
  const jenis = typeof args.type === 'string' ? args.type : '';
  const sub = useSubAgent((s) => s.agents.find((a) => a.tugas === prompt));
  const sorot = useSubAgent((s) => s.sorot);
  const label = sub?.customNama || sub?.peran || jenis || 'SubAgent';
  const status = sub?.status ?? (hidup ? 'jalan' : 'selesai');

  const bukaDetail = () => {
    sorot(sub?.id ?? null);
    if (permukaan === 'agents') bukaPanelAgx('subagent');
    else void useStore.getState().bukaViewAi('subagent');
  };

  return (
    <button
      type="button"
      className="ai-gariswaktu-tool is-subagent"
      data-testid="ai-gariswaktu-subagent"
      onClick={bukaDetail}
      title={prompt}
    >
      <span className="cli-tool-ikon is-subagent" aria-hidden="true">
        <AiIkon name="robot" size={12} />
      </span>
      <span className="ai-gariswaktu-tool-label">SubAgent</span>
      <span className="ai-subagent-jenis">{label}</span>
      <span className="ai-subagent-tugas">{prompt}</span>
      {status === 'jalan' ? (
        <span className="ai-kerja-spin" aria-hidden="true" />
      ) : status === 'gagal' ? (
        <span className="cli-tool-fail">{tr('failed')}</span>
      ) : status === 'selesai' ? (
        <AiIkon name="check" size={11} />
      ) : null}
    </button>
  );
}

/*
 * Satu baris tool pada garis waktu datar: ikon, kerja, lalu detail args.
 *
 * Bentuknya label + sasaran ("Terminal  grep -rn …", "Read  ChatMessage.tsx
 * src/components/ai/"), bukan kalimat hasil — barisnya menerangkan APA yang
 * dipanggil, dan hasilnya satu klik di dalam fold induk.
 */
function BarisToolDatar({
  run,
  hidup,
  permukaan = 'main',
}: {
  run: AgentToolRun;
  hidup: boolean;
  permukaan?: 'main' | 'agents';
}) {
  if (namaPolos(run.name) === 'run_subagent') {
    return <BarisSubagent run={run} hidup={hidup} permukaan={permukaan} />;
  }
  const target = sasaranAksi(run.args);
  const perintah = perintahAksi(run.name, run.args);
  const ikonTarget = ikonSasaran(target);
  /* Path ditulis dua nada seperti produk rujukan: nama berkas lebih terang,
     foldernya redup. Untuk sasaran bukan-path (pola grep, URL) tetap satu teks. */
  const namaBerkas = target && !perintah ? (target.split(/[\\/]/).pop() ?? target) : '';
  const dirBerkas =
    target && !perintah && namaBerkas !== target
      ? target.slice(0, target.length - namaBerkas.length).replace(/[\\/]$/, '')
      : '';
  return (
    <div className="ai-gariswaktu-tool" data-testid="ai-gariswaktu-tool">
      <span className={`cli-tool-ikon is-${toolKind(run.name)}`} aria-hidden="true">
        {ikonTarget ? (
          <IkonBerkas ikon={ikonTarget} size={12} />
        ) : (
          <AiIkon name={toolGlyph(run.name) as never} size={12} />
        )}
      </span>
      <span className="ai-gariswaktu-tool-label">{infoAksi(run.name).label}</span>
      {perintah ? (
        <code className="ai-gariswaktu-tool-detail" title={perintah}>
          {perintah}
        </code>
      ) : target ? (
        <span className="ai-gariswaktu-tool-detail" title={target}>
          {ikonTarget && namaBerkas ? (
            <>
              <IkonBerkas ikon={ikonTarget} size={12} />
              <span className="ai-gariswaktu-tool-nama">{namaBerkas}</span>
              {dirBerkas && <span className="ai-gariswaktu-tool-dir">{dirBerkas}</span>}
            </>
          ) : (
            target
          )}
        </span>
      ) : null}
      {run.ok === false && <span className="cli-tool-fail">failed</span>}
      {hidup && <span className="ai-kerja-spin" aria-hidden="true" />}
    </div>
  );
}

function GrupKerja({
  tools,
  narasi,
  tr,
  tf,
  live,
  judul,
  durasiMs,
  awal,
  pakaiPohon,
}: {
  tools: readonly AgentToolRun[];
  /* The narration the model wrote before/while these calls ran. Shown INSIDE
     the fold, so the closed transcript reads "Worked for Xs" alone - the TRAE
     shape the reader asked for - instead of narration paragraph, bar,
     narration paragraph, bar. */
  narasi?: string;
  tr: (s: string) => string;
  tf: (s: string, v: Record<string, string | number>) => string;
  live: boolean;
  /* Bar tertutup menulis APA yang dikerjakan (gaya TRAE). Kalau diisi, ini
     menimpa ringkasan otomatis - dipakai fold INDUK yang membungkus semua grup. */
  judul?: string;
  /* Durasi total dari pemanggil, untuk fold induk. Tanpa ini bar menghitung
     sendiri dari tool yang dia pegang saja. */
  durasiMs?: number;
  /* Konten tambahan di ATAS baris tool (thought, reference): anak-anak pohon
     yang bukan tool, tapi harus ikut lipatan induk. */
  awal?: React.ReactNode;
  /* Lipatan INDUK yang isinya sudah berupa pohon (`CabangLangkah`): daftar
     datar `tools` tidak digambar lagi, karena setiap langkah sudah muncul di
     dalam cabangnya masing-masing. Tanpa flag ini langkah yang sama muncul dua
     kali - sekali di pohon, sekali lagi sebagai baris datar di bawahnya. */
  pakaiPohon?: boolean;
}) {
  /*
   * A click is the reader taking control; before that, live-ness decides.
   *
   * The parent fold spans the live turn too, so it opens by itself while the
   * agent works and closes itself ONCE when the turn ends - otherwise a
   * finished answer would keep every step expanded instead of the one-line
   * "Selesai dalam 4s" bar the reader asked for.
   */
  const [pilihan, setPilihan] = useState<boolean | null>(null);

  /*
   * Close ONCE on its own, but never swallow a click.
   *
   * The latch is armed only while the reader has not touched the bar: if they
   * opened or closed it themselves, `pilihan` already holds their decision and
   * the auto-close must not overrule it.
   */
  const sudahLiveRef = useRef(live);
  useEffect(() => {
    if (live) {
      sudahLiveRef.current = true;
      return;
    }
    if (sudahLiveRef.current) {
      sudahLiveRef.current = false;
      setPilihan((p) => (p === null ? false : p));
    }
  }, [live]);

  const terbuka = pilihan ?? live;

  const jumlah = tools.length;
  /*
   * A failure is already marked on the step that failed (and on the tree's
   * head), so the parent bar no longer repeats a count. TRAE's bar is one
   * clean line: summary, duration, chevron.
   */
  const gagal = tools.filter((t) => t.ok === false).length;
  const totalMs =
    typeof durasiMs === 'number'
      ? durasiMs
      : tools.reduce((n, t) => n + (typeof t.ms === 'number' ? t.ms : 0), 0);

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

  /* "Created 1 file, Read 1 file, Ran 2 commands" - the bar's headline. */
  const kerja = ringkasKerja(tools, tf);

  /* The duration moves INSIDE the fold: it is context, not the headline. */
  const durasi =
    totalMs >= 60000
      ? `${Math.floor(totalMs / 60000)}m ${Math.round((totalMs % 60000) / 1000)}s`
      : `${Math.max(1, Math.round(totalMs / 1000))}s`;
  /*
   * The headline is the WORK, not the clock.
   *
   * Riwayat keputusan ini bolak-balik, jadi ditulis apa adanya: dulu judulnya
   * jumlah kerja ("Read 1 file"), lalu diganti durasi ("Worked for 12s") supaya
   * bar terasa seperti satu baris judul. Setelah dibandingkan langsung dengan
   * Freebuff dan TRAE (permintaan user 23 Okt: "biar mirip Freebuff dan TRAE"),
   * keduanya menulis APA YANG DIKERJAKAN di bar tertutup - TRAE: "Read 35 files,
   * Searched files 22 times"; Freebuff: "Ran commands", "Read a file, ran a
   * command". Bar tertutup yang hanya berbunyi "Selesai dalam 1s" memberi tahu
   * lamanya, bukan isinya, sehingga pembaca harus membukanya untuk tahu apa pun.
   *
   * Durasi tetap ada, dipindah ke kanan bar sebagai angka redup: ia konteks,
   * bukan judul. Isi lipatan tidak lagi mengulang ringkasan yang sama.
   */
  const judulBar = judul || kerja || (live ? tr('Working…') : tr('Done'));

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
        title={judul || kerja || ringkas}
      >
        {/*
         * TRAE's bar is a single quiet line: a small mark on the left, the
         * headline, then the duration INLINE ("Searched files 2 times · 1s")
         * and the chevron on the RIGHT.
         *
         * The duration sits inside the sentence rather than pushed to the far
         * edge: on a wide pane a badge at the right end floats away from the
         * words it belongs to and reads as a separate column. TRAE writes it
         * after a middot, and so does this bar now.
         */}
        <span className="ai-kerja-mark" aria-hidden="true">
          {live ? (
            <span className="ai-kerja-spin" />
          ) : (
            <AiIkon name={gagal ? 'info' : 'check'} size={12} />
          )}
        </span>
        <span className="ai-kerja-judul">{judulBar}</span>
        <span className="ai-kerja-durasi" data-testid="ai-kerja-durasi">
          {/* Bar induk menulis durasi di dalam judulnya ("Working for 2m 45s",
              "Selesai dalam 4s") - badge ganda membaca seperti jam dua kali. */}
          {!judul && totalMs > 0 ? `· ${durasi}` : ''}
        </span>
        <span className="ai-kerja-caret" aria-hidden="true">
          {terbuka ? '▾' : '›'}
        </span>
      </button>

      {terbuka && (
        <div className="ai-kerja-isi" data-testid="ai-kerja-isi">
          {awal}
          {narasi ? (
            <div className="ai-kerja-narasi" data-testid="ai-kerja-narasi">
              <Markdown remarkPlugins={MD_PLUGINS} components={MD_NARASI}>
                {narasi}
              </Markdown>
            </div>
          ) : null}
          {pakaiPohon ? null : tools.map((t, k) => {
            const info = infoAksi(t.name);
            const target = sasaranAksi(t.args);
            const ikonTarget = ikonSasaran(target);
            /*
             * One line of outcome per worked step, as a CHILD of that step -
             * `Searched files · 1s` then `└ Found 36 files`. Null for a call
             * whose result says nothing countable, and then nothing is drawn.
             */
            const hasil = ringkasHasil(t, tf, tr);
            return (
              <div className="ai-grup-item" key={k}>
                <div
                  className={`ai-grup-baris${t.ok === false ? ' is-gagal' : ''}`}
                  data-testid="ai-kerja-baris"
                >
                  <span className={`cli-tool-ikon is-${toolKind(t.name)}`} aria-hidden="true">
                    {ikonTarget ? (
                      <IkonBerkas ikon={ikonTarget} size={12} />
                    ) : (
                      <AiIkon name={toolGlyph(t.name) as never} size={12} />
                    )}
                  </span>
                  <span className="cli-tool-name">{info.label}</span>
                  {target && (
                    <code className="ai-grup-args" title={target}>
                      {target}
                    </code>
                  )}
                  {t.ok === false && <span className="cli-tool-fail">{tr('failed')}</span>}
                </div>
                {hasil ? (
                  <div className="ai-anak-hasil" data-testid="ai-anak-hasil">
                    {hasil}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


/**
 * The verb families `ringkasKerja` counts. Kept next to it so the "no family
 * matched" branch and the counting loop cannot drift apart.
 */
const KELUARGA_KERJA = /^(bash_run|sh|run_command|grep|glob|search|find|read|list_|write|edit|apply|create)/;

/**
 * The bar's headline: what the run TOUCHED, in the model's own verbs.
 *
 * Counts are grouped by verb+noun so the line stays short: five reads are
 * "Read 5 files", not five clauses.
 */
function ringkasKerja(
  tools: readonly AgentToolRun[],
  tf: (s: string, v: Record<string, string | number>) => string,
): string {
  const n: Record<string, number> = {};
  const naik = (k: string) => {
    n[k] = (n[k] ?? 0) + 1;
  };
  for (const t of tools) {
    const nama = namaPolos(t.name);
    /*
     * The verb comes from the tool's own family, not from a guess about the
     * args: `write_file` on a new path still counts as "Edited", because the
     * model used a write tool either way.
     *
     * `grep`/`glob` count as SEARCHES, not reads. They used to be folded into
     * "Read N files", which made a run that searched twenty times look like it
     * opened twenty files - and TRAE, the reference, states them separately
     * ("Read 35 files, Searched files 22 times").
     */
    if (nama === 'bash_run' || nama === 'sh' || nama === 'run_command') naik('cmd');
    else if (nama === 'grep' || nama === 'glob' || nama.startsWith('search') || nama.startsWith('find')) naik('search');
    else if (nama.startsWith('read') || nama.startsWith('list_')) naik('read');
    else if (nama.startsWith('write') || nama.startsWith('edit') || nama.startsWith('apply')) naik('edit');
    else if (nama.startsWith('create')) naik('create');
    else naik('step');
  }

  /*
   * Singular vs plural, per count.
   *
   * The strings have no dictionary entries (they are English at every language),
   * so nothing is lost by splitting them: "Read 12 file" and "Ran 1 commands"
   * were shipping, and a bar whose grammar is broken reads as machine output
   * rather than as a summary.
   */
  const jamak = (n: number, satu: string, banyak: string) => tf(n === 1 ? satu : banyak, { n });
  const bit: string[] = [];
  if (n.create) bit.push(jamak(n.create, 'Created {n} file', 'Created {n} files'));
  if (n.edit) bit.push(jamak(n.edit, 'Edited {n} file', 'Edited {n} files'));
  if (n.read) bit.push(jamak(n.read, 'Read {n} file', 'Read {n} files'));
  if (n.search) bit.push(jamak(n.search, 'Searched files {n} time', 'Searched files {n} times'));
  if (n.cmd) bit.push(jamak(n.cmd, 'Ran {n} command', 'Ran {n} commands'));
  /*
   * A tool whose family is not one of the five above used to collapse into
   * `{n} steps` - a bar reading "1 step", which tells the reader nothing and
   * was the loudest thing on a tree of a dozen nodes. The catalogue already
   * names every tool (`infoAksi(...).label`), so that name is what the bar
   * says; `{n} steps` survives only when a tool has no label at all.
   */
  if (n.step) {
    const takDikenal = tools.find((t) => !KELUARGA_KERJA.test(namaPolos(t.name)));
    const label = takDikenal ? infoAksi(takDikenal.name).label : '';
    bit.push(label ? label : jamak(n.step, '{n} step', '{n} steps'));
  }
  return bit.join(', ');
}

/**
 * The OUTCOME of one call, in one line, for the step's child row.
 *
 * The transcript used to stop at the verb ("Searched files", "Read a file"), so
 * the only way to learn whether a search found anything was to open the step
 * and read the tool's raw result - a header of `[36 berkas, 128 kecocokan]`
 * followed by a hundred paths. The reference product prints the same fact one
 * level down ("Found 36 files tool|tools", "No results found"), which is where
 * it belongs: attached to the step that produced it.
 *
 * Only facts the tool layer already reported are used. `result` is the raw
 * text each builtin returns, so these are patterns against KNOWN wording
 * (`[N berkas, M kecocokan]`, "Tidak ada hasil"), not a guess at arbitrary
 * output; anything unrecognised returns null and the child row is simply not
 * drawn, rather than inventing a line.
 */
function ringkasHasil(
  t: AgentToolRun,
  tf: (s: string, v: Record<string, string | number>) => string,
  tr: (s: string) => string,
): string | null {
  const nama = namaPolos(t.name);
  const hasil = (t.result ?? '').trim();
  if (t.ok === false) return null;
  if (!hasil) return null;

  if (nama === 'grep' || nama === 'search_grep' || nama.startsWith('search')) {
    /* `[36 berkas, 128 kecocokan]` - the builtin's own header. */
    const m = hasil.match(/^\[(\d+)\s*berkas,\s*(\d+)\s*kecocokan\]/i);
    if (m) return tf('Found {n} matches in {m} files', { n: Number(m[2]), m: Number(m[1]) });
    if (/^Tidak ada hasil/i.test(hasil)) return tr('No results found');
    return null;
  }
  if (nama === 'glob' || nama === 'list_workspace_files') {
    if (/^Tidak ada berkas yang cocok/i.test(hasil)) return tr('No files matched');
    /* A capped list opens with `[dibatasi 200 berkas]`, which is a header, not
       a path - counting it would add one to every capped result. */
    const baris = hasil.split('\n').filter((b) => b.trim() && !b.trim().startsWith('['));
    if (baris.length) return tf('Found {n} files', { n: baris.length });
    return null;
  }
  if (nama === 'bash_run' || nama === 'sh' || nama === 'run_command') {
    if (typeof t.exitCode === 'number' && t.exitCode !== 0) {
      return tf('Exit code {n}', { n: t.exitCode });
    }
    return null;
  }
  if (typeof t.lines === 'number' && t.lines > 0) {
    return tf('Read {n} lines', { n: t.lines });
  }
  return null;
}

/* Every path the turn OPENED - the "Reference" node of the tree. */
function berkasRujukan(tools: readonly AgentToolRun[]): string[] {
  const urut: string[] = [];
  const ada = new Set<string>();
  for (const t of tools) {
    const nama = namaPolos(t.name);
    if (!(nama.startsWith('read') || nama === 'read_file')) continue;
    const target = sasaranAksi(t.args);
    if (!target || ada.has(target)) continue;
    ada.add(target);
    urut.push(target);
  }
  return urut;
}


/*
 * A pasted prompt is not an answer: it can be hundreds of lines.
 *
 * The user's own bubble used to render `msg.content` at full height, so a long
 * pasted message (a log, a diff, a whole file) filled the transcript and pushed
 * the answer off-screen - the reader had to scroll past their own text to see
 * the reply. Above this height the bubble is clipped and a Show more / Show
 * less toggle appears under it. Marked by LINE COUNT as well as height: a
 * single long line never triggers the height cap on its own because of
 * wrapping, but it is just as unreadable at full length.
 */
const TINGGI_RINGKAS_PX = 168;
const BARIS_RINGKAS = 8;

/*
 * `@path` in a SENT message is a reference, so it is drawn as one.
 *
 * The composer already says "@ for context" and inserts `@src/lib/aiStore.ts`,
 * but the transcript printed that raw token: a wall of `@.github/` and paths
 * read as if the reader had typed them by hand, and nothing showed WHAT had
 * been attached. The reference product turns them into chips with the icon of
 * the thing they point at; this splits the text so each token can draw one.
 *
 * Two token forms are accepted, because paths here can contain spaces:
 *
 *   @src/lib/aiStore.ts                     the plain form
 *   @"Referensi TRAE Agent Window/1.png"    a quoted path
 *
 * Without the quoted form a path with a space ended at the space, so the chip
 * showed `@Referensi` and the rest of the name stayed loose text - the reported
 * "masih banyak yang mentah". A lone `@` matches nothing, so an email address
 * or a decorator stays plain text.
 */
const POLA_REF_PESAN = /(^|[\s(])@(?:"([^"]+)"|([^\s@"]+))/g;

type PotongPesan = { jenis: 'teks' | 'ref'; isi: string };

function pecahRefPesan(teks: string): PotongPesan[] {
  const hasil: PotongPesan[] = [];
  let akhir = 0;
  for (const m of teks.matchAll(POLA_REF_PESAN)) {
    const mulai = (m.index ?? 0) + m[1].length;
    const rujukan = m[2] ?? m[3];
    if (mulai > akhir) hasil.push({ jenis: 'teks', isi: teks.slice(akhir, mulai) });
    hasil.push({ jenis: 'ref', isi: rujukan });
    /* The whole match is the token, quotes included, so the text that follows
       starts after it instead of repeating the closing quote. */
    akhir = mulai + (m[0].length - m[1].length);
  }
  if (akhir < teks.length) hasil.push({ jenis: 'teks', isi: teks.slice(akhir) });
  return hasil;
}

/**
 * Opens a reference from the transcript.
 *
 * A file opens as a permanent tab (`preview: false`): a reference was mentioned
 * on purpose, and a tab that is replaced by the next single-click open would
 * make the chip useless the moment the reader looks at two of them. A folder is
 * revealed in the Explorer instead - `openPath` on a directory has nothing to
 * show, while revealing it puts the tree on the folder the message named.
 *
 * Rules and agents are not files, so they stay plain chips - a button that does
 * nothing would be worse than no button.
 */
function bukaRef(sisip: string) {
  if (sisip.startsWith('rule:') || sisip.startsWith('agent:')) return;
  if (sisip.endsWith('/')) {
    useStore.getState().setActivity('explorer');
    void useExplorer.getState().reveal(sisip.replace(/\/$/, ''));
    return;
  }
  void useStore.getState().openPath(sisip, { preview: false });
}

/** The glyph for a reference: a folder, a rule, an agent, or a file by name. */
function IkonRefPesan({ sisip }: { sisip: string }) {
  if (sisip.endsWith('/')) return <AiIkon name="folder" size={11} />;
  if (sisip.startsWith('rule:')) return <AiIkon name="shield" size={11} />;
  if (sisip.startsWith('agent:')) return <AiIkon name="robot" size={11} />;
  return <FileIkon nama={sisip.split('/').pop() ?? sisip} />;
}

function PesanUser({ teks }: { teks: string }) {
  const tr = useT();
  const isi = useRef<HTMLParagraphElement | null>(null);
  const [buka, setBuka] = useState(false);
  const [tinggi, setTinggi] = useState(0);

  /*
   * Measured, not guessed from character count: the panel's width decides how
   * many wrapped lines a fixed number of characters becomes, and the same text
   * in the right column and in the popped-out window wraps differently.
   */
  useEffect(() => {
    const el = isi.current;
    if (!el) return;
    const ukur = () => setTinggi(el.scrollHeight);
    ukur();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, [teks]);

  const panjang = tinggi > TINGGI_RINGKAS_PX || teks.split('\n').length > BARIS_RINGKAS;
  /* Parsed once per message, and only when there is a token to draw: most
     messages have none, and they keep the single text node they always had. */
  const bagian = useMemo(() => (teks.includes('@') ? pecahRefPesan(teks) : null), [teks]);
  const adaRef = bagian?.some((b) => b.jenis === 'ref') ?? false;

  return (
    <div className="ai-pesan-user" data-testid="ai-user-msg" data-ringkas={panjang && !buka ? '1' : '0'}>
      <p
        className="ai-plain"
        ref={isi}
        style={panjang && !buka ? { maxHeight: TINGGI_RINGKAS_PX, overflow: 'hidden' } : undefined}
      >
        {adaRef && bagian
          ? bagian.map((b, i) =>
              b.jenis === 'teks' ? (
                <Fragment key={i}>{b.isi}</Fragment>
              ) : b.isi.startsWith('rule:') || b.isi.startsWith('agent:') ? (
                /* Not a path, so not a link: the chip names the rule or agent
                   that was attached and nothing happens on click. */
                <span key={i} className="ai-ref-chip-pesan" data-ref={b.isi} title={b.isi}>
                  <span className="ai-ref-chip-pesan-ikon" aria-hidden="true">
                    <IkonRefPesan sisip={b.isi} />
                  </span>
                  <span className="ai-ref-chip-pesan-nama">{b.isi.replace(/\/$/, '')}</span>
                </span>
              ) : (
                <button
                  key={i}
                  type="button"
                  className="ai-ref-chip-pesan is-buka"
                  data-ref={b.isi}
                  data-testid={`ai-ref-buka-${b.isi}`}
                  title={`${b.isi} - ${tr('open')}`}
                  aria-label={`${b.isi} - ${tr('open')}`}
                  onClick={() => bukaRef(b.isi)}
                  /* The chip shows the name; the full path is what is copied
                     with the message, so it lives in the title and data-ref. */
                >
                  <span className="ai-ref-chip-pesan-ikon" aria-hidden="true">
                    <IkonRefPesan sisip={b.isi} />
                  </span>
                  <span className="ai-ref-chip-pesan-nama">{b.isi.replace(/\/$/, '')}</span>
                </button>
              ),
            )
          : teks}
      </p>
      {panjang && (
        <button
          type="button"
          className="ai-pesan-user-toggle"
          data-testid="ai-user-msg-toggle"
          aria-expanded={buka}
          onClick={() => setBuka(!buka)}
        >
          {buka ? tr('Show less') : tr('Show more')}
        </button>
      )}
    </div>
  );
}

function ChatMessageInner({
  msg,
  permukaan = 'main',
}: {
  msg: ChatMsg;
  /* Permukaan pemilik transkrip: 'agents' = Agent window. Hanya di sana
     pesan plan dirender sebagai kartu "Plan" - permukaan lain tetap jawaban
     biasa supaya hemat ruang (keputusan user). */
  permukaan?: 'main' | 'agents';
}) {
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
  /*
   * The tail — prose after the LAST call — stays OUTSIDE the fold.
   *
   * It used to be folded in when the turn finished, so a closed transcript read
   * "bar, answer" with no sentence in between. The reference product keeps that
   * closing line visible above the bar (`Trae.png`: the sentence sits between
   * two bars), because it is the model explaining what it just did — reading it
   * should not need a click.
   *
   * While the turn is live the tail is empty anyway (it is the sentence being
   * typed right now), so the same expression covers both states.
   */
  const narasiEkor = ekorNarasi;
  /* Teks jawaban akhir: identik dengan yang dirender di bawah, dihitung sekali
     supaya kartu Plan dan blok jawaban biasa tidak bisa berbeda isi. */
  const teksJawaban = msg.tools && msg.tools.length > 0 ? narasiEkor : ekorNarasi;

  /*
   * Kartu Plan - permukaan Agent window saja.
   *
   * Turn yang diproduksi dalam run mode 'plan' (stamp `msg.plan` di store)
   * dirender sebagai kartu ber-header "Plan" dengan badan ter-clamp: rencana
   * bisa panjang, dan menampilkan seluruhnya mendorong transcript. Badan lebih
   * tinggi dari clamp mendapat gradasi + tombol "View full plan"; sekali
   * dibuka tetap terbuka. Di permukaan lain pesan plan tetap jawaban biasa.
   */
  const isPlan = msg.plan === true && permukaan === 'agents' && msg.role === 'assistant';
  const [planBuka, setPlanBuka] = useState(false);
  const planRef = useRef<HTMLDivElement | null>(null);
  /* Awal: TERCLAMP. Kalau diukur dan isinya pendek, efek di bawah melepasnya.
     Mengukur dalam keadaan ter-clamp penting: clientHeight = 210 tetap
     (overflow hidden) sementara scrollHeight mencerminkan isi penuh, jadi
     perbandingannya valid. Mengukur tanpa clamp membuat keduanya sama dan
     rencana panjang tidak pernah terdeteksi. */
  const [planTerpotong, setPlanTerpotong] = useState(true);

  /*
   * Kartu persetujuan plan (gaya ask user): muncul di bawah kartu Plan ketika
   * turn plan SELESAI dan run mode masih 'plan'. Approve = keluar plan mode +
   * agent langsung disuruh mengeksekusi; jawaban bebas = kirim apa adanya
   * (rencana direvisi, plan mode tetap). Dismiss pakai Set modul supaya kartu
   * tidak bangkit lagi saat pesan yang sama dirender ulang.
   */
  const runMode = useAi((s) => s.runMode);
  const setRunMode = useAi((s) => s.setRunMode);
  const izinTerlihat = useAi((s) => {
    if (permukaan !== 'agents') return false;
    const sid = s.activeIds.agents ?? s.activeId;
    const ses = s.sessions.find((x) => x.id === sid);
    const list = ses?.messages;
    return !!list && list.length > 0 && list[list.length - 1].id === msg.id;
  });
  const [izinTutup, setIzinTutup] = useState(PLAN_IZIN_TUTUP.has(msg.id));
  const [jawabanPlan, setJawabanPlan] = useState('');
  const tampilkanIzin =
    isPlan && !msg.streaming && runMode === 'plan' && izinTerlihat && !izinTutup;
  useEffect(() => {
    if (!isPlan || planBuka) {
      setPlanTerpotong(false);
      return;
    }
    const el = planRef.current;
    if (!el) return;
    setPlanTerpotong(el.scrollHeight > el.clientHeight + 8);
  }, [isPlan, planBuka, teksJawaban]);
  /* Which attachment is open full-size, if any. `null` = the viewer is closed. */
  const [gambarBuka, setGambarBuka] = useState<string | null>(null);
  /* Reference starts folded: TRAE shows a one-line "Reference ▾", not the
     whole list of paths, until the reader asks for it. */
  const [rujukanBuka, setRujukanBuka] = useState(false);
  const tr = useT();
  const isUser = msg.role === 'user';
  const def = msg.model ? findModel(msg.model) : null;
  const regenerate = useAi((s) => s.regenerate);
  const forkChat = useAi((s) => s.forkChat);
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
    } else {
      const { useNotif } = await import('../../lib/notificationStore');
      useNotif.getState().notify({
        severity: 'error',
        message: tx('Sebagian berkas gagal dikembalikan'),
        detail: hasil.gagal.map((g) => `${g.path}: ${g.pesan}`).join('\n'),
        source: 'Checkpoint',
      });
    }

    /*
     * "Jump to next change after review" — the reader has just decided about
     * this turn's changes, so the editor moves on to the next file that changed.
     *
     * Only files that SURVIVED are opened: after an undo, a file the turn
     * created no longer exists, and opening a deleted path would show an error
     * tab instead of the next thing to look at. The list is taken from the
     * restore result rather than the checkpoint so it reflects what is actually
     * on disk now.
     */
    const { lompatSetelahReview } = await import('../../lib/reviewUbah');
    if (!lompatSetelahReview()) return;
    const berikut =
      hasil.dipulihkan.find((p) => p !== useStore.getState().tabs.find((t) => t.id === useStore.getState().activeTabId)?.path) ??
      hasil.dipulihkan[0];
    if (!berikut) return;
    await useStore.getState().openPath(berikut).catch(() => undefined);
  };

  /*
   * Garis waktu kronologis giliran: Thought -> narasi -> tool -> … flat,
   * dalam urutan kejadian — bentuk ZCode/TRAE yang diminta pembaca.
   *
   * Sumbernya tiga lapis data yang saling melengkapi:
   *   - `msg.reasoningSegmen`: fase "pikir" per langkah (posisi `hinggaTool`);
   *   - `potongNarasi[i]`: teks yang ditulis model sebelum tool i jalan;
   *   - `msg.tools[i]`: panggilannya sendiri, dengan status dan hasil.
   *
   * Urutan di dalam satu langkah: pikir dulu, lalu ngomong, lalu kerja.
   * Transkrip lama tanpa segmen tetap utuh: tanpa baris Thought, reasoning
   * tetap satu blok di atas garis waktu (perilaku sebelumnya).
   */
  const kejadianGaris = useMemo<KejadianGarisWaktu[]>(() => {
    const tools = msg.tools ?? [];
    const hasil: KejadianGarisWaktu[] = [];
    for (let i = 0; i <= tools.length; i += 1) {
      const seg = msg.reasoningSegmen?.find((s) => s.hinggaTool === i);
      if (seg && seg.teks.trim()) {
        hasil.push({
          jenis: 'thought',
          kunci: `pikir-${i}`,
          teks: seg.teks,
          /* Selama mengalir `ms` masih epoch - jangan ditulis sebagai durasi. */
          ms: seg.ms > 1e12 ? undefined : seg.ms,
          hidup: Boolean(msg.streaming) && seg.ms > 1e12,
        });
      }
      if (i < tools.length) {
        const kata = potongNarasi[i]?.trim() ?? '';
        if (kata) hasil.push({ jenis: 'narasi', kunci: `omong-${i}`, teks: kata });
        hasil.push({
          jenis: 'tool',
          kunci: `kerja-${i}`,
          run: tools[i],
          hidup: Boolean(msg.streaming) && i === tools.length - 1,
        });
      }
    }
    return hasil;
    // `potongNarasi` dibangun ulang tiap render dari `msg.content`; memasukkan
    // keduanya ke kunci memo menjaga urutan baris selalu sinkron dengan teks.
  }, [msg.tools, potongNarasi, msg.reasoningSegmen, msg.streaming]);

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

  /*
   * Jam bar induk saat giliran hidup: detik sejak pesan dibuat, ditik setiap
   * 1 detik, sehingga bar membaca "Working for 2m 45s" seperti produk
   * rujukan — bukan "Working…" diam tanpa angka. Setelah giliran tamat jam
   * ini mati dan judul memakai durasi hasil kerja.
   */
  const [detikJalan, setDetikJalan] = useState(0);
  useEffect(() => {
    if (!msg.streaming || !(msg.tools?.length ?? 0)) {
      setDetikJalan(0);
      return;
    }
    const mulai = typeof msg.at === 'number' ? msg.at : Date.now();
    const hitung = () => setDetikJalan(Math.max(0, Math.floor((Date.now() - mulai) / 1000)));
    hitung();
    const t = window.setInterval(hitung, 1000);
    return () => window.clearInterval(t);
  }, [msg.streaming, msg.at, msg.tools?.length]);

  /*
   * The turn's single parent fold.
   *
   * The whole timeline lives in the BODY of one fold that spans the turn, so
   * a finished turn reads as one "Selesai dalam Xs" line instead of a stack
   * of unrelated bars. While the turn is live the fold opens by itself: the
   * rows in flight must stay in the flow.
   *
   * The finished duration is the sum of every tool's own `ms` plus the
   * reasoning time, which the per-tool sums cannot see.
   */
  const foldInduk = (msg.tools?.length ?? 0) > 0;
  const rujukan = useMemo(() => berkasRujukan(msg.tools ?? []), [msg.tools]);
  const durasiTurn =
    (msg.tools ?? []).reduce((n, t) => n + (typeof t.ms === 'number' ? t.ms : 0), 0) +
    (msg.reasoningMs ?? 0);
  const formatDurasiPendek = (ms: number) => {
    const d = Math.max(1, Math.round(ms / 1000));
    return d >= 60 ? `${Math.floor(d / 60)}m ${d % 60}s` : `${d}s`;
  };
  const judulTurn = msg.streaming
    ? tf('Bekerja selama {d}', { d: formatDurasiPendek(detikJalan * 1000) })
    : tf('Selesai dalam {d}', { d: formatDurasiPendek(durasiTurn) });

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
   * Avatars were REMOVED from the transcript.
   *
   * They used to sit as a sibling of the bubble inside `.ai-row`, toggled by
   * `settings.agents.chatAvatar`. Both the mark and the setting are gone: the
   * reference transcript has no avatar column, and keeping a switch that could
   * only ever turn on a mark nobody wanted was furniture. `.ai-row` stays as the
   * wrapper so the bubble keeps its own vertical layout unchanged.
   */
  return (
    <div
      className={`ai-row${isUser ? ' is-user' : ''}${msg.error ? ' is-error' : ''}`}
      data-ai-row={msg.id}
    >
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
          {!msg.streaming && !msg.error && !isUser && (
            <button
              className="ai-msg-act"
              data-testid="ai-fork-msg"
              title={tx('Fork the chat from this answer')}
              onClick={() => {
                /*
                 * Fork at the message the reader is looking at, on the surface
                 * that shows it. `activeId` is that surface's chat for the
                 * docked column; the editor tab's transcript is the same chat,
                 * so either way the cut point is this message's id.
                 */
                const aktif = useAi.getState().activeId;
                if (!aktif) return;
                const baru = forkChat(aktif, msg.id);
                if (baru) setToast(tx('Forked - this chat now continues separately'));
              }}
            >
              ⑂
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
            {/* The icon says WHAT was attached - an image, or another file -
                so the chip is more than a bare file name. */}
            <span className="ai-attach-chip-ikon" aria-hidden="true">
              {/\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(msg.attached.path) ? (
                <AiIkon name="image" size={11} />
              ) : (
                <AiIkon name="file" size={11} />
              )}
            </span>
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
             * ONE tree for the whole turn, like TRAE.
             *
             * Before this, every run boundary (a sentence of narration between
             * two calls) produced its own "Worked for Xs" bar, so a turn with
             * five sentences read as five unrelated bars stacked on top of each
             * other - the "masih pisah-pisah" the reader reported. The bars are
             * still there, but they are now CHILDREN of a single parent bar that
             * spans the turn: one fold to open, one duration for the whole job,
             * and the thought block rides inside it as the first child instead
             * of floating above the tree.
             *
             * Only a FINISHED turn is wrapped: while the agent is still working
             * the parent stays open and the live row has to sit in the normal
             * flow, not behind a click.
             */
            <div className="ai-toolruns" data-testid="ai-toolruns">
              {foldInduk ? (
                <GrupKerja
                  tools={msg.tools}
                  tr={tr}
                  tf={tf}
                  live={Boolean(msg.streaming)}
                  judul={judulTurn}
                  durasiMs={durasiTurn}
                  /* Semua langkah hidup di dalam cabang pohon; daftar datar
                     lama tidak digambar lagi di sini. */
                  pakaiPohon
                  awal={
                    <>
                      {/*
                       * Reference: the files this turn OPENED.
                       *
                       * It is the first child of the tree, above thought and
                       * above the steps - the reference product's order -
                       * because "what did it look at" frames everything that
                       * follows. Derived, not stored: `sasaranAksi` already
                       * resolves each read's path, so the node costs no new
                       * field in the transcript format.
                       */}
                      {rujukan.length > 0 ? (
                        <div className="ai-rujukan" data-testid="ai-rujukan">
                          <button
                            type="button"
                            className="ai-rujukan-head"
                            data-testid="ai-rujukan-toggle"
                            aria-expanded={rujukanBuka}
                            onClick={() => setRujukanBuka(!rujukanBuka)}
                          >
                            <span className="ai-rujukan-judul">{tr('Reference')}</span>
                            <span className="ai-cabang-caret" aria-hidden="true">
                              {rujukanBuka ? '▾' : '›'}
                            </span>
                          </button>
                          {rujukanBuka
                            ? rujukan.map((p) => {
                                const ik = ikonSasaran(p);
                                return (
                                  <div className="ai-rujukan-baris" key={p} title={p}>
                                    <span className="cli-tool-ikon is-baca" aria-hidden="true">
                                      {ik ? (
                                        <IkonBerkas ikon={ik} size={12} />
                                      ) : (
                                        <AiIkon name="doc" size={12} />
                                      )}
                                    </span>
                                    <span className="ai-rujukan-path">{p}</span>
                                  </div>
                                );
                              })
                            : null}
                        </div>
                      ) : null}
                      {/* Transkrip lama tanpa segmen: reasoning tetap SATU
                          blok di atas garis waktu, persis perilaku lama.
                          Pesan baru menyusunnya jadi baris Thought per
                          langkah di `kejadianGaris` di bawah. */}
                      {!msg.reasoningSegmen && showThinking && msg.reasoning ? (
                        <div className="ai-timeline" data-timeline data-testid="ai-timeline-reason">
                          <ReasoningBlock
                            teks={msg.reasoning}
                            ms={msg.reasoningMs}
                            berjalan={Boolean(msg.streaming)}
                            judul={tr('Thought')}
                          />
                        </div>
                      ) : null}
                      {kejadianGaris.length > 0 ? (
                        <div className="ai-gariswaktu" data-testid="ai-gariswaktu">
                          {kejadianGaris.map((e) => {
                            if (e.jenis === 'thought') {
                              return (
                                <ReasoningBlock
                                  key={e.kunci}
                                  teks={e.teks}
                                  ms={e.ms}
                                  berjalan={e.hidup}
                                  judul={tr('Thought')}
                                />
                              );
                            }
                            if (e.jenis === 'narasi') {
                              return (
                                <div
                                  className="ai-segmen"
                                  data-testid="ai-gariswaktu-narasi"
                                  key={e.kunci}
                                >
                                  <Markdown remarkPlugins={MD_PLUGINS} components={MD_NARASI}>
                                    {e.teks}
                                  </Markdown>
                                </div>
                              );
                            }
                            return <BarisToolDatar key={e.kunci} run={e.run} hidup={e.hidup} permukaan={permukaan} />;
                          })}
                        </div>
                      ) : null}
                    </>
                  }
                />
              ) : null}
            </div>
          )}
          {/*
            * The "files changed" card used to close EVERY turn's tool block.
            *
            * It now lives once per session, at the end of the transcript (see
            * `AiPanel`), because it summarises the whole chat: a session that
            * rewrote one file five times showed five cards with the same path
            * and a fifth of the numbers each. Nothing is lost from the turn —
            * the tool rows above still list every call in order.
            */}
          {isUser ? (
            <PesanUser teks={msg.content} />
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
              {showThinking && msg.reasoning && !foldInduk && (
                <div className="ai-timeline" data-timeline data-testid="ai-timeline-reason">
                  <ReasoningBlock teks={msg.reasoning} ms={msg.reasoningMs} berjalan={msg.streaming} />
                </div>
              )}
              {/*
                * Kartu rencana Experts Mode: pesan dengan `expertsPlan` = runId
                * dirender sebagai kartu persetujuan (daftar tugas + Mulai).
                * Di semua permukaan, bukan hanya Agent window — rencana tim
                * adalah bagian dari percakapan, bukan mode khusus satu sisi.
                */}
              {msg.expertsPlan ? (
                msg.streaming ? (
                  /*
                   * Selagi Lead menyusun rencana — baris "Creating research
                   * task" ala acuan (110050), bukan typing dots kosong.
                   */
                  <div className="experts-run-fold is-buka is-tunggu" data-testid="experts-creating">
                    <span className="experts-spin" aria-hidden="true" />
                    <span>{tr('Creating research task')}</span>
                  </div>
                ) : (
                  <>
                    <ExpertsPlanCard runId={msg.expertsPlan} teks={teksJawaban} />
                    {/* Kartu task per worker ikut ALUR chat, tepat di bawah
                        rencananya — bentuk Qoder, bukan ditumpuk di composer. */}
                    <ExpertsTimeline runId={msg.expertsPlan} />
                  </>
                )
              ) : isPlan && teksJawaban.trim() ? (
                <>
                <div className={`ai-plan${planBuka ? ' is-open' : ''}`} data-testid="ai-plan">
                  <div className="ai-plan-kepala">
                    <span className="ai-plan-ikon" aria-hidden="true">
                      <AiIkon name="clipboard" size={13} />
                    </span>
                    <span className="ai-plan-judul">{tr('Plan')}</span>
                    <button
                      type="button"
                      className="ai-plan-salin"
                      title={tr('Salin rencana')}
                      onClick={() => void clipboardWrite(msg.content ?? '')}
                    >
                      <AiIkon name="clipboard" size={12} />
                    </button>
                  </div>
                  <div
                    className={`ai-plan-badan${planTerpotong && !planBuka ? ' is-terpotong' : ''}`}
                    ref={planRef}
                  >
                    <Markdown remarkPlugins={MD_PLUGINS} components={MD_JAWABAN}>
                      {teksJawaban}
                    </Markdown>
                  </div>
                  {planTerpotong && !planBuka && (
                    <button
                      type="button"
                      className="ai-plan-buka"
                      onClick={() => {
                        /* Rujukan: plan kebuka di SEBELAH - panel kanan di
                           Agent window, tab editor di jendela utama. */
                        if (permukaan === 'agents') void import('../../lib/agxPanel').then((m) => m.bukaPanelAgx('plan'));
                        else {
                          setPlanBuka(true);
                          void useStore.getState().bukaViewAi('plan');
                        }
                      }}
                    >
                      {tr('Lihat rencana lengkap')} →
                    </button>
                  )}
                </div>
                {tampilkanIzin && (
                  <div className="ai-plan-izin" data-testid="ai-plan-izin">
                    <div className="ai-plan-izin-kepala">
                      <span className="ai-plan-izin-badge">{tr('Permission required')}</span>
                      <b className="ai-plan-izin-judul">{tr('Implementation plan')}</b>
                      <span className="ai-plan-izin-hitung">1/1</span>
                    </div>
                    <button
                      type="button"
                      className="ai-plan-izin-opsi"
                      onClick={() => {
                        PLAN_IZIN_TUTUP.add(msg.id);
                        setIzinTutup(true);
                        setRunMode('interactive');
                        void useAi
                          .getState()
                          .send(tr('Lanjutkan eksekusi rencananya.'), undefined, 'agents');
                      }}
                    >
                      <b>1. {tr('Approve')}</b>
                      <i>{tr('Exit plan mode and start implementation.')}</i>
                    </button>
                    <input
                      className="ai-plan-izin-jawab"
                      placeholder={tr('Enter your answer…')}
                      value={jawabanPlan}
                      onChange={(e) => setJawabanPlan(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && jawabanPlan.trim()) {
                          PLAN_IZIN_TUTUP.add(msg.id);
                          setIzinTutup(true);
                          void useAi.getState().send(jawabanPlan.trim(), undefined, 'agents');
                          setJawabanPlan('');
                        }
                      }}
                    />
                    <div className="ai-plan-izin-aksi">
                      <button
                        type="button"
                        className="ai-plan-izin-batal"
                        onClick={() => {
                          PLAN_IZIN_TUTUP.add(msg.id);
                          setIzinTutup(true);
                        }}
                      >
                        {tr('Dismiss')}
                      </button>
                      <button
                        type="button"
                        className="ai-plan-izin-kirim"
                        disabled={!jawabanPlan.trim()}
                        onClick={() => {
                          PLAN_IZIN_TUTUP.add(msg.id);
                          setIzinTutup(true);
                          void useAi.getState().send(jawabanPlan.trim(), undefined, 'agents');
                          setJawabanPlan('');
                        }}
                      >
                        {tr('Submit')}
                      </button>
                    </div>
                  </div>
                )}
                </>
              ) : (
                <Markdown remarkPlugins={MD_PLUGINS} components={MD_JAWABAN}>
                  {teksJawaban}
                </Markdown>
              )}
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
