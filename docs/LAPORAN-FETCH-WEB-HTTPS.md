# LAPORAN — ZEPH-FETCH-WEB-HTTPS (lantai HTTPS + izin host pada jalur HIDUP `web_fetch`)

Tanggal: 2026-10-14 · Repo: `D:/Zephyr` · Cabang: `feat/ai-panel-vscode-layout`
Pemilik berkas: `src/lib/zephyrTools/web.ts` (satu-satunya berkas `src/**` yang disentuh), `scripts/uji-jangkauan-tool.mjs`.
App dalam keadaan MATI saat verifikasi (`curl -s -m 3 http://127.0.0.1:9223/json/version` kosong, exit 7; 0 proses zephyr). Semua bukti di bawah **tanpa app**.

## 1. Vonis per tuntutan

| Tuntutan | Vonis | Dasar |
|---|---|---|
| (a) tolak skema selain `https:` pada `web_fetch` | **TERBUKTI (tanpa app)** | `SKEMA_WEB_FETCH='https:'`; `lantaiHttpsWeb('http://example.org/x')` → `{"ok":false,"alasan":"skema-bukan-https:http:"}`; `ftp:`,`file:`,`javascript:` → `skema-terlarang:*` |
| (b) izin host eksplisit + tolak localhost/127.0.0.1/::1/10.x/172.16-31.x/192.168.x/169.254.169.254/IP privat | **TERBUKTI (tanpa app)** | `lantaiHttpsWeb` memakai `periksaUrl` yang sudah ada (`nama-lokal:localhost`, `ip-privat:127.0.0.1`, `ip-privat:10.0.0.5`, `ip-privat:172.16.0.1`, `ip-privat:192.168.1.1`, `ip-privat:[::1]`, `ip-privat:169.254.169.254`, `host-luar-allowlist:evil.test`, `host-luar-allowlist:example.org.jahat.test`) + penolakan baru `userinfo-ditolak` |
| (c) penolakan SEBELUM transport — **nol jaringan saat ditolak** | **TERBUKTI (tanpa app)** | bundel KODE ASLI `web.ts`, transport `cmd.webFetch` diganti PENGHITUNG: 14 URL ditolak → `panggilan transport=0`, semua balasan berawalan `(isi web ditolak: ` |
| (d) kontrol positif: https ke host diizinkan tetap jalan | **TERBUKTI (tanpa app)** | `run({url:'https://example.org/artikel'})` → `panggilan transport=1`, `args={"url":"https://example.org/artikel",...}`, isi kembali; `sub.example.org` lolos; `max_chars:100` di-clamp lalu diteruskan (`maxChars` transport = 2 × clamp) |
| tidak membuat gerbang kembar ketiga / tidak menyambungkan `ambilWeb.ts` | **TERBUKTI (tanpa app)** | `web.ts` tidak memuat `from './ambilWeb'`; pengimpor `ambilWeb` = **NOL** (modul tetap mati); kebijakan hanya DITIRU (`periksaUrl`) |
| gerbang ini benar-benar dievaluasi di jalur kirim yang hidup | **TERBUKTI (tanpa app)** | urutan baris di `web.ts`: `lantaiHttpsWeb(url, kb)` → `if (!lantai.ok) return` → `ambilIsiWeb(...)` → `cmd.webFetch(...)` dalam jarak 5 baris |
| transport Rust asli (`web_fetch` di `src-tauri/`) benar-benar tidak menerima paket | **BUTUH APP** — TIDAK diklaim | penghitung yang kami ukur adalah batas panggilan JS→Tauri (`cmd.webFetch`). Bukti end-to-end butuh app hidup + log sisi Rust. Tidak dijalankan (app mati, 4 lane lain menyunting `src/**`) |
| perilaku redirect (mis. https diizinkan → redirect ke http / host lain) | **BUTUH APP** | redirect ditangani transport Rust, di luar jangkauan bundel node |

## 2. Teks LAMA vs teks BARU (verbatim per baris)

