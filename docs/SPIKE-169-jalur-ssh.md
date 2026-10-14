# SPIKE 169 — Jalur SSH (aman, bisa dijangkau agen)

Status: **rancangan (read-only)**. Klaim hasil baca berkas nyata; nomor baris disebutkan.
Klarifikasi klaim lama: konteks menyebut "tool jalur SSH **belum ada**". Setelah dibaca:
**koneksi SSH untuk MANUSIA sudah ada** (config CRUD + PTY + SFTP + tunnel), dan **tool AI bernama
`mcp__zephyr__ssh` SUDAH terdaftar** — tetapi **aksi `connect`-nya STUB** dan **tidak ada jalur menjalankan
perintah**. Jadi yang bolong = **jalur eksekusi non-interaktif + penyimpanan kunci yang benar + redaksi log**.

---

## 1. Yang sudah ADA (bisa dipakai ulang)

Backend SSH — `src-tauri/src/ssh.rs`:
- Model config: `SshHost`/view dengan `key_path` (21), `save_password` (23), `password_saved` (25),
  `password_enc` (27); auth **wajib** `'key'` atau `'password'` (84-92); auth `key` wajib `keyPath` (89-91).
- Penyimpanan: `state.file("ssh.json")` (52).
- Perintah: `ssh_list` (132), `ssh_add` (137), `ssh_update` (158), `ssh_delete` (188),
  `ssh_save_password` (199) — menyimpan via `crate::secrets::encrypt_string(&password)` (**baris 211**),
  `ssh_clear_password` (219), `ssh_connect` (240) — membuka **PTY** (untuk manusia), `ssh_disconnect` (308).

SFTP — `src-tauri/src/sftp.rs`: `ssh_path()` (48), `sftp_list` (198), `sftp_upload` (219),
`sftp_download` (242), `sftp_tunnel_start` (257), `sftp_tunnel_stop` (319), `sftp_tunnel_list` (340),
`sftp_available` (349).

Tool AI (sudah terdaftar, sebagian jalan) — `src/lib/zephyrTools/mcp.ts`:
- `mcp__zephyr__ssh` spec (baris 339-360): `action: 'list' | 'connect'`, `id?`.
- `run` (353-360): `action === 'list'` **benar-benar** memanggil `cmd.sshList()` (355-356);
  `action === 'connect'` **STUB** → hanya mengembalikan string *"SSH action ${action} dijalankan."* (360).

Rust MCP — `src-tauri/src/mcp_server.rs`: `ssh` hanya muncul sebagai **nama kanal output**
(`get_output`, baris 547) — **tidak ada** tool `ssh_exec`.

Rahasia — `src-tauri/src/secrets.rs`: `encrypt_string`/`decrypt_string` dengan kunci turunan mesin
(bukan OS keyring); dipakai `ssh.rs:211`.

Log — `src-tauri/src/logging.rs`: menulis baris apa adanya (`write_line`, 49) ke
`%APPDATA%/zephyr/zephyr-<tanggal>.log` (32); rotasi 2 MiB / 3 berkas (`MAX_BYTES` 7, `KEEP` 9).
**Tidak ada fungsi redaksi.**

UI setelan: `src/components/settings/SectionsMisc.tsx` (seksi SSH).

---

## 2. Yang KURANG (tepatnya)

1. **Tidak ada eksekusi bagi agen.** `ssh_connect` (ssh.rs:240) membuka PTY untuk manusia;
   tool `connect` (mcp.ts:366) **tidak melakukan apa pun**. Agen tidak bisa menjalankan perintah di host remote.
2. **Verifikasi host-key tidak ada.** Tidak ada kebijakan/prompt fingerprint pada koneksi pertama.
3. **Rahasia = file ber-kunci-mesin.** Password/passphrase disimpan di `ssh.json` lewat `secrets::encrypt_string`
   (XOR ber-kunci turunan mesin) — **obfuscation, bukan keyring OS**; siapa pun yang bisa baca file + tahu skema
   bisa membukanya. Private key sendiri tetap berkas di disk (`key_path`), di luar kendali app.
4. **Tidak ada redaksi log.** Hasil PTY/perintah bisa memuat secret; `logging.rs` menulis mentah.

---

## 3. Rancangan teknis minimal (aman)

- **Berkas baru (front-end, murni)**: `src/lib/sshArgv.ts` —
  ```ts
  export interface TargetSsh { id: string; host: string; user: string; port: number;
                               auth: 'key' | 'password'; keyPath?: string }
  export function susunArgv(t: TargetSsh, perintah: string): string[];
  ```
  Aturan yang **dikunci di fungsi ini** (dan diuji, §6): array argumen, **bukan** string shell;
  auth `key` → `['-o','BatchMode=yes','-i', keyPath, ...]` supaya **tidak pernah** jatuh ke prompt password;
  auth `password` → memakai passphrase dari keyring, **tidak pernah** menaruh password di argv;
  host/port/user sebagai token terpisah (tanpa interpolasi shell).
