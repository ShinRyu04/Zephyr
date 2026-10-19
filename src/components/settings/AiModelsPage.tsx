/*
 * AI Models, in the shape of the reference product.
 *
 * THE SHAPE (measured from the reference screenshots, not guessed):
 *
 *   Models                                              + Add Model
 *   Model Management
 *   Add or manage available models. Built-in models use the
 *   default stable version. Configure an API to access other models.
 *
 *   ▸ Built-in                                        12
 *   ▸ Custom                                           3
 *
 * The content column is 800px wide and CENTRED. That number is not a preference:
 * measuring the reference gave a 800px column inside a 912px pane, with 53px on
 * the left and 60px on the right — i.e. centred, and the asymmetry is the
 * scrollbar. A left-aligned cap of the same width is what produced the "huge
 * empty strip on the right" complaint: the leftover width all piled up on one
 * side, so a deliberate measure read as a layout bug.
 *
 * WHY THE COLUMN CAPS AT ALL: past ~800px a row of "name — provider — actions"
 * stretches until the three cells no longer relate to each other, and the eye
 * has to travel the full window width to read one line. The cap is released on
 * narrow windows via `min(800px, 100%)`, so nothing is ever squeezed.
 *
 * WHY GROUPS COLLAPSE: the reader arrives either to look at what they have
 * (built-in) or at what they added (custom), rarely both. Counts on the headers
 * mean the answer to "did my key work" is visible without expanding anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { PROVIDERS, ModelLogo, type ProviderModel } from '../../lib/modelCatalog';
import { HYDRA_MODEL_ID } from '../../lib/hydraModel';
import { AddModelDialog, type BarisModel } from './AiModelsDialog';

interface Baris {
  id: string;
  label: string;
  provider: string;
  ctx?: number;
  tools: boolean;
  vision: boolean;
  note?: string;
  hydra?: boolean;
  /** Came from the provider's own /models answer, not the shipped catalogue. */
  terdeteksi?: boolean;
  /** Present only for rows the reader added, so they can be removed again. */
  custom?: boolean;
}

const POLA_VISION = /multimodal|vision|gambar|image|lihat/i;
const POLA_TOOLS = /agent|agentik|tool|coding|code|penalaran|reason/i;

/**
 * Window size for the table.
 *
 * NOT `fmtCtx`: that one appends "ctx" (redundant under a column headed
 * "Context Size") and prints `1048576` as `1.048576M`, which reads as a
 * precision claim nobody made. One decimal is the most a catalogue figure can
 * honestly support.
 */
function ukuranKonteks(ctx?: number): string {
  if (!ctx) return '—';
  if (ctx >= 1_000_000) {
    const jt = ctx / 1_000_000;
    return `${Number.isInteger(jt) ? jt : jt.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}M`;
  }
  return `${Math.round(ctx / 1000)}K`;
}

function barisDari(p: string, m: ProviderModel): Baris {
  const note = m.note ?? '';
  return {
    id: m.id,
    label: m.label || m.id,
    provider: p,
    ctx: m.ctx,
    tools: POLA_TOOLS.test(note),
    vision: POLA_VISION.test(note),
    note: note || undefined,
  };
}

/* ── One collapsible group ───────────────────────────────────────────────── */
function Grup({
  label,
  jumlah,
  buka,
  onToggle,
  testid,
  children,
}: {
  label: string;
  jumlah: number;
  buka: boolean;
  onToggle: () => void;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        className={`aim-grup-head${buka ? ' is-buka' : ''}`}
        data-testid={testid}
        aria-expanded={buka}
        onClick={onToggle}
      >
        <AiIkon name={buka ? 'chev-down' : 'chev-right'} size={11} />
        <span className="aim-grup-nama">{label}</span>
        <span className="aim-grup-jml">{jumlah}</span>
      </button>
      {buka && <div className="aim-grup-isi">{children}</div>}
    </>
  );
}

