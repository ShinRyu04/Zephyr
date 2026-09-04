// SettingsNav.tsx — daftar 11 section + tombol Reset Semua.
//
// Letaknya di SIDEBAR KIRI (bukan di dalam halaman): halaman Settings
// sempat punya nav sendiri sehingga daftar section tampil dua kali dan
// memakan lebar area isi. Sekarang satu-satunya nav ada di sini.

import { useStore } from '../../lib/store';
import { SECTION_ORDER, useSettingsUi, type SectionId } from '../../lib/settingsStore';
import { useT } from '../../lib/i18n';
import * as cmd from '../../lib/commands';

const NAV_KEY: Record<SectionId, string> = {
  general: 'settings.general',
  editor: 'settings.editor',
  theme: 'settings.theme',
  shortcuts: 'settings.shortcuts',
  models: 'settings.models',
  agents: 'settings.agents',
  extensions: 'settings.extensions',
  lsp: 'settings.lsp',
  scm: 'settings.scm',
  mcp: 'settings.mcp',
  security: 'settings.security',
  ssh: 'settings.ssh',
  about: 'settings.about',
};

export function NavIcon({ id }: { id: SectionId }) {
  const p = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none' as const };
  const st = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const };
  switch (id) {
    case 'general':
      return (
        <svg {...p}>
          <circle cx="8" cy="8" r="2.2" {...st} />
          <path
            d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1"
            {...st}
          />
        </svg>
      );
    case 'editor':
      return (
        <svg {...p}>
          <path d="M5.5 4.5L2.5 8l3 3.5M10.5 4.5L13.5 8l-3 3.5" {...st} />
        </svg>
      );
    case 'theme':
      return (
        <svg {...p}>
          <circle cx="8" cy="8" r="5.4" {...st} />
          <path d="M8 2.6v10.8" {...st} />
          <path d="M8 2.6a5.4 5.4 0 010 10.8z" fill="currentColor" opacity="0.35" />
        </svg>
      );
    case 'shortcuts':
      return (
        <svg {...p}>
          <rect x="1.8" y="4.4" width="12.4" height="7.2" rx="1.6" {...st} />
          <path d="M4.4 7h.01M6.6 7h.01M8.8 7h.01M11 7h.01M5.4 9.4h5.2" {...st} />
        </svg>
      );
    case 'models':
      return (
        <svg {...p}>
          <path
            d="M8 2.2c.6 2.6 2.2 4.2 4.8 4.8-2.6.6-4.2 2.2-4.8 4.8-.6-2.6-2.2-4.2-4.8-4.8C5.8 6.4 7.4 4.8 8 2.2z"
            {...st}
          />
          <circle cx="12.2" cy="12.4" r="1.4" {...st} />
        </svg>
      );
    case 'agents':
      return (
        <svg {...p}>
          <rect x="3" y="5" width="10" height="7.4" rx="1.8" {...st} />
          <path d="M8 5V2.8M5.8 8.6h.01M10.2 8.6h.01" {...st} />
        </svg>
      );
    case 'extensions':
      return (
        <svg {...p}>
          <path
            d="M6.4 2.6h3.2v2.2a1.4 1.4 0 102.2 1.2h1.6v3.2H11a1.4 1.4 0 10-1.4 2.2v1.6H6.4v-1.8a1.4 1.4 0 10-1.2-2.2H2.6V6.4h2.2a1.4 1.4 0 101.6-1.6z"
            {...st}
          />
        </svg>
      );
    case 'lsp':
      // Ikon "kode cerdas": kurung kurawal + kilat kecil.
      return (
        <svg {...p}>
          <path d="M6 3.2C4.2 3.6 4.6 7 3.2 8c1.4 1 1 4.4 2.8 4.8" {...st} />
          <path d="M10 3.2c1.8.4 1.4 3.8 2.8 4.8-1.4 1-1 4.4-2.8 4.8" {...st} />
          <path d="M8.4 5.8 6.9 8.3h2.2L7.6 10.6" {...st} />
        </svg>
      );
    case 'scm':
      return (
        <svg {...p}>
          <circle cx="4.6" cy="4" r="1.8" {...st} />
          <circle cx="4.6" cy="12" r="1.8" {...st} />
          <circle cx="11.4" cy="8" r="1.8" {...st} />
          <path d="M4.6 5.8v4.4M6.2 4.6c3 0 3.4 1.8 3.4 3" {...st} />
        </svg>
      );
    case 'mcp':
      return (
        <svg {...p}>
          <path d="M2.6 11.4V6.2a2 2 0 012-2h6.8a2 2 0 012 2v5.2" {...st} />
          <path d="M5.4 11.4V7.6M8 11.4V6.8M10.6 11.4V8.4" {...st} />
        </svg>
      );
    case 'security':
      // Gembok: keamanan, bukan "shield" — shield sudah dipakai dialog Trust.
      return (
        <svg {...p}>
          <rect x="3.4" y="7.2" width="9.2" height="6.2" rx="1.2" {...st} />
          <path d="M5.8 7.2V5.4a2.2 2.2 0 014.4 0v1.8" {...st} />
          <path d="M8 9.6v1.6" {...st} />
        </svg>
      );
    case 'ssh':
      return (
        <svg {...p}>
          <rect x="2.4" y="3" width="11.2" height="4" rx="1.2" {...st} />
          <rect x="2.4" y="9" width="11.2" height="4" rx="1.2" {...st} />
          <path d="M4.8 5h.01M4.8 11h.01" {...st} />
        </svg>
      );
    case 'about':
      return (
        <svg {...p}>
          <circle cx="8" cy="8" r="5.6" {...st} />
          <path d="M8 7.2v3.6M8 5.2h.01" {...st} />
        </svg>
      );
  }
}

