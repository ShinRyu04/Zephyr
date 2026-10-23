/**
 * Automation — tugas terjadwal ala TRAE untuk jendela Agents.
 *
 * ## Kenapa localStorage, bukan store plugin
 *
 * Tugas automation bukan bagian dari settings (tidak ikut `reset_settings`,
 * tidak perlu migrasi skema), dan isinya kecil: beberapa definisi + riwayat
 * jalan terakhir. `localStorage` juga dibaca jendela Agents yang punya store
 * Zustand sendiri, jadi daftar ini tidak hilang saat jendela dimuat ulang.
 *
 * ## Apa yang benar-benar dijalankan
 *
 * Tiap kali jatuh tempo, tugas membuka percakapan BARU di permukaan `agents`
 * lalu mengirim promptnya sebagai giliran AI biasa — bukan eksekusi diam-diam
 * di latar belakang. Jadi hasilnya bisa dibaca, dihentikan, dan direview
 * (termasuk lewat Diff View → AI Changes), sama seperti chat manual.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { useAi } from './aiStore';

export type Jadwal = 'manual' | 'jam' | 'harian' | 'mingguan';

/** Satu definisi tugas. `berikut` = epoch ms kapan ia dijadwalkan lagi. */
export interface AutomationTask {
  id: string;
  nama: string;
  prompt: string;
  jadwal: Jadwal;
  /** `HH:MM` untuk harian/mingguan. */
  jam: string;
  /** 0 = Minggu … 6 = Sabtu, untuk mingguan. */
  hari: number;
  aktif: boolean;
  dibuat: number;
  berikut: number;
  template?: string;
}

export interface AutomationRun {
  id: string;
  taskId: string;
  nama: string;
  mulai: number;
  selesai: number | null;
  status: 'jalan' | 'selesai' | 'gagal';
  pesan?: string;
}

const KUNCI = 'zephyr.automation.v1';
const MAKS_RIWAYAT = 60;

