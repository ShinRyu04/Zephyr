// ModelSelector.tsx — dropdown model dengan LOGO BRAND (fase 09).
//
// Isi dropdown dari lib/modelCatalog (satu sumber kebenaran, dipakai juga
// oleh Settings → Model AI). Setiap baris: logo + nama model + provider +
// ukuran konteks + badge key. Provider tanpa key tetap bisa dipilih supaya
// user melihat status oranye + tombol ke Settings (V2), bukan model hilang.
// Provider `freeText` (custom/local/deepseek) menampilkan input teks di atas
// daftar supaya user bisa mengetik nama model bebas; nama yang pernah diketik
// disimpan per provider (localStorage) dan tampil sebagai daftar pilihan,
// plus model terbaru ditarik langsung dari provider (list_models). Daftar
// lengkap katalog SELALU tampil di bawahnya supaya dari mana pun bisa balik
// ke provider lain.

import { useEffect, useRef, useState } from 'react';
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
  PROVIDER_BY_ID,
  ProviderLogo,
} from '../../lib/modelCatalog';

/** Nama model yang pernah diketik user per provider (custom/local). */
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

export default function ModelSelector() {
  const tr = useT();
  const model = useAi((s) => s.model);
  const provider = useAi((s) => s.provider);
  const open = useAi((s) => s.modelMenuOpen);
  const keys = useAi((s) => s.keys);
  const setOpen = useAi((s) => s.setModelMenuOpen);
  const setModel = useAi((s) => s.setModel);
  const setActivity = useStore((s) => s.setActivity);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [typed, setTyped] = useState('');
  const [saved, setSaved] = useState<Record<string, string[]>>(loadSaved);
  // Model hasil fetch langsung dari provider (list_models).
  const [remote, setRemote] = useState<Record<string, string[]>>({});
  const [fetching, setFetching] = useState(false);

  const active = findModel(model, provider);
    const freeText = PROVIDER_BY_ID.get(provider)?.freeText === true;
    const hasKey = keys.some((k) => k.provider === provider && k.hasKey);
    // JANGAN memakai selector yang mengembalikan objek/array baru di sini
    // (zustand v5 membandingkan hasil selector dengan ===): mis.
    //   useStore((s) => s.settings.models.providers[provider])   // objek baru
    //   useSettingsUi((s) => s.remoteModels[provider] ?? [])     // array baru
    // Keduanya memicu render loop -> "Maximum update depth exceeded" -> React
    // unmount seluruh tree -> layar hitam total begitu panel AI dibuka.
    // Ambil lewat getState() di dalam function; selector di bawah hanya
    // mengambil referensi stabil (=bukan "dipakai sebagai nilai render").
    const baseUrl =
      (useStore.getState().settings.models.providers ?? {})[provider]?.baseUrl || active.baseUrl;

  // Klik di luar / Escape menutup dropdown.
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

  // Setiap kali menu dibuka, isi input dengan model aktif (kalau model itu
  // bukan preset, biarkan user melanjutkan ketikannya).
  useEffect(() => {
    if (open) setTyped(freeText && !MODEL_BY_ID.has(model) ? model : '');
  }, [open, freeText, model]);

  /** Tarik daftar model langsung dari provider (list_models, Rust). */
  const loadRemote = async () => {
    if (fetching) return;
    setFetching(true);
    try {
      const ids = await cmd.listModels(provider, baseUrl || undefined);
      setRemote((r) => ({ ...r, [provider]: ids }));
    } catch {
      /* tanpa key / offline — daftar tersimpan tetap tampil */
    } finally {
      setFetching(false);
    }
  };

  // Saat menu dibuka dan provider punya key, ambil model terbaru dari
  // provider — berlaku untuk SEMUA provider (bukan cuma freeText).
  useEffect(() => {
    if (open && hasKey) void loadRemote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  const commitTyped = (close?: boolean) => {
    const v = typed.trim();
    if (!v) return;
    void setModel(v);
    // Simpan ke daftar model custom provider ini (tanpa duplikat).
    setSaved((s) => {
      const list = s[provider] ?? [];
      const next = list.includes(v) ? list : [...list, v];
      const out = { ...s, [provider]: next };
      try {
        localStorage.setItem(LS_SAVED, JSON.stringify(out));
      } catch {
        /* kuota penuh — daftar tetap di memori */
      }
      return out;
    });
    if (close) setOpen(false);
  };

  const savedList = saved[provider] ?? [];
    // Model live dari provider: cache lokal menu ini + cache global (terisi
    // otomatis saat key disimpan di Settings, mis. OpenRouter).
    // `remoteModels` diambil polos (referensi objek stabil) — jangan pakai
    // `?? []` di sini karena selector itu membuat ARRAY BARU tiap render
    // (aturan zustand v5, lihat catatan baseUrl di atas).
    const uiRemoteList = useSettingsUi((s) => s.remoteModels)[provider] ?? [];
    const remoteList = [...remote[provider] ?? [], ...uiRemoteList].filter(
      (id, i, a) => id && a.indexOf(id) === i,
    );

  return (
    <div className="ai-model-wrap" ref={wrap}>
      <button
        className="ai-model-btn"
        data-testid="ai-model-btn"
        data-model={active.id}
        data-provider={active.provider}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${active.providerLabel} — ${baseUrl || tr('base URL belum diisi')}`}
        onClick={() => setOpen(!open)}
      >
        <ProviderLogo id={active.provider} size={15} />
        <span className="ai-model-name">{active.label}</span>
        <svg viewBox="0 0 16 16" className="ai-chev" aria-hidden="true">
          <path d="M4 6.5l4 3.5 4-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>

      {/* Status key provider aktif: hijau = siap, oranye = belum ada key. */}
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
          setActivity('settings');
          setSettingsOpen(true);
          if (!useStore.getState().sidebarVisible) useStore.getState().toggleSidebar();
          // Buka langsung section Models.
          void import('../../lib/settingsStore').then(({ useSettingsUi }) =>
            useSettingsUi.getState().setSection('models'),
          );
        }}
      >
        <span className="ai-dot" aria-hidden="true" />
        {hasKey ? 'key siap' : 'isi key'}
      </button>

      {open && (
        <div className="ai-model-menu" role="listbox" data-testid="ai-model-menu">
          {freeText && (
            <div className="ai-model-typed">
              <input
                type="text"
                className="ai-model-input"
                data-testid="ai-model-input"
                placeholder="Ketik nama model… (Enter)"
                value={typed}
                spellCheck={false}
                autoFocus
                onChange={(e) => setTyped(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitTyped(true);
                                }}
                              />
              <button
                type="button"
                className="ai-model-refresh"
                data-testid="ai-model-refresh"
                disabled={fetching}
                title="Ambil daftar model terbaru dari provider"
                onClick={() => void loadRemote()}
              >
                {fetching ? '…' : '↻'}
              </button>
            </div>
          )}

          {/* Model live dari provider (otomatis saat key disimpan + Refresh):
              tampil untuk SEMUA provider, bukan cuma freeText — Groq, xAI,
              Mistral, Cerebras, dan OpenRouter ikut dapat daftar live-nya. */}
          {remoteList.length > 0 && (
            <>
              <div className="ai-model-group">Dari provider (API)</div>
              {remoteList
                .filter((id) => !MODEL_BY_ID.has(id))
                .map((id) => (
                  <button
                    key={`api:${id}`}
                    role="option"
                    aria-selected={id === active.id}
                    className={`ai-model-item${id === active.id ? ' is-active' : ''}`}
                    data-model-item={id}
                    data-provider={provider}
                    onClick={() => void setModel(id)}
                  >
                    <ProviderLogo id={provider} size={16} />
                    <span className="ai-mi-main">
                      <span className="ai-mi-name">{id}</span>
                      <span className="ai-mi-sub">dari {provider} · API</span>
                    </span>
                  </button>
                ))}
            </>
          )}

          {/* Bagian khusus provider freeText: input ketik + yang tersimpan. */}
          {freeText && (
            <>
              {savedList.length > 0 && (
                <>
                  <div className="ai-model-group">Tersimpan</div>
                  {savedList.map((id) => (
                    <button
                      key={`sv:${id}`}
                      role="option"
                      aria-selected={id === active.id}
                      className={`ai-model-item${id === active.id ? ' is-active' : ''}`}
                      data-model-item={id}
                      data-provider={provider}
                      onClick={() => void setModel(id)}
                    >
                      <ProviderLogo id={provider} size={16} />
                      <span className="ai-mi-main">
                        <span className="ai-mi-name">{id}</span>
                        <span className="ai-mi-sub">tersimpan untuk {provider}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {remoteList.length === 0 && savedList.length === 0 && (
                <div className="ai-model-empty">
                  Belum ada model — ketik nama model di atas, atau pastikan API
                  key & base URL provider sudah diisi lalu klik ↻.
                </div>
              )}
              <div className="ai-model-group">Semua provider</div>
            </>
          )}

          {/* Daftar lengkap katalog — SELALU tampil, supaya dari provider
              freeText (custom/local/deepseek) tetap bisa balik ke provider
              lain dengan mengklik modelnya. */}
          {ALL_MODELS.map((m) => {
            const ok = keys.some((k) => k.provider === m.provider && k.hasKey);
            return (
              <button
                key={`${m.provider}:${m.id}`}
                role="option"
                aria-selected={m.id === active.id}
                className={`ai-model-item${m.id === active.id ? ' is-active' : ''}`}
                data-model-item={m.id}
                data-provider={m.provider}
                data-baseurl={m.baseUrl}
                onClick={() => void setModel(m.id)}
              >
                <ProviderLogo id={m.provider} size={16} />
                <span className="ai-mi-main">
                  <span className="ai-mi-name">{m.label}</span>
                  <span className="ai-mi-sub">
                    {PROVIDER_BY_ID.get(m.provider)?.label}
                    {m.ctx ? ` · ${fmtCtx(m.ctx)}` : ''}
                    {m.note ? ` · ${m.note}` : ''}
                  </span>
                </span>
                <span className={`ai-mi-key${ok ? ' is-ok' : ''}`}>{ok ? 'key' : '—'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}