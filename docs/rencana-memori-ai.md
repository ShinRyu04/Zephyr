# Rencana: Memori Persisten AI Zephyr (lintas sesi)

Status: rencana. Tanggal: 2026-10-13. Semua angka di bawah diukur pada build yang berjalan di mesin ini
(data_dir `C:\Users\Zyrex\AppData\Roaming\zephyr`, WebView2 `com.zephyr.editor`, CDP 9223).

## 1. Ringkasan

Zephyr **sebenarnya sudah punya tiga saluran memori**, tapi tidak satu pun dipakai penuh:

| Saluran | Lokasi | Isi sekarang (terukur) | Disuntik ke prompt? |
|---|---|---|---|
| Riwayat chat | `localStorage:zephyr.ai.sessions.v1` (leveldb WebView2) | **511.707 byte**, 1 sesi, 19 pesan (9 user / 10 asisten) | Hanya **2 pesan terakhir** (`aiStore.ts:4977`) |
| Memori global AI | `%APPDATA%\zephyr\memory.md` + `user.md` | **belum ada berkasnya**; `memory_read` => `memory_chars 0/2200`, `user_chars 0/1375` | Ya, tapi kosong (`agent_context` => `""`) |
| Memori proyek | `<proyek>\.zephyr-context.md` | `D:\Zephyr\.zephyr-context.md`, **622 byte**, terakhir diubah 2026-10-12 23:24 | Ya, mentah, cap 6000 char |

Kesimpulan: masalah user bukan "tidak ada penyimpanan", tapi **tidak ada yang menulis memori penting, dan yang tersimpan sebagian besar tidak pernah dibaca kembali**.

## 2. Bukti apa yang bertahan vs hilang (diverifikasi)

### 2.1 Bertahan lintas restart (fakta, diukur)

- **Riwayat chat + judul + model per sesi**: `localStorage['zephyr.ai.sessions.v1']`, 511.707 byte saat probe; 20 sesi terakhir, 200 pesan/sesi (`aiStore.ts:138,2286,2803-2813,2805`).
- **Tool card beserta hasilnya**: disimpan `result` sampai `PERSIST_TOOL_CHARS = 4000` char (`aiStore.ts:148,2810`) dan **dirender ulang di UI** (`src/components/ai/ChatMessage.tsx:452`).
- **Memori proyek per folder**: `.zephyr-context.md` ada di disk, 622 byte, isi nyata:
  ```
  ## Tugas terakhir
  gua mau nnya ,sbnarnya extension di zephyr bisa dipake apa ngga sih ?
  ## Rencana
  - (diisi agen lewat todo_write)
  ## Berkas dibuat / diubah
  - (tidak ada berkas baru)
  ## Hasil run
  - Tugas: jelasin smuanya gimna
  - Status: berhenti (cancelled)
  - Langkah terpakai: 1
  ```
- **Preferensi & setting**: `settings.json` (personaAktif `zeph`, customInstructions, model, tema). Catatan/todo user juga ikut: `settings.notesTodos` (`notesTodosStore.ts:91-100`).
- **Tab editor yang terbuka**: `%APPDATA%\zephyr\session.json` (`fs_utils.rs:459,474`) — isinya sekarang `[]`.
- **Snapshot berkas (undo lintas sesi)**: `%APPDATA%\zephyr\history\<hash>\*.snap` + `meta.json` (200 snap / folder, 30 hari; `history.rs:143,261-280`). Bukan memori AI.
- **Penyimpanan yang memang kosong**: `memory.md`/`user.md` **tidak ada** di `%APPDATA%\zephyr` (daftar folder: `extensions, history, logs, lsp, plugins, tool-output, keybindings.json, mcp.json, recent.json, secrets.json, session.json, settings.json, trust.json`). Terkonfirmasi juga dari app hidup: `memory_read` => `{"memory":"","user":"","memory_chars":0,"user_chars":0,"memory_limit":2200,"user_limit":1375}`.

### 2.2 Hilang / tidak pernah dibaca kembali (ini yang dikeluhkan)

