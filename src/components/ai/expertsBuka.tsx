/**
 * Util UI bersama untuk Experts Mode: buka tab tugas + label status.
 *
 * Dipakai tiga tempat yang harus selalu setuju (kartu rencana, strip chat,
 * canvas) — kalau masing-masing menulis pembuka tabnya sendiri, satu tempat
 * pasti kelupaan mengganti konvensi id/ketika bentuknya berubah.
 */

import { useStore } from '../../lib/store';
import type { SubStatus, SubStep } from '../../lib/subagentStore';
import type { TugasAhli } from '../../lib/expertsStore';
import AiIkon from './AiIkon';

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

/* ------------------------------------------------------------------ */
/* Langkah tool worker — bentuk acuan (022715/022721)                  */
/* ------------------------------------------------------------------ */

/** Jenis tampilan satu langkah: baris biasa atau kartu (berkas/terminal). */
export type JenisLangkah = 'pikir' | 'baca' | 'cari' | 'tulis' | 'terminal' | 'lain';

/** Nama tool Zephyr → jenis acuan Qoder. Longgar: MCP baru ikut kelompoknya. */
export function jenisLangkah(nama: string | undefined): JenisLangkah {
  const n = (nama ?? '').toLowerCase();
  if (/^(read_file|read|baca)/.test(n)) return 'baca';
  if (/^(grep|glob|search|tool_search|find|cari|web|ambil_web|browsing|ingat)/.test(n)) return 'cari';
  if (/^(write_file|multi_edit|edit|replace_in_files|delete_file|move_file|copy_file|apply_patch|tulis)/.test(n))
    return 'tulis';
  if (/^(bash_run|bash_job|run_command|terminal)/.test(n)) return 'terminal';
  return 'lain';
}

/** Label keterangan acuan: "Read", "Grepped code", "Searched files", … */
export function labelLangkah(langkah: SubStep): string {
  if (langkah.kind === 'pikir') return 'Thought';
  const n = (langkah.nama ?? '').toLowerCase();
  if (/^(read_file|read|baca)/.test(n)) return 'Read';
  if (/^grep/.test(n)) return 'Grepped code';
  if (/^(glob|find)/.test(n)) return 'Searched files';
  if (/ingat|memory/.test(n)) return 'Searched memory';
  if (/web|ambil|brows/.test(n)) return 'Searched the web';
  if (/^(search|cari|tool_search)/.test(n)) return 'Searched codebase';
  return langkah.nama ?? 'Tool';
}

/** Ikon per jenis langkah — set AiIkon, BUKAN IkonAhli peran (gap 16). */
export function IkonLangkah({ langkah, size = 12 }: { langkah: SubStep; size?: number }) {
  if (langkah.kind === 'pikir') return <AiIkon name="thought" size={size} />;
  switch (jenisLangkah(langkah.nama)) {
    case 'baca':
      return <AiIkon name="doc" size={size} />;
    case 'cari':
      return <AiIkon name="search" size={size} />;
    case 'tulis':
      return <AiIkon name="doc-edit" size={size} />;
    case 'terminal':
      return <AiIkon name="terminal" size={size} />;
    default:
      return <AiIkon name="doc" size={size} />;
  }
}

/**
 * Rendering RENTANG BARIS satu panggilan baca, ala acuan ("expertsStore.ts
 * (37 - 120)").
 *
 * Sumbernya ARGS tool (`offset`/`limit`, atau `awal`/`akhir`), bukan isi hasil:
 * membaca hasil untuk menebak nomor baris akan mengarang rentang yang tidak
 * pernah diminta. Tanpa kedua ujung yang jelas → `null`, dan barisnya hanya
 * menampilkan nama berkas (lebih jujur daripada angka tebakan).
 */
export function rentangBaca(args: Record<string, unknown>): string | null {
  const angka = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  const awal = angka(args.offset) ?? angka(args.awal) ?? angka(args.start) ?? angka(args.from);
  if (awal === null) return null;
  const jumlah = angka(args.limit) ?? angka(args.count) ?? angka(args.jumlah);
  const akhir =
    angka(args.akhir) ?? angka(args.end) ?? angka(args.to) ?? (jumlah ? awal + jumlah - 1 : null);
  if (akhir === null || akhir < awal) return null;
  return `(${awal} - ${akhir})`;
}

/**
 * Centang bulat untuk "✓ Completed" (acuan 022715/022721) — ikon, bukan teks
 * polos. Dipakai header tab Task dan titik status strip progres.
 */
export function IkonCentang({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="m5.2 8.2 2.1 2.1 3.5-4.2" />
    </svg>
  );
}

/*
 * "Thought · 1s" — durasi = jarak `at` ke langkah BERIKUTNYA; langkah
 * terakhir diukur ke waktu selesai worker (yang masih berjalan diukur ke
 * sekarang, jadi angkanya tumbuh hidup seperti acuan).
 */
export function durasiLangkah(at: number, batas: number | null | undefined): string {
  const ms = Math.max(0, (batas ?? Date.now()) - at);
  const dtk = Math.max(1, Math.round(ms / 1000));
  if (dtk < 90) return `${dtk}s`;
  const mnt = Math.floor(dtk / 60);
  return `${mnt}m ${dtk - mnt * 60}s`;
}

/** "6 results" dari teks hasil tool — hanya bila memang tertulis di sana. */
export function jumlahHasil(hasil: string | undefined): string | null {
  if (!hasil) return null;
  const m = hasil.match(/\b(\d+)\s*(results?|matches?|hits?|files?)\b/i);
  return m ? `${m[1]} results` : null;
}
