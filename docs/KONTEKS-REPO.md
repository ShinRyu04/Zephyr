# Konteks Repo (ZEPH-KONTEKS-REPO)

Zeph harus mengenal **folder yang sedang dibuka pengguna** - bukan pohon sumber
Zephyr sendiri - dengan batas aman yang eksplisit dan angka yang bisa diaudit.

| Berkas | Peran |
| --- | --- |
| `src/lib/konteksRepo.ts` | Modul inti: daftar berkas + penanda bahasa + ukuran + waktu ubah + ringkasan struktur, plus jembatan Tauri `pindaiKonteksRepo()`. |
| `scripts/cek-konteks-repo.mjs` | Gerbang uji: 43 pemeriksaan atas empat janji (`.gitignore`, blokir rahasia, batas, tanpa jaringan). |
| `docs/KONTEKS-REPO.md` | Dokumen ini. |

Modul `src/lib/konteksRepo.ts` **tidak** menarik jaringan, tidak menyentuh
Tauri, dan tidak mengimpor `commands.ts`: intinya murni (`bangunKonteksRepo`)
sehingga bisa diuji tanpa aplikasi hidup. Hanya ada satu impor relatif -
`./agentGuard` - supaya daftar blokir rahasia tidak pernah bercabang dua.

---

## 1. Kenapa ada

Sebelum ini Zeph "tahu di mana ia berada" dari dua tempat saja:

- `src/lib/zephyrFakta.ts` - fakta tentang Zephyr sendiri (versi, perintah,
  arsitektur). Itu pengetahuan tentang **Zephyr**, bukan tentang repo pengguna.
- `src/lib/projectContext.ts` - ringkasan tiga baris (akar, jumlah berkas,
  bahasa dominan).

Celahnya: **daftar berkas nyata**. Tanpa daftar itu model menebak nama berkas,
mengarang jalur, lalu mengulang tanpa kemajuan sampai watchdog menghentikannya.

## 2. Jalur pemakaian

```
listWorkspaceFiles()  (Tauri, sudah ada)
        │
        ▼
pindaiKonteksRepo(akar, commands)          ← src/lib/konteksRepo.ts
        │  baca .gitignore (termasuk bersarang) lewat fsRead
        │  saring: rahasia? folder bawaan? gitignore? terlalu besar?
        │  stat HANYA berkas yang akan tampil (fsStat)
        ▼
bangunKonteksRepo({ akar, berkas, gitignore }) → KonteksRepo
        │
        ▼
konteks.ringkasan  →  teks siap tempel ke prompt
```

`pindaiKonteksRepo` sengaja **dua tahap**: `listWorkspaceFiles` tidak membawa
ukuran berkas, jadi `fs_stat` (satu panggilan IPC per berkas) dijalankan hanya
untuk berkas yang lolos saringan dan muat di batas - bukan untuk 5.000 berkas
sekaligus. Jalur yang dikirim ke `fsRead`/`fsStat` adalah jalur **absolut**
(dari `QuickFile.path`), sesuai yang diharapkan sisi Rust dan yang diperiksa
`periksa_path_baca`.

### Memasang di aplikasi

```ts
import * as cmd from './commands';
import { pindaiKonteksRepo } from './konteksRepo';

const { konteks, peringatan } = await pindaiKonteksRepo(akarWorkspace, cmd);
if (peringatan.length) console.warn('konteks repo:', peringatan);
const teksUntukPrompt = konteks.ringkasan;
```

`commands.ts` memenuhi `PerintahKonteksRepo` apa adanya:
`listWorkspaceFiles(limit?) => Promise<QuickFile[]>` (`path`/`rel`/`name`),
`fsRead(path, encoding?) => Promise<ReadResult>` (`{ content, ... }` - modul
meng-unwrap `.content`-nya), `fsStat(path) => Promise<StatResult>`
(`{ size, isDir, mtime }`). Ketiganya dideklarasikan sebagai **method** di
interface, bukan properti berisi fungsi, supaya tipe aslinya cocok tanpa
gesekan pemeriksaan parameter.

`peringatan` dilaporkan, bukan disembunyikan: `.gitignore` yang gagal dibaca
berarti pola di dalamnya tidak berlaku, dan pemanggil berhak tahu.

