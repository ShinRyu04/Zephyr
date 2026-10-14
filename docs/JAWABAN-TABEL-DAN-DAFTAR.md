# Kenapa Zeph belum mengeluarkan tabel markdown + daftar

Keluhan Ryu: Zeph belum bisa mengeluarkan **tabel Markdown + daftar** seperti agen
luar. Dokumen ini memisahkan **yang sudah benar** dari **cacat nyata**, dengan
berkas + baris, lalu usulan tambalan. Tambalannya **belum dipasang** karena
`src/lib/systemPrompt.ts` bukan berkas lane ini.

## 1. Yang sudah benar (jangan dibangun ulang)

| Bagian | Bukti |
| --- | --- |
| Perender markdown sanggup tabel GFM | `scripts/uji-tabel-markdown.mjs` → **8/8 lulus**, memakai paket app yang asli (`react-markdown ^9.0.1`, `remark-gfm ^4.0.0`) |
| Plugin GFM terpasang di jalur jawaban | `src/components/ai/ChatMessage.tsx` (`MD_PLUGINS = [remarkGfm]` ~baris 206, `<Markdown remarkPlugins={MD_PLUGINS} components={MD_JAWABAN}>` ~baris 773/825/954) |
| Gaya tabel ada | `src/styles/ai.css` (aturan `.ai-body table` ~baris 248-260) |
| Aturan prompt untuk tabel **ada** | `src/lib/systemPrompt.ts:836-843` (kelas `tabel`) |

Kesimpulan bagian ini: **cacatnya di hulu perender** — di perakitan prompt.

## 2. Cacat A — aturan tabel/daftar dipicu kata kunci, bukan kebutuhan

`src/lib/systemPrompt.ts:818-878` mendefinisikan enam kelas kondisional
(`model`, `tabel`, `jendela`, `galat`, `keamanan`, `subagent`). Kelas `tabel`
baru menempel kalau pesan user cocok dengan (`:838`):

```
/\b(tabel|table|kolom|bandingkan|perbandingan|compare|matriks|matrix|ceklis|checklist)\b/i
```

Kata `daftar`, `list`, `sebutkan`, `apa saja`, `rincian` **tidak ada** di situ.
Hasil probe nyata (bundle `systemPrompt.ts`):

```
"apa saja setelan AI?"                     -> []
"sebutkan semua setelan editor"            -> []
"daftar setelan yang ada"                  -> []
"list all settings"                        -> []
"bandingkan setelan editor dan terminal"   -> ["tabel"]
"tampilkan tabel perbandingan"             -> ["tabel"]
```

Empat pertanyaan berbentuk daftar mendapat **nol** aturan bentuk — padahal itu
justru bentuk yang diminta user.

## 3. Cacat B — blok gaya disisip paling belakang, jadi kata terakhir

Urutan penyisipan di `systemPromptFor()`:

- `blokKondisional(kueri)` → `src/lib/systemPrompt.ts:1021`
- `instruksiGaya(answerStyle)` → `src/lib/systemPrompt.ts:1079-1080`

Blok gaya didorong **paling akhir** dari array `bagian`, jadi ia instruksi yang
paling akhir dibaca. Isi default `answerStyle='short'` (`:601-608`):

```
# Answer style: short
- Answer in at most 3 sentences, or a short list. ...
```

Ini bertabrakan dengan perintah tabel (`:836-843`: "write a markdown table
(header + `---` row)"). Offset nyata di prompt jadi (keluaran
`scripts/uji-pengetahuan-tanpa-cdp.mjs`, bagian G):

```
blok tabel di offset 9546, blok gaya di offset 20302
```

Blok yang menang adalah yang terakhir: batas 3 kalimat. Karena itu jawaban
bertabel tidak keluar: model membaca izin tabel, lalu membaca larangan panjang
sesudahnya.

## 4. Usulan tambalan (design only — `systemPrompt.ts` milik lane lain)

**T1 — balik urutannya (2 baris).** Di `src/lib/systemPrompt.ts`, pindahkan
penyisipan gaya ke **sebelum** `blokKondisional(kueri)`:

```ts
// sebelum :1021
blokKondisional(kueri),
// sesudah (
const gaya = instruksiGaya(answerStyle);
if (gaya) bagian.push(gaya);      // pindah ke sini
blokKondisional(kueri),           // bentuk topik jadi kata terakhir
```

lalu hapus `:1079-1080`. Aturan bentuk topik menang atas batas kalimat umum,
seperti maksud komentar `:1001-1003` sendiri ("blok ini mempersempitnya ke
pertanyaan giliran ini").

**T2 — klausa pengecualian di `instruksiGaya` (:586-610).** Satu baris di tiap
gaya, mis. short: `- Bentuk yang diminta user (tabel/daftar) menang atas batas kalimat ini.`
Opsi paling kecil risikonya: tidak menyentuh urutan.

**T3 — tambah pemicu daftar ke kelas `tabel` (:838).** Dari:

```
/\b(tabel|table|kolom|bandingkan|...)\b/i
```

menjadi menambahkan `daftar|list|sebutkan|apa saja|rinci|rincian|langkah|steps`.
Alternatifnya kelas baru `daftar` dengan aturan "3+ item berkolom sama → daftar
berbutir; lebih dari 3 item dengan kolom yang sama → tabel".

**Catatan pemilik lane:** T1 mengubah posisi satu blok untuk SEMUA gaya, jadi ia
perlu diuji ulang bersama `scripts/uji-bahasa-jawaban.mjs` (blok bahasa
di-unshift ke depan di `:1078`, tidak terpengaruh) dan harness jawaban nyata.

## 5. Cara membuktikan tambalan sudah beres

1. `node scripts/uji-pengetahuan-tanpa-cdp.mjs` — bagian (G) harus **tidak lagi**
   melaporkan `CACAT batas 3 kalimat menimpa aturan tabel`.
2. `node scripts/uji-tabel-markdown.mjs` — 8/8 (perender tetap sehat).
3. Jawaban nyata dari app (CDP) dimasukkan ke `docs/uji-jawaban/` lalu
   `node scripts/ukur-mutu-jawaban.mjs` — butir `R2`/`R3` harus LULUS, bukan
   TIDAK DIUJI.

## 6. Yang belum beres (jujur)

- Tambalan T1/T2/T3 **belum dipasang**; berkasnya milik lane lain.
- Belum ada satu pun jawaban nyata bertabel dari provider (CDP mati) — jadi
  klaim "Zeph sudah bisa mengeluarkan tabel" **belum boleh** dibuat. Yang sudah
  terbukti hanya: perendernya sanggup, dan aturan promptnya ada tapi terkunci
  kata kunci + dilawan batas panjang.
