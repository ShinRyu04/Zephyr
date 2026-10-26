import { useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { tx } from '../../lib/i18n';
import FileIcon from './FileIcon';

export default function EditorTabBar({ gid, tanpaTabBaru = false }: { gid?: string; tanpaTabBaru?: boolean }) {
  const tabsAll = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const requestCloseTab = useStore((s) => s.requestCloseTab);
  const reorderTab = useStore((s) => s.reorderTab);
  const newUntitled = useStore((s) => s.newUntitled);
  const promoteTab = useStore((s) => s.promoteTab);
  const togglePin = useStore((s) => s.togglePin);

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
            /*
             * `is-preview` renders the name in italics — the universal signal
             * for "this slot is not yours yet". `is-pinned` marks a tab the
             * reader has fixed in place.
             */
            className={`tab${t.id === activeTabId ? ' is-active' : ''}${
              dragOver === i ? ' is-dragover' : ''
            }${t.preview ? ' is-preview' : ''}${t.pinned ? ' is-pinned' : ''}`}
            data-preview={t.preview ? '1' : undefined}
            data-pinned={t.pinned ? '1' : undefined}
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
            /*
             * Double-click promotes. A preview is a look; the second click is
             * the reader saying they mean to stay, and it is the gesture the
             * reference editors train — so it works here without having to be
             * learned again.
             */
            onDoubleClick={() => promoteTab(t.id)}
            /*
             * Middle-click pins, matching the gesture for pinning a browser
             * tab. Delete-on-the-keyboard deliberately does NOT unpin: "close"
             * and "unpin" are different intentions and one key should not
             * express both.
             */
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                togglePin(t.id);
                return;
              }
              if (e.button === 2) return;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTab(t.id);
              } else if (e.key === 'Delete' || e.key === 'Backspace') {

                e.preventDefault();
                requestCloseTab(t.id);
              }
            }}
          >
            {t.view === 'browser' ? (
              /*
               * The Browser tab gets the globe rather than a file glyph: the
               * name is "Browser", there is no path, and `FileIcon` would fall
               * through to its quiet-dot fallback - the one mark that says
               * nothing about what the tab is.
               */
              <svg
                className="tab-globe"
                viewBox="0 0 16 16"
                width={14}
                height={14}
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M2.4 8h11.2M8 2.4c1.7 1.6 2.6 3.5 2.6 5.6S9.7 12 8 13.6C6.3 12 5.4 10.1 5.4 8S6.3 4 8 2.4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            ) : (
              <FileIcon lang={t.lang} name={t.name} />
            )}
            <span className="tab-name">{t.name}</span>
            {t.pinned && (
              <span className="tab-pin" title={tx('Pinned')} aria-hidden="true">
                📌
              </span>
            )}
            {t.unsaved && <span className="tab-dot" title={tx('Not saved')} aria-hidden="true" />}
            {/* PHASE 31: the ✕ button was replaced with a <span>.
                ARIA forbids `role="tab"` from having interactive descendants, and
                `tabIndex={-1}` is NOT enough - axe: "a negative tabindex on an
                element inside an interactive control does not prevent
                assistive technologies from focusing the element". So the
                element really must not be interactive: <span> + aria-hidden,
                the click still works for the mouse, the keyboard uses
                Delete/Backspace on its tab (see onKeyDown). */}
            <span
              className="tab-close"
              title={tx('common.close')}
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

      {!tanpaTabBaru && (
        <button className="tabbar-new" title="New tab (Ctrl+N)" aria-label="New tab" onClick={newUntitled}>
          ＋
        </button>
      )}
    </div>
  );
}
