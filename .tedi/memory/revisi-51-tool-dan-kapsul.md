# Revisi tools jadi 51/40 dan kapsul status ala Hermes

Ditulis 2026-10-02. Dua pekerjaan besar yang saling terkait, dan dua jebakan
yang mahal untuk ditemukan ulang.

## Kontrak tool: 51 terpasang, 40 wajib aktif

User memutuskan strukturnya begini - dan perbedaan ini penting:

| Lapisan | Jumlah | Default |
|---|---|---|
| Bawaan | 26 | selalu aktif |
| MCP | 14 | selalu aktif |
| **Inti** | **40** | **wajib kepake** |
| Web & Browser | 11 | mati, user yang nyalakan |
| **Katalog** | **51** | |

Tool web/browser TIDAK dihapus - user eksplisit menyuruh mempertahankannya dan
memasukkan 11-nya ke katalog supaya bisa disetel sendiri.

Di `catalog.ts` dan `toolGate.ts`, `TOOL_INTI` dan `TOOL_AKTIF_AWAL` DITURUNKAN
dari katalog dengan `source !== 'web'`, bukan ditulis ulang manual. Daftar manual
untuk hal yang sama akan berbeda cepat atau lambat - dan itu sudah terbukti di
sesi ini (`TOOL_BAWAAN_AKTIF` sempat tertinggal jadi daftar pendek).

`periksaKatalog()` sekarang memeriksa kontraknya: 40 inti harus ada, tidak boleh
ada nama web di `TOOL_BAWAAN_AKTIF`, dan setiap `netWrite` web wajib minta izin.

## Jebakan 1: `import()` dari skrip CDP membuat store KEDUA

Ini yang menghabiskan paling banyak waktu. Gejalanya: store berisi, komponen
render tanpa error, tapi DOM kosong.

Sebabnya: `import('/src/lib/aiStore.ts')` dari luar aplikasi membuat **Vite
memuat instance modul baru** di luar grafik modul yang sudah jalan. Skrip menulis
ke store A, komponen membaca store B. Komponennya sehat selama ini; cara
ukurnya yang salah.

Buktinya: dua import dengan query berbeda (`?probe=1`) menghasilkan store yang
berbeda.

**Aturan:** untuk menguji state yang dibaca komponen yang SUDAH hidup, pakai
`window.__ZEPHYR_*__` (bridge dev) - ia memakai modul yang sudah dimuat
aplikasi. Hanya pakai `import()` kalau memang mau instance sendiri.

## Jebakan 2: `todo_write` mengirim `title`, store menyaring `content`

`setAgentTodos` menyaring entri yang `content`-nya kosong - penyaring itu benar,
baris tugas tanpa teks tidak ada gunanya. Tapi artinya mengirim `title` saja
membuat SELURUH daftar tersaring habis, dan tool melaporkan sukses sementara
kartu tugas tidak pernah muncul.

Sekarang `todo_write` menerima `title` sebagai jalan masuk yang wajar (model
sering memakai nama itu), memetakannya ke `content`, dan **melempar** kalau tidak
satu pun diterima - melaporkan sukses palsu adalah cara paling halus membuat
agen mengulang panggilan yang sama tanpa henti.

## Kapsul status ala Hermes

Ciri yang diukur, bukan sekadar `className`:

- kapsul atas melengkung `12px`, bawah LURUS `0px`
- kotak input kebalikannya: atas `0px`, bawah melengkung
- lebar kapsul = lebar input (`1204 = 1204`)
- selisih tepi kiri `0`, celah vertikal `0`

Dua kotak bisa punya kelas yang tepat dan tetap terlihat terpisah - jadi
mengukur keberadaan kelas tidak membuktikan apa pun. `cek-kapsul-hermes.mjs`
mengukur bentuknya.

Popover SUBAGENTS di kepala panel dibuang; isinya sudah ada di kapsul (ikon
server-process). Berkas `SubAgentInfo.tsx` TIDAK dihapus - masih dipakai di
tempat lain.

## Catatan operasional: CDP mati saat idle

WebView2 di mesin ini menutup CDP dalam beberapa detik. Memisahkan tulis dan baca
ke dua perintah membuat sambungan kedua `ECONNREFUSED`. Jalankan app dan seluruh
uji dalam SATU perintah.

## Harness

- `scripts/verify-tedi-catalog.mjs` - 29/29, katalog statis vs sumber TEDI
- `scripts/cek-kontrak-40.mjs` - 5/5, kontrak di aplikasi hidup
- `scripts/cek-kapsul-hermes.mjs` - 10/10, bentuk kapsul bersatu

Nama tool di verifikasi katalog dibaca dari `.tedi/reference/` (cuplikan sumber),
bukan diketik ulang di dalam uji. Uji yang menyalin daftar tetap lulus walaupun
katalognya berubah - ia mengunci kesalahan, bukan mencegahnya. Ada penjaga
nol-discovery: kalau tabel handler tidak ditemukan, verifikasi berhenti dengan
pesan jelas alih-alih melaporkan nol tool dan lulus palsu.
