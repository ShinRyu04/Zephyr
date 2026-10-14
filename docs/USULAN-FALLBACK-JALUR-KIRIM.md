# Usulan patch — jalur kirim nyata (ZEPH-PROVIDER-FALLBACK)

Dasar angka: `docs/LAPORAN-FALLBACK-JALUR-KIRIM.md` (harness `scripts/uji-fallback-jalur-kirim.mjs`, 20/20, exit 0).
Berkas yang **tidak** boleh disentuh penulis usulan ini (read-only): semua `src/**`, `src-tauri/**`, `src/lib/zephyrIndeks.ts`, `src/lib/zephyrFakta.ts`. Karena itu dokumen ini **usulan**, bukan patch yang sudah diterapkan.

## REKOMENDASI (satu, tegas): **SAMBUNGKAN `providerTahan.ts`** — jangan hapus, jangan dibiarkan

Alasan berbasis angka, bukan selera:

| Bukti | Angka |
|---|---|
| Kebutuhan item (f) — plafon 60 sukses/70 percobaan per 60 dtk — **nol kode** di jalur nyata | `m1`/`f1`: 3 grep (`JendelaKredensial`, `maksPercobaan`, `Retry-After`) = **0** di `aiStore.ts` |
| Modul yang sudah memuat plafon itu, teruji | `providerTahan.ts:504` `JENDELA_PROVIDER = {detik: 60, maksPercobaan: 70, maksSukses: 60}`; harnessnya 41/41 |
| Kebutuhan item (d) — nomor percobaan + daftar provider di pesan — **tidak ada** di jalur nyata | `a2`/`b4`: daftar provider = false, nomor percobaan = false |
| Fungsi yang sudah menulis pesan itu lengkap | `providerTahan.ts:512` `pesanGagal()` → `"… Sudah dicoba N× — 1× model (provider) … Tunggu ~1 menit lalu kirim ulang …"` |
| `Retry-After` tidak dihormati jalur nyata | `f1`: grep `Retry-After` = **0**; modul punya `bacaSetelahHeader :428` + `vonisStatus(:360)` yang sudah mengembalikan `setelahMs` |
| Anggaran waktu **per-giliran** tidak ada di jalur nyata (hanya per-langkah) | `g1`/`g2`; modul punya `batasGiliranMs: 120_000` + `batasPercobaanMs: 45_000` (`:119-145`) |
| Laju berkali dengan lajur | `f3`: 2 lajur → 8 percobaan; modul punya jitter (`jedaKe :461`) supaya lajur tidak retry serempak |

Menghapus modul = membuang satu-satunya implementasi teruji dari tuntutan yang justru belum terpenuhi; menambah implementasi kedua di `aiStore.ts` = mengulang kesalahan yang melahirkan modul kembar ini. Jadi: **sambungkan**.

## PATCH A (pilihan utama): ganti tangga tangan dengan `panggilTahan`

Titik ganti: `src/lib/aiStore.ts:6089-6206` — blok yang dimulai oleh
`const retryableToolResponse = !!res.error && isRetryableAgentToolResponse(res.error);` dan diakhiri oleh

TEKS LAMA (`:6204-6206`, apa adanya):
```ts
          if (!retryableToolResponse) {
            if (!(await tungguRetryAgent(AGENT_PROVIDER_RETRY_DELAYS[retry]))) break;
          }
```
Blok kandidat yang ikut tergantikan (`:6146-6160`, apa adanya):
```ts
            if (bolehRetry && !retryableToolResponse && !sudahFallback) {
              const cadangan = pilihModelCadangan(
                activeDef,
                MODEL_FALLBACK,
                (p) => useSettingsUi.getState().hasKey(p),
              );
```

