/**
 * Proses latar (`bash_job`) - shell yang dilepas supaya agen tidak menunggu.
 *
 * ## Kenapa berkas ini ada
 *
 * `bash_run` menunggu sampai perintah selesai, dan memang itu yang diinginkan
 * untuk kebanyakan perintah. Tapi sebagian pekerjaan memang tidak pernah
 * "selesai" dalam arti itu: dev server, watcher, `npm run build -- --watch`,
 * test suite panjang. Dulu model disuruh melepasnya lewat `start`/`&` di dalam
 * perintahnya sendiri, dan hasilnya selalu sama: model tidak bisa membaca
 * keluarannya lagi, tidak tahu kapan selesai, dan tidak bisa menghentikannya.
 *
 * Di sini pekerjaan itu punya identitas (`job-1`, `job-2`, ...), pane PTY
 * sendiri, dan penanda selesai yang tidak bisa muncul karena kebetulan:
 * pangsa shell menulis `echo __ZEPHYR_JOB_DONE_<token>__` SETELAH perintahnya,
 * jadi penanda hanya ada kalau perintahnya benar-benar berakhir.
 *
 * ## Kenapa PTY, bukan `agent_exec`
 *
 * `agent_exec` menunggu prosesnya (itulah gunanya), jadi ia tidak bisa
 * melepaskan proses panjang. PTY bisa: `pty_spawn` mengembalikan segera, dan
 * pane tetap hidup sesudah panggilan tool berakhir karena pemiliknya store ini,
 * bukan satu giliran agen.
 *
 * ## Batas yang dipegang
 *
 * - Paling banyak `MAKS_AKTIF` job berjalan. Tanpa batas, satu model yang
 *   mengulang perintah bisa menghabiskan memori mesin sebelum ada yang sadar.
 * - `MAKS_SELESAI` job selesai disimpan; yang tertua dibuang lebih dulu. Job
 *   yang dibuang tetap bisa dibaca pane-nya lewat terminal, tapi `bash_job` tidak
 *   lagi melaporkannya.
 * - Pane job ditutup saat job dihentikan, supaya tidak ada proses yatim yang
 *   terus menulis ke memori tanpa ada yang membacanya.
 */
import { create } from 'zustand';
import * as cmd from './commands';
import { useTerminal } from './terminalStore';

export const MAKS_AKTIF = 4;
export const MAKS_SELESAI = 20;

export type StatusJob = 'jalan' | 'selesai' | 'berhenti' | 'keluar';

export interface Job {
  id: string;
  command: string;
  cwd: string | null;
  paneId: string;
  token: string;
  status: StatusJob;
  mulai: number;
  selesai?: number;
  /** Baris penanda terakhir yang sudah diperiksa (agar baca ulang tidak dobel). */
  posisi: number;
  /** Keluaran yang sudah dipanen, tanpa ANSI. */
  keluaran: string;
  keterangan?: string;
}

interface JobsState {
  jobs: Job[];
  nomor: number;
}

interface JobsActions {
  mulai: (command: string, opts?: { cwd?: string | null; kind?: 'shell' | 'private' }) => Promise<Job>;
  refresh: (id: string) => Promise<Job | undefined>;
  refreshSemua: () => Promise<Job[]>;
  stop: (id: string) => Promise<Job | undefined>;
  hapus: (id: string) => Promise<boolean>;
  bersihkanSelesai: (id?: string) => Promise<number>;
  cari: (id: string) => Job | undefined;
}

export type JobsStore = JobsState & JobsActions;

/**
 * ANSI dibuang sebelum keluaran disimpan.
 *
 * Scrollback PTY penuh urutan escape (warna, judul jendela, kurung kurawal
 * OSC 633 milik integrasi shell). Model tidak bisa membaca urutan itu, dan
 * membiarkannya membuat keluaran 3-4x lebih panjang dari isinya.
 */
const RE_ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

export function tanpaAnsi(teks: string): string {
  return teks.replace(RE_ANSI, '').replace(/\r/g, '');
}

