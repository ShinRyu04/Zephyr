import { useEffect, useMemo, useRef, useState } from 'react';
import { useT, tf } from '../../lib/i18n';
import { useBanding, type EntriBanding, type SisiBanding } from '../../lib/compareStore';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { findModel, ModelLogo, baseUrlEfektif, PROVIDER_BY_ID, ALL_MODELS } from '../../lib/modelCatalog';
import AiIkon from './AiIkon';
import { useDragPopup } from '../../lib/useDragPopup';

/*
 * Side-by-side model comparison.
 *
 * One prompt, two answers, one screen — so picking a model for a task is a
 * matter of reading instead of guessing. The store behind it
 * (`compareStore`) sends the SAME payload the chat sends, twice, and collects
 * each answer through its own chunk route; nothing here talks to a provider
 * directly.
 *
 * It floats rather than docks: comparing means reading both columns while the
 * conversation that prompted the question is still visible behind it.
 */

function durasi(ms: number | null): string {
  if (ms === null) return '…';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** One column: which model answered, how long it took, and what it said. */
function Kolom({
  sisi,
  nama,
  aktif,
  onPilih,
  terpilih,
}: {
  sisi: SisiBanding;
  nama: 'kiri' | 'kanan';
  /** Which provider/model this column is set to run with. */
  aktif: { provider: string; model: string };
  onPilih: (sisi: 'kiri' | 'kanan', provider: string, model: string) => void;
  terpilih: boolean;
}) {
  const tr = useT();
  const [menu, setMenu] = useState(false);
  const keys = useAi((s) => s.keys);
  const overrides = useStore((s) => s.settings.models.providers);

  /*
   * Only models whose provider can actually be called: a list that offers
   * models with no key produces a column that fails on every run.
   */
  const pilihan = useMemo(() => {
    const siap = new Set(
      keys.filter((k) => k.hasKey && baseUrlEfektif(k.provider, overrides).length > 0).map((k) => k.provider),
    );
    const dariKatalog = ALL_MODELS.filter((m) => siap.has(m.provider)).map((m) => ({
      provider: m.provider,
      model: m.id,
      label: m.label,
    }));
    /*
     * A gateway serves model names the catalogue has never heard of; without
     * these rows the list for such a provider would be empty even though the
     * reader is using it every day.
     */
    const dikenal = new Set(dariKatalog.map((x) => `${x.provider}\u0000${x.model}`));
    for (const p of Object.keys(overrides)) {
      if (!siap.has(p) || PROVIDER_BY_ID.has(p)) continue;
      const m = overrides[p]?.model;
      if (!m || dikenal.has(`${p}\u0000${m}`)) continue;
      dikenal.add(`${p}\u0000${m}`);
      dariKatalog.push({ provider: p, model: m, label: m });
    }
    return dariKatalog;
  }, [keys, overrides]);

  const def = findModel(sisi.model, sisi.provider || undefined);

  return (
    <div className={`cmp-col${terpilih ? ' is-on' : ''}`} data-testid={`cmp-kolom-${nama}`}>
      <button
        className="cmp-colhead"
        data-testid={`cmp-pilih-${nama}`}
        onClick={() => setMenu((v) => !v)}
        aria-expanded={menu}
        title={tr('Compare: choose the model for this column')}
      >
        <ModelLogo id={aktif.model} size={14} />
        <span className="cmp-colname">{def.label ?? aktif.model}</span>
        <span className="cmp-colprov">{def.providerLabel ?? aktif.provider}</span>
        <AiIkon name="chev-down" size={11} />
      </button>

      {menu && (
        <div className="cmp-menu" data-testid={`cmp-menu-${nama}`} role="listbox">
          {pilihan.length === 0 ? (
            <p className="cmp-kosong">{tr('Add an API key in AI Models first.')}</p>
          ) : (
            pilihan.map((m) => (
              <button
                key={`${m.provider}/${m.model}`}
                className={`cmp-mrow${m.provider === aktif.provider && m.model === aktif.model ? ' is-on' : ''}`}
                data-testid={`cmp-row-${nama}-${m.model}`}
                role="option"
                aria-selected={m.provider === aktif.provider && m.model === aktif.model}
                onClick={() => {
                  onPilih(nama, m.provider, m.model);
                  setMenu(false);
                }}
              >
                <ModelLogo id={m.model} size={13} />
                <span className="cmp-mname">{m.label}</span>
                <span className="cmp-mprov">{PROVIDER_BY_ID.get(m.provider)?.label ?? m.provider}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="cmp-colstat" data-testid={`cmp-stat-${nama}`} data-state={sisi.err ? 'err' : sisi.selesai ? 'done' : 'jalan'}>
        {sisi.err ? sisi.err : sisi.selesai ? `${durasi(sisi.ms)} · ${sisi.teks.length}B` : tr('Answering…')}
      </div>

      <pre className="cmp-body" data-testid={`cmp-teks-${nama}`}>
        {sisi.teks || (sisi.selesai && !sisi.err ? tr('(empty answer)') : '')}
      </pre>
    </div>
  );
}

/** A finished comparison, collapsed to a line until opened. */
function Baris({ e, buka, onToggle, onHapus }: { e: EntriBanding; buka: boolean; onToggle: () => void; onHapus: () => void }) {
  const tr = useT();
  return (
    <div className="cmp-entry" data-testid={`cmp-entri-${e.id}`}>
      <button className="cmp-ehead" onClick={onToggle} aria-expanded={buka}>
        <span className="cmp-eprompt">{e.prompt.replace(/\s+/g, ' ').slice(0, 80)}</span>
        <span className="cmp-emodels">
          {e.kiri.label} <AiIkon name="arrow-left" size={10} /> {e.kanan.label}
        </span>
        <AiIkon name={buka ? 'chev-up' : 'chev-down'} size={11} />
      </button>
      {buka && (
        <div className="cmp-ebody">
          <div className="cmp-eside">
            <div className="cmp-elabel">{e.kiri.label}</div>
            <pre className="cmp-body">{e.kiri.err ?? e.kiri.teks}</pre>
          </div>
          <div className="cmp-eside">
            <div className="cmp-elabel">{e.kanan.label}</div>
            <pre className="cmp-body">{e.kanan.err ?? e.kanan.teks}</pre>
          </div>
          <button className="cmp-del" data-testid={`cmp-hapus-${e.id}`} onClick={onHapus} title={tr('Delete')}>
            <AiIkon name="trash" size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ComparePanel() {
  const { popupRef: dragRef, onPointerDown: dragStart } = useDragPopup();
  const tr = useT();
  const buka = useBanding((s) => s.buka);
  const setBuka = useBanding((s) => s.setBuka);
  const prompt = useBanding((s) => s.prompt);
  const setPrompt = useBanding((s) => s.setPrompt);
  const berjalan = useBanding((s) => s.berjalan);
  const entri = useBanding((s) => s.entri);
  const jalankan = useBanding((s) => s.jalankan);
  const hentikan = useBanding((s) => s.hentikan);
  const hapus = useBanding((s) => s.hapus);
  const setModel = useBanding((s) => s.setModel);

  const modelKiri = useBanding((s) => s.modelKiri);
  const modelKanan = useBanding((s) => s.modelKanan);
  const providerKiri = useBanding((s) => s.providerKiri);
  const providerKanan = useBanding((s) => s.providerKanan);

  const aiModel = useAi((s) => s.model);
  const aiProvider = useAi((s) => s.provider);

  const [bukaEntri, setBukaEntri] = useState<string | null>(null);
  const kotakRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!buka) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        setBuka(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [buka, setBuka]);

  const kiri = { provider: providerKiri || aiProvider, model: modelKiri || aiModel };
  const kanan = {
    provider: providerKanan || aiProvider,
    model: modelKanan || modelKiri || aiModel,
  };
  const terakhir = entri[0] ?? null;

  if (!buka) return null;

  return (
    <>
      <div className="cmp-scrim" data-testid="cmp-scrim" onClick={() => setBuka(false)} />

      <div
        ref={dragRef}
        style={{ transform: 'translate(var(--drag-x, 0), var(--drag-y, 0))' }}
        className="cmp-panel"
        data-testid="cmp-panel"
        role="dialog"
        aria-label={tr('Compare models')}
      >
        <div className="cmp-top" data-drag-handle onPointerDown={dragStart} style={{ cursor: 'grab' }}>
          <AiIkon name="diff" size={14} />
          <span className="cmp-judul">{tr('Compare models')}</span>
          <span className="cmp-hint">{tr('One prompt, two models, side by side.')}</span>
          <button className="cmp-x" data-testid="cmp-tutup" title={tr('Close')} onClick={() => setBuka(false)}>
            <AiIkon name="x" size={13} />
          </button>
        </div>

        <div className="cmp-compose">
          <textarea
            ref={kotakRef}
            className="cmp-input"
            data-testid="cmp-prompt"
            value={prompt}
            placeholder={tr('Ask both models the same thing…')}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void jalankan();
              }
            }}
          />
          {berjalan ? (
            <button className="cmp-run is-stop" data-testid="cmp-stop" onClick={() => void hentikan()}>
              <AiIkon name="stop" size={12} /> {tr('Stop')}
            </button>
          ) : (
            <button
              className="cmp-run"
              data-testid="cmp-run"
              disabled={!prompt.trim()}
              onClick={() => void jalankan()}
            >
              <AiIkon name="send" size={12} /> {tr('Run both')}
            </button>
          )}
        </div>

        {terakhir && (
          <div className="cmp-cols" data-testid="cmp-cols">
            <Kolom
              sisi={terakhir.kiri}
              nama="kiri"
              aktif={kiri}
              onPilih={(s, p, m) => setModel(s, m, p)}
              terpilih
            />
            <Kolom
              sisi={terakhir.kanan}
              nama="kanan"
              aktif={kanan}
              onPilih={(s, p, m) => setModel(s, m, p)}
              terpilih
            />
          </div>
        )}

        <div className="cmp-list" data-testid="cmp-list" data-count={entri.length}>
          {entri.length === 0 ? (
            <p className="cmp-kosong">{tr('Run a prompt to compare how two models answer it.')}</p>
          ) : (
            entri.map((e) => (
              <Baris
                key={e.id}
                e={e}
                buka={bukaEntri === e.id}
                onToggle={() => setBukaEntri(bukaEntri === e.id ? null : e.id)}
                onHapus={() => hapus(e.id)}
              />
            ))
          )}
        </div>

        <div className="cmp-foot">{tf('{n} saved', { n: entri.length })}</div>
      </div>
    </>
  );
}
