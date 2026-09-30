import { memo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi, isDestructive } from '../../lib/aiStore';
import { barisDiff, ringkasDiff, type DiffRow } from '../../lib/simpleDiff';
import { clipboardWrite } from '../../lib/clipboard';
import { findModel, ProviderLogo } from '../../lib/modelCatalog';
import type { ChatMsg } from '../../lib/types';
import ReasonedBlock from './ReasonedBlock';
import AiIkon from './AiIkon';
import { infoAksi, sasaranAksi } from '../../lib/labelAksi';
import { tx, useT } from '../../lib/i18n';

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

const REF_RE = /^(?:\.{0,2}\/|\.{0,2}\\)?[\w@./\\-]+(?:\.\w{1,8})(?::(\d+))?$/;

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
          <div className="ai-diff-body">
            {pratinjau.map((r, i) => (
              <div key={i} className={`ai-diff-row is-${r.kind}`} data-kind={r.kind}>
                <span className="ai-diff-no">{r.a ?? ''}</span>
                <span className="ai-diff-no">{r.b ?? ''}</span>
                <span className="ai-diff-sign">
                  {r.kind === 'add' ? '+' : r.kind === 'del' ? '-' : ' '}
                </span>
                <span className="ai-diff-text">{r.text || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatMessageInner({ msg }: { msg: ChatMsg }) {
  const tr = useT();
  const isUser = msg.role === 'user';
  const def = msg.model ? findModel(msg.model) : null;
  const regenerate = useAi((s) => s.regenerate);
  const setToast = useAi((s) => s.setToast);
  const [buka, setBuka] = useState<Record<number, boolean>>({});

  return (
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
                  <img
                    className="ai-msg-img"
                    key={i}
                    src={src}
                    alt={`Attachment ${i + 1}`}
                    data-testid="ai-msg-img"
                  />
                ))}
              </div>
            );
          })()}
          {msg.tools && msg.tools.length > 0 && (
            <div className="ai-toolruns" data-testid="ai-toolruns">
              {msg.tools.map((t, i) => (
                <div className="ai-toolrun" key={i} data-tool-name={t.name}>
                  <button
                    className="ai-toolrun-head"
                    data-testid="ai-toolrun-toggle"
                    aria-expanded={!!buka[i]}
                    onClick={() => setBuka((b) => ({ ...b, [i]: !b[i] }))}
                  >
                    <span className="ai-toolrun-caret">{buka[i] ? '▾' : '▸'}</span>
                    {/*
                      * A file-editing call gets a chip that names the file, not
                      * a tool name and a JSON blob: "Write src/lib/types.ts" is
                      * the fact the reader wants, and the raw args are one click
                      * away in the expanded body.
                      */}
                    {(() => {
                      const info = infoAksi(t.name);
                      const target = sasaranAksi(t.args);
                      const fileChip = info.jenis === 'tulis' && target;
                      /*
                       * A shell call leads with the command itself, not the
                       * JSON envelope around it: `{"command":"git status"}`
                       * printed twice (header and INPUT) told the reader
                       * nothing the INPUT block did not already say. The
                       * command is what identifies the row.
                       */
                      const label = info.jenis === 'jalan' && target ? target : t.args;
                      return (
                        <>
                          <span className={`ai-toolrun-ikon is-${info.jenis}`} aria-hidden="true">
                            {info.ikon}
                          </span>
                          <span className="ai-toolrun-name">{info.label}</span>
                          {fileChip ? (
                            <span className="ai-file-chip" data-testid="ai-file-chip" title={target}>
                              <span className="ai-file-chip-grip" aria-hidden="true">
                                ⠿
                              </span>
                              {target}
                            </span>
                          ) : (
                            <code className="ai-toolrun-args">{label}</code>
                          )}
                        </>
                      );
                    })()}
                    {!t.ok && <span className="ai-toolrun-fail">{tr('failed')}</span>}
                    {/*
                      * Elapsed time, right-aligned and quiet.
                      *
                      * Runs restored from an older transcript carry no `ms`, and
                      * a missing value has to print nothing: "0ms" would read as
                      * a tool that did no work.
                      */}
                    {typeof t.ms === 'number' && (
                      <span className="ai-toolrun-ms" data-testid="ai-toolrun-ms">
                        {t.ms < 1000 ? `${t.ms}ms` : `${(t.ms / 1000).toFixed(1)}s`}
                      </span>
                    )}
                  </button>
                  {buka[i] && (
                    <div className="ai-toolrun-body">
                      {/*
                        * Input and Output get their own labelled sections.
                        *
                        * The old body was one flat <pre> of the result, so the
                        * command that produced it was only visible in the
                        * collapsed header's JSON blob — and on a shell call the
                        * command is exactly what the reader wants to check.
                        */}
                      <div className="ai-toolrun-sec">
                        <span className="ai-toolrun-sec-label">{tx('Input')}</span>
                        <pre className="ai-toolrun-code" data-testid="ai-toolrun-in">
                          {t.args}
                        </pre>
                      </div>

                      <div className="ai-toolrun-sec">
                        <span className="ai-toolrun-sec-label">{tx('Output')}</span>
                        <pre
                          className={`ai-toolrun-code ai-toolrun-out${t.ok ? '' : ' is-err'}`}
                          data-testid="ai-toolrun-out"
                        >
                          {t.result || tr('(no output)')}
                        </pre>
                      </div>

                      <div className="ai-toolrun-act">
                        <button
                          className="ai-toolrun-btn"
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
                          className="ai-toolrun-btn"
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
                          className="ai-toolrun-btn"
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
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isUser ? (
            <p className="ai-plain">{msg.content}</p>
          ) : (
            <>
              {/* T1.1: blok "Reasoned" - penalaran model, bisa dilipat.
                  Terlipat secara default supaya jawaban tetap jadi fokus;
                  dibuka otomatis saat masih mengalir supaya user melihat
                  model benar-benar berpikir (bukan menggantung). */}
              {msg.reasoning && (
                <ReasonedBlock text={msg.reasoning} streaming={!!msg.streaming} />
              )}
              <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children }) => {
                  const text = String(children ?? '').replace(/\n$/, '');
                  const m = /language-([\w-]+)/.exec(className ?? '');
                  if (!m && !text.includes('\n')) {
                    
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
                              void useStore.getState().openPathAt(ref[1], line);
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
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {children}
                  </a>
                ),
              }}
            >
              {msg.content}
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
            */}
          {!isUser && msg.streaming && !msg.content && !msg.reasoning && (
            <div className="ai-think" data-testid="ai-think-body" role="status">
              <span className="ai-think-orb" aria-hidden="true" />
              <span className="ai-think-text">{tx('Thinking')}</span>
              <span className="ai-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ChatMessageInner);
