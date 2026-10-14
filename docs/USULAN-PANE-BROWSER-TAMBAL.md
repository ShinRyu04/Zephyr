# USULAN LANJUTAN — PANE/BROWSER (SISA + LANGKAH LIVE KONKRET)

Lanjutan dari tambalan yang SUDAH mendarat (lihat `docs/LAPORAN-PANE-BROWSER-TAMBAL.md`).
Semua butir di bawah **BELUM ditambal** — ditulis sebagai sisa, bukan klaim.

## Sisa yang tidak bisa ditutup tanpa app / butuh keputusan produk

### S1. Penegakan runtime `on_navigation` — **BUTUH APP**
Tersangka: `browser_pane.rs:244` (`location.href` bisa ditulis lewat `browser_pane_eval`).
Yang sudah ada: `.on_navigation(boleh_navigasi)` (`browser_pane.rs:140`), `boleh_navigasi` (`:55`) → `periksa_url_pane` (teruji unit). Belum dibuktikan: WebView2 benar-benar memanggil callback itu dan menahan navigasi.

Langkah live konkret (saat app hidup; **jangan** dijalankan sebelum app jalan — gerbang :9223 kini ECONNREFUSED):
1. Buka pane: `browser_open { url: "https://example.com" }` (atau tool pane apa pun yang memuat satu halaman sah).
2. Lewat `browser_eval`, jalankan berturut-turut dan catat hasil tiap langkah:
   - `location.href = "file:///C:/Windows/win.ini"` → harapan: **tidak** berpindah; `location.href` tetap `https://example.com/...`.
   - `location.href = "javascript:alert(1)"` → harapan: ditolak, halaman tetap.
   - `location.href = "http://127.0.0.1:8080/"` → harapan: ditolak.
   - `location.href = "https://169.254.169.254/latest/meta-data/"` → harapan: ditolak.
   - kontrol positif: `location.href = "https://example.org"` → harapan: **berpindah** (kalau ini ikut ditolak, gerbangnya terlalu ketat / callback tidak jalan sama sekali).
3. Bukti tambahan kalau ragu: catat `location.href` sebelum/sesudah tiap percobaan; kalau `file:///...` sampai termuat, itu regresi nyata → eskalasi ke lane yang memiliki `browser_pane.rs`.
4. Tanpa CDP pun bisa: cari di log app (`src-tauri/src/logging.rs` → berkas log) jejak penolakan terakhir; kalau kosong padahal navigasi tampak terjadi, callback tidak terpasang.

### S2. Hostname publik → IP privat di jalur PANE (DNS-rebinding/pin) — **sisa sadar**
`http://contoh.com` yang DNS-nya menunjuk `10.0.0.5` **belum** ditolak di gerbang pane, karena `periksa_url_pane` sengaja tanpa DNS (`web.rs:161–167`). Jalur fetch sudah menutup ini (`validate_outbound_url` + `to_socket_addrs` `web.rs:126`, + `ip_terlarang` `:51`).

Usulan (belum dikerjakan, pilih satu):
- **(a) Pin alamat per-navigasi:** sebelum `navigate()`, resolusi host SEKALI, tolak kalau hasilnya `ip_terlarang`, lalu pakai alamat hasil resolusi itu untuk koneksi (butuh jalur koneksi terkendali, bukan `navigate()` polos) — ini yang benar untuk anti-rebinding, tapi bukan pekerjaan kecil.
- **(b) Cek resolusi di jalur `open` saja** (bukan tiap event navigasi): tolak di situ; lebih murah, tapi masih ada celah DNS berubah setelahnya.
- **(c) Besarkan pagar lapisan bawah:** blokir di tingkat firewall/peringkat WebView2 untuk rentang privat — di luar repo.

Langkah live konkret untuk membuktikan celahnya (tanpa app pun bisa, tapi butuh app untuk bukti pane): kalau app hidup, `browser_open { url: "http://<host-yang-menunjuk-10.x>" }` → kalau pane bermuatan, celah S2 nyata.

### S3. Allowlist per-domain DI DALAM Rust — **butuh keputusan produk**
Hari ini allowlist/default-tolak hidup di `src/lib/zephyrTools/kebijakanIsiWeb.ts` (TS). Belum ada daftar domain di Rust, jadi `web_fetch` Rust masih menerima URL apa pun yang lolos lantai alamat.
Usulan: satu fungsi `fn host_diizinkan(host: &str, daftar: &[String]) -> bool` di `web.rs` (default-tolak, cocok utuh atau `*.domain`), dipanggil di `validate_outbound_url`/`periksa_url_pane` dengan daftar dari Settings §security. Perlu keputusan: daftar bawaan kosong = tolak semua (aman, tapi mematikan fetch) atau bawaan = domain umum (nyaman, tapi butuh tinjauan).

### S4. Batas byte di jalur UNDUHAN pane (`browser_download_url`) — **sisa**
Batas byte sudah ada di jalur baca halaman (`web.rs:324`) dan di TS (`kebijakanIsiWeb.ts`), tetapi jalur unduhan berkas belum punya pagar byte di Rust. Usulan: pakai `batas_byte_dipakai` + `ambil_batas` yang sudah ada untuk unduhan, atau tandai jalur unduhan sebagai "wajib izin eksplisit + batas byte".

## Yang TIDAK diusulkan (sudah dinilai dan ditolak) — supaya tidak diulang

- **Menyaring ISI skrip di `browser_pane_eval`**: pagar palsu (mudah dilewati, sementara eval memang dipakai untuk klik/isi form). Pagar yang benar ada di `on_navigation` (`browser_pane.rs:140`).
- **Resolusi DNS di dalam `periksa_url_pane`**: membuat gerbang menggantung/gagal karena jaringan, tepat di jalur sebelum webview dibuat dan pada tiap event navigasi. Dipisah: pane tanpa DNS, fetch dengan DNS.

## Urutan lanjut yang disarankan

1. **S1** (bukti live, paling murah, menutup butir `browser_pane.rs:244` yang diminta). Butuh app hidup.
2. **S3** (keputusan produk + ~1 fungsi + unit test) — bisa dikerjakan tanpa app sepenuhnya.
3. **S4** (pakai pagar byte yang sudah ada).
4. **S2** (paling berat; jangan diklaim tertutup sebelum ada jalur koneksi terkendali).
