# Referensi Desain: Tool Agent di Zed

Dokumen ini adalah **ringkasan desain** (blueprint), bukan salinan kode.
Sumber: repo `zed-industries/zed` (lisensi GPL-3.0), dipelajari dari
`crates/agent/src/tools/*` dan `crates/agent/src/agent.rs`.

> **Catatan lisensi.** Zed berlisensi GPL-3.0-or-later. Menyalin kode Zed ke
> Zephyr akan mewajibkan Zephyr ikut GPL-3.0. Dokumen ini sengaja hanya
> merangkum **ide, pola, dan keputusan desain** — bukan ekspresi kode — supaya
> bisa dipakai sebagai acuan tanpa terikat lisensi. Implementasi tetap ditulis
> sendiri di Zephyr dengan API Zephyr (Tauri command + React).

---

## 1. Daftar tool bawaan Zed

Didefinisikan statis di `crates/agent/src/tools.rs` sebagai `const ALL_TOOL_NAMES`
(lewat macro `tools!`). Satu tool = satu file `*_tool.rs`.

| Tool | Peran |
|---|---|
| `read_file` | Baca file (teks atau gambar), dukung `start_line`/`end_line` |
| `write_file` | Tulis file |
| `edit_file` | Edit bedah (cari & ganti blok) |
| `grep` | Cari isi file via regex, hasil berpaginasi |
| `find_path` | Cari file berdasarkan pola glob |
| `list_directory` | Lihat isi direktori |
| `create_directory` | Buat direktori |
| `copy_path` | Salin file/direktori |
| `move_path` | Pindah/rename |
| `delete_path` | Hapus |
| `diagnostics` | Ambil error/warning dari language server |
| `terminal` | Jalankan perintah shell |
| `fetch` | Ambil konten URL |
| `web_search` | Cari di web |
| `skill` | Muat skill (instruksi modular) |
| `spawn_agent` | Delegasi ke sub-agent |
| `ask_user` | Tanya balik ke user |
| `list_agents_and_models` | Lihat agent & model tersedia |
| `create_thread` | Buat thread bersaudara |
| `go_to_definition` / `find_references` / `get_code_actions` / `apply_code_action` / `rename` | Operasi LSP (di belakang feature flag) |

**Pelajaran:** daftar tool itu statis dan compile-time. Nggak ada UI untuk
menambah tool bawaan — hanya MCP (`context_servers`) yang bisa menambah.

---

## 2. Anatomi satu tool

Setiap tool mengikuti satu kontrak seragam. Di Zed kontraknya trait `AgentTool`;
di Zephyr padanannya bisa jadi interface TS.

Bagian yang **wajib** dimiliki tiap tool:

| Bagian | Isi | Padanan di Zephyr |
|---|---|---|
| `NAME` | String identik, unik | `name` di objek tool |
| `description()` | Instruksi ke model | field `description` |
| `input_schema()` | JSON Schema (di Zed pakai `schemars` dari struct) | `parameters` (JSON Schema) |
| `run()` | Implementasi, async, bisa di-cancel | fungsi handler |
| `kind()` | Kategori: Read / Search / Edit / Execute | opsional, untuk UI/izin |

### Pola skema input (dari `read_file` & `grep`)

```ts
// read_file
{
  path: string,             // wajib
  start_line?: number,      // opsional, 1-based
  end_line?: number         // opsional, 1-based inclusive
}

// grep
{
  regex: string,            // wajib
  include_pattern?: string, // glob, opsional
  offset?: number,          // paginasi, default 0
  case_sensitive?: boolean  // default false
}
```

**Pelajaran penting:** deskripsi tool itu sendiri **adalah prompt**. Di Zed,
doc-comment di struct input jadi `description()` yang dibaca model. Contoh
nyata yang gue terima:

> "Never use this tool to search for paths. Only search file contents with
> this tool." — dari `grep`
>
> "For large files, this tool returns a file outline... Do NOT retry reading
> the same file without line numbers." — dari `read_file`

Tanpa instruksi ini, model akan salah pakai tool.

---

## 3. Keputusan desain yang layak ditiru

### 3.1 Jangan percaya argumen dari LLM — selalu clamp

Di `read_file`, rentang baris di-clamp:

