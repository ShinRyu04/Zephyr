# USULAN — AMBIL-WEB: registrasi tool, gerbang izin, dan UI allowlist host

Dokumen ini **hanya berisi usulan**. Tidak ada berkas bersama yang disentuh oleh
pekerjaan ZEPH-FETCH-WEB. Format tiap usulan: **berkas + rentang baris + teks lama
(persis dari berkas) + teks baru**, lalu catatan apakah butuh app hidup untuk diuji.

Semua teks "lama" di bawah disalin dari cabang `feat/ai-panel-vscode-layout` pada
2026-10-14 dan sudah dicek ulang terhadap berkas saat itu juga.

> **Baca §U0 lebih dulu.** Ada usulan lama `docs/USULAN-BROWSER-DAN-FETCH.md` (U1–U7) yang
> menargetkan berkas yang sama, dan sebuah lane paralel sudah memasang gerbangnya sendiri
> (`kebijakanIsiWeb.ts`, sudah diimpor `web.ts`). Menerapkan U1–U6 di bawah **tanpa** §U0
> berarti menumpuk gerbang ketiga.

Ringkasan butuh-app:

| Usulan | Berkas | Butuh app hidup? |
| --- | --- | --- |
| U0 putusan rumah (jangan tambah gerbang ketiga) | — | tidak |
| U1 registrasi tool di katalog | `src/lib/zephyrTools/catalog.ts` | tidak (bisa diuji node) |
| U2 `web_fetch` memakai `ambilWeb()` (satu pintu, 6 aturan) | `src/lib/zephyrTools/web.ts` | tidak |
| U3 JSON nyata sampai ke model sebagai data | `src/lib/zephyrTools/web.ts` | tidak |
| U4 tulis hasil ke berkas (perintah Tauri + pagar jalur) | `src-tauri/src/web.rs`, `src/lib/commands.ts` | **ya** |
| U4b `web_fetch` mengembalikan status/header (hop redirect asli) | `src-tauri/src/web.rs` | **ya** |
| U5 allowlist host di setelan + UI | `src/lib/types.ts`, `src/components/settings/HostPermissions.tsx` | tidak (tipe) / ya (UI) |
| U6 allowlist host di sisi Rust | `src-tauri/src/web.rs`, `src-tauri/src/ext_pkg.rs` (pola) | **ya** |
| U7 rekonsiliasi dengan usulan lama | `docs/USULAN-BROWSER-DAN-FETCH.md` | tidak |

---

## U0 — Putusan rumah: satu gerbang, bukan tiga

Sekarang ada tiga penegak aturan untuk satu kemampuan (§2 laporan):

| Rumah | Berkas | Menegakkan |
| --- | --- | --- |
| A. gerbang isi-web | `kebijakanIsiWeb.ts` (sudah diimpor `web.ts:20-30`) | izin opt-in, allowlist host, tolak IP privat/localhost, batas byte, hop redirect, redaksi |
| B. lantai Rust | `web.rs:18` `validate_outbound_url` | skema http/https, port 80/443, tolak loopback/privat/link-local, timeout |
| C. AMBIL-WEB | `ambilWeb.ts` (735 baris, 32/32 lulus) | **https-only**, allowlist default-TOLAK, tolak lokal **dengan jalur izin eksplisit**, potong byte, **JSON→data**, timeout modul, izin per-hop, **tulis berkas + pagar jalur**, nol impor |

**Opsi A (disarankan — perubahan paling kecil).** Pertahankan `kebijakanIsiWeb.ts` sebagai
pintu tunggal `web_fetch`, dan **pindahkan 4 hal yang hanya ada di C** ke dalamnya:
https-only (kecuali izin lokal eksplisit), jalur izin eksplisit untuk host lokal,
JSON→`data`, dan tulis-ke-berkas + pagar jalur rahasia. `ambilWeb.ts` lalu **tetap tinggal
sebagai rumah uji** (harness 32 kasus) — atau dihapus setelah keempatnya pindah.