## 3. Batas - angkanya

Semua angka diekspor dari modul, jadi gate dan prompt membaca sumber yang sama:

| Konstanta | Nilai | Arti |
| --- | --- | --- |
| `BATAS_PINDAI_BERKAS` | **5.000** | berkas yang diterima dari sumber; sisanya dipotong (`stat.terpotongPindai`) |
| `BATAS_BERKAS_TAMPIL` | **300** | berkas yang muncul di ringkasan (`stat.terpotongJumlah`) |
| `BATAS_BYTE_TAMPIL` | **8 MiB** (8.388.608 B) | anggaran total korpus yang ditampilkan (`stat.terpotongByte`) |
| `BATAS_UKURAN_BERKAS` | **1 MiB** (1.048.576 B) | ambang satu berkas; di atas ini dibuang (`stat.dilewatiBesar`) |
| `BATAS_CHAR_RINGKASAN` | **6.000** | karakter ringkasan (`stat.terpotongChar`) |
| `BATAS_GITIGNORE_BYTE` | **64 KiB** | plafon baca satu `.gitignore` |
| `BATAS_BARIS_STRUKTUR` | **40** | baris peta folder di ringkasan |
| `BATAS_BAHASA` | **12** | bahasa yang dicetak, sisanya digabung |
| `BATAS_STAT_BERKAS` | **300** | berkas yang di-`fs_stat` (bawaan `pindaiKonteksRepo`) |

`stat` juga melaporkan `diabaikanGitignore`, `diabaikanStruktur`,
`diblokirRahasia` (per jenis), `dipindai`, `tampil`, `byteTampil`.

Ukuran tidak diketahui ditulis `-1` = "tidak diketahui", **bukan nol** - kalau
`fsStat` gagal, ringkasan menampilkan `?` dan pemanggil tidak dibuat percaya
pada angka palsu.

### Urutan prioritas saat batas memotong

Berkas yang **paling menjelaskan repo tidak boleh tersingkir** oleh banjir
berkas sumber. `skorPrioritasBerkas(rel)` memberi peringkat deterministik:

1. berkas di akar yang masuk `AKAR_PENTING` (`README.md`, `package.json`,
   `Cargo.toml`, `tsconfig.json`, `.gitignore`, …)
2. berkas lain di akar
3. kode di bawah `src/`
4. kode di tempat lain
5. prosa (`*.md`, `*.mdx`, `*.rst`, `*.adoc`)
6. konfigurasi (`*.json`, `*.yaml`, `*.toml`, `*.ini`, `*.cfg`, …)
7. sisanya

Seri diputus oleh jalur yang dinormalkan - jadi dua kali jalan pada masukan yang
sama menghasilkan ringkasan yang identik karakter per karakter (diuji: C7).

## 4. `.gitignore` dihormati

Dibaca dari akar **dan** dari setiap `.gitignore` bersarang (`susunAturanGitignore`).
Yang didukung:

- komentar `#`, baris kosong, spasi ujung dipangkas
- `*`, `?`, `**` (`**/` di awal = "di kedalaman apa pun"), `[abc]`, `[!abc]`
- pola berakhiran `/` = hanya folder
- pola yang mengandung `/` = terpaku ke folder tempat `.gitignore` itu berada
  (`doc/*.tmp` dari akar tidak menyentuh `sub/doc/y.tmp`)
- negasi `!penting.log`
- **urutan menentukan**: aturan terakhir yang cocok menang; urutannya ditetapkan
  modul (akar dulu, lalu folder yang lebih dangkal, lalu nama) supaya tidak
  bergantung urutan kedatangan daftar berkas

Tidak didukung: brace `{a,b}` - gitignore sendiri juga tidak mendukungnya.
`.gitignore` itu sendiri **tidak** dibuang: ia bahan repo yang berguna.
`.gitignore` yang gagal dibaca dilaporkan sebagai peringatan, bukan diam.

## 5. Berkas rahasia: diblokir, bukan sekadar tidak dibaca

**Aturan keras: nama berkas rahasia tidak pernah masuk daftar.** Bukan "isinya
tidak dibaca" - namanya tidak boleh muncul sama sekali, karena nama
`.env.production` atau `deploy.pem` sudah membocorkan struktur operasi.

