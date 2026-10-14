# LAPORAN — ZEPH-BACA-KODE-SAMBUNG (tool `zephyr_kode` tersambung ke jalur NYATA)

> Item: **ZEPH-BACA-KODE-SAMBUNG**. Tanggal: 2026-10-14. Cabang: `feat/ai-panel-vscode-layout` (`D:\Zephyr`).
> Rencana yang diikuti: `docs/USULAN-JANGKAUAN-TOOL.md` (U-JT1..U-JT6).
> Bukti utama: `scripts/uji-baca-kode-sambung.mjs` (berkas BARU milik item ini) — **52/52 lulus, exit 0**.
> App **MATI** selama seluruh pengerjaan (tidak ada CDP, tidak ada `zephyr` berjalan): semua uji di bawah
> node murni + bundel esbuild dari `src/lib/**` ASLI, jadi hasilnya bisa diulang siapa pun tanpa app.

---

## 1. VONIS

| # | Pertanyaan | Vonis |
|---|---|---|
| 1 | `zephyr_kode` ADA di katalog + registry `AGENT_TOOLS` + skema + eksekutor nyata | **TERBUKTI** |
| 2 | `zephyr_kode` IKUT DIKIRIM di subset nyata (`pilihToolTugas`) untuk tugas baca kode, cap ≤20 | **TERBUKTI** (20 tool terkirim, cap 20) |
| 3 | Jembatan `pasangJembatanBacaKode` benar-benar TERPASANG + TERPANGGIL lewat rantai impor nyata | **TERBUKTI** (di jalur `jalankanAgentTool` → `pasangJembatanBacaKodeDariWorkspace` → `pasangJembatanBacaKode`) |
| 4 | Jawaban tool membaca BERKAS NYATA dari disk (bukan "belum tersambung") | **TERBUKTI** (isi baris identik byte-for-byte dengan disk) |
| 5 | Uji negatif: traversal/absolut/UNC/rahasia (`..`, `/etc`, `C:/…`, `.env`, `*.pem`, `*.key`, `id_rsa`, `.ssh`, `.git`) SEMUA ditolak | **TERBUKTI** (15/15 ditolak + nol sentuhan disk) |
| 6 | Potongan keluaran terbatas dengan ANGKA yang disebut | **TERBUKTI** (120 baris / 6 000 char / 400 char per baris / 524 288 B berkas / 1 berkas per panggilan / 12 bacaan sesi) |
| 7 | Nol jalur tulis; determinisme 2× identik | **TERBUKTI** |
| 8 | Proteksi symlink/junction yang menunjuk KELUAR repo | **BELUM** — pagar `realpath` jalan, tetapi yang dipasang adalah bentuk IDENTITAS karena backend belum punya perintah `fs_realpath` |
| 9 | Uji eksekutor di runtime Tauri yang HIDUP (invoke nyata, bukan stub), termasuk berkas nyata >512 KiB | **BUTUH APP** |

Tidak ada klaim di atas yang bertumpu pada grep saja: nomor 1–7 dijalankan sebagai kode.

---

## 2. PATCH NYATA (verbatim)

### 2.1 U-JT1 — `src/lib/zephyrTools/catalog.ts` (grup `Code intelligence`)

teks lama:
```ts
  ['lsp_call_hierarchy', 'Code intelligence', 'read', false, 'Fungsi yang memanggil dan dipanggil oleh sebuah simbol, menurut language server'],
```

teks baru (berkas sekarang, baris 139 — **persis** teks usulan U-JT1):
```ts
  ['lsp_call_hierarchy', 'Code intelligence', 'read', false, 'Fungsi yang memanggil dan dipanggil oleh sebuah simbol, menurut language server'],
  ['zephyr_kode', 'Code intelligence', 'read', false, 'Potongan baris BERKODE NOMOR dari sumber Zephyr sendiri (baca-kode): satu berkas, satu rentang baris, atau simbol'],
```

