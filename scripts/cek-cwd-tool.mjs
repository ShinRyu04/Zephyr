/*
 * Bukti hidup untuk perbaikan cwd, lewat alur resmi: buka workspace, lalu
 * jalankan tool Run (bash_run) dan lihat folder mana yang dipakainya.
 *
 * Sebelum perbaikan, tool ini tidak mengirim cwd sama sekali dan backend
 * memakai state.workspace_path()-nya sendiri. Kalau state itu belum sinkron,
 * perintahnya jalan di folder instalasi aplikasi - persis yang pernah terlihat
 * di log: C:\Users\LENOVO\AppData\Local\Programs\tedi\resources
 */
const PORT = process.argv[2] || '9223';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (m, p) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
await new Promise((r) => (ws.onopen = r));

const expr = `(async () => {
  try {
  const s = await import('/src/lib/store.ts');
  const bt = await import('/src/lib/tediTools/builtins.ts');
  const AKAR = 'D:\\\\Zephyr';

  await s.useStore.getState().openWorkspace(AKAR);
  await new Promise((r) => setTimeout(r, 1500));
  const workspace = s.useStore.getState().workspace;

  const tool = bt.TOOL_BAWAAN.find((t) => t.spec.name === 'bash_run');
  const hasil = await tool.run({ command: 'cd' });
  const teks = String(hasil.stdout ?? hasil);
  const bagian = teks.split('--- stdout ---');
  const keluar = (bagian[1] ?? teks).split('\\n').map((x) => x.trim()).filter(Boolean)[0] ?? '';

  /* Kembalikan app ke keadaan semula supaya harness tidak meninggalkan
   * workspace terbuka untuk sesi berikutnya. */
  await s.useStore.getState().closeWorkspace();
  return JSON.stringify({ workspace, keluar });
  } catch (e) { return JSON.stringify({ galat: JSON.stringify(e).slice(0, 300) }); }
})()`;
const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
ws.close();
const v = JSON.parse(r.result?.result?.value ?? '{}');

if (v.galat) {
  console.log('GAGAL:', v.galat);
  process.exit(1);
}
console.log('workspace di store :', v.workspace);
console.log('keluar tool        :', v.keluar);

const benar = typeof v.keluar === 'string' && v.keluar.toLowerCase() === 'd:\\zephyr';
const salahFolderInstalasi = /AppData|Programs|resources/i.test(v.keluar || '');
console.log(`\n  ${benar ? 'OK  ' : 'GAGAL'}  tool Run memakai folder workspace`);
if (benar) console.log(`  ${!salahFolderInstalasi ? 'OK  ' : 'GAGAL'}  bukan folder instalasi aplikasi`);
console.log(`\n== ${(benar ? 1 : 0) + (!salahFolderInstalasi ? 1 : 0)}/2 lulus ==`);
process.exit(benar && !salahFolderInstalasi ? 0 : 1);