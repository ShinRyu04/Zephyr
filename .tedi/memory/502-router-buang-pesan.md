# 502 dari ROUTER: Zephyr membuang pesan server, jadi ini terlihat seperti bug sendiri

Ditulis 2026-10-04. User complaint: "AI nya bakal terputus lagi kek 502?" dan
"pdhl sinyal di AI mana pun aman, knp di Zephyr bermasalah". Dua screenshot:
bubble merah "Server provider bermasalah (502) — coba lagi nanti", sementara
task list masih `Running`, `Loop running`, dan `Agent is working...`.

## Temuan 1 - bug Zephyr yang NYATA: pesan router dibuang

`friendly(status)` di `src-tauri/src/ai.rs` hanya memetakan nomor status jadi
kalimat.身体 parsed dari body HANYA lewat:

    serde_json::from_str::<Value>(&raw).ok()
        .and_then(|v| v.pointer("/error/message")...)

**Kenapa itu salah untuk kasus 502:** sebuah ROUTER/gateway (proxy ke banyak
upstream) menjawab 502 dengan **halaman HTML atau teks polos**, bukan JSON.
Persis untuk layout provider yang paling mungkin 502, `detail` selalu kosong,
jadi user melihat kalimat telanjang tanpa satu kata pun dari server.

user-nya juga memakai Custom provider (`https://modelrouter.id/v1`) - jadi
kasus yang dilaporkan persis kasus yang paling tertimpa.

Perbaikan: helper `pesan_http(status, raw, model, url)`.
- pakai `/error/message` bila ada (JSON)
- kalau tidak: raw body, whitespace dirapatkan, dipotong 240 karakter
- **tambahkan model + host**: dengan satu gateway melayani banyak model, nama
  model adalah fakta paling berguna di pesan itu
Tiga jalur error (streaming, chat, ask) semuanya diganti.

**Pelajaran:** pesan error dari server yang bukan JSON adalah kasus NORMAL,
bukan tepi. Kalau parser hanyaيدة JSON, layout yang paling sering gagal
justru yang paling sedikit memberi kabar.

## Temuan 2 - state nyangkut: task列表 `Running` setelah run mati

Keluar gagal di `aiStore.ts` (sekitar `set({ agentPhase: 'idle', ... })`)
tidak pernah menyentuh `agentTodos`. Task yang di-set `in_progress` oleh model
tetap begitu, dan UI menampilkannya sebagai **Running** - terlihat seperti
masih bekerja padahal run-nya sudah mati.

Perbaikan: task `in_progress` di-reset jadi `pending` (dan `startedAt`/
`endedAt` dibersihkan) HANYA saat `agentFailure` truthy. `pending` = belum
selesai, itu status yang benar.

## Temuan 3 - akar sebenarnya: Zephyr mengukur request terhadap MODEL, bukan GATEWAY

Bukti dari dashboard ModelRouter: `deepseek-v4.1-flash` sukses 99.65%, latency
16s, dan web/Hermes/TEDI/opencode lancar ke router yang sama. Jadi bug Zephyr.

`jendelaKonteks('deepseek-v4.1-flash')` tidak ada di katalog -> fallback
`128_000` token. Auto-compact menyala di `0.8 * 128k` = 102.400 token = sekitar
410.000 karakter. Itu jendela MODEL. Yang menolaknya adalah GATEWAY, yang punya
batas body dan kesabaran sendiri. Tidak ada estimasi token yang bisa melihat
batas transport itu.

Saluran sebenarnya: `ringkasRiwayat` hanya memotong apa yang KELUAR dari working
window (`HISTORY_KEEP_STEPS * 2`). Semua yang di dalam window dikirim utuh.
Begitulah cara agent run bisa 502 sementara chat di app yang sama lancar - chat
kirim satu pesan pendek.

Perbaikan: `PAYLOAD_MAX_CHARS = 120_000` + `ringkasUkuran()` (contextBudget.ts,
fungsi murni, tanpa store). Tiga corollary:

1. **buang gambar lama DULU**. Screenshot base64 itu sekitar 99% isi request;
   memotong teks sambil gambarnya tetap ada tidak akan pernah sampai ke cap,
   sehingga langkah berikutnya harus membuang SELURUH turn. Dengan urutan yang
   benar: 2.7 MB -> 102k dan percakapan tetap utuh. Versi salah urutan: -> 316.
2. pendekkan isi tool/assistant lama ke stub 300 karakter.
3. buang pesan lama utuh; pasangan assistant+tool dibuang bersama karena tool
   yatim adalah error protokol dan menggagalkan seluruh request.

System prompt tidak pernah disentuh, turn terbaru selalu disimpan.

## Temuan 4 - Retry-After diabaikan

`kirim_dengan_ulang` (ai.rs) retry 429/5xx dengan tangga tetap 400ms/1.2s, jadi
gateway yang sudah bilang "tunggu 30 detik" tetap dihajar. Sekarang
`retry_after_ms()` membaca Retry-After bentuk detik maupun HTTP-date (chrono,
tanpa crate baru), dibatasi 20 detik agar tombol Stop tetap responsif.

## Temuan 5 - cap hanya di jalur agent, dan tidak memperhitungkan daftar tool

`' chatting `ringkasRiwayat` HANYA dipanggil di agent loop. `cmd.aiChat`
mengirim `messages: history` polos. Chat tidak tersingat karena satu pesan
kecil, tapi percakapan panjang + beberapa screenshot membangun body sebesar
agent - cuma butuh lebih banyak giliran.

Yang lebih halus: `tools: agentToolSpecs(...)` ikut di setiap request agent,
dan itu BUKAN bagian dari history. Cap yang diukur di history saja membuat
body meleset sebesar katalog tool. Diperbaiki dengan mengukur overhead tools
sungguhan saat runtime (`ukuranPayload([toolSpecs]) + 2048`), bukan menyisakan
angka tetap - jadi tetap benar saat tool ditambah atau dimatikan, dan untuk
semua provider.

## Yang BUKAN bug (dan tidak diklaim)

- base URL custom DIHORMATI. `get_public_models` → `provider = 'custom'`,
  dan default_base('custom') = base_url yang disimpan. Model `deepseek-...`
  tidak dialihkan ke api.deepseek.com.
- Retry 5xx di `kirim_dengan_ulang` sudah benar (5xx → delay, 4xx lain →
  gagal). Yang berubah barusan cuma ISI pesannya.
- Checkpoint sengaja TIDAK disimpan kalau gagal di step 0 (`akhir.trim()`
  kosong). Itu benar: belum ada tool yang jalan, "lanjut" hanya mengulang
  kegagalan yang sama.

## Kenapa app lain "aman" (jawaban untuk user)

Bukan karena Zephyr punya masalah sendiri, tapi:
1. Zephyr mode agent mengirim **riwayat penuh tiap step** (system prompt +
   status + semua hasil tool + screenshot base64). App chat biasa: satu pesan
   pendek. Payload raksasa paling gampang ditolak gateway.
2. App besar punya multi-region + retry diam-diam + fallback model. Satu
   server batuk, mereka pindah sendiri. Zephyr satu endpoint.
3. `GET /models` (Test connection) kecil → 200, padahal `POST
   /chat/completions` (agent) besar → 502. Makanya "Test connection OK"
   TIDAK membuktikan agent akan jalan. Ini yang bikin user bingung.

## Harness

- `scripts/cek-cap-payload.mjs` 11/11 (cap payload, urutan pembuangan, jalur chat)
- `scripts/cek-think-calculator.mjs` 6/6 (tool OpenJarvis)
- `scripts/verify-lanjut2.mjs` 4/4 (checkpoint resume)
- `scripts/verify-antrean-gagap.mjs` 6/6
- `cargo check --lib` bersih, `npx tsc --noEmit` bersih

## Jebakan PowerShell lagi

`format!("{}…", ...)` lewat bash_run/PowerShell menghasilkan byte rusak
(`{ }c`) di keluaran terminal. Berkasnya sendiri utuh - hanya TAMPILAN terminal
yang salah. tetap saja: periksa dengan read_file, dan repairs via tool `edit`.