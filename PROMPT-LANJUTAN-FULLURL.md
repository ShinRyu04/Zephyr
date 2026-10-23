# PROMPT LANJUTAN — Toggle "Full URL" + Fallback Daftar Model + Fix Model Picker Reset

Kamu adalah agen AI yang bekerja di repo `D:\Zephyr` (code editor desktop: Tauri 2 + React + TypeScript + Zustand, backend Rust).
**WAJIB baca `d:\Zephyr\AGENTS.md` dulu** — di situ ada aturan kerja, jebakan fase, dan aturan keras "harness/tugas tidak boleh mengubah produk di luar lingkup".

Gaya komunikasi user: Bahasa Indonesia informal (Jakarta: "gua", "lu", "bnerin", "mncul", "woi", "bro"). Balas dengan ragam yang sama.

---

## 0. Konteks: apa yang sudah terjadi

User punya custom provider `custom-free` yang menunjuk ke gateway `https://bansos.wahyu-hidayat.my.id/v1`.
Gateway itu **OpenAI-compatible tapi `GET /v1/models` balas kosong**: `{"object":"list","data":[]}`.

Fakta yang SUDAH DIVERIFIKASI (jangan diragukan lagi):

- `GET /v1/models` → `{"object":"list","data":[]}` (kosong). Ini jawaban jujur server, bukan bug app.
- `POST /v1/chat/completions` dengan `model: "laguna-s-2.1"` → **200 OK**, balas "oke". Gateway SEHAT.
- `POST` dengan `model: "beam"` → 429 (limit bulanan akun server, masalah kuota, bukan app).
- Halaman `https://bansos.wahyu-hidayat.my.id/` adalah **dashboard**, bukan API. Daftar "Model Publik Dilayani" di dashboard itu di-render dari `GET /api/usage/public` field `combos`, **bukan** dari `/v1/models`.
  Isi `combos` (persis): `nemotron-3-ultra, nemotron-3-super, nemotron-3-nano, gpt-oss120b, laguna-s-2.1, mimo-v2.5, muse-spark-1.2, big-pickle, mimo-v2.6-flash, free, beam`.
- TRAE bisa pakai gateway ini karena TRAE punya **input Model ID manual** (user ngetik `beam` sendiri), bukan karena TRAE baca daftar model.
- Di Zephyr, **input Model ID manual SUDAH diimplementasikan** di `AiModelsDialog.tsx` (tambah field Model ID + Display Name, refresh kosong = chip netral "no models returned — type the Model ID below to add one anyway"). Jadi jalur manual sudah jalan.

Yang diminta user sekarang (2 permintaan):

1. **Tambahan dari TRAE**: toggle **Full URL** di dialog Add Model — kalau ON, URL yang diketik dianggap endpoint chat lengkap dan `/chat/completions` TIDAK ditambahkan otomatis. (TRAE: "Custom Request URL" + toggle "Full URL", hint: *"Enter the OpenAI-compatible API endpoint. Do not end with a slash. /chat/completions will be appended to the URL you provide."*)
2. **BUG BARU**: "kok pas di refresh model AI pas dh di pilih lngsng ngulang lgi" → setelah memilih model lalu refresh (atau simpan), pilihan model **balik ke awal / reset**. Ini harus diperbaiki.

---

## 1. STATUS PEKERJAAN SAAT INI (sudah masuk, JANGAN diulang dari nol)

### SUDAH SELESAI & TERVERIFIKASI

**A. Rust `secrets.rs` — fix utama (bug lama, selesai):**
- `endpoint_for(state, provider, base_url, key)` punya fallback baca `settings.models.providers[p].baseUrl` via `read_settings_value(state)`.
- `endpoint_for_core` memfilter `Some("")`/whitespace jadi `None` (kalau tidak, URL jadi literal `/models`).
- Normalisasi URL: trim, buang suffix `/models`, `https//`→`https://`, `http//`→`http://`, lalu `format!("{}/models", base)`.
- Parser respons toleran: `data[]` → `models[]` → array top-level; id dari `id` atau `name`; `strip_prefix("models/")`.
- Verifikasi: `cargo test --lib` **579 passed, 0 failed**; `npx tsc --noEmit` 0 error.

