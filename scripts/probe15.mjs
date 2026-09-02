// probe15.mjs — diagnosa cepat satu skenario di app hidup (dipakai saat
// menyelidiki kegagalan harness). Bukan bagian dari verifikasi.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] ?? '9223');
const out = await cdp.json(
  `
  for (const t of TS().terminalTabs.slice()) await TS().closeTab(t.id);
  TS().setDock('terminal');
  TS().setVisible(true);
  await wait(300);
  const id = await TS().addPane('shell');
  await wait(2800);
  const adaHolder = !!document.querySelector('[data-pane-body="' + id + '"]');
  const ids = PTY.ids();
  const sebelum = PTY.read(id, 50).length;
  await B.writeChunked(id, '# ' + 'Z'.repeat(200));
  await wait(1200);
  const layar = PTY.read(id, 100);
  return JSON.stringify({
    id, dock: TS().dock, visible: TS().visible, maximized: TS().maximized,
    adaHolder, xtermIds: ids, panjangSebelum: sebelum,
    panjangSesudah: layar.length, jumlahZ: (layar.match(/Z/g) || []).length,
    cuplikan: layar.slice(-120),
  });
`,
  90000,
);
console.log(JSON.stringify(out, null, 2));
cdp.close();
