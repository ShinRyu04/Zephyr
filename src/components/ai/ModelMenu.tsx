import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import {
  PROVIDERS,
  baseUrlEfektif,
  ModelLogo,
  ProviderLogo,
} from '../../lib/modelCatalog';
import { useAi } from '../../lib/aiStore';
import AiIkon from './AiIkon';

/*
 * The model list, in one place.
 *
 * Three pickers grew separately — the chat header, the spawn form's per-row
 * button, and the model badge on a running subagent — and each ended up with its
 * own markup and its own gaps: one had provider groups and model logos, one was
 * a flat list of names, one showed a single placeholder row. They all answer the
 * same question, so they now share this menu.
 *
 * Shape, taken from the chat picker because it was the only complete one:
 * a provider heading with its logo and count, a row per model with the model's
 * own mark, the context size as a badge, and a check on the current choice.
 *
 * Positioning is `fixed` with a measured rect. Every caller sits inside a
 * scroll container, and an absolutely positioned menu is clipped by the nearest
 * ancestor with `overflow` — which is what buried two of the three.
 */

export interface ModelChoice {
  /** Provider id. Empty string means "follow the chat model". */
  provider: string;
  /** Model id. Empty string means "follow the chat model". */
  model: string;
}

interface Props {
  /** Where the menu is anchored, in viewport coordinates. */
  rect: { left: number; top: number; bottom: number } | null;
  /** Currently chosen provider/model; empty strings mean "follow chat". */
  nilai: ModelChoice;
  /** Called with the new choice. */
  pilih: (v: ModelChoice) => void;
  /** Close the menu (click-away, Escape, or after a pick). */
  tutup: () => void;
  /** Test id prefix, so each caller keeps its own hooks in the harness. */
  pfx: string;
  /**
   * Label for the "follow the chat model" row.
   *
   * The chat header has no such row (it IS the chat model), so callers that do
   * not want it pass `null`.
   */
  ikutChat?: string | null;
  /** The model the chat is currently on, shown as the hint on that row. */
  chatLabel?: string;
}

export default function ModelMenu({ rect, nilai, pilih, tutup, pfx, ikutChat, chatLabel }: Props) {
  const tr = useT();
  const keys = useAi((s) => s.keys);
  const baseUrlOv = useStore((s) => s.settings.models.providers);
  const remoteUi = useSettingsUi((s) => s.remoteModels);
  const fetchingModels = useSettingsUi((s) => s.fetchingModels);
  const [cari, setCari] = useState('');
  const [bukaGrup, setBukaGrup] = useState<Record<string, boolean>>({});
  const cariRef = useRef<HTMLInputElement | null>(null);

  const providerSiap = useMemo(
    () =>
      PROVIDERS.filter(
        (p) =>
          keys.some((k) => k.provider === p.id && k.hasKey) &&
          baseUrlEfektif(p.id, baseUrlOv).length > 0,
      ),
    [keys, baseUrlOv],
  );

  /*
   * Provider groups, with the live ids appended to the catalogue.
   *
   * A gateway serves names the shipped catalogue has never heard of, and
   * without these the list for such a provider was a single placeholder row.
   */
  const grup = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return providerSiap
      .map((p) => {
        const idStatis = new Set(p.models.map((m) => m.id));
        const hidup = (remoteUi[p.id] ?? [])
          .filter((id) => !idStatis.has(id))
          .map((id) => ({ id, label: id, ctx: undefined as number | undefined, note: '' }));
        const semua = [...p.models, ...hidup];
        const items = q
          ? semua.filter(
              (m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
            )
          : semua;
        return { provider: p.id, label: p.label, items };
      })
      .filter((g) => g.items.length > 0);
  }, [providerSiap, remoteUi, cari]);

  /* Fetch the live list once, for the first provider that has none. */
  useEffect(() => {
    if (fetchingModels) return;
    for (const p of providerSiap) {
      if ((remoteUi[p.id]?.length ?? 0) > 0) continue;
      void useSettingsUi.getState().refreshRemoteModels(p.id);
      break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerSiap]);

  useEffect(() => {
    const t = window.setTimeout(() => cariRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        tutup();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [tutup]);

  /* A click anywhere outside closes it. */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('.mm-menu') || t?.closest(`[data-mm-anchor="${pfx}"]`)) return;
      tutup();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [tutup, pfx]);

  if (!rect) return null;

  const pilihModel = (provider: string, model: string) => {
    pilih({ provider, model });
    tutup();
  };

  /* Above the anchor when there is no room below, so a badge near the bottom of
     the window does not open the menu off-screen. */
  const posisi =
    rect.top + 320 < window.innerHeight
      ? { left: rect.left, top: rect.top }
      : { left: rect.left, bottom: rect.bottom };

  return (
    <div
      className="mm-menu"
      data-testid={`${pfx}-menu`}
      role="listbox"
      style={posisi}
    >
      <div className="mm-head">
        <input
          ref={cariRef}
          className="mm-cari"
          data-testid={`${pfx}-cari`}
          placeholder={tr('Search models…')}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="mm-list">
        {ikutChat !== null && (
          <button
            className={`mm-item${!nilai.model ? ' is-on' : ''}`}
            data-testid={`${pfx}-ikut`}
            role="option"
            aria-selected={!nilai.model}
            onClick={() => pilihModel('', '')}
          >
            <span className="mm-ikon mm-ikon-generic" aria-hidden="true">
              <AiIkon name="queue" size={13} />
            </span>
            <span className="mm-nama">{ikutChat ?? tr('Follow the chat model')}</span>
            {chatLabel && <span className="mm-badge">{chatLabel}</span>}
            {!nilai.model && <span className="mm-cek">✓</span>}
          </button>
        )}

        {grup.length === 0 && <p className="mm-kosong">{tr('No model matches that search.')}</p>}

        {grup.map((g) => {
          const terbuka = bukaGrup[g.provider] ?? true;
          return (
            <Fragment key={g.provider}>
              <button
                className={`mm-grup${terbuka ? ' is-open' : ''}`}
                data-testid={`${pfx}-grup-${g.provider}`}
                aria-expanded={terbuka}
                onClick={() => setBukaGrup((s) => ({ ...s, [g.provider]: !terbuka }))}
              >
                <AiIkon name={terbuka ? 'chev-down' : 'chev-right'} size={11} />
                <ProviderLogo id={g.provider} size={13} />
                <span className="mm-grup-nama">{g.label}</span>
                <span className="mm-grup-jml">({g.items.length})</span>
              </button>

              {terbuka &&
                g.items.map((m) => {
                  const aktif = nilai.provider === g.provider && nilai.model === m.id;
                  return (
                    <button
                      key={`${g.provider}:${m.id}`}
                      className={`mm-item${aktif ? ' is-on' : ''}`}
                      data-testid={`${pfx}-pilih-${m.id}`}
                      data-model={m.id}
                      data-provider={g.provider}
                      role="option"
                      aria-selected={aktif}
                      onClick={() => pilihModel(g.provider, m.id)}
                    >
                      <ModelLogo id={m.id} size={15} />
                      <span className="mm-nama" title={m.label}>
                        {tr(m.label)}
                      </span>
                      {m.ctx && <span className="mm-badge">{fmtCtx(m.ctx)}</span>}
                      {aktif && <span className="mm-cek">✓</span>}
                    </button>
                  );
                })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** "128k" / "1M" — the same compact form the chat picker uses. */
function fmtCtx(ctx: number): string {
  if (ctx >= 1_000_000) return `${Math.round(ctx / 1_000_000)}M`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}k`;
  return String(ctx);
}
