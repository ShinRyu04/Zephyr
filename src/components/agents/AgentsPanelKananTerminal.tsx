import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTerminal } from '../../lib/terminalStore';
import XtermPane from '../terminal/XtermPane';
import { useAgxTabs, type Tab } from '../../lib/agentsTabs';
import type { PaneMeta } from '../../lib/types';

/*
 * Terminal di panel kanan — satu TAB = satu shell.
 *
 * Model multi-tab: tiap tab terminal membawa `paneId`-nya sendiri (PTY lewat
 * Rust, sama seperti terminal panel bawah). Klik tab Terminal di dropdown
 * selalu membuat tab + shell BARU, jadi beberapa shell bisa hidup bersamaan.
 *
 * Pane TIDAK dibunuh saat tab ditutup dari layar (pindah tab): perintah yang
 * sedang jalan harus tetap hidup — sama seperti terminal panel bawah. Pane
 * mati saat tab-nya ditutup (X) atau saat aplikasi keluar.
 */

export default function AgentsPanelKananTerminal({
  tab,
  bar,
}: {
  tab?: Tab;
  bar?: ReactNode;
}) {
  const [paneId, setPaneId] = useState<string | null>(tab?.paneId ?? null);
  const [galat, setGalat] = useState<string | null>(null);
  const pane: PaneMeta | undefined = useTerminal((s) =>
    paneId ? s.allPanes().find((p) => p.id === paneId) : undefined,
  );
  const dibuat = useRef(false);

  useEffect(() => {
    if (paneId || dibuat.current) return;
    dibuat.current = true;
    void useTerminal
      .getState()
      .addPane('shell')
      .then((id) => {
        if (!id) {
          setGalat(useTerminal.getState().terminalError ?? 'Terminal tidak bisa dibuat');
          return;
        }
        setPaneId(id);
        /* Simpan paneId di tab supaya pindah-pindah tab tidak kehilangan
           shell (handle xterm + PTY tetap hidup di balik layar). */
        if (tab) useAgxTabs.getState().setPane(tab.id, id);
      });
  }, [paneId, tab]);

  return (
    <>
      {bar}
      {/* `.agx-view-isi` = kotak position:relative yang mengisi panel:
          `.xterm-pane` dari index.css berposisi `absolute; inset: 0`, jadi
          tanpa induk relative yang punya ukuran kanvas xterm menempel ke
          ancestor lain dan tampil 0px / hitam. */}
      <div className="agx-view-isi agx-terminal-view" data-testid="agx-terminal-view">
        {galat && (
          <div className="agx-view-kosong">
            <span>{galat}</span>
          </div>
        )}
        {!galat && !pane && (
          <div className="agx-view-kosong">
            <span>Menyalakan shell…</span>
          </div>
        )}
        {pane && <XtermPane pane={pane} />}
      </div>
    </>
  );
}