Daftar blokirnya **dipinjam, bukan disalin**: `konteksRepo.ts` mengimpor
`POLA_RAHASIA` + `DIR_TERPROTEKSI` dari `src/lib/agentGuard.ts` - daftar yang
sudah dipakai gerbang baca/tulis agen. Dua daftar terpisah akan berbeda pendapat
suatu hari, dan berkas yang diblokir di satu jalur akan lolos di jalur lain.
Keduanya juga **diekspor ulang** dari `konteksRepo.ts` supaya uji dan dokumen
mengambil dari satu sumber.

Aturan evaluasi:

| Sumber | Dicek terhadap | Contoh yang ditolak |
| --- | --- | --- |
| `POLA_RAHASIA` (agentGuard, 22 pola) | **basename** | `.env`/`.env.local`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa`, `known_hosts`, `authorized_keys`, `htpasswd`, `.netrc`, `credentials`, `.pgpass`, `.npmrc`, `.pypirc`, `secret.yaml` |
| `POLA_RAHASIA_TAMBAHAN` (2 pola) | basename | `*.kdbx`, `*.ppk`, `*.age`, `*.ovpn`, `*.p8`, `*.tfstate`, `*.tfvars`, `*.mobileprovision`, `*keychain*` |
| pola inline `POLA_RAHASIA_EFEKTIF` (3 pola) | basename | `secrets.txt`, `credentials.json`, `passwords.ini`, `.git-credentials`, `.dockercfg`, `.aws`, `.gitconfig` |
| `DIR_TERPROTEKSI` (agentGuard) | **segmen jalur** | `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`, `.docker`, `.config/gh`, `.config/gcloud`, `.config/op`, `.git`, `.terraform.d`, … |

Total **27 pola nama** (22 + 2 + 3) dan 35 segmen folder bawaan. `bentukBanding`
melakukan lowercasing untuk perbandingan; **daftar tetap memakai jalur relatif
asli**, jadi huruf besar/kecil di berkas pengguna tidak ikut berubah.

Konsekuensi yang disadari (diuji B6): berkas bernama `credentials.ts` **ikut
ditolak** walaupun mungkin itu kode sumber. Menutup satu berkas asli lebih baik
daripada membocorkan satu kunci. `env.ts` (tanpa titik di depan) lolos.

Selain rahasia, ada `ABAIKAN_SEGMEN` (35 segmen) untuk folder yang tidak pernah
jadi bahan konteks walau `.gitignore`-nya lupa menyebutnya: dependensi
(`node_modules`), VCS (`.git`, `.hg`, `.svn`), hasil build (`dist`, `build`,
`target`, `out`, `obj`), cache framework (`.next`, `.nuxt`, `.svelte-kit`,
`.parcel-cache`, `.cache`, `.turbo`, `.vercel`), dan `venv`/`.venv`/`vendor`.
Dicek per segmen, jadi `src/node_modules` ikut terbuang - memang itu yang
diinginkan untuk npm/pnpm workspace.

## 6. Tanpa jaringan

Modul tidak punya `fetch`, `XMLHttpRequest`, `WebSocket`, maupun `node:http`.
Satu-satunya impor relatif adalah `./agentGuard`, dan impor itu sendiri tidak
punya impor apa pun. Dipaksakan di gerbang (D1-D4): sebelum modul dimuat,
`fetch`/`XMLHttpRequest`/`WebSocket` dan `net.Socket.prototype.connect` serta
`http(s).Agent.prototype.createConnection` diganti fungsi yang melempar - kalau
ada satu saja panggilan jaringan, gate gagal.

## 7. Gerbang uji

```bash
node scripts/cek-konteks-repo.mjs        # exit 0 = lulus; --simpan untuk ringkasan penuh
npx tsc --noEmit -p tsconfig.json
```

Gerbang ini **membundel modul aslinya lewat esbuild** (pola
`scripts/cek-batas-inti.mjs`) dan mengimpor hasilnya - tidak ada salinan logika
yang bisa menyimpang. Pohon berkas tiruannya dibuat di folder sementara
(`TMPDIR`), **bukan di dalam repo**, lalu dihapus di akhir.

| Kelompok | Isi |
| --- | --- |
| A (A1-A12) | `.gitignore`: folder, glob, negasi, pola berakar vs bersarang, `**/generated/`, folder yang dibuang **hanya** oleh gitignore, hitungan konsisten, teks yang diabaikan tidak bocor ke ringkasan |
| B (B1-B6) | rahasia: tidak satu pun nama muncul, jumlah blokir cocok dengan berkas yang dibuat, rincian per jenis, tidak ada kata rahasia di ringkasan, daftar tidak kosong, rahasia bernama kode ikut ditolak |
| C (C1-C12) | batas jumlah (300 dari 402), 3/3 berkas akar bertahan di tengah banjir sumber, berkas > 1 MiB dilewati, anggaran byte, pemotongan anggaran karakter (5.967 dari 6.000), determinisme, plafon pindai 5.000, repo kosong, glob `**`/`[abc]`/negasi, label bahasa, penanda |
| D (D1-D4) | tanpa jaringan: bundel bersih dari penanda jaringan, satu-satunya impor relatif `./agentGuard`, global jaringan dipatch, nol panggilan tertangkap |
| E (E1-E9) | jembatan Tauri: daftar tiruan terpakai, ukuran/mtime dari `fs_stat`, `.gitignore` bersarang, rahasia juga ditolak di jalur ini, jalur **absolut** yang diteruskan ke Rust, batas `batasStat`, kegagalan sumber dilaporkan bukan dilempar |

### Bukti keluaran (dijalankan di repo ini)

```
$ node scripts/cek-konteks-repo.mjs ; echo EXIT=$?
CEK KONTEKS REPO (ZEPH-KONTEKS-REPO)
pohon tiruan: C:\Users\...\Temp\cek-konteks-repo-lmAtfo