Sumber "lama": `git show HEAD:src/lib/zephyrTools/web.ts` (diperiksa: `grep -n "lantaiHttpsWeb\|skema-bukan-https"` di HEAD → **TIDAK ADA**; jadi lantai ini memang belum ada di HEAD).
Statistik kerja: `git diff --stat HEAD -- src/lib/zephyrTools/web.ts` → `1 file changed, 533 insertions(+), 41 deletions(-)`.

### 2a. Deskripsi tool (yang dibaca model)

LAMA:
```ts
      name: 'web_fetch',
      description: 'Fetch the text of a web URL (converted from HTML to clean text with script/style removed).',
```

BARU:
```ts
      name: 'web_fetch',
      description: 'Fetch the text of a web URL over HTTPS ONLY (converted from HTML to clean text with script/style removed). http:// and every other scheme are refused before a single request is made.',
```

### 2b. Skema argumen

LAMA:
```ts
          url: { type: 'string', description: 'The URL to fetch (http:// or https://).' },
          max_chars: { type: 'number', description: 'Text length limit in characters (default 15000).' },
```

BARU:
```ts
          url: { type: 'string', description: 'The https:// URL to fetch. http:// and other schemes are refused before any network request.' },
          max_chars: { type: 'number', description: 'Text length limit in characters (default 15000).' },
```

### 2c. Eksekutor — inti item ini

LAMA (tanpa gerbang apa pun; transport dipanggil langsung):
```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      const maxChars = typeof a.max_chars === 'number' ? a.max_chars : 15000;
      const html = await cmd.webFetch(url, maxChars * 2);
```

BARU:
```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      /* Gerbang izin + allowlist domain SEBELUM jaringan: URL di luar daftar
         tidak pernah sampai ke `web_fetch` di Rust, jadi tidak ada paket yang
         keluar untuk host yang tidak diizinkan (dibuktikan harness dengan
         penghitung pemanggilan fetcher). */
      const kb = { ...kebijakan() };
      if (typeof a.max_chars === 'number') kb.batasKarakter = a.max_chars; // di-clamp lagi oleh potongKeluaran()
      /* LANTAI HTTPS + izin host, juga SEBELUM jaringan. `periksaUrl` menerima
         `http:` dan `https:`; jalur ini hanya `https:`. Ditambah satu penolakan
         yang tidak ada di `periksaUrl`: URL ber-userinfo, karena di situ host
         yang DILIHAT mata pembaca bisa berbeda dari host yang divonis parser. */
      const lantai = lantaiHttpsWeb(url, kb);
      if (!lantai.ok) return `(isi web ditolak: ${lantai.alasan})`;
      const ambil = await ambilIsiWeb(lantai.url, kb, (u, maxChars) => cmd.webFetch(u, maxChars * 2));
      if (!ambil.ok) return `(isi web ditolak: ${ambil.alasan})`;
```

### 2d. Lantai itu sendiri (fungsi baru, verbatim)

LAMA: *(tidak ada — fungsi ini tidak ada di HEAD)*

