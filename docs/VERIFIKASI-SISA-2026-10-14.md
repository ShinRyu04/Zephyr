# Verifikasi Sisa — audit bukti nyata 571 skrip uji/pemeriksa Zephyr

**Item backlog:** `ZEPH-VERIFIKASI-SISA-2`  ·  **Tanggal ukur:** 2026-10-14  ·  **Cabang:** `feat/ai-panel-vscode-layout`  ·  **Repo:** `D:/Zephyr`

**Alat ukur:** `scripts/uji-kesehatan-semua.mjs` (berkas BARU, pelapor — selalu keluar 0). **Tidak ada kode produk yang diubah.**

---

## 1. Hasil utama (apa adanya)

> **Catatan angka (diperbarui 2026-10-14, item `angka-dokumen-tool-68`).** Kolom kutipan di §3 adalah
> keluaran tiap skrip **apa adanya** saat dijalankan dengan katalog **67** tool (mis. `cek-ikon-tool.mjs`
> "semua 67 tool OK", `cek-panel-tools-bahasa.mjs` "T1 67 tool di katalog", `cek-subset-tugas.mjs`
> `katalog=67 tool, aktif-default=26`). Katalog sekarang **68** (builtin 43 / mcp 14 / web 11), inti **57**,
> aktif-default **63**, `TOOL_DIKIRIM_SELALU` **26**. Angka 67/62 di kutipan **tidak diubah** — itu bukti
> hari itu; jalankan ulang skripnya kalau mau angka sekarang.

| Status | Jumlah | Arti |
|---|---|---|
| **HIJAU** | **217** | keluar 0 dan tidak ada penanda GAGAL/FAIL di keluaran |
| **MERAH** | **72** | keluar != 0, atau ada verdict GAGAL walau keluar 0 |
| **BUTUH APP** | **265** | keluaran menyebut CDP :9223 / :9222 / fetch failed / Tauri / halaman app → **tidak bisa dinilai tanpa app hidup** |
| **RUSAK** | **4** | skrip sendiri tidak bisa jalan (impor/sintaksnya) |
| **MENGGANTUNG** | **13** | melewati batas waktu, dipotong (bukan hasil lulus/gagal) |
| **TOTAL TERUKUR** | **571** | dari 577 kandidat `.mjs` yang ada saat pengukuran |

**Kesimpulan satu baris:** hanya **217 dari 571** skrip (38%) yang memberi verdict lulus sendiri tanpa app hidup. **265 skrip (46%) tidak bisa dipakai sebagai bukti apa pun** selama app Zephyr (CDP :9223) tidak dijalankan.

### 1.1 Ringkasan keluaran `uji-kesehatan-semua.mjs` (verbatim)

```

================================================================================================
RINGKASAN KESEHATAN SKRIP UJI/PEMERIKSA ZEPHYR — 571 dari 576 skrip terukur
akar repo : D:\Zephyr
batas skrip: 12000 ms   ·   waktu: 2026-10-13T23:42:59.871Z
potongan   : idx 999999..999998 (0 skrip) · gabung 26 berkas
================================================================================================
  HIJAU       : 217
  MERAH       : 72
  BUTUH APP   : 265
  RUSAK       : 4
  MENGGANTUNG : 13
  (skrip yang perlu spawn-ulang karena artefak Windows: 0)
------------------------------------------------------------------------------------------------
```

5 skrip belum sempat terukur (dibuat lane lain saat pengukuran berjalan): `uji-ikon-bersih.mjs`, `uji-katalog-ekstensi-jujur.mjs`, `uji-perintah-tema-nyata.mjs`, `uji-tangkap-layar-ts.mjs`, `uji-worktree.mjs` — jalankan `node scripts/uji-kesehatan-semua.mjs` lagi untuk memasukkannya.

---

## 2. Cara ukur (supaya angkanya bisa dipercaya / dibantah)

1. **Enumerasi:** semua berkas di `scripts/` yang cocok `^(uji-|cek-|verify).*\.mjs$` → 577 berkas. Pelapor sendiri dikecualikan.
2. **Cara jalan:** tiap skrip dijalankan `node scripts/<berkas>` **tanpa diubah**, `cwd` = **akar repo** `D:/Zephyr` (banyak skrip membaca `src/lib/...` relatif cwd).
3. **Batas waktu:** 12.000 ms untuk sapuan utama. Skrip yang menyentuh batas itu **diuji ulang** dengan 45.000 ms, dan sisa yang masih menyentuh batas diuji ulang **serial satu per satu** (tanpa konkurensi).
4. **Klasifikasi (`klasifikasi()` di pelapor):** MENGGANTUNG (timeout) → RUSAK (galat impor/sintaks **milik skrip itu sendiri**) → BUTUH-APP (sinyal app hidup) → HIJAU (exit 0 tanpa penanda GAGAL) → MERAH.
5. **Penanda GAGAL sengaja HURUF BESAR** (`GAGAL`, `FAIL`, `VERDICT: GAGAL`, ❌) supaya kata "gagal" dalam kalimat deskripsi tidak salah dibaca sebagai kegagalan.
6. **RUSAK diperketat:** kata polos `SyntaxError`/`Unexpected token` **tidak lagi** dianggap skrip rusak — banyak skrip menyuntik potongan kode ke halaman app lewat CDP, dan galat di `<anonymous_script>` itu galat sisi-app, bukan skrip ujinya. RUSAK sekarang hanya pola impor/modul + `SyntaxError` yang menyebut `scripts/<berkas>.mjs:baris`.

### 2.1 Batasan yang harus dibaca sebelum memakai angka ini

- **App mati.** Saat pengukuran hanya port Vite **5173** yang hidup; **CDP 9223 dan 9222 mati**. Karena itu 265 skrip mati di langkah pertama (`fetch failed` / `Tidak ada target CDP`) dan statusnya BUTUH-APP — **bukan** bug produk, juga **bukan** bukti fitur jalan.
- **HIJAU ≠ fitur terbukti.** Banyak pemeriksa lulus secara **vakum** kalau prasyaratnya tidak ketemu (mis. skrip loop yang mencari elemen yang sudah sengaja dihapus tetap keluar 0). HIJAU = "skrip ini tidak mengeluh", bukan "fitur ini bekerja". Bukti kuat hanya kalau skrip mencetak angka/aserasi yang **menguji** item itu.
- **Konkurensi menggeser verdict.** Dijalankan 8 paralel, 82 skrip menyentuh batas 12 dtk; diuji ulang dengan batas 45 dtk, **69 di antaranya selesai normal** (0,5–27 dtk). Sebagian skrip berebut port tetap (mock-ai `127.0.0.1:8098`, http uji `:5199`) sehingga tampak menggantung padahal hanya berebut. Itu sebabnya sisa yang menggantung diuji ulang serial.
- **Merge anti-basi:** potongan yang selesai lebih dulu tidak menimpa hasil uji ulang (hasil uji ulang dimuat paling akhir). Duplikat nama dibuang, kemunculan terakhir yang dipakai.
- Repo hidup: 569 → 571 → 577 berkas selama sesi ini (lane lain menulis skrip baru). Angka di atas = 571 yang benar-benar terukur.

---

## 3. Tabel tiap skrip (571 baris, apa adanya)

Kolom **catatan** = potongan keluaran nyata pertama yang mengandung angka (apa yang benar-benar dicetak skrip itu).

