# Cara Pasang Plugin di Zephyr

Dokumen ini menjelaskan **tata cara instalasi plugin** di Zephyr dan apa yang
sebenarnya terjadi di disk. Semua yang ditulis di sini diambil dari kode yang
ada di repo (dengan penunjuk `berkas:baris`), bukan dari tebakan. Kalau ada
bagian yang tidak terbukti di kode, itu ditandai terus terang.

Berkas utama yang jadi rujukan:

| Berkas | Isinya |
|---|---|
| `src-tauri/src/plugins.rs` | seluruh logika plugin (manifest, install, enable, remove, paket bawaan) |
| `src-tauri/src/ext_pkg.rs` | `copy_dir` dan `unzip_zext` — mesin salin/ekstrak + penjaga zip-slip |
| `src/lib/pluginsStore.ts` | store frontend (`usePlugins`) yang memanggil command Tauri |
| `src/components/settings/AgcSections.tsx` | komponen `AgcPlugins` — UI pane-nya |
| `src/components/settings/AgentCustomModal.tsx` | modal yang memuat `AgcPlugins` (bukan halaman Settings) |
| `src/lib/devBridge.ts` | jembatan `__ZEPHYR_PLUGINS__` untuk uji otomatis |
| `scripts/uji-plugin.mjs` | uji end-to-end (install/enable/disable/remove) |

---

## 0. Cara pakai — versi singkat

Bagian ini untuk orang yang cuma mau memasang plugin. Rincian teknisnya mulai
di bagian 1.

**Buka pane-nya.** Di jendela AI, klik menu **More actions (…)** di header chat →
**Agent Customizations…** (`ChatHeadActions.tsx`, test-id `ai-open-customize`).
Pane ini **sengaja terpisah** dari halaman Settings — isinya soal apa yang
diketahui agen (tools, MCP, instructions, agents, skills, hooks), bukan soal
editor. Di daftar sebelah kiri pilih section **Plugins**.

**Pasang paket** — tiga pilihan, semuanya di pane yang sama:

| Mau pasang dari | Klik | Hasil |
|---|---|---|
| Paket bawaan Zephyr | **Install** di grup **Available** | `conventional-commits`, `code-reviewer` |
| Folder sendiri | **Install from folder…** | folder yang berisi `plugin.json` |
| Berkas zip | **Install from .zip…** | arsip `.zip` paket |

Setelah itu paket muncul di grup **Installed** — tapi **belum aktif**.

**Nyalakan.** Tekan **Enable**. Baru di titik ini skill/rule/MCP ditulis ke
disk dan hook/agent digabungkan ke store frontend. Laporan muncul di bawah
daftar (test-id `agc-plugins-status`): berapa berkas tertulis, hook, agent,
MCP server, dan scope-nya (`this workspace` atau `all workspaces`).

**Lepas.** **Disable** mencabut tepat berkas yang tadi dipasang dan
mengembalikan plugin ke keadaan nonaktif (paketnya tetap ada). **Remove** →
**Remove for good** menghapus paketnya dari disk.

> Satu baris yang perlu diingat: **Install = menaruh paket di disk. Enable =
> menyambungkannya.** Setelah Install saja, plugin tidak melakukan apa-apa.
>
> Dua hal yang sering bikin bingung saat memasang paket sendiri:
> **(a)** hook dari plugin **selalu datang dalam keadaan mati** — nyalakan
> sendiri di pane Hooks; **(b)** kalau kamu sudah punya skill/rule dengan nama
> yang sama, berkasmu **tidak ditimpa**, dan namanya dilaporkan sebagai
> `skipped`. Keduanya dijelaskan di bagian 5 dan 7.

**Kalau gagal**, yang dilaporkan `agc-plugins-galat` biasanya salah satu dari
tiga ini (semuanya di bagian 4): `plugin.json not found in <path>` (folder yang
dipilih bukan akar paket), `plugin.json could not be parsed: …` (JSON rusak),
atau `<skill/agent/…> not found in <path>` (manifest menjanjikan berkas yang
tidak ada di dalam paket).

> Paket **`.vsix` VS Code tidak bisa dipasang** lewat jalur ini — lihat bagian 10.

---

## 1. Ringkasan singkat

- Ada **tiga pintu masuk** pemasangan: folder, berkas `.zip`, dan paket bawaan
  (bundled) dari marketplace internal.
