# RANCANGAN — Pane Browser Bawaan & Tool Fetch Web (allowlist domain)

Status: **rancangan + harness bukti** (belum produksi)
Item: `ZEPH-BROWSER-BUILTIN`, `ZEPH-FETCH-WEB`
Tanggal: 2026-10-14
Harness: `scripts/uji-fetch-web-rencana.mjs`

Aturan keras dokumen ini: **kode produk READ-ONLY**. Setiap perubahan kode yang
perlu adalah *usulan patch* di `docs/USULAN-BROWSER-DAN-FETCH.md` (berkas + baris +
teks lama/baru). Dokumen ini tidak menyentuh satu berkas produk pun.

---

## 0. Temuan audit yang jadi titik tolak

Dari `docs/AUDIT-TOOL-BERKAS-2026-10-14.md`:

> `web_fetch` TANPA allowlist per-domain.

Artinya hari ini, sekali model Zeph memutuskan membaca URL dari prompt
(BUKAN dari user), ia boleh mengambil domain mana pun yang lolos lantai
jaringan Rust. Lantai itu sudah bagus (skema, port, IP privat) tetapi **tidak
punya konsep "domain yang boleh"** — satu-satunya penahan adalah persetujuan
tool (mode `web` + approval tulis-jaringan di `catalog.ts:424-429`).

Rancangan ini menambahkan lapisan yang hilang: **allowlist per-domain, default
TOLAK**, dengan lantai jaringan yang sudah ada tetap di bawahnya (defense in
depth — allowlist bukan pengganti lantai, tapi lapisan di atasnya).

---

## 1. Prinsip keamanan (5 aturan, semuanya dibuktikan harness)

| # | Aturan | Kenapa |
|---|--------|--------|
| P1 | **Default TOLAK.** Allowlist kosong = tidak ada domain yang boleh. | Mencegah "lupa mengisi konfigurasi" menjadi lubang. |
| P2 | **Batas byte keras** pada balikan sebelum jadi teks. | `read_to_string` saat ini membaca seluruh bodi ke memori — satu URL 5 GB = OOM app. |
| P3 | **Waktu tunggu** terbatas & dibatasi (bawaan 20 dtk, maks 30 dtk, selaras `web.rs:107`). | Cegah tool menggantung selamanya dan menahan turn model. |
| P4 | **Larangan menyentuh `.env`/API key.** Tool tidak punya param jalur berkas; keluaran disaring pola token; jalur lokal/UNC/drive ditolak. | API key di `.env` Hermes tidak boleh masuk konteks model — lewat argumen maupun lewat pemantulan isi halaman. |
| P5 | **Lantai jaringan tetap berlaku walau allowlist memuat host itu.** | `127.0.0.1` atau `169.254.169.254` di allowlist tetap ditolak. |

P4 punya dua jalur masuk yang harus ditutup keduanya:
1. **Masuk lewat argumen**: model menulis `simpan_ke: ".env"` atau `url: "file:///…"`.
2. **Masuk lewat pantulan**: halaman web yang diambil memuat `sk-…`; kalau diteruskan apa adanya ke konteks model, kunci itu bocor.

Harnes membuktikan kedua jalur (kasus A8–A12, A15–A16).

---

## 2. Keadaan kode sekarang (titik sambung NYATA)

Semua nomor baris di bawah diverifikasi terhadap berkas di branch ini.

### 2a. Pane browser bawaan — SUDAH ADA, tapi tanpa allowlist

| Titik sambung | Berkas:baris | Keadaan |
|---|---|---|
| Peta pane | `src-tauri/src/browser_pane.rs:19` (`PANES`) | ADA — pane per-label `HashMap` |
| Buka pane | `src-tauri/src/browser_pane.rs:42-145` (`browser_pane_open`) | ADA — cek awalan `http` (`:53-57`) |
| Navigasi | `src-tauri/src/browser_pane.rs:196-221` (`browser_pane_nav`) | ADA — tanpa allowlist |
| Eval di pane | `src-tauri/src/browser_pane.rs:243-282` (`browser_pane_eval`) | ADA — jalur kuat ke DOM, tanpa batas domain |
| Binding TS | `src/lib/commands.ts:1438` (`browserPaneNav`), `:1441` (`browserPaneEval`), `:1467` (`browserPaneCursor`) | ADA |
| Tool `browser_open`/`browser_read` | `src/lib/zephyrTools/web.ts:375`, `:506`; `src/lib/zephyrTools/catalog.ts:618-619` | ADA — dikirim ke model SELALU |
| Unduh dari browser | `src-tauri/src/browser.rs:20-86` (`browser_download_url`) | ADA — batas 100 MB (`:9`), `max_redirects(0)` (`:44`) |

