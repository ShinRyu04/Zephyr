# Persona "Zeph" menghapus SEMUA aturan operasional dari setiap request

Ditemukan 2026-10-04, lewat keluhan user: "AI nya lama banget" dan jawaban 8 baris
untuk pertanyaan "ini di folder apa" (`Inspect`, `cd`, `cd`, `powershell`, `List`,
`cmd`, `Inspect`, `powershell`, `Read state`, `cmd`, `Find files`).

## Akarnya BUKAN prompt yang lemah

`BlokPrompt.caraKerja` untuk EN dan ID memuat DUA jenis hal yang tercampur:

1. Aturan OPERASIONAL: `todo_write` dengan 2-5 langkah, satu langkah satu tool,
   sebut kegagalan di baris yang sama, "a claim is not proof", "spend a tool
   call only when it brings something new", plus blok
   `# Which tool for which job` (petunjuk tool mana untuk pekerjaan apa).
2. Gaya kerja - hanya satu kalimat pengantar.

Semuanya dikirim lewat `lapisan(b.caraKerja, per.caraKerja, saya)`, dan `lapisan`
berisi aturan ini:

    if (teks === bawaan && keluar.length > 0) continue;   // "lantai minggir"

Artinya: begitu persona (atau custom instructions) mengisi `caraKerja`, seluruh
blok bawaan DIHAPUS. Persona aktif di mesin ini bernama **"Zeph"** dan
`caraKerja`-nya berisi 636 karakter, jadi **3568 karakter** aturan bawaan hilang
di setiap request.

Bukti dari app hidup (bukan dari baca kode):

    persona aktif          : Zeph
    caraKerja persona      : 636 karakter
    panjang caraKerja bawa : 3568 karakter
    bawaan masuk prompt?   : false
    aturan "Spend a tool call only..." di prompt? : false
    blok "# Which tool for which job" di prompt?  : false

Perbaikannya satu blok (`systemPrompt.ts`):

    b.caraKerja,
    ...lapisan('', per.caraKerja, saya),

Bawaan dikirim tanpa syarat; persona MENAMBAH di atasnya - urutan yang sama
dengan `per.aturan` di bawahnya. Aturan operasional memang tidak boleh bisa
dihapus persona; gaya kerja boleh.

## Jebakan saat mengukur: blok prompt ikut uiLang, BUKAN answerLang

`systemPromptFor(lang, ...)` memakai `bahasaPrompt()`, yang membaca
`settings.general.uiLang`. Argumen `lang` pertama hanya dipakai untuk gaya jawaban.

Jadi harness yang memanggil `systemPromptFor('id', ...)` sambil UI berbahasa
EN akan SELALU mendapat blok EN. `cek-narasi-id.mjs` lama begitu: ia melaporkan
"aturan ID hilang" padahal aturannya ada.

Harness yang benar mengubah `uiLang`, membangun prompt dari tiap bahasa,
lalu memulihkannya.

## Jebakan kedua: harness tanpa assert

`cek-narasi-id.mjs` versi lama mencetak JSON lalu keluar 0. Tidak ada satupun
pernyataan yang bisa gagal. Jadi "lulus" di situ berarti tidak ada yang diukur.

Harness sekarang keluar 1 kalau ada aturan yang hilang atau `uiLang` tidak
dipulihkan, dan tiap aturan dicocokkan dengan FRASA PENDEK - bukan kalimat
penuh - supaya mengubah ejaan prompt tidak diam-diam membalik hasil.

## Jejak yang sama: tool jalan di folder instalasi

`bash_run` (tool "Run") mengirim `{command, timeoutMs}` saja tanpa cwd, dan
backend memakai `state.workspace_path()` sendiri. Kalau store belum sinkron,
perintahnya jalan di `C:\Users\LENOVO\AppData\Local\Programs\tedi\resources` -
persis yang terlihat di log user.

Sekarang `bash_run` mengirim `cwd: akar()` seperti `bash_background`, dan
`agent_exec` memvalidasi cwd (harus ada, harus di dalam workspace). Nilai
tolakannya jauh lebih baik daripada diam-diam jalan di tempat salah: dulu
`cd` melaporkan folder yang menyesatkan, sekarang "Menjalankan perintah butuh
workspace terbuka".

## Yang TERBUKTI dan belum

- `cek-aturan-operasional` 6/6, dengan kontrol positif: tanpa perbaikan 0/6.
- `cek-cwd-tool` 2/2 lewat alur resmi `openWorkspace` -> tool Run -> `cd`.
- `cek-narasi-id` 9/9.
- BELUM terbukti: apakah model benar-benar menarasi di antara tool pada run
  sungguhan. Aturannya ada di prompt dan UI bisa merender teks+tool
  bercampur (`cek-interleave` lulus), tapi percakapan model sungguhan perlu
  dijalankan dan memakai kuota.
- BELUM terbukti: tombol Lanjut muncul setelah timeout asli. `verify-lanjut2`
  menguji logikanya dengan checkpoint buatan, bukan timeout sungguhan.

## Temuan sampingan: 502 mengunci UI sampai 6 menit

Run live user kena `502` dari gateway. `phase` tetap `thinking` dan
`agentBusy` true selama >70 detik berturut-turut, tanpa tombol Lanjut dan tanpa
checkpoint. Ini BUKAN macet di frontend: jalur keluar di `aiStore.ts` sudah
benar. Yang menahan adalah retry di sisi Rust, dan frontend tidak bisa melepas
UI sebelum watchdognya (360 detik) - sedangkan timeout idle Rust 300 detik.

Jadi satu 502 dari gateway bisa membuat UI terkunci sekitar 5-6 menit dengan
tampilan "Thinking about the next step". Itu penjelasan yang paling cocok dengan
keluhan "lama banget".

## Pelajaran

**Blok prompt yang bisa dilapis tidak boleh memuat aturan operasional.**
`lapisan()` dirancang untuk GAYA. Kalau aturan cara kerja ikut di dalamnya,
maka siapa pun yang mengisi persona diam-diam mematikan instruksi keagenan -
dan gejalanya bukan "prompt kurang lengkap", tapi "model memanggil tool tanpa
henti".

Untuk mengukur aturan prompt, periksa dulu FIELD mana yang benar-benar dikirim,
bukan hanya argumen fungsi yang kelihatan relevan.