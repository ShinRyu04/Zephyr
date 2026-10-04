/*
 * A mechanical check that runs before text is written.
 *
 * The purpose is narrow and deliberate: catch a handful of patterns that are
 * harmful or unambiguously wrong, at the moment the text would land, and stop
 * the write when the pattern is severe enough. It is not a linter and does not
 * pretend to understand code - it matches text against explicit patterns the
 * user can read and change.
 *
 * WHY THIS IS MECHANICAL AND NOT CLEVER
 *
 * A check that guesses can be wrong in ways the user cannot predict, and a
 * wrong block on a legitimate write is far more damaging than a missed hint -
 * the user loses work. Every rule here is a pattern someone wrote down. When a
 * rule is wrong, it is wrong visibly, in a file that can be edited.
 *
 * WHY A BROKEN RULE IS DROPPED, NOT THROWN
 *
 * Rules are loaded at startup. A single bad regex that throws would take the
 * whole engine down, and it would do so while the user is trying to save -
 * turning a typo in an optional rule into "the editor cannot write files". A
 * rule that cannot compile is therefore skipped, and the rest keep working.
 */

export type Severity = 'block' | 'warn' | 'hint';

export type Rule = {
  id: string;
  severity: Severity;
  /** Empty means "every language". Compared against the language id, lowercase. */
  languages: string[];
  pattern: RegExp;
  pesan: string;
  saran?: string;
  /** When false, the match is discarded - used to excuse legitimate uses. */
  allow?: RegExp;
  /**
   * Set when the rule's subject IS a comment.
   *
   * Comments are stripped before matching so a rule cannot fire on its own
   * documentation. That default is right for code-shaped rules and wrong for
   * the handful that look for something inside comments - a leftover TODO is
   * only ever written in a comment. Without this flag those rules could never
   * match anything, and a rule that can never fire is indistinguishable from a
   * missing rule until someone notices the check is silent.
   */
  cariDiKomentar?: boolean;
};

export type Finding = {
  ruleId: string;
  severity: Severity;
  /** 1-based, so it can be shown to the user without translation. */
  baris: number;
  kolom: number;
  cuplikan: string;
  pesan: string;
  saran?: string;
};

/** A rule as it is written in the catalog: regex source as text, not compiled. */
export type RuleDef = {
  id: string;
  severity: Severity;
  languages?: string[];
  /** Regex SOURCE, so a bad pattern fails here instead of at module load. */
  pattern: string;
  flags?: string;
  allow?: string;
  pesan: string;
  saran?: string;
  /** See `Rule.cariDiKomentar` - set it when the rule looks for a comment. */
  cariDiKomentar?: boolean;
};

const SEVERITY_ORDER: Record<Severity, number> = { block: 0, warn: 1, hint: 2 };

/**
 * Turn a written definition into a usable rule, or `null` if it is unusable.
 *
 * Returning `null` rather than throwing is the whole point: this runs over a
 * catalog that may contain a mistake, and one bad entry must not be able to
 * stop the others from loading.
 */
export function compileRule(def: RuleDef): Rule | null {
  if (!def || typeof def.id !== 'string' || !def.id) return null;
  if (def.severity !== 'block' && def.severity !== 'warn' && def.severity !== 'hint') return null;
  if (typeof def.pattern !== 'string' || !def.pattern) return null;

  let pattern: RegExp;
  try {
    pattern = new RegExp(def.pattern, def.flags ?? '');
  } catch {
    return null;
  }

  let allow: RegExp | undefined;
  if (def.allow) {
    try {
      allow = new RegExp(def.allow, def.flags ?? '');
    } catch {
      /* A bad excuse-pattern must not disable the rule's detection: falling
         back to "no excuse" keeps the rule working, which is the safe side. */
      allow = undefined;
    }
  }

  return {
    id: def.id,
    severity: def.severity,
    languages: (def.languages ?? []).map((l) => l.toLowerCase()),
    pattern,
    pesan: def.pesan,
    saran: def.saran,
    allow,
    cariDiKomentar: def.cariDiKomentar === true,
  };
}

/** Compile a whole catalog, silently dropping the entries that cannot work. */
export function compileRules(defs: RuleDef[]): Rule[] {
  const out: Rule[] = [];
  for (const d of defs) {
    const r = compileRule(d);
    if (r) out.push(r);
  }
  return out;
}

