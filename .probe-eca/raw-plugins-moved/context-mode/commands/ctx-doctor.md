---
description: Diagnose the context-mode installation — runtimes, hooks, FTS5, version
---

Call the `context-mode__ctx_doctor` tool. It returns a shell command to run.
Run that command using `eca__shell_command` and display the results as a checklist:
- `[x]` for each passing check
- `[ ]` for each failing check
