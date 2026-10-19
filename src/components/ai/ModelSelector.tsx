import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { bukaPanel } from '../../lib/bukaPanel';
import { useT } from '../../lib/i18n';
import {
  baseUrlEfektif,
  ALL_MODELS,
  fmtCtx,
  findModel,
  isPlaceholderModel,
  MODEL_BY_ID,
  modelTersedia,
  PROVIDERS,
  PROVIDER_BY_ID,
  ProviderLogo,
  ModelLogo,
} from '../../lib/modelCatalog';
import { HYDRA_MODEL_ID, pilihHydra } from '../../lib/hydraModel';
import AiIkon from './AiIkon';

const LS_SAVED = 'zephyr.ai.custommodels.v1';

function loadSaved(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(LS_SAVED);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
    }
    return out;
  } catch {
    return {};
  }
}

export type TargetModel = 'chat' | 'subagent';

export default function ModelSelector({ target = 'chat' }: { target?: TargetModel } = {}) {
  const tr = useT();
  const aiModel = useAi((s) => s.model);
  const aiProvider = useAi((s) => s.provider);
  const openAi = useAi((s) => s.modelMenuOpen);
  const keys = useAi((s) => s.keys);
  const setOpenAi = useAi((s) => s.setModelMenuOpen);
  const setAiModel = useAi((s) => s.setModel);
  const applySettings = useStore((s) => s.applySettings);
  const subCfg = useStore((s) => s.settings.subagent);
  /*
   * HydraFusion is SELECTED, not enabled. Reading the model selection (not the
   * `hydrafusion.enabled` flag) is what keeps the picker, the chip and the send
   * paths telling the reader the same story.
   */
  const hydraDipilih = !target || target === 'chat' ? pilihHydra(aiModel) : false;
  const wrap = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const sub = target === 'subagent';
  const pfx = sub ? 'sub' : 'ai';

  const [openSub, setOpenSub] = useState(false);
  const open = sub ? openSub : openAi;
  const setOpen = sub ? setOpenSub : setOpenAi;

  const model = sub ? (subCfg?.model ?? '') : aiModel;
  const provider = sub ? (subCfg?.provider ?? '') : aiProvider;

  const ikutChat = sub && !model.trim();

  const [cari, setCari] = useState('');

  /* Which provider groups are folded shut. The active provider opens by
     default, so the current model is visible the moment the menu opens. */
  const [bukaGrup, setBukaGrup] = useState<Record<string, boolean>>({});
  const [typed, setTyped] = useState('');
  const [saved, setSaved] = useState<Record<string, string[]>>(loadSaved);

  const [remote, setRemote] = useState<Record<string, string[]>>({});
  const [fetching, setFetching] = useState(false);

  const baseUrlOv = useStore((s) => s.settings.models.providers);

  const efektif = ikutChat ? findModel(aiModel, aiProvider) : findModel(model, provider || undefined);
  const adaKey = (id: string) => keys.some((k) => k.provider === id && k.hasKey);

  // A stored key is not enough on its own: without an endpoint there is nowhere
  // to send the request. `custom` ships an empty base URL on purpose, so before
  // this it was listed - and badged "key saved" - while every send failed.
  const baseUrl = baseUrlEfektif(efektif.provider, baseUrlOv);

  // Same rule for the picker: a provider is offered only when it can actually
  // send - key present AND an endpoint to send to.
  const providerSiap = useMemo(
    () =>
      PROVIDERS.filter(
        (p) => adaKey(p.id) && baseUrlEfektif(p.id, baseUrlOv).length > 0,
      ),
    [keys, baseUrlOv],
  );
  const providerTersembunyi = PROVIDERS.length - providerSiap.length;

  /*
   * `p` = the provider group the row (or the typed name) came from.
   *
   * It has to reach setModel: a row sits inside one provider's group, and the
   * click means "this model, from this provider". Dropping it left the previous
   * provider active - the composer showed "Anthropic - gemini-3.8-flash" and
   * sent Gemini's model to Anthropic's endpoint.
   */
  const pakai = (m: string, p?: string) => {
    if (sub) {
      void applySettings({ subagent: p ? { model: m, provider: p } : { model: m } } as never);
    } else void setAiModel(m, p);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  useEffect(() => {
    if (open) setCari('');
  }, [open]);

  /*
   * Pull the key list whenever the menu OPENS, not once at mount.
   *
   * The provider list is built from `keys`, so an empty store meant the menu
   * opened with no providers at all and only filled in after the first send
   * happened to call loadKeys — the "custom provider shows up late" symptom.
   * Making it run on mount fixed that one, and introduced a worse one: the
   * snapshot never refreshed again. A key saved in Settings afterwards went
   * into `useSettingsUi`'s own copy and never reached this store, so the menu
   * kept the pre-save snapshot and hid the provider forever — the user saw
   * "key saved" and a passing connection test in Settings, and "providers
   * hidden because there is no API key yet" in the picker. Only a reload
   * reconciled the two.
   *
   * Re-reading on open costs one IPC that lists providers and masks keys; it
   * does not touch the network. That is cheap enough to be unconditional, and
   * being unconditional is the point — a condition based on "was a key saved
   * since?" is another piece of state that can itself go stale.
   */
  useEffect(() => {
    if (!open) return;
    void useAi.getState().loadKeys();
  }, [open]);

  /*
   * Fetch the live model list the moment the menu opens.
   *
   * `loadRemote` only ran from the refresh button in the footer, so a user who
   * never pressed it saw the static catalogue alone — for `custom` that is a
   * single placeholder row ("Type the model name"), which reads as "my models
   * are missing" even though the provider serves eighteen of them. Fetching on
   * open costs one request per open and makes the list correct by default.
   *
   * `remote` is checked first so reopening the menu does not re-hit the API for
   * a list already in memory.
   */
  useEffect(() => {
    if (!open || providerSiap.length === 0) return;
    const belum = providerSiap.filter((p) => (remote[p.id]?.length ?? 0) === 0);
    if (belum.length === 0) return;
    void (async () => {
      for (const p of belum) await loadRemote(p.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, providerSiap]);

  const loadRemote = async (p: string) => {
    if (fetching) return;
    setFetching(true);
    try {
      const b =
        (useStore.getState().settings.models.providers ?? {})[p]?.baseUrl ||
        PROVIDER_BY_ID.get(p)?.baseUrl ||
        undefined;
      const ids = await cmd.listModels(p, b);
      setRemote((r) => ({ ...r, [p]: ids }));
    } catch {
      /* no key / offline - the stored list is still shown */
    } finally {
      setFetching(false);
    }
  };

  /* One refresh pulls the live list for every provider that can send, so the
     footer action does not depend on which group the user is looking at. */
  const refreshSemua = async () => {
    for (const p of providerSiap) await loadRemote(p.id);
  };

  /*
   * Flip the menu to the button's RIGHT edge when opening left would leave the
   * screen.
   *
   * WHY measured instead of a CSS class: the button sits in the chat header,
   * which is at the window's right edge whenever the chat is docked right or
   * maximised (measured: button x=1211 of a 1536 viewport). A 361px menu anchored
   * to the button's LEFT edge ends at 1572 — 36px past the window — and the row
   * badges are clipped. That is the reported "terlalu ujung ga kliatan". The old
   * `.ai-panel.is-kanan` class cannot carry this fix: `AiPanel` hard-codes that
   * class OFF so every home shares one layout.
   *
   * Measured at open time and written as an inline style, so it is right in all
   * four homes (bottom dock, right column, editor tab, popped-out window) without
   * a flag per home. It re-runs when the query changes because the result list
   * (and so the menu's width) changes with it.
   */
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    const anchor = wrap.current;
    if (!el || !anchor) return;
    /* Start from the CSS default so a re-open cannot inherit the previous flip. */
    el.style.left = '0';
    el.style.right = 'auto';
    const w = el.getBoundingClientRect().width;
    const a = anchor.getBoundingClientRect();
    if (a.left + w > window.innerWidth - 8) {
      el.style.left = 'auto';
      el.style.right = '0';
    }
  }, [open, cari, typed]);

  const commitTyped = (p: string) => {
    const v = typed.trim();
    if (!v) return;
    pakai(v, p);

    setSaved((s) => {
      const list = s[p] ?? [];
      const next = list.includes(v) ? list : [...list, v];
      const out = { ...s, [p]: next };
      try {
        localStorage.setItem(LS_SAVED, JSON.stringify(out));
      } catch {
        /* quota full - the list stays in memory */
      }
      return out;
    });
    setTyped('');
    setOpen(false);
  };

  /*
   * "Edit models" opens CHAT SETTINGS on Models.
   *
   * The old body did four things to reach a section: close the menu, switch the
   * activity bar to Settings, force the sidebar open, then ask for 'models' on a
   * page across the window. None of that survives: the model settings are a pop-up
   * now, so reaching them is one call and this panel stays where it is.
   */
  const bukaModels = () => {
    setOpen(false);
    bukaPanel('models');
  };

  const hasilCari = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return [];
    const boleh = new Set(providerSiap.map((p) => p.id));
    const katalog = ALL_MODELS.filter(
      (m) =>
        boleh.has(m.provider) &&
        !isPlaceholderModel(m.id) &&
        (m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
    ).map((m) => ({
      id: m.id,
      label: m.label,
      provider: m.provider,
      note: tr(m.note ?? ''),
      ctx: m.ctx ? fmtCtx(m.ctx) : '',
    }));
    const live = Object.entries(remote)
      .filter(([p]) => boleh.has(p))
      .flatMap(([p, ids]) =>
        ids
          .filter((id) => !MODEL_BY_ID.has(id) && id.toLowerCase().includes(q))
          .map((id) => ({ id, label: id, provider: p, note: tr('from provider'), ctx: '' })),
      );
    return [...katalog, ...live].slice(0, 40);
  }, [cari, providerSiap, remote, tr]);

  const modeCari = cari.trim().length > 0;

  /*
   * Flat list: every usable model in one scrollable list, grouped under a
   * provider heading, the way the reference picker does it.
   *
   * The two-level drill-down this replaces asked for the provider first and
   * only then showed models — two clicks plus a back button to answer one
   * question, and the second screen hid the first. Providers with no key stay
   * out (they cannot send); the note at the bottom says how many were hidden.
   */
  const daftarModel = useMemo(
    () =>
      providerSiap.map((p) => {
        const uiRemote = useSettingsUi.getState().remoteModels[p.id] ?? [];
        const items = modelTersedia(p.id, remote[p.id] ?? [], uiRemote, saved[p.id] ?? []).map((m) => ({
          ...m,
          note: m.note ? tr(m.note) : '',
          ctx: m.ctx ? fmtCtx(m.ctx) : '',
        }));
        return {
          provider: p.id,
          label: p.label,
          freeText: !!p.freeText,
          perluPilih: !!p.freeText && items.length === 0,
          items,
        };
      }),
    [providerSiap, remote, saved, tr],
  );

  return (
    <div className="ai-model-wrap" ref={wrap}>
      <button
        className="ai-model-btn"
        data-testid={`${pfx}-model-btn`}
        data-model={efektif.id}
        data-provider={efektif.provider}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${efektif.providerLabel} - ${baseUrl || tr('base URL not set')}`}
        onClick={() => setOpen(!open)}
      >
        <ProviderLogo id={efektif.provider} size={15} />
        <span className="ai-model-name">
          {ikutChat ? tr('Follow chat') : hydraDipilih ? 'HydraFusion' : efektif.label}
        </span>
        {/* Closed: the list below is folded, so the caret points DOWN. It used
            to be hardcoded to `chev-up`, which told the reader the menu was
            already open while it was shut - measured live against the
            reference, whose caret points down whenever the menu is closed. */}
        <AiIkon name={open ? 'chev-up' : 'chev-down'} size={11} />
      </button>

      {open && (
        <div
          className="ai-model-menu"
          ref={menuRef}
          role="listbox"
          data-testid={`${pfx}-model-menu`}
          data-tahap={modeCari ? 'cari' : 'daftar'}
        >
          {/*
            * Header row, in the reference product's shape: the search field
            * takes the whole first row, and the two actions ride at its right
            * edge as icon buttons — Refresh and Add.
            *
            * Both used to live in a FOOTER below a list that can be forty rows
            * long, so on a real account "Refresh models" sat off-screen behind
            * the scroll. Up here they are always reachable, which is the whole
            * reason the reference puts them beside the search box.
            */}
          <div className="ai-mp-cari">
            <span className="ai-mp-cari-ikon" aria-hidden="true">
              <AiIkon name="search" size={12} />
            </span>
            <input
              type="text"
              className="ai-model-input"
              data-testid={`${pfx}-model-cari`}
              placeholder={tr('Search models…')}
              value={cari}
              spellCheck={false}
              onChange={(e) => setCari(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && modeCari && hasilCari[0]) {
                  pakai(hasilCari[0].id, hasilCari[0].provider);
                  setOpen(false);
                }
              }}
            />
            {cari && (
              <button
                type="button"
                className="ai-model-refresh is-kecil"
                data-testid={`${pfx}-model-cari-bersih`}
                title={tr('Clear search')}
                onClick={() => setCari('')}
              >
                ×
              </button>
            )}
            <button
              type="button"
              className={`ai-model-refresh${fetching ? ' is-putar' : ''}`}
              data-testid={`${pfx}-model-refresh`}
              title={fetching ? tr('Refreshing…') : tr('Refresh models')}
              aria-label={tr('Refresh models')}
              disabled={fetching || providerSiap.length === 0}
              onClick={() => void refreshSemua()}
            >
              <AiIkon name="refresh" size={13} />
            </button>
            <button
              type="button"
              className="ai-model-refresh is-utama"
              data-testid={`${pfx}-model-edit`}
              title={tr('Add Model')}
              aria-label={tr('Add Model')}
              onClick={bukaModels}
            >
              <AiIkon name="plus" size={13} />
            </button>
          </div>

          {modeCari ? (
            hasilCari.length === 0 ? (
              <div className="ai-model-empty" data-testid={`${pfx}-model-kosong`}>
                {tr('No matching model')}
              </div>
            ) : (
              hasilCari.map((m) => (
                <button
                  key={`c:${m.provider}:${m.id}`}
                  role="option"
                  aria-selected={m.id === efektif.id}
                  className={`ai-model-item${m.id === efektif.id ? ' is-active' : ''}`}
                  data-model-item={m.id}
                  data-provider={m.provider}
                  onClick={() => {
                    pakai(m.id, m.provider);
                    setOpen(false);
                  }}
                >
                  <ModelLogo id={m.id} size={15} />
                  <span className="ai-mi-name">{tr(m.label)}</span>
                  <span className="ai-mi-badge">
                    {[m.ctx, m.note].filter(Boolean).join(' · ')}
                  </span>
                  {m.id === efektif.id && <span className="pick-check">✓</span>}
                </button>
              ))
            )
          ) : providerSiap.length === 0 ? (
            <div className="ai-model-empty" data-testid={`${pfx}-model-kosong`}>
              {tr('No API key installed yet. Add a key first to pick a model.')}
              <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={bukaModels}>
                {tr('Open AI Models')}
              </button>
            </div>
          ) : (
            <>
              {/*
                * HydraFusion is a MODEL, and it is always in this list.
                *
                * The reference product states the contract plainly: "you select
                * HydraFusion like any other model, and it chooses a workflow".
                * It is therefore a row here, not a switch in another panel.
                *
                * WHY it used to be gated behind `hydraOn`: the row only rendered
                * when the setting was ALREADY on, so the only way to reach it was
                * to turn the setting on first — and with the setting on, every
                * turn was routed whether or not the reader ever picked it. That
                * circularity is exactly the "HydraFusion engages by itself"
                * complaint. Selecting this row now SETS THE MODEL (the
                * `hydrafusion` sentinel); the send paths read the selection, not
                * the flag.
                */}
              {!sub && (
                <button
                  type="button"
                  role="option"
                  aria-selected={hydraDipilih}
                  className={`ai-model-item is-hydra${hydraDipilih ? ' is-active' : ''}`}
                  data-testid="ai-model-hydra"
                  title={tr(
                    'Routes the first eligible turn and may use several models. Premium usage varies with the selected route.',
                  )}
                  onClick={() => {
                    setAiModel(HYDRA_MODEL_ID, aiProvider || undefined);
                    setOpen(false);
                  }}
                >
                  <span className="ai-mi-name">HydraFusion</span>
                  <span className="ai-mi-badge">{tr('Research preview')}</span>
                  <span className="ai-mi-badge">
                    {tr('the app picks the model and the workflow per task')}
                  </span>
                  {hydraDipilih && <span className="pick-check">✓</span>}
                </button>
              )}

              {sub && (
                <button
                  type="button"
                  role="option"
                  aria-selected={ikutChat}
                  className={`ai-model-item${ikutChat ? ' is-active' : ''}`}
                  data-testid="sub-model-ikut"
                  onClick={() => {
                    void applySettings({ subagent: { model: '', provider: '' } } as never);
                    setOpen(false);
                  }}
                >
                  <span className="ai-mi-name">{tr('Follow the chat model')}</span>
                  <span className="ai-mi-badge">{tr('same as the conversation')}</span>
                  {ikutChat && <span className="pick-check">✓</span>}
                </button>
              )}

              {daftarModel.map((g) => {
                /*
                 * Collapsible group, the shape the reference picker uses: a
                 * chevron, the provider name, and the model count in brackets.
                 *
                 * The count is what makes collapsing safe — you can see how much
                 * is folded away, so a collapsed group does not read as empty.
                 * The active provider starts open so the current model is
                 * visible the moment the menu opens.
                 */
                const terbuka = bukaGrup[g.provider] ?? g.provider === efektif.provider;
                if (g.perluPilih && !terbuka) return null;
                return (
                  <Fragment key={g.provider}>
                    <button
                      type="button"
                      className={`ai-model-group${terbuka ? ' is-open' : ''}`}
                      data-testid={`${pfx}-model-grup-${g.provider}`}
                      data-group={g.provider}
                      aria-expanded={terbuka}
                      onClick={() => setBukaGrup((s) => ({ ...s, [g.provider]: !terbuka }))}
                    >
                      <AiIkon name={terbuka ? 'chev-down' : 'chev-right'} size={11} />
                      <ProviderLogo id={g.provider} size={13} />
                      <span className="ai-model-group-nama">{g.label}</span>
                      <span className="ai-model-group-jml">({g.items.length})</span>
                    </button>

                    {terbuka && g.perluPilih && (
                      /* A free-text provider with nothing but placeholders in
                         the catalogue has no clickable model at all. Say so,
                         in place, instead of a dead list - the input below is
                         still the way forward. */
                      <div
                        className="ai-model-empty"
                        data-testid={`${pfx}-model-perlu-pilih-${g.provider}`}
                      >
                        {tr('Choose a model: type a name below or press Refresh.')}
                      </div>
                    )}

                    {terbuka &&
                      g.items.map((m) => (
                        <button
                          key={`m:${g.provider}:${m.id}`}
                          role="option"
                          aria-selected={m.id === efektif.id}
                          className={`ai-model-item${m.id === efektif.id ? ' is-active' : ''}`}
                          data-model-item={m.id}
                          data-provider={g.provider}
                          data-baseurl={PROVIDER_BY_ID.get(g.provider)?.baseUrl}
                          onClick={() => {
                            pakai(m.id, g.provider);
                            setOpen(false);
                          }}
                        >
                          <ModelLogo id={m.id} size={15} />
                          <span className="ai-mi-name">{tr(m.label)}</span>
                          <span className="ai-mi-badge">{[m.ctx, m.note].filter(Boolean).join(' · ')}</span>
                          {m.id === efektif.id && <span className="pick-check">✓</span>}
                        </button>
                      ))}

                  {/* A provider that accepts free-form ids gets its input inside
                      its own group, so the typed id lands in the right place
                      without a separate screen. */}
                  {g.freeText && (
                    <div className="ai-model-typed">
                      <input
                        type="text"
                        className="ai-model-input"
                        data-testid={`${pfx}-model-input`}
                        placeholder={tr('Type a model name… (Enter)')}
                        value={typed}
                        spellCheck={false}
                        onChange={(e) => setTyped(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitTyped(g.provider);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        data-testid={`${pfx}-model-pakai`}
                        disabled={!typed.trim()}
                        onClick={() => commitTyped(g.provider)}
                      >
                        {tr('Use')}
                      </button>
                    </div>
                  )}
                  </Fragment>
                );
              })}

              {providerTersembunyi > 0 && (
                <div className="ai-mp-note" data-testid={`${pfx}-mp-note`}>
                  {providerTersembunyi} {tr('providers hidden because there is no API key yet.')}
                </div>
              )}
            </>
          )}

          {/*
            * No footer.
            *
            * It held "Refresh models" and "Edit models…" under a list that can
            * run to forty rows, so on any real account both actions sat below
            * the fold and the only way to refresh was to scroll to the bottom
            * of the menu first. They are icon buttons in the header now, where
            * the reference product puts them.
            */}
        </div>
      )}
    </div>
  );
}
