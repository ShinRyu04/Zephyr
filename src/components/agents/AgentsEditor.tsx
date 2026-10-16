import { Suspense, lazy } from 'react';
import { useStore, useActiveTab } from '../../lib/store';
import { useT } from '../../lib/i18n';
import EditorTabBar from '../editor/EditorTabBar';
import ZephyrLogo from '../shell/ZephyrLogo';

const CodeMirrorEditor = lazy(() => import('../editor/CodeMirrorEditor'));

/*
 * The editor half of the right column: a real editor, in the agents window.
 *
 * VS Code's Agents workspace keeps an editor beside the tree, and the reader
 * asked for the same arrangement in words — "folder-nya di kanan, di kiri code
 * editor". Without this, clicking a file in Files or Changes had nowhere to
 * display: `openPath` filled the store's `tabs` and nothing in this window
 * rendered them.
 *
 * The editor is `CodeMirrorEditor` itself, unmodified — the same buffer, the
 * same keymap, the same LSP wiring as the main window. A second, simplified
 * viewer would drift from the real one within a release, and "looks like the
 * editor" is not what was asked for.
 *
 * What is NOT reused is `SplitEditor`: it owns the whole editor AREA (the tab
 * group map, the split divider, the chat and Settings pages) and mounting it in
 * a half-column would drag a second window's worth of chrome along.
 *
 * The tab bar is NOT rendered here (see `tanpaBar`). It is hoisted into the
 * column's own strip by `AgentsRight`, because the reader's reference puts the
 * open-file tabs on the SAME row as Changes/Files — one strip, not two stacked
 * ones. Rendering it here as well would draw the same tabs twice.
 *
 * The store here is this window's own — every pop-out is a separate WebView
 * with its own zustand — so opening a file in the MAIN window does not fill
 * this list, and vice versa. That is the pre-existing behaviour of every panel
 * in this window (Changes is the same) and is not something this half changes.
 */
export default function AgentsEditor({ tanpaBar = false }: { tanpaBar?: boolean }) {
  const tr = useT();
  const tab = useActiveTab();
  const adaTab = useStore((s) => s.tabs.length > 0);

  return (
    <div className="ag-ed" data-testid="ag-editor">
      {!tanpaBar && <EditorTabBar />}
      <div className="ag-ed-body">
        {!adaTab ? (
          <div className="ag-ed-kosong" data-testid="ag-editor-empty">
            <ZephyrLogo size={34} />
            <p>{tr('Open a file from Files or Changes to see it here.')}</p>
          </div>
        ) : !tab ? (
          /* Tabs exist but none is active — a state the store can reach after
             closing the active tab. Rendering nothing here would look like a
             broken panel, so say which one to pick. */
          <div className="ag-ed-kosong" data-testid="ag-editor-nopick">
            <p>{tr('Select a tab to open it.')}</p>
          </div>
        ) : (
          <Suspense fallback={null}>
            <CodeMirrorEditor key={tab.id} tab={tab} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
