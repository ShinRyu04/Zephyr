/*
 * "Add Model" — the TRAE-shaped dialog, and the ONLY place a provider is
 * configured.
 *
 * THE FLOW, in the order the reader actually needs it:
 *
 *   1. Pick a provider.   Two columns of tiles, each with its brand mark,
 *                         "Custom endpoint" first because a self-hosted
 *                         gateway is a first-class case here, not an
 *                         afterthought.
 *   2. Paste the key.     One field, always visible on this step.
 *   3. Press Refresh.     The provider is asked what it serves. The COUNT
 *                         appears, and every model it returns is listed and
 *                         ticked.
 *   4. Add Model.         The ticked models land in the Custom group.
 *
 * WHY REFRESH IS THE CENTRAL ACTION AND NOT A FOOTNOTE: the reader should never
 * have to type a model id from memory. Before this, adding a model meant knowing
 * the exact string the gateway expected; a typo produced a chat that failed with
 * an opaque 400 and no way to discover the right name. The provider already
 * knows its own catalogue — asking it is one request, and it removes the guess.
 *
 * WHY THE KEY IS SAVED BEFORE THE LIST IS FETCHED: `list_models` reads the key
 * from the Rust secret store, not from this form. Detecting first would use
 * whatever key was saved previously — or none — and report "no models" for a
 * provider the reader had just configured correctly. So Refresh saves, then
 * asks.
 *
 * WHY THE FOCUS EFFECT RUNS ONCE: `onTutup` is an inline arrow in the parent, so
 * it is a new function on every render. With it in the dependency array the
 * effect re-ran after every keystroke and each run pulled focus back to the
 * dialog box — the symptom was "the field cannot be typed in". The callback is
 * therefore held in a ref and the effect has an empty dependency list.
 */
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import AiIkon from '../ai/AiIkon';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { PROVIDERS, ProviderLogo, type ProviderInfo } from '../../lib/modelCatalog';
import { listModelIds, asZephyrError } from '../../lib/commands';

export interface BarisModel {
  id: string;
  label: string;
  provider: string;
  baseUrl?: string;
  ctx?: number;
  terdeteksi?: boolean;
  custom: boolean;
}

