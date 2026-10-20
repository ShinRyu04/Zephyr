import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../lib/store';
import { useExplorer } from '../../lib/explorerStore';
import { detectLang } from '../../lib/lang';
import { tx } from '../../lib/i18n';
import FileIcon, { FolderIcon } from '../editor/FileIcon';
import type { DirNode } from '../../lib/types';

/**
 * The File tab of the right column: a PREVIEW of the open file over its tree.
 *
 * ## Why not just reuse `ExplorerPanel`
 *
 * The reference splits this tab in two: the file being looked at on top, the
 * folder tree underneath. `ExplorerPanel` is the whole Explorer SIDEBAR — its
 * own scroll container, its own empty state, no notion of a preview — so
 * dropping it here gives a second Explorer, not this tab. The split is the
 * reason the tab exists: file, then where it came from, without leaving the
 * column for the editor half.
 *
 * ## Wiring
 *
 * The tree reads the SAME stores as the editor's Explorer (`useExplorer` for
 * children/expansion, `useStore.openPath` for opening), so a folder expanded
 * here is expanded in the main window too and a click opens a real tab. The
 * rows are flat because the store already keeps children per directory; a
 * recursive component would only re-derive the same list.
 *
 * `scanDir` is issued on mount and whenever the workspace changes — the store
 * caches per directory, so a folder already loaded costs nothing and a fresh
 * window is not stuck on "loading" until something else touches Explorer.
 */

const INDENT = 11;
/** How many bytes of the file the preview reads. Enough for the opening
 *  screenful; a 2 MB minified bundle would otherwise freeze the column. */
const PRATINJAU_BYTE = 24_000;

interface Baris {
  node: DirNode;
  depth: number;
}

function susun(
  akar: string,
  children: Record<string, DirNode[]>,
  expanded: Record<string, boolean>,
): Baris[] {
  const out: Baris[] = [];
  const jalan = (dir: string, depth: number) => {
    for (const node of children[dir] ?? []) {
      out.push({ node, depth });
      if (node.isDir && expanded[node.path]) jalan(node.path, depth + 1);
    }
  };
  jalan(akar, 0);
  return out;
}

const namaFile = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || p;