**Opsi B.** Jadikan `ambilWeb.ts` gerbangnya — `ambilWeb.ts` sudah punya **satu pintu**
yang menegakkan keenam aturan sekaligus (`ambilWeb(permintaan, transport)`, dengan
`periksaUrlAmbilWeb` dipanggil ulang **tiap hop** di `ambilWeb.ts:607-609`), jadi `web.ts`
tinggal memanggilnya dan membuang `ambilIsiWeb` dari jalur `web_fetch`. Pertahankan
**redaksi** `kebijakanIsiWeb.ts` (`saringKeModel`) karena `ambilWeb.ts` hanya punya
penyensor pola rahasia (`saringRahasiaWeb`), bukan redaksi sadar-konteks.

Keduanya sama-sama sah; yang tidak sah adalah membiarkan ketiganya hidup dengan **batas
angka yang berbeda** (C: 8 MB/30 s/15 000 char vs A: 2 MB/20 000 char) tanpa satu pun
dinyatakan menang. U1–U6 di bawah ditulis untuk **Opsi B**; kalau memilih Opsi A,
U2/U3 berubah menjadi "pindahkan fungsi dari `ambilWeb.ts` ke `kebijakanIsiWeb.ts`".

---

## U1 — Registrasi tool: `web_fetch` **sudah** terdaftar, `ambil_web` (kalau mau nama sendiri)

**Berkas:** `src/lib/zephyrTools/catalog.ts`
**Baris lama:** `220-221`

Lama (persis):
```ts
['web_search', 'Web', 'net', false, 'Cari di internet'],
['web_fetch', 'Web', 'net', false, 'Ambil dan bersihkan satu halaman web'],
```

`web_fetch` **sudah ada** di katalog, jadi Opsi A/B **tidak butuh baris baru** — cukup
memakai nama itu. Tambah baris hanya bila pemilik produk ingin nama terpisah:

Baru (opsional, sisipkan setelah baris 221):
```ts
['web_search', 'Web', 'net', false, 'Cari di internet'],
['web_fetch', 'Web', 'net', false, 'Ambil dan bersihkan satu halaman web'],
['ambil_web', 'Web', 'net', false, 'Ambil konten web (https-only, host diizinkan) - hasil JSON mentah + bisa disimpan ke berkas'],
```

Catatan: `catalog.ts` adalah berkas bersama → **baris di atas adalah usulan, bukan suntingan**.

---

## U2 — `web_fetch` memakai `ambilWeb()` (satu pintu, enam aturan sekaligus)

**Berkas:** `src/lib/zephyrTools/web.ts`
**Baris:** `421-438` (badan `run` `web_fetch`)

Lama (persis, `web.ts:421-438`):
```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      /* Gerbang izin + allowlist domain SEBELUM jaringan: URL di luar daftar
         tidak pernah sampai ke `web_fetch` di Rust, jadi tidak ada paket yang
         keluar untuk host yang tidak diizinkan (dibuktikan harness dengan
         penghitung pemanggilan fetcher). */
      const kb = { ...kebijakan() };
      if (typeof a.max_chars === 'number') kb.batasKarakter = a.max_chars; // di-clamp lagi oleh potongKeluaran()
      const ambil = await ambilIsiWeb(url, kb, (u, maxChars) => cmd.webFetch(u, maxChars * 2));
      if (!ambil.ok) return `(isi web ditolak: ${ambil.alasan})`;
      const teksBersih = ambil.teks
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return potong(potongKeluaran(teksBersih, kb).teks || '(empty content)');
    },
```

Tanda tangan nyata modul ini (dibaca dari berkas, bukan dikarang):