BARU (`src/lib/zephyrTools/web.ts`, mulai baris 382):
```ts
export const SKEMA_WEB_FETCH = 'https:';

export function lantaiHttpsWeb(urlStr: unknown, kb: KebijakanIsiWeb): KeputusanUrl {
  /* Semua aturan lama dulu - supaya alasan penolakan yang sudah ada
     (`ip-privat:`, `nama-lokal:`, `host-luar-allowlist:`, `port-tak-lazim:`)
     tetap persis sama, dan tidak ada satu pun perilaku https yang berubah. */
  const dasar = periksaUrl(urlStr, kb);
  if (!dasar.ok) return dasar;

  let u: URL;
  try {
    u = new URL(dasar.url);
  } catch {
    return { ok: false, alasan: 'url-tak-valid' };
  }
  if (u.protocol !== SKEMA_WEB_FETCH) {
    return { ok: false, alasan: 'skema-bukan-https:' + u.protocol };
  }
  /* Trik userinfo. `new URL` membuang userinfo dari `hostname`, jadi
     `https://***@jahat.com/` divonis host `jahat.com` (dan ditolak
     allowlist) - benar. Tapi `https://jahat@contoh.com/` divonis `contoh.com`
     dan LOLOS, padahal yang terbaca mata manusia adalah `jahat`. Tidak ada
     pemakaian sah untuk userinfo di jalur ini, jadi ditolak apa adanya
     supaya host yang divonis selalu sama dengan host yang terlihat. */
  if (u.username !== '' || u.password !== '') {
    return { ok: false, alasan: 'userinfo-ditolak:' + u.hostname };
  }
  return { ok: true, url: u.href, host: dasar.host };
}
```

Pola allowlist dirujuk dari `src-tauri/src/ext_pkg.rs:1152` (daftar host eksplisit, bukan wildcard), tetapi **tidak** ada gerbang ketiga baru: jalur hidup memakai kebijakan yang SUDAH ADA (`periksaUrl` di `kebijakanIsiWeb.ts`) + satu lantai skema.

## 3. Bukti runtime — cara ukur (bukan pembacaan baris)

`scripts/uji-jangkauan-tool.mjs` membangun bundel KEDUA dari **kode ASLI** `src/lib/zephyrTools/web.ts` dengan esbuild:
* lapisan app di-stub (`@tauri-apps/plugin-opener`, `../store`, `../terminalStore`, `../agentGuard`, `../commands`, `./builtins`, `../checkpoint`);
* **transport `cmd.webFetch` diganti FUNGSI PENGHITUNG** (`globalThis.__netZephyr.push({url, maxChars})`);
* `${'import.meta.env'}` di-`define` + `banner` agar jalur TS yang sama bisa dieksekusi node/CJS.

Maka `TOOL_WEB.web_fetch.run()` dan `lantaiHttpsWeb()` yang diuji = kode asli, dan `panggilan transport = 0` = benar-benar tidak ada permintaan keluar (di batas JS→Tauri).

## 4. Keluaran NYATA harness (apa adanya)

Perintah: `node scripts/uji-jangkauan-tool.mjs` → **EXIT=0**

```
== JEJAK JANGKAUAN TOOL (node murni, offline) ==

katalog: 68 tool | BATAS_TOOL_TUGAS=20
basis-aktif selalu-saja: 26 | basis-aktif penuh: 63

-- G3. LANTAI HTTPS + IZIN HOST jalur HIDUP web_fetch (runtime, transport stub) --
  ✓ web_fetch: eksekutor ASLI terjangkau di node (TOOL_WEB.web_fetch.run = fungsi)
  ✓ web_fetch: lantai skema = https: dan modul MATI ambilWeb TIDAK disambungkan (bukan gerbang ketiga)
  ✓ web_fetch: http:// ditolak (lantai skema)
  ✓ web_fetch: ftp:// ditolak
  ✓ web_fetch: file:// ditolak
  ✓ web_fetch: javascript: ditolak
  ✓ web_fetch: localhost ditolak
  ✓ web_fetch: 127.0.0.1 ditolak
  ✓ web_fetch: 10.0.0.5 ditolak
  ✓ web_fetch: 172.16.0.1 ditolak
  ✓ web_fetch: 192.168.1.1 ditolak
  ✓ web_fetch: [::1] ditolak
  ✓ web_fetch: metadata 169.254.169.254 ditolak
  ✓ web_fetch: host di luar izin ditolak
  ✓ web_fetch: batas izin host: example.org.jahat.test ditolak
  ✓ web_fetch: userinfo (jahat@example.org) ditolak
  ✓ web_fetch: 14 URL ditolak => transport TIDAK PERNAH dipanggil (nol permintaan keluar)
  ✓ web_fetch: KONTROL POSITIF https host diizinkan => transport DIPANGGIL 1x + isi kembali
  ✓ web_fetch: KONTROL subdomain host terdaftar DIIZINKAN (sub.example.org)
  ✓ web_fetch: max_chars model di-clamp lalu diteruskan ke transport (batas byte nyata)
  ✓ web_fetch: izin isi web OFF => DITOLAK SEMUA + nol transport (gagal-tertutup)
  ✓ web_fetch: determinisme - lantai 2x identik, eksekutor 2x identik, transport tetap 0
  ✓ Sumber: di jalur web_fetch lantai diperiksa LEBIH DULU, lalu ambil isi, baru transport
  ✓ Sumber: deskripsi web_fetch ke model menyebut HTTPS ONLY + ditolak sebelum permintaan
  ✓ pilihToolTugas() deterministik (2 panggilan identik)
  ✓ bolehDibacaKode() deterministik
  ✓ periksaUrl() deterministik
  ✓ katalog stabil antar-baca (TOOL_NAMES.length tetap)

