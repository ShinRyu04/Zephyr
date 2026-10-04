import { memo, useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi, isDestructive } from '../../lib/aiStore';
import { barisDiff, ringkasDiff, type DiffRow } from '../../lib/simpleDiff';
import { clipboardWrite } from '../../lib/clipboard';
import { findModel, ProviderLogo } from '../../lib/modelCatalog';
import { useNeural, hentikanSemuaSuara } from '../../lib/useNeural';
import type { ChatMsg } from '../../lib/types';
import AiIkon from './AiIkon';
import Lightbox from './Lightbox';
import ReasoningBlock from './ReasoningBlock';
import { infoAksi, namaPolos, perintahAksi, sasaranAksi } from '../../lib/labelAksi';
import { tx, tf, useT } from '../../lib/i18n';
import { useBicaraStore } from '../../lib/bicaraStore';
import { teksUntukDibaca } from '../../lib/useBicara';
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
  /* Which attachment is open full-size, if any. `null` = the viewer is closed. */
  const [gambarBuka, setGambarBuka] = useState<string | null>(null);
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
  const vBicara = useStore((s) => s.settings?.voice?.enabled !== false);
  const vVoiceId = useStore((s) => s.settings?.voice?.voiceId ?? '');
  const vInputLang = useStore((s) => s.settings?.voice?.inputLang ?? 'en-US');
  const vRate = useStore((s) => s.settings?.voice?.rate ?? 1);
  const vVolume = useStore((s) => s.settings?.voice?.volume ?? 1);
  const vSkipKode = useStore((s) => s.settings?.voice?.skipCode !== false);

  /*
   * One speech engine for the whole transcript, and it has to be.
   *
   * `speechSynthesis` is a single global queue, so N messages each owning their
   * own hook is N hooks fighting over one voice - pressing speak on a second
   * answer while the first is talking produces a jumble with no way to stop
   * either. The engine lives in the store; a message only asks about itself.
   *
   * Primitives again, for the same reason as above: `idBicara` is a string or
   * null, so this row re-renders when the speaker changes, and only then.
   */
  const bicarakan = useBicaraStore((s) => s.bicarakan);
  const idBicara = useBicaraStore((s) => s.idBicara);
  const neural = useNeural();
  const neuralAktif = useStore((s) => s.settings?.voice?.neuralEnabled === true);
  const iniNeural = neural.lagiBicara !== null && neural.lagiBicara === msg.id;
  const iniBicara = iniNeural || (idBicara !== null && idBicara === msg.id);

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
          {!isUser && !msg.streaming && !msg.error && vBicara && msg.content.trim() !== '' && (
            <button
              className={'ai-msg-act' + (iniBicara ? ' ai-msg-act-on' : '')}
              data-testid="ai-speak-msg"
              aria-pressed={iniBicara}
              title={iniBicara ? tr('Stop reading') : tr('Read this answer aloud')}
              onClick={() => {
                if (neuralAktif) {
                  try { useBicaraStore.getState().hentikan(); } catch { /* abaikan */ }
                  neural.bicarakan(msg.id, msg.content, () => {
                    hentikanSemuaSuara();
                    bicarakan(msg.id, teksUntukDibaca(msg.content, { lewatiKode: vSkipKode }), {
                      id: vVoiceId,
                      lang: vInputLang,
                      rate: vRate,
                      volume: vVolume,
                    });
                    setToast(tr('Neural voice unavailable - using built-in voice'));
                  });
                } else {
                  hentikanSemuaSuara();
                  bicarakan(msg.id, teksUntukDibaca(msg.content, { lewatiKode: vSkipKode }), {
                    id: vVoiceId,
                    lang: vInputLang,
                    rate: vRate,
                    volume: vVolume,
                  });
                }
              }}
            >
              <AiIkon name={iniBicara ? 'speaker-on' : 'speaker'} size={14} />
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
                  data-tool-name={namaPolos(t.name)}
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
                          {/*
                            * Glyph per action kind, from the same table that
                            * supplies the label.
                            *
                            * The row used to draw the shell prompt `>_` for
                            * EVERY call. The reasoning was that twenty shapes in
                            * twenty rows is a list you must read rather than
                            * scan, and that colour already carries the kind via
                            * `is-<jenis>`. The reasoning is sound in the
                            * abstract and wrong in practice: in a long run of
                            * steps - read, edit, run, read, edit - the column
                            * becomes a single repeated mark, and "everything
                            * looks like a terminal" is exactly what a reader
                            * concludes. Colour alone does not survive a glance
                            * or a screenshot, and it disappears entirely for
                            * anyone who cannot separate the red and green used
                            * for `tulis` and `jalan`.
                            *
                            * `labelAksi` already assigns a distinct glyph per
                            * tool (`doc`, `doc-edit`, `search`, `terminal`,
                            * `clock`, `puzzle`, ...), and `AiIkon` already draws
                            * all of them. The generic mark was the only thing
                            * discarding that information.
                            *
                            * A shape is not a decoration here, it is the
                            * fastest channel: the eye matches an outline before
                            * it reads a word. Colour stays as a second cue on
                            * `is-<jenis>` rather than the only one.
                            */}
                          <span className={`ai-toolrun-ikon is-${info.jenis}`} aria-hidden="true">
                            <AiIkon name={info.ikon} size={13} />
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
