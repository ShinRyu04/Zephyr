# Kontribusi

Zephyr proyek pribadi, tapi kalau kamu mau ikut memperbaikinya, ini yang perlu
diketahui supaya patch-nya bisa langsung dipakai.

## Sebelum menulis kode

Baca dulu `ARCHITECTURE.md` — itu sumber kebenaran untuk nama Tauri command,
event, bentuk store Zustand, dan batas keamanan. Kalau ada dokumen lain yang
menyebut nama berbeda, `ARCHITECTURE.md` yang menang.

## Yang harus lulus sebelum PR dibuka

```bash
npx tsc --noEmit                    # WAJIB 0 error
cd src-tauri && cargo test --lib    # 148 test harus lulus
cd src-tauri && cargo fmt           # format Rust
```

Lalu jalankan harness yang menyentuh area yang kamu ubah. Harness bekerja
terhadap app yang **hidup** lewat CDP, bukan mock:

```bash
npm run dev                # terminal 1

cd src-tauri               # terminal 2
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9223" \
  ./target/debug/zephyr.exe

npm run verify:31          # terminal 3 — ganti nomornya sesuai area
```

Kalau mengubah jalur completion, jalankan `verify:21` juga. Kalau mengubah tema
atau token warna, jalankan `node scripts/a11y-kontras.mjs` — dan hasilnya harus
tetap `TOTAL gagal 0`.

## Konvensi yang tidak bisa ditawar

**IPC lewat satu pintu.** Semua panggilan ke Rust masuk melalui
`src/lib/commands.ts`. Jangan `invoke()` langsung dari komponen.

**Warna dari CSS variable.** Hex hardcoded di komponen akan ditolak. Satu-satunya
pengecualian `rgba(0,0,0,…)` untuk backdrop dan shadow. Alasannya bukan
kerapian: aksen bisa berbeda per tema dan bisa ditimpa user, jadi `color: #fff`
di atas `var(--accent)` pernah menghasilkan kontras 3,55:1 dan gagal WCAG AA.

**Selector Zustand tidak boleh mengembalikan objek atau array baru.** Hasil
selector dibandingkan dengan `===`, jadi `useStore((s) => s.a.map(...))` memicu
`Maximum update depth exceeded`. Ambil primitif, atau hitung di store.

**Listener event Rust butuh guard modul.** React StrictMode di mode dev memasang
effect dua kali, dan tanpa guard tingkat modul setiap byte output tampil dobel.
Lihat `ptyListenerBound` / `aiListenerBound` / `mcpListenerBound` sebagai pola.

**Hook di atas early return.** Menaruh hook setelah `if (!x) return null` membuat
React melempar "Rendered fewer hooks than expected" dan `tsc` **tidak**
menangkapnya — itu pelanggaran runtime, bukan tipe.

**Path dibandingkan lewat `src/lib/pathKey.ts`.** Satu path bisa muncul dalam
tiga bentuk (`D:\a` dari Explorer, `D:/a` dari workspace, `d:\a` dari tsserver);
`===` menghasilkan tab duplikat.

**API key tidak pernah masuk log.** Frontend hanya boleh melihat `hasKey` dan
nilai tersamar.

## Menulis harness verifikasi

Beberapa jebakan yang sudah dibayar mahal; jangan diulang:

- `Runtime.evaluate` dengan `awaitPromise: true` sering gagal di WebView2
  ("Promise was collected"). Pakai helper `runAsync()` di `scripts/lib-cdp.mjs`
  yang menyimpan promise di `window` lalu polling.
- **Backtick dilarang di dalam komentar di dalam template literal.** Ia menutup
  template lebih awal dan `node --check` tetap lolos. Sudah kena 5 kali.
- Jangan cocokkan baris tree lewat `textContent` — glyph SVG ikon ikut terbawa.
  Pakai atribut `title` yang berisi path lengkap.
- Jangan hardcode nomor baris; cari MARKER di dalam fixture.
- Mengubah `input.value` dari CDP **tidak** memicu `onChange` React. Pakai
  helper `setNativeValue()`.
- `rmSync` pada fixture bisa gagal `EBUSY` karena file watcher menahan handle
  direktori. Tulis ulang isinya, jangan hapus foldernya.
- Bridge baru butuh reload halaman sebelum terlihat.

## Commit

Format: `zephyr: <ringkas apa yang berubah>`.

Isi pesan menjelaskan **kenapa**, bukan mengulang diff. Kalau kamu memperbaiki
bug, tulis akar masalahnya — pesan commit adalah tempat pengetahuan itu bertahan.

Jangan menambahkan trailer `Co-authored-by:` atau nama tool apa pun di author
maupun pesan commit.

## Yang akan ditolak

- Menjalankan kode JS ekstensi pihak ketiga. Ekstensi v1 sengaja manifest-only;
  mengeksekusi JS-nya memberi akses penuh ke `window`, artinya ke seluruh IPC.
- Telemetri, analytics, atau crash reporting ke pihak luar.
- Membuka port selain 9222 tanpa persetujuan.
- Menulis di luar folder workspace tanpa lewat pemeriksaan path.
- Refactor besar yang dicampur ke dalam PR perbaikan bug.
