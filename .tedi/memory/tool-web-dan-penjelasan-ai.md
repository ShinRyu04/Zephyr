# Dua bug yang terlihat terpisah, ternyata dua-duanya soal daftar dan penimpaan

Ditulis 2026-10-03. Keduanya dilaporkan user sebagai "kok error terus" dan
"kok gak dijelasin apa yang dilakukannya".

## 1. `browser_list` gagal: daftar nyala yang diketik tangan

User meminta agen membuka URL. Transkrip menampilkan `List pages - failed`,
lalu giliran berhenti sendiri.

Rantainya:

1. `toolGate.ts` menyimpan `TOOL_WEB_AKTIF_AWAL` sebagai **daftar nama tulis
   tangan** berisi 4 tool. `browser_list` tidak ikut - padahal efeknya `read`,
   cuma menyebutkan pane browser yang sudah terbuka.
2. Agen memanggilnya untuk melihat keadaan tab - langkah yang wajar.
3. Sekat menolak: `Tool "browser_list" sedang dinonaktifkan`.
4. Agen kehilangan jalan membuka pane, beralih ke `web_fetch` berulang kali.
5. Pengawas anti-loop (5 langkah tanpa kemajuan) menghentikan seluruh giliran.

Yang penting: **4 dari 11 tool web nyala**. Tujuh mati, dan satu di antaranya
menjadi penyebab kegagalan yang terlihat user.

### Perbaikan: daftar MATI, bukan daftar nyala

Arahnya dibalik, dan ini yang menentukan. Daftar NYALA berarti tool web baru
**lahir mati** dan kelahirannya perlu disadari seseorang; kalau terlewat, ia
mati diam-diam sampai user melihat baris merah. Persis yang terjadi.

Daftar MATI berarti tool baru **lahir bisa dipakai**. Yang perlu disadari
adalah tool yang BERBAHAYA, dan tool berbahaya selalu ditulis dengan sadar -
tidak ada yang menambahkan "klik elemen di halaman user" tanpa memikirkannya.

Isi `WEB_MATI`: `browser_click`, `browser_type`, `browser_download_url`,
`browser_close`, `system_browser_open`. Sisanya nyala.

### Jebakan saat memperbaiki: aturan yang "jelas benar" tapi salah

Percobaan pertama memakai aturan `effect === 'read'` untuk memutuskan apa yang
nyala. Terlihat lebih bersih daripada daftar. **Tapi hasilnya MATI SEMUA**:
`browser_open`, `browser_read`, `browser_nav`, `web_fetch` bertanda `net`,
bukan `read`. Aturan yang terdengar lebih benar justru memperkecil daftar nyala
dari 4 menjadi 0.

Yang benar adalah daftar mati eksplisit, bukan aturan effect.

### Cara mengukur yang benar

`__ZEPHYR_TOOLS__` dan `__ZEPHYR_TOOLS__.nama()` - bukan `import()` dari skrip
CDP, yang membuat store kedua (jebakan lama, kena lagi).

Yang membuktikan perbaikan bukan "tool terdaftar", tapi **tool bisa dipanggil**.
Buktinya: `OK - browser_list melewati sekat -> No browser pane is currently
open.` Sebelumnya jawabannya `Tool "browser_list" sedang dinonaktifkan`.

Panggil dengan argumen yang BENAR. Memanggil `browser_nav({})` menolak karena
argumen wajib - itu kegagalan yang sah, dan menghitungnya sebagai kegagalan
sekat membuat harness berbunyi palsu.

## 2. AI tidak menjelaskan: dua sebab, keduanya nyata

Keluhan: "kadang ga dijelasin semua apa yang dah dibuka dan dilakukannya".

### Sebab A - prompt memang melarangnya

`systemPrompt.ts` berisi:

    - Never narrate what a tool will do before calling it: call it, then report
      the result.
    - Answer in a few sentences. Explain only what the reader cannot infer from
      the diff.

Dan gaya default (`short`) membatasi **3 kalimat**. Aturan-aturan itu benar
untuk jawaban AKHIR, tapi tidak satu pun menyebut jarak ANTARA langkah. Model
membaca batas 3 kalimat sebagai anggaran SELURUH giliran, jadi pekerjaan enam
langkah = enam baris tool tanpa satu kalimat pun di antaranya.

Perbaikan: tambahkan kewajiban menjelaskan per langkah, dan nyatakan bahwa batas
3 kalimat berlaku untuk jawaban penutup, bukan seluruh giliran.

### Sebab B - teks langkah sebelumnya DITIMPA dengan kosong

Ini yang tidak terlihat dari prompt, dan lebih halus.

`akhir = res.content` diset SETIAP langkah. `res.content` kosong adalah keadaan
NORMAL - model yang memanggil tool sering tidak menulis apa pun sebelum
panggilan, terutama saat melanjutkan rencana yang sudah dijelaskan. Versi lama
menimpanya, jadi kalimat dari langkah sebelumnya **terhapus** dari variabel yang
dipakai sebagai jawaban akhir.

Perbaikan: `if (res.content && res.content.trim()) akhir = res.content;`

Kalimatnya sebenarnya masih ada di gelembung pesan (tiap potongan ditempelkan
ke `m.content` saat datang), jadi yang hilang cuma salinannya di `akhir`. Tapi
salinan itulah yang dipakai saat giliran berakhir.

**Pelajaran:** keluhan "AI kurang menjelaskan" terdengar seperti masalah prompt,
dan memang ada masalah prompt. Tapi ada sebab kedua di aliran data, dan
memperbaiki prompt saja tidak akan menyelesaikannya.

## 3. Audit katalog vs handler (dan tiga alarm palsu berturut-turut)

Dibuat `scripts/audit-katalog-tool.mjs` untuk memastikan tidak ada tool
terdaftar tanpa implementasi. Hasil akhir: **54 = 54, sinkron**.

Tapi skrip itu sempat berbunyi palsu tiga kali, dan ketiganya karena AKU salah
memahami kode, bukan karena kodenya salah:

1. **Berkas handler kurang satu** - `builtins.ts` tidak ada di daftar, jadi 29
   tool bawaan dilaporkan hilang.
2. **Bentuk nama MCP** - katalog mentah menulis `inspect` (polos), `rakit()`
   menambahkan prefiks, dan `mcp.ts` menulis `mcp__tedi__inspect`. Aku memetakan
   sisi yang SALAH, jadi 14 tool MCP dilaporkan hilang.
3. **Regex nama** - menangkap `name:` saja, sedangkan `mcp.ts` juga memakai
   bentuk lain, sehingga dua bentuk nama bercampur dalam satu himpunan.

Cara menemukannya: mencetak 3 nama contoh dari tiap berkas. Membaca kode lebih
lambat daripada menebak, tapi menebak tiga kali lebih lambat daripada membaca
sekali.

**Aturan:** kalau harness melaporkan puluhan masalah sekaligus, curigai
harness-nya lebih dulu. Bug nyata jarang muncul 68 sekaligus.

## Harness baru

- `scripts/cek-web-tool-aktif.mjs` - tool web benar-benar bisa dipanggil, lewat
  sekat yang sama dengan jalur chat
- `scripts/audit-katalog-tool.mjs` - 54 katalog = 54 handler, dan setiap tool
  yang bertindak meminta izin
