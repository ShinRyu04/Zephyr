#!/usr/bin/env bash
set -uo pipefail

REPO=/mnt/d/Zephyr
KEY=/mnt/c/Users/home/AppData/Roaming/zephyr/zephyr.key
cd "$REPO"

export PATH="$HOME/.cargo/bin:$PATH"
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='Z3phyr-S1gn1ng-2026-K3y!'
echo "== cargo: $(command -v cargo) | key len: ${#TAURI_SIGNING_PRIVATE_KEY} =="
cargo --version

echo "== tauri build linux =="
npx tauri build --bundles appimage,deb 2>&1 | tail -45
