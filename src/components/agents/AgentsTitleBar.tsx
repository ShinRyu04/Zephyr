import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/*
 * Title bar jendela Agents.
 *
 * Jendelanya frameless, jadi bar ini yang menyediakan semuanya: area geser,
 * delapan pegangan resize, dan tombol minimize/maximize/close. Bentuknya
 * mengikuti acuan referensi: segitiga toggle sidebar di paling kiri, menu
 * File/Edit/View/Help sesudahnya, lalu tombol "IDE" di ujung kanan sebelum
 * kontrol jendela.
 *
 * Tombol "IDE" memfokuskan jendela editor tanpa menutup jendela ini — sama
 * dengan Ctrl+Shift+A yang sudah terpasang di `AgentsWindow`.
 */

type ArahResize =
  | 'East'
  | 'North'
  | 'NorthEast'
  | 'NorthWest'
  | 'South'
  | 'SouthEast'
  | 'SouthWest'
  | 'West';

const TINGGI = 48;

/* Delapan strip tipis di tepi jendela. Frameless window tidak bisa di-resize
   tanpa ini. Ditempatkan di luar bar supaya geser dari tepi tidak ikut
   memindahkan jendela.
   Tepi 6px dan sudut 14px: 4/10px terasa "tidak kena" saat kursor mendekati
   pojok — target sekecil itu sulit ditangkap mouse (keluhan user). */
const TEPI: { dir: ArahResize; style: React.CSSProperties }[] = [
  { dir: 'North', style: { top: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize' } },
  { dir: 'South', style: { bottom: 0, left: 0, right: 0, height: 6, cursor: 'ns-resize' } },
  { dir: 'West', style: { top: 0, bottom: 0, left: 0, width: 6, cursor: 'ew-resize' } },
  { dir: 'East', style: { top: 0, bottom: 0, right: 0, width: 6, cursor: 'ew-resize' } },
  { dir: 'NorthWest', style: { top: 0, left: 0, width: 14, height: 14, cursor: 'nwse-resize' } },
  { dir: 'NorthEast', style: { top: 0, right: 0, width: 14, height: 14, cursor: 'nesw-resize' } },
  { dir: 'SouthWest', style: { bottom: 0, left: 0, width: 14, height: 14, cursor: 'nesw-resize' } },
  { dir: 'SouthEast', style: { bottom: 0, right: 0, width: 14, height: 14, cursor: 'nwse-resize' } },
];

/* Isi tiap menu. Semuanya belum punya aksi — user minta tombolnya dipasang
   dulu, isinya diurus nanti. Yang penting di sini: bentuk dropdown-nya nyata
   (bisa dibuka, ada baris item dan pemisah), supaya tahap berikutnya tinggal
   mengisi `aksi`. */
type ItemMenu = { label: string; pintasan?: string } | 'pemisah';

const ISI_MENU: Record<string, ItemMenu[]> = {
  File: [
    { label: 'New task', pintasan: 'Ctrl+N' },
    { label: 'Open folder…' },
    'pemisah',
    { label: 'Close window', pintasan: 'Ctrl+W' },
  ],
  Edit: [
    { label: 'Undo', pintasan: 'Ctrl+Z' },
    { label: 'Redo', pintasan: 'Ctrl+Y' },
    'pemisah',
    { label: 'Cut', pintasan: 'Ctrl+X' },
    { label: 'Copy', pintasan: 'Ctrl+C' },
    { label: 'Paste', pintasan: 'Ctrl+V' },
  ],
  View: [
    { label: 'Toggle sidebar', pintasan: 'Ctrl+B' },
    { label: 'Command palette', pintasan: 'Ctrl+Shift+P' },
    'pemisah',
    { label: 'Reset zoom' },
    { label: 'Toggle full screen', pintasan: 'F11' },
  ],
  Help: [
    { label: 'Documentation' },
    { label: 'Keyboard shortcuts' },
    'pemisah',
    { label: 'About Zephyr' },
  ],
};

/* Tombol search di paling kiri, sebelum menu — urutannya mengikuti acuan
   `Kiri TRAE.png`: toggle sidebar, search, lalu File/Edit/View/Help. Isi
   pencariannya belum ada, jadi tombolnya belum membuka apa pun. */
function IkonSearch() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7.2" cy="7.2" r="4.4" />
      <path d="M10.5 10.5 13.4 13.4" />
    </svg>
  );
}

