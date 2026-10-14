#!/usr/bin/env bash
# Starts the context-mode MCP server via node + start.mjs directly.
# Calling node <path>.mjs (instead of the context-mode CLI shim) ensures Bun
# can be used correctly for sandbox execution in ctx_execute / ctx_execute_file.
set -euo pipefail

if ! command -v context-mode &>/dev/null; then
  echo '{"error": "context-mode not found. Install with: npm install -g context-mode"}' >&2
  exit 1
fi

CM_BIN="$(command -v context-mode)"
# Resolve through mise shim if present
if command -v mise &>/dev/null; then
  CM_BIN="$(mise which context-mode 2>/dev/null || echo "$CM_BIN")"
fi

CM_ROOT="$(dirname "$CM_BIN")/../lib/node_modules/context-mode"
exec node "$CM_ROOT/start.mjs"
