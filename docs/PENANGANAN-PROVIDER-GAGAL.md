# Penanganan Provider Gagal (item 158 — rancangan minimal)

Rancangan ini **belum dikerjakan**. Semua yang ditulis di sini adalah **usulan**:
berkas yang harus berubah (`src/lib/aiStore.ts`, `src/lib/contextBudget.ts`,
`src/lib/modelCatalog.tsx`) **milik lane lain**, jadi lane ini hanya membaca dan
mengusulkan, tidak menyunting.

Cara memeriksa: semua nomor baris di bawah dibaca langsung dari berkas pada sesi
ini (bukan dari ingatan).

## 1. Yang SUDAH ada (terverifikasi)

| Bagian | Bukti | Isi |
| --- | --- | --- |
| Klasifikasi error | `src/lib/aiStore.ts:2021–2055` | `isRetryableAgentProviderError` — 401/403/400/404/unauthorized/forbidden/invalid request/not found/cancel/tool call/malformed → permanen (`:2023–2035`); **408/429/500/502/503/504 → retryable (`:2036`)**; timeout & "stream terputus" → retryable (`:2037`, `:2052`); sisanya hanya kalau menyebut koneksi/DNS (`:2054`) |
| Tangga retry cepat (agent) | `aiStore.ts:1998` | `AGENT_PROVIDER_RETRY_DELAYS = [1000, 2500]` — dua percobaan cepat untuk blip sesaat |
| Tangga tunggu-pulih (agent) | `aiStore.ts:2100` | `TUNGGU_PULIH_DELAYS = [4000, 12000, 22000]` → **~38 detik total**, dengan hitungan fase di `:2108–2110` |
| Status terlihat saat menunggu | `aiStore.ts:2113–2120` | teks progres "Menunggu provider pulih (i/3, … dtk, total ~38 dtk dari ~38 dtk) karena <sebab> — Stop untuk hentikan" |
| Pemakaian jalur agent | `aiStore.ts:5921`, `:5932–5944` | retry ladder → kalau masih gagal masuk fase tunggu-pulih (`faseTungguPulih < TUNGGU_PULIH_DELAYS.length`) |
| Pindah model (fallback) | `aiStore.ts:5965–5979` | **hanya jalur agent**, `pilihModelCadangan(activeDef, MODEL_FALLBACK, hasKey)` — sekali per run (`sudahFallback`), dan perpindahan **diumumkan** ke user: `"<model> bermasalah (<sebab>) - beralih ke <cadangan>"` |
| Daftar cadangan | `src/lib/contextBudget.ts:282` (`pilihModelCadangan`), `src/lib/modelCatalog.tsx:249` (`MODEL_FALLBACK`) | urutan: model lain di provider yang sama dulu, baru provider lain yang sudah punya kunci |
| Retry jalur chat | `aiStore.ts:4759–4805` | `RETRY_CHAT = [1200, 3000]` → maksimum 3 percobaan, jeda 1,2 dtk lalu 3 dtk; `resetTeksRetry` mengosongkan teks parsial agar jawaban percobaan kedua tidak menumpuk di percobaan pertama |
| Keluar dengan error jujur | `aiStore.ts:4806–4809` | kalau ketiga percobaan gagal: `onChunk({ err })` + `done` |

Ringkas: **jalur agent sudah bagus** (klasifikasi → 2 retry cepat → 3 fase tunggu-pulih ~38 dtk → 1× pindah model → error jujur, semuanya dengan status terlihat dan tombol Stop hidup).

## 2. Cacat yang terverifikasi

### G1. Jalur chat tidak punya tangga jeda maupun cadangan (gap utama)

`aiStore.ts:4759–4805` (dibaca apa adanya): jalur chat hanya punya `RETRY_CHAT = [1200, 3000]`.
Tidak ada fase tunggu-pulih (`TUNGGU_PULIH_DELAYS` tidak dipakai di rentang ini) dan
tidak ada `pilihModelCadangan` di rentang ini. Akibatnya, saat provider kena 429
lebih dari ~4,2 detik (kasus nyata: limit 60 permintaan/menit yang dibagi banyak
lane), **chat menyerah jauh lebih cepat daripada agent**, padahal chat justru
paling murah dan paling aman untuk dicoba ulang: tidak ada tool, tidak ada tulisan
lokal, tidak ada yang bisa ter-replay (komentar di `:4752–4757` sendiri yang
menyatakan ini).

