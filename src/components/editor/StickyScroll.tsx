// StickyScroll.tsx — baris header menempel di atas editor saat scroll (fase 24).
//
// Dirender sebagai overlay DOM di atas .cm-editor, bukan sebagai widget
// CodeMirror. Alasannya: widget block akan MENGGESER layout dokumen (tinggi
// baris berubah saat scroll), yang membuat perhitungan scroll CodeMirror
// bergoyang. Overlay absolut tidak menyentuh layout dokumen sama sekali.
//
// Teksnya diambil dari dokumen apa adanya (dengan indentasi dipangkas), jadi
// tidak perlu me-render ulang syntax highlighting — cukup satu <button> per
// baris sticky, maksimum `stickyScrollMaxLines`.

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { barisSticky, ikonKind, pohonSimbol, type SimpulSimbol } from '../../lib/symbolTree';

const DEBOUNCE_MS = 400;

interface Props {
  view: EditorView | null;
  path?: string;
  docVersion: number;
  maxLines: number;
}

export default function StickyScroll({ view, path, docVersion, maxLines }: Props) {
  const [pohon, setPohon] = useState<SimpulSimbol[]>([]);
  const [baris, setBaris] = useState<SimpulSimbol[]>([]);
  const timer = useRef<number | null>(null);

  // Pohon simbol: sama seperti breadcrumbs, tapi disimpan terpisah supaya
  // sticky tetap jalan saat breadcrumbs dimatikan user.
  useEffect(() => {
    if (!view) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void pohonSimbol(path, view.state).then((r) => setPohon(r.pohon));
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [view, path, docVersion]);

  const hitung = useCallback(() => {
    if (!view || pohon.length === 0) {
      setBaris((lama) => (lama.length === 0 ? lama : []));
      return;
    }
    const scroller = view.scrollDOM;
    const blok = view.lineBlockAtHeight(scroller.scrollTop);
    const barisAtas = view.state.doc.lineAt(blok.from).number;
    const baru = barisSticky(pohon, barisAtas, Math.max(maxLines, 1));

    // Bandingkan dangkal supaya tidak set state tiap pixel scroll.
    setBaris((lama) => {
      if (lama.length === baru.length && lama.every((s, i) => s.dari === baru[i].dari)) return lama;
      return baru;
    });
  }, [view, pohon, maxLines]);

  useEffect(() => {
    if (!view) return;
    const scroller = view.scrollDOM;
    const onScroll = () => hitung();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    hitung();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [view, hitung]);

  useEffect(() => {
    hitung();
  }, [hitung, docVersion]);

  if (!view || baris.length === 0) return null;

  const doc = view.state.doc;

  return (
    <div className="cm-sticky" data-testid="sticky-scroll" data-count={baris.length}>
      {baris.map((s, i) => {
        const teks = doc.line(Math.min(s.dari, doc.lines)).text.trim();
        return (
          <button
            key={`${s.dari}-${i}`}
            className="cm-sticky-row"
            data-testid="sticky-row"
            data-line={s.dari}
            style={{ paddingLeft: `${8 + i * 12}px` }}
            title={`baris ${s.dari}`}
            onClick={() => {
              const line = doc.line(Math.min(s.dari, doc.lines));
              view.dispatch({
                selection: { anchor: line.from },
                effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
              });
              view.focus();
            }}
          >
            <span className="cm-sticky-ikon" aria-hidden="true">
              {ikonKind(s.kind)}
            </span>
            <span className="cm-sticky-teks">{teks.length > 120 ? `${teks.slice(0, 117)}…` : teks}</span>
            <span className="cm-sticky-baris">{s.dari}</span>
          </button>
        );
      })}
    </div>
  );
}