/** Which of the loaded rules apply to this language. Empty list on a rule means all. */
function appliesTo(rule: Rule, bahasa: string): boolean {
  if (!rule.languages.length) return true;
  return rule.languages.includes(bahasa.toLowerCase());
}

/**
 * Strip comment lines before matching.
 *
 * This is a deliberate approximation, not a parser. Its job is to stop the most
 * common false positive: a rule whose own documentation, or a commented-out
 * line, mentions the very pattern it looks for - and then matches itself.
 *
 * Text is never removed from the ORIGINAL line, only from a copy used for
 * matching, so reported column numbers still line up with what the user sees.
 */
function barisTanpaKomentar(bahasa: string, baris: string): string | null {
  const t = baris.trim();
  if (!t) return null;
  if (t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*')) return null;
  if (t.startsWith('--') && bahasa === 'sql') return null;
  return baris;
}

/**
 * Run every applicable rule over the text, line by line.
 *
 * Matching is per line, so a reported line number is the line the user will
 * see. Multi-line patterns are out of scope on purpose: they need a parser to
 * be accurate, and an inaccurate rule that fires on a whole file is worse than
 * no rule.
 */
export function checkText(teks: string, bahasa: string, rules: Rule[]): Finding[] {
  const findings: Finding[] = [];
  if (!teks) return findings;

  const barisList = teks.split(/\r\n|\r|\n/);

  for (const rule of rules) {
    if (!appliesTo(rule, bahasa)) continue;

    for (let i = 0; i < barisList.length; i += 1) {
      const asli = barisList[i];
      /* A rule that looks for something in a comment must see comments. The
         strip is a default, not a law. */
      const untukCocok = rule.cariDiKomentar ? (asli.trim() ? asli : null) : barisTanpaKomentar(bahasa, asli);
      if (untukCocok === null) continue;

      /*
       * A fresh RegExp per line, deliberately.
       *
       * Reusing one object with the `g` flag carries `lastIndex` between calls,
       * so the second line can start searching from the middle of the previous
       * match and silently miss hits. Rebuilding costs little and removes a
       * class of bug that is very hard to see.
       */
      const pola = new RegExp(rule.pattern.source, rule.pattern.flags.replace('g', ''));
      const m = pola.exec(untukCocok);
      if (!m) continue;

      if (rule.allow) {
        const excuse = new RegExp(rule.allow.source, rule.allow.flags.replace('g', ''));
        if (excuse.test(untukCocok)) continue;
      }

      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        baris: i + 1,
        kolom: m.index + 1,
        cuplikan: asli.trim().slice(0, 120),
        pesan: rule.pesan,
        saran: rule.saran,
      });
    }
  }

  /* Most severe first, then by position - so the reason a write was refused is
     the first thing read. */
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.baris - b.baris);
  return findings;
}

/** True when the write must not proceed. Only 'block' can stop a write. */
export function shouldBlock(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'block');
}

/**
 * The message shown when a write is refused.
 *
 * Names the line and the rule, because "write blocked" without a location
 * leaves the user hunting through a file for a problem they cannot see.
 */
export function blockMessage(findings: Finding[]): string {
  const penghalang = findings.filter((f) => f.severity === 'block');
  const dulu = penghalang[0];
  if (!dulu) return '';
  const lain = penghalang.length > 1 ? ` (+${penghalang.length - 1} more)` : '';
  return `Blocked by rule "${dulu.ruleId}" at line ${dulu.baris}: ${dulu.pesan}${lain}`;
}

/** Language id from a file path. Used to pick which rules apply. */
export function bahasaDariPath(path: string): string {
  const nama = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const titik = nama.lastIndexOf('.');
  const ext = titik >= 0 ? nama.slice(titik + 1).toLowerCase() : '';
  const peta: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', rb: 'ruby', php: 'php',
    sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell',
    css: 'css', scss: 'css', html: 'html', md: 'markdown', json: 'json',
    yml: 'yaml', yaml: 'yaml', toml: 'toml', sql: 'sql', c: 'c', h: 'c',
    cpp: 'cpp', hpp: 'cpp', cs: 'csharp', swift: 'swift', kt: 'kotlin',
  };
  return peta[ext] ?? ext ?? '';
}
