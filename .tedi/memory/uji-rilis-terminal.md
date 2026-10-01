# Menguji terminal/exe RILIS - jebakan yang sudah kena

Ditulis 2026-10-01 setelah sesi panjang "terminal bermasalah di release".
Kesimpulan akhir: **terminal di rilis sehat.** Yang salah adalah cara mengujinya.
Empat jebakan di bawah ini semuanya pernah membuat kesimpulan keliru.

## 1. Port debug 9333 bisa milik aplikasi LAIN

`D:\Abel` (Electron, judul "Abel - Asisten AI Pribadi") memakai
`--remote-debugging-port=9333`. Saat menempel ke 9333 sambil mengira itu Zephyr,
yang terbaca justru app Abel - lengkap dengan `localhost:5174` dan
"Maximum update depth exceeded" miliknya.

**Aturan:** sebelum memercayai sembarang port CDP, cek identitas targetnya:

```powershell
node -e "fetch('http://127.0.0.1:9444/json/list').then(r=>r.json()).then(l=>l.forEach(t=>console.log(t.title+' | '+t.url)))"
```

Target Zephyr harus `http://tauri.localhost/`. Kalau bukan, itu app lain.
Pakai port yang tidak dipakai siapa pun (9444 dipakai untuk ini).

## 2. `cargo build --release` TIDAK menanam frontend

Menghasilkan `zephyr.exe` yang **tetap menunjuk dev server** dan mati kalau dev
server mati. Tauri menyuntikkan aset frontend saat `tauri build`, bukan `cargo build`.

**Yang benar (exe saja, tanpa installer):**

```powershell
npx tauri build --no-bundle      # ~9-10 menit
```

**Bukti cepat bahwa frontend benar-benar tertanam** (bukan sekadar percaya):

```powershell
$b=[IO.File]::ReadAllBytes("D:\Zephyr\src-tauri\target\release\zephyr.exe")
$t=[Text.Encoding]::ASCII.GetString($b)
$t.Contains('assets/index-')     # harus True
```

`localhost:5173` boleh saja masih ada di dalam exe: itu `BrowserPane` HOME untuk
mode dev, kode mati di rilis.

## 3. Panel bottom default BUKAN terminal

Ctrl+J membuka panel bottom, tapi tab yang aktif adalah Problems/Output/Debug
Console. Di sana `.pane-empty` menampilkan tawaran:

> Click to add a pane - Shell / Private (no history) / AI Agent…

Jadi `.xterm` = 0 pada tahap ini **normal**, bukan bug. Terminal baru ada setelah
tab `terminal` dipilih LALU "Shell" diklik.

## 4. xterm memakai DOM renderer, bukan canvas

Terminal sehat melaporkan `canvas = 0`. Yang membuktikan ia merender adalah
`.xterm-screen` + elemen `.xterm-rows > div`. Harness yang menuntut canvas akan
memberi kegagalan palsu.

## Urutan uji yang benar untuk rilis

```powershell
Get-Process zephyr -EA SilentlyContinue | Stop-Process -Force
cd D:\Zephyr\src-tauri\target\release
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9444"
Start-Process .\zephyr.exe -WorkingDirectory (Get-Location)
Start-Sleep 14
cd D:\Zephyr
node scripts/uji-terminal-rilis.mjs 9444
```

Harness itu membuka panel, memilih tab terminal, mengklik "Shell", lalu menuntut
prompt asli. Hasil terakhir: **6/6 lulus** - `PS C:\Users\home>`, ukuran
1201x440 px, 25 baris, tanpa error console.

## Catatan exe rilis

- Nama proses: `zephyr.exe`; build terakhir v1.1.13, ~9.3 MB.
- `main.rs` memakai `windows_subsystem = "windows"` di rilis, jadi **tidak ada
  stdout/stderr sama sekali**. Exe yang "mati tanpa pesan" itu normal; jangan
  menyimpulkan crash dari stdout kosong - pakai CDP.
- WebView2 menutup CDP saat idle; kalau port tiba-tiba `ECONNREFUSED`, jalankan
  ulang exe-nya.