- **Perintah Rust baru**: `ssh_exec(target_id, command, timeout_ms) -> { stdout, stderr, code }`
  (di `ssh.rs`). Untuk auth `key` pakai `BatchMode=yes`; **menolak** koneksi bila host key belum
  di-approve user (lihat izin di bawah). Satu koneksi per panggilan (atau sesi ter-pool — keputusan Ryu).
- **Penyimpanan rahasia**: pindahkan password/passphrase ke **OS Credential Manager** (Windows) lewat crate
  `keyring`; `ssh.json` hanya menyimpan metadata non-rahasia. `ssh_save_password` (199) jadi menulis ke keyring.
  Private key tetap **berkas di disk** milik user; app hanya menyimpan PATH-nya.
- **Tool AI**: ubah `mcp__zephyr__ssh` (mcp.ts:337) agar `connect` benar-benar bertindak, **atau** tambah
  `mcp__zephyr__ssh_exec` terpisah. Rekomendasi: **pertahankan 1 tool** dengan `action` bertambah
  (`list | connect | exec`) supaya anggaran tool per giliran tidak naik.
- **Bentuk data**: `SshTarget` (di atas), `SshExecResult { stdout, stderr, code, durasiMs }`.
- **Izin yang diminta ke pengguna**:
  - **Per-target**, bukan wildcard: user menyetujui `id` host tertentu (bukan `*`).
  - **Koneksi pertama**: tampilkan **fingerprint host key**, minta konfirmasi (Tofu → pin). Tanpa pin, `exec` ditolak.
  - Tool **tidak** masuk `TOOL_DIKIRIM_SELALU`; efek `exec` ⇒ **wajib minta izin** (aturan katalog, lihat sinyal audit §D).

## 4. Risiko + apa yang TIDAK BOLEH masuk log (dan hal butuh izin)

- **JANGAN PERNAH ke log**: password, passphrase, isi private key, `password_enc`, dan **perintah penuh** bila
  memuat rahasia (mis. `export TOKEN=…`). Tambah `redact(s)` di `logging.rs` dan **lewatkan** semua keluaran
  PTY/exec melaluinya; daftar pola: `password=`, `passphrase`, `Authorization:`, `TOKEN=`, `PRIVATE KEY`.
- **argv terlihat proses lain** di sistem yang sama. Karena itu password **tidak boleh** lewat argv/env;
  gunakan keyring/agent. Ini alasan `BatchMode=yes` untuk auth key.
- **Host-key palsu (MITM)**: tanpa pin, koneksi pertama rentan. Wajib prompt fingerprint.
- **Objektivitas klaim "aman"**: skema XOR mesin di `secrets.rs` **tidak** cukup; menyebutnya "terenkripsi"
  tanpa kualifikasi akan menyesatkan. Dokumentasikan sebagai **obfuscation** sampai dipindah ke keyring.
- **Izin baru yang dibutuhkan**: tidak ada izin Tauri baru (SSH lewat Rust). Yang "baru" adalah **izin
  per-target + konfirmasi fingerprint** di level aplikasi, dan itu keputusan UX Ryu.
- **SFTP/tunnel sudah ada** (sftp.rs) — jangan duplikasi; rencananya cukup menyambungkan jalur exec.

## 5. Langkah pertama yang paling kecil & bisa dibuktikan (<= 1 berkas)

**1 berkas baru: `src/lib/sshArgv.ts`** berisi `susunArgv()` (murni, tanpa Tauri). Langsung bisa diuji di Node
(§6) — tidak perlu jaringan, tidak perlu host. Ini mengunci invarian keamanan **sebelum** satu baris Rust ditulis.

## 6. Ukuran "jadi" yang bisa diuji (tanpa host, tanpa jaringan)

Harness Node (`.mjs`) mentranspilasi `sshArgv.ts` via `node_modules/.bin/esbuild` (bawaan vite), lalu:
- **Uji A (tanpa rahasia di argv):** untuk auth `password`, `susunArgv()` **tidak** memuat string password
  mana pun (dibuktikan dengan menandai field password sebagai canary `'__RAHASIA__'` dan memastikan ia **tidak**
  muncul di argv/`join(' ')`).
- **Uji B (BatchMode):** auth `key` menghasilkan `-o BatchMode=yes` dan `-i <keyPath>`.
- **Uji C (tanpa interpolasi shell):** host berisi spasi/`;` tidak terpecah jadi perintah kedua —
  karena keluaran adalah **array**, tiap token utuh.
- **Uji D (pagar log):** harness membaca `logging.rs` + `ssh.rs` dan **GAGAL** bila menemukan pola rahasia
  ditulis ke log tanpa lewat `redact` (mengunci §4).
- `npx tsc --noEmit` dari `D:/Zephyr` tetap **0 error**.
  Catatan (diukur 2026-10-14): repo **belum** 0 error — 3 error sudah ada di
  `src/lib/zephyrTools/kendaliJendela.ts` (di luar lane ini). Perbaiki dulu.