```
start = start_line ?? 1;  lalu max(1)     // model kadang kirim 0
end   = end_line ?? MAX;  lalu max(start) // jamin minimal 1 baris terbaca
```

Alasan tertulis di kode: model kadang mengirim `0` walau diminta 1-based, dan
kadang `end < start`. Tool tidak boleh gagal karena itu — harus defensif.

**Untuk Zephyr:** setiap parameter numerik dari model harus divalidasi &
di-clamp, bukan dipercaya.

### 3.2 Output besar → outline, bukan isi penuh

Kalau file terlalu besar, `read_file` **tidak** mengembalikan seluruh isi.
Yang dikembalikan: daftar simbol + nomor baris (outline), plus pesan eksplisit
bahwa ini sukses (bukan error), dan arahan lanjutan.

Ini menghemat context window secara drastis, dan mencegah model mengulang
panggilan yang sama.

**Untuk Zephyr:** tentukan ambang ukuran file; di atas itu kirim outline.

### 3.3 Format nomor baris `cat -n`

Setiap baris hasil baca di-prefix nomor baris dengan format:

```
{nomor baris, rata kanan lebar 6}{TAB}{isi baris}
```

Konsisten, dan langsung bisa dipakai tool edit (nomor baris = penanda baris).

### 3.4 Paginasi hasil pencarian

`grep` membatasi **20 hasil per halaman**. Kalau lebih, hasil berhenti dengan
pesan: "menampilkan hasil X–Y; pakai offset: Z untuk halaman berikutnya".

**Untuk Zephyr:** jangan pernah kirim hasil pencarian tak terbatas ke model.
Selalu paginasi + beri cara lanjut.

### 3.5 Konteks sintaks pada hasil pencarian

`grep` tidak hanya mengembalikan baris yang cocok. Ia mencari "ancestor sintaks"
(fungsi/modul pembungkus) dan menampilkan potongan itu, dibatasi
`max_ancestor_lines` (default 10). Kalau tidak ada ancestor, jatuh ke konteks
baris biasa (`context_lines`, default 2).

Efeknya: model langsung tahu **di mana** match berada secara struktural.

### 3.6 Code fence yang aman