TEKS BARU (kerangka; nama opsi mengikuti `OpsiTahan` di `providerTahan.ts:250-285` apa adanya):
```ts
import { panggilTahan, buatJendela, type JendelaKredensial, type Kandidat } from './providerTahan';

/* Satu jendela per KUNCI provider, dipakai bersama SEMUA giliran: jendela yang
   di-reset tiap giliran akan mengirim 70 permintaan/menit dari 10 giliran
   sekaligus (komentar yang sama ada di providerTahan.ts:146-152). */
const jendelaKunci: Record<string, JendelaKredensial> = {};
const jendelaUntuk = (p: string) => (jendelaKunci[p] ??= buatJendela());

const cadangan = pilihModelCadangan(activeDef, MODEL_FALLBACK, (p) => useSettingsUi.getState().hasKey(p));
const kandidat: Kandidat[] = cadangan
  ? [{ provider: activeDef.provider, model: activeDef.id },                    // yang sekarang
     { provider: cadangan.provider, model: cadangan.id }]                      // model lain, boleh beda provider
  : [{ provider: activeDef.provider, model: activeDef.id }];

const hasil = await panggilTahan({
  kandidat,
  jalur: 'agent',
  jendela: jendelaUntuk(activeDef.provider),   // plafon 60/70 per 60 dtk per kunci  → item (f)
  batal: () => agentBatal,                     // Stop tetap dihormati
  lapor: (p) => get().setAgentProgress({ agentPhase: 'thinking', agentCurrentTool: p.pesan }),
  catat: (baris) => console.debug('[provider]', baris),   // sudah diredaksi saringRahasia
  panggil: (k, percobaan) => invokeStreamAgentStep(k, percobaan),  // = panggilan yang sekarang ada di blok ini
});
if (!hasil.ok) {
  agentStopReason = 'provider';
  finalError = hasil.pesan;                    // SEBAB + N percobaan + daftar kandidat + 1 tindakan → item (d)
  break;
}
```
Catatan penerapan: `panggilTahan` sudah mengurus tangga jeda (`jedaKe`), batas giliran, batas percobaan, jendela menit, `Retry-After`, jejak teredaksi, dan `alasanBerhenti`; yang harus diserahkan hanyalah **satu** panggilan jaringan (`panggil`) dan hook batal/progres — jadi `AGENT_PROVIDER_RETRY_DELAYS` (`:2101`), `tungguProviderPulihAgent` (`:2205`) dan blok kandidat (`:6146-6206`) menjadi tidak terpakai dan bisa dihapus **setelah** harness membuktikan paritas.

## PATCH B (kalau diff besar ditolak): 4 sisipan kecil, tanpa membongkar loop

B1. `Retry-After` dihormati — **TEKS LAMA sama dengan di atas** (`:6204-6206`), **TEKS BARU**:
```ts
          if (!retryableToolResponse) {
            /* Provider bisa menitipkan jeda yang dia minta sendiri. Mengabaikannya
               adalah sebab langsung 429 kedua: pola nyata di lapangan. */
            const vonis = vonisGalat(res.error ?? '');
            const dimintaProvider = vonis.setelahMs ?? 0;
            const jeda = Math.max(AGENT_PROVIDER_RETRY_DELAYS[retry] ?? 0, dimintaProvider);
            if (!(await tungguRetryAgent(jeda))) break;
          }
```
(`vonisGalat:389` mengembalikan `VonisPulih {bolehUlang, sebab, kode, setelahMs}` — `setelahMs` sudah berisi `Retry-After` dalam ms, `bacaSetelahHeader:428`.)

B2. Jendela menit sebelum tiap percobaan — sisipkan **setelah `:2101`** (`const AGENT_PROVIDER_RETRY_DELAYS = [1000, 2500] as const;`):
```ts
import { buatJendela, isiJendela, JENDELA_PROVIDER, type JendelaKredensial } from './providerTahan';
const jendelaKunci: Record<string, JendelaKredensial> = {};
/** true = masih ada jatah; false = dibatalkan user saat menunggu jendela. */
async function jagaJendela(provider: string): Promise<boolean> {
  const j = (jendelaKunci[provider] ??= buatJendela());
  const msJendela = JENDELA_PROVIDER.detik * 1000;
  for (let putar = 0; putar < 180; putar++) {
    const { percobaan, sukses } = isiJendela(j, Date.now(), msJendela);
    if (percobaan < JENDELA_PROVIDER.maksPercobaan && sukses < JENDELA_PROVIDER.maksSukses) return true;
    /* Menunggu, BUKAN menyerah: menolak di sini = bug "menyerah di percobaan ke-3" yang item ini minta hilang. */
    if (!(await tungguRetryAgent(1000))) return false;
  }
  return true; // jangan menahan selamanya: lapisan bawah yang memutuskan
}
```
lalu panggil sekali sebelum tiap percobaan (di titik yang sama dengan B1, tepat sebelum `tungguRetryAgent`), dan **catat** percobaan/sukses ke `j` di titik kirim/terima (`j.percobaan.push(...)`, `j.sukses.push(...)` — tipe `JendelaKredensial:134-145` memang array terbuka; kalau mau rapi, ambil cara penulisan persis dari `panggilTahan:559+`).