A. `.gitignore` dihormati
  ok    A1 folder node_modules/ dibuang                22 berkas tampil
  ok    A3 glob *.log dibuang                          debug.log keluar, penting.log masuk (negasi !)
  ok    A5 pola berakar `doc/*.tmp`                    akar terpaku: sub/doc/y.tmp tetap masuk
  ok    A10 folder dibuang HANYA oleh gitignore        sampah/ dan sampah/dalam/b.txt keluar; diabaikanGitignore=6, diabaikanStruktur=5
  ok    A12 teks ringkasan tidak menyebut yang diabaikan

B. berkas rahasia diblokir (daftar eksplisit)
  ok    B1 tidak ada satu pun berkas rahasia di daftar 16 berkas rahasia diuji, bocor 0
  ok    B2 hitungan blokir sama dengan berkas yang dibuat diblokirRahasia=16, dibuat=16
  ok    B5 daftar blokir eksplisit tidak kosong        agentGuard 22 pola + tambahan = 27 pola efektif
  ok    B6 rahasia bernama source ikut ditolak (sadar) credentials.ts ditolak, env.ts (tanpa titik di depan) lolos

C. batas jumlah, ukuran, dan determinisme
  ok    C1 batas jumlah tampil berlaku                 402 kandidat -> tampil=300 (BATAS_BERKAS_TAMPIL=300), terpotongJumlah=true
  ok    C2 berkas akar tidak tersingkir oleh banjir sumber 3/3 berkas akar muncul di antara 300 berkas
  ok    C3 berkas > 1 MiB dilewati                     huge.bin 2 MiB keluar, dilewatiBesar=1 (ambang 1.048.576 B)
  ok    C4 anggaran byte tampil berlaku                byteTampil=7.340.502 <= 8.388.608, terpotongByte=true (12 berkas @ 1 MiB)
  ok    C6 pemotongan anggaran karakter ringkasan      5.967 char dari 6.000 (terpotongChar=true, 300 berkas)
  ok    C8 batas pindai 5.000 berlaku                  diumpankan 6.000 entri, dipindai=5.000, terpotongPindai=true

D. tanpa jaringan
  ok    D1 bundel tidak memuat pemanggil jaringan      9 penanda diperiksa, cocok: tidak ada
  ok    D2 satu-satunya impor relatif                  impor: ./agentGuard
  ok    D3 global jaringan dipatch sebelum modul dimuat patch aktif: fetch, XMLHttpRequest, WebSocket, net.Socket.connect, http(s).Agent.createConnection
  ok    D4 tidak ada satu pun panggilan jaringan       panggilan tertangkap: 0