**B. Frontend `ModelSelector.tsx` — picker sudah dibersihkan:**
- Seluruh mekanisme input free-text bertumpuk (kotak input per provider kosong) DIHAPUS.
- State `typed`/`setTyped`, fungsi `commitTyped`, flag `perluPilih` sudah dibuang. `setSaved` jadi `const [saved] = useState(...)` (hanya baca). Dep array jadi `[open, cari]` dan `[open, intip, cari]`.
- Sekarang picker = daftar model datar bergaya TRAE: `custom → nama provider → model`.

**C. Halaman AI Models `AiModelsPage.tsx` — tombol hapus provider:**
- Komponen `Grup` dapat prop `aksi?: React.ReactNode`; header dibungkus `<div className="aim-grup-bar">` (button toggle + span aksi) untuk menghindari button-in-button (invalid HTML).
- Fungsi `hapusProvider(pid)` membersihkan 3 tempat: `models.custom`, `models.providers[pid]`, dan API key via `saveKey(pid, '')`.
- `providerKosong` useMemo: provider custom yang punya key/URL tapi 0 model tetap ditampilkan sebagai baris mati (`aim-provider-kosong-<pid>`) supaya bisa dihapus.
- Tombol: `data-testid="aim-hapus-provider-<pid>"`, class `aim-aksi-btn is-hapus is-keci`.

### SEDANG DIKERJAKAN (Rust SUDAH DIUBAH & COMPILE OK — `cargo check --lib` exit 0)

Tujuan: dukung flag `fullUrl` end-to-end.

1. `d:\Zephyr\src-tauri\src\secrets.rs`:
   - `struct Endpoint` dapat field `full_url: bool`.
   - `endpoint_for(state, provider, base_url, full_url: Option<bool>, key)`: fallback `fullUrl` dibaca dari `settings.models.providers[p].fullUrl` (harus sejalan dengan fallback baseUrl). Delegasi ke `endpoint_for_core(p, given, key, full)`.
   - `endpoint_for_core(p, given, key, full_url: bool)`: kalau `full_url == true`, `Endpoint.url` = base apa adanya (tidak ditempelin `/models`) dan `full_url: true`.
   - `list_models(provider, base_url, full_url: Option<bool>)` dan `test_model_connection(provider, base_url, full_url: Option<bool>)` sudah menerima param baru & meneruskannya.
   - Helper test baru: `endpoint_for_full_test(provider, base_url)`.
2. `d:\Zephyr\src-tauri\src\adapters\mod.rs`:
   - `prepare(provider, model, messages, base_url, full_url: Option<bool>, key, max_tokens, effort)`.
   - `prepare_tools(...)` sama, ditambah `full_url` sebelum `key`.
   - `prepare_tools_stream(...)` sama.
   - Hanya cabang `_ => openai::*` yang menerima `full_url`; `anthropic::*` dan `gemini::*` TIDAK berubah signature.
3. `d:\Zephyr\src-tauri\src\adapters\openai.rs`:
   - `prepare(...)` + `prepare_tools(...)` terima `full_url: Option<bool>`; `let full = full_url.unwrap_or(false);`.
   - URL: `if full { base.clone() } else { format!("{base}/chat/completions") }` di KEDUA fungsi.
4. `d:\Zephyr\src-tauri\src\ai.rs`:
   - `ai_chat`, `ai_tool_chat`, `ai_tool_chat_stream` semua sudah terima `full_url: Option<bool>` dan meneruskan ke `adapters::prepare*`.
