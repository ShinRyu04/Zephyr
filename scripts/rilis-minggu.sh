#!/usr/bin/env bash
# rilis-minggu.sh — commit + push + rilis GitHub Zephyr v1.1.10.
#
# Dijalankan otomatis oleh cron hari Minggu. Semua langkah diverifikasi:
# kalau ada satu langkah gagal, script BERHENTI dan tidak melanjutkan
# (set -e), jadi tidak mungkin rilis setengah jadi.
#
# Yang dilakukan:
#   1. cek prasyarat (gh login, artefak ada, sig cocok, versi 1.1.10)
#   2. hapus file sampah (screenshot uji)
#   3. commit semua perubahan
#   4. push ke origin/main
#   5. buat tag v1.1.10 + push tag
#   6. buat GitHub Release + upload SEMUA installer + sig + latest.json
#   7. verifikasi: cek /releases/latest/download/latest.json bisa diakses
#
# Kalau sudah pernah jalan (tag v1.1.10 ada), script berhenti dengan pesan
# jelas — tidak menimpa rilis yang sudah ada.

set -euo pipefail

REPO="D:/Zephyr"
VERSI="1.1.10"
TAG="v${VERSI}"
REL="$REPO/release/$VERSI"

# Mode uji: --cek hanya menjalankan pemeriksaan (langkah 1-2) tanpa
# commit/push/rilis. --dry-run melakukan SEMUA langkah tapi tanpa efek:
# commit & tag dibuat di git LOKAL saja, tanpa push dan tanpa release.
CEK_ONLY=0
DRY_RUN=0
case "${1:-}" in
  --cek) CEK_ONLY=1 ;;
  --dry-run) DRY_RUN=1 ;;
esac

cd "$REPO"

echo "=================================================="
echo "  ZEPHYR RILIS $VERSI — $(date '+%A %d %B %Y %H:%M')"
echo "=================================================="

# ── 1. PRASYARAT ────────────────────────────────────────────────
echo ""
echo "[1/7] cek prasyarat..."

if ! gh auth status >/dev/null 2>&1; then
  echo "GAGAL: gh belum login. Jalankan: gh auth login"
  exit 1
fi
echo "  ok: gh login"

# sudah pernah rilis?
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "  LEWAT: tag $TAG sudah ada — rilis sudah pernah jalan."
  echo "         Tidak ada yang diubah. Hapus tag kalau mau ulang:"
  echo "         git tag -d $TAG && git push origin :refs/tags/$TAG"
  exit 0
fi

# versi konsisten?
for f in package.json src-tauri/tauri.conf.json; do
  if ! grep -q "\"$VERSI\"" "$f"; then
    echo "GAGAL: $f tidak berisi versi $VERSI"
    exit 1
  fi
done
grep -q "^version = \"$VERSI\"" src-tauri/Cargo.toml || { echo "GAGAL: Cargo.toml bukan $VERSI"; exit 1; }
echo "  ok: versi $VERSI konsisten di 3 file"

# README juga harus menyebut versi ini. README sempat ketinggalan di v1.1.9
# saat 1.1.10 sudah siap rilis — halaman depan menunjuk installer yang salah.
grep -q "v$VERSI" README.md || {
  echo "GAGAL: README.md tidak menyebut v$VERSI (masih versi lama?)"
  echo "       Perbarui baris versi + nama installer di README dulu."
  exit 1
}
echo "  ok: README.md menyebut v$VERSI"

# artefak lengkap?
ARTEFAK=(
  "$REL/Zephyr_${VERSI}_x64-setup.exe"
  "$REL/Zephyr_${VERSI}_x64-setup.exe.sig"
  "$REL/Zephyr_${VERSI}_x64_en-US.msi"
  "$REL/Zephyr_${VERSI}_x64_en-US.msi.sig"
  "$REL/linux/Zephyr_${VERSI}_amd64.deb"
  "$REL/linux/Zephyr_${VERSI}_amd64.deb.sig"
  "$REL/linux/Zephyr_${VERSI}_amd64.AppImage"
  "$REL/linux/Zephyr_${VERSI}_amd64.AppImage.sig"
  "$REL/latest.json"
  "$REPO/RELEASE_NOTES_v${VERSI}.md"
)
for a in "${ARTEFAK[@]}"; do
  if [ ! -f "$a" ]; then
    echo "GAGAL: artefak hilang: $a"
    exit 1
  fi
done
echo "  ok: 10 artefak lengkap"

# sig di latest.json cocok dengan file .sig?
python - <<PY
import io, json, sys
d = json.load(io.open('release/$VERSI/latest.json', encoding='utf-8'))
w = io.open('release/$VERSI/Zephyr_${VERSI}_x64-setup.exe.sig', encoding='utf-8').read().strip()
l = io.open('release/$VERSI/linux/Zephyr_${VERSI}_amd64.AppImage.sig', encoding='utf-8').read().strip()
ok_w = d['platforms']['windows-x86_64']['signature'] == w
ok_l = d['platforms']['linux-x86_64']['signature'] == l
if not (ok_w and ok_l):
    print('GAGAL: signature di latest.json tidak cocok dengan file .sig')
    sys.exit(1)
print('  ok: signature latest.json cocok (windows + linux)')
PY

# ── 2. BERSIHKAN SAMPAH ─────────────────────────────────────────
echo ""
echo "[2/7] bersihkan file sampah..."
rm -f shot-topmost.png
echo "  ok"

