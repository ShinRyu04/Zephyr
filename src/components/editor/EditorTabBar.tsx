import { useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import FileIcon from './FileIcon';

export default function EditorTabBar({ gid }: { gid?: string }) {
  const tabsAll = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const requestCloseTab = useStore((s) => s.requestCloseTab);
  const reorderTab = useStore((s) => s.reorderTab);
  const newUntitled = useStore((s) => s.newUntitled);

  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const tabs = gid ? tabsAll.filter((t) => t.groupId === gid) : tabsAll;

  if (tabs.length === 0) return null;

  return (
    
    <div className="tabbar">
      <div className="tabbar-scroll" role="tablist" aria-label="Tab editor">
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
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                
                e.preventDefault();
                requestCloseTab(t.id);
              }
            }}
            onAuxClick={(e) => {
              
              if (e.button === 1) {
                e.preventDefault();
                requestCloseTab(t.id);
              }
            }}
          >
            <FileIcon lang={t.lang} name={t.name} />
            <span className="tab-name">{t.name}</span>
            {t.unsaved && <span className="tab-dot" title="Belum disimpan" aria-hidden="true" />}
            {/* FASE 31: tombol ✕ diganti <span>.
                ARIA melarang `role="tab"` punya keturunan interaktif, dan
                `tabIndex={-1}` TIDAK cukup — axe: "a negative tabindex on an
                element inside an interactive control does not prevent
                assistive technologies from focusing the element". Jadi
                elemennya memang tidak boleh interaktif: <span> + aria-hidden,
                klik tetap jalan untuk mouse, keyboard memakai
                Delete/Backspace di tab-nya (lihat onKeyDown). */}
            <span
              className="tab-close"
              title="Tutup"
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                requestCloseTab(t.id);
              }}
            >
              ✕
            </span>
          </div>
        ))}
      </div>

      <button className="tabbar-new" title="Tab baru (Ctrl+N)" aria-label="Tab baru" onClick={newUntitled}>
        ＋
      </button>
    </div>
  );
}
