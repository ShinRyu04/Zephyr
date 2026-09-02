# Zephyr — Release Notes v1.0.0

Rilis pertama Zephyr: code editor desktop Windows yang ringan, dibangun dari
nol dengan Tauri 2 + React + Rust.

## Instalasi

Dua pilihan artefak:

| Berkas | Untuk apa |
|---|---|
| `Zephyr_1.0.0_x64_en-US.msi` | Installer MSI standar (per-machine / per-user) |
| `Zephyr_1.0.0_x64-setup.exe` | Installer NSIS (lebih kecil, pilihan bahasa) |

Jalankan salah satunya, ikuti wizard, lalu buka Zephyr dari Start Menu.

## Kebutuhan sistem

- Windows 10 versi 1809 atau lebih baru (ConPTY), disarankan Windows 11.
- **WebView2 Runtime** — sudah ada di semua Windows 11 dan Windows 10 yang
  ter-update. Kalau belum, installer akan memintanya; unduh dari Microsoft.
- **Git** (opsional) — hanya untuk fitur Source Control. Tanpa git, panel SCM
  memberi tahu bahwa git tidak ditemukan dan sisa app tetap normal.
- **API key AI** (opsional) — panel AI butuh key milik Anda sendiri
  (Gemini/OpenAI/Anthropic/dll), diisi di Settings → Model AI. Zephyr tidak
  menyertakan key apa pun dan tidak memakai kuota siapa pun.
- RAM: berjalan nyaman di 8GB. Idle memakai ±150–350MB termasuk proses
  WebView2 (angka persisnya bisa dilihat di Settings → Tentang → Diagnostics).

## Peringatan keamanan saat install (penting)

Installer **tidak ditandatangani secara digital** (code signing certificate
berbayar dan belum dibeli). Akibatnya:

- Windows SmartScreen akan menampilkan "Windows protected your PC" atau
  "Publisher: Unknown".
- Cara melanjutkan: klik **More info** → **Run anyway**.
- Beberapa antivirus mungkin mengkarantina installer karena alasan yang sama
  (bukan karena ada malware — file-nya cuma tidak punya tanda tangan).

Kalau Anda tidak nyaman dengan itu, jangan install. Sumber kode ada di
repositori privat dan bisa dibangun sendiri dengan `npm run tauri build`.

## Apa yang tidak dikirim ke mana pun

- Tidak ada telemetri, analytics, atau crash reporting otomatis.
- Log hanya lokal: `%APPDATA%\zephyr\logs\` (rotasi 2MB).
- API key disimpan lokal di `%APPDATA%\zephyr\secrets.json`, di-obfuskasi
  dengan XOR + kunci turunan mesin. **Ini obfuskasi, bukan enkripsi kuat** —
  orang yang sudah memegang akun Windows Anda bisa membacanya.
- Server MCP (port 9222) hanya listening di `127.0.0.1`, butuh Bearer token,
  dan bisa dimatikan dari Settings.

## Data user & uninstall

Semua data ada di `%APPDATA%\zephyr\`:

```
settings.json     preferensi
secrets.json      API key (ter-obfuskasi)
session.json      tab yang terbuka
recent.json       folder terakhir
mcp.json          token + port MCP
extensions\       ekstensi manifest-only
logs\             log harian
```

Uninstall lewat Settings → Apps membuang program, **tetapi tidak menghapus
folder di atas** — supaya settings dan key Anda tidak hilang kalau install
ulang. Hapus manual kalau memang ingin bersih total.

## Auto-update

Zephyr sudah punya kerangka auto-update lengkap: plugin updater, artefak
`.msi.zip` + `.sig`, dan tombol "Cek update" di Settings → Tentang.

**Endpoint rilisnya belum diisi** karena belum ada hosting. Selama itu, tombol
tersebut menampilkan "Update belum dikonfigurasi" dan tidak melakukan apa pun —
app tetap 100% berfungsi. Begitu URL rilis tersedia, update masuk dari dalam
app tanpa install ulang.

## Yang belum ada di 1.0.0

Jujur di depan supaya tidak salah harap:

- **SSH remote** — ditunda, menunggu server untuk diuji.
- **IntelliSense / LSP** — belum ada autocomplete berbasis bahasa, go-to
  definition, atau rename simbol. Autocomplete yang ada berbasis kata di
  dokumen.
- **Debugger (DAP)**, **tasks.json runner**, **minimap**, **sticky scroll**,
  **global search ripgrep**, **local history/timeline**, **notification
  center**, **menu bar atas**, **panel bawah (Problems/Output/Ports)**.
- **Marketplace ekstensi** — halamannya ada, isinya "segera". Ekstensi v1
  hanya membaca manifest; kode JS-nya tidak dijalankan (keputusan keamanan).

Semuanya direncanakan masuk lewat auto-update, bukan rilis besar berikutnya.

## Kalau ada masalah

1. Settings → Tentang → **Self-test cepat** — memeriksa fs, shell, git,
   socket MCP, dan penulisan log secara nyata.
2. Settings → Tentang → **Export report (JSON)** — laporan diagnostik tanpa
   secret, aman dibagikan.
3. Settings → Tentang → **Buka folder log** — `zephyr-YYYY-MM-DD.log` memuat
   jejak error, termasuk error dari sisi UI.

## Roadmap v1.1

- LSP (IntelliSense) untuk TypeScript/JavaScript, Python, Rust.
- Panel bawah: Problems, Output, Ports.
- Menu bar atas + Notification Center.
- Endpoint auto-update aktif.
- SSH remote begitu ada host uji.
