#!/usr/bin/env bash
# build-rilis.sh — build rilis Zephyr (Windows) + sign updater.
#
# Jebakan yang sudah kena berkali-kali:
#   1. `tauri build` polos membuang flag hemat RAM -> WAJIB `npm run tauri:build`
#      (= tauri build --config tauri.release.conf.json).  460 MB vs 118 MB.
#   2. Password di signing-key.txt formatnya `Password    : nilai` (PAKAI TITIK
#      DUA). `sed 's/^Password *= *//'` menyisakan "Password    : " di dalam
#      password -> 38 karakter, bukan 24 -> "Wrong password for that key".
#      Regex yang benar: sed 's/^Password[[:space:]]*:[[:space:]]*//'
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"
KEY="${APPDATA:-$HOME/AppData/Roaming}/zephyr/zephyr.key"
KEYTXT="${APPDATA:-$HOME/AppData/Roaming}/zephyr/signing-key.txt"

if [ ! -f "$KEY" ]; then echo "GAGAL: kunci tidak ada di $KEY" >&2; exit 1; fi
if [ ! -f "$KEYTXT" ]; then echo "GAGAL: signing-key.txt tidak ada" >&2; exit 1; fi

PW=$(grep '^Password' "$KEYTXT" | sed 's/^Password[[:space:]]*:[[:space:]]*//')
if [ "${#PW}" -lt 8 ]; then
  echo "GAGAL: password cuma ${#PW} karakter — format file berubah?" >&2
  exit 1
fi
echo "  password: ${#PW} karakter (harus 24)"

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PW"

echo "  membangun (Windows, flag hemat RAM)..."
npm run tauri:build 2>&1 | tail -20

echo ""
echo "  cek signature..."
for f in "$REPO"/src-tauri/target/release/bundle/nsis/*.sig \
         "$REPO"/src-tauri/target/release/bundle/msi/*.sig; do
  if [ -f "$f" ]; then
    echo "    OK  $(basename "$f") ($(stat -c%s "$f" 2>/dev/null || wc -c < "$f") bytes)"
  else
    echo "    HILANG  $f"
  fi
done
