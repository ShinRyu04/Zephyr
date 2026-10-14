#!/usr/bin/env bash
# context-mode preToolCall hook for ECA.
# Intercepts eca__shell_command, eca__read_file, and eca__grep; blocks
# curl/wget; injects routing nudges toward sandbox tools.
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
exec node "$CM_ROOT/hooks/pretooluse.mjs"
