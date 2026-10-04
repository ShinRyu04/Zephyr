# Prompt untuk Claude Code - deskripsi tool 8 bahasa

Salin isi file ini ke Claude Code.

---

## Misi

Lengkapi deskripsi tool Zephyr ke 8 bahasa tambahan. Sekarang hanya ada Indonesia
dan Inggris; 8 bahasa lain jatuh ke Inggris.

## Berkas yang boleh kamu ubah

**HANYA** `D:/Zephyr/src/lib/zephyrTools/deskripsiTool.ts`

Jangan ubah berkas lain. Kalau kamu merasa perlu, berhenti dan tanya dulu.

## Bentuk sekarang

```ts
export const DESKRIPSI_TOOL_ID: Record<string, string> = { ... };  // baris 31
export const DESKRIPSI_TOOL_EN: Record<string, string> = { ... };  // baris 93

export const POLA_AWALAN_MCP = /^mcp__(?:zephyr|tedi)__/;           // baris 160

export function deskripsiTool(nama: string, bahasa: string): string {
  const polos = nama.replace(POLA_AWALAN_MCP, '');
  const peta = bahasa === 'id' ? DESKRIPSI_TOOL_ID : DESKRIPSI_TOOL_EN;
  return peta[polos] ?? peta[nama] ?? '';
}
```

Katalog punya **56 tool**. Dua peta itu masing-masing harus punya 56 kunci, dan
himpunan kuncinya harus sama persis.

## Yang diminta

1. Tambah 8 peta: `JA`, `KO`, `ZH`, `ES`, `FR`, `DE`, `PT`, `AR`.
   Bahasa target yang dipakai `i18n-extra.ts` persis seperti ini, jangan
   karangan nama lain.
2. Ubah `deskripsiTool()` supaya memilih peta bahasa aktif, dan **turunkan ke
   Inggris** kalau bahasa itu tidak punya kunci - bukan ke string kosong.
3. Kunci tool MCP harus tetap dibaca polos: `mcp__zephyr__inspect` ->
   `inspect`. Jangan sampai 14 deskripsi MCP jadi kosong.
4. `POLA_AWALAN_MCP` jangan diubah. Ada kompatibilitas mundur ke `mcp__tedi__`
   yang disengaja.

## Cara menulis yang benar

- **Kunci = nama tool** (`read_file`, `browser_open`, `inspect`), bukan kalimat.
  Ini berbeda dari `i18n-extra.ts` yang kuncinya kalimat.
- Nilai = deskripsi singkat satu kalimat, gaya sama seperti dua peta yang sudah
  ada:。我说 apa yang tool itu lakukan, bukan marketing.
- Jangan tambah kunci yang tidak ada di katalog. Kalau katalog punya 56,
  setiap peta harus 56. Kalau ada tool yang katalognya ada tapi peta ini lupa,
  tambahkan.
- Jangan hapus apa pun dari peta ID dan EN. Itu yang dipakai user sekarang.

## Jebakan yang sudah pernah kejadian di repo ini

1. **Menyisipkan kunci ke banyak kamus di satu penanda bisa masuk ke satu kamus
   saja.** Kalau kamu插入 di satu tempat yang kebetulan hanya ada di ID, you'll
   add all 8 languages into DESKRIPSI_TOOL_ID. Periksa hasilnya per peta, bukan
   hitung baris.
2. **Hitung dari struktur, bukan dari kemunculan teks.** Jangan pakai `grep` kata
   untuk menyimpulkan sebuah peta berisi 56 entri.
3. `npx tsc --noEmit` menangkap "10 properti bernama sama dalam satu objek"
   dalam sekali jalan. Jalankan sebelum menyimpulkan apa pun berhasil.

## Verifikasi wajib

```powershell
cd D:/Zephyr
npx tsc --noEmit          # harus 0 error
node scripts/verify-deskripsi-tool.mjs
node scripts/verify-tool-picker-51.mjs
```

Kalau ada harness yang gagal, **baca dulu kenapa gagal sebelum menyiapkannya**.
Harness lama pernah mengeraskan jumlah 54 padahal katalog sudah 56, dan ada yang
memakai `/optional/i` sehingga ikut menyalakan kata "optionally" di dalam
kalimat `open_file`. Kalau harness gagal karena alasan seperti itu, perbaiki
harness-nya supaya mengukur invarian yang benar-benar bisa rusak - jangan
mengubah deskripsi yang sudah benar.

Tambahkan harness barumu: cek bahwa
- setiap peta punya kunci yang sama persis dengan katalog,
- `deskripsiTool()` mengembalikan teks bahasa aktif untuk beberapa bahasa,
- bahasa yang belum ada kuncinya jatuh ke Inggris dan tidak string kosong,
- 14 tool MCP mengembalikan deskripsi tidak kosong di semua bahasa.

## Selesai

- `npx tsc --noEmit` 0 error
- semua harness hijau
- **jangan commit**, lapor saja apa yang berubah dan apa hasilnya

Kalau ada bagian yang tidak kamu-sha, bilang terus terang. Lebih baik
mengakuinya daripada diam-diam menebak.