function IkonSidebar() {
  return (
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <rect
        x="1.5"
        y="3"
        width="13"
        height="10"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M6 3v10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IkonMinimize() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function IkonMaximize({ restore }: { restore: boolean }) {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      {restore ? (
        <>
          <rect x="0.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M3 2.5V1h6v6H7.5" fill="none" stroke="currentColor" strokeWidth="1" />
        </>
      ) : (
        <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
      )}
    </svg>
  );
}

function IkonClose() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/** Di luar Tauri (harness browser) tidak ada window; jangan sampai melempar. */
function jendela() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export default function AgentsTitleBar({
  sidebarTerbuka,
  onToggleSidebar,
}: {
  sidebarTerbuka: boolean;
  onToggleSidebar: () => void;
}) {
  const [maks, setMaks] = useState(false);
  const [menuBuka, setMenuBuka] = useState<string | null>(null);

  /* Menu ditutup oleh klik di mana pun, Escape, atau kehilangan fokus jendela.
     Tanpa ini dropdown tetap menggantung saat user mengklik kanvas. */
  useEffect(() => {
    if (!menuBuka) return;
    const tutup = () => setMenuBuka(null);
    const tombol = (e: KeyboardEvent) => {
      if (e.key === 'Escape') tutup();
    };
    window.addEventListener('mousedown', tutup);
    window.addEventListener('keydown', tombol);
    window.addEventListener('blur', tutup);
    return () => {
      window.removeEventListener('mousedown', tutup);
      window.removeEventListener('keydown', tombol);
      window.removeEventListener('blur', tutup);
    };
  }, [menuBuka]);

  useEffect(() => {
    const w = jendela();
    if (!w) return;
    let hidup = true;
    void w.isMaximized().then((v) => hidup && setMaks(v)).catch(() => {});
    const un = w.onResized(() => {
      void w.isMaximized().then((v) => hidup && setMaks(v)).catch(() => {});
    });
    return () => {
      hidup = false;
      void un.then((f) => f()).catch(() => {});
    };
  }, []);

  const aksi = (fn: (w: NonNullable<ReturnType<typeof jendela>>) => Promise<unknown>) => {
    const w = jendela();
    if (!w) return;
    void fn(w).catch(() => {});
  };

  return (
    <>
      {TEPI.map((t) => (
        <div
          key={t.dir}
          className="agx-resize"
          style={{ position: 'fixed', zIndex: 2147483000, ...t.style }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            aksi((w) => w.startResizeDragging(t.dir));
          }}
          aria-hidden="true"
        />
      ))}

      <header
        className="agx-titlebar"
        data-testid="agx-titlebar"
        data-tauri-drag-region
        style={{ height: TINGGI }}
        onDoubleClick={() => aksi((w) => w.toggleMaximize())}
      >
        <div className="agx-titlebar-kiri">
          <button
            className="agx-tb-btn"
            data-testid="agx-sidebar-toggle"
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            aria-pressed={sidebarTerbuka}
            onClick={onToggleSidebar}
          >
            <IkonSidebar />
          </button>

          <button
            className="agx-tb-btn"
            data-testid="agx-search"
            title="Search"
            aria-label="Search"
          >
            <IkonSearch />
          </button>

          <nav className="agx-menu" data-testid="agx-menu">
            {Object.keys(ISI_MENU).map((m) => {
              const terbuka = menuBuka === m;
              return (
                <span key={m} className="agx-menu-bungkus">
                  <button
                    className={`agx-menu-item${terbuka ? ' is-buka' : ''}`}
                    data-testid={`agx-menu-${m.toLowerCase()}`}
                    title={m}
                    aria-haspopup="menu"
                    aria-expanded={terbuka}
                    onClick={(e) => {
                      /* Klik tombol tidak boleh ikut memicu penutup global. */
                      e.stopPropagation();
                      setMenuBuka((v) => (v === m ? null : m));
                    }}
                  >
                    {m}
                  </button>

                  {terbuka && (
                    <div
                      className="agx-dropdown"
                      role="menu"
                      data-testid={`agx-dropdown-${m.toLowerCase()}`}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {ISI_MENU[m].map((it, i) =>
                        it === 'pemisah' ? (
                          <div key={`p${i}`} className="agx-dropdown-pemisah" role="separator" />
                        ) : (
                          <button
                            key={it.label}
                            className="agx-dropdown-item"
                            role="menuitem"
                            data-testid="agx-dropdown-item"
                          >
                            <span className="agx-dropdown-label">{it.label}</span>
                            {it.pintasan && <span className="agx-dropdown-pintasan">{it.pintasan}</span>}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </span>
              );
            })}
          </nav>
        </div>

        <div className="agx-titlebar-kanan">
          <span className="agx-win">
            <button
              className="agx-win-btn"
              data-testid="agx-win-min"
              title="Minimize"
              aria-label="Minimize"
              onClick={() => aksi((w) => w.minimize())}
            >
              <IkonMinimize />
            </button>
            <button
              className="agx-win-btn"
              data-testid="agx-win-max"
              title={maks ? 'Restore' : 'Maximize'}
              aria-label={maks ? 'Restore' : 'Maximize'}
              aria-pressed={maks}
              onClick={() => aksi((w) => w.toggleMaximize())}
            >
              <IkonMaximize restore={maks} />
            </button>
            <button
              className="agx-win-btn is-close"
              data-testid="agx-win-close"
              title="Close"
              aria-label="Close"
              onClick={() => aksi((w) => w.close())}
            >
              <IkonClose />
            </button>
          </span>
        </div>
      </header>
    </>
  );
}
