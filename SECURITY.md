# Keamanan

## Melaporkan kerentanan

Kirim email ke **muhkhalid039@gmail.com** dengan subjek diawali `[zephyr-security]`.
Jangan buka issue publik untuk kerentanan yang belum ditambal.

Sertakan versi Zephyr, versi Windows, langkah reproduksi, dan dampak yang kamu
lihat. Kalau ada proof-of-concept, lampirkan.

Ini proyek satu orang, jadi gua tidak bisa menjanjikan SLA. Yang bisa gua
janjikan: laporan dibaca, dan kalau valid akan ditambal atau — kalau memang tidak
bisa ditambal — dicatat terbuka di dokumen ini.

## Versi yang didukung

Hanya rilis terbaru. Tidak ada backport ke versi lama.

## Batas keamanan yang sudah diketahui

Ini bukan daftar bug. Ini keputusan desain yang perlu kamu tahu sebelum
memutuskan seberapa jauh mempercayai Zephyr.

### API key adalah obfuskasi, bukan enkripsi

Key provider AI disimpan di `%APPDATA%\zephyr\secrets.json`, di-XOR dengan kunci
BLAKE3 yang diturunkan dari MachineGuid + hostname + username.

Artinya: file itu tidak bisa dibaca sekilas, dan tidak berguna kalau disalin ke
mesin lain. Tapi siapa pun yang **sudah** bisa menjalankan kode sebagai akun
Windows kamu dapat menurunkan kunci yang sama dan membukanya. Ini melindungi dari
mata yang lewat, bukan dari penyerang yang sudah masuk.

`reset_settings` **tidak** menghapus file ini. Hapus manual kalau perlu.

### Server MCP di port 9222

Server hanya mendengarkan di localhost dan mewajibkan Bearer token. Token
disimpan di `%APPDATA%\zephyr\` dan bisa dilihat lewat Settings.

Yang perlu disadari: **proses lokal mana pun** yang bisa membaca file token itu
bisa mengendalikan jendela Zephyr — membaca isi buffer editor, menulis ke
terminal, dan menjalankan command palette. Batas kepercayaannya adalah akun
Windows kamu, bukan proses.

`editor_write` dan `editor_insert` sengaja hanya menyentuh buffer di memori,
tidak menulis ke disk. Jadi AI yang keliru tidak bisa merusak file tanpa kamu
menekan simpan. Batasnya 1 MB per panggilan; `terminal_write` 64 KB.

Server bisa dimatikan sepenuhnya di Settings → MCP.

### Workspace Trust

Membuka folder yang belum dipercaya menjalankannya dalam Restricted Mode: tasks
runner, debugger, language server, dan pemuatan ekstensi **ditolak di sisi Rust**,
bukan cuma disembunyikan di UI. Penjaganya `ensure_trusted()`.

Trust mewarisi ke bawah, tidak ke atas: mempercayai `D:\proyek` mencakup
subfoldernya, tapi mempercayai `D:\proyek\sub` tidak membuat `D:\proyek`
dipercaya. Status `Unknown` diperlakukan sama seperti `Restricted`.

Alasan ini penting: `tasks.json` dan `launch.json` bisa menjalankan program apa
pun. Meng-clone repo asing lalu membukanya tanpa gerbang ini sama dengan
menjalankan kode orang lain.

### Ekstensi tidak menjalankan JavaScript

Ekstensi v1 hanya membaca `package.json` dan mendaftarkan `contributes.commands`
ke palette. Kode JS-nya **tidak pernah dieksekusi**.

Ini disengaja dan tidak akan diubah tanpa sandbox yang benar. Mengeksekusi JS
ekstensi di WebView yang sama berarti memberi ekstensi pihak ketiga akses penuh
ke `window`, dan lewat itu ke seluruh IPC — filesystem, PTY, git, dan secrets.
Ekstensi yang manifest-nya rusak atau `main`-nya di atas 1 MB dipaksa
`enabled: false`.

### Penulisan file dibatasi workspace

Operasi tulis di luar folder workspace ditolak di sisi Rust. Path dinormalisasi
dulu, jadi `..\..\Windows\System32` tidak lolos.

### Installer tidak ditandatangani

Tidak ada sertifikat code signing, jadi SmartScreen akan memperingatkan. Cara
memverifikasi yang kamu unduh: bandingkan hash-nya dengan yang dipublikasikan di
halaman rilis.

Kunci privat updater tidak ada di repositori ini dan tidak akan pernah
di-commit.

### Browser pane

Browser pane memakai `<iframe>` dengan sandbox, jadi isinya tidak bisa membaca
DOM Zephyr maupun memanggil IPC. Situs yang mengirim `X-Frame-Options: DENY`
memang tidak bisa dimuat — itu perilaku benar, dan alasannya ditampilkan beserta
header aslinya, bukan pesan gagal generik.

## Yang di luar cakupan

- Penyerang yang sudah mengeksekusi kode sebagai akun Windows kamu. Semua
  penyimpanan lokal — secrets, token MCP, daftar trust — jatuh dalam kasus ini.
- Modifikasi berkas Zephyr di disk oleh proses lain.
- Kerentanan di WebView2 Runtime itu sendiri; itu ditambal lewat Windows Update.
- Perilaku provider AI pihak ketiga terhadap data yang kamu kirim ke sana.
