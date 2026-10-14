# USULAN PROVIDER-FALLBACK — menyambungkan `providerTahan.ts` ke jalur panggilan model

- **Status**: USULAN. Belum diterapkan. Tidak ada `git add`/`commit`, tidak ada `scripts/**` (wildcard) yang disentuh, harness CDP (:9223) tidak dijalankan.
- **Prasyarat**: `src/lib/providerTahan.ts` sudah ada dan **41/41 hijau** di `scripts/uji-provider-fallback.mjs` (lihat `docs/LAPORAN-PROVIDER-FALLBACK.md`). Semua nomor baris di bawah diambil dari `src/lib/aiStore.ts` @ 9.039 baris / 399.648 B (14 Okt 2026).
- **Angka yang harus dihormati saat menyambung**: jendela **60 detik**; plafon **60 permintaan BERHASIL** dan **70 percobaan TOTAL** per menit **per kredensial**; yang diganti = "menyerah setelah 3 percobaan" (`` `<model>` rate-limited every one of 3 attempts ``); kejadian nyata 429 membunuh 2/4 anak delegasi (1439 s & 1455 s, 104 & 102 panggilan, mati di detik ~254 & ~53).

Urutan pengerjaan yang disarankan: **U1 → U2 → U3 → U4 → U5 → U6** (U1+U2 sudah menghilangkan mayoritas cacat; U3–U5 menyamakan kosakata pesan; U6 menutup kebocoran di jalur streaming).

> **Catatan sinkronisasi**: semua nomor baris di bawah sudah dicek ulang pada keadaan `src/lib/aiStore.ts` saat dokumen ini ditulis (**9.039 baris**) — `6083`/`6145`/`6205`/`6211` masih tepat berisi teks yang dikutip. Berkas itu **sedang disunting lane lain** (`git status`: `M src/lib/aiStore.ts`), jadi **periksa ulang nomor barisnya sebelum menerapkan**; kalau bergeser, patokannya adalah teks lama yang dikutip (bukan angkanya).

---

## U1. Impor modul + jalur CHAT memakai tangga berjenjang (bukan 3 percobaan datar)

**Berkas**: `src/lib/aiStore.ts`
**Baris**: impor di dekat baris 55 (blok `import { perkiraanKonteks, … } from './contextBudget';`) dan `4915–4961`.

**Tambah impor** (setelah baris 55, blok `from './contextBudget'`):

```ts
import {
  panggilTahan,
  pesanTunggu,
  vonisGalat,
  buatJendela,
  isiJendela,
  JENDELA_PROVIDER,
  BAWAAN_PROVIDER_TAHAN,
  type JendelaKredensial,
  type Kandidat,
} from './providerTahan';
```

**TEKS LAMA** (`aiStore.ts:4915–4961`, apa adanya):

```ts
    const RETRY_CHAT = [1200, 3000] as const;
    let terakhirErr: string | null = null;
    for (let retry = 0; retry <= RETRY_CHAT.length; retry++) {
      if (retry > 0) {
        /* Clear what the failed attempt wrote before the new one starts. The
           retry re-sends the same prompt and the provider answers from scratch,
           so any fragment already in the bubble would end up duplicated. */
        set((s) => ({
          sessions: s.sessions.map((sess) => ({
            ...sess,
            messages: sess.messages.map((m) => (m.id === botMsg.id ? { ...m, content: '', error: undefined } : m)),
          })),
        }));
        if (!(await tungguRetryAgent(RETRY_CHAT[retry - 1]))) break;
        if (cancelled.has(reqId)) break;
      }
      try {
        await cmd.aiChat({
          id: reqId,
          provider: def.provider,
          model: def.id,
          // Same gateway ceiling as the agent path. Plain chat only LOOKED
          // immune because one message is small, but a long conversation
          // plus a few screenshots builds the same oversized body - it just
          // takes more turns to get there.
          messages: ringkasUkuran(history),
          baseUrl: cfg.baseUrl || undefined,
          maxTokens: def.maxOut ?? 2048,
          effort: get().reasoningEffort ?? undefined,
          // Stable per-chat id: lets the provider reuse its prompt cache for
          // this conversation instead of re-reading the whole prompt each turn.
          sessionId: get().activeSession()?.id,
        });
        terakhirErr = null;
        break;
      } catch (e) {
        const msg = cmd.asZephyrError(e).message;
        terakhirErr = msg;
        /*
         * Retry only what can succeed on a second try. A 401 or a 400 will
         * answer the same way every time, and retrying those would just make
         * the user wait three seconds to see the same error.
         */
        if (!isRetryableAgentProviderError(msg) || retry === RETRY_CHAT.length) break;
        if (cancelled.has(reqId)) break;
      }
    }
    if (terakhirErr) {
      get().onChunk({ id: reqId, err: terakhirErr });
      get().onChunk({ id: reqId, done: true });
    }
    return true;
```

