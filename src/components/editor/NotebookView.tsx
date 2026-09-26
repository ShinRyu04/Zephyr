import { useEffect, useMemo, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useStore, useActiveTab } from '../../lib/store';
import { useT } from '../../lib/i18n';

interface Sel {
  jenis: 'code' | 'markdown' | 'raw';
  sumber: string;
  keluaran: string;
}

function bacaSel(teks: string): Sel[] {
  let j: { cells?: { cell_type?: string; source?: string[] | string; outputs?: unknown[] }[] };
  try {
    j = JSON.parse(teks);
  } catch {
    return [];
  }
  const cells = Array.isArray(j.cells) ? j.cells : [];
  return cells.map((c) => {
    const sumber = Array.isArray(c.source) ? c.source.join('') : String(c.source ?? '');
    let keluaran = '';
    const outs = Array.isArray(c.outputs) ? c.outputs : [];
    for (const o of outs) {
      const oo = o as { text?: string[] | string; data?: Record<string, string[] | string> };
      if (oo.text) keluaran += Array.isArray(oo.text) ? oo.text.join('') : oo.text;
      const d = oo.data?.['text/plain'];
      if (d) keluaran += Array.isArray(d) ? d.join('') : d;
    }
    const jenis = c.cell_type === 'markdown' ? 'markdown' : c.cell_type === 'raw' ? 'raw' : 'code';
    return { jenis, sumber, keluaran };
  });
}

export default function NotebookView() {
  const tr = useT();
  const tab = useActiveTab();
  const workspace = useStore((s) => s.workspace);
  const [sel, setSel] = useState<Sel[]>([]);
  const [galat, setGalat] = useState('');
  const [jalan, setJalan] = useState<number | null>(null);

  const path = tab?.path ?? '';

  useEffect(() => {
    void (async () => {
      try {
        const r = await cmd.fsRead(path);
        setSel(bacaSel(r.content ?? ''));
      } catch (e) {
        setGalat(String((e as Error)?.message ?? e));
      }
    })();
  }, [path]);

  const judul = useMemo(() => path.split(/[\\/]/).pop() ?? 'notebook', [path]);

  const jalankanSel = async (i: number) => {
    if (!workspace) {
      setGalat(tr('Open a folder first.'));
      return;
    }
    setJalan(i);
    setGalat('');
    try {
      const tmp = `${workspace}/.zephyr-nb-${Date.now()}.py`;
      await cmd.fsWrite(tmp, sel[i].sumber);
      const r = await cmd.agentExec(`python "${tmp.replace(/\\/g, '/')}"`, 60000);
      await cmd.fsDelete([tmp], false).catch(() => {});
      setSel((s) => s.map((x, k) => (k === i ? { ...x, keluaran: r.stdout + r.stderr } : x)));
    } catch (e) {
      setGalat(String((e as Error)?.message ?? e));
    } finally {
      setJalan(null);
    }
  };

  return (
    <div className="nb-view" data-testid="nb-view">
      <div className="nb-bar">
        <span className="nb-nama" title={path}>
          {judul}
        </span>
        <span className="nb-count">
          {sel.length} {tr('cells')}
        </span>
      </div>
      {galat && <p className="nb-error">{galat}</p>}
      <div className="nb-body">
        {sel.map((s, i) => (
          <div className="nb-cell" data-testid={`nb-cell-${i}`} key={i} data-jenis={s.jenis}>
            <div className="nb-cell-head">
              <span className="nb-jenis">{s.jenis}</span>
              {s.jenis === 'code' && (
                <button
                  className="btn btn-sm"
                  data-testid={`nb-run-${i}`}
                  disabled={jalan !== null}
                  onClick={() => void jalankanSel(i)}
                >
                  {jalan === i ? tr('Running…') : tr('Run')}
                </button>
              )}
            </div>
            <pre className="nb-src">{s.sumber}</pre>
            {s.keluaran.trim() && (
              <pre className="nb-out" data-testid={`nb-out-${i}`}>
                {s.keluaran}
              </pre>
            )}
          </div>
        ))}
        {sel.length === 0 && !galat && <p className="side-muted">{tr('No cells found in this notebook.')}</p>}
      </div>
    </div>
  );
}