Ditambah blok komentar alasan di katalog (baris 127–133: *"`zephyr_kode` joined this group last … unreachable spec, no catalog entry"*).
`TOOL_COUNTS` tidak disentuh (dihitung otomatis). `effect:'read'` / `needsApproval:false` sesuai U-JT1.
Konsekuensi angka: `TOOL_CATALOG` 67 → 68 (terlihat di kepala harness: `katalog: 68 tool`).

### 2.2 U-JT2 — `src/lib/agentTools.ts` (registry eksekutor)

teks lama:
```ts
import { TOOL_WEB } from './zephyrTools/web';
```
teks baru:
```ts
import { TOOL_WEB } from './zephyrTools/web';
import { TOOL_BACA_KODE, pasangJembatanBacaKode, jembatanBacaKode } from './bacaKode';
```

teks lama (array):
```ts
  TOOL_INGAT,
  ...TOOL_MCP,
  ...TOOL_WEB,
];
```
teks baru (berkas sekarang):
```ts
  TOOL_INGAT,
  /* ...komentar: spec hanya hidup di bacaKode.ts; `run`-nya yang ASLI... */
  TOOL_BACA_KODE,
  ...TOOL_MCP,
  ...TOOL_WEB,
];
```

**U-JT5 dipatuhi:** tidak ada skema kedua — registry memakai objek yang SAMA. Dibuktikan runtime:

```
✓ SPESIFIKASI yang dipakai registry = SPEC_BACA_KODE (satu skema, bukan kembar)
✓ EKSEKUTOR nyata: run zephyr_kode === jalankanBacaKode (bukan fungsi kosong)
```

### 2.3 U-JT3 — `src/lib/subsetTugas.ts` (jalur kirim nyata, cap ≤20)

a) keluarga (baris 145–150, dengan komentar alasan):
```ts
  lsp_call_hierarchy: ['navigasi-kode'],
  /* Dibaca-kode Zephyr SENDIRI, satu keluarga dengan `lsp_*` … */
  zephyr_kode: ['navigasi-kode'],
```

b) rumah (baris 407):
```ts
  'navigasi-kode': ['lsp_definition', 'lsp_symbols', 'lsp_references', 'lsp_diagnostics', 'zephyr_kode'],
```

c) `tambahanKelas` (baris 481–492) — ditempatkan **sebelum** `lsp_diagnostics` supaya kalau jatah habis,
yang tergusur `lsp_diagnostics` (keluarga tetap terjangkau lewat `zephyr_kode`), bukan `calculator`:
```ts
  if (kelas.includes('baca')) {
    push('list_directory');
    push('bash_logs');
    /* …komentar alasan posisi… */
    push('zephyr_kode');
    push('lsp_diagnostics');
    push('calculator');
  }
```

**Cap dijaga** (tidak melewati 20; lihat keluaran `cek-subset-tugas.mjs` di §3.3):
```
✓ pilihToolTugas() MENYERTAKAN zephyr_kode untuk tugas membaca kode (20 tool terkirim, cap 20)
✓ cap DIHORMATI: 20 <= 20
✓ tool inti tidak tersingkir oleh zephyr_kode (read_file/think/tool_call tetap ada)
✓ jejakPemilihan() mencatat zephyr_kode sebagai "tambahan kelas" (asal-usul terlihat)
```

### 2.4 U-JT4 — jembatan: **MENYIMPANG dari rencana, sengaja dan terbuka**

Usulan U-JT4 menaruh pemasangan di `src/lib/aiStore.ts` (jalur buka folder). **Berkas itu DILARANG disentuh
item ini** (lane lain memegangnya). Penggantinya: pemasangan LAZY di `src/lib/agentTools.ts` (berkas milik item ini),
tepat sebelum tool dijalankan — efeknya sama, dan justru menutup semua jalur panggil (`tool_call`,
`jalankanAgentTool`, subagen), bukan hanya jalur buka folder:

```ts
  try {
    /* Satu tempat pemasangan jembatan baca-kode, tepat sebelum tool berjalan:
       hanya untuk `zephyr_kode`, dan hanya kalau ada folder terbuka. */
    if (targetName === 'zephyr_kode') pasangJembatanBacaKodeDariWorkspace();
    return await tool.run(args);
```

