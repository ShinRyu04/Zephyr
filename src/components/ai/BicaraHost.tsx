/*
 * Mounts the speech engine once and publishes it to the store.
 *
 * It has to be a component rather than something created inside the store,
 * because the engine is a React hook: `useBicara` subscribes to the platform's
 * `voiceschanged` event and must unsubscribe on unmount. A module-level
 * singleton would leak that subscription, and in dev - where React StrictMode
 * mounts everything twice - it would end up with two engines driving one
 * `speechSynthesis` queue, which is the exact duplication this store exists to
 * prevent.
 *
 * It renders nothing. It lives next to the transcript so the engine is only
 * alive while the AI panel is, and unmounting stops any speech still playing -
 * the alternative is an answer being read aloud after the panel is closed, with
 * no control left on screen to stop it.
 */

import { useEffect, useRef } from 'react';
import { useBicara } from '../../lib/useBicara';
import { useBicaraStore } from '../../lib/bicaraStore';

export default function BicaraHost() {
  const setMesin = useBicaraStore((s) => s.setMesin);
  const selesaiSendiri = useBicaraStore((s) => s.selesaiSendiri);

  const { bisa, suara, mulai, berhenti } = useBicara(selesaiSendiri);

  /*
   * Publish the engine, and re-publish when it changes.
   *
   * `mulai` and `berhenti` are stable (`useCallback` with no dependencies), but
   * `suara` is not: it fills in asynchronously when the platform announces its
   * voices. Copying it into the store each time the list changes is what lets the
   * settings picker stay empty-safe - it renders with what exists and gains the
   * full list when it arrives, rather than showing "no voices" forever because it
   * read the list before the platform had any.
   */
  const stabil = useRef({ mulai, berhenti });
  stabil.current = { mulai, berhenti };

  useEffect(() => {
    setMesin({ bisa, suara, mulai: stabil.current.mulai, berhenti: stabil.current.berhenti });
  }, [bisa, suara, setMesin]);

  return null;
}
