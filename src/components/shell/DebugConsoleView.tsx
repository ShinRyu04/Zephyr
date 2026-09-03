// DebugConsoleView.tsx — kontrak Debug Console (fase 20).
//
// SENGAJA belum tersambung ke DAP. Brief fase 20 menetapkan: input REPL
// no-op yang menulis ke channel Output "Debug"; fase 22 (Debugger) yang
// menyambungkannya ke adapter sungguhan lewat `evaluate()`.
//
// Yang penting di fase ini adalah BENTUKNYA benar (area output read-only +
// satu baris input), supaya fase 22 tinggal mengganti isi `evaluate()` tanpa
// menyentuh UI.

import { useRef, useState } from 'react';
import { useOutput } from '../../lib/outputStore';
import { useDebug } from '../../lib/debugStore';

/** Placeholder tipe; fase 22 akan memindahkannya ke debugConsoleStore.ts. */
export interface DebugEvalResult {
  ok: boolean;
  text: string;
}

/**
 * Evaluasi ekspresi REPL lewat DAP `evaluate` (context: "repl").
 *
 * Fase 20 menyisakan ini sebagai no-op; fase 22 menyambungkannya ke sesi
 * sungguhan. Bentuk UI tidak berubah — itu memang tujuan kontrak fase 20.
 */
export const evaluateDebugExpr = async (expr: string): Promise<DebugEvalResult> => {
  const teks = await useDebug.getState().evalRepl(expr);
  const ok = useDebug.getState().state !== 'inactive';
  useOutput.getState().append('debug', `> ${expr}\n${teks}`);
  return { ok, text: teks };
};

export default function DebugConsoleView() {
  // fase 22: isi console = riwayat REPL dari debugStore (input + hasil +
  // stdout/stderr program), bukan lagi channel Output "Debug". Channel Output
  // tetap diisi sebagai log teknis adapter.
  const repl = useDebug((s) => s.repl);
  const state = useDebug((s) => s.state);
  const bersihkanRepl = useDebug((s) => s.bersihkanRepl);
  const [expr, setExpr] = useState('');
  /** riwayat input supaya panah atas/bawah berguna seperti REPL sungguhan */
  const riwayat = useRef<string[]>([]);
  const posisi = useRef(-1);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const kirim = () => {
    const t = expr.trim();
    if (!t) return;
    riwayat.current.unshift(t);
    posisi.current = -1;
    void evaluateDebugExpr(t);
    setExpr('');
    window.setTimeout(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 20);
  };

  return (
    <div className="dc-root" data-testid="debug-console-view" data-dbg-state={state}>
      <div className="dc-body" ref={bodyRef} data-testid="dc-body">
        {repl.length === 0 ? (
          <p className="dc-empty" data-testid="dc-empty">
            Debug Console. Mulai sesi debug (F5) lalu evaluasi ekspresi di frame yang
            sedang berhenti.
          </p>
        ) : (
          repl.map((l, i) => (
            <div
              className={`dc-line is-${l.kind}`}
              data-testid="dc-line"
              data-kind={l.kind}
              key={i}
            >
              {l.kind === 'input' ? `› ${l.text}` : l.text || '\u00a0'}
            </div>
          ))
        )}
      </div>

      <div className="dc-input-row">
        <span className="dc-prompt" aria-hidden="true">
          ›
        </span>
        <input
          className="dc-input"
          data-testid="dc-input"
          placeholder="Evaluasi ekspresi…"
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              kirim();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (posisi.current + 1 < riwayat.current.length) {
                posisi.current += 1;
                setExpr(riwayat.current[posisi.current]);
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (posisi.current > 0) {
                posisi.current -= 1;
                setExpr(riwayat.current[posisi.current]);
              } else {
                posisi.current = -1;
                setExpr('');
              }
            }
          }}
          aria-label="Ekspresi debug"
        />
        <button className="btn btn-sm" data-testid="dc-send" onClick={kirim}>
          Kirim
        </button>
        <button
          className="btn btn-sm"
          title="Bersihkan console"
          data-testid="dc-clear"
          onClick={bersihkanRepl}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
