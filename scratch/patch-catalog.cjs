const fs = require('fs');
const p = 'src/lib/modelCatalog.tsx';
let s = fs.readFileSync(p, 'utf8');

const awal = s.indexOf("      {\r\n        id: 'local',");
const akhir = s.indexOf('    ];', awal);
if (awal < 0 || akhir < 0) {
  console.error('anchor tidak ketemu', awal, akhir);
  process.exit(1);
}

const baru = `      /*
       * ONE custom slot, and it is the only one.
       *
       * There used to be SIX: \`local\`, \`custom\`, and \`custom2\`..\`custom5\`.
       * They existed because the id is the API key's storage slot
       * (\`secrets.rs\` -> \`map.insert(p, ...)\`) and the value \`activeProvider\`
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
       * own \`baseUrl\` (see \`models.custom[]\` in types.ts) rather than as a
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
       * endpoint is a plain OpenAI-compatible \`/v1\` base — because that is the
       * only wire format Zephyr sends today.
       *
       * WHY THESE AND NOT ALL TWENTY-SIX: the reference lists regional resellers
       * (Volcano Engine, SiliconFlow CN, PPIO, Gitee…) whose value is a cheaper
       * route to the SAME models. Adding a tile that resolves to an endpoint
       * this build cannot talk to would be a button that fails after the reader
       * has already pasted a key — worse than not offering it. These are the
       * ones that work on the first request.
       *
       * Every \`baseUrl\` below is the vendor's documented OpenAI-compatible
       * base, and every model list is a starting point, not a catalogue: press
       * Refresh in Add Model and the provider reports what it actually serves.
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
        ],
      },
      {
        id: 'mistral',
        label: 'Mistral',
        baseUrl: 'https://api.mistral.ai/v1',
        envKey: 'MISTRAL_API_KEY',
        logo: 'generic',
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
        logo: 'generic',
        freeText: true,
        models: [
          { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', note: 'cepat', ctx: 131_072, maxOut: 32_768 },
          { id: 'kimi-k2-instruct', label: 'Kimi K2', note: 'agentik', ctx: 131_072, maxOut: 16_384 },
        ],
      },
      {
        id: 'openrouter',
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        envKey: 'OPENROUTER_API_KEY',
        logo: 'generic',
        freeText: true,
        models: [
          { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (via OR)', note: 'satu kunci, banyak model', ctx: 200_000, maxOut: 64_000 },
          { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (via OR)', note: 'multimodal', ctx: 1_048_576, maxOut: 65_536 },
        ],
      },
      {
        id: 'ollama',
        label: 'Ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        envKey: 'OLLAMA_API_KEY',
        logo: 'opencode',
        freeText: true,
        models: [{ id: 'qwen3-coder', label: 'Qwen3 Coder', note: 'lokal, tanpa kunci', ctx: 131_072, maxOut: 8_192 }],
      },
`;

s = s.slice(0, awal) + baru + s.slice(akhir);
fs.writeFileSync(p, s);
console.log('katalog ditulis ulang');
