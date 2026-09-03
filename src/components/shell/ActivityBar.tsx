// ActivityBar.tsx — ikon vertikal kiri (48px). State aktif di Zustand.

import { useStore } from '../../lib/store';
import type { ActivityId } from '../../lib/types';

const Icons: Record<ActivityId, () => JSX.Element> = {
  explorer: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path d="M1.5 3.5A1.5 1.5 0 013 2h3l1.2 1.5H13A1.5 1.5 0 0114.5 5v7A1.5 1.5 0 0113 13.5H3A1.5 1.5 0 011.5 12V3.5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  search: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <circle cx="6.8" cy="6.8" r="4.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.2 10.2l3.6 3.6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  ),
  scm: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <circle cx="4" cy="3.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="12.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="8" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 5.3v5.4M5.8 11.4C9 11 10.2 9.8 10.4 8.4" stroke="currentColor" strokeWidth="1.3" fill="none" />
    </svg>
  ),
  ai: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path d="M8 1.8l1.6 3.4 3.6.5-2.6 2.6.6 3.7L8 10.3l-3.2 1.7.6-3.7L2.8 5.7l3.6-.5L8 1.8z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  debug: () => (
    // Tombol play di dalam bug: bentuk LITERAL (Run & Debug), bukan garis
    // abstrak — ikon harus bisa dikenali dari bentuknya.
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <circle cx="8" cy="8.4" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {/* kaki-kaki bug */}
      <path
        d="M3.6 8.4H1.7M12.4 8.4h1.9M4.6 5.4L3.2 4M11.4 5.4L12.8 4M4.6 11.4L3.2 12.8M11.4 11.4l1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* play di tengah */}
      <path d="M6.9 6.6l3 1.8-3 1.8z" fill="currentColor" />
    </svg>
  ),
  terminal: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.2 6l2 2-2 2M8.4 10h3.4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  ),
  extensions: () => (
    // Empat kotak, satu terpisah — sama seperti VS Code (prompt 19.1).
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <rect x="1.8" y="1.8" width="5.2" height="5.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.8" y="9" width="5.2" height="5.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5.2" height="5.2" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {/* kotak keempat "lepas": digeser + garis putus-putus */}
      <rect
        x="9.6"
        y="1.2"
        width="5.2"
        height="5.2"
        rx="0.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeDasharray="2 1.4"
      />
    </svg>
  ),
  settings: () => (
    // Gerigi (gear) 8 gigi — geometri dihitung dari lingkaran R=7/r=5.15,
    // bukan pola "matahari" (garis lurus memancar) seperti sebelumnya.
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <path
        d="M6.72 1.12L9.28 1.12L8.94 2.94L10.92 3.76L11.96 2.23L13.77 4.04L12.24 5.08L13.06 7.06L14.88 6.72L14.88 9.28L13.06 8.94L12.24 10.92L13.77 11.96L11.96 13.77L10.92 12.24L8.94 13.06L9.28 14.88L6.72 14.88L7.06 13.06L5.08 12.24L4.04 13.77L2.23 11.96L3.76 10.92L2.94 8.94L1.12 9.28L1.12 6.72L2.94 7.06L3.76 5.08L2.23 4.04L4.04 2.23L5.08 3.76L7.06 2.94Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
};

const LABEL: Record<ActivityId, string> = {
  explorer: 'Explorer',
  search: 'Search',
  scm: 'Source Control',
  debug: 'Run & Debug (Ctrl+Shift+D)',
  ai: 'AI / MCP',
  terminal: 'Terminal',
  extensions: 'Extensions (Ctrl+Shift+X)',
  settings: 'Settings',
};

// Extensions di BAWAH daftar (prompt 19.1), tepat sebelum Settings.
// Run & Debug tepat setelah Source Control, seperti VS Code.
const ORDER: ActivityId[] = [
  'explorer',
  'search',
  'scm',
  'debug',
  'ai',
  'terminal',
  'extensions',
  'settings',
];

export default function ActivityBar() {
  const activity = useStore((s) => s.activity);
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const setActivity = useStore((s) => s.setActivity);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);

  return (
    <nav className="activitybar" aria-label="Activity Bar">
      {ORDER.map((id) => {
        const Icon = Icons[id];
        const isActive = activity === id && sidebarVisible;
        return (
          <button
            key={id}
            className={`ab-btn${isActive ? ' is-active' : ''}`}
            title={LABEL[id]}
            aria-label={LABEL[id]}
            aria-pressed={isActive}
            data-activity={id}
            onClick={() => {
              // Settings punya halaman di area utama + nav di sidebar, tapi
              // perilaku tombolnya sama seperti ikon lain: klik = buka,
              // klik lagi (saat sedang aktif) = tutup.
              if (id === 'settings') {
                if (activity === 'settings' && sidebarVisible) {
                  toggleSidebar();
                  setSettingsOpen(false);
                } else {
                  setActivity('settings');
                  setSettingsOpen(true);
                  if (!sidebarVisible) toggleSidebar();
                }
                return;
              }
              setSettingsOpen(false);
              // klik ikon aktif = toggle sidebar (perilaku VS Code)
              if (activity === id) toggleSidebar();
              else {
                setActivity(id);
                if (!sidebarVisible) toggleSidebar();
              }
            }}
          >
            <Icon />
            {isActive && <span className="ab-indicator" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}