- Folder dan `.zip` masuk lewat **satu command yang sama**, `plugin_install`,
  yang bercabang pakai `is_dir()`. Paket bawaan lewat command terpisah,
  `plugin_install_bundled`. **Ketiganya bertemu di langkah akhir yang sama**
  (`pasang_akar`: validasi → pindah → catat).
- Pemasangan **selalu** lewat staging `plugins/.staging` dulu; paket baru resmi
  jadi plugin setelah manifest valid dan semua berkas yang dijanjikan ada.
- **Install ≠ Enable.** Install cuma menaruh paket + mencatatnya; belum ada
  yang nyala. Fitur baru benar-benar kepasang setelah di-**Enable**.
- **Hook tidak pernah nyala otomatis.** Selalu masuk keadaan `enabled: false`.
- Nama yang bentrok dengan berkas tulis-tangan user **tidak ditimpa**, tapi
  dilaporkan sebagai `skipped`.
- `.vsix` VS Code **tidak** bisa dipasang lewat jalur plugin ini.

---

## 2. Bentuk satu folder plugin

Blueprint-nya persis ini (komentar header `src-tauri/src/plugins.rs:37-46`):

```text
<data_dir>/plugins/<name>/
  plugin.json          manifest: name, description, version, author, provides
  skills/<skill>/SKILL.md
  agents/<agent>.json
  rules/<rule>.md
  hooks/<hook>.json
  mcp/<server>.json
<data_dir>/plugins/installed.json    the registry (installed + enabled)
```

Jadi isi minimum satu paket adalah `plugin.json`; subfolder `skills/`, `rules/`,
`agents/`, `hooks/`, `mcp/` sifatnya opsional dan hanya wajib ada kalau
disebut di blok `provides`.

- Lokasi `<data_dir>` di Windows adalah folder data aplikasi
  (`%APPDATA%\zephyr` — lihat komentar `src-tauri/src/ext_bundled_extra.rs:4-5`;
  folder plugin-nya `data_dir/plugins` di `plugins.rs:221-222`).
- Path tiap bagian dipatok oleh `jalur_bagian` (`plugins.rs:330-349`): skill
  adalah **folder** `skills/<nama>/SKILL.md`, sedangkan agent/rule/hook/mcp
  adalah satu berkas (`agents/<nama>.json`, `rules/<nama>.md`,
  `hooks/<nama>.json`, `mcp/<nama>.json`).
- Nama jadi nama folder/berkas, jadi disaring lewat `nama_valid`
  (`plugins.rs:189-193`, meneruskan ke `skills::nama_valid`) — huruf, angka,
  `-`, `_` saja. Tidak ada pemisah path, tidak ada titik.

Contoh `plugin.json` (paket bawaan **code-reviewer**, `plugins.rs:1178-1187`):

```json
{
  "name": "code-reviewer",
  "description": "A review agent that reads the diff before the code, and a skill with a correctness-first checklist for reviewing a change.",
  "version": "1.0.0",
  "author": "zephyr",
  "provides": {
    "skills": ["code-review"],
    "agents": ["reviewer"]
  }
}
```

Blok `provides` menerima dua bentuk entri: nama polos (`"skills":
["conventional-commits"]`) maupun objek (`{"name": "..."}`) — keduanya dibaca
oleh `nama_entri` (`plugins.rs:172-185`) dan `Provides::nama`
(`plugins.rs:104-107`).

---

## 3. Tiga pintu masuk pemasangan

UI-nya ada di pane **Plugins** (`AgcPlugins`, `AgcSections.tsx:1550`). Di grup
**Installed** ada dua tombol, dan di grup **Available** ada tombol Install per
paket:

| Pintu masuk | Tombol / test-id | Frontend | Command Tauri |
|---|---|---|---|
| Folder | `agc-plugins-folder` — "Install from folder…" (`AgcSections.tsx:1661-1667`) | `pasangDari('folder')` → `pasang(path)` | `plugin_install` |
| Berkas `.zip` | `agc-plugins-zip` — "Install from .zip…" (`AgcSections.tsx:1668-1670`) | `pasangDari('zip')` → `pasang(path)` | `plugin_install` |
| Paket bawaan | `agc-plugin-install-<id>` — "Install" (`AgcSections.tsx:1761-1768`) | `pasangBawaan(id)` | `plugin_install_bundled` |

Alurnya di frontend (`pluginsStore.ts`):

