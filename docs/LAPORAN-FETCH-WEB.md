# Laporan: AMBIL-WEB — tool internal untuk mengambil konten web (tanpa `curl`)

Item kanonik **ZEPH-FETCH-WEB**. Cabang: `feat/ai-panel-vscode-layout`. Tanggal: 2026-10-14.

Tujuan item: **satu rumah internal** yang benar-benar mengambil konten web — https-only,
host dibatasi izin/allowlist (pola `izin_unduh` di `src-tauri/src/ext_pkg.rs`),
localhost/internal **ditolak tanpa izin eksplisit**, keluaran **dipotong pada batas byte**,
JSON **dibaca sebagai data**, **nol shell**, ada **batas ukuran + waktu**, hasil bisa
**ditulis ke berkas** — supaya model tidak disuruh memakai `curl` di shell.

Lingkup yang dikerjakan: **modul produk + harness + dokumen**. Berkas bersama
(`catalog.ts`, `web.ts`, Rust) **tidak disentuh** — baris registrasi & UI izin ada di
`docs/USULAN-FETCH-WEB.md`.

---

## 1. Vonis

**LULUS.** Keluaran nyata: harness **32/32 lulus, exit 0**; `npx tsc --noEmit` **0 galat**
(berkas modul **dan** seluruh repo); dua kali jalan berturut menghasilkan keluaran identik
setelah penanda port/waktu dinormalkan (**diff kosong**).

| Ukuran | Angka nyata |
| --- | --- |
| Kasus uji lulus | **32 / 32** (exit 0) |
| `npx tsc --noEmit` | **0 galat** (W31 per-berkas = 0; W32 seluruh repo = 0) |
| Determinisme | 2 jalan, 37 baris keluaran masing-masing, **diff kosong** setelah normalisasi port/ms |
| Modul produk | `src/lib/zephyrTools/ambilWeb.ts` — **735 baris**, **38 ekspor** |
| Harness | `scripts/uji-fetch-web.mjs` — **541 baris**, 32 kasus (syarat item: min. 16) |
| Panggilan transport selama uji | 18 (semuanya ke loopback / disuntik) |
| Koneksi jaringan nyata | **3**, semuanya ke `127.0.0.1` — **0 ke jaringan publik** |
| Panggilan shell | **0** |
| Upaya baca `.env`/kunci | **0** |

Satu catatan kejujuran yang penting (bukan gagal, tapi mengubah bentuk jawabannya):
**katalog tool Zephyr SUDAH punya `web_fetch`**, dan sebuah lane paralel sudah memasang
gerbang izin+allowlist-nya sendiri lewat `kebijakanIsiWeb.ts` (lihat §2 & §8). Jadi
pekerjaan ini bukan "menambah kemampuan yang belum ada", melainkan **menyediakan rumah
alternatif yang lebih ketat + teruji**, dan **integrasinya masih berupa usulan**.

---

## 2. Langkah (0): apa adanya — apakah katalog sudah punya tool fetch?

**Ya, sudah.** Hasil pencarian nyata:

| Bukti | Berkas : baris | Isi |
| --- | --- | --- |
| Baris katalog | `src/lib/zephyrTools/catalog.ts:221` | `['web_fetch', 'Web', 'net', false, 'Ambil dan bersihkan satu halaman web'],` |
| Baris katalog | `src/lib/zephyrTools/catalog.ts:220` | `['web_search', 'Web', 'net', false, 'Cari di internet'],` |
| Spec tool | `src/lib/zephyrTools/web.ts:410` | `name: 'web_fetch'` |
| Badan run | `src/lib/zephyrTools/web.ts:421-438` | sudah memanggil `ambilIsiWeb(url, kb, …)` → `cmd.webFetch` |
| Perintah Tauri | `src/lib/commands.ts` (`webFetch`) → `src-tauri/src/web.rs` | `fn ambil(url)` di `web.rs:117` |
| Lantai Rust | `src-tauri/src/web.rs:18` | `pub fn validate_outbound_url(url: &str)`: hanya http/https, port 80/443, tolak loopback/privat/link-local |
| Timeout Rust | `src-tauri/src/web.rs:107` | `const TIMEOUT: Duration = Duration::from_secs(20);` |
| Redirect Rust | `src-tauri/src/web.rs:123` | `.max_redirects(0)` — Rust **tidak** mengikuti redirect sama sekali |
| Pola allowlist | `src-tauri/src/ext_pkg.rs:1643` | `pub const IZIN_UNDUH: &[&str] = &["open-vsx.org", "www.open-vsx.org"];` |
| Fungsi allowlist | `src-tauri/src/ext_pkg.rs:1649` | `pub fn izin_unduh(url: &str) -> ZResult<()>` → `if !url.starts_with("https://") \|\| !IZIN_UNDUH.contains(&host.as_str())` |
| Uji allowlist itu | `src-tauri/src/ext_pkg.rs:2134,2140,2153` | https-saja diterima; host luar allowlist ditolak; http/ftp ditolak |