export default function AgentsFiles() {
  const workspace = useStore((s) => s.workspace);
  const openPath = useStore((s) => s.openPath);
  const openFolderDialog = useStore((s) => s.openFolderDialog);
  const tab = useStore((s) => s.tabs.find((t) => t.id === s.activeTabId) ?? null);

  const children = useExplorer((s) => s.children);
  const expanded = useExplorer((s) => s.expanded);
  const toggleExpand = useExplorer((s) => s.toggleExpand);
  const loadDir = useExplorer((s) => s.loadDir);
  const refreshDir = useExplorer((s) => s.refreshDir);

  const [preview, setPreview] = useState<{ path: string; teks: string; gagal: boolean } | null>(null);

  /* Load the root on mount / when the folder changes. `loadDir` is cached, so
     re-entering the tab does not re-scan anything. */
  useEffect(() => {
    if (workspace) void loadDir(workspace);
  }, [workspace, loadDir]);

  /*
   * The preview follows the ACTIVE tab. Read from disk rather than from
   * `tab.content`: the editor keeps the buffer, so a file with unsaved edits
   * would preview as its saved text and the two would disagree without saying
   * so. Binary files are refused by `fs_read` and the preview says "binary"
   * instead of rendering replacement characters.
   */
  useEffect(() => {
    const path = tab?.path ?? null;
    if (!path) {
      setPreview(null);
      return;
    }
    let hidup = true;
    void import('../../lib/commands')
      .then((m) => m.fsRead(path))
      .then((r) => {
        if (!hidup) return;
        const teks = r.content ?? '';
        setPreview({
          path,
          teks: teks.length > PRATINJAU_BYTE ? `${teks.slice(0, PRATINJAU_BYTE)}\n…` : teks,
          /* `note` is where Rust explains why content came back empty — the
             README for "this is binary / too large", rather than a guess. */
          gagal: teks.length === 0 && !!r.note,
        });
      })
      .catch(() => {
        if (hidup) setPreview({ path, teks: '', gagal: true });
      });
    return () => {
      hidup = false;
    };
  }, [tab?.path, tab?.id]);

  const baris = useMemo(
    () => (workspace ? susun(workspace, children, expanded) : []),
    [workspace, children, expanded],
  );

  if (!workspace) {
    return (
      <div className="ag-files kosong" data-testid="ag-files">
        <p className="side-muted">{tx('No workspace yet - open a folder')}</p>
        <button className="btn btn-primary" onClick={() => void openFolderDialog()}>
          {tx('Open Folder')}
        </button>
      </div>
    );
  }

  const aktifPath = tab?.path ?? null;
  const bahasa = aktifPath ? detectLang(aktifPath).toUpperCase() : '';

  return (
    <div className="ag-files" data-testid="ag-files">
      {/* ── Preview ─────────────────────────────────────────────────────── */}
      <section className="ag-files-preview" data-testid="ag-files-preview">
        {!tab || !aktifPath ? (
          <p className="ag-files-hint" data-testid="ag-files-emptypreview">
            {tx('Pick a file to preview it here.')}
          </p>
        ) : (
          <>
            <header className="ag-files-head">
              <FileIcon lang={detectLang(aktifPath)} name={namaFile(aktifPath)} />
              <button
                type="button"
                className="ag-files-nama"
                title={aktifPath}
                onClick={() => void openPath(aktifPath, { preview: false })}
              >
                {namaFile(aktifPath)}
              </button>
              {bahasa && <span className="ag-files-lang">{bahasa}</span>}
            </header>
            {preview && preview.path === aktifPath ? (
              preview.gagal ? (
                <p className="ag-files-hint">{tx('This file is binary and cannot be previewed.')}</p>
              ) : (
                <pre className="ag-files-kode" data-testid="ag-files-kode">
                  {preview.teks}
                </pre>
              )
            ) : (
              <p className="ag-files-hint">{tx('Loading…')}</p>
            )}
          </>
        )}
      </section>

      {/* ── Tree ────────────────────────────────────────────────────────── */}
      <div className="ag-files-tree" role="tree" aria-label={tx('Files')} data-testid="ag-files-tree">
        <div className="ag-files-treerow is-root">
          <FolderIcon open nama={namaFile(workspace)} />
          <span className="ag-files-treenama" title={workspace}>
            {namaFile(workspace)}
          </span>
          <button
            type="button"
            className="ag-files-tool"
            title={tx('common.refresh')}
            aria-label={tx('common.refresh')}
            onClick={() => void refreshDir(workspace)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13 8a5 5 0 1 1-1.8-3.85M13 2.5V6h-3.5" />
            </svg>
          </button>
        </div>
        {baris.length === 0 ? (
          <p className="side-muted ag-files-empty">{tx('This folder is empty')}</p>
        ) : (
          baris.map(({ node, depth }) => {
            const buka = !!expanded[node.path];
            const pilih = aktifPath?.toLowerCase() === node.path.toLowerCase();
            return (
              <div
                key={node.path}
                role="treeitem"
                tabIndex={0}
                aria-selected={pilih}
                aria-expanded={node.isDir ? buka : undefined}
                title={node.path}
                className={`ag-files-treerow${pilih ? ' is-aktif' : ''}`}
                style={{ paddingLeft: 6 + depth * INDENT }}
                onClick={() => {
                  if (node.isDir) void toggleExpand(node.path);
                  else void openPath(node.path, { preview: false });
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  if (node.isDir) void toggleExpand(node.path);
                  else void openPath(node.path, { preview: false });
                }}
              >
                <span className="ag-files-twisty">
                  {node.isDir && node.hasChildren ? (
                    <svg viewBox="0 0 16 16" className={buka ? 'is-open' : ''} aria-hidden="true">
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  ) : null}
                </span>
                {node.isDir ? (
                  <FolderIcon open={buka} nama={node.name} />
                ) : (
                  <FileIcon lang={detectLang(node.name)} name={node.name} />
                )}
                <span className="ag-files-treenama">{node.name}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
