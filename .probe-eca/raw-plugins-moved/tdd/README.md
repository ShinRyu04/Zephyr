# TDD

A skill that teaches ECA the Test-Driven Development workflow: write a failing test first, implement the minimum code to pass, then refactor.

## What it provides

- **`tdd` skill** — A loadable workflow guide for the red-green-refactor cycle, with language-agnostic test runner examples and practical rules for when TDD fits well.

## Workflow

```
Red ──→ Green ──→ Refactor ──→ Red ──→ ...
 │        │          │
 │        │          └─ Clean up while tests pass
 │        └─ Write minimum code to pass
 └─ Write a failing test first
```

1. Write a test for the next small behavior. Run it — confirm it **fails**.
2. Write the minimum code to make it pass. Run it — confirm it **passes**.
3. Refactor the code while keeping tests green.
4. Repeat.

## Usage

Ask ECA to follow TDD when implementing features or fixing bugs:

```
Load the tdd skill and implement the discount calculation using TDD
```

```
Use TDD to fix the off-by-one bug in pagination
```

Works with any language and test framework.

Credits: By the ECA team.
