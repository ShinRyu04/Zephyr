/**
 * verify-tools-runtime.mjs - Memastikan tepat 51 tools terpasang di runtime.
 */
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const AKAR = join(dirname(fileURLToPath(import.meta.url)), '..');
const sementara = join(AKAR, 'node_modules', '.cache', 'verify-tools-runtime.mjs');

buildSync({
  entryPoints: [join(AKAR, 'src', 'lib', 'agentTools.ts')],
  outfile: sementara,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
  external: ['@tauri-apps/api', '@tauri-apps/plugin-opener', '@tauri-apps/plugin-clipboard-manager'],
});

const mod = await import(pathToFileURL(sementara).href);
const tools = mod.AGENT_TOOLS || [];
console.log('Total AGENT_TOOLS:', tools.length);

const nama = tools.map((t) => t.spec.name);
const unik = new Set(nama);
if (unik.size !== tools.length) {
  console.error('Ada nama duplikat!');
  process.exit(1);
}

console.log('Tepat 51 tools unik:', tools.length === 51);
if (tools.length !== 51) {
  console.error('Jumlah tools bukan 51! Ditemukan:', tools.length);
  process.exit(1);
}

// Cek 11 web tools
const webTools = [
  'web_search', 'web_fetch', 'browser_open', 'browser_read', 'browser_click',
  'browser_type', 'browser_nav', 'browser_list', 'browser_close',
  'browser_download_url', 'system_browser_open',
];
for (const w of webTools) {
  if (!nama.includes(w)) {
    console.error('Tool web hilang:', w);
    process.exit(1);
  }
}
console.log('11 Tool Web & Browser Zephyr lengkap!');
process.exit(0);