export function AddModelDialog({
  awal,
  onSimpan,
  onTutup,
}: {
  /** Pre-selected row when editing; `null` when adding. */
  awal: BarisModel | null;
  onSimpan: (rows: BarisModel[]) => void | Promise<void>;
  onTutup: () => void;
}) {
  const tr = useT();
  const models = useStore((s) => s.settings.models);
  const apply = useStore((s) => s.applySettings);
  const ui = useSettingsUi();

  /*
   * Editing starts on the FORM with the provider already chosen; creating starts
   * on the GRID. Jumping straight to the form when the provider is known is what
   * makes "Edit" feel like editing rather than re-entering what it already says.
   */
  const [provider, setProvider] = useState<ProviderInfo | null>(
    awal ? PROVIDERS.find((p) => p.id === awal.provider) ?? null : null,
  );
  const [id, setId] = useState(awal?.id ?? '');
  const [label, setLabel] = useState(awal?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(
    awal?.baseUrl ?? (awal ? models?.providers?.[awal.provider]?.baseUrl ?? '' : ''),
  );
  const [ctx, setCtx] = useState(awal?.ctx ? String(awal.ctx) : '');
  const [galat, setGalat] = useState<string | null>(null);

  /* The key is written straight to the Rust store; this form only ever holds
     what the reader just typed, never the stored secret. */
  const [key, setKey] = useState('');
  const [lihatKey, setLihatKey] = useState(false);
  const [sibuk, setSibuk] = useState<'deteksi' | 'simpan' | null>(null);
  /* Advanced Settings is a disclosure, collapsed by default — nothing in it is
     required to add a model. */
  const [bukaLanjut, setBukaLanjut] = useState(false);

  /* Result of the last Refresh. `null` = not asked yet (as opposed to [] which
     means "asked, and the provider returned nothing"). The distinction is what
     lets the form say "press Refresh" instead of "no models", which are very
     different messages to receive. */
  const [terdeteksi, setTerdeteksi] = useState<string[] | null>(null);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());

  const ref = useRef<HTMLDivElement | null>(null);
  const tutupRef = useRef(onTutup);
  tutupRef.current = onTutup;

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tutupRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    /* Empty on purpose — see the file header. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tersimpan = provider ? ui.keys.find((k) => k.provider === provider.id) : undefined;

  const pilih = (p: ProviderInfo) => {
    setProvider(p);
    setBaseUrl(models?.providers?.[p.id]?.baseUrl ?? p.baseUrl);
    setKey('');
    setTerdeteksi(null);
    setDipilih(new Set());
    setGalat(null);
  };

  const pilihKustom = () => {
    /*
     * A custom endpoint is not a provider in the catalogue — it has no default
     * URL and no key name — so it borrows the first entry's shape with the id
     * `custom`, which is the provider id the backend already understands.
     */
    setProvider({ ...PROVIDERS[0], id: 'custom', label: tr('Custom Model'), baseUrl: '' });
    setBaseUrl('');
    setKey('');
    setTerdeteksi(null);
    setDipilih(new Set());
    setGalat(null);
  };

  /*
   * Refresh: save what was typed, then ask the provider what it serves.
   *
   * The save is conditional on there BEING something to save, so pressing
   * Refresh twice does not write an empty key over a good one — which is the
   * bug that would make a configured provider suddenly report "no key".
   */
  const deteksi = async () => {
    if (!provider) return;
    setSibuk('deteksi');
    setGalat(null);
    setTerdeteksi(null);
    try {
      if (key.trim()) {
        await ui.saveKey(provider.id, key.trim());
        setKey('');
      }
      if (baseUrl.trim() && baseUrl.trim() !== (models?.providers?.[provider.id]?.baseUrl ?? '')) {
        await apply({
          models: {
            providers: {
              ...(models?.providers ?? {}),
              [provider.id]: {
                ...(models?.providers?.[provider.id] ?? {}),
                baseUrl: baseUrl.trim(),
              },
            },
          },
        });
      }
      const ids = await listModelIds(provider.id, baseUrl.trim() || undefined);
      if (ids.length === 0) {
        setTerdeteksi([]);
        setGalat(
          tr('The provider returned no models. Check the API key and the base URL.'),
        );
        return;
      }
      setTerdeteksi(ids);
      setDipilih(new Set(ids));
      /* The first returned id is a sensible default for the single-model field
         below, so a reader who wants only one does not have to scroll. */
      if (!id.trim()) setId(ids[0]);
    } catch (e) {
      setGalat(asZephyrError(e).message);
    } finally {
      setSibuk(null);
    }
  };

  const simpan = async () => {
    if (!provider) {
      setGalat(tr('Pick a provider first.'));
      return;
    }
    setSibuk('simpan');
    setGalat(null);
    try {
      const nomorCtx = ctx.trim() ? Number(ctx.replace(/[^0-9]/g, '')) : undefined;
      const ctxAngka = Number.isFinite(nomorCtx) && nomorCtx ? nomorCtx : undefined;

      /*
       * Two ways to finish, and they are both legitimate:
       *
       *  - Ticked rows from Refresh -> one Custom row per model, which is the
       *    whole point of detecting them.
       *  - A typed Model ID -> one row, for a gateway that does not answer
       *    /models or for a model the reader knows exists but was not listed.
       */
      if (terdeteksi && terdeteksi.length > 0 && dipilih.size > 0) {
        const rows: BarisModel[] = [...dipilih].map((mid) => ({
          id: mid,
          label: mid,
          provider: provider.id,
          baseUrl: baseUrl.trim() || undefined,
          terdeteksi: true,
          custom: true,
        }));
        await onSimpan(rows);
        return;
      }

      const namaModel = id.trim();
      if (!namaModel) {
        setGalat(tr('A model id is required.'));
        return;
      }
      await onSimpan([
        {
          id: namaModel,
          label: label.trim() || namaModel,
          provider: provider.id,
          baseUrl: baseUrl.trim() || undefined,
          ctx: ctxAngka,
          custom: true,
        },
      ]);
    } catch (e) {
      setGalat(asZephyrError(e).message);
    } finally {
      setSibuk(null);
    }
  };

  const alihkanPilihan = (mid: string) => {
    setDipilih((s) => {
      const n = new Set(s);
      if (n.has(mid)) n.delete(mid);
      else n.add(mid);
      return n;
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" data-testid="aim-add-modal">
      <div
        className="modal aim-add"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={awal ? tr('Edit Model') : tr('Add Model')}
        tabIndex={-1}
      >
        <div className="aim-add-judul">
          <h2 className="modal-title" style={{ marginBottom: 2 }}>
            {awal ? tr('Edit Model') : tr('Add Model')}
          </h2>
          {!provider && (
            <p className="aim-sub">{tr('Pick a provider. The endpoint is filled in for you.')}</p>
          )}
          {/*
            * The close mark is on the GRID step only.
            *
            * The form step already has Cancel beside Add Model at the bottom,
            * and two ways out of one small dialog made the footer look like the
            * secondary one. The grid step has no footer button on the reference
            * either — the X is how it is left.
            */}
          {!provider && (
            <button
              type="button"
              className="aim-add-x"
              data-testid="aim-add-x"
              title={tr('Close')}
              aria-label={tr('Close')}
              onClick={onTutup}
            >
              <AiIkon name="close" size={13} />
            </button>
          )}
        </div>

        {!provider ? (
          <>
            <div className="aim-preset" data-testid="aim-preset-grid">
              {/*
                * Custom Model FIRST, and FULL WIDTH.
                *
                * Both details are copied from the reference rather than chosen:
                * its grid is a two-column list of provider names with a chevron
                * each, and "Custom Model" sits above that grid as one tile
                * spanning both columns. It leads because a self-hosted gateway
                * or Ollama is a first-class case here — and because it is the
                * only tile that opens a form instead of a prefilled endpoint,
                * so it is the one that needs to be found without scanning.
                */}
              <button
                type="button"
                className="aim-preset-btn is-kustom is-lebar"
                data-testid="aim-preset-custom"
                onClick={pilihKustom}
              >
                <span className="aim-preset-logo" aria-hidden="true">
                  <AiIkon name="package" size={16} />
                </span>
                <span className="aim-preset-teks">
                  <span className="aim-preset-nama">{tr('Custom Model')}</span>
                </span>
                <AiIkon name="chev-right" size={13} />
              </button>
              {PROVIDERS
                /*
                 * `custom` is SKIPPED here because the full-width tile above IS
                 * the custom entry. Rendering it again put two identical "Custom
                 * Model" rows in the grid — the reader counted eleven tiles for
                 * ten providers and saw the same name twice.
                 */
                .filter((p) => p.id !== 'custom')
                .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="aim-preset-btn"
                  data-testid={`aim-preset-${p.id}`}
                  onClick={() => pilih(p)}
                >
                  <span className="aim-preset-logo" aria-hidden="true">
                    <ProviderLogo id={p.id} size={20} />
                  </span>
                  <span className="aim-preset-teks">
                    {/*
                      * NAME ONLY, and the name the reference uses.
                      *
                      * The tile said "Google Gemini" where the reference says
                      * just "Google" — the reader compares the two lists tile by
                      * tile, and one longer name shifts nothing else but reads
                      * as a mismatch. The modal keeps the full label on the
                      * form step.
                      */}
                    <span className="aim-preset-nama">
                      {p.id === 'gemini' ? tr('Google') : p.label}
                    </span>
                  </span>
                  <AiIkon name="chev-right" size={13} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="aim-add-head">
              <span className="aim-logo" aria-hidden="true">
                <ProviderLogo id={provider.id} size={18} />
              </span>
              <span className="aim-add-prov">{provider.label}</span>
              <span className={`aim-kf-status${tersimpan?.hasKey ? ' is-ada' : ''}`}>
                {tersimpan?.hasKey
                  ? tr('key saved') + (tersimpan.preview ? ': ' + tersimpan.preview : '')
                  : tr('no key yet')}
              </span>
              <button
                type="button"
                className="agx-tautan"
                data-testid="aim-add-ganti-prov"
                onClick={() => setProvider(null)}
              >
                {tr('Change')}
              </button>
            </div>

            {/* ── API Format ─────────────────────────────────────────────── */}
            {/*
              * The reference leads with the wire format, because "which shape of
              * request does this endpoint speak" decides how every other field
              * is read. Zephyr only speaks the OpenAI-compatible shape today, so
              * the select has one real option and one that is honestly disabled
              * — a select that silently offers formats the backend cannot send
              * would fail at the first request instead of here.
              */}
            <label className="aim-field">
              <span className="aim-field-label">
                {tr('API Format')} <b>*</b>
              </span>
              <select className="aim-pil aim-kf-pil" data-testid="aim-add-format" value="openai">
                <option value="openai">{tr('OpenAI Chat Completions')}</option>
                <option value="responses" disabled>
                  {tr('OpenAI Responses API')} — {tr('not supported yet')}
                </option>
                <option value="anthropic" disabled>
                  {tr('Anthropic Messages')} — {tr('not supported yet')}
                </option>
              </select>
            </label>

            {/* ── Custom Request URL ─────────────────────────────────────── */}
            <label className="aim-field">
              <span className="aim-field-label">
                {tr('Custom Request URL')} <b>*</b>
                <em>{tr('Full URL')}</em>
              </span>
              <input
                data-testid="aim-add-url"
                value={baseUrl}
                placeholder="https://api.openai.com/v1"
                spellCheck={false}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
              <span className="aim-field-hint">
                {tr(
                  'Enter the OpenAI-compatible API endpoint. Do not end with a slash. /chat/completions will be appended to the URL you provide.',
                )}
              </span>
            </label>

            {/* ── API key ───────────────────────────────────────────────── */}
            <label className="aim-field">
              <span className="aim-field-label">
                {tr('API key')} <b>*</b>
              </span>
              <span className="aim-kf-input">
                <input
                  data-testid="aim-add-key"
                  type={lihatKey ? 'text' : 'password'}
                  value={key}
                  spellCheck={false}
                  placeholder={
                    tersimpan?.hasKey
                      ? tr('(saved — type to replace)')
                      : (provider.envKey ?? tr('paste your key'))
                  }
                  onChange={(e) => setKey(e.target.value)}
                />
                <button
                  type="button"
                  className="aim-aksi-btn"
                  onClick={() => setLihatKey((v) => !v)}
                >
                  {lihatKey ? tr('Hide') : tr('Show')}
                </button>
                {tersimpan?.hasKey && (
                  <button
                    type="button"
                    className="aim-aksi-btn is-hapus"
                    data-testid="aim-add-hapus-key"
                    onClick={() => {
                      void ui.saveKey(provider.id, '');
                      setTerdeteksi(null);
                      setDipilih(new Set());
                    }}
                  >
                    {tr('Delete')}
                  </button>
                )}
              </span>
            </label>

            {/* ── Refresh: the centre of this dialog ────────────────────── */}
            <div className="aim-deteksi-bar">
              <button
                type="button"
                className="aim-btn-utama is-utama"
                data-testid="aim-add-refresh"
                disabled={sibuk !== null}
                onClick={() => void deteksi()}
              >
                <AiIkon name="refresh" size={12} />
                {sibuk === 'deteksi' ? tr('Detecting…') : tr('Refresh')}
              </button>
              {terdeteksi && terdeteksi.length > 0 && (
                <span className="aim-deteksi-info" data-testid="aim-add-jumlah" role="status">
                  <AiIkon name="check" size={11} />
                  {terdeteksi.length} {tr('model(s) detected')}
                </span>
              )}
              {terdeteksi && terdeteksi.length === 0 && !galat && (
                <span className="aim-deteksi-info is-kosong" role="status">
                  {tr('no models returned')}
                </span>
              )}
            </div>

            {/* ── The detected list, all ticked ─────────────────────────── */}
            {terdeteksi && terdeteksi.length > 0 && (
              <div className="aim-deteksi-list" data-testid="aim-add-hasil">
                <div className="aim-deteksi-kepala">
                  <span>{tr('Tick the models to add')}</span>
                  <button
                    type="button"
                    className="agx-tautan"
                    onClick={() =>
                      setDipilih(
                        dipilih.size === terdeteksi.length ? new Set() : new Set(terdeteksi),
                      )
                    }
                  >
                    {dipilih.size === terdeteksi.length ? tr('None') : tr('All')}
                  </button>
                </div>
                {terdeteksi.map((mid) => (
                  <label className="aim-deteksi-item" key={mid}>
                    <input
                      type="checkbox"
                      checked={dipilih.has(mid)}
                      onChange={() => alihkanPilihan(mid)}
                      data-testid={`aim-add-pilih-${mid}`}
                    />
                    <span className="aim-deteksi-id">{mid}</span>
                  </label>
                ))}
              </div>
            )}

            {/*
              * Model ID and Display name are the required identity of a row, so
              * they sit above Advanced Settings and are always visible — even
              * after Refresh, where the detected list supplies the id but the
              * reader may still want a friendlier display name.
              */}
            <label className="aim-field">
              <span className="aim-field-label">
                {tr('Model ID')} <b>*</b>
              </span>
              <input
                data-testid="aim-add-id"
                value={id}
                placeholder={tr('Input Model ID')}
                spellCheck={false}
                onChange={(e) => setId(e.target.value)}
              />
            </label>

            <label className="aim-field">
              <span className="aim-field-label">
                {tr('Display Name')}
                <em>{tr('Defaults to Model ID if not set')}</em>
              </span>
              <input
                data-testid="aim-add-label"
                value={label}
                placeholder={tr('Input Display Name')}
                maxLength={64}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>

            {/*
              * Advanced Settings — COLLAPSED by default, and OPTIONAL.
              *
              * The reference hides these behind a disclosure for the same reason:
              * they are refinements, not requirements, and showing them beside
              * the required fields makes the form look twice as long as the work
              * it asks for. Nothing here is needed to add a model.
              */}
            <button
              type="button"
              className="aim-adv-toggle"
              data-testid="aim-add-advanced"
              aria-expanded={bukaLanjut}
              onClick={() => setBukaLanjut((v) => !v)}
            >
              <AiIkon name={bukaLanjut ? 'chev-down' : 'chev-right'} size={11} />
              {tr('Advanced Settings')}
            </button>
            {bukaLanjut && (
              <div className="aim-adv" data-testid="aim-add-advanced-isi">
                <label className="aim-field">
                  <span className="aim-field-label">
                    {tr('Context size')}
                    <em>{tr('tokens, optional')}</em>
                  </span>
                  <input
                    data-testid="aim-add-ctx"
                    value={ctx}
                    placeholder="128000"
                    onChange={(e) => setCtx(e.target.value)}
                  />
                </label>
              </div>
            )}

            {galat && (
              <p className="aim-galat" data-testid="aim-add-galat">
                <AiIkon name="warn" size={11} /> {galat}
              </p>
            )}

            <p className="aim-muted">
              <AiIkon name="shield" size={11} />{' '}
              {tr('Stored by Rust in %APPDATA%\\zephyr\\secrets.json, encrypted. This window only sees a mask.')}
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                data-testid="aim-add-simpan"
                disabled={sibuk !== null}
                onClick={() => void simpan()}
              >
                {sibuk === 'simpan' ? tr('Saving…') : tr('Add Model')}
              </button>
              <button type="button" className="btn" data-testid="aim-add-batal" onClick={onTutup}>
                {tr('Cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
