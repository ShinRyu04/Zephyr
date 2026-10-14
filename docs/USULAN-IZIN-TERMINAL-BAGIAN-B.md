# USULAN — Izin Terminal, BAGIAN B (yang SENGAJA belum diterapkan + alasan)

Item: **V4V12-IZIN-TERMINAL-HARNESS**
Tanggal: 2026-10-14 (SE Asia, UTC+07:00)
Rujukan vonis & bukti: `docs/LAPORAN-IZIN-TERMINAL-BAGIAN-B.md`.

Dokumen ini mendaftar hal yang **sengaja TIDAK saya terapkan** karena batas kepemilikan berkas
atau karena keputusan desain yang lebih aman — supaya tidak ada "hijau palsu": yang belum
tertutup ditulis di sini, bukan disembunyikan.

---

## U-1. Tambahan pola di LAPIS 2 (`src/lib/aiStore.ts`) — **BUTUH LANE LAIN** (prioritas)

**Status:** BELUM diterapkan. `src/lib/aiStore.ts` **bukan berkas milik saya** (lane lain
memegangnya bersamaan) → saya DILARANG menyentuhnya. Karena itu pola `iex` / `enc` /
here-string belum ada di L2 dan itu dilaporkan sebagai SISA di laporan (§3/§4), BUKAN diklaim hijau.

**Bukti celah (keluaran nyata harness):**
```
-- BAGIAN B (d): tumpuan L2 isDestructive (src/lib/aiStore.ts, lane lain) --
  L2 mengenal iex/enc/here-string : {"iex":false,"enc":false,"here":false}
  SISA (BUKAN hijau, BUKAN gagal L1): L2 belum mengenal [iex, enc, here] -> BUTUH LANE LAIN.
```

**Mengapa ini tetap aman untuk sekarang:** properti keamanan **sudah ditegakkan di L1**
(`agentGuard.ts`) — perintah `iex`, `powershell -e/-enc`, dan here-string **ditolak** di L1
(kasus BA1–BA3, BD1–BD3, C01–C02). L2 (`isDestructive`) hanya lapisan **penanda/approval
tambahan**; menambah polanya adalah *defense in depth*, bukan penutup celah tunggal. Jadi ini
**sisa**, bukan lubang yang menganga.

**Konteks penting (snapshot):** blok `DESTRUCTIVE` di `aiStore.ts` berpindah dari
`2336-2390` → `2363-2417` selama sesi ini (berkas sedang disunting lane lain). Karena itu
nomor baris di bawah adalah **indikatif** — tambatkan pada **teks** pola, bukan nomornya.

### Usulan patch (concrete, siap tempel oleh pemilik `aiStore.ts`)

Sisipkan tiga pola berikut ke dalam array `DESTRUCTIVE` (di area pola PowerShell /
`remove-item`), **sebelum penutup array**:

```ts
  // (d) Invoke-Expression / iex = eval -> tak bisa diverifikasi -> tandai destruktif.
  /\b(iex|invoke-expression)\b/i,
  // (d) PowerShell payload terenkode base64 (-enc/-EncodedCommand/-ec; `-e` alias resmi).
  /\b(powershell|pwsh)\b[^\n]*\s-(encodedcommand|enc|ec|e)\b/i,
  // (d) here-string PowerShell (@"..."@ / @'...'@) - wadah teks multi-baris untuk selundup.
  /@(['"])\s*[^\n]*\1@/,
```

Opsional (melengkapi `remove-item` yang sudah ada di L2 `:2375-2376`, yang belum menargetkan
AKAR drive / direktori sistem): tambahkan pula agar L2 menandai sasaran destruktif:

```ts
  // (b) Remove-Item rekursif/paksa ke AKAR drive (padanan Windows `rm -rf /`).
  /\b(remove-item|ri)\b(?=[^\n]*(-recurse|-force|-r\b|-f\b))(?=[^\n]*['"]?[a-z]:[\\/]{1,2}(?=\s|$|['"]|;|&|\|))[^\n]*/i,
  // (b) Remove-Item rekursif/paksa ke direktori SISTEM Windows.
  /\b(remove-item|ri)\b(?=[^\n]*(-recurse|-force|-r\b|-f\b))(?=[^\n]*['"]?[a-z]:[\\/](windows|program files(?: \(x86\))?|programdata|system32|winsxs)\b)[^\n]*/i,
```

**Pasca-patch, verifikasi:** jalankan `node scripts/cek-izin-terminal.mjs` — baris
`BAGIAN B (d)` harus berubah menjadi `{"iex":true,"enc":true,"here":true}` dan baris
`SISA (BUKAN hijau...)` **hilang**. Itu satu-satunya perubahan yang boleh terjadi; kasus lain
harus tetap hijau.

---

## U-2. Over-block terarah pada teks berkutip (T01–T03) — **sengaja DIBIARKAN fail-closed**