1. **Giliran lama tidak dikirim ke model.** Konteks jalur agen hanya `prevSemua.slice(-2)` (1 user + 1 asisten terakhir) — `aiStore.ts:4970-4977`. Sesi ke-10 dan sesi ke-11 identik dari sisi model kalau tugasnya baru.
2. **Hasil tool tersimpan tapi tidak pernah dikirim ulang.** `persist()` menyimpan `m.tools[].result` (4000 char), tapi pengiriman berikutnya hanya mendorong `{role, content}` (`aiStore.ts:4978-4985`). Jadi AI "lupa" isi grep/test yang dia sendiri jalankan, walau UI masih menampilkannya.
3. **`memory.md`/`user.md` kosong dan tool-nya tersembunyi.** Penalaran lengkap ada di Rust (`memory.rs:56-212`) dan disuntik lewat `agent_context` (`skills.rs:409-414`), tapi:
   - tool `notes_read`/`notes_write` (`zephyrTools/builtins.ts:1831,1848`) **tidak ada di daftar 17 tool yang dikirim setiap langkah** (`zephyrTools/catalog.ts:508` = `TOOL_DIKIRIM_SELALU`, isinya `read_file, write_file, edit, multi_edit, replace_in_files, delete_file, list_directory, create_directory, grep, glob, bash_run, bash_background, bash_logs, todo_write, lsp_definition, ...`). Model harus `tool_search` dulu baru `tool_call`.
   - System prompt **tidak menyebut** `notes_read`/`notes_write` sama sekali (grep: nol kecocokan di `src/lib/systemPrompt.ts` selain kata "memori" untuk `.zephyr-context.md`).
   - Akibatnya terukur: `agent_context` mengembalikan **string kosong** (0 karakter kontribusi ke prompt).
4. **`.zephyr-context.md` menimpa riwayatnya sendiri.** `catatHasilKonteks` (`aiStore.ts:1318-1361`, helper `gantiBagian` di baris 1309) **mengganti utuh** dua bagian pada tiap keluar run: `## Berkas dibuat / diubah` dan `## Hasil run` (termasuk "Rencana saat run berakhir"). Yang kelihatan: hasil run berstatus `cancelled`, langkah 1, rencana "(tidak ada rencana)" — keputusan run sebelumnya sudah tertimpa, dan berkasnya basi 18 jam walau ada run setelahnya.
5. **`/compact` membuang aslinya.** `compactContext` (`aiStore.ts:3819-3868`) mengganti semua pesan lama dengan satu pesan ringkasan berisi 4 pesan terakhir x 160 char, lalu `persist` — tak ada cadangan berkas. Auto-compact (`aiStore.ts:1148-1237`) aman: hanya memengaruhi riwayat run di memori, tapi konsekuensinya ringkasannya juga hilang begitu app mati.
6. **Todo run tidak ikut disimpan di mana pun yang dibaca ulang.** `todo_write` => state run (`agentTodos`) + kartu tool; yang bertahan hanya teks kartunya, dan itu pun tidak dikirim ulang (poin 2).
7. **Tidak ada UI memori Zephyr.** Yang ada hanya memori agen CLI: `CliSlashPanel.tsx:481` (MemoryPanel / CLAUDE.md) dan `CodexSettings.tsx:228` (memories Codex). Section setelan Zephyr hanya: `mode, agent, context, subagent, tools, rules, models, appearance, session, advanced` (`ChatSettingsPage.tsx:71-82`) — **tidak ada "Memory"**. Toggle "Save memory" di `ChatSettingsPage.tsx:969` adalah `general.lowRam` (hemat RAM), bukan memori AI.
8. **Memori hanya global atau per-run.** `memory.md` tidak punya dimensi proyek, dan `.zephyr-context.md` tidak punya dimensi global. Pindah folder = AI kehilangan semua kecuali preferensi.

## 3. Rencana implementasi

Prinsip: **pakai yang sudah ada, jangan bangun saluran keempat.** `memory.rs` sudah benar (atomik, ada limit, ada test: `memory.rs:214-241`). Yang kurang: penulisan otomatis, penyuntikan yang pasti terbaca, dan UI.

### A. Format & lokasi penyimpanan

