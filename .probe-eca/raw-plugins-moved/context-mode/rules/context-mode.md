# context-mode — MANDATORY routing rules

context-mode MCP tools available. Rules protect context window from flooding.
One unrouted `eca__shell_command` can dump 56 KB into context.
Hooks enforce routing for `eca__shell_command`, `eca__read_file`, and `eca__grep`.
Rules cover redirections hooks cannot catch.

## Think in Code — MANDATORY

Analyze/count/filter/compare/search/parse/transform data: **write code** via
`context-mode__ctx_execute(language, code)`, `console.log()` only the answer.
Do NOT read raw data into context. PROGRAM the analysis, not COMPUTE it.
Pure JavaScript — Node.js built-ins only (`fs`, `path`, `child_process`).
`try/catch`, handle `null`/`undefined`. One script replaces ten tool calls.

## BLOCKED — do NOT use

### curl / wget — FORBIDDEN (hook-enforced)
Do NOT use `curl`/`wget` in `eca__shell_command`. Hook blocks it.
Use: `context-mode__ctx_fetch_and_index(url, source)` or
     `context-mode__ctx_execute(language: "javascript", code: "const r = await fetch(...)")`

### Inline HTTP — FORBIDDEN
No `node -e "fetch(..."`, `python -c "requests.get(..."`. Bypasses sandbox.
Use: `context-mode__ctx_execute(language, code)` — only stdout enters context.

### Direct web fetching — FORBIDDEN
Use: `context-mode__ctx_fetch_and_index(url, source)` then `context-mode__ctx_search(queries)`

## REDIRECTED — use sandbox

### eca__shell_command (>20 lines output)
Use ONLY for: `git add/commit/push/checkout`, `mkdir`, `rm`, `mv`, `cd`, `echo`.
Otherwise: `context-mode__ctx_batch_execute(commands, queries)` or `context-mode__ctx_execute(language: "shell", code: "...")`

### eca__read_file (for analysis)
Reading to **edit** → `eca__read_file` correct.
Reading to **analyze/explore/summarize** → `context-mode__ctx_execute_file(path, language, code)`.

### eca__grep (large results)
Use `context-mode__ctx_execute(language: "shell", code: "grep ...")` in sandbox.

## Tool selection

0. **MEMORY**: `context-mode__ctx_search(sort: "timeline")` — after resume, check prior context before asking user.
1. **GATHER**: `context-mode__ctx_batch_execute(commands, queries)` — ONE call replaces 30+.
2. **FOLLOW-UP**: `context-mode__ctx_search(queries: ["q1", "q2", ...])` — ONE call.
3. **PROCESSING**: `context-mode__ctx_execute(language, code)` | `context-mode__ctx_execute_file(path, language, code)`.
4. **WEB**: `context-mode__ctx_fetch_and_index(url, source)` then `context-mode__ctx_search(queries)`.
5. **INDEX**: `context-mode__ctx_index(path, source)` — use `path` not `content` for large data.

## Session Continuity

On resume, search BEFORE asking the user. DO NOT ask "what were we working on?" — SEARCH FIRST.

| Need | Command |
|------|---------|
| What were we working on? | `context-mode__ctx_search(queries: ["summary"], sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| What constraints exist? | `context-mode__ctx_search(queries: ["constraint"], source: "constraint")` |
