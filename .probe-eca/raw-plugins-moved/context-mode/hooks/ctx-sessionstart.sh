#!/usr/bin/env bash
# context-mode sessionStart hook for ECA.
# Injects routing instructions at session start; rebuilds session state after
# compaction from the SQLite snapshot captured by ctx-posttooluse.sh.
set -euo pipefail

if ! command -v context-mode &>/dev/null; then
  exit 0
fi

CM_BIN="$(command -v context-mode)"
if command -v mise &>/dev/null; then
  CM_BIN="$(mise which context-mode 2>/dev/null || echo "$CM_BIN")"
fi

export CLAUDE_PROJECT_DIR="${workspaceFolder:-$(pwd)}"
export CONTEXT_MODE_PROJECT_DIR="$CLAUDE_PROJECT_DIR"

CM_ROOT="$(dirname "$CM_BIN")/../lib/node_modules/context-mode"
exec node "$CM_ROOT/hooks/sessionstart.mjs"