- `pasang(path)` → `invoke<string>('plugin_install', { path })` (`pluginsStore.ts:180-191`)
- `pasangBawaan(id)` → `invoke<string>('plugin_install_bundled', { name: id })` (`pluginsStore.ts:193-204`)

Kedua tombol folder/zip bahkan lewat dialog yang sama-sama menghasilkan path,
lalu `pasang(path)` yang sama:

```ts
// AgcSections.tsx:1582-1590
const pasangDari = async (dari: 'folder' | 'zip') => {
  try {
    const path = dari === 'folder' ? await folderDialogOpen() : (await fileDialogOpen(false))?.[0];
    if (!path) return;
    await pasang(path);
  } catch (e) {
    usePlugins.setState({ galat: String(e) });
  }
};
```

### Catatan penting soal "satu command"

Di backend, `plugin_install` memang **bercabang `is_dir()`** — folder vs zip
ditentukan dari apakah path yang dikasih itu direktori atau bukan
(`plugins.rs:369-380`):

```rust
#[tauri::command]
pub fn plugin_install(state: State<AppState>, path: String) -> ZResult<String> {
    let asal = PathBuf::from(path.trim());
    if !asal.exists() {
        return Err(ZephyrError::NotFound(format!("plugin source not found: {}", asal.display())));
    }
    let sumber = if asal.is_dir() { "folder" } else { "zip" };
    pasang_dari(&state, &asal, sumber)
}
```

Tapi **paket bawaan bukan lewat `plugin_install`** — dia punya command sendiri,
`plugin_install_bundled` (`plugins.rs:403-408`). Yang benar-benar sama untuk
ketiga pintu masuk adalah **langkah akhirnya**: semuanya berakhir di
`pasang_akar` (validasi → pindah ke `plugins/<name>` → catat ke registry).

```text
folder  ──pasang_dari──▶ copy_dir ─┐
zip     ──pasang_dari──▶ unzip_zext ├─▶ pasang_akar(validasi, pindah, catat)
bundled ──pasang_isi───▶ tulis file ┘
```

Kalau kamu baca ini untuk menambah pintu masuk keempat, titik sambungnya ada di
`pasang_akar` (`plugins.rs:437-485`).

---

## 4. Alur pemasangan di disk (staging → validasi → pindah → registry)

Semua jalur pasang memakai pola yang sama: tulis dulu ke
`<data_dir>/plugins/.staging`, baru pindah ke `plugins/<name>` setelah lolos
validasi. Staging **selalu** dihapus di akhir, sukses maupun gagal
(`plugins.rs:365-368`).

### a. Folder / `.zip` → `pasang_dari` (`plugins.rs:382-400`)

```rust
fn pasang_dari(state: &AppState, asal: &Path, sumber: &str) -> ZResult<String> {
    let staging = plugins_dir(state).join(".staging");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging)?;

    let hasil = (|| -> ZResult<PathBuf> {
        if asal.is_dir() {
            let mut terpakai = 0u64;
            crate::ext_pkg::copy_dir(asal, &staging, &mut terpakai)?;
        } else {
            crate::ext_pkg::unzip_zext(asal, &staging)?;
        }
        Ok(turun_ke_akar(&staging))
    })();

    let hasil = hasil.and_then(|akar| pasang_akar(state, &akar, sumber));
    let _ = std::fs::remove_dir_all(&staging);
    hasil
}
```

- **Folder** disalin lewat `ext_pkg::copy_dir`, yang melewati `.git`,
  `node_modules`, dan `target`, serta membatasi total ukuran
  (`ext_pkg.rs:482-500`).
- **Zip** diekstrak lewat `ext_pkg::unzip_zext`. Penjaga **zip-slip** ada di
  sini: setiap entri dicek lewat `enclosed_name()`, dan entri yang `None`
  (path absolut, `..`, drive letter) **ditolak** (`ext_pkg.rs:531-534`).
  Jadi zip tidak bisa menulis ke luar folder tujuannya.
- `turun_ke_akar` (`plugins.rs:487-505`) menoleransi dua bentuk zip: isi paket
  langsung di root, atau di dalam satu folder tingkat atas (bentuk `git
  archive`) — sama-sama dicari `plugin.json`-nya.

### b. Paket bawaan → `pasang_isi` (`plugins.rs:410-434`)

Menulis setiap berkas paket (`(rel, isi)`) ke staging, lalu memanggil
`pasang_akar` yang sama.

### c. Validasi + pindah + catat → `pasang_akar` (`plugins.rs:436-485`)