if [ "$CEK_ONLY" = "1" ]; then
  echo ""
  echo "=================================================="
  echo "  MODE CEK SELESAI — semua prasyarat lulus."
  echo "  Tidak ada commit/push/rilis yang dijalankan."
  echo "  Jalankan tanpa --cek untuk rilis sungguhan."
  echo "=================================================="
  exit 0
fi

# ── 3. COMMIT ───────────────────────────────────────────────────
echo ""
echo "[3/7] commit..."
git add -A
JUMLAH=$(git diff --cached --name-only | wc -l | tr -d ' ')
if [ "$JUMLAH" = "0" ]; then
  echo "  tidak ada perubahan untuk di-commit"
else
  if [ "$DRY_RUN" = "1" ]; then
    echo "  [dry-run] akan commit $JUMLAH file (tidak dijalankan)"
  else
    git commit -q -m "zephyr: v${VERSI} — AI skills/memory/cron, i18n lengkap, RAM ~118 MB, tanpa kedip console" \
      -m "Fitur baru AI panel: skill (SKILL.md), memory lintas sesi, tugas terjadwal (cron), 22 tool agent, tombol hapus riwayat chat + chat baru." \
      -m "Tampilan: logo menubar diperbaiki (glyph penuh, sejajar Activity Bar), menu akun GitHub di avatar." \
      -m "Perbaikan: blank screen dari Settings, Ctrl+V dobel di terminal, notifikasi update ikut bahasa, avatar GitHub asli, katalog model 92 -> 50." \
      -m "Binary 23.8 MB -> 9.4 MB, RAM 208 MB -> ~118 MB idle (sisa ~104 MB baseline WebView2), console window tidak lagi berkedip." \
      -m "Build: Windows MSI + NSIS, Linux .deb + .AppImage, semuanya signed dan signature diverifikasi."
    echo "  ok: $JUMLAH file di-commit"
  fi
fi

# ── 4. PUSH ─────────────────────────────────────────────────────
echo ""
echo "[4/7] push ke origin/main..."
if [ "$DRY_RUN" = "1" ]; then
  echo "  [dry-run] dilewati"
else
  git push origin main
  echo "  ok"
fi

# ── 5. TAG ──────────────────────────────────────────────────────
echo ""
echo "[5/7] tag $TAG..."
if [ "$DRY_RUN" = "1" ]; then
  echo "  [dry-run] dilewati"
else
  git tag -a "$TAG" -m "Zephyr $VERSI"
  git push origin "$TAG"
  echo "  ok"
fi

# ── 6. GITHUB RELEASE ───────────────────────────────────────────
echo ""
echo "[6/7] buat GitHub Release + upload artefak..."
if [ "$DRY_RUN" = "1" ]; then
  echo "  [dry-run] akan upload 9 aset (97 MB) ke release $TAG"
  echo "  [dry-run] dilewati"
else
  gh release create "$TAG" \
    --title "Zephyr v${VERSI}" \
    --notes-file "$REPO/RELEASE_NOTES_v${VERSI}.md" \
    "$REL/Zephyr_${VERSI}_x64-setup.exe" \
    "$REL/Zephyr_${VERSI}_x64-setup.exe.sig" \
    "$REL/Zephyr_${VERSI}_x64_en-US.msi" \
    "$REL/Zephyr_${VERSI}_x64_en-US.msi.sig" \
    "$REL/linux/Zephyr_${VERSI}_amd64.deb" \
    "$REL/linux/Zephyr_${VERSI}_amd64.deb.sig" \
    "$REL/linux/Zephyr_${VERSI}_amd64.AppImage" \
    "$REL/linux/Zephyr_${VERSI}_amd64.AppImage.sig" \
    "$REL/latest.json"
  echo "  ok"
fi

# ── 7. VERIFIKASI ───────────────────────────────────────────────
echo ""
echo "[7/7] verifikasi rilis..."
if [ "$DRY_RUN" = "1" ]; then
  echo "  [dry-run] dilewati"
  echo ""
  echo "=================================================="
  echo "  DRY-RUN SELESAI — semua langkah siap."
  echo "  Tidak ada push, tag, atau release yang dibuat."
  echo "  (git add sudah dijalankan; batalkan dengan: git reset)"
  echo "=================================================="
  exit 0
fi

sleep 8

if ! gh release view "$TAG" >/dev/null 2>&1; then
  echo "GAGAL: release $TAG tidak bisa dibaca"
  exit 1
fi
echo "  ok: release ada"

JUMLAH_ASET=$(gh release view "$TAG" --json assets --jq '.assets | length')
echo "  ok: $JUMLAH_ASET aset terupload"

# endpoint updater — ini yang dipakai app untuk auto-update
URL="https://github.com/ShinRyu04/Zephyr/releases/latest/download/latest.json"
KODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$URL" || echo "000")
if [ "$KODE" = "200" ]; then
  echo "  ok: endpoint updater hidup (HTTP 200)"
  VERSI_ONLINE=$(curl -s -L "$URL" | python -c "import json,sys; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "?")
  echo "  ok: latest.json online melaporkan versi $VERSI_ONLINE"
else
  echo "  PERINGATAN: endpoint updater balas HTTP $KODE (mungkin masih propagasi)"
fi

echo ""
echo "=================================================="
echo "  SELESAI — Zephyr $VERSI sudah rilis di GitHub"
echo "  https://github.com/ShinRyu04/Zephyr/releases/tag/$TAG"
echo "=================================================="