**Kesimpulan:** item "pane browser bawaan Zephyr" sebagian besar **sudah dibangun**.
Yang belum ada adalah **pagar domain**: `browser_pane_open`/`nav` menerima URL apa
pun yang berawalan `http`. Jadi pekerjaan ZEPH-BROWSER-BUILTIN bukan "bikin pane",
melainkan **menutup pane dengan allowlist** + menaikkan perilaku aman yang sudah ada
di `browser.rs` (batas unduh, tanpa redirect) ke `browser_pane.rs`.

### 2b. Tool fetch web — ADA, tanpa allowlist & tanpa batas byte

| Titik sambung | Berkas:baris | Keadaan |
|---|---|---|
| Lantai jaringan (Rust) | `src-tauri/src/web.rs:18` (`validate_outbound_url`) | ADA |
| — skema http/https | `src-tauri/src/web.rs:23-30` (pesan di `:27`) | ADA |
| — host wajib ter-parse | `src-tauri/src/web.rs:31-33` | ADA |
| — port 80/443 | `src-tauri/src/web.rs:34-45` (cek di `:41`) | ADA |
| — blokir privat/loopback/link-local | `src-tauri/src/web.rs:46-71` (`is_blocked`) | ADA |
| — resolusi DNS + tolak alamat privat | `src-tauri/src/web.rs:78-102` (`to_socket_addrs`) | ADA |
| Baca bodi | `src-tauri/src/web.rs:141-143` (`read_to_string()`) | **CELAH P2** — tanpa batas byte |
| Redirect | `src-tauri/src/web.rs:123` (`max_redirects(0)`) | ADA — bagus |
| Command `web_fetch` | `src-tauri/src/web.rs:240-256` | ADA — `clamp(500,60_000)` di `:242` (batas **karakter**, bukan byte) |
| Spec tool | `src/lib/zephyrTools/web.ts:347-372` (`web_fetch`) | ADA — **tanpa param allowlist** (CELAH P1) |
| Registrasi katalog | `src/lib/zephyrTools/catalog.ts:221`, `:620` | ADA |
| Mode & approval | `src/lib/zephyrTools/catalog.ts:343-349` (`WEB_MATI`), `:424-429`, `:458-463` | ADA |

**Kesimpulan:** ZEPH-FETCH-WEB sudah punya *transport* yang aman-ish, tapi belum
punya (a) allowlist domain dan (b) batas byte. Dua hal itu yang ditambahkan.

### 2c. Guard rahasia yang sudah ada — dipakai ulang, bukan dibikin baru

| Simbol | Berkas:baris | Dipakai untuk |
|---|---|---|
| `POLA_RAHASIA` | `src/lib/agentGuard.ts:80-103` | Pola nama berkas rahasia (`.env`, `*.pem`, `id_rsa`, …) |
| `DIR_TERPROTEKSI` | `src/lib/agentGuard.ts:115-141` | `/.git`, `/.ssh`, `/.aws`, `/etc`, … |
| `periksaBaca` / `periksaTulis` | `src/lib/agentGuard.ts:180`, `:214` | Gerbang baca/tulis berkas |
| `bentukBanding` | `src/lib/agentGuard.ts:44` | Normalisasi jalur lintas-platform |

Rancangan **tidak** membuat pola rahasia baru; ia mengimpor `POLA_RAHASIA` untuk
memvalidasi nilai `simpan_ke` (bila kelak ditambah) dan memakai semantik
`bentukBanding` untuk jalur lokal.

### 2d. Preseden allowlist yang sudah ada

`src/lib/settingsStore.ts:66-70` mencatat bahwa **command allow-list** sudah
ada dan kini tinggal di **Chat Settings**. Artinya pola "allowlist yang
disetujui user, disimpan di settings, dilihat model" **sudah lazim di Zephyr**.
Rancangan allowlist domain menumpang pola yang sama, bukan mengarang UI baru.

---

## 3. Rancangan (a) — ZEPH-BROWSER-BUILTIN

### 3.1 Bentuk

