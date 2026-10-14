# USULAN PATCH — PAGAR PANE BROWSER (item ZEPH-BROWSER-BUILTIN)

Dokumen ini **hanya usulan**; tidak ada berkas produk yang disentuh. Format tiap usulan:
**berkas + rentang baris + teks lama (persis dari berkas) + teks baru + butuh app?**

## 0. Rujukan — yang SUDAH dicakup, jadi TIDAK diduplikasi

`docs/USULAN-BROWSER-DAN-FETCH.md` (dibaca penuh lebih dulu) sudah memuat 7 patch. Yang sudah
tercakup di sana **cukup dirujuk** dari sini, bukan ditulis ulang:

| Di dokumen itu | Cakupan | Status di sini |
|---|---|---|
| **U1** | spec + gerbang allowlist `web_fetch` (`web.ts:351-363`) | **rujuk** |
| **U2** | berkas baru redaksi token `src/lib/zephyrTools/redaksiWeb.ts` | **rujuk** |
| **U3** | batas byte bodi `web.rs:140-143` | **rujuk** |
| **U4** | gerbang allowlist `browser_pane_open` (`browser_pane.rs:52-57`) | **rujuk** |
| **U5** | gerbang allowlist `browser_pane_nav` (`browser_pane.rs:212-218`) | **rujuk** |
| **U6** | allowlist domain di Settings §security (`settingsStore.ts`) | **rujuk** |
| **U7** | (cadangan) `simpan_ke` lewat `periksaTulis` *kalau kelak ditambah* | **rujuk + dilengkapi U8** |

**Yang BELUM dicakup** dan menjadi inti dokumen ini: **U8** (gerbang berkas `browser_download_url`
yang **sudah ada** sekarang) dan **U9** (escape navigasi lewat `browser_pane_eval`). Keduanya
khusus pane dan tidak ada di 7 patch di atas.

Semua baris "teks lama" disalin dari branch `feat/ai-panel-vscode-layout` pada 2026-10-14 dan
dicek ulang terhadap berkas.

### ANGKA BATAS (rujukan tunggal; cocok dengan `scripts/uji-pane-browser.mjs`)
- `BATAS_BYTE_BAWAAN = 2.097.152` byte (2 MiB) — bodi fetch bawaan
- `BATAS_BYTE_MAKS = 8.388.608` byte (8 MiB) — bodi fetch keras
- `BATAS_HOP_REDIRECT = 5` — jumlah maksimum hop redirect
- `PORT_SAH = {80, 443}` — sama dengan lantai port `web.rs:41`

---

## U8 — `browser_download_url`: gerbang berkas + allowlist + batas byte (CELAH BARU)

**Berkas:** `src/lib/zephyrTools/web.ts`
**Baris:** `720-730` (run). Spec `708-718` perlu penajaman deskripsi.

Ini paling penting: `browser_download_url` **sudah ada** dan menulis berkas lokal lewat
`cmd.fsWrite` dengan `destination_path` yang dipilih model — **tanpa** `periksaTulis` dan **tanpa**
allowlist apakah. (Berbeda dari `simpan_ke` di U7 yang masih cadangan.)

### U8a — gerbang sebelum menulis

Lama (`web.ts:720-730`):
```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      const dest = wajib(a, 'destination_path');
      const konten = await cmd.webFetch(url, 200000);
      /* A file this turn creates, written through `cmd.fsWrite` rather than the
         builtins' `tulis()` helper — so the checkpoint has to be told here too,
         or the download is invisible to "put back what this turn changed". */
      await (await import('../checkpoint')).catat(dest);
      await cmd.fsWrite(dest, konten, undefined, undefined, { allowMissing: true });
      return `File from ${url} downloaded successfully to ${dest} (${konten.length} bytes).`;
    },
```

