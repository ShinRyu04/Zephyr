#!/usr/bin/env bash
# Bangun bundel Linux (deb + AppImage) dari dalam WSL.
#
# Kenapa node_modules TIDAK dipakai dari /mnt/d:
#
# `node_modules` itu dibagi dengan Windows, jadi binary native Tauri di dalamnya
# adalah @tauri-apps/cli-win32-x64. Node di WSL mencari cli.linux-x64-gnu.node
# dan gagal ("Cannot find native binding"). Mengganti isi node_modules bersama
# itu berbahaya: ia dipakai build Windows, dan menukarnya akan merusak build
# berikutnya di sisi Windows.
#
# Jadi: pakai salinan terpisah di home WSL (native ext4, bukan /mnt), yang hanya
# berisi tool CLI-nya. Kode sumber tetap dibaca dari /mnt/d/Zephyr.
set -euo pipefail

# `bash script.sh` bukan shell login, jadi PATH rustup tidak dimuat dan cargo
# tidak ditemukan ("failed to get cargo metadata: No such file or directory").
# Ditambahkan eksplisit supaya build tidak bergantung pada cara skrip dipanggil.
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
command -v cargo >/dev/null || { echo "GAGAL: cargo tidak ada di PATH"; exit 1; }
echo "== cargo: $(cargo --version) =="

KUNCI="/mnt/c/Users/home/AppData/Roaming/zephyr/zephyr.key"
if [ ! -f "$KUNCI" ]; then
  echo "GAGAL: kunci tidak ditemukan di $KUNCI"
  exit 1
fi
export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KUNCI")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='Z3phyr-S1gn1ng-2026-K3y!'

ALAT="$HOME/tauri-cli-linux"
mkdir -p "$ALAT"

# Versi CLI harus sama dengan yang dipakai proyek, kalau tidak bentuk konfigurasi
# yang dipahaminya bisa berbeda dari yang ditulis build Windows.
VERSI="$(node -p "require('/mnt/d/Zephyr/package.json').devDependencies['@tauri-apps/cli']" | tr -d '^~')"
echo "== versi CLI Tauri: $VERSI =="

if [ ! -x "$ALAT/node_modules/.bin/tauri" ]; then
  echo "== memasang CLI Tauri khusus Linux (sekali saja) =="
  cd "$ALAT"
  npm init -y >/dev/null 2>&1
  npm i "@tauri-apps/cli@$VERSI" --no-audit --no-fund
fi

cd /mnt/d/Zephyr
echo "== mulai build Linux =="
"$ALAT/node_modules/.bin/tauri" build --bundles deb,appimage
echo "== selesai =="
