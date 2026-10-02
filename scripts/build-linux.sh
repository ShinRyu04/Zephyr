#!/usr/bin/env bash
# Bangun Zephyr untuk Linux dari dalam WSL.
#
# ## Kenapa berkas ini ada
#
# Empat kegagalan berurutan dikumpulkan di satu tempat, supaya build Linux tidak
# lagi menuntut pengetahuan yang hanya ada di kepala orang yang pernah
# menanganinya:
#
# 1. `node_modules` proyek dipasang untuk Windows, jadi CLI Tauri memuat binding
#    win32 dan gagal dengan "Cannot find module './cli.linux-x64-gnu.node'".
#
# 2. Binding Linux TIDAK boleh dipasang ke node_modules itu sendiri - menulis
#    ulangnya berarti merusak build Windows setiap kali build Linux selesai.
#    Jadi binding Linux dipasang di /tmp, dan CLI diarahkan ke sana lewat
#    `NAPI_RS_NATIVE_LIBRARY_PATH`, variabel resmi yang memang disediakan
#    (`index.js` membacanya sebelum menebak dari platform).
#
# 3. `bundle.targets` di tauri.conf.json hanya berisi msi dan nsis. Tanpa
#    `--bundles appimage,deb`, build Linux selesai dengan sukses TAPI tidak
#    menghasilkan berkas apa pun - `target/release/bundle/` tetap kosong - dan
#    manifest updater kemudian gagal karena aset Linux-nya tidak ada.
#    Sukses yang tidak menghasilkan apa-apa adalah kegagalan yang paling mahal,
#    karena baru ketahuan jauh di hilir.
#
# 4. `build-rilis.sh` membaca password dari `${APPDATA}`, yang di WSL tidak
#    menunjuk ke mana pun.
#
# ## Password
#
# Password TIDAK ditulis di berkas ini. Ia dibaca dari
# `%APPDATA%\zephyr\signing-key.txt` saat dijalankan, lalu diteruskan lewat
# variabel lingkungan ke proses anak saja. Menaruhnya di dalam berkas berarti ia
# ikut masuk ke git, ke riwayat shell, dan ke setiap salinan repositori.
#
# Cara memanggil:
#   wsl -d Ubuntu -- bash /mnt/d/Zephyr/scripts/build-linux.sh
set -uo pipefail

REPO=/mnt/d/Zephyr
BIND=/tmp/zcl/node_modules/@tauri-apps/cli-linux-x64-gnu/cli.linux-x64-gnu.node
KEYW=/mnt/c/Users/home/AppData/Roaming/zephyr/zephyr.key
KEYTXT=/mnt/c/Users/home/AppData/Roaming/zephyr/signing-key.txt

export PATH="$HOME/.cargo/bin:$PATH"
export NAPI_RS_NATIVE_LIBRARY_PATH="$BIND"

[ -f "$BIND" ] || {
  echo "GAGAL: binding Linux tidak ada di $BIND" >&2
  echo "  siapkan dengan:" >&2
  echo "    mkdir -p /tmp/zcl && cd /tmp/zcl && npm install --force @tauri-apps/cli-linux-x64-gnu@2.11.4" >&2
  exit 1
}
[ -f "$KEYW" ] || { echo "GAGAL: kunci signing tidak ada di $KEYW" >&2; exit 1; }

# Password dibaca dari berkas, tidak pernah diketik di sini.
TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEYW")"
export TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(grep '^Password' "$KEYTXT" | sed 's/^Password[[:space:]]*:[[:space:]]*//')"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD

if [ "${#TAURI_SIGNING_PRIVATE_KEY_PASSWORD}" -lt 8 ]; then
  echo "GAGAL: password tidak terbaca (${#TAURI_SIGNING_PRIVATE_KEY_PASSWORD} karakter)" >&2
  exit 1
fi

echo "binding : $BIND ($(stat -c%s "$BIND") byte)"
echo "kunci   : ${#TAURI_SIGNING_PRIVATE_KEY} byte, password ${#TAURI_SIGNING_PRIVATE_KEY_PASSWORD} karakter"
echo "cargo   : $(cargo --version)"

cd "$REPO"
echo "versi   : $(node -p "require('./package.json').version")"

echo
echo "== tauri build (linux: appimage + deb) =="
# --bundles WAJIB: konfigurasi hanya mendaftarkan msi dan nsis.
node node_modules/@tauri-apps/cli/tauri.js build --bundles appimage,deb 2>&1 | tail -30

echo
echo "== hasil =="
find src-tauri/target/release/bundle -maxdepth 2 -type f \
  \( -name '*.AppImage' -o -name '*.deb' -o -name '*.sig' \) 2>/dev/null | while read -r f; do
  echo "  $(stat -c%s "$f") byte  $f"
done
