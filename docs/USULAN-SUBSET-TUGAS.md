# Usulan tambalan — sambungan `subsetTugas.ts` ke berkas lane lain

Status: **menunggu pemilik berkas**. Modul `src/lib/subsetTugas.ts` (LAMA-a1/a4)
plus sambungannya di `src/lib/aiStore.ts` **sudah dikerjakan** oleh lane
`aiStore.ts`. Yang tersisa ada di berkas yang bukan milik lane ini
(`src/lib/devBridge.ts`), jadi ditulis sebagai usulan — bukan dikerjakan sendiri.

Semua nomor baris dari keadaan `feat/ai-panel-vscode-layout` per 2026-10-14.

---

## 1. `src/lib/devBridge.ts` — jembatan penguji harus melihat subset yang SAMA dengan yang dikirim agen

### Masalah

`__ZEPHYR__.subsetAlat(teks)` adalah cara membuktikan "tool apa yang benar-benar
dikirim" **tanpa menunggu run 20 menit** (komentar di baris 306–311 menyebut itu
tujuannya). Tapi jalur agen sekarang memakai `pilihToolTugas` (subset ≤ 20),
sedangkan jembatan ini masih memanggil `alatUntukTugas` (17–23 tool).

Akibatnya jembatan **berbohong tentang jalur nyata**: penguji membaca 23 tool,
padahal yang keluar ke provider 20. Lebih buruk lagi pada item `berat`, karena
`tugasBerat` tidak mengenali perintah tunggal ("perbaiki bug di src/lib/a.ts")
yang sekarang memicu gerbang rencana.

### Tambalan

`src/lib/devBridge.ts` baris 41–47 (blok import `./subsetAlat`) — tambahkan satu
import baru **setelah** blok itu, jangan ubah isinya:

```diff
   alatUntukTugas,
   alatRencanaPertama,
   gerbangRencanaSiap,
   tugasBerat,
   tugasButuhWeb,
 } from './subsetAlat';
+import { pilihToolTugas, wajibTodo } from './subsetTugas';
```

`src/lib/devBridge.ts` baris 316–324 (isi `subsetAlat:`):

```diff
       return {
         butuhWeb: tugasButuhWeb(teks),
-        berat: tugasBerat(teks),
+        /* LAMA-a4: jalur agen memakai OR ini (lihat aiStore.ts), jadi jembatan
+           harus melaporkan hal yang sama atau ia tidak lagi membuktikan apa pun. */
+        berat: tugasBerat(teks) || wajibTodo(teks),
         adaFolder: folder,
-        alatKirim: alatUntukTugas(teks, aktif, folder),
+        /* LAMA-a1: subset <= 20 dengan kemampuan superset. */
+        alatKirim: pilihToolTugas(teks, aktif, folder),
+        /* Baseline pembanding supaya penguji bisa melihat apa yang DIPANGKAS,
+           bukan cuma hasil akhirnya. */
+        alatKirimLama: alatUntukTugas(teks, aktif, folder),
+        dipangkas: alatUntukTugas(teks, aktif, folder).filter(
+          (t) => !pilihToolTugas(teks, aktif, folder).includes(t),
+        ),
         rencanaPertama: alatRencanaPertama(aktif, folder),
         gerbangSiap: gerbangRencanaSiap(aktif, folder),
         alatAktif: aktif,
       };
```

`alatUntukTugas` tetap diimpor (dipakai untuk `alatKirimLama`/`dipangkas`), jadi
tidak ada import yang jadi mati dan `noUnusedLocals` tetap tenang.

### Dampak & risiko

- Bidang yang sudah ada (`alatKirim`, `berat`, `butuhWeb`, `rencanaPertama`,
  `gerbangSiap`, `alatAktif`) tetap ada, hanya nilainya ikut jalur nyata. Bidang
  baru bersifat tambahan.
- Penguji yang selama ini meng-assert `alatKirim.length === 23` harus diperbarui
  ke `<= 20`; itu memang maksud itemnya (audit: 4 dari 6 tugas menembus 20).
- Verifikasi yang disarankan setelah tambalan: `node scripts/cek-subset-tugas.mjs`
  (harness lane ini) + jalankan ulang harness yang membaca `__ZEPHYR__.subsetAlat`.

---

## 2. Tidak ada sambungan lain yang dibutuhkan

| Berkas | Status |
|---|---|
| `src/lib/aiStore.ts` | **sudah**: `pilihToolTugas(...)` di jalur alat kirim, `beratRun = tugasBerat(...) || wajibTodo(...)`, fallback `padatkanRiwayatMurni` di blok auto-compact |
| `src/lib/subsetAlat.ts` | tidak perlu diubah — `pilihToolTugas` meminjam `bentukTugas`/`tugasButuhWeb` dari sana, dan `alatUntukTugas` tetap utuh untuk pembanding |
| `src/lib/toolGate.ts` | tidak perlu diubah — `TOOL_DIKIRIM_SELALU` tetap jadi alat ukur |
| `src/lib/zephyrTools/**`, `src/components/**`, `src-tauri/**` | tidak disentuh |
| i18n | notis pemadatan memakai kunci `tf(...)`; kalau bundle bahasa menolak kunci tak dikenal, tambahkan `"Context auto-compacted (tanpa model): {n} messages summarized"` — teks Indonesia di notisnya sendiri sudah final, jadi kunci itu hanya perlu ada di kamus EN |