```rust
fn pasang_akar(state: &AppState, akar: &Path, sumber: &str) -> ZResult<String> {
    let man = baca_manifest(akar)?;      // plugin.json wajib valid
    cek_bagian(akar, &man)?;             // semua berkas yang dijanjikan wajib ada
    ...
    std::fs::rename(akar, &tujuan)...    // pindah ke plugins/<name>
    ...
    write_registry(state, &list)?;       // catat di installed.json
    Ok(man.name)
}
```

Urutan pastinya:

1. **Baca manifest** (`baca_manifest`, `plugins.rs:289-328`). `plugin.json`
   wajib ada; nama wajib valid (kalau `"name": "../evil"` → error
   "invalid plugin name", lihat uji `manifest_wajib_punya_nama`
   `plugins.rs:1343-1355`).
2. **Cek setiap bagian** (`cek_bagian`, `plugins.rs:351-359`). Tiap entri di
   `provides` di-resolve lewat `jalur_bagian` → `ext_pkg::resolve_in_ext`
   (`plugins.rs:330-349`) dan **harus ada**. Janji yang tidak ditepati paket =
   ditolak sebelum sempat terpasang (uji `pasang_menolak_berkas_yang_tidak_ada`
   `plugins.rs:1390-1404`).
3. **Pindah** folder paket ke `plugins/<name>` (kalau folder tujuan sudah ada,
   dihapus dulu). Re-install di atas plugin yang sedang enabled akan
   memutus wiring-nya dan plugin balik ke keadaan nonaktif
   (`plugins.rs:443-455`).
4. **Catat di registry** `installed.json` (`plugins.rs:457-483`). Entri baru
   ditulis dengan `enabled: false` (`plugins.rs:464`) — lihat bagian 5.

> Uji unit `pasang_folder_mendaftar_dan_menyalin` (`plugins.rs:1368-1388`)
> menegaskan: setelah install, `plugin.json` ikut pindah, staging tidak
> tersisa, folder sumber tidak diubah (install = copy, bukan move), dan
> `enabled` tetap `false`.

---

## 5. Dua langkah: Install lalu Enable

Ini poin yang paling sering salah dipahami. **Setelah install, plugin belum
melakukan apa-apa.** Dia cuma ada di disk + tercatat di registry dengan
`enabled: false` (`plugins.rs:464`, uji `plugins.rs:1382`).

Hal baru benar-benar terpasang setelah menekan **Enable**. Enable memanggil
`plugin_enable(name, true)` → `aktifkan` (`plugins.rs:663-678, 689-863`), yang:

| Kontribusi | Pemiliknya | Ke mana |
|---|---|---|
| skills | `crate::skills` | `<scope>/skills/<nama>/SKILL.md` (`plugins.rs:700-715`) |
| rules | `crate::instructions` | `<scope>/instructions/<nama>.md` (`plugins.rs:717-736`) |
| mcp | `crate::settings` | `mcp.servers[]` — daftar yang sama dengan pane MCP (`plugins.rs:806-834`) |
| hooks | daftar hook frontend | **dikembalikan** oleh `plugin_enable`, tidak ditulis di sini (`plugins.rs:738-776`) |
| agents | daftar persona frontend | **dikembalikan** oleh `plugin_enable`, tidak ditulis di sini (`plugins.rs:778-804`) |

- `<scope>` = workspace aktif (`.zephyr/...`) kalau ada, kalau tidak folder data
  aplikasi (`scope_untuk`, `plugins.rs:636-652`).
- Hooks dan agents sengaja **dikembalikan**, bukan ditulis: hooks/personas
  hidup di store frontend yang disimpan ke localStorage, dan Rust tidak bisa
  menulis localStorage. Frontend yang menggabungkannya
  (`pluginsStore.ts:206-225`).

### Hook tidak pernah nyala otomatis

Ini keputusan tetap dan berlapis:

- Di Rust, `PluginHook.enabled` selalu `false` (`plugins.rs:573-584`, dan saat
  dibentuk di `plugins.rs:768`).
- Di frontend, `keHook` memaksa `enabled: false` (`pluginsStore.ts:119-130`):

```ts
// pluginsStore.ts:119-130
/** A plugin hook is stored switched off, the same rule the Hooks pane follows. */
function keHook(h: PluginHook): Hook {
  return {
    ...
    enabled: false,
    ...
  };
}
```

