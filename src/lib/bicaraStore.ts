/*
 * The one speech engine for the whole AI panel.
 *
 * WHY THIS IS A STORE AND NOT A HOOK PER MESSAGE
 *
 * `window.speechSynthesis` is a single global queue, not one per component. If
 * every message owned its own hook, all of them would be issuing `speak()` and
 * `cancel()` against that one shared queue - so pressing speak on answer #2 while
 * #1 is being read would either layer both voices on top of each other or cancel
 * #1 with no way to say which. The user's mental model is "the panel is talking",
 * so the state lives somewhere that matches: one place, holding which message is
 * being read.
 *
 * `idBicara` is that answer. A row asks `idBicara === myId`, which makes "who is
 * talking" impossible to get wrong and lets every other row fall back to its
 * silent state with no per-message bookkeeping.
 *
 * The engine itself is `useBicara`, which owns the chunking and the WebView
 * quirks. This file is only the shared-state layer around it.
 */

import { create } from 'zustand';
import type { Suara } from './useBicara';

export interface OpsiBicara {
  /** Platform voice URI. Empty means the engine's default. */
  id?: string;
  lang?: string;
  rate?: number;
  volume?: number;
}

/** What a host component installs, so the store can drive the real engine. */
interface Mesin {
  mulai: (teks: string, opsi?: OpsiBicara) => void;
  berhenti: () => void;
  bisa: boolean;
  suara: Suara[];
}

interface BicaraStore {
  /** The message being read aloud right now, or null when nothing is speaking. */
  idBicara: string | null;
  /** What the platform offers, published so the settings picker can list it. */
  suara: Suara[];
  /** Whether the platform can speak at all. */
  bisa: boolean;
  /** Read this message, or stop if it is the one already speaking. */
  bicarakan: (id: string, teks: string, opsi?: OpsiBicara) => void;
  /** Stop whatever is speaking. */
  hentikan: () => void;
  /** Called by the host when speech drains naturally. Not for callers. */
  selesaiSendiri: () => void;
  mesin: Mesin | null;
  setMesin: (m: Mesin) => void;
}

export const useBicaraStore = create<BicaraStore>((set, get) => ({
  idBicara: null,
  suara: [],
  bisa: false,
  mesin: null,

  bicarakan: (id, teks, opsi) => {
    /* A second press on the message already talking means stop. That is the only
       sensible reading of the second press, and it is what lets ONE button serve
       as both play and stop instead of crowding the row with two controls. */
    if (get().idBicara === id) { get().hentikan(); return; }
    const { mesin } = get();
    if (!mesin) return;
    set({ idBicara: id });
    mesin.mulai(teks, opsi);
  },

  hentikan: () => {
    get().mesin?.berhenti();
    set({ idBicara: null });
  },

  /*
   * Called only when speech drains on its own.
   *
   * NOT on a user stop: pressing Stop on a long answer must silence the row at
   * once, and if "finished" and "stopped" were one signal, anything that reads
   * the next message automatically would start talking again the instant the
   * user asked for quiet.
   */
  selesaiSendiri: () => set({ idBicara: null }),

  setMesin: (m) => set({ mesin: m, bisa: m.bisa, suara: m.suara }),
}));
