import { memo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAi, isDestructive } from '../../lib/aiStore';
import { barisDiff, ringkasDiff, type DiffRow } from '../../lib/simpleDiff';
import { clipboardWrite } from '../../lib/clipboard';
import { findModel, ProviderLogo } from '../../lib/modelCatalog';
import type { ChatMsg } from '../../lib/types';
import ReasonedBlock from './ReasonedBlock';
import { tx } from '../../lib/i18n';

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
      if (!id) return setToast(tx('Tidak ada tab editor aktif'));
      const tab = s.tabs.find((t) => t.id === id);
      const lama = tab?.content ?? '';
      if (lama === code) return setToast(tx('Isi file sudah sama dengan kode ini'));
      setPratinjau(barisDiff(lama, code));
    });
  };

  const konfirmasiTerapkan = () => {
    setPratinjau(null);
    void import('../../lib/store').then(({ useStore }) => {
      const s = useStore.getState();
      const id = s.activeTabId;
      if (!id) return setToast(tx('Tidak ada tab editor aktif'));
      s.updateTabContent(id, code);
      setToast(tx('Isi tab diganti — Ctrl+S untuk menyimpan'));
    });
  };
  const sisipkan = () => {
    void import('../../lib/mcpStore').then(({ runAction }) => {
      void runAction('editor_insert', { text: code }).then((r) => {
        const rr = r as { tabId?: string } | null;
        setToast(rr?.tabId ? tx('Kode disisipkan di kursor') : tx('Tidak ada tab aktif untuk menyisipkan'));
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
              title={tx('Ganti isi tab editor aktif dengan kode ini')}
              onClick={terapkan}
            >
              Terapkan
            </button>
            <button
              className="ai-code-btn"
              data-testid="ai-insert-code"
              title={tx('Sisipkan kode di posisi kursor')}
              onClick={sisipkan}
            >
              Sisipkan
            </button>
          </>
        )}
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
      {pratinjau && (
        <div className="ai-diff" data-testid="ai-diff">
          <div className="ai-diff-head">
            <span className="ai-diff-sum">
              {ringkasDiff(pratinjau).tambah} baris ditambah ·{' '}
              {ringkasDiff(pratinjau).hapus} baris dihapus
            </span>
            <button className="ai-code-btn is-run" data-testid="ai-diff-ok" onClick={konfirmasiTerapkan}>
              Terapkan
            </button>
            <button
              className="ai-code-btn"
              data-testid="ai-diff-cancel"
              onClick={() => setPratinjau(null)}
            >
              Batal
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
          <span className="ai-who">Kamu</span>
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
              title="Buat ulang jawaban ini"
              onClick={() => void regenerate()}
            >
              ↻
            </button>
          )}
          {!msg.streaming && !msg.error && (
            <button
              className="ai-msg-act"
              data-testid="ai-copy-msg"
              title={tx('Salin isi jawaban')}
              onClick={() => {
                void clipboardWrite(msg.content).then(() => setToast('Disalin'));
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
                    alt={`Lampiran ${i + 1}`}
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
                    <span className="ai-toolrun-name">{t.name}</span>
                    <code className="ai-toolrun-args">{t.args}</code>
                    {!t.ok && <span className="ai-toolrun-fail">gagal</span>}
                  </button>
                  {buka[i] && (
                    <>
                      <pre className={`ai-toolrun-out${t.ok ? '' : ' is-err'}`} data-testid="ai-toolrun-out">
                        {t.result || '(tanpa output)'}
                      </pre>
                      <div className="ai-toolrun-act">
                        <button
                          className="ai-code-btn"
                          data-testid="ai-toolrun-copy"
                          onClick={() => {
                            void clipboardWrite(t.result).then(() => setToast(tx('Output disalin')));
                          }}
                        >
                          Salin
                        </button>
                        <button
                          className="ai-code-btn"
                          data-testid="ai-toolrun-open"
                          title={tx('Buka pane terminal di panel bawah')}
                          onClick={() => {
                            void import('../../lib/panelStore').then((m) => {
                              m.usePanel.getState().focusTab('terminal');
                            });
                          }}
                        >
                          Buka di terminal
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {isUser ? (
            <p className="ai-plain">{msg.content}</p>
          ) : (
            <>
              {/* T1.1: blok "Reasoned" — penalaran model, bisa dilipat.
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
                          title={`Buka ${ref[1]}${ref[2] ? `:${ref[2]}` : ''}`}
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
        </div>
      )}
    </div>
  );
}

export default memo(ChatMessageInner);
