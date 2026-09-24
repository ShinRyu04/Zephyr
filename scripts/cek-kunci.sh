#!/usr/bin/env bash
# cek-kunci.sh — pagar sebelum rilis: pastikan kunci signing TIDAK berubah.
#
# KENAPA: sekali kunci signing berganti, SEMUA instalasi lama kehilangan
# kemampuan update otomatis — updater Tauri menolak installer yang
# ditandatangani dengan kunci berbeda ("The signature was created with a
# different key than the one provided"). User terjebak di versi lama dan harus
# install manual. Itu sudah terjadi sekali (v1.1.9 -> v1.1.10) dan tidak boleh
# terulang.
#
# Skrip ini membandingkan kunci AKTIF dengan sidik jari yang tercatat di
# .kunci-terkunci. Kalau berbeda, rilis DIBATALKAN sebelum terlanjur upload.
#
# Pakai:  bash scripts/cek-kunci.sh          # periksa
#         bash scripts/cek-kunci.sh --catat  # catat kunci aktif sebagai acuan

set -u

APPDATA_ZEPHYR="${APPDATA:-$HOME/AppData/Roaming}/zephyr"
PUB="$APPDATA_ZEPHYR/zephyr.key.pub"
ACUAN="$(dirname "$0")/../.kunci-terkunci"

if [ ! -f "$PUB" ]; then
  echo "  GAGAL: kunci publik tidak ada di $PUB"
  exit 1
fi

# Sidik jari = baris komentar di dalam file pub (memuat ID kunci), setelah
# base64 di-decode. Itu yang benar-benar dibandingkan updater.
SIDIK=$(python -c "
import base64, io, sys
try:
    raw = io.open(r'$PUB', encoding='utf-8').read().strip()
    print(base64.b64decode(raw).decode().splitlines()[0].strip())
except Exception as e:
    print('GAGAL-BACA')
")

if [ "$SIDIK" = "GAGAL-BACA" ]; then
  echo "  GAGAL: kunci publik tidak bisa dibaca ($PUB)"
  exit 1
fi

if [ "${1:-}" = "--catat" ]; then
  echo "$SIDIK" > "$ACUAN"
  echo "  dicatat sebagai acuan: $SIDIK"
  exit 0
fi

if [ ! -f "$ACUAN" ]; then
  echo "  BELUM ADA ACUAN. Jalankan sekali: bash scripts/cek-kunci.sh --catat"
  exit 1
fi

ACUAN_ISI=$(cat "$ACUAN")

if [ "$SIDIK" != "$ACUAN_ISI" ]; then
  echo ""
  echo "  ================================================================"
  echo "  BERHENTI — KUNCI SIGNING BERUBAH"
  echo "  ================================================================"
  echo "    acuan (dipakai versi lama) : $ACUAN_ISI"
  echo "    aktif (akan dipakai build) : $SIDIK"
  echo ""
  echo "  Kalau build ini diupload, SEMUA instalasi lama tidak bisa update"
  echo "  otomatis dan user harus install manual."
  echo ""
  echo "  Kalau memang sengaja ganti kunci: catat yang baru dengan"
  echo "    bash scripts/cek-kunci.sh --catat"
  echo "  dan siapkan pengumuman install manual untuk user."
  echo "  ================================================================"
  exit 1
fi

echo "  kunci signing cocok dengan acuan: $SIDIK"
