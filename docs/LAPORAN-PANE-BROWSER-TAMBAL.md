# LAPORAN TAMBALAN PANE/BROWSER — patch nyata di lapisan Rust

Status: **SELESAI untuk yang bisa dibuktikan tanpa app.** Satu butir ditandai jujur **BUTUH APP**.
Rujukan temuan awal: `docs/USULAN-PANE-BROWSER.md` (U1–U7) + `docs/LAPORAN-PANE-BROWSER.md`.
Harness: `scripts/uji-pane-browser.mjs` — **561 baris (19 kasus) → 873 baris (31 kasus)**, hasil nyata **31/31 LULUS, exit 0, nol jaringan/nol CDP**.

## 1. Berkas yang dipatch (nyata, terkompilasi)

| Berkas | baris | `git diff --stat` |
|---|---|---|
| `src-tauri/src/web.rs` | 719 | `453 +++++++++++++++++++++-----` (506 insertions / 75 deletions untuk dua berkas) |
| `src-tauri/src/browser_pane.rs` | 492 | `128 ++++++++++--` |
| `scripts/uji-pane-browser.mjs` | 873 | berkas BARU/untracked, kasus C01–C19 dipertahankan utuh |

Tidak ada berkas lain yang disentuh. `git add`/`git commit` tidak dijalankan (aturan pemilik repo).

## 2. Patch → baris → bukti per kasus

### 2a. Allowlist skema/host di jalur BUKA pane — ditolak SEBELUM webview dibuat

| Patch | baris nyata | dibuktikan oleh |
|---|---|---|
| `browser_pane_open`: ganti cek awalan `starts_with("http")` → `let tujuan = crate::web::periksa_url_pane(u)?;` | `browser_pane.rs:90` (fungsi `browser_pane_open` mulai `:69`; `WebviewBuilder` berada **67 baris setelah awal fungsi**, gerbang **22 baris setelah awal fungsi** — offset relatif yang dibuktikan C22) | **C22** (`open@69 gerbang@22 WebviewBuilder@67` → gerbang < webview) + **C30** |
| Gerbang: tolak skema selain http/https (`file:`/`javascript:`/`data:`/`about:`) | `web.rs:179–184` | **C20** + unit test `gerbang_pane_menolak_skema_terlarang` (`web.rs:641`) + **C03–C06** (acuan) |
| Gerbang: tolak userinfo (`user@host`, trik `contoh.com.jahat.com`) — diperiksa SEBELUM host | `web.rs:186–193` | unit test `gerbang_pane_menolak_trik_userinfo` (`web.rs:673`) + **C18** (acuan) |
| Gerbang: tolak host berupa IP privat/link-local/loopback + `localhost`/`*.localhost`/`*.local` (IPv6 `[::1]` dilepas tanda kurungnya dulu) | `web.rs:195–215` | unit test `gerbang_pane_menolak_host_privat_link_local_dan_nama_lokal` (`web.rs:657`) + **C07–C09** (acuan) |
| Gerbang: tolak port di luar 80/443 lewat `PORT_SAH` | `web.rs:32`, `:217–222` | unit test `gerbang_pane_menolak_port_tak_lazim_dan_menerima_url_publik` (`web.rs:683`) + **C10** (acuan) |
| Lantai alamat SATU sumber `ip_terlarang` (dipakai fetch DAN pane) | `web.rs:51` | **C20** + unit test `lantai_ip_satu_sumber` (`web.rs:631`) |
| `periksa_url_pane` mengembalikan `tauri::Url` terparse → URL yang dipakai `navigate`/`WebviewUrl::External` sudah yang tervalidasi | `web.rs:168`, `:223` | **C20**, **C22** |

Angka gerbang yang bisa dibuktikan (klaim = angka nyata): konstanta `BATAS_BYTE_BAWAAN=2097152`, `BATAS_BYTE_MAKS=8388608`, `BATAS_HOP_REDIRECT=5`, `PORT_SAH=[80,443]`
(`web.rs:27,28,30,32`) — **C21** mencocokkan angka `web.rs` dengan angka harness: `byte-bawa=2097152 byte-maks=8388608 hop=5 port=80,443`.

### 2b. Navigasi pane (goto) dan navigasi hasil eval

