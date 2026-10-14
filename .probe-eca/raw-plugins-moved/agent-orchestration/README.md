# Agent Orchestration

A subagent-based workflow for implementing planned changes with consistent coding style.

## What it provides

- **`implement` subagent** — Handles code implementation tasks with a focus on minimal, correct changes following functional-leaning conventions.
- **Rule** — Automatically routes implementation requests to the implement subagent.

## How it works

When you ask ECA to implement changes, the orchestration rule delegates to the `implement` subagent, which:

1. Loads the `fp-idiomatic-style` skill (if the `fp-style` plugin is also installed)
2. Identifies target files and exact edits
3. Makes minimal changes consistent with project conventions
4. Prefers functional-leaning, idiomatic solutions

## Usage

```
Implement the plan we discussed
```

```
Refactor this module to use pure functions
```

> **Tip:** Install the `fp-style` plugin alongside this one for the full style-guided implementation workflow.

Credits: Based on the config shared by @davidvujic.
