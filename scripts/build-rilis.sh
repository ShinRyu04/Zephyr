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
VERSI="$(node -p "require('./package.json').version")"
KEY="${APPDATA:-$HOME/AppData/Roaming}/zephyr/zephyr.key"
KEYTXT="${APPDATA:-$HOME/AppData/Roaming}/zephyr/signing-key.txt"

if [ ! -f "$KEY" ]; then echo "GAGAL: kunci tidak ada di $KEY" >&2; exit 1; fi
if [ ! -f "$KEYTXT" ]; then echo "GAGAL: signing-key.txt tidak ada" >&2; exit 1; fi

node -e "const fs=require('fs'); const v=require('./package.json').version; const t=require('./src-tauri/tauri.conf.json').version; const c=/^version\\s*=\\s*\"([^\"]+)\"/m.exec(fs.readFileSync('src-tauri/Cargo.toml','utf8'))?.[1]; if (t!==v||c!==v) { console.error('GAGAL: versi kanonis tidak konsisten:', {package:v,tauri:t,cargo:c}); process.exit(1) } console.log('  versi:',v,'(package + Cargo + Tauri)')"

PW=$(grep '^Password' "$KEYTXT" | sed 's/^Password[[:space:]]*:[[:space:]]*//')
if [ "${#PW}" -lt 8 ]; then
  echo "GAGAL: password cuma ${#PW} karakter — format file berubah?" >&2
  exit 1
fi
echo "  password: ${#PW} karakter (harus 24)"

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PW"

echo "  membangun (Windows, flag hemat RAM)..."
# tauri:build:safe moves %APPDATA%\zephyr\secrets.json aside for the duration of
# the build and fails if a secrets file survives into the bundle. Plain
# tauri:build skips that guard, so never use it on the release path.
npm run tauri:build:safe 2>&1 | tail -20

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

# Stage hanya artefak RELEASE yang namanya cocok versi kanonis. Tidak pernah
# membaca target/debug, walaupun debug dibangun lebih baru.
NSIS="$REPO/src-tauri/target/release/bundle/nsis/Zephyr_${VERSI}_x64-setup.exe"
MSI="$REPO/src-tauri/target/release/bundle/msi/Zephyr_${VERSI}_x64_en-US.msi"
for f in "$REPO/src-tauri/target/release/zephyr.exe" "$NSIS" "$NSIS.sig" "$MSI" "$MSI.sig"; do
  if [ ! -f "$f" ]; then echo "GAGAL: artefak release hilang: $f" >&2; exit 1; fi
done
mkdir -p "$REPO/release/$VERSI"
cp "$NSIS" "$NSIS.sig" "$MSI" "$MSI.sig" "$REPO/release/$VERSI/"
npm run portable:package

echo "  staged: release/$VERSI (installer + portable; tidak ada artefak debug)"
