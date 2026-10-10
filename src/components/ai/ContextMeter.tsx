import { useEffect, useMemo, useRef, useState } from 'react';
import { useAi } from '../../lib/aiStore';
import type { ChatMsg } from '../../lib/types';
import { useT } from '../../lib/i18n';
import { useDragPopup } from '../../lib/useDragPopup';
import { kiraToken, jendelaKonteks, perkiraanKonteks, AUTO_COMPACT_AT } from '../../lib/contextBudget';

/*
 * Re-exported for the existing callers (the t3-11 check imports them from this
 * module). The implementation lives in contextBudget so the agent loop's
 * automatic compaction uses the exact same estimate the meter displays.
 */
export { kiraToken, jendelaKonteks };

/**
 * Indicative price (USD per 1 million tokens: input/output) per model.
 *
 * These numbers are an estimate to give a sense of cost, NOT an official bill.
 * If the model is not in the map, the cost is not shown (better empty
 * than displaying a fake number).
 */
const HARGA: Record<string, { masuk: number; keluar: number }> = {
  'gemini-3.8-flash': { masuk: 0.3, keluar: 2.5 },
  'gemini-3.7-flash': { masuk: 0.3, keluar: 2.5 },
  'gemini-3.6-flash': { masuk: 0.1, keluar: 0.4 },
  'gemini-3.1-pro-preview': { masuk: 1.25, keluar: 10 },
  'gemini-2.5-pro': { masuk: 1.25, keluar: 10 },
  'gemini-2.5-flash': { masuk: 0.3, keluar: 2.5 },
  'gpt-6-astra': { masuk: 2.5, keluar: 10 },
  'gpt-5.6-sol': { masuk: 1.25, keluar: 10 },
  'gpt-5.6-terra': { masuk: 0.5, keluar: 2 },
  'gpt-5.1-mini': { masuk: 0.25, keluar: 2 },
  'claude-opus-5': { masuk: 5, keluar: 25 },
  'claude-sonnet-5': { masuk: 3, keluar: 15 },
  'claude-haiku-4.5': { masuk: 1, keluar: 5 },
  'deepseek-v4-pro': { masuk: 0.28, keluar: 0.42 },
  'deepseek-chat': { masuk: 0.27, keluar: 1.1 },
  'grok-4.6': { masuk: 3, keluar: 15 },
  'grok-4': { masuk: 3, keluar: 15 },
};

export function perkiraanBiaya(
  modelId: string,
  tokenMasuk: number,
  tokenKeluar: number,
): number | null {
  const h = HARGA[modelId];
  if (!h) return null;
  return (tokenMasuk / 1_000_000) * h.masuk + (tokenKeluar / 1_000_000) * h.keluar;
}

/**
 * A frozen empty list, so the selector below can return a STABLE reference.
 *
 * zustand v5 compares the selector's output with `===`, so `?? []` inside the
 * selector allocates a new array on every call. Whenever `activeSession()` is
 * null that reads as "the snapshot changed" on every render, React re-renders,
 * the selector allocates again, and the loop ends in "Maximum update depth
 * exceeded" — which unmounts the whole tree, since AiPanel has no boundary of
 * its own. The empty session state is exactly when this fires: a cleared chat
 * store or a first run where the panel renders before init() finishes creating
 * the first chat.
 */
const MSG_KOSONG: ChatMsg[] = [];

