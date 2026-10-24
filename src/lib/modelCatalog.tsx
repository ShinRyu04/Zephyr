import { memo } from 'react';
import { BRAND_MARKS } from './modelBrandIcons';

export type LogoId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'xai'
  | 'opencode'
  | 'mistral'
  | 'groq'
  | 'openrouter'
  | 'ollama'
  | 'zai'
  | 'minimax'
  | 'kimi'
  | 'byteplus'
  | 'novita'
  | 'aws'
  | 'azure'
  | 'vercel'
  | 'bigmodel'
  | 'volcano'
  | 'alibaba'
  | 'tencent'
  | 'gmi'
  | 'mimo'
  | 'siliconflow'
  | 'gitee'
  | 'ppio'
  | 'generic';

/**
 * What a model can DO, as opposed to how big it is.
 *
 * The picker used to answer only "how many tokens", so a reader had no way to
 * tell whether the model they were about to pick could see an image they had
 * just attached, or think before answering. The reference product shows exactly
 * this set in its detail panel, so the set is named here once and every surface
 * reads it from the same place.
 *
 * `memories` is deliberately NOT in this union: it is a Zephyr feature, not a
 * property of the remote model, so it is rendered from its own flag and never
 * inferred from a model name.
 */
export type Kemampuan = 'image' | 'reasoning' | 'tools';

export interface ProviderModel {
  id: string;
  label: string;

  note?: string;

  ctx?: number;

  maxOut?: number;

  /**
   * Capabilities reported by the provider itself, or inferred from the name
   * when the provider reports nothing. `undefined` means "not known", which is
   * different from "known to be unsupported": the UI draws a dimmed row for
   * unknown and a ticked row for known-supported, so an unknown never reads as
   * a confident "no".
   */
  bisa?: Kemampuan[];

  /** How the model is billed. `'token'` when the provider did not say. */
  biaya?: string;

