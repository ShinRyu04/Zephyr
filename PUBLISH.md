# Cara publish rilis Zephyr

Ringkas, untuk dipakai tiap rilis. Aturan yang tidak boleh dilanggar ada di
bagian paling bawah.

## Dua repositori, dua peran

| Repo | Isi | Visibilitas |
|---|---|---|
| `Zephyr` | seluruh source code | **PRIVAT selamanya** |
| `zephyr-releases` | HANYA artefak rilis + `latest.json` | publik |

Alasan pemisahan: updater butuh URL yang bisa diakses tanpa autentikasi, tapi
source code tidak boleh ikut terbuka. Aset di GitHub Release repo publik
memenuhi keduanya.

## 1. Build rilis

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="D:/Zephyr/src-tauri/zephyr.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri build
```

Hasil di `src-tauri/target/release/bundle/`:

```
msi/Zephyr_1.0.0_x64_en-US.msi          <- installer MSI
msi/Zephyr_1.0.0_x64_en-US.msi.zip      <- artefak updater
msi/Zephyr_1.0.0_x64_en-US.msi.zip.sig  <- tanda tangan minisign
nsis/Zephyr_1.0.0_x64-setup.exe         <- installer NSIS
nsis/Zephyr_1.0.0_x64-setup.nsis.zip[.sig]
```

## 2. Buat GitHub Release di repo publik

```bash
gh release create v1.0.0 \
  --repo ShinRyu04/zephyr-releases \
  --title "Zephyr v1.0.0" \
  --notes-file RELEASE_NOTES.md \
  "src-tauri/target/release/bundle/msi/Zephyr_1.0.0_x64_en-US.msi" \
  "src-tauri/target/release/bundle/msi/Zephyr_1.0.0_x64_en-US.msi.zip" \
  "src-tauri/target/release/bundle/msi/Zephyr_1.0.0_x64_en-US.msi.zip.sig" \
  "src-tauri/target/release/bundle/nsis/Zephyr_1.0.0_x64-setup.exe"
```

## 3. Tulis `latest.json`

Isi `signature` dengan **seluruh isi file `.sig`** (satu baris base64):

```json
{
  "version": "1.0.0",
  "notes": "Rilis pertama Zephyr.",
  "pub_date": "2026-09-03T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<isi file .msi.zip.sig>",
      "url": "https://github.com/ShinRyu04/zephyr-releases/releases/download/v1.0.0/Zephyr_1.0.0_x64_en-US.msi.zip"
    }
  }
}
```

Upload sebagai aset rilis juga, lalu pakai URL raw-nya.

## 4. Aktifkan endpoint updater

Di `src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "<sudah terisi>",
    "endpoints": [
      "https://github.com/ShinRyu04/zephyr-releases/releases/latest/download/latest.json"
    ]
  }
}
```

Build ulang setelah itu. Versi yang sudah terinstall di mesin user **tidak**
akan menemukan endpoint ini — hanya build baru yang membawanya. Karena itu
endpoint sebaiknya diisi sebelum rilis pertama yang disebarkan luas; kalau
tidak, user 1.0.0 harus install manual sekali lagi.

## 5. Verifikasi updater (U4)

```bash
# Turunkan versi lokal ke 0.9.0 di tiga file, build, install,
# lalu klik "Cek update" — harus menemukan 1.0.0, mengunduh, memasang.
```

## Aturan keras

1. **`src-tauri/zephyr.key` JANGAN pernah di-commit atau di-upload.** Sudah
   masuk `.gitignore`. Kalau hilang, semua user lama tidak bisa update lagi dan
   harus install manual. Simpan salinannya di password manager.
2. **Repo source tetap privat.** Yang publik hanya `zephyr-releases`.
3. **Cek `git status` sebelum push** — pastikan tidak ada `.key`, `.env`,
   `secrets.json`, atau token yang ikut.
4. Installer tidak ditandatangani code-signing (sertifikat belum dibeli), jadi
   SmartScreen akan memperingatkan. Ini beda dari tanda tangan updater di atas
   dan sudah dijelaskan di `RELEASE_NOTES.md`.
