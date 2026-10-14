# USULAN PATCH — Pane Browser & Fetch Web (allowlist domain)

Dokumen ini **hanya berisi usulan**. Tidak ada berkas produk yang disentuh.
Format tiap usulan: berkas + rentang baris + **teks lama (persis dari berkas)**
+ **teks baru**, lalu catatan apakah butuh app hidup untuk diuji.

Semua baris "teks lama" di bawah disalin dari branch `feat/ai-panel-vscode-layout`
pada 2026-10-14 dan sudah dicek ulang terhadap berkas.

Ringkasan butuh-app:

| Usulan | Berkas | Butuh app hidup? |
|--------|--------|------------------|
| U1 spec `web_fetch` + gerbang allowlist (TS) | `src/lib/zephyrTools/web.ts` | tidak (bisa diuji node) |
| U2 redaksi token (berkas baru) | `src/lib/zephyrTools/redaksiWeb.ts` | tidak |
| U3 batas byte bodi (Rust) | `src-tauri/src/web.rs` | **ya** |
| U4 gerbang allowlist di `browser_pane_open` (Rust) | `src-tauri/src/browser_pane.rs` | **ya** |
| U5 gerbang allowlist di `browser_pane_nav` (Rust) | `src-tauri/src/browser_pane.rs` | **ya** |
| U6 allowlist di Settings §security | `src/lib/settingsStore.ts` | tidak (tipe) / ya (UI) |
| U7 (cadangan) `simpan_ke` lewat `periksaTulis` | `src/lib/agentGuard.ts` | tidak |

---

## U1 — `web_fetch`: tambah param allowlist + batas byte, dan gerbang sebelum jaringan

**Berkas:** `src/lib/zephyrTools/web.ts`
**Baris:** `351-358` (spec), `360-363` (run)

### U1a — spec.parameters

Lama (`web.ts:351-358`):
```ts
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch (http:// or https://).' },
          max_chars: { type: 'number', description: 'Text length limit in characters (default 15000).' },
        },
        required: ['url'],
      },
```

Baru:
```ts
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to fetch (http:// or https://). Its domain MUST be on the web allowlist; otherwise the call is rejected before any network I/O.' },
          max_chars: { type: 'number', description: 'Text length limit in characters (default 15000).' },
          izinkan_domain: { type: 'array', items: { type: 'string' }, description: 'Optional subset of the configured web allowlist. It can only narrow, never widen.' },
          batas_byte: { type: 'number', description: 'Hard byte cap on the response body (default 2 MB, clamped to max 8 MB).' },
        },
        required: ['url'],
      },
```

### U1b — gerbang sebelum `cmd.webFetch`

Lama (`web.ts:360-363`):
```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      const maxChars = typeof a.max_chars === 'number' ? a.max_chars : 15000;
      const html = await cmd.webFetch(url, maxChars * 2);
```

Baru:
```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      // Gerbang allowlist SEBELUM jaringan: ditolak => tidak ada socket (lihat
      // kasus A26 di scripts/uji-fetch-web-rencana.mjs).
      const izin = Array.isArray(a.izinkan_domain) ? a.izinkan_domain : [];
      const gerbang = periksaDomainWeb(url, izin);
      if (!gerbang.ok) return potong(`(ditolak oleh allowlist: ${gerbang.alasan})`);
      const maxChars = typeof a.max_chars === 'number' ? a.max_chars : 15000;
      const html = await cmd.webFetch(url, maxChars * 2);
      const teksBersih = saringRahasiaWeb(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          // ... (baris 366-369 tidak berubah) ...
      );
```

### U1c — helper `periksaDomainWeb` (sisipkan di kepala `web.ts`)

Tempatkan di sekitar `web.ts:306` (dekat `TOOL_WEB`). Semantiknya sama dengan
kasus A1–A5/A20–A23 di harness:

```ts
import { allowlistDomainWeb } from '../settingsStore';

/** true bila host == domain, atau host adalah subdomain (<label>.domain). */
function domainCocok(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase().replace(/^\./, '');
  return h === d || h.endsWith('.' + d);
}

/**
 * Gerbang default-TOLAK. Sengaja TIDAK memeriksa skema/port/privat: itu tugas
 * validate_outbound_url di Rust (web.rs:18), supaya lantai jaringan tunggal.
 */
export function periksaDomainWeb(url: string, sempit: string[]): { ok: boolean; alasan: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, alasan: 'bukan URL absolut' };
  }
  const izin = allowlistDomainWeb();
  const dipakai = sempit.length ? sempit.filter((d) => izin.some((x) => domainCocok(d, x))) : izin;
  if (!dipakai.some((d) => domainCocok(u.hostname, d))) {
    return { ok: false, alasan: `domain ${u.hostname} tidak ada di allowlist` };
  }
  return { ok: true, alasan: 'diizinkan' };
}
```