**TEKS BARU** (usulan):

```ts
    /*
     * Satu giliran chat lewat lapisan ketahanan yang SAMA dengan agent:
     * retry berjenjang + backoff berbatas + Retry-After + fallback model +
     * batas waktu giliran + anggaran percobaan + anggaran MENIT per kredensial.
     *
     * Kenapa bukan `RETRY_CHAT` yang lama: dua jeda tetap (1200/3000 ms) berhenti
     * setelah 3 percobaan — persis bentuk "menyerah setelah 3 percobaan" yang
     * membunuh 2 dari 4 anak delegasi (104 & 102 panggilan, mati di detik ~254
     * dan ~53). Backoff di sini tumbuh sampai 20 detik, Retry-After dihormati,
     * dan yang menghentikan bukan hitungan percobaan yang kecil melainkan
     * anggaran percobaan + jam giliran + jendela kredensial 70/60 per 60 dtk.
     */
    const kandidatChat: Kandidat[] = [
      { provider: def.provider, model: def.id },
      /* Model lain di bawah provider yang SAMA lebih dulu (kunci & gateway sama,
         hanya modelnya berubah), lalu provider lain yang kuncinya sudah ada. */
      ...(pilihModelCadangan(def, MODEL_FALLBACK, (p) => useSettingsUi.getState().hasKey(p))
        ? [
            {
              provider: pilihModelCadangan(def, MODEL_FALLBACK, (p) => useSettingsUi.getState().hasKey(p))!.provider,
              model: pilihModelCadangan(def, MODEL_FALLBACK, (p) => useSettingsUi.getState().hasKey(p))!.id,
            },
          ]
        : []),
    ];

    const jendela = jendelaUntuk(def.provider); // U2 — satu jendela per kredensial
    const tahanChat = await panggilTahan({
      kandidat: kandidatChat,
      jalur: 'chat',
      jendela,
      /* 60 sukses adalah batas yang lebih ketat daripada 70 percobaan, jadi
         keduanya diisi dari angka provider yang sama (JENDELA_PROVIDER). */
      jendelaMs: JENDELA_PROVIDER.detik * 1000,
      maksPercobaanJendela: JENDELA_PROVIDER.maksPercobaan,
      maksSuksesJendela: JENDELA_PROVIDER.maksSukses,
      batal: () => cancelled.has(reqId),
      lapor: (p) => {
        if (p.tahap !== 'tunggu') return;
        /* Jeda tidak pernah menjadi layar kosong: kalimatnya menyebut percobaan
           ke-berapa, dari anggaran berapa, dan siapa yang sedang dicoba. */
        get().setAgentProgress?.({
          agentPhase: 'thinking',
          agentCurrentTool: p.pesan,
          agentStepIndex: 0,
          agentStepLimit: 0,
        });
      },
      catat: undefined, // sengaja kosong: `useAiDebug` belum punya sink baris-log
                        // (ia hanya mulai/potong/selesai/bersih). Kalau nanti ada,
                        // isi di sini — `catat` sudah menerima baris yang SUDAH
                        // disaring rahasia, jadi aman ditulis apa adanya.
      panggil: async (k) => {
        /* Setiap percobaan menulis ulang bubble: percobaan yang gagal tidak boleh
           menyisakan fragmen di atas jawaban percobaan berikutnya. */
        set((s) => ({
          sessions: s.sessions.map((sess) => ({
            ...sess,
            messages: sess.messages.map((m) => (m.id === botMsg.id ? { ...m, content: '', error: undefined } : m)),
          })),
        }));
        try {
          await cmd.aiChat({
            id: reqId,
            provider: k.provider,
            model: k.model,
            messages: ringkasUkuran(history),
            baseUrl: k.provider === def.provider ? cfg.baseUrl || undefined : undefined,
            maxTokens: (findModel(k.model, k.provider)?.maxOut ?? def.maxOut) ?? 2048,
            effort: get().reasoningEffort ?? undefined,
            sessionId: get().activeSession()?.id,
          });
          return true;
        } catch (e) {
          /* asZephyrError memberi {code, message}; `code`-nya kosakata Zephyr,
             bukan status HTTP, jadi klasifikasinya dari TEKS — sama seperti
             isRetryableAgentProviderError, hanya dengan daftar sebab yang lebih
             halus (batas-laju / server / jaringan / waktu-habis / kredensial /
             permintaan). */
          throw new Error(cmd.asZephyrError(e).message);
        }
      },
    });

    if (!tahanChat.ok) {
      /*
       * Gagal jujur: satu kalimat yang memuat SEBAB, provider & model mana saja
       * yang dicoba, dan nomor percobaan — bukan `terakhirErr` mentah seperti
       * dulu (`onChunk({ err: terakhirErr })`), yang membuat user melihat
       * "429 Too Many Requests" tanpa tahu harus apa.
       */
      get().onChunk({ id: reqId, err: tahanChat.pesan ?? 'Provider tidak menjawab.' });
      get().onChunk({ id: reqId, done: true });
      return true;
    }
    get().onChunk({ id: reqId, done: true });
    return true;
```