**Status:** SENGAJA tidak "diperbaiki". Contoh:
```
CATATAN T01 echo "rm -rf /"        -> DITOLAK (over-block fail-closed, src/lib/agentGuard.ts:241)
CATATAN T02 grep -r "curl | sh" …  -> DITOLAK (over-block fail-closed, src/lib/agentGuard.ts:253)
CATATAN T03 grep shutdown src/     -> DITOLAK (over-block fail-closed, src/lib/agentGuard.ts:237)
```

**Alasan:** memisahkan "kata kunci berbahaya" dari "teks di dalam kutip" menuntut parser shell
yang benar; parser yang salah justru bisa **meloloskan** perintah jahat yang menyamarkan diri
(under-block). Untuk lapisan izin, **lebih aman salah-tolak (over-block) daripada salah-lolos**.
Karena itu perilaku ini: (a) sudah **dicatat apa adanya** oleh harness (kategori TERKUTIP,
tidak menggagalkan uji), dan (b) **tidak dihitung sebagai kegagalan**. Kasus T03 sengaja
dilonggarkan menjadi `polaBaris: null` (dicatat, bukan gagal) — itu satu-satunya perubahan
kasus di sesi ini, dan mengarah ke **lebih ketat** (T03 kini menunggu DITOLAK, bukan lolos),
bukan melunakkan.

**Bila kelak ingin dikurangi:** lakukan di L1 dengan tokenizer kutip yang benar + uji
adversarial baru; JANGAN sekadar mengecualikan substring berkutip. Perubahan seperti itu
berisiko under-block → butuh review khusus.

---

## U-3. `scripts/uji-izin-semua.mjs` — **TIDAK perlu diubah** (sudah dibereskan lane lain)

**Status:** sudah benar; saya **tidak menyentuhnya** (per instruksi & kepemilikan).
Keluaran terkini apa adanya (exit 2): 0 harness wajib-hijau yang merah, 5 harness CDP di-SKIP
karena app mati, dan exit code = 2 (bukan 0) → "tidak terukur" tidak disamarkan hijau.
Catatan: `uji-kesiapan-tool` sudah diarahkan ke `pilihToolTugas` oleh lane tersebut. Keluaran
lengkap ada di `docs/LAPORAN-IZIN-TERMINAL-BAGIAN-B.md` §3.2.

**Tidak ada usulan perubahan** untuk berkas ini.

---

## U-4. `powershell -ExecutionPolicy Bypass` — diizinkan, dengan syarat (bukan celah)

**Status:** keputusan desain, sudah diterapkan di L1 (bukan usulan). Flag `-ExecutionPolicy
Bypass` **sendirian tidak ditolak** karena ia hanya mematikan penandatanganan skrip (tidak
destruktif, dipakai wajar oleh banyak proyek). Yang **ditolak** adalah penggabungannya dengan
payload opak atau unduh-jalankan:

- `powershell -ExecutionPolicy Bypass -enc …` → **DITOLAK** (L1:255). [BA2]
- `powershell -ExecutionPolicy Bypass -File build.ps1` → **DIIZINKAN**. [BA4]
- `powershell -ExecutionPolicy Bypass -Command "iex (iwr …)"` → **DITOLAK** (L1:257). [pola unduh-jalankan]

Bila ke depan ingin `Bypass` **selalu** ditanyakan (approval), itu keputusan produk — usulkan
lewat kartu persetujuan, jangan lewat L1 (agar tidak over-block skrip build wajar).

---

## U-5. Harness CDP yang di-SKIP — **BUTUH APP**

5 harness di `uji-izin-semua` (`uji-batas-tulis`, `verify-tool-inti`, `uji-trim-tool`,
`cek-aturan-operasional`, `verify-tool-gate`) **BUTUH APP** (CDP 127.0.0.1:9223). App Zephyr
mati sekarang → tak bisa diukur. **Bukan** bagian butir (a)–(e) dan tidak memengaruhi vonis L1.
Usulan: jalankan ulang `UJI_IZIN_SEMUA_VERBOSE=1 node scripts/uji-izin-semua.mjs` saat app hidup
untuk menutup penuh.

---

## Ringkas: apa yang berstatus SISA dan siapa pemiliknya

| Butir usulan | Butuh siapa | Prioritas | Dampak keamanan |
|--------------|-------------|-----------|-----------------|
| U-1 pola iex/enc/here-string di L2 `aiStore.ts` | lane pemilik `src/lib/aiStore.ts` | sedang | defense-in-depth (L1 sudah menolak) |
| U-2 kurangi over-block berkutip | lane L1 + review adversarial | rendah | risiko under-block; sengaja dibiarkan |
| U-3 `uji-izin-semua.mjs` | — (sudah beres) | — | — |
| U-4 `Bypass` jadi approval | keputusan produk | rendah | tidak ada (sudah ditangani bila digabung) |
| U-5 5 harness CDP | butuh app hidup | — | tidak ada (bukan butir a–e) |