function tokenBaru(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function buangTerlama(jobs: Job[]): Job[] {
  const selesai = jobs.filter((j) => j.status !== 'jalan');
  if (selesai.length <= MAKS_SELESAI) return jobs;
  const buang = new Set(selesai.slice(0, selesai.length - MAKS_SELESAI).map((j) => j.id));
  return jobs.filter((j) => !buang.has(j.id));
}

export const useJobs = create<JobsStore>((set, get) => ({
  jobs: [],
  nomor: 0,

  cari: (id) => get().jobs.find((j) => j.id === id),

  mulai: async (command, opts) => {
    const aktif = get().jobs.filter((j) => j.status === 'jalan');
    if (aktif.length >= MAKS_AKTIF) {
      throw new Error(
        `ERROR: sudah ada ${aktif.length} proses latar berjalan (${aktif
          .map((j) => j.id)
          .join(', ')}). Hentikan atau bersihkan dulu sebelum menambah yang baru.`,
      );
    }

    const cwd = opts?.cwd ?? null;
    const paneId = await useTerminal.getState().addPane(opts?.kind === 'private' ? 'private' : 'shell', {
      cwd: cwd ?? undefined,
    });
    const cwdPane = cwd ?? useTerminal.getState().findPane(paneId ?? '')?.cwd ?? null;
    if (!paneId) throw new Error('ERROR: tidak bisa membuat terminal untuk proses latar.');

    const nomor = get().nomor + 1;
    const id = `job-${nomor}`;
    const token = `__ZEPHYR_JOB_DONE_${tokenBaru()}__`;

    /*
     * Tidak ada `&` di sini: shell menulis perintah ini ke baris perintahnya
     * sendiri, dan penanda baru tercetak setelah perintahnya benar-benar
     * kembali ke prompt. `$LASTEXITCODE`/`$?` sengaja tidak dipakai - yang
     * dibutuhkan hanyalah "sudah selesai atau belum".
     */
    await cmd.ptyWrite(paneId, `${command}; echo ${token}\r`);

    const job: Job = {
      id,
      command,
      cwd: cwdPane,
      paneId,
      token,
      status: 'jalan',
      mulai: Date.now(),
      posisi: 0,
      keluaran: '',
    };

    set((s) => ({ nomor, jobs: buangTerlama([...s.jobs, job]) }));
    return job;
  },

  refresh: async (id) => {
    const job = get().cari(id);
    if (!job) return undefined;

    let hidup = true;
    try {
      const daftar = await cmd.ptyList();
      hidup = daftar.some((p) => p.id === job.paneId && p.alive);
    } catch {
      /* Backend tidak bisa ditanya: anggap hidup, biar penanda yang memutuskan. */
    }

    let teks = '';
    try {
      teks = await cmd.ptyTail(job.paneId, 400);
    } catch {
      teks = '';
    }

    const bersih = tanpaAnsi(teks);
    let status: StatusJob = job.status;
    let keterangan = job.keterangan;
    let keluaran = job.keluaran;

    const di = bersih.indexOf(job.token);
    if (di >= 0) {
      /* Semua yang tercetak sebelum penanda adalah keluaran perintah ini
         (ditambah gema baris perintah, yang tidak bisa dibedakan dari sini). */
      const bagian = bersih.slice(0, di).trimEnd();
      keluaran = bagian;
      status = 'selesai';
      keterangan = undefined;
    } else if (!hidup) {
      status = 'keluar';
      keterangan = 'Pane proses latar sudah tidak hidup (bisa karena crash atau ditutup).';
      keluaran = bersih.trimEnd();
    } else {
      keluaran = bersih.trimEnd();
    }

    const baru: Job = {
      ...job,
      status,
      keterangan,
      keluaran,
      posisi: bersih.length,
      selesai: status === 'jalan' ? undefined : (job.selesai ?? Date.now()),
    };
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? baru : j)) }));
    return baru;
  },

  refreshSemua: async () => {
    const aktif = get().jobs.filter((j) => j.status === 'jalan');
    for (const j of aktif) await get().refresh(j.id);
    return get().jobs;
  },

  stop: async (id) => {
    const job = get().cari(id);
    if (!job) return undefined;
    if (job.status === 'jalan') {
      await cmd.ptyInterrupt(job.paneId).catch(() => 0);
      await new Promise((r) => setTimeout(r, 300));
    }
    const teks = await cmd.ptyTail(job.paneId, 400).catch(() => '');
    await cmd.ptyKill(job.paneId).catch(() => undefined);
    await useTerminal
      .getState()
      .closePane(job.paneId)
      .catch(() => undefined);

    const baru: Job = {
      ...job,
      status: 'berhenti',
      selesai: Date.now(),
      keluaran: tanpaAnsi(teks).replace(job.token, '').trimEnd(),
      keterangan: 'Dihentikan lewat bash_job.',
    };
    set((s) => ({ jobs: buangTerlama(s.jobs.map((j) => (j.id === id ? baru : j))) }));
    return baru;
  },

  hapus: async (id) => {
    const job = get().cari(id);
    if (!job) return false;
    if (job.status === 'jalan') await get().stop(id);
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));
    return true;
  },

  bersihkanSelesai: async (id) => {
    const target = id ? get().jobs.filter((j) => j.id === id) : get().jobs.filter((j) => j.status !== 'jalan');
    let n = 0;
    for (const j of target) {
      if (j.status === 'jalan') await get().stop(j.id);
      else {
        set((s) => ({ jobs: s.jobs.filter((x) => x.id !== j.id) }));
      }
      n += 1;
    }
    return n;
  },
}));