Catatan pemakaian: `TUNGGU_PULIH_DELAYS` di jalur agent (baris 2203) menjadi **tidak perlu** untuk jalur chat; `RETRY_CHAT` dihapus. `isRetryableAgentProviderError` tetap dipakai jalur agent (klasifikasi di baris 6088) sampai U3 dikerjakan. Titik masuk modul adalah `panggilTahan` (`src/lib/providerTahan.ts:559`), dan `labelRetryAgent` yang lama (baris 2179) hanya mengenal dua keadaan — lihat U5.

---

## U2. Satu jendela kredensial per provider, hidup selama aplikasi

**Berkas**: `src/lib/aiStore.ts`
**Baris**: tepat setelah `const AGENT_PROVIDER_RETRY_DELAYS = [1000, 2500] as const;` (baris **2101**).

**Teks lama** (baris 2101):

```ts
const AGENT_PROVIDER_RETRY_DELAYS = [1000, 2500] as const;
```

**Teks baru**:

```ts
const AGENT_PROVIDER_RETRY_DELAYS = [1000, 2500] as const;

/*
 * Anggaran MENIT provider adalah sifat KREDENSIAL, bukan sifat satu giliran.
 *
 * Angka nyatanya dari pesan provider: jendela 60 detik, plafon 60 permintaan
 * BERHASIL dan 70 percobaan TOTAL per menit per kredensial. Kalau penghitungnya
 * dibuat per giliran, sepuluh giliran beruntun boleh masing-masing menghabiskan
 * 70 percobaan dan ban yang didapat jauh lebih panjang daripada yang gagal
 * dihindari. Jadi satu `JendelaKredensial` hidup di sini, per id provider, dan
 * objek yang SAMA diteruskan ke setiap `panggilTahan` (chat maupun agent).
 *
 * Isinya hanya stempel waktu (number), tanpa payload dan tanpa kunci — aman
 * dilihat di debugger.
 */
const JENDELA_KREDENSIAL = new Map<string, JendelaKredensial>();
function jendelaUntuk(provider: string): JendelaKredensial {
  let j = JENDELA_KREDENSIAL.get(provider);
  if (!j) {
    j = buatJendela();
    JENDELA_KREDENSIAL.set(provider, j);
  }
  return j;
}

/** Untuk UI/debug: apa yang sedang terpakai di jendela satu menit terakhir. */
export function isiJendelaProvider(provider: string): { percobaan: number; sukses: number } {
  return isiJendela(jendelaUntuk(provider), Date.now(), JENDELA_PROVIDER.detik * 1000);
}
```

`BAWAAN_PROVIDER_TAHAN` masih bisa dipakai sebagai bawaan `maksPercobaanPerKandidat`/`batasGiliranMs`/`jedaMaksMs`, tapi **jangan** pakai `BAWAAN_PROVIDER_TAHAN.anggaranPercobaan = 8` untuk jalur yang menangani 429 panjang: kejadian nyata menembak 104 & 102 panggilan per lane. Bawaan yang disarankan untuk produk: `anggaranPercobaan: 70` untuk chat/menit penuh, atau skala dengan `MAX_AGENT_STEPS` di jalur agent.

