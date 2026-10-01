#!/usr/bin/env bash
# Start Zephyr in dev with BOTH the CDP port and the RAM-saving flags.
#
# The release config carries the RAM flags, but a release build takes minutes
# and the flags cannot be verified against it without one. WebView2 takes
# `additionalBrowserArgs` from this env var too, and the env var wins over
# config — so this script is the fast channel: sweep a flag set here, measure,
# and only then commit it to `tauri.release.conf.json`.
#
# `--single-process` merges renderer + GPU + utility into the browser process.
# It is a Chromium debug flag and disables site isolation, so one renderer
# crash takes the app down; it is kept in a release-only config for that
# reason, and this script is for measuring it, not for daily driving.

set -u
cd "$(dirname "$0")/../src-tauri" || exit 1

export WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223 --single-process --renderer-process-limit=1 --js-flags=--max-old-space-size=192 --disable-background-networking --no-first-run --disable-component-update --disable-domain-reliability --disable-sync --disable-features=SpareRendererForSitePerProcess,CalculateNativeWinOcclusion,msWebOOUI,msPdfOOUI,msSmartScreenProtection,msEdgeIdentity,msEdgeSync,msEdgeAutofill,msEdgeSidebar,msEdgeShoppingAssistant,msEdgeCollections,msEdgeWorkspaces"
echo "  starting zephyr (cdp 9223 + ram flags)…"
exec ./target/debug/zephyr.exe
