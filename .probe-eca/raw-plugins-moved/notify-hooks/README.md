# Notify Hooks

Desktop sound notifications for ECA events — never miss when ECA finishes or needs your approval.

## What it provides

Two hooks that play system sounds:

- **`notify-finished`** — Plays a completion sound when ECA finishes responding (postRequest).
- **`notify-approval`** — Plays a notification sound when ECA needs tool call approval (preToolCall).

## Platform support

- **Linux** — Uses `canberra-gtk-play` (install via `libcanberra-gtk3` package)
- **macOS** — Falls back to `afplay` with built-in system sounds

## Requirements

- **Linux:** `sudo apt install libcanberra-gtk3-module` (Debian/Ubuntu) or equivalent
- **macOS:** No additional setup needed
- **`jq`** must be installed for the approval notification filter

Credits: Based on the config shared by @ericdallo.
