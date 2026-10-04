/*
 * The active rule set, kept separate from the engine and the catalog.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * `commands.ts` must be able to check a write without importing the store, the
 * settings UI, or the catalog of every rule - importing those from the write
 * path would drag the editor's whole dependency graph into the one function
 * that runs on every save. This module holds a compiled array and nothing else.
 *
 * The compiled rules are cached and only rebuilt when the compiled catalog
 * actually changes. Rebuilding on every save would be wasteful, but rebuilding
 * on every CALL would be worse than wasteful - it would re-run fourteen
 * `new RegExp` constructions per keystroke-triggered autosave.
 */

import { compileRules, type Rule, type RuleDef } from './rulesEngine';
import { RULES_BAWAAN } from './rulesCatalog';

let tersusun: Rule[] | null = null;
let katalogTerakhir: RuleDef[] | null = null;

/*
 * OFF until the user turns it on - and that was previously not true.
 *
 * `let mati = false` reads as "not disabled", but the flag is named for the
 * NEGATIVE, so `false` meant the guard was fully ARMED from the moment the app
 * opened: twelve rules blocking writes nobody had agreed to, and a user whose
 * file was refused had no way to know a feature they never enabled was doing it.
 * The old comment even said "Off by default" while the line below said otherwise,
 * which is how the contradiction survived - the comment was read, and the value
 * was not.
 *
 * `aktif` is the positive flag now, so the default IS the word in the comment and
 * the two cannot drift apart again.
 */
let aktif = false;

/** Every rule the app ships with, compiled once. */
export function aturanBawaan(): Rule[] {
  if (!tersusun) tersusun = compileRules(RULES_BAWAAN);
  return tersusun;
}

/**
 * The rules that should run right now.
 *
 * Returns an empty list when the user has switched the check off. Returning the
 * rules and letting the caller decide would risk one caller forgetting, and
 * "the check is off" has to hold on every write path.
 */
export function aturanAktif(): Rule[] {
  if (!aktif) return [];
  return aturanBawaan();
}

/** Whether the check runs at all. */
export function aturanMenyala(): boolean {
  return aktif;
}

/** Switch the check on or off. Off until the user turns it on. */
export function setAturanAktif(nyala: boolean): void {
  aktif = nyala;
}

/** Lets the settings screen replace the catalog, e.g. with user-authored rules. */
export function setKatalog(defs: RuleDef[]): void {
  katalogTerakhir = defs;
  tersusun = compileRules(defs);
}

/** The catalog currently in effect, for the settings screen to edit. */
export function katalogAktif(): RuleDef[] {
  return katalogTerakhir ?? RULES_BAWAAN;
}

/** How many rules are loaded and usable. Shown in settings. */
export function jumlahAturan(): number {
  return aturanBawaan().length;
}
