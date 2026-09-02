// ModelSelector.tsx — dropdown model dengan LOGO BRAND (fase 09).
//
// Isi dropdown dari lib/modelCatalog (satu sumber kebenaran, dipakai juga
// oleh Settings → Model AI). Setiap baris: logo + nama model + provider +
// ukuran konteks + badge key. Provider tanpa key tetap bisa dipilih supaya
// user melihat status oranye + tombol ke Settings (V2), bukan model hilang.

import { useEffect, useRef } from 'react';
import { useAi } from '../../lib/aiStore';
import { useStore } from '../../lib/store';
import { ALL_MODELS, fmtCtx, findModel, PROVIDER_BY_ID, ProviderLogo } from '../../lib/modelCatalog';

export default function ModelSelector() {
  const model = useAi((s) => s.model);
  const provider = useAi((s) => s.provider);
  const open = useAi((s) => s.modelMenuOpen);
  const keys = useAi((s) => s.keys);
  const setOpen = useAi((s) => s.setModelMenuOpen);
  const setModel = useAi((s) => s.setModel);
  const setActivity = useStore((s) => s.setActivity);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const wrap = useRef<HTMLDivElement | null>(null);

  const active = findModel(model, provider);
  const hasKey = keys.some((k) => k.provider === provider && k.hasKey);
  const baseUrl =
    useStore((s) => s.settings.models.providers[provider]?.baseUrl) || active.baseUrl;

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

  return (
    <div className="ai-model-wrap" ref={wrap}>
      <button
        className="ai-model-btn"
        data-testid="ai-model-btn"
        data-model={active.id}
        data-provider={active.provider}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${active.providerLabel} — ${baseUrl || 'base URL belum diisi'}`}
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
