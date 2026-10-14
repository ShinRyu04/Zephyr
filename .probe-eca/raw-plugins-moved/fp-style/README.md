# FP Style

A coding style skill that enforces functional-leaning, idiomatic conventions across any language.

## What it provides

- **`fp-idiomatic-style` skill** — A loadable style policy that guides code generation toward pure functions, composability, and lightweight data structures.

## Key principles

1. Correctness and clarity first
2. Idiomatic for the target language
3. Functional-leaning where it fits naturally
4. Lightweight data structures over heavy abstractions
5. Don't force FP purity at the cost of readability

## Usage

The skill is automatically available via `/skills`. Load it when you want ECA to follow FP conventions:

```
Load the fp-idiomatic-style skill and refactor this module
```

Works with any language: Python, TypeScript, Clojure, Go, Rust, etc.

Credits: Based on the config shared by @davidvujic.
