import { useEffect, useMemo, useRef, useState } from 'react';
import * as cmd from '../../lib/commands';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { useSettingsUi } from '../../lib/settingsStore';
import { useT } from '../../lib/i18n';
import {
  ALL_MODELS,
  fmtCtx,
  findModel,
  MODEL_BY_ID,
  PROVIDERS,
  PROVIDER_BY_ID,
  ProviderLogo,
  type ProviderInfo,
} from '../../lib/modelCatalog';

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

  const [tahap, setTahap] = useState<'provider' | 'model'>('provider');

  const [dipilih, setDipilih] = useState<string>('');
  const [cari, setCari] = useState('');
  const [typed, setTyped] = useState('');
  const [saved, setSaved] = useState<Record<string, string[]>>(loadSaved);

  const [remote, setRemote] = useState<Record<string, string[]>>({});
  const [fetching, setFetching] = useState(false);

  const efektif = ikutChat ? findModel(aiModel, aiProvider) : findModel(model, provider || undefined);
  const hasKey = keys.some((k) => k.provider === efektif.provider && k.hasKey);

  const baseUrl =
    (useStore.getState().settings.models.providers ?? {})[efektif.provider]?.baseUrl ||
    efektif.baseUrl;

  const adaKey = (id: string) => keys.some((k) => k.provider === id && k.hasKey);

  const providerSiap: ProviderInfo[] = useMemo(
    () => PROVIDERS.filter((p) => keys.some((k) => k.provider === p.id && k.hasKey) || p.freeText),
    [keys],
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
    if (open) {
      setTahap('provider');
      setCari('');
      setDipilih(efektif.provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && tahap === 'model' && PROVIDER_BY_ID.get(dipilih)?.freeText && !MODEL_BY_ID.has(model))
      setTyped(model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tahap, dipilih]);

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
      /* tanpa key / offline — daftar tersimpan tetap tampil */
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (open && tahap === 'model' && adaKey(dipilih)) void loadRemote(dipilih);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tahap, dipilih]);

  const commitTyped = (p: string, close?: boolean) => {
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
        /* kuota penuh — daftar tetap di memori */
      }
      return out;
    });
    if (close) setOpen(false);
  };

  const bukaSettings = () => {
    setActivity('settings');
    setSettingsOpen(true);
    if (!useStore.getState().sidebarVisible) useStore.getState().toggleSidebar();
    void import('../../lib/settingsStore').then(({ useSettingsUi }) =>
      useSettingsUi.getState().setSection('models'),
    );
  };

  const modelUntuk = (p: string) => {
    const info = PROVIDER_BY_ID.get(p);

    const uiRemote = useSettingsUi.getState().remoteModels[p] ?? [];
    const live = [...(remote[p] ?? []), ...uiRemote].filter(
      (id, i, a) => id && a.indexOf(id) === i,
    );
    const katalog = (info?.models ?? []).map((m) => ({
      id: m.id,
      label: m.label,
      sub: [info?.label, m.ctx ? fmtCtx(m.ctx) : '', m.note ?? ''].filter(Boolean).join(' · '),
    }));
    const dariApi = live
      .filter((id) => !MODEL_BY_ID.has(id))
      .map((id) => ({ id, label: id, sub: `${tr('dari provider')} · API` }));
    const tersimpan = (saved[p] ?? [])
      .filter((id) => !MODEL_BY_ID.has(id) && !live.includes(id))
      .map((id) => ({ id, label: id, sub: tr('tersimpan untuk provider ini') }));
    return [...dariApi, ...tersimpan, ...katalog];
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
      sub: [PROVIDER_BY_ID.get(m.provider)?.label, m.ctx ? fmtCtx(m.ctx) : '', m.note ?? '']
        .filter(Boolean)
        .join(' · '),
    }));
    const live = Object.entries(remote)
      .filter(([p]) => boleh.has(p))
      .flatMap(([p, ids]) =>
        ids
          .filter((id) => !MODEL_BY_ID.has(id) && id.toLowerCase().includes(q))
          .map((id) => ({ id, label: id, provider: p, sub: `${tr('dari provider')} · API` })),
      );
    return [...katalog, ...live].slice(0, 40);
  }, [cari, providerSiap, remote, tr]);

  const modeCari = cari.trim().length > 0;

  return (
    <div className="ai-model-wrap" ref={wrap}>
      <button
        className="ai-model-btn"
        data-testid={`${pfx}-model-btn`}
        data-model={efektif.id}
        data-provider={efektif.provider}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={
          sub
            ? ikutChat
              ? tr('Ikut model chat — klik untuk memilih model khusus subagent')
              : `${efektif.providerLabel} — ${baseUrl || tr('base URL belum diisi')}`
            : `${efektif.providerLabel} — ${baseUrl || tr('base URL belum diisi')}`
        }
        onClick={() => setOpen(!open)}
      >
        <ProviderLogo id={efektif.provider} size={15} />
        <span className="ai-model-name">
          {ikutChat ? tr('Ikut chat') : efektif.label}
        </span>
        {ikutChat && <span className="ai-mi-key is-ok">{tr('ikut')}</span>}
        <svg viewBox="0 0 16 16" className="ai-chev" aria-hidden="true">
          <path d="M4 6.5l4 3.5 4-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {/* Status key provider aktif: hijau = siap, oranye = belum ada key.
          Untuk target subagent, "ikut chat" berarti statusnya ikut provider
          chat — jadi tombol ini tetap relevan. */}
      {!sub && (
        <button
          className={`ai-keystate${hasKey ? ' is-ok' : ' is-warn'}`}
          data-testid="ai-keystate"
          data-haskey={hasKey ? '1' : '0'}
          title={
            hasKey
              ? 'API key tersimpan untuk provider ini'
              : 'Belum ada API key — klik untuk membuka Settings → Model AI'
          }
          onClick={() => {
            if (hasKey) return;
            bukaSettings();
          }}
        >
          <span className="ai-dot" aria-hidden="true" />
          {hasKey ? 'key siap' : 'isi key'}
        </button>
      )}

      {open && (
        <div
          className="ai-model-menu"
          role="listbox"
          data-testid={`${pfx}-model-menu`}
          data-tahap={modeCari ? 'cari' : tahap}
        >
          {/* Kotak cari: bekerja lintas provider, jadi user yang sudah tahu
              nama modelnya tidak perlu menelusuri dua tingkat. */}
          <div className="ai-mp-cari">
            <input
              type="text"
              className="ai-model-input"
              data-testid={`${pfx}-model-cari`}
              placeholder={tr('Cari model…')}
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
                title={tr('Bersihkan pencarian')}
                onClick={() => setCari('')}
              >
                ×
              </button>
            )}
          </div>

          {/* ── Mode CARI: daftar datar hasil saringan ── */}
          {modeCari &&
            (hasilCari.length === 0 ? (
              <div className="ai-model-empty" data-testid={`${pfx}-model-kosong`}>
                {tr('Tidak ada model yang cocok')}
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
                  data-baseurl={PROVIDER_BY_ID.get(m.provider)?.baseUrl}
                  onClick={() => {
                    pakai(m.id);
                    setOpen(false);
                  }}
                >
                  <ProviderLogo id={m.provider} size={16} />
                  <span className="ai-mi-main">
                    <span className="ai-mi-name">{m.label}</span>
                    <span className="ai-mi-sub">{m.sub}</span>
                  </span>
                </button>
              ))
            ))}

          {/* ── Tingkat PROVIDER ── */}
          {!modeCari && tahap === 'provider' && (
            <>
              {sub && (
                <button
                  type="button"
                  role="option"
                  aria-selected={ikutChat}
                  className={`ai-model-item ai-mp-item${ikutChat ? ' is-active' : ''}`}
                  data-testid="sub-model-ikut"
                  onClick={() => {
                    void applySettings({ subagent: { model: '', provider: '' } } as never);
                    setOpen(false);
                  }}
                >
                  <span className="ai-mi-main">
                    <span className="ai-mi-name">{tr('Ikut model chat')}</span>
                    <span className="ai-mi-sub">
                      {tr('Subagent memakai model yang sama dengan percakapan')}
                    </span>
                  </span>
                </button>
              )}
              {providerSiap.length === 0 ? (
                <div className="ai-model-empty" data-testid={`${pfx}-model-kosong`}>
                  {tr('Belum ada API key terpasang. Isi satu key dulu untuk memilih model.')}
                  <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={bukaSettings}>
                    {tr('Buka Settings → Model AI')}
                  </button>
                </div>
              ) : (
                <>
                  <div className="ai-model-group">{tr('Pilih provider')}</div>
                  {providerSiap.map((p) => {
                    const jml = p.freeText
                      ? (saved[p.id]?.length ?? 0) + p.models.length
                      : p.models.length;
                    const aktif = p.id === efektif.provider;
                    return (
                      <button
                        key={`p:${p.id}`}
                        role="option"
                        aria-selected={aktif}
                        className={`ai-model-item ai-mp-item${aktif ? ' is-active' : ''}`}
                        data-provider-item={p.id}
                        data-provider={p.id}
                        onClick={() => {
                          setDipilih(p.id);
                          setTahap('model');
                        }}
                      >
                        <ProviderLogo id={p.id} size={16} />
                        <span className="ai-mi-main">
                          <span className="ai-mi-name">{p.label}</span>
                          <span className="ai-mi-sub">
                            {jml} {tr('model')}
                            {p.freeText ? ` · ${tr('bisa ketik bebas')}` : ''}
                          </span>
                        </span>
                        <span className={`ai-mi-key${adaKey(p.id) ? ' is-ok' : ''}`}>
                          {adaKey(p.id) ? 'key' : tr('bebas')}
                        </span>
                        <svg viewBox="0 0 16 16" className="ai-chev" aria-hidden="true">
                          <path d="M6.5 4l3.5 4-3.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        </svg>
                      </button>
                    );
                  })}
                  {providerTersembunyi > 0 && (
                    <div className="ai-mp-note" data-testid={`${pfx}-mp-note`}>
                      {providerTersembunyi} {tr('provider disembunyikan karena belum ada API key.')}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Tingkat MODEL ── */}
          {!modeCari && tahap === 'model' && (
            <>
              <div className="ai-mp-head">
                <button
                  type="button"
                  className="ai-mp-back"
                  data-testid={`${pfx}-mp-back`}
                  title={tr('Kembali ke daftar provider')}
                  onClick={() => {
                    setTahap('provider');
                    setCari('');
                  }}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M9.5 4L6 8l3.5 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
                <ProviderLogo id={dipilih} size={14} />
                <span className="ai-mp-title">{PROVIDER_BY_ID.get(dipilih)?.label}</span>
                <span className={`ai-mi-key${adaKey(dipilih) ? ' is-ok' : ''}`}>
                  {adaKey(dipilih) ? 'key' : tr('bebas')}
                </span>
                {adaKey(dipilih) && (
                  <button
                    type="button"
                    className="ai-model-refresh"
                    data-testid={`${pfx}-model-refresh`}
                    disabled={fetching}
                    title={tr('Ambil daftar model terbaru dari provider')}
                    onClick={() => void loadRemote(dipilih)}
                  >
                    {fetching ? '…' : '↻'}
                  </button>
                )}
              </div>

              {PROVIDER_BY_ID.get(dipilih)?.freeText && (
                <div className="ai-model-typed">
                  <input
                    type="text"
                    className="ai-model-input"
                    data-testid={`${pfx}-model-input`}
                    placeholder={tr('Ketik nama model… (Enter)')}
                    value={typed}
                    spellCheck={false}
                    autoFocus
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTyped(dipilih, true);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    data-testid={`${pfx}-model-pakai`}
                    disabled={!typed.trim()}
                    onClick={() => commitTyped(dipilih, true)}
                  >
                    {tr('Pakai')}
                  </button>
                </div>
              )}

              {modelUntuk(dipilih).map((m) => (
                <button
                  key={`m:${dipilih}:${m.id}`}
                  role="option"
                  aria-selected={m.id === efektif.id}
                  className={`ai-model-item${m.id === efektif.id ? ' is-active' : ''}`}
                  data-model-item={m.id}
                  data-provider={dipilih}
                  data-baseurl={PROVIDER_BY_ID.get(dipilih)?.baseUrl}
                  onClick={() => {
                    pakai(m.id);
                    setOpen(false);
                  }}
                >
                  <ProviderLogo id={dipilih} size={16} />
                  <span className="ai-mi-main">
                    <span className="ai-mi-name">{m.label}</span>
                    <span className="ai-mi-sub">{m.sub}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