Baru:
```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      const dest = wajib(a, 'destination_path');
      // 1) Gerbang allowlist domain SEBELUM jaringan (butuh U1c/U6).
      const gerbang = periksaDomainWeb(url, []);
      if (!gerbang.ok) return potong(`(ditolak oleh allowlist: ${gerbang.alasan})`);
      // 2) Gerbang berkas: jalur tujuan lewat periksaTulis yang SUDAH ADA
      //    (agentGuard.ts:214), bukan daftar baru. Menutup .env/*.pem/.git, dll.
      const cek = periksaTulis(dest);
      if (!cek.ok) return potong(`(ditolak: ${cek.alasan})`);
      // 3) Batas byte keras (default 2 MiB, clamp 8 MiB) — ANGKA lihat §0.
      const batas = 2 * 1024 * 1024;
      const konten = await cmd.webFetch(url, Math.min(batas, 8 * 1024 * 1024));
      await (await import('../checkpoint')).catat(dest);
      await cmd.fsWrite(dest, konten, undefined, undefined, { allowMissing: true });
      return `File from ${url} downloaded successfully to ${dest} (${konten.length} bytes).`;
    },
```

Tambahan import di kepala `web.ts`:
```ts
import { periksaTulis } from '../agentGuard'; // jalur lama yang sudah ada (agentGuard.ts:214)
```

> **BUTUH APP** untuk memastikan tulisan runtime benar-benar menolak
> `dest="../.env"` dll. Bentuk spesifikasinya sudah bisa diuji node (pola sama U1).

---

## U9 — Tutup escape navigasi `browser_pane_eval` (BUTUH APP)

**Berkas:** `src-tauri/src/browser_pane.rs`
**Sasaran:** closure `.on_navigation(...)` pada WebviewBuilder di `browser_pane_open` (sekitar
`:68-120`, tempat builder dirakit) — **bukan** regex atas isi skrip.

Alasan: `browser_click` (`web.ts:547-555`), `browser_type` (`:583-590`), dan `browser_nav` mengirim
JS ke `browser_pane_eval` (`browser_pane.rs:244`). JS itu bisa `location.href = "http://jahat.com"`,
yang **tidak** melewati gerbang `open`/`nav` (U4/U5). Satu-satunya tempat menegakkannya adalah di
lapisan webview: setiap navigasi diperiksa, lalu ditolak bila di luar allowlist.

Bentuk usulan (sisipkan saat merakit `WebviewBuilder`):
```rust
    // Setiap navigasi (termasuk dari eval / klik di halaman) diperiksa ulang.
    // Ini menutup C5: eval bisa mengubah location.href tanpa lewat open/nav.
    .on_navigation(|nav_url| {
        let s = nav_url.as_str();
        // Lantai jaringan + allowlist yang sama seperti U4/U5.
        crate::web::validate_outbound_url(s).is_ok() && domain_diizinkan(s)
    })
```

`domain_diizinkan` = fungsi baru yang sama dipakai U4/U5 (membaca allowlist dari settings §security,
lihat U6). Perilaku `on_navigation -> false` menolak navigasi; halaman tetap menampilkan URL terakhir
yang sah, bukan pindah ke host di luar allowlist.

> **BUTUH APP** — closure ini hanya berjalan di dalam Tauri/WebView2. Harness node-only tidak bisa
> membuktikannya; yang bisa dibuktikan tanpa app hanya **aturan acuan** (C14: penghitung webview/socket
> = 0 saat URL ditolak) dan **kehadiran** titik sambung.

---

## U10 (rujuk, tidak diduplikasi) — gerbang `open`/`nav`

Gerbang `browser_pane_open` (`browser_pane.rs:52-57`) dan `browser_pane_nav` (`:212-218`) **sudah
diusulkan sebagai U4/U5** di `docs/USULAN-BROWSER-DAN-FETCH.md`. Di sini cukup dirujuk. Catatan
penting yang sudah tercakup di sana: `back`/`forward`/`reload` tidak membawa URL baru, jadi tidak
diubah; `goto` re-check ada di U5.

---

## Bukti (keluaran nyata)

```
$ node scripts/uji-pane-browser.mjs ; echo "EXIT=$?"
...
LULUS 19/19
...
== Ringkasan ==
kasus pagar pane : 19/19 LULUS
jaringan nyata   : 0 (fetch 0, websocket 0, net 0, http 0, dns 0)
celah kode produk: 6
ANGKA BATAS      : byte-bawa=2097152  byte-maks=8388608  hop-redirect=5  halaman-redirect=5  port-sah=default,80,443
EXIT=0

$ node scripts/uji-fetch-web-rencana.mjs
LULUS 27/27   (berkas tidak diubah)

$ npx tsc --noEmit ; echo "EXIT=$?"
EXIT=0        (0 galat)
```

