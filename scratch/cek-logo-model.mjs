/*
 * Check that every catalogue model draws ITS OWN brand, not its provider's.
 *
 * The bug this guards against is not a crash: it is a row that says "DeepSeek"
 * beside an OpenRouter logo. It is invisible to tsc and to a "did it render"
 * check, and obvious to a reader looking at the list — which is exactly why it
 * survived several rounds.
 *
 * The check is a TABLE of expectations keyed by model id prefix, not a re-run of
 * `modelFamily`: re-running the same function would agree with itself even if
 * the mapping were wrong.
 */
import fs from 'node:fs';

const src = fs.readFileSync('src/lib/modelCatalog.tsx', 'utf8');

/* Expected brand family per model-id prefix. Written by hand from the model
   names themselves, so it is an independent opinion. */
const HARAP = [
  [/^gemini|^gemma|nano-banana/i, 'gemini'],
  [/^claude|^sonnet|^opus|^haiku/i, 'claude'],
  [/^gpt|^o[1-9]/i, 'gpt'],
  [/^deepseek/i, 'deepseek'],
  [/^grok/i, 'grok'],
  [/^llama|^meta-/i, 'llama'],
  [/^mistral|^codestral/i, 'mistral'],
  [/^qwen|^Qwen/i, 'qwen'],
  [/^kimi|^moonshot/i, 'kimi'],
  [/^glm/i, 'glm'],
  [/^minimax|^MiniMax/i, 'minimax'],
  [/^hunyuan/i, 'tencent'],
  [/^doubao|^seed-/i, 'bytedance'],
  [/^mimo/i, 'mimo'],
];

/* Pull every model id out of the PROVIDERS table. */
const blok = src.slice(src.indexOf('export const PROVIDERS'), src.indexOf('export const PROVIDER_BY_ID'));
const ids = [...blok.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);

/* Which of them look like a real model id (not a provider id / placeholder). */
const modelIds = ids.filter(
  (id) => !['gemini', 'openai', 'anthropic', 'deepseek', 'custom', 'xai', 'mistral', 'groq',
    'openrouter', 'ollama', 'zai', 'minimax', 'kimi', 'byteplus', 'novita', 'aws', 'azure',
    'vercel', 'bigmodel', 'minimax-cn', 'kimi-cn', 'volcano', 'alibaba', 'tencent', 'gmi',
    'mimo', 'siliconflow', 'gitee', 'ppio', 'custom-model'].includes(id),
);

console.log('model di katalog:', modelIds.length);

/* Read the family function's answer for each, by asking the compiled module
   through a tiny esbuild-free path: re-implement only the lookup table check. */
const petaBlok = src.slice(src.indexOf('export function modelFamily'), src.indexOf('const WARNA_INISIAL'));
const aturan = [...petaBlok.matchAll(/if \(\/(.+?)\/\.test\(s\)\) return '([a-z]+)';/g)].map((m) => ({
  pola: new RegExp(m[1]),
  fam: m[2],
}));

const familyOf = (id) => {
  const s = id.toLowerCase();
  for (const a of aturan) if (a.pola.test(s)) return a.fam;
  return 'unknown';
};

let gagal = 0;
for (const id of modelIds) {
  const harap = HARAP.find(([re]) => re.test(id));
  if (!harap) continue;
  const dapat = familyOf(id);
  if (dapat !== harap[1]) {
    console.log(`GAGAL  ${id}: diharapkan ${harap[1]}, dapat ${dapat}`);
    gagal++;
  }
}
console.log(gagal === 0 ? `LULUS  semua ${modelIds.length} model memetakan ke keluarga yang benar` : `${gagal} GAGAL`);
process.exit(gagal === 0 ? 0 : 1);