Pane browser **sudah ada** (`browser_pane.rs`). Yang diubah: ia menerima
*kebijakan domain* dan menegakkannya di tiga pintu masuk.

```
                       allowlist domain (settings: security)
                                  │
   browser_pane_open ──┐          │
   browser_pane_nav  ──┼──► periksa_domain(url) ──► lantai jaringan web.rs::validate_outbound_url
   browser_pane_eval ──┘          │                        │
                             tolak kalau bukan            tolak skema/port/privat
                             http(s) + allowlist
```

### 3.2 Aturan

- **Pintu masuk**: `browser_pane_open`, `browser_pane_nav`, dan setiap navigasi
  yang dipicu `browser_pane_eval` (mis. `location.href = …`) melewati
  `periksa_domain`.
- **Sumber allowlist**: daftar domain di Settings §security
  (`settingsStore.ts:24`); cara menumpang pola command allow-list yang sudah
  ada (`settingsStore.ts:66-70`).
- **Mode bawaan**: pane browser bawaan = **non-aktif** sampai user mengisi
  allowlist. Tidak ada allowlist = pane boleh dibuka tetapi hanya untuk URL di
  daftar kosong → praktis tertutup. (Selaras P1.)
- **Tidak ada allowlist "bintang"**: entri `*` DITOLAK oleh validator konfigurasi;
  wildcard hanya boleh dalam bentuk subdomain (`*.contoh.com` → tetap dicek
  sebagai akhiran titik). Mencegah "izinkan semua" yang tidak sengaja.

### 3.3 Titik sambung yang harus berubah (usul, bukan edit)

| Berkas:baris | Perubahan yang diusulkan |
|---|---|
| `src-tauri/src/browser_pane.rs:52` | Setelah cek awalan `http`, panggil `validate_outbound_url` (yang sudah ada) + `periksa_domain` terhadap allowlist. |
| `src-tauri/src/browser_pane.rs:196-221` | `browser_pane_nav` melewati gerbang yang sama. |
| `src-tauri/src/browser_pane.rs:243-282` | `browser_pane_eval` menolak `location` assignment ke domain luar allowlist (paling sulit — lihat §5 BUTUH APP). |
| `src/lib/zephyrTools/web.ts:375,506` | Deskripsi tool `browser_open`/`browser_read` menyebut allowlist, supaya model tahu batasnya sebelum memanggil. |
| `src/lib/zephyrTools/catalog.ts:618-619` | Pertimbangkan memindahkan `browser_*` dari `TOOL_DIKIRIM_SELALU` ke grup mode `web` (biar tidak selalu di konteks). |

---

## 4. Rancangan (b) — ZEPH-FETCH-WEB

### 4.1 Parameter baru pada `web_fetch`

| Param | Tipe | Bawaan | Aturan |
|---|---|---|---|
| `url` | string | — | WAJIB. http/https, domain ∈ allowlist. |
| `izinkan_domain` | string[] | dari settings | Opsional; bila ada HARUS ⊆ allowlist settings (tidak bisa memperluas). |
| `batas_byte` | number | 2 MB | Dipangkas ke maks 8 MB (P2). |
| `waktu_tunggu_ms` | number | 20000 | Dipangkas ke maks 30000 (P3). |
| `format` | `teks`\|`html`\|`json` | `teks` | Seperti sekarang. |

### 4.2 Alur aman

```
url ─► periksa_domain(host ∈ allowlist)      [P1, P5]
    ─► validate_outbound_url (skema/port/privat)  [web.rs:18]
    ─► ambil dengan batas byte + timeout       [P2, P3 → web.rs:141-143 diubah]
    ─► potong ke batas BYTE (bukan karakter)   [P2]
    ─► saringRahasia (sk-/ghp_/AKIA/JWT/…)     [P4 jalur pantulan]
    ─► kirim ke model
```

### 4.3 Redirect

`web.rs:123` sudah `max_redirects(0)` — tidak mengikuti redirect. Rancangan
mempertahankan ini DAN menambahkan pemeriksaan ulang per-hop bila kelak redirect
diizinkan: **setiap hop wajib lolos `periksa_domain`**. Kasus A17–A19 membuktikan
bahwa redirect ke domain luar (dan rantai > 5) ditolak.

### 4.4 Larangan `.env`/API key (P4)

- Tool **tidak punya** param jalur berkas (`simpan_ke`) pada versi ini — supaya
  tidak ada permukaan untuk menulis `.env`.
