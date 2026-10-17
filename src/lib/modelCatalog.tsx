import { memo } from 'react';
import { BRAND_MARKS } from './modelBrandIcons';

export type LogoId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'xai'
  | 'opencode'
  | 'generic';

export interface ProviderModel {
  id: string;
  label: string;

  note?: string;

  ctx?: number;

  maxOut?: number;
}

export interface ProviderInfo {
  id: string;
  label: string;

  baseUrl: string;

  envKey: string;

  logo: LogoId;
  models: ProviderModel[];

  freeText?: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    envKey: 'GEMINI_API_KEY',
    logo: 'gemini',
    models: [
          { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'terbaru, agentik', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', note: 'coding + agent', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'fast, cheap', ctx: 1_000_000, maxOut: 65536 },
          { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', note: 'multimodal', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'hemat', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', note: 'penalaran dalam', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', note: 'cheap, fast', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 (gambar)', note: 'generate/edit gambar', ctx: 1_000_000, maxOut: 65536 },
          { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'penalaran panjang', ctx: 2_000_000, maxOut: 65536 },
          { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'cepat', ctx: 1_000_000, maxOut: 65536 },
          { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', note: 'hemat', ctx: 1_000_000, maxOut: 65536 },
          { id: 'gemini-2.5-flash-image', label: 'Nano Banana (gambar)', note: 'generate/edit gambar', ctx: 1_000_000, maxOut: 65536 },
                  ],
      },
      {
        id: 'openai',
        label: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        envKey: 'OPENAI_API_KEY',
        logo: 'openai',
        models: [
                  { id: 'gpt-6-astra', label: 'GPT-6 Astra', note: 'flagship, agentik', ctx: 1_050_000, maxOut: 128000 },
                  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', note: 'profesional', ctx: 1_050_000, maxOut: 128000 },
                  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', note: 'seimbang', ctx: 1_050_000, maxOut: 128000 },
                  { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', note: 'hemat', ctx: 1_050_000, maxOut: 128000 },
                  { id: 'gpt-5.2', label: 'GPT-5.2', note: 'kualitas tinggi', ctx: 400_000, maxOut: 16384 },
                  { id: 'gpt-5.1-mini', label: 'GPT-5.1 mini', note: 'hemat', ctx: 400_000, maxOut: 16384 },
                  { id: 'o4-mini', label: 'o4-mini', note: 'reasoning, hemat', ctx: 200_000, maxOut: 100_000 },
                                                      { id: 'gpt-5', label: 'GPT-5', note: 'lama', ctx: 400_000, maxOut: 16384 },
                                                      { id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'hemat', ctx: 400_000, maxOut: 16384 },
                                                      { id: 'gpt-5-nano', label: 'GPT-5 nano', note: 'paling hemat', ctx: 400_000, maxOut: 16384 },
                                                    ],
      },
      {
        id: 'anthropic',
        label: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
        envKey: 'ANTHROPIC_API_KEY',
        logo: 'anthropic',
        models: [
                  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'terbaru, terbaik', ctx: 1_000_000, maxOut: 65536 },
                  { id: 'claude-fable-5', label: 'Claude Fable 5', note: 'frontier', ctx: 1_000_000, maxOut: 65536 },
                  { id: 'claude-opus-5', label: 'Claude Opus 5', note: 'agentik coding', ctx: 1_000_000, maxOut: 128000 },
                  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', note: 'reasoning', ctx: 1_000_000, maxOut: 128000 },
                  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', note: 'seimbang', ctx: 1_000_000, maxOut: 128000 },
                  /* 4.6 sits where a router is likely to expose a real Claude
                     model: it still accepts the extended-thinking form that the
                     4.7+ generation rejects, so it is the one that works with
                     providers that have not moved to adaptive yet. */
                  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6', note: 'seimbang (router)', ctx: 200_000, maxOut: 64000 },
                  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'seimbang (lama)', ctx: 200_000, maxOut: 8192 },
                  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', note: 'reasoning (router)', ctx: 200_000, maxOut: 64000 },
                  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'fast, efficient', ctx: 200_000, maxOut: 64000 },
                                  ],
      },
      {
              id: 'deepseek',
              label: 'DeepSeek',
              baseUrl: 'https://api.deepseek.com/v1',
              envKey: 'DEEPSEEK_API_KEY',
              logo: 'deepseek',
              models: [
                        { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', note: 'terbaru, coding', ctx: 1_000_000, maxOut: 65536 },
                        { id: 'deepseek-flash', label: 'DeepSeek Flash (V4.1)', note: 'terbaru, default', ctx: 1_000_000, maxOut: 65536 },
                        { id: 'deepseek-chat', label: 'DeepSeek Chat (V3.2)', note: 'general, older version', ctx: 128_000, maxOut: 8192 },
                                                { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1/V3.2)', note: 'reasoning, older version', ctx: 128_000, maxOut: 8192 },
                                              ],
      },
      /* `xai` used to sit here. It was removed at the user's request: the
         models it listed are served through the OpenAI-compatible gateways
         this build already reaches via `custom`, so keeping a dedicated
         entry only added a provider that needed its own key to do the same
         thing. A saved `xai` key in secrets.json is simply ignored now — it
         is never read, and nothing was written over it. */
            /*
             * `local` sits directly under the hosted providers on purpose.
             *
             * It used to be last, below `xai`, which put a loopback entry at
             * the bottom of a list of cloud services. The order here is the
             * order the picker renders, and a local model is the one a user
             * reaches for when they have already decided not to use a hosted
             * one — it should not be the hardest to find.
             */
      {
        id: 'local',
        label: 'Lokal (server OpenAI-compatible)',
        baseUrl: 'http://127.0.0.1:11434/v1',
        envKey: 'OPENAI_API_KEY',
        logo: 'opencode',
        freeText: true,
        models: [{ id: 'local-default', label: 'Type a local model name', note: 'mis. qwen3-coder:32b', maxOut: 4096 }],
      },
      {
        id: 'custom',
        label: 'Custom (OpenAI-compatible)',
        baseUrl: '',
        envKey: 'OPENAI_API_KEY',
        logo: 'generic',
        freeText: true,
        models: [{ id: 'custom-model', label: 'Type a model name', note: 'bebas, sesuaikan provider', maxOut: 4096 }],
      },
      /*
       * A SECOND custom slot, for users who drive two gateways at once.
       *
       * The id MUST differ from `custom`. Ids are not labels: the id is the key
       * an API key is stored under (`secrets.rs` → `map.insert(p, …)`) and the
       * value `models.activeProvider` holds. Two entries sharing an id would
       * overwrite each other's key, only one would survive in
       * `PROVIDER_BY_ID`, and `activeProvider: 'custom'` would name both. The
       * label may repeat; the id may not.
       */
      {
        id: 'custom2',
        label: 'Custom 2 (OpenAI-compatible)',
        baseUrl: '',
        envKey: 'OPENAI_API_KEY',
        logo: 'generic',
        freeText: true,
        models: [{ id: 'custom2-model', label: 'Type a model name', note: 'gateway kedua, bebas', maxOut: 4096 }],
      },
      /*
       * Slots 3-5: the same reasoning as `custom2`, generalised.
       *
       * Two slots covered "two gateways at once". The readers who asked for more
       * are running more than two: a hosted gateway, a work gateway, and a local
       * one that is not Ollama's default port, for example. Each needs its own
       * id because the id is the API key's storage slot (`secrets.rs`) and the
       * value `activeProvider` holds - sharing one would make the entries
       * overwrite each other's key and make `activeProvider` ambiguous.
       *
       * `baseUrl` is empty on purpose, exactly like `custom` and `custom2`: an
       * OpenAI-compatible endpoint has no default, and guessing one would send a
       * key to a host the reader never chose.
       *
       * The `models` entries are placeholders (`freeText`), so they cost one row
       * each in the picker and never appear as a real model to run.
       */
      {
        id: 'custom3',
        label: 'Custom 3 (OpenAI-compatible)',
        baseUrl: '',
        envKey: 'OPENAI_API_KEY',
        logo: 'generic',
        freeText: true,
        models: [{ id: 'custom3-model', label: 'Type a model name', note: 'gateway ketiga, bebas', maxOut: 4096 }],
      },
      {
        id: 'custom4',
        label: 'Custom 4 (OpenAI-compatible)',
        baseUrl: '',
        envKey: 'OPENAI_API_KEY',
        logo: 'generic',
        freeText: true,
        models: [{ id: 'custom4-model', label: 'Type a model name', note: 'gateway keempat, bebas', maxOut: 4096 }],
      },
      {
        id: 'custom5',
        label: 'Custom 5 (OpenAI-compatible)',
        baseUrl: '',
        envKey: 'OPENAI_API_KEY',
        logo: 'generic',
        freeText: true,
        models: [{ id: 'custom5-model', label: 'Type a model name', note: 'gateway kelima, bebas', maxOut: 4096 }],
      },
    ];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

