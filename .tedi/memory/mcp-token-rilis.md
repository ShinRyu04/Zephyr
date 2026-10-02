# Bug token MCP: 401 permanen setelah "Perbarui token"

Ditemukan 2026-10-02, hanya karena uji rilis menembak server sungguhan.

## Rantainya

`rotate_token` menulis token baru ke `mcp.json` dan mengembalikannya ke UI - jadi
layar menampilkan token baru, dan berkasnya berisi token baru. Tapi token
disalin ke `Ctx` saat server **BIND**, dan salinan itu **tidak pernah dibaca
ulang**.

Akibatnya server tetap membandingkan dengan token LAMA. Setiap permintaan
dijawab **401 selamanya**, dan tidak ada cara memperbaikinya selain mematikan
lalu menyalakan server.

Yang paling merugikan: tombol itu memang dimaksudkan memperbaiki klien yang
tertolak, jadi kegagalannya muncul **tepat pada tindakan yang seharusnya
memperbaikinya**. Pengguna akan menyimpulkan kliennya yang salah, bukan
tokennya.

## Perbaikannya

- token disimpan di `McpRuntime` (`app_state.rs`), bukan hanya di `Ctx`
- `rotate_token` memanggil `state.mcp_set_token(&cfg.token)`
- pemeriksaan auth memakai `Ctx::terautentikasi()`, yang membaca token
  **BERLAKU** dari runtime
- kalau runtime tidak terbaca, ia jatuh ke salinan lama - lebih baik menerima
  token yang sedikit basi daripada membuka server tanpa autentikasi

Tidak memakai restart server: itu membuang port yang sudah terhubung dan
memutus setiap klien yang sedang bekerja.

## Jebakan saat menguji ini

Beberapa kegagalan yang tampak berbeda ternyata SATU penyebab: halaman MCP
belum terbuka, jadi tombol "New token" tidak ada untuk diklik - token tidak
berubah, dan T3 ikut gagal. Aku sempat mengejar tiga hal sekaligus padahal
hanya satu.

**Pelajarannya:** kalau beberapa uji gagal bersamaan dengan cara yang mirip,
cari penyebab bersama dulu sebelum menangani satu per satu.

## Hal lain yang ketahuan dari uji ini

- **Port MCP bukan selalu 9222.** Daftar cadangannya `[9222, 9224, 9225, 9226,
  9227]`, dan **9223 sengaja dilewati** (port debug WebView2). Di mesin ini 9222
  justru dipegang `msedgewebview2`, sehingga Zephyr jatuh ke 9224 - dan uji yang
  menembak 9222 mendapat 404 dari WebView2, bukan dari Zephyr.
- **Token disimpan di `mcp.json`, BUKAN `settings.json`.** `settings.json` hanya
  berisi `mcp: {enabled, port, allowTerminalControl}`.
- **Token ditampilkan BERTCOPENG** (`355a••••••••213f`) sebagai teks, bukan
  `input`. Uji yang mencari `input[type=password]` akan mengira tokennya kosong.
- **`/health` tidak menyebut "zephyr"**; balasannya
  `{"ok":true,"port":9224,"version":"1.1.13"}`. Periksa bentuknya, bukan namanya.
- Ikon Settings adalah **toggle**: mengklik saat halaman sudah terbuka justru
  menutupnya. Harness yang dijalankan berulang harus memulihkan keadaan awal.

## Harness untuk rilis

- `scripts/uji-terminal-rilis.mjs` - 6/6, terminal PTY hidup dengan prompt asli
- `scripts/uji-rilis-mcp.mjs` - 15/15, lewat UI (bridge dev tidak ada di rilis,
  jadi harness rilis pakai `cdp.eval`, BUKAN `cdp.json`)
- `scripts/uji-putar-token.mjs` - 7/7, mengunci bug token ini
- `scripts/periksa-rilis.mjs`, `cek-status-mcp.mjs`, `cek-token-mcp.mjs` - alat
  bantu untuk MELIHAT UI rilis. Dipakai karena nama kelas dan label tombolnya
  harus dilihat dulu; menebak dari kode sumber dev sudah berkali-kali keliru.
