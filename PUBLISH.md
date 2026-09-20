# Cara publish rilis Zephyr

Ringkas, untuk dipakai tiap rilis. Aturan yang tidak boleh dilanggar ada di
bagian paling bawah.

## Repo & visibilitas

| Repo | Isi | Visibilitas |
|---|---|---|
| `ShinRyu04/Zephyr` | seluruh source code + GitHub Release artefak | publik |

Release dibuat langsung di repo utama. Endpoint updater di
`tauri.conf.json` menunjuk ke
`https://github.com/ShinRyu04/Zephyr/releases/latest/download/latest.json`,
jadi `latest.json` dan artefak harus ada di release repo ini.

## 1. Naikkan versi (3 file)

```
package.json            "version": "1.1.1"
src-tauri/Cargo.toml    version = "1.1.1"
src-tauri/tauri.conf.json  "version": "1.1.1"
```

## 2. Build rilis (wajib dengan kunci signing)

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="C:/Users/home/AppData/Roaming/zephyr/zephyr.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat "$APPDATA/zephyr/signing-key.txt")"
npm run tauri:build
```

Hasil di `src-tauri/target/release/bundle/` (Tauri v2: updater Windows memakai
installer NSIS/MSI langsung + `.sig`, BUKAN zip):

```
msi/Zephyr_1.1.1_x64_en-US.msi         <- installer MSI
msi/Zephyr_1.1.1_x64_en-US.msi.sig     <- tanda tangan minisign
nsis/Zephyr_1.1.1_x64-setup.exe        <- installer NSIS (artefak updater)
nsis/Zephyr_1.1.1_x64-setup.exe.sig    <- tanda tangannya
```

## 3. Buat GitHub Release

```bash
gh release create v1.1.1 \
  --repo ShinRyu04/Zephyr \
  --title "Zephyr v1.1.1" \
  --notes-file RELEASE_NOTES.md \
  "src-tauri/target/release/bundle/msi/Zephyr_1.1.1_x64_en-US.msi" \
  "src-tauri/target/release/bundle/msi/Zephyr_1.1.1_x64_en-US.msi.sig" \
  "src-tauri/target/release/bundle/nsis/Zephyr_1.1.1_x64-setup.exe" \
  "src-tauri/target/release/bundle/nsis/Zephyr_1.1.1_x64-setup.exe.sig"
```

## 4. Tulis `latest.json` + upload sebagai aset

`signature` = **seluruh isi file `.exe.sig`** (satu baris base64). `url`
menunjuk ke setup.exe, bukan zip:

```json
{
  "version": "1.1.1",
  "notes": "Ringkasan rilis.",
  "pub_date": "2026-09-07T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<isi file Zephyr_1.1.1_x64-setup.exe.sig>",
      "url": "https://github.com/ShinRyu04/Zephyr/releases/download/v1.1.1/Zephyr_1.1.1_x64-setup.exe"
    }
  }
}
```

Upload `latest.json` sebagai aset release juga. Karena v1.1.1 jadi
"latest", URL `.../releases/latest/download/latest.json` otomatis
menyajikannya.

## 5. Verifikasi updater

Turunkan versi lokal sementara (3 file) ke angka lama, build, install, klik
"Cek update" — harus menemukan versi baru, mengunduh, memasang. Atau minimal:
`curl -s https://github.com/ShinRyu04/Zephyr/releases/latest/download/latest.json`
harus menampilkan versi terbaru.

## Aturan keras

1. **Kunci signing `%APPDATA%\zephyr\zephyr.key` JANGAN pernah di-commit
   atau di-upload.** Sudah masuk `.gitignore` (`*.key`). Kalau hilang, semua
   user lama tidak bisa update lagi dan harus install manual. Simpan salinan
   di password manager.
2. **Cek `git status` sebelum push** — pastikan tidak ada `.key`, `.env`,
   `secrets.json`, atau token yang ikut.
3. Installer tidak ditandatangani code-signing (sertifikat belum dibeli),
   jadi SmartScreen akan memperingatkan. Ini beda dari tanda tangan updater
   di atas dan sudah dijelaskan di `RELEASE_NOTES.md`.
4. Jangan upload aset duplikat `latest.json` lama ke release baru — versi
   lama otomatis tertimpa karena yang diunduh selalu dari release "latest".