5. `d:\Zephyr\src-tauri\src\tests_ai.rs`:
   - SEMUA pemanggil `adapters::prepare*` sudah ditambah argumen `None` di posisi `full_url`. Dua yang terakhir (`llama-3.1-70b` baris ~57, dan loop `reasoning_is_never_echoed_on_a_user_turn` baris ~793) sudah dipastikan.
   - `anthropic.rs` unit test memanggil `anthropic::prepare_tools` langsung — signature-nya tidak berubah, jadi aman.
6. `d:\Zephyr\src\lib\commands.ts` (frontend):
   - `testModelConnection(provider, baseUrl?, fullUrl?)` ✅
   - `listModels(provider, baseUrl?, fullUrl?)` ✅
   - `listModelIds(provider, baseUrl?, fullUrl?)` ✅
   - `aiChat` opts sudah ada `fullUrl?: boolean` ✅
   - `aiToolChat` opts `fullUrl` — BARU DIMASUKKAN (perlu diverifikasi sudah masuk).
   - `aiToolChatStream` opts `fullUrl` — **BELUM**. WAJIB ditambah.

---

## 2. YANG HARUS DIKERJAKAN (TODO, urut)

### TODO-1 — Selesaikan `commands.ts`
- Cek `aiToolChat` sudah punya `fullUrl?: boolean`. Kalau belum, tambah.
- Tambah `fullUrl?: boolean` di `aiToolChatStream` opts.
- Catatan: `invoke` meneruskan opts apa adanya; nama field harus camelCase `fullUrl` supaya cocok dengan `Option<bool> full_url` di Rust (Tauri v2 auto-map camelCase→snake_case).

### TODO-2 — Toggle Full URL di `AiModelsDialog.tsx`
- Baca file penuh dulu. Fokus: state form dialog, fungsi `deteksi()` (~201-246), `simpan()` (~248-322), `slugProvider` (~64-71).
- Tambah state `const [fullUrl, setFullUrl] = useState(false);`.
- UI: di baris label "Custom Request URL" (atau label sejenis yang ada di Zephyr), taruh toggle di KANAN label. Label teks: `Full URL`. Aktif = URL dianggap endpoint lengkap.
- Saat ON, hint berubah jadi sesuatu seperti: "URL yang kamu isi dipakai apa adanya sebagai endpoint chat — `/chat/completions` tidak ditambahkan."
- Saat OFF (default), hint seperti sekarang: base URL + `/chat/completions` ditambahkan otomatis.
- Simpan flag ke settings: `settings.models.providers[pid].fullUrl = true/false`. Kalau false, sebaiknya kirim `null` supaya key hilang (deep_merge RFC 7386: `null` = HAPUS key — lihat AGENTS.md jebakan fase 08).
- Teruskan `fullUrl` ke `listModels(provider, baseUrl, fullUrl)` saat refresh & `testModelConnection(provider, baseUrl, fullUrl)` saat test.

### TODO-3 — Perbaiki BUG "model pilihan reset setelah refresh"
Ini BUG UTAMA yang user keluhkan: "kok pas di refresh model AI pas dh di pilih lngsng ngulang lgi".

- Baca `d:\Zephyr\src\lib\aiStore.ts` dan `d:\Zephyr\src\components\settings\AiModelsPage.tsx` + `ModelSelector.tsx` untuk menemukan di mana model aktif disimpan & bagaimana ia di-resolve.
- Hipotesis utama: model aktif disimpan sebagai id gabungan `provider/model` (atau `provider/id`), lalu setelah refresh daftar di-rebuild dari remote + key, dan pencocokan id gagal (karena id berubah bentuk, atau karena provider efektif berubah), sehingga nilai jatuh ke default.
- Hipotesis kedua: `refreshRemoteModels` di `settingsStore.ts` menimpa `uiRemote`/list dan komponen yang menghitung "model terpilih" memakai `useMemo` yang bergantung pada array remote → ikut reset.
- Perbaiki agar: (a) id model yang dipilih tetap stabil & tidak bergantung urutan/hasil refresh; (b) kalau model yang dipilih TIDAK ada di daftar remote (mis. jalur manual `custom-free` yang `/models`-nya kosong), pilihan itu TETAP dipertahankan — jangan dianggap tidak valid.
- Ini penting karena gateway list-kosong: model manual yang user ketik justru tidak akan pernah muncul dari refresh, jadi logika "kalau tidak ada di remote → reset ke default" HARUS dibuang/dilonggarkan.
- Jangan lupa: `zustand` selector TIDAK boleh mengembalikan array/objek baru (pelajaran fase 09 — bisa `Maximum update depth exceeded`). Ambil primitif.

