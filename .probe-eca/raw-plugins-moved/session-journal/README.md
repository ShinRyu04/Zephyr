# Session Journal

Automatically logs the start and end of every ECA chat session to a daily Markdown journal file, creating a lightweight dev activity log.

## What it provides

- **journal-start** (`chatStart` hook) — Records a new session entry with chat ID and workspaces.
- **journal-end** (`chatEnd` hook) — Appends an end-of-session marker with timestamp.

## Journal format

Each day produces a `YYYY-MM-DD.md` file:

```markdown
## Session started at 09:15:32
- **Chat:** abc-123
- **Workspaces:** /home/user/project-a, /home/user/project-b

### Session ended at 10:42:07
- **Chat:** abc-123
---
```

## Journal location

By default journals are written to `~/.eca/journal/`.

Override by setting the `ECA_JOURNAL_DIR` environment variable:

```bash
export ECA_JOURNAL_DIR="$HOME/my-journals"
```

## Requirements

- `jq` is recommended for extracting session metadata from stdin. Without it, fields fall back to `"unknown"`.

---

By the ECA team.