```ts
let _jembatanKodeAkar: string | null = null;

/** Pasang jembatan baca-kode dari workspace yang SEDANG terbuka.
 *  Balik `true` kalau jembatan (baru) dipasang. */
export function pasangJembatanBacaKodeDariWorkspace(): boolean {
  const akar = useStore.getState().workspace;
  if (!akar) return false;
  if (_jembatanKodeAkar === akar && jembatanBacaKode()) return false;
  pasangJembatanBacaKode({
    akar,
    cmd: {
      fsRead: async (p) => {
        const isi: unknown = await fsRead(p, 'utf8');
        /* backend bisa mengembalikan string ATAU `ReadResult` (idiom agentLsp.ts/testsStore.ts) */
        const teks = typeof isi === 'string' ? isi : ((isi as { content?: string })?.content ?? '');
        return { content: teks };
      },
      fsStat: async (p) => { const s = await fsStat(p); return { size: Number(s?.size ?? 0), isDir: !!s?.isDir }; },
      realpath: async (p) => p,
    },
  });
  _jembatanKodeAkar = akar;
  return true;
}
```

Sifat yang dipilih dan alasannya: (1) **idempoten per akar** — workspace berganti ⇒ dipasang ulang, workspace
sama ⇒ tidak dipasang dua kali; (2) **tanpa langganan store** — tidak ada listener yang bisa berlipat saat HMR;
(3) **tanpa menebak akar** — `workspace` kosong ⇒ `false`, dan tool menjawab jujur "belum tersambung".

---

## 3. KELUARAN NYATA (apa adanya)

### 3.1 `node scripts/uji-baca-kode-sambung.mjs` → 52/52 lulus, exit 0

