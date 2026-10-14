---
name: context-mode
description: |
  Use context-mode tools (context-mode__ctx_execute, context-mode__ctx_execute_file) instead of
  eca__shell_command/eca__read_file when processing large outputs. Triggers: "analyze logs",
  "summarize output", "process data", "parse JSON", "filter results", "extract errors",
  "check build output", "analyze dependencies", "process API response", "large file analysis",
  "run tests", "test output", "coverage report", "git log", "recent commits",
  "diff between branches", "fetch docs", "API reference", "index documentation",
  "call API", "check response", "query results", "find TODOs", "count lines",
  "codebase statistics", "security audit", "outdated packages", "dependency tree".
  Also triggers on ANY tool output that may exceed 20 lines.
---

# Context Mode: Default for All Large Output

## MANDATORY RULE

Default to context-mode for ALL commands that produce output. Only use `eca__shell_command`
for guaranteed-small-output operations.

`eca__shell_command` whitelist (safe to run directly):
- **File mutations**: `mkdir`, `mv`, `cp`, `rm`, `touch`, `chmod`
- **Git writes**: `git add`, `git commit`, `git push`, `git checkout`, `git branch`, `git merge`
- **Navigation**: `cd`, `pwd`, `which`
- **Process control**: `kill`, `pkill`
- **Package management**: `npm install`, `pip install`
- **Simple output**: `echo`, `printf`

**Everything else → `context-mode__ctx_execute` or `context-mode__ctx_execute_file`.**

## Think in Code — MANDATORY

Analyze/count/filter/compare/search/parse/transform data: **write code** via
`context-mode__ctx_execute(language, code)`, `console.log()` only the answer.
Do NOT read raw data into context. PROGRAM the analysis, not COMPUTE it.
Pure JavaScript — Node.js built-ins only (`fs`, `path`, `child_process`).
`try/catch`, handle `null`/`undefined`. One script replaces ten tool calls.

## BLOCKED — do NOT use

### curl / wget — FORBIDDEN (hook-enforced)
Do NOT use `curl`/`wget` in `eca__shell_command`. Dumps raw HTTP into context.
Use: `context-mode__ctx_fetch_and_index(url, source)` or
     `context-mode__ctx_execute(language: "javascript", code: "const r = await fetch(...)")`

### Inline HTTP — FORBIDDEN
No `node -e "fetch(..."`, `python -c "requests.get(..."`. Bypasses sandbox.
Use: `context-mode__ctx_execute(language, code)` — only stdout enters context.

### Direct web fetching — FORBIDDEN
Raw HTML can exceed 100 KB.
Use: `context-mode__ctx_fetch_and_index(url, source)` then `context-mode__ctx_search(queries)`

## Tool Selection

0. **MEMORY**: `context-mode__ctx_search(sort: "timeline")` — after resume, check prior context before asking user.
1. **GATHER**: `context-mode__ctx_batch_execute(commands, queries)` — runs all commands, auto-indexes, returns search. ONE call replaces 30+.
2. **FOLLOW-UP**: `context-mode__ctx_search(queries: ["q1", "q2", ...])` — all questions as array, ONE call.
3. **PROCESSING**: `context-mode__ctx_execute(language, code)` | `context-mode__ctx_execute_file(path, language, code)` — sandbox only.
4. **WEB**: `context-mode__ctx_fetch_and_index(url, source)` then `context-mode__ctx_search(queries)`.
5. **INDEX**: `context-mode__ctx_index(content, source)` — store in FTS5 for later search.

## REDIRECTED — use sandbox

### eca__shell_command (>20 lines output)
Use ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`.
Otherwise: `context-mode__ctx_batch_execute(commands, queries)` or
           `context-mode__ctx_execute(language: "shell", code: "...")`

### eca__read_file (for analysis)
Reading to **edit** → `eca__read_file` correct.
Reading to **analyze/explore/summarize** → `context-mode__ctx_execute_file(path, language, code)`.

### eca__grep (large results)
Use `context-mode__ctx_execute(language: "shell", code: "grep ...")` in sandbox.

## Output

Terse like caveman. Technical substance exact. Only fluff die.
Drop: articles, filler, pleasantries, hedging. Fragments OK. Short synonyms. Code unchanged.
Pattern: [thing] [action] [reason]. [next step].
Write artifacts to FILES — never inline. Return: file path + 1-line description.

## Session Continuity

Session history is persistent and searchable. On resume, search BEFORE asking the user:

| Need | Command |
|------|---------|
| What were we working on? | `context-mode__ctx_search(queries: ["summary"], sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| What constraints exist? | `context-mode__ctx_search(queries: ["constraint"], source: "constraint")` |

DO NOT ask "what were we working on?" — SEARCH FIRST.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call `context-mode__ctx_stats` tool, display output verbatim |
| `ctx doctor` | Call `context-mode__ctx_doctor` tool, run returned shell command |
| `ctx upgrade` | Call `context-mode__ctx_upgrade` tool, run returned shell command |
| `ctx purge` | Call `context-mode__ctx_purge` tool with confirm: true |
