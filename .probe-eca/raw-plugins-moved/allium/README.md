# Allium 🧅

Give ECA durable behavioural intent that does not drift with the conversation and persists across sessions.

## What is Allium?

[Allium](https://juxt.github.io/allium/) is a behavioural specification language for capturing what software is meant to do, not just what the code currently does. It gives system intent a durable, structured form so ECA can preserve constraints across sessions, surface ambiguity, and notice when implementation and intent diverge.

Allium has no compiler or runtime — it is a specification artefact interpreted by LLMs and humans. The optional [Allium CLI](https://github.com/juxt/allium-tools) adds parser-backed validation and analysis.

## Install the CLI (recommended)

The plugin works without the CLI, but automatic validation and analysis require the `allium` command to be available in `PATH`. Installation instructions are at [juxt/allium-tools](https://github.com/juxt/allium-tools).

## First steps

Start with `/allium` if you are not sure which workflow you need. It gives ECA the Allium syntax summary and routes you toward the right skill. You can also hand `/allium` a goal (for example `/allium add gift cards`) and ECA will drive the whole loop — spec → tests → code — to convergence on your behalf.

If you are designing a new feature, start with `/allium:elicit`. ECA will ask structured questions about the boundary, actors, lifecycle states, triggers, edge cases, and open questions, then help turn the answers into a `.allium` specification.

If you already have code and want to capture what it does, use `/allium:distill`. ECA will inspect the implementation, separate domain behaviour from implementation details, and draft a behavioural spec that can be reviewed and refined.

Once a spec exists, use `/allium:tend` for targeted changes, `/allium:weed` to compare the spec with the implementation, and `/allium:propagate` to turn the spec into test obligations or concrete tests. When a loop claims convergence, `/allium:witness` independently re-derives that claim from ground truth — tests really pass, no generated test was weakened, no blocking question was silently parked.

What to expect: Allium does not replace implementation or tests. It gives ECA a durable behavioural model of what the system is meant to do, so future sessions can reason about intent, spot missing decisions, catch spec-code drift, and generate better tests from explicit behaviour.

## Plugin components

### Skills (7)

Plugin skills are namespaced by ECA. Invoke them as:

| Skill | Purpose |
|-------|---------|
| `/allium` | Entry point — syntax summary, routing table, quick reference; give it a goal and it drives the whole loop to convergence |
| `/allium:elicit` | Build a spec through structured conversation with stakeholders |
| `/allium:distill` | Extract a spec from an existing codebase |
| `/allium:tend` | Edit and update existing specs |
| `/allium:weed` | Check spec-to-code alignment, find and resolve divergences |
| `/allium:propagate` | Generate tests from specifications |
| `/allium:witness` | Independently attest a loop's convergence claim from ground truth (the anti-cheat gate) |

### Agents (5)

Each agent is the non-interactive entry point for its skill: it reads the skill, parks human decisions as `open question` declarations instead of waiting, and returns a typed JSON result (per the schemas in `references/schemas/`) that the Allium loop routes on.

| Agent | Purpose |
|-------|---------|
| `tend` | Edit `.allium` spec files (read, search, edit, write, shell) |
| `weed` | Check spec-code alignment (read, search, edit, write, shell) |
| `distill` | Extract a spec from existing code, keeping the source out of the caller's context |
| `propagate` | Generate tests from a spec and record the tamper baseline (test hashes) |
| `witness` | Re-derive a convergence claim from ground truth; writes the witness record, never fixes anything |

### Rules (1)

| Rule | Scope | Purpose |
|------|-------|---------|
| `allium` | `**.allium` files | Syntax distinctions, anti-patterns, and key conventions — loaded on-demand when editing `.allium` files |

### Hooks (3)

| Hook | Trigger | Purpose |
|------|---------|---------|
| `allium.check-spec` | ECA `write_file`/`edit_file` on `.allium` files | Runs `allium check` automatically when the CLI is installed and returns diagnostics to the model as additional context. If the CLI is missing, surfaces a one-time notice (per machine) prompting the model to offer installing it |
| `allium.loop-trace-pre` | ECA `spawn_agent` (before) | Stamps each subagent call's start while an Allium loop is active (a `.allium-loop/` dir exists); no-op otherwise |
| `allium.loop-trace-post` | ECA `spawn_agent` (after) | Writes `{agent, duration_ms}` to `.allium-loop/timings.jsonl` on return — deterministic per-phase timing the loop folds into its trace and report |

### References (10 + schemas)

Full language reference, 9 worked patterns, test generation taxonomy, the Allium loop (recommended loops, the loop-driving procedure, and slice integration for fanned-out goals), migration guides, skill-specific examples, and the JSON schemas for the loop's typed hand-offs (`references/schemas/` — per-phase result records, the ledger, and trace entries).

## Usage

Invoke skills with their ECA plugin names (for example `/allium`, `/allium:elicit`, `/allium:tend`) or ask ECA to use the `tend` or `weed` subagent.

The `allium` rule is path-scoped — it's automatically fetched when you work with `.allium` files. The `allium.check-spec` hook is a post-edit safety net: if the CLI is installed, diagnostics appear as `<additionalContext from="allium.check-spec">...` after ECA writes or edits a `.allium` file.

## Upstream sync

This plugin was ported from the upstream Allium repository. For reproducibility and auditing, the last upstream commit used as a reference for this port is recorded below:

- Repository: [juxt/allium](https://github.com/juxt/allium)
- Commit: `dc255026758adc022451684bf067b355376e6c25`
- Author: chromalchemy
- Date: 2026-08-24 12:48:32 -0400
- Message: update gitignore — upstream plugin version 3.15.0

If you update the plugin from upstream in future, please update this section with the new commit hash and date.

## Credits

Based on [Allium](https://github.com/juxt/allium) by JUXT. Licensed under the same terms as the upstream repository.
