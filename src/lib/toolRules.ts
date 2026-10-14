/**
 * Per-tool permission rules.
 *
 * ## What the existing gate cannot express
 *
 * `approvalMode` is one value for everything: `ask` confirms every shell
 * command, `auto` confirms none, `readonly` refuses all writes. That is a
 * single dial for a set of decisions that are not alike. A reader who runs
 * `cargo test` fifty times a day wants it never confirmed, while `sudo rm -rf`
 * in the same session should always be confirmed — and `ask` confirms both,
 * `auto` confirms neither.
 *
 * A rule is `{ tool, match, action }`: a tool name (or `*`), a regular
 * expression tested against the call's arguments, and what to do.
 *
 * ## First match wins, and that is the whole precedence model
 *
 * The list is ordered and the FIRST matching rule decides. Not "most specific
 * wins", not "deny beats allow": those sound fairer and are much harder to
 * reason about, because the reader cannot tell what a given rule will do
 * without mentally evaluating every other rule against it. With first-match the
 * list reads top to bottom like the decision it is, and moving a rule changes
 * exactly one thing.
 *
 * ## Deny is checked regardless of order within a rule, but not across rules
 *
 * A `deny` rule that appears BELOW an `allow` that matches the same call does
 * not fire — the allow already decided. That is deliberate, and it is why the
 * UI says "first match wins" rather than leaving the reader to guess. A blanket
 * deny belongs at the top.
 */
import type { AgentToolCall } from './types';

export type ToolAction = 'allow' | 'confirm' | 'deny';

export interface ToolRule {
  id: string;
  /** A tool name, or `*` for every tool. */
  tool: string;
  /** A regular expression tested against the call's arguments as text. Empty
   *  matches everything, which is how a whole-tool rule is written. */
  match: string;
  action: ToolAction;
  /** Shown in the UI; not used by the evaluator. */
  note?: string;
  enabled?: boolean;
}

/**
 * A rule with its pattern compiled, or the reason it could not be.
 *
 * `pola` is null for a whole-tool rule (empty pattern); `rx` is null when the
 * pattern does not compile. Both are "no regex to test", which is why they are
 * separate fields rather than one nullable value — the caller needs to tell
 * "matches every argument" from "matches nothing".
 */
interface Ringkas {
  rule: ToolRule;
  /** True when the rule has a pattern and it failed to compile. */
  rusak: boolean;
  /** The compiled pattern, or null for a whole-tool rule or a broken one. */
  rx: RegExp | null;
  /** True when the rule has no pattern at all (matches everything). */
  semua: boolean;
}

/**
 * Compile once per rule.
 *
 * A broken regex matches NOTHING rather than everything. The other choice is
 * catastrophic in the direction that matters: a typo'd pattern under an `allow`
 * rule would silently auto-approve every call of that tool. Failing closed
 * means the worst case is a rule that does nothing — visible, and fixable.
 */
function kompilasi(rules: ToolRule[]): Ringkas[] {
  return rules.map((rule) => {
    const pola = (rule.match ?? '').trim();
    if (!pola) return { rule, rusak: false, rx: null, semua: true };
    try {
      return { rule, rusak: false, rx: new RegExp(pola, 'i'), semua: false };
    } catch {
      return { rule, rusak: true, rx: null, semua: false };
    }
  });
}

/** The arguments of a call, flattened to one string for regex matching. */
function teksArgumen(args: unknown): string {
  if (args === null || args === undefined) return '';
  if (typeof args === 'string') return args;
  try {
    return JSON.stringify(args);
  } catch {
    return '';
  }
}

export interface HasilAturan {
  action: ToolAction;
  /** Which rule decided, for the UI to show. Null when no rule matched. */
  rule: ToolRule | null;
}

/**
 * Evaluate the rules for one call.
 *
 * Returns `rule: null` when nothing matched, which the caller reads as "fall
 * through to the approval mode". A rule that matched but whose regex was
 * broken also returns null — see `kompilasi`.
 */
function evaluasiAturan(
  rules: ToolRule[] | undefined,
  tool: string,
  args: unknown,
): HasilAturan {
  if (!rules || rules.length === 0) return { action: 'confirm', rule: null };
  const teks = teksArgumen(args);

  for (const { rule, rusak, rx, semua } of kompilasi(rules)) {
    if (rule.enabled === false) continue;
    /* `*` is the whole-tool wildcard. An exact name match is case-sensitive:
       tool names are identifiers the app chose, and matching them loosely
       would let `grep` match `Grep`, so a rule meant for one fires on the
       other. */
    if (rule.tool !== '*' && rule.tool !== tool) continue;
    /* A rule with no pattern is a whole-tool rule. */
    if (semua) return { action: rule.action, rule };
    if (rusak || !rx) continue;
    if (rx.test(teks)) return { action: rule.action, rule };
  }
  return { action: 'confirm', rule: null };
}

/**
 * The tool name a rule matches for a shell call.
 *
 * Both shell tools report as `bash_run` so one rule covers `bash_run`,
 * `bash_background` and anything else that runs a command — a reader writing
 * "never confirm cargo test" means the command, not the transport.
 */
function namaUntukAturan(tool: string): string {
  return tool === 'bash_background' || tool === 'bash_kill' || tool === 'bash_logs'
    ? 'bash_run'
    : tool;
}

/** Convenience for a call site that has a tool call in hand. */
export function evaluasiUntukPanggilan(
  rules: ToolRule[] | undefined,
  call: Pick<AgentToolCall, 'name' | 'args'>,
): HasilAturan {
  return evaluasiAturan(rules, namaUntukAturan(call.name), call.args);
}

/** A rule for the UI to start from. */
export function aturanBaru(): ToolRule {
  return {
    id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`,
    tool: '*',
    match: '',
    action: 'confirm',
    enabled: true,
  };
}