```
== SAMBUNGAN BACA-KODE (node murni, offline, tanpa app) ==
katalog: 68 tool | AGENT_TOOLS: 68 | BATAS_TOOL_TUGAS=20

-- A. KATALOG + REGISTRY + SKEMA + EKSEKUTOR (runtime modul asli)
  ✓ zephyr_kode ADA di katalog (TOOL_NAMES runtime)
  ✓ zephyr_kode ADA di registry AGENT_TOOLS (bisa di-resolve)
  ✓ TIDAK ADA tool kembar: tepat SATU entri zephyr_kode di katalog & registry
  ✓ SKEMA argumen lengkap (berkas/dari/sampai/simbol, required=[berkas])
  ✓ SPESIFIKASI yang dipakai registry = SPEC_BACA_KODE (satu skema, bukan kembar)
  ✓ EKSEKUTOR nyata: run zephyr_kode === jalankanBacaKode (bukan fungsi kosong)

-- B. SUBSET KIRIM (jalur NYATA: pilihToolTugas, cap <= 20)
  info: terkirim tugas "baca kode" = 20 tool -> read_file,write_file,grep,glob,bash_run,todo_write,think,ask_user,tool_search,tool_call,bash_background,zephyr_self,skill_view,lsp_definition,run_subagent,edit,delete_file,list_directory,bash_logs,zephyr_kode
  info: terkirim tugas "tes+commit" = 20 tool
  ✓ pilihToolTugas() MENYERTAKAN zephyr_kode untuk tugas membaca kode (20 tool terkirim, cap 20)
  ✓ cap DIHORMATI: 20 <= 20
  ✓ tool inti tidak tersingkir oleh zephyr_kode (read_file/think/tool_call tetap ada)
  ✓ rumah keluarga navigasi-kode: zephyr_kode terdaftar sebagai rumah (cadangan terjangkau)
  ✓ jejakPemilihan() mencatat zephyr_kode sebagai "tambahan kelas" (asal-usul terlihat)

-- C. JEMBATAN: terpasang + terpanggil + membaca DISK NYATA
  ✓ sebelum ada pemanggilan: jembatan BELUM terpasang (bukan dipasang diam-diam saat impor)
  ✓ tanpa workspace: tidak ada folder terbuka => jembatan TIDAK dipasang (tidak menebak akar)
  ✓ RANTAI NYATA: jalankanAgentTool(zephyr_kode) MEMASANG jembatan (sebelum: null, sesudah: terpasang)
  ✓ jawaban menjawab dari DISK nyata: memuat BERKAS + RENTANG BARIS (bukan "belum tersambung")
  ✓ tiap baris jawaban bernomor + isinya IDENTIK dengan berkas di disk
  ✓ disk benar-benar dibaca lewat jembatan aplikasi (fs_read nyata dipanggil)
  ✓ mode `simbol` juga jalan di jalur nyata: menyebut nama simbol + baris definisinya
  ✓ SETIAP jawaban menyebut berkas + baris (kepala [baca_kode] + baris bernomor)
  ✓ tanpa folder terbuka (workspace null): jawaban jujur "belum tersambung", nol bacaan disk

-- D. UJI NEGATIF BACA (gerbang `bolehDibacaKode` + jalur nyata)
  ✓ TOLAK traversal ../ -> "../etc/passwd"
  ✓ TOLAK traversal bersarang -> "src/../../rahasia.ts"
  ✓ TOLAK absolut POSIX -> "/etc/hosts"
  ✓ TOLAK absolut Windows -> "C:/Windows/win.ini"
  ✓ TOLAK berkas di LUAR akar repo (home user) -> "C:/Users/Zyrex/.ssh/id_rsa"
  ✓ TOLAK UNC -> "\\\\srv\\share\\a.ts"
  ✓ TOLAK berkas rahasia .env -> ".env"
  ✓ TOLAK berkas rahasia .env.* -> "config/.env.local"
  ✓ TOLAK kunci *.pem -> "server.pem"
  ✓ TOLAK kunci *.key -> "tls.key"
  ✓ TOLAK kunci privat id_rsa -> "id_rsa"
  ✓ TOLAK folder .ssh -> ".ssh/id_rsa"
  ✓ TOLAK folder .git -> ".git/config"
  ✓ TOLAK byte kontrol -> "src/lib/a\u0001b.ts"
  ✓ TOLAK daftar berkas (2 berkas/panggilan) -> ["src/lib/a.ts","src/lib/b.ts"]
  ✓ KONTROL: berkas kode sah di dalam repo DIIZINKAN
  ✓ ditolak SEBELUM jembatan disentuh (jejak KOSONG, 0 sentuhan disk)
  ✓ TOLAK berkas yang realpath-nya KELUAR akar repo (pagar symlink)
  ✓ jalur NYATA menolak traversal: jawaban diawali "ditolak:" (bukan isi berkas)

-- E. KELUARAN DIPOTONG — ANGKANYA disebut
  ✓ batas BARIS: minta 300 baris -> dikirim 120 baris (sebabPotong=batas-baris)
  ✓ batas KARAKTER/BARIS: baris 520 char dipangkas ke ~400 + dilaporkan
  ✓ batas ANGGARAN KARAKTER: potongan dijaga ~6000 char (sebabPotong=batas-karakter)
  ✓ batas UKURAN BERKAS: 524288 B (512 KiB) ditolak dengan angkanya
  ✓ ANGGARAN SESI: pembacaan ke-13 ditolak dengan angka batasnya
  ✓ batas BERKAS/PANGGILAN = 1 (daftar berkas ditolak, bukan diproses sebagian)

-- F. NOL JALUR TULIS
  ✓ jembatan hanya menyentuh fsRead/fsStat/realpath (Proxy mencatat SEMUA akses properti)
  ✓ bacaKode.ts tidak memanggil API tulis/shell apa pun
  ✓ permukaan tool = {spec, run} saja (tidak ada kanal tulis yang bocor ke model)
  ✓ jembatan aplikasi hanya boleh {akar, cmd:{fsRead,fsStat,realpath}} (diperiksa bacaKode)

-- G. DETERMINISME (2 jalan identik)
  ✓ jawaban tool identik dua kali (byte-for-byte)
  ✓ pilihToolTugas() identik dua kali
  ✓ gerbang jalur deterministik

== 52/52 lulus ==
SEMUA LULUS.
```

Contoh jawaban nyata (dibaca dari disk oleh jembatan aplikasi, lewat rantai `jalankanAgentTool`):