> Koreksi kecil atas rujukan item: pola allowlist unduh itu ada di **`ext_pkg.rs:1643`
> (`IZIN_UNDUH`) / `:1649` (`izin_unduh`)**, bukan ~baris 1152. Area ~1152 adalah logika
> install, bukan allowlist host.

### Tiga "rumah" yang kini ada untuk kemampuan yang sama

| Rumah | Berkas | Apa yang ditegakkan | Sudah dipakai produk? |
| --- | --- | --- | --- |
| Gerbang isi-web (lane paralel) | `src/lib/zephyrTools/kebijakanIsiWeb.ts` (≈16 KB) | izin opt-in `izinIsiWeb`, **allowlist host**, tolak IP privat/localhost/`.local`, batas byte 2 MB (maks 8 MB), hop redirect ≤ 5, batas karakter, potong keluaran, **redaksi** | **Ya** — diimpor `web.ts:20-30` dan dipanggil di `web.ts:429` (kunci setelannya `allowlistWeb`/`izinIsiWeb`, dibaca `kebijakanIsiWeb.ts:113,117` — **belum dideklarasikan** di `types.ts`) | **Ya** |
| Lantai Rust | `src-tauri/src/web.rs` | skema http/https, port 80/443, tolak loopback/privat/link-local, timeout 20 s, `max_redirects(0)` | **Ya** — dipanggil `web.rs:119` |
| **AMBIL-WEB (ini)** | `src/lib/zephyrTools/ambilWeb.ts` (735 baris) | **https-only** (http hanya dengan izin lokal eksplisit), **allowlist default-TOLAK**, tolak loopback/privat/link-local/ULA **dengan jalur izin eksplisit**, potong **byte**, **JSON → `data`**, timeout, izin ulang **tiap hop redirect**, **tulis ke berkas** dengan pagar jalur rahasia, **nol impor** | **Belum** — integrasi = usulan |

Perbedaan yang nyata (bukan kosmetik), dari inspeksi berkas:

- `kebijakanIsiWeb.ts` **mengizinkan `http:`** (`kebijakanIsiWeb.ts:210,219`: lolos bila skema
  `http` **atau** `https`). `ambilWeb.ts` **menolak http** kecuali izin lokal eksplisit.
- `kebijakanIsiWeb.ts` **menolak localhost tanpa jalur izin** (`:226` `nama-lokal:`).
  `ambilWeb.ts` menolaknya **juga**, tetapi menyediakan **izin eksplisit** (dibuktikan W08/W24).
- **JSON sebagai `data`** dan **tulis ke berkas** hanya ada di `ambilWeb.ts`.

---

## 3. Berkas

| Berkas | Status | Isi |
| --- | --- | --- |
| `src/lib/zephyrTools/ambilWeb.ts` | **BARU** | Rumah AMBIL-WEB: gerbang URL, potong byte, JSON→data, transport bersuntik, tulis berkas. 38 ekspor, 0 impor |
| `scripts/uji-fetch-web.mjs` | **BARU** | Harness node-only, 32 kasus, server `node:http` di `127.0.0.1:0` |
| `docs/LAPORAN-FETCH-WEB.md` | **BARU** | Berkas ini |
| `docs/USULAN-FETCH-WEB.md` | **BARU** | Registrasi tool + UI izin + sisi Rust (berkas+baris+teks lama/baru) |

Tidak ada berkas bersama yang disentuh: `catalog.ts`, `web.ts`, `kebijakanIsiWeb.ts`,
`types.ts`, `store.ts`, dan `src-tauri/**` **tidak diubah**.

---

## 4. Keluaran nyata harness (apa adanya)

`node scripts/uji-fetch-web.mjs` → `EXIT=0`:

```
LULUS  W01  host luar izin ditolak, transport 0x (0) — host di luar allowlist: uji.contoh.org
LULUS  W02  allowlist kosong = tolak semua, transport 0x (0) — allowlist host kosong - default menolak
LULUS  W03  trik akhiran "contoh.org.jahat.com" ditolak — host di luar allowlist: uji.contoh.org.jahat.com
LULUS  W04  http (bukan https) ditolak — hanya https yang diizinkan (http: butuh izin lokal eksplisit)
LULUS  W05  10/10 alamat lokal/privat/link-local ditolak tanpa izin (10/10); contoh — host lokal/privat/link-local - butuh izin eksplisit
LULUS  W06  skema/bentuk terlarang ditolak: semua 6
LULUS  W07  port tak lazim ditolak — port 8443 di luar izin
LULUS  W08  host lokal butuh izin eksplisit — tanpa: hanya https yang diizinkan (http: butuh izin lokal eksplisit) | dengan: ok=true
LULUS  W09  isi 50.000 byte dipotong di batas byte — terpotong=true byte=4000/50000 keluaran=4000 char
LULUS  W10  potong 1001 byte dari 3000x'é' menghasilkan 1000 byte utuh tanpa U+FFFD (char=500)
LULUS  W11  batas karakter 200 berlaku, penanda ada — char=249, dipotong=true
LULUS  W12  JSON terbaca sebagai DATA: data.total=number (42), data.items[0].n=number, dan isi bisa di-JSON.parse ulang
LULUS  W13  isi bukan JSON tidak dikarang jadi data — json=false data=null
LULUS  W14  content-type JSON tapi isi rusak: tidak ada data palsu — sebab="content-type JSON tetapi isi tidak bisa dibaca sebagai JSON"
LULUS  W15  JSON terpotong tidak menghasilkan data separuh — terpotong=true sebab="isi terpotong di tengah JSON - data tidak dibaca"
LULUS  W16  token di dalam JSON disensor dan JSON tetap sah — data.kunci="[DISENSOR]" (parse ulang object ok)
LULUS  W17  batas dijepit ke plafon: byte<=8388608 waktu<=30000ms karakter<=15000
LULUS  W18  transport yang menggantung dipotong modul sendiri setelah 158 ms (bawaan 20000 ms); sebab="waktu tunggu habis (150 ms)"
LULUS  W19  redirect ke host luar izin ditolak DI HOP-nya (dilalui=["https://uji.contoh.org/putar-luar"]) — host di luar allowlist: luar.jahat.com
LULUS  W20  rantai redirect > 5 hop ditolak — terlalu banyak redirect (lebih dari 5)
LULUS  W21  redirect yang sah diterima, tiap hop dicatat — dilalui=["https://uji.contoh.org/putar-izin","https://uji.contoh.org/data.json"]
LULUS  W22  transport yang melempar dilaporkan, tidak menjatuhkan pemanggil — transport gagal: kabel putus
LULUS  W23  server nyata TIDAK dihubungi tanpa izin (0 permintaan) — hanya https yang diizinkan (http: butuh izin lokal eksplisit)
LULUS  W24  izin eksplisit menembus loopback: body nyata terbaca (total=7), header permintaan=["accept","user-agent","host","connection"], tanpa kredensial
LULUS  W25  transport hanya menerima maksByte,waktuMs — tidak ada slot kredensial
LULUS  W26  hasil ditulis ke berkas nyata (40 byte, dibaca ulang identik) & 8/8 jalur rahasia ditolak
LULUS  W27  determinisme: 3 panggilan identik menghasilkan JSON identik (499 byte) setelah durasiMs dinolkan
LULUS  W28  nol shell (0 panggilan child_process) & modul tanpa impor; pola terlarang: tidak ada
LULUS  W29  nol jaringan publik (0), hanya loopback (3 koneksi) — bersih
LULUS  W30  nol upaya membaca .env/kunci (0) setelah semua kasus — jejak: bersih
LULUS  W31  src/lib/zephyrTools/ambilWeb.ts: 0 galat tsc
LULUS  W32  seluruh repo: npx tsc --noEmit -> 0 galat

  catatan: transport jaringan disuntik; satu server node:http di 127.0.0.1:55745
  catatan: 18 panggilan transport tercatat selama uji

== 32/32 lulus ==
```

Pemetaan ke syarat item:

| Syarat item | Kasus | Sebab penolakan nyata (dari keluaran) |
| --- | --- | --- |
| host di luar izin DITOLAK | W01, W03, W23 | `host di luar allowlist: uji.contoh.org` |
| http (bukan https) DITOLAK | W04, W06 | `hanya https yang diizinkan (http: butuh izin lokal eksplisit)` |
| localhost/127.0.0.1/169.254 DITOLAK tanpa izin | W05 (10/10), W08, W23 | `host lokal/privat/link-local - butuh izin eksplisit` |
| keluaran terbukti terpotong pada batas ukuran | W09, W10, W11, W17 | `terpotong=true byte=4000/50000`; `1000 byte utuh tanpa U+FFFD` |
| JSON nyata terbaca sebagai data | W12 (dan negatif: W13–W16) | `data.total=number (42)` |
| batas waktu berlaku | W18 | `waktu tunggu habis (150 ms)` — modul sendiri, bukan transport |
| nol pemanggilan shell | W28 | `0 panggilan child_process` |
| determinisme | W27 | `3 panggilan identik … JSON identik (499 byte)` |
| tidak ada jalur baca `.env`/API key | W26 (pagar jalur simpan), W30 | `8/8 jalur rahasia ditolak`; `0 upaya membaca .env` |
| server lokal, bukan jaringan publik | W23, W24, W29 | `0` ke publik, `3` koneksi loopback |

