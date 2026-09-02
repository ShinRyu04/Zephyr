// ChatMessage.tsx — satu bubble chat + render markdown (fase 09).
//
// Markdown: react-markdown + remark-gfm. Code block dapat tombol Salin dan
// (untuk bahasa shell) tombol "Jalankan di Terminal" — jalur yang sama
// dipakai action bar di bawah chat.
//
// Highlight code block sengaja SEDERHANA (satu warna token via CSS), bukan
// CodeMirror penuh: satu instance EditorView per blok kode akan memakan RAM
// jauh di atas target PRD (<400MB idle).

import { memo } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi, isDestructive } from '../../lib/aiStore';
import { clipboardWrite } from '../../lib/clipboard';
import { findModel, ProviderLogo } from '../../lib/modelCatalog';
import type { ChatMsg } from '../../lib/types';

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

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const runInTerminal = useAi((s) => s.runInTerminal);
  const setToast = useAi((s) => s.setToast);
  const isShell = SHELL_LANGS.has(lang);

  return (
    <div className="ai-code" data-lang={lang || 'text'}>
      <div className="ai-code-head">
        <span className="ai-code-lang">{lang || 'text'}</span>
        <button
          className="ai-code-btn"
          data-testid="ai-copy-code"
          onClick={() => {
            void clipboardWrite(code).then(() => setToast('Kode disalin'));
          }}
        >
          Salin
        </button>
        {isShell && (
          <button
            className="ai-code-btn is-run"
            data-testid="ai-run-code"
            title={isDestructive(code) ? 'Perintah berisiko — akan minta konfirmasi' : 'Kirim ke pane terminal aktif'}
            onClick={() => void runInTerminal(code)}
          >
            Jalankan di Terminal
          </button>
        )}
      </div>
      <pre className="ai-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function ChatMessageInner({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === 'user';
  const def = msg.model ? findModel(msg.model) : null;

  return (
    <div
      className={`ai-msg is-${msg.role}${msg.error ? ' is-error' : ''}`}
      data-ai-msg={msg.id}
      data-role={msg.role}
    >
      <div className="ai-msg-head">
        {isUser ? (
          <span className="ai-who">Kamu</span>
        ) : (
          <>
            <ProviderLogo id={def?.provider ?? 'generic'} size={14} />
            <span className="ai-who">{def?.label ?? 'Assistant'}</span>
          </>
        )}
        {msg.attached && (
          <span className="ai-attach-chip" title={msg.attached.path} data-testid="ai-attach-chip">
            {msg.attached.path.split(/[\\/]/).pop()}
            {msg.attached.truncated ? ' (12KB)' : ''}
          </span>
        )}
        {msg.streaming && (
          <span className="ai-typing" data-testid="ai-typing" role="status">
            mengetik<span className="ai-dots">…</span>
          </span>
        )}
      </div>

      {msg.error ? (
        <p className="ai-error" data-testid="ai-error">
          {msg.error}
        </p>
      ) : (
        <div className="ai-body" data-ai-body={msg.id}>
          {isUser ? (
            <p className="ai-plain">{msg.content}</p>
          ) : (
            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Fence -> CodeBlock; inline code tetap <code>.
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children }) => {
                  const text = String(children ?? '').replace(/\n$/, '');
                  const m = /language-([\w-]+)/.exec(className ?? '');
                  if (!m && !text.includes('\n')) return <code className="ai-inline">{text}</code>;
                  return <CodeBlock code={text} lang={(m?.[1] ?? '').toLowerCase()} />;
                },
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {children}
                  </a>
                ),
              }}
            >
              {msg.content}
            </Markdown>
          )}
        </div>
      )}
    </div>
  );
}

/** memo: saat token mengalir, hanya bubble terakhir yang perlu re-render. */
export default memo(ChatMessageInner);