  /** True when the provider serves this model for free. */
  gratis?: boolean;
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
      /*
       * ONE custom slot, and it is the only one.
       *
       * There used to be SIX: `local`, `custom`, and `custom2`..`custom5`.
       * They existed because the id is the API key's storage slot
       * (`secrets.rs` -> `map.insert(p, ...)`) and the value `activeProvider`
       * holds, so driving two gateways at once needed two ids.
       *
       * That reasoning was right about the constraint and wrong about the UI: it
       * put six near-identical rows in the provider grid and in the model
       * picker, all reading "Custom (OpenAI-compatible)", with no way to tell
       * which one held the key you were looking for. The reader pointed at the
       * reference, which offers exactly ONE "Custom Model" entry, and asked for
       * that.
       *
       * So there is one slot. A second gateway is added as a MODEL ROW with its
       * own `baseUrl` (see `models.custom[]` in types.ts) rather than as a
       * second provider — which is what the reader was doing anyway, since a
       * model carries the endpoint it came from.
       */
      {
        id: 'custom',
        label: 'Custom Model',
        baseUrl: '',
        envKey: 'OPENAI_API_KEY',
        logo: 'generic',
        freeText: true,
        models: [{ id: 'custom-model', label: 'Type a model name', note: 'bebas, sesuaikan provider', maxOut: 4096 }],
      },
      /*
       * The rest of the reference's provider list, limited to the ones whose
       * endpoint is a plain OpenAI-compatible `/v1` base — because that is the
       * only wire format Zephyr sends today.
       *
       * WHY THESE AND NOT ALL TWENTY-SIX: the reference lists regional resellers
       * (Volcano Engine, SiliconFlow CN, PPIO, Gitee…) whose value is a cheaper
       * route to the SAME models. Adding a tile that resolves to an endpoint
       * this build cannot talk to would be a button that fails after the reader
       * has already pasted a key — worse than not offering it. These are the
       * ones that work on the first request.
       *
       * Every `baseUrl` below is the vendor's documented OpenAI-compatible
       * base, and every model list is a starting point, not a catalogue: press
       * Refresh in Add Model and the provider reports what it actually serves.
       */
      /*
       * The provider list, in the REFERENCE'S ORDER.
       *
       * Order is copied deliberately: the reader holds the two dialogs side by
       * side, and a grid whose rows land differently reads as "wrong" even when
       * every entry is present.
       *
       * Every `baseUrl` is the vendor's documented OpenAI-compatible base. Two of
       * them (AWS, Azure) have no single endpoint - the address is per-account -
       * so they carry an empty URL and the form asks for it, rather than shipping
       * a guess that would fail on the first request.
       *
       * `freeText` is true everywhere: the shipped `models` are starting points,
       * and Refresh in Add Model replaces them with what the provider actually
       * serves. A hardcoded list would go stale the week after it shipped.
       */
      {
        id: 'xai',
        label: 'xAI',
        baseUrl: 'https://api.x.ai/v1',
        envKey: 'XAI_API_KEY',
        logo: 'xai',
        freeText: true,
        models: [
          { id: 'grok-4', label: 'Grok 4', note: 'penalaran', ctx: 256_000, maxOut: 32_000 },
          { id: 'grok-3', label: 'Grok 3', note: 'umum', ctx: 131_072, maxOut: 16_384 },
          { id: 'grok-code-fast-1', label: 'Grok Code Fast', note: 'coding', ctx: 256_000, maxOut: 32_000 },
        ],
      },
      {
        id: 'zai',
        label: 'Z.ai',
        baseUrl: 'https://api.z.ai/api/paas/v4',
        envKey: 'ZAI_API_KEY',
        logo: 'zai',
        freeText: true,
        models: [
          { id: 'glm-5.3', label: 'GLM-5.3', note: 'agentik', ctx: 204_800, maxOut: 131_072 },
          { id: 'glm-4.6', label: 'GLM-4.6', note: 'umum', ctx: 204_800, maxOut: 131_072 },
        ],
      },
      {
        id: 'minimax',
        label: 'MiniMax Global',
        baseUrl: 'https://api.minimax.io/v1',
        envKey: 'MINIMAX_API_KEY',
        logo: 'minimax',
        freeText: true,
        models: [
          { id: 'MiniMax-M2', label: 'MiniMax M2', note: 'agentik', ctx: 204_800, maxOut: 131_072 },
          { id: 'MiniMax-Text-01', label: 'MiniMax Text 01', note: 'konteks panjang', ctx: 1_000_000, maxOut: 40_000 },
        ],
      },
      {
        id: 'kimi',
        label: 'Kimi Global',
        baseUrl: 'https://api.moonshot.ai/v1',
        envKey: 'MOONSHOT_API_KEY',
        logo: 'kimi',
        freeText: true,
        models: [
          { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking', note: 'penalaran', ctx: 262_144, maxOut: 262_144 },
          { id: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo', note: 'cepat', ctx: 262_144, maxOut: 262_144 },
        ],
      },
      {
        id: 'byteplus',
        label: 'BytePlus',
        baseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3',
        envKey: 'BYTEPLUS_API_KEY',
        logo: 'byteplus',
        freeText: true,
        models: [
          { id: 'seed-1-6-250915', label: 'Seed 1.6', note: 'multimodal', ctx: 262_144, maxOut: 32_768 },
          { id: 'kimi-k2-250711', label: 'Kimi K2 (BytePlus)', note: 'agentik', ctx: 262_144, maxOut: 32_768 },
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
          { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (OR)', note: 'satu kunci, banyak model', ctx: 200_000, maxOut: 64_000 },
          { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (OR)', note: 'multimodal', ctx: 1_048_576, maxOut: 65_536 },
          { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3 (OR)', note: 'hemat', ctx: 163_840, maxOut: 8_192 },
        ],
      },
      {
        id: 'novita',
        label: 'Novita',
        baseUrl: 'https://api.novita.ai/v3/openai',
        envKey: 'NOVITA_API_KEY',
        logo: 'novita',
        freeText: true,
        models: [
          { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2 (Novita)', note: 'hemat', ctx: 163_840, maxOut: 16_384 },
          { id: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2 (Novita)', note: 'agentik', ctx: 131_072, maxOut: 16_384 },
        ],
      },
      {
        id: 'aws',
        label: 'AWS',
        baseUrl: '',
        envKey: 'AWS_ACCESS_KEY_ID',
        logo: 'aws',
        freeText: true,
        models: [
          { id: 'anthropic.claude-sonnet-4-5-v1:0', label: 'Claude Sonnet 4.5 (Bedrock)', note: 'isi URL dulu', ctx: 200_000, maxOut: 64_000 },
        ],
      },
      {
        id: 'azure',
        label: 'Azure OpenAI',
        baseUrl: '',
        envKey: 'AZURE_OPENAI_API_KEY',
        logo: 'azure',
        freeText: true,
        models: [
          { id: 'gpt-4o', label: 'GPT-4o (Azure)', note: 'isi URL resource dulu', ctx: 128_000, maxOut: 16_384 },
        ],
      },
      {
        id: 'vercel',
        label: 'Vercel AI Gateway',
        baseUrl: 'https://ai-gateway.vercel.sh/v1',
        envKey: 'AI_GATEWAY_API_KEY',
        logo: 'vercel',
        freeText: true,
        models: [
          { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (Vercel)', note: 'gateway', ctx: 200_000, maxOut: 64_000 },
        ],
      },
      {
        id: 'ollama',
        label: 'Ollama Cloud',
        baseUrl: 'https://ollama.com/v1',
        envKey: 'OLLAMA_API_KEY',
        logo: 'ollama',
        freeText: true,
        models: [
          { id: 'qwen3-coder:480b', label: 'Qwen3 Coder 480B', note: 'coding', ctx: 262_144, maxOut: 32_768 },
          { id: 'gpt-oss:120b', label: 'GPT-OSS 120B', note: 'umum', ctx: 131_072, maxOut: 32_768 },
        ],
      },
      {
        id: 'bigmodel',
        label: 'Bigmodel',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        envKey: 'BIGMODEL_API_KEY',
        logo: 'bigmodel',
        freeText: true,
        models: [
          { id: 'glm-4.6', label: 'GLM-4.6', note: 'umum', ctx: 204_800, maxOut: 131_072 },
        ],
      },
      {
        id: 'minimax-cn',
        label: 'MiniMax CN',
        baseUrl: 'https://api.minimaxi.com/v1',
        envKey: 'MINIMAX_CN_API_KEY',
        logo: 'minimax',
        freeText: true,
        models: [
          { id: 'MiniMax-M2', label: 'MiniMax M2', note: 'agentik', ctx: 204_800, maxOut: 131_072 },
        ],
      },
      {
        id: 'kimi-cn',
        label: 'Kimi CN',
        baseUrl: 'https://api.moonshot.cn/v1',
        envKey: 'MOONSHOT_CN_API_KEY',
        logo: 'kimi',
        freeText: true,
        models: [
          { id: 'kimi-k2-thinking', label: 'Kimi K2 Thinking', note: 'penalaran', ctx: 262_144, maxOut: 262_144 },
        ],
      },
      {
        id: 'volcano',
        label: 'Volcano Engine',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        envKey: 'ARK_API_KEY',
        logo: 'volcano',
        freeText: true,
        models: [
          { id: 'doubao-seed-1-6-250615', label: 'Doubao Seed 1.6', note: 'multimodal', ctx: 262_144, maxOut: 32_768 },
        ],
      },
      {
        id: 'alibaba',
        label: 'Alibaba Cloud',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        envKey: 'DASHSCOPE_API_KEY',
        logo: 'alibaba',
        freeText: true,
        models: [
          { id: 'qwen3-max', label: 'Qwen3 Max', note: 'umum', ctx: 262_144, maxOut: 32_768 },
          { id: 'qwen3-coder-plus', label: 'Qwen3 Coder Plus', note: 'coding', ctx: 1_000_000, maxOut: 65_536 },
        ],
      },
      {
        id: 'tencent',
        label: 'Tencent Cloud',
        baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        envKey: 'HUNYUAN_API_KEY',
        logo: 'tencent',
        freeText: true,
        models: [
          { id: 'hunyuan-turbos-latest', label: 'Hunyuan TurboS', note: 'cepat', ctx: 131_072, maxOut: 16_384 },
        ],
      },
      {
        id: 'gmi',
        label: 'GMI Cloud',
        baseUrl: 'https://api.gmi-serving.com/v1',
        envKey: 'GMI_API_KEY',
        logo: 'gmi',
        freeText: true,
        models: [
          { id: 'deepseek-ai/DeepSeek-V3.1', label: 'DeepSeek V3.1 (GMI)', note: 'hemat', ctx: 163_840, maxOut: 16_384 },
        ],
      },
      {
        id: 'mimo',
        label: 'Xiaomi MIMO',
        baseUrl: 'https://api.xiaomimimo.com/v1',
        envKey: 'MIMO_API_KEY',
        logo: 'mimo',
        freeText: true,
        models: [
          { id: 'mimo-7b-rl', label: 'MiMo 7B RL', note: 'penalaran', ctx: 131_072, maxOut: 16_384 },
        ],
      },
      {
        id: 'siliconflow',
        label: 'SiliconFlow CN',
        baseUrl: 'https://api.siliconflow.cn/v1',
        envKey: 'SILICONFLOW_API_KEY',
        logo: 'siliconflow',
        freeText: true,
        models: [
          { id: 'deepseek-ai/DeepSeek-V3.2', label: 'DeepSeek V3.2 (SF)', note: 'hemat', ctx: 163_840, maxOut: 16_384 },
          { id: 'Qwen/Qwen3-Coder-480B-A35B-Instruct', label: 'Qwen3 Coder 480B (SF)', note: 'coding', ctx: 262_144, maxOut: 32_768 },
        ],
      },
      {
        id: 'gitee',
        label: 'Gitee',
        baseUrl: 'https://ai.gitee.com/v1',
        envKey: 'GITEE_API_KEY',
        logo: 'gitee',
        freeText: true,
        models: [
          { id: 'DeepSeek-V3', label: 'DeepSeek V3 (Gitee)', note: 'hemat', ctx: 163_840, maxOut: 16_384 },
        ],
      },
      {
        id: 'ppio',
        label: 'PPIO',
        baseUrl: 'https://api.ppinfra.com/v3/openai',
        envKey: 'PPIO_API_KEY',
        logo: 'ppio',
        freeText: true,
        models: [
          { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2 (PPIO)', note: 'hemat', ctx: 163_840, maxOut: 16_384 },
        ],
      },
      {
        id: 'mistral',
        label: 'Mistral',
        baseUrl: 'https://api.mistral.ai/v1',
        envKey: 'MISTRAL_API_KEY',
        logo: 'mistral',
        freeText: true,
        models: [
          { id: 'mistral-large-latest', label: 'Mistral Large', note: 'umum', ctx: 131_072, maxOut: 8_192 },
          { id: 'codestral-latest', label: 'Codestral', note: 'coding', ctx: 256_000, maxOut: 8_192 },
        ],
      },
      {
        id: 'groq',
        label: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        envKey: 'GROQ_API_KEY',
        logo: 'groq',
        freeText: true,
        models: [
          { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', note: 'cepat', ctx: 131_072, maxOut: 32_768 },
          { id: 'moonshotai/kimi-k2-instruct', label: 'Kimi K2 (Groq)', note: 'agentik', ctx: 131_072, maxOut: 16_384 },
        ],
      },
    ];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));

/**
 * Apakah id ini provider yang BENAR-BENAR bisa menerima request?
 *
 * `get_public_models` mengembalikan SEMUA slot di `secrets.json`, dan berkas
 * itu juga menyimpan hal yang bukan provider — `github` misalnya menyimpan
 * payload login (token + profil). Tanpa saringan ini slot tersebut ikut:
 *
 *  - masuk daftar "Active provider" di halaman Models, dan memilihnya membuat
 *    setiap kiriman gagal dengan `unknown provider "github" has no base URL`;
 *  - dihitung sebagai "ada key" oleh pemilih model, sehingga panel tampak
 *    punya kredensial padahal provider yang dipakai tidak bisa mengirim.
 *
 * Aturannya sama dengan resolver: anggota katalog, atau gateway `custom-*`
 * buatan reader. Slot lama `custom` ikut karena ia masih dipakai sebagai
 * penampung alias.
 */
export function idProviderNyata(id: string): boolean {
  const k = (id ?? '').trim();
  return PROVIDER_BY_ID.has(k) || k.startsWith('custom');
}

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
 *   2. A `custom-*` gateway that is already stored and configured wins over
 *      the catalogue. Its key may be missing from `punyaKunci` (failed
 *      decryption, or the key list not reloaded yet after a Refresh), but the
 *      gateway is still the only provider the reader configured. Skipping it
 *      here is what made "Active provider" read Gemini no matter what.
 *   3. Otherwise the first provider with a key, in catalogue order. Catalogue
 *      order, not `hasKey` order, so the same setup resolves the same way on
 *      every launch and on every machine with the same keys.
 *   4. Otherwise the explicit provider even without a key, so the UI can say
 *      "this one needs a key" instead of silently pointing somewhere else.
 *   5. Otherwise `'custom'`, the historical fallback.
 *
 * Pure: no store reads, no network. That is what lets the harness drive it.
 */
export function providerEfektif(
  activeProvider: string | null | undefined,
  punyaKunci: (id: string) => boolean,
): string {
  const aktif = (activeProvider ?? '').trim();
  const auto = !aktif || aktif === PROVIDER_AUTO;

  /*
   * Provider kustom (slot `custom` dan `custom-<slug>`).
   *
   * Slot lama `custom` sengaja TIDAK ikut di sini: ia tempat penampung lama
   * yang selalu ada di katalog, dan tanpa key ia memang belum bisa dipakai.
   * Gateway bernama (`custom-geraikita`) hanya ada karena reader membuatnya,
   * dan keberadaannya sendiri sudah bukti konfigurasi.
   */
  const kustom = aktif.startsWith('custom-');

  /* A real, deliberate choice that can actually send: honour it. */
  if (!auto && (PROVIDER_BY_ID.has(aktif) || kustom)) {
    if (kustom || punyaKunci(aktif)) return aktif;
  }

  /*
   * Gateway `custom-*` yang tersimpan tetap dipakai, walau `punyaKunci` belum
   * mengenalnya.
   *
   * Bukti yang sah untuk provider kustom adalah dirinya sendiri: ia hanya ada
   * karena reader membuatnya, sementara "punya key" bergantung pada daftar key
   * yang bisa gagal dimuat. Tanpa cabang ini, satu entri yang gagal didekripsi
   * sudah cukup membuat gateway reader dilewati lalu resolver mengambil provider
   * katalog pertama yang punya key - itulah "Active provider selalu Gemini".
   */
  if (!auto && kustom) return aktif;

  /* Auto (or a choice with no key): the first provider in catalogue order. */
  const siap = PROVIDERS.find((p) => punyaKunci(p.id));
  if (siap) return siap.id;

  /* Nothing has a key. Keep a real choice so the UI can name what is missing. */
  if (!auto && (PROVIDER_BY_ID.has(aktif) || kustom)) return aktif;
  return 'custom';
}

/**
 * A stored `activeProvider` that does not name a real, configured provider.
 *
 * `'custom'` is the legacy catch-all slot: it appears in the catalogue but has
 * no endpoint of its own, so it can never send. A reader whose only gateway is
 * `custom-ryuga` could still end up with this stored - the Active dropdown in
 * Settings used to list catalogue providers only, and choosing "Custom" wrote
 * the bare slot. Everything downstream then reads "no key, no URL", which is
 * exactly the "add an API key" notice for a key that IS on disk.
 *
 * Resolution order, all from real configuration:
 *  1. the `custom-<slug>` whose gateway has a `baseUrl`;
 *  2. any `baseUrl`-backed provider that is not the bare slot;
 *  3. a leftover `"custom"` when nothing else is configured (unchanged).
 */
export function providerTersimpanValid(
  aktif: string | null | undefined,
  providers?: Record<string, { baseUrl?: string } | undefined> | null,
): string {
  const id = (aktif ?? '').trim();
  const peta = providers ?? {};
  const berUrl = (k: string) => !!peta[k]?.baseUrl?.trim();
  /*
   * `secrets.json` juga menyimpan slot yang BUKAN provider (payload login
   * `github`, mis.). Slot seperti itu bisa punya `baseUrl` di settings, dan
   * memilihnya membuat setiap kiriman gagal dengan "unknown provider has no
   * base URL" — sekaligus memunculkan "masukkan API key" untuk provider yang
   * tidak pernah ada. Jadi kandidat WAJIB provider nyata.
   */
  const nyata = (k: string) => idProviderNyata(k);
  if (id && id !== 'custom' && nyata(id) && berUrl(id)) return id;

  /*
   * Gateway bernama (`custom-*`) yang sudah dipilih TIDAK dipetakan ke provider
   * lain hanya karena URL-nya sedang kosong.
   *
   * URL bisa hilang karena settings baru direset, atau karena satu penulisan
   * settings yang gagal — sementara namanya masih di `activeProvider`. Dulu
   * fungsi ini lalu meminjam provider lain yang punya `baseUrl` (hydra, ollama,
   * openrouter, ...) sehingga "Active provider" berpindah sendiri dari pilihan
   * reader ke provider yang tidak pernah ia pilih. Yang benar: pertahankan
   * pilihannya dan biarkan UI meminta URL-nya.
   */
  if (id.startsWith('custom-')) return id;

  /* The bare slot (or nothing usable): pick the configured gateway. */
  const kustom = Object.keys(peta)
    .filter((k) => k.startsWith('custom-') && berUrl(k))
    .sort();
  if (kustom.length > 0) return kustom[0];

  /*
   * Urutan abjad dipakai supaya hasilnya deterministik, tetapi slot non-provider
   * ikut tersortir di depan: `github` < `hydra`, jadi `github` dulu terpilih
   * sebagai "provider aktif" — itulah "Active provider selalu ke github padahal
   * github tidak ada". Saring dengan `idProviderNyata`.
   */
  const lain = Object.keys(peta)
    .filter((k) => k !== 'custom' && nyata(k) && berUrl(k))
    .sort();
  if (lain.length > 0) return lain[0];

  return id || 'custom';
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
  laporan: Readonly<Record<string, LaporanModel>> = {},
): Array<{
  id: string;
  label: string;
  note?: string;
  ctx?: number;
  bisa?: Kemampuan[];
  biaya?: string;
}> {
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
  type Baris = {
    id: string;
    label: string;
    note?: string;
    ctx?: number;
    bisa?: Kemampuan[];
    biaya?: string;
  };
  const uniq = new Map<string, Baris>();
  for (const m of semua) if (!uniq.has(m.id)) uniq.set(m.id, m);

  /*
   * Capabilities are attached LAST, from one place, so a catalogue row and a
   * live row can never disagree about the same id. A catalogue entry that
   * already carries `bisa` (none do today, but the field exists) keeps its own
   * answer: an author writing it by hand knows more than the name heuristic.
   */
  const katalogBisa = new Map(
    (p.models ?? []).filter((m) => m.bisa).map((m) => [m.id, m.bisa as Kemampuan[]]),
  );
  const out: Baris[] = [];
  for (const m of uniq.values()) {
    const lap = laporan[m.id];
    const bisa = katalogBisa.get(m.id) ?? deteksiKemampuan(m.id, lap);
    const ctxLive = lap?.context_length && !m.ctx ? lap.context_length : m.ctx;
    out.push({
      ...m,
      ctx: ctxLive,
      ...(bisa ? { bisa } : {}),
      ...(lap || m.id ? { biaya: biayaModel(lap) } : {}),
    });
  }
  return out;
}

export function isPlaceholderModel(id: string | null | undefined): boolean {
  return !!id && PLACEHOLDER_MODEL_IDS.has(id.trim());
}

/**
 * What a provider's `/models` answer said about one model, when it said
 * anything at all.
 *
 * Only the three fields the picker can actually use are kept. Providers differ
 * wildly here: OpenRouter-style gateways report `architecture.input_modalities`
 * and `pricing`, plain OpenAI reports neither, and Gemini reports a display
 * name and nothing else. Everything is optional because "the provider did not
 * say" has to stay distinguishable from "the provider said no".
 */
export interface LaporanModel {
  input_modalities?: string[];
  supported_parameters?: string[];
  context_length?: number;
  /** Raw pricing object, e.g. `{ prompt: '0.0000015', completion: '...' }`. */
  pricing?: Record<string, unknown>;
}

/*
 * ── Capability detection ──────────────────────────────────────────────────
 *
 * TWO SOURCES, in this order, and the order matters:
 *
 *  1. What the provider REPORTED. `architecture.input_modalities` is a fact —
 *     the gateway knows which route accepts an image part, and no name-based
 *     guess should ever override it.
 *
 *  2. The model NAME, when the provider said nothing. This is a guess, and it
 *     is marked as such in the UI, but it is a far better guess than the old
 *     behaviour (which showed nothing at all): model families are named
 *     consistently enough that `qwen3-vl` and `llava` are never text-only,
 *     while `codestral` and `deepseek-reasoner` never take an image.
 *
 * The lists below are FAMILIES, not individual models, because a gateway that
 * serves `qwen2.5-vl-72b` will also serve the next point release, and a list of
 * exact ids would be stale within a month.
 */

/** Families that accept an image part. Order is irrelevant; all are tested. */
const KELUARGA_VISION = [
  /* OpenAI: the 4o/4.1/5/6 generations and the o-series reasoning models are
     multimodal. The 3.5 and earlier text models are not. */
  /gpt-4o/,
  /gpt-4\.1/,
  /gpt-4-turbo/,
  /gpt-4-vision/,
  /gpt-5/,
  /gpt-6/,
  /\bo[34](?:-|$)/,
  /* Anthropic: every Claude 3 and later reads images. */
  /claude-3/,
  /claude-(?:opus|sonnet|haiku|fable)-[3-9]/,
  /* Google: Gemini 1.5 and later, including the image-generation variants. */
  /gemini-(?:1\.5|[2-9])/,
  /* DeepSeek's only vision line is the VL series. */
  /deepseek-(?:vl|v4)/,
  /* Alibaba Qwen: the -VL suffix is the whole tell. */
  /qwen[\d.]*-vl/,
  /qvq/,
  /* Meta: 3.2-vision and the 4 generation. */
  /llama-?3\.2-vision/,
  /llama-?4/,
  /* Mistral's multimodal line. */
  /pixtral/,
  /* xAI. */
  /grok-(?:2-vision|[34])/,
  /* ByteDance / Doubao seeds are multimodal by design. */
  /seed-1\.6/,
  /doubao-seed/,
  /* Zhipu GLM vision variants. */
  /glm-4(?:\.\d+)?v/,
  /* Moonshot / Kimi vision. */
  /kimi-vl/,
  /moonshot-v1-vision/,
  /* The open-weight vision families a local server is likely to expose. */
  /llava/,
  /internvl/,
  /minicpm-v/,
  /phi-3\.5-vision/,
  /phi-4-multimodal/,
  /idefics/,
  /molmo/,
  /paligemma/,
  /cogvlm/,
  /step-1v/,
  /yi-vl/,
];

/** Families that explicitly do NOT take an image, even inside a vision line. */
const KELUARGA_TEKS = [/deepseek-(?:chat|reasoner|coder)/, /codestral/, /gpt-3\.5/, /text-embedding/, /whisper/, /tts/, /dall-e/, /embed/];

/** Reasoning/thinking families, inferred only when the provider is silent. */
const KELUARGA_REASONING = [
  /\bo[134](?:-|$)/,
  /deepseek-(?:reasoner|r1)/,
  /qwq/,
  /thinking/,
  /reason/,
  /-r1/,
];

/**
 * Detect what a model can do.
 *
 * `laporan` is the provider's own answer for this id, when there was one. Pass
 * `undefined` for catalogue rows and for typed-in ids — the name heuristic is
 * the only source then.
 *
 * Returns `undefined` for "nothing known", which the UI must draw differently
 * from an empty array ("known to be text-only"). Collapsing the two would make
 * every unrecognised gateway model claim it cannot read an image.
 */
export function deteksiKemampuan(
  id: string,
  laporan?: LaporanModel,
): Kemampuan[] | undefined {
  const s = id.toLowerCase();
  const hasil = new Set<Kemampuan>();

  /* ── 1. What the provider reported ─────────────────────────────────────── */
  const modal = (laporan?.input_modalities ?? []).map((m) => m.toLowerCase());
  const param = (laporan?.supported_parameters ?? []).map((p) => p.toLowerCase());
  let adaLaporan = false;

  if (modal.length > 0) {
    adaLaporan = true;
    if (modal.some((m) => m === 'image' || m === 'vision' || m.startsWith('image/'))) {
      hasil.add('image');
    }
  }
  if (param.length > 0) {
    adaLaporan = true;
    if (param.some((p) => p === 'reasoning' || p === 'include_reasoning')) hasil.add('reasoning');
    if (param.some((p) => p === 'tools' || p === 'tool_choice')) hasil.add('tools');
  }
  /*
   * Pricing is deliberately NOT read here.
   *
   * Cost has its own line in the panel, and a gateway that reports prices but
   * no modalities has still told us NOTHING about capabilities. Counting it as
   * a report would flip an honest "not reported" into a confident "cannot read
   * images", which is exactly the false claim this function exists to avoid.
   */

  /* ── 2. The name, when the provider was silent ─────────────────────────── */
  if (!adaLaporan) {
    if (KELUARGA_TEKS.some((re) => re.test(s))) {
      /* A name that says "text" overrides a family that says "vision": this is
         what keeps `deepseek-chat` from being ticked because the vision list
         mentions DeepSeek. */
      return hasil.size > 0 ? [...hasil] : [];
    }
    if (KELUARGA_VISION.some((re) => re.test(s))) hasil.add('image');
    if (KELUARGA_REASONING.some((re) => re.test(s))) hasil.add('reasoning');
  }

  if (hasil.size === 0 && !adaLaporan) return undefined;
  return [...hasil];
}

/**
 * How this model is billed, for the detail panel's "Cost" line.
 *
 * Providers that report pricing get their answer; everything else is assumed to
 * be billed by token, because that is what every hosted endpoint in the
 * catalogue does. The one honest exception is a local endpoint, which costs
 * nothing to call — but that is decided by the CALLER, which knows the base URL,
 * not here.
 */
export function biayaModel(laporan?: LaporanModel): string {
  if (!laporan?.pricing) return 'Billed by token';
  const angka = Object.values(laporan.pricing)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
  if (angka.length > 0 && angka.every((n) => n === 0)) return 'Free';
  return 'Billed by token';
}

/**
 * The base URL that will actually be used: what the user configured in
 * Settings, else what the catalogue ships. `custom` ships an EMPTY base URL on
 * purpose - there is no sensible default for an OpenAI-compatible endpoint -
 * so until the user fills it in, this returns '' and the provider is not ready.
 */
export function baseUrlEfektif(
  providerId: string,
  overrides?: Record<string, { baseUrl?: string; fullUrl?: boolean } | undefined>,
): string {
  const simpan = (overrides ?? {})[providerId];
  const configured = simpan?.baseUrl;
  if (typeof configured === 'string' && configured.trim()) return configured.trim();
  /*
   * `custom-*` gateways may be configured with a FULL endpoint instead of a base
   * URL ("https://host/v1/chat/completions"), flagged by `fullUrl`. The URL is
   * still stored in `baseUrl`; the flag only says it must not be appended to.
   * Anything else keeps the catalogue default.
   */
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
  overrides?: Record<string, { baseUrl?: string; fullUrl?: boolean } | undefined>,
): boolean {
  // BOTH are required. This returned true on the key alone, so a `custom`
  // provider with a saved key and no endpoint was reported as ready and every
  // send failed with nowhere to go — the exact case the doc comment above
  // describes as fixed. A provider with a built-in base URL still passes, since
  // baseUrlEfektif falls back to the catalogue default.
  return hasKey && baseUrlEfektif(p.id, overrides).length > 0;
}

/**
 * Every provider the reader can actually use: the catalogue PLUS configured
 * `custom-*` gateways.
 *
 * `PROVIDERS` is the built-in catalogue only. Anything that iterates it to build
 * a model list therefore never sees a gateway the reader added - the Chat
 * Settings tier dropdown and the HydraFusion candidate ladder both did exactly
 * that, so a workspace running `custom-ryuga` still offered nothing but the six
 * catalogue providers. The custom rows are synthesised as free-text providers:
 * their models come from `modelTersedia` (typed ids + the live API list), not
 * from the catalogue.
 *
 * Sorted so the list is deterministic; catalogue order is preserved first.
 */
export function daftarProvider(
  overrides?: Record<string, { baseUrl?: string } | undefined> | null,
): ProviderInfo[] {
  const out: ProviderInfo[] = [...PROVIDERS];
  const sudah = new Set(PROVIDERS.map((p) => p.id));
  for (const id of Object.keys(overrides ?? {}).sort()) {
    if (sudah.has(id)) continue;
    sudah.add(id);
    out.push({
      id,
      label: id.replace(/^custom-/, ''),
      baseUrl: '',
      envKey: '',
      /* Custom gateways have no brand mark; `logo` is only used for the badge. */
      logo: 'custom' as LogoId,
      freeText: true,
      models: [],
    });
  }
  return out;
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
  /*
   * `custom-*` adalah provider buatan user (lihat `slugProvider`). Ia tidak ada
   * di katalog, jadi ia memakai bentuk slot Custom: URL dan label miliknya
   * sendiri, bukan milik provider katalog pertama.
   */
  const diminta = providerId ?? 'custom';
  const kustom = diminta === 'custom' || diminta.startsWith('custom-');
  const p = kustom
    ? { ...(PROVIDER_BY_ID.get('custom') ?? PROVIDERS[PROVIDERS.length - 1]), id: diminta }
    : (PROVIDER_BY_ID.get(diminta) ?? PROVIDERS[PROVIDERS.length - 1]);

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

  /*
   * Official mark, when the brand table has one.
   *
   * `modelBrandIcons.ts` already ships 34 official marks (simple-icons CC0 and
   * @lobehub/icons-static-svg, generated by `scripts/gen-brand-lengkap.mjs`) on a
   * 24x24 grid. Hand-drawing approximations beside them was the mistake: two
   * shapes for one brand in one app, and the approximations were visibly wrong —
   * a letter Z for Z.ai, two circles for PPIO, a triangle for Vercel.
   *
   * The table keys are brand FAMILIES (gemini, gpt, claude, glm, ...), not
   * provider ids, because one family can be served by several providers: "Kimi
   * Global" and "Kimi CN" are both `kimi`, "Z.ai" and "Bigmodel" are both `glm`.
   * This map is the single place that says which family a provider wears.
   */
  const keluarga: Record<string, string> = {
    /*
     * Provider memakai mark PERUSAHAANNYA, bukan mark produk/model di bawahnya.
     *
     * Itu perbedaan yang membuat daftar "Add Model" dulu terasa salah: baris
     * Google memakai sparkle Gemini, Anthropic memakai bintang Claude, AWS
     * memakai logo Bedrock, BytePlus dan Volcano memakai logo Doubao, Alibaba
     * memakai diamond Qwen, Z.ai/Bigmodel memakai titik-titik GLM. Semuanya
     * merek yang berbeda dari nama yang tertulis di barisnya, dan semuanya
     * sudah dibetulkan di sini — mark produk tetap dipakai oleh `ModelLogo`
     * untuk modelnya sendiri.
     */
    gemini: 'google',
    openai: 'gpt',
    anthropic: 'anthropic',
    deepseek: 'deepseek',
    xai: 'grok',
    mistral: 'mistral',
    groq: 'groq',
    openrouter: 'openrouter',
    ollama: 'ollama',
    zai: 'zai',
    bigmodel: 'zai',
    minimax: 'minimax',
    'minimax-cn': 'minimax',
    kimi: 'kimi',
    'kimi-cn': 'kimi',
    byteplus: 'byteplus',
    aws: 'aws',
    azure: 'azure',
    volcano: 'volcengine',
    alibaba: 'alibabacloud',
    tencent: 'tencentcloud',
    mimo: 'mimo',
    gmi: 'gmicloud',
    gitee: 'gitee',
    /*
     * These three HAVE official marks in the brand table and were falling
     * through to the two-letter monogram anyway (SF / NO / PP), because the map
     * had no entry for them — the reader pointed at exactly that: three tiles in
     * a row of logos wearing initials instead of their company. The connection
     * is one line each; nothing else was missing.
     */
    siliconflow: 'siliconcloud',
    novita: 'novita',
    ppio: 'ppio',
    vercel: 'vercel',
  };

  const kunci = keluarga[logo as string] ?? (logo as string);
  const mark = BRAND_MARKS[kunci];

  /*
   * The custom endpoint has no brand, so it gets a deliberate mark: a dashed
   * tile with a plus, in the accent colour.
   *
   * Without this it fell through to the neutral fallback below, which is a plain
   * grey square — indistinguishable from "the logo failed to load", which is
   * exactly how the reader read it.
   */
  if (logo === 'generic') {
    return (
      <svg {...p} aria-label="Custom">
        <rect
          x="2.4"
          y="2.4"
          width="11.2"
          height="11.2"
          rx="2.6"
          fill="none"
          stroke="var(--accent, #4c8dff)"
          strokeWidth="1.3"
          strokeDasharray="2.6 1.8"
        />
        <path
          d="M8 5.7v4.6M5.7 8h4.6"
          fill="none"
          stroke="var(--accent, #4c8dff)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  /*
   * Colour for the marks the generator recorded as monochrome.
   *
   * `modelBrandIcons.ts` is GENERATED (`do not edit by hand`) and it records
   * `warna: null` for 14 brands. That is correct for a logo on a white page —
   * OpenAI's mark really is monochrome — but on this dark list a `currentColor`
   * mark renders as flat grey text and every one of those tiles looked like it
   * had no logo at all. The reader asked for colour, and the brands DO have
   * colours in their product UI.
   *
   * So the override lives HERE, not in the generated file: the generator's data
   * stays untouched and regenerable, and the one place that decides how a mark is
   * painted is the component that paints it.
   */
  const warnaCadangan: Record<string, string> = {
    /*
     * `gpt` TIDAK ada di sini dengan sengaja.
     *
     * Entri lamanya `#10A37F` (hijau ChatGPT), dan di daftar provider baris
     * OpenAI jadi simpul hijau — warna yang bukan milik merek OpenAI, yang
     * memang monokrom. Tanpa entri ini mark-nya ikut warna teks (putih di tema
     * gelap), sama seperti di acuan TRAE.
     */
    grok: '#E8E8E8',
    kimi: '#4B6BFB',
    ollama: '#D8D8D8',
    tencent: '#0052D9',
    together: '#0F6FFF',
    openrouter: '#6467F2',
    bedrock: '#FF9900',
    lmstudio: '#6E56CF',
    copilot: '#8B8B8B',
    longcat: '#FF6B35',
    stepfun: '#00A0E9',
    yi: '#003425',
    baichuan: '#FF6A00',
  };

  if (mark) {
    /*
     * One path, one viewBox (24), one colour rule.
     *
     * A brand that carries its own colour uses it. A brand the generator marked
     * monochrome falls back to the table above, and only if that has no opinion
     * either does it follow the surrounding text colour.
     */
    const warna = mark.warna ?? warnaCadangan[kunci] ?? 'currentColor';
    /*
     * Mark berlapis: logo penuh warna (huruf G Google, tanda AWS, Alibaba
     * Cloud, Kimi) disusun dari beberapa path, masing-masing membawa warnanya
     * sendiri. Mark satu path tetap satu `<path>` — jalur lama tidak berubah.
     * Lapis tanpa warna sendiri memakai warna merek, jadi tidak ada bagian
     * yang hilang hanya karena LobeHub menulisnya tanpa `fill`.
     */
    if (mark.lapis?.length) {
      return (
        <svg {...p} viewBox="0 0 24 24" aria-label={id}>
          {mark.lapis.map((l, i) => (
            <path key={i} d={l.d} fill={l.warna ?? warna} />
          ))}
        </svg>
      );
    }
    return (
      <svg {...p} viewBox="0 0 24 24" aria-label={id}>
        <path d={mark.d} fill={warna} />
      </svg>
    );
  }

  /* Fallback for a provider the brand table does not know yet: its OWN initials
     in its own brand colour, rather than a neutral square that reads as "logo
     failed to load" or — worse — another company's mark. */
  const warnaSendiri: Record<string, string> = {
    gmi: '#00D0A0',
    novita: '#7C5CFF',
    gitee: '#C71D23',
    ppio: '#4B5BFF',
    vercel: '#E8E8E8',
    siliconflow: '#6D4AFF',
    custom: 'var(--accent, #4C8DFF)',
  };
  /* Brand colours for the monograms ABOVE, but also for any provider whose mark
     the table lacks — a monogram in the brand's own colour is still recognisably
     "that company", which plain grey is not. */
  const warnaMonogram: Record<string, string> = {
    ...warnaSendiri,
    mistral: '#FA520F',
    groq: '#F55036',
    openrouter: '#6467F2',
    together: '#0F6FFF',
    bedrock: '#FF9900',
    lmstudio: '#6E56CF',
    copilot: '#8B8B8B',
    longcat: '#FF6B35',
    stepfun: '#00A0E9',
    yi: '#003425',
    baichuan: '#FF6A00',
    nvidia: '#76B900',
  };
  const teks = (PROVIDER_BY_ID.get(id)?.label ?? id).replace(/[^A-Za-z0-9 ]/g, '');
  const kata = teks.split(/\s+/).filter(Boolean);
  const inisial = kata.length >= 2 ? kata[0][0] + kata[1][0] : teks.slice(0, 2);
  return (
    <svg {...p} viewBox="0 0 16 16" aria-label={id}>
      <circle cx="8" cy="8" r="7.2" fill={warnaMonogram[id] ?? 'currentColor'} opacity="0.2" />
      <text
        x="8"
        y="8"
        textAnchor="middle"
        dominantBaseline="central"
        fill={warnaMonogram[id] ?? 'currentColor'}
        fontSize={inisial.length > 1 ? 6.6 : 8}
        fontWeight="700"
        fontFamily="var(--font-ui, sans-serif)"
      >
        {inisial.toUpperCase()}
      </text>
    </svg>
  );
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

/*
 * Colour for the brand families the generator recorded as monochrome.
 *
 * `modelBrandIcons.ts` is generated and stores `warna: null` for brands whose
 * official mark is a single colour. On a dark list that renders as flat grey —
 * the model looked like it had no mark at all. These are the brands' own colours
 * as used in their product UI; the table lives here because the generated file
 * must stay regenerable.
 */
export const WARNA_MEREK: Record<string, string> = {
  gpt: '#10A37F',
  grok: '#E8E8E8',
  kimi: '#4B6BFB',
  ollama: '#D8D8D8',
  tencent: '#0052D9',
  together: '#0F6FFF',
  openrouter: '#6467F2',
  bedrock: '#FF9900',
  lmstudio: '#6E56CF',
  copilot: '#8B8B8B',
  longcat: '#FF6B35',
  stepfun: '#00A0E9',
  yi: '#003425',
  baichuan: '#FF6A00',
};

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
  /* Brand colour first, then the override table, then the surrounding text
     colour — the same order `ProviderLogo` uses, so one brand cannot be grey in
     one place and coloured in another. */
  const warna = mark?.warna ?? WARNA_MEREK[fam] ?? undefined;

  if (mark) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={fam}
        style={{ flexShrink: 0 }}
      >
        <path d={mark.d} fill={warna ?? 'currentColor'} />
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
  const warnaTeks = warnaInisial(id);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={id}
      style={{ flexShrink: 0 }}
    >
      <circle cx="8" cy="8" r="7.4" fill={warnaTeks} opacity="0.22" />
      <text
        x="8"
        y="8"
        textAnchor="middle"
        dominantBaseline="central"
        fill={warnaTeks}
        fontSize={teks.length > 1 ? 6.6 : 8}
        fontWeight="700"
        fontFamily="var(--font-ui, sans-serif)"
      >
        {teks}
      </text>
    </svg>
  );
});
