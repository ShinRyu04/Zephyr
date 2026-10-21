import { useState, type ReactNode } from 'react';
import { IkonPanelKanan } from './AgentsKontrolSudut';
import AgentsPanelKananFile from './AgentsPanelKananFile';

/*
 * Panel kanan jendela Agents — keadaan "Start here".
 *
 * Acuannya `Referensi TRAE Agent Window/4.png` dan `6.png`: panel kanan yang
 * masih kosong menampilkan daftar pintasan bertumpuk di tengah secara
 * vertikal, plus tombol `+` di baris atas.
 *
 * Tombol expand & split dari acuan dibuang (keputusan user). Sebagai gantinya,
 * tombol panel kanan — yang biasanya ada di kontrol sudut (`IDE ↗` | panel) —
 * pindah ke bar panel ini selama panel terbuka, lalu kembali ke kontrol sudut
 * saat panel ditutup. `data-testid`-nya tetap `agx-panel-kanan`, jadi satu
 * tombol, bukan dua yang bentrok.
 */

type Butir = { id: string; label: string; ket: string; ikon: ReactNode };

/* Urutan daftar di dropdown `+` menurut acuan (gambar): File, Terminal,
   Browser, Task Summary, Side Chat, Diff View — beda dengan urutan daftar
   "Start here" di bawah. */
const URUT_DROPDOWN = ['file', 'terminal', 'browser', 'task-summary', 'side-chat', 'diff-view'];

const BUTIR: Butir[] = [
  {
    id: 'file',
    label: 'File',
    ket: 'Browse and preview task files',
    ikon: <path d="M2.4 4.6h4l1.3 1.6h5.9v6.2H2.4z" />,
  },
  {
    id: 'task-summary',
    label: 'Task Summary',
    ket: 'View task progress, output summary, and related information',
    ikon: <path d="M3.2 4.2h9.6M3.2 8h9.6M3.2 11.8h6" />,
  },
  {
    id: 'side-chat',
    label: 'Side Chat',
    ket: 'Start an independent conversation using the current context without interrupting the current',
    ikon: <path d="M2.6 3.6h10.8v7.2H7.4L4.2 13.4v-2.6H2.6z" />,
  },
  {
    id: 'browser',
    label: 'Browser',
    ket: 'Browse and debug web pages',
    ikon: (
      <>
        <circle cx="8" cy="8" r="5.4" />
        <path d="M2.6 8h10.8M8 2.6c1.9 2 1.9 8.8 0 10.8M8 2.6c-1.9 2-1.9 8.8 0 10.8" />
      </>
    ),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    ket: 'Run commands and scripts',
    ikon: (
      <>
        <rect x="2.2" y="3" width="11.6" height="10" rx="1.6" />
        <path d="M4.6 6.6 6.6 8.2 4.6 9.8M7.8 10h3.4" />
      </>
    ),
  },
  {
    id: 'diff-view',
    label: 'Diff View',
    ket: 'Review pending, committed, and AI changes',
    ikon: <path d="M5.6 3.2 2.8 6l2.8 2.8M10.4 7.2l2.8 2.8-2.8 2.8M9.2 2.6 6.8 13.4" />,
  },
];

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

export default function AgentsPanelKanan({ onTogglePanel }: { onTogglePanel: () => void }) {
  /* Dropdown tombol `+` (gambar acuan): kolom cari "Search file names" di atas
     daftar. Itemnya belum punya aksi — sama seperti butir "Start here". */
  const [dropdownTerbuka, setDropdownTerbuka] = useState(false);
  const [cari, setCari] = useState('');
  /* Isi panel: `start` = daftar "Start here", `file` = pohon file + pratinjau
     (acuan gambar user; tombol `File` membukanya). Tampilan lain menyusul. */
  const [tampilan, setTampilan] = useState<'start' | 'file'>('start');

  const daftar = URUT_DROPDOWN.map((id) => BUTIR.find((b) => b.id === id)!).filter(
    (b) => b.label.toLowerCase().includes(cari.trim().toLowerCase())
  );

  const pilihButir = (id: string) => {
    if (id === 'file') setTampilan('file');
  };

  /* Satu tombol panel (bukan dua): elemen yang sama dipakai di bar `Start here`
     dan di bar tampilan `File` — pindah tempat, tidak pernah tampil bersamaan. */
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

  /* Tampilan `File` punya barnya sendiri (tab `File` + `+`), jadi bar umum di
     atas hanya untuk `Start here`; tombol panel ikut pindah ke bar `File`. */
  if (tampilan === 'file') {
    return (
      <aside className="agx-kanan" data-testid="agx-panel-kanan-isi">
        <AgentsPanelKananFile onKembali={() => setTampilan('start')} tombolKanan={tombolPanel} />
      </aside>
    );
  }

  return (
    <aside className="agx-kanan" data-testid="agx-panel-kanan-isi">
      <div className="agx-kanan-bar" data-testid="agx-kanan-bar">
        <span className="agx-kanan-tambah-wrap">
          <button
            className="agx-kanan-ikon"
            data-testid="agx-kanan-tambah"
            title="New"
            aria-label="New"
            aria-expanded={dropdownTerbuka}
            onClick={() => setDropdownTerbuka((v) => !v)}
          >
            <Ikon>
              <path d="M8 3.4v9.2M3.4 8h9.2" />
            </Ikon>
          </button>
          {dropdownTerbuka && (
            <div className="agx-kanan-dd" data-testid="agx-kanan-dd">
              <div className="agx-kanan-dd-cari">
                <Ikon>
                  <circle cx="7.2" cy="7.2" r="4.2" />
                  <path d="M10.4 10.4 13.2 13.2" />
                </Ikon>
                <input
                  data-testid="agx-kanan-dd-input"
                  placeholder="Search file names"
                  value={cari}
                  onChange={(e) => setCari(e.target.value)}
                  aria-label="Search file names"
                  spellCheck={false}
                />
                <kbd>⌘P</kbd>
              </div>
              <div className="agx-kanan-dd-daftar" data-testid="agx-kanan-dd-daftar">
                {daftar.map((b) => (
                  <button
                    key={b.id}
                    className="agx-kanan-dd-butir"
                    data-testid={`agx-kanan-dd-${b.id}`}
                    onClick={() => {
                      setDropdownTerbuka(false);
                      pilihButir(b.id);
                    }}
                  >
                    <span className="agx-kanan-butir-ikon">
                      <Ikon>{b.ikon}</Ikon>
                    </span>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </span>
        <span className="agx-kanan-aksi">
          {/* Tombol expand & split dibuang (keputusan user). Yang tinggal di sini
              hanya tombol panel — pindahan dari kontrol sudut; mengkliknya
              menutup panel dan tombolnya kembali ke `.agx-sudut`. */}
          {tombolPanel}
        </span>
      </div>

      <div className="agx-kanan-tengah">
        <div className="agx-kanan-judul" data-testid="agx-kanan-judul">
          Start here
        </div>
        <div className="agx-kanan-daftar" data-testid="agx-kanan-daftar">
          {BUTIR.map((b) => (
            <button
              key={b.id}
              className="agx-kanan-butir"
              data-testid={`agx-kanan-${b.id}`}
              onClick={() => pilihButir(b.id)}
            >
              <span className="agx-kanan-butir-ikon">
                <Ikon>{b.ikon}</Ikon>
              </span>
              <span className="agx-kanan-butir-teks">
                <b>{b.label}</b>
                <i>{b.ket}</i>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