---

## U3. Jalur AGENT: satu sumber klasifikasi + kalimat jujur di ujung

**Berkas**: `src/lib/aiStore.ts`

### U3a — klasifikasi galat memakai `vonisGalat` (cakupan sama, sebab lebih halus)

**Baris 6083–6091, TEKS LAMA**:

```ts
          const bolehRetry =
            !res.cancelled &&
            !agentBatal &&
            res.toolCalls.length === 0 &&
            !!res.error &&
            (isRetryableAgentToolResponseError(res.error) ||
              isRetryableAgentProviderError(res.error));
          const retryableToolResponse =
            !!res.error && isRetryableAgentToolResponseError(res.error);
```

**TEKS BARU**:

```ts
          /* Satu vonis untuk kedua jalur (chat & agent) supaya kosakatanya sama
             dan 401/403 tidak pernah masuk jalur tunggu-pulih: vonisGalat
             mengembalikan bolehUlang=false + sebab='kredensial' untuk 401/403,
             persis seperti isRetryableAgentProviderError, tapi sekaligus memberi
             sebab yang dipakai kalimat ke user. */
          const vonis = res.error ? vonisGalat(res.error) : null;
          const bolehRetry =
            !res.cancelled &&
            !agentBatal &&
            res.toolCalls.length === 0 &&
            !!res.error &&
            (isRetryableAgentToolResponseError(res.error!) ||
              (vonis?.bolehUlang ?? isRetryableAgentProviderError(res.error!)));
          const retryableToolResponse =
            !!res.error && isRetryableAgentToolResponseError(res.error);
```

### U3b — `Retry-After` dihormati (sekarang diabaikan)

**Baris 6205–6207, TEKS LAMA**:

```ts
          if (!retryableToolResponse) {
            if (!(await tungguRetryAgent(AGENT_PROVIDER_RETRY_DELAYS[retry]))) break;
          }
```

**TEKS BARU**:

```ts
          if (!retryableToolResponse) {
            /*
             * Provider yang mengirim `Retry-After: 30` tahu lebih baik daripada
             * backoff bawaan kita. Dulu header itu dibuang; sekarang ia MENANG
             * atas tangga kita (dipotong batas giliran supaya satu header nakal
             * tidak mengunci run).
             */
            const diminta = vonis?.setelahMs ?? null;
            const jeda = diminta !== null ? Math.min(diminta, 60_000) : AGENT_PROVIDER_RETRY_DELAYS[retry];
            if (diminta !== null)
              get().setAgentProgress({
                agentPhase: 'thinking',
                agentCurrentTool: `Provider meminta tunggu ${Math.round(jeda / 1000)} dtk (Retry-After) karena ${labelRetryAgent(res.error!)} — Stop untuk hentikan`,
                agentStepIndex: langkah + 1,
                agentStepLimit: MAX_AGENT_STEPS,
              });
            if (!(await tungguRetryAgent(jeda))) break;
          }
```

### U3c — jendela kredensial dipakai di jalur agent juga

**Baris 6145–6150 (blok fallback), TEKS LAMA**:

```ts
            if (bolehRetry && !retryableToolResponse && !sudahFallback) {
              const cadangan = pilihModelCadangan(
                activeDef,
                MODEL_FALLBACK,
                (p) => useSettingsUi.getState().hasKey(p),
              );
```

**TEKS BARU** — sebelum memutuskan pindah, hormati dulu jendela menit kredensial yang sedang dipakai:

