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
  terminal: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.2 6l2 2-2 2M8.4 10h3.4" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  ),
  settings: () => (
    <svg viewBox="0 0 16 16" className="ab-icon" aria-hidden="true">
      <circle cx="8" cy="8" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 1.6v1.8M8 12.6v1.8M14.4 8h-1.8M3.4 8H1.6M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3M12.5 12.5l-1.3-1.3M4.8 4.8L3.5 3.5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  ),
};

const LABEL: Record<ActivityId, string> = {
  explorer: 'Explorer',
  search: 'Search',
  scm: 'Source Control',
  ai: 'AI / MCP',
  terminal: 'Terminal',
  settings: 'Settings',
};

const ORDER: ActivityId[] = ['explorer', 'search', 'scm', 'ai', 'terminal', 'settings'];

export default function ActivityBar() {
  const activity = useStore((s) => s.activity);
  const sidebarVisible = useStore((s) => s.sidebarVisible);
  const setActivity = useStore((s) => s.setActivity);
  const toggleSidebar = useStore((s) => s.toggleSidebar);

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
            onClick={() => {
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