| Patch | baris nyata | dibuktikan oleh |
|---|---|---|
| `browser_pane_nav` aksi `goto` → `crate::web::periksa_url_pane(lain)?` (back/forward/reload tidak membawa URL baru) | `browser_pane.rs:245` (fungsi `:226`) | **C23** (`nav@226 gerbang=true parse-lama=false`) + **C20** |
| `.on_navigation(boleh_navigasi)` dipasang di `WebviewBuilder` | `browser_pane.rs:140` | **C24** (`on_navigation@140 boleh_navigasi@55 ->periksa_url_pane.is_ok()=true`) |
| `fn boleh_navigasi(url: &tauri::Url) -> bool` dipisah (bukan closure) agar teruji unit | `browser_pane.rs:55–57` | **C24** + unit test di `browser_pane.rs` (`:463`, `:476` menegaskan tolak) |
| `browser_pane.rs:244` (`location.href` bisa ditulis dari eval) → **PAGAR di lapisan webview**, bukan menyaring isi skrip | catatan pagar `browser_pane.rs:258–263`; kode `:281` | **C27** (`eval@281 catatan-pagar-palsu=true doc-eval-sebut-on_navigation=true`) |

**Sikap jujur atas butir (3) permintaan:** menyaring ISI skrip di `browser_pane_eval` sengaja **tidak** dilakukan — evaluasi JS memang berguna untuk klik/isi form, dan filter teks di sana adalah pagar palsu (mudah dilewati). Yang ditambal: setiap navigasi apa pun asalnya (termasuk `location.href = ...` hasil eval) lewat `on_navigation` → `boleh_navigasi` → `periksa_url_pane`.
Yang **BUTUH APP**: pembuktian bahwa WebView2 benar-benar memanggil `on_navigation` dan menahan navigasinya — decision function-nya teruji unit, **penegakan runtime-nya tidak bisa saya buktikan sekarang** (app mati, :9223 ECONNREFUSED). Lihat `docs/USULAN-PANE-BROWSER-TAMBAL.md`.

### 2c. Batas byte bodi + hop redirect yang terukur

| Patch | baris nyata | dibuktikan oleh |
|---|---|---|
| Bodi dibaca TERBATAS `take(batas as u64 + 1)` — bukan `read_to_string()` sampai server selesai | `web.rs:321–331` | **C25** (`take@324 clamp@273 tolak-melebihi-batas@329 read_to_string-tanpa-batas@0`) + **C15** (acuan) |
| Kelebihan ditolak dengan angka eksplisit (`bodi melebihi batas {batas} byte (bawaan 2097152, maks 8388608)`) | `web.rs:327–331` | **C25** + **C21** |
| `max_redirects(0)` pada tiap hop (klien tidak mengikuti redirect) | `web.rs:280` | **C26** (`max_redirects(0)@280`) + **C14/C15** (acuan) |
| Redirect diikuti MANUAL, tiap hop dihitung (`hop += 1`) dan diperiksa ULANG lewat `langkah_redirect` | `web.rs:293–311`, `:233–247` | **C26** (`langkah_redirect@307 hop+=1@308 batas-di-fungsi=true`) + **C11/C16** + unit test `langkah_redirect_*` (`web.rs:691,705,713`) |
| Batas hop berangka `BATAS_HOP_REDIRECT = 5` | `web.rs:30`, `:234` | **C21**, **C26**, **C16** |
| `web_fetch` memakai pagar byte (bukan hanya pagar TS): `batas_byte_dipakai(batas*4)` → `ambil_batas` | `web.rs:431–436` (`:39` helper) | **C25** + **C20** |
| `ambil()` lama (tanpa batas) kini memakai batas bawaan | `web.rs:260–262` | **C20** |

Catatan akurasi: **signature `web_fetch(url, max_chars)` TIDAK diubah** — batas byte masuk lewat badan fungsi (`web.rs:435–436`), jadi pemanggil TS (`src/lib/zephyrTools/web.ts`) tidak perlu berubah dan nama command Tauri `web_fetch` tetap. Ini bukan usulan, ini kode yang sudah ada di berkas.

### 2d. Bukti tanpa app

- `node scripts/uji-pane-browser.mjs` → **31/31 LULUS, exit 0**; ringkasan nyata: `jaringan nyata : 0 (fetch 0, websocket 0, net 0, http 0, dns 0)`.
- `cd src-tauri && cargo test --lib` → lihat §3.
- 12 kasus baru (C20–C31) membaca `src-tauri/src/web.rs` dan `src-tauri/src/browser_pane.rs` **nyata** dan mencocokkan berkas + baris + angka; C30 mengunci agar C01–C19 tidak pernah dikurangi (`kasus terdaftar=31 (C01..C31) hilang=tidak ada`).

