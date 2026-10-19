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
import { bukaPanel } from '../../lib/bukaPanel';
import { deteksiKemampuan, fmtCtx as fmtCtxKatalog } from '../../lib/modelCatalog';
import AiIkon from './AiIkon';
import ModelDetailPanel from './ModelDetailPanel';

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
  /*
   * Which row the detail panel describes. Hover and keyboard focus both set it,
   * so the panel is reachable without a pointer; `null` falls back to the
   * current selection rather than leaving the column blank.
   */
    const [intip, setIntip] = useState<{ id: string; top: number } | null>(null);
  /* Hover/focus on a row records WHERE it is, so the card can line up with it. */
  const tunjuk = (id: string) => (e: React.SyntheticEvent<HTMLElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    setIntip({ id, top: b.top });
  };
  const remoteInfo = useSettingsUi((s) => s.remoteInfo);

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
        /*
         * Capabilities are attached here, from the one shared detector, so this
         * picker and the chat picker can never disagree about the same model.
         */
        const berlabel = items.map((m) => ({
          ...m,
          bisa: deteksiKemampuan(m.id, remoteInfo[p.id]?.[m.id]),
        }));
        return { provider: p.id, label: p.label, items: berlabel };
      })
      .filter((g) => g.items.length > 0);
  }, [providerSiap, remoteUi, remoteInfo, cari]);

  /*
   * The row the panel is describing: the hovered one, else the current
   * selection, else the first row on screen — so the column is never blank.
   */
  const detail = useMemo(() => {
    const semua = grup.flatMap((g) => g.items);
    const pilih = semua.find((m) => m.id === intip?.id) ?? semua.find((m) => m.id === nilai.model) ?? semua[0];
    if (!pilih) return null;
    return {
      id: pilih.id,
      label: pilih.label,
      ctx: pilih.ctx ? fmtCtxKatalog(pilih.ctx) : '',
      bisa: pilih.bisa,
      biaya: 'Billed by token',
    };
  }, [grup, intip, nilai]);

  /*
   * Where the floating card goes: beside the menu, lined up with the ROW under
   * the pointer. Same rule as the chat picker — right when there is room, left
   * otherwise, and pulled up only as far as the window demands.
   */
  const kartuRect = useMemo(() => {
    if (!rect) return null;
    const LEBAR = 208;
    const JARAK = 8;
    const TINGGI = 240;
    const kanan = rect.left + 320 + JARAK;
    const adaKanan = kanan + LEBAR <= window.innerWidth - 8;
    const kiri = rect.left - JARAK - LEBAR;
    const adaKiri = kiri >= 8;
    const top = Math.max(8, Math.min(intip?.top ?? rect.top, window.innerHeight - TINGGI - 8));
    return {
      left: adaKanan ? kanan : adaKiri ? kiri : Math.max(8, window.innerWidth - LEBAR - 8),
      top,
      width: LEBAR,
    };
  }, [rect, intip]);
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
        <div className="mm-cari-baris">
          <span className="mm-cari-ikon" aria-hidden="true">
            <AiIkon name="search" size={12} />
          </span>
          <input
            ref={cariRef}
            className="mm-cari"
            data-testid={`${pfx}-cari`}
            placeholder={tr('Search models…')}
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            spellCheck={false}
          />
          {/* Same two actions, same place, as the chat picker: a long list used
              to bury them in a footer, so they are icon buttons beside the
              search field instead. */}
          <button
            type="button"
            className={`mm-aksi${fetchingModels ? ' is-putar' : ''}`}
            data-testid={`${pfx}-refresh`}
            title={fetchingModels ? tr('Refreshing…') : tr('Refresh models')}
            aria-label={tr('Refresh models')}
            disabled={!!fetchingModels || providerSiap.length === 0}
            onClick={() => {
              for (const p of providerSiap) void useSettingsUi.getState().refreshRemoteModels(p.id);
            }}
          >
            <AiIkon name="refresh" size={13} />
          </button>
          <button
            type="button"
            className="mm-aksi is-utama"
            data-testid={`${pfx}-tambah`}
            title={tr('Add Model')}
            aria-label={tr('Add Model')}
            onClick={() => {
              tutup();
              bukaPanel('models');
            }}
          >
            <AiIkon name="plus" size={13} />
          </button>
        </div>
      </div>

      <div className="mm-list" onMouseLeave={() => setIntip(null)}>
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
                      className={`mm-item${aktif ? ' is-on' : ''}${intip?.id === m.id ? ' is-intip' : ''}`}
                      data-testid={`${pfx}-pilih-${m.id}`}
                      data-model={m.id}
                      data-provider={g.provider}
                      role="option"
                      aria-selected={aktif}
                      onMouseEnter={tunjuk(m.id)}
                      onFocus={tunjuk(m.id)}
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

      {intip && detail && (
        <ModelDetailPanel model={detail} testid={`${pfx}-detail`} mengambang rect={kartuRect} />
      )}
    </div>
  );
}

/** "128k" / "1M" — the same compact form the chat picker uses. */
function fmtCtx(ctx: number): string {
  if (ctx >= 1_000_000) return `${Math.round(ctx / 1_000_000)}M`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}k`;
  return String(ctx);
}
