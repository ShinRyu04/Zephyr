/*
 * Compare TRAE's provider order against Zephyr's, name by name.
 *
 * Both lists were read by OCR from the two screenshots, so this is a comparison
 * of what the two dialogs ACTUALLY show — not of what the source code intends.
 *
 * OCR mangles characters ("xAl" for xAI, "Zai" for Z.ai, "PIO"/"PPIO"), so the
 * matching is normalised: lowercase, strip everything that is not a letter, and
 * accept a known alias set. That is honest — a mismatch that survives that much
 * normalisation is a real difference, not an OCR artefact.
 */
const trae = `Custom Model
Google
DeepSeek
xAl
MiniMax Global
BytePlus
Novita
Azure OpenAl
Ollama Cloud
MiniMax CN
Volcano Engine
Tencent Cloud
Xiaomi MIMO
Gitee
Zai
OpenAI
Anthropic
Kimi Global
OpenRouter
AWS
Vercel Al Gateway
Bigmodel
Kimi CN
Alibaba Cloud
GMI Cloud
SiliconFlow CN
PPIO`.split('\n');

const zephyr = `Custom Model
MiniMax Global
Azure OpenAl
Ollama Cloud
MiniMax CN
Volcano Engine
Tencent Cloud
Xiaomi MIMO
Gitee
Kimi Global
OpenRouter
AWS
Vercel Al Gateway
Bigmodel
Kimi CN
Alibaba Cloud
GMI Cloud
SiliconFlow CN
Groq`.split('\n');

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/^xal$/, 'xai')
    .replace(/^zai$/, 'zai')
    .replace(/^pio+$/, 'ppio')
    .replace(/^azureopenal$/, 'azureopenai')
    .replace(/^vercelalgateway$/, 'vercelaiGateway')
    .replace(/^opena[l1]$/, 'openai');

const T = trae.map(norm);
const Z = new Set(zephyr.map(norm));

console.log('TRAE:', trae.length, 'baris');
console.log('ZEPHYR (terbaca OCR):', zephyr.length, 'baris');

const hilang = trae.filter((n) => !Z.has(norm(n)));
console.log('\n=== ADA DI TRAE, TIDAK TERBACA DI ZEPHYR (' + hilang.length + ') ===');
hilang.forEach((n) => console.log('  - ' + n));

/*
 * The OCR of the Zephyr screenshot is truncated by the visible viewport: the
 * dialog scrolls, so providers below the fold are simply not in the picture.
 * A provider "missing" from the OCR is therefore NOT proof it is missing from
 * the app. That distinction is the whole point of this file.
 */
console.log('\nCATATAN: OCR hanya menangkap yang TERLIHAT di viewport.');
console.log('Provider di bawah lipatan tidak terbaca, jadi daftar ini bukan bukti hilang.');
