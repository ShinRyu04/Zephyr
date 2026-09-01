// Breadcrumbs.tsx — jalur file aktif di atas editor. Klik segmen folder
// membukanya di Explorer; klik segmen terakhir memfokuskan editor.

import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { getActiveView } from '../../lib/editorRegistry';

export default function Breadcrumbs() {
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);
  const workspace = useStore((s) => s.workspace);
  const setActivity = useStore((s) => s.setActivity);
  const toggleExpand = useExplorer((s) => s.toggleExpand);
  const expanded = useExplorer((s) => s.expanded);

  if (!tab) return null;

  // Untitled: tampilkan nama saja.
  if (!tab.path) {
    return (
      <nav className="breadcrumbs" aria-label="Lokasi file">
        <span className="bc-seg bc-last">{tab.name}</span>
      </nav>
    );
  }

  const full = tab.path;
  const rel =
    workspace && full.toLowerCase().startsWith(workspace.toLowerCase())
      ? full.slice(workspace.length).replace(/^[\\/]+/, '')
      : full;
  const parts = rel.split(/[\\/]/).filter(Boolean);

  // Path absolut per segmen, untuk expand folder di tree.
  const base = workspace && rel !== full ? workspace : '';
  const pathAt = (i: number) =>
    base ? [base, ...parts.slice(0, i + 1)].join('\\') : parts.slice(0, i + 1).join('\\');

  return (
    <nav className="breadcrumbs" aria-label="Lokasi file">
      {workspace && rel !== full && (
        <>
          <button
            className="bc-seg"
            title={workspace}
            onClick={() => setActivity('explorer')}
          >
            {workspace.replace(/[\\/]+$/, '').split(/[\\/]/).pop()}
          </button>
          <span className="bc-sep">/</span>
        </>
      )}
      {parts.map((p, i) => {
        const isLast = i === parts.length - 1;
        return (
          <span key={`${p}-${i}`} className="bc-item">
            {isLast ? (
              <button className="bc-seg bc-last" onClick={() => getActiveView()?.focus()}>
                {p}
              </button>
            ) : (
              <>
                <button
                  className="bc-seg"
                  title={pathAt(i)}
                  onClick={() => {
                    setActivity('explorer');
                    const dir = pathAt(i);
                    if (!expanded[dir]) void toggleExpand(dir);
                  }}
                >
                  {p}
                </button>
                <span className="bc-sep">/</span>
              </>
            )}
          </span>
        );
      })}
    </nav>
  );
}