| Berkas | Isi | Batas | Catatan |
|---|---|---|---|
| `%APPDATA%\zephyr\memory.md` | keputusan lintas proyek, preferensi kerja, "jangan ulangi ini" | 2200 char (`memory.rs:7`) | **sudah ada**, entri dipisah baris kosong (`PEMISAH = "\n\n"`, `memory.rs:10,65-70`) |
| `%APPDATA%\zephyr\user.md` | profil user (gaya bahasa, jam kerja, hal yang tidak disukai) | 1375 char (`memory.rs:8`) | **sudah ada** |
| `<proyek>\.zephyr-context.md` | memori proyek (Tugas, Rencana, Berkas, Hasil, + bagian model) | 6000 char saat disuntik (`systemPrompt.ts:553`) | **sudah ada**; tambahkan bagian `## Keputusan` yang **tidak** ditimpa app |
| `<proyek>\.zephyr\skills\*` | prosedur (skill) | — | sudah ada, tak diubah |

Perubahan format minimal, tidak ada skema baru:
- Entri baru wajib diawali tag tanggal+jenis supaya bisa dipangkas otomatis, mis. `[2026-10-13][keputusan] renderer WebView2 harus pakai PNG, bukan WebP`.
- Tambah `JUDUL_KEPUTUSAN = '## Keputusan'` di `aiStore.ts` (dekat `JUDUL_KONTEKS_BERKAS` baris ~1258) dan pastikan `catatHasilKonteks` **tidak** menyentuhnya (ia hanya mengganti dua judul yang sudah ada).

### B. Kapan ditulis

1. **Otomatis, di akhir run** — paling penting. Di `aiStore.ts:7001-7010` sudah ada `await catatHasilKonteks(wsRun, {...})`: tambahkan satu langkah sesudahnya yang menulis satu entri ringkas ke `memory.md` **hanya kalau** run menghasilkan keputusan baru. Sumber datanya sudah ada di situ (`opts.berkas`, `opts.todos`, `opts.kategori`).
   Ukuran entri: potong 200 char (sama seperti `opts.tugas.slice(0,200)` di baris 1348), maks **3 entri/run**.
   Aturan anti-banjir: lewati bila `opts.langkah === 0` atau `opts.kategori === 'cancelled'` (persis pola baris 1330).
2. **Tool, saat AI memutuskan** — `notes_write` ke `memory`/`user` (sudah jalan, hanya perlu dipromosikan — lihat D).
3. **Manual, di UI** — tombol "Tambah catatan" + editor markdown (lihat E). Ini jalur user, tidak boleh dihapus; satu-satunya jalan kalau AI salah menulis.
4. **Tidak menulis di tengah streaming.** Satu tulisan per run; `memory.rs` sudah atomik (`tulis_atomik_teks`, baris 80) dan menolak entri yang melewati limit dengan pesan actionable (baris 96-102) — jangan diubah.

### C. Kapan dibaca / disuntik, di mana tepatnya

Rantai yang **sudah** ada (dipertahankan, cuma diisi):

```
run agen → aiStore.ts:4994  Promise.all([konteksAgent(), aturanProyek(), konteksMemoriProyek()])
             └─ konteksAgent()      aiStore.ts:714-753  → cache 60s (CTX_TTL_MS, baris 241)
                  └─ cmd.agentContext()  commands.ts:1303 → skills.rs:409
                       ├─ memory::ringkasan_untuk_prompt()  memory.rs:162-178  → "MEMORY (...)" + "PROFIL USER:"
                       └─ skills::ringkasan_untuk_prompt()  skills.rs:393      → "AVAILABLE SKILLS (...)"
             └─ konteksMemoriProyek()  systemPrompt.ts:565  → blok "## .zephyr-context.md (memori proyek lintas-sesi)", cap 6000
           → systemPromptFor(bhs, ekstra, aturanGabung, ...)  systemPrompt.ts:352; aturan+memori digabung di aiStore.ts:5000
           → history.unshift({role:'system', ...})             aiStore.ts:5001-5004
```

