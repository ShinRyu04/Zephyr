---
name: superpowers
description: "Agentic development methodology: spec-driven brainstorming, structured planning, subagent-driven development, TDD, systematic debugging, and verification-before-completion."
---

# Superpowers — Agentic Development Methodology

You have Superpowers. This skill gives you a complete software development workflow built on composable skills and disciplined processes.

**Source:** <https://github.com/obra/superpowers>

## Core Principles

1. **Never jump straight into coding.** Always brainstorm first — understand what the user really wants before writing a single line.
2. **Spec before code.** Tease out a spec from conversation, present it in short digestible sections for user validation.
3. **Plan before implementing.** Write a clear implementation plan with discrete tasks, ordered by dependency.
4. **TDD throughout.** Red-green-refactor. Write a failing test, implement minimum code to pass, refactor. Always verify tests actually run.
5. **YAGNI and DRY.** Don't build what you don't need. Don't repeat yourself.
6. **Verify before declaring done.** Every change must be tested and confirmed working — never assume.

## Workflow

```
Brainstorm → Plan → Implement (via subagents) → Review → Verify → Done
```

### Phase 1: Brainstorming

When the user wants to build something:

1. **Don't start coding.** Ask questions to understand the real goal — one question at a time.
2. **Do autonomous recon first.** Explore the codebase, check existing patterns, understand constraints before asking questions.
3. **Present the design** in 200–300 word sections. Wait for user validation on each section before proceeding.
4. **Make recommendations.** Don't punt decisions back to the user — propose a direction with reasoning and let them override.
5. **Document the spec** in a file the project can reference later.

### Phase 2: Writing Plans

After the spec is validated:

1. Break the work into **small, independently testable tasks**.
2. Order tasks by dependency — each task should build on the previous.
3. Each task description should be clear enough that an agent with no project context could execute it.
4. Include the test approach for each task.
5. Emphasize what NOT to build (YAGNI).

### Phase 3: Executing Plans

For each task in the plan:

1. **Dispatch to a subagent** when possible — keep the main agent as orchestrator.
2. The implementing agent follows TDD: write test → see it fail → implement → see it pass → refactor.
3. **Two-stage review**: first check spec compliance, then check code quality.
4. Keep changes minimal and focused on the current task.

### Phase 4: Systematic Debugging

When something goes wrong, follow the 4-phase process:

1. **Reproduce** — Get a reliable reproduction of the issue.
2. **Isolate** — Narrow down where the bug lives through targeted investigation.
3. **Root cause** — Trace to the actual cause, not just the symptom. Ask "why" until you reach the real origin.
4. **Fix and verify** — Fix the root cause, add a regression test, and confirm the fix works end-to-end.

**Defense in depth:** Don't just fix the immediate bug — consider what allowed it to happen and add guardrails.

### Phase 5: Verification Before Completion

Before declaring any task done:

1. Run the relevant tests and confirm they pass.
2. Check for regressions in related functionality.
3. Verify the change actually solves the original problem.
4. If there's a UI component, confirm it renders correctly.

## Red Flags — Stop and Check

If you catch yourself thinking any of these, pause:

| Thought | What to do instead |
|---|---|
| "This is simple, I'll just code it" | Brainstorm first. Simple things become complex. |
| "I know what they want" | Ask. Confirm. Then build. |
| "I'll add tests later" | Write the test NOW, before the implementation. |
| "It probably works" | Run the tests. Verify. |
| "Let me just fix this quick" | Reproduce → isolate → root cause → fix. |
| "Good enough" | Check the spec. Does it actually meet the requirements? |

## Using Subagents

When executing a plan with multiple tasks:

- **Dispatch implementation tasks to subagents** to keep context clean and enable parallel work.
- Each subagent gets: the task description, relevant file paths, the spec section, and test expectations.
- The main agent **reviews** subagent output before accepting it.
- Subagents should follow TDD independently.

## Skill Interactions

This methodology composes with other skills:

- If a **TDD skill** is available, defer to its detailed test workflow.
- If a **code review skill** is available, use it during the review phase.
- If a **debugging skill** is available, use it for the systematic debugging phase.

## Quick Reference

| Phase | Key Action |
|---|---|
| Brainstorm | Ask questions, explore codebase, present spec in chunks |
| Plan | Break into small tasks, order by dependency, include test approach |
| Implement | Subagent per task, TDD, minimal changes |
| Debug | Reproduce → isolate → root cause → fix + regression test |
| Verify | Run tests, check regressions, confirm spec compliance |
