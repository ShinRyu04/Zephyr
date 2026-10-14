/*
 * Prob CLI: bundel systemPrompt.ts dengan modul berat (store, tauri, xterm,
 * indeks 676 KB) DIGANTI satu stub, supaya blok prompt bisa diukur dari node.
 * Bukan bagian app; hanya alat ukur.
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const sini = dirname(fileURLToPath(import.meta.url));
const STUB = join(sini, 'stub', 'commands.js');
const GANTI = new Set([
  './store',
  './commands',
  './personaStore',
  './zephyrRuntime',
  './zephyrCari',
  './mcpTools',
  './aiZephyrState',
  './terminalStore',
  './historyStore',
  './aiMemori',
  './instructionsStore',
]);

const stubPlugin = {
  name: 'stub-ringan',
  setup(build) {
    build.onResolve({ filter: /^\.\// }, (args) => {
      if (args.importer.endsWith('systemPrompt.ts') && GANTI.has(args.path)) {
        return { path: STUB };
      }
      return undefined;
    });
  },
};

const entri = process.argv[2] ?? join(sini, 'probe.ts');
const keluar = process.argv[3] ?? join(sini, 'probe.mjs');
await esbuild.build({
  entryPoints: [entri],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: keluar,
  logLevel: 'warning',
  plugins: [stubPlugin],
});
console.log(`bundel: ${keluar}`);
