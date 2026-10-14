# USULAN — AutoComplete Inline (ZEPH-AUTOCOMPLETE-INLINE)

Tanggal: 2026-10-14 · Repo: `D:\Zephyr`

Tujuan: menyambungkan **seam pemasok lokal yang sudah ada** ke pemicu editor, plus **sakelar on/off**, agar Zephyr bisa memberi saran sebaris (ghost text) tanpa mengirim seluruh berkas dan tanpa biaya.

---

## 0. KOREKSI PENTING: editor = CodeMirror 6, BUKAN Monaco

Tugas menyebut "mesin editor = Monaco". **Repo ini memakai CodeMirror 6.** Bukti (harness S6, dari `package.json` + sumber):

```
S6  editor = CodeMirror, BUKAN Monaco   @codemirror=true  monaco=false
```

Jadi titik sambungnya **bukan** `monaco.languages.registerInlineCompletionsProvider`, melainkan **CodeMirror 6 Extension + keymap + `StateField`/`ViewPlugin`** — yang **sudah ada** di `src/lib/ghostText.ts` dan dipasang di `src/components/editor/CodeMirrorEditor.tsx`. Usulan di bawah memakai bentuk CM6.

---

## 1. Keadaan sebelum (apa adanya)

- `src/lib/ghostText.ts` → `mintaSaran(view)` **langsung** masuk ke blok AI: `useAi.getState()` … `await cmd.aiChat({...})` (kini L259). **Tidak ada blok lokal.**
- `src/lib/ghostPemasok.ts` → `PEMASOK_LOKAL` ada, tetapi **tidak diimpor berkas app mana pun** dan defaultnya `PEMASOK_MATI` (selalu `null`) → seam tak pernah dipakai.
- `const path` dulu dihitung di dalam blok AI (untuk pesan `File: ${path}`).

---

## 2. Perubahan yang DIPASANG (4 tambalan, `src/lib/ghostText.ts`)

### U-A. Impor seam — `src/lib/ghostText.ts` L15

```diff
-import type { AiChunk, AiMessage } from './types';
+import type { AiChunk, AiMessage } from './types';
+import { ambilSaran, PEMASOK_LOKAL, setPemasokSaran } from './ghostPemasok';
```

### U-B. Pasang pemasok lokal SEKALI saat modul dimuat — L425

Ditaruh tepat sebelum `export function ghostText(on)` (L427). **Wajib**, karena tanpa ini `ghostPemasok` tetap `PEMASOK_MATI` → `mintaSaran` selalu jatuh ke jaringan.

```ts
setPemasokSaran(PEMASOK_LOKAL);

export function ghostText(on: boolean): Extension[] {
  return on ? [ghostField, ghostTextKeymap, pemicuOtomatis, batalSaatBlur] : [];
}
```

### U-C. Cabang LOKAL-DULU di `mintaSaran` — L209–225

Sebelum (L209–210): `async function mintaSaran(view) {` lalu langsung `const ai = useAi.getState();`.

Sesudah — disisipkan **sebelum** blok AI:

```ts
async function mintaSaran(view: EditorView) {
  /* Jalur LOKAL dulu: penyedia murni dari `ghostPemasok.ts` (tanpa jaringan,
   * tanpa kunci API, tanpa model). Bila seam mengembalikan usulan, tampilkan
   * dan BERHENTI; bila null jatuh ke jalur AI seperti semula: tanpa regresi. */
  const path = view.dom.closest('.zephyr-cm-host')?.getAttribute('data-path') ?? 'file';
  const bahasa = path.includes('.') ? path.split('.').pop() ?? 'plain' : 'plain';
  const lokal = await ambilSaran(konteksSekitar(view), bahasa, { path });
  if (lokal) {
    viewAktif = view;
    tampilkan(lokal.teks.split('\n')[0]);
    return;
  }

  const ai = useAi.getState();   // ← blok AI lama, TIDAK berubah
  ...
```

Catatan: `path` kini dihitung **sekali** di atas (L218) dan dipakai baik oleh seam (`{ path }`) maupun oleh pesan AI (`File: ${path}`, L255) — jadi `const path` duplikat di blok AI dihapus.

Efek: seam mengembalikan usulan → **tampil & `return`** (jaringan tak disentuh). Seam `null`/melempar → **jalur AI seperti semula**.

### U-D. Jalur lokal tidak streaming

`pastikanListener()` tetap **hanya** di jalur AI (L242), yaitu **setelah** early-return lokal (L221–225). Bukti urutan:

```
A13  idxAmbilSaran=7207 < idxAiChat=8564   earlyReturn=true
A15  idxLokalReturn=7268 < idxPastikanListener=8034
```

---

