/*
 * HydraFusion on the AGENT path — the critique and the revision.
 *
 * WHY THIS EXISTS. `jalankanHydra` runs the chat pipeline: draft → critique →
 * revise as three separate completions over a text task. That shape cannot run
 * an agent turn, because an agent turn IS the work — it reads files and calls
 * tools, and a "draft" with no tools could only narrate. So the agent path used
 * the plan for its MODEL and its ladder only, and the `kritik-revisi` route
 * announced three stages while executing one. Measured, not assumed: the only
 * Hydra calls in `sendAgent` were the tier lookup and the escalation ladder.
 *
 * WHAT RUNS HERE. The agent loop produces the draft (it is the work). When the
 * loop finishes, this module runs the two stages that were missing:
 *
 *   critique  — a review of the finished work, in an ISOLATED, TOOL-LESS
 *               context, from a model of a DIFFERENT family when one is
 *               available. It returns defects and a verdict.
 *   revision  — only when the verdict is FIX: the drafting model gets the
 *               review and produces the final answer. This one is allowed to
 *               use the workspace again, because fixing real defects may mean
 *               touching real files.
 *
 * BOTH ARE BOUNDED AND HONEST. Each stage has its own timeout and is abandoned
 * if the run was cancelled; a stage that fails costs the run that stage and says
 * so — it never turns a working answer into a failure, and it never reports a
 * stage it did not run.
 */

import type { AiMessage } from './types';

/** What the critic is asked for. Kept verbatim as the contract with the model. */
export const INSTRUKSI_KRITIK_AGEN =
  'You are an independent reviewer. The work below was produced by another model ' +
  'to answer the task. Point out CONCRETE defects only: claims that are wrong, steps ' +
  'that are missing, assumptions that were never stated, code that would not run, and ' +
  'anything the task asked for that is absent. Number them. Do not rewrite the answer, ' +
  'do not praise it, and do not restate it. If you find no defect, say so plainly. ' +
  'End with a line "VERDICT: OK" or "VERDICT: FIX".';

/** The revision instruction, applied only after a FIX verdict. */
export const INSTRUKSI_REVISI_AGEN =
  'An independent reviewer examined your work below and listed defects. Produce the FINAL ' +
  'answer for the original task: fix every defect the review identified, keep what was ' +
  'already right, and use tools if a fix requires changing files. Answer the original task ' +
  'directly — do not mention the review, the reviewer, or this instruction.';

export type PutusanKritik = 'ok' | 'fix' | 'tak-terbaca';

/**
 * Read the reviewer's verdict.
 *
 * WHY only the explicit line counts: guessing "this sounds like a complaint" from
 * prose is exactly the fake verdict that makes an orchestration loop burn money
 * silently. The prompt ASKS for one of two lines, so their presence or absence is
 * a real signal. Absent or malformed reads as `tak-terbaca`, which does NOT
 * trigger a revision — the run keeps the answer it has.
 */
export function bacaPutusanKritik(teks: string): PutusanKritik {
  const m = [...String(teks ?? '').matchAll(/^\s*VERDICT\s*:\s*(OK|FIX)\s*$/gim)];
  if (m.length === 0) return 'tak-terbaca';
  /* Last one wins: a reviewer that changes its mind at the end means the end. */
  return m[m.length - 1][1].toUpperCase() === 'FIX' ? 'fix' : 'ok';
}

/** The prompt that carries the finished work into the review. */
export function pesanKritik(tugas: string, kerja: string): AiMessage[] {
  return [
    { role: 'system', content: INSTRUKSI_KRITIK_AGEN },
    {
      role: 'user',
      content:
        `TASK:\n${tugas}\n\n` +
        `WORK TO REVIEW:\n${kerja}\n\n` +
        'Review it now. Number the defects you find, then end with VERDICT: OK or VERDICT: FIX.',
    },
  ];
}

/** The prompt that carries the review back to the drafting model. */
export function pesanRevisi(tugas: string, kerja: string, kritik: string): AiMessage[] {
  return [
    { role: 'system', content: INSTRUKSI_REVISI_AGEN },
    {
      role: 'user',
      content: `TASK:\n${tugas}\n\nYOUR WORK:\n${kerja}\n\nREVIEW OF YOUR WORK:\n${kritik}\n\nProduce the final answer now.`,
    },
  ];
}

/**
 * Pick the critic: a model from a DIFFERENT family than the drafter, when one
 * exists on the ladder.
 *
 * WHY different family and not simply "a stronger model": an independent review
 * is only independent if it is not the same model grading itself. GitHub's
 * HydraFusion uses a critic from another family for the same reason. When the
 * ladder has no other family the drafter is returned and the caller says so in
 * the stage note, rather than silently pretending the review was independent.
 */
export function pilihKritikus(
  drafter: { provider: string; model: string },
  tangga: { provider: string; model: string }[],
): { kritikus: { provider: string; model: string }; berbeda: boolean } {
  const lain = tangga.find((l) => l.provider !== drafter.provider || l.model !== drafter.model);
  if (lain) return { kritikus: lain, berbeda: lain.provider !== drafter.provider };
  return { kritikus: drafter, berbeda: false };
}

/** Token counts, summed per leg so the reader can see what the run cost. */
export interface HydraPemakaian {
  input: number;
  output: number;
}

export function jumlahkanPemakaian(daftar: (HydraPemakaian | undefined)[]): HydraPemakaian {
  let input = 0;
  let output = 0;
  for (const u of daftar) {
    if (!u) continue;
    input += u.input || 0;
    output += u.output || 0;
  }
  return { input, output };
}

/**
 * Was the run cancelled, or did it run past its own deadline?
 *
 * Kept as a function so the two callers (critique, revision) cannot drift, and
 * so the rule is testable in Node: a leg is abandoned when either the reader
 * cancelled OR its own deadline passed. The deadline exists because a provider
 * that never closes its stream would otherwise pin the turn forever.
 */
export function legHarusBerhenti(dibatal: boolean, mulaiMs: number, batasMs: number, sekarang = Date.now()): boolean {
  return dibatal || sekarang - mulaiMs >= batasMs;
}

/** Default deadline for one review/revision leg (ms). */
export const BATAS_LEG_MS = 120_000;