### G2. Pesan akhir tidak memberi jalan keluar

`aiStore.ts:4806–4809` mengirim `err: terakhirErr` apa adanya. Yang dilihat user
adalah teks error provider (mis. "429 Too Many Requests"), tanpa satu pun langkah:
tidak ada "coba lagi", tidak ada "provider X juga punya kunci", tidak ada
"Settings → Provider". Untuk 429 yang berulang, user tidak tahu bahwa yang salah
adalah limit, bukan kuncinya.

### G3. Komentar basi (dokumentasi, bukan perilaku)

- `aiStore.ts:2086` — komentar menyebut `[15s, 30s, 60s] (~105s)`.
- `aiStore.ts:5925–5926` — "jeda bertingkat (15s, 30s, 60s) dengan status terlihat, lalu coba lagi. Total ~105 detik."

Nilai yang benar-benar dipakai ada di `:2100`: `[4000, 12000, 22000]` → **~38 detik**, dan
teks progres di `:2120` sudah melaporkan ~38 dtk. Jadi komentar di dua tempat itu
menyesatkan siapa pun yang menyetel ulang tangga jeda. Ini cacat teks; perilakunya benar.

### G4. Pemulihan "provider pulih" tidak memeriksa ketersediaan kunci provider lain

`pilihModelCadangan` dipanggil dengan `hasKey` (`aiStore.ts:5969`), jadi ia memang
menghormati kunci yang ada — tetapi **tidak ada** penyaringan berbasis kata kunci
provider gagal, sehingga cadangan bisa jatuh ke provider yang limit-nya persis sama
(tidak salah, hanya kurang tajam). Ini usulan perbaikan, bukan bug.

## 3. Rancangan minimal (usulan tambalan)

Urutan tindakan yang diinginkan: **deteksi 429 → coba ulang dengan jeda bertambah →
pindah provider cadangan → pesan jelas kalau semuanya gagal.**

### 3.1 Deteksi 429 (sudah ada, pakai apa adanya)

`isRetryableAgentProviderError` (`aiStore.ts:2021`) sudah mengembalikan `true` untuk 429
(`:2036`). Tidak perlu diubah. Yang perlu: **perlakukan 429 berbeda dari 500/503**, karena
429 punya obat yang jelas (tunggu sesuai `Retry-After`, kurangi permintaan), sedangkan
5xx tidak.

### 3.2 Tangga jeda bertambah di jalur chat

Tempalan yang diusulkan (di sekitar `aiStore.ts:4759`):

```ts
/* Tangga chat: satu percobaan cepat, lalu tiga fase tunggu-pulih yang SAMA
   dengan jalur agent - chat bahkan lebih aman untuk diulang (tanpa tool,
   tanpa tulisan lokal). Sebelumnya chat menyerah setelah ~4,2 dtk. */
const RETRY_CHAT = [1200, 3000] as const;
```

lalu di blok `catch` (`aiStore.ts:4794–4804`), sebelum `break` terakhir, tambahkan fase
tunggu pulih memakai konstanta yang sudah ada:

```ts
} catch (e) {
  const msg = cmd.asZephyrError(e).message;
  terakhirErr = msg;
  if (!isRetryableAgentProviderError(msg)) break;
  if (faseChatPulih < TUNGGU_PULIH_DELAYS.length && !cancelled.has(reqId)) {
    // pakai ulang helper yang sudah ada, teks progres sudah bahasa Indonesia
    const lanjut = await tungguProviderPulihAgent(
      (p) => get().setAgentProgress({ ...p }),
      msg,
      faseChatPulih,
    );
    faseChatPulih += 1;
    if (lanjut) continue;
  }
  if (retry === RETRY_CHAT.length) break;
  if (cancelled.has(reqId)) break;
}
```