/**
 * `'auto'` — let Zephyr pick the provider.
 *
 * Not a provider id: it is the ABSENCE of a choice. The complaint was having to
 * pick one before anything worked, and picking is the wrong shape for a reader
 * who has filled in three gateways and just wants whichever answers.
 *
 * A string sentinel rather than an empty value because `activeProvider` is read
 * as a primitive in several places (`aiStore` init, `sinkronProvider`,
 * `aiZephyrState`), and `undefined` already means "settings not loaded yet" -
 * two different meanings on one value would make "no choice" and "not ready"
 * indistinguishable.
 *
 * `PROVIDER_BY_ID.has('auto')` is FALSE on purpose: every existing guard that
 * asks "is this a real provider?" keeps working and simply skips normalisation,
 * so `auto` cannot be mistaken for something to send a request to.
 */
export const PROVIDER_AUTO = 'auto';

/**
 * The provider to actually use, resolved from `activeProvider` and what has keys.
 *
 * Order, and why:
 *   1. An explicit provider that HAS a key wins. A deliberate choice must never
 *      be overridden by the resolver - that would make the setting a lie.
 *   2. Otherwise the first provider with a key, in catalogue order. Catalogue
 *      order, not `hasKey` order, so the same setup resolves the same way on
 *      every launch and on every machine with the same keys.
 *   3. Otherwise the explicit provider even without a key, so the UI can say
 *      "this one needs a key" instead of silently pointing somewhere else.
 *   4. Otherwise `'custom'`, the historical fallback.
 *
 * Pure: no store reads, no network. That is what lets the harness drive it.
 */
