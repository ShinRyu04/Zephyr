# USULAN SUNTIK KONTEKS — cara menyambungkan `suntikKonteks.ts` ke giliran agen

**Status: USULAN. Belum diterapkan.** `src/lib/aiStore.ts` milik lane lain, jadi lane
ini tidak menyentuhnya. Nomor baris diambil dari `src/lib/aiStore.ts` pada 14 Okt 2026
(8732 baris) dan bisa bergeser kalau lane lain mengedit berkas itu lebih dulu —
periksa ulang potongan kodenya sebelum menempel.

Yang **sudah** selesai dan teruji (berkas lane ini):

- `src/lib/suntikKonteks.ts` — 489 baris, murni, 17/17 kasus lulus.
- `scripts/uji-suntik-konteks.mjs` — harness, `node scripts/uji-suntik-konteks.mjs`.
- `docs/KONTEKS-ZEPHYR.md`, `docs/ANTREAN-PESAN-AGEN.md`, `docs/REPRO-BUG-KEJAM.md`.

Yang belum: **tidak ada satu pun bagian `aiStore.ts` yang memanggil
`susunGiliran()`**. Giliran agen masih menyusun pesannya sendiri.

---

## 0. Keadaan sekarang (dibaca dari kode, bukan ditebak)

| Baris | Apa yang terjadi sekarang |
| --- | --- |
| `src/lib/aiStore.ts:4989` | `const history: AgentMsg[] = [];` — daftar pesan giliran dibentuk manual |
| `:5038-5045` | riwayat difilter, lalu **`prev = prevSemua.slice(-2)`** — hanya 2 pesan terakhir yang dibawa |
| `:5062` | `konteksMemoriProyek()` membaca `.zephyr-context.md` |
| `:5068` | isi berkas itu **digabung ke teks system prompt**: `${aturan}\n\n${memori}` |
| `:5069-5079` | satu blok `system` di-unshift |
| `:5088-5092` | permintaan giliran ini di-push sebagai `user` |
| `:7396-7402` | giliran sukses → `get().antrians[COMPOSER_AKTIF][0]` diambil, `kirimAntrian(0, …)` |
| `:7403-7424` | giliran gagal/dibatalkan → antrean **tidak** dikuras, hanya toast |

Dua akibat yang jadi alasan usulan ini:

1. **Tugas bisa hilang tanpa jejak.** `slice(-2)` tidak tahu apa itu "pekerjaan yang
   belum selesai". Tugas yang diset tiga pesan lalu tidak ikut, dan tidak ada satu
   baris pun yang melaporkannya.
2. **Aturan antrean tidak dipakai bersama.** `antreanPesan.ts` punya batas 20 pesan/
   8192 karakter (`src/lib/antreanPesan.ts:61`, `:64`), `id` stabil (`:29-33`), dan
   `giliranSelesai` (`:187`), tapi jalur `antrians` di `aiStore.ts` (`:2460`, `:2497`,
   `:3287-3340`) memakai bentuk dan aturannya sendiri.

Tambahan risiko yang ketemu saat membaca: kalau `memori` tetap digabung di `:5068`
**dan** file yang sama diserahkan ke `susunGiliran` sebagai `konteks`, isinya masuk
dua kali. Pilih salah satu (lihat A2 di bawah).

---

## 1. Tambalan A — minimal, tanpa mengubah bentuk store

### A1. Impor (sisipkan dekat `src/lib/aiStore.ts:212`)

```diff
 import { systemPromptFor, identityReminder, aturanProyek, konteksMemoriProyek } from './systemPrompt';
+import { susunGiliran, ringkasLaporan, type PesanRiwayat } from './suntikKonteks';
+import {
+  buatAntrean, giliranMulai, giliranSelesai, kirim as antrekanPesan,
+} from './antreanPesan';
```

Alias `antrekanPesan` dipakai supaya tidak bentrok dengan aksi store `kirimAntrian`
(`src/lib/aiStore.ts:2801`).

### A2. Riwayat + antrean → bahan giliran (ganti `src/lib/aiStore.ts:5045-5055`)

