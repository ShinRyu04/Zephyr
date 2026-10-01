#!/usr/bin/env bash
# Start the Zephyr debug app with the CDP port open.
#
# The env var has to be set INSIDE the same command that launches the binary:
# `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=... ./zephyr.exe` through a background
# terminal session was losing it, so WebView2 never opened 9223 and every CDP
# harness failed with ECONNREFUSED while the app itself looked alive.
#
# Runs in the foreground so the caller can background the whole script; the app
# stays attached to it, which also means one place to kill.

set -u
cd "$(dirname "$0")/../src-tauri" || exit 1

export WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223"
echo "  starting zephyr (cdp 9223)…"
exec ./target/debug/zephyr.exe
