import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useLsp } from '../../lib/lspStore';
import { serverForPath } from '../../lib/lsp';
import { lspSymbolTree, type SymbolOutline } from '../../lib/lspCm';
import { revealPosition } from '../../lib/editorRegistry';
import { useT } from '../../lib/i18n';

interface OutlineRow {
  simbol: SymbolOutline;
  depth: number;
}

const ratakan = (list: SymbolOutline[], depth = 0, out: OutlineRow[] = []): OutlineRow[] => {
  for (const s of list) {
    out.push({ simbol: s, depth });
    if (s.children.length > 0) ratakan(s.children, depth + 1, out);
  }
  return out;
};

export default function OutlinePanel() {
  const tr = useT();
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const path = tab?.path ?? null;
  const langId = serverForPath(path ?? '')?.languageId ?? 'plaintext';

  const lspAktif = useLsp((s) => (path ? !!s.docs[path] : false));
  const [pohon, setPohon] = useState<SymbolOutline[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versi, setVersi] = useState(0);

  useEffect(() => {
    if (!path) {
      setPohon([]);
      setError(null);
      return;
    }
    const def = serverForPath(path);
    if (!def) {
      setPohon([]);
      setError(null);
      return;
    }
    let hidup = true;
    setSibuk(true);
    setError(null);
    void (async () => {
      try {
        await useLsp.getState().ensureFor(path);
        const hasil = await lspSymbolTree(path);
        if (!hidup) return;
        setPohon(hasil);
      } catch (e) {
        if (!hidup) return;
        setPohon([]);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (hidup) setSibuk(false);
      }
    })();
    return () => {
      hidup = false;
    };
  }, [path, langId, lspAktif, versi]);

  const baris = useMemo(() => ratakan(pohon), [pohon]);
  const jumlah = baris.length;

  if (!path) {
    return (
      <div className="side-panel" data-testid="outline-panel">
        <div className="side-section">
          <div className="side-title">{tr('Outline')}</div>
          <p className="side-muted">{tr('Open a file to see its symbols.')}</p>
        </div>
      </div>
    );
  }

  if (!serverForPath(path)) {
    return (
      <div className="side-panel" data-testid="outline-panel">
        <div className="side-section">
          <div className="side-title">{tr('Outline')}</div>
          <p className="side-muted">{tr('No language server for this file.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="side-panel outline-panel" data-testid="outline-panel">
      <div className="side-section outline-head">
        <div className="side-title">
          {tr('Outline')}
          {jumlah > 0 ? ` (${jumlah})` : ''}
        </div>
        <button
          className="btn-xs outline-refresh"
          data-testid="outline-refresh"
          title={tr('Refresh Outline')}
          onClick={() => setVersi((v) => v + 1)}
        >
          {tr('Refresh')}
        </button>
      </div>

      {sibuk ? (
        <p className="side-muted">{tr('Loading symbols…')}</p>
      ) : error ? (
        <p className="side-muted" data-testid="outline-error">
          {error}
        </p>
      ) : baris.length === 0 ? (
        <p className="side-muted" data-testid="outline-empty">
          {tr('No symbols found.')}
        </p>
      ) : (
        <div className="outline-list" data-testid="outline-list">
          {baris.map((r, i) => (
            <button
              key={`${r.simbol.name}-${r.simbol.line}-${i}`}
              className="outline-item"
              data-testid="outline-item"
              data-kind={r.simbol.kind}
              style={{ paddingLeft: `${6 + r.depth * 12}px` }}
              title={`${r.simbol.kind} ${r.simbol.name} :${r.simbol.line}`}
              onClick={() => {
                window.setTimeout(() => revealPosition(r.simbol.line, r.simbol.column), 40);
              }}
            >
              <span className="outline-kind">{r.simbol.kind}</span>
              <span className="outline-name">{r.simbol.name}</span>
              <span className="outline-loc">:{r.simbol.line}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
