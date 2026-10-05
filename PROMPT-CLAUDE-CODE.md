# Prompt untuk Claude Code - Zephyr

Berkas ini untuk Claude Code (atau AI CLI lain) yang bekerja di `D:\Zephyr`.
Ringkas, dan bisa ditempel apa adanya.

---

## Bagian 1 - Konteks tetap (tempel kapan pun, sesi baru)

```
Kamu bekerja di D:\Zephyr - code editor desktop (Tauri 2 + React + TS).

BACA DULU sebelum menyentuh apa pun:
  1. AGENTS.md          - aturan kerja, jebakan per fase, larangan
  2. ARCHITECTURE.md    - kontrak nama (Tauri command, event, store, path)
  3. .tedi/memory/*.md  - pelajaran dari sesi sebelumnya (WAJIB, ini yang
                          paling sering menyelamatkan waktu)

Aturan yang tidak bisa ditawar:
  - npx tsc --noEmit HARUS 0 error sebelum bilang selesai.
  - Verifikasi dijalankan lewat CDP ke aplikasi yang HIDUP, bukan "seharusnya
    jalan". Aplikasi jalan + port debug 9223, lalu scripts/verify*.mjs.
  - Jangan pindahkan IPC ke luar src/lib/commands.ts.
  - Jangan hardcode hex di komponen; pakai CSS variable di src/styles/.
  - JANGAN tampilkan API key ke log, layar, atau berkas.
  - Jangan push/commit tanpa diminta.
  - git stash DILARANG untuk membandingkan baseline (lihat memory soal ini).

Cara menghindari tiga kesalahan yang paling mahal di proyek ini:
  - Jangan pakai backtick di dalam komentar yang berada DI DALAM template
    literal. Ia menutup template lebih awal, dan parser melaporkan error di
    baris LAIN. Pakai kutip tunggal.
  - Jangan menebak nama command/argumen bridge. Baca dari kode:
    __ZEPHYR_TOOLS__.spec(nama) untuk skema, .jalankan(nama, args) untuk
    menjalankan. Bentuk lama .find()/.run() sudah tidak ada.
  - Jangan menebak bentuk masukan saat sesuatu gagal. Tulis alat yang mencoba
    SEMUA bentuk sekaligus dan melaporkan mana yang berhasil. (Kejadian nyata:
    7 kali menebak bentuk kunci publik, semuanya gagal, karena pesan errornya
    terbaca seperti kunci rusak padahal kuncinya benar.)
```

---

## Bagian 2 - Pekerjaan yang sedang terbuka (tempel untuk melanjutkan)

