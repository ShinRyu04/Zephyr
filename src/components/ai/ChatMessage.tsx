import { memo, useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi, isDestructive } from '../../lib/aiStore';
import { barisDiff, ringkasDiff, type DiffRow } from '../../lib/simpleDiff';
import { clipboardWrite } from '../../lib/clipboard';
import { findModel, ProviderLogo } from '../../lib/modelCatalog';
import type { ChatMsg } from '../../lib/types';
import AiIkon from './AiIkon';
import ReasoningBlock from './ReasoningBlock';
import { infoAksi, perintahAksi, sasaranAksi } from '../../lib/labelAksi';
import { tx, tf, useT } from '../../lib/i18n';

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
              {msg.tools.map((t, i) => {
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
                return (
                <div
                  className={`ai-toolrun${t.ok ? '' : ' is-gagal'}`}
                  key={i}
                  data-tool-name={t.name}
                  data-ok={t.ok ? '1' : '0'}
                >
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
                       * The row leads with the human target, never the raw args.
                       *
                       * It used to print `t.args` verbatim, so every line read
                       * `Read {"path":"package.json"}` — JSON punctuation in the
                       * middle of a sentence, which is noise, not information.
                       * Hermes shows `Read package.json` and the same is right
                       * here: the resolved target when there is one, and the
                       * command itself for a shell call. The full JSON stays one
                       * click away in the expanded body.
                       */
                      const label = target || '';
                      /*
                       * Never render an empty argument chip.
                       *
                       * `{}` and `{"path":""}` carry nothing, and an empty
                       * bordered box at the end of a row reads as a text field
                       * that failed to fill — the single loudest "this is
                       * broken" cue in the whole transcript. A call with no
                       * arguments simply shows its verb.
                       */
                      const argKosong =
                        !label ||
                        label === '{}' ||
                        label === '[]' ||
                        /^\{\s*"(path|command|query)":\s*""\s*\}$/.test(label);
                      return (
                        <>
                          <span className={`ai-toolrun-ikon is-${info.jenis}`} aria-hidden="true">
                            <AiIkon name={info.ikon as never} size={13} />
                          </span>
                          <span className="ai-toolrun-name">{info.label}</span>
                          {fileChip ? (
                            <span className="ai-file-chip" data-testid="ai-file-chip" title={target}>
                              {target}
                            </span>
                          ) : (
                            !argKosong && <code className="ai-toolrun-args">{label}</code>
                          )}
                          {stat && (
                            <span className="ai-toolrun-stat" data-testid="ai-toolrun-stat">
                              {stat}
                            </span>
                          )}
                        </>
                      );
                    })()}
                    {!t.ok && <span className="ai-toolrun-fail">{tx('failed')}</span>}
                    {/*
                      * Elapsed time, right-aligned and quiet.
                      *
                      * Runs restored from an older transcript carry no `ms`, and
                      * a missing value has to print nothing: "0ms" would read as
                      * a tool that did no work. Sub-millisecond reads are the
                      * same non-information — Hermes drops them, and a column of
                      * "0ms" down the right edge is pure noise.
                      */}
                    {typeof t.ms === 'number' && t.ms >= 10 && (
                      <span className="ai-toolrun-ms" data-testid="ai-toolrun-ms">
                        {t.ms < 1000 ? `${t.ms}ms` : `${(t.ms / 1000).toFixed(1)}s`}
                      </span>
                    )}
                  </button>
                  {buka[i] && (
                    <div className="ai-toolrun-body">
                      {/*
                        * Plain text, not labelled panels.
                        *
                        * The body used to be two bordered boxes under the
                        * headings INPUT and OUTPUT. Those headings are the
                        * tool's vocabulary, not the reader's: nobody opens a
                        * transcript to learn which half is which, and the boxes
                        * added four rules and two fills between the user and
                        * six lines of text. What the reader wants is the
                        * command and what it printed, laid out as prose — so
                        * the command keeps the monospace row it always had, and
                        * the result follows it unboxed.
                        */}
                      {/*
                       * Input and Output, each in its own labelled block.
                       *
                       * The command that produced a result is the first thing
                       * a reader checks when something looks wrong, and it has
                       * to be distinguishable from the result at a glance —
                       * "Input" and "Output" do that with one word each. The
                       * tab strip is the same idea one level down: a shell
                       * call has two streams, and mixing stderr into stdout
                       * buries the error inside the noise that preceded it.
                       */}
                      {perintahAksi(t.name, t.args) && (
                        <div className="ai-io">
                          <span className="ai-io-label">{tx('Input')}</span>
                          <pre className="ai-io-code" data-testid="ai-toolrun-in">
                            {perintahAksi(t.name, t.args)}
                          </pre>
                        </div>
                      )}

                      <div className="ai-io">
                        <div className="ai-io-head">
                          <span className="ai-io-label">{tx('Output')}</span>
                          <span className="ai-io-tabs">
                            <span className="ai-io-tab is-on">
                              {tx('stdout')}
                              {t.bytes ? ` ${t.bytes}` : ''}
                            </span>
                            <span className="ai-io-tab">{tx('stderr')}</span>
                          </span>
                          {typeof t.exitCode === 'number' && (
                            <span
                              className={`ai-io-exit${t.exitCode === 0 ? ' is-ok' : ' is-err'}`}
                              data-testid="ai-toolrun-exit"
                            >
                              exit {t.exitCode}
                            </span>
                          )}
                        </div>
                        <pre
                          className={`ai-io-code${t.ok ? '' : ' is-err'}`}
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
              {msg.reasoning && !msg.streaming && (
                <ReasoningBlock teks={msg.reasoning} ms={msg.reasoningMs} />
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
            *
            * No icon, no orb, no dragon: Hermes marks this state with a plain
            * line of text and a sweeping ellipsis, and that is what belongs
            * here. An animated mascot in the middle of a transcript reads as
            * decoration competing with the answer, and the reader only needs to
            * know one thing — work is happening.
            */}
          {!isUser && msg.streaming && !msg.content && !msg.reasoning && (
            <div className="ai-think" data-testid="ai-think-body" role="status">
              <span className="ai-think-text">{tx('Thinking about the next step')}</span>
              <span className="ai-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {/*
               * How long this has been going.
               *
               * TEDI prints "Thinking about the next step   6s" — the same
               * sentence plus a live count. Without it the line looks the same
               * at two seconds and at two minutes, and the reader cannot tell
               * a slow provider from a stuck one. It only appears once the wait
               * is worth mentioning: a sub-second flash of a number reads as a
               * glitch.
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
    </div>
  );
}

export default memo(ChatMessageInner);
