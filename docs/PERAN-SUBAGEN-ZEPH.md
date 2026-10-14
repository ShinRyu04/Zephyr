# Peran Sub-Agen Zeph (berketik / typed)

Rancangan peran sub-agen Zephyr yang **berketik**: peran adalah nilai tetap
(`PeranId`), bukan prompt bebas yang dikarang tiap kali. Tiap peran menetapkan
**alat yang boleh dipakai**, **batas langkah**, **keluaran yang harus
dihasilkan**, dan **cara hasilnya dilaporkan balik** ke agen utama.

- **Tanggal:** 2026-10-14 · Cabang: `feat/ai-panel-vscode-layout`
- **Status:** spesifikasi (memetakan implementasi yang sudah ada, sebagai acuan).
- Lane ini **dokumen saja**; tidak ada berkas `src/**` diubah.

---

## 1. Definisi "berketik"

Sumber: `src/lib/subagentRoles.ts`.

```ts
export type PeranId = 'cari' | 'telaah' | 'rencana' | 'audit' | 'kerja' | 'jelajah';
```

Setiap peran bertipe `Peran { id, label, hint, ikon, butuhTulis, arahan, kunci }`
(`subagentRoles.ts:6–27`):

| Bidang | Arti |
|---|---|
| `id` | kunci tetap peran (`PeranId`) |
| `label` / `hint` | nama + satu baris untuk picker |
| `ikon` | glif dari `peranIcons.ts` (digambar, bukan karakter font — `subagentRoles.ts:12–19`) |
| `butuhTulis` | apakah peran ini butuh izin tulis berkas |
| `arahan` | **prompt sistem** peran (bentuk keluaran ditentukan di sini) |
| `kunci` | kata pemicu untuk mendeteksi peran otomatis (`tebakPeran`) |

**Enam peran tetap** (id → label), `subagentRoles.ts:29–103`:

1. `cari` → **Search** (SCOUT)
2. `telaah` → **Review** (REVIEWER)
3. `rencana` → **Plan** (PLANNER)
4. `audit` → **Audit** (AUDITOR)
5. `kerja` → **Work** (WORKER)
6. `jelajah` → **Explore** (EXPLORER)

---

## 2. Enam peran: alat, langkah, keluaran, pemicu

**Alat.** Sub-agen **read-only dari default**: `agentToolSpecs({ bolehTulis:
false })` menyaring seluruh `TOOL_TULIS` dari daftar tool yang dikirim ke model
(`src/lib/agentTools.ts:111–113`; `TOOL_TULIS` = satu set tunggal 32 anggota, lihat
`CHANGELOG.md#Security`). Yang membalik keadaan itu hanya setelan
`settings.subagent.allowWrite`.

**Batas langkah.** Bawaan `MAX_SUB_STEPS = 15` (`subagentStore.ts:233`), diatur
lewat `settings.subagent.maxSteps` dengan `batasLangkah()` — clamp **min 3, maks
50** (`subagentStore.ts:65–68`). Pararel: bawaan `MAX_PARALLEL = 4`
(`subagentStore.ts:13`), clamp 1–8 (`subagentStore.ts:62`).

| Peran (`id`) | Butuh tulis? | Alat | Keluaran wajib (dari `arahan`) | Pemicu (`kunci`) |
|---|---|---|---|---|
| `cari` (SCOUT) | tidak | read-only | **berkas, baris, dan apa yang ditemukan — dengan kutipan pendek sebagai bukti** | cari, temukan, pemakaian, struktur, dimana, list, daftar, peta |
| `telaah` (REVIEWER) | tidak | read-only | analisis yang **menyebut bukti konkret (berkas, baris, perilaku)**, bukan dugaan; sebut bagian yang **belum terbukti** | analisis, kenapa, mengapa, bug, risiko, arsitektur, trade, review, telaah |
| `rencana` (PLANNER) | tidak | read-only | **langkah terurut, berkas yang disentuh, cara verifikasi tiap langkah**; rencana yang masih menyisakan pertanyaan desain = belum selesai | rencana, plan, rancang, desain, langkah, strategi |
| `audit` (AUDITOR) | tidak | read-only | **daftar temuan + tingkat keyakinan**, bukan vonis umum | audit, periksa, cek, verifikasi, validasi, feasible |
| `kerja` (WORKER) | **ya** | tulis (bila `allowWrite` nyala) | **jalankan cek (typecheck/test) lalu laporkan apa yang berubah + keluaran cek**; tetap di dalam lingkup tugas | perbaiki, ubah, tulis, implementasi, buat, tambah, hapus, fix, kerjakan |
| `jelajah` (EXPLORER) | tidak | read-only | **sebut sumbernya**; kalau tidak ada bukti, katakan tidak ada — **jangan mengarang perilaku pustaka** | pustaka, library, dokumentasi, docs, versi, api, riset, bandingkan |

