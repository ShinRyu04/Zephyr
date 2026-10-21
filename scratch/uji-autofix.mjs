import { cdp } from './cdp2.mjs';

/* Open the Agent Customizations panel on the Conversation section. */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
console.log('targets: ' + list.map((x) => x.url).join(' | '));

const c = await cdp(9223, 'localhost:5173/');
await c.eval(`(()=>{ location.hash = '#panel=agent-custom&s=conversations'; })()`);
c.close();
await new Promise((r) => setTimeout(r, 4000));

const list2 = await (await fetch('http://127.0.0.1:9223/json/list')).json();
console.log('targets sesudah: ' + list2.map((x) => x.url).join(' | '));

const c2 = await cdp(9223, '#panel=agent-custom');
const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  return JSON.parse(await c2.eval(src));
};

const setSaklar = async (id, nyala) => {
  const sekarang = await c2.eval(
    `document.querySelector('[data-testid="${id}"]')?.getAttribute('aria-checked') === 'true'`,
  );
  if (sekarang !== nyala) {
    await c2.eval(`document.querySelector('[data-testid="${id}"]')?.click()`);
    await new Promise((r) => setTimeout(r, 300));
  }
};

const hasil = {};

/* The Rust command is now in the running binary. */
hasil.perintahAda = await j(`
  try {
    const core = await import('/node_modules/.vite/deps/@tauri-apps_api_core.js');
    const r = await core.invoke('lint_fix_files', { root: 'D:/Zephyr', paths: ['src/lib/autoFix.ts'] });
    return { ok: true, alat: r.alat, pesan: String(r.pesan || '').slice(0, 110), berubah: (r.berubah || []).length, tetap: (r.tetap || []).length };
  } catch (e) {
    return { ok: false, galat: String(e).slice(0, 200) };
  }
`);

/* Through the switch, through the module, against a REAL file. */
await setSaklar('agx-conv-lint-ide', true);
hasil.autoFixHidup = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  return { alat: r?.alat ?? null, pesan: (r?.pesan ?? '').slice(0, 110), diminta: r?.diminta ?? 0, berubah: r?.berubah ?? [], galat: r?.galat ?? null };
`);

await setSaklar('agx-conv-lint-ide', false);
hasil.autoFixMati = await j(`
  const m = await import('/src/lib/autoFix.ts');
  return { hasil: await m.autoFixGiliran('', ['src/lib/autoFix.ts']) };
`);

/* The "no folder open" path is honest rather than a silent no-op. */
hasil.tanpaFolder = await j(`
  const m = await import('/src/lib/autoFix.ts');
  const store = await import('/src/lib/store.ts');
  const conv = store.useStore.getState().settings.conversation;
  store.useStore.getState().applySettings({ conversation: { ...conv, autoFixIde: true } });
  await new Promise(r=>setTimeout(r,50));
  const akarAsli = store.useStore.getState().workspace;
  store.useStore.setState({ workspace: null });
  const r = await m.autoFixGiliran('', ['src/lib/autoFix.ts']);
  store.useStore.setState({ workspace: akarAsli });
  store.useStore.getState().applySettings({ conversation: { ...conv } });
  return { pesan: (r?.pesan ?? '').slice(0, 90), diminta: r?.diminta ?? 0 };
`);

c2.close();
console.log(JSON.stringify(hasil, null, 1));
process.exit(0);

