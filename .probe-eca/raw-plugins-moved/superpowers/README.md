# Superpowers

An agentic skills framework and software development methodology that gives your coding agent structured workflows for spec-driven design, TDD, systematic debugging, and subagent-driven development.

## What it provides

- **`superpowers` skill** — A loadable skill that bootstraps the [Superpowers](https://github.com/obra/superpowers) methodology, teaching agents to follow disciplined workflows: brainstorm a spec before coding, write implementation plans, use red-green TDD, debug systematically, and leverage subagents for parallel work.

## How it works

Superpowers replaces the "just start coding" impulse with a structured pipeline:

1. **Brainstorming** — The agent asks what you're really trying to build and teases out a spec in digestible chunks.
2. **Planning** — A clear implementation plan is written, targeted at methodical step-by-step execution.
3. **Subagent-driven development** — Tasks are dispatched to subagents that implement, then get reviewed for spec compliance and code quality.
4. **Test-driven development** — Red-green-refactor throughout, emphasizing YAGNI and DRY.
5. **Systematic debugging** — A 4-phase root cause process when things go wrong.
6. **Verification before completion** — Every change is verified to actually work before it's called done.

Skills auto-trigger based on context — no special commands needed.

## Usage

Ask ECA to load the skill when starting a development session:

```
Load the superpowers skill and help me plan this feature
```

```
Use superpowers to help me debug this issue
```

```
Let's brainstorm the design for a new API using superpowers
```

Credits: Based on [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent ([@obra](https://github.com/obra)).