```diff
-    const prev = prevSemua.slice(-2);
-    for (const m of prev) {
-      if (m.role === 'user' || m.role === 'assistant') {
-        const banyak = m.images?.length ? m.images : m.image ? [m.image] : [];
-        history.push({
-          role: m.role,
-          content: m.content,
-          ...(banyak.length ? { images: banyak } : {}),
-        });
-      }
-    }
+    /* Riwayat diserahkan ke `susunGiliran`: dia yang memutuskan mana yang diringkas,
+       mana yang dibuang, dan SEMUA keputusan itu masuk `laporan`. `slice(-2)`
+       dihapus karena tugas yang diset lebih dari dua pesan lalu hilang tanpa jejak. */
+    const riwayatGiliran: PesanRiwayat[] = prevSemua.slice(-40).flatMap((m, i) =>
+      m.role === 'user' || m.role === 'assistant'
+        ? [{ id: m.id ?? `riwayat-${i}`, peran: m.role, teks: m.content }]
+        : [],
+    );
+    /* Antrean permukaan ini diadopsi ke `KeadaanAntrean` apa adanya. `giliranMulai`
+       WAJIB dipanggil lebih dulu: `kirim()` mengembalikan `masukAntrean:false` (tanpa
+       menyimpan) kalau keadaan belum `sibuk` - lihat `src/lib/antreanPesan.ts:137-139`. */
+    const keadaanAntrean = (get().antrians[COMPOSER_AKTIF] ?? []).reduce(
+      (k, p) => antrekanPesan(giliranMulai(k), p.teks ?? '', p.images ?? []).keadaan,
+      buatAntrean(),
+    );
```

Catatan kejujuran: `PesanRiwayat` (`src/lib/suntikKonteks.ts:83-87`) belum punya medan
`images`, jadi potongan di atas **tidak** membawa gambar dari riwayat. Kalau itu
diperlukan, tambahkan medan opsional `images?: readonly string[]` di
`src/lib/suntikKonteks.ts:86` — perubahan kecil di berkas lane ini, aman karena opsional.

### A3. Susun giliran (ganti `src/lib/aiStore.ts:5068` + `:5088-5092`)

```diff
-        const aturanGabung = memori ? `${aturan}\n\n${memori}`.trim() : aturan;
+        /* `memori` TIDAK lagi ditempel di sini: isinya diserahkan ke `susunGiliran`
+           sebagai blok konteks tersendiri (melewati `sensor` + dilaporkan). Kalau
+           tetap ditempel di sini, isinya masuk dua kali. */
+        const aturanGabung = aturan;
```

```diff
-    history.push({
-      role: 'user',
-      content: payloadAgen + identityReminder(get().model, content),
-      ...(agentImages.length ? { images: agentImages } : {}),
-    });
+    const hasilGiliran = susunGiliran({
+      konteks: memori,
+      riwayat: riwayatGiliran,
+      antrean: keadaanAntrean,
+      tugasBelumSelesai: get()
+        .agentTodos.filter((t) => t.status !== 'done')
+        .map((t) => t.teks ?? t.judul ?? ''),
+      permintaan: {
+        id: `minta-${Date.now().toString(36)}`,
+        teks: payloadAgen + identityReminder(get().model, content),
+        images: agentImages,
+      },
+    });
+    /* Blok `system` disisipkan di depan TANPA membalik urutan blok wajib di belakangnya. */
+    for (const p of [...hasilGiliran.pesan].reverse()) {
+      if (p.peran === 'system') history.unshift({ role: 'system', content: p.teks });
+    }
+    for (const p of hasilGiliran.pesan) {
+      if (p.peran === 'system') continue;
+      const gambar = p.asal === 'permintaan' && agentImages.length ? { images: agentImages } : {};
+      history.push({ role: p.peran, content: p.teks, ...gambar });
+    }
+    if (hasilGiliran.laporan.dibuang.length || hasilGiliran.laporan.melebihiAnggaran) {
+      console.warn('[suntik-konteks]', ringkasLaporan(hasilGiliran.laporan));
+    }
```

