
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
const SUMBER = ['package.json','src-tauri/tauri.conf.json','src-tauri/src/settings.rs','src-tauri/src/mcp_server.rs','src/lib/settingsStore.ts','src/lib/devBridge.ts','src/lib/i18n-src.ts','src/lib/i18n-extra.ts','src/lib/commandRegistry.ts','src/lib/extCatalog.ts','src/lib/zephyrTools/catalog.ts','src/lib/zephyrTools/deskripsiTool.ts','vite.config.ts'];
const hash = () => { const h = createHash('sha1'); for (const p of SUMBER) { h.update(p); h.update('\u0000'); h.update(readFileSync(p)); h.update('\u0000'); } return h.digest('hex').slice(0,16); };
console.log('hash-1', hash());
for (const p of SUMBER) console.log(new Date(statSync(p).mtimeMs).toISOString(), p);
