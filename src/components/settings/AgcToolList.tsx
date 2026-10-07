import { useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useToolGate, TOOL_GROUPS, SEMUA_TOOL, SECTION_URUTAN } from '../../lib/toolGate';
import { POLA_AWALAN_MCP } from '../../lib/zephyrTools/catalog';
import { useDeskripsiTool } from '../../lib/zephyrTools/deskripsiToolHook';
import AiIkon from '../ai/AiIkon';

/*
 * The tool list, rendered INLINE inside Agent Customizations → Tools.
 *
 * This is the same model as the old floating `ToolGatePanel`, but without the
 * scrim/dialog chrome: the user asked for Tools to live inside the Agent
 * Customizations modal instead of opening a second popup over the editor. It
 * reads and writes the one `useToolGate` store, so toggles here and anywhere
 * else stay in step.
 */
export default function AgcToolList() {
  const tr = useT();
  const deskripsi = useDeskripsiTool();
  const cari = useToolGate((s) => s.cari);
  const setCari = useToolGate((s) => s.setCari);
  const aktif = useToolGate((s) => s.aktif);
  const tutup = useToolGate((s) => s.tutup);
  const balik = useToolGate((s) => s.balik);
  const setGrup = useToolGate((s) => s.setGrup);
  const semua = useToolGate((s) => s.semua);
  const lipat = useToolGate((s) => s.lipat);

  const [bagianTertutup, setBagianTertutup] = useState<Set<string>>(new Set());

  const tampil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const perBagian = SECTION_URUTAN.map((s) => ({
      ...s,
      grup: TOOL_GROUPS.filter((g) => g.section === s.id)
        .map((g) => ({
          ...g,
          isi: g.tools.filter((t) => (q ? t.toLowerCase().includes(q) : true)),
          nyala: g.tools.filter((t) => aktif.has(t)).length,
        }))
        .filter((g) => g.isi.length > 0),
    })).filter((s) => s.grup.length > 0);
    return { perBagian };
  }, [cari, aktif]);

  const totalNyala = SEMUA_TOOL.filter((t) => aktif.has(t)).length;
  const namaTampil = (nama: string): string => nama.replace(POLA_AWALAN_MCP, '');

  const lipatBagian = (id: string) => {
    setBagianTertutup((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setBagian = (id: string, nyala: boolean) => {
    for (const g of TOOL_GROUPS.filter((g) => g.section === id)) {
      if (nyala || g.optional) setGrup(g.id, nyala);
    }
  };

  return (
    <div className="agc-tools" data-testid="agc-tool-list">
      <div className="agc-tools-bar">
        <div className="agc-tools-search">
          <AiIkon name="search" size={12} />
          <input
            data-testid="agc-tools-cari"
            placeholder={tr('Filter tools')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            spellCheck={false}
          />
        </div>
        <span className="agc-tools-total" data-testid="agc-tools-total">
          {tr('{n} of {total} on').replace('{n}', String(totalNyala)).replace('{total}', String(SEMUA_TOOL.length))}
        </span>
        <button className="btn btn-sm" data-testid="agc-tools-all-on" onClick={() => semua(true)}>
          {tr('All on')}
        </button>
        <button className="btn btn-sm" data-testid="agc-tools-all-off" onClick={() => semua(false)}>
          {tr('All off')}
        </button>
      </div>

      <div className="agc-tools-list">
        {tampil.perBagian.length === 0 && (
          <p className="agc-tools-kosong">{tr('No tool matches that filter.')}</p>
        )}

        {tampil.perBagian.map((s) => {
          const lipatIni = bagianTertutup.has(s.id);
          const jumlah = s.grup.reduce((n, g) => n + g.tools.length, 0);
          const nyala = s.grup.reduce((n, g) => n + g.nyala, 0);
          return (
            <div className="agc-tools-bagian" key={s.id} data-testid={`agc-tools-bagian-${s.id}`}>
              <div className="agc-tools-bagian-head">
                <button
                  className={`agc-tools-caret${lipatIni ? ' is-lipat' : ''}`}
                  onClick={() => lipatBagian(s.id)}
                  aria-expanded={!lipatIni}
                  aria-label={`${s.label} ${tr('section')}`}
                >
                  <AiIkon name="chev-down" size={11} />
                </button>
                <input
                  type="checkbox"
                  className="agc-tools-cek"
                  data-testid={`agc-tools-bagian-cek-${s.id}`}
                  checked={nyala === jumlah}
                  disabled={s.id === 'mcp'}
                  ref={(el) => {
                    if (el) el.indeterminate = nyala > 0 && nyala < jumlah;
                  }}
                  onChange={(e) => setBagian(s.id, e.target.checked)}
                  aria-label={s.label}
                />
                <button className="agc-tools-bagian-nama" onClick={() => lipatBagian(s.id)}>
                  {s.label}
                </button>
                <span className="agc-tools-angka">{nyala}/{jumlah}</span>
              </div>

              {!lipatIni && s.grup.map((g) => {
                const lipatGrup = tutup.has(g.id);
                return (
                  <div className="agc-tools-grup" key={g.id} data-testid={`agc-tools-grup-${g.id}`}>
                    <div className="agc-tools-grup-head">
                      <button
                        className={`agc-tools-caret${lipatGrup ? ' is-lipat' : ''}`}
                        onClick={() => lipat(g.id)}
                        aria-expanded={!lipatGrup}
                      >
                        <AiIkon name="chev-down" size={11} />
                      </button>
                      <input
                        type="checkbox"
                        className="agc-tools-cek"
                        data-testid={`agc-tools-grup-cek-${g.id}`}
                        checked={g.nyala === g.tools.length}
                        disabled={!g.optional}
                        ref={(el) => {
                          if (el) el.indeterminate = g.nyala > 0 && g.nyala < g.tools.length;
                        }}
                        onChange={(e) => setGrup(g.id, e.target.checked)}
                      />
                      <button className="agc-tools-grup-nama" onClick={() => lipat(g.id)}>
                        {tr(g.label)}
                      </button>
                      <span className="agc-tools-angka" data-nyala={g.nyala === g.tools.length}>
                        {g.nyala}/{g.tools.length}
                      </span>
                    </div>

                    {!lipatGrup && (
                      <div className="agc-tools-isi">
                        {g.isi.map((nama) => (
                          <button
                            key={nama}
                            className={`agc-tools-row${aktif.has(nama) ? ' is-on' : ''}`}
                            data-testid={`agc-tools-${nama}`}
                            data-on={aktif.has(nama)}
                            onClick={() => balik(nama)}
                            role="switch"
                            aria-checked={aktif.has(nama)}
                          >
                            <span className="agc-tools-kotak" aria-hidden="true">
                              {aktif.has(nama) && <AiIkon name="check" size={9} />}
                            </span>
                            <span className="agc-tools-nama">{namaTampil(nama)}</span>
                            {deskripsi(nama) && deskripsi(nama) !== '—' && (
                              <span className="agc-tools-objek">{deskripsi(nama)}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