export function providerEfektif(
  activeProvider: string | null | undefined,
  punyaKunci: (id: string) => boolean,
): string {
  const aktif = (activeProvider ?? '').trim();
  const auto = !aktif || aktif === PROVIDER_AUTO;

  /* A real, deliberate choice that can actually send: honour it. */
  if (!auto && PROVIDER_BY_ID.has(aktif) && punyaKunci(aktif)) return aktif;

  /* Auto (or a choice with no key): the first provider in catalogue order. */
  const siap = PROVIDERS.find((p) => punyaKunci(p.id));
  if (siap) return siap.id;

  /* Nothing has a key. Keep a real choice so the UI can name what is missing. */
  if (!auto && PROVIDER_BY_ID.has(aktif)) return aktif;
  return 'custom';
}

/** Ids the catalogue ships as "type a name" slots, not real models. Derived
 *  from `freeText` providers so adding one cannot forget to update this. */
export const PLACEHOLDER_MODEL_IDS: ReadonlySet<string> = new Set(
  PROVIDERS.flatMap((p) => (p.freeText ? (p.models ?? []).map((m) => m.id) : [])),
);

/**
 * Every model id a provider can actually run right now.
 *
 * WHY this is shared instead of re-derived per component: the picker learned
 * (one bug at a time) that a usable id comes from FOUR places — the ids the
 * provider reported over the API, the ids the reader typed before, the ids
 * remembered in localStorage, and the catalogue's real entries — and that the
 * catalogue's "type a name" rows (`custom-model`, `local-default`) are prompts,
 * not models. Two components deriving that list separately is how the
 * HydraFusion tier rows ended up offering a single placeholder for a
 * custom gateway while the picker listed eighteen real models.
 *
 * `remote` is the live API list, `uiRemote` the settings page's copy of it,
 * `saved` the typed-and-remembered ids.
 */
