import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { useStore } from '../../lib/store';
import { tx } from '../../lib/i18n';
import {
  ikonKind,
  jalurKe,
  labelKind,
  pohonSimbol,
  sebaya,
  type SimpulSimbol,
} from '../../lib/symbolTree';

const DEBOUNCE_MS = 400;

interface Props {
  view: EditorView | null;
  path?: string;
  
  docVersion: number;
  
  barisKursor: number;
}

export default function Breadcrumbs({ view, path, docVersion, barisKursor }: Props) {
  const workspace = useStore((s) => s.workspace);
  const [pohon, setPohon] = useState<SimpulSimbol[]>([]);
  const [punyaLsp, setPunyaLsp] = useState(false);
  const [buka, setBuka] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!view) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const st = view.state;
      void pohonSimbol(path, st).then((r) => {
        setPohon(r.pohon);
        setPunyaLsp(r.punyaLsp);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [view, path, docVersion]);

  useEffect(() => {
    if (buka === null) return;
    const onDown = (e: MouseEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setBuka(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuka(null);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onEsc);
    };
  }, [buka]);

  const segmenPath = useMemo(() => {
    if (!path) return ['Untitled'];
    const rel =
      workspace && path.toLowerCase().startsWith(workspace.toLowerCase())
        ? path.slice(workspace.length).replace(/^[\\/]/, '')
        : path;
    return rel.split(/[\\/]/).filter(Boolean);
  }, [path, workspace]);

  const jalurSimbol = useMemo(() => jalurKe(pohon, barisKursor), [pohon, barisKursor]);

  const lompatKe = useCallback(
    (baris: number) => {
      if (!view) return;
      const line = view.state.doc.line(Math.min(Math.max(baris, 1), view.state.doc.lines));
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
      });
      view.focus();
      setBuka(null);
    },
    [view],
  );

  return (
    <div className="cm-breadcrumbs" data-testid="breadcrumbs" ref={hostRef}>
      {segmenPath.map((seg, i) => (
        <span key={`p-${i}`} className="bc-seg bc-path" data-testid="bc-path-seg">
          {seg}
          {i < segmenPath.length - 1 && <span className="bc-sep">›</span>}
        </span>
      ))}

      {jalurSimbol.length > 0 && <span className="bc-sep">›</span>}

      {jalurSimbol.map((s, i) => {
        const daftar = sebaya(pohon, jalurSimbol, i);
        return (
          <span key={`s-${i}-${s.dari}`} className="bc-wrap">
            <button
              className="bc-seg bc-sym"
              data-testid="bc-sym-seg"
              data-sym-name={s.nama}
              title={`${labelKind(s.kind)} - line ${s.dari}`}
              aria-haspopup="menu"
              aria-expanded={buka === i}
              onClick={() => setBuka(buka === i ? null : i)}
            >
              <span className="bc-ikon" aria-hidden="true">
                {ikonKind(s.kind)}
              </span>
              {s.nama}
            </button>
            {i < jalurSimbol.length - 1 && <span className="bc-sep">›</span>}

            {buka === i && daftar.length > 0 && (
              <div className="bc-dropdown" data-testid="bc-dropdown" role="menu">
                {daftar.map((sib) => (
                  <button
                    key={`${sib.nama}-${sib.dari}`}
                    className={`bc-item${sib.dari === s.dari ? ' is-current' : ''}`}
                    data-testid="bc-dropdown-item"
                    role="menuitem"
                    onClick={() => lompatKe(sib.dari)}
                  >
                    <span className="bc-ikon" aria-hidden="true">
                      {ikonKind(sib.kind)}
                    </span>
                    <span className="bc-item-nama">{sib.nama}</span>
                    <span className="bc-item-baris">{sib.dari}</span>
                  </button>
                ))}
              </div>
            )}
          </span>
        );
      })}

      {/* Tanda sumber: kalau dari indentasi, jalurnya perkiraan - user berhak
          tahu supaya tidak menyalahkan breadcrumbs saat namanya kasar. */}
      {pohon.length > 0 && !punyaLsp && (
        <span className="bc-perkiraan" data-testid="bc-approx" title={tx('without a language server: path estimated from indentation')}>
          ~
        </span>
      )}
    </div>
  );
}