---

## 5. Bukti `tsc`

```
$ npx tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0
---BARIS_GALAT---
0
```

Tercatat juga di dalam harness (W31/W32) supaya satu perintah membuktikan keduanya:
`W31 … ambilWeb.ts: 0 galat tsc` dan `W32 seluruh repo: npx tsc --noEmit -> 0 galat`.

---

## 6. Determinisme

Dua jalan berturut-turut, masing-masing 37 baris, `EXIT=0`. Setelah penanda port
(`:55745` → `:PORT`) dan durasi dinormalkan:

```
$ diff <(norm run1) <(norm run2)
DIFF_KOSONG=deterministik
```

Tidak ada jaringan publik yang dipakai, jadi hasil tidak bergantung cuaca internet.
`W27` juga menguji hal yang sama dari dalam modul: 3 panggilan identik → JSON identik
setelah `durasiMs` dinolkan.

---

## 7. Celah & keterbatasan (jujur)

1. **Modul ini belum dipakai produk.** `web_fetch.run` (`web.ts:421-438`) masih memakai
   gerbang `kebijakanIsiWeb.ts`. Tidak ada berkas bersama yang saya sentuh; integrasi ada
   di usulan. Sampai itu dipasang, AMBIL-WEB adalah **rumah yang benar tapi belum berpenghuni**.
2. **Rumah ganda.** Tiga implementasi menegakkan aturan yang tumpang tindih (§2). Ini utang
   yang harus diputus dengan **satu** keputusan (opsi di `docs/USULAN-FETCH-WEB.md` §U0), bukan
   dibiarkan tumbuh.
3. **Transport bersuntik untuk kasus gerbang.** Kasus izin (W01–W23) memakai transport
   suntikan — itu disengaja supaya uji deterministik dan tidak menyentuh jaringan. Koneksi
   nyata hanya untuk loopback (W24) dan penghitungnya (`W29`). Artinya "tidak ada paket keluar
   ke host terlarang" dibuktikan oleh **penghitung panggilan transport = 0**, bukan oleh
   tangkapan paket.
4. **Pagar jaringan uji punya lubang yang diketahui.** `Agent.prototype.createConnection`
   disalin dari `net.createConnection` saat Node dimuat, jadi pagar tingkat URL/host tidak
   menangkap jalur itu. Bukti utama "nol jaringan publik" karena itu **W28: modul tidak
   mengimpor apa pun** (tidak ada `http`/`https`/`net` untuk dipakai) — bukan pagar itu sendiri.
5. **Sisi Rust belum punya allowlist untuk fetch.** `validate_outbound_url` (`web.rs:18`)
   hanya lantai (skema/port/IP lokal); host publik apa pun lolos. Allowlist gaya `IZIN_UNDUH`
   belum ada di sana → usulan U6 (butuh app hidup untuk diuji).
6. **W17 memakai plafon 8 MB / 30 000 ms / 15 000 karakter** milik modul; nilai bawaan
   `kebijakanIsiWeb.ts` berbeda (2 MB / 20 000 karakter). Bila dua rumah digabung, angka-angka
   ini harus disatukan — jangan sampai dua batas berlaku diam-diam.
7. `tulisHasilAmbilWeb` menerima fungsi `tulis` yang disuntik, jadi bukti "bisa ditulis ke
   berkas" (W26) memakai `fs.writeFileSync` nyata di direktori sementara harness; jalur
   perintah Tauri untuk menulis dari dalam app belum ada → usulan U4.
8. **Kunci setelan yang dibaca gerbang tidak dideklarasikan.** `kebijakanDariSetelan()`
   (`kebijakanIsiWeb.ts:111-122`) membaca empat kunci — `allowlistWeb`, `izinIsiWeb`,
   `batasByteWeb`, `batasKarakterWeb` — yang **tidak ada satu pun** di `src/lib/types.ts`
   (hasil pencarian: `allowlistWeb` hanya muncul di `kebijakanIsiWeb.ts:113-114`). Efeknya
   fail-closed (aman), tetapi setelan itu tak terlihat di tipe setelan dan tak punya UI;
   artinya orang berikutnya yang lewat bisa menamai kuncinya `allowHosts` dan menciptakan
   **kunci keempat untuk hal yang sama**. Usulan U5 karena itu memakai nama yang sudah ada,
   bukan mengarang yang baru.
