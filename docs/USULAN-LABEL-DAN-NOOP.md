# Usulan patch: label "sudah didukung bawaan" & paket bahasa NO-OP

Rujukan bukti: `docs/LAPORAN-LABEL-DAN-NOOP.md` (keluaran nyata kedua harness lane ini + vonis per bahasa).
Status worktree: mesin label jujur **sudah ada** (`src/lib/labelPaket.ts`, `src/components/extensions/bahasaTerpasang.ts`, dipakai di `ExtensionsView.tsx:367` dan `:549`). Usulan di bawah ini hanya menutup **sisa** yang belum dikerjakan. Semua nomor baris diverifikasi dari berkas nyata saat laporan ini ditulis; lane ini **tidak** menyentuh `src/**` (read-only), jadi ini usulan, bukan patch terpasang.

---

## U1 — Komentar basi "7 id" (teks UI salah hitung)

**Fakta.** `grep -c "^  'zephyr.lang-" src/lib/labelPaket.ts` = **6**. Turunan dari katalog nyata (harness 2) juga hanya menemukan 6 paket yang perlu catatan: `zephyr.lang-puppet` (no-op) + `perl`, `python`, `ruby`, `shell`, `xml` (ekstensi-sisa).

### U1a — `src/components/extensions/bahasaTerpasang.ts` (baris 5-6)

Teks lama (`bahasaTerpasang.ts:5-6`):
```text
 * Kenapa modul ini ada: `src/lib/labelPaket.ts` menulis catatan "sudah
 * didukung bawaan" / "NO-OP" untuk 7 id paket bahasa bawaan - sebuah tabel
```
Teks baru:
```text
 * Kenapa modul ini ada: `src/lib/labelPaket.ts` menulis catatan "sudah
 * didukung bawaan" / "NO-OP" untuk 6 id paket bahasa bawaan - sebuah tabel
```
Alasan: angka 6 adalah jumlah entri nyata di `labelPaket.ts` dan hasil turunan katalog; "7" tidak punya sumber.

### U1b — `src/components/extensions/ExtensionsView.tsx` (baris 546)

Teks lama (`ExtensionsView.tsx:546`):
```text
   * menutup 7 id bawaan; ini menutup paket lain, termasuk yang diunduh.
```
Teks baru:
```text
   * menutup 6 id bawaan; ini menutup paket lain, termasuk yang diunduh.
```

---

## U2 — Kelas label jujur tidak punya aturan CSS (sinyal hilang secara visual)

**Fakta.** `ExtensionsView.tsx:411` menulis `className={`xc-desc xc-label-jujur is-${label.jenis}`}` sehingga menghasilkan `xc-label-jujur is-no-op` (puppet) atau `xc-label-jujur is-ekstensi-sisa` (5 paket). Pencarian ripgrep atas `src/` untuk `xc-label-jujur|is-no-op|is-ekstensi-sisa|\.xc-desc` hanya menemukan **2** kecocokan: `.xc-desc` di `src/styles/extensions.css:470` dan pemakaian className di `ExtensionsView.tsx:411` → tidak ada aturan untuk `xc-label-jujur` / `is-no-op` / `is-ekstensi-sisa` **di mana pun**.

Dua akibat nyata:
1. Label "NO-OP — ekstensi .pp sudah diklaim paket Pascal …" tampil persis seperti baris `item.description` biasa — tidak ada pembeda warna/berat huruf;
2. `.xc-desc` (`extensions.css:470-477`) memaksa `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` — teks label jujur itu panjang, jadi langsung terpotong "…" dan sisanya tak terbaca.

**Usul:** sisipkan blok berikut **setelah** aturan `.xc-desc { … }` (yaitu setelah `src/styles/extensions.css:477`, sebelum `.xc-err {` di `:478`):

```css
/* Label jujur di kartu ekstensi: HARUS terbedakan dari `.xc-desc` biasa dan
   boleh membungkus (teksnya panjang, `.xc-desc` memotongnya dengan ellipsis). */
.xc-label-jujur {
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  font-style: italic;
}
.xc-label-jujur.is-no-op {
  color: var(--warning, var(--danger));
}
.xc-label-jujur.is-ekstensi-sisa {
  color: var(--text-secondary);
}
```

Catatan: `var(--warning)` dipakai dengan fallback ke `--danger` supaya tidak perlu menambah variabel tema baru; pemilik repo bisa memilih token lain. Ini usulan **hanya satu berkas** (`src/styles/extensions.css`), tidak menyentuh logika.

---

## U3 — Baris `Languages` di panel detail menulis klaim manifest tanpa penanda

**Fakta.** `ExtensionsView.tsx:562` menulis baris kontribusi apa adanya, mis. `Python (.pyi)` atau `Perl (.t, .pod)`, untuk paket yang catatan jujurnya sudah dihitung di variabel `catatanBahasa` (`:549`). Pembaca harus menggulir ke blok "Bahasa vs bawaan" (`:631-646`) untuk tahu bahwa bahasanya sudah bawaan.