Alasan yang tertulis di kode: paket yang diam-diam menyalakan sebuah command
adalah jalur eksekusi jarak jauh yang belum pernah disetujui user
(`plugins.rs:30-33`). Jadi plugin ber-hook akan muncul di pane Hooks dengan
toggle **mati**; user yang menyalakannya sendiri.

Uji `uji-plugin.mjs` mengecek ini di P5: hook muncul di `agentExtras` dengan
`enabled: false` (`scripts/uji-plugin.mjs:20`).

---

## 6. Grup UI, Enable/Disable, dan Hapus

### Grup di pane

Pane **Plugins** (`AgcPlugins`) punya dua grup (test-id di
`AgcSections.tsx`):

- **Installed** — `data-testid="agc-plugins-installed"` (`AgcSections.tsx:1656`):
  plugin yang sudah terpasang, plus tombol Install from folder / .zip.
- **Available** — `data-testid="agc-plugins-available"` (`AgcSections.tsx:1740`):
  paket marketplace yang **belum** terpasang (`tersedia = pasar.filter((p) =>
  !p.installed ...)`, `AgcSections.tsx:1575`).

Tiap baris Installed menampilkan nama, versi, deskripsi, author, chip scope
(`this workspace` / `all workspaces`) dan chip `provides` (mis.
`skill:conventional-commits`), plus penanda `files missing` kalau folder paket
sudah hilang (`AgcSections.tsx:1678-1697`).

### Enable / Disable

Tombolnya berganti label sesuai keadaan (`AgcSections.tsx:1717-1724`,
test-id `agc-plugin-enable-<name>` / `agc-plugin-disable-<name>`): klik →
`aktifkan(name, !p.enabled)` → `plugin_enable(name, enabled)`
(`pluginsStore.ts:206-225`). Enable menulis skill/rule/mcp dan menggabungkan
hook/agent; disable (`nonaktifkan`, `plugins.rs:865-950`) menghapus tepat
path yang dicatat saat enable (dan hanya setelah mengecek ulang tiap path
masih di dalam scope root), lalu membersihkan folder scope yang kosong
(`prune_kosong`, `plugins.rs:952-969`).

Laporan setelah toggle ditampilkan di bawah daftar (test-id
`agc-plugins-status`, `AgcSections.tsx:1618-1654`): berapa berkas tertulis,
hook, agent, MCP server, dan scope-nya.

### Hapus (Remove)

- Command: `plugin_remove` (`plugins.rs:1054-1071`).
- Di UI, tombol "Remove" (`AgcSections.tsx:1725-1732`) hanya **membuka
  konfirmasi**; penghapusan sebenarnya baru terjadi setelah menekan
  **"Remove for good"** (test-id `agc-plugin-konfirmasi-hapus-<name>`,
  `AgcSections.tsx:1699-1714`). Ada tombol "Cancel" di sebelahnya.
- Backend `hapus_plugin` **melepas wiring dulu** baru menghapus folder:

```rust
// plugins.rs:1058-1071
fn hapus_plugin(state: &AppState, name: &str) -> ZResult<()> {
    let (list, idx) = ambil_entry(state, name)?;
    if list[idx].enabled {
        nonaktifkan(state, name)?;      // kalau masih enabled, di-disable dulu
    }
    let dir = paket_dir(state, name);
    if dir.is_dir() {
        std::fs::remove_dir_all(&dir)?;
    }
    let mut list = read_registry(state);
    list.retain(|e| e.name != name);
    write_registry(state, &list)?;
    Ok(())
}
```

Catatan: secara kode, user **tidak diwajibkan** menekan Disable dulu secara
manual — kalau plugin masih `enabled`, `hapus_plugin` yang men-disable-nya
sendiri (`plugins.rs:1060-1062`). Jadi syarat "harus di-disable dulu" di sini
sudah ditangani otomatis oleh backend.

Di frontend, `hapus(name)` juga membersihkan hook & persona dari store
frontend setelah command sukses (`pluginsStore.ts:227-241`).

---

## 7. Konflik nama = skip-and-report (tidak menimpa)

Saat Enable, kalau sebuah skill/rule dengan nama sama sudah ada dan **bukan
milik plugin ini**, berkas itu **tidak ditimpa** — malah dicatat sebagai
`skipped`:

```rust
// plugins.rs:704-708 (versi ringkas; skills)
let dst = scope.skills.join(&n);
if dst.exists() && !sudah.iter().any(|p| Path::new(p) == dst) {
    skipped.push(dst.to_string_lossy().to_string());
    continue;
}
```

