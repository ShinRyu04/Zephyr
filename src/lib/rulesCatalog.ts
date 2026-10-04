/*
 * The rules the write-time check runs.
 *
 * Each entry is plain enough to read and change without touching the engine.
 * Patterns are written as SOURCE text, not compiled, so a mistake here fails as
 * one skipped rule instead of taking the whole catalog down at load.
 *
 * The hard part of a catalog like this is not finding bad code - it is not
 * firing on good code. Every `allow` below exists because the naive pattern
 * matched something legitimate, and each one was added from a real counter-
 * example rather than from imagination. When adding a rule, test it against a
 * file that does the thing CORRECTLY, not only against a file that does it
 * wrong; the second is easy and proves nothing.
 */

import type { RuleDef } from './rulesEngine';

export type { RuleDef };

export const RULES_BAWAAN: RuleDef[] = [
  {
    id: 'hardcoded-secret',
    severity: 'block',
    pattern: `(?:api[_-]?key|apikey|secret|passwd|password|token|access[_-]?key)\\s*[:=]\\s*['"\`][^'"\`\\s]{12,}['"\`]`,
    flags: 'i',
    /* Placeholders and reads are not secrets. Without this the rule fires on
       the very documentation that tells people not to hardcode secrets. */
    /* `password` belongs in this list: leaving it out meant `your-password-here`
       was treated as a live credential, which is the exact opposite of what
       that string is for. A placeholder guard with a hole in it is worse than
       no guard, because the hole is invisible until someone writes the doc. */
    allow: `(?:process\\.env|import\\.meta\\.env|os\\.environ|getenv|\\$\\{|<[^>]+>|xxx+|your[_-]?(?:key|token|secret|password|passwd)|placeholder|example|dummy|change[_-]?me|redacted|\\.\\.\\.)`,
    pesan: 'A credential appears to be written directly into the source.',
    saran: 'Read it from the environment or a secret store, and rotate the value that was committed.',
  },
  {
    id: 'ts-any',
    severity: 'warn',
    languages: ['typescript'],
    pattern: `:\\s*any\\b|<any>|as\\s+any\\b|Array<any>|Promise<any>`,
    /* "any" is a real word in prose and a real name in some codebases. Only a
       type position counts, and `unknown` is the usual replacement. */
    allow: `\\banyOf\\b|\\/[^/]*\\bany\\b[^/]*\\/|'any'|"any"|\`any\``,
    pesan: '`any` disables type checking for this value.',
    saran: 'Use `unknown` and narrow it, or describe the real shape.',
  },
  {
    id: 'empty-catch',
    severity: 'warn',
    languages: ['javascript', 'typescript', 'java', 'csharp', 'php'],
    pattern: `catch\\s*(?:\\([^)]*\\))?\\s*\\{\\s*\\}`,
    pesan: 'An empty catch block swallows a failure silently.',
    saran: 'Log it, rethrow it, or explain in a comment why ignoring it is correct.',
  },
  {
    id: 'react-index-key',
    severity: 'warn',
    languages: ['javascript', 'typescript'],
    pattern: `key=\\{\\s*(?:i|idx|index|key)\\s*\\}`,
    pesan: 'An array index as a React key binds rows to positions, not to items.',
    saran: 'Use a stable id from the data. Reordering or deleting rows will otherwise reuse the wrong one.',
  },
  {
    id: 'dangerous-inner-html',
    severity: 'warn',
    languages: ['javascript', 'typescript'],
    pattern: `dangerouslySetInnerHTML`,
    pesan: 'Raw HTML is injected into the page.',
    saran: 'Sanitise the HTML first, or render it as text.',
  },
  {
    id: 'eval-call',
    severity: 'block',
    languages: ['javascript', 'typescript', 'python', 'php', 'ruby'],
    pattern: `(?:^|[^\\w.$])eval\\s*\\(`,
    allow: `\\b(?:safe|json|literal|ast)\\.eval\\s*\\(|\\bnew\\s+Function\\b`,
    pesan: '`eval` executes arbitrary text as code.',
    saran: 'Parse the data with a real parser, or use a lookup table for the cases you actually handle.',
  },
  {
    id: 'destructive-rm',
    severity: 'block',
    languages: ['shell', 'powershell', 'javascript', 'typescript', 'python'],
    pattern: `rm\\s+-[a-z]*[rf][a-z]*\\s+(?:\\/|~|\\$HOME|\\*)|rm\\s+-rf\\s+\\/|Remove-Item[^\\n]*-Recurse[^\\n]*-Force\\s+(?:[A-Z]:\\\\|\\/)`,
    pesan: 'A recursive delete aimed at a root, home, or wildcard path.',
    saran: 'Name the exact directory, and check it before running the command.',
  },
  {
    id: 'rust-unwrap',
    severity: 'hint',
    languages: ['rust'],
    pattern: `\\.unwrap\\(\\)`,
    /* Tests and examples are allowed to panic - that is the point of a test. */
    allow: `#\\[cfg\\(test\\)\\]|#\\[test\\]|expect\\(|assert`,
    pesan: '`unwrap()` panics on error instead of handling it.',
    saran: 'Return the error with `?`, or use `unwrap_or`, `unwrap_or_else`, or `expect` with a real message.',
  },
  {
    id: 'python-bare-except',
    severity: 'warn',
    languages: ['python'],
    pattern: `^\\s*except\\s*:`,
    pesan: 'A bare `except:` also catches KeyboardInterrupt and SystemExit.',
    saran: 'Catch the specific exception, or at least `Exception`.',
  },
  {
    id: 'leftover-console-log',
    severity: 'hint',
    languages: ['javascript', 'typescript'],
    pattern: `(?:^|[^\\w.])console\\.(?:log|debug)\\s*\\(`,
    /* A logger is the intended replacement, so it must not be flagged, and an
       explicit marker lets someone keep a log on purpose. */
    allow: `\\b(?:logger|log|debug)\\.(?:log|debug|info)\\s*\\(|eslint-disable|@ts-ignore.*console|console-log-ok`,
    pesan: 'A debugging `console.log` is still here.',
    saran: 'Remove it, or route it through the project logger.',
  },
  {
    id: 'sql-string-concat',
    severity: 'warn',
    languages: ['javascript', 'typescript', 'python', 'php', 'java', 'csharp'],
    pattern: `(?:SELECT|INSERT|UPDATE|DELETE)\\s+[^;'"\`]*['"\`]\\s*\\+`,
    flags: 'i',
    pesan: 'A SQL statement is built by joining strings.',
    saran: 'Use parameters. Concatenated values are how injection gets in.',
  },
  {
    id: 'insecure-random-secret',
    severity: 'warn',
    languages: ['javascript', 'typescript', 'python'],
    pattern: `(?:token|secret|nonce|salt|password|session)[\\w]*\\s*[:=][^\\n]*Math\\.random\\(\\)`,
    flags: 'i',
    pesan: 'A security value is generated with a non-cryptographic random source.',
    saran: 'Use `crypto.randomUUID()` / `crypto.getRandomValues()` (`secrets` in Python).',
  },
  {
    id: 'debugger-statement',
    severity: 'warn',
    languages: ['javascript', 'typescript'],
    pattern: `^\\s*debugger\\s*;?\\s*$`,
    pesan: 'A `debugger` statement stops execution wherever the tools are open.',
    saran: 'Remove it before committing.',
  },
  {
    id: 'todo-without-owner',
    severity: 'hint',
    languages: ['javascript', 'typescript', 'python', 'rust', 'go', 'java'],
    /*
     * Match a TODO that is NOT followed by an owner in brackets or a colon.
     *
     * The previous negative lookahead rejected `TODO perbaiki` as well - it
     * forbade a SPACE, and a space is what a loose TODO is written with. The
     * rule therefore only fired on `TODO,` and similar, which is backwards.
     * Requiring the marker to sit after a comment lead-in, then excluding the
     * bracketed forms, keeps `TODO(alice):` and `TODO: #123` out while catching
     * the loose ones.
     */
    /*
     * Rewritten to avoid catastrophic backtracking.
     *
     * The previous form ended in `.*$` behind a negated class, and `.*$` on a
     * line with no newline - a minified bundle, a one-line JSON file, a long CSS
     * rule - gives the engine an unbounded amount of text to re-try from every
     * position. On a large single-line file that is exponential work, and it runs
     * on EVERY save, so the editor appears to hang for no visible reason.
     *
     * `[^\n]*` is bounded by the line: it cannot run past the end of the line it
     * started on, so there is nothing to re-try and the cost is linear in the
     * line length. `$` is kept only in the alternative that has no star after it,
     * where it cannot backtrack.
     */
    pattern: `(?:\\/\\/|#|--|\\/\\*)[ \\t]*(?:TODO|FIXME|XXX)[ \\t]*[^\\s(\\[:][^\\n]*|(?:\\/\\/|#|--|\\/\\*)[ \\t]*(?:TODO|FIXME|XXX)[ \\t]*$`,
    /* A TODO only ever lives in a comment, so this rule must be allowed to look
       there - the engine strips comments by default. */
    cariDiKomentar: true,
    pesan: 'A loose TODO with no owner or issue.',
    saran: 'Write `TODO(name):` or link the issue, so it can be found and chased.',
  },
];
