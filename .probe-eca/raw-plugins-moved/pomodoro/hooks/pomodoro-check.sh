#!/usr/bin/env bash
set -euo pipefail

TIMER_FILE="/tmp/eca-pomodoro-start"

if [ ! -f "$TIMER_FILE" ]; then
  date +%s > "$TIMER_FILE"
  exit 0
fi

start=$(cat "$TIMER_FILE")
now=$(date +%s)
elapsed=$(( (now - start) / 60 ))

if [ "$elapsed" -ge 25 ]; then
  echo "🍅 You've been coding for ${elapsed} minutes! Consider a 5-minute break to recharge."
  date +%s > "$TIMER_FILE"
fi

exit 0