Catatan penting untuk pelaksana: `tungguProviderPulihAgent` (`aiStore.ts:2102`) memakai
`setAgentProgress` (jalur agent). Untuk chat, teks progres perlu jalur chat
(`onChunk`) atau bubble chat yang bisa menampilkan status — kalau tidak, status
tunggu tidak terlihat di chat. **Ini bagian yang butuh keputusan pemilik `aiStore.ts`**,
bukan sesuatu yang bisa ditebak dari luar.

### 3.3 Pindah provider cadangan

```ts
/* Fallback: satu kali per giliran chat. Sama seperti agent (aiStore.ts:5965),
   tapi TIDAK mengubah history model. Hanya untuk error retryable. */
if (!sudahFallbackChat && isRetryableAgentProviderError(terakhirErr)) {
  const cadangan = pilihModelCadangan(activeDef, MODEL_FALLBACK, (p) => useSettingsUi.getState().hasKey(p));
  if (cadangan) { sudahFallbackChat = true; def = cadangan; continue; }
}
```

Syarat yang harus dijaga: perpindahan **diucapkan** (jangan senyap) — agent sudah
melakukannya di `:5976–5979`, chat harus melakukan hal yang sama, dan `sessionId`
(`aiStore.ts:4790`) tetap dipakai agar cache prompt percobaan baru tidak sia-sia.

### 3.4 Pesan jelas kalau semua gagal

Ganti `onChunk({ err: terakhirErr })` (`aiStore.ts:4807`) dengan pesan yang menyebut apa
yang sudah dicoba, dalam bahasa aktif:

```
jawabanGagal(sebab, upaya) =
  /429|rate.?limit|kuota/i.test(sebab)
    ? 'Provider menolak karena limit permintaan (429). Sudah dicoba ulang 3× dengan jeda '
      + 'bertambah dan model cadangan. Tunggu ~1 menit lalu kirim ulang, atau kecilkan '
      + 'percakapan (riwayat panjang ikut menghabiskan limit).'
    : 'Provider gagal menjawab (' + sebab + '). Sudah dicoba ulang ' + upaya + '× tanpa hasil.'
      + ' Cek kunci dan status provider di Settings → Providers.'
```

Kaidah: pesan **menyebut jumlah percobaan** dan **satu aksi yang bisa dilakukan user**;
jangan menyembunyikan sebab asli error (sebab tetap dilampirkan, tapi bukan seluruh pesannya).

## 4. Yang TIDAK boleh dilakukan

- Jangan menambah retry untuk error permanen (401/403/400/404/malformed): `:2023–2035`
  sudah benar melarangnya, dan menambahnya hanya membuat user menunggu lebih lama
  untuk error yang sama.
- Jangan menyentuh `AGENT_PROVIDER_RETRY_DELAYS`/`TUNGGU_PULIH_DELAYS` tanpa mengubah
  komentar basi di `:2086` dan `:5925–5926` sekaligus (G3).
- Jangan menaikkan jumlah fallback menjadi berkali-kali: `:5957–5963` sudah menjelaskan
  alasannya (model salah / kunci salah akan gagal lagi dan membuang dua round-trip).

## 5. Cara menguji (kalau nanti dikerjakan)

| Uji | Tanpa app? | Cara |
| --- | --- | --- |
| Klasifikasi 429 vs 400 | ya | impor `isRetryableAgentProviderError` — tapi ia tidak diekspor; usulkan ekspor cukup untuk uji, atau uji lewat jalur nyata |
| Jumlah percobaan + jeda | tidak | mock provider yang selalu 429, hitung jumlah request yang diterima mock (pola yang sudah dipakai `scripts/cek-pengetahuan-2lapis.mjs` — mock di `127.0.0.1:8098`) |
| Pesan akhir | tidak | mock yang selalu gagal; periksa teks bubble ChatMessage |
| Fallback benar-benar pindah | tidak | mock menolak model pertama, menerima model kedua; periksa progres menyebut nama model cadangan |

Status sekarang: **TIDAK DIUJI** — tidak ada mock 429 yang dijalankan pada sesi ini.