`t.teks` — **periksa dulu bentuk `AgentTodo`** (`src/lib/aiStore.ts:1543-1545`: `status`
ada di `:1545`, medan teksnya di `:1544`); kalau namanya lain, pakai medan yang benar.
Jangan tempel buta.

### A4. Ekor giliran (ganti `src/lib/aiStore.ts:7398-7402`)

```diff
-      const daftar = get().antrians[COMPOSER_AKTIF] ?? [];
-      const next = daftar[0];
-      if (next && !(get().agentBusys[COMPOSER_AKTIF] ?? false)) {
-        void get().kirimAntrian(0, COMPOSER_AKTIF);
-      }
+      const { keadaan: sisaAntrean, langsungDiproses } = giliranSelesai(keadaanAntreanAktif());
+      simpanKeadaanAntrean(COMPOSER_AKTIF, sisaAntrean);
+      if (langsungDiproses) void get().kirimAntrian(langsungDiproses.id, COMPOSER_AKTIF);
```

`kirimAntrian` menerima `idx: number | string` (`src/lib/aiStore.ts:2801`), jadi `id`
dari `antreanPesan.ts` bisa dikirim langsung.

### A5. Laporan ke UI

`hasilGiliran.laporan` (`src/lib/suntikKonteks.ts:150-168`) memuat `dibuang[]`,
`diringkas[]`, `tugasTerjaga`, `melebihiAnggaran`, `rahasia[]`, `peringatan[]`.
Minimal `ringkasLaporan()` (`src/lib/suntikKonteks.ts:478`) masuk log; lebih baik masuk
panel/log agen — itu yang membedakan "dipotong dan dilaporkan" dari "hilang senyap".

---

## 2. Tambalan B — satukan antrean (jangka panjang)

Kalau Tambalan A diterima, langkah berikutnya tinggal menghapus duplikatnya:

| Hapus / ganti | Jadi |
| --- | --- |
| `AntrianPesan[]` di `src/lib/aiStore.ts:2460`, `:2497` | `KeadaanAntrean` (satu bentuk, dari `antreanPesan.ts:45`) |
| `buangAntrian` `:3287-3295`, `kosongkan` `:3335-3338`, `naikkan/turunkan/promosikan` `:3298-3333` | delegasi ke `batalkan` (`:231`), `kosongkan` (`:250`), `naikkan` (`:279`), `turunkan` (`:283`), `promosikan` (`:288`) |
| `kirimAntrian` mengambil `daftar[pos]` mentah (`:3382-3384`) | `kepala(keadaan)` (`:209`) + `giliranSelesai(keadaan)` (`:187`) |
| toast `:7421` | tetap, tapi angkanya dari `jumlah(keadaan)` (`:204`) |

Keuntungannya bukan kerapian: aturan batas/penolakan jadi satu tempat, jadi
"antrean penuh" di panel dan di jalur agen tidak bisa lagi berbeda jawaban.

---

## 3. Yang perlu diuji setelah tambalan ditempel (bukan bagian lane ini)

1. `node scripts/uji-suntik-konteks.mjs` → harus tetap **17/17**.
2. `npx tsc --noEmit` → berkas yang disuntik bersih.
3. Manual di app: ketik dua pesan cepat selagi agen bekerja, lalu pastikan
   (a) tidak ada pesan yang hilang, (b) urutannya tetap, (c) `ringkasLaporan` muncul
   kalau riwayat panjang, (d) nilai dari `.env`/kunci API **tidak** muncul di log/keluaran.
4. Kasus tugas-3-pesan-lalu: set tugas, kirim dua pesan lain, lalu cek
   `tugasTerjaga > 0` di log laporan (inilah yang sekarang hilang karena `slice(-2)`).

Bukti bug "versi kejam" (untuk konteks kualitas): `docs/REPRO-BUG-KEJAM.md` +
`node scripts/uji-bug-kejam2.mjs` → 10/10 bukti, exit 0, tanpa aplikasi hidup.
