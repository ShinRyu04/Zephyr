/*
 * Settings > Rules.
 *
 * The write guard: a list of patterns that, when matched by a file about to be
 * written, REFUSES the write and tells the model what it hit. Twelve ship with
 * the app.
 *
 * WHY THE MASTER SWITCH READS THE WAY IT DOES
 *
 * This is the only setting in Zephyr that can refuse to save a user's work, so
 * the switch that arms it says plainly what happens, and it starts OFF. A user
 * who never opens this page must never have a write rejected - the failure mode
 * of a guard that is on by default is indistinguishable, from the user's side,
 * from the editor being broken.
 *
 * WHY `disabled` AND NOT `enabled`
 *
 * The stored list holds the rules switched OFF. Storing the negative means a rule
 * added in a future version arrives active instead of silently absent, and the
 * list stays short because most people disable two rules and leave ten alone.
 * The visible switch is still "on", because that is what a switch means.
 *
 * WHY EVERY ROW SHOWS ITS PATTERN
 *
 * A rule named "hardcoded-secret" is a promise, not an explanation. The user
 * decides which to arm by judging what each one matches, and they cannot judge a
 * name. The pattern is shown raw, monospaced, because it IS a regex and pretending
 * otherwise makes it harder to reason about.
 */

import { useMemo, useState } from 'react';
import { useT } from '../../lib/i18n';
import { useStore } from '../../lib/store';
import { RULES_BAWAAN } from '../../lib/rulesCatalog';
import type { RuleDef } from '../../lib/rulesEngine';
import { Section, Row, Toggle } from './SettingsControls';
import { katalogAktif } from '../../lib/rulesRuntime';

/* Severity order, so the rules that can REFUSE a write are read first. Matching
   the engine's own `SEVERITY_ORDER` - a different order here would sort the page
   one way and apply the rules another. */
const URUTAN: Record<string, number> = { block: 0, warn: 1, hint: 2 };

export default function RulesSection() {
  const tr = useT();
  const r = useStore((s) => s.settings?.rules);
  const patch = useStore((s) => s.applySettings);

  const aktif = r?.enabled === true;
  const mati = useMemo(() => new Set(r?.disabled ?? []), [r?.disabled]);

  /* Which rule is expanded to show its pattern. One at a time: the page is a
     list of twelve and opening all of them at once is a wall of regex. */
  const [buka, setBuka] = useState<string | null>(null);

  const daftar = useMemo(() => {
    /* Read the catalog the RUNTIME is using, not the import. If a user-authored
       catalog were ever installed, the page would otherwise show a list the
       engine does not have - a settings screen describing rules that do not
       exist is worse than no screen. */
    const katalog: RuleDef[] = katalogAktif() ?? RULES_BAWAAN;
    return [...katalog].sort(
      (a, b) => (URUTAN[a.severity] ?? 9) - (URUTAN[b.severity] ?? 9) || a.id.localeCompare(b.id),
    );
  }, []);

  const set = (bagian: NonNullable<typeof r>) => patch({ rules: bagian });

  const nyalakanSatu = (id: string, nyala: boolean) => {
    const tanpa = new Set(mati);
    if (nyala) tanpa.delete(id);
    else tanpa.add(id);
    set({ ...r, disabled: [...tanpa] });
  };

  const jumlahNyala = daftar.filter((d) => !mati.has(d.id)).length;

  return (
    <Section title={tr('Rules')}>
      <Row
        label={tr('Check writes against rules')}
        hint={tr('Patterns that refuse a save which looks like a mistake, naming what it matched. Off until you turn it on.')}
      >
        <Toggle
          label={tr('Check writes against rules')}
          testid="rules-enabled"
          checked={aktif}
          onChange={(on) => set({ ...r, enabled: on })}
        />
      </Row>

      {aktif && (
        <>
          <div className="set-h2 set-h2-sub" data-testid="rules-grup-daftar">
            {tr('Rules')}
            <span className="set-h2-hitung" data-testid="rules-hitung">
              {jumlahNyala}/{daftar.length}
            </span>
          </div>

          <div className="rules-daftar" data-testid="rules-daftar">
            {daftar.map((d) => {
              const nyala = !mati.has(d.id);
              const terbuka = buka === d.id;
              return (
                <div className="rules-baris" key={d.id} data-testid={`rule-${d.id}`} data-nyala={nyala}>
                  <div className="rules-baris-utama">
                    <Toggle
                      label={d.id}
                      testid={`rule-toggle-${d.id}`}
                      checked={nyala}
                      onChange={(on) => nyalakanSatu(d.id, on)}
                    />
                    <span className="rules-nama" title={d.id}>{d.id}</span>
                    {/* Severity as text, not only as colour: colour alone fails
                        for a user who cannot separate the two hues, and this is
                        the column that decides whether a write is refused. */}
                    <span className={'rules-tingkat rules-tingkat-' + d.severity} data-tingkat={d.severity}>
                      {d.severity === 'block' ? tr('refuses the write') : d.severity === 'warn' ? tr('warns') : tr('notes it')}
                    </span>
                    <button
                      className="rules-pola-btn"
                      data-testid={`rule-pola-${d.id}`}
                      aria-expanded={terbuka}
                      title={tr('Show the pattern')}
                      onClick={() => setBuka(terbuka ? null : d.id)}
                    >
                      {terbuka ? '\u25be' : '\u25b8'}
                    </button>
                  </div>
                  <div className="rules-pesan">{d.pesan}</div>
                  {terbuka && (
                    /* The raw regex, monospaced. Escaped by React, so a pattern
                       containing angle brackets is shown rather than parsed. */
                    <pre className="rules-pola" data-testid={`rule-pola-isi-${d.id}`}>{d.pattern}</pre>
                  )}
                </div>
              );
            })}
          </div>

          <Row
            label={tr('Rules loaded')}
            hint={tr('Compiled and ready. A rule whose pattern fails to compile is dropped rather than breaking every save.')}
          >
            <span className="set-num-akhir" data-testid="rules-jumlah">{String(daftar.length)}</span>
          </Row>
        </>
      )}
    </Section>
  );
}
