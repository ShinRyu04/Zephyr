import { Cdp } from '../scripts/lib-cdp.mjs';
const { cdp } = await Cdp.attach(9223, 'Zephyr');

/* Import tiap modul satu per satu untuk menemukan yang benar-benar gagal. */
const modul = [
  '/src/components/extensions/IkonExt.tsx',
  '/src/components/extensions/ExtMarketplace.tsx',
  '/src/components/extensions/ExtensionsView.tsx',
  '/src/lib/extCatalog.ts',
  '/src/lib/extensionsStore19.ts',
  '/src/lib/pluginsStore.ts',
  '/src/lib/skillsStore.ts',
  '/src/lib/katalogMcpServer.ts',
];

for (const m of modul) {
  const r = await cdp.eval(
    `(() => {
    window.__IMP__ = 'menunggu';
    import(${JSON.stringify(m)}).then(
      () => { window.__IMP__ = 'OK'; },
      (e) => { window.__IMP__ = 'GAGAL: ' + String(e); },
    );
    return 'mulai';
  })()`,
  );
  void r;
  await new Promise((r2) => setTimeout(r2, 900));
  const hasil = await cdp.eval(`window.__IMP__`);
  console.log(m, '=>', hasil);
}

process.exit(0);
