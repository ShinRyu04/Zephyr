# USULAN — Pane & Kurs: agar jalur ini bisa dijalankan agen TANPA manusia

Status: **usulan**. Tidak satu pun berkas bersama di bawah ini disunting oleh
penulis usulan (aturan repo: perubahan di berkas bersama = tulis usulan, jangan
tempel). Tiap usulan menyebut **berkas + baris + teks lama + teks baru**; semua
teks "lama" diambil apa adanya dari disk saat usulan ini ditulis, jadi bisa
diverifikasi dengan `sed -n '<baris>p' <berkas>` sebelum ditempel.

Empat penghalang nyata yang membuat jalur pane→sumber→tulis→verifikasi masih
BUTUH APP (lihat `docs/LAPORAN-PANE-DAN-KURS.md`):

1. panel belum punya tab/command untuk membuka pane browser dari store;
2. `browser_open` kembali **sebelum** halaman siap dibaca, jadi langkah berikutnya
   berbalapan dengan pemuatan halaman;
3. izin isi web (`izinIsiWeb`) mati secara bawaan dan hanya bisa dinyalakan
   manusia lewat Settings — agen tidak punya jalur sah untuk itu;
4. tidak ada kunci antar-lane, sehingga mengemudikan app hidup (aturan iv)
   bergantung pada ingatan manusia/agen lain yang sedang menyunting `src/**`.

---

## U1 — panelStore: tab "Browser" supaya pane bisa dibuka dari store

- **Berkas:** `src/lib/panelStore.ts`
- **Baris:** 12 dan 24

**Teks lama (baris 12):**

```ts
  | 'subagents';
```

**Teks baru:**

```ts
  | 'subagents'
  | 'browser';
```

**Teks lama (baris 23-24):**

```ts
  { id: 'subagents', label: 'Subagents', command: 'subagentsPanel.focus' },
];
```

**Teks baru:**

```ts
  { id: 'subagents', label: 'Subagents', command: 'subagentsPanel.focus' },

  { id: 'browser', label: 'Browser', command: 'browserPanel.focus' },
];
```

Catatan wajib saat menerapkan: perintah `browserPanel.focus` harus benar-benar
terdaftar di registri perintah app (kalau belum ada, tambahkan perintahnya di
berkas registri yang sama tempat `terminalPanel.focus` didaftarkan) — kalau
tidak, tombol tabnya mati tanpa keluhan. `TAB_LAMA` (baris 14) sengaja TIDAK
diubah: tab baru tidak boleh ikut dipaksa muncul untuk pengguna lama.

**Cara uji:** `node scripts/uji-pane-kurs-rencana.mjs` — kasus K2/K3 membaca
`panelStore.ts:16` dan `:20` apa adanya; tambahkan satu rujukan baru
`{berkas:'src/lib/panelStore.ts', baris:25, harus:"command: 'browserPanel.focus'"}`
ke langkah `L1` rencana di dalam harness supaya perubahan ini terjaga.

---

## U2 — `browser_open`: tunggu pane benar-benar bisa dibaca

Sekarang `browser_open` mengembalikan pesan begitu pane dibuat, tanpa jaminan
halamannya sudah bisa dibaca. Agen lalu harus menebak-nebak kapan memanggil
`browser_read`. Ganti dengan penantian eksplisit.

- **Berkas:** `src/lib/zephyrTools/web.ts`
- **Baris:** 459-461 (badan `run` milik `browser_open`; spec-nya di baris 443)

**Teks lama:**

```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      /* Pagar isi web: URL yang tidak diizinkan tidak pernah sampai ke pane -
```

**Teks baru:**

```ts
    run: async (a) => {
      const url = wajib(a, 'url');
      const tungguMs = bacaAngka(a.wait_ms, 0) ?? 0;
      /* Pagar isi web: URL yang tidak diizinkan tidak pernah sampai ke pane -
```

Lalu di akhir `run` (setelah pane dibuat/dinavigasikan, sebelum `return`),
tunggu sampai isi halaman benar-benar terbaca memakai jalur baca yang SUDAH ADA
(`bacaHalamanMentah(paneId)`, jalur yang dipakai `browser_read`, run di
`web.ts:588`) dengan batas waktu `tungguMs`:

