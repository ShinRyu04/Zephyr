import { useEffect, useRef, useState, type ReactNode } from 'react';

/*
 * Dropdown `+` panel kanan — satu komponen dipakai dua tempat.
 *
 * Dulu dropdownnya hanya ada di bar `Start here`, dan tombol `+` di bar tampilan
 * `File` sengaja mati. Akibatnya begitu user membuka File, tombol `+` berubah
 * jadi "New file" — padahal di acuan TRAE tombol `+` SELALU membuka daftar view
 * (File, Terminal, Browser, Task Summary, Side Chat, Diff View) di mana pun
 * ia berada. Sekarang bentuk dan isinya sama di kedua bar: satu definisi,
 * dua pemakaian.
 */

export type Tampilan =
  | 'start'
  | 'file'
  | 'terminal'
  | 'browser'
  | 'task-summary'
  | 'side-chat'
  | 'diff-view'
  /* Dibuka programatik: 'plan' dari kartu Plan ("View full plan"), 'subagent'
     dari baris SubAgent di transkrip - bukan butir dropdown. */
  | 'plan'
  | 'subagent';

export type Butir = { id: Tampilan; label: string; ket: string; ikon: ReactNode };

/* Urutan daftar menurut acuan TRAE. */
export const URUT_DROPDOWN: Tampilan[] = [
  'file',
  'terminal',
  'browser',
  'task-summary',
  'side-chat',
  'diff-view',
];

export const BUTIR: Butir[] = [
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

export default function AgentsViewDropdown({
  onPilih,
  testid = 'agx-view-dropdown',
}: {
  onPilih: (id: Tampilan) => void;
  testid?: string;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [cari, setCari] = useState('');
  const wadah = useRef<HTMLSpanElement>(null);

  /* Tutup saat klik di luar, Escape, atau fokus pindah. */
  useEffect(() => {
    if (!terbuka) return;
    const luar = (e: MouseEvent) => {
      if (wadah.current && !wadah.current.contains(e.target as Node)) setTerbuka(false);
    };
    const tombol = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTerbuka(false);
    };
    document.addEventListener('mousedown', luar);
    window.addEventListener('keydown', tombol);
    return () => {
      document.removeEventListener('mousedown', luar);
      window.removeEventListener('keydown', tombol);
    };
  }, [terbuka]);

  const daftar = URUT_DROPDOWN.map((id) => BUTIR.find((b) => b.id === id)!).filter((b) =>
    b.label.toLowerCase().includes(cari.trim().toLowerCase()),
  );

  return (
    <span className="agx-view-dd-wadah" ref={wadah}>
      <button
        className="agx-kanan-ikon"
        data-testid={testid}
        title="New"
        aria-label="New"
        aria-haspopup="menu"
        aria-expanded={terbuka}
        onClick={() => setTerbuka((v) => !v)}
      >
        <Ikon>
          <path d="M8 3.4v9.2M3.4 8h9.2" />
        </Ikon>
      </button>
      {terbuka && (
        <div className="agx-kanan-dd" role="menu" data-testid={`${testid}-menu`}>
          <div className="agx-kanan-dd-cari">
            <Ikon>
              <circle cx="7.2" cy="7.2" r="4.2" />
              <path d="M10.4 10.4 13.2 13.2" />
            </Ikon>
            <input
              data-testid={`${testid}-input`}
              placeholder="Search file names"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              aria-label="Search file names"
              spellCheck={false}
            />
            <kbd>⌘P</kbd>
          </div>
          <div className="agx-kanan-dd-daftar" data-testid={`${testid}-daftar`}>
            {daftar.map((b) => (
              <button
                key={b.id}
                className="agx-kanan-dd-butir"
                data-testid={`${testid}-${b.id}`}
                onClick={() => {
                  setTerbuka(false);
                  onPilih(b.id);
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
  );
}
