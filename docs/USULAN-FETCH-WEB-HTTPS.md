# USULAN — ZEPH-FETCH-WEB-HTTPS (lanjutan yang belum bisa diterapkan sekarang)

Tanggal: 2026-10-14 · Repo: `D:/Zephyr`
Status: usulan saja. Semua butuh app hidup (harness CDP :9223) atau menyentuh berkas milik lane lain, jadi **tidak** dijalankan pada item ini.

## U1. Bukti end-to-end bahwa Rust `web_fetch` tidak dipanggil (BUTUH APP)
Yang terbukti sekarang hanya batas JS→Tauri (`cmd.webFetch` = 0 panggilan saat ditolak). Untuk menutup celah "mungkin ada jalur lain yang menyentuh transport":
* jalankan app dengan `--debug`, pasang log/hitungan di perintah Tauri `web_fetch` (`src-tauri/src/**`);
* skenario: panggil `web_fetch` dengan `http://`, `ftp://`, `https://localhost`, `https://169.254.169.254` → harapkan **0 baris log transport**;
* skenario kontrol: `https://example.org` dengan host di allowlist → tepat 1 baris log.
Batas: butuh koordinasi dengan pemilik lane `src-tauri/**` (bukan saya).

## U2. Kebijakan redirect (BUTUH APP; usulan ke sisi Rust)
Lantai ini menilai URL **awal**. `https://example.org/x` yang 302 ke `http://192.168.1.1/` atau ke host di luar allowlist belum diuji sama sekali. Usulan: transport Rust menolak redirect yang (a) turun skema ke `http:`, (b) berpindah host di luar allowlist, (c) mengarah ke IP privat/link-local. Tambahkan pula batas jumlah redirect.

## U3. DNS-rebinding / TOCTOU (BUTUH APP)
Nama host yang cocok allowlist bisa resolve ke IP privat. Hongkong: resolusi di Rust saat itu juga (bukan di UI) dan tolak hasil yang masuk rentang privat; sudah ditutup by-construction kalau transport memakai IP hasil resolusi yang divonis. Perlu uji nyata untuk memastikan tidak ada resolusi ganda.

## U4. Satu sumber kebijakan (usulan lintas-lane, jangan dikerjakan sendiri)
Ada tiga tempat kebijakan URL/izin: `kebijakanIsiWeb.ts` (`periksaUrl`, jalur hidup), `ambilWeb.ts` (`SKEMA_IZIN`, `IZIN_TOLAK`, `periksaUrlAmbilWeb` — **modul mati, nol importer**), dan `src-tauri/src/ext_pkg.rs:1152` (allowlist unduh). Usulan: (1) jangan pernah menyambungkan `ambilWeb.ts` sebagai gerbang baru — hapus atau tandai tegas sebagai mati supaya tidak ada yang menyalinnya sebagai gerbang ketiga; (2) pindahkan konstanta skema (`'https:'`) ke satu modul kebijakan bersama agar jalur hidup, jalur mati, dan sisi Rust tidak drift. Saya TIDAK melakukannya karena `ambilWeb.ts` dan `src-tauri/**` milik lane lain.

## U5. Kasus BUTUH-APP untuk harness (belum dijalankan)
Harness saat ini murni offline. Kalau app hidup, tambahkan penanda eksplisit `BUTUH APP` (mis. blok yang di-skip saat `curl :9223/json/version` kosong dan tetap exit 0) untuk U1–U3, supaya bukti "nol jaringan nyata" bisa didapat di waktu yang tenang (tanpa 4 lane lain menyunting `src/**`).

## U6. Cakupan skema/host yang masih bisa ditambahkan (offline, murah)
Belum masuk kasus: port tak lazim pada https (`:8443`) di jalur hidup, IPv6 privat lain (`fc00::/7`, `fe80::/10`), IPv4-mapped IPv6 (`::ffff:127.0.0.1`), host dengan underscore/trailing dot (`example.org.`), dan case `allowlist` kosong pada jalur hidup. Semuanya bisa ditambahkan ke grup G3 tanpa app.