export default function AiModelsPage() {
  const tr = useT();
  const models = useStore((s) => s.settings.models);
  const apply = useStore((s) => s.applySettings);
  const ui = useSettingsUi();

  const [cari, setCari] = useState('');
  const [bukaBuiltin, setBukaBuiltin] = useState(true);
  const [bukaCustom, setBukaCustom] = useState(true);
  const [dialog, setDialog] = useState<{ awal: BarisModel | null } | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  /*
   * Load the key masks ONCE.
   *
   * The dependency used to be `[ui]`, and `ui` is the WHOLE store object — its
   * identity changes on every store write, and `loadKeys()` itself writes to the
   * store. So the effect re-ran, loaded, wrote, re-ran: an endless loop that the
   * reader saw as the page blinking. A ref guard makes it run exactly once, and
   * the action is read off the store at call time rather than captured.
   */
  const sudahMuat = useRef(false);
  useEffect(() => {
    if (sudahMuat.current) return;
    sudahMuat.current = true;
    void useSettingsUi.getState().loadKeys();
  }, []);

  const kustom = models?.custom ?? [];

  /* ── Built-in: everything the catalogue ships ─────────────────────────── */
  const builtin = useMemo(() => {
    const daftar: Baris[] = PROVIDERS.flatMap((p) =>
      (p.models ?? [])
        /* Placeholder rows ("type a name") are prompts, not models. */
        .filter((m) => m.id && m.id !== 'custom-model' && m.id !== 'local-default')
        .map((m) => barisDari(p.id, m)),
    );
    /*
     * HydraFusion is a model in the picker, so it is a row here too — with the
     * capabilities it actually has. It routes to models that carry tools and it
     * can pass images to a vision model, but it is NOT itself a model with a
     * context window, so the ctx cell stays blank instead of borrowing one.
     */
    daftar.unshift({
      id: HYDRA_MODEL_ID,
      label: 'HydraFusion',
      provider: 'hydra',
      tools: true,
      vision: true,
      note: tr('Research preview'),
      hydra: true,
    });
    return daftar;
  }, [tr]);

  /* ── Custom: what the reader added or detected ────────────────────────── */
  const custom: Baris[] = useMemo(
    () =>
      kustom.map((c) => ({
        id: c.id,
        label: c.label || c.id,
        provider: c.provider,
        ctx: c.ctx,
        tools: false,
        vision: false,
        terdeteksi: c.terdeteksi,
        custom: true,
      })),
    [kustom],
  );

  const cocok = useCallback(
    (b: Baris) => {
      const q = cari.trim().toLowerCase();
      if (!q) return true;
      return (
        b.label.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q) ||
        b.provider.toLowerCase().includes(q)
      );
    },
    [cari],
  );

  const builtinTampil = useMemo(() => builtin.filter(cocok), [builtin, cocok]);
  const customTampil = useMemo(() => custom.filter(cocok), [custom, cocok]);

  /*
   * Saving the dialog's result.
   *
   * Add and Edit share one path: a row with the same `provider/id` is REPLACED
   * rather than duplicated, so pressing Add twice on the same model cannot
   * produce two identical lines that then both appear in the picker.
   */
  const simpanBaris = async (rows: BarisModel[]) => {
    const sekarang = useStore.getState().settings.models;
    const lama = sekarang?.custom ?? [];
    const peta = new Map(lama.map((c) => [c.provider + '/' + c.id, c]));
    for (const r of rows) {
      peta.set(r.provider + '/' + r.id, {
        id: r.id,
        label: r.label || r.id,
        provider: r.provider,
        baseUrl: r.baseUrl,
        ctx: r.ctx,
        terdeteksi: r.terdeteksi,
      });
    }
    await apply({ models: { custom: [...peta.values()] } });
    setDialog(null);
    setBukaCustom(true);
    setPesan(
      rows.length > 1
        ? tr('Added ') + rows.length + tr(' model(s).')
        : tr('Model added.'),
    );
  };

  const hapusBaris = async (b: Baris) => {
    const sekarang = useStore.getState().settings.models;
    const lama = sekarang?.custom ?? [];
    await apply({
      models: {
        custom: lama.filter((c) => !(c.provider === b.provider && c.id === b.id)),
      },
    });
    setPesan(tr('Model removed.'));
  };

  const aktif = models?.activeProvider ?? '';

  /* ── One row ──────────────────────────────────────────────────────────── */
  const barisJSX = (b: Baris) => {
    const siap = aktif === b.provider;
    return (
      <div
        key={`${b.provider}/${b.id}`}
        className={`aim-baris${siap ? ' is-aktif' : ''}`}
        data-testid="aim-table-row"
        data-model={b.id}
        data-provider={b.provider}
      >
        <span className="aim-logo" aria-hidden="true">
          {/*
            * THE MODEL's mark, not the provider's.
            *
            * This row used to draw `ProviderLogo id={b.provider}`, so every model
            * on OpenRouter showed the OpenRouter logo and every model on
            * SiliconFlow showed the Qwen logo — the row said "DeepSeek" next to a
            * picture that was not DeepSeek's. That is the mismatch the reader
            * kept pointing at.
            *
            * `ModelLogo` derives the family from the model ID (see
            * `modelFamily`), so a model detected from any gateway gets its own
            * brand without per-model configuration.
            */}
          <ModelLogo id={b.id} size={16} />
        </span>

        <span className="aim-baris-teks">
          <span className="aim-nama">
            {b.label}
            {b.terdeteksi && <span className="aim-tag-deteksi">{tr('detected')}</span>}
            {siap && <span className="aim-aktif-chip">{tr('active')}</span>}
          </span>
          <span className="aim-sub-teks">
            {b.hydra
              ? tr('the app picks the model and the workflow per task')
              : b.provider}
            {b.note && !b.hydra ? ' · ' + b.note : ''}
          </span>
        </span>

        <span className="aim-ctx" title={tr('Context size')}>
          {ukuranKonteks(b.ctx)}
        </span>

        <span className="aim-baris-aksi">
          {b.custom ? (
            <button
              type="button"
              className="aim-aksi-btn is-hapus"
              data-testid={`aim-hapus-${b.provider}-${b.id}`}
              onClick={() => void hapusBaris(b)}
            >
              <AiIkon name="trash" size={11} />
              {tr('Delete')}
            </button>
          ) : (
            <button
              type="button"
              className="aim-aksi-btn"
              data-testid={`aim-pakai-${b.provider}-${b.id}`}
              disabled={siap}
              onClick={() => {
                void apply({ models: { activeProvider: b.provider } });
                setPesan(tr('Active model set to ') + b.label + '.');
              }}
            >
              {siap ? tr('In use') : tr('Use')}
            </button>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="panel-page" data-testid="aim-page">
      <div className="panel-page-body aim-body" data-testid="aim-page-content">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="aim-head">
          <div>
            <h2 className="panel-page-title" style={{ marginBottom: 2 }}>
              {tr('Models')}
            </h2>
            <p className="aim-sub">
              {tr(
                'Add or manage available models. Built-in models use the default stable version. Configure an API to access other models.',
              )}
            </p>
          </div>
          <button
            type="button"
            className="aim-btn-utama is-utama"
            data-testid="aim-tambah"
            onClick={() => setDialog({ awal: null })}
          >
            <AiIkon name="plus" size={12} /> {tr('Add Model')}
          </button>
        </header>

        {pesan && (
          <p className="aim-pesan" data-testid="aim-pesan" role="status">
            {pesan}
          </p>
        )}

        {/* Search sits under the header, full width — the reference's place. */}
        <input
          className="aim-cari-atas"
          data-testid="aim-cari"
          placeholder={tr('Search models…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
        />

        {/* ── Built-in ───────────────────────────────────────────────── */}
        <Grup
          label={tr('Built-in')}
          jumlah={builtinTampil.length}
          buka={bukaBuiltin}
          onToggle={() => setBukaBuiltin((v) => !v)}
          testid="aim-grup-builtin"
        >
          {builtinTampil.length === 0 ? (
            <p className="aim-kosong-kecil">{tr('No built-in model matches that search.')}</p>
          ) : (
            builtinTampil.map(barisJSX)
          )}
        </Grup>

        {/* ── Custom ─────────────────────────────────────────────────── */}
        <Grup
          label={tr('Custom')}
          jumlah={customTampil.length}
          buka={bukaCustom}
          onToggle={() => setBukaCustom((v) => !v)}
          testid="aim-grup-custom"
        >
          {customTampil.length === 0 ? (
            <p className="aim-kosong-kecil" data-testid="aim-custom-kosong">
              {tr('No custom models yet. Press Add Model, paste a key, then Refresh.')}
            </p>
          ) : (
            customTampil.map(barisJSX)
          )}
        </Grup>

        {/* ── Active provider, kept reachable without leaving the page ── */}
        <div className="aim-aktif">
          <span className="aim-aktif-label">{tr('Active provider')}</span>
          <select
            className="aim-pil"
            data-testid="aim-aktif-pil"
            value={aktif}
            onChange={(e) => void apply({ models: { activeProvider: e.target.value } })}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {ui.keys.some((k) => k.provider === p.id && k.hasKey) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dialog && (
        <AddModelDialog
          awal={dialog.awal}
          onSimpan={simpanBaris}
          onTutup={() => setDialog(null)}
        />
      )}
    </div>
  );
}
