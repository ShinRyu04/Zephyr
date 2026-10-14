# GHOST-175 — Seam penyedia saran inline (ghost text)

Status: **seam + harness + usulan sambungan selesai; penyambungan BELUM diterapkan.**
Lane item 175. Semua nomor baris di bawah hasil pembacaan berkas nyata (branch
`feat/ai-panel-vscode-layout`, diukur 2026-10-14 05:52 SEAST — bukan salinan dari SPIKE).
Catatan snapshot: `src/lib/ghostText.ts` stabil (mtime 2026-10-11, 409 baris, penanda di 18/174/208/242/399);
`src/components/editor/CodeMirrorEditor.tsx` **sedang disunting lane lain** (mtime hari ini), jadi nomor
barisnya snapshot — penanda `ghostText`/`extrasEditor` dipakai sebagai jangkar, bukan angkanya.

Berkas baru lane ini (hanya tiga, tidak ada berkas lain yang disentuh):

| Berkas | Isi |
| --- | --- |
| `src/lib/ghostPemasok.ts` | seam murni: tipe, tukar-jalan pemasok, `PEMASOK_LOKAL`, batas panjang/konteks, saring rahasia, jalur terima/tolak |
| `scripts/uji-ghost-pemasok.mjs` | harness 23 kasus, mengimpor modul asli via esbuild |
| `docs/GHOST-175.md` | dokumen ini |

---

## 1. Yang SUDAH ADA (berkas + baris nyata)

`src/lib/ghostText.ts` (409 baris) — fitur inti, semuanya sudah ter-wire:

- impor `@tauri-apps/api/event` (9), `./commands` (10), `./aiStore` (11), `./store` (12),
  `./modelCatalog` (13), `./types` (14), `./editorRegistry` (16)