Perubahan:
1. **Naikkan `CTX_TTL_MS` dari 60_000 ke 0 untuk bagian memori**, atau lebih murah: panggil `memory_read` langsung (bukan lewat cache `agent_context`) supaya catatan yang baru ditulis di UI langsung terpakai di giliran berikutnya — cache 60s berarti user menekan "simpan" lalu AI masih memakai versi lama. Minimum: `resetCacheKonteks()` sudah ada (`aiStore.ts:763`) — panggil dari jalur simpan memori.
2. **Blok memori harus berdiri di depan, bukan di `aturan`.** Sekarang memori global masuk lewat `ekstra` (tanpa judul sendiri selain "MEMORY (...)" di dalam teks Rust) dan memori proyek masuk lewat `aturanGabung` (baris 5000). Setelah diisi, ini akan bercampur dengan "Aturan proyek (ikuti)". Ubah agar:
   - `ekstra` tetap: runtime + editor + proyek (jangan sentuh).
   - tambah argumen ke-7 `memori` di `systemPromptFor` dan render dengan label bahasa (`konteksProyek: '# Konteks dan memori proyek'`, `systemPrompt.ts:191`) sehingga bloknya berbunyi seperti fakta posisi, bukan perintah.
3. **Wajib tambah aturan di prompt** (di blok `caraKerja`, dekat aturan 8 di `systemPrompt.ts` baris ~157 yang sekarang hanya mengatur `.zephyr-context.md`):
   ```
   9. Catatan permanen ada di memory.md/user.md lewat tool notes_read/notes_write (tool_search dulu
      kalau tidak terlihat). Di awal tugas lintas-sesi, notes_read dulu; setelah keputusan yang
      mengubah arah kerja atau preferensi user, notes_write. Jangan mencatat yang sudah ada di berkas.
   ```
   Tanpa baris ini, mengisi `memory.md` tidak mengubah perilaku model — dan inilah kesalahan yang sekarang terjadi (poin 2.2.3).
4. **Cap dan urutan**: `MEMORY_LIMIT 2200` + `USER_LIMIT 1375` + `KONTEKS_MEMORI_MAX 6000` = maksimum 9.575 char memori dalam prompt; terhadap prompt nyata sekarang 22.988 char (`__ZEPHYR_PROMPT__.system('id','','')` di app hidup) itu +42% di kasus terburuk. Kalau terlalu besar, turunkan cap `.zephyr-context.md` ke 4000 dan biarkan model memadatkan — jangan menaikkan limit Rust.

### D. Tool untuk mencari/mencatat

- `notes_read` (`builtins.ts:1831`) → `cmd.memoryRead()` → `memory_read` (`memory.rs:181`). Sudah benar: mengembalikan dua bagian plus pemakaian (`2200/2200 karakter`).
- `notes_write` (`builtins.ts:1848`) → `memory_write` (`memory.rs:195`) dengan `op=add|replace|remove`, `section=memory|user`. Sudah benar: mengganti seluruh bentuk (bukan append), bukan pencarian-teks.
- **Perubahan #1 (wajib, 1 baris):** masukkan `'notes_read'` dan `'notes_write'` ke `TOOL_DIKIRIM_SELALU` (`zephyrTools/catalog.ts:508`). Biaya: ~2 skema kecil di setiap langkah. Alternatif kalau terlalu mahal: kirim `notes_read` saja selalu (baca wajib) dan biarkan `notes_write` terdefer (tulis = keputusan sadar).
- **Perubahan #2:** deskripsi `notes_read` menyebut "catatan dan preferensi yang tersimpan tentang user" — tambahkan "memori kerja lintas sesi (keputusan, batasan, jalan buntu)". Tanpa itu, model membacanya sebagai data tentang user, bukan memori tugas.
- **Jangan** tambah tool baru. 46 entri di `builtins.ts` sudah banyak; ini murni promosi + deskripsi.
- `tool_search` sudah punya alias `['catatan', ['notes']]` (`builtins.ts:299`), jadi jalur cadangan bahasa Indonesia tetap ada.

### E. UI: lihat / ubah / hapus / matikan

1. **Section baru "Memory"** di `SECTIONS` (`ChatSettingsPage.tsx:71-82`), urutan setelah `context`:
   - Dua kotak teks (editor) untuk `memory.md` dan `user.md` + penghitung `x/2200`, `y/1375` dari `memoryRead()` (`commands.ts:1305`). Simpan lewat `memoryWrite({section, op:'replace', oldText:<isi lama>, content:<baru>})` — atau satu perintah baru `memory_replace_all` supaya UI tidak perlu tahu semantik entri.
   - Daftar entri (dipisah baris kosong) dengan tombol **Hapus** per entri → `op:'remove'` + `oldText`. Ini yang membuat "hapus satu kenangan" mungkin tanpa editor teks bebas.
   - Tombol **Lupakan semuanya** → `op:'replace'` dengan isi kosong, konfirmasi dua langkah.
   - Baris lokasi: `%APPDATA%\zephyr\memory.md` + tombol **Buka berkas** (explorer sudah ada untuk jalur lain).
   - Blok read-only **Memori proyek** yang membaca `<workspace>\.zephyr-context.md` (`jalurKonteksKerja()` di `aiStore.ts:1262`) dengan tombol sama.