```ts
// src/lib/zephyrTools/ambilWeb.ts:572
export async function ambilWeb(
  permintaan: PermintaanAmbilWeb,   // { url, izin?, batasByte?, waktuMs?, maksKarakter?, sebagai?: 'auto'|'teks'|'json', ikutiRedirect? }
  transport: TransportAmbilWeb,     // (url, { waktuMs, maksByte }) => Promise<{ status, header?, body, url? }>
): Promise<HasilAmbilWeb>;          // { ok, sebab, url, urlAkhir, status, header, isi, data, json, terpotong, … }
// src/lib/zephyrTools/ambilWeb.ts:102
export interface IzinAmbilWeb { host: string[]; lokal: boolean; httpLokal: boolean }
```

Baru:
```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      const kb = { ...kebijakan() };
      if (typeof a.max_chars === 'number') kb.batasKarakter = a.max_chars;

      /* Satu pintu AMBIL-WEB: https-only, allowlist host (default TOLAK), tolak
         lokal kecuali izin eksplisit, potong BYTE, timeout modul sendiri, izin
         diulang tiap hop redirect, JSON disajikan sebagai data. Semua ini
         dibuktikan harness 32 kasus — bukan janji di komentar. */
      const hasil = await ambilWeb(
        {
          url,
          izin: izinAmbilWeb(),            // dari setelan (U5): { host, lokal, httpLokal }
          batasByte: kb.batasByte,
          waktuMs: kb.waktuMs,
          maksKarakter: kb.batasKarakter,
          sebagai: 'auto',
        },
        transportAmbilWeb,                  // pembungkus tipis di atas cmd.webFetch
      );
      if (!hasil.ok) return `(isi web ditolak: ${hasil.sebab})`;
      return potong(hasil.isi || '(empty content)');
    },
```

Dua helper yang perlu ditambahkan di berkas itu (usulan, bukan suntingan):

```ts
/** Izin AMBIL-WEB yang berlaku sekarang. Allowlist + izin opt-in dibaca dari
    pintu yang SUDAH ada (`kebijakan()` → `kebijakanDariSetelan()`), jadi kunci
    setelan tidak digandakan: `allowlistWeb` (kebijakanIsiWeb.ts:113) dan
    `izinIsiWeb` (:117). Hanya izin lokal yang baru. */
function izinAmbilWeb(): IzinAmbilWeb {
  const kb = kebijakan();                                  // web.ts:44-46
  const s = useStore.getState().settings as { izinLokalWeb?: boolean };
  const lokal = s.izinLokalWeb === true;
  return { host: kb.allowlist, lokal, httpLokal: lokal };
}

/* Transport aplikasi: AMBIL-WEB tidak pernah menyentuh jaringan sendiri — ia
   memanggil perintah Tauri yang sama dengan yang dipakai sekarang. */
const transportAmbilWeb = async (u: string, o: OpsiTransport): Promise<IsiBalikan> => ({
  status: 200,
  body: await cmd.webFetch(u, o.maksByte),
  url: u,
});
```

Impor yang ditambah:
```ts
import { ambilWeb, type IsiBalikan, type IzinAmbilWeb, type OpsiTransport } from './ambilWeb';
```

> **Cacat yang harus diketahui sebelum menerapkan:** `cmd.webFetch` sekarang
> mengembalikan **teks bersih**, tanpa `status`/`header`. Artinya `status: 200` di atas
> adalah **asumsi**, bukan kebenaran, sehingga pemeriksaan hop redirect (`dilalui`,
> `W19-W21`) tidak bisa dijalankan dari jalur app sampai perintah Rust mengembalikan
> `{ status, header, body }` — itu usulan **U4b**. Kalau U4b tidak dikerjakan, pasang
> `ikutiRedirect: false` di jalur ini dan biarkan `max_redirects(0)` milik Rust
> (`web.rs:123`) yang menahan redirect — jangan biarkan `status` palsu membuat modul
> mengira ia sudah memeriksa hop yang sebenarnya tidak pernah dilihatnya.

