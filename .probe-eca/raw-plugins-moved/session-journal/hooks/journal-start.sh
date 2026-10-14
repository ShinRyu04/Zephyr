#!/usr/bin/env bash
set -euo pipefail

JOURNAL_DIR="${ECA_JOURNAL_DIR:-$HOME/.eca/journal}"
mkdir -p "$JOURNAL_DIR"

INPUT=$(cat)

if command -v jq &>/dev/null; then
  CHAT_ID=$(echo "$INPUT" | jq -r '.chat_id // "unknown"')
  WORKSPACES=$(echo "$INPUT" | jq -r '(.workspaces // []) | join(", ")')
else
  CHAT_ID="unknown"
  WORKSPACES="unknown"
fi

TODAY=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)

cat >> "$JOURNAL_DIR/$TODAY.md" <<EOF
## Session started at $TIME
- **Chat:** $CHAT_ID
- **Workspaces:** $WORKSPACES

EOF

exit 0
