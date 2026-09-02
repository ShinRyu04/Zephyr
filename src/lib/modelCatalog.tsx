// modelCatalog.ts — katalog provider AI + logo brand + model (fase 08).
//
// apiKey TIDAK ADA di sini dan tidak pernah masuk store: key hidup di Rust
// (`secrets.rs`), frontend hanya tahu `hasKey` + preview mask.

export interface ProviderModel {
  id: string;
  label: string;
  /** keterangan kecil di dropdown (konteks/harga kasar) */
  note?: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  /** base URL resmi (bisa ditimpa user di Settings) */
  baseUrl: string;
  /** nama env var yang lazim dipakai CLI provider ini */
  envKey: string;
  models: ProviderModel[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    envKey: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'cepat, murah' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'penalaran panjang' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    models: [
      { id: 'gpt-5.2', label: 'GPT-5.2', note: 'kualitas tertinggi' },
      { id: 'gpt-5.1-mini', label: 'GPT-5.1 mini', note: 'hemat' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    models: [
      { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5', note: 'seimbang' },
      { id: 'claude-haiku-3.5', label: 'Claude Haiku 3.5', note: 'cepat' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat', note: 'umum' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', note: 'penalaran' },
    ],
  },
  {
    id: 'local',
    label: 'Lokal (opencode / loopback)',
    baseUrl: 'http://127.0.0.1:4096/v1',
    envKey: 'OPENAI_API_KEY',
    models: [{ id: 'local-default', label: 'Model lokal', note: 'tanpa biaya' }],
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    envKey: 'OPENAI_API_KEY',
    models: [{ id: 'custom-model', label: 'Isi sendiri', note: 'tulis nama model' }],
  },
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

/** Logo brand provider. Warna brand resmi (pengecualian sah dari aturan
 *  "dilarang hex hardcoded" — ini identitas pihak ketiga, bukan token tema). */
export function ProviderLogo({ id, size = 16 }: { id: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', role: 'img' as const };

  switch (id) {
    case 'gemini':
      return (
        <svg {...p} aria-label="Google Gemini">
          <path d="M8 1.6c.7 3.5 2.9 5.7 6.4 6.4-3.5.7-5.7 2.9-6.4 6.4-.7-3.5-2.9-5.7-6.4-6.4C5.1 7.3 7.3 5.1 8 1.6z" fill="#4285f4" />
        </svg>
      );
    case 'openai':
      return (
        <svg {...p} aria-label="OpenAI">
          <circle cx="8" cy="8" r="5.6" fill="none" stroke="#10a37f" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="1.8" fill="#10a37f" />
        </svg>
      );
    case 'anthropic':
      return (
        <svg {...p} aria-label="Anthropic">
          <path d="M8 2v12M2.9 4.9l10.2 6.2M13.1 4.9L2.9 11.1" fill="none" stroke="#d97757" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'deepseek':
      return (
        <svg {...p} aria-label="DeepSeek">
          <path d="M2.6 9.4c2.4 1.6 5.2 2.2 8-.2 1.2-1 2-2.4 2.4-4-1.2 1.4-2.6 2.2-4.2 2.2-2.4 0-4-1.4-6.2-1.4" fill="none" stroke="#4d6bfe" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="11.4" cy="5.2" r="1" fill="#4d6bfe" />
        </svg>
      );
    case 'local':
      return (
        <svg {...p} aria-label="Lokal">
          <path d="M6 3.2C4.4 3.2 4.6 7 3.2 8c1.4 1 1.2 4.8 2.8 4.8M10 3.2c1.6 0 1.4 3.8 2.8 4.8-1.4 1-1.2 4.8-2.8 4.8" fill="none" stroke="#f5a623" strokeWidth="1.3" strokeLinecap="round" />
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