export function modelTersedia(
  providerId: string,
  remote: readonly string[] = [],
  uiRemote: readonly string[] = [],
  saved: readonly string[] = [],
): Array<{ id: string; label: string; note?: string; ctx?: number }> {
  const p = PROVIDER_BY_ID.get(providerId);
  if (!p) return [];
  const live = [...remote, ...uiRemote].filter((id, i, a) => !!id && a.indexOf(id) === i);
  const dariApi = live
    .filter((id) => !MODEL_BY_ID.has(id) && !isPlaceholderModel(id))
    .map((id) => ({ id, label: id, note: 'from provider' }));
  const tersimpan = saved
    .filter((id) => !MODEL_BY_ID.has(id) && !live.includes(id) && !isPlaceholderModel(id))
    .map((id) => ({ id, label: id }));
  const katalog = (p.models ?? [])
    .filter((m) => !isPlaceholderModel(m.id))
    .map((m) => ({ id: m.id, label: m.label, note: m.note, ctx: m.ctx }));
  const semua = [...dariApi, ...tersimpan, ...katalog];
  const uniq = new Map<string, { id: string; label: string; note?: string; ctx?: number }>();
  for (const m of semua) if (!uniq.has(m.id)) uniq.set(m.id, m);
  return [...uniq.values()];
}

export function isPlaceholderModel(id: string | null | undefined): boolean {
  return !!id && PLACEHOLDER_MODEL_IDS.has(id.trim());
}

/**
 * The base URL that will actually be used: what the user configured in
 * Settings, else what the catalogue ships. `custom` ships an EMPTY base URL on
 * purpose - there is no sensible default for an OpenAI-compatible endpoint -
 * so until the user fills it in, this returns '' and the provider is not ready.
 */
export function baseUrlEfektif(
  providerId: string,
  overrides?: Record<string, { baseUrl?: string } | undefined>,
): string {
  const configured = (overrides ?? {})[providerId]?.baseUrl;
  if (typeof configured === 'string' && configured.trim()) return configured.trim();
  return PROVIDER_BY_ID.get(providerId)?.baseUrl ?? '';
}

/**
 * Is this provider usable right now?
 *
 * A stored API key is not enough on its own. `custom` accepts any key, but with
 * no base URL there is nowhere to send the request, so the UI used to claim
 * "key saved for this provider" while every send failed. Requiring the endpoint
 * too fixes that, and it also keeps the provider out of the picker until the
 * user has actually configured it.
 */
export function providerSiap(
  p: ProviderInfo,
  hasKey: boolean,
  overrides?: Record<string, { baseUrl?: string } | undefined>,
): boolean {
  // BOTH are required. This returned true on the key alone, so a `custom`
  // provider with a saved key and no endpoint was reported as ready and every
  // send failed with nowhere to go — the exact case the doc comment above
  // describes as fixed. A provider with a built-in base URL still passes, since
  // baseUrlEfektif falls back to the catalogue default.
  return hasKey && baseUrlEfektif(p.id, overrides).length > 0;
}

export interface ModelDef extends ProviderModel {
  provider: string;
  providerLabel: string;
  logo: LogoId;
  baseUrl: string;
  envKey: string;
}

export const ALL_MODELS: ModelDef[] = PROVIDERS.flatMap((p) =>
  p.models.map((m) => ({
    ...m,
    provider: p.id,
    providerLabel: p.label,
    logo: p.logo,
    baseUrl: p.baseUrl,
    envKey: p.envKey,
  })),
);

export const MODEL_BY_ID = new Map(ALL_MODELS.map((m) => [m.id, m]));

/**
 * Fallback candidates, read straight from the catalogue.
 *
 * `freeText` is carried per model here on purpose: the agent's fallback search
 * has to know that custom/local providers have no real alternatives, and that
 * fact lives on the provider - so it is resolved once, here, instead of being
 * re-derived (or forgotten) by every caller.
 *
 * Never hand-write this list elsewhere: it would drift from the models the app
 * actually offers and quietly rot.
 */
export const MODEL_FALLBACK: readonly {
  id: string;
  provider: string;
  ctx?: number;
  freeText: boolean;
}[] = ALL_MODELS.map((m) => ({
  id: m.id,
  provider: m.provider,
  ctx: m.ctx,
  freeText: PROVIDER_BY_ID.get(m.provider)?.freeText ?? false,
}));