Bukti bahwa gerbang ini nyata: `W01-W08` (host luar izin, http, localhost/127.0.0.1/169.254,
port tak lazim) dengan **penghitung transport = 0**, dan `W23` (server lokal nyata tidak
dihubungi tanpa izin).

---

## U3 — JSON nyata sampai ke model sebagai **data**

**Berkas:** `src/lib/zephyrTools/web.ts`
**Bergantung pada:** U2 (kalau U2 tidak dipakai, tidak ada `data` untuk disalurkan)

`ambilWeb()` **sudah** memutuskan ini sendiri (`sebagai: 'auto'`): JSON yang terbaca menjadi
`hasil.data`, dan `hasil.isi` sudah disajikan rapi. Kalau pemilik produk ingin model menerima
JSON yang bisa dibaca mesin apa adanya, tambahkan satu cabang di `run` (setelah `if (!hasil.ok)`):

```ts
      /* JSON = DATA, bukan teks yang diaduk tag-nya. Model menerima JSON utuh
         (rahasia sudah disensor modul) supaya bisa dibaca mesin. */
      if (hasil.json && hasil.data !== null) return potong(JSON.stringify(hasil.data));
      return potong(hasil.isi || '(empty content)');
```

Harness membuktikan sisi positif **dan** sisi jujurnya: `W12` (`data.total=number (42)`),
`W13` (bukan JSON → `json=false data=null`), `W14` (content-type JSON tapi isi rusak → tidak
ada data palsu), `W15` (JSON terpotong → **tidak** dipecah separuh), `W16` (token di dalam
JSON disensor, JSON tetap bisa di-parse ulang).

---

## U4 — Tulis hasil ke berkas (perintah Tauri + pagar jalur)

**Berkas:** `src-tauri/src/web.rs` (perintah baru), `src/lib/commands.ts` (pembungkus)

Modul sudah punya `tulisHasilAmbilWeb(jalur, isi, tulis)` + `periksaJalurSimpan`
(menolak `.env`, `.ssh/*`, `.git/config`, `*.pem`, jalur keluar direktori — 8/8 ditolak,
`W26`). Yang belum ada: jalan resmi dari dalam app.

Usulan perintah (Rust, sisipkan setelah `web_fetch`):

```rust
/// Simpan isi yang sudah diambil ke berkas di dalam folder kerja. Jalur rahasia
/// (.env, .ssh, .git/config, *.pem) dan jalur keluar folder kerja DITOLAK di sini,
/// bukan hanya di sisi TS.
#[tauri::command]
pub fn ambil_web_simpan(akar: String, jalur: String, isi: String) -> ZResult<usize> {
    // 1) resolusi jalur terhadap `akar`, tolak `..` yang keluar akar
    // 2) tolak komponen rahasia (daftar yang sama dengan periksaJalurSimpan)
    // 3) tulis, balikan jumlah byte
}
```

Lalu `generate_handler!` di `src-tauri/src/lib.rs` perlu satu entri baru. **Butuh app hidup**
untuk diuji (bagian Rust tidak dijalankan harness node).

### U4b — `web_fetch` mengembalikan `{ status, header, body }`, bukan teks saja

**Berkas:** `src-tauri/src/web.rs`

Sekarang perintahnya mengembalikan **teks bersih** (`web.rs:117 ambil()`, `:135-138` menolak
`!(200..400)`), sehingga sisi TS tidak pernah melihat `status`/`Location` — akibatnya
pemeriksaan **per-hop redirect** milik `ambilWeb.ts` (`dilalui`, `W19-W21`) tidak bisa berjalan
dari jalur app dan `status: 200` di U2 hanyalah asumsi. Kalau U2 dipakai, perintahnya harus
mengembalikan struct:

