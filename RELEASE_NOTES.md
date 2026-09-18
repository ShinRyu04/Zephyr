# Zephyr v1.1.8

## UPDATE NIH

Marketplace makin gede, model AI makin lengkap, notifikasi update makin jelas.

### Marketplace Bahasa 101

Semua language pack programmer sekarang ada di Marketplace — dari Python, JavaScript, Rust, Go, C/C++, sampe COBOL, Brainfuck, APL, dan lainnya. Tinggal cari, Install, Enable. Jalan tanpa error.

### Logo Asli Tiap Bahasa

Gak pake inisial warna lagi. Tiap bahasa di Marketplace sekarang pake logo asli (Simple Icons / Devicon / VS Code Icons) yang kebundel langsung di app — offline tetep muncul.

### Model AI Dari Dulu Sampai Sekarang

Katalog model tiap provider diisi dari yang paling awal sampe yang paling baru:

- **Google Gemini:** 1.0 Pro → 3.8 Flash, plus Nano Banana buat gambar
- **OpenAI:** GPT-3.5 → GPT-6 Astra, plus seri o1/o3 buat reasoning
- **Anthropic:** Claude 1 → Claude Fable 5.1, plus Sonnet/Opus/Haiku
- **DeepSeek:** V3 → V4 Pro, plus Coder & Reasoner

Mau pake model lawas yang murah atau model terbaru, semua ada di dropdown.

### Custom / Lokal AI Makin Gampang

Pake model sendiri (Ollama, LM Studio, OpenAI-compatible, dll) sekarang gampang:

- **Settings → Model AI → pilih "Lokal (opencode / loopback)" atau "Custom"**.
- **Base URL** diisi (buat Ollama: `http://127.0.0.1:11434/v1`), lalu **model name** diketik di kolom — sekarang ada **tombol ▾ dropdown** biar tinggal pilih dari daftar katalog + daftar dari API (tombol **Refresh** narik model langsung dari provider).
- **Munculnya di panel AI (kiri bawah), bukan cuma terminal AI** — dropdown model di panel AI nampilin model custom yang udah kamu set, dilengkapi logo & status key. Ada petunjuk "Cara pakai" langsung di halaman Settings.

### Notifikasi Update Dengan Daftar Perubahan

Notifikasi "versi baru tersedia" (dialog update, banner, sama lonceng) sekarang nampilin catatan rilis beneran — heading, poin-poin, sama tabel daftar perubahan. Jadi langsung keliatan apa aja yang baru, bukan cuma "Versi baru tersedia".

### Dialog Update Gaya Zephyr

Dialog "Zephyr v1.1.8 tersedia" sekarang versi Zephyr sendiri:
- Lebih gede — changelog langsung kelihatan tanpa scroll panjang.
- Ada baris versi lama → versi baru + tanggal rilis.
- Tombol **Lihat di GitHub** buat buka halaman Release langsung.
- Tombol **Nanti** / **Download & install**.

### Build Linux (Coming Soon)

Workflow GitHub Actions `build-linux` udah disiapin: pas rilis versi berikutnya, otomatis kebuild `.deb` + `.AppImage` buat Linux, release di GitHub Releases. Pantengin terus.

### Rekomendasi Extension Otomatis

Buka workspace dengan bahasa tertentu, Marketplace nyaranin extension yang cocok buat bahasa itu.

### Donasi (Saweria)

Zephyr gratis dan tetap gratis. Kalau kamu suka dan mau dukung pengembangannya, ada tombol **☕ Donasi** di **status bar bawah** (kanan) dan di **Settings → Tentang** — langsung buka Saweria (`saweria.co/ShinRyuga04`). Bisa juga lewat **Help → Donasi** atau `Ctrl+Shift+P` → ketik "donasi". Traktiranmu banget diapresiasi. 🙏

---

## Cara Update

- **Baru pertama:** ambil `Zephyr_1.1.8_x64-setup.exe` atau `.msi` di Releases.
- **Udah punya:** Settings → About → Check for updates. Atau tunggu notif lonceng kalo auto-update nyala.

Signature installer diverifikasi app sebelum install. SmartScreen tetep bisa protes karena bukan sertifikat EV — More info → Run anyway. Aman.

---

**Catatan:** installer ditandatangani (minisign) buat auto-update, jadi update yang ke-download cuma dipasang kalo signature-nya cocok.

Gaskeun.