/*
 * A formatter, NOT a validator: it never throws and never rejects an id. Given
 * an unknown id it echoes it back (free-text providers really do serve ids the
 * catalogue has never heard of). Callers that must REFUSE a placeholder check
 * `isPlaceholderModel` themselves - see `aiStore.setModel`.
 */
/*
 * Ceiling output bawaan untuk sebuah model, saat katalog tidak menyebutkannya.
 *
 * Angka ini penting dan dulu salah. Provider free-text (Custom endpoint) tidak
 * punya daftar model, jadi `findModel` mengembalikan `maxOut: undefined` dan
 * setiap pemanggil jatuh ke `?? 4096`. Akibatnya model berjendela besar seperti
 * `deepseek-v4.1-flash` - yang sebenarnya sanggup 64k token keluaran - dipaksa
 * berhenti di 4k.
 *
 * Kerusakannya bukan sekadar jawaban pendek. `write_file` mengirim ISI BERKAS
 * sebagai argumen tool, jadi menulis `index.html` 8 KB butuh lebih dari 4k
 * token. Output terpotong di tengah JSON, `serde_json` gagal parse, Zephyr
 * melaporkan "malformed JSON arguments", lalu langkah berikutnya ikut ditolak
 * provider dengan 400. Yang dilihat user: "bikin website" gagal di langkah
 * ketiga, tepat sebelum berkas pertama ditulis.
 *
 * Tebakan dari NAMA model lebih baik daripada satu angka tetap: nama model
 * membawa keluarga dan generasinya, dan keluarga itulah yang menentukan
 * ceiling. Yang tidak dikenali tetap dapat angka konservatif (16k) - salah
 * tebak ke arah kecil hanya memperpendek jawaban, sedangkan salah tebak ke arah
 * besar bisa ditolak provider. 16k, bukan 4096, karena `write_file` mengirim
 * isi berkas sebagai argumen tool: 4096 memotong penulisan satu berkas HTML di
 * tengah dan membuat langkah agent gagal ("malformed JSON arguments").
 */
export function maxOutBawaan(modelId: string): number {
  const s = modelId.toLowerCase();
  /*
   * Keluarga besar: generasi 4+ dan varian "pro"/"max". 32k aman untuk semua
   * gateway yang sudah terbukti melayani model ini.
   */
  if (/(?:^|[^0-9])v?[4-9](?:\.[0-9]+)?(?:[^0-9]|$)/.test(s) || /pro|max|ultra/.test(s)) {
    return 32768;
  }
  /*
   * Gateway "combo"/VIP routes (mis. ModelRouter `mr-vip` = "MR VIP Fast Combo",
   * konteks 1M). Namanya tidak membawa nomor generasi, jadi tanpa arm ini ia
   * jatuh ke 4096 — dan `write_file` mengirim ISI berkas sebagai argumen tool,
   * sehingga menulis satu berkas HTML melewati 4096 token, argumen JSON-nya
   * terpotong di tengah ("malformed JSON arguments"), dan langkah agent gagal.
   * Route combo ini mewakili model frontier, jadi 32k adalah ceiling yang benar.
   */
  if (/\bvip\b|combo/.test(s)) return 32768;
  if (/flash|lite|mini|turbo|haiku/.test(s)) return 16384;
  if (/o[1-9]|gpt-[5-9]/.test(s)) return 32768;
  /*
   * Baseline. 4096 dulu dipakai sebagai "aman", tapi itu justru memotong
   * argumen `write_file` untuk model gateway modern yang tidak cocok pola di
   * atas (mis. `space-bunny`, `godmode`, `muse-spark`) — semuanya sanggup jauh
   * lebih besar. 16k menutup penulisan berkas yang wajar tanpa melampaui
   * kapasitas gateway kompatibel-OpenAI mana pun yang sudah terbukti dipakai.
   */
  return 16384;
}