2. **Jejak "kenapa AI tahu itu"**: di kartu tool `notes_write`, tampilkan entri yang berubah (kartu tool sudah ada: `ChatMessage.tsx:753-790`). Tanpa ini, user tidak bisa membedakan "AI ingat" dari "AI mengarang".
3. **Indikator sesi**: badge kecil di header chat bila `memoryRead().memory_chars > 0` — menjawab langsung keluhan "belum ada memory tiap sesi".
4. **Cara mematikan** (harus ada, minimal dua tingkat):
   - Toggle `Memory aktif` di section Memory → setelan baru `agents.memory = { enabled: true, autoNote: true }` di `default_settings()` (`settings.rs:129`, blok `"agents"` — di situ juga `customInstructions`, jadi ini tempat yang konsisten) dan tipe di `settingsStore.ts`. Saat `enabled:false`: `agent_context` tidak menyertakan memori (`memory.rs:162` dicek lebih dulu) **dan** tool `notes_read/notes_write` tidak ditawarkan (`catalog.ts:508` difilter runtime).
   - `autoNote: false` mematikan hanya penulisan otomatis di akhir run, sementara baca tetap jalan — supaya user bisa pakai memori tulis-tangan.
   - Panggilan darurat: hapus `memory.md` dari UI; aplikasi memperlakukannya seperti pertama kali (`baca()` mengembalikan `""` untuk NotFound, `memory.rs:60`).

### F. Angka & anggaran

| Angka | Nilai | Asal |
|---|---|---|
| Pesan disimpan per sesi | 200 | `aiStore.ts:138` |
| Sesi disimpan | 20 terakhir | `aiStore.ts:2805` |
| Hasil tool per pesan (disimpan) | 4000 char | `aiStore.ts:148` |
| Pesan lama dikirim ke model | 2 (1 user + 1 asisten) | `aiStore.ts:4977` |
| Memori global | 2200 + 1375 char | `memory.rs:7-8` |
| Memori proyek disuntik | 6000 char | `systemPrompt.ts:553` |
| Aturan proyek | 2000/file, 4000 total, 12 nama berkas | `systemPrompt.ts:514-527,540-541` |
| Cache konteks Rust | 60.000 ms | `aiStore.ts:244` |
| Sesi 19 pesan di disk | 511.707 byte | diukur via CDP |
| Prompt saat ini | 22.988 char | diukur via CDP |
| `.zephyr-context.md` sekarang | 622 byte | diukur |

## 4. Harness uji lintas sesi (wajib, cetak bukti)

Skrip pembaca read-only (boleh dibuat sebagai `docs/harness-memori.mjs`, pola `scripts/lib-cdp.mjs`):

```js
import { Cdp } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach('9223', ['Zephyr','Vite','tauri','localhost']);
console.log(await cdp.json(`return JSON.stringify(await (async () => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  return { memory: await inv('memory_read'), context: await inv('agent_context') };
})())`));
```

Sudah terbukti jalan hari ini: sekarang mencetak `{"memory":"","user":"","memory_chars":0,...}` dan `context: ""`.

### Skenario (7 langkah)

1. Buka workspace `D:\Zephyr`. Di sesi 1, kirim tugas yang menetapkan keputusan, mis. `/goal pakai PNG untuk aset, jangan WebP; simpan itu`.
2. **Cetak bukti T1** (sebelum restart):
   - `node docs/harness-memori.mjs` → `memory.memory_chars > 0` dan `context` memuat `"MEMORY (your notes from earlier sessions"`.
   - Isi berkas: `cat "%APPDATA%\zephyr\memory.md"` dan `cat D:\Zephyr\.zephyr-context.md` → di `.zephyr-context.md` harus ada bagian `## Keputusan` berisi kalimat PNG vs WebP.