## 3. Hasil verifikasi apa adanya

```
$ node scripts/uji-pane-browser.mjs
...
LULUS 31/31
kasus pagar pane : 31/31 LULUS
jaringan nyata   : 0 (fetch 0, websocket 0, net 0, http 0, dns 0)
ANGKA BATAS      : byte-bawa=2097152  byte-maks=8388608  hop-redirect=5  halaman-redirect=5  port-sah=default,80,443
HASIL: aturan PAGAR PANE LULUS (exit 0), tanpa temuan yang menunggu.
HARNESS_EXIT=0
```

```
$ cd src-tauri && cargo test --lib
... 518 passed / 0 failed
```
Baseline repo ini **504 passed / 0 failed**; hasil saya **518 passed / 0 failed** = 504 + 14 unit test gerbang baru (`web::tests::gerbang_pane_*` 4, `web::tests::langkah_redirect_*` 3, `web::tests::angka_batas_konsisten`, `web::tests::batas_byte_bawaan_dan_clamp`, `web::tests::lantai_ip_satu_sumber`, `browser_pane::tests::gerbang_navigasi_*` 4 — 2 test `outbound_url_rejects_*` sudah ada sebelumnya). Daftar ini keluaran nyata `cargo test --lib`, bukan angka yang ditambal.

```
$ node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
src/lib/agentTools.ts(20,1): error TS6133: 'TOOL_BACA_KODE' is declared but its value is never read.
src/lib/zephyrTools/web.ts(26,3): error TS6133: 'periksaUrl' is declared but its value is never read.
src/lib/zephyrTools/web.ts(31,8): error TS6133: 'KeputusanUrl' is declared but its value is never read.
src/lib/zephyrTools/web.ts(435,22): error TS2304: Cannot find name 'lantaiHttpsWeb'.
TSC_EXIT=2
```
**Jujur:** tsc BELUM 0 galat — **4 galat, semuanya di `src/lib/**` (milik lane lain, saya read-only) dan tidak satu pun di berkas yang saya patch.** Saya tidak menyentuh `src/**`; galat itu tanggung jawab lane yang sedang menyunting berkas tersebut. Angka apa adanya di atas.

```
$ git status --porcelain -- <berkas saya>
 M src-tauri/src/browser_pane.rs
 M src-tauri/src/web.rs
$ git diff --stat -- src-tauri/src/web.rs src-tauri/src/browser_pane.rs
 src-tauri/src/browser_pane.rs | 128 ++++++++++--
 src-tauri/src/web.rs          | 453 +++++++++++++++++++++++++++++++++++++-----
 2 files changed, 506 insertions(+), 75 deletions(-)
```

## 4. Yang BUTUH APP (tidak diklaim selesai)

| Butir | kenapa BUTUH APP | yang sudah ada tanpa app |
|---|---|---|
| Penegakan `on_navigation` → `boleh_navigasi` benar-benar menahan `location.href = 'file:///...'` dari eval (`browser_pane.rs:244`) | hanya WebView2/Tauri saat app hidup yang bisa membuktikan callback dipanggil & navigasi ditolak | decision function `boleh_navigasi` (`:55`) + gerbangnya teruji unit; harness **C24/C27** membuktikan kodenya terpasang |
| Hostname publik yang DNS-nya menunjuk IP privat di jalur PANE (`http://contoh.com` → `10.0.0.5`) | `periksa_url_pane` sengaja TANPA DNS (`web.rs:161–167`) agar gerbang jalan sebelum webview dibuat & tiap event navigasi | jalur **fetch** sudah tertutup: `validate_outbound_url` meresolusi (`web.rs:126`) + `ip_terlarang` (`:51`); **C29** membuktikan pembagian ini (`gerbang-pane@168..233 resolve=false jalur-fetch-resolve@126`) |
| Allowlist per-domain DI DALAM Rust | butuh keputusan produk daftar domain + penyimpanan; saat ini allowlist hidup di TS (`src/lib/zephyrTools/kebijakanIsiWeb.ts`) | default-tolak TS teruji (**C01/C19** acuan) |

Sisa + langkah live konkret: `docs/USULAN-PANE-BROWSER-TAMBAL.md`.