export default function SettingsNav() {
  const t = useT();
  const section = useSettingsUi((s) => s.section);
  const setSection = useSettingsUi((s) => s.setSection);
  const resetStage = useSettingsUi((s) => s.resetStage);
  const setResetStage = useSettingsUi((s) => s.setResetStage);
  const setMessage = useSettingsUi((s) => s.setMessage);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const reloadSettings = useStore((s) => s.reloadSettings);

  const doReset = async () => {
    try {
      await cmd.resetSettings();
      await reloadSettings();
      setResetStage(0);
      setMessage('Semua setting dikembalikan ke default (API key TIDAK dihapus)');
    } catch (e) {
      setMessage(cmd.asZephyrError(e).message);
    }
  };

  return (
    <nav className="set-nav" aria-label={t('settings.title')}>
      <div className="side-title set-nav-title">{t('settings.title')}</div>

      {SECTION_ORDER.map((id) => (
        <button
          key={id}
          className={`set-nav-item${section === id && settingsOpen ? ' is-active' : ''}`}
          data-testid={`set-nav-${id}`}
          aria-current={section === id && settingsOpen}
          onClick={() => {
            setSection(id);
            setSettingsOpen(true);
          }}
        >
          <NavIcon id={id} />
          <span>{t(NAV_KEY[id])}</span>
        </button>
      ))}

      <div className="set-nav-foot">
        {resetStage === 0 && (
          <button
            className="btn btn-danger btn-block"
            data-testid="set-reset"
            onClick={() => setResetStage(1)}
          >
            {t('settings.resetAll')}
          </button>
        )}
        {resetStage === 1 && (
          <div className="set-confirm" data-testid="set-reset-c1">
            <p>Semua setting kembali ke default. API key tidak dihapus. Lanjut?</p>
            <div className="set-confirm-row">
              <button className="btn btn-sm" onClick={() => setResetStage(0)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-sm btn-danger"
                data-testid="set-reset-yes1"
                onClick={() => setResetStage(2)}
              >
                Lanjut
              </button>
            </div>
          </div>
        )}
        {resetStage === 2 && (
          <div className="set-confirm" data-testid="set-reset-c2">
            <p>Yakin? Tema, shortcut, dan semua preferensi akan hilang.</p>
            <div className="set-confirm-row">
              <button className="btn btn-sm" onClick={() => setResetStage(0)}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-sm btn-danger"
                data-testid="set-reset-yes2"
                onClick={() => void doReset()}
              >
                Reset sekarang
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
