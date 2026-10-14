---
description: Permanently delete all indexed content from the context-mode knowledge base
---

Warn the user that this will permanently delete all indexed content from the FTS5 knowledge base.
Ask for confirmation before proceeding.

If confirmed, call `context-mode__ctx_purge` with `confirm: true` and display the result.