---

## 3. Cara tugas memilih peran (deterministik, bukan tebakan model)

Tiga jalur di `subagentRoles.ts`:

1. **Prefix eksplisit** `@<peran>` — `peranDariPrefix` (`subagentRoles.ts:130`,
   regex `^\s*@(cari|telaah|rencana|audit|kerja|jelajah)\b`).
2. **Deteksi otomatis** — `tebakPeran` (`subagentRoles.ts:112`) memberi skor tiap
   peran dari `kunci` yang cocok; **kata kunci lebih panjang dianggap lebih
   spesifik** (`skor += k.length`, `subagentRoles.ts:120`).
3. **Rantai `->`** — `pisahPipeline` (`subagentRoles.ts:144`): `buat API -> tulis
   test` menjalankan langkah pertama, lalu langkah kedua **menerima hasil
   pertama sebagai konteks**. Ini rantai (tiap tugas bergantung pada yang
   sebelumnya), bukan graf penuh.

**Override model per tugas** — `modelDariPrefix` (`subagentRoles.ts:157`):
`[model:<id>]` atau `[model:<provider>/<id>]` di mana saja pada baris tugas, sehingga
satu batch bisa memasangkan model pencarian murah dengan model mahal.

---

## 4. Peran custom (buatan pengguna)

Sumber: `src/lib/subagentCustom.ts`.

Peran bawaan = prompt tetap yang dikirim Zephyr. Peran custom = **nama,
deskripsi satu baris, allowlist alat, dan prompt yang ditulis pengguna** — agen
pengorkestrasi memperlakukan keduanya sama begitu tugas diluncurkan
(`subagentCustom.ts:6–13`).

Bentuk data (`subagentCustom.ts:49–66`):

```ts
interface SubagentCustom {
  id: string;
  nama: string;        // lencana di baris tugas + picker
  deskripsi: string;   // satu baris; agen pakai untuk memutuskan delegasi
  alat: AlatId[];      // hanya alat READ-ONLY
  prompt: string;      // persona + aturan; menggantikan prompt peran bawaan
  model: string;       // kosong = sama dengan chat
  provider: string;    // kosong = provider aktif
  aktif: boolean;      // apakah boleh dipilih agen
}
```

**Allowlist alat custom sengaja read-only** (`subagentCustom.ts:15–47`):
`ALAT` = `read_file`, `list_directory`, … (browser/web read). Alasan di kode:
worker custom berjalan dengan riwayat bersih dan tanpa pengawasan, jadi
memberinya izin tulis dari default adalah foot-gun; hanya peran bawaan `kerja`
yang memegangnya (`subagentCustom.ts:33–36`). `arahanCustom` menyusun prompt dari
`prompt` + daftar `alat` yang diberikan (`subagentCustom.ts:203`).

Aturan: peran custom **tidak boleh memakai nama peran bawaan**, dan dua peran
custom tidak boleh berbagi nama (yang kedua tak bisa dijangkau lewat nama) —
`subagentCustom.ts:172, 260`, dan teks UI di `SectionsAdvanced.tsx`.

---

## 5. Izin tulis: satu gerbang, jujur mengakuinya