E. jembatan Tauri `pindaiKonteksRepo()` (dua tahap: saring dulu, stat kemudian)
  ok    E2 ukuran + mtime terisi dari fs_stat          src/main.ts ukuran=24 (disk 24), mtime=1791929909241
  ok    E4 rahasia juga ditolak di jalur Tauri         16 berkas rahasia, bocor 0
  ok    E6 jalur ABSOLUT yang diteruskan ke Rust       30 panggilan fsRead/fsStat
  ok    E9 kegagalan sumber dilaporkan, tidak dilempar listWorkspaceFiles gagal: workspace tidak ada

ANGKA (diekspor modul, bukan diserahkan ke model)
  BATAS_PINDAI_BERKAS      =        5.000
  BATAS_BERKAS_TAMPIL      =          300
  BATAS_BYTE_TAMPIL        =    8.388.608
  BATAS_UKURAN_BERKAS      =    1.048.576
  BATAS_CHAR_RINGKASAN     =        6.000
  BATAS_GITIGNORE_BYTE     =       65.536
  POLA_RAHASIA_EFEKTIF     =           27
  ABAIKAN_SEGMEN           =           35

HITUNGAN pada pohon tiruan
  berkas diperiksa       55
  tampil                 22
  diblokir rahasia       16  {"rahasia-nama":14,"rahasia-folder":2}
  diabaikan .gitignore   6
  diabaikan bawaan       5
  dilewati > 1.048.576 B   1
  byte tampil            7.340.502 (anggaran 8.388.608)

HASIL: 43 lulus, 0 gagal
EXIT=0
```

`npx tsc --noEmit -p tsconfig.json` pada commit yang sama: **0 galat**, tidak
ada satu pun menyebut `konteksRepo`.

### Bentuk ringkasan yang diterima model

```
Repository context (the folder the user has open - NOT the Zephyr source tree).
- Root: C:/Users/.../Temp/cek-konteks-repo-lmAtfo
- Files: 55 examined, 22 listed here, 16 hidden as secret/protected, 6 ignored by .gitignore, 5 ignored as build/dependency folders, 1 over 1.0 MB.
- Languages (files): TypeScript 4, Markdown 2, ...
- Markers: Node.js, TypeScript
- Layout (files per top folder):
  data (12 files)
  (akar repo) (6 files)
  src (5 files; subfolders: deep)
- Files (path | language | size | last modified) - 22 of 22:
  README.md | Markdown | 34 B | 2026-10-13T22:18:29Z
  src/main.ts | TypeScript | 24 B | 2026-10-13T22:18:29Z
  ...
```

Dua hal yang disengaja pada teks itu: **(a)** kalimat penutup tidak pernah
menyebut nama berkas rahasia (menyebut `.env` di ringkasan sama saja
membocorkannya), dan **(b)** angka `16 hidden` menyebut *jumlah* tanpa nama -
model tahu ada yang disembunyikan tanpa tahu apa.

## 8. Belum tersambung (butuh lane lain)

Modul ini **tidak** dipanggil dari mana pun di aplikasi - itu keputusan sadar,
karena berkas yang harus diubah milik lane lain. Usulan tambalannya ada di
`docs/USULAN-konteks-repo.md` (belum diterapkan). Ringkasnya:

1. `src/lib/aiStore.ts` - satu blok tambahan di `konteksAgent()`, tepat setelah
   blok `proyek`, plus satu nama di `gabung(...)`. Titiknya sudah pas:
   `konteksAgent()` sudah merakit blok yang dikirim ke model, dan blok itu
   diletakkan di bawah header "Project context" - **`systemPrompt.ts` dan
   `resetCacheKonteks()` tidak perlu diubah**.
2. Opsional: cache TTL terikat workspace, kalau satu pemindaian per turn
   dianggap terlalu mahal.
3. Opsional: tool agen `baca_konteks_repo` di `src/lib/zephyrTools/` (butuh lane
   pemilik `zephyrTools` + `subsetAlat`).
