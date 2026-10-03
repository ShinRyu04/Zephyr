# "AI-nya gagap": satu pesan antrean terkirim dua kali

Ditemukan dan diperbaiki 2026-10-03. Bug nyata, dan syaratnya dibuktikan dari
aplikasi hidup sebelum diperbaiki - bukan disimpulkan dari membaca kode.

## Gejalanya

User: "AI-nya balik gagap lagi." Yang terlihat: jawaban yang sama muncul dua kali,
saling menjalin, atau jawaban datang untuk pesan yang sudah dijawab.

## Penyebabnya

`kirimAntrian` di `aiStore.ts` memutuskan apakah sebuah pesan **sudah terkirim**
dengan membaca **efek samping** alih-alih **nilai kembalian**:

    await get().send(item.teks, item.images);
    const accepted = get().hasKey() && !get().toast;   // <- membaca efek samping

Masalahnya: `send()` **sendiri menyetel toast** di banyak jalur yang tetap berarti
"terkirim" - dan khusus jalur antrean, ia menyetel `'Added to the queue'` **tepat
sebelum kembali**. Terbukti dari aplikasi hidup:

    kembali: true                      <- pengiriman BERHASIL
    toastSesudah: "Added to the queue" <- tapi toast terisi

Jadi `!get().toast` bernilai **false** untuk pengiriman yang **berhasil**. Item
**tidak dihapus** dari antrean, dan drain berikutnya (`void get().kirimAntrian(0)`)
**mengirimnya lagi**.

## Perbaikannya

`send()` sudah mengembalikan `Promise<boolean>` sejak dulu - jawabannya tersedia,
hanya tidak dipakai:

    const terkirim = await get().send(item.teks, item.images);
    if (terkirim) {
      set((s) => ({ antrian: s.antrian.filter((entry) => entry !== item) }));
    }

Dihapus berdasarkan **identitas objek**, bukan teksnya: dua pesan dengan teks
sama tidak boleh keduanya hilang saat hanya satu yang terkirim.

## Pelajarannya

**Jangan membaca efek samping sebagai hasil.** `toast` adalah UI, dan ia berisi
hal-hal yang tidak ada hubungannya dengan "apakah operasi berhasil" - 'Added to
the queue', 'Message trimmed from N to M characters'. Membaca `!toast` sebagai
"gagal" adalah menebak dari petunjuk yang tidak dirancang untuk itu, padahal
fungsi yang dipanggil **sudah mengembalikan jawabannya**.

Tanda bahayanya: sebuah pemeriksaan yang memakai variabel UI untuk menyimpulkan
hasil logika. Kalau nilai kembaliannya ada, pakai itu.

## Harnessnya

`scripts/verify-antrean-gagap.mjs` - 6/6. Menguncinya dari tiga sisi: `send()`
menjawab `true` saat memarkir, antrean bertambah **tepat satu** per pesan, dan
drain benar-benar **memindahkan** pesan pertama keluar dari kepala antrean
(sebelumnya: `uji-1|uji-2` -> `uji-2|uji-1`, bukti ia terkirim dan tidak
menggandakan).

Catatan bentuk bridge: `window.__ZEPHYR_AI__.store` (Zustand store), jadi dibaca
`store.getState()` - bukan `__ZEPHYR_AI__.get()`, yang tidak ada dan langsung
melempar.
