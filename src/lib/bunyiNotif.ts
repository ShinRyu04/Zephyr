/*
 * The notification SOUND — a tone synthesised at runtime, not an audio file.
 *
 * ## Why synthesised
 *
 * Three different sounds are needed (finished, waiting for the reader, stopped
 * abnormally) and a reader can pick one per outcome. Shipping audio files would
 * mean three binaries per choice, a loader, a decode step, and a fallback path
 * for a codec the platform does not have — for a 200ms blip. Two oscillators and
 * a gain envelope do the same job with nothing to load and nothing to fail.
 *
 * ## Why the volume is a real multiplier
 *
 * `notifVolume` is a setting the reader moves, so it has to reach the actual
 * output gain. A slider that only changes a number in a store is the exact
 * "fake control" this page was built to avoid. The envelope multiplies by
 * `volume / 100` at the END, after the per-sound shape, so the shape stays
 * audible at low volume instead of being clipped into silence.
 *
 * ## Why failures are silent
 *
 * Autoplay policy can leave an AudioContext suspended until a gesture; a machine
 * with no audio device can refuse the context entirely. Neither is an error in
 * Zephyr — the run still finished, and the transcript still says so. A sound is
 * a courtesy, never the source of truth.
 */

/** A tone shape. The first three are the outcome defaults; the last two are the
 *  reader's explicit choices, which must sound DIFFERENT from the defaults — a
 *  named option that plays the default tone is a control that lies. */
export type Nada = 'selesai' | 'menunggu' | 'berhenti' | 'chime' | 'bell';

/*
 * One shared context, created lazily.
 *
 * Browsers cap the number of AudioContexts a page may create (Chrome allows a
 * few dozen), and creating one per notification would eventually refuse to make
 * another — so a long session would go silent for a reason that has nothing to
 * do with the reader's settings. One context, reused.
 */
let ctx: AudioContext | null = null;

function konteks(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/*
 * The three shapes, as [frequency, start offset, duration] triples.
 *
 * Deliberately short and distinguishable without looking:
 *   selesai   two rising notes — "done", the shape everyone already reads as
 *             completion.
 *   menunggu  two notes at the SAME pitch — it repeats rather than resolves, so
 *             it reads as "still your turn" instead of "finished".
 *   berhenti  one falling note — it ends lower than it started, which is the
 *             only one of the three that sounds unfinished.
 */
const BENTUK: Record<Nada, Array<[number, number, number]>> = {
  selesai: [
    [784, 0, 0.1], // G5
    [1046, 0.11, 0.16], // C6
  ],
  menunggu: [
    [659, 0, 0.11], // E5
    [659, 0.16, 0.11],
  ],
  berhenti: [
    [523, 0, 0.12], // C5
    [392, 0.13, 0.2], // G4
  ],
  /*
   * The two NAMED sounds are deliberately not the same shapes as the defaults.
   *
   * If `chime` played the `selesai` shape, picking it would change nothing and
   * the option would be decoration. These are different intervals, not different
   * volumes: a chime is a rising fourth with a longer tail, a bell is a single
   * struck note with a slow decay.
   */
  chime: [
    [587, 0, 0.1], // D5
    [880, 0.1, 0.1], // A5
    [1174, 0.2, 0.3], // D6
  ],
  bell: [
    [1046, 0, 0.5], // C6, one struck note
  ],
};

/**
 * Play one outcome sound at `volume` percent.
 *
 * Returns whether a sound was actually scheduled — the harness asserts on this
 * rather than on "the function was called", because a function that runs and
 * schedules nothing is exactly the failure this needs to catch.
 */
export function mainkanNada(nada: Nada, volume: number): boolean {
  const ak = konteks();
  if (!ak) return false;
  const v = Math.max(0, Math.min(100, Number(volume) || 0)) / 100;
  if (v <= 0) return false;

  /*
   * A suspended context (no user gesture yet) cannot schedule sound. Resuming is
   * attempted, but the notes below are scheduled regardless: if the resume
   * succeeds within the current task they play, and if it does not the platform
   * has simply decided this page may not make noise yet — not our failure.
   */
  if (ak.state === 'suspended') void ak.resume().catch(() => {});

  const mulai = ak.currentTime + 0.01;
  let dijadwalkan = 0;

  for (const [frekuensi, offset, durasi] of BENTUK[nada]) {
    const osc = ak.createOscillator();
    const gain = ak.createGain();
    osc.type = 'sine';
    osc.frequency.value = frekuensi;

    /*
     * A short attack and a longer release. A square-edged gate on a sine clicks
     * audibly, and the click is louder than the tone at low volume — so the
     * envelope is what makes a quiet notification actually quiet rather than
     * harsh.
     */
    const t0 = mulai + offset;
    const t1 = t0 + durasi;
    const puncak = 0.22 * v;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(puncak, 0.0002), t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);

    osc.connect(gain);
    gain.connect(ak.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
    dijadwalkan++;
  }

  return dijadwalkan > 0;
}

/*
 * The tone a configured sound name maps to, or `null` for "play nothing".
 *
 * `null` rather than a fallback tone is the whole point: `none` is a choice the
 * reader made, and treating it as "no preference" would make the only way to
 * silence a notification a setting that does not silence it. `chime` and `bell`
 * are distinct on purpose too — two names for one tone is a control that lies
 * about what it does.
 */
export function nadaDariNama(nama: string, bawaan: Nada): Nada | null {
  switch (nama) {
    case 'none':
      return null;
    case 'chime':
      return 'chime';
    case 'bell':
      return 'bell';
    case 'default':
    default:
      return bawaan;
  }
}