- Harnes membuktikan jalur lokal (`C:\…`, `/etc/…`, `\\server\…`, `~`) dan nama
  berkas rahasia (`.env`, `*.pem`, `*.key`) ditolak (kasus A8–A12).
- Keluaran disaring: pola `sk-…`, `ghp_…`, `AKIA…`, JWT, `glpat-…`, `xox…`
  diganti `[DISENSOR]` (kasus A15–A16).
- **Catatan penting:** kalau kelak `simpan_ke` ditambahkan, ia WAJIB lewat
  `periksaTulis` (`agentGuard.ts:214`), bukan cek buatan sendiri.

---

## 5. Peta celah: rancangan vs kode (yang jadi isi USULAN)

| ID | Celah | Bukti | Perbaikan (USULAN) | Butuh app? |
|----|-------|-------|--------------------|-----------|
| C1 | `web_fetch` tanpa allowlist domain | `web.ts:347-372` | Patch spec + gerbang Rust | tidak (spec) / ya (Rust) |
| C2 | Bodi dibaca tanpa batas byte | `web.rs:141-143` | Batasi `read_to_string` / pakai `take` | **ya** (perilaku runtime) |
| C3 | Batas saat ini **karakter**, bukan byte | `web.rs:242` (`clamp(500,60_000)`) | Tambah batas byte terpisah | tidak |
| C4 | `browser_pane_open/nav` tanpa allowlist | `browser_pane.rs:52,196` | Gerbang domain | **ya** |
| C5 | `browser_pane_eval` bisa navigasi bebas | `browser_pane.rs:243-282` | Cek `location` assignment | **ya** (sulit, lihat bawah) |
| C6 | Tool `browser_*` selalu di konteks | `catalog.ts:618-619` | Pindah ke grup mode `web` | tidak |
| C7 | Tidak ada `simpan_ke` (fitur belum ada) | — | Bila ditambah, lewat `periksaTulis` | tidak |
| C8 | Saringan token baru ada di harness, bukan kode | — | Implementasi `saringRahasia` di `web.ts` | tidak |

**C5 BUTUH APP.** Menegakkan allowlist pada `browser_pane_eval` tidak bisa
dibuktikan tanpa app hidup: panggilan `eval` menjalankan JS di dalam webview, dan
mendeteksi `location.href = 'https://jahat.com'` secara andal butuh menangkap
navigasi pada level webview (event `navigation`, `NewWindowRequested`) — bukan
regex pada string. Klaim di dokumen ini hanya sebatas: *gerbang di `open`/`nav`
bisa diuji lewat instruction handler Rust; gerbang di `eval` perlu harness
in-app.* Ditulis apa adanya, tidak dikarang.

---

## 6. Bukti (angka nyata)

Perintah & keluaran lengkap ada di `docs/USULAN-BROWSER-DAN-FETCH.md` §Bukti.
Ringkas:

- `node scripts/uji-fetch-web-rencana.mjs` → **LULUS 27/27**, `jaringan nyata = 0
  (fetch 0, websocket 0, net 0, http 0, dns 0)`, exit 0.
- `npx tsc --noEmit` → lihat §Bukti (hasil nyata, tidak dikarang).

Bagian (B) harness membaca berkas produk asli dan mencetak `CELAH` dengan nomor
baris — itu sumber tabel §5.

---

## 7. Sisa / utang (apa adanya)

1. **C2, C4, C5 menunggu app hidup.** Harness ini node-only; ia membuktikan
   *aturan*, bukan *penegakan runtime*. Yang belum: uji in-app untuk
   `browser_pane_*` dan batas byte `read_to_string`.
2. **Allowlist belum ada di settings.** Usulan menumpang pola command allow-list
   (`settingsStore.ts:66-70`), tetapi bentuk UI-nya belum dirancang di sini.
3. **`browser_pane_eval` adalah permukaan terkuat** (bisa menjalankan
   JS sembarang di DOM). Rancangan ini satu lapis di atasnya; pagar sebenarnya
   mungkin harus "eval hanya di origin yang diizinkan" — perlu keputusan desain
   tersendiri.
4. Subdomain vs wildcard: rancangan memilih pencocokan akhiran-label (aman
   terhadap `contoh.com.jahat.com`), membuktikan di kasus A5. Wildcard `*`
   sengaja ditolak.
