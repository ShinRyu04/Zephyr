# Kamus ID dan EN tidak seimbang - dan itu BUKAN penyebab bahasa campur

Ditulis 2026-10-03, saat mengejar keluhan "settingan Language Server tidak bisa
dipencet apa-apa". Temuannya beda jauh dari yang dituduh.

## Angkanya

`src/lib/i18n-extra.ts`, 10 kamus. Acuan ES (2200 kunci):

| Kamus | kurang | lebih |
|---|---|---|
| ID | 41 | **66** |
| EN | **18** | 0 |
| JA, KO, ZH, ES, FR, DE, PT, AR | 0 | 0 |

**Delapan dari sepuluh kamus sempurna.** Yang tidak seimbang hanya ID dan EN -
dua kamus yang paling sering disentuh tangan, dan justru itu sebabnya.

## Dua hal berbeda yang terlihat sama

Selisih jumlah kunci ini **bukan** terjemahan yang belum lengkap. Setelah
diperiksa satu per satu, kunci yang "lebih" di ID adalah **kunci mati**: kalimat
yang ada di kamus tapi **tidak dipanggil komponen mana pun**.

Contoh: `'Tool yang dikenalkan ke model'`, `'Panjang prompt sekarang'`,
`'Sembunyikan pratinjau'`, `'Persona: identitas'`. Pencarian di seluruh `src`
menemukannya **hanya di berkas kamus itu sendiri**.

Jadi akibatnya bukan teks Indonesia bocor ke bahasa lain, melainkan kamus
terlihat tidak rapi. Dua masalah ini butuh tindakan yang berbeda, dan
menyamakannya membuat orang "memperbaiki terjemahan" yang tidak dipakai.

## 18 kunci EN yang hilang - ini yang paling berbahaya

Enam di antaranya **berkunci teks INDONESIA**:

    'Tool yang dikenalkan ke model'
    'Panjang prompt sekarang'
    'Identitas'
    'Aturan'
    'Sembunyikan pratinjau'
    'Ini yang benar-benar dikirim ke model (tanpa aturan proyek & konteks).'

Konvensi berkas ini: **kunci = kalimat sumber (Inggris)**. Kunci berbahasa
Indonesia melanggar konvensi itu, dan karena kamus EN tidak punya nilai untuknya
(alasan sah untuk tidak punya: tidak ada yang memintanya), kalau suatu saat
kalimat itu dipakai, pengguna Inggris akan melihat Indonesia.

## Cara mengukur yang benar

`cek-kunci-i18n-10-kamus.mjs` bilang **"setiap kamus punya himpunan kunci yang
sama"** - dan itu **menyesatkan**. Ia memeriksa 193 kunci di `i18n.ts`, sedangkan
2135 kunci yang sebenarnya dipakai hidup di `i18n-extra.ts` yang **tidak
disentuhnya sama sekali**. Aku sempat menyimpulkan "kamus aman" dari alat yang
tidak pernah memeriksa kamusnya.

Yang benar: `scripts/diag-kamus-beda.mjs` - membaca `i18n-extra.ts`, memetakan
batas tiap kamus, lalu membandingkan **nama kunci**, bukan jumlahnya.

## Kalibrasi detektor kunci mati

Detektor yang melaporkan SEMUA kunci mati harus dicurigai. `diag-kunci-mati.mjs`
karena itu selalu diuji dengan **kontrol positif**: kunci yang sudah pasti
tampil di UI (`Language Servers`, `Re-check`, `Enabled`). Kalau kunci yang jelas
dipakai juga terbaca mati, detektornya yang rusak.

Batas yang diketahui: kunci yang dirakit dari variabel (`tr(\`${a} ${b}\`)`) dan
kunci yang datang dari data (nama persona, subagent, tool) **tidak akan pernah**
terdeteksi sebagai dipakai lewat cara ini - kalimatnya hanya muncul sebagai
NILAI di berkas lain.

## Jebakan yang kena lagi saat mengerjakan ini

Menambahkan kunci ke 10 kamus dengan menyisipkan pada **satu penanda** (`'No
server matches that filter.':`) GAGAL: penanda itu kebetulan hanya ada di kamus
ID, sehingga 10 terjemahan masuk ke SATU kamus, dan skrip melaporkan "berhasil
ke 11 kamus" karena ia **menghitung baris, bukan kamus**. `tsc` yang menemukannya
(TS1117, 10 properti bernama sama dalam satu objek).

Skrip penjaga yang memeriksa `'kunci'` berkutip tunggal juga lolos begitu saja
saat kunci ditulis dengan **kutip ganda**.

Pelajarannya: **hitung dari struktur, jangan dari kemunculan teks.** Dan
`npx tsc --noEmit` menangkap jenis kesalahan ini dalam sekali jalan - jalankan
sebelum menyimpulkan apa pun berhasil.
