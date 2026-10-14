# UNDUH-INSTAL TERUJI — bukti jalur "unduh → periksa → pasang"

Item: **ZEPH-UNDUH-INSTAL-TERUJI**. Pertanyaan yang harus dijawab: apakah jalur
unduh/pasang paket ekstensi benar-benar diuji, atau cuma "panggil Install lalu
bilang berhasil"?

Jawaban singkat: **ya, sekarang diuji, dan ini angkanya.** Tidak ada lagi
"berhasil" tanpa angka.

## Kenapa ini dulu tidak ada

Sebelum perubahan ini, satu-satunya yang dilaporkan adalah kata "terpasang".
Tidak ada uji yang menyentuh allowlist, tidak ada uji https, **tidak ada
pemeriksaan hash sama sekali**, dan tidak ada satu pun uji yang memeriksa bahwa
paket yang terpasang benar-benar mengubah sesuatu. Akibatnya paket yang isinya
tidak dibaca siapa pun — tema tanpa warna UI, kumpulan perintah tanpa skrip,
`contributes.menus` — terpasang, muncul sebagai "Installed", dan tidak
mengubah satu piksel.

## Kebijakan yang dipatuhi (tidak dilonggarkan)

`docs/KEPUTUSAN-MARKETPLACE-j5.md` (opsi C):

- Unduhan **hanya** dari `open-vsx.org` dan `www.open-vsx.org`, **https saja**.
  Allowlist ada di dua tempat dan harus sama: `IZIN_UNDUH` di
  `src-tauri/src/ext_pkg.rs` dan `IZIN_HOST` di `src/lib/unduhInstal.ts`.
- Paket **BERKODE ditolak** di jalur internet: `main`/`extension.js` yang
  benar-benar ada di arsip, `contributes.commands`, atau `activationEvents`.
- Yang boleh lewat: **paket deklaratif** — themes, iconThemes, snippets,
  keymaps, grammars/bahasa.

## Enam kasus yang diuji (plus dua ekstra)

Dijalankan oleh `node scripts/uji-unduh-instal.mjs` (server berkas **lokal**
`http://127.0.0.1:<port acak>` yang menyajikan berkas dari TMPDIR; tidak ada
permintaan ke internet).

| # | Kasus | Yang diharapkan | Hasil nyata |
|---|-------|-----------------|-------------|
| 1 | host di luar allowlist (`https://evil.example.com/…`) | ditolak di **gerbang URL**, **0 panggilan jaringan** | ditolak, `tahap=url`, `alasan=HOST_TIDAK_DIIZINKAN`, 0 panggilan |
| 2 | bukan https (`http://open-vsx.org/…`) | ditolak di **gerbang URL**, 0 panggilan jaringan | ditolak, `tahap=url`, `alasan=BUKAN_HTTPS`, 0 panggilan |
| 3 | paket berkode (`main: ./extension.js`, `activationEvents`, `contributes.commands`) | **diunduh, hash cocok**, lalu ditolak di tahap kode | ditolak, `tahap=kode`, `alasan=PAKET_BERKODE`, sebab disebut satu per satu |
| 4 | hash tidak cocok | ditolak di tahap hash, **berkas sementara tidak ditulis** | ditolak, `tahap=hash`, `alasan=HASH_TIDAK_COCOK`, berkas tidak ada |
| 5 | paket deklaratif sah | diterima; isi berkas sementara = byte yang diunduh, hash dihitung ulang cocok | diterima, 1264 byte, sha256 dihitung ulang dari isi berkas = sama |
| 6 | laporan bukti perubahan | **angka per jenis**, bukan kata "berhasil" | `tema=3 warna UI + 4 token warna｜ikon=5｜snippet=1｜keymap=3 pintasan｜bahasa=go` |
| 6b | tema tanpa warna UI (tokenColors saja) | ditolak `TIDAK_ADA_KONTRIBUSI` — tidak dipasang lalu diam | ditolak, awalan pesan `NOTHING TO INSTALL:` |
| 7 | konstanta sinkron | allowlist TS == allowlist Rust, `VERSI_ZEPHYR` == `package.json`, Rust punya `hash_sha256`/`hash_cocok` | sama semua; `1.1.13` |

## Bentuk bukti perubahan (angka, per jenis)

`laporanBuktiPerubahan()` di `src/lib/unduhInstal.ts` (mirror `pengaruh_paket`
di Rust) membaca **berkas yang benar-benar ikut paket**, bukan nama kontribusi:

- **tema** = jumlah warna UI (`colors`) + jumlah token warna (`tokenColors`).
  Tema dengan **0 warna UI diabaikan, bukan dihitung** — tema seperti itu tidak
  mengubah piksel apa pun.
- **ikon** = jumlah entri `iconDefinitions` di berkas icon theme.
- **snippet** = jumlah paket snippet yang berkasnya ada di arsip.
- **keymap** = jumlah pintasan di `keybindings`.
- **bahasa** = mode bahasa yang jadi aktif (`cmLang`, jatuh ke `id`) saat
  berkasnya dibuka.
- Setiap kontribusi yang tidak bisa dipakai masuk `diabaikan` dengan alasannya,
  dan paket yang **semua** kontribusinya diabaikan ditolak
  (`TIDAK_ADA_KONTRIBUSI`) — jadi tidak ada lagi "terpasang tapi tidak
  mengubah apa pun".

## Batas yang jujur: yang BUTUH APP

Perintah Tauri `extensions_download_zext` dan `extensions_install`
(`src-tauri/src/ext_pkg.rs`) butuh `AppState` dan soket hidup, jadi **tidak
bisa** dijalankan dari `cargo test --lib`: **BUTUH APP**. Yang diuji adalah
logika yang mereka panggil, diekstrak jadi fungsi murni:

- `izin_unduh(url)` — gerbang URL (https + allowlist), sekarang dipanggil oleh
  perintah unduh, bukan disalin di dalamnya;
- `hash_sha256(bytes)` + `hash_cocok` + `normalisasi_hash` — hash yang
  diterbitkan registry dibandingkan **sebelum byte ditulis ke disk**;
- `unzip_zext` → `read_manifest` → `pengaruh_paket` — rantai
  arsip → ekstrak → laporan angka, diuji dari `.zext` sungguhan yang dibuat uji
  itu sendiri.

`sha2 = "0.10"` ditambahkan sebagai dependensi langsung (`Cargo.toml`); crate-nya
sudah ada di `Cargo.lock` lewat `ureq`, jadi tidak ada churn lockfile.

## Cara menjalankan

```
node scripts/uji-unduh-instal.mjs          # 8/8, exit 0/1, cetak angka
node scripts/uji-unduh-instal.mjs --rinci  # + baris ringkasan per kontribusi
cd src-tauri && cargo test --lib           # 454 lulus, 0 gagal
npx tsc --noEmit                           # 0 error
```

## Catatan ejaan id paket

`read_manifest` membentuk id **berkualifikasi `publisher.name`**
(`acme.paket-uji`) kalau manifest tidak memuat `id` eksplisit — itu kunci yang
sama dengan daftar marketplace. Kalau manifest memuat `id` eksplisit, id itu
yang menang. Dua-duanya diuji (`zext_lalu_laporan_bukti_berangka_per_jenis`,
`id_eksplisit_di_manifest_menang`), supaya tidak ada yang diam-diam berubah jadi
nama folder atau nama polos.