Saat membungkus potongan kode ke markdown, tool memakai fence yang **lebih
panjang** dari backtick yang ada di dalam snippet. Ini mencegah potongan berisi
``` merusak rendering.

---

## 4. Keamanan (dari `tool_permissions.rs`)

Ini bagian paling penting untuk Zephyr. Zed punya **beberapa lapis**:

### 4.1 Path harus di dalam project (worktree)

`resolve_project_path` memetakan path input ke path project yang valid. Path
yang tidak bisa dipetakan → error ramah, dikembalikan ke model.

### 4.2 Deteksi symlink escape

Kalau sebuah path (atau direktorinya) adalah symlink yang menunjuk ke **luar**
project, operasi **tidak** langsung dijalankan. Sebaliknya:

- dikembalikan sebagai `SymlinkEscape{ project_path, canonical_target }`
- tool minta **izin eksplisit user**, dengan judul yang menyebut target asli

Yang perlu diperhatikan: symlink **di dalam** project (intra-project) itu
**aman** dan tidak minta izin. Yang berbahaya cuma yang keluar project.

### 4.3 Path sensitif wajib izin

Tiga jenis path selalu minta izin walau tool diset "always allow":

| Jenis | Contoh |
|---|---|
| Local settings | apa pun yang mengandung `.zed/` |
| Global settings | di dalam folder config app |
| Agent skills | `~/.agents/skills/...` |

Deteksi dilakukan **dua kali**: cek komponen path mentah (cepat), lalu cek
ulang terhadap path ter-canonicalize (untuk menangkap `..` traversal dan
symlink di dalam project yang menunjuk ke `.zed`).

### 4.4 Urutan keputusan (precedence)

1. Kalau kebijakan setting = **Deny** → tolak langsung.
2. Kalau ada **symlink escape** → prompt symlink **menggantikan** prompt biasa
   (bukan dua prompt berturut-turut).
3. Kalau path **sensitif** → prompt khusus (dengan label "local settings" /
   "settings" / "agent skills").
4. Kalau setting = **Allow** dan tidak sensitif → jalan tanpa prompt.

### 4.5 Mode terbatas (*restricted mode*)

Tool `fetch` dan `terminal` **dilarang** di workspace yang tidak dipercaya.
Tool lain tetap boleh. Ini dicek lewat `tool_allowed_in_restricted_mode`.

### 4.6 Buffer kotor (unsaved changes)

Sebelum agent menimpa file yang punya perubahan belum disimpan, user ditanya:
**Save** / **Discard** (mode edit), atau **Overwrite** / **Cancel** (mode
timpa). Ini melindungi kerja user dari ditimpa agent.

**Untuk Zephyr:** ini pola bagus — sebelum `write_file` menimpa file yang
dirty di editor, tanya dulu.

---

## 5. Tiga "gerbang" yang diam-diam membuang tool

Dari komentar di `tools.rs` — ini penting kalau Zephyr nanti punya sistem
serupa. Menambah tool ke daftar saja **tidak cukup**; ada 3 gerbang yang bisa
membuangnya tanpa error compile:

1. **Allowlist profil** — profil agent punya daftar tool yang diizinkan.
   Tool yang tidak ada di situ disaring keluar.
2. **UI permission** — setiap tool harus terdaftar di UI permission
   (atau daftar pengecualian).
3. **Feature flag** — sebagian tool hanya aktif kalau flag menyala
   (`rename`, `find_references`, `get_code_actions`, `go_to_definition`,
   `create_thread`).

Sumber kebenaran gating jadi satu fungsi (`tool_feature_flag_enabled`) supaya
UI dan runtime tidak pernah tidak sinkron.

**Untuk Zephyr:** kalau bikin gate tool, jadikan **satu sumber** yang dipakai
UI dan runtime. Jangan dua tempat terpisah.

---

## 6. Arsitektur agent (dari `agent.rs`)

Struktur tingkat atas yang terlihat:

- **NativeAgent** — pemilik semua sesi. Per-project state disimpan di map
  terpisah (`projects`), di-key berdasarkan id project.
- **Session** — satu percakapan: punya `thread` (pemroses pesan) + `acp_thread`
  (yang bicara protokol ke UI).
- **Thread** tempat tool dipasang: `add_default_tools(...)` memasang tool
  bawaan, `add_tool(...)` menambah tool lain (mis. `skill`).
- **Skills** dimuat dari dua sumber: global (`~/.agents/skills/`) dan
  project-local. Project-local hanya dimuat kalau worktree **dipercaya** —
  repo hasil clone yang belum dipercaya bisa membawa skill jahat.
- **Skill catalog** punya **anggaran ukuran** — skill yang tidak muat
  dilaporkan sebagai issue, bukan dibuang diam-diam.
- **Watch** direktori skills, tapi **sengaja tidak rekursif** — supaya
  `node_modules`/`target`/`.git` di dalam skill tidak memicu ribuan watch.

---

## 7. Ringkasan untuk implementasi di Zephyr

Kalau mau membangun "tool agent" di Zephyr, urutan yang disarankan:

1. **Kontrak tool `AgentTool`** (TS): `{ name, description, parameters
   (JSON Schema), handler }`. Deskripsi harus ditulis sebagai instruksi.
2. **Tool pertama** (bungkus command yang sudah ada):
   `read_file`, `list_directory`, `grep`, `write_file`.
3. **Loop agent**: kirim daftar tool → terima tool call → eksekusi →
   masukkan hasil → ulangi.
4. **Adapter tool-call** per provider (OpenAI / Anthropic / Gemini) —
   Zephyr sudah punya ketiga adapter ini di AI panel.
5. **Lapis izin**: prompt user sebelum `write_file`/`terminal`/path sensitif.
6. **Paginasi & batas output** sejak awal, jangan ditambal belakangan.
7. **Pola keamanan**: path harus di dalam workspace; operasi tulis di luar
   workspace ditolak (sudah jadi invariant Zephyr di `ARCHITECTURE.md`).

---

## 8. Yang **tidak** perlu ditiru dari Zed

- GPUI (framework UI) — Zephyr pakai React/WebView.
- ACP (Agent Client Protocol) — protokol Zed sendiri; Zephyr punya
  MCP 9222 sendiri.
- Struktur sesi berbasis `Entity`/`Task` GPUI — Zephyr pakai model async TS.
- Definisi tool lewat struct Rust + `schemars` — Zephyr lebih pas pakai
  JSON Schema langsung.