export default function ContextMeter({ composerId = '' }: { composerId?: string }) {
  const tr = useT();
  const [buka, setBuka] = useState(false);
  /*
   * THIS surface's transcript, not the primary chat's.
   *
   *  resolves the store-wide , so with the chat open
   * in both the right column and the editor tab the ring showed the COLUMN's
   * context fullness in both places — the editor tab read 12% while its own
   * conversation was nearly empty. Same key the transcript and send path use.
   */
  const msgs = useAi((s) => {
    const id = s.activeIds[composerId] ?? null;
    return (id ? s.sessions.find((x) => x.id === id)?.messages : null) ?? MSG_KOSONG;
  });
  const model = useAi((s) => s.model);

  /*
   * The panel opens on hover and closes on leave. It used to open on click,
   * which put the numbers people check most often — how full is the context,
   * what has this session cost — two interactions away. Hovering the ring is
   * one, and it costs nothing to look.
   *
   * Focus/blur carry the same behaviour for the keyboard; click still toggles.
   */
  const tutupTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (tutupTimer.current !== null) window.clearTimeout(tutupTimer.current);
    },
    [],
  );

  const bukaSekarang = () => {
    if (tutupTimer.current !== null) {
      window.clearTimeout(tutupTimer.current);
      tutupTimer.current = null;
    }
    setBuka(true);
  };

  /*
   * Click PINNED open, hover only borrows it.
   *
   * Hover-first is kept — the numbers are one glance away — but a click used to
   * toggle against the state hover had already set: you pressed the ring with
   * the panel open (because it opened as you arrived) and it CLOSED. That made
   * the press useless, which is exactly what was reported. The click now pins:
   * press to keep it open while your pointer moves into the panel, press again
   * (or click outside) to dismiss. Leave-without-pin still closes after the
   * grace period, so the old hover behaviour is intact for readers who never
   * press anything.
   */
  const [sematkan, setSematkan] = useState(false);
  const { popupRef, onPointerDown } = useDragPopup();
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!buka) return;
    const luar = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setBuka(false);
        setSematkan(false);
      }
    };
    document.addEventListener('mousedown', luar);
    return () => document.removeEventListener('mousedown', luar);
  }, [buka]);

  /*
   * A short grace period before closing: moving the pointer from the ring to
   * the panel crosses a few pixels that belong to neither, and without the
   * delay the panel closes mid-reach.
   */
  const tutupNanti = () => {
    if (sematkan) return; /* pinned: only an outside click or a second press closes */
    if (tutupTimer.current !== null) window.clearTimeout(tutupTimer.current);
    tutupTimer.current = window.setTimeout(() => setBuka(false), 140);
  };

  /*
   * Memoised on the transcript identity + model.
   *
   * `perkiraanKonteks` plus the two cost reductions walk the WHOLE transcript
   * (up to MAX_MSGS = 200 messages) every time this component renders. During a
   * stream the parent used to render per token, so that sum ran per token; even
   * now that the transcript is its own subtree, recomputing it on every
   * unrelated re-render is pure waste for a number that only changes when the
   * messages do.
   */
  const { dipakai, total, persen, tokMasuk, tokKeluar, biaya } = useMemo(() => {
    const dipakai = perkiraanKonteks(msgs);
    const total = jendelaKonteks(model);
    const persen = Math.min(100, Math.round((dipakai / total) * 100));
    // Input tokens (user) vs output (assistant) for the session cost estimate.
    const tokMasuk = msgs
      .filter((m) => m.role === 'user')
      .reduce((n, m) => n + kiraToken(m.content ?? ''), 0);
    const tokKeluar = msgs
      .filter((m) => m.role === 'assistant')
      .reduce((n, m) => n + kiraToken(m.content ?? ''), 0);
    return { dipakai, total, persen, tokMasuk, tokKeluar, biaya: perkiraanBiaya(model, tokMasuk, tokKeluar) };
  }, [msgs, model]);

  const tingkat = persen >= 85 ? 'penuh' : persen >= 60 ? 'sedang' : 'aman';

  return (
    <span
      ref={wrapRef}
      className="ctx-wrap"
      onMouseEnter={bukaSekarang}
      onMouseLeave={tutupNanti}
      onFocus={bukaSekarang}
      onBlur={tutupNanti}
    >
      <button
        className={`ctx-btn is-${tingkat}`}
        data-testid="ctx-meter"
        data-persen={persen}
        title={tr('Context usage (estimate)')}
        aria-expanded={buka}
        aria-haspopup="dialog"
        onClick={() => {
          if (sematkan) {
            setSematkan(false);
            setBuka(false);
          } else {
            bukaSekarang();
            setSematkan(true);
          }
        }}
      >
        <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${(persen / 100) * 37.7} 37.7`}
            transform="rotate(-90 8 8)"
          />
        </svg>
        <span className="ctx-teks" data-testid="ctx-persen">
          {persen}%
        </span>
      </button>

      {buka && (
        <div ref={popupRef} className="ctx-pop" data-testid="ctx-pop" role="dialog" aria-label={tr('Context usage')} style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}>
          {/* The heading the reference panel carries. Without it the popup
              opens straight into a giant percentage with no name — the reader
              lands on a number and has to infer what it counts. */}
          <div className="ctx-judul" data-testid="ctx-judul" data-drag-handle onPointerDown={onPointerDown} style={{ cursor: 'grab' }}>{tr('Session Info')}</div>
          <div className="ctx-head">
            <span className="ctx-besar">{persen}%</span>
            <span className="ctx-kecil" data-testid="ctx-angka">
              {dipakai.toLocaleString('id-ID')} / {total.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="ctx-bar" role="progressbar" aria-valuenow={persen}>
            <div className={`ctx-bar-isi is-${tingkat}`} style={{ width: `${persen}%` }} />
            {/* The slice automatic compaction protects, drawn on the bar.
                AUTO_COMPACT_AT is where the agent loop fires — showing it means
                the bar's last fifth is visibly NOT free space, instead of the
                reader learning that from a toast after a compaction they did
                not ask for. */}
            <div
              className="ctx-bar-reserve"
              style={{ left: `${AUTO_COMPACT_AT * 100}%`, width: `${100 - AUTO_COMPACT_AT * 100}%` }}
            />
          </div>
          <div className="ctx-reserve">
            <span className="ctx-reserve-swatch" aria-hidden="true" />
            {tr('Reserved for response')}
          </div>
          <div className="ctx-baris">
            <span>{tr('Model')}</span>
            <b>{model || '-'}</b>
          </div>
          <div className="ctx-baris">
            <span>{tr('Context used')}</span>
            <b>{dipakai.toLocaleString('id-ID')}</b>
          </div>
          <div className="ctx-baris">
            <span>{tr('Context window')}</span>
            <b>{total.toLocaleString('id-ID')}</b>
          </div>
          <div className="ctx-baris">
            <span>{tr('Session tokens')}</span>
            <b data-testid="ctx-token-sesi">
              {tokMasuk.toLocaleString('id-ID')} ↓ / {tokKeluar.toLocaleString('id-ID')} ↑
            </b>
          </div>
          {biaya !== null && (
            <div className="ctx-baris">
              <span>{tr('Estimated cost')}</span>
              <b data-testid="ctx-biaya">
                {biaya < 0.01 ? `<$0.01` : `$${biaya.toFixed(biaya < 1 ? 3 : 2)}`}
              </b>
            </div>
          )}
          <p className="ctx-note">{tr('Estimated from the visible chat contents and tool payloads.')}</p>
          {biaya !== null && <p className="ctx-note">{tr('The cost is an estimate, not an official provider bill.')}</p>}
          {/*
           * The pressable action, as the reference popup has it: compacting
           * from HERE is where a reader finds out they need it — the bar just
           * told them the window is full. It used to exist only behind a slash
           * command, which you cannot discover at the moment the number goes
           * red. Clicking it compacts (keeping the last four messages) and
           * closes the panel, so the next glance at the ring shows the result.
           */}
          <button
            className="ctx-compact"
            data-testid="ctx-compact"
            onClick={() => {
              useAi.getState().compactContext();
              setBuka(false);
              setSematkan(false);
            }}
          >
            {tr('Compact Conversation')}
          </button>
        </div>
      )}
    </span>
  );
}
