const fs = require('fs');
const p = 'src/components/settings/Marketplace.tsx';
let s = fs.readFileSync(p, 'utf8');

/* McpServer memakai `label`, bukan `name`; tidak punya `tools`. */
s = s.replace(
  `      (mcpServers ?? [])
        .filter((s) => cocokCari(s.name + ' ' + (s.command ?? '')) && cocokKategori(s.name))
        .map((s) => ({ id: s.name, nama: s.name, ket: s.command ?? '', tools: s.tools ?? [] })),`,
  `      (mcpServers ?? [])
        .filter((s) => cocokCari(s.label + ' ' + (s.command ?? '')) && cocokKategori(s.label))
        .map((s) => ({
          id: s.id,
          nama: s.label,
          ket: s.command || s.url || '',
          /*
           * The tool list is not part of the stored server definition - it is
           * only known after the server has been started and asked. Reporting
           * `[]` here is the honest answer: this build does not know the tools
           * of a server that has not run, and inventing a count would be worse
           * than showing none.
           */
          tools: [] as string[],
        })),`,
);

/* MarketPlugin memakai `installed`, dan InstalledPlugin memakai `enabled`. */
s = s.replace(
  `    const terpasang = new Set(plugins.map((p) => p.name));
    const dariPasar = (pasar ?? [])
      .filter((p) => !terpasang.has(p.name))
      .map((p) => ({
        id: p.name,
        nama: p.name,
        ket: p.description ?? '',
        terpasang: false,
        bisaPasang: true,
      }));
    const dariLokal = plugins.map((p) => ({
      id: p.name,
      nama: p.name,
      ket: p.description ?? '',
      terpasang: true,
      bisaPasang: false,
      aktif: p.enabled,
    }));`,
  `    const terpasang = new Set(plugins.map((p) => p.name));
    const dariPasar = (pasar ?? [])
      .filter((p) => !terpasang.has(p.name))
      .map((p) => ({
        id: p.id || p.name,
        nama: p.name,
        ket: p.description ?? '',
        terpasang: false as const,
        bisaPasang: true,
        aktif: false,
      }));
    const dariLokal = plugins.map((p) => ({
      id: p.name,
      nama: p.name,
      ket: p.description ?? '',
      terpasang: true as const,
      bisaPasang: false,
      aktif: p.enabled === true,
    }));`,
);

fs.writeFileSync(p, s);
console.log('diperbaiki');
