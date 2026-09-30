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
                  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'seimbang (lama)', ctx: 200_000, maxOut: 8192 },
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
            {
              id: 'xai',
              label: 'xAI (Grok)',
              baseUrl: 'https://api.x.ai/v1',
              envKey: 'XAI_API_KEY',
              logo: 'xai',
              models: [
                { id: 'grok-4.6', label: 'Grok 4.6', note: 'terbaru, coding & agent', ctx: 500_000, maxOut: 131_072 },
                { id: 'grok-4.5', label: 'Grok 4.5', note: 'coding & agent', ctx: 500_000, maxOut: 131_072 },
                { id: 'grok-4.3', label: 'Grok 4.3', note: 'flagship, reasoning', ctx: 1_000_000, maxOut: 131_072 },
                { id: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 Reasoning', note: 'reasoning dalam', ctx: 1_000_000, maxOut: 131_072 },
                { id: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 Non-Reasoning', note: 'cepat', ctx: 1_000_000, maxOut: 131_072 },
                { id: 'grok-4.20-multi-agent-0309', label: 'Grok 4.20 Multi-Agent', note: 'orkestrasi agent', ctx: 1_000_000, maxOut: 131_072 },
                { id: 'grok-build-0.1', label: 'Grok Build 0.1', note: 'khusus coding', ctx: 256_000, maxOut: 131_072 },
                { id: 'grok-4', label: 'Grok 4', note: 'generasi 4', ctx: 1_000_000, maxOut: 131_072 },
              ],
            },
      {
        id: 'local',
        label: 'Lokal (opencode / loopback)',
        baseUrl: 'http://127.0.0.1:4096/v1',
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
    ];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

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

export function findModel(modelId: string, providerId?: string): ModelDef {
  const p = PROVIDER_BY_ID.get(providerId ?? 'custom') ?? PROVIDERS[PROVIDERS.length - 1];

  const hit = MODEL_BY_ID.get(modelId);

  if (hit && hit.provider === p.id) return hit;

  if (p.freeText) {
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

  if (hit) return hit;

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
  const kosong = /^(type|ketik|custom-model|local-default|\?)/i.test(id.trim());
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