> Catatan: `izin.filter(...)` di atas memastikan `izinkan_domain` dari model
> **hanya bisa mempersempit** — ia tidak bisa menambah domain di luar settings.

---

## U2 — Redaksi token: berkas baru `src/lib/zephyrTools/redaksiWeb.ts`

Keluaran fetch menuju konteks model, jadi pola token harus dibuang. **Berkas
baru**, jadi tidak menyentuh berkas produk yang ada.

```ts
/**
 * Pola token yang TIDAK boleh masuk konteks model. Diselaraskan dengan
 * scripts/uji-fetch-web-rencana.mjs (kasus A15) supaya uji = implementasi.
 */
const POLA_TOKEN: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
];

export function saringRahasiaWeb(teks: string): string {
  let t = String(teks);
  for (const re of POLA_TOKEN) t = t.replace(re, '[DISENSOR]');
  return t;
}
```

Baris `import { saringRahasiaWeb } from './redaksiWeb';` ditambahkan di kepala
`web.ts`.

---

## U3 — `web.rs`: batas BYTE pada bodi (celah P2 / C2)

**Berkas:** `src-tauri/src/web.rs`
**Baris:** `140-143`

Lama (`web.rs:140-143`):
```rust
    let mut resp = resp;
    resp.body_mut()
        .read_to_string()
        .map_err(|e| ZephyrError::InvalidInput(format!("reading the body failed: {e}")))
```

Baru:
```rust
    let mut resp = resp;
    // Batas byte keras: read_to_string tanpa batas membaca SELURUH bodi ke
    // memori, jadi satu URL besar bisa menghabiskan RAM app.
    const MAKS_BYTE: u64 = 8 * 1024 * 1024;
    let mut buf = String::new();
    resp.body_mut()
        .as_reader()
        .take(MAKS_BYTE)
        .read_to_string(&mut buf)
        .map_err(|e| ZephyrError::InvalidInput(format!("reading the body failed: {e}")))?;
    Ok(buf)
```

Perlu tambahan `use std::io::Read;` di kepala berkas (`web.rs` ~baris 14), karena
`.take()` berasal dari trait `Read`.

> **BUTUH APP.** Menegakkan & membuktikan batas ini hanya lewat app hidup: harness
> node-only tidak menjalankan Rust. Yang bisa diuji tanpa app hanyalah bentuk
> spesifikasinya; perilaku runtime menunggu uji in-app.

---

## U4 — `browser_pane.rs`: gerbang allowlist di `browser_pane_open` (C4)

**Berkas:** `src-tauri/src/browser_pane.rs`
**Baris:** `52-57`

Lama (`browser_pane.rs:52-57`):
```rust
    let u = url.trim();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "the URL must start with http:// or https://".into(),
        ));
    }
```

Baru:
```rust
    let u = url.trim();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err(ZephyrError::InvalidInput(
            "the URL must start with http:// or https://".into(),
        ));
    }
    // Lantai jaringan yang sudah ada (skema/port/privat + resolusi DNS).
    crate::web::validate_outbound_url(u)?;
    // Lapisan baru: allowlist domain (default tolak).
    if !domain_diizinkan(u) {
        return Err(ZephyrError::InvalidInput(
            "the URL domain is not on the browser allowlist".into(),
        ));
    }
```

`validate_outbound_url` saat ini `pub fn` (`web.rs:18`) jadi **tidak perlu**
diubah visibilitasnya. `domain_diizinkan` adalah fungsi baru di
`browser_pane.rs` yang membaca allowlist dari state/config yang sama dengan
settings §security (U6).

> **BUTUH APP.** Dijalankan di dalam Tauri; tidak bisa dieksekusi harness node.

---

## U5 — `browser_pane.rs`: gerbang allowlist di `browser_pane_nav` (C4)

**Berkas:** `src-tauri/src/browser_pane.rs`
**Baris:** `212-218`