- `KONTEKS_BARIS = 40` (18) · `setGhost` `StateEffect<string|null>` (20)
- `GhostWidget` (22-102) — widget `.cm-ghost` + strip hint "Accept [Tab]" / "Accept Word [Ctrl→]"
- `ghostField` (104-125) — **saran dibersihkan saat dokumen berubah** (119-121)
- `pastikanListener` (135-170) — listener `ai-chunk`, akumulasi stream jadi satu baris
- `lepasListenerGhost` (174-178) — **dilepas** (idempoten, `listenerSiap=false`)
- `tampilkan` (180) · `bersihkan` (185) · `buangGhost` (191) · `konteksSekitar` (197, 40 baris)
- `mintaSaran` (208-262) — **titik jaringan**: `cmd.aiChat` di **242**, `useAi`/`findModel` di 209-211
- `adaGhost` (264) · `terimaGhost` (269-287, Tab) · `terimaSatuKata` (298-323, Ctrl→)
- `ghostTextKeymap` (325-351): `Alt-\` (327), `Tab` (334), `Ctrl/Cmd-ArrowRight` (340), `Escape` (344)
- `JEDA_MS = 700` (363) · `pemicuOtomatis` (366-386) · `batalSaatBlur` (388-397)
- `ghostText(on)` (399-401) · `lepasGhost(view)` (403-409)

Ter-wire di editor — `src/components/editor/CodeMirrorEditor.tsx`:
- impor `ghostText, lepasGhost` (**106**); `out.push(...ghostText(e.ghostText))` (**140**)
- `dekorasiCopilot({ sorotBaris: e.gitGutter, usulanInline: e.ghostText })` (**158**)
- `lepasGhost(view)` dipanggil saat view dibongkar (**525**)
- efek reconfigure ekstra editor (**695-721**), daftar dep termasuk `editorSettings.ghostText` (**717**) —
  artinya **`extrasEditor(...)` dievaluasi ulang setiap toggle**, jadi `ghostText(on)` memang dipanggil
  lagi saat setelan berubah. Ini yang membuat perbaikan jalur mati/hidup bisa dikerjakan hanya di
  `ghostText.ts` (lihat §5, langkah 1, hunk 3).

Setelan: `src/lib/types.ts` — `ghostText: boolean` (**1114**), default **`false`** (**1592**);
toggle UI `src/components/settings/SectionsBasic.tsx` (**356-357**).

Infra uji: repo **tidak** punya runner (tanpa vitest/jest), tapi `esbuild` ada di `node_modules`
(bawaan vite) — itu yang dipakai harness ini.

---

## 2. Yang masih KURANG (terhadap kode hari ini)

1. **Tidak ada seam penyedia.** `mintaSaran` (208-262) memanggil `cmd.aiChat` langsung (242):
   tidak ada satu titik pun yang bisa ditukar, jadi saran tidak bisa datang dari sumber lokal dan
   fitur tidak bisa diuji tanpa kunci + model.
2. **`lepasListenerGhost` (174) diekspor tapi tidak dipanggil di mana pun** (komentar 130-132 dan
   172-173 mengakui ini). Saat fitur dimatikan, listener `ai-chunk` tetap terpasang dan memproses
   chunk ghost. → sekarang bisa diperbaiki lewat `ghostText(on)` (§5 hunk 3).
3. **Tidak ada jalur uji tanpa model** — konsekuensi (1). Sekarang ada: seam ini dieksekusi penuh
   di Node (`node scripts/uji-ghost-pemasok.mjs`, 23 kasus).
4. **Tidak ada saringan rahasia.** Saran yang mengulang konteks bisa membawa kunci API yang ada di
   berkas. Seam ini menutupnya (§4, `saringRahasia`); fakta pendukung: konfigurasi provider di
   renderer hanya `{ baseUrl?, model? }` (`src/lib/types.ts:1301`) dan `aiStore.keys` adalah
   `PublicModel[]` dari `cmd.getPublicModels()` (`src/lib/aiStore.ts:2543`, 3180) — yaitu **kunci
   mentah tidak ada di store renderer**, jadi hari ini lapis pola yang benar-benar bekerja (dan
   sudah diuji nyata di harness F1/F2).

Yang **tidak** perlu diutak-atik: pintasan terima/tolak (325-351), pembersihan saat mengetik
(119-121), debounce (363-386).

---

## 3. Bentuk seam (apa adanya, `src/lib/ghostPemasok.ts`)

```ts
type PemasokSaran = (p: PermintaanSaran) => SaranMentah | Promise<SaranMentah>;
interface PermintaanSaran { sebelum: string; bahasa: string; kunci: KunciKonteks }
interface KunciKonteks   { path?: string; indentasi?: string; rahasia?: readonly string[] }
type SaranMentah = string | { teks: string; dari?: number; sampai?: number; sebab?: string } | null;
interface UsulanInline   { teks: string; dari: number; sampai: number; sebab: string }
```

Fungsi:

| Fungsi | Guna |
| --- | --- |
| `ambilSaran(sebelum, bahasa, kunci?)` | jalur utama; `null` bila seam mati/pemasok kosong/gagal |
| `setPemasokSaran(fn \| null)` / `pemasokSaran()` | tukar-jalan; `null` → `PEMASOK_MATI` (default) |
| `setGhostAktif(on)` / `ghostAktif()` | jalur hidup/mati di level seam |
| `PEMASOK_LOKAL` | heuristik murni (tanpa jaringan): tutup pasangan → badan kata kunci → ulangi baris atas |
| `PEMASOK_MATI` | selalu `null` — default modul |
| `potongKonteks(s)` | ekor konteks: ≤ `BATAS_KONTEKS_BARIS` baris, ≤ `BATAS_KONTEKS_KARAKTER` char, selalu sufiks |
| `potongSaran(s)` / `saringRahasia(s, rahasia)` | batas panjang + saringan kunci |
| `keadaanAwal/pasangSaran/terimaSaran/tolakSaran` | keputusan **murni**: mengembalikan keadaan sesudahnya + teks sesudahnya |
| `aturUlangGhost()` | reset untuk uji/teardown |

Jaminan yang dipegang (dan diuji):

- **Nol jaringan** — modul ini **tanpa satu pun `import`**; tidak ada `fetch`, `XMLHttpRequest`,
  `@tauri-apps/*`, `./commands`, React, atau DOM (harness H1 membaca kode setelah komentar dibuang).
- **Deterministik** — tidak ada `Date.now()`/`Math.random()`/`new Date`/`performance.now` di kode
  (harness E4); input sama ⇒ keluaran sama byte demi byte (E2 3×, E3 2×).
- **Terbatas** — panjang saran ≤ `BATAS_PANJANG_SARAN = 120` char (`+dipotong` dicatat di `sebab`);
  konteks yang dibaca ≤ 4000 char / 40 baris. Terbukti: input 38.089 char / 200 baris dibaca
  3.819 char / 20 baris (harness C1).
- **Rentang** — `dari`/`sampai` adalah offset di teks **asli** sebelum kursor: offset pemasok
  (relatif konteks yang sudah dipotong) digeser balik dengan `sebelum.length - konteks.length`.
  Sisip di kursor = `dari === sampai === sebelum.length`; ganti sebagian kata diperbolehkan
  (`dari < sampai`, diuji H3).
- **Rahasia tidak bocor** — dua lapis: daftar eksplisit `kunci.rahasia` (dicocok apa adanya, tanpa
  regex) + pola kunci yang dikenal (`sk-…`, AWS `AKIA…`, `ghp_…`, `xox*`, `AIza…`, `Bearer …`,
  `-----BEGIN … PRIVATE KEY-----`, `apiKey/api_key/token/secret: "…"`) → diganti `***`.
- **Batas aman perilaku lama** — default modul **`PEMASOK_MATI`**: mengimpor `ghostPemasok.ts`
  tidak pernah diam-diam menghasilkan saran. Perilaku lama baru kembali bila
  `ghostText.ts` mendaftarkan `PEMASOK_JARINGAN`-nya sendiri (hunk 1, §5).
- **Pemasok gagal tidak menjatuhkan editor** — `throw`/`reject` → `null` (harness H2).

`PEMASOK_LOKAL` sengaja heuristik, bukan model: (1) tutup pasangan `{` → `"\n" + indent + "}"`,
`(` → `)`, `[` → `]`; (2) badan kata kunci `else|try|do|finally` → `" {"` (ts/js/java/go/rust `{…}`)
atau `":"` (py); (3) ulangi sufiks baris atas yang berawalan sama pada indentasi sama. Bahasa
dinormalkan dari `bahasa` atau, bila kosong, dari ekstensi `kunci.path` (`bahasaNormal`).

---

## 4. Bukti uji (keluaran nyata)

```
$ node scripts/uji-ghost-pemasok.mjs
LULUS A1  saran kosong -> null (PEMASOK_LOKAL, baris tanpa isi) - ''=null spasi=null pendek=null
LULUS A2  pemasok mengembalikan null/kosong/spasi -> null - 5/5 bentuk kosong ditolak
LULUS B1  saran panjang dipotong (hard cut, satu token tanpa spasi) - panjang=120 batas=120 sebab=pemasok+dipotong
LULUS B2  saran panjang dipotong di batas spasi, tanpa spasi menggantung - panjang=115 <= 120, ekor="ata16 kata17"
LULUS C1  konteks dibatasi (<=4000 char, <=40 baris) dan berupa ekor - input=38089 char / 200 baris -> dibaca 3819 char / 20 baris; rentang 34270-34271 (geser 34270 benar)
LULUS D1  mati -> tidak ada saran, pemasok TIDAK dipanggil - saran=null panggilanPemasok=0
LULUS D2  hidup lagi -> saran muncul dan pemasok dipanggil sekali - teks="return 42" panggil=1
LULUS E1a  terima -> teks berubah + keadaan terima tercatat - sesudah="const namaPengguna = ambilNama(user);\nconst namaPengguna = ambilNama(user);" diterima=1
LULUS E1b tolak -> teks kembali seperti semula, penolakan tercatat - teks kembali identik=true, ditolak=1, terima-sesudah-tolak=false
LULUS E1c keadaan mati -> terima/tolak tidak mengubah apa pun - aktif=false: terima & tolak keduanya no-op
LULUS E2  input sama -> hasil sama (PEMASOK_LOKAL, 3x) - {"teks":"Pengguna = ambilNama(user);","dari":48,"sampai":48,"sebab":"ulangi-baris-atas"}
LULUS E3  input sama -> hasil sama (pemasok async tetap, 2x) - {"teks":"lanjutan tetap","dari":12,"sampai":12,"sebab":"pemasok"}
LULUS E4  non-determinisme tidak ada: KODE (tanpa komentar) tanpa Date.now/Math.random/perf - bersih (0 sumber waktu/acak di kode)
LULUS F1  kunci API mirip milik OpenAI di konteks tidak muncul di saran - saran="const API_KEY = \"***\";\nconst x = 1;" bocor=false
LULUS F2  pola kunci (AWS/GitHub/apiKey=) disaring walau tak terdaftar di kunci.rahasia - bocor=[] saran="const a = \"***\";\nconst b = '***';\nconst c = { *** };"...
LULUS F3  rahasia eksplisit multi-nilai + rahasia pendek (<4 char) tidak menghapus saran - dua kemunculan disaring=true, pemasok nakal (objek) -> null=true
LULUS G1  tukar-jalan: set -> aktif, set(null) -> default mati (tanpa jaringan) - default=PEMASOK_MATI=true, sesudah null -> saran=null
LULUS G2  PEMASOK_LOKAL: ulangi baris atas (hasil persis + label sebab) - {"teks":"Pengguna = ambilNama(user);","dari":48,"sampai":48,"sebab":"ulangi-baris-atas"}
LULUS G3  PEMASOK_LOKAL: tutup pasangan ({ -> newline+indent }, ( , [) - {"teks":"\n  }","dari":25,"sampai":25,"sebab":"tutup-blok"} ")" "]"
LULUS G4  PEMASOK_LOKAL: badan kata kunci ikut bahasa (ts " {", py ":", lewat path) - ts=" {" (kata-kunci:ts) py=":" py-via-path=":"
LULUS H1  modul inti tanpa jalur jaringan (nol import di KODE, tanpa fetch/tauri) - kode tanpa import, tanpa token jaringan (fetch/XMLHttpRequest/WebSocket/@tauri-apps)
LULUS H2  pemasok melempar/reject -> null (editor tidak jatuh), async tetap jalan - throw=null reject=null async-ok="y"
LULUS H3  rentang ganti sebagian kata diterapkan tepat (dari < sampai) - "const namaPengguna" rentang=10-11

== 23/23 lulus ==        (exit 0)
```

`npx tsc --noEmit` dari `D:/Zephyr`: **exit 0, 0 galat** (termasuk 0 galat yang menyebut
`ghostPemasok.ts`). Catatan SPIKE §6 menyebut 3 galat lama di `src/lib/zephyrTools/kendaliJendela.ts`
— saat pengukuran ini galat itu **sudah tidak ada** (lane lain menutupnya), jadi berkas lane ini
menambah 0 galat baru.

Harness menyimpan bundel kerja di `node_modules/.cache/zephyr-ghost-175/` (tidak menambah berkas
tracked).

---

## 5. Usulan penyambungan (BELUM diterapkan — menunggu keputusan Ryu)

Tujuan: perilaku lama **tidak berubah** (saran tetap dari jaringan + stream), tapi seam jadi jalur
resmi, dan dua bug SPIKE §2 ditutup.

### Langkah 1 — `src/lib/ghostText.ts` saja (2 bug SPIKE tertutup)

**Hunk 1 — impor seam.** Setelah baris 16 (`import { getActiveView } from './editorRegistry';`):

```diff
 import { getActiveView } from './editorRegistry';
+import {
+  ambilSaran,
+  ghostAktif,
+  setGhostAktif,
+  setPemasokSaran,
+  type KunciKonteks,
+  type PemasokSaran,
+} from './ghostPemasok';
```

**Hunk 2 — rute `mintaSaran` (208-262) lewat seam.** Perilaku lama dipindah apa adanya ke
`PEMASOK_JARINGAN` (didaftarkan sekali di modul ini, supaya `ghostPemasok.ts` tetap bebas jaringan),
lalu `mintaSaran` menjadi tipis:

```diff
-async function mintaSaran(view: EditorView) {
+/* Perilaku LAMA (jaringan + stream ai-chunk), dipindah apa adanya ke pemasok.
+ * Saran tetap datang lewat listener, jadi nilai kembaliannya null. */
+const PEMASOK_JARINGAN: PemasokSaran = () => {
   const ai = useAi.getState();
   const def = findModel(ai.model, ai.provider);
   const cfg = (useStore.getState().settings.models.providers ?? {})[def.provider] ?? {};
   if (!ai.hasKey(def.provider)) {
     ai.onChunk({ id: 'ghost-nokey', err: `No API key yet for ${def.label}` });
-    return;
+    return null;
   }
 
   pastikanListener();
-  viewAktif = view;
   akumulasi = '';
   aktif = `ghost-${Date.now()}`;
 
-  const path = view.dom.closest('.zephyr-cm-host')?.getAttribute('data-path') ?? 'file';
+  const path = viewAktif?.dom.closest('.zephyr-cm-host')?.getAttribute('data-path') ?? 'file';
   const pesan: AiMessage[] = [ /* ...persis seperti baris 230-239 sekarang... */ ];
 
-  try {
-    await cmd.aiChat({ /* ...persis seperti baris 242-249... */ });
-  } catch (e) {
-    ...
-    bersihkan();
-  }
+  void cmd.aiChat({ /* ...persis seperti baris 242-249... */ }).catch((e) => {
+    useAi.getState().onChunk({ id: aktif, err: String(e) });
+    bersihkan();
+  });
+  return null;
+};
+
+setPemasokSaran(PEMASOK_JARINGAN);
+
+function kunciDari(view: EditorView): KunciKonteks {
+  const path = view.dom.closest('.zephyr-cm-host')?.getAttribute('data-path') ?? 'file';
+  /* Kunci mentah tidak ada di store renderer (types.ts:1301 hanya baseUrl/model,
+   * aiStore.ts:2543 memuat PublicModel) -> string yang tersedia saja; lapis pola
+   * di ghostPemasok.ts yang menanggung sisanya. Kalau nanti kunci mentah
+   * terjangkau dari renderer, tambahkan ke `rahasia`. */
+  const provider = (useStore.getState().settings.models.providers ?? {}) as Record<
+    string,
+    Record<string, unknown>
+  >;
+  const rahasia = Object.values(provider).flatMap((c) =>
+    Object.values(c).filter((v): v is string => typeof v === 'string'),
+  );
+  return { path, rahasia };
+}
+
+function bahasaDariPath(path: string): string {
+  const titik = path.lastIndexOf('.');
+  return titik >= 0 ? path.slice(titik + 1) : '';
+}
+
+async function mintaSaran(view: EditorView) {
+  if (!ghostAktif()) return;
+  viewAktif = view;
+  const kunci = kunciDari(view);
+  const usulan = await ambilSaran(konteksSekitar(view), bahasaDariPath(kunci.path ?? ''), kunci);
+  /* Pemasok lokal/uji mengembalikan saran sebagai nilai balik; pemasok jaringan
+   * mengembalikan null dan mengisi widget lewat listener ai-chunk. */
+  if (usulan && viewAktif === view) {
+    akumulasi = usulan.teks;
+    tampilkan(usulan.teks);
+  }
 }
