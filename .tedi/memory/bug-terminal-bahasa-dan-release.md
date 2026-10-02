# Bug yang ditemukan dan diperbaiki (gelombang 8)

Ditulis 2026-10-02. Empat bug nyata, satu di antaranya menjelaskan keluhan
"bahasa campur" yang berlangsung lama.

## 1. Kamus tambahan tidak pernah dimuat (akar bahasa campur)

Ini yang paling penting.

`i18n.ts` punya `muatKamusTambahan()` yang meng-import `i18n-extra.ts` secara
asinkron ke `EXTRA`. **Fungsi itu tidak dipanggil dari mana pun.** Nol pemanggil.

Akibatnya `EXTRA` selalu kosong. Dan `translate()` mengambil keputusan begini:

    const own = EXTRA[lang]?.[key] ?? DICTS[lang]?.[key];
    if (own !== undefined) return own;
    const src = SRC[key];
    if (src !== undefined) return lang === 'id' ? key : src;

Hampir semua terjemahan Inggris untuk kunci Indonesia tinggal di **EXTRA**,
bukan di `DICTS.en` yang kecil. Jadi selama EXTRA kosong, kunci itu tidak
ditemukan, lalu jatuh ke `DICTS.id` - yang mengembalikan **teks Indonesia**.

Gejalanya menipu: sebagian teks benar (yang kebetulan ada di `DICTS.en`), dan
sebagian tetap Indonesia. Tampak seperti terjemahan yang belum lengkap, padahal
kamusnya sudah lengkap dan hanya tidak dimuat.

Perbaikannya ada di `useT()`, karena itu satu-satunya tempat yang PASTI dilewati
setiap komponen yang menampilkan teks terjemahan:

- `muatKamusTambahan()` dipanggil dari `useEffect`
- ia mengembalikan **promise**, bukan void, dan promise-nya disimpan supaya
  beberapa komponen tidak memicu impor 1.4 MB berkali-kali
- `saatKamusSiap()` memberi tahu komponen saat kamus tiba, dan hook memicu
  render ulang lewat state `versi`

Verifikasi: `scripts/cek-bahasa-final.mjs` - 3/3.

## 2. `closing.delete` di luar finally (pane bisa terkunci permanen)

`closePane` menaruh `closing.delete(paneId)` di baris terakhir badan, di LUAR
try yang menelan kesalahan. Satu lemparan dari `disposeHandle` atau dari `set`
membuat id pane tertinggal di `closing` selamanya - dan setiap percobaan
menutup pane itu berhenti di penjaga di atas, diam-diam.

Sekarang seluruh badan dibungkus `try/finally`.

## 3. `closeTab` dan `closePane` melewati browser pane

Keduanya punya `if (p.kind !== 'browser')` - webview anak diserahkan ke efek
unmount `BrowserPane`. Pengandaian itu tidak selalu benar: **grid pane hanya
merender tab yang AKTIF**, jadi menutup tab browser yang sedang tidak dilihat
tidak pernah menjalankan unmount itu.

Webview anak diposisikan di koordinat LAYAR NATIVE, jadi ia tidak ikut
terpotong induknya. Yang tertinggal akan melayang di atas panel lain dan
menutupinya - inilah "browser nyangkut ketimpa terminal" yang dilaporkan.

Sekarang keduanya memanggil `browserPaneClose(paneId)` dari data store, bukan
menggantungkan diri pada siklus hidup komponen.

## 4. Tombol "Go to localhost:5173" berbohong di rilis

`HOME` sudah dijaga `import.meta.env.DEV` (dev: localhost:5173, rilis:
duckduckgo.com). Tapi `placeholder` dan label tombolnya ditulis tangan sebagai
`localhost:5173` - jadi di rilis tombol itu menuju DuckDuckGo sambil
menjanjikan localhost. Sekarang keduanya membaca `HOME`.

## Pelajaran

**Klaim audit harus diuji, bukan dipercaya.** Sesi ini memuat dua klaim yang
salah:

- "kamus EN berisi teks Indonesia" - salah. Blok `ID` yang berisi Indonesia,
  dan skripku memindai seluruh berkas sehingga entri ID ikut terhitung.
  Blok `EN` justru sudah benar. Kalau saya langsung mempercayainya, saya akan
  menukar dua blok kamus 1.4 MB yang sudah benar.

- "kunci 'Berkas' bocor ke English" - salah. Kunci itu tidak pernah dipanggil
  satu komponen pun. Yang salah ujinya, bukan kamusnya.

Aturan yang dipakai: subagent mencari, saya memutuskan.

## Jebakan yang kena lagi

- **Backtick di dalam komentar yang berada DI DALAM template literal** menutup
  template-nya lebih awal. Kena di `cek-bahasa-final.mjs`; parser melaporkan
  error di baris lain. Di komentar dalam template literal: pakai kutip tunggal.

- **`import()` dari skrip CDP membuat store kedua.** Ini muncul lagi saat
  mengukur pane: skrip menulis ke store A, komponen membaca store B, dan
  hasilnya "state kosong" padahal tidak. Untuk menguji state yang dibaca
  komponen yang SUDAH hidup, pakai `window.__ZEPHYR_TERM__` /
  `window.__ZEPHYR_TODO__`.

- **CDP mati saat idle.** Memisahkan tulis dan baca ke dua perintah membuat
  sambungan kedua gagal. Jalankan app dan uji dalam SATU perintah.

- **Uji "nilai == kunci" bukan bukti gagal terjemah.** Untuk kunci `files`,
  terjemahan Inggrisnya memang `files`. Uji seperti itu menolak keadaan yang
  benar. Yang benar: cari nilai yang masih memuat KATA INDONESIA.