```
Konteks: rilis 1.1.13 sudah dibangun, ditandatangani, dan diverifikasi. Repo
privat (Zephyr-Private) sudah berisi 270 commit. Fokus sekarang: perbaiki bug
yang ditemukan saat sesi 5 Okt 2026.

Kerjakan berurutan. Setiap selesai satu: tsc bersih, verifikasi, lapor.

=== BUG 1 - test_model_connection menyesatkan untuk provider custom ===

Gejala nyata: pengguna melihat "Test connection OK" padahal chat gagal 404.
Sebabnya bukan key-nya - key-nya benar.

Di src-tauri/src/secrets.rs, test_model_connection merakit base URL seperti ini:

    match provider {
        "openai" | "deepseek" => "https://api.openai.com/v1".to_string(),
        "anthropic" => "https://api.anthropic.com".to_string(),
        "gemini" => "...".to_string(),
        _ => "https://api.openai.com/v1".to_string(),      // <- BAHAYA
    }

Kalau provider "custom" dan baseUrl TIDAK dikirim, ia masuk ke cabang `_` dan
MENGUJI api.openai.com - bukan router pengguna. Jadi tombol itu bisa bilang OK
walau endpoint pengguna tidak bisa dihubungi sama sekali.

Yang benar:
  - provider "custom" WAJIB memakai baseUrl yang dikirim; kalau kosong,
    kembalikan error yang jelas ("custom provider butuh base URL"), JANGAN
    diam-diam jatuh ke OpenAI.
  - Pesan hasilnya sebutkan URL yang BENAR-BENAR diuji, supaya tidak
    menyesatkan lagi.

Uji: panggil dari aplikasi hidup dengan baseUrl sengaja salah, pastikan
hasilnya GAGAL (bukan OK). Lalu dengan baseUrl benar, pastikan OK.

=== BUG 2 - mode agent menelan pesan error ===

Gejala nyata: pengguna menekan kirim, tidak ada reaksi, tidak ada error, tidak
ada toast. Terlihat seperti "AI tidak bisa dipakai" tanpa penjelasan.

Di src/lib/aiStore.ts, `send()` untuk mode agent:

    if (get().agentMode === 'agent') {
      ...
      return get().sendAgent(raw, imgs, tampil);   // hasilnya diteruskan mentah
    }

Ada jalur di sendAgent yang `return false` tanpa menyetel toast - jadi
penolakan terjadi dalam diam. Hal yang sama terlihat saat ini: run gagal, dan
satu-satunya jejak adalah tombol berubah jadi "Continue from where it stopped".

Yang benar: SETIAP `return false` dari jalur agent harus meninggalkan jejak yang
terlihat - toast, atau bubble error di percakapan. Tidak boleh ada penolakan
yang tidak terlihat.

Uji: dari aplikasi hidup, picu setiap jalur penolakan satu per satu, dan
pastikan masing-masing menghasilkan pesan yang bisa dibaca pengguna.

=== BUG 3 - model pilihan pengguna tidak tersimpan / kembali ke placeholder ===

Gejala nyata: provider custom memakai model "custom-model" (placeholder) walau
pengguna memilih model lain di UI.

Sesudah diperiksa: UI dan settings.json SEPAKAT nilainya - jadi bukan sekadar
soal tidak tersimpan. Yang perlu dicari: dari mana "custom-model" muncul
pertama kali, dan kenapa pilihan pengguna tidak menggantinya.

Yang benar: model pilihan pengguna harus bertahan, dan provider custom yang
modelnya masih placeholder sebaiknya memberi tahu ("model belum dipilih"),
bukan mengirim nama yang pasti ditolak.

Uji: pilih model dari UI, muat ulang aplikasi, pastikan pilihannya masih ada.

=== JEBAKAN YANG SUDAH KETEMU (jangan jatuh lagi) ===

- secrets.json menyimpan key sebagai base64(XOR(key)), BUKAN teks polos.
  Membaca nilainya lalu mengirim langsung ke provider = mengirim sampah, dan
  jawabannya 401 - terbaca seperti key salah padahal key-nya baik. Kalau perlu
  key asli untuk uji, dekripsi dulu; alatnya ada di
  verifikasi-rilis/src/bin/dekrip.rs.

- settings.json TIDAK menyimpan provider/model aktif di `ai.provider`. Yang
  aktif dibaca dari tempat lain; jangan simpulkan dari settings.json saja.

- Port 8098/8099 dipakai mock uji (mock-ai.mjs, server pane browser). BaseUrl
  provider yang menunjuk ke sana adalah sisa uji, bukan setelan pengguna.
  Selalu pulihkan sesudah harness selesai - dan periksa bentuk URL-nya, karena
  menulis "http://host" tanpa titik dua menghasilkan nilai yang "berhasil
  tersimpan" tapi tidak sah.

- Provider yang aktif di mesin ini: custom -> https://modelrouter.id/v1,
  model mr-vip. Daftar model router bisa dibaca dari GET /v1/models.
```

---

## Bagian 3 - Rilis (kalau perlu membangun ulang)

```
Bangun rilis (Windows + Linux):

  # Windows
  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:APPDATA\zephyr\zephyr.key" -Raw
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "..."   # minta ke pemilik repo
  npm run tauri build

  # Linux (WSL) - WAJIB lewat skrip, jangan satu baris panjang:
  wsl -d Ubuntu -- bash /mnt/d/Zephyr/scripts/build-linux.sh

  # Kumpulkan + periksa
  node scripts/buat-notes.mjs
  node scripts/buat-latest-json.mjs
  node scripts/periksa-rilis-1.1.13.mjs

Verifikasi tanda tangan itu WAJIB, jangan dilewati:
  verifikasi-rilis/target/release/verifikasi-rilis.exe \
      <berkas> <berkas.sig> "$env:APPDATA\zephyr\zephyr.key.pub"

Catatan penting:
  - deb.sig TIDAK dibuat Tauri (updater hanya menandatangani AppImage). Yang
    tertinggal di bundle/deb bisa jadi tanda tangan rilis LAIN - terlihat
    benar, isinya salah. Buat ulang: npx tauri signer sign <berkas>
  - node_modules di /mnt/d berisi binary Windows, jadi TIDAK bisa dipakai dari
    WSL. build-linux.sh memasang CLI Tauri terpisah di home WSL.
  - release/ di-ignore git (420 MB). Jangan paksa masuk.
```

---

## Aturan untuk Claude Code saat melapor

```
Saat melaporkan, sebutkan:
  - apa yang DIUKUR (perintah, keluaran), bukan "seharusnya jalan"
  - apa yang TIDAK terbukti, kalau ada yang belum diperiksa
  - kalau ada uji yang gagal, tulis apa adanya - jangan disembunyikan

Kalau sebuah uji gagal, periksa dulu apakah UJINYA yang cacat. Di proyek ini
sudah berkali-kali terjadi: harness yang rusak lebih sering daripada kodenya.
Ciri harness rusak: mock versi lama nyangkut di port, riwayat uji menumpuk di
state, nama command/argumen yang sudah lama berubah.

"Dipulihkan" dan "berhasil" adalah KLAIM, bukan fakta. Buktikan dengan membaca
ulang nilainya, dan untuk berkas: hitung per berkas, jangan satu agregat.
```