```
[baca_kode v1] src/lib/bacaKode.ts:1-5 (5 dari 746 baris; 30.157 B; tag 46843e2c)
001| /*
002|  * bacaKode - Zeph membaca ISI kode ZEPHYR SENDIRI sebagai POTONGAN BARIS.
003|  *
```
(dibandingkan langsung dengan `fs.readFileSync('src/lib/bacaKode.ts')` → 5 baris cocok **persis**, termasuk spasi awal)

Jalur nyata yang ditolak (traversal):
```
ditolak: ...
```

### 3.2 Sisa uji wajib

```
$ node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr
(0 baris keluaran)
TSC_EXIT=0
```
```
$ node scripts/cek-cap-payload.mjs
  OK    screenshot + tool output dipotong  [2701517 -> 39870]
  OK    cap khusus dihormati  [29557]
  OK    giliran terakhir raksasa dipotong sampai cap  [200276 -> 39871]
  OK    identitas tool giliran terakhir dipertahankan  [tool/e0/read_file]
  ...
== 18/18 lulus ==
```
```
$ node scripts/inventaris-tool.mjs
- mcp:status (1): zephyr_self
- web:buka (1): system_browser_open
## PERINGATAN: nama dengan >1 blok handler
- zephyr_self: src/lib/zephyrTools/builtins.ts:2254 , src/lib/zephyrTools/zephyrSelf.ts:492
   → TIDAK terkait item ini (nama `zephyr_kode` tidak muncul di daftar peringatan)
$ node scripts/deteksi-duplikat-tool.mjs
  nama tool  : 68 -> 54  (nama boleh turun)
  kapabilitas: 47 -> 47
  kapabilitas yang BISA HILANG: 0 (WAJIB 0)
  verdict    : AMAN (superset)
   → 3 temuan MERAH tercatat SEBELUM patch ini dan di luar jangkauannya:
     mcp__zephyr__extension, mcp__zephyr__wait_for_terminal, mcp__zephyr__worktree (src/lib/zephyrTools/mcp.ts)
```

### 3.3 `scripts/cek-subset-tugas.mjs` (jalur subset lama, 12 kelas tugas)

```
kelas tugas               lama  kirim <=20  nama_superset pangkas tambah status
baca [baca]               17    17    ya    tidak (tambah)1       1      LULUS
perbaiki+uji [...]        23    20    ya    ya            3       0      LULUS
...
MAKS tool per giliran sesudah pemangkasan: 20 (target <= 20)
kemampuan hilang di semua kasus: 0
HASIL: LULUS - semua kasus <= 20 tool dan superset kemampuan
```
(Perhatikan: harness ini mengukur jalur LAMA `jatahTool`; `baca` turun 17→17 dengan `tambah 1`,
sedangkan jalur kirim sesungguhnya `pilihToolTugas` diukur di §3.1 dan hasilnya 20 tool termasuk `zephyr_kode`.)

### 3.4 Harness lane lain: `scripts/uji-jangkauan-tool.mjs` — TIDAK disentuh

Dijalankan (read-only) pada 2026-10-14 setelah patch:

```
katalog: 68 tool | BATAS_TOOL_TUGAS=20
  ✓ bolehDibacaKode() deterministik
  ✓ katalog stabil antar-baca (TOOL_NAMES.length tetap)
== RINGKASAN: 95/95 LULUS, 0 GAGAL ==
SEMUA LULUS.
EXIT=0
```

Catatan penting: dokumen usulan memperkirakan **4 kasus di harness itu masih mengunci keadaan lama**
("`zephyr_kode` TIDAK ADA di katalog" dll.) dan harus di-balik. Saat dijalankan sekarang harness itu sudah
**95/95 LULUS** — pemiliknya sudah membalik/mengganti asersi itu (salah satunya memakai `bolehDibacaKode()`).
Jadi **tidak ada pekerjaan pembalikan yang tersisa** untuk agen induk; angkanya pun sudah ikut berubah
(`katalog: 68 tool`). Berkas itu tidak saya sunting sama sekali.

