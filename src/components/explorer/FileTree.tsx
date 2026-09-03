// FileTree.tsx — tree Explorer: expand/collapse, multi-select, context menu,
// rename inline, drag-drop pindah file. Node dirender flat (hasil traverse)
// supaya jumlah elemen DOM sebanding dengan yang benar-benar terlihat.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { detectLang } from '../../lib/lang';
import FileIcon from '../editor/FileIcon';
import type { DirNode } from '../../lib/types';

interface Row {
  node: DirNode;
  depth: number;
}

const INDENT = 12;

/** Susun daftar baris yang terlihat dari peta children + status expanded. */
function buildRows(
  root: string,
  children: Record<string, DirNode[]>,
  expanded: Record<string, boolean>,
): Row[] {
  const rows: Row[] = [];
  const walk = (dir: string, depth: number) => {
    for (const node of children[dir] ?? []) {
      rows.push({ node, depth });
      if (node.isDir && expanded[node.path]) walk(node.path, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`tree-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
      <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        d={
          open
            ? 'M1.5 4.2A1.2 1.2 0 012.7 3h3l1.2 1.5h5.4a1.2 1.2 0 011.2 1.2v.6H4.2L2 12.6V4.2z'
            : 'M1.5 4.2A1.2 1.2 0 012.7 3h3l1.2 1.5h5.4a1.2 1.2 0 011.2 1.2v6.1a1.2 1.2 0 01-1.2 1.2H2.7a1.2 1.2 0 01-1.2-1.2V4.2z'
        }
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** Input inline untuk New File / New Folder / Rename. */
function InlineInput({
  initial,
  depth,
  onCommit,
  onCancel,
}: {
  initial: string;
  depth: number;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Pilih nama tanpa ekstensi (perilaku VS Code).
    const dot = initial.lastIndexOf('.');
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }, [initial]);

  return (
    <div className="tree-row tree-row-edit" style={{ paddingLeft: 6 + depth * INDENT }}>
      <input
        ref={ref}
        className="tree-input"
        defaultValue={initial}
        aria-label="Nama"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit((e.target as HTMLInputElement).value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={(e) => onCommit(e.target.value)}
      />
    </div>
  );
}

export default function FileTree() {
  const workspace = useStore((s) => s.workspace);
  const openPath = useStore((s) => s.openPath);
  const activeTabPath = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.path ?? null);

  const children = useExplorer((s) => s.children);
  const expanded = useExplorer((s) => s.expanded);
  const selected = useExplorer((s) => s.selected);
  const inlineEdit = useExplorer((s) => s.inlineEdit);
  const explorerError = useExplorer((s) => s.explorerError);
  const toggleExpand = useExplorer((s) => s.toggleExpand);
  const select = useExplorer((s) => s.select);
  const openCtxMenu = useExplorer((s) => s.openCtxMenu);
  const commitInline = useExplorer((s) => s.commitInline);
  const cancelInline = useExplorer((s) => s.cancelInline);
  const startInline = useExplorer((s) => s.startInline);
  const askDelete = useExplorer((s) => s.askDelete);
  const movePath = useExplorer((s) => s.movePath);

  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragSrc = useRef<string | null>(null);

  const rows = useMemo(
    () => (workspace ? buildRows(workspace, children, expanded) : []),
    [workspace, children, expanded],
  );
  const order = useMemo(() => rows.map((r) => r.node.path), [rows]);

  if (!workspace) return null;

  const rowDepthFor = (dir: string) => {
    if (dir === workspace) return 0;
    const found = rows.find((r) => r.node.path === dir);
    return found ? found.depth + 1 : 0;
  };

  const onRowKeyDown = (e: React.KeyboardEvent, node: DirNode) => {
    if (e.key === 'F2') {
      e.preventDefault();
      startInline({ kind: 'rename', target: node.path, initial: node.name });
    } else if (e.key === 'Delete') {
      e.preventDefault();
      const targets = selected.includes(node.path) ? selected : [node.path];
      // FASE 27: dialog dalam-app, bukan `window.confirm` yang memblokir.
      askDelete(targets);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (node.isDir) void toggleExpand(node.path);
      else void openPath(node.path);
    }
  };

  return (
    <div className="tree" role="tree" aria-label="File Explorer">
      {explorerError && <div className="tree-error">{explorerError}</div>}

      {/* input "new" tepat di bawah root bila targetnya root */}
      {inlineEdit && inlineEdit.kind !== 'rename' && inlineEdit.target === workspace && (
        <InlineInput
          initial={inlineEdit.initial}
          depth={0}
          onCommit={(v) => void commitInline(v)}
          onCancel={cancelInline}
        />
      )}

      {rows.map(({ node, depth }) => {
        const isSel = selected.includes(node.path);
        const isActive = activeTabPath?.toLowerCase() === node.path.toLowerCase();
        const isRenaming = inlineEdit?.kind === 'rename' && inlineEdit.target === node.path;

        if (isRenaming) {
          return (
            <InlineInput
              key={node.path}
              initial={inlineEdit.initial}
              depth={depth}
              onCommit={(v) => void commitInline(v)}
              onCancel={cancelInline}
            />
          );
        }

        return (
          <div key={node.path}>
            <div
              role="treeitem"
              tabIndex={0}
              aria-selected={isSel}
              aria-expanded={node.isDir ? !!expanded[node.path] : undefined}
              title={node.path}
              className={`tree-row${isSel ? ' is-selected' : ''}${isActive ? ' is-active' : ''}${
                dragOver === node.path ? ' is-dragover' : ''
              }`}
              style={{ paddingLeft: 6 + depth * INDENT }}
              draggable
              onDragStart={(e) => {
                dragSrc.current = node.path;
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (!dragSrc.current) return;
                e.preventDefault();
                // Folder = target langsung; file = folder induknya.
                const target = node.isDir ? node.path : node.path.replace(/[\\/][^\\/]+$/, '');
                setDragOver(target === node.path ? node.path : null);
              }}
              onDragLeave={() => setDragOver((v) => (v === node.path ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const src = dragSrc.current;
                dragSrc.current = null;
                setDragOver(null);
                if (!src) return;
                const destDir = node.isDir ? node.path : node.path.replace(/[\\/][^\\/]+$/, '');
                void movePath(src, destDir);
              }}
              onDragEnd={() => {
                dragSrc.current = null;
                setDragOver(null);
              }}
              onClick={(e) => {
                const mode = e.ctrlKey || e.metaKey ? 'ctrl' : e.shiftKey ? 'shift' : 'single';
                select(node.path, mode, order);
                if (mode !== 'single') return;
                if (node.isDir) void toggleExpand(node.path);
                else void openPath(node.path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selected.includes(node.path)) select(node.path, 'single', order);
                openCtxMenu({ x: e.clientX, y: e.clientY, path: node.path, isDir: node.isDir });
              }}
              onKeyDown={(e) => onRowKeyDown(e, node)}
            >
              <span className="tree-twisty">
                {node.isDir && node.hasChildren ? <Chevron open={!!expanded[node.path]} /> : null}
              </span>
              {node.isDir ? (
                <FolderIcon open={!!expanded[node.path]} />
              ) : (
                <FileIcon lang={detectLang(node.name)} name={node.name} />
              )}
              <span className="tree-name">{node.name}</span>
            </div>

            {/* input "new" di dalam folder yang sedang dibuka */}
            {inlineEdit &&
              inlineEdit.kind !== 'rename' &&
              inlineEdit.target === node.path &&
              expanded[node.path] && (
                <InlineInput
                  initial={inlineEdit.initial}
                  depth={rowDepthFor(node.path)}
                  onCommit={(v) => void commitInline(v)}
                  onCancel={cancelInline}
                />
              )}
          </div>
        );
      })}

      {rows.length === 0 && <p className="side-muted tree-empty">Folder ini kosong</p>}
    </div>
  );
}