3. Catat nomor sesi + jumlah pesan dari localStorage: `ls_sessions` (harness mode kedua, ambil `zephyr.ai.sessions.v1`) → mis. `1 sesi, 21 pesan`.
4. **Tutup app sepenuhnya** (bukan reload; tutup proses Zephyr) lalu jalankan lagi. Verifikasi penghitung: `memory_chars` harus sama, bukan nol.
5. **Buka chat BARU** (bukan lanjutkan sesi 1). Kirim prompt uji tanpa menyebut detail: `aset pakai format apa?`. **Lulus** bila jawabannya "PNG" tanpa membaca berkas lagi dan tanpa memanggil `read_file`.
6. **Cetak bukti T2** (sesudah restart): dump `history` permintaan terakhir. Dua cara:
   - dari kartu langkah di UI: prompt berisi blok `MEMORY (...)` dan `## .zephyr-context.md (memori proyek lintas-sesi)`;
   - di console: `await inv('memory_read')` + `JSON.parse(localStorage['zephyr.ai.sessions.v1']).sessions` untuk membuktikan sesi lama masih ada di disk (bukti "yang tersimpan tetap tersimpan").
7. **Uji negatif (harus lulus juga):**
   - `agents.memory.enabled = false` → restart → prompt **tidak** memuat `MEMORY (`; `notes_read` tidak muncul di `tool_search 'notes'`.
   - Hapus `memory.md` dari UI → `memory_read` kembali 0 char, AI tidak mengarang isi lama.
   - Run yang dibatalkan (`cancelled`) → `memory.md` tidak bertambah (aturan anti-banjir 2.B.1), `.zephyr-context.md` tetap diperbarui bagian Hasil.
8. **Otomasi yang disarankan**: satu skrip `docs/uji-memori-lintas-sesi.mjs` yang (a) mencatat hash+isi `memory.md`, (b) menutup app via `process kill` lalu menjalankan ulang exe-nya, (c) menjalankan langkah 5 lewat CDP dengan `__ZEPHYR_AI__`, (d) mencetak PASS/FAIL dari kehadiran string `MEMORY (` di prompt. Tanpa (b) yang benar-benar mematikan proses, uji ini hanya membuktikan "reload", bukan "lintas sesi".

## 5. Urutan kerja (kecil -> besar)

1. Promosikan `notes_read` (dan opsional `notes_write`) ke `TOOL_DIKIRIM_SELALU` — 1 baris `catalog.ts:508`.
2. Tambah aturan nomor 9 tentang memori di `systemPrompt.ts` (~baris 157).
3. Tulis otomatis di akhir run (`aiStore.ts:7001-7010`), plus `JUDUL_KEPUTUSAN` di `aiStore.ts:~1258`.
4. Section "Memory" di `ChatSettingsPage.tsx:71-82` + `commands.ts` (perintah list/replace all).
5. Setelan `agents.memory` di `settings.rs:129` + filter di `memory.rs:162`/`catalog.ts:508`.
6. Harness + uji negatif di CI manual.

Estimasi: 1-2 (pagi, ~30 baris kode), 3-4 (1 hari), 5 (2 jam), 6 (2 jam).

## 6. BELUM TERVERIFIKASI

- Penyuntikan `memory.md` secara empiris **belum** diuji: berkasnya kosong dan tugas ini melarang menulis di luar `docs/`, jadi rantai `memory.rs:162 -> skills.rs:409 -> agentContext -> konteksAgent -> prompt` baru terbukti dari kode + `memory_read`/`agent_context` hidup (keduanya mengembalikan kosong), bukan dari prompt nyata yang berisi memori.
- Apakah model benar-benar mematuhi aturan nomor 9 tanpa contoh di prompt — belum diuji (butuh run berbayar).
- Efek `CTX_TTL_MS` 60s terhadap catatan yang baru disimpan lewat UI: dari kode, simpan memori **tidak** memanggil `resetCacheKonteks()`, jadi ada jendela sampai 60 detik di mana prompt masih memakai salinan lama. Ini bacaan kode, belum diuji waktu nyatanya.
- Baris `systemPrompt.ts` bergeser 14 baris saat pengukuran (667 -> 681 baris) karena berkas itu sedang diubah proses lain; nomor baris di dokumen ini diverifikasi ulang pada 2026-10-13 16:1x dan bisa bergeser lagi. Gunakan nama fungsi sebagai anchor.