- **Gerbang berkas tunggal**: `settings.subagent.allowWrite`
  (`bolehTulis()`, `subagentStore.ts:70`). Menyalakannya = user memang meminta
  sub-agen bekerja, jadi tulis disk langsung dijalankan (`subagentStore.ts:86–89`).
- **Pengecualian**: **perintah shell** yang bisa menghapus/menimpa berkas tetap
  butuh `ai.approvalMode === 'auto'`, sebab kerusakannya tidak bisa ditinjau
  setelah terjadi dan sub-agen tidak punya kartu persetujuan
  (`subagentStore.ts:100–103, 176–181`).
- Peran ber-`butuhTulis: false` (lima dari enam) **tidak pernah** ditawari tool
  tulis, apa pun setelannya.

---

## 6. Cara hasil dilaporkan balik ke agen utama

**Bentuk ringkasan.** Setelah batch selesai, `subagentStore.ts:796–817` menyusun
`ringkasan`:

```
## <nama> — <SELESAI|GAGAL|DIBATALKAN>
Tugas: <tugas>
Bukti: <verdict>[ + "Files written: ..."][ + "Write attempts refused: N"]

<isi hasil>
```

**`catatanTulis` didahulukan** (`subagentStore.ts:209, 817`): baris `## WRITE
PERMISSION: OFF/ON` ditulis sebelum hasil mana pun. Alasan di kode
(`subagentStore.ts:198–207`): ringkasan yang hanya memuat temuan membuat
"sub-agen sudah menulis berkasnya" jadi kesimpulan yang wajar — padahal saat
gerbangnya mati tidak ada satu berkas pun yang tersentuh. Kalimatnya menyatakan
keadaannya lebih dulu supaya agen utama **menerapkan sendiri** perubahan yang
dilaporkan, bukan menganggapnya beres.

**Verdict bukti** ditempelkan di sebelah klaim (`subagentStore.ts:802–807`),
supaya pembaca bisa membedakan hasil terverifikasi dari agen yang sekadar
berbicara:

- `terbukti` → "N tool steps, all succeeded"
- `sebagian` → "N tool steps, some failed — check"
- `tanpa-bukti` → "NO tool step succeeded — the result is unproven"

**Bukti tambahan per agen**: `fileDitulis` (berkas yang benar-benar ditulis) dan
`tulisDitolak` (berapa percobaan tulis yang ditolak gerbang)
(`subagentStore.ts:808–811`).

**Kepemilikan berkas.** Sub-agen mengklaim berkas saat pertama menulis;
sub-agen kedua yang diberi berkas sama **ditolak dengan nama pemiliknya**
(`klaimFile`, `subagentStore.ts:447–449`).

---

## 7. Yang belum beres (jujur, jangan dianggap sempurna)

1. **Prompt peran `audit` salah ketik.** `subagentRoles.ts:76` menulis *"Change
   anything."* — maksudnya jelas *"Change nothing."* (peran `audit` read-only).
   Ini memperbanyak peluang model mengubah berkas; belum dikoreksi karena lane ini
   dokumen saja.
2. **Ringkasan per agen dibatasi 400 karakter** saat dipakai sebagai konteks
   antar-langkah (`subagentStore.ts:773`, `slice(0, 400)`) — temuan panjang bisa
   terpotong di rantai `->`.
3. **Tarif/biaya belum dilaporkan** — tabel tarif sengaja kosong sampai ada tarif
   nyata (`subagentStore.ts:25–28`); mengarang angka lebih buruk daripada tidak ada.

---

## 8. Rujukan berkas

- Peran: `src/lib/subagentRoles.ts`, `src/lib/peranIcons.ts`
- Custom: `src/lib/subagentCustom.ts`
- Runtime/gerbang/laporan: `src/lib/subagentStore.ts`
- Tool: `src/lib/agentTools.ts` (`TOOL_TULIS`, `agentToolSpecs`)
- UI: `src/components/ai/SubAgentBar.tsx`, `src/components/ai/SubAgentInfo.tsx`,
  `src/components/settings/SectionsAdvanced.tsx`
- Catatan sesi: `docs/CATATAN-KEPUTUSAN-SESI-2026-10-14.md`
