# context-mode

> ECA plugin for [context-mode](https://github.com/mksglu/context-mode) — saves up to 98% of your context window by routing large output through a sandboxed execution engine with BM25-indexed search and session continuity across compactions.

## What it does

- **Sandboxed execution** — `ctx_execute` and `ctx_execute_file` run code in an isolated subprocess; only `console.log()` output enters context
- **FTS5 knowledge base** — `ctx_batch_execute` auto-indexes all command output; `ctx_search` retrieves only the relevant chunks
- **Session continuity** — every file edit, git operation, decision, and error is captured to SQLite; after compaction the agent resumes with full context restored
- **Routing enforcement** — a `preToolCall` hook intercepts `eca__shell_command` / `eca__read_file` / `eca__grep` and nudges the agent toward sandbox tools; `curl`/`wget` are blocked

## Prerequisites

Install the `context-mode` npm package. With [mise](https://mise.jdx.dev/):

```toml
# ~/.config/mise/config.toml
[tools]
"npm:context-mode" = "latest"
```

Or globally:

```bash
npm install -g context-mode
```

## Commands

| Command | Description |
|---------|-------------|
| `/context-mode:ctx-stats` | Context savings — per-tool breakdown, token usage, savings ratio |
| `/context-mode:ctx-doctor` | Diagnose runtimes, hooks, FTS5, version |
| `/context-mode:ctx-upgrade` | Upgrade context-mode in place |
| `/context-mode:ctx-purge` | Permanently delete all indexed content from the knowledge base |

## Tools

| Tool | Description |
|------|-------------|
| `context-mode__ctx_execute` | Run code in a sandbox (JS, TS, Python, Shell, Ruby, Go, Rust, Perl) |
| `context-mode__ctx_execute_file` | Load a file into `FILE_CONTENT` and analyze it in a sandbox |
| `context-mode__ctx_batch_execute` | Run multiple commands, auto-index output, search results — one call |
| `context-mode__ctx_index` | Store content in the FTS5 knowledge base |
| `context-mode__ctx_search` | BM25 search across indexed content |
| `context-mode__ctx_fetch_and_index` | Fetch a URL, convert HTML to markdown, index for search |
| `context-mode__ctx_stats` | Context savings breakdown |
| `context-mode__ctx_doctor` | Diagnose runtimes, hooks, FTS5, version |
| `context-mode__ctx_upgrade` | Upgrade context-mode in place |
| `context-mode__ctx_purge` | Wipe the indexed knowledge base |

## Usage

Once installed, context-mode works automatically. The routing rules guide the agent toward sandbox tools for any operation that produces large output.

**Check everything is working:**

```
ctx doctor
```

**See context savings:**

```
ctx stats
```

**After compaction:** the agent automatically resumes from the session state captured in SQLite — no manual intervention needed.

## Session continuity

Every significant tool call is tracked:

| Need | Command |
|------|---------|
| What were we working on? | `context-mode__ctx_search(queries: ["summary"], sort: "timeline")` |
| What did we decide? | `context-mode__ctx_search(queries: ["decision"], source: "decision", sort: "timeline")` |
| What constraints exist? | `context-mode__ctx_search(queries: ["constraint"], source: "constraint")` |

## Think in Code

The core paradigm: write code that processes data and `console.log()` only the answer. Never read raw data into context.

```javascript
// Instead of eca__shell_command("gh pr list") → raw JSON floods context
context-mode__ctx_execute("javascript", `
  const { execSync } = await import('node:child_process');
  const prs = JSON.parse(execSync('gh pr list --json number,title,state --limit 20').toString());
  prs.forEach(p => console.log(\`#\${p.number} [\${p.state}] \${p.title}\`));
`)
```
