#!/usr/bin/env bash
set -euo pipefail

# Read hook input from stdin
input=$(cat)

# Ensure jq is available
if ! command -v jq &>/dev/null; then
  exit 0
fi

# Extract content: write_file uses .tool_input.content, edit_file uses .tool_input.new_content
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_content // empty')

if [ -z "$content" ]; then
  exit 0
fi

patterns=(
  'AKIA[0-9A-Z]{16}'
  'aws_secret_access_key'
  'api[_\-]?key[[:space:]]*[:=][[:space:]]*['"'"'"][a-zA-Z0-9]'
  'bearer[[:space:]]+[a-zA-Z0-9_\-\.]+'
  'BEGIN[[:space:]]+(RSA[[:space:]]+|EC[[:space:]]+|DSA[[:space:]]+|OPENSSH[[:space:]]+)?PRIVATE[[:space:]]+KEY'
  'sk-[a-zA-Z0-9]{20,}'
  'gh[pousr]_[a-zA-Z0-9]{36,}'
  'secret[_\-]?key[[:space:]]*[:=][[:space:]]*['"'"'"][a-zA-Z0-9]'
  'password[[:space:]]*[:=][[:space:]]*['"'"'"][^'"'"'"]{8,}'
  '://[^:]+:[^@]+@'
)

found=false
for pattern in "${patterns[@]}"; do
  if echo "$content" | grep -qEi "$pattern"; then
    found=true
    break
  fi
done

if [ "$found" = true ]; then
  echo "⚠️ POTENTIAL SECRET DETECTED — The content being written may contain hardcoded credentials, API keys, or tokens. Please review before proceeding."
fi

exit 0