```

Catatan penting: jalur jaringan **tidak** mengubah `aktif`/`akumulasi` dari nilai balik, jadi
streaming (241-261) tetap identik; jalur lokal memakai `tampilkan()` yang sudah ada (180) dan
dibersihkan oleh aturan 119-121 seperti biasa.

**Hunk 3 — jalur mati/hidup (menutup bug SPIKE §2 nomor 2).** `ghostText(on)` (399-401):

```diff
 export function ghostText(on: boolean): Extension[] {
-  return on ? [ghostField, ghostTextKeymap, pemicuOtomatis, batalSaatBlur] : [];
+  setGhostAktif(on);
+  if (!on) {
+    /* Fitur dimatikan: chunk dari permintaan lain tidak boleh lagi membangunkan
+     * kode ghost (`lepasListenerGhost` 174 sampai sekarang tidak pernah dipanggil). */
+    lepasListenerGhost();
+    viewAktif = null;
+    aktif = null;
+    akumulasi = '';
+  }
+  return on ? [ghostField, ghostTextKeymap, pemicuOtomatis, batalSaatBlur] : [];
 }
```

Ini cukup **tanpa** menyentuh `CodeMirrorEditor.tsx`: reconfigure ekstra editor (695-721, dep
`editorSettings.ghostText` di 717) mengevaluasi ulang `extrasEditor(...)`, dan baris 140 memanggil
`ghostText(e.ghostText)` — jadi mematikan toggle akan menjalankan cabang `!on` di atas. Dekorasi
yang tersisa ikut hilang karena `ghostField` keluar dari daftar ekstensi compartment.

Langkah 1 mengubah perilaku **hanya** dengan syarat mau: selama hunk 2 dipasang, tanpa kunci API pun
tidak ada saran lokal (default pemasok mati). Kalau Ryu ingin saran tetap ada tanpa jaringan, tinggal
`setPemasokSaran(PEMASOK_LOKAL)` (mis. opsi setelan baru) — nol perubahan lain.

### Langkah 2 (opsional, 1 baris) — `src/components/editor/CodeMirrorEditor.tsx`

Bahasa saat ini ditebak dari ekstensi berkas (`bahasaDariPath`). Lebih akurat: editor sudah punya
`tab.lang` (dipakai di 744). Usul: set atribut `data-lang` pada host `.zephyr-cm-host` (dekat blok
yang menulis `data-path`) lalu di `kunciDari` pakai
`view.dom.closest('.zephyr-cm-host')?.getAttribute('data-lang') ?? bahasaDariPath(path)`.
Tanpa ini, tebakan ekstensi sudah cukup untuk `PEMASOK_LOKAL` (diuji G4 lewat `kunci.path`).

### Langkah 3 (opsional) — samakan pembukuan terima/tolak

`terimaGhost` (269-287) dan `buangGhost` (191) bisa memakai `terimaSaran`/`tolakSaran` dari seam
(hanya untuk buku besar `diterima`/`ditolak`; penyisipan teks tetap di CM6). Ini yang membuat jalur
non-CM6 (mis. plugin editor lain / panel VS Code) memakai aturan keputusan yang sama. Harness
menguji fungsi ini langsung (E1a/E1b/E1c/H3), jadi penggantinya tidak perlu uji baru.

### Yang **tidak** diusulkan

- Tidak ada perintah Rust, izin, atau dependensi baru; semuanya renderer + murni TS.
- Tidak mengubah default setelan: `ghostText: false` (`src/lib/types.ts:1592`) tetap.
- Tidak mengubah `src/lib/ghostText.ts` sekarang (aturan lane); perubahan menunggu persetujuan.
- Tidak menyentuh berkas lane lain (`zephyrTools/**`, `dekorasi*`, `commandRegistry.ts`, dst).

---

## 6. Risiko & keterbatasan yang jujur

- `PEMASOK_LOKAL` adalah heuristik, bukan model: kualitas saran terbatas dan sengaja konservatif
  (ragu → `null`). Nilainya: fitur bisa hidup dan diuji tanpa kunci/jaringan.
- Lapis pola rahasia bisa **over-redact** (`apiKey: "..."` di dalam saran ikut jadi `***`) dan
  under-redact untuk format kunci yang belum terdaftar. Daftar pola ditambah dengan menulis satu
  regex di `POLA_RAHASIA` (`src/lib/ghostPemasok.ts`), dan tiap tambahan wajib punya kasus di harness
  (F1/F2/F3 sudah mencontohkan).
- Saran yang dipotong di tengah token bisa menghasilkan kode tak valid; karena itu pemotongan
  prioritas di batas spasi (B2), dan pemasok jaringan lama memang sudah `maxTokens: 64` (242-249).
- Harness ini menguji **seam**, bukan perilaku editor CM6 (dekorasi, keymap, debounce) — itu tetap
  di luar jangkauan tanpa runner UI; bukti CM6 kalau perlu harus lewat app hidup (BUTUH APP).
