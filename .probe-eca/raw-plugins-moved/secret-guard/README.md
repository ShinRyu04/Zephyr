# Secret Guard

Prevents accidental commits of hardcoded secrets, API keys, and credentials by scanning file content before ECA writes it.

## What it provides

- **`secret-guard`** — A `preToolCall` hook that intercepts `eca__write_file` and `eca__edit_file` calls, scanning the content for common secret patterns before it reaches disk.

## Detected patterns

- AWS Access Keys (`AKIA...`)
- AWS Secret Access Keys
- Generic API keys (`api_key = "..."`)
- Bearer tokens
- Private keys (RSA, EC, DSA, OPENSSH)
- OpenAI keys (`sk-...`)
- GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`)
- Generic secret keys (`secret_key = "..."`)
- Password assignments
- Connection strings with embedded passwords (`://user:pass@host`)

## Requirements

- **`jq`** must be installed for JSON parsing
- **`grep -E`** (extended regex) must be available (default on Linux and macOS)

## How it works

1. ECA triggers a `write_file` or `edit_file` tool call.
2. The `preToolCall` hook receives the tool input as JSON on stdin.
3. The script extracts the file content being written and scans it against known secret patterns.
4. If a match is found, a visible warning is surfaced so you can review the content before proceeding.
5. The hook always exits successfully — it warns but never blocks the tool call.

Credits: By the ECA team.
