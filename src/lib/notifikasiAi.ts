/*
 * Notify when a long AI run finishes while the reader is looking elsewhere.
 *
 * ## The problem this solves
 *
 * An agent run can take minutes. The reader starts it, switches to another
 * application, and has no way to know it is done - so they either sit watching a
 * spinner or come back much later to a result they could have acted on at once.
 *
 * ## Why it only fires when the window is NOT focused
 *
 * A notification for something already on screen is noise. If Zephyr has focus,
 * the finished bubble is right there; a toast on top of it is the kind of
 * "helpfulness" that makes people turn notifications off entirely. So the gate is
 * `document.hasFocus()`, not a timer or a preference.
 *
 * ## Why failures are silent
 *
 * The OS may refuse (permission, focus assist, no notification daemon on a bare
 * Linux box). That is not an error in Zephyr and must never be reported as one -
 * the run still finished and the transcript still says so. The notification is a
 * courtesy, never the source of truth.
 */
import { notifyShow } from './commands';
import { useStore } from './store';
import { nadaDariNama } from './bunyiNotif';
import type { Nada } from './bunyiNotif';

/**
 * How a run ended, from the reader's point of view.
 *
 * `selesai` — it finished and the answer is there.
 * `menunggu` — it stopped because it needs a decision from the reader (a
 *   confirmation, a question, an approval).
 * `berhenti` — it stopped without producing an answer: an error, or a cancel.
 *
 * These are separate because the three SOUND settings are separate. A single
 * "finished" tone for all three would make the one thing the reader cannot see
 * from another window — whether the run needs them — invisible.
 */
export type HasilRun = 'selesai' | 'menunggu' | 'berhenti';


/** Runs shorter than this are not worth a notification - they are over before
 *  the reader has looked away, and the toast would arrive after they are back.
 *  The reader's own choice (Settings > Conversation > Notify Only for Long
 *  Tasks) overrides it. */
const AMBANG_MS = 5_000;

function ambangDariSetelan(nilai: string | undefined): number {
  if (nilai === 'always') return 0;
  if (nilai === '20s') return 20_000;
  return AMBANG_MS;
}

/** One run in flight, tracked per composer so parallel chats do not collide. */
const mulai = new Map<string, number>();

/**
 * The decision log, newest last, bounded to the last few entries.
 *
 * Declared ABOVE `catatSelesaiRun` on purpose. It used to sit near the bottom of
 * the file, after `catatSelesaiRun` had already been called from the agent exit
 * path: the very first decision therefore threw (the array was still in its
 * temporal dead zone), the throw escaped the caller, and the notification path
 * died silently - the toast never appeared. A module-level `const` is only
 * initialised when its statement runs, not when the function that uses it is
 * defined.
 */
const riwayat: Array<{ judul: string; isi: string; fokus: boolean; lama: number }> = [];
export const riwayatNotifikasi = () => riwayat.slice();

function catatRiwayat(judul: string, isi: string, fokus: boolean, lama: number): void {
  riwayat.push({ judul, isi, fokus, lama });
  if (riwayat.length > 10) riwayat.shift();
}

/**
 * Mark the start of a run.
 *
 * Called where `agentBusy` becomes true. Cheap: one Map write, no timers.
 */
export function catatMulaiRun(id: string, ms = Date.now()): void {
  mulai.set(id, ms);
}

/**
 * Mark the end of a run, and notify if it qualifies.
 *
 * Qualifies when the run was long enough AND the window is not focused. The
 * title/body are short on purpose: a notification is read at a glance from
 * another application, and a paragraph there is unreadable.
 */
export function catatSelesaiRun(id: string, judul: string, ringkas: string, hasil?: HasilRun): void {
  const awal = mulai.get(id);
  mulai.delete(id);
  if (awal === undefined) return;

  const lama = Date.now() - awal;
  const fokus = typeof document !== 'undefined' && document.hasFocus();

  /*
   * Record the decision BEFORE the length/focus gate so the harness can tell
   * "skipped because short" from "skipped because focused" - and so a probe can
   * prove the gate runs at all.
   */
  catatRiwayat(judul.trim().slice(0, 80) || 'Zephyr', ringkas.trim().slice(0, 140), fokus, lama);

  /*
   * The reader's own choices, read HERE rather than passed in.
   *
   * `catatSelesaiRun` is called from the agent exit path, which already carries
   * enough arguments; threading three more settings through it would make every
   * call site responsible for a policy that belongs to this module. Reading the
   * store at the moment of the decision also means a setting changed DURING a
   * long run is honoured, which is what the reader expects when they turn sound
   * off and then watch a run finish.
   */
  const conv = useStore.getState().settings.conversation;

  if (lama < ambangDariSetelan(conv?.notifAmbang)) return;

  /* Already looking at it: the transcript is the notification. */
  if (fokus) return;

  const menit = Math.round(lama / 60_000);
  const isi = ringkas.trim().slice(0, 140);
  const badan = [isi, menit >= 1 ? `(${menit}m)` : ''].filter(Boolean).join(' ');

  const hasilAkhir: HasilRun = hasil ?? 'selesai';

  const bolehBanner = conv?.notifBanner !== false;
  const bolehBunyi = conv?.notifSound === true;

  if (bolehBanner) {
    void tampilkanBanner(judul.trim().slice(0, 80) || 'Zephyr', badan);
  }

  if (bolehBunyi) {
    /*
     * The three outcome names are separate settings because they mean different
     * things to a reader who has stepped away: "finished" is good news,
     * "waiting for you" needs action, and "stopped abnormally" needs a look at
     * the error. One shared tone would make the only signal available the one
     * thing they cannot see from another window.
     */
    const nama =
      hasilAkhir === 'menunggu'
        ? (conv?.soundWaiting ?? 'default')
        : hasilAkhir === 'berhenti'
          ? (conv?.soundStopped ?? 'default')
          : (conv?.soundCompleted ?? 'default');
    const bawaan: Nada = hasilAkhir === 'menunggu' ? 'menunggu' : hasilAkhir === 'berhenti' ? 'berhenti' : 'selesai';
    const nada = nadaDariNama(nama, bawaan);
    if (nada) {
      void import('./bunyiNotif').then((m) => {
        m.mainkanNada(nada, conv?.notifVolume ?? 100);
        catatBunyi(nada, conv?.notifVolume ?? 100);
      });
    } else {
      catatBunyi(null, 0);
    }
  }
}

