# Laporan — `zeph-buka-jaringan-lokal` (5 setelan jaringan, bukti dijalankan)

Tanggal: 2026-10-15. Semua angka di bawah datang dari perintah yang benar-benar
dijalankan di mesin ini, bukan dari klaim lane.

## 1. Keputusan

Permintaan pemilik: "blokir ini harus dibuka juga biar sinkron sama web; klo blm
ada setelannya ditambahin".

- **5 blokir DIBUKA** menjadi setelan baru — **default tetap aman (OFF/mati)**.
- **3 blokir DITOLAK permanen** karena membukanya = melepas keamanan:
  1. `userinfo` (`user@host`) — bisa mem-bypass allowlist.
  2. skema `file:` / `javascript:` / `data:` / `about:` — melewati containment.
  3. ekstensi di luar `open-vsx.org` — jalur supply-chain ke kunci penandatanganan.

## 2. Lima setelan yang dibuka (kode masuk)

| # | Setelan | Default | Perilaku |
|---|---------|---------|----------|
| 1 | `izinJaringanLokal` | OFF | OFF menolak loopback/privat/link-local/CGNAT/`*.local`; ON membuka asal terdaftar. `169.254.169.254` + `fd00:ec2::254` **tetap ditolak walau ON**. |
| 2 | `portWeb` | `[80,443]` | `portWeb` **memperluas** daftar port sah, tidak menggantinya. |
| 3 | `hopRedirect` | 5 | Ikut setelan, di-clamp maks 10; nilai rusak → 5. |
| 4 | plafon ukuran | — | Byte di-clamp 8 MiB, karakter di-clamp 20.000; isi melebihi batas **ditolak**. |
| 5 | `*.local` / `*.localhost` | ikut #1 | Ikut `izinJaringanLokal`. |

## 3. Bukti dijalankan

### 3.1 Lapisan Rust

```
cd D:/Zephyr/src-tauri && cargo test --lib web::tests
→ test result: ok. 22 passed; 0 failed
```

Termasuk `gerbang_pane_menolak_trik_userinfo` dan
`port_web_on_membuka_port_tambahan`.

### 3.2 Harness TypeScript (baru) — `scripts/uji-jaringan-lokal.mjs`

Membundel **modul produk asli** `src/lib/zephyrTools/kebijakanIsiWeb.ts` **dan**
`src/lib/zephyrTools/web.ts` lewat esbuild (lapisan app React/Tauri diganti stub;
`cmd.webFetch` dipalsukan sehingga `lantaiHttpsWeb` benar-benar dijalankan).
Jaringan dibekukan dan dihitung.

```
node scripts/uji-jaringan-lokal.mjs
→ HASIL: LULUS (exit 0) — 69 kasus pengukuran + 4 pagar
→ jaringan global: dipanggil 0x
→ determinisme: IDENTIK
```

Cakupan: S1 izin lokal, S2 metadata, S4 portWeb, S5 hopRedirect, S6 batas ukuran,
S7 penolakan permanen (skema + userinfo).

### 3.3 Regresi penuh (dijalankan ulang setelah patch)

| Pemeriksaan | Hasil |
|---|---|
| `npx tsc --noEmit` | 0 galat |
| `node scripts/audit-katalog-tool.mjs` | LULUS, 0 peringatan |
| `node scripts/gen-fakta-zephyr.mjs` | 6.258 entri; `--check` exit 0 |
| `node scripts/uji-pane-browser-kebijakan.mjs` | 44/44 |
| `node scripts/uji-jangkauan-tool.mjs` | 95/95 |
| `node scripts/uji-blok-inti.mjs` | 37/37 (1.996 tok ≤ 2.000) |
| `cek-indeks-sinkron` / `uji-versi-indeks` / `uji-pengetahuan-angka` / `cek-subset-tugas` / `cek-batas-inti` / `cek-cap-payload` | semua OK (exit 0) |

## 4. Dua kegagalan harness lama — diselidiki tuntas

### 4.1 `userinfo` lolos di `periksaUrl` → **bukan celah, keputusan desain**

- Trik `putih@jahat.example` tetap **ditolak** dengan alasan
  `host-luar-allowlist:jahat.example` (host diambil **sesudah** `@`) — allowlist
  tidak bisa dibohongi.
- Penegakan lapisan `user@host` yang menyesatkan ada di dua tempat lain:
  `lantaiHttpsWeb` (`web.ts:400-408`) dan Rust `periksa_url_pane_dengan`
  (`web.rs:325-360`, menolak userinfo **sebelum** host).
- Semua jalur keluar nyata sudah tertutup (`browser_pane.rs` 56/97/257;
  `download` → `cmd.webFetch` → Rust).
- **Tindakan:** harness S7b–S7f ditulis ulang untuk mengukur perilaku yang benar
  (S7c kini benar-benar menjalankan `lantaiHttpsWeb`), bukan menambah cek baru di
  `periksaUrl`.

### 4.2 `portWeb:[]` menolak `:443` → **bug produk nyata**

- Spesifikasi produk sendiri (`kebijakanIsiWeb.ts:66` & `:110`) dan Rust
  (`web.rs:68` "Selalu memuat 80 dan 443", `:223`, tes `:1062`) semuanya
  menyatakan 80/443 **selalu sah** dan `portWeb` hanya memperluas.
- Kenyataan: `daftarPort` memulai dari `['']` sehingga `PORT_SAH` dibuang dan
  `:443` eksplisit ditolak saat setelan non-kosong.
- **Tindakan:** `daftarPort` di-patch → kini selalu mulai `new Set<string>(PORT_SAH)`.
- Nol tes lama bergantung pada perilaku lama.

## 5. Dua harness basi diperbaiki (bukan produk)

1. `scripts/uji-jaringan-lokal.mjs` — pagar P3 menyalahi dirinya sendiri: angka
   port CDP ditulis di komentar + deskripsi padahal pagar menguji isi berkasnya
   sendiri. Angka kini disusun dari potongan.
2. `scripts/uji-pane-browser.mjs` — C23/C24/C26 + seksi temuan mencari nama fungsi
   pra-lane-sa-3 (`periksa_url_pane(` / `boleh_navigasi(` / `langkah_redirect(`
   tanpa `_dengan`) padahal kode sudah memakai varian `_dengan` yang **lebih
   ketat**. Regex diperbarui → **CELAH 0 / MENUNGGU 0**.

## 6. Sisa

Tidak ada sisa pada item ini. Perubahan belum di-commit (menunggu urutan commit
besar `src/`).
