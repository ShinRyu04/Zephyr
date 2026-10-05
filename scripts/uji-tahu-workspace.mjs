/*
 * Apakah agent sekarang TAHU di mana ia bekerja?
 *
 * Sebelum perbaikan: workspace kosong membuat seluruh blok konteks dibuang
 * (`if (files.length === 0) return ''`), jadi akar workspace tidak pernah
 * sampai ke model. Prompt bilang "path relatif terhadap workspace di blok
 * konteks" - dan blok itu tidak ada. Model menebak path, tebakannya gagal,
 * dan watchdog menghentikannya karena "mengulang tanpa kemajuan".
 *
 * Dibuktikan dari blok konteks yang SUNGGUHAN dibangun, bukan dari berkasnya.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.title.includes('Zephyr'));
if (!page) {
  console.log('Zephyr tidak ketemu');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
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
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) {
    return 'GALAT: ' + String(r.result.exceptionDetails.exception?.description ?? '').split('\n')[0];
  }
  return r.result?.result?.value;
};

console.log('=== blok konteks proyek yang benar-benar dibangun ===');
const blok = await ev(`(async () => {
  try {
    /* Lewat modul yang sama yang dipakai prompt, bukan salinannya. */
    const m = await import('/src/lib/projectContext.ts');
    return await m.ringkasanProyek();
  } catch (e) { return 'GALAT: ' + e.message; }
})()`);
console.log(blok);

console.log('\n=== uji ===');
let lulus = 0;
let total = 0;
const uji = (nama, ok) => {
  total++;
  if (ok) {
    console.log(`  LULUS  ${nama}`);
    lulus++;
  } else console.log(`  GAGAL  ${nama}`);
};

const t = typeof blok === 'string' ? blok : '';
uji('blok tidak kosong untuk workspace kosong', t.length > 0);
uji('akar workspace disebut', /D:[\\/]Talos/i.test(t));
uji('dikatakan folder ini kosong', /EMPTY/i.test(t));
uji('dijelaskan path relatif terhadap workspace', /relative to this workspace/i.test(t));
uji('tidak menyuruh menebak akar', /Do not guess/i.test(t));

console.log(`\n== ${lulus}/${total} lulus ==`);
ws.close();
process.exit(lulus === total ? 0 : 1);