## 3. Sakelar ON/OFF (syarat "bisa DIMATIKAN")

Sudah ada **dua lapis** — tak perlu dibuat baru:

1. **Lapis modul** — `src/lib/ghostText.ts` L427:
   ```ts
   export function ghostText(on: boolean): Extension[] {
     return on ? [ghostField, ghostTextKeymap, pemicuOtomatis, batalSaatBlur] : [];
   }
   ```
   `off` → kembalikan `[]` (tanpa ekstensi saran sama sekali).
2. **Lapis editor** — `src/components/editor/CodeMirrorEditor.tsx` memanggil `ghostText(e.ghostText)` dari `editorSettings.ghostText` (gerbang di `reconfigure`).

Bukti (S3): `off->[]=true`, `gerbangEditor=true`. Setelan ini persisten per-pengguna, jadi **matikan total = 0 request**.

---

## 4. USULAN lanjutan: sambungkan governor biaya (`autocompleteInline.ts`)

`src/lib/autocompleteInline.ts` (**baru**, 206 baris, murni/sinkron) menutup dua celah yang belum ada di mesin lama: **single-flight** + **anggaran byte payload**. Angka batas:

| Konstanta | Nilai | Baris |
|---|---|---|
| `JEDA_MS` (debounce) | 220 | L33 |
| `BATAS_BYTE_PAYLOAD` | 2048 | L36 |
| `BATAS_JENDELA_BARIS` | 12 | L39 |
| `BATAS_JENDELA_KARAKTER` | 1200 | L42 |
| `PANJANG_MINIMUM_BARIS` | 3 | L45 |

Bentuk pemakaian yang diusulkan di pemicu editor (semua fungsi di bawah **sudah ada**, dari bundel modul nyata):

```ts
import {
  keadaanAwal, ketik, tiket, putuskanKirim, mulaiKirim, selesaiKirim, setAktif,
  bangunPermintaan,
} from './autocompleteInline';

let st = keadaanAwal(true);           // aktif=true saat setelan on
// saat setelan berubah:
st = setAktif(st, on);

// pada setiap perubahan dokumen:
st = ketik(st);                       // bump generasi (batal-saat-ketik)
const t = tiket(st);
setTimeout(async () => {
  const k = putuskanKirim(st, t);     // 'ok' | 'mati' | 'batal-ketik' | 'terbang'
  if (k.alasan !== 'ok') return;      // mati => 0 request; batal-ketik => basi; terbang => single-flight
  const p = bangunPermintaan(konteksSekitar(view), { bahasa, path });
  if (!p) return;                     // baris terlalu pendek -> tanpa request
  if (p.byte > BATAS_BYTE_PAYLOAD) return;   // (bangunPermintaan sudah mengekang <= 2048)
  st = mulaiKirim(st);                // tandai "terbang"
  try { /* kirim p.jendela (BUKAN seluruh berkas) */ }
  finally { st = selesaiKirim(st); }  // lepas single-flight
}, JEDA_MS);
```

Bukti bahwa ini mengekang biaya (harness N/P):
- berkas uji **33.379 char** → payload **554 byte** (jendela 503 char) = **1,7%** berkas;
- **30 ketikan cepat → 1 kirim** (29 ditolak);
- tombol **MATI → 0/50 kirim**; **single-flight** menolak permintaan kedua (`d2=terbang`).

---

## 5. Ringkas — berkas + baris yang berubah

| Berkas | Baris | Teks lama → baru |
|---|---|---|
| `src/lib/ghostText.ts` | L15 | (tambah) `import { ambilSaran, PEMASOK_LOKAL, setPemasokSaran } from './ghostPemasok';` |
| `src/lib/ghostText.ts` | L209–225 | `mintaSaran` mulai dari `const ai = ...` → sisip blok LOKAL-DULU + early-return |
| `src/lib/ghostText.ts` | L218 | `path` dihitung sekali di sini (dipakai seam & pesan AI); `const path` di blok AI dihapus |
| `src/lib/ghostText.ts` | L425 | (tambah) `setPemasokSaran(PEMASOK_LOKAL);` sekali saat modul dimuat |
| `src/lib/autocompleteInline.ts` | L33–204 | (baru) batas angka + `bangunPermintaan` + governor single-flight/batal-ketik/sakelar |

**Monitor/uji:** `node scripts/uji-autocomplete-rencana.mjs` (15/15) dan `node scripts/uji-autocomplete-inline.mjs` (26/26). Bila mengubah `autocompleteInline.ts`, jalankan keduanya plus `uji-replace-multi-berkas.mjs` (26/26).

**Batas:** seluruh usulan ini bersifat harness-level. Belum ada bukti live-app (harness CDP tidak dijalankan karena lane lain menyunting `src/**`).