export function findModel(modelId: string, providerId?: string): ModelDef {
  const p = PROVIDER_BY_ID.get(providerId ?? 'custom') ?? PROVIDERS[PROVIDERS.length - 1];

  const hit = MODEL_BY_ID.get(modelId);

  if (hit && hit.provider === p.id) return hit;

  /*
   * Pencocokan silang provider.
   *
   * `MODEL_BY_ID` mengembalikan model dari provider mana pun. Blok `freeText`
   * dulu dibatasi ke `PROVIDER_BY_ID`, sehingga model yang SAMA tapi dipanggil
   * lewat Custom endpoint tidak pernah ketemu entri katalognya - dan Custom
   * endpoint-lah yang dipakai untuk semua gateway kompatibel-OpenAI. Akibatnya
   * `maxOut` selalu jatuh ke bawaan, walau modelnya ada di katalog dengan angka
   * yang jauh lebih besar.
   *
   * Kalau id-nya cocok tapi providernya berbeda, tetap pakai entri katalog itu
   * untuk ANGKA-angkanya (maxOut, ctx) sambil mempertahankan provider dan
   * baseUrl yang benar-benar dipakai user. Yang menentukan ceiling keluaran
   * adalah MODELNYA, bukan siapa yang menjual akses ke sana.
   */
  if (hit) {
    return {
      ...hit,
      provider: p.id,
      providerLabel: p.label,
      baseUrl: p.baseUrl || hit.baseUrl,
      envKey: p.envKey || hit.envKey,
      maxOut: hit.maxOut ?? maxOutBawaan(modelId),
    };
  }

  return {
    id: modelId,
    label: modelId || p.models?.[0]?.label || p.label,
    provider: p.id,
    providerLabel: p.label,
    logo: p.logo,
    baseUrl: p.baseUrl,
    envKey: p.envKey,
    /*
     * Deteksi nama LEBIH DULU, angka provider sebagai cadangan.
     *
     * Provider free-text tidak punya entri katalog untuk id yang diketik user,
     * dan `p.models[0].maxOut` adalah angka CONTOH untuk model bawaan provider
     * itu - bukan ceiling id yang benar-benar dipakai. Provider `custom`
     * mendaftarkan 4096 di sana, jadi setiap id yang diketik user - termasuk
     * `deepseek-v4.1-flash` dan `gpt-4o` - dipaksa berhenti di 4096 token
     * keluaran walau modelnya sanggup 64k-131k.
     *
     * Akibatnya bukan sekadar jawaban pendek: `write_file` mengirim ISI BERKAS
     * sebagai argumen tool, jadi menulis satu berkas HTML melewati batas itu,
     * outputnya terpotong di tengah JSON, dan langkah setelahnya ditolak
     * provider dengan 400.
     */
    maxOut: maxOutBawaan(modelId) ?? p.models?.[0]?.maxOut,
  };
}

export function fmtCtx(ctx?: number): string {
  if (!ctx) return '';
  if (ctx >= 1_000_000) return `${ctx / 1_000_000}M ctx`;
  return `${Math.round(ctx / 1000)}K ctx`;
}