Hal yang sama untuk rules di `plugins.rs:728-732`. Path yang di-skip masuk ke
`PluginToggle.skipped` (`plugins.rs:617-619`), dan pane menampilkannya sebagai
"Kept your own file, not overwritten: <path>" (`AgcSections.tsx:1633-1644`).

Uji P4 di `uji-plugin.mjs` persis menguji ini: berkas user dengan nama sama
TIDAK ditimpa dan dilaporkan `skipped` (`scripts/uji-plugin.mjs:19`). Uji P7
juga menegaskan enable dua kali berturut-turut tidak salah menyebut berkasnya
sendiri sebagai `skipped` (`scripts/uji-plugin.mjs:22`).

Panjang maksimum satu bagian (skill/rule) dibatasi `BAGIAN_MAX` = 256 KB
(`plugins.rs:77-79`), sama dengan batas skill manual.

---

## 8. Paket bawaan marketplace

Marketplace internal Zephyr punya **tiga** hal yang berbeda: index, daftar
paket, dan pencari.

- Index-nya **ditanam di dalam biner**, bukan hasil `git clone`:
  `MARKETPLACE_JSON` (`plugins.rs:1079-1093`). Alasannya tertulis di kode: index
  yang bisa melenceng dari paket yang ditunjuk lebih buruk daripada tidak ada
  index, dan ada test (`marketplace_konsisten`) yang menggagalkan build kalau
  keduanya berbeda (`plugins.rs:1076-1078`, test di `plugins.rs:1656`).
- Daftar paket: `const PAKET` (`plugins.rs:1232-1250`), berisi `(id, files)`.
- Pencari: `cari_paket(id)` (`plugins.rs:1252-1254`) dipakai oleh
  `plugin_install_bundled` (`plugins.rs:404-407`).

Saat ini ada **dua** paket bawaan:

### `conventional-commits` (skill + rule + hook)

- Manifest: `MANIFEST_CC` (`plugins.rs:1095-1105`) — `provides: { skills:
  ["conventional-commits"], rules: ["conventional-commits"], hooks:
  ["commit-subject"] }`.
- Berkasnya di `PAKET` (`plugins.rs:1233-1241`): `plugin.json`,
  `skills/conventional-commits/SKILL.md`, `rules/conventional-commits.md`,
  `hooks/commit-subject.json`.
- Hook-nya OFF sampai user menyalakan sendiri (§5).

### `code-reviewer` (skill + agent `reviewer`)

- Manifest: `MANIFEST_CR` (`plugins.rs:1178-1187`) — `provides: { skills:
  ["code-review"], agents: ["reviewer"] }`.
- Berkasnya di `PAKET` (`plugins.rs:1242-1249`): `plugin.json`,
  `skills/code-review/SKILL.md`, `agents/reviewer.json` (definisi agen
  `AGENT_CR`, `plugins.rs:1222-1229`).
- Paket ini **tidak punya hook** — makanya di uji P3 hook-nya "belum ada" dan
  hook baru muncul di P5 untuk paket `conventional-commits`
  (`scripts/uji-plugin.mjs:17-20`).

Daftar marketplace dibaca oleh `plugins_marketplace` → `pasar_terpasang`
(`plugins.rs:541-568`): untuk tiap entri index, manifest-nya diambil dari paket
yang sudah terpasang atau dari paket bawaan (`baca_manifest_bawaan`,
`plugins.rs:324-328`), lalu ditandai `installed` kalau sudah ada di registry.

---

## 9. Menambah paket bawaan baru

Tiga langkah, semuanya di `src-tauri/src/plugins.rs`:

1. **Tambah isi paket** — buat `const` untuk `plugin.json` + tiap berkas
   bagian (mengikuti pola `MANIFEST_CC`/`SKILL_CC`/`RULE_CC`/`HOOK_CC`,
   `plugins.rs:1095-1176`).
2. **Daftarkan di `PAKET`** — tambahkan tuple `(id, files)` di
   `plugins.rs:1232-1250`.
3. **Daftarkan di `MARKETPLACE_JSON`** — tambahkan entri `{ id, category,
   homepage }` di `plugins.rs:1079-1093`.

Dua daftar terakhir **harus kompak**: test `marketplace_konsisten` gagal kalau
ada id di index yang tidak punya paket, atau sebaliknya (`plugins.rs:1076-1078`,
test di `plugins.rs:1656`). Jadi menambah paket tanpa memperbarui index (atau sebaliknya)
akan menggagalkan build.

