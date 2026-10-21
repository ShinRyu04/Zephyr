import { cdp } from './cdp2.mjs';

const c = await cdp(9223, '#panel=agent-custom');
const j = async (body) => {
  const src = `(async () => { const __r = await (async () => { ${body} })(); return JSON.stringify(__r); })()`;
  return JSON.parse(await c.eval(src));
};

console.log(
  JSON.stringify(
    await j(`
      const store = await import('/src/lib/store.ts');
      const s = store.useStore.getState();
      const b = document.querySelector('[data-testid="agx-conv-lint-ide"]');
      return {
        workspace: s.workspace,
        settingsLoaded: s.settingsLoaded,
        saklarAda: !!b,
        ariaSekarang: b?.getAttribute('aria-checked'),
        kelas: b?.className ?? null,
      };
    `),
    null,
    1,
  ),
);

/* Click once and watch what changes. */
const sebelum = await c.eval(`document.querySelector('[data-testid="agx-conv-lint-ide"]')?.getAttribute('aria-checked')`);
await c.eval(`document.querySelector('[data-testid="agx-conv-lint-ide"]')?.click()`);
await new Promise((r) => setTimeout(r, 600));
const sesudah = await c.eval(`document.querySelector('[data-testid="agx-conv-lint-ide"]')?.getAttribute('aria-checked')`);
console.log(`klik: ${sebelum} -> ${sesudah}`);

const diStore = await j(`
  const store = await import('/src/lib/store.ts');
  return { autoFixIde: store.useStore.getState().settings.conversation.autoFixIde };
`);
console.log('store: ' + JSON.stringify(diStore));

c.close();
process.exit(0);