```ts
            if (bolehRetry && !retryableToolResponse && !sudahFallback) {
              /*
               * Jendela menit diperiksa SEBELUM pindah model: kalau yang penuh
               * adalah jendela KREDENSIAL (bukan modelnya), pindah model di
               * provider yang sama tetap akan kena 429 — dan menembakkannya
               * memperpanjang ban. Kalau anggaran percobaan jendela sudah penuh,
               * tunggu (terlihat oleh user) lalu lanjut.
               */
              const perlu = jatahJendela(
                jendelaUntuk(activeDef.provider),
                Date.now(),
                {
                  jendelaMs: JENDELA_PROVIDER.detik * 1000,
                  maksPercobaanJendela: JENDELA_PROVIDER.maksPercobaan,
                  maksSuksesJendela: JENDELA_PROVIDER.maksSukses,
                },
              );
              if (perlu && perlu.tungguMs > 0) {
                get().setAgentProgress({
                  agentPhase: 'thinking',
                  agentCurrentTool: `Jatah ${activeDef.provider} per menit hampir habis (${JENDELA_PROVIDER.maksPercobaan} percobaan / ${JENDELA_PROVIDER.maksSukses} jawaban per ${JENDELA_PROVIDER.detik} dtk) — menunggu ${Math.round(
                    perlu.tungguMs / 1000,
                  )} dtk — Stop untuk hentikan`,
                  agentStepIndex: langkah + 1,
                  agentStepLimit: MAX_AGENT_STEPS,
                });
                if (!(await tungguRetryAgent(perlu.tungguMs))) break;
              }
              const cadangan = pilihModelCadangan(
                activeDef,
                MODEL_FALLBACK,
                (p) => useSettingsUi.getState().hasKey(p),
              );
```

### U3d — pesan gagal jujur saat SEMUA kandidat gagal (jalur agent)

**Baris 6211–6219 (`if (res.error) { … }`), TEKS LAMA (awal blok)**:

```ts
        if (res.error) {
          /*
           * Argumen tool rusak JANGAN membunuh seluruh run.
           *
           * `res.error` di sini sudah melewati ladder retry di atas. Untuk
           * error PROVIDER (429/5xx/koneksi) melempar memang benar - langkahnya
           * tak bisa diselesaikan. Tapi untuk error RESPONS-TOOL (model menulis
           * JSON argumen yang rusak untuk SATU panggilan, mis. grep) melempar
           * terlalu kejam: terbukti di run Kopi Senja, model sudah menulis 3
```

**TEKS BARU (sisipkan sebelum `throw` di blok yang sama)**:

```ts
        if (res.error && !retryableToolResponse) {
          /*
           * Giliran sudah melewati tangga retry, fase tunggu-pulih, dan
           * fallback model. Kalau tetap gagal pada error PROVIDER, user harus
           * menerima satu kalimat yang menyebut sebab + provider mana saja yang
           * dicoba + nomor percobaan, BUKAN `res.error` mentah. `pesanGagal`
           * memakai angka nyata provider (70 percobaan / 60 jawaban per 60 dtk)
           * supaya sarannya masuk akal: "tunggu ~1 menit" atau "kecilkan
           * percakapan".
           */
          agentStepError = pesanGagal({
            sebab: vonis?.sebab ?? null,
            kode: vonis?.kode ?? null,
            alasanBerhenti: 'kandidat-habis',
            percobaan: langkah + 1,
            dicoba: catatanKandidat, // diisi tiap `continue` di atas (U3c/U3d)
            sebabAman: res.error,
            jalur: 'agent',
          });
        }
```

`catatanKandidat` (array `PercobaanKandidat[]`) diisi di dua tempat: (i) blok fallback baris 6151–6166 (`catatanKandidat.push({ provider: activeDef.provider, model: activeDef.id, percobaan: retry + 1 })`), dan (ii) saat `retry` bertambah di baris 6182. Tanpa itu, kalimatnya akan berkata "belum ada percobaan" — dan itu bohong.

---

## U4. Kalimat tunggu di UI memakai `pesanTunggu` (satu sumber untuk dua jalur)

**Berkas**: `src/lib/aiStore.ts`
**Baris 2223 TEXTS LAMA**:

```ts
        `Menunggu provider pulih (${i + 1}/${TUNGGU_PULIH_DELAYS.length}, ${sisa} dtk, total ~${Math.round(sisaFase / 1000)} dtk dari ~${Math.round(total / 1000)} dtk) karena ${labelRetryAgent(error)} — Stop untuk hentikan`,
```

**TEKS BARU**:

```ts
        pesanTunggu({
          sebab: vonisGalat(error).sebab,
          percobaan: i + 1,
          maksPercobaan: TUNGGU_PULIH_DELAYS.length,
          jedaMs: TUNGGU_PULIH_DELAYS[i],
          kandidat: { provider: '', model: labelRetryAgent(error) },
          indeksKandidat: i,
          totalKandidat: TUNGGU_PULIH_DELAYS.length,
        }),
```