Lama (`browser_pane.rs:212-218`):
```rust
        lain => {
            let u: tauri::Url = lain
                .parse()
                .map_err(|e| ZephyrError::InvalidInput(format!("invalid URL: {e}")))?;
            w.navigate(u)
                .map_err(|e| ZephyrError::InvalidInput(format!("{e}")))?;
        }
```

Baru:
```rust
        lain => {
            let u: tauri::Url = lain
                .parse()
                .map_err(|e| ZephyrError::InvalidInput(format!("invalid URL: {e}")))?;
            crate::web::validate_outbound_url(lain)?;
            if !domain_diizinkan(lain) {
                return Err(ZephyrError::InvalidInput(
                    "the URL domain is not on the browser allowlist".into(),
                ));
            }
            w.navigate(u)
                .map_err(|e| ZephyrError::InvalidInput(format!("{e}")))?;
        }
```

Catatan: `"back"`/`"forward"`/`"reload"` (`:203-211`) **tidak** diubah — mereka
tidak membawa URL baru; halaman tujuan pasti sudah lolos gerbang saat pertama
dibuka. (Kalau halaman itu sendiri memicu navigasi via JS, lihat catatan C5 di
`RANCANGAN`, yang **BUTUH APP**.)

> **BUTUH APP.**

---

## U6 — Allowlist domain di Settings §security

**Berkas:** `src/lib/settingsStore.ts`
**Baris:** tipe `SectionId` `:6-33` (sudah punya `'security'` di `:24`)

Tidak perlu menambah section (sudah ada `security`, `SECTION_ORDER:47`).
Yang perlu: getter/setter config allowlist, menumpang pola command allow-list
yang sudah dilaporkan di `settingsStore.ts:66-70`.

Usul tambahan (bentuk fungsi; nama disesuaikan dengan konvensi store yang ada):

```ts
/** Dipakai web_fetch/periksaDomainWeb dan gerbang browser_pane. */
export function allowlistDomainWeb(): string[] {
  return useSettings.getState().domainAllowWeb ?? [];
}
```

> **BUTUH APP** untuk bentuk UI-nya. Bentuk persistensinya perlu diputuskan
> (config file vs state) — belum dirancang di sini, tidak dikarang.

---

## U7 (cadangan) — kalau kelak `simpan_ke` ditambahkan

`web_fetch` **sengaja tidak punya** param jalur berkas (lihat `RANCANGAN` §4.4, P4).
Bila kelak ditambah, ia **wajib** lewat gerbang yang sudah ada, bukan cek sendiri:

**Berkas:** `src/lib/agentGuard.ts`
**Baris:** `214` (`export function periksaTulis(path: string): HasilAman`)

```ts
import { periksaTulis } from './agentGuard';
// ...
const cek = periksaTulis(a.simpan_ke);
if (!cek.ok) return potong(`(ditolak: ${cek.alasan})`);
```

Ini menutup `.env`, `*.pem`, `.git`, dll. lewat `POLA_RAHASIA`
(`agentGuard.ts:80-103`) dan `DIR_TERPROTEKSI` (`agentGuard.ts:115-141`) yang
sudah ada — bukan daftar baru.

---

## Bukti (keluaran nyata)

### Perintah 1 — harness rancangan

