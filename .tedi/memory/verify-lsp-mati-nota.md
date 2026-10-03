# Verifikasi LSP: 11/11, dan tiga cara uji ini berbohong dulu

Ditulis 2026-10-03. Ditulis setelah harness ini **gagal tiga kali berturut-turut
pada aplikasi yang benar**, dan setiap kegagalan terlihat seperti bug fitur.

## Apa yang sebenarnya diperbaiki di aplikasi

Keluhan user: "settingan Language Server tidak bisa dipencet apa-apa."

Akar masalahnya bukan klik yang rusak, melainkan **kontrol yang membisu**: saat
saklar induk `lsp.enabled` mati, setiap toggle dan tombol per server tetap
terlihat bisa diklik tetapi tidak berefek apa pun, tanpa satu pun petunjuk kenapa.
Dari apa yang terlihat di layar, kesimpulan user ("rusak") benar.

Perbaikannya:

- baris diredupkan (`.lsp-grup.is-mati` -> opacity 0.5 pada `.lsp-baris`)
- setiap kontrol per server benar-benar `disabled`, sehingga keluar dari urutan
  Tab juga
- satu baris penjelas di atas daftar: "IntelliSense mati. Nyalakan di atas..."
- **auto-probe saat halaman dibuka** - sebelumnya probe hanya jalan kalau
  seseorang menekan tombol, jadi penanda "terpasang" tidak pernah muncul sendiri

## Tiga kegagalan palsu, dan pelajarannya

### 1. Mengukur elemen yang salah

Uji perendupan mengukur `.lsp-grup` (`opacity = 1`) padahal aturannya menargetkan
`.lsp-baris` (anaknya). Dilaporkan gagal; CSS-nya sehat.

**Uji yang salah mengukur lebih buruk daripada tidak ada uji: ia menolak
perbaikan yang benar.**

### 2. Wadah gulir DITEBAK, bukan ditemukan

Saklar induk ada di kepala halaman, dan halaman ini panjang (21 baris). Uji lain
menggulir ke bawah, lalu `setSaklar` menulis `scrollTop = 0` ke `.set-content`
dan `.settings-body` - **dan tidak terjadi apa pun**, karena wadah yang
sebenarnya bernama **`.set-body`**.

Menulis ke elemen yang salah tidak melempar error. Gejalanya: `kotak: [1084,
-1234, 32, 20]` - saklar masih jauh di atas layar - dan ujinya melaporkan
"tidak bisa mematikan saklar induk".

**Yang benar:** temukan wadahnya dengan menelusuri induk sasaran sampai ketemu
elemen yang `overflow-y` auto/scroll DAN `scrollHeight > clientHeight`.

### 3. Klik yang tidak sampai, tanpa error

`Input.dispatchMouseEvent` memakai koordinat **LAYAR**. Kalau `elementFromPoint`
mengembalikan null, kliknya jatuh entah ke mana dan **tidak ada exception**.

Sekarang `klik()` **membuktikan** kliknya sampai: ia mencoba `block:'center'`
lalu `block:'nearest'`, dan hanya mengklik kalau `elementFromPoint` menunjukkan
sasarannya memang di titik itu. Kalau tidak pernah berhasil, ia mengembalikan
`false` supaya pemanggilnya tahu kliknya tidak terjadi.

## Jebakan pemilihan sasaran

- Mengambil toggle **pertama di DOM** memilih `clangd`, yang **belum terpasang**.
  Menyalakan server yang belum terpasang memang tidak mengubah toggle: ia membuka
  dialog. Uji lalu melaporkan "toggle tidak berefek" pada kasus yang bukan kasus
  yang dimaksud. Pilih server yang **terpasang** (punya penanda).
- `data-testid$="-reload"` juga menangkap **`lsp-reload-all`** - tombol global
  yang memang HARUS tetap hidup saat IntelliSense mati. Saring dari struktur:
  `.lsp-baris [data-testid$="-reload"]`.

## Kondisi awal wajib dikunci

- **Toggle per server** bergantung pada settings yang bertahan antar sesi. Kalau
  ia sudah menyala, klik tunggalnya MEMATIKAN dan ujinya berbunyi gagal. Kunci ke
  nilai yang diinginkan dulu; kalau tidak bisa, **lewati dengan pesan jelas**.
- **`enabled: []` di `extensions` berarti SEMUA ekstensi bawaan AKTIF** - itu
  penghematan ruang yang disengaja (`cur.length === 0 ? BUILTIN_IDS : cur`).
  Uji yang menganggap `[]` sebagai "semua mati" akan salah membaca keadaannya.
- `verify08` **menghapus `settings.json`** di akhir ujiannya, jadi harness
  berikutnya mulai dari nol. Beberapa kegagalan `verify06`/`verify08` di sesi ini
  berasal dari state yang ditinggalkan uji sebelumnya (6 pane penuh, ekstensi
  kembali ke default), bukan dari regresi kode.