```rust
#[derive(Serialize)]
pub struct IsiBalikanWeb {
    pub status: u16,
    pub header: std::collections::HashMap<String, String>, // setidaknya `location`
    pub body: String,
}
```
…dan `max_redirects(0)` (`web.rs:123`) tetap dipertahankan: modul TS yang mengikuti hop satu
per satu sambil memeriksa izinnya — bukan Rust yang mengikuti redirect diam-diam.

**Butuh app hidup.**

---

## U4c — Ringkas: urutan pengerjaan yang disarankan

1. U5a/U5b (tipe + bawaan) — tidak butuh app, membuka jalan UI.
2. U2 + U3 (satu pintu + JSON sebagai data) — tidak butuh app; harness membuktikan modulnya.
3. U4b (Rust mengembalikan status/header) — butuh app; menutup cacat "status palsu".
4. U4 (perintah simpan ke berkas) dan U6 (allowlist di Rust) — butuh app.
5. U5d (UI) — butuh app untuk memastikan tampilannya.

---

## U5 — Allowlist host di setelan + UI

**Penting — kuncinya sudah ada, jangan bikin yang keempat.** `kebijakanIsiWeb.ts:111-117`
sudah membaca **dua kunci setelan** secara duck-typed:

```ts
export function kebijakanDariSetelan(setelan: unknown): KebijakanIsiWeb {
  const s = (setelan ?? {}) as Record<string, unknown>;
  const allowlist = Array.isArray(s.allowlistWeb)     // ← kunci allowlist yang SUDAH dipakai
    ? s.allowlistWeb.filter((h): h is string => typeof h === 'string' && h.trim() !== '')
    …
  izinIsiWeb: s.izinIsiWeb === true,                  // ← izin opt-in yang SUDAH dipakai
```

Tetapi **tidak satu pun** dari keduanya dideklarasikan di `src/lib/types.ts` (hasil pencarian:
`allowlistWeb` hanya muncul di `kebijakanIsiWeb.ts:113-114`; `izinIsiWeb` hanya di
`kebijakanIsiWeb.ts`). Artinya setelan itu hidup sebagai kunci tak-bertipe — fail-closed
(aman), tetapi tidak terlihat di tipe setelan dan tidak punya UI. Usulan U5 karena itu
**melengkapi kontrak yang sudah ada**, bukan mengarang nama baru (`allowHosts` **dibatalkan**
oleh dokumen ini — memakai nama lain akan menciptakan kunci keempat).

Pola yang sudah ada dan harus ditiru: **command allow-list**.

| Bagian | Berkas : baris | Teks |
| --- | --- | --- |
| tipe setelan | `src/lib/types.ts:1316` | `  allowCommands: string[];` |
| nilai bawaan | `src/lib/types.ts:1631` | `  allowCommands: [],` |
| pemakaian (gaya izin) | `src/lib/store.ts:1626-1637` | `izinPerintah: (command) => { const daftar = get().settings.allowCommands ?? []; … }` |
| UI | `src/components/settings/CommandPermissions.tsx` (122 baris) | `<input data-testid="sp-izin-input">` + tombol tambah/hapus |
| dipasang | `src/components/settings/SettingsPage.tsx:33-35` (`case 'permissions'`) dan `src/components/ai/ChatSettingsPage.tsx:16,615` | `return <CommandPermissions />;` |
| pencocokan host | `src/lib/zephyrTools/kebijakanIsiWeb.ts:174` | `export function hostDiAllowlist(host, allowlist)` — **pakai ini**, jangan tulis ulang |

### U5a — deklarasikan kunci yang sudah dibaca + izin lokal

