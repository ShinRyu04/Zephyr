/* DIHASILKAN OTOMATIS oleh scripts/uji-teks-terputus.mjs - jangan disunting. */
import { createRequire } from 'node:module';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { useState } = React;

/* ---- stub minimal: hanya yang disentuh blok yang diuji ---- */
const useAi = (sel) => {
  const s = { runInTerminal: () => {}, setToast: () => {} };
  return sel ? sel(s) : s;
};
const tx = (s) => s;
const tf = (s) => s;
const clipboardWrite = async () => {};
const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'pwsh', 'powershell', 'ps1', 'cmd', 'bat']);
const barisDiff = () => [];
const bagiHunk = () => [];
const ringkasDiff = () => ({ tambah: 0, hapus: 0 });
const EditDiff = () => null;
const isDestructive = () => false;
const AiIkon = () => null;
const MdPre = ({ children }) => React.createElement(React.Fragment, null, children);
const MdTabel = ({ children }) => React.createElement('div', null, React.createElement('table', null, children));
const MdLink = ({ href, children }) => React.createElement('a', { href }, children);
const KODE_LANG = /language-([\w-]+)/;
const REF_RE = /^((?:\.{0,2}[\/\\])?[\w@.\/\\-]+(?:\.\w{1,8}))(?::(\d+))?$/;

/* ===== blok ASLI dari src/components/ai/ChatMessage.tsx ===== */
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

export function render(md, komp) {
  return renderToStaticMarkup(
    React.createElement(Markdown, { remarkPlugins: [remarkGfm], components: komp }, md),
  );
}
export { MD_NARASI, MD_JAWABAN };
