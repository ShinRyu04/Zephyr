/**
 * Util UI bersama untuk Experts Mode: buka tab tugas + label status.
 *
 * Dipakai tiga tempat yang harus selalu setuju (kartu rencana, strip chat,
 * canvas) — kalau masing-masing menulis pembuka tabnya sendiri, satu tempat
 * pasti kelupaan mengganti konvensi id/ketika bentuknya berubah.
 */

import { useStore } from '../../lib/store';
import type { SubStatus } from '../../lib/subagentStore';
import type { TugasAhli } from '../../lib/expertsStore';

/**
 * Buka tab editor "Task N: <judul>" untuk satu tugas.
 *
 * Id tab = agentId (baris subagent hidup) atau id tugas (snapshot) — dua-duanya
 * stabil, jadi klik berulang memakai ulang tab yang sama, bukan menumpuk.
 */
export function bukaTabTugas(t: TugasAhli, indeks: number): void {
  const judul = `Task ${indeks + 1}: ${t.judul}`;
  void useStore
    .getState()
    .bukaViewAi('experts-task', { ekspertId: t.agentId ?? t.id, judul });
}

/**
 * Buka tab Experts Canvas, menampilkan satu run tertentu.
 *
 * `runId` ikut ke tab (lewat `ekspertId`) karena canvas hanya satu instance:
 * tanpa itu, membuka canvas dari run lama tetap menampilkan run terbaru.
 */
export function bukaCanvas(runId?: string): void {
  void useStore.getState().bukaViewAi('experts-canvas', runId ? { ekspertId: runId } : undefined);
}

/**
 * Label + warna status satu tugas, dari baris hidup atau snapshot.
 *
 * `buktian === false` menang atas status 'selesai': worker yang tidak
 * meninggalkan bukti tool (atau cuma menulis "let me call the tools properly")
 * ditampilkan Unproven. Verdict harus jujur — lihat `buktiCukup` di
 * expertsStore.
 */
export function statusTugas(
  hidup: SubStatus | undefined,
  snapshot: SubStatus | undefined,
  runJalan: boolean,
  buktian?: boolean,
): { teks: string; kelas: string } {
  const s = hidup ?? snapshot;
  if (runJalan && !s) return { teks: 'Pending', kelas: 'is-pending' };
  switch (s) {
    case 'jalan':
      return { teks: 'In Progress', kelas: 'is-jalan' };
    case 'selesai':
      return buktian === false
        ? { teks: 'Unproven', kelas: 'is-gagal' }
        : { teks: 'Completed', kelas: 'is-selesai' };
    case 'gagal':
      return { teks: 'Failed', kelas: 'is-gagal' };
    case 'batal':
      return { teks: 'Cancelled', kelas: 'is-gagal' };
    default:
      return { teks: 'Pending', kelas: 'is-pending' };
  }
}

/** Ikon SVG kecil per peran ahli — satu glyph, dipakai semua kartu. */
export function IkonAhli({ id, size = 14 }: { id: string; size?: number }) {
  const umum = {
    viewBox: '0 0 16 16',
    width: size,
    height: size,
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (id) {
    case 'lead':
      return (
        <svg {...umum}>
          <circle cx="8" cy="3.4" r="1.7" />
          <path d="M8 5.1v3.2M8 8.3 3.6 12.6M8 8.3l4.4 4.3M3.6 12.6h8.8" />
        </svg>
      );
    case 'researcher':
      return (
        <svg {...umum}>
          <circle cx="7" cy="7" r="3.6" />
          <path d="m9.9 9.9 3.4 3.4" />
        </svg>
      );
    case 'fullstack':
      return (
        <svg {...umum}>
          <path d="m5.4 5.4-2.8 2.7 2.8 2.7M10.6 5.4l2.8 2.7-2.8 2.7" />
        </svg>
      );
    case 'qa':
      return (
        <svg {...umum}>
          <path d="M8 1.9 13.6 4v3.6c0 3.4-2.3 5.6-5.6 6.5-3.3-.9-5.6-3.1-5.6-6.5V4L8 1.9z" />
          <path d="m5.7 7.9 1.6 1.6 3-3.2" />
        </svg>
      );
    case 'reviewer':
      return (
        <svg {...umum}>
          <path d="M3.4 2.6h7l2.2 2.2v8.6H3.4z" />
          <path d="M5.6 7h4.8M5.6 9.4h4.8" />
        </svg>
      );
    case 'ui':
      return (
        <svg {...umum}>
          <rect x="2" y="3.2" width="12" height="9.6" rx="1.6" />
          <path d="M2 6h12" />
        </svg>
      );
    case 'debug':
      return (
        <svg {...umum}>
          <circle cx="8" cy="9" r="3.6" />
          <path d="M8 5.4V3.2M4.4 9H2.2M13.8 9h-2.2M5.2 12 3.4 13.8M10.8 12l1.8 1.8" />
        </svg>
      );
    default:
      return (
        <svg {...umum}>
          <circle cx="8" cy="8" r="4.6" />
        </svg>
      );
  }
}
