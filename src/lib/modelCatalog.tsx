// modelCatalog.tsx — katalog provider AI + model + logo brand.
//
// Dipakai bersama oleh: dropdown model di AI panel (fase 09),
// Settings → Model AI (fase 08), dan StatusBar.
//
// apiKey TIDAK ADA di sini dan tidak pernah masuk store: key hidup di Rust
// (`secrets.rs`), frontend hanya tahu `hasKey` + preview mask.

export type LogoId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'groq'
  | 'xai'
  | 'openrouter'
  | 'mistral'
  | 'cerebras'
  | 'ollama'
  | 'opencode'
  | 'generic';

export interface ProviderModel {
  id: string;
  label: string;
  /** keterangan kecil di dropdown (konteks/harga kasar) */
  note?: string;
  /** jendela konteks (token) — ditampilkan di dropdown */
  ctx?: number;
  /** batas token keluaran yang dikirim ke provider */
  maxOut?: number;
}

export interface ProviderInfo {
  id: string;
  label: string;
  /** base URL resmi (bisa ditimpa user di Settings) */
  baseUrl: string;
  /** nama env var yang lazim dipakai CLI provider ini */
  envKey: string;
  /** logo brand yang dipakai untuk seluruh model provider ini */
  logo: LogoId;
  models: ProviderModel[];
  /** true = user boleh mengetik nama model bebas (custom/local). */
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
          { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'cepat, murah', ctx: 1_000_000, maxOut: 65536 },
          { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', note: 'multimodal', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'hemat', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', note: 'penalaran dalam', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', note: 'murah, cepat', ctx: 1_048_576, maxOut: 65536 },
          { id: 'gemini-3.1-flash-image', label: 'Nano Banana 2 (gambar)', note: 'generate/edit gambar', ctx: 1_000_000, maxOut: 65536 },
          { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'penalaran panjang', ctx: 2_000_000, maxOut: 65536 },
          { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'cepat', ctx: 1_000_000, maxOut: 65536 },
          { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', note: 'hemat', ctx: 1_000_000, maxOut: 65536 },
          { id: 'gemini-2.5-flash-image', label: 'Nano Banana (gambar)', note: 'generate/edit gambar', ctx: 1_000_000, maxOut: 65536 },
                    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'lama, ringan', ctx: 1_000_000, maxOut: 8192 },
                    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', note: 'lama, kuat', ctx: 2_000_000, maxOut: 8192 },
                    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', note: 'lama, cepat', ctx: 1_000_000, maxOut: 8192 },
                    { id: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro', note: 'paling awal', ctx: 32_768, maxOut: 2048 },
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
                  { id: 'gpt-4.1', label: 'GPT-4.1', note: 'lama', ctx: 1_000_000, maxOut: 32768 },
                  { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', note: 'lama, hemat', ctx: 1_000_000, maxOut: 32768 },
                  { id: 'gpt-4o', label: 'GPT-4o', note: 'lama', ctx: 128_000, maxOut: 16384 },
                  { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'lama, murah', ctx: 128_000, maxOut: 16384 },
                                    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', note: 'lama', ctx: 128_000, maxOut: 4096 },
                                                      { id: 'gpt-4', label: 'GPT-4', note: 'lama', ctx: 8192, maxOut: 8192 },
                                                      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', note: 'paling awal', ctx: 16_385, maxOut: 4096 },
                                                      { id: 'o1', label: 'o1', note: 'reasoning (lama)', ctx: 200_000, maxOut: 100_000 },
                                                      { id: 'o1-mini', label: 'o1-mini', note: 'reasoning hemat', ctx: 128_000, maxOut: 65536 },
                                                      { id: 'o1-preview', label: 'o1-preview', note: 'reasoning preview', ctx: 128_000, maxOut: 32768 },
                                                      { id: 'o3', label: 'o3', note: 'reasoning (lama)', ctx: 200_000, maxOut: 100_000 },
                                                      { id: 'o3-mini', label: 'o3-mini', note: 'reasoning hemat', ctx: 200_000, maxOut: 100_000 },
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
                  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'seimbang (lama)', ctx: 200_000, maxOut: 8192 },
                  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'cepat, hemat', ctx: 200_000, maxOut: 64000 },
                  { id: 'claude-3.7-sonnet', label: 'Claude 3.7 Sonnet', note: 'lama, hybrid', ctx: 200_000, maxOut: 64000 },
                  { id: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', note: 'lama', ctx: 200_000, maxOut: 8192 },
                  { id: 'claude-3.5-haiku', label: 'Claude 3.5 Haiku', note: 'lama, cepat', ctx: 200_000, maxOut: 8192 },
                                    { id: 'claude-3-opus', label: 'Claude 3 Opus', note: 'lama', ctx: 200_000, maxOut: 4096 },
                                    { id: 'claude-3-sonnet', label: 'Claude 3 Sonnet', note: 'lama', ctx: 200_000, maxOut: 4096 },
                                    { id: 'claude-3-haiku', label: 'Claude 3 Haiku', note: 'paling awal keluarga 3, cepat', ctx: 200_000, maxOut: 4096 },
                                    { id: 'claude-2.1', label: 'Claude 2.1', note: 'lama', ctx: 200_000, maxOut: 4096 },
                                    { id: 'claude-2', label: 'Claude 2', note: 'lama', ctx: 100_000, maxOut: 4096 },
                                    { id: 'claude-1', label: 'Claude 1', note: 'paling awal', ctx: 9_000, maxOut: 4096 },
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
                        { id: 'deepseek-chat', label: 'DeepSeek Chat (V3.2)', note: 'umum, versi lama', ctx: 128_000, maxOut: 8192 },
                                                { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1/V3.2)', note: 'penalaran, versi lama', ctx: 128_000, maxOut: 8192 },
                                                { id: 'deepseek-coder', label: 'DeepSeek Coder', note: 'coding, lama', ctx: 128_000, maxOut: 8192 },
                                                { id: 'deepseek-v3', label: 'DeepSeek V3', note: 'lama', ctx: 128_000, maxOut: 8192 },
                                              ],
      },
      {
        id: 'groq',
        label: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        envKey: 'GROQ_API_KEY',
        logo: 'groq',
        models: [
          { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', note: 'cepat, serbaguna', ctx: 128_000, maxOut: 32768 },
          { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', note: 'ultra cepat', ctx: 128_000, maxOut: 8192 },
          { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B', note: 'MoE', ctx: 32_768, maxOut: 4096 },
        ],
      },
      {
        id: 'openrouter',
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        envKey: 'OPENROUTER_API_KEY',
        logo: 'openrouter',
        freeText: true,
        models: [
          { id: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet (Router)', note: 'frontier', ctx: 200_000, maxOut: 64000 },
          { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (Router)', note: 'open weights', ctx: 128_000, maxOut: 32768 },
          { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (Router)', note: 'ekonomis', ctx: 128_000, maxOut: 8192 },
        ],
      },
      {
        id: 'xai',
        label: 'xAI (Grok)',
        baseUrl: 'https://api.x.ai/v1',
        envKey: 'XAI_API_KEY',
        logo: 'xai',
        models: [
          { id: 'grok-2-latest', label: 'Grok 2', note: 'terbaru, penalaran', ctx: 131_072, maxOut: 8192 },
          { id: 'grok-2-mini', label: 'Grok 2 Mini', note: 'ringan, cepat', ctx: 131_072, maxOut: 8192 },
        ],
      },
      {
        id: 'mistral',
        label: 'Mistral AI',
        baseUrl: 'https://api.mistral.ai/v1',
        envKey: 'MISTRAL_API_KEY',
        logo: 'mistral',
        models: [
          { id: 'mistral-large-latest', label: 'Mistral Large', note: 'flagship', ctx: 128_000, maxOut: 32768 },
          { id: 'codestral-latest', label: 'Codestral', note: 'khusus coding', ctx: 256_000, maxOut: 32768 },
          { id: 'mistral-small-latest', label: 'Mistral Small', note: 'hemat, cepat', ctx: 128_000, maxOut: 8192 },
        ],
      },
      {
        id: 'cerebras',
        label: 'Cerebras',
        baseUrl: 'https://api.cerebras.ai/v1',
        envKey: 'CEREBRAS_API_KEY',
        logo: 'cerebras',
        models: [
          { id: 'llama3.3-70b', label: 'Llama 3.3 70B (Cerebras)', note: 'kecepatan wafer', ctx: 128_000, maxOut: 8192 },
          { id: 'llama3.1-8b', label: 'Llama 3.1 8B (Cerebras)', note: 'ultra low latency', ctx: 128_000, maxOut: 8192 },
        ],
      },
      {
        id: 'ollama',
        label: 'Ollama (Lokal)',
        baseUrl: 'http://127.0.0.1:11434/v1',
        envKey: 'OLLAMA_API_KEY',
        logo: 'ollama',
        freeText: true,
        models: [
          { id: 'qwen2.5-coder:latest', label: 'Qwen 2.5 Coder', note: 'lokal coding', ctx: 32_768, maxOut: 4096 },
          { id: 'llama3.2:latest', label: 'Llama 3.2', note: 'lokal ringan', ctx: 128_000, maxOut: 4096 },
          { id: 'deepseek-r1:latest', label: 'DeepSeek R1 (Lokal)', note: 'lokal reasoning', ctx: 32_768, maxOut: 4096 },
        ],
      },
      {
        id: 'local',
        label: 'Lokal (opencode / loopback)',
        baseUrl: 'http://127.0.0.1:4096/v1',
        envKey: 'OPENAI_API_KEY',
        logo: 'opencode',
        freeText: true,
        models: [{ id: 'local-default', label: 'Ketik nama model lokal', note: 'mis. qwen3-coder:32b', maxOut: 4096 }],
      },
      {
        id: 'custom',
        label: 'Custom (OpenAI-compatible)',
        baseUrl: '',
        envKey: 'OPENAI_API_KEY',
        logo: 'generic',
        freeText: true,
        models: [{ id: 'custom-model', label: 'Ketik nama model', note: 'bebas, sesuaikan provider', maxOut: 4096 }],
      },
    ];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

/** Satu baris pilihan di dropdown AI panel: model + provider asalnya. */
export interface ModelDef extends ProviderModel {
  provider: string;
  providerLabel: string;
  logo: LogoId;
  baseUrl: string;
  envKey: string;
}

/** Semua model dari semua provider, urut sesuai katalog. */
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

/** Cari model; kalau id tak dikenal (mis. model custom yang diketik user),
 *  kembalikan entri sintetis milik provider aktif supaya UI tidak kosong. */
export function findModel(modelId: string, providerId?: string): ModelDef {
  const hit = MODEL_BY_ID.get(modelId);
  if (hit) return hit;
  const p = PROVIDER_BY_ID.get(providerId ?? 'custom') ?? PROVIDERS[PROVIDERS.length - 1];
  return {
    id: modelId,
    label: modelId || p.models[0].label,
    provider: p.id,
    providerLabel: p.label,
    logo: p.logo,
    baseUrl: p.baseUrl,
    envKey: p.envKey,
    maxOut: p.models[0].maxOut,
  };
}

/** Format ctx untuk label dropdown: 1_000_000 -> "1M", 128_000 -> "128K". */
export function fmtCtx(ctx?: number): string {
  if (!ctx) return '';
  if (ctx >= 1_000_000) return `${ctx / 1_000_000}M ctx`;
  return `${Math.round(ctx / 1000)}K ctx`;
}

/** Logo brand provider. Warna brand resmi (pengecualian sah dari aturan
 *  "dilarang hex hardcoded" — ini identitas pihak ketiga, bukan token tema). */
export function ProviderLogo({ id, size = 16 }: { id: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', role: 'img' as const };
  // Provider id maupun logo id keduanya diterima supaya pemanggil tidak
  // perlu memetakan dua kali.
  const logo = PROVIDER_BY_ID.get(id)?.logo ?? (id as LogoId);

  switch (logo) {
    case 'gemini':
      // Bintang 4-jari dengan gradien biru→magenta (identitas Gemini).
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
      // Bunga hexagon (6 kelopak) — outline, warna brand OpenAI.
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
      // Huruf "A" berkaki lebar ala mark Anthropic (bukan bintang).
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
      // Paus biru bergaya: lengkung badan + mata.
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
      // Huruf 'o' dalam kurung kurawal — CLI lokal.
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
    case 'groq':
      return (
        <svg {...p} aria-label="Groq">
          <circle cx="8" cy="8" r="6" fill="none" stroke="#f55036" strokeWidth="1.5" />
          <path d="M8 4.5v7M5.5 8h5" stroke="#f55036" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'xai':
      return (
        <svg {...p} aria-label="xAI">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      );
    case 'openrouter':
      return (
        <svg {...p} aria-label="OpenRouter">
          <rect x="3" y="3" width="10" height="10" rx="3" fill="none" stroke="#6366f1" strokeWidth="1.4" />
          <circle cx="8" cy="8" r="2" fill="#6366f1" />
        </svg>
      );
    case 'mistral':
      return (
        <svg {...p} aria-label="Mistral AI">
          <rect x="3" y="3" width="3" height="3" fill="#ff7000" />
          <rect x="7" y="3" width="3" height="3" fill="#ff7000" />
          <rect x="11" y="3" width="3" height="3" fill="#ff7000" />
          <rect x="3" y="7" width="3" height="3" fill="#ff7000" />
          <rect x="11" y="7" width="3" height="3" fill="#ff7000" />
          <rect x="3" y="11" width="3" height="3" fill="#ff7000" />
          <rect x="7" y="11" width="3" height="3" fill="#ff7000" />
          <rect x="11" y="11" width="3" height="3" fill="#ff7000" />
        </svg>
      );
    case 'cerebras':
      return (
        <svg {...p} aria-label="Cerebras">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke="#00c853" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.5" fill="#00c853" />
        </svg>
      );
    case 'ollama':
      return (
        <svg {...p} aria-label="Ollama">
          <circle cx="8" cy="8" r="6" fill="#1e293b" />
          <circle cx="6" cy="7" r="1" fill="#ffffff" />
          <circle cx="10" cy="7" r="1" fill="#ffffff" />
          <path d="M6 10q2 1.5 4 0" stroke="#ffffff" strokeWidth="1" fill="none" strokeLinecap="round" />
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
}
