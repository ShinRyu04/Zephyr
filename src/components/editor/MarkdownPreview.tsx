import { useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../../lib/store';
import { clipboardWrite } from '../../lib/clipboard';
import { useAi } from '../../lib/aiStore';
import { tx } from '../../lib/i18n';

/*
 * A rendered Markdown view of the current buffer.
 *
 * ## Why this reuses react-markdown rather than a second renderer
 *
 * The chat already renders Markdown with `react-markdown` + `remark-gfm`
 * (see ChatMessage). Pulling in a different library for the editor would mean
 * two Markdown dialects in one app: a table or a task list that renders in the
 * chat but not here, reported as "preview is broken" when it is only
 * different. One renderer, one dialect.
 *
 * ## Why it reads a `source` prop instead of the live CodeMirror doc
 *
 * The source is passed in from the host, which already holds the debounced tab
 * content. Reaching into the EditorView from here would couple the preview to
 * the editor's internals and re-render on every keystroke; the host re-renders
 * this component when `source` settles, which is exactly when the preview
 * should change.
 *
 * ## Why links and bare paths are handled the same way as in chat
 *
 * A release note or a README routinely points at a file in the repo. Making
 * `src/lib/x.ts` clickable here, the way it is in an answer, means the preview
 * is a navigation surface and not just a picture of the text — which is the
 * reason to render it at all rather than read the source.
 */

const MD_PLUGINS = [remarkGfm];

/* Same path+line shape the chat uses, so a bare `src/lib/x.ts:12` is a link. */
const REF_RE = /^((?:\.{0,2}\/|\.{0,2}\\)?[\w@./\\-]+(?:\.\w{1,8}))(?::(\d+))?$/;
const KODE_LANG = /language-([\w-]+)/;

/* `pre` is unwrapped: the `code` handler draws its own block. */
const MdPre: NonNullable<Components['pre']> = ({ children }) => <>{children}</>;

function PreviewCode({ className, children }: { className?: string; children?: React.ReactNode }) {
  const setToast = useAi((s) => s.setToast);
  const text = String(children ?? '').replace(/\n$/, '');
  const m = KODE_LANG.exec(className ?? '');

  /* An inline span with no language that looks like a path becomes a link —
     identical rule to the chat, so the two never disagree about what is
     clickable. */
  if (!m && !text.includes('\n')) {
    const ref = REF_RE.exec(text);
    if (ref) {
      const berkasRef = ref[1];
      return (
        <button
          className="ai-file-ref"
          data-testid="md-file-ref"
          title={`Open ${ref[1]}${ref[2] ? `:${ref[2]}` : ''}`}
          onClick={() => {
            const line = ref[2] ? Number(ref[2]) : 1;
            if (berkasRef) void useStore.getState().openPathAt(berkasRef, line);
          }}
        >
          {text}
        </button>
      );
    }
    return <code className="md-inline">{text}</code>;
  }

  return (
    <div className="md-code" data-lang={m?.[1] ?? 'text'}>
      <div className="md-code-head">
        <span className="md-code-lang">{m?.[1] ?? 'text'}</span>
        <button
          className="md-code-copy"
          data-testid="md-copy-code"
          onClick={() => void clipboardWrite(text).then(() => setToast(tx('Code copied')))}
        >
          {tx('Copy')}
        </button>
      </div>
      <pre className="md-pre">
        <code>{text}</code>
      </pre>
    </div>
  );
}

const MD_COMPONENTS: Components = {
  pre: MdPre,
  code: PreviewCode,
  /* External links open in the system browser; a relative href that points at
     a repo file opens it in the editor instead of a dead browser tab. */
  a: ({ href, children }) => {
    const h = href ?? '';
    const looksExternal = /^[a-z]+:\/\//i.test(h) || h.startsWith('mailto:');
    if (!looksExternal && h && REF_RE.test(h)) {
      const ref = REF_RE.exec(h)!;
      return (
        <button
          className="md-link-file"
          data-testid="md-link-file"
          onClick={() => {
            const line = ref[2] ? Number(ref[2]) : 1;
            if (ref[1]) void useStore.getState().openPathAt(ref[1], line);
          }}
        >
          {children}
        </button>
      );
    }
    return (
      <a href={h} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

export default function MarkdownPreview({ source }: { source: string }) {
  /* react-markdown is pure in `source`; memoising the element keeps a parent
     re-render that did not change the text from reparsing the whole document. */
  const body = useMemo(
    () => (
      <Markdown remarkPlugins={MD_PLUGINS} components={MD_COMPONENTS}>
        {source}
      </Markdown>
    ),
    [source],
  );

  return (
    <div className="md-preview" data-testid="md-preview">
      <div className="md-preview-body">{body}</div>
    </div>
  );
}