### TODO-4 — Fallback daftar model dari dashboard (OPSIONAL, konfirmasi dulu ke user)
- Kalau `/models` kosong, coba `GET {base}/api/usage/public` dan ambil field `combos` sebagai daftar id. Endpoint NON-STANDAR, khusus gateway ini → tandai jelas sebagai fallback, jangan dipakai untuk gateway lain tanpa cek.
- Kalau diimplementasikan, taruh di Rust (`secrets.rs` `list_models`) atau frontend; pilih yang paling sedikit merusak. Kalau ragu, TANYA user.

### TODO-5 — Verifikasi
- `cd src-tauri; cargo check --lib` → 0 error. Lalu `cargo test --lib` → semua lulus (target 579+).
- `npx tsc --noEmit` di root → 0 error.
- Ingat `tsconfig.json` punya `noUnusedLocals` + `noUnusedParameters` → variabel tak terpakai WAJIB dibuang.
- App dev: `npm run tauri dev`. Dev server: `npm run dev`.

### TODO-6 — Lapor ke user (Bahasa Indonesia informal)
Jelaskan: toggle Full URL sudah ada (fungsinya apa, kapan dipakai), bug reset model sudah diperbaiki (akar masalahnya apa), dan bahwa jalur manual Model ID tetap jadi cara pakai gateway `/models`-kosong.

---

## 3. JEBAKAN YANG SUDAH KETAHUAN (jangan diulang)

1. **Tool `SearchReplace` sering balas `unexpect error: IDE Command timeout: Elapsed(())` — TAPI EDIT TETAP MASUK.** SELALU verifikasi dengan `Read`/`Grep` sebelum mengedit ulang, kalau tidak blok akan terduplikasi. Ada juga varian `legacy_command ... applyChatSnapshotPatch timeout in 60000ms` — sama, cek dulu.
2. **`Button-in-button` = invalid HTML.** Jangan taruh `<button>` di dalam `<button>`. Header grup collapsible dibungkus `<div class="aim-grup-bar">`.
3. **`tsconfig.json`: `noUnusedLocals: true`, `noUnusedParameters: true`.** Variabel/state tak terpakai wajib dihapus.
4. **`deep_merge` Rust (`settings.rs`) pakai `null` = HAPUS key (RFC 7386).** Untuk menghapus item, kirim `{ key: null }`. Mengirim objek tanpa key itu tidak menghapus apa pun karena patch di-MERGE, bukan menimpa.
5. **Tombol "Delete provider" sebelumnya tidak berfungsi** karena `hapusProvider` mengirim objek hasil `delete` (key hilang dari patch → tidak terhapus oleh merge). Fix: kirim `providers: { [pid]: null }`. Kalau ada penghapusan lain, pakai pola `null`.
6. **Port 9223 = debug port WebView2** (dipakai semua harness verifikasi). JANGAN jadikan fallback MCP. MCP fallback = 9222..9226 (AGENTS.md fase 11).
7. **Selector zustand v5 tidak boleh mengembalikan array/objek baru** (fase 09) → `Maximum update depth exceeded`. Ambil primitif (`reduce`, bukan `map`).
8. **Listener Tauri (`pty-output`, `ai-chunk`, `mcp-action`) butuh guard modul**, bukan cuma cleanup effect — StrictMode dev memasang dua kali → output dobel.
9. **Harness/verifikasi TIDAK BOLEH mengubah produk.** Kalau tes gagal karena elemen sudah tidak ada, perbaiki TES-nya (AGENTS.md §12).
10. **CSS wajib pakai CSS variables** dari `src/styles/*.css` (`--accent`, `--surface`, `--bg0`, `--border`, `--fg0`, `--text-muted`). Dilarang hex hardcoded.
11. **`window.confirm`** dipakai sebagai pola konfirmasi hapus (preseden `AgcConversations.tsx:275`).
12. **Jangan commit/push tanpa diminta user.** Jangan tulis API key ke log.

