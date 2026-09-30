import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useToolGate, TOOL_GROUPS, SEMUA_TOOL, type ToolGroupId } from '../../lib/toolGate';
import AiIkon from './AiIkon';

/*
 * Floating tool gate.
 *
 * Sits over the editor rather than in the bottom dock: it is a decision the
 * user makes once and then closes, and a docked panel would compete with the
 * chat for the same strip of screen. The composer opens it, Escape closes it,
 * and the page behind dims so the list is the only thing being read.
 *
 * The counts are the point of the panel. "on/off" alone does not tell a reader
 * how much of the catalogue a worker can reach; `9/26` does, per group and in
 * total.
 */
export default function ToolGatePanel() {
  const tr = useT();
  const buka = useToolGate((s) => s.buka);
  const setBuka = useToolGate((s) => s.setBuka);
  const cari = useToolGate((s) => s.cari);
  const setCari = useToolGate((s) => s.setCari);
  const aktif = useToolGate((s) => s.aktif);
  const tutup = useToolGate((s) => s.tutup);
  const balik = useToolGate((s) => s.balik);
  const setGrup = useToolGate((s) => s.setGrup);
  const semua = useToolGate((s) => s.semua);
  const lipat = useToolGate((s) => s.lipat);

  const cariRef = useRef<HTMLInputElement | null>(null);
  const [sorot, setSorot] = useState(0);

  /* Focus the filter on open, so typing narrows without a click. */
  useEffect(() => {
    if (!buka) return;
    setCari('');
    setSorot(0);
    const t = window.setTimeout(() => cariRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [buka, setCari]);

  /* Escape closes; the listener lives only while the panel is up. */
  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setBuka(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [buka, setBuka]);

  /* Group counts, and the filtered view the list renders. */
  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return TOOL_GROUPS.map((g) => ({
      ...g,
      isi: g.tools.filter((t) => (q ? t.includes(q) : true)),
      nyala: g.tools.filter((t) => aktif.has(t)).length,
    })).filter((g) => g.isi.length > 0);
  }, [cari, aktif]);

  const totalNyala = SEMUA_TOOL.filter((t) => aktif.has(t)).length;

  /*
   * Keyboard navigation walks the flattened, filtered list.
   *
   * The rows are buttons, so Tab would also reach them — but stepping through
   * thirty rows one Tab at a time is unusable, and the arrow keys are what a
   * reader who is already typing in the filter expects.
   */
  const datar = useMemo(() => tampil.flatMap((g) => (tutup.has(g.id) ? [] : g.isi)), [tampil, tutup]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (datar.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSorot((i) => (i + 1) % datar.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSorot((i) => (i - 1 + datar.length) % datar.length);
    } else if (e.key === ' ') {
      e.preventDefault();
      const nama = datar[sorot];
      if (nama) balik(nama);
    }
  };

  if (!buka) return null;

  return (
    <>
      {/* Scrim: closes on click and dims the editor so the list leads. */}
      <div className="tg-scrim" data-testid="toolgate-scrim" onClick={() => setBuka(false)} />

      <div
        className="tg-panel"
        data-testid="toolgate"
        role="dialog"
        aria-label={tr('AI tools')}
        onKeyDown={onKeyDown}
      >
        <div className="tg-head">
          <AiIkon name="wrench" size={14} />
          {/* A word next to the spanner: the icon alone reads as "settings". */}
          <span className="tg-judul">{tr('AI tools')}</span>
          <input
            ref={cariRef}
            className="tg-cari"
            data-testid="toolgate-cari"
            placeholder={tr('Filter tools')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            spellCheck={false}
          />
          <button
            className="tg-x"
            data-testid="toolgate-tutup"
            title={tr('Close')}
            onClick={() => setBuka(false)}
          >
            <AiIkon name="x" size={13} />
          </button>
        </div>

        <div className="tg-list" data-testid="toolgate-list">
          {tampil.length === 0 && <p className="tg-kosong">{tr('No tool matches that filter.')}</p>}

          {tampil.map((g) => {
            const lipatIni = tutup.has(g.id);
            return (
              <div className="tg-grup" key={g.id} data-testid={`toolgate-grup-${g.id}`}>
                <div className="tg-grup-head">
                  {/* The caret owns the collapse; the checkbox owns the group. */}
                  <button
                    className={`tg-caret${lipatIni ? ' is-lipat' : ''}`}
                    onClick={() => lipat(g.id)}
                    aria-expanded={!lipatIni}
                    tabIndex={-1}
                  >
                    <AiIkon name="chev-down" size={11} />
                  </button>
                  <input
                    type="checkbox"
                    className="tg-cek"
                    data-testid={`toolgate-grup-cek-${g.id}`}
                    checked={g.nyala === g.tools.length}
                    ref={(el) => {
                      /* Indeterminate is the honest state for a partly-on group. */
                      if (el) el.indeterminate = g.nyala > 0 && g.nyala < g.tools.length;
                    }}
                    onChange={(e) => setGrup(g.id as ToolGroupId, e.target.checked)}
                  />
                  <button className="tg-nama-grup" onClick={() => lipat(g.id)} tabIndex={-1}>
                    {tr(g.id)}
                  </button>
                  <span className="tg-angka" data-nyala={g.nyala === g.tools.length}>
                    {g.nyala}/{g.tools.length}
                  </span>
                </div>

                {!lipatIni && (
                  <div className="tg-isi">
                    {g.isi.map((nama) => {
                      const idx = datar.indexOf(nama);
                      return (
                        <button
                          key={nama}
                          className={`tg-row${aktif.has(nama) ? ' is-on' : ''}${idx === sorot ? ' is-sorot' : ''}`}
                          data-testid={`toolgate-${nama}`}
                          data-on={aktif.has(nama)}
                          onClick={() => balik(nama)}
                          onMouseEnter={() => setSorot(idx)}
                          role="switch"
                          aria-checked={aktif.has(nama)}
                        >
                          <span className="tg-kotak" aria-hidden="true">
                            {aktif.has(nama) && <AiIkon name="check" size={9} />}
                          </span>
                          <span className="tg-nama">{nama}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="tg-foot">
          <span className="tg-total" data-testid="toolgate-total">
            {tr('{n} of {total} on').replace('{n}', String(totalNyala)).replace('{total}', String(SEMUA_TOOL.length))}
          </span>
          <div className="tg-aksi">
            <button className="tg-btn" data-testid="toolgate-all-on" onClick={() => semua(true)}>
              {tr('All on')}
            </button>
            <button className="tg-btn" data-testid="toolgate-all-off" onClick={() => semua(false)}>
              {tr('All off')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
