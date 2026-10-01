#!/usr/bin/env bash
# Validate and publish binary release assets. This script intentionally never
# runs git add/commit/push: the public GitHub repository must not receive local
# src/, src-tauri/, or scripts/ contents.
set -euo pipefail

REPO="D:/Zephyr"
cd "$REPO"
VERSI="$(node -p "require('./package.json').version")"
TAG="v${VERSI}"
REL="$REPO/release/$VERSI"
CEK_ONLY=0
DRY_RUN=0
case "${1:-}" in
  --cek) CEK_ONLY=1 ;;
  --dry-run) DRY_RUN=1 ;;
  "") ;;
  *) echo "Pakai: bash scripts/rilis-minggu.sh [--cek|--dry-run]" >&2; exit 2 ;;
esac

echo "=================================================="
echo "  ZEPHYR RILIS $VERSI - $(date '+%A %d %B %Y %H:%M')"
echo "=================================================="
echo "[1/3] validasi versi kanonis..."
node - <<'NODE'
const fs = require('fs');
const pkg = require('./package.json').version;
const tauri = require('./src-tauri/tauri.conf.json').version;
const cargo = /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync('src-tauri/Cargo.toml', 'utf8'))?.[1];
if (!pkg || tauri !== pkg || cargo !== pkg) {
  console.error('GAGAL: versi tidak konsisten', { package: pkg, cargo, tauri });
  process.exit(1);
}
console.log(`  ok: package.json, Cargo.toml, tauri.conf.json = ${pkg}`);
NODE

if ! bash scripts/cek-kunci.sh; then
  echo "GAGAL: kunci signing berbeda dari acuan" >&2
  exit 1
fi

echo "[2/3] validasi aset release..."
ARTEFAK=(
  "$REL/Zephyr_${VERSI}_x64-setup.exe"
  "$REL/Zephyr_${VERSI}_x64-setup.exe.sig"
  "$REL/Zephyr_${VERSI}_x64_en-US.msi"
  "$REL/Zephyr_${VERSI}_x64_en-US.msi.sig"
  "$REL/linux/Zephyr_${VERSI}_amd64.deb"
  "$REL/linux/Zephyr_${VERSI}_amd64.deb.sig"
  "$REL/linux/Zephyr_${VERSI}_amd64.AppImage"
  "$REL/linux/Zephyr_${VERSI}_amd64.AppImage.sig"
  "$REL/portable/Zephyr_${VERSI}_windows_portable.zip"
  "$REL/latest.json"
)
for lang in en id ja ko zh es fr de pt ar; do
  ARTEFAK+=("$REL/notes/RELEASE_NOTES_v${VERSI}.${lang}.md")
done
for a in "${ARTEFAK[@]}"; do
  if [ ! -s "$a" ]; then echo "GAGAL: aset hilang/kosong: $a" >&2; exit 1; fi
done

node - <<NODE
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$REL/latest.json', 'utf8'));
const read = (p) => fs.readFileSync(p, 'utf8').trim();
const fail = (m) => { console.error('GAGAL:', m); process.exit(1); };
if (manifest.version !== '$VERSI') fail('versi latest.json salah');
const langs = ['en','id','ja','ko','zh','es','fr','de','pt','ar'];
if (langs.some((lang) => !manifest.notes?.[lang]?.trim())) fail('latest.json tidak memuat 10 bahasa');
if (manifest.platforms?.['windows-x86_64']?.signature !== read('$REL/Zephyr_${VERSI}_x64-setup.exe.sig')) fail('signature NSIS latest.json tidak cocok');
if (manifest.platforms?.['linux-x86_64']?.signature !== read('$REL/linux/Zephyr_${VERSI}_amd64.AppImage.sig')) fail('signature AppImage latest.json tidak cocok');
console.log('  ok: semua aset, 10 bahasa, dan signature updater cocok');
NODE

if [ "$CEK_ONLY" = "1" ] || [ "$DRY_RUN" = "1" ]; then
  echo "[3/3] tidak menerbitkan ($([ "$CEK_ONLY" = "1" ] && echo cek || echo dry-run))"
  echo "Tidak ada commit, push, tag, atau upload yang dilakukan."
  exit 0
fi

echo "[3/3] terbitkan aset biner ke GitHub..."
if ! gh auth status >/dev/null 2>&1; then
  echo "GAGAL: gh belum login. Jalankan: gh auth login" >&2
  exit 1
fi
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "GAGAL: release $TAG sudah ada; tidak ditimpa" >&2
  exit 1
fi

# --target menunjuk commit yang SUDAH ada di remote. Hanya daftar aset eksplisit
# ini yang di-upload dari workstation; source lokal tidak pernah di-stage/push.
gh release create "$TAG" \
  --target main \
  --title "Zephyr v${VERSI}" \
  --notes-file "$REL/notes/RELEASE_NOTES_v${VERSI}.en.md" \
  "${ARTEFAK[@]}"

gh release view "$TAG" >/dev/null
echo "SELESAI: https://github.com/ShinRyu04/Zephyr/releases/tag/$TAG"