---

## 4. HAL YANG GAGAL / TIDAK TERBUKTI

1. **Symlink bukan proteksi nyata (BELUM).** `realpath` yang dipasang masih identitas (`async (p) => p`).
   Harness membuktikan PAGAR-nya hidup (uji "realpath menunjuk KELUAR akar → ditolak"), tetapi pada app
   nyata nilai itu akan selalu = masukan, sehingga symlink/junction yang menunjuk keluar repo **tetap lolos**
   pagar baru ini. Sisa ada di `docs/USULAN-BACA-KODE-SAMBUNG.md` §1 dan pengujiannya **BUTUH APP**.
2. **Runtime Tauri yang hidup belum diuji.** Semua bukti memakai bundel `src/lib/**` + stub `invoke` yang membaca
   disk sungguhan. Yang belum pernah dijalankan: `fs_read`/`fs_stat` lewat IPC Tauri asli di dalam app, dan
   berkas nyata >512 KiB dari dialog nyata. **BUTUH APP.**
3. **Galat tipe lama `BATAS_BERKAS_PER_PANGGILAN`**: tidak ada lagi. Konstanta itu **terdefinisi** di
   `bacaKode.ts:91` (bersama `BATAS_BARIS_POTONGAN=120`, `BATAS_BYTE_BERKAS=512*1024`, `BATAS_KARAKTER_BARIS=400`,
   `BATAS_CHAR_POTONGAN=6000`, `BATAS_BACAAN_SESI=12`), dan `tsc` keluar **0 galat**. Tidak ada bedah darurat
   yang perlu dilakukan di berkas itu.
4. **Angka hardcode dokumen** — `docs/plan-kerja.md` menulis "66 tool" **sudah dikoreksi** (2026-10-14,
   item `angka-dokumen-tool-68` → 68 tool / 26 dikirim; bukti di `docs/LAPORAN-ANGKA-DOKUMEN-TOOL.md`).
   Yang **masih** tertinggal adalah **keluaran generator**: `src/lib/zephyrDokumenData.ts` (embed dokumen)
   dan `src/lib/zephyrFakta.ts` / `src/lib/zephyrIndeks.ts`. Ketiganya **dilarang** disunting tangan —
   regenerasi lewat pipeline `scripts/gen-fakta-zephyr.mjs`; baris persisnya dicatat di
   `docs/LAPORAN-ANGKA-DOKUMEN-TOOL.md` § sisa.
5. `scripts/uji-kesiapan-tool.mjs` **tidak** dipakai sebagai gerbang: ia mengukur jalur lama `subsetAlat.alatUntukTugas`
   (tanpa cap), bukan `pilihToolTugas`. Sesuai catatan §Dampak regresi dokumen usulan.

---

## 5. Berkas

**Diubah (milik item ini):**
- `src/lib/zephyrTools/catalog.ts` — U-JT1
- `src/lib/agentTools.ts` — U-JT2 + U-JT4 (call-site + `pasangJembatanBacaKodeDariWorkspace`)
- `src/lib/subsetTugas.ts` — U-JT3a/b/c
- `src/lib/bacaKode.ts` — tidak perlu diubah untuk sambungan ini (spec/eksekutor/batas sudah lengkap & lolos tsc)

**Baru:**
- `scripts/uji-baca-kode-sambung.mjs` — harness bukti (52 kasus)
- `docs/LAPORAN-BACA-KODE-SAMBUNG.md` — dokumen ini
- `docs/USULAN-BACA-KODE-SAMBUNG.md` — sisa yang belum bisa diterapkan

**Tidak disentuh (aturan keras dihormati):** `src/lib/zephyrTools/web.ts`, `src/lib/aiStore.ts`,
`src/lib/contextBudget.ts`, `src/lib/systemPrompt.ts`, `src/lib/agentGuard.ts`, `src/lib/zephyrCari.ts`,
`src/lib/zephyrSelf.ts`, `src/lib/zephyrIndeks.ts`, `src/lib/zephyrFakta.ts`, `src-tauri/**`,
`scripts/uji-jangkauan-tool.mjs`.
