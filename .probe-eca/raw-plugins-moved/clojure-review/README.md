# Clojure Review

A thorough Clojure(Script) code review subagent inspired by the design principles of Rich Hickey, "Elements of Clojure," "Functional Design," and "Programming Clojure."

## What it provides

- **`clojure-reviewer` subagent** — Reviews Clojure(Script) code and provides structured, actionable feedback with an emphasis on idiomatic design, readability, and pragmatic simplicity.
- **Rule** — Automatically routes review requests to the reviewer subagent.

## Review focus areas

1. **Structure and Size** — Nesting depth, magic values
2. **State Management** — Pure functions, explicit side effects, atom usage
3. **Idiomatic Clojure** — Core function usage, DRY, error handling, boundary validation
4. **Consistency** — Internal patterns, existing helpers, accessor functions
5. **Testing** — Suggests 2-3 critical test cases

## Usage

Ask ECA to review your code:

```
Review my staged changes
```

Credits: Based on the config shared by @zikajk.
