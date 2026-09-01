// ContextMenu.tsx — menu konteks kustom untuk FileTree (bukan menu native).
// Ditutup oleh klik di luar, Escape, atau scroll.

import { useEffect, useRef } from 'react';
import { useExplorer } from '../../lib/explorerStore';

const dirOfPath = (p: string) => p.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]+$/, '');

export default function ContextMenu() {
  const menu = useExplorer((s) => s.ctxMenu);
  const selected = useExplorer((s) => s.selected);
  const close = useExplorer((s) => s.closeCtxMenu);
  const startInline = useExplorer((s) => s.startInline);
  const deletePaths = useExplorer((s) => s.deletePaths);
  const reveal = useExplorer((s) => s.reveal);
  const copyPath = useExplorer((s) => s.copyPath);
  const toggleExpand = useExplorer((s) => s.toggleExpand);
  const expanded = useExplorer((s) => s.expanded);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu, close]);

  if (!menu) return null;

  // Folder tujuan untuk item baru: folder yang diklik, atau induk file.
  const parentDir = menu.isDir ? menu.path : dirOfPath(menu.path);
  const targets = selected.includes(menu.path) ? selected : [menu.path];

  // Jaga menu tetap di dalam viewport.
  const x = Math.min(menu.x, window.innerWidth - 210);
  const y = Math.min(menu.y, window.innerHeight - 240);

  const newItem = async (kind: 'new-file' | 'new-folder') => {
    // Pastikan folder tujuan terbuka supaya input inline-nya terlihat.
    if (menu.isDir && !expanded[menu.path]) await toggleExpand(menu.path);
    startInline({
      kind,
      target: parentDir,
      initial: kind === 'new-file' ? 'file-baru.txt' : 'folder-baru',
    });
  };

  const confirmDelete = () => {
    const label =
      targets.length > 1 ? `${targets.length} item` : `"${targets[0].split(/[\\/]/).pop()}"`;
    if (window.confirm(`Hapus ${label} secara permanen? Tindakan ini tidak bisa dibatalkan.`)) {
      void deletePaths(targets);
    } else {
      close();
    }
  };

  return (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }} role="menu">
      <button className="ctx-item" role="menuitem" onClick={() => void newItem('new-file')}>
        New File
      </button>
      <button className="ctx-item" role="menuitem" onClick={() => void newItem('new-folder')}>
        New Folder
      </button>
      <div className="ctx-sep" />
      <button
        className="ctx-item"
        role="menuitem"
        onClick={() =>
          startInline({
            kind: 'rename',
            target: menu.path,
            initial: menu.path.split(/[\\/]/).pop() ?? '',
          })
        }
      >
        Rename <span className="ctx-key">F2</span>
      </button>
      <button className="ctx-item ctx-danger" role="menuitem" onClick={confirmDelete}>
        Delete <span className="ctx-key">Del</span>
      </button>
      <div className="ctx-sep" />
      <button className="ctx-item" role="menuitem" onClick={() => void reveal(menu.path)}>
        Reveal in Explorer
      </button>
      <button className="ctx-item" role="menuitem" onClick={() => void copyPath(menu.path)}>
        Copy Path
      </button>
    </div>
  );
}