Lama (`types.ts:1316`):
```ts
  allowCommands: string[];
```
Baru:
```ts
  allowCommands: string[];

  /** Host yang boleh dijangkau tool web. Kosong = TOLAK SEMUA. Dibaca
      `kebijakanDariSetelan()` (kebijakanIsiWeb.ts:113) - jangan ganti namanya. */
  allowlistWeb: string[];

  /** Izin opt-in isi web (kebijakanIsiWeb.ts:117). Bawaan mati. */
  izinIsiWeb: boolean;

  /** Batas byte mentah dari jaringan (kebijakanIsiWeb.ts:119). */
  batasByteWeb: number;

  /** Batas karakter isi yang boleh dilihat model (kebijakanIsiWeb.ts:120). */
  batasKarakterWeb: number;

  /** Izin EKSPLISIT untuk loopback/alamat privat (localhost, 127.0.0.1,
      169.254/16). Dipakai jalur izin lokal AMBIL-WEB; bawaan mati. */
  izinLokalWeb: boolean;
```

### U5b — nilai bawaan

Lama (`types.ts:1631`):
```ts
  allowCommands: [],
```
Baru:
```ts
  allowCommands: [],

  allowlistWeb: [],
  izinIsiWeb: false,
  izinLokalWeb: false,
```

> **Mengapa ketiganya `false`/`[]`:** nilai bawaan inilah yang membuat uji `W02`
> ("allowlist kosong = tolak semua") dan `W05` ("10/10 alamat lokal ditolak tanpa izin")
> bermakna di produk, bukan hanya di harness. Sisi Rust punya cermin setelan di
> `settings.rs default_settings()` (`types.ts:1625-1627` menyebut hal ini) — kalau U6
> dipakai, cermin itu harus ikut diubah bersamaan, jangan sampai jendela di antaranya
> menampilkan sakelar yang tidak menggambarkan nilai yang benar-benar berlaku.

### U5c — pembaca izin (tidak perlu fungsi baru)

**Tidak ada usulan patch di sini.** Pembaca yang dibutuhkan sudah ada dan sudah diuji:
`kebijakanDariSetelan(useStore.getState().settings)` (`web.ts:44-46` memakainya) untuk
allowlist + izin opt-in, dan `hostDiAllowlist()` (`kebijakanIsiWeb.ts:174`) untuk
pencocokan host. Fungsi gaya `izinPerintah` (`store.ts:1626`) **tidak perlu dibuat ulang** —
usulan awal dokumen ini untuk membuat `izinHostWeb` **dibatalkan** karena akan menggandakan
`hostDiAllowlist`.

### U5d — UI (komponen baru, meniru `CommandPermissions.tsx`)

