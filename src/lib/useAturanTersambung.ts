/*
 * Wires the Rules SETTINGS to the Rules ENGINE.
 *
 * Without this the two halves never meet: `rulesRuntime` keeps its own `aktif`
 * flag and its own catalog, the settings store keeps `rules.enabled` and
 * `rules.disabled`, and nothing bridges them. The engine was correct, the UI was
 * correct, and the feature did nothing - a user could switch Rules on, watch the
 * toggle stay on, and no write was ever checked. That is the worst shape a
 * half-finished feature takes, because every individual piece passes its own
 * test.
 *
 * WHY A SUBSCRIPTION AND NOT AN EFFECT ON EACH CALL SITE
 *
 * The settings change from several places - the toggle, a reset, a settings file
 * reloaded from disk - and the engine is read from the write path, which is not
 * React. Driving the push from one subscription means there is exactly one place
 * that can be wrong, instead of one per caller that edits settings.
 *
 * It runs eagerly as well as on change: a settings file already on disk at start
 * must arm the engine before the first write, not after the first edit.
 */

import { useEffect } from 'react';
import { useStore } from './store';
import { setAturanAktif, setKatalog } from './rulesRuntime';
import { RULES_BAWAAN } from './rulesCatalog';
import type { RuleDef } from './rulesEngine';

/**
 * Apply one settings snapshot to the engine. Pure, and exported so the harness can
 * test it without a running React tree.
 *
 * `disabled` is the list of ids switched OFF, so the catalog handed to the engine
 * is the shipped catalog minus those ids. Filtering here rather than inside the
 * engine keeps the engine's job to matching, and means the id list is interpreted
 * in exactly one place.
 *
 * An unknown id in `disabled` is ignored rather than rejected: a settings file
 * written by a newer version may name a rule this build does not have, and that
 * must not throw during startup.
 */
export function terapkanSetelanAturan(aturan: { enabled?: boolean; disabled?: string[] } | undefined): void {
  const nyala = aturan?.enabled === true;
  setAturanAktif(nyala);

  /* Always install the catalog, even when the check is off: the settings screen
     reads `katalogAktif()` to draw its list, and a screen that shows nothing
     until the user enables the feature cannot be used to decide whether to. */
  const mati = new Set(aturan?.disabled ?? []);
  const dipilih: RuleDef[] = RULES_BAWAAN.filter((r) => !mati.has(r.id));
  setKatalog(dipilih);
}

export function useAturanTersambung(): void {
  useEffect(() => {
    /* The current value first, so an install that already has Rules enabled is
       armed before anything is written - a subscription alone would wait for the
       next change, which may never come. */
    const awal = useStore.getState().settings?.rules;
    terapkanSetelanAturan(awal);

    /* Then every later change. `subscribe` fires on ANY state change, so the
       previous value is kept and compared - otherwise this would recompile the
       catalog on every keystroke in Settings. */
    let terakhir = JSON.stringify(awal ?? {});
    const buka = useStore.subscribe((s) => {
      const sekarang = s.settings?.rules;
      const kunci = JSON.stringify(sekarang ?? {});
      if (kunci === terakhir) return;
      terakhir = kunci;
      terapkanSetelanAturan(sekarang);
    });
    return buka;
  }, []);
}
