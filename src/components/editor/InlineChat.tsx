import { useEffect, useRef, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { activeSelection } from '../../lib/editorRegistry';
import { useT } from '../../lib/i18n';

export default function InlineChat() {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  const [teks, setTeks] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const draft = useAi((s) => s.draft);
  const setDraft = useAi((s) => s.setDraft);
  const send = useAi((s) => s.send);
  const pending = useAi((s) => s.pending);
  const sessions = useAi((s) => s.sessions);
  const activeId = useAi((s) => s.activeId);

  const sesi = sessions.find((s) => s.id === activeId) ?? null;
  const terakhir = [...(sesi?.messages ?? [])].reverse().find((m) => m.role === 'assistant');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'i') return;
      const diEditor = !!(e.target as HTMLElement)?.closest('.zephyr-cm-host');
      if (!diEditor) return;
      e.preventDefault();
      e.stopPropagation();
      setBuka((v) => {
        if (!v) {
          const sel = activeSelection();
          setTeks(sel ? '' : '');
          useStore.getState().setSettingsOpen(false);
        }
        return !v;
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => {
    if (buka) taRef.current?.focus();
  }, [buka]);

  useEffect(() => {
    if (!buka) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setBuka(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [buka]);

  if (!buka) return null;

  const kirim = () => {
    const t = teks.trim();
    if (!t || pending) return;
    setDraft(t);
    setTeks('');

    window.setTimeout(() => void send(t), 0);
  };

  return (
    <div className="ic" data-testid="inline-chat" ref={boxRef}>
      <div className="ic-head">
        <span className="ic-title">Chat cepat</span>
        <button
          className="ic-close"
          data-testid="ic-close"
          title={tr('Tutup (Esc)')}
          aria-label={tr('Tutup chat cepat')}
          onClick={() => setBuka(false)}
        >
          ✕
        </button>
      </div>

      {draft && !teks && (
        <p className="ic-hint" data-testid="ic-draft">
          Draf panel AI: {draft.slice(0, 80)}
        </p>
      )}

      <textarea
        ref={taRef}
        className="ic-input"
        data-testid="ic-input"
        rows={3}
        placeholder={tr('Tanya atau minta ubah kode… (Enter kirim, Esc tutup)')}
        value={teks}
        onChange={(e) => setTeks(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setBuka(false);
          } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            kirim();
          }
        }}
      />

      {terakhir && (
        <div className="ic-out" data-testid="ic-out">
          {terakhir.content.slice(0, 1200)}
          {terakhir.content.length > 1200 ? '…' : ''}
        </div>
      )}

      <div className="ic-foot">
        <button
          className="btn btn-sm btn-primary"
          data-testid="ic-send"
          disabled={!teks.trim() || !!pending}
          onClick={kirim}
        >
          {pending ? 'Mengirim…' : 'Kirim'}
        </button>
      </div>
    </div>
  );
}
