#!/usr/bin/env bash
# build-linux-lokal.sh — build .deb + .AppImage Zephyr DI LAPTOP (via WSL),
# tanpa push ke GitHub dan tanpa CI.
#
# Kenapa copy ke ext4 dulu: /mnt/d itu drvfs (filesystem Windows yang
# di-mount). Cargo di drvfs bisa 5-10x lebih lambat karena ribuan file kecil
# dan tidak ada hardlink yang benar. Build di ~/ (ext4) lalu salin hasilnya.
#
# JEBAKAN yang sudah kena:
#   1. Password signing di signing-key.txt formatnya `Password    : nilai`
#      (PAKAI TITIK DUA). Script versi lama mengandalkan env SIGN_PW yang
#      tidak pernah diisi -> TAURI_SIGNING_PRIVATE_KEY_PASSWORD kosong ->
#      signature gagal. Sekarang password dibaca sendiri dari file itu.
#   2. `wsl bash /mnt/d/...` bisa gagal "cd: /mnt/d/Zephyr: No such file"
#      kalau interop-nya sedang aneh; jalankan lewat `wsl` dari Windows dan
#      pastikan path-nya absolut.
set -euo pipefail

SRC=/mnt/d/Zephyr
WORK=$HOME/zephyr-build
KEY=/mnt/c/Users/home/AppData/Roaming/zephyr/zephyr.key
KEYTXT=/mnt/c/Users/home/AppData/Roaming/zephyr/signing-key.txt
OUT=/mnt/d/Zephyr/release/1.1.10/linux

# cargo/rustc dipasang lewat rustup ke ~/.cargo/bin, dan direktori itu TIDAK
# selalu ada di PATH shell non-interaktif (mis. `wsl bash script.sh`). Tanpa
# ini `cargo metadata` gagal dengan "No such file or directory (os error 2)".
export PATH="$HOME/.cargo/bin:$PATH"

echo "=== 0. cek prasyarat ==="
[ -d "$SRC" ] || { echo "GAGAL: $SRC tidak ada"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "GAGAL: cargo tidak ada - install rustup dulu"; exit 1; }
echo "  cargo: $(cargo --version)"
echo "  node : $(node --version)"
[ -f "$KEY" ] || { echo "GAGAL: kunci tidak ada di $KEY"; exit 1; }
[ -f "$KEYTXT" ] || { echo "GAGAL: signing-key.txt tidak ada"; exit 1; }

# Password: buang prefix "Password" + titik dua + spasi. Salinan Windows
# punya akhir baris CRLF, jadi \r dibuang juga — kalau tidak, password jadi
# 25 karakter dan Tauri menolaknya.
PW=$(grep '^Password' "$KEYTXT" | sed 's/^Password[[:space:]]*:[[:space:]]*//' | tr -d '\r\n')
if [ "${#PW}" -lt 8 ]; then
  echo "GAGAL: password cuma ${#PW} karakter, harusnya 24"
  exit 1
fi
echo "  password: ${#PW} karakter"

echo "=== 1. siapkan folder kerja di ext4 ==="
rm -rf "$WORK"
mkdir -p "$WORK"
cd "$SRC"

# salin tanpa target/ node_modules/ .git/ dist/ — semuanya dibuat ulang
echo "menyalin source..."
tar -cf - \
  --exclude='./src-tauri/target' \
  --exclude='./node_modules' \
  --exclude='./.git' \
  --exclude='./dist' \
  --exclude='./release' \
  --exclude='./.vite' \
  --exclude='./.si-tmp' \
  . | (cd "$WORK" && tar -xf -)

echo "ukuran source tersalin: $(du -sh "$WORK" | cut -f1)"

echo "=== 2. npm ci ==="
cd "$WORK"
npm ci --no-audit --no-fund 2>&1 | tail -5

echo "=== 3. build deb + appimage, profil release ==="
# Pakai config release supaya flag hemat RAM ikut (--config), sama seperti
# sisi Windows: `tauri build` polos membuang tauri.release.conf.json.
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$PW"

npx --yes @tauri-apps/cli@^2 build \
  --config src-tauri/tauri.release.conf.json \
  --bundles deb appimage 2>&1 | tail -25

echo "=== 4. salin hasil ke D:\\Zephyr\\release\\1.1.10\\linux ==="
mkdir -p "$OUT"
for f in "$WORK"/src-tauri/target/release/bundle/deb/*.deb \
         "$WORK"/src-tauri/target/release/bundle/deb/*.deb.sig \
         "$WORK"/src-tauri/target/release/bundle/appimage/*.AppImage \
         "$WORK"/src-tauri/target/release/bundle/appimage/*.AppImage.sig; do
  [ -f "$f" ] && cp -v "$f" "$OUT/" || true
done

echo "=== 5. ukuran binary linux ==="
ls -la "$WORK"/src-tauri/target/release/zephyr 2>/dev/null | awk '{printf "  zephyr: %.2f MB\n", $5/1048576}'
echo "=== hasil ==="
ls -la "$OUT"
echo selesai
