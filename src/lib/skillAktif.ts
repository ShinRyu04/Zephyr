/*
 * skillAktif.ts — which skills the agent is allowed to be offered.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The Skills page in Agent Customizations carries one switch per skill, and a
 * switch that changes nothing is worse than no switch at all: the reader turns a
 * skill off, sends a message, and the agent still opens it. What the agent
 * actually reads is the "AVAILABLE SKILLS" block that Rust assembles
 * (`skills.rs::ringkasan_untuk_prompt`) and that `aiStore.konteksAgent()`
 * appends to the prompt. That block is filtered in ONE place — the boundary
 * where the Rust text becomes the prompt — and the `skill_view` tool refuses a
 * skill that is off, so an off skill cannot be reached through the back door
 * either.
 *
 * WHY THE STATE LIVES IN localStorage AND NOT IN THE SKILL FILE
 * ------------------------------------------------------------
 * This flag belongs to the READER, not to the skill. A workspace skill is a file
 * in the repo: writing `enabled: false` into its frontmatter would make turning
 * a skill off dirty someone else's git checkout — a personal preference leaking
 * into a shared file. The skill NAME is the key (lower-cased), and names are
 * unique across scopes because `daftar_skills` already drops duplicates.
 *
 * WHY THE FILTER IS A PURE FUNCTION
 * ---------------------------------
 * `saringBlokSkill()` takes text and returns text. No store, no DOM, no clock —
 * so `scripts/uji-skill-aktif.mjs` can prove it on a fixture block in plain Node
 * instead of needing the app, a provider, or a paid run.
 *
 * AN EMPTY STORE MEANS "EVERYTHING IS ON". Absence of a name is the on state, so
 * an install that never touched the switches behaves exactly as before.
 */

/** localStorage key holding the names of the skills that are switched OFF. */
export const KUNCI_NONAKTIF = 'zephyr.skills.nonaktif';

/**
 * The storage this module needs, narrowed to two calls.
 *
 * Injected rather than reaching for `localStorage` directly so the harness can
 * pass a plain object — the module then has no browser dependency at all.
 */
export interface GudangAktif {
  baca(): string | null;
  tulis(teks: string): void;
}

function gudangDefault(): GudangAktif {
  return {
    baca() {
      try {
        return localStorage.getItem(KUNCI_NONAKTIF);
      } catch {
        /* Private mode, or a WebView with storage denied: "everything is on". */
        return null;
      }
    },
    tulis(teks) {
      try {
        localStorage.setItem(KUNCI_NONAKTIF, teks);
      } catch {
        /* The switch still works for this session; it just will not survive it. */
      }
    },
  };
}

/**
 * Read the off list.
 *
 * Tolerant in ONE direction only: anything that is not a JSON array of names —
 * unparsable text, a JSON object, a number — reads as "nothing is off", which is
 * the safe direction. A corrupted preference must not take the Skills page (or
 * the prompt) down with it, and it must not invent a name to switch off either:
 * a lenient reader that splits arbitrary text into names would silently disable
 * a skill whose name it guessed.
 */
export function bacaNonaktif(g: GudangAktif = gudangDefault()): string[] {
  const mentah = g.baca();
  if (!mentah) return [];
  let nilai: unknown;
  try {
    nilai = JSON.parse(mentah);
  } catch {
    return [];
  }
  if (!Array.isArray(nilai)) return [];
  const bersih = nilai
    .map((n) => String(n ?? '').trim().toLowerCase())
    .filter(Boolean);
  /* Deduplicated and sorted: two writes of the same set produce the same text,
     so a stored value can be compared and diffed instead of only inspected. */
  return [...new Set(bersih)].sort();
}


export function tulisNonaktif(daftar: Iterable<string>, g: GudangAktif = gudangDefault()): string[] {
  const bersih = [...new Set([...daftar].map((n) => String(n ?? '').trim().toLowerCase()).filter(Boolean))].sort();
  g.tulis(JSON.stringify(bersih));
  return bersih;
}

/**
 * Turn one skill on or off and return the whole new off list.
 *
 * Returning the list (instead of void) lets the store put it straight into its
 * state, so every row re-renders from one source and two rows can never disagree
 * about what is off.
 */
export function setAktifNama(
  nama: string,
  aktif: boolean,
  g: GudangAktif = gudangDefault(),
): string[] {
  const kunci = String(nama ?? '').trim().toLowerCase();
  if (!kunci) return bacaNonaktif(g);
  const sekarang = new Set(bacaNonaktif(g));
  if (aktif) sekarang.delete(kunci);
  else sekarang.add(kunci);
  return tulisNonaktif(sekarang, g);
}

/** The off list as a set, for membership tests in hot paths. */
export function nonaktifSet(daftar: Iterable<string>): Set<string> {
  return new Set([...daftar].map((n) => String(n ?? '').trim().toLowerCase()).filter(Boolean));
}

/**
 * One line of the Rust skill block: `- <name> [<scope>]: <description>`.
 *
 * Anchored this tightly so it cannot touch a MEMORY line, which has a different
 * shape (`- [2026-10-13] global / keputusan: …`) and lives in the same string.
 */
const RE_BARIS_SKILL = /^- (.+?) \[(?:workspace|global)\]:/;

/**
 * Remove the off skills from the Rust context block.
 *
 * Rules, each with a reason:
 *
 *   - No header (`AVAILABLE SKILLS`) means this is not the skills block — the
 *     text is returned UNTOUCHED. The memory block shares this string, and
 *     filtering text whose shape we do not recognise is how a filter starts
 *     eating things it was never meant to see.
 *   - Removing every skill also removes the header. A header with no rows would
 *     tell the model that skills exist and that none are listed, which is a
 *     different claim from "you have no skills switched on".
 *   - An empty off list is a no-op, so the common path costs nothing.
 */
export function saringBlokSkill(teks: string, nonaktif: Iterable<string>): string {
  const mati = nonaktifSet(nonaktif);
  if (!teks || mati.size === 0) return teks;
  const baris = teks.split('\n');
  const kepala = baris.findIndex((l) => l.includes('AVAILABLE SKILLS'));
  if (kepala < 0) return teks;

  const keluar: string[] = [];
  let dibuang = 0;
  for (let i = 0; i < baris.length; i++) {
    const cocok = i > kepala ? RE_BARIS_SKILL.exec(baris[i]) : null;
    if (cocok && mati.has(cocok[1].trim().toLowerCase())) {
      dibuang += 1;
      continue;
    }
    keluar.push(baris[i]);
  }
  if (dibuang === 0) return teks;

  const masihAdaBaris = keluar.slice(kepala + 1).some((l) => RE_BARIS_SKILL.test(l));
  if (masihAdaBaris) return keluar.join('\n');

  const sebelum = keluar.slice(0, kepala).join('\n').replace(/\s+$/, '');
  const sesudah = keluar
    .slice(kepala + 1)
    .filter((l) => l.trim())
    .join('\n');
  return [sebelum, sesudah].filter(Boolean).join('\n\n');
}