**Berkas baru:** `src/components/settings/HostPermissions.tsx` — salinan struktur
`CommandPermissions.tsx` dengan `data-testid="sp-host-*"`, daftar dari
`useStore((s) => s.settings.allowlistWeb ?? [])`, ditulis lewat
`applySettings({ allowlistWeb: [...] })`, plus satu kotak centang izin lokal
(`settings.izinLokalWeb`) dengan peringatan tegas ("host lokal dapat menjangkau layanan
di mesin ini").

**Pemasangan:** di `SettingsPage.tsx` setelah baris `35` (`case 'permissions'`), dan di
`ChatSettingsPage.tsx` setelah baris `615` (`ctl: <CommandPermissions />`). **Butuh app hidup**
untuk memastikan tampilannya.

---

## U6 — Allowlist host di sisi Rust (cermin lantai)

**Berkas:** `src-tauri/src/web.rs`, pola dari `src-tauri/src/ext_pkg.rs`

Lama (`ext_pkg.rs:1643` + `:1649-1651`, pola yang sudah terbukti):
```rust
pub const IZIN_UNDUH: &[&str] = &["open-vsx.org", "www.open-vsx.org"];
…
pub fn izin_unduh(url: &str) -> ZResult<()> {
    …
    if !url.starts_with("https://") || !IZIN_UNDUH.contains(&host.as_str()) {
```
(uji pola ini sudah ada di `ext_pkg.rs:2134,2140,2153`)

Baru, di `web.rs` — lantai yang sama, ditambah allowlist:

```rust
/// Lantai lama tidak berubah: skema/port/IP lokal (web.rs:18).
pub fn validate_outbound_url(url: &str) -> ZResult<ureq::http::Uri> { … }

/// Tambahan AMBIL-WEB: host harus di allowlist, https-only, dan host lokal
/// hanya bila izin lokal eksplisit pernah diberikan.
pub fn izin_ambil_web(uri: &ureq::http::Uri, allow: &[String], izin_lokal: bool) -> ZResult<()> {
    let host = uri.host().unwrap_or("").to_ascii_lowercase();
    let lokal = host == "localhost" || host.ends_with(".local") || is_ip_privat(host.as_str());
    if lokal && !izin_lokal {
        return Err(ZephyrError::Forbidden("host lokal/privat - butuh izin eksplisit".into()));
    }
    if !uri.scheme_str().map_or(false, |s| s == "https") && !(lokal && izin_lokal) {
        return Err(ZephyrError::Forbidden("hanya https yang diizinkan".into()));
    }
    if !lokal && !allow.iter().any(|d| host == *d || host.ends_with(&format!(".{d}"))) {
        return Err(ZephyrError::Forbidden("host di luar allowlist".into()));
    }
    Ok(())
}
```

Lalu panggil dari `ambil` di `web.rs:117-119` (teks lama persis: `let u = url.trim();`
`validate_outbound_url(u)?;`) — tambahkan `izin_ambil_web(&u, &allow, izin_lokal)?;` di bawahnya.

**Butuh app hidup** untuk diuji; tidak ada harness CDP yang dijalankan untuk pekerjaan ini.
Kalau U6 dipakai, angka `TIMEOUT` (`web.rs:107`, 20 s) dan `max_redirects(0)` (`web.rs:123`)
harus disamakan dengan angka modul TS (30 000 ms / hop ≤ 5) — atau dinyatakan mana yang menang
(lihat U0 §7 laporan).

---

## U7 — Rekonsiliasi dengan usulan lama (`USULAN-BROWSER-DAN-FETCH.md`)

| Usulan lama | Isi | Hubungan dengan dokumen ini |
| --- | --- | --- |
| U1 spec `web_fetch` + gerbang allowlist | `web.ts` | **Sama tujuannya**; U2 di sini memakai modul nyata `ambilWeb.ts` (32 kasus lulus) alih-alih menulis helper baru di dalam `web.ts` |
| U2 redaksi token | `redaksiWeb.ts` (berkas baru) | **Bertabrakan** dengan `kebijakanIsiWeb.ts:314 saringKeModel` yang sudah ada dan sudah dipakai. Jangan buat berkas ketiga — pakai yang sudah terpasang |
| U3 batas byte bodi (Rust) | `web.rs` | **Sejalan**; U6 memperluasnya (allowlist + https + lokal) |
| U4/U5 allowlist di `browser_pane_*` | `browser_pane.rs` | **Tidak disentuh** dokumen ini; `browser_open` sudah punya `gerbangIsiKonten` (`web.ts:463`) |
| U6 allowlist di Settings §security | `settingsStore.ts:6-33` | **Sama**; U5 di sini memakai anchor yang benar untuk nilai setelan: setelan hidup di `types.ts:1316/1631` + `store.ts:1626`, sedangkan `settingsStore.ts` mengurus **urutan nav** (`SectionId`, baris 36-53), bukan nilai setelan |
| U7 `simpan_ke` lewat `periksaTulis` | `agentGuard.ts` | **Sejalan**; U4 memakai pagar jalur `ambilWeb.ts` (`periksaJalurSimpan`, 8/8 ditolak) — pilih satu, jangan dua pagar |

Kesimpulan usulan: **jangan menerapkan kedua dokumen mentah-mentah.** Ambil satu gerbang
(§U0), lalu ambil hanya bagian yang belum ada — JSON-as-data (U3) dan tulis-berkas (U4) —
karena itu dua hal yang **tidak** dimiliki rumah A maupun lantai B.