---

## 10. Yang TIDAK bisa dipasang: `.vsix` VS Code

Jalur plugin Zephyr **hanya menerima folder atau `.zip`** — `plugin_install`
menentukan sumbernya dari `is_dir()` (`plugins.rs:378`), dan `unzip_zext`
hanya membuka arsip zip (`plugins.rs:392`). Tidak ada penanganan `.vsix` di
mana pun dalam kode plugin maupun pemasangan extension:

- Pencarian teks `vsix` di seluruh repo hanya menemukan hal **kosmetik**:
  pemetaan ikon berkas (`src/lib/fileIconMap.ts:1135-1136`), komentar di CSS
  menu aksi extension (`src/styles/extensions.css:37-38`), komentar di
  `ext_bundled_extra.rs:4-6`, dan sebuah skrip uji tema yang mengunduh tema
  VS Code (`scripts/cek-tema-vscode.mts:21`). Tidak ada satu pun yang
  memasang `.vsix` sebagai plugin.
- Sistem **extension** Zephyr sendiri (`extensions_install`) pun hanya
  menerima folder, berkas `.zext`/`.zip`, atau manifest `package.json`
  (`ext_pkg.rs:615-637`) — bukan `.vsix`.

Kalau kamu butuh membawa ekosistem plugin pihak ketiga, **presedennya adalah
`cc_plugins.rs`** (plugin Claude Code dari `~/.claude/plugins`). Modul itu
tidak meniru format plugin itu sendiri, melainkan **mendelegasikan** ke CLI
`claude` yang asli — lihat komentar pembukanya (`cc_plugins.rs:1-13`):

> *"...installs by delegating to the real `claude plugin` CLI rather than
> reimplementing the install."* dan *"The CLI is the source of truth for what
> 'installed' means."*

Jadi pola yang dipakai repo ini untuk format plugin asing adalah adapter yang
menyerahkan pekerjaan ke host/pemilik formatnya.

> Catatan kejujuran: alasan spesifik "tidak ada extension host JS" untuk
> `.vsix` **tidak** dinyatakan apa adanya di `plugins.rs`. Yang terbukti di kode
> cuma: tidak ada jalur pemasangan `.vsix` sama sekali. Adapter `cc_plugins.rs`
> adalah pendekatan yang dipakai repo ini untuk format plugin pihak ketiga.

---

## 11. Cara menguji

Uji end-to-end-nya ada di `scripts/uji-plugin.mjs`. Bukan uji unit — yang
diperiksa adalah **jalur yang benar-benar dijalani user**: tombol di pane
Plugins → store frontend → command Tauri → berkas di disk dan settings
(`scripts/uji-plugin.mjs:1-12`).

```bash
node scripts/uji-plugin.mjs 9223
```

- Argumennya port CDP aplikasi debug; **default `9223`** kalau tidak dikasih
  (`scripts/uji-plugin.mjs:31`).
- **App debug di port itu harus hidup** dan sudah di-reload agar bridge plugin
  terpasang. Kalau bridge belum ada, skrip berhenti dengan pesan
  `BERHENTI: bridge plugin belum ada di halaman ini (app perlu di-reload).`
  dan `process.exit(2)` (`scripts/uji-plugin.mjs:43-50`).
- Verifikasinya berlapis (`scripts/uji-plugin.mjs:6-12`): (1) laporan command,
  (2) disk nyata dicek Node lewat `fs.existsSync` (bukan dipercaya dari laporan
  Rust), (3) pane yang seharusnya berubah (Skills, Hooks, Personas) dibaca dari
  store pemiliknya.
- Kasus yang diuji P1–P9, lihat daftarnya di `scripts/uji-plugin.mjs:14-24`.
- Lulus kalau semua check lewat: exit code 0, kalau tidak 1
  (`scripts/uji-plugin.mjs:316-318`).

Bridge yang dipakai uji ada di `src/lib/devBridge.ts:178-184`:

```ts
// devBridge.ts:178-184
w.__ZEPHYR_PLUGINS__ = {
  usePlugins,
  skills: async () => (await import('./skillsStore')).useSkills.getState().daftar,
  instructions: async () => (await import('./instructionsStore')).useInstructions.getState().daftar,
  personas: async () => (await import('./personaStore')).usePersona.getState().daftar,
  hooks: () => useAgentExtras.getState().hooks,
};
```