| Skrip | Status | Kode | ms | Catatan (keluaran nyata) |
|---|---|---|---|---|
| `cek-ac.mjs` | HIJAU | 0 | 5173 | { "modulAda": true, "acMuncul": true, "item": [ "conconst", "const", "continue", "functiondefinition" ], "pos" |
| `cek-ac10.mjs` | HIJAU | 0 | 2220 | { "cursor": 34, "matchBefore": { "from": 30, "text": "sess" }, "snippetJawab": null } |
| `cek-ac11.mjs` | HIJAU | 0 | 1468 | { "idx": -1, "matchBefore": "con", "kandidat": [], "jumlahKandidat": 0, "status": null } |
| `cek-ac3.mjs` | HIJAU | 0 | 3626 | { "lang": "?", "acMuncul": true, "item": [ "MediaSession", "MediaKeySession", "MediaKeySystemAccess", "CSSNest |
| `cek-ac5.mjs` | HIJAU | 0 | 1272 | { "adaFungsi": "function", "tipe": "object", "isArray": 6, "adaAppend": "object", "facetNama": "tidak" } |
| `cek-agent-hidup.mjs` | HIJAU | 0 | 448 | { "phase": "thinking", "step": "1/200", "toolSekarang": null, "elapsedSinceStart": 3, "sejakProgress": 3, "ada |
| `cek-agent-jejak.mjs` | HIJAU | 0 | 2415 | batal -> {"saatJalan":true,"busyAkhir":false,"pesanBaru":0,"err":null,"streaming":false,"isi":"","toast":"1 pe |
| `cek-agent-tanpa-key.mjs` | HIJAU | 0 | 3181 | tanpa key -> {"lewati":false,"provider":"gemini","prev":"custom","kembali":false,"toast":"No key for Google Ge |
| `cek-agents.mjs` | HIJAU | 0 | 1298 | [ { "id": "opencode", "label": "opencode", "path": "C:\\Users\\Zyrex\\AppData\\Roaming\\npm\\opencode.cmd", "v |
| `cek-ai-dua-posisi.mjs` | HIJAU | 0 | 5338 | KANAN : {"pos":"kanan","panelW":479,"headH":38,"headBaris":2,"modelW":123,"inputSideFlex":"-","inputSideW":-1, |
| `cek-aserr13.mjs` | HIJAU | 0 | 1973 | {"adaAsErr":"function","terdaftar":["zephyr-uji.uji30-snippets","zephyr-halo-test","zephyr-kebesaran-test"],"s |
| `cek-aserr13b.mjs` | HIJAU | 0 | 1868 | {"adaAsErr":"function","kunci":["store","asErr","list","refresh","toggle","load","loadRaw","addPath","remove", |
| `cek-avatar.mjs` | HIJAU | 0 | 1565 | {"ada":false} |
| `cek-bahasa-final.mjs` | HIJAU | 0 | 2226 | == Kamus tambahan == LULUS kamus tambahan termuat == Terjemahan English == LULUS tidak ada nilai English yang  |
| `cek-batch2.mjs` | HIJAU | 0 | 1553 | { "viteErr": false, "zigAda": 0, "bracketSpan": 0, "minimapAda": false, "lowRam": false, "minimapSet": true, " |
| `cek-bawah.mjs` | HIJAU | 0 | 2254 | { "aiPanel": "right", "ada": true, "x": 1057, "y": 62, "w": 479, "h": 826, "winW": 1536, "winH": 912, "diBawah |
| `cek-beban.mjs` | HIJAU | 0 | 2322 | store: { busy: true, jumlah: 25, phase: 'working' } dom: { adaStack: false, isiRingkas: null, anak: 0, kelasAn |
| `cek-benar.mjs` | HIJAU | 0 | 3758 | { "scrollTop": 13630, "barisTerlihat": 674, "jumlah": 115, "perKelas": { "cm-zbr-1": 34, "cm-zbr-2": 34, "cm-z |
| `cek-bridge-cli.mjs` | HIJAU | 0 | 1486 | { "ada": true, "kunci": [ "store", "state", "terakhir", "jumlahJalan", "menunggu", "bersihkan", "parse", "jala |
| `cek-bubble.mjs` | HIJAU | 0 | 2702 | mount: 1 bubble: { "ada": false, "chat": true, "user": false, "bot": false } shot-bubble.png |
| `cek-card3.mjs` | HIJAU | 0 | 4688 | { "panelAda": true, "tabAktif": null, "kartuAda": 0, "labelHeader": [], "label": [], "inAda": false, "outAda": |
| `cek-chip.mjs` | HIJAU | 0 | 3224 | { "chipAda": 0, "chipTeks": [], "gripAda": 0, "label": [], "ikonWarna": [], "ikonIsi": [], "badge": [] } |
| `cek-cliagent.mjs` | HIJAU | 0 | 1806 | { "ada": true, "kunci": [ "store", "detect", "agents", "aktif", "setAktif", "runs", "jalankan", "sibuk" ], "ag |
| `cek-cmspan13.mjs` | HIJAU | 0 | 2365 | {"tabAda":0,"cmAda":false,"cmLineAda":0,"spanDiLine":0,"spanTotal":0,"kelasContoh":[],"warnaContoh":[]} |
| `cek-composer-baru.mjs` | HIJAU | 0 | 2216 | { "ada": false, "kenapa": "composer tidak ketemu" } shot-composer-baru.png |
| `cek-cron-vs-schedule.mjs` | HIJAU | 0 | 1673 | === cron_create: TIDAK ADA === === cron_list: TIDAK ADA === === schedule_command === deskripsi: Jadwalkan peri |
| `cek-custom.mjs` | HIJAU | 0 | 1483 | { "total": 0, "aktif": 0, "nama": [], "pekerja": [] } |
| `cek-dari2.mjs` | HIJAU | 0 | 4012 | { "adaAtributDari": 0, "dariKatalog": [], "dariGambar": [] } |
| `cek-discord.mjs` | HIJAU | 0 | 3392 | { "ada": true, "teks": "Discord community", "svgViewBox": "0 0 24 24", "warna": "rgb(88, 101, 242)", "jmlPath" |
| `cek-dom-xterm.mjs` | HIJAU | 0 | 8610 | {"id":"pane-mv7b16f3-2","paneAda":true,"xtermAda":true,"xtermScreen":true,"xtermRows":true,"jumlahXtermRows":1 |
| `cek-donasi.mjs` | HIJAU | 0 | 2525 | {"dialogAda":true,"lebarDialog":440,"warnaIkonHeader":"rgb(56, 132, 255)","opsi":[{"testid":"donate-trakteer", |
| `cek-dots.mjs` | HIJAU | 0 | 2243 | { "jumlah": 8, "warna": [ "rgb(126, 231, 135)", "rgb(165, 214, 255)", "rgb(121, 192, 255)", "rgb(210, 168, 255 |
| `cek-duplikat-tool.mjs` | HIJAU | 0 | 1388 | total tool: 67 === 1. NAMA KEMBAR PERSIS === tidak ada === 2. PEKERJAAN YANG MUNGKIN TUMPANG TINDIH === [menja |
| `cek-elm.mjs` | HIJAU | 0 | 1529 | { "found": false } |
| `cek-err2.mjs` | HIJAU | 0 | 1845 | { "errCount": 0, "err": [] } |
| `cek-ext.mjs` | HIJAU | 0 | 1963 | { "tab": "installed", "cari": "", "jumlahRegistry": 0, "jumlahTerinstall": 0, "jumlahRekomendasi": 0, "kunci": |
| `cek-ext2.mjs` | HIJAU | 0 | 3023 | { "loading": false, "manifests": 0, "terpasang": 0, "rekomendasi": 0, "hasil": 0, "err": null, "info": null, " |
| `cek-ext4.mjs` | HIJAU | 0 | 3866 | { "activity": "extensions", "view": true, "kartu": 3, "kosong": null, "recKosong": null, "err": null, "remote" |
| `cek-ext5.mjs` | HIJAU | 0 | 3588 | { "tab": "installed", "remote": 105, "remoteUrl": "native", "hasil": 3, "rekomendasi": 3, "loading": false, "m |
| `cek-ext6.mjs` | HIJAU | 0 | 6225 | { "recommended": { "tab": "recommended", "hasil": 3, "kartu": 0, "kosong": null }, "marketplace": { "tab": "ma |
| `cek-ext7.mjs` | HIJAU | 0 | 7342 | { "tab": [], "kartu": 0, "badgePub": 0, "badgeVer": 0, "badgeCat": 0, "offline": 0, "clip": { "x": 50, "y": 30 |
| `cek-fallback-model.mjs` | HIJAU | 0 | 781 | OK custom/free-text tidak jatuh ke model katalog [null] OK pilih model provider-sama [gpt-4o-mini (provider sa |
| `cek-final-card.mjs` | HIJAU | 0 | 679 | reload |
| `cek-fix4.mjs` | HIJAU | 0 | 2494 | { "viteErr": false, "overflowY": "auto", "bisaScroll": false, "micAda": false, "plusAda": true, "gutterAda": f |
| `cek-gagal-watchdog.mjs` | HIJAU | 0 | 773 | { "phase": "idle", "steps": 0, "gapTerpanjangDetik": null, "gapTerlamaLima": [], "jenisLangkah": [], "adaTombo |
| `cek-gap.mjs` | HIJAU | 0 | 1101 | { "total": 0, "semua": [], "gapBesar": [] } |
| `cek-ghost6.mjs` | HIJAU | 0 | 1371 | { "ghostSetting": true, "provider": "custom", "model": "deepseek-v4.1-flash", "adaKey": true, "keys": [ "anthr |
| `cek-ghost8.mjs` | HIJAU | 0 | 1215 | { "updateListenerErr": "TypeError: Cannot read properties of null (reading 'state')", "decorationsErr": "TypeE |
| `cek-gutter.mjs` | HIJAU | 0 | 8005 | { "ws": "D:\\Zephyr", "tabCount": 1, "editorAda": true, "gutterAda": true, "minWidth": "33.8px", "lebar": 68,  |
| `cek-gutter2.mjs` | HIJAU | 0 | 4808 | { "ws": "D:\\Zephyr", "adaOpenPath": "function", "adaOpenFile": "undefined" } |
| `cek-gutter3.mjs` | HIJAU | 0 | 5319 | page: Zephyr — Code Editor { "bridges": 63, "viteErr": false, "ws": "D:\\Zephyr", "adaOpenPathAt": "function", |
| `cek-gutter4.mjs` | HIJAU | 0 | 4734 | { "tabs": 0, "editorAda": true, "gutterAda": true, "minWidth": "33.8px", "lebar": 68, "jumlahBaris": 37, "cont |
| `cek-hapus-key.mjs` | HIJAU | 0 | 2383 | # target: Zephyr — Code Editor awal -> custom,custom-voice,custom2,openai setKey('gemini','') -> custom,custom |
| `cek-hijau.mjs` | HIJAU | 0 | 1074 | { "jumlah": 5, "hijau": [ { "tag": "svg", "cls": "[object SVGAnimatedString]", "testid": "", "prop": "color",  |
| `cek-i18n-10-bahasa.mjs` | HIJAU | 0 | 1807 | == i18n seluruh bahasa == bahasa: 10 (id, en, ja, ko, zh, es, fr, de, pt, ar) \| kunci diuji: 2321 LULUS L1 10  |
| `cek-ikon-ab.mjs` | HIJAU | 0 | 777 | { "activitybar": { "x": 0, "w": 48, "center": 24 }, "logoCenter": 24, "tombol": [ { "label": "Explorer", "btn" |
| `cek-ikon-agen.mjs` | HIJAU | 0 | 365 | === IKON_AGEN_TERAX (gaya Terax) === minatM/L saja: 0 segmen (34 char path) ada isian dFill: ya \|............. |
| `cek-ikon-tool.mjs` | HIJAU | 0 | 440 | OK - infoAksi() menjawab untuk semua 67 tool OK - 16 glyph berbeda dipakai antar tool doc 5 tool list 3 tool d |
| `cek-ikon.mjs` | HIJAU | 0 | 7391 | { "kartu": [], "warnaUnik": [], "chip": 0, "gambar": 0, "img": 0 } |
| `cek-img.mjs` | HIJAU | 0 | 5443 | [] |
| `cek-indo.mjs` | HIJAU | 0 | 4282 | { "uiLang": "en", "jumlah": 3, "contoh": [ { "teks": "sudah tercakup (pascal dimuat lebih dulu)", "tag": "SPAN |
| `cek-indo2.mjs` | HIJAU | 0 | 11247 | == SET-general (1) [cli-native-user] Buat tiga berkas kecil terpisah di folder ini: satu.txt, dua == SET-edito |
| `cek-indo5.mjs` | HIJAU | 0 | 901 | { "uiLang": "(?)", "jumlah": 1 } [DIV] Buat tiga berkas kecil terpisah di folder ini: satu.txt, dua.txt, tiga. |
| `cek-inline.mjs` | HIJAU | 0 | 3254 | { "inlineAda": 1, "inlineTeks": [ "useMemo" ], "fileRefAda": 1, "fileRefTeks": [ "src/lib/aiStore.ts:42" ], "i |
| `cek-interleave.mjs` | HIJAU | 0 | 1661 | { "panelTampil": true, "sesiAktif": true, "pesanKetemu": true, "urutan": "teks", "detail": [ { "jenis": "teks" |
| `cek-jumlah-tool.mjs` | HIJAU | 0 | 1330 | jumlah tool TERDAFTAR (kode) : 67 sekat yang terbuka (pengaturan): 62 grup yang terbuka : 0 tool yang BOLEH di |
| `cek-kanan.mjs` | HIJAU | 0 | 2130 | { "aiPanel": "right", "adaT": true, "ada": true, "x": 0, "y": 0, "w": 0, "h": 0, "winW": 1536, "winH": 912, "d |
| `cek-kapsul-hermes.mjs` | HIJAU | 0 | 2467 | == Bentuk kapsul bersatu == LULUS kapsul atas melengkung LULUS kapsul bawah LURUS (menempel input) LULUS input |
| `cek-keadaan.mjs` | HIJAU | 0 | 1201 | { "workspace": "D:\\Zephyr", "model": "mock-model", "provider": "custom", "approvalMode": "auto", "modelKeys": |
| `cek-kelas.mjs` | HIJAU | 0 | 1388 | { "bisaImport": true, "bisaHL": true, "classHighlighterAda": "object", "kelasDom": [], "jumlahSpan": 0 } |
| `cek-keluarga-web.mjs` | HIJAU | 0 | 1641 | total tool: 67 keluarga web/browser: 12 -> tool_search, web_search, web_fetch, browser_open, browser_read, bro |
| `cek-keystate09.mjs` | HIJAU | 0 | 5149 | {"keys":[{"provider":"anthropic","hasKey":false},{"provider":"custom","hasKey":true},{"provider":"custom-voice |
| `cek-kolom.mjs` | HIJAU | 0 | 843 | { "activityBar": { "x": 0, "w": 48, "kanan": 48 }, "brand": { "x": 0, "w": 48 }, "logo": { "x": 15, "kanan": 3 |
| `cek-konteks-ai.mjs` | HIJAU | 0 | 1808 | panjang: 818 --- ISI KONTEKS AI --- MEMORY (your notes from earlier sessions — use them, dan perbarui lewat me |
| `cek-kontrak-40.mjs` | HIJAU | 0 | 1528 | == Kontrak tool di aplikasi yang hidup == LULUS inti = katalog dikurangi web (katalog) LULUS jumlah terpasang  |
| `cek-kunci-bocor.mjs` | HIJAU | 0 | 260 | Kunci yang nilainya Indonesia dan TIDAK ada di kamus lain: 0 Kunci yang akan tampil INDONESIA per bahasa: JA:  |
| `cek-kunci-i18n-10-kamus.mjs` | HIJAU | 0 | 193 | Kamus: id, en, ja, ko, zh, es, fr, de, pt, ar Acuan: id (335 kunci) OK - setiap kamus punya himpunan kunci yan |
| `cek-kunci-i18n-extra.mjs` | HIJAU | 0 | 284 | Acuan: ID (2404 kunci) EN: kurang 83 [EN - wajar lebih pendek, kunci Inggris tidak perlu entri] Installing...  |
| `cek-kutip-url.mjs` | HIJAU | 0 | 448 | == URL dengan & HARUS dikutip == LULUS perintah yt-dlp dengan &list=&index= LULUS curl dengan dua parameter LU |
| `cek-lang3.mjs` | HIJAU | 0 | 1371 | { "adaRegistry": true, "elAda": false } |
| `cek-lang4.mjs` | HIJAU | 0 | 1381 | { "adaView": false } |
| `cek-langcall13.mjs` | HIJAU | 0 | 1284 | {"path":"C:/x/contoh.ts","hasil":{"langId":"typescript","dariEkstensi":false,"jumlahExt":1,"tipeExt":["Languag |
| `cek-logo-tiga.mjs` | HIJAU | 0 | 3790 | {"github":{"ada":true,"teks":"View on GitHub","warnaTombol":"rgb(31, 35, 40)","border":"rgb(208, 215, 222)","w |
| `cek-logo-warna.mjs` | HIJAU | 0 | 3250 | {"github":{"ada":false},"issue":{"ada":false},"wa":{"ada":false},"tokenWa":"#25d366","tokenGh":"#1f2328"} |
| `cek-logo.mjs` | HIJAU | 0 | 2825 | ok {"x":48,"y":28,"width":260,"height":860} |
| `cek-loop-agent-e2e.mjs` | HIJAU | 0 | 1672 | == Perilaku penghentian agent == LULUS E5 navigasi murni berhenti, permintaan bercampur tidak (nav=true, campu |
| `cek-loop-navigasi.mjs` | HIJAU | 0 | 3661 | == Klasifikasi navigasi di aplikasi hidup == LULUS N kata terminal menyebut tempat :: "buka youtube.com di ter |
| `cek-lsp-pasang-live.mjs` | HIJAU | 0 | 21756 | LULUS P1 bridge resep=function pasang=function LULUS P2 10 id punya resep (typescript,python,bash,json,html,cs |
| `cek-menu-naik.mjs` | HIJAU | 0 | 4802 | IZIN : {"ada":true,"popTop":716,"popBottom":850,"btnTop":856,"bukaKeAtas":true,"diAtasViewport":true,"diAtasPa |
| `cek-mic.mjs` | HIJAU | 0 | 2762 | { "sebelum": null, "speechAPI": true, "sesudah": null, "titleSesudah": null, "kelasSesudah": null } |
| `cek-minimap.mjs` | HIJAU | 0 | 2279 | { "minimapAktifSetting": false, "minimapAda": false, "extras": null } |
| `cek-minimap2.mjs` | HIJAU | 0 | 3966 | { "sekarang": true, "extras": true, "minimapAda": false } |
| `cek-mmdebug.mjs` | HIJAU | 0 | 1296 | { "modulAda": true, "debug": { "panggil": 0, "gambar": 0, "alasan": null, "w": 0, "h": 0 } } |
| `cek-mmtrigger.mjs` | HIJAU | 0 | 1808 | { "sebelum": { "panggil": 0, "gambar": 0, "alasan": null, "w": 0, "h": 0 }, "sesudahScroll": { "panggil": 0, " |
| `cek-model-placeholder.mjs` | HIJAU | 0 | 17492 | katalog: {"placeholder":["local-default","custom-model","custom2-model"],"customPertama":"custom-model","diken |
| `cek-n456.mjs` | HIJAU | 0 | 1244 | { "minimapAda": false, "kandidat": [], "acAda": false } |
| `cek-nama-baru.mjs` | HIJAU | 0 | 572 | sumber vite: "Nakroth", sisa nama lama: bersih |
| `cek-newchat.mjs` | HIJAU | 0 | 2267 | { "ada": false, "varFg0": "#1f2328", "varFg1": "#59636e", "varText": "#1f2328" } |
| `cek-newchat2.mjs` | HIJAU | 0 | 3807 | { "judul": { "tag": "BUTTON", "color": "rgb(105, 115, 128)", "text": "Tugas singkat: buat DUA berkas" }, "newC |
| `cek-newchat3.mjs` | HIJAU | 0 | 3350 | { "ada": false, "semuaBtn": [] } |
| `cek-null19.mjs` | HIJAU | 0 | 1909 | # target: Zephyr — Code Editor tab : [] kartu : elemen berteks "null": [] atribut bernilai null: [] tema terda |
| `cek-panel-tools-10bahasa.mjs` | HIJAU | 0 | 8384 | == Panel Tools berganti bahasa (10 bahasa) == LULUS T1 semua bahasa menghasilkan panel berisi teks LULUS T-id  |
| `cek-panel-tools-bahasa.mjs` | HIJAU | 0 | 2303 | == Panel Tools mengikuti bahasa == LULUS T1 67 tool di katalog LULUS T2 0 deskripsi kosong LULUS T3 0 deskrips |
| `cek-panel.mjs` | HIJAU | 0 | 1858 | { "sebelum": { "activeTab": "ai", "visibleTabs": [ "problems", "output", "debug", "terminal", "ports", "subage |
| `cek-panel05.mjs` | HIJAU | 0 | 3027 | {"sebelum":{"visible":true,"panelTab":null,"panelOpen":null,"panes":0,"adaGrid":false,"adaXterm":false,"adaEmp |
| `cek-pesan-hilang.mjs` | HIJAU | 0 | 637 | === sesi === { "jumlahSesi": 27, "activeId": "chat-mv7b0h4g-23", "sesi": [ { "id": "chat-mv7aspwv-32", "judul" |
| `cek-piksel.mjs` | HIJAU | 0 | 1598 | { "viewAda": false } |
| `cek-posisi.mjs` | HIJAU | 0 | 2098 | { "aiPanel": "right", "maximized": false, "panelAI": { "x": 0, "y": 0, "w": 0, "h": 0 }, "areaPanel": { "x": 4 |
| `cek-primary.mjs` | HIJAU | 0 | 1493 | { "primary": [ { "text": "Open File", "color": "rgb(13, 17, 23)", "bg": "rgb(56, 132, 255)", "w": 72, "h": 28, |
| `cek-provider09.mjs` | HIJAU | 0 | 6091 | # target: Zephyr — Code Editor daftar key : anthropic, custom+key, custom-voice+key, custom2+key, deepseek, ge |
| `cek-range.mjs` | HIJAU | 0 | 1469 | { "scrollTop": 0, "visibleRanges": "0-34", "rangeAtas": 0, "barisPertamaTerlihat": 1, "posisiKurung": [] } |
| `cek-reasoning-gabung.mjs` | HIJAU | 0 | 592 | hasil kumulatif : The user asks a simple one-sentence question: what is a text editor? Just answer panjang nai |
| `cek-reg.mjs` | HIJAU | 0 | 1279 | { "jumlah": 105, "contoh": [ "zephyr.ikon-bahasa \| Language Icons \| zephyr", "zephyr.ikon-bulat \| Round Icons  |
| `cek-render-pause.mjs` | HIJAU | 0 | 322 | === 1. langkah: mana yang kosong, dan apa bentuk mentahnya? === [ { "i": 0, "kind": "mulai", "nama": null, "ad |
| `cek-row.mjs` | HIJAU | 0 | 2491 | { "viteErr": false, "itemAda": false } |
| `cek-ryuga.mjs` | HIJAU | 0 | 5383 | { "ikonDiBaris": null, "pathIkon": null, "teksKartu": "Custom sub-agentsYour own read-only worker. The AI can  |
| `cek-scroll.mjs` | HIJAU | 0 | 4798 | { "scroll": [ { "cls": "trust-card", "w": 315, "sch": 382, "clh": 82, "warna": "auto", "sw": "auto", "bg": "rg |
| `cek-semua-section.mjs` | HIJAU | 0 | 11907 | section: ["Mode2","Agent1","Context","Sub-agents","Tools","Rules","Models","Appearance4","Session","Advanced"] |
| `cek-sidebar.mjs` | HIJAU | 0 | 2624 | { "viteErr": false, "sidebarAda": false, "baris": 0, "isSvg": null, "opacityDefault": null, "meta": [], "newCh |
| `cek-sidebar2.mjs` | HIJAU | 0 | 4641 | { "viteErr": false, "sidebarAda": false, "baris": 0, "isSvg": null, "opacityDefault": null, "teksHapus": null, |
| `cek-stack.mjs` | HIJAU | 0 | 1073 | elemen: {"panel":true,"chat":true,"stack":false,"agent":false,"todo":false,"aiApaSaja":["ai-side-col","ai-side |
| `cek-stop-alasan.mjs` | HIJAU | 0 | 411 | OK guard -> kategori tool [tool] OK guard -> pesan menyebut kemajuan [Agen berhenti karena tidak ada kemajuan  |
| `cek-sub12.mjs` | HIJAU | 0 | 6548 | { "dialog": false, "jumlahIkon": 0, "idSemua": [], "adaRobot": false, "adaUmum": false, "labelTerpilih": "", " |
| `cek-sub3.mjs` | HIJAU | 0 | 1236 | { "totalPekerja": 6, "kustom": [], "robotSama": false, "cariBeda": true, "zBackdrop": null, "zMenuAI": null, " |
| `cek-sub4.mjs` | HIJAU | 0 | 4291 | { "pathCustomSamaDenganIkon": true, "pathCariSamaDenganRobot": false, "adaBentukRobot": true, "modalTerbuka":  |
| `cek-sub5.mjs` | HIJAU | 0 | 4723 | { "modalTerbuka": false, "zBackdrop": "TIDAK ADA", "zMenuAI": "tidak terbuka", "atasMenuAI": false, "elemenTen |
| `cek-sub6.mjs` | HIJAU | 0 | 6557 | { "bridge": "ok", "totalPekerja": 6, "kustom": [], "robotBedaDariCari": true, "robotAdaBentuk": true, "dialogT |
| `cek-sub8.mjs` | HIJAU | 0 | 4747 | { "kartuAda": false, "kartuTeks": null, "testid": [ "a11y-skip", "menubar", "mb-dev", "mb-top", "mb-top", "mb- |
| `cek-subset-tugas.mjs` | HIJAU | 0 | 1738 | == HARNESS SUBSET TOOL PER TUGAS (LAMA-a1) == katalog=67 tool, aktif-default=26, batas per giliran=20 ambang u |
| `cek-support13.mjs` | HIJAU | 0 | 1723 | {"langId":"typescript","jumlahExt":1,"lsCtor":"LanguageSupport","lsKunci":["language","support","extension"]," |
| `cek-syntax13.mjs` | HIJAU | 0 | 3269 | {"hasil":[{"tema":"zephyr-dark","jumlahToken":10,"unik":7,"contoh":[["--syn-keyword","#ff7b72"],["--syn-string |
| `cek-tab.mjs` | HIJAU | 0 | 2131 | { "aktif": null, "jumlahTab": 0, "tabs": [], "jumlahEditor": 0, "editor": [], "zigDiEditorTampil": 0 } |
| `cek-tag.mjs` | HIJAU | 0 | 1509 | { "viewAda": false } |
| `cek-tahu-workspace.mjs` | HIJAU | 0 | 544 | === 1. workspace yang dipegang Zephyr === { "root": "D:\\Zephyr" } === 2. apakah akar workspace ada di PROMPT  |
| `cek-tema.mjs` | HIJAU | 0 | 3168 | === jumlah teks terlihat: 58 \| Indonesia: 0 === --- teks tema (40 pertama) --- [BUTTON] Skip to editor [BUTTON |
| `cek-todo-gagal.mjs` | HIJAU | 0 | 423 | === semua langkah, dengan hasil LENGKAP === [ { "i": 0, "kind": "mulai", "nama": null, "ok": null, "hasil": "" |
| `cek-toolcard.mjs` | HIJAU | 0 | 962 | reload |
| `cek-tree.mjs` | HIJAU | 0 | 6553 | { "baris": 0, "animAda": null, "delay0": null, "delay3": null, "animDurasi": null, "chevTrans": null } |
| `cek-usage-timpa.mjs` | HIJAU | 0 | 2415 | { "popBuka": true, "titik": { "x": 0, "y": 0 }, "diAtas": "donate-dialog", "diAtasAdalahPop": false, "jalur":  |
| `cek-v12-11.mjs` | HIJAU | 0 | 822 | setBoleh status: 503 "MCP is disabled in Settings" setTolak status: 503 msg: null setTolak2 status: 503 msg: n |
| `cek-v13b-08.mjs` | HIJAU | 0 | 5900 | {"baris":0,"tipeBaris":"number","versi":"","tipeVersi":"string","dataDir":"C:\\Users\\Zyrex\\AppData\\Roaming\ |
| `cek-varwarna.mjs` | HIJAU | 0 | 1382 | { "nilai": { "--syntax-keyword": "#ff7b72", "--syntax-string": "#a5d6ff", "--syntax-number": "#79c0ff", "--syn |
| `cek-view.mjs` | HIJAU | 0 | 1587 | { "jumlahEditor": 0, "detail": [], "bridgeTreeLen": null, "bridgeDocLen": null, "bridgeSamaDengan": -1 } |
| `cek-warna-cek.mjs` | HIJAU | 0 | 3036 | == Warna kotak centang terisi == latar kotak : rgb(56, 132, 255) warna centang : rgb(255, 255, 255) LULUS lata |
| `cek-warna05.mjs` | HIJAU | 0 | 4685 | {"id":"pane-mv7b16f3-2","totalSpan":1,"MERAH":[],"HIJAU":[],"CYAN":[],"kelasWarnaAda":[],"teksTerakhir":[]} |
| `cek-warnaminimap.mjs` | HIJAU | 0 | 6969 | { "viteErr": false, "minimapAda": true, "canvasAda": true, "canvasSize": "105x677", "warnaUnik": 1557, "contoh |
| `cek-web-tool-aktif.mjs` | HIJAU | 0 | 1664 | OK - browser_list terdaftar di registry OK - browser_list melewati sekat -> No browser pane is currently open. |
| `cek-zbr2.mjs` | HIJAU | 0 | 6473 | { "perBaris": [ { "ln": 60, "jumlah": 26, "kelas": [ "cm-zbr-0" ] }, { "ln": 200, "jumlah": 26, "kelas": [ "cm |
| `cek-zig.mjs` | HIJAU | 0 | 1657 | {} |
| `cek-zig2.mjs` | HIJAU | 0 | 1349 | { "editorSettings": { "indentGuides": true, "bracketPairColorization": true, "colorDecorators": true, "unicode |
| `cek-zig6.mjs` | HIJAU | 0 | 1212 | { "modulAda": true, "eksporIndent": "function", "eksporBracket": "function", "extTipe": "object", "extArr": "b |
| `uji-addpane-panel.mjs` | HIJAU | 0 | 6522 | {"id":"pane-mv7bbxam-2","sebelum":{"tabPanel":"problems","adaGrid":false},"sesudah":{"tabPanel":"terminal","vi |
| `uji-anak-agen.mjs` | HIJAU | 0 | 14765 | == HARNESS PERILAKU ANAK-AGEN (LAMA-a1 / LAMA-a2 / LAMA-a4) == [LAMA-a1] subset tool per kelas tugas (batas 20 |
| `uji-antrean-pesan.mjs` | HIJAU | 0 | 480 | — antrean pesan: agen sibuk, pesan baru menunggu LULUS A1 pesan saat sibuk MASUK ANTREAN (masukAntrean=true, i |
| `uji-ar-dict.mjs` | HIJAU | 0 | 713 | UKURAN KAMUS: ID 2404 EN 2321 JA 2404 KO 2404 ZH 2404 ES 2404 FR 2404 DE 2404 PT 2404 AR 2404 SELISIH DUA ARAH |
| `uji-ar-lengkap.mjs` | HIJAU | 0 | 1298 | === src/lib/i18n.ts === ID=372 EN=372 JA=372 KO=372 ZH=372 ES=372 FR=372 DE=372 PT=372 AR=372 acuan terbesar = |
| `uji-ar-nilai.mjs` | HIJAU | 0 | 580 | SNAPSHOT (baris 174): 'Belum ada riwayat. Simpan file (Ctrl+S) untuk membuat snapshot.': 'لا يوجد سجل بعد. احف |
| `uji-aturan-proyek.mjs` | HIJAU | 0 | 891 | LULUS C-AGENTS.md AGENTS.md ikut dibaca LULUS C-CLAUDE.md CLAUDE.md ikut dibaca LULUS C-GEMINI.md GEMINI.md ik |
| `uji-aturan-tool.mjs` | HIJAU | 0 | 626 | LULUS A1 allow menang karena di atas (allow/a) LULUS A2 dibalik, confirm menang (confirm/b) LULUS A3 deny di b |
| `uji-bahasa-jawaban.mjs` | HIJAU | 0 | 9939 | UJI BAHASA JAWABAN (ZEPH-NGAWUR-BAHASA) LAPIS A1 - deteksiBahasaGiliran() menurut kontraknya sendiri OK deteks |
| `uji-blame-gabung.mjs` | HIJAU | 0 | 307 | LULUS B1 5 baris satu commit -> 1 penanda (harap 1) LULUS B2 penanda di baris PERTAMA run (1) LULUS B3 3 hari  |
| `uji-blank.mjs` | HIJAU | 0 | 10950 | providers sebelum : ["custom","gemini"] providers sesudah : {"keys":["custom","gemini"],"lang":"id"} LULUS A.  |
| `uji-blok-inti.mjs` | HIJAU | 0 | 1703 | AMBANG: 2000 token = 8000 karakter (token = Math.ceil(karakter / 4)) en: fakta generated 7950 char / 1988 tok  |
| `uji-buka-berkas-hilang.mjs` | HIJAU | 0 | 1828 | === membuka berkas yang TIDAK ada, lewat perintah yang sama dipakai pengguna === -> selesai tanpa lemparan LUL |
| `uji-checkpoint.mjs` | HIJAU | 0 | 277 | LULUS K1 dua berkas tercatat, bukan tiga (2) LULUS K2 a.ts memakai snapshot PERTAMA (snap1) LULUS K3 snapshot  |
| `uji-gagal-loader-live.mjs` | HIJAU | 0 | 7606 | == uji jalur gagal loader (paket rusak & bahasa tanpa grammar) == panel: ter-mount [0] panel sebelum paket rus |
| `uji-gh-menu.mjs` | HIJAU | 0 | 4127 | isi menu: "Not signed inSign in to GitHubManage GitHub token" LULUS avatar GitHub ada di activity bar LULUS me |
| `uji-git-bar.mjs` | HIJAU | 0 | 333 | LULUS G1 dua baris ditambah -> 2 penanda LULUS G2 keduanya added (2:added 3:added) LULUS G3 baris konteks tida |
| `uji-halaman-tema.mjs` | HIJAU | 0 | 1953 | LULUS A1 kueri kosong = daftar penuh (5/5) LULUS A2 cari nama 'nord' -> nord,nord-light LULUS A3 huruf besar/k |
| `uji-hook-hidup.mjs` | HIJAU | 0 | 8758 | LULUS H-1 workspace uji terbuka (C:/Users/Zyrex/AppData/Local/Temp/zephyr-hook-ws-k6CyNn) LULUS H0 hook dipasa |
| `uji-hunk-diff.mjs` | HIJAU | 0 | 418 | LULUS H1 satu perubahan -> 1 hunk (1) LULUS H2 hunk mencatat 1 tambah 1 hapus LULUS H3 terima hunk -> teks BAR |
| `uji-hunk.mjs` | HIJAU | 0 | 659 | LULUS 1. satu hunk diterima → teks jadi isi baru LULUS 2. satu hunk ditolak → teks tidak berubah LULUS 3. camp |
| `uji-i18n-kunci.mjs` | HIJAU | 0 | 747 | LULUS I1 kesepuluh kunci ada di kesepuluh bahasa LULUS I2 istilah yang pasti berbeda benar-benar diterjemahkan |
| `uji-konteks-tugas.mjs` | HIJAU | 0 | 1576 | LULUS K1 token polos diganti LULUS K2 di tengah perintah LULUS K3 nama berkas saja LULUS K4 bentuk $VAR LULUS  |
| `uji-konteks-zephyr.mjs` | HIJAU | 0 | 949 | — konteks workspace (folder uji: C:/Users/Zyrex/AppData/Local/Temp/zephyr-konteks-m6K8Js) LULUS B1 berkas belu |
| `uji-kunci-id-saja.mjs` | HIJAU | 0 | 1401 | ID saja (tidak ada di AR): 0 ringkas: dipakai-di-kode=0 nilai-identitas=0 kembar-setelah-normalisasi=0 |
| `uji-logo.mjs` | HIJAU | 0 | 1442 | { "brand": { "w": 48, "h": 27.2 }, "svg": { "w": 18, "h": 13 }, "viewBox": "129 257.5 772 545.5", "adaKotakLat |
| `uji-lsp-toggle.mjs` | HIJAU | 0 | 2910 | checked sebelum: { err: 'Uncaught' } checked sesaat setelah klik: { err: 'Uncaught' } checked 1.5s kemudian: { |
| `uji-memori-live.mjs` | HIJAU | 0 | 8800 | LULUS M1 jembatan memori=true prompt=true batasToken=1000 anggaran=1400 penanda berkas="<!-- zephyr-ai-memori  |
| `uji-memori-sesi.mjs` | HIJAU | 0 | 1062 | modul : file:///D:/Zephyr/src/lib/aiMemori.ts berkas store uji : C:\Users\Zyrex\AppData\Local\Temp\zephyr-memo |
| `uji-native-setter.mjs` | HIJAU | 0 | 3189 | pop-up AI Models aktif? true answerlang sebelum: follow dengan native setter → id setelah 1.2s: { err: 'Uncaug |
| `uji-native2.mjs` | HIJAU | 0 | 4338 | elemen answerlang ada? false pop-up AI Models aktif? false hasil: ELEMEN TIDAK ADA nilai sekarang: hilang |
| `uji-nyangkut.mjs` | HIJAU | 0 | 1941 | LULUS N1 deepseek-v4.1-flash lewat Custom dapat 32768 token (dulu 4096 - terlalu kecil untuk write_file) LULUS |
| `uji-rangkai-format.mjs` | HIJAU | 0 | 256 | LULUS F1 keluaran berantai (awal\|satu\|dua) LULUS F2 perintah kedua menerima keluaran pertama LULUS F3 keduanya |
| `uji-ref-berkas.mjs` | HIJAU | 0 | 394 | === 1. regex referensi berkas === LULUS "situs/index.html" -> path situs/index.html LULUS "src/lib/types.ts:12 |
| `uji-regex-ref.mjs` | HIJAU | 0 | 219 | === REGEX LAMA (yang mematikan agent) === situs/index.html dikirim sebagai path: undefined seharusnya : "situs |
| `uji-repeat.mjs` | HIJAU | 0 | 2567 | LULUS R1 fungsi penjaga tersedia lewat bridge dev LULUS R2 prosa normal tidak dianggap mengulang dominan=false |
| `uji-riwayat-langkah.mjs` | HIJAU | 0 | 1025 | LULUS R1 bridge bentuk wire tersedia di mode dev LULUS R2 satu pesan asisten per langkah (dapat: 3) LULUS R3 t |
| `uji-search-editor.mjs` | HIJAU | 0 | 276 | LULUS P1 satu kecocokan -> 1 petikan (1) LULUS P2 3 baris konteks tiap sisi (7-13) LULUS P3 7 baris total (7)  |
| `uji-ssh-aman.mjs` | HIJAU | 0 | 997 | # Host jahat OK host 'foo; rm -rf /' ditolak [host-tidak-sah] OK host 'a b' ditolak [host-tidak-sah] OK host ' |
| `uji-suntik-konteks.mjs` | HIJAU | 0 | 1419 | LULUS S1 urutan konteks->riwayat->antrean->permintaan benar (konteks -> r1 -> r2 -> antrean:p1-2s -> minta:p-n |
| `uji-t1-4.mjs` | HIJAU | 0 | 3078 | LULUS aksi formatTab ada di store LULUS setting formatOnSave ada nilai=false LULUS formatTab pada tab tidak ad |
| `uji-tabel-markdown.mjs` | HIJAU | 0 | 1879 | UJI TABEL MARKDOWN (ZEPH-FORMAT-TABEL) (0) perender yang dipakai jawaban Zeph (dibaca dari sumber) OK plugin G |
| `uji-tahu-zephyr.mjs` | HIJAU | 0 | 2957 | UJI TAHU ZEPHYR (jalur zephyr_self -> cariFakta atas indeks terpasang) indeks: 6212 entri \| versi aplikasi 1.1 |
| `uji-tema-sintaks-vscode.mjs` | HIJAU | 0 | 609 | # uji-tema-sintaks-vscode (bundling: node-api) # bundel: C:\Users\Zyrex\AppData\Local\hermes\cache\scratch\uji |
| `uji-tool-ingat.mjs` | HIJAU | 0 | 3242 | LULUS S1 katalog: kelompok="Memori" efek=appWrite perluIzin=false - efek appWrite masuk kelas tulis di toolGat |
| `uji-trim-tool.mjs` | HIJAU | 0 | 1248 | daftar dikirim : 26 tool, 14699 byte skema LULUS T1 daftar inti menyusut jadi 26 tool LULUS T2 skema yang diki |
| `uji-unduh-instal.mjs` | HIJAU | 0 | 1367 | UJI UNDUH-INSTAL (unduh -> periksa -> pasang, server berkas lokal di TMPDIR) server: http://127.0.0.1:57668 \|  |
| `uji-urutan-pesan.mjs` | HIJAU | 0 | 725 | urutan: system -> user -> assistant -> tool -> assistant LULUS U1 urutan percakapan dipertahankan (dapat: syst |
| `uji-zeph-buka-browser.mjs` | HIJAU | 0 | 9542 | {"sebelum":0,"adaTool":true,"hasil":"Browser pane pane-mv7b54kh-3 opened with URL: https://www.google.com (pag |
| `verify-cli-slash.mjs` | HIJAU | 0 | 1702 | # target: Zephyr — Code Editor LULUS V1 model=opus mode=auto plugins=18 mcp=1 usage=3 LULUS V2 aman; base_url= |
| `verify-cli-slash2.mjs` | HIJAU | 0 | 2955 | LULUS V1 builtins=44 LULUS V2 style default->explanatory->default LULUS V3 allow add=["Bash(echo zt)"] clear=[ |
| `verify-deskripsi-tool-8bahasa.mjs` | HIJAU | 0 | 1422 | katalog : 67 tool (67 nama polos) DESKRIPSI_TOOL_ID: 67 kunci DESKRIPSI_TOOL_EN: 67 kunci DESKRIPSI_TOOL_JA: 6 |
| `verify-deskripsi-tool.mjs` | HIJAU | 0 | 253 | katalog : 67 tool DESKRIPSI_TOOL_ID: 67 kunci DESKRIPSI_TOOL_EN: 67 kunci EN kosong : 0 EN == ID : 0 himpunan  |
| `verify-diff-preview.mjs` | HIJAU | 0 | 185 | == terapkanDiff == OK ganti satu baris OK tambah baris OK hapus baris OK dua hunk di satu berkas OK konteks ti |
| `verify-diff-split.mjs` | HIJAU | 0 | 658 | LULUS D1 rows=3 LULUS D2 [["a","a"],[null,"NEW"],["b","b"]] LULUS D3 [["GONE",null],["keep","keep"]] LULUS D4  |
| `verify-fase-loop.mjs` | HIJAU | 0 | 5207 | LULUS A1 penjaga pengulangan tersedia di jalur produksi LULUS A2 ambang sesuai sumber: fragmen>=400, pelarian> |
| `verify-i18n.mjs` | HIJAU | 0 | 498 | LULUS ID (2770 kunci, +82 ekstra) LULUS JA (2770 kunci, +82 ekstra) LULUS KO (2770 kunci, +82 ekstra) LULUS ZH |
| `verify-log-folder.mjs` | HIJAU | 0 | 1816 | LULUS LOG-V1 tombol aktif; logFile=C:\Users\Zyrex\AppData\Roaming\zephyr\logs\zephyr-2026-10-14.log; dir=C:\Us |
| `verify-newfile-diff.mjs` | HIJAU | 0 | 2284 | LULUS D1 berkas baru dibuat: true LULUS D2 hasil memuat hunk diff LULUS D3 4 baris ditandai sebagai tambahan = |
| `verify-plugin-browser.mjs` | HIJAU | 0 | 1209 | LULUS M1 315 plugins in catalog LULUS M2 first=frontend-design@claude-plugins-official installs=1290640 cat=de |
| `verify-rules.mjs` | HIJAU | 0 | 1280 | == Mesin aturan == OK katalog memuat aturan [14 aturan dari 14 definisi] OK setiap definisi bisa dikompilasi [ |
| `verify-tools-runtime.mjs` | HIJAU | 0 | 1849 | == Tool terpasang di aplikasi hidup == katalog 67 \| terpasang 67 LULUS R1 setiap nama katalog terpasang (67 na |
| `verify-update.mjs` | HIJAU | 0 | 669 | == Verifikasi signature installer == (lewati — berikan <installer.exe> <installer.exe.sig> untuk verifikasi kr |
| `verify-wallpaper.mjs` | HIJAU | 0 | 4139 | LULUS W1 wallpaper terpasang lewat jalur nyata, data-bg="on" info panel dibuka: {} LULUS W2 permukaan yang ket |
| `verify14.mjs` | HIJAU | 0 | 13877 | # target: Zephyr — Code Editor |
| `verify15-setup.mjs` | HIJAU | 0 | 299 | (tanpa keluaran) |
| `cek-all-on-awas-live.mjs` | MERAH | 1 | 8641 | GAGAL B3-1 panel tool gate terbuka lewat menu ... -> Chat Settings -> Tools -> "Open tool sets…" - menu ... ta |
| `cek-aturan-operasional.mjs` | MERAH | 1 | 1143 | persona aktif: Zeph caraKerja persona: 636 karakter GAGAL aturan "todoWrite" masih ada di prompt OK aturan "sa |
| `cek-backtick.mjs` | MERAH | 1 | 483 | pakai: node scripts/cek-backtick.mjs <berkas> |
| `cek-batas-inti.mjs` | MERAH | 1 | 7829 | CEK BATAS INTI (pengetahuan dua lapis, ai-tahu-100-7) OK ukuran blok inti 7950 char ~ 1988 token (ambang 8000  |
| `cek-batas-mcp-live.mjs` | MERAH | 1 | 13987 | OK B5-1 server 120 tool: hanya 40 yang dikirim ke provider - dikirim=40 batas=40 OK B5-2 ringkasan jujur: tota |
| `cek-bridge.mjs` | MERAH | 1 | 776 | file:///D:/Zephyr/scripts/cek-bridge.mjs:8 console.log('BRIDGES:', r.result.value); ^ TypeError: Cannot read p |
| `cek-bundel-docs.mjs` | MERAH | 1 | 3105 | CEK BUNDEL DOKUMEN ZEPHYR (AI-TAHU-100-4) (A) artefak bundel: hasil generate vs disk GAGAL artefak sinkron den |
| `cek-cap-payload.mjs` | MERAH | 1 | 1907 | OK konteks menghitung gambar [3100] OK request kecil utuh [2] OK request besar dipotong [887830 -> 37669] OK h |
| `cek-cwd-tool.mjs` | MERAH | 1 | 3141 | GAGAL: {"code":"Permission","message":"permission denied: Menjalankan perintah is blocked: this folder is not  |
| `cek-hydra-live.mjs` | MERAH | 1 | 12830 | ok panel chat ter-mount ok menganggur: baris status TIDAK ada {"sibuk":false,"teks":null} ok menganggur: baris |
| `cek-i18n.mjs` | MERAH | 1 | 577 | == src/lib/i18n.ts == EN keys: 372 ID size=372 missing=0 extra=0 dups=0 EN size=372 missing=0 extra=0 dups=0 J |
| `cek-kunci-indo.mjs` | MERAH | 1 | 231 | node:fs:539 return binding.readFileUtf8(path, stringToFlags(options.flag)); ^ Error: ENOENT: no such file or d |
| `cek-lsp-pasang-ui-live.mjs` | MERAH | 2 | 647 | slot docker tidak ditemukan - jalankan dulu: node scripts/cek-lsp-pasang-live.mjs |
| `cek-muter-browser.mjs` | MERAH | 1 | 474 | ambang muter = 3 GAGAL siklus tutup-buka halaman yang sama BERHENTI :: browser_open(muter=0) -> browser_read(m |
| `cek-narasi-id.mjs` | MERAH | 1 | 668 | import: ok GAGAL id.narasi GAGAL id.gagalSebarangBaris OK id.giliranBanyakBaris GAGAL id.hematTool OK en.naras |
| `cek-pemilih-model.mjs` | MERAH | 1 | 1714 | placeholder katalog: local-default, custom-model, custom2-model contoh baris: [] baris yang cocok placeholder: |
| `cek-reasoning-hidup.mjs` | MERAH | 1 | 2163 | sebelum: undefined panel: tidak ada tombol kirim: {} |
| `cek-stack-loop-live.mjs` | MERAH | 2 | 1300 | sebelum: ws=D:\Zephyr model=mock-model busy=true app sedang sibuk - uji ini butuh app idle (jalankan util-tung |
| `cek-think-calculator.mjs` | MERAH | 1 | 576 | OK think terdaftar + melewati sekat -> [pemikiran tercatat] rencana: baca dulu, lalu edit OK calculator (1200* |
| `cek-tulis-subagent-live.mjs` | MERAH | 1 | 6825 | keadaan awal: setelan=false mode=auto -> bisaTulis=false bisaTulisDisk=false LULUS A1 kemampuanTulis() melapor |
| `uji-ai-berat.mjs` | MERAH | 1 | 1097 | LULUS B1 agent idle (custom/) GAGAL B2 workspace terbuka (null) -> buka workspace dulu; uji berat butuh berkas |
| `uji-ai-hidup.mjs` | MERAH | 1 | 1646 | LULUS A1 agent idle (custom/) LULUS A2 API key ada untuk custom LULUS A3 run BERAKHIR sendiri dalam 1s GAGAL A |
| `uji-batas-tulis.mjs` | MERAH | 1 | 6901 | LULUS S2 systemPrompt.ts memuat ketiga frasa batas-tulis di ID (MEMBACA jalan / tulis ditolak WorkspaceOutside |
| `uji-bug-hunt.mjs` | MERAH | 2 | 523 | sebelum agen: tes exit=0 (harus != 0) BERHENTI: tes sudah lulus di awal; perbaiki dulu proyek contohnya. |
| `uji-bug-kejam-verifikasi.mjs` | MERAH | 1 | 540 | LULUS K2 `node laporan.js` jalan tanpa error (exit=0) GAGAL K3 total laporan COCOK hitungan manual: 365500 vs  |
| `uji-bug-kejam.mjs` | MERAH | 2 | 1418 | (kondisi bug dipulihkan dari .asli/) BERHENTI: agen masih sibuk. |
| `uji-busy-berat.mjs` | MERAH | 2 | 1116 | awal: busy=true ws=null BERHENTI: agen masih sibuk sebelum uji dimulai (jalankan util-tunggu-idle dulu). |
| `uji-busy-reset.mjs` | MERAH | 2 | 1218 | awal: busy=true ws=null BERHENTI: agen masih sibuk sebelum uji dimulai. |
| `uji-copilot-menu.mjs` | MERAH | 1 | 11369 | LULUS U1 tab panel AI berlabel "Agent" — {"teks":"Agent","ketemu":true} LULUS U7 tombol kirim berlabel "Run" — |
| `uji-deepseek-shape.mjs` | MERAH | 1 | 1448 | GAGAL D1 model aktif: custom/gemini-3.8-flash LULUS D2 agent idle sebelum mulai LULUS D4 run selesai dalam 0s  |
| `uji-diff-hijau.mjs` | MERAH | 1 | 322 | node:fs:2914 return binding.writeFileUtf8( ^ Error: ENOENT: no such file or directory, open 'D:\Talos\__uji-di |
| `uji-electron-catatan.mjs` | MERAH | 1 | 4357 | sebelum: custom/gemini-3.8-flash ws=C:\Users\Zyrex\AppData\Local\Temp\zephyr-scm-44500\kerja busy=false tugas  |
| `uji-guard-listener.mjs` | MERAH | 1 | 287 | LULUS onAiChunk -> pakai:1 guard:aiListenerBound=1 GAGAL onMcpScreenshot -> pakai:1 guard:mcpShotListenerBound |
| `uji-ikon-live.mjs` | MERAH | 1 | 19274 | == uji ikon live: zephyr.ikon-bulat -> .lua = "LU" == [1] sebelum dipasang ikon berbasis paket: 0 ikon tab akt |
| `uji-jawab-bahasa.mjs` | MERAH | 1 | 5944 | prompt: id=24141 char (aturan bahasa=ADA), en=24097 char (ADA) pola aturan bahasa yang cocok: ["/(reply\|respon |
| `uji-konteks-repo-adv.mjs` | MERAH | 1 | 2954 | UJI ADVERSARIAL KONTEKS REPO (ZEPH-KONTEKS-REPO) modul : src/lib/konteksRepo.ts (bundle 26.192 byte) folder uj |
| `uji-kurs-dollar.mjs` | MERAH | 2 | 1618 | agen: custom/mock-model ws=D:\Zephyr busy=true BERHENTI: agen masih sibuk. |
| `uji-muter-browser.mjs` | MERAH | 1 | 1168 | LULUS M1 bridge guard tersedia di mode dev LULUS M2 batas muter = 3 langkah berturut-turut GAGAL M3 run BERHEN |
| `uji-navigasi-hidup.mjs` | MERAH | 1 | 2025 | LULUS N1 agent idle sebelum mulai (custom/gemini-3.8-flash) LULUS N2 run berakhir sendiri dalam 0s LULUS N3 ha |
| `uji-plugin.mjs` | MERAH | 1 | 3195 | LULUS P2 install code-reviewer: daftar=true enabled=false pasar.installed=true plugin.json=true LULUS P3 enabl |
| `uji-potong-hasil.mjs` | MERAH | 0 | 581 | LULUS P1 keluaran pendek dikembalikan apa adanya LULUS P2 keluaran tepat sepanjang batas tidak disentuh LULUS  |
| `uji-probe-bundel.mjs` | MERAH | 0 | 1267 | BUILD: errors=0 OUTDIR=C:\Users\Zyrex\AppData\Local\Temp\zephyr-uji-fCU4aI LOAD GAGAL: TypeError: (0 , import_ |
| `uji-prompt-subagent2.mjs` | MERAH | 1 | 574 | panjang prompt: 22931 karakter GAGAL aturan baru: subagent meneliti, bukan menulis kutipan: ose the work, then |
| `uji-snippet-live.mjs` | MERAH | 2 | 3554 | == uji snippet live: zephyr.snippet-rust / pemicu "fnr" / D:/Zephyr/.uji-snippet-live/coba.rs == buka berkas - |
| `uji-stack-beban.mjs` | MERAH | 1 | 1922 | GAGAL B0 12 langkah panjang disiapkan, lipatan terbuka GAGAL B1 tumpukan terukur: undefined baris di dalamnya  |
| `uji-stack-layout.mjs` | MERAH | 1 | 5410 | GAGAL L0 10 langkah disiapkan; panel=true, tumpukan terpasang=false GAGAL L1a tumpukan status ada di DOM file: |
| `uji-t1-2-5.mjs` | MERAH | 1 | 3885 | LULUS cli_agents_detect mengembalikan 4 CLI n=4 LULUS CLI yang dideteksi: codex, claude, gemini, opencode code |
| `uji-t3-9.mjs` | MERAH | 1 | 7840 | === T3.9: dropdown slash command bisa digulir === LULUS dropdown slash muncul LULUS dropdown memuat banyak ite |
| `uji-t4-15.mjs` | MERAH | 1 | 8166 | === Compact About === LULUS halaman About hidup + nav ketemu set-nav-about LULUS kartu identitas ada (logo + n |
| `uji-todo-update.mjs` | MERAH | 1 | 1376 | === 1. buat tugas baru (teks lengkap) === hasil: {"GALAT":"Cannot read properties of undefined (reading 'jalan |
| `uji-tool-jendela.mjs` | MERAH | 1 | 457 | == Uji kendali jendela: panel / setelan / pane / tangkap layar == panel resmi (PANEL_TABS + PanelTabId) : 6 pa |
| `uji-tool-pill.mjs` | MERAH | 1 | 1349 | LULUS P1 lebar kartu dikunci: max-width=100%, box-sizing=border-box, lebar=455px LULUS P2 nama tool melipat, b |
| `uji-urutan-roboh.mjs` | MERAH | 1 | 642 | LULUS R1 dua user berturut -> satu (system -> user) LULUS R2 TIDAK ada user -> user lagi LULUS R3 isi pesan pe |
| `uji-work-step.mjs` | MERAH | 1 | 4086 | LULUS W1 "Progress {current} of {total}" sudah tidak ada di sumber LULUS W2 label "N steps done" ada LULUS W3  |
| `verify-archive.mjs` | MERAH | 1 | 841 | GAGAL A1 small output unchanged (260 chars) GAGAL A2 large output 18300 -> 0 chars (100% less) GAGAL A3 pointe |
| `verify-claude-ui.mjs` | MERAH | 1 | 7475 | PASS V0 app hidup — title="MDN Web Docs" FAIL V1 kit bersama terekspor — {"error":"TypeError: Failed to fetch  |
| `verify-command-hidup.mjs` | MERAH | 1 | 1188 | == Command yang tadinya mati: API Client, SQL Explorer, Credentials == GAGAL credentials_list [(tidak dicoba)] |
| `verify-commands.mjs` | MERAH | 1 | 579 | file:///D:/Zephyr/scripts/verify-commands.mjs:41 if (st.done) { if (st.error) throw new Error(st.error); retur |
| `verify-diff-auto.mjs` | MERAH | 1 | 4087 | mount: ok LULUS W0 harness mounted tab: ok seed: seeded LULUS W1 existing diffs on screen = 1 GAGAL W2 narrow= |
| `verify-features.mjs` | MERAH | 1 | 4075 | == verify-features == GAGAL workspace dibuka + trust (Cannot read properties of undefined (reading 'getState') |
| `verify-gelombang7.mjs` | MERAH | 1 | 3892 | LULUS G7-1a tombol ActivityBar ditemukan: 11 (Explorer \| Search \| Outline \| Source Control \| Run & Debug (Ctrl |
| `verify-i18n-dom.mjs` | MERAH | 1 | 1077 | bahasa aktif : en simpul teks : 219 teks Indonesia: 4 [div.tab] C:\Users\Zyrex\AppData\Local\Temp\zephyr-p14-7 |
| `verify-ikon-agent.mjs` | MERAH | 13 | 11801 | == Ikon agent: naga untuk Zeph, 7 untuk sub-agent == katalog -> ERR Failed to fetch dynamically imported modul |
| `verify-lsp-centang.mjs` | MERAH | 1 | 22170 | == Hanya server terpasang yang tercentang == GAGAL saklar induk bisa dinyalakan server terpasang: 0 () server  |
| `verify-lsp-mati-nota.mjs` | MERAH | 1 | 2691 | GAGAL: saklar lsp-global tidak ada - halaman LSP tidak terbuka |
| `verify-lsp-terax.mjs` | MERAH | 1 | 18161 | == Verifikasi Language Server ala Terax == GAGAL 3 penanda "terpasang" muncul otomatis [0 penanda] OK penanda  |
| `verify-model-provider-gate.mjs` | MERAH | 1 | 4355 | GAGAL PROV-V1 ditawarkan: [] \| seharusnya: [gemini, openai, custom] \| hilang: gemini, openai, custom LULUS PRO |
| `verify-rules-hidup.mjs` | MERAH | 13 | 1739 | == Pemeriksaan aturan di aplikasi hidup == Warning: Detected unsettled top-level await at file:///D:/Zephyr/sc |
| `verify-voice.mjs` | MERAH | 1 | 4988 | == Voice: setelan, mesin suara, dan tombol baca == OK platform punya speechSynthesis [ada=true suara=0] GAGAL  |
| `verify05.mjs` | MERAH | 2 | 8802 | # target: Zephyr — Code Editor LULUS V1a panel=true tab="PowerShell" xterm=true pid=20208 prompt="PS C:\Users\ |
| `verify09.mjs` | MERAH | 2 | 4878 | # target: Zephyr — Code Editor [verify09] settings.json dipulihkan ke keadaan sebelum uji verify09 error: "und |
| `verify33.mjs` | MERAH | 0 | 5121 | == aiStore guard (2 bug fatal) == LULUS V1 'completed' bertahan jadi 'done' (dapat: done) LULUS V2 'pending' t |
| `cek-0c.mjs` | BUTUH-APP | 1 | 928 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-3-menu.mjs` | BUTUH-APP | 1 | 1317 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ac2.mjs` | BUTUH-APP | 1 | 947 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: RangeError: Select |
| `cek-ac4.mjs` | BUTUH-APP | 1 | 864 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ac6.mjs` | BUTUH-APP | 1 | 945 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ac7.mjs` | BUTUH-APP | 1 | 842 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ac8.mjs` | BUTUH-APP | 1 | 778 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ac9.mjs` | BUTUH-APP | 1 | 819 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ai-side.mjs` | BUTUH-APP | 0 | 2991 | mount : 1 side chat: { "pos": "kanan", "headHeight": 38, "headRows": 2, "ikonJumlah": 3, "ikonLabel": [ "Chat  |
| `cek-ai-side2.mjs` | BUTUH-APP | 1 | 27719 | reload dikirim file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: Typ |
| `cek-ai-trace.mjs` | BUTUH-APP | 1 | 41465 | file:///D:/Zephyr/scripts/lib-cdp.mjs:423 throw new Error( ^ Error: timeout: halaman sepertinya RELOAD di teng |
| `cek-alat-mcp.mjs` | BUTUH-APP | 0 | 480 | status: 0 body: fetch failed |
| `cek-attach-semua.mjs` | BUTUH-APP | 1 | 1061 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-badge-model.mjs` | BUTUH-APP | 1 | 1282 | mount : -1 file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeErr |
| `cek-berhenti-3langkah.mjs` | BUTUH-APP | 0 | 463 | === kunci store AI === sessions, activeId, activeIds, model, provider, pending, hydraTahap, hydraTerakhir, pen |
| `cek-bridge-tools.mjs` | BUTUH-APP | 1 | 1114 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: t.filte |
| `cek-bridge2.mjs` | BUTUH-APP | 0 | 1267 | TARGETS: page:Zephyr — Code Editor \| page:Example Domain \| page:Example Domains \| page:Google \| page:Example D |
| `cek-bukafile13.mjs` | BUTUH-APP | 1 | 1413 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-cakupan-fakta.mjs` | BUTUH-APP | 1 | 2556 | 0. indeks sinkron dengan sumber GAGAL gen-fakta-zephyr --check - src/lib/zephyrIndeks.ts TIDAK SINKRON dengan  |
| `cek-cdp-targets.mjs` | BUTUH-APP | 0 | 561 | ERR Failed to parse URL from undefined/json/list |
| `cek-chathistory.mjs` | BUTUH-APP | 1 | 1133 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: Error: Invalid hoo |
| `cek-comp13.mjs` | BUTUH-APP | 1 | 2662 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-compare13.mjs` | BUTUH-APP | 1 | 2676 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-depth.mjs` | BUTUH-APP | 1 | 965 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-dispatch13.mjs` | BUTUH-APP | 1 | 2132 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-dom-cm13.mjs` | BUTUH-APP | 1 | 1924 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-efek13.mjs` | BUTUH-APP | 1 | 2201 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-efekjalan13.mjs` | BUTUH-APP | 1 | 1928 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-emoji-donate.mjs` | BUTUH-APP | 1 | 960 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-endpoint-model.mjs` | BUTUH-APP | 1 | 885 | <anonymous_script>:1 [object Object] ^ SyntaxError: "[object Object]" is not valid JSON at JSON.parse (<anonym |
| `cek-ensure13.mjs` | BUTUH-APP | 1 | 2253 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-err.mjs` | BUTUH-APP | 1 | 894 | file:///D:/Zephyr/scripts/cek-err.mjs:8 cdp.on('Runtime.consoleAPICalled', (p) => { ^ TypeError: cdp.on is not |
| `cek-error-panel.mjs` | BUTUH-APP | 1 | 1158 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: st.useS |
| `cek-ext13.mjs` | BUTUH-APP | 1 | 1026 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-facet13.mjs` | BUTUH-APP | 1 | 2097 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-final-card2.mjs` | BUTUH-APP | 1 | 1314 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-final13.mjs` | BUTUH-APP | 1 | 2904 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-folder.mjs` | BUTUH-APP | 1 | 7378 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-folder2.mjs` | BUTUH-APP | 1 | 22977 | { "daftar": [], "swap": null } file:///D:/Zephyr/scripts/lib-cdp.mjs:297 reject(new Error(`timeout ${batasMs}m |
| `cek-ghost10.mjs` | BUTUH-APP | 1 | 2326 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost11.mjs` | BUTUH-APP | 1 | 1349 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost12.mjs` | BUTUH-APP | 1 | 1290 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost13.mjs` | BUTUH-APP | 1 | 1173 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost14.mjs` | BUTUH-APP | 1 | 883 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost15.mjs` | BUTUH-APP | 1 | 848 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost2.mjs` | BUTUH-APP | 1 | 810 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost3.mjs` | BUTUH-APP | 1 | 3626 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost4.mjs` | BUTUH-APP | 1 | 798 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost5.mjs` | BUTUH-APP | 1 | 827 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost7.mjs` | BUTUH-APP | 1 | 787 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-ghost9.mjs` | BUTUH-APP | 1 | 756 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-hf13.mjs` | BUTUH-APP | 1 | 2337 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-highlightfor13.mjs` | BUTUH-APP | 1 | 2164 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-indeks-sinkron.mjs` | BUTUH-APP | 1 | 6985 | cek-indeks-sinkron - src/lib/zephyrIndeks.ts ok artefak terbaca (6212 entri) - 1033126 byte, cap 1.1.13 / f83c |
| `cek-indent.mjs` | BUTUH-APP | 1 | 1314 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-indo4.mjs` | BUTUH-APP | 0 | 1160 | { "uiLang": "(?)", "jumlah": 38, "out": [ { "tag": "STYLE", "cls": "", "testid": "", "teks": "/* ai-todo-card. |
| `cek-invoke.mjs` | BUTUH-APP | 0 | 1524 | { "adaTauri": "undefined", "adaTauriInternals": "object", "invoke": [ { "id": "codex", "label": "Codex CLI (Op |
| `cek-jendela.mjs` | BUTUH-APP | 0 | 689 | judul: Zephyr — Code Editor \| url: http://localhost:5173/ {"zephyr":true,"adaCalculator":false,"adaThink":fals |
| `cek-katalog-jumlah.mjs` | BUTUH-APP | 0 | 1439 | == JUMLAH PAKET KATALOG BAWAAN == Akar kerja: D:\Zephyr src-tauri/src/ext_bundled.rs: 93 paket src-tauri/src/e |
| `cek-key.mjs` | BUTUH-APP | 1 | 1105 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-klaim-tool.mjs` | BUTUH-APP | 1 | 1140 | LULUS K0 67 tool terdaftar di AGENT_TOOLS LULUS K-search kode (grep/ "BELUM PUNYA search kode (grep/ripgrep)"  |
| `cek-konteks-repo.mjs` | BUTUH-APP | 0 | 2080 | CEK KONTEKS REPO (ZEPH-KONTEKS-REPO) pohon tiruan: C:\Users\Zyrex\AppData\Local\Temp\cek-konteks-repo-5qhCLz A |
| `cek-lang.mjs` | BUTUH-APP | 1 | 801 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-lang13.mjs` | BUTUH-APP | 1 | 836 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-lang2.mjs` | BUTUH-APP | 1 | 783 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-langcomp13.mjs` | BUTUH-APP | 1 | 941 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-lanjut-timeout-asli.mjs` | BUTUH-APP | 1 | 338 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `cek-log13.mjs` | BUTUH-APP | 1 | 544 | file:///D:/Zephyr/scripts/cek-log13.mjs:12 cdp.ws.on('message', (raw) => { ^ TypeError: Cannot read properties |
| `cek-lsp-live.mjs` | BUTUH-APP | 1 | 4960 | OK L1 semua baris diprobe - 21 baris OK L2 tiap baris hijau menunjuk berkas yang ada - 13 hijau, 0 tanpa berka |
| `cek-manual13.mjs` | BUTUH-APP | 1 | 1000 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-mcp-rilis.mjs` | BUTUH-APP | 1 | 1243 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `cek-mmisian.mjs` | BUTUH-APP | 1 | 844 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-mmmath.mjs` | BUTUH-APP | 1 | 893 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-mmsebar.mjs` | BUTUH-APP | 1 | 1568 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-nama-alat-hidup.mjs` | BUTUH-APP | 0 | 507 | awalan di app hidup: mcp__zephyr__ jumlah tool: 67 nama MCP: mcp__zephyr__inspect, mcp__zephyr__run_command, m |
| `cek-narasi-pipa.mjs` | BUTUH-APP | 1 | 362 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `cek-node.mjs` | BUTUH-APP | 1 | 828 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-panel-mcp.mjs` | BUTUH-APP | 1 | 1096 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-panel-terminal.mjs` | BUTUH-APP | 1 | 1164 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-panels.mjs` | BUTUH-APP | 1 | 4182 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: window. |
| `cek-panels2.mjs` | BUTUH-APP | 1 | 29705 | TERMINAL: { "term": { "shell": false, "private": false, "shellIkon": false, "agents": 0, "subtitle": [], "summ |
| `cek-panggil13.mjs` | BUTUH-APP | 1 | 1964 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-pasang13.mjs` | BUTUH-APP | 1 | 1940 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-pengetahuan-live.mjs` | BUTUH-APP | 1 | 5632 | (mock-ai belum hidup, diluncurkan sendiri di http://127.0.0.1:8098) prompt nyata: 22987 char (dua bahasa dicob |
| `cek-plugin.mjs` | BUTUH-APP | 1 | 998 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-polos13.mjs` | BUTUH-APP | 1 | 1254 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: Error: Unrecognize |
| `cek-posisi-pane.mjs` | BUTUH-APP | 1 | 2063 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: t.find  |
| `cek-readonly13.mjs` | BUTUH-APP | 1 | 1865 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-reconfigure13.mjs` | BUTUH-APP | 1 | 1718 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-rilis.mjs` | BUTUH-APP | 1 | 412 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `cek-ro.mjs` | BUTUH-APP | 1 | 753 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-runtime-sadar-live.mjs` | BUTUH-APP | 1 | 8322 | (mock-ai belum hidup, diluncurkan sendiri di http://127.0.0.1:8098) mock-ai versi 7 hidup di http://127.0.0.1: |
| `cek-senja.mjs` | BUTUH-APP | 0 | 5363 | { "navKlik": "Theme", "barisHalaman": [ "Skip to editor", "DEV", "File", "Edit", "Selection", "View", "Go", "R |
| `cek-skema-mcp.mjs` | BUTUH-APP | 1 | 483 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `cek-slash.mjs` | BUTUH-APP | 1 | 721 | file:///D:/Zephyr/scripts/lib-cdp.mjs:312 throw new Error(r.result.exceptionDetails.exception?.description ??  |
| `cek-span-detail13.mjs` | BUTUH-APP | 1 | 1776 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-status-mcp.mjs` | BUTUH-APP | 1 | 726 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `cek-struktur.mjs` | BUTUH-APP | 1 | 714 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-style13.mjs` | BUTUH-APP | 1 | 2286 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-sub-error.mjs` | BUTUH-APP | 1 | 772 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: S.store |
| `cek-sub10.mjs` | BUTUH-APP | 1 | 6444 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: sub.sun |
| `cek-sub11.mjs` | BUTUH-APP | 1 | 28180 | { "panutanPersona": null, "panutanTampilBlok": null, "item3": { "pickerAdaRobot": false, "jumlahIkon": 0 }, "i |
| `cek-sub7.mjs` | BUTUH-APP | 1 | 3828 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: sub.sun |
| `cek-sub9.mjs` | BUTUH-APP | 1 | 6064 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: sub.sun |
| `cek-subagent-render.mjs` | BUTUH-APP | 1 | 1589 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: SUB.set |
| `cek-syntax-real.mjs` | BUTUH-APP | 1 | 1504 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-tegas13.mjs` | BUTUH-APP | 1 | 1907 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-tema2.mjs` | BUTUH-APP | 0 | 3603 | jembatan: {"kunci":["__ZEPHYR_JEMBATAN_MCP__","__ZEPHYR_AI_CALLBACK__","__ZEPHYR_AI_LISTENER_PROMISE__","__ZEP |
| `cek-timing13.mjs` | BUTUH-APP | 1 | 1636 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-token-mcp.mjs` | BUTUH-APP | 1 | 468 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `cek-toolcard2.mjs` | BUTUH-APP | 1 | 1442 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-tools.mjs` | BUTUH-APP | 0 | 5639 | url : http://localhost:5173/ root children : 1 setelah set : tools 3s kemudian : tools tools-view : true sideb |
| `cek-tree13.mjs` | BUTUH-APP | 1 | 2281 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: {"code":"Workspace |
| `cek-uji.mjs` | BUTUH-APP | 1 | 4298 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-warna-bracket.mjs` | BUTUH-APP | 1 | 830 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-warnafinal.mjs` | BUTUH-APP | 1 | 908 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-zig3.mjs` | BUTUH-APP | 1 | 984 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-zig4.mjs` | BUTUH-APP | 1 | 830 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-zig5.mjs` | BUTUH-APP | 1 | 793 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-zig7.mjs` | BUTUH-APP | 1 | 841 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `cek-zig8.mjs` | BUTUH-APP | 1 | 768 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `uji-agent-shape.mjs` | BUTUH-APP | 1 | 796 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-ai-kanan-live.mjs` | BUTUH-APP | 1 | 28291 | file:///D:/Zephyr/scripts/lib-cdp.mjs:158 c.#ws.on('close', () => c.#tolakSemua(new Error('socket CDP tertutup |
| `uji-ai-models-pop.mjs` | BUTUH-APP | 1 | 9648 | uji-ai-models-pop — pop-up "AI Models" (CDP :9223) app : Zephyr — Code Editor — http://localhost:5173/ activit |
| `uji-alur-verifikasi.mjs` | BUTUH-APP | 0 | 791 | LULUS V1 ubah .ts -> ["npx tsc --noEmit"] LULUS V2 ubah .rs -> ["cargo test --lib (cwd=src-tauri)"] LULUS V3 u |
| `uji-analis-gambar.mjs` | BUTUH-APP | 0 | 1711 | UJI ANALIS GAMBAR (jalur vision Zephyr, offline) fixture: C:\Users\Zyrex\AppData\Local\Temp\analis-gambar-1x1. |
| `uji-bahasa-live.mjs` | BUTUH-APP | 0 | 510 | == uji bahasa: efek nyata 88 paket bahasa bawaan == [a] daftar paket bahasa (src-tauri/src/ext_bundled.rs) 88  |
| `uji-browser-baca.mjs` | BUTUH-APP | 1 | 7226 | http server uji: http://localhost:5199 (isinya dirender skrip) bersihkan pane -> ditutup: (tidak ada) browser_ |
| `uji-browser-dom.mjs` | BUTUH-APP | 1 | 296 | ERR Failed to parse URL from undefined/json/list |
| `uji-browser-eval.mjs` | BUTUH-APP | 1 | 392 | ERR Failed to parse URL from undefined/json/list |
| `uji-browser-pane-rilis.mjs` | BUTUH-APP | 1 | 767 | ERR fetch failed |
| `uji-bug-kejam2.mjs` | BUTUH-APP | 0 | 380 | proyek uji: D:/Testing/bug-kejam LULUS B1 `node laporan.js` jalan tanpa error (exit=0) dan mencetak total=3655 |
| `uji-ctrlv.mjs` | BUTUH-APP | 1 | 29349 | file:///D:/Zephyr/scripts/lib-cdp.mjs:158 c.#ws.on('close', () => c.#tolakSemua(new Error('socket CDP tertutup |
| `uji-ekstensi-jenis.mjs` | BUTUH-APP | 1 | 5359 | UJI EKSTENSI JENIS (unduh -> pasang -> muat, server berkas lokal di TMPDIR) server: http://127.0.0.1:61702 \| T |
| `uji-file-read.mjs` | BUTUH-APP | 13 | 3732 | Warning: Detected unsettled top-level await at file:///D:/Zephyr/scripts/uji-file-read.mjs:79 await kirim('Run |
| `uji-fitur-baru.mjs` | BUTUH-APP | 1 | 2699 | target: http://localhost:5173/ (build dev) terhubung ke Zephyr di port 9223 jembatan dev: {"store":true,"term" |
| `uji-gerbang-git.mjs` | BUTUH-APP | 1 | 3348 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `uji-ghost-pemasok.mjs` | BUTUH-APP | 0 | 346 | LULUS A1 saran kosong -> null (PEMASOK_LOKAL, baris tanpa isi) - ''=null spasi=null pendek=null LULUS A2 pemas |
| `uji-google-pane.mjs` | BUTUH-APP | 1 | 2403 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `uji-hydrafusion.mjs` | BUTUH-APP | 0 | 43188 | LULUS H1 bawaan 3 request per run (3) LULUS H2 plafon keras ada dan lebih longgar dari bawaan (6) LULUS H3 tan |
| `uji-keadaan-prompt.mjs` | BUTUH-APP | 1 | 10163 | mock-ai versi 7 hidup di http://127.0.0.1:8098 LULUS K1 halaman direload lewat CDP (jangkar halaman lama hilan |
| `uji-kesiapan-fitur.mjs` | BUTUH-APP | 0 | 696 | UJI KESIAPAN FITUR ZEPHYR (read-only, dari sumber) akar repo: D:\Zephyr == A. PENYARING TOOL PER GILIRAN (targ |
| `uji-kesiapan-tool.mjs` | BUTUH-APP | 1 | 588 | == (a) Tool yang DITAWARKAN per giliran == sumber angka : impor src/lib/toolGate.ts (TOOL_AKTIF_AWAL) katalog  |
| `uji-ketahan-agen.mjs` | BUTUH-APP | 0 | 5549 | uji-ketahan-agen — deterministik: tanpa jaringan, tanpa model, tanpa Tauri repo: D:\Zephyr bundel sementara: C |
| `uji-keymap-live.mjs` | BUTUH-APP | 0 | 6214 | === UJI KEYMAP ZEPHYR (statis) === repo : D:\Zephyr paket : 4 chord total 37 id Zephyr: registry 179 v keybind |
| `uji-layout-pulih.mjs` | BUTUH-APP | 1 | 2969 | === Customize Layout: jalan pulih === file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error( |
| `uji-main-state.mjs` | BUTUH-APP | 1 | 596 | ERR Failed to parse URL from undefined/json/list |
| `uji-mcp-auth.mjs` | BUTUH-APP | 1 | 597 | === POST / (JSON-RPC) === BOCOR tools/list tanpa token -> 0 fetch failed BOCOR tools/list token SALAH -> 0 fet |
| `uji-mcp-editor-open.mjs` | BUTUH-APP | 0 | 544 | === list_editors (jembatan UI yang sama) === GAGAL fetch failed === editor_open berkas yang SUDAH ADA di works |
| `uji-mcp-luar.mjs` | BUTUH-APP | 0 | 608 | LULUS M-sentry.list_issues mcp__sentry__list_issues -> sentry.list_issues LULUS M-github.create_pr mcp__github |
| `uji-mcp-workspace.mjs` | BUTUH-APP | 1 | 408 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-panel-memori.mjs` | BUTUH-APP | 1 | 652 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-pemadatan.mjs` | BUTUH-APP | 1 | 1323 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-pengetahuan-tanpa-cdp.mjs` | BUTUH-APP | 0 | 10792 | UJI PENGETAHUAN ZEPHYR - TANPA CDP (141+163, lapis deterministik) (A) sumber kebenaran yang dibundel dari src/ |
| `uji-pesan-tengah.mjs` | BUTUH-APP | 1 | 25394 | workspace: D:/Testing/pesan-tengah (siap) file:///D:/Zephyr/scripts/lib-cdp.mjs:158 c.#ws.on('close', () => c. |
| `uji-prompt-subagent.mjs` | BUTUH-APP | 0 | 709 | === bridge prompt yang tersedia === onbeforeinstallprompt, prompt, __ZEPHYR_PROMPT_LIB__, __ZEPHYR_PROMPT__ == |
| `uji-putar-token.mjs` | BUTUH-APP | 1 | 456 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-raksasa.mjs` | BUTUH-APP | 1 | 23787 | agen: deepseek-v4.1-flash ws=D:/Testing/pesan-tengah busy=false tugas dikirim (2026-10-13T23:29:55.341Z) — ini |
| `uji-rilis-mcp.mjs` | BUTUH-APP | 1 | 288 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-runtime-jendela.mjs` | BUTUH-APP | 0 | 359 | halaman : http://localhost:5173/ target : FF91228B24C1315542343DA01AD393E1 panel dibaca aplikasi : 6 -> proble |
| `uji-satu-pane.mjs` | BUTUH-APP | 1 | 1665 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `uji-screenshot-stage.mjs` | BUTUH-APP | 1 | 272 | ERR Failed to parse URL from undefined/json/list |
| `uji-set-pindah.mjs` | BUTUH-APP | 2 | 2221 | uji-set-pindah — setelan yang pindah ke Chat Settings (CDP :9223) BLOKIR tidak bisa menyambung ke CDP :9223 —  |
| `uji-ss.mjs` | BUTUH-APP | 1 | 401 | ERR Failed to parse URL from undefined/json/list |
| `uji-subagent-nyata.mjs` | BUTUH-APP | 1 | 418 | === Subagent: uji jalur nyata === mock provider MATI — jalankan: node scripts/mock-ai.mjs |
| `uji-subagent-tulis.mjs` | BUTUH-APP | 1 | 473 | === Subagent: BENAR-BENAR MENULIS (bukan baca) === mock provider MATI — jalankan: node scripts/mock-ai.mjs 809 |
| `uji-t1-3.mjs` | BUTUH-APP | 1 | 1234 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: Command http_parse |
| `uji-t10-debug-launch.mjs` | BUTUH-APP | 1 | 1286 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `uji-t2-1.mjs` | BUTUH-APP | 1 | 4415 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `uji-t2-2.mjs` | BUTUH-APP | 1 | 1162 | file:///D:/Zephyr/scripts/lib-cdp.mjs:312 throw new Error(r.result.exceptionDetails.exception?.description ??  |
| `uji-t2-4.mjs` | BUTUH-APP | 1 | 4847 | === T2.4: Test Explorer === LULUS workspace dipercaya (syarat menjalankan task) {"trusted":true} GAGAL tab "te |
| `uji-t3-1.mjs` | BUTUH-APP | 1 | 670 | === T3.1: Dev Environment === file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error |
| `uji-t3-10.mjs` | BUTUH-APP | 1 | 9491 | === T3.10: Settings Subagent + panel compact === GAGAL settings lama (tanpa key subagent) tidak bikin app cras |
| `uji-t3-11.mjs` | BUTUH-APP | 1 | 3437 | === T3.11: pemilih mode + konteks + penalaran + suara === GAGAL tombol mode persetujuan ada LULUS BUKAN <selec |
| `uji-t3-2.mjs` | BUTUH-APP | 1 | 1359 | === T3.2: Database browser === (file uji dibuat: D:/Zephyr/.uji-db.sqlite — ok) GAGAL db_sqlite_tabel jalan n= |
| `uji-t3-3.mjs` | BUTUH-APP | 1 | 2149 | === T3.3: SFTP + port forwarding === GAGAL tab "sftp" terdaftar problems,output,debug,terminal,ports,subagents |
| `uji-t3-4.mjs` | BUTUH-APP | 1 | 1203 | (PNG uji dibuat: D:/Zephyr/.uji-img/uji-4x2.png — 4×2, 45 byte) === T3.4: Zen + pratinjau gambar === LULUS bac |
| `uji-t3-6.mjs` | BUTUH-APP | 1 | 3744 | === T3.6: timeline langkah berlabel === GAGAL labelAksi memetakan 8 tool ke jenis yang benar salah: file_read, |
| `uji-t3-7.mjs` | BUTUH-APP | 1 | 1975 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-t3-8.mjs` | BUTUH-APP | 1 | 1803 | === T3.8: TODO agent yang bisa dipantau === LULUS prompt mewajibkan pakai todo_write GAGAL prompt menyebut ala |
| `uji-t4-10.mjs` | BUTUH-APP | 1 | 4624 | provider ber-key: anthropic, custom, custom-voice, custom2, gemini, openai GAGAL menu terbuka di tingkat provi |
| `uji-t4-11.mjs` | BUTUH-APP | 1 | 2855 | urutan tab: Problems \| Output \| Debug Console \| Terminal1 \| Ports \| Subagents GAGAL ada tab AI di strip utama  |
| `uji-t4-12.mjs` | BUTUH-APP | 1 | 7976 | GAGAL pilihan "Bawah" ada di Customize Layout GAGAL pilihan "Kanan" ada di Customize Layout GAGAL posisi sekar |
| `uji-t4-13.mjs` | BUTUH-APP | 1 | 5643 | LULUS prompt TIDAK mengklaim "memanggil subagent paralel" LULUS prompt TIDAK menyuruh "gunakan subagent parale |
| `uji-t4-16.mjs` | BUTUH-APP | 1 | 1670 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-t4-1b.mjs` | BUTUH-APP | 1 | 5739 | LULUS panel AI di kolom kanan aiPanel=right file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new  |
| `uji-t4-3-8.mjs` | BUTUH-APP | 1 | 3249 | GAGAL halaman Prompt AI ada GAGAL 4 bagian prompt tampil sp-identitas, sp-carakerja, sp-aturan, sp-instruksi G |
| `uji-t4.mjs` | BUTUH-APP | 1 | 9508 | === T4.1/T4.2: tab Subagents + peran === LULUS tab "subagents" terdaftar problems, output, debug, terminal, po |
| `uji-t5-tema.mjs` | BUTUH-APP | 1 | 6418 | === A. Tabel tema (impor langsung, tanpa app) === LULUS impor src/lib/themes.ts 17 tema ditawarkan LULUS tabel |
| `uji-t6-identitas.mjs` | BUTUH-APP | 1 | 1264 | == identitas model: Zeph menjawab dari fakta == FATAL: fetch failed |
| `uji-t6-tema-mode.mjs` | BUTUH-APP | 1 | 783 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-t7-performa.mjs` | BUTUH-APP | 1 | 879 | == performa agent + kerapatan == FATAL: fetch failed |
| `uji-t8-fitur-baru.mjs` | BUTUH-APP | 1 | 1037 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-t9-browser-agent.mjs` | BUTUH-APP | 1 | 953 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-tahu-workspace.mjs` | BUTUH-APP | 1 | 639 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-tema-warna-kode.mjs` | BUTUH-APP | 0 | 1485 | sumber: working tree (sesudah) uji-tema-warna-kode — 11 token: --syn-keyword, --syn-string, --syn-number, --sy |
| `uji-tengah-run.mjs` | BUTUH-APP | 1 | 661 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-term-bg.mjs` | BUTUH-APP | 1 | 548 | ERR Failed to parse URL from undefined/json/list |
| `uji-term-open.mjs` | BUTUH-APP | 1 | 504 | ERR Failed to parse URL from undefined/json/list |
| `uji-term2.mjs` | BUTUH-APP | 1 | 442 | ERR Failed to parse URL from undefined/json/list |
| `uji-terminal-rilis.mjs` | BUTUH-APP | 1 | 590 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-todo-id-saja.mjs` | BUTUH-APP | 1 | 1067 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-todo-live.mjs` | BUTUH-APP | 1 | 619 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-todo-panel-live.mjs` | BUTUH-APP | 1 | 822 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `uji-token-css.mjs` | BUTUH-APP | 1 | 1704 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `uji-tugas-berat.mjs` | BUTUH-APP | 1 | 22271 | sebelum: custom/deepseek-v4.1-flash ws=D:/Testing/pesan-tengah busy=true file:///D:/Zephyr/scripts/lib-cdp.mjs |
| `uji-zephyr-self.mjs` | BUTUH-APP | 1 | 6085 | LULUS S1 zephyrSelf.ts NOL jaringan: tidak ada fetch/XHR/WebSocket/sendBeacon/EventSource/URL http LULUS S2 ze |
| `verify-antrean-gagap.mjs` | BUTUH-APP | 0 | 289 | == Verifikasi antrean AI tidak menggandakan pesan == DILEWATI: window.__ZEPHYR_AI__ tidak ada (bukan mode dev? |
| `verify-avatar-chat.mjs` | BUTUH-APP | 1 | 11903 | == Foto avatar chat == bentuk bridge settings: TIDAK ADA GAGAL baris foto avatar ada GAGAL pembungkus .set-ava |
| `verify-bookmarks.mjs` | BUTUH-APP | 1 | 396 | GAGAL B0 THREW: TypeError: Cannot read properties of undefined (reading 'getState') at <anonymous>:2:69 at <an |
| `verify-compact-ring.mjs` | BUTUH-APP | 1 | 2500 | seed: no-store GAGAL R1 ring element present: 0 <anonymous_script>:1 tidak ada ^ SyntaxError: Unexpected token |
| `verify-devenv-buttons.mjs` | BUTUH-APP | 1 | 2434 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `verify-devenv-lag.mjs` | BUTUH-APP | 1 | 1349 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `verify-fakta-zephyr.mjs` | BUTUH-APP | 1 | 3236 | 1. sinkron dengan sumber GAGAL gen-fakta-zephyr --check - src/lib/zephyrIndeks.ts TIDAK SINKRON dengan sumbern |
| `verify-i18n-undangan.mjs` | BUTUH-APP | 1 | 471 | Teks Indonesia mentah di tr()/tf()/tx(): 10 panggilan di 6 berkas. src/components/ai/SubAgentPanel.tsx (3) 110 |
| `verify-katalog-mcp.mjs` | BUTUH-APP | 1 | 852 | == 1. Jumlah == LULUS 11 tool web/browser LULUS inti = bawaan + MCP LULUS total = inti + web GAGAL bawaan di k |
| `verify-lanjut2.mjs` | BUTUH-APP | 0 | 523 | == Verifikasi checkpoint-lanjut + strip-gambar == DILEWATI: window.__ZEPHYR_AI__ tidak ada (bukan mode dev?) = |
| `verify-panel-layout.mjs` | BUTUH-APP | 1 | 1043 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `verify-panels-ui.mjs` | BUTUH-APP | 1 | 1309 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-repo-scan.mjs` | BUTUH-APP | 1 | 1159 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-resume.mjs` | BUTUH-APP | 1 | 2978 | tab: ok turn1: THREW: TypeError: Cannot read properties of undefined (reading 'getState') at <anonymous>:2:53  |
| `verify-rules-hidup2.mjs` | BUTUH-APP | 1 | 1297 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-screenshot-ui.mjs` | BUTUH-APP | 1 | 825 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-shared-rail.mjs` | BUTUH-APP | 1 | 1078 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-sidebar-aktivitas.mjs` | BUTUH-APP | 1 | 1213 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-skill-memory.mjs` | BUTUH-APP | 1 | 1173 | == verifikasi skill + memori + cron (1.1.11) == FATAL: fetch failed |
| `verify-slash-actions.mjs` | BUTUH-APP | 1 | 626 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-slash-palette.mjs` | BUTUH-APP | 1 | 442 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-sub-custom.mjs` | BUTUH-APP | 1 | 786 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-subagent-model.mjs` | BUTUH-APP | 1 | 712 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-subagent-orchestration.mjs` | BUTUH-APP | 1 | 1326 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-subagent-real.mjs` | BUTUH-APP | 1 | 928 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-think-stream.mjs` | BUTUH-APP | 1 | 534 | GAGAL: fetch failed |
| `verify-thinking-default.mjs` | BUTUH-APP | 1 | 783 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-thinking-live.mjs` | BUTUH-APP | 1 | 724 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-thinking-ui.mjs` | BUTUH-APP | 1 | 543 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-todo-card.mjs` | BUTUH-APP | 1 | 503 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-todo-float.mjs` | BUTUH-APP | 1 | 609 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-tool-gate.mjs` | BUTUH-APP | 1 | 1003 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-tool-inti.mjs` | BUTUH-APP | 1 | 684 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-tool-picker-51.mjs` | BUTUH-APP | 1 | 717 | node:internal/modules/run_main:107 triggerUncaughtException( ^ [TypeError: fetch failed] { [cause]: Error: con |
| `verify-tool-sections.mjs` | BUTUH-APP | 1 | 1700 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Cannot  |
| `verify-tools-g7.mjs` | BUTUH-APP | 1 | 1971 | GAGAL T0 kelima tool terdaftar (total 67 tool); hilang: clipboard_read, clipboard_write, screenshot_ui, plan_m |
| `verify-usage.mjs` | BUTUH-APP | 1 | 7695 | tab: ok send: THREW: TypeError: Cannot read properties of undefined (reading 'getState') at <anonymous>:2:53 a |
| `verify.mjs` | BUTUH-APP | 2 | 856 | verify error: fetch failed |
| `verify04.mjs` | BUTUH-APP | 2 | 9383 | # target: Zephyr — Code Editor LULUS V1 header="Zephyr" 158 node, node_modules=false .git=false, [.backup-rili |
| `verify06.mjs` | BUTUH-APP | 2 | 647 | # target: Zephyr — Code Editor verify06 error: __ZEPHYR_TERM__ tidak ada — reload halaman stack: Error: __ZEPH |
| `verify08.mjs` | BUTUH-APP | 2 | 466 | # target: Zephyr — Code Editor verify08 error: Error: __ZEPHYR_SET__ tidak ada Ereload halaman at main (file:/ |
| `verify10.mjs` | BUTUH-APP | 2 | 11868 | # target: Zephyr — Code Editor LULUS V1 repo terdeteksi (isRepo=true), panel SCM tampil, branch "main" di pane |
| `verify11.mjs` | BUTUH-APP | 0 | 13014 | # target: Zephyr — Code Editor LULUS V1 server mati: /health → tidak ada koneksi, port 9222 TIDAK listening; U |
| `verify12.mjs` | BUTUH-APP | 1 | 911 | verify12 error: fetch failed |
| `verify13.mjs` | BUTUH-APP | 1 | 899 | verify13 error: fetch failed |
| `verify15.mjs` | BUTUH-APP | 1 | 18266 | verify15 error: fetch failed |
| `verify16.mjs` | BUTUH-APP | 1 | 1857 | verify16 error: fetch failed |
| `verify18.mjs` | BUTUH-APP | 1 | 5069 | verify18 error: tidak ada target Zephyr yang menjawab di :9223 (2 kandidat, semua bisu, 0 direload): socket ha |
| `verify19.mjs` | BUTUH-APP | 1 | 2062 | verify19 error: fetch failed |
| `verify20.mjs` | BUTUH-APP | 1 | 1687 | # target: Zephyr — Code Editor verify20 error: __ZEPHYR_PANEL__ tidak ada — reload halaman (devBridge fase 20) |
| `verify21.mjs` | BUTUH-APP | 1 | 1734 | # target: Zephyr — Code Editor verify21 error: __ZEPHYR_LSP__ tidak ada — reload halaman (devBridge fase 21) |
| `verify24.mjs` | BUTUH-APP | 1 | 943 | verify24 error: fetch failed |
| `verify27.mjs` | BUTUH-APP | 1 | 936 | verify27 error: fetch failed |
| `verify28.mjs` | BUTUH-APP | 1 | 6027 | GAGAL F28-V1 --version pipe: "zephyr 1.1.13" (ansi false); --help 26 baris, memuat opsi true; "zephyr ." stdou |
| `verify29.mjs` | BUTUH-APP | 1 | 1828 | [TypeError: fetch failed] { [cause]: Error: connect ECONNREFUSED 127.0.0.1:9223 at TCPConnectWrap.afterConnect |
| `verify30.mjs` | BUTUH-APP | 1 | 1778 | [TypeError: fetch failed] { [cause]: Error: connect ECONNREFUSED 127.0.0.1:9223 at TCPConnectWrap.afterConnect |
| `verify31.mjs` | BUTUH-APP | 1 | 676 | [TypeError: fetch failed] { [cause]: Error: connect ECONNREFUSED 127.0.0.1:9223 at TCPConnectWrap.afterConnect |
| `verify32.mjs` | BUTUH-APP | 1 | 513 | PASS V1 exports.activate + zephyr.registerCommand → command terdaftar PASS V2 module.exports.activate + vscode |
| `cek-event-load.mjs` | RUSAK | 1 | 965 | file:///D:/Zephyr/scripts/lib-cdp.mjs:432 if (st.error) throw new Error(st.error); ^ Error: TypeError: Failed  |
| `cek-v13-08.mjs` | RUSAK | 1 | 1021 | file:///D:/Zephyr/scripts/lib-cdp.mjs:312 throw new Error(r.result.exceptionDetails.exception?.description ??  |
| `cek-v7-sim.mjs` | RUSAK | 1 | 648 | file:///D:/Zephyr/scripts/lib-cdp.mjs:312 throw new Error(r.result.exceptionDetails.exception?.description ??  |
| `uji-subset-alat.mjs` | RUSAK | 1 | 607 | file:///D:/Zephyr/scripts/lib-cdp.mjs:312 throw new Error(r.result.exceptionDetails.exception?.description ??  |
| `cek-dari.mjs` | MENGGANTUNG | TIMEOUT | 45052 | [ { "id": "ikon", "dari": null, "style": "color: rgb(245, 158, 11);", "adaSvg": false, "isi": null }, { "id":  |
| `cek-indo3.mjs` | MENGGANTUNG | TIMEOUT | 45019 | {} |
| `cek-pengetahuan-2lapis.mjs` | MENGGANTUNG | TIMEOUT | 45024 | (mock-ai belum hidup, diluncurkan sendiri di http://127.0.0.1:8098) kunci provider: aktif=custom kunciAsli=fal |
| `cek-v2-09.mjs` | MENGGANTUNG | TIMEOUT | 45060 | # target: Zephyr — Code Editor cek-v2-09 error: TypeError: Cannot read properties of null (reading 'dataset')  |
| `cek-v3-09.mjs` | MENGGANTUNG | TIMEOUT | 45037 | # target: Zephyr — Code Editor |
| `uji-pane-dingin.mjs` | MENGGANTUNG | TIMEOUT | 45122 | restart zephyr... 9223 siap setelah 1s bridge siap, langsung mulai |
| `uji-t3-5.mjs` | MENGGANTUNG | TIMEOUT | 45042 | === T3.5: Customize Layout === LULUS tombol Customize Layout ada di title bar LULUS panel Customize Layout ter |
| `verify-ask-user.mjs` | MENGGANTUNG | TIMEOUT | 45059 | LULUS A1 ask_user terdaftar di antara 67 tool |
| `verify-cli-todo.mjs` | MENGGANTUNG | TIMEOUT | 45115 | tab: no-tab send: THREW: TypeError: Cannot read properties of undefined (reading 'getState') at <anonymous>:2: |
| `verify22.mjs` | MENGGANTUNG | TIMEOUT | 45060 | (tanpa keluaran) |
| `verify23.mjs` | MENGGANTUNG | TIMEOUT | 45056 | (tanpa keluaran) |
| `verify25.mjs` | MENGGANTUNG | TIMEOUT | 45101 | (tanpa keluaran) |
| `verify26.mjs` | MENGGANTUNG | TIMEOUT | 45087 | (tanpa keluaran) |

---

## 4. Yang benar-benar RUSAK (4 skrip)

| Skrip | Sebab |
|---|---|
| `cek-event-load.mjs` | gagal di `scripts/lib-cdp.mjs:432` — `throw new Error(st.error)` (galat sisi-app diteruskan, skrip tak menangani) |
| `cek-v13-08.mjs` | `scripts/lib-cdp.mjs:312` — lempar `exceptionDetails` dari `evaluate()` di halaman |
| `cek-v7-sim.mjs` | sama seperti di atas |
| `uji-subset-alat.mjs` | sama seperti di atas |

Semuanya **gagal karena halaman CDP yang dievaluasi tidak ada/kosong** — jadi keempatnya sebenarnya *BUTUH APP* yang tidak menangani kegagalan koneksi dengan baik. Perbaikan yang benar: tangkap galat di skrip ujinya, bukan ubah kode produk.

## 5. Yang MENGGANTUNG (13 skrip, cap 45 dtk, serial)

`cek-dari.mjs`, `cek-indo3.mjs`, `cek-pengetahuan-2lapis.mjs`, `cek-v2-09.mjs`, `cek-v3-09.mjs`, `uji-pane-dingin.mjs`, `uji-t3-5.mjs`, `verify-ask-user.mjs`, `verify-cli-todo.mjs`, `verify22.mjs`, `verify23.mjs`, `verify25.mjs`, `verify26.mjs`

Ciri: mayoritas **meluncurkan server/mock sendiri lalu menunggu tanpa batas** (`uji-pane-dingin.mjs` menyalakan ulang Zephyr lalu menunggu 9223; `cek-pengetahuan-2lapis.mjs` meluncurkan mock-ai di `127.0.0.1:8098`). `verify22/23/25/26.mjs` menggantung **tanpa mencetak apa pun** — kandidat skrip mati/rusak yang perlu dibaca manual (tidak saya ubah karena kode produk/lane lain).

## 6. MERAH yang menipu: keluar 1 padahal semua barisnya OK

Empat skrip mencetak baris `OK ...` dari awal sampai akhir tetapi keluar 1. Jangan pakai exit code-nya sebagai verdict — baca teksnya, atau periksa kenapa `process.exitCode` diset.

| Skrip | Baris nyata |
|---|---|
| `cek-i18n.mjs` | EN 372 kunci, ID 372, `missing=0 extra=0 dups=0` |
| `cek-cap-payload.mjs` | `request besar dipotong [887830 -> 37669]` |
| `cek-batas-inti.mjs` | `ukuran blok inti 7950 char ~ 1988 token (ambang 8000)` |
| `cek-batas-mcp-live.mjs` | `server 120 tool: hanya 40 yang dikirim — dikirim=40 batas=40` |

`cek-bridge.mjs` MERAH karena **bug di skripnya sendiri**: `r.result.value` diakses tanpa cek, padahal jawabannya `exceptionDetails` (`TypeError: Cannot read properties of undefined`).

---

## 7. Item backlog: mana yang TERBUKTI, mana yang cuma DIKLAIM

Bukti dihitung begini: sebuah item baru disebut **TERBUKTI** kalau ada skrip yang (a) **HIJAU**, dan (b) mencetak angka/aserasi yang benar-benar menguji item itu. HIJAU tanpa angka → **lemah** (bisa lulus vakum).

### 7.1 TERBUKTI (ada skrip hijau dengan angka pendukung)

| Item | Bukti (keluaran nyata) |
|---|---|
| Kamus i18n 10 bahasa sinkron & lengkap | `cek-i18n-10-bahasa` → *bahasa: 10*; `cek-kunci-i18n-10-kamus` → *Acuan id 335 kunci OK*; `cek-kunci-i18n-extra` → *ID 2404 kunci*; `cek-panel-tools-10bahasa` → semua bahasa memuat nama tool |
| Katalog tool utuh (67 tool, deskripsi ID+EN lengkap, tidak ada nama kembar) | `cek-jumlah-tool` → 67; `cek-duplikat-tool` → *tidak ada nama kembar*; `verify-deskripsi-tool` → 67/67/67; `verify-tools-runtime` → 67/67; `cek-ikon-tool` → 16 glyph, `infoAksi()` menjawab 67 tool |
| Aturan tool (allow menang; daftar tool dipangkas) | `uji-aturan-tool` → LULUS A1–A2; `uji-trim-tool` → *26 tool, 14699 byte skema* |
| Diff/hunk/blame/git gutter | `uji-hunk-diff`, `uji-hunk`, `uji-blame-gabung` (5 baris→1 penanda), `uji-git-bar` (2 penanda added), `verify-diff-preview`, `verify-diff-split`, `verify-newfile-diff` — semua HIJAU dengan angka |
| CLI agen terdeteksi + ikon agen (statis) | `cek-agents` → 4 CLI; `cek-cliagent` → store lengkap; `cek-ikon-agen` → segmen ikon |
| SSH: host berbahaya ditolak | `uji-ssh-aman` → *host 'foo; rm -rf /' ditolak* |
| Tema: token warna, halaman tema, tema sintaks VSCode | `cek-varwarna` (`--syntax-keyword` terisi), `cek-warna05` (MERAH/HIJAU/CYAN kosong = tidak ada warna salah), `uji-halaman-tema` → 5/5, `uji-tema-sintaks-vscode` HIJAU |
| Penghentian agent di rute navigasi (inti keluhan "loop") | `cek-loop-agent-e2e` → *E5 navigasi murni berhenti*; `cek-loop-navigasi`; `verify-fase-loop` → penjaga pengulangan tersedia di jalur produksi |
| Pengetahuan workspace & diri (`zephyr_self`) | `cek-tahu-workspace` → `{"root":"D:\\Zephyr"}`; `uji-tahu-zephyr` HIJAU |
| Market plugin: katalog besar + gerbang pasang | `verify-plugin-browser` → *315 plugins in catalog*; `uji-unduh-instal` HIJAU |
| Memori sesi | `uji-memori-sesi` HIJAU |

### 7.2 BELUM TERBUKTI (ada skripnya, tapi hasilnya MERAH — bukan klaim yang beres)

| Item | Skrip | Temuan nyata |
|---|---|---|
| Aturan operasional di prompt (buang aturan `todoWrite`) | `cek-aturan-operasional.mjs` | **GAGAL** — aturan `todoWrite` masih ada di prompt (persona 636 char) |
| Narasi bahasa Indonesia di jalur status | `cek-narasi-id.mjs` | **GAGAL** — `id.narasi`, `id.gagalSebarangBaris`, `id.hematTool` gagal (1 dari 4 lolos) |
| Bundel dokumen/prompt sinkron dengan disk (AI-TAHU-100-4) | `cek-bundel-docs.mjs`, `cek-batas-inti.mjs`, `cek-pengetahuan-2lapis.mjs` | **GAGAL artefak sinkron**; blok inti 7950 char (ambang 8000); `cek-pengetahuan-2lapis` **MENGGANTUNG** |
| Pemangkasan keluaran panjang tidak kehilangan isi | `verify-archive.mjs` | **GAGAL A1 + A2** — `large output 18300 -> 0 chars (100% less)`; keluaran 260 char pun berubah. Ini temuan paling serius karena tanpa app |
| Prompt subagent: "meneliti, bukan menulis" | `uji-prompt-subagent2.mjs` | **GAGAL** — aturan baru tidak ditemukan di prompt 22931 char |
| Batas tool MCP ke provider | `cek-batas-mcp-live.mjs` | MERAH (baris OK bercampur verdict) |
| HydraFusion baris status di panel | `cek-hydra-live.mjs`, `uji-hydrafusion.mjs` | MERAH; `uji-hydrafusion` HIJAU tetapi **66 detik** dan butuh app |
| Thinking: warna/gabung/live | `cek-reasoning-hidup.mjs`, `verify-thinking-live.mjs`, `verify-thinking-default.mjs` | MERAH / BUTUH APP — tidak ada bukti hidup |
| Gerbang provider model (PROV-V1) | `verify-model-provider-gate.mjs` | **GAGAL** — `ditawarkan: []`, seharusnya `[gemini, openai, custom]` |
| Pemilih model & menu agent | `cek-pemilih-model.mjs`, `uji-copilot-menu.mjs` | MERAH (baris tak cocok placeholder; label tab/„Run") |
| Language server (pasang/centang/nota) | `verify-lsp-centang.mjs`, `verify-lsp-terax.mjs`, `verify-lsp-mati-nota.mjs` | **GAGAL** — server terpasang 0, saklar `lsp-global` tidak ada di halaman LSP |
| Voice: mesin suara + tombol baca | `verify-voice.mjs` | **GAGAL** (`suara=0`) |
| Ikon agent hidup (naga/7 sub-agent) | `verify-ikon-agent.mjs` | MERAH, kode 13 — katalog gagal impor dinamis |
| Tumpukan/lipatan langkah panjang | `uji-stack-layout.mjs`, `uji-stack-beban.mjs` | **GAGAL** — *tumpukan terpasang=false*, `tumpukan terukur: undefined` |
| Panel todo hidup (buat/ubah tugas) | `uji-todo-update.mjs`, `uji-todo-panel-live.mjs` | **GALAT `Cannot read properties of undefined (reading 'jalan')`** / BUTUH APP |
| Customize Layout (T3.5) | `uji-t3-5.mjs` | **MENGGANTUNG** — awal LULUS lalu berhenti mencetak |
| Jembatan/command yang tadinya mati (API Client, SQL Explorer, Credentials) | `verify-command-hidup.mjs`, `verify-commands.mjs` | **GAGAL** `credentials_list [(tidak dicoba)]`; galat di skrip |
| Snippet live & ikon live | `uji-snippet-live.mjs`, `uji-ikon-live.mjs` | MERAH (kode 2 / 1) |
| Plugin: aktivasi setelah pasang | `uji-plugin.mjs` | **GAGAL P2** — `daftar=true enabled=false` |

### 7.3 TIDAK BISA DINILAI sama sekali (perlu app hidup)

**%d skrip (BUTUH-APP) + 13 MENGGANTUNG.** Ini termasuk hampir semua item UI/live di backlog: panel AI, dropdown sesi, animasi thinking, panel Tools, Customize Layout, ekstensi, keymap, provider, terminal, MCP, dan seluruh keluarga `uji-*-live`/`cek-*-live`. Selama `CDP :9223` tidak dinyalakan, **klaim "sudah beres" untuk item-item ini tidak punya bukti apa pun** — bukan berarti salah, tapi tidak terverifikasi oleh alat ini.

> Catatan penting: repo menyebut dirinya memiliki jalur verifikasi mandiri di `docs/ALUR-VERIFIKASI-MANDIRI.md`. Alat ini **bukan pengganti** alur itu — alat ini mengukur *apakah skrip-skripnya sendiri jujur*, dan hasilnya: 46% tidak bisa memberi verdict tanpa app.

---

## 8. Cara mengulang pengukuran ini

```bash
cd D:/Zephyr
node scripts/uji-kesehatan-semua.mjs                 # semua skrip, cap 120 dtk masing-masing
UJI_KESEHATAN_CAP_MS=45000 node scripts/uji-kesehatan-semua.mjs
UJI_KESEHATAN_SAJA=uji-t3-5.mjs,verify22.mjs node scripts/uji-kesehatan-semua.mjs   # uji ulang beberapa berkas
```

Env yang didukung: `UJI_KESEHATAN_CAP_MS` (batas waktu per skrip, default 120000), `UJI_KESEHATAN_JSON` (berkas hasil), `UJI_KESEHATAN_MULAI`/`UJI_KESEHATAN_BATAS` (potongan), `UJI_KESEHATAN_GABUNG` (gabungkan berkas JSON), `UJI_KESEHATAN_SAJA` (daftar berkas), `UJI_KESEHATAN_ULANG` (ulang spawn, default 4).

Pelapor **selalu keluar 0** — dia pelapor, bukan gerbang. Yang menentukan lulus/gagal adalah kolom Status di tabelnya.

### Saran urutan kerja berikutnya (dari bukti, bukan dari klaim)

1. **Nyalakan app sekali** (CDP :9223) lalu jalankan ulang pelapor → 12 skrip BUTUH-APP langsung berubah jadi verdict nyata. Itu satu-satunya cara menutup 90% populasi.
2. **Perbaiki 4 skrip yang memakai `lib-cdp` tanpa penanganan galat** (`cek-event-load`, `cek-v13-08`, `cek-v7-sim`, `uji-subset-alat`) — sekarang mereka melaporkan "RUSAK" padahal penyebabnya app mati.
3. **Beri batas waktu di 13 skrip yang menggantung** (terutama `verify22/23/25/26.mjs` yang bisu) supaya tidak menyandera pipeline.
4. **Inspeksi 5 skrip "MERAH semu"** (§6) dan `cek-bridge.mjs` — bug ada di skripnya, bukan produk.
5. **Temuan tanpa app yang layak dipercaya:** `verify-archive` (keluaran 18300→0 char), `uji-prompt-subagent2`, `cek-aturan-operasional`, `cek-narasi-id`, `cek-bundel-docs`. Ini bisa dan harus diperiksa sekarang tanpa menyalakan app.

_Dibuat 2026-10-14 oleh item `ZEPH-VERIFIKASI-SISA-2`. Hanya berkas baru yang dibuat: `scripts/uji-kesehatan-semua.mjs` dan dokumen ini. Tidak ada kode produk yang diubah._