/**
 * Show one banner through the best available path.
 *
 * The Tauri plugin is preferred because Windows then attributes the toast to
 * Zephyr and keeps it in the notification centre; the PowerShell fallback stays
 * for a build where the plugin is unavailable or permission was never granted.
 * When both refuse, an in-app toast is still worth raising - the reader at the
 * desk sees it, and the transcript remains the source of truth either way.
 */
async function tampilkanBanner(judul: string, badan: string): Promise<boolean> {
  try {
    const n = await import('@tauri-apps/plugin-notification');
    /*
     * Never prompt from here. The permission dialog belongs to the explicit
     * Settings action, not to a run finishing at an arbitrary moment; a prompt
     * nobody asked for is exactly what this module promises not to do.
     */
    if (await n.isPermissionGranted()) {
      await n.sendNotification({ title: judul, body: badan });
      return true;
    }
  } catch {
    /* plugin missing/permission store unavailable: fall through */
  }

  try {
    if (await notifyShow(judul, badan)) return true;
  } catch {
    /* Rust command unavailable: fall through */
  }

  try {
    const { notifyInfo } = await import('./notificationStore');
    notifyInfo(judul, { detail: badan, source: 'AI run' });
  } catch {
    /* A notification is a courtesy; the transcript still shows the result. */
  }
  return false;
}

/** Ask for the OS notification permission. Only Settings calls this. */
export async function mintaIzinNotifikasi(): Promise<
  'granted' | 'denied' | 'default' | 'unavailable'
> {
  try {
    const n = await import('@tauri-apps/plugin-notification');
    if (await n.isPermissionGranted()) return 'granted';
    return await n.requestPermission();
  } catch {
    return 'unavailable';
  }
}

/** Fire a test banner through the same path a finished run uses. */
export async function ujiNotifikasi(): Promise<boolean> {
  return tampilkanBanner('Zephyr', 'Notifications are working.');
}

/** Forget a run that was cancelled before it finished. */
export function lupakanRun(id: string): void {
  mulai.delete(id);
}

/**
 * Sound the "needs you" tone while the run is PARKED, not when it exits.
 *
 * A run that stops on a question or a confirmation has not finished — the loop
 * is awaiting an answer and the reader may be in another window, waiting for a
 * completion that will not come. Sounding this at the exit path would be too
 * late (the run has not exited) and sounding the "finished" tone would be a
 * lie. So it is its own entry point, called at the moment the run parks.
 *
 * Deliberately NOT gated on `document.hasFocus()`: unlike a completion, this
 * one is only useful if the reader is elsewhere. When the window is focused the
 * card is already on screen and there is nothing to fetch them back for.
 */
export function bunyiMenunggu(): void {
  const conv = useStore.getState().settings.conversation;
  if (conv?.notifSound !== true) return;
  if (typeof document !== 'undefined' && document.hasFocus()) return;
  const nada = nadaDariNama(conv?.soundWaiting ?? 'default', 'menunggu');
  if (!nada) {
    catatBunyi(null, 0);
    return;
  }
  const volume = conv?.notifVolume ?? 100;
  void import('./bunyiNotif').then((m) => {
    m.mainkanNada(nada, volume);
    catatBunyi(nada, volume);
  });
}

/** How many runs are being tracked - for the harness, and for honesty. */
export const jumlahRunDilacak = (): number => mulai.size;

/**
 * The last sound this module decided to play, for the harness.
 *
 * Same reasoning as `riwayatNotifikasi`: the tone is produced by the audio
 * device, so nothing in the page can observe it. Recording the DECISION —
 * which tone, at what volume, or `null` for "the reader chose None" — is what
 * lets a probe assert that the Sound switch and the per-outcome choice actually
 * reach the output instead of stopping at a store field.
 */
const riwayatBunyi: Array<{ nada: Nada | null; volume: number; at: number }> = [];
export const riwayatBunyiNotif = () => riwayatBunyi.slice();

function catatBunyi(nada: Nada | null, volume: number): void {
  riwayatBunyi.push({ nada, volume, at: Date.now() });
  if (riwayatBunyi.length > 10) riwayatBunyi.shift();
}