export const ProviderLogo = memo(function ProviderLogo({ id, size = 16 }: { id: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', role: 'img' as const };

  const logo = PROVIDER_BY_ID.get(id)?.logo ?? (id as LogoId);

  switch (logo) {
    case 'gemini':

      return (
        <svg {...p} aria-label="Google Gemini">
          <defs>
            <linearGradient id={`zg-gem-${size}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4285f4" />
              <stop offset="55%" stopColor="#9b72cb" />
              <stop offset="100%" stopColor="#d01875" />
            </linearGradient>
          </defs>
          <path
            d="M8 1.4c.72 3.62 2.98 5.88 6.6 6.6-3.62.72-5.88 2.98-6.6 6.6-.72-3.62-2.98-5.88-6.6-6.6C5.02 7.28 7.28 5.02 8 1.4z"
            fill={`url(#zg-gem-${size})`}
          />
        </svg>
      );
    case 'openai':

      return (
        <svg {...p} aria-label="OpenAI">
          <path
            d="M8 1.9l3.9 2.25v4.5L8 10.9 4.1 8.65v-4.5L8 1.9z"
            fill="none"
            stroke="#10a37f"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M8 5.1l2.6 1.5v3L8 11.1 5.4 9.6v-3L8 5.1z"
            fill="none"
            stroke="#10a37f"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path d="M8 10.9v3.2" fill="none" stroke="#10a37f" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      );
    case 'anthropic':

      return (
        <svg {...p} aria-label="Anthropic">
          <path
            d="M5.05 13.4L8 2.6l2.95 10.8"
            fill="none"
            stroke="#d97757"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
          <path d="M6.25 9.7h3.5" fill="none" stroke="#d97757" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      );
    case 'deepseek':

      return (
        <svg {...p} aria-label="DeepSeek">
          <path
            d="M2.4 9.6c2.5 1.7 5.4 2.3 8.3-.2 1.25-1.05 2.1-2.5 2.5-4.2-1.25 1.45-2.7 2.3-4.35 2.3-2.5 0-4.15-1.45-6.45-1.45"
            fill="none"
            stroke="#4d6bfe"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="11.5" cy="5.1" r="1" fill="#4d6bfe" />
        </svg>
      );
    case 'opencode':

      return (
        <svg {...p} aria-label="opencode">
          <path
            d="M5.2 3.2C3.6 3.2 3.8 7 2.4 8c1.4 1 1.2 4.8 2.8 4.8M10.8 3.2c1.6 0 1.4 3.8 2.8 4.8-1.4 1-1.2 4.8-2.8 4.8"
            fill="none"
            stroke="#f5a623"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8" r="1.9" fill="none" stroke="#f5a623" strokeWidth="1.3" />
        </svg>
      );
    case 'xai':
      return (
        <svg {...p} aria-label="xAI">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...p} aria-label="Custom">
          <rect x="2.6" y="2.6" width="10.8" height="10.8" rx="2.4" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
          <path d="M8 5.6v4.8M5.6 8h4.8" fill="none" stroke="var(--accent)" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
  }
});

/*
 * Per-model mark.
 *
 * The provider logo alone is not enough inside a group: a custom endpoint can
 * list deepseek, claude and gemini side by side, and they all came out as the
 * same generic square — the list read as a wall of identical rows.
 *
 * The mark is derived from the model id, so a model that arrives from the
 * provider's /models endpoint gets its family mark without any per-model
 * configuration. Unknown ids fall back to a neutral dot, which still separates
 * them from the known families at a glance.
 */
export type ModelFamily =
  | 'gemini'
  | 'claude'
  | 'gpt'
  | 'deepseek'
  | 'grok'
  | 'llama'
  | 'mistral'
  | 'qwen'
  | 'kimi'
  | 'ollama'
  | 'lmstudio'
  | 'huggingface'
  | 'perplexity'
  | 'copilot'
  | 'glm'
  | 'minimax'
  | 'nvidia'
  | 'tencent'
  | 'bytedance'
  | 'longcat'
  | 'mimo'
  | 'stepfun'
  | 'baidu'
  | 'spark'
  | 'yi'
  | 'baichuan'
  | 'together'
  | 'groq'
  | 'cerebras'
  | 'openrouter'
  | 'azure'
  | 'bedrock'
  | 'vertexai'
  | 'antgroup'
  | 'siliconcloud'
  | 'fireworks'
  | 'unknown';

/*
 * Ordered longest-match-first where names overlap.
 *
 * `glm` before `gpt` matters: "glm-5.3" would otherwise be caught by nothing,
 * but a pattern like `m-` would misfire. Each rule is anchored on a real model
 * name prefix seen in the wild or in the catalogue.
 */
export function modelFamily(id: string): ModelFamily {
  const s = id.toLowerCase();
  if (/gemini|gemma|palm|nano-banana/.test(s)) return 'gemini';
  if (/claude|sonnet|opus|haiku|fable|anthropic/.test(s)) return 'claude';
  if (/copilot/.test(s)) return 'copilot';
  if (/gpt|o[1-9](-|$)|openai|davinci|codex/.test(s)) return 'gpt';
  if (/deepseek/.test(s)) return 'deepseek';
  if (/grok|xai/.test(s)) return 'grok';
  if (/llama|meta-/.test(s)) return 'llama';
  if (/mistral|mixtral|codestral|devstral/.test(s)) return 'mistral';
  if (/qwen|tongyi/.test(s)) return 'qwen';
  if (/kimi|moonshot/.test(s)) return 'kimi';
  if (/glm|chatglm|zhipu/.test(s)) return 'glm';
  if (/minimax|abab/.test(s)) return 'minimax';
  if (/nemotron|nvidia/.test(s)) return 'nvidia';
  if (/hunyuan|tencent/.test(s)) return 'tencent';
  if (/doubao|bytedance|seed-/.test(s)) return 'bytedance';
  if (/longcat/.test(s)) return 'longcat';
  if (/mimo|xiaomi/.test(s)) return 'mimo';
  if (/stepfun|step-/.test(s)) return 'stepfun';
  if (/ernie|wenxin|baidu/.test(s)) return 'baidu';
  if (/spark/.test(s)) return 'spark';
  if (/^yi-|yi-lightning|01-ai/.test(s)) return 'yi';
  if (/baichuan/.test(s)) return 'baichuan';
  if (/together/.test(s)) return 'together';
  if (/groq/.test(s)) return 'groq';
  if (/cerebras/.test(s)) return 'cerebras';
  if (/openrouter/.test(s)) return 'openrouter';
  if (/azure/.test(s)) return 'azure';
  if (/bedrock/.test(s)) return 'bedrock';
  if (/vertex/.test(s)) return 'vertexai';
  if (/ling|inclusion|bailing/.test(s)) return 'antgroup';
  if (/silicon/.test(s)) return 'siliconcloud';
  if (/fireworks/.test(s)) return 'fireworks';
  if (/ollama/.test(s)) return 'ollama';
  if (/lm-?studio/.test(s)) return 'lmstudio';
  if (/hugging|hf\./.test(s)) return 'huggingface';
  if (/perplexity|sonar/.test(s)) return 'perplexity';
  return 'unknown';
}

/*
 * Per-model mark.
 *
 * Three cases, in order:
 *   1. A known brand family -> the official brand path.
 *   2. No known brand, but a usable name -> initials on a tinted disc. A model
 *      like "space-bunny" or a custom endpoint's "mr-vip" has no published
 *      mark; initials still give the row its own identity, and they never claim
 *      to be a brand that is not theirs.
 *   3. No usable name -> a neutral dot.
 *
 * The tint is derived from the name, so the same model always gets the same
 * colour without storing anything.
 */
const WARNA_INISIAL = [
  '#5B8DEF',
  '#E0725A',
  '#4FA96B',
  '#B478E0',
  '#D9A441',
  '#4BA8B8',
  '#D06A9C',
  '#7A8FE0',
];

/** Two letters that stand for the model: "space-bunny" -> "SB". */
function inisial(id: string): string {
  const bersih = id.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  if (!bersih) return '?';
  const kata = bersih.split(/\s+/).filter(Boolean);
  if (kata.length >= 2) return (kata[0][0] + kata[1][0]).toUpperCase();
  return bersih.slice(0, 2).toUpperCase();
}

/** Stable colour index for a name, so a model keeps its colour across renders. */
function warnaInisial(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return WARNA_INISIAL[h % WARNA_INISIAL.length];
}

export const ModelLogo = memo(function ModelLogo({
  id,
  size = 15,
}: {
  id: string;
  size?: number;
}) {
  const fam = modelFamily(id);
  const mark = BRAND_MARKS[fam];

  if (mark) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={fam}
        style={{ flexShrink: 0, color: mark.warna ?? undefined }}
      >
        <path d={mark.d} fill={mark.warna ?? 'currentColor'} />
      </svg>
    );
  }

  // A placeholder id ("Type the model name", "custom-model") gets no initials:
  // they would read as a real model name rather than an empty slot.
  const kosong = isPlaceholderModel(id);
  if (kosong) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        role="img"
        aria-label="unknown"
        style={{ flexShrink: 0 }}
      >
        <circle
          cx="8"
          cy="8"
          r="2.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.5"
        />
      </svg>
    );
  }

  const teks = inisial(id);
  const warna = warnaInisial(id);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={id}
      style={{ flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="7.4" fill={warna} opacity="0.22" />
      <text
        x="8"
        y="8"
        textAnchor="middle"
        dominantBaseline="central"
        fill={warna}
        fontSize={teks.length > 1 ? 6.6 : 8}
        fontWeight="700"
        fontFamily="var(--font-ui, sans-serif)"
      >
        {teks}
      </text>
    </svg>
  );
});
