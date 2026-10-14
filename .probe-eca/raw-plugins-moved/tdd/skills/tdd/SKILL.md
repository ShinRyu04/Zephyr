---
name: tdd
description: "Test-Driven Development workflow: write a failing test first, implement minimum code to pass, then refactor. Language-agnostic."
---

# TDD — Test-Driven Development Workflow

## The Cycle: Red → Green → Refactor

Every code change follows this loop:

1. **Red** — Write a test for the behavior you want. Run it. It **must fail**. If it passes, the test is wrong or the behavior already exists.
2. **Green** — Write the **minimum** code to make the test pass. Nothing more. Run the test again to confirm green.
3. **Refactor** — Clean up the implementation (and the test if needed) while keeping everything green. Run the tests after each change.

Then repeat for the next small piece of behavior.

## Rules

- **Never skip the red step.** A test that has never been seen failing is a test you don't trust. Always run it first and confirm the failure message makes sense.
- **Minimum code to pass.** Resist the urge to implement the full solution at once. Hard-code a return value if that's what makes the single test pass. The next test will force you to generalize.
- **Small steps.** One behavior per cycle. If you're changing more than ~15 lines of production code per green step, the step is too big.
- **Run tests after every change.** Use `eca__shell_command` to execute the project's test command after writing the test AND after writing the implementation. Never assume a test passes — verify it.
- **Refactor only on green.** Never restructure code while tests are failing. Get to green first, then clean up.

## How to Run Tests

Use `eca__shell_command` with the project's test runner. Detect the language/framework from the project structure:

| Stack | Typical command |
|---|---|
| Clojure (Kaocha) | `clojure -M:test --focus my.ns-test/my-test` |
| Clojure (Lein) | `lein test :only my.ns-test/my-test` |
| Python (pytest) | `pytest path/to/test_file.py::test_name -x` |
| JavaScript/TS (Jest) | `npx jest --testPathPattern='file' --testNamePattern='name'` |
| JavaScript/TS (Vitest) | `npx vitest run path/to/file --reporter=verbose` |
| Go | `go test ./pkg/... -run TestName -v` |
| Rust | `cargo test test_name -- --nocapture` |
| Java (Maven) | `mvn test -pl module -Dtest=TestClass#testMethod` |
| Ruby (RSpec) | `bundle exec rspec path/to/spec.rb:LINE` |
| Elixir | `mix test path/to/test.exs:LINE` |

Always prefer running a **single focused test** rather than the full suite during the red-green loop. Run the full suite only before committing or when refactoring touches shared code.

## Workflow Step-by-Step

### 1. Understand what to build
Read the requirement. Break it into the smallest testable behavior you can think of. Start there.

### 2. Write the failing test
Create (or add to) a test file. Write one test that describes the expected behavior. Keep assertions simple and specific.

### 3. Run — confirm red
```
eca__shell_command: <test command focused on the new test>
```
Read the output. Confirm the failure is for the right reason (e.g., function not found, wrong return value) — not a syntax error or import issue.

### 4. Implement minimum code
Write just enough production code to make the test pass. It's okay if it's ugly or incomplete — the next cycle will push you forward.

### 5. Run — confirm green
```
eca__shell_command: <same focused test command>
```
If it passes, move on. If it fails, fix the implementation (not the test) until green.

### 6. Refactor
Look at the code you just wrote. Can you simplify it? Remove duplication? Improve naming? Do it now, then run the test again to confirm nothing broke.

### 7. Repeat
Pick the next behavior and start a new red-green-refactor cycle.

## When to Use TDD

**Good fit:**
- New business logic or algorithms
- Bug fixes (write a test that reproduces the bug first)
- Library/API design — tests act as your first consumer
- When you're unsure about the design — TDD gives you fast feedback

**Overkill or poor fit:**
- Pure UI layout/styling tweaks
- One-off scripts or throwaway spikes
- Wiring/configuration-only changes with no logic
- When the user explicitly asks you to skip tests

## Tips

- If you get stuck on what test to write next, think about edge cases: empty input, nil/null, boundary values, error paths.
- Name tests after the behavior they verify, not the function they call. `test-returns-empty-for-no-matches` beats `test-search`.
- When fixing a bug, **always** write the reproducing test before touching production code. This guarantees the bug stays fixed.
- If a test is hard to write, it usually means the code is hard to use — that's valuable design feedback.
