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

/** Placeholder tipe; fase 22 akan memindahkannya ke debugConsoleStore.ts. */
export interface DebugEvalResult {
  ok: boolean;
  text: string;
}

/**
 * Evaluasi ekspresi REPL. Fase 20: no-op yang mencatat ke Output "Debug".
 * Fase 22 mengganti isinya dengan panggilan DAP `evaluate` request.
 */
export const evaluateDebugExpr = (expr: string): DebugEvalResult => {
  const teks = `> ${expr}\nDebug adapter belum aktif (fase 22). Ekspresi tidak dievaluasi.`;
  useOutput.getState().append('debug', teks);
  return { ok: false, text: teks };
};

export default function DebugConsoleView() {
  const lines = useOutput((s) => s.channels.find((c) => c.id === 'debug')?.lines ?? []);
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
    evaluateDebugExpr(t);
    setExpr('');
    window.setTimeout(() => {
      const el = bodyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 20);
  };

  return (
    <div className="dc-root" data-testid="debug-console-view">
      <div className="dc-body" ref={bodyRef} data-testid="dc-body">
        {lines.length === 0 ? (
          <p className="dc-empty" data-testid="dc-empty">
            Debug Console. Debugger (DAP) datang di fase 22 — sekarang ekspresi yang
            dikirim dicatat ke channel Output “Debug”.
          </p>
        ) : (
          lines.map((l, i) => (
            <div className="dc-line" data-testid="dc-line" key={i}>
              {l || '\u00a0'}
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
      </div>
    </div>
  );
}