const idBaru = () => `at-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Jatuh tempo berikutnya setelah `dari`. 0 = tidak terjadwal (manual). */
export function berikutRun(t: Pick<AutomationTask, 'jadwal' | 'jam' | 'hari'>, dari: number): number {
  if (t.jadwal === 'manual') return 0;
  if (t.jadwal === 'jam') {
    const d = new Date(dari);
    d.setMinutes(0, 0, 0);
    return d.getTime() + 60 * 60 * 1000;
  }
  const [jj, mm] = (t.jam || '09:00').split(':').map((n) => parseInt(n, 10) || 0);
  const d = new Date(dari);
  d.setSeconds(0, 0);
  d.setHours(jj, mm, 0, 0);
  if (t.jadwal === 'harian') {
    if (d.getTime() <= dari) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  /* mingguan: maju sampai hari yang dipilih, lalu ke minggu berikutnya kalau
     jamnya sudah lewat hari ini. */
  const target = ((t.hari % 7) + 7) % 7;
  let maju = (target - d.getDay() + 7) % 7;
  if (maju === 0 && d.getTime() <= dari) maju = 7;
  d.setDate(d.getDate() + maju);
  return d.getTime();
}

export function labelJadwal(t: Pick<AutomationTask, 'jadwal' | 'jam' | 'hari'>): string {
  const hari = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (t.jadwal === 'manual') return 'Manual only';
  if (t.jadwal === 'jam') return 'Every hour';
  if (t.jadwal === 'harian') return `Every day at ${t.jam}`;
  return `Every ${hari[((t.hari % 7) + 7) % 7]} at ${t.jam}`;
}

function muat(): { tasks: AutomationTask[]; runs: AutomationRun[] } {
  try {
    const mentah = localStorage.getItem(KUNCI);
    if (!mentah) return { tasks: [], runs: [] };
    const isi = JSON.parse(mentah) as { tasks?: AutomationTask[]; runs?: AutomationRun[] };
    return {
      tasks: Array.isArray(isi.tasks) ? isi.tasks : [],
      runs: Array.isArray(isi.runs) ? isi.runs.slice(0, MAKS_RIWAYAT) : [],
    };
  } catch {
    /* Data rusak jangan menjatuhkan halaman: mulai dari kosong. */
    return { tasks: [], runs: [] };
  }
}

function simpan(tasks: AutomationTask[], runs: AutomationRun[]) {
  try {
    localStorage.setItem(KUNCI, JSON.stringify({ tasks, runs: runs.slice(0, MAKS_RIWAYAT) }));
  } catch {
    /* Kuota penuh / mode privat: tugas tetap hidup di memori sesi ini. */
  }
}

interface AutomationState {
  tasks: AutomationTask[];
  runs: AutomationRun[];
  tambah: (input: Omit<AutomationTask, 'id' | 'dibuat' | 'berikut' | 'aktif'> & { aktif?: boolean }) => AutomationTask;
  ubah: (id: string, patch: Partial<AutomationTask>) => void;
  hapus: (id: string) => void;
  toggle: (id: string) => void;
  catatRun: (run: AutomationRun) => void;
  akhiriRun: (id: string, status: AutomationRun['status'], pesan?: string) => void;
  bersihkanRiwayat: () => void;
}

export const useAutomation = create<AutomationState>()((set, get) => ({
  ...muat(),

  tambah: (input) => {
    const sekarang = Date.now();
    const tugas: AutomationTask = {
      id: idBaru(),
      nama: input.nama.trim() || 'Untitled automation',
      prompt: input.prompt,
      jadwal: input.jadwal,
      jam: input.jam || '09:00',
      hari: input.hari ?? 1,
      template: input.template,
      aktif: input.aktif ?? true,
      dibuat: sekarang,
      berikut: berikutRun(input, sekarang),
    };
    const tasks = [tugas, ...get().tasks];
    set({ tasks });
    simpan(tasks, get().runs);
    return tugas;
  },

  ubah: (id, patch) => {
    const tasks = get().tasks.map((t) => {
      if (t.id !== id) return t;
      const gabung = { ...t, ...patch };
      /* Jadwal berubah = jatuh tempo dihitung ulang dari sekarang, supaya
         tugas tidak langsung menembak karena `berikut` lama masih lewat. */
      const jadwalBerubah =
        patch.jadwal !== undefined || patch.jam !== undefined || patch.hari !== undefined;
      if (jadwalBerubah) gabung.berikut = berikutRun(gabung, Date.now());
      return gabung;
    });
    set({ tasks });
    simpan(tasks, get().runs);
  },

  hapus: (id) => {
    const tasks = get().tasks.filter((t) => t.id !== id);
    set({ tasks });
    simpan(tasks, get().runs);
  },

  toggle: (id) => {
    const tasks = get().tasks.map((t) =>
      t.id === id
        ? { ...t, aktif: !t.aktif, berikut: !t.aktif ? berikutRun(t, Date.now()) : t.berikut }
        : t,
    );
    set({ tasks });
    simpan(tasks, get().runs);
  },

  catatRun: (run) => {
    const runs = [run, ...get().runs].slice(0, MAKS_RIWAYAT);
    set({ runs });
    simpan(get().tasks, runs);
  },

  akhiriRun: (id, status, pesan) => {
    const runs = get().runs.map((r) =>
      r.id === id ? { ...r, selesai: Date.now(), status, pesan } : r,
    );
    set({ runs });
    simpan(get().tasks, runs);
  },

  bersihkanRiwayat: () => {
    set({ runs: [] });
    simpan(get().tasks, []);
  },
}));

/* Tugas yang sedang berjalan — penjaga supaya satu tugas tidak ditembak dua
   kali oleh tick berikutnya sebelum `send` selesai. */
const sedangJalan = new Set<string>();

/**
 * Jalankan satu tugas sekarang: buka chat baru di permukaan `agents`, kirim
 * prompt-nya, lalu catat hasilnya di Run History.
 */
export async function jalankanTugas(tugas: AutomationTask, sumber: 'manual' | 'jadwal') {
  if (sedangJalan.has(tugas.id)) return;
  sedangJalan.add(tugas.id);

  const run: AutomationRun = {
    id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: tugas.id,
    nama: tugas.nama,
    mulai: Date.now(),
    selesai: null,
    status: 'jalan',
    pesan: sumber === 'jadwal' ? 'Scheduled run' : 'Started manually',
  };
  useAutomation.getState().catatRun(run);

  try {
    const ai = useAi.getState();
    ai.newChat('agents');
    const ok = await ai.send(tugas.prompt, [], 'agents');
    useAutomation
      .getState()
      .akhiriRun(run.id, ok ? 'selesai' : 'gagal', ok ? undefined : 'The turn did not start.');
  } catch (e) {
    useAutomation
      .getState()
      .akhiriRun(run.id, 'gagal', e instanceof Error ? e.message : String(e));
  } finally {
    sedangJalan.delete(tugas.id);
  }
}

/**
 * Penjadwal: dicek tiap 30 detik selama jendela Agents hidup.
 *
 * Tugas yang jatuh tempo dijalankan berurutan (bukan serentak) supaya tidak
 * ada dua giliran AI yang saling menimpa di percakapan yang sama.
 */
export function useAutomationScheduler() {
  useEffect(() => {
    let batal = false;
    let antri: Promise<void> = Promise.resolve();

    const cek = () => {
      if (batal) return;
      const now = Date.now();
      const s = useAutomation.getState();
      for (const t of s.tasks) {
        if (!t.aktif || !t.berikut || t.berikut > now) continue;
        /* Jadwalkan dulu, baru jalankan: kalau run gagal, tugas tetap tidak
           menembak berulang setiap 30 detik. */
        s.ubah(t.id, { berikut: berikutRun(t, now + 1000) });
        antri = antri.then(() => jalankanTugas(t, 'jadwal')).catch(() => undefined);
      }
    };

    cek();
    const timer = setInterval(cek, 30_000);
    return () => {
      batal = true;
      clearInterval(timer);
    };
  }, []);
}