```
$ node scripts/uji-fetch-web-rencana.mjs
== (A) Bukti aturan rancangan (implementasi acuan, node-only) ==

LULUS  A1 allowlist kosong -> semua ditolak
LULUS  A2 host di luar allowlist ditolak
LULUS  A3 host persis allowlist diterima
LULUS  A4 subdomain allowlist diterima
LULUS  A5 suffix attack contoh.com.jahat.com DITOLAK
LULUS  A6 file:// ditolak
LULUS  A7 data: URL ditolak
LULUS  A8 jalur drive Windows ditolak
LULUS  A9 jalur absolut POSIX ditolak
LULUS  A10 jalur UNC ditolak
LULUS  A11 .env sebagai target simpan ditolak
LULUS  A12 jalur memuat .git ditolak
LULUS  A13 bodi 50000 byte dipotong ke batas 4000 byte
LULUS  A14 potong byte tidak memecah karakter UTF-8 (tanpa U+FFFD)
LULUS  A15 keluaran bebas sk-/ghp_/AKIA/JWT/glpat-/xox
LULUS  A16 API key di dalam .env tidak pernah jadi URL valid
LULUS  A17 redirect allowlist -> di luar allowlist DITOLAK
LULUS  A18 redirect allowlist -> allowlist lain DITERIMA
LULUS  A19 rantai redirect melebihi batas DITOLAK
LULUS  A20 port non-80/443 ditolak walau host di allowlist
LULUS  A21 IP privat ditolak walau di allowlist
LULUS  A22 metadata 169.254.169.254 ditolak
LULUS  A23 localhost ditolak
LULUS  A24 waktu tunggu dinaikkan ke batas atas
LULUS  A25 waktu tunggu tidak sah -> bawaan
LULUS  A26 URL di luar allowlist dibuang TANPA menyentuh transport
LULUS  A27 jaringan nyata tetap 0 setelah seluruh uji

LULUS 27/27

== (B) Jarak ke kode produk (berkas + baris nyata, bukan lulus/gagal) ==
ADA  src-tauri/src/web.rs:27 — lantai skema http/https ADA
ADA  src-tauri/src/web.rs:41 — lantai port 80/443 ADA
ADA  src-tauri/src/web.rs:48 — blokir loopback/privat ADA
ADA  src-tauri/src/web.rs:123 — redirect TIDAK diikuti (max_redirects 0) ADA
CELAH src-tauri/src/web.rs:142 — CELAH: bodi dibaca tanpa batas BYTE (read_to_string)
CELAH src-tauri/src/web.rs — CELAH: tidak ada allowlist domain di web_fetch
CELAH src/lib/zephyrTools/web.ts:349 — CELAH: spec web_fetch tanpa param allowlist domain
CELAH src/lib/zephyrTools/web.ts — CELAH: spec web_fetch tanpa param simpan_ke (menutup C7)
ADA  src-tauri/src/browser.rs:9 — batas unduhan 100 MB ADA
ADA  src-tauri/src/browser.rs:44 — redirect TIDAK diikuti ADA
ADA  src-tauri/src/browser_pane.rs:55 — pane hanya menerima http/https (cek awalan)
CELAH src-tauri/src/browser_pane.rs — CELAH: browser_pane_open/nav tanpa allowlist domain

== Ringkasan ==
kasus rancangan : 27/27 LULUS
jaringan nyata  : 0 (fetch 0, websocket 0, net 0, http 0, dns 0)
celah kode produk: 5 (lihat bagian B + docs/USULAN-BROWSER-DAN-FETCH.md)
HASIL: aturan RANCANGAN LULUS (exit 0). Ini TIDAK berarti kode produk sudah aman — celah di bagian (B) menunggu patch.
```

Exit code: **0**.

Bukti tambahan (JSON, mesin-baca):
```
$ node scripts/uji-fetch-web-rencana.mjs --json
{
  "kasus": 27,
  "lulus": 27,
  "gagal": [],
  "jaringan": { "fetch": 0, "websocket": 0, "net": 0, "http": 0, "dns": 0 },
  "celahKodeProduk": 5,
  "semuaLulus": true
}
```

### Perintah 2 — typecheck

```
$ npx tsc --noEmit
TSC_EXIT=0
```
0 galat (tanpa keluaran diagnostik).

### Kenapa "jaringan nyata 0" itu bermakna

Harnes mem-patch `globalThis.fetch`, `globalThis.WebSocket`,
`net.Socket.prototype.connect`, `net.connect`, `net.createConnection`,
`http.request/get`, `https.request/get`, dan `dns.lookup` **sebelum** apa pun
dijalankan. Setiap panggilan menaikkan penghitung lalu **melempar**. Kalau satu
jalur saja lolos ke socket, A27 gagal. Ia lulus, jadi kebijakan acuan menolak
URL di luar allowlist **sebelum** transport (dibuktikan A26: `transport=0`).

---

## Utang / sisa (apa adanya)

1. **U3, U4, U5 BUTUH APP.** Tidak bisa dijalankan harness node. Belum diuji
   runtime; hanya bentuk patch yang ditulis.
2. **C5 (`browser_pane_eval` bisa `location.href = …`)** belum ditutup di sini.
   Menegakkannya butuh menangkap event navigasi webview, bukan regex. BUTUH APP.
3. **U6** belum memutuskan bentuk persistensi allowlist (config file vs state) —
   UI belum dirancang, tidak dikarang.
4. Harness membuktikan **aturan rancangan**, bukan penegakan di kode produk.
   Lima celah (bagian B) adalah pekerjaan yang belum dikerjakan.