Konsekuensi yang perlu diputuskan pemilik produk: kalimat `pesanTunggu` memuat batas **60 jawaban / 70 percobaan per 60 dtk** dari angka provider, sedangkan `TUNGGU_PULIH_DELAYS` sekarang `[4000, 12000, 22000]` = **38 detik**. Dua fakta itu tidak saling bertentangan, tapi baris **6105–6106** masih berkata "15s, 30s, 60s … ~105 detik" — komentar itu **salah** dan sebaiknya dibetulkan bersamaan.

---

## U5. `labelRetryAgent` disatukan dengan `vonisGalat`

**Berkas**: `src/lib/aiStore.ts` (fungsi `labelRetryAgent`, dipakai di 2223, 6158, 6189, 6206).

**Usulan**: `labelRetryAgent` (kini di baris **2179**, hanya tahu dua kata: 'provider timeout' / 'provider error sementara') diganti dengan peta sebab→kalimat yang **berasal dari modul**, supaya jalur chat dan agent menyebut sebab dengan kata yang SAMA dan pesan 401 di chat berhenti berbunyi seperti 429:

```ts
/* providerTahan.ts BELUM punya ekspor ini — tambahkan kecil saja, di sebelah `pesanGagal`: */
export function kalimatSebab(sebab: SebabPulih): string {
  switch (sebab) {
    case 'batas-laju':   return 'limit permintaan (429)';
    case 'server':       return 'server provider bermasalah (5xx)';
    case 'jaringan':     return 'koneksi putus';
    case 'waktu-habis':  return 'provider tidak menjawab';
    case 'kredensial':   return 'kunci ditolak (401/403) — ganti kunci di Settings';
    case 'permintaan':   return 'permintaan ditolak (4xx) — periksa pengaturan model';
    default:             return 'galat tak dikenal';
  }
}
```

lalu di `aiStore.ts`:

```ts
function labelRetryAgent(error: string): string {
  return kalimatSebab(vonisGalat(error).sebab);
}
```

Manfaat yang bisa diperiksa: `a1`/`a2` di harness sudah membuktikan `vonisGalat` memetakan 401/403/429/5xx ke sebab yang benar, jadi label ini tidak menebak dari regex lagi — dan teks pesannya satu sumber dengan `pesanGagal`/`pesanTunggu`.

---

## U6. Jangan biarkan anak delegasi menembus jendela bersama (kebocoran yang tersisa)

Kejadian nyata: **dua anak delegasi mati di detik ~254 dan ~53** karena 429, dengan 104 & 102 panggilan. Dua lane paralel yang berbagi satu kunci **bersama-sama** menembus 70/menit, dan limiter per-giliran tidak melihat lane sebelah. Karena itu:

1. `JENDELA_KREDENSIAL` harus **satu peta level-modul** (U2), bukan variabel di dalam `sendChat`/`sendAgent`. Anak delegasi yang jalan di proses/app yang sama ikut memakai peta itu.
2. Kalau delegasi jalan di proses terpisah, jendela harus dikirim lewat jalur bersama (mis. disimpan di store/berkas yang sudah dipakai app) — kalau tidak, jaminannya hanya berlaku per proses, dan itu **harus ditulis apa adanya** di dokumen ini, bukan diklaim lebih.
3. Bukti yang harus dilampirkan setelah disambungkan: harness `j3` (130 giliran → maks 60 jawaban per jendela) diulang sebagai uji integrasi dua lane paralel, plus satu run nyata yang mencatat `isiJendelaProvider(provider)` di debug.

---

## Verifikasi yang harus dijalankan setelah setiap langkah

```bash
cd D:/Zephyr
npx --no-install tsc --noEmit -p tsconfig.json   # wajib 0 galat
node scripts/uji-provider-fallback.mjs           # wajib 41/41 hijau
node scripts/uji-ketahan-agen.mjs                # wajib 14/14 hijau (jalur agent tak boleh mundur)
```

Harness **CDP (:9223) tidak dijalankan** sesuai aturan lane. Bukti bahwa penyambungan benar adalah: (i) tsc 0, (ii) dua harness di atas hijau, (iii) pesan galat chat/agent berhenti memuat string galat mentah dan mulai memuat sebab + daftar provider + nomor percobaan.
