// EditorTabBar.tsx — bar tab: ikon tipe file, nama, titik dirty, tombol x,
// scroll horizontal, drag-swap urutan, tombol tab baru (+).

import { useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import FileIcon from './FileIcon';

export default function EditorTabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const requestCloseTab = useStore((s) => s.requestCloseTab);
  const reorderTab = useStore((s) => s.reorderTab);
  const newUntitled = useStore((s) => s.newUntitled);

  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  if (tabs.length === 0) return null;

  return (
    <div className="tabbar" role="tablist" aria-label="Tab editor">
      <div className="tabbar-scroll">
        {tabs.map((t, i) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeTabId}
            tabIndex={0}
            title={t.path ?? t.name}
            className={`tab${t.id === activeTabId ? ' is-active' : ''}${dragOver === i ? ' is-dragover' : ''}`}
            draggable
            onDragStart={() => {
              dragFrom.current = i;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(i);
            }}
            onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragFrom.current !== null) reorderTab(dragFrom.current, i);
              dragFrom.current = null;
              setDragOver(null);
            }}
            onDragEnd={() => {
              dragFrom.current = null;
              setDragOver(null);
            }}
            onClick={() => setActiveTab(t.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTab(t.id);
              }
            }}
            onAuxClick={(e) => {
              // klik tengah = tutup (PRD A2)
              if (e.button === 1) {
                e.preventDefault();
                requestCloseTab(t.id);
              }
            }}
          >
            <FileIcon lang={t.lang} />
            <span className="tab-name">{t.name}</span>
            {t.unsaved && <span className="tab-dot" title="Belum disimpan" aria-hidden="true" />}
            <button
              className="tab-close"
              title="Tutup"
              aria-label={`Tutup ${t.name}`}
              onClick={(e) => {
                e.stopPropagation();
                requestCloseTab(t.id);
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button className="tabbar-new" title="Tab baru (Ctrl+N)" aria-label="Tab baru" onClick={newUntitled}>
        ＋
      </button>
    </div>
  );
}