Output penuh (bagian A + B) ada di `docs/LAPORAN-PANE-BROWSER.md` §2.

---

## Utang / sisa (apa adanya)

1. **U3, U4, U5, U8(Rust sisi tulis), U9 BUTUH APP.** Tidak bisa dijalankan harness node.
2. **U9** adalah bentuk usulan closure; nama signature `on_navigation` perlu dicocokkan dengan
   versi Tauri di repo saat diterapkan (belum dikompilasi di sini — kode produk READ-ONLY).
3. **U6/U8** persistensi allowlist & bentuk UI belum diputuskan — tidak dikarang.
4. Harness membuktikan **aturan acuan**, bukan penegakan di kode produk.

---

## Sisa lane ZEPH-BROWSER-BUILTIN (setelah tahap TAMBALAN, 2026-10-14)

Kode produk BOLEH disunting khusus untuk item ini (izin pemilik), jadi beda dengan usulan U1–U9 di
atas yang semula ditulis untuk kode READ-ONLY. Hasil nyata ada di
`docs/LAPORAN-PANE-BROWSER-TAMBALAN.md`. Yang **sudah** tertambal di lapisan TS: izin opt-in,
allowlist, batas ukuran keluaran, dan penutupan jalur isi→model (gerbang tunggal
`src/lib/zephyrTools/kebijakanIsiWeb.ts` + pemasangan di `src/lib/zephyrTools/web.ts`).

### Sisa yang masih MENUNGGU (lantai Rust / BUTUH APP)

| Usulan | Berkas:baris | Sisa yang menunggu |
|---|---|---|
| U1/U6 | `src-tauri/src/web.rs:241` | allowlist di dalam `web_fetch` (lantai Rust). Lapisan TS sudah menolak lebih dulu; lantai dalam tetap telanjang kalau perintah dipanggil dari jalur lain. |
| U3 | `src-tauri/src/web.rs:142` | `read_to_string()` tanpa batas byte → bodi besar mengisi RAM **sebelum** TS memotong. Perlu pembacaan terbatas di Rust. |
| U4 | `src-tauri/src/browser_pane.rs:43` | `browser_pane_open` tidak memanggil `validate_outbound_url` (lantai jaringan Rust). |
| U5 | `src-tauri/src/browser_pane.rs:197` | `browser_pane_nav` (`goto`) tanpa allowlist di dalam Rust. |
| U9 | `src-tauri/src/browser_pane.rs:244` | escape navigasi via `browser_pane_eval` (`location.href = …`). BUTUH APP: event navigasi webview harus hidup untuk dibuktikan; signature `on_navigation` masih perlu dicocokkan dengan versi Tauri di repo. |

### Baris registrasi untuk berkas bersama — DITULIS DI SINI, tidak ditambal

Item ini **tidak menyunting berkas bersama** (`src-tauri/src/main.rs`, `src/lib/mcpClient.ts`,
katalog tool). Kalau sisa di atas (atau penambahan gerbang baru) perlu didaftarkan, bentuk yang
diusulkan adalah **penambahan baris**, bukan perubahan struktur:

- `src-tauri/src/main.rs` — daftarkan perintah/impor baru bila patch Rust U1/U3/U4/U5 mengubah
  daftar `invoke_handler` (baris registrasi mengikuti daftar yang sudah ada; tidak diubah item ini).
- `src/lib/mcpClient.ts` — tidak ada tool baru yang ditambahkan item ini, jadi **tidak ada** baris
  registrasi baru yang diperlukan; gerbang memakai nama tool yang sudah terdaftar.
- Persistensi allowlist (config vs state) dan bentuk UI Settings §security **belum diputuskan** —
  tidak dikarang di sini.

Tanpa `git add`/`git commit`; berkas generator (`src/lib/zephyrIndeks.ts`, `src/lib/zephyrFakta.ts`)
tidak disentuh; harness CDP (`:9223`) tidak dijalankan.
