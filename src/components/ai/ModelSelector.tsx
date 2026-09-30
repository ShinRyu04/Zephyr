import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT } from '../../lib/i18n';
import {
  baseUrlEfektif,
  ALL_MODELS,
  fmtCtx,
  findModel,
  MODEL_BY_ID,
  PROVIDERS,
  PROVIDER_BY_ID,
  ProviderLogo,
  ModelLogo,
} from '../../lib/modelCatalog';
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
  const setActivity = useStore((s) => s.setActivity);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const applySettings = useStore((s) => s.applySettings);
  const subCfg = useStore((s) => s.settings.subagent);
  const wrap = useRef<HTMLDivElement | null>(null);

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

  const pakai = (m: string) => {
    if (sub) void applySettings({ subagent: { model: m } } as never);
    else void setAiModel(m);
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
   * Pull the key list as soon as the selector mounts, not when a request is
   * sent.
   *
   * The provider list is built from `keys`, so an empty store meant the menu
   * opened with no providers at all and only filled in after the first send
   * happened to call loadKeys — the "custom provider shows up late" symptom.
   */
  useEffect(() => {
    void useAi.getState().loadKeys();
  }, []);

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

  const commitTyped = (p: string) => {
    const v = typed.trim();
    if (!v) return;
    pakai(v);

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

  const bukaSettings = () => {
    setOpen(false);
    setActivity('settings');
    setSettingsOpen(true);
    if (!useStore.getState().sidebarVisible) useStore.getState().toggleSidebar();
    void import('../../lib/settingsStore').then(({ useSettingsUi }) =>
      useSettingsUi.getState().setSection('models'),
    );
  };

  const hasilCari = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return [];
    const boleh = new Set(providerSiap.map((p) => p.id));
    const katalog = ALL_MODELS.filter(
      (m) => boleh.has(m.provider) && (m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)),
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
        const live = [...(remote[p.id] ?? []), ...uiRemote].filter(
          (id, i, a) => id && a.indexOf(id) === i,
        );
        const dariApi = live
          .filter((id) => !MODEL_BY_ID.has(id))
          .map((id) => ({ id, label: id, note: tr('from provider'), ctx: '' }));
        const tersimpan = (saved[p.id] ?? [])
          .filter((id) => !MODEL_BY_ID.has(id) && !live.includes(id))
          // No note: a saved id IS the model name, and "saved" said nothing
          // about it that the list position did not already say.
          .map((id) => ({ id, label: id, note: '', ctx: '' }));
        const katalog = (p.models ?? []).map((m) => ({
          id: m.id,
          label: m.label,
          note: tr(m.note ?? ''),
          ctx: m.ctx ? fmtCtx(m.ctx) : '',
        }));
        return { provider: p.id, label: p.label, freeText: !!p.freeText, items: [...dariApi, ...tersimpan, ...katalog] };
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
          {ikutChat ? tr('Follow chat') : efektif.label}
        </span>
        <AiIkon name="chev-up" size={11} />
      </button>

      {open && (
        <div
          className="ai-model-menu"
          role="listbox"
          data-testid={`${pfx}-model-menu`}
          data-tahap={modeCari ? 'cari' : 'daftar'}
        >
          {/* Search works across every provider, so a user who knows the model
              name does not have to scan the groups. */}
          <div className="ai-mp-cari">
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
                  pakai(hasilCari[0].id);
                  setOpen(false);
                }
              }}
            />
            {cari && (
              <button
                type="button"
                className="ai-model-refresh"
                data-testid={`${pfx}-model-cari-bersih`}
                title={tr('Clear search')}
                onClick={() => setCari('')}
              >
                ×
              </button>
            )}
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
                    pakai(m.id);
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
              <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={bukaSettings}>
                {tr('Open Settings → AI Models')}
              </button>
            </div>
          ) : (
            <>
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
                            pakai(m.id);
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

          <div className="mode-div" aria-hidden="true" />

          {/* Footer, the same two actions the reference picker carries: pull the
              live list, or go edit the providers. */}
          <button
            type="button"
            className="ai-plus-item"
            data-testid={`${pfx}-model-refresh`}
            disabled={fetching || providerSiap.length === 0}
            onClick={() => void refreshSemua()}
          >
            <AiIkon name="refresh" />
            <span className="ai-plus-label">
              {fetching ? tr('Refreshing…') : tr('Refresh models')}
            </span>
          </button>
          <button type="button" className="ai-plus-item" data-testid={`${pfx}-model-edit`} onClick={bukaSettings}>
            <AiIkon name="gear" />
            <span className="ai-plus-label">{tr('Edit models…')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
