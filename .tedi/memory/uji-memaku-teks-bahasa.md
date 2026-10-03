# Uji yang memaku teks bahasa tertentu MENOLAK perbaikan yang benar

Ditulis 2026-10-03, setelah bahasa default Zephyr diubah menjadi Inggris. Dua
harness langsung gagal, dan **keduanya berbunyi palsu**.

## Kejadiannya

`verify04.mjs` V6b memeriksa pesan proteksi self-move:

    v6b.err.includes('dirinya sendiri')

Pesan itu lulus selama UI kebetulan berbahasa Indonesia. Begitu default menjadi
Inggris, yang tercetak adalah `a folder cannot be moved into itself` - dan ujinya
melaporkan gagal **pada aplikasi yang benar**.

Ini kelas bug yang sudah tercatat sebelumnya (`verify-todo-card` memaku
`'Done'`/`'Running'` dan lulus hanya KARENA bug i18n). Sekarang kejadian lagi,
dari sisi yang berlawanan.

## Aturannya

**Uji tidak boleh memaku teks satu bahasa.** Harapannya harus dihitung dari kamus
bahasa yang sedang aktif, atau menerima **semua bentuk yang sah**.

Yang dipakai di V6b sekarang:

    const pesanSelfMove = await cdp.eval(`
      (() => {
        const t = window.__ZEPHYR_I18N__;
        if (t && typeof t.tr === 'function') return t.tr('a folder cannot be moved into itself');
        ...
      })()
    `);
    const sah = ['a folder cannot be moved into itself',
                 'tidak bisa memindahkan folder ke dalam dirinya sendiri'];
    const harap = pesanSelfMove ? [pesanSelfMove, ...sah] : sah;

Daftar bentuk-sah akan basi kalau ada bahasa baru, jadi yang diutamakan adalah
**membaca dari kamus**, bukan menambah entri ke daftar.

## Cara mengenali kegagalan jenis ini

Kalau sebuah harness gagal **tepat setelah bahasa atau teks UI berubah**, dan
gagalnya berbentuk "teks tidak cocok", curigai harness-nya lebih dulu. Periksa
apa yang **sebenarnya** tercetak (harness biasanya mencetaknya di keterangan),
lalu bandingkan dengan yang diharapkan uji.

## Kegagalan lain di sesi yang sama yang JUGA bukan regresi

- `verify06` gagal karena **6 pane penuh** dari uji sebelumnya (`maxPanes` di
  setting user adalah 3).
- `verify08` V11 gagal karena **`settings.json` sudah dihapus** oleh ujian V13 di
  harness yang sama, sehingga `enabled: []` - dan `[]` berarti **SEMUA ekstensi
  bawaan AKTIF**, bukan "semua mati".
- `verify.mjs` menolak `testfiles/sample.tsx` sebagai "di luar workspace" karena
  workspace aktif user saat itu adalah `src-tauri/target/debug`.

Ketiganya lahir dari **state yang ditinggalkan uji sebelumnya**, bukan dari kode.
Urutan menjalankan harness itu penting.
