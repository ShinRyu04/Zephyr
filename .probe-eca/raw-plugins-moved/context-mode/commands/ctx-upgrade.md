---
description: Upgrade context-mode to the latest version in place
---

Call the `context-mode__ctx_upgrade` tool. It returns a shell command to run.
Run that command using `eca__shell_command` and display the results as a checklist:
- `[x]` for each completed step
- `[ ]` for each failed step

Tell the user to restart their ECA session to pick up the new version.