== RINGKASAN: 95/95 LULUS, 0 GAGAL ==
SEMUA LULUS.
```

Kasus total yang dihitung harness = **95** (24 di antaranya kasus baru grup G3; sisanya kasus lama yang tidak dikurangi/dilunakkan).

`node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr` → **exit 0, 0 galat** (tanpa keluaran).

Determinisme: dua jalanan berturut-turut → keluaran identik, satu-satunya beda adalah 2 kasus lane lain (`bacaKode`) yang masih setengah jadi pada jalanan pertama (92/94), dan sudah hijau pada jalanan berikutnya (95/95). Bukan akibat perubahan di lane ini.

## 5. Apa yang TERBUKTI tanpa app vs apa yang BUTUH APP

TERBUKTI tanpa app (semua di atas, dijalankan hari ini):
* penolakan skema (http/ftp/file/javascript) pada jalur hidup;
* penolakan host internal/privat/metadata/nama-lokal/port tak lazim/allowlist/userinfo;
* nol pemanggilan transport saat ditolak (penghitung di batas JS→Tauri);
* kontrol positif https yang diizinkan → transport dipanggil tepat 1×, argumen `url`/`maxChars` benar;
* gagal-tertutup saat `izinIsiWeb` OFF;
* urutan sumber: lantai diperiksa sebelum `ambilIsiWeb`/`cmd.webFetch`;
* determinisme 2×.

BUTUH APP (ditandai, **tidak** dijalankan; app MATI):
1. bahwa perintah Tauri `web_fetch` di `src-tauri/**` benar-benar tidak dijalankan (butuh log sisi Rust / app hidup). Yang kami ukur hanya batas panggilan JS.
2. perilaku redirect transport asli (https diizinkan → redirect ke http/host lain/IP privat). Lantai ini menilai URL AWAL, bukan URL setelah redirect.
3. apakah UI/pesan penolakan tampil benar ke pengguna di panel.
4. uji DNS-rebinding/TOCTOU (nama lolos allowlist tetapi resolusi mengarah ke IP privat) — perlu transport nyata.

## 6. Kasus LAMA yang menyentuh "http" — tidak diubah, dan kenapa

Di harness ada 4 kasus lama bertema `ambilWeb` (label lama: "G2: lantai https-only hidup di ambilWeb (modul MATI)"): `ambilWeb: SKEMA_IZIN=https: => http DITOLAK`, `ambilWeb: https allowlist DIIZINKAN (kontrol)`, `ambilWeb: izin default = TOLAK SEMUA (IZIN_TOLAK host kosong)`, `ambilWeb: URL ditolak => transport TIDAK dipanggil (nol jaringan)`.
Keempatnya menguji modul **`src/lib/zephyrTools/ambilWeb.ts` yang NOL importer (modul mati)** — bukan jalur hidup `web_fetch`. Keempatnya tetap ada apa adanya dan tetap LULUS; tidak ada satu pun kasus lama yang mengunci keadaan "web_fetch menerima http". Kasus kontrol lama `web_fetch: KONTROL https allowlist DIIZINKAN` juga tidak diubah (masih lulus). Tidak ada kasus lama yang dikurangi atau dilunakkan; grup baru ditambahkan sebagai grup terpisah (G3).