Teks lama (`ExtensionsView.tsx:562`):
```tsx
    ['Languages', c?.languages.map((x) => `${x.label} (.${x.extensions.join(', .')})`) ?? []],
```
Teks baru (usul):
```tsx
    [
      'Languages',
      c?.languages.map((x) => {
        const n = catatanBahasa.find((y) => y.label === x.label);
        const tanda = n?.noEfek ? ' — sudah didukung bawaan / tidak berpengaruh' : '';
        return `${x.label} (.${x.extensions.join(', .')})${tanda}`;
      }) ?? [],
    ],
```
Alasan: memakai **nilai yang sudah dihitung** (`catatanBahasa`) — tidak ada sumber kebenaran kedua, dan labelnya otomatis benar untuk paket unduhan juga (bukan tabel tangan).

---

## U4 — Keputusan untuk paket NO-OP: label jelas vs jangan-tawarkan

**Fakta.** `zephyr.lang-puppet` tetap ada di katalog dan tetap bisa dipasang/dilepas; yang ada baru **label** (`labelPaket.ts:47-57`), belum ada gate. Item meminta "keputusan jangan-tawarkan/label-jelas".

**Rekomendasi: LABEL-JELAS (pertahankan perilaku sekarang)**, dengan alasan berbukti dari harness lane ini:
- mematikan `zephyr.lang-puppet` tidak menghilangkan satu ekstensi pun (uji negatif C07) → memasangnya memang nol efek, jadi **tidak ada risiko** membiarkannya terpasang;
- memasang puppet **justru berguna sebagai cadangan**: kalau `zephyr.lang-pascal` (pemilik `.pp`, `ext_bundled.rs:273`) dilepas, `.pp` langsung dipegang puppet (uji negatif C08) → menyembunyikannya akan menghapus jalur cadangan yang nyata;
- menyembunyikannya menuntut pintu khusus di katalog + risiko "paket terpasang tapi tak ada di daftar" (kartu yatim) — biaya besar untuk manfaat nol.

**Kalau** pemilik repo memilih jangan-tawarkan, tempat patch paling kecil adalah **katalog**, bukan komponen: tandai paket di `src-tauri/src/ext_bundled.rs` (atau peta di `src/lib/labelPaket.ts:27-44` sebagai `jenis: 'no-op'`) lalu saring di daftar kartu `ExtensionsView.tsx` — tetapi rekomendasi lane ini tetap label-jelas, dan labelnya sekarang sudah ada.

---

## U5 — Jagangan agar tabel tangan tidak jagain basi

**Fakta.** Sudah ada `scripts/uji-katalog-ekstensi-jujur.mjs` (menurunkan status dari katalog nyata lalu menuntut `labelPaket.ts` setuju). Usul tambahan yang murah: perluas uji itu (atau tambah pemeriksaan kecil) supaya **komentar** "N id" juga diperiksa terhadap jumlah kunci `LABEL_PAKET` — persis jenis kebasian yang ditemukan di U1. Alternatif yang lebih kuat: buang tabel tangan dan biarkan `catatanBahasaTerpasang()` (`bahasaTerpasang.ts:85`) menjadi **satu-satunya** sumber, karena ia sudah menghitung dari `detectLang()` + `manifest` dan otomatis menutup paket ke-8 serta paket unduhan.

---

## U6 — Keputusan produk (opsional): apakah `zephyr.lang-dockerfile` layak masuk tabel?

**Fakta.** `LANG_DOCKERFILE` (`ext_bundled.rs:239`) mengklaim `.dockerfile` yang **tidak** ada di `BY_EXT` → per aturan lane ini ia **EFEKTIF** (bukan ekstensi-sisa, bukan no-op), jadi tidak wajib berlabel. Tetapi berkas yang **bernama** `Dockerfile` (tanpa akhiran) sudah ditangani bawaan lewat `BY_NAME` (`lang.ts:71`), dan deskripsi katalognya berbunyi "Syntax highlight Dockerfile (.dockerfile)." — kalau pemilik repo ingin tabel tangan punya entri ke-7, kandidatnya **ini**, dan teks jujurnya kurang lebih: "menambah akhiran baru .dockerfile (berkas bernama `Dockerfile` sudah didukung bawaan)". Ini keputusan produk, bukan temuan bug — dan (kalau diambil) itulah satu-satunya cara angka "7" di U1 bisa jadi benar.

---

## Ringkasan prioritas

| # | Berkas | Baris | Jenis | Risiko |
|---|---|---|---|---|
| U1a | `src/components/extensions/bahasaTerpasang.ts` | 5-6 | komentar (7 → 6) | nol |
| U1b | `src/components/extensions/ExtensionsView.tsx` | 546 | komentar (7 → 6) | nol |
| U2 | `src/styles/extensions.css` | sisip setelah 477 | CSS label jujur (termasuk perbaiki ellipsis) | rendah (1 berkas, tanpa logika) |
| U3 | `src/components/extensions/ExtensionsView.tsx` | 562 | penanda jujur di baris `Languages` | rendah |
| U4 | keputusan produk | — | **label-jelas** (rekomendasi) | nol |
| U5 | `scripts/uji-katalog-ekstensi-jujur.mjs` | — | jagangan tabel/komentar | nol |
| U6 | keputusan produk | — | entri ke-7 opsional (`dockerfile`) | nol |