```ts
      if (tungguMs > 0) {
        const batas = Date.now() + tungguMs;
        for (;;) {
          const isi = await bacaHalamanMentah(paneId).catch(() => '');
          if (isi) break;
          if (Date.now() > batas) return `Pane ${paneId} dibuka, tetapi isi belum siap dalam ${tungguMs} ms.`;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
```

Tambahkan juga parameter di spec (baris 451 adalah awal blok `new_pane`):

**Teks lama (baris 451-452):**

```ts
          new_pane: {
            type: 'boolean',
```

**Teks baru:**

```ts
          wait_ms: {
            type: ['number', 'string'],
            description: 'Tunggu sampai isi pane terbaca (ms) sebelum kembali; 0 = tidak menunggu (perilaku lama).',
          },
          new_pane: {
            type: 'boolean',
```

Catatan saat menerapkan: pastikan `bacaAngka` tersedia di `web.ts` (impor dari
`./builtins`); kalau belum, tambahkan di daftar impor yang sudah memuat `wajib`.
Nama variabel `paneId` harus disesuaikan dengan nama nyata di badan `run`
(letaknya di bawah baris 459, sesudah cabang "pane yang sudah membawa URL ini
dipakai ulang").

**Cara uji:** buka pane ke sumber kurs dengan `wait_ms=8000`, lalu panggil
`browser_read` dan pastikan isinya bukan halaman kosong.

---

## U3 — tool baru `browser_wait_ready` (jalur tanpa mengubah `browser_open`)

Kalau U2 dianggap terlalu berisiko pada tool yang sudah dipakai, ini varian
tambah-saja: tool baru disisipkan tepat sebelum `browser_list`.

- **Berkas:** `src/lib/zephyrTools/web.ts`
- **Baris:** 744

**Teks lama:**

```ts
      name: 'browser_list',
```

**Teks baru:**

```ts
      name: 'browser_wait_ready',
      description: 'Tunggu sampai isi pane browser bisa dibaca (pane siap), atau laporkan bahwa waktunya habis.',
      parameters: {
        type: 'object',
        properties: {
          paneId: { type: 'string', description: 'ID pane yang ditunggu.' },
          timeout_ms: { type: ['number', 'string'], description: 'Batas tunggu dalam milidetik (bawaan 8000).' },
        },
        required: ['paneId'],
      },
    },
    run: async (a) => {
      const id = wajib(a, 'paneId');
      const batas = Date.now() + (bacaAngka(a.timeout_ms, 8000) ?? 8000);
      for (;;) {
        const isi = await bacaHalamanMentah(id).catch(() => '');
        if (isi) return `Pane ${id} siap (${isi.length} karakter terbaca).`;
        if (Date.now() > batas) return `Pane ${id} belum siap: waktu tunggu habis.`;
        await new Promise((r) => setTimeout(r, 250));
      }
    },
  },
  {
    spec: {
      name: 'browser_list',
```

(`{` / `spec: {` pembuka entri baru harus mengikuti bentuk entri tetangga di
sekitar baris 744; potongan di atas ditulis lengkap supaya mudah ditempel.)

---

## U4 — `mcp__zephyr__pane`: action `waitReady`

Supaya klien MCP (termasuk agen yang memakai `mcp.ts`, bukan `web.ts`) punya
cara menunggu tanpa balapan.

- **Berkas:** `src/lib/zephyrTools/mcp.ts`
- **Baris:** enum action di dalam spec `mcp__zephyr__pane` (name di baris 575)

**Teks lama:**

```ts
              'nextTab',
              'prevTab',
              'focus',
```

**Teks baru:**

```ts
              'nextTab',
              'prevTab',
              'focus',
              'waitReady',
```

Lalu di penanganan action (percabangan yang sama dengan `focus`), tambahkan
cabang `waitReady` yang menunggu ringkasan keadaan jendela stabil (dua pembacaan
berurutan identik) sebelum mengembalikan ringkasan — pola yang sama dipakai
aplikasi MCP saat memastikan pane benar-benar menggantung. `mcp.ts:561` adalah
contoh run ringkas (`focus_pane`) untuk diikuti bentuknya.

---

## U5 — izin sumber data terbuka: jalur live tidak menunggu manusia

Hari ini `web_fetch`/`web_search` ditolak dengan `izin-isi-web-mati` selama
`izinIsiWeb` false, dan hanya manusia yang bisa menyalakannya lewat Settings
(`kebijakanIsiWeb.ts:69` field, `:97` kebijakan bawaan, `:117` pembacaan
setelan, `:199` titik penolakan). Akibatnya jalur "agen ambil data" selalu
BUTUH MANUSIA. Usul: daftar host terbuka untuk sumber statistik resmi masuk
sebagai bawaan, sementara host lain TETAP default-tolak.

- **Berkas:** `src/lib/zephyrTools/kebijakanIsiWeb.ts`
- **Baris:** 117

**Teks lama:**

```ts
  izinIsiWeb: s.izinIsiWeb === true,
```

**Teks baru:**

```ts
  izinIsiWeb: s.izinIsiWeb === true,
  /* Sumber data terbuka yang dipakai jalur agen tanpa manusia. Host di luar
     daftar ini TETAP ditolak - daftar ini menambah, bukan melonggarkan. */
  allowlist: [...new Set([...(s.allowlist ?? []), 'api.worldbank.org', 'www.bi.go.id'])],
```

Catatan saat menerapkan: periksa apakah literal yang sama sudah punya kunci
`allowlist` (kalau ada, gabungkan, jangan menambah kunci kedua — duplikat kunci
akan ditolak `tsc`); nama field dan posisinya wajib cocok dengan
`interface KebijakanIsiWeb` (mulai baris 68 di berkas yang sama).

Alternatif yang lebih sempit (kalau pemilik repo tidak mau menyentuh izin):
biarkan `izinIsiWeb` apa adanya, dan tetapkan lewat dokumen bahwa jalur data
resmi memakai `bash_run` + `curl` (perintah nyata `builtins.ts:1187`) — itu jalur
yang dipakai hari ini dan nilainya sah selama URL-nya dicantumkan di dokumen
hasil (persis seperti `docs/kurs-dollar.md`).

---

## U6 — kunci antar-lane supaya aturan (iv) ditegakkan mesin

Aturan (iv) hari ini hanya dijaga ingatan: "jangan mengemudikan app selagi ada
agen lain menyunting `src/**`". Usul: kunci berkas + helper kecil.

- **Berkas baru:** `scripts/lib-lane.mjs`

```js
/* Kunci antar-lane: harness yang MENGEMUDIKAN app wajib memegang kunci ini;
   harness yang hanya membaca (uji-*.mjs deterministik) tidak perlu. */
export function ambilKunci(nama, { ttlMs = 10 * 60 * 1000 } = {}) { /* ... */ }
export function lepasKunci(nama) { /* ... */ }
export function adaPenyunting() { /* true kalau kunci 'sunting-src' hidup */ }
```

Aturan yang ditetapkan dokumen setelah helper ini ada:

1. Harness pengemudi app (`:9223`) memanggil `ambilKunci('cdp')` di awal dan
   `lepasKunci('cdp')` di akhir, dan **berhenti** kalau `adaPenyunting()`.
2. Lane yang menyunting `src/**` memegang `ambilKunci('sunting-src')`; lane CDP
   berhenti dengan pesan jelas + exit 0 (bukan gagal senyap).
3. Harness deterministik seperti `scripts/uji-pane-kurs-rencana.mjs` tidak
   memanggil apa pun dari helper ini — ia memang nol CDP.

Dengan begitu, jalur live bisa dijalankan agen tanpa manusia TANPA mematikan
kerja agen lain dengan HMR, dan kejadian "harness CDP membunuh slot agen lain"
tidak lagi bergantung pada ingatan.

---

## Urutan penerapan yang disarankan

1. **U5 (alternatif sempit)** — nol risiko, hanya dokumen: jalur data resmi lewat
   `bash_run`+`curl`, sumber dicantumkan di hasil. Ini yang sudah terbukti hari ini.
2. **U1** — tab Browser: kecil, mudah dinilai, tidak menyentuh jalur data.
3. **U4** lalu **U2/U3** — menunggu pane siap; U4 dulu karena tidak mengubah
   perilaku `browser_open` yang sudah dipakai.
4. **U6** — terakhir, karena berguna tepat saat ketiga usulan sebelumnya membuat
   jalur live benar-benar ingin dijalankan paralel.

Semua usulan di atas menuntut `tsc` tetap 0 galat
(`node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr`)
dan `node scripts/uji-pane-kurs-rencana.mjs` tetap `== 18/19 lulus ==` dengan
`gagal: 0` setelah ditempel.