---

## 4. FILE PENTING (peta)

| File | Peran |
| --- | --- |
| `src-tauri/src/secrets.rs` | `endpoint_for`, `list_models`, `test_model_connection`, parser `/models`, normalisasi URL |
| `src-tauri/src/adapters/mod.rs` | `prepare`, `prepare_tools`, `prepare_tools_stream` — router per provider |
| `src-tauri/src/adapters/openai.rs` | builder body + URL (`/chat/completions`) OpenAI-compatible |
| `src-tauri/src/adapters/anthropic.rs` / `gemini.rs` | provider lain (signature TIDAK berubah) |
| `src-tauri/src/ai.rs` | command `ai_chat`, `ai_tool_chat`, `ai_tool_chat_stream` |
| `src-tauri/src/settings.rs` | `read_settings_value`, `deep_merge` (null = hapus) |
| `src-tauri/src/tests_ai.rs` | unit test adapter (sudah disesuaikan) |
| `src/lib/commands.ts` | wrapper `invoke` semua command |
| `src/lib/aiStore.ts` | store AI (chat, model aktif, guard anti-loop) |
| `src/lib/settingsStore.ts` | `saveKey`, `refreshRemoteModels`, store settings UI |
| `src/components/settings/AiModelsDialog.tsx` | dialog Add Model (target toggle Full URL) |
| `src/components/settings/AiModelsPage.tsx` | halaman Models (Grup, hapusProvider, providerKosong) |
| `src/components/ai/ModelSelector.tsx` | picker model di UI (sudah dibersihkan) |
| `src/styles/aim-models.css` | CSS halaman models |

---

## 5. PERINTAH

```powershell
# root repo
npm install
npx tsc --noEmit            # WAJIB 0 error sebelum dianggap selesai
npm run dev                 # dev server
npm run tauri dev           # app

# rust
cd src-tauri
cargo check --lib           # cepat
cargo test --lib            # target 579+ lulus
```

---

## 6. DEFINITION OF DONE

- [ ] `aiToolChatStream` (dan `aiToolChat`) punya `fullUrl?: boolean`.
- [ ] Toggle **Full URL** ada di `AiModelsDialog.tsx`, tersimpan ke `settings.models.providers[pid].fullUrl`, dan dipakai saat refresh/test/chat.
- [ ] Bug "model terpilih reset setelah refresh" diperbaiki; model manual (list-kosong) tidak ikut ke-reset.
- [ ] `cargo check --lib` 0 error, `cargo test --lib` lulus, `npx tsc --noEmit` 0 error.
- [ ] Laporan ke user dalam Bahasa Indonesia informal.

## 7. CATATAN PENTING UNTUK USER

- API key yang pernah dipaste user di chat (`sk-7e55a8f3c7fb044f-qoce3o-317c6884`) sudah dipakai untuk curl → **anggap bocor, sebaiknya di-rotate** di dashboard gateway.
- Model `beam` sedang kena 429 (limit kuota server), untuk testing pakai `laguna-s-2.1` / `nemotron-3-nano` / `mimo-v2.5` / `big-pickle`.