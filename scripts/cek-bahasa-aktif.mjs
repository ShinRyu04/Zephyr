import { Cdp } from './lib-cdp.mjs';
import { halamanZephyr } from './lib-zephyr-page.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const page = await halamanZephyr(PORT);
const { cdp } = await Cdp.attach(PORT, page.title);

const r = await cdp.runAsync(`
  const el = await import('/src/lib/extLoader.ts');
  const ring = await el.muatSemuaEkstensi();
  const st = await window.__TAURI__?.core?.invoke?.('extensions_manifests')
    || await window.__TAURI_INTERNALS__?.invoke?.('extensions_manifests');
  const terpasang = (st || []).map((s) => ({
    id: s.manifest ? s.manifest.id : '(?',
    enabled: s.enabled,
    kinds: (s.pengaruh && s.pengaruh.didukung || []).map((i) => i.kind),
  }));
  return {
    jumlahManifestDibaca: (st || []).length,
    terpasang,
    bahasaYangBenarBenarDimuat: ring.languages,
    jumlahBahasa: ring.languages.length,
    temaDimuat: ring.themes.length,
    snippetDimuat: ring.snippets,
    keymapDimuat: ring.keymaps,
    ikonDimuat: ring.iconThemes,
  };
`);

const s = typeof r === 'string' ? JSON.parse(r) : r;
console.log('manifest dibaca loader :', s.jumlahManifestDibaca);
console.log('TERPASANG:');
for (const t of s.terpasang) console.log('  -', t.id, '| enabled:', t.enabled, '| jenis:', t.kinds.join(',') || '-');
console.log('\nBENAR-BENAR DIMUAT:');
console.log('  bahasa  :', s.jumlahBahasa, s.bahasaYangBenarBenarDimuat.join(', '));
console.log('  tema    :', s.temaDimuat);
console.log('  snippet :', s.snippetDimuat);
console.log('  keymap  :', s.keymapDimuat);
console.log('  ikon    :', s.ikonDimuat);
await cdp.close();