---

## 12. Di mana pane Plugins muncul

Perlu dikoreksi sedikit: pane `AgcPlugins` **bukan** di halaman Settings.
Komponennya dipakai di **`AgentCustomModal`** — modal "Agent Customizations"
sendiri, dan komentar di kode menyebut ini sengaja **tidak** ditaruh di Settings
(`AgentCustomModal.tsx:12-13`). Import-nya di `AgentCustomModal.tsx:10` dan
render-nya lewat `case 'plugins': return <AgcPlugins />;`
(`AgentCustomModal.tsx:328-329`).

Store datanya `usePlugins` (`pluginsStore.ts:159`), dengan aksi `muat`,
`pasang`, `pasangBawaan`, `aktifkan`, `hapus` yang masing-masing memanggil satu
command Tauri (`plugins_list`, `plugin_install`, `plugin_install_bundled`,
`plugin_enable`, `plugin_remove`).

Semua command plugin didaftarkan di `src-tauri/src/lib.rs:544-549`.

---

## 13. Peta bukti (ringkas)

| Klaim | Bukti |
|---|---|
| Bentuk folder plugin (`plugin.json` + `skills/ rules/ agents/ hooks/ mcp/`) | `src-tauri/src/plugins.rs:37-46` |
| `plugin_install` bercabang `is_dir()` | `src-tauri/src/plugins.rs:369-380` |
| Paket bawaan lewat `plugin_install_bundled` (command terpisah) | `src-tauri/src/plugins.rs:403-408` |
| Ketiganya bertemu di `pasang_akar` | `src-tauri/src/plugins.rs:397, 430, 437-485` |
| Staging `plugins/.staging`, selalu dibersihkan | `src-tauri/src/plugins.rs:383, 417, 365-368` |
| `copy_dir` / `unzip_zext` + tolak zip-slip | `src-tauri/src/plugins.rs:388-393`; `src-tauri/src/ext_pkg.rs:482-500, 510-534` |
| Validasi manifest + semua bagian wajib ada | `src-tauri/src/plugins.rs:351-359, 437-439` |
| Pindah ke `plugins/<name>` | `src-tauri/src/plugins.rs:450` |
| Catat di `installed.json` (`enabled: false`) | `src-tauri/src/plugins.rs:457-483, 464` |
| Install ≠ Enable (uji) | `src-tauri/src/plugins.rs:1368-1388` |
| Hook tidak pernah nyala otomatis (Rust + frontend) | `src-tauri/src/plugins.rs:572-576, 768`; `src/lib/pluginsStore.ts:119-130` |
| Grup UI Installed / Available | `src/components/settings/AgcSections.tsx:1656, 1740` |
| Enable `plugin_enable` / Disable `nonaktifkan` | `src-tauri/src/plugins.rs:662-678, 865-950` |
| Hapus `plugin_remove` + konfirmasi "Remove for good" | `src-tauri/src/plugins.rs:1051-1071`; `AgcSections.tsx:1699-1714` |
| Konflik nama = skip-and-report | `src-tauri/src/plugins.rs:704-708, 728-732, 617-619`; `AgcSections.tsx:1633-1644` |
| Marketplace index ditanam (`MARKETPLACE_JSON`) | `src-tauri/src/plugins.rs:1079-1093` |
| Paket bawaan `conventional-commits` / `code-reviewer` | `src-tauri/src/plugins.rs:1232-1250` |
| Menambah paket = file + `PAKET` + `MARKETPLACE_JSON` | `src-tauri/src/plugins.rs:1079-1093, 1232-1250` |
| `.vsix` tidak ada jalur pasang | `src-tauri/src/plugins.rs:378, 392`; `src-tauri/src/ext_pkg.rs:615-637` |
| Preseden adapter plugin pihak ketiga (Claude Code) | `src-tauri/src/cc_plugins.rs:1-13` |
| Cara menguji (`node scripts/uji-plugin.mjs 9223`) | `scripts/uji-plugin.mjs:1-31, 43-50, 316-318` |
| Bridge `__ZEPHYR_PLUGINS__` | `src/lib/devBridge.ts:178-184` |
| Pane ada di AgentCustomModal, bukan Settings | `src/components/settings/AgentCustomModal.tsx:10, 12-13, 328-329` |
| Command plugin terdaftar | `src-tauri/src/lib.rs:544-549` |
