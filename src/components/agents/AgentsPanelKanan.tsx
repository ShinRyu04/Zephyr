import type { ReactNode } from 'react';
import { IkonPanelKanan } from './AgentsKontrolSudut';
import { useAgxTabs, type Tab } from '../../lib/agentsTabs';
import AgentsPanelKananFile from './AgentsPanelKananFile';
import { ikonFile } from '../../lib/fileIcons';
import AgentsPanelKananStart from './AgentsPanelKananStart';
import AgentsViewDropdown, { BUTIR, type Tampilan } from './AgentsViewDropdown';
import AgentsPanelKananTerminal from './AgentsPanelKananTerminal';
import AgentsPanelKananBrowser from './AgentsPanelKananBrowser';
import AgentsPanelKananSummary from './AgentsPanelKananSummary';
import AgentsPanelKananSideChat from './AgentsPanelKananSideChat';
import AgentsPanelKananDiff from './AgentsPanelKananDiff';

/*
 * Panel kanan jendela Agents — model MULTI-TAB seperti TRAE.
 *
 * Baris atas = `+` (dropdown view) + deretan tab + tombol panel. Semua view
 * adalah tab sungguhan di store (`useAgxTabs`), termasuk File: tidak ada view
 * yang tampil sendiri tanpa dibuka. Tidak ada tab = layar "Start here".
 *
 * Panel ini TIDAK menyimpan state tab sendiri. Dulu ada bendera lokal
 * `fileTampil` untuk menahan tab File; karena state itu ikut ter-reset tiap
 * panel kanan ditutup/buka, File muncul lagi tanpa diminta. Sekarang sumber
 * kebenaran hanya store, jadi tutup panel tidak membuang dan tidak
 * memunculkan tab apa pun.
 *
 * Tab File tetap ter-mount (hanya disembunyikan) selama tabnya ada, supaya
 * pilihan file dan isi pohonnya tidak hilang saat user pindah ke tab lain.
 */

function Ikon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const LABEL_VIEW: Record<Tampilan, string> = {
  start: 'Start here',
  file: 'File',
  terminal: 'PowerShell',
  browser: 'Browser',
  'task-summary': 'Task Summary',
  'side-chat': 'Side Chat',
  'diff-view': 'Diff View',
};

/* View selain File di-unmount saat tidak aktif supaya PTY/browser tidak
   tertinggal; File dibiarkan ter-mount (lihat komentar di atas). */
function IsiTab({ tampilan, tab }: { tampilan: Tampilan; tab: Tab }) {
  if (tampilan === 'terminal') return <AgentsPanelKananTerminal tab={tab} />;
  if (tampilan === 'browser') return <AgentsPanelKananBrowser tab={tab} />;
  if (tampilan === 'task-summary') return <AgentsPanelKananSummary />;
  if (tampilan === 'side-chat') return <AgentsPanelKananSideChat />;
  return <AgentsPanelKananDiff />;
}

export default function AgentsPanelKanan({
  onTogglePanel,
  lebar,
}: {
  onTogglePanel: () => void;
  /* Lebar panel dalam persen — di-drag lewat splitter (lihat AgentsApp). */
  lebar: number;
}) {
  const tabs = useAgxTabs((s) => s.tabs);
  const aktifId = useAgxTabs((s) => s.aktifId);
  const buka = useAgxTabs((s) => s.buka);
  const fokus = useAgxTabs((s) => s.fokus);
  const tutup = useAgxTabs((s) => s.tutup);

  const tombolPanel = (
    <button
      className="agx-tb-btn agx-panel-toggle"
      data-testid="agx-panel-kanan"
      title="Hide right panel"
      aria-label="Toggle right panel"
      aria-pressed={true}
      onClick={onTogglePanel}
    >
      <IkonPanelKanan />
    </button>
  );

  /* `start` bukan tab (ia justru layar kosong); selain itu semuanya lewat
     store — File pun, supaya bisa ditutup dan tidak muncul sendiri. */
  const pilih = (id: Tampilan) => {
    if (id === 'start') return;
    buka(id, LABEL_VIEW[id]);
  };

  const tabAktif = aktifId ? tabs.find((t) => t.id === aktifId) : undefined;
  const tabFile = tabs.find((t) => t.tampilan === 'file');
  const adaFile = !!tabFile;

  return (
    <aside
      className="agx-kanan"
      data-testid="agx-panel-kanan-isi"
      data-tampilan={tabAktif?.tampilan}
      style={{ flex: `0 0 ${lebar}%` }}
    >
      {/* Bar tab: deretan tab, `+` tepat di belakang tab terakhir (seperti
          TRAE, ikut bergeser saat tab bertambah), lalu tombol panel di ujung
          kanan. Deretan tab yang di-scroll ada di `.agx-tabs-lajur`; `+` di
          luarnya supaya dropdown-nya tidak terpotong `overflow`. */}
      <div className="agx-kanan-bar agx-tabs-bar" data-testid="agx-kanan-bar">
        <div className="agx-tabs">
        <div className="agx-tabs-lajur" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`agx-tab${tabAktif?.id === t.id ? ' is-aktif' : ''}`}
              role="tab"
              aria-selected={tabAktif?.id === t.id}
              data-testid={`agx-tab-${t.tampilan}`}
              title={t.judul}
              onClick={() => fokus(t.id)}
            >
              <span className="agx-tab-ikon">
                {t.tampilan === 'file' && t.path ? (
                  /* Tab File yang sudah memilih file: ikon file SAMA dengan di pohon. */
                  <span
                    className="agx-file-glyph"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: ikonFile(t.path).svg ?? '' }}
                  />
                ) : (
                  <Ikon>{BUTIR.find((b) => b.id === t.tampilan)?.ikon ?? <circle cx="8" cy="8" r="5" />}</Ikon>
                )}
              </span>
              <span className="agx-tab-nama">{t.judul}</span>
              {/* X = posisi ABSOLUT di ujung tab, muncul saat hover — nimpa
                  ujung nama seperti TRAE, jadi tab di kanannya TIDAK ikut
                  terdorong. */}
              <span
                className="agx-tab-x"
                role="button"
                data-testid={`agx-tab-x-${t.id}`}
                title="Close"
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  tutup(t.id);
                }}
              >
                <Ikon>
                  <path d="M4 4l8 8M12 4l-8 8" />
                </Ikon>
              </span>
            </button>
          ))}
        </div>
        <AgentsViewDropdown onPilih={pilih} />
        </div>
        <span className="agx-kanan-aksi">{tombolPanel}</span>
      </div>

      {tabs.length === 0 ? (
        <AgentsPanelKananStart onPilih={pilih} />
      ) : (
        <>
          {/* File tetap ter-mount (disembunyikan) selama tabnya ada. */}
          {adaFile && (
            <div className={`agx-panel-slot${tabAktif?.tampilan === 'file' ? '' : ' is-sembunyi'}`}>
              <AgentsPanelKananFile />
            </div>
          )}
          {tabAktif && tabAktif.tampilan !== 'file' && (
            <IsiTab tampilan={tabAktif.tampilan} tab={tabAktif} />
          )}
        </>
      )}
    </aside>
  );
}