B3. Pesan jujur — **TEKS LAMA** (`aiStore.ts:7322`, apa adanya):
```ts
      finalError = `Agent stopped: ${agentFailureLabel(agentFailure.category)}: ${agentFailure.message}\n\nTugas dihentikan; perubahan yang sudah tersimpan tetap ada.${bisaLanjut ? ' Ketik "lanjut" atau tekan tombol Lanjut untuk meneruskan dari langkah terakhir.' : ''}`;
```
**TEKS BARU**:
```ts
      const jejakKandidat =
        kandidatDicoba.length > 0
          ? `\nSudah dicoba ${percobaanProvider}× (${kandidatDicoba.map((k) => `${k.percobaan}× ${k.model} (${k.provider})`).join(', ')}).`
          : '';
      finalError = `Agent stopped: ${agentFailureLabel(agentFailure.category)}: ${agentFailure.message}${jejakKandidat}\n\nTugas dihentikan; perubahan yang sudah tersimpan tetap ada.${bisaLanjut ? ' Ketik "lanjut" atau tekan tombol Lanjut untuk meneruskan dari langkah terakhir.' : ''}`;
```
(`kandidatDicoba` diisi di loop; sekaligus menutup temuan `a2`/`b4` bahwa daftar provider & nomor percobaan tidak ada.)

B4. Jitter antar-lajur — ganti `AGENT_PROVIDER_RETRY_DELAYS[retry]` dengan `jedaKe(retry + 1, { jedaDasarMs: 1000, jedaMaksMs: 4000, jitter: 0.25 })` (`jedaKe:461`), supaya dua giliran yang gagal bersamaan tidak retry serempak dan menabrak 429 lagi (`f3`: 2 lajur → 8 percobaan tanpa penjaga).

## Verifikasi yang harus lulus setelah patch (harness yang sama, tanpa diubah selain kasus baru)

1. `f1` berubah: `jagaJendela` menahan percobaan ke-71 → grep `maksPercobaan` ≠ 0, dan pola jeda memuat tunggu jendela.
2. `b4`/`a2` berubah: pesan akhir memuat `Sudah dicoba N×` **dan** daftar `model (provider)`.
3. Kasus baru: `Retry-After: 3` → jeda percobaan berikutnya ≥ 3000 ms (bukan 1000 ms).
4. Kasus baru: anggaran giliran 120.000 ms → giliran berhenti dengan pesan sebab `waktu-habis`, bukan menggantung.
5. Regresi yang **tidak boleh** berubah: `b1` tetap 7 percobaan/41.500 ms sebelum pindah kandidat; `c2` tetap 1 percobaan untuk 401; `d1-d3` isi+mtime utuh; `e1` kunci 0×; `i1` determinisme.
6. `node node_modules/typescript/lib/tsc.js --noEmit --incremental false -p D:/Zephyr` → 0 galat (sekarang juga 0, jadi tidak ada utang tipe yang diwarisi).

## Yang TIDAK diusulkan

- Menghapus `providerTahan.ts` (alasan di atas) atau memindahkan isinya ke `aiStore.ts` (mengulang modul kembar).
- Menyentuh `src/lib/zephyrIndeks.ts` / `zephyrFakta.ts` (generator, read-only menurut aturan repo).
- Menambah retry di **luar** `aiStore.ts` (mis. di `commands.ts`) — akan menumpuk dua tangga dan menggandakan laju, persis pola `f3`.
