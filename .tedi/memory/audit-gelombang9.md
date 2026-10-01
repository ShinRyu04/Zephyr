# Gelombang 9 - audit menyeluruh: apa yang benar-benar ditemukan

Ditulis 2026-10-02. Audit dilakukan dengan subagent paralel yang membaca kode,
lalu **setiap klaim saya verifikasi ulang sendiri** sebelum diperbaiki.

## Pelajaran terpenting: klaim audit harus diuji, bukan dipercaya

Dari 5 klaim yang dilaporkan subagent, **1 SALAH**. Klaimnya: "PTY bocor saat
tab ditutup". Setelah saya baca sendiri `closeTab` (`terminalStore.ts`), PTY
justru dimatikan dengan benar. Kalau saya langsung mempercayainya, saya akan
"memperbaiki" kode yang sudah sehat dan mungkin merusaknya.

Aturan yang saya pakai sekarang: subagent mencari, saya memutuskan.

## Bug yang TERBUKTI dan sudah diperbaiki

1. **Hapus berkas tanpa peringatan** - `closeTabsUnder` memakai `forceCloseTab`
   untuk semua tab. Jalur nyatanya: hapus/ganti nama folder di explorer, dan
   tutup workspace. Menyunting berkas lalu menghapus foldernya = tulisan
   hilang dalam diam, tidak bisa dikembalikan.

2. **Seluruh badge status tetap Inggris di 9 bahasa.** Akar gandanya:
   - pemakaian `tr('Running')` padahal kamusnya berkunci Indonesia (`'Berjalan'`)
   - **akar yang lebih dalam** di `translate()`:
     `EXTRA.en?.[key] ?? DICTS.en[key] ?? DICTS.id[key]`
     `DICTS.en` di situ adalah kamus DASAR (Indonesia->Inggris), bukan kamus
     Inggris terjemahan. Jadi untuk kunci yang hanya ada di kamus dasar, SEMUA
     bahasa jatuh ke situ.

3. **Operasi git berganda** - `busy` diset 19 fungsi, diperiksa 0. Dua
   `git commit` berbarengan atas indeks yang sama menghasilkan commit yang
   isinya bukan yang dilihat user.

4. **Batas pane ditembus lewat SSH** - `daftarkanPaneEksternal` tidak
   memeriksa `maxPanes`. Sesi backend sudah hidup sebelum pendaftaran bisa
   ditolak, jadi penolakan meninggalkan sesi SSH tanpa pane pemiliknya.

5. **`id` tugas dibuang** (`setAgentTodos`) + **`key={i}`** di TodoPanel.
   Tanpa id, React memasangkan baris ke POSISI, bukan ke tugasnya. Urutan
   berubah (memang berubah tiap putaran) = centang dan durasi melompat ke
   tugas yang salah.

6. **`mcp.allow_terminal_control` tidak bisa diset** - Rust membacanya, tapi
   tidak ada UI untuk menulisnya. Terkunci `false` permanen.

7. **43 token CSS tak terdefinisi**, banyak TANPA fallback. `var(--x)` pada
   `color` yang gagal berlaku = teks jatuh ke hitam bawaan browser, hilang di
   atas latar gelap. Ditambal sebagai ALIAS di `tokens.css` (bukan mengubah
   puluhan berkas), sehingga tema terang tetap ikut berubah.

## Jebakan yang saya kena lagi saat mengerjakan ini

- **Menambal berkas besar lewat PowerShell merusak encoding.** Saya memakai
  `WriteAllLines` untuk menyunting `AiPanel.tsx`; karakter `·` jadi rusak dan
  sebuah komentar kehilangan penutupnya. Berkasnya dikembalikan dari git dan
  diulang memakai tool `edit`. Jangan ulangi.

- **Backtick di dalam komentar yang berada DI DALAM template literal** menutup
  template-nya lebih awal. Saya kena 3 kali (2x di harness, 1x di kode).
  Parser melaporkan error di baris LAIN, jadi penyebabnya sulit dilihat.
  Di komentar dalam template literal: pakai kutip tunggal.

- **`node --check` menyelamatkan waktu.** Untuk harness `.mjs`, ia menemukan
  kesalahan parse dalam sedetik. Lebih cepat daripada menjalankan uji lalu
  menebak dari stack trace.

## Uji yang MENGUNCI BUG

`verify-todo-card` mematok `'Done'`/`'Running'`/`'Waiting'`, dan itu lulus
HANYA karena bug i18n: kunci Inggris tidak ada di kamus, jadi penerjemahnya
mengembalikan teks kunci apa adanya, dan kebetulan cocok dengan harapan ujinya.

Pelajarannya: uji seperti itu lebih buruk daripada tidak ada uji, karena ia
MENOLAK perbaikan yang benar. Sekarang ujinya menghitung harapannya dari kamus
bahasa yang sedang aktif.

## Status harness

132/132 lulus di dua belas harness. Jalankan berurutan; beberapa harness
mengubah state (sekat tool, gate git) dan sudah memulihkannya sendiri.

Catatan: harness yang memanggil tool lewat bridge dev WAJIB membuka sekat
toolnya dulu, kalau tidak hasilnya bergantung urutan.
