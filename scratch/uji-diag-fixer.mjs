import { cdp } from './cdp2.mjs';

const c = await cdp(9223, 'localhost:5173');
const j = async (body, ms = 120000) => {
  const src = `(async () => {
    const batas = new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), ${ms}));
    try {
      const __r = await Promise.race([(async () => { ${body} })(), batas]);
      return JSON.stringify(__r);
    } catch (e) { return JSON.stringify({ galat: String(e && e.message ? e.message : e) }); }
  })()`;
  return JSON.parse(await c.eval(src));
};

const AKAR = 'D:\\Zephyr\\scratch\\proyek-uji';
const BERKAS = AKAR + '\\src\\a.js';

/* Ask the command to format a deliberately ugly file and report EVERYTHING. */
console.log(
  JSON.stringify(
    await j(`
      const core = await import('/node_modules/.vite/deps/@tauri-apps_api_core.js');
      const r = await core.invoke('lint_fix_files', {
        root: ${JSON.stringify(AKAR)},
        paths: [${JSON.stringify(BERKAS)}],
      });
      return r;
    `, 120000),
    null,
    1,
  ),
);

/* And run the same thing through agent_exec so the shell path is visible. */
console.log(
  JSON.stringify(
    await j(`
      const core = await import('/node_modules/.vite/deps/@tauri-apps_api_core.js');
      const r = await core.invoke('agent_exec', {
        command: 'npx prettier --version',
        timeoutMs: 60000,
        cwd: ${JSON.stringify(AKAR)},
      });
      return r;
    `, 120000),
    null,
    1,
  ),
);

c.close();
process.exit(0);
