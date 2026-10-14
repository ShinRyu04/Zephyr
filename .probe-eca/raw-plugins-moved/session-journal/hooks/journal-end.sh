#!/usr/bin/env bash
set -euo pipefail

JOURNAL_DIR="${ECA_JOURNAL_DIR:-$HOME/.eca/journal}"
mkdir -p "$JOURNAL_DIR"

INPUT=$(cat)

if command -v jq &>/dev/null; then
  CHAT_ID=$(echo "$INPUT" | jq -r '.chat_id // "unknown"')
else
  CHAT_ID="unknown"
fi

TODAY=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)

cat >> "$JOURNAL_DIR/$TODAY.md" <<EOF
### Session ended at $TIME
- **Chat:** $CHAT_ID
---

EOF

exit 0
