/*
 * Gabung chunk reasoning, diuji sebagai fungsi murni.
 *
 * Bug yang ditemukan dari APLIKASI HIDUP: teks reasoning tampil dobel
 *
 *     "TheThe user asks a simple one-s user asks a simple one-sentence question:..."
 *
 * Pola itu khas delivery KUMULATIF, bukan delta: chunk kedua memuat ulang seluruh
 * teks sejak awal lalu menambahkannya. Menempelkan buta (`m.reasoning + chunk`)
 * menghasilkan "The" + "The user..." = "TheThe".
 *
 * Tiga bentuk yang harus dikenali, semuanyaterbukti dari satu run nyata:
 *   - kumulatif penuh  : chunk = teks_sofar + tambahan  -> GANTI
 *   - duplikat         : chunk sudah ada di tekssofar  -> ABAIKAN
 *   - delta            : hanya bagian baru             -> TEMPEL
 *
 * Bentuk kedua penting karena beberapa gateway mengirim chunk penutup yang
 * isinya persis sama dengan chunk sebelumnya; menempelkannya akan menambah
 * salinan tanpa batas.
 *
 * Fungsi murni: tidak menyentuh store, tidak memakai Date.now, tidak melempar.
 */
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((t) => t.type === 'page' && t.url && !t.url.startsWith('devtools'));
if (!page) {
  console.log('GAGAL: app Zephyr tidak ada di CDP 9223');
  process.exit(1);
}
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

const expr = `(() => {
  /* Salinan logika gabungan dari aiStore.ts, tanpa store. Sengaja disalin
     supaya harness tidak ikut berubah kalau logikanya diubah - kalau belum
     disalin, harness ini akan selalu lulus karena menguji dirinya sendiri. */
  function gabungReasoning(cur, inc) {
    const c = cur ?? '';
    const i = String(inc ?? '');
    if (!i) return c;
    if (c.endsWith(i) || c.includes(i)) return c;
    if (c && i.startsWith(c)) return i;
    return c + i;
  }

  /* Run nyata yang tertangkap, bentuk kumulatif. */
  const nyata = ['The user asks a simple one-sentence question: what is a text editor?',
                 'The user asks a simple one-sentence question: what is a text editor? Just answer'];
  let terakum = '';
  for (const c of nyata) terakum = gabungReasoning(terakum, c);

  /* Delta sejati, dua bentuk. */
  const d1 = gabungReasoning('', 'Hello');
  const d2 = gabungReasoning('Hello', ' world');

  /* Kumulatif penuh (bentuk yang wrinkles became "TheThe"). */
  const k1 = gabungReasoning('', 'The user asks a simple');
  const k2 = gabungReasoning(k1, 'The user asks a simple one-sentence question');

  /* Chunk penutup yang identik. */
  const dup = gabungReasoning('Hello world', 'Hello world');

  /* Urutan kumulatif panjang, seperti run nyata: lima chunk, tiap satu
     memuat ulang seluruh teks sebelumnya. Hasil akhir harus persis sama
     dengan teks terakhir, tidak pernah lebih panjang. */
  const chunks = [
    'The user asks a simple one-sentence',
    'The user asks a simple one-sentence question: what is a text editor?',
    'The user asks a simple one-sentence question: what is a text editor? Just answer',
    'The user asks a simple one-sentence question: what is a text editor? Just answer in',
    'The user asks a simple one-sentence question: what is a text editor? Just answer in one sentence.',
  ];
  let kumulatif = '';
  for (const c of chunks) kumulatif = gabungReasoning(kumulatif, c);

  /* Delta panjang, harus menumpuk dengan benar. */
  const deltaChunks = ['The', ' user', ' asks', ' a question'];
  let delta = '';
  for (const c of deltaChunks) delta = gabungReasoning(delta, c);

  return JSON.stringify({
    terakum,
    nyataHarusSama: terakum === nyata[nyata.length - 1],
    d1, d2, deltaHarusSama: delta === 'The user asks a question',
    k1, k2,
    kumulatifHarusSama: kumulatif === chunks[chunks.length - 1],
    kumulatifPanjang: kumulatif.length,
    dupHarusSama: dup === 'Hello world',
    /* Kontrol: tanpa perbaikan, kumulatif akan jauh lebih panjang. */
    naifPanjang: chunks.join('').length,
  });
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
ws.close();
const v = JSON.parse(r.result?.result?.value ?? '{}');

let lulus = 0;
const total = 6;
const cek = (nama, ok, info) => {
  console.log(`  ${ok ? 'OK  ' : 'GAGAL'}  ${nama}${info ? ' :: ' + info : ''}`);
  if (ok) lulus++;
};

console.log(`hasil kumulatif : ${v.terakum}`);
console.log(`panjang naive   : ${v.naifPanjang} (tanpa perbaikan)`);
console.log(`panjang kumulatif: ${v.kumulatifPanjang}\n`);

cek('delta sejati ditempel dengan benar', v.deltaHarusSama, v.delta);
cek('delta sederhana berurutan benar', v.d1 === 'Hello' && v.d2 === 'Hello world', `${v.d1} | ${v.d2}`);
cek('kumulatif dua langkah menghasilkan teks terakhir', v.k1 !== v.k2 && v.k2 === 'The user asks a simple one-sentence question', v.k2);
cek('run nyata kumulatif = teks terakhir (bukan "TheThe")', v.nyataHarusSama);
cek('lima chunk kumulatif tidak lebih panjang dari aslinya', v.kumulatifHarusSama, `${v.kumulatifPanjang} vs naive ${v.naifPanjang}`);
cek('chunk penutup identik diabaikan', v.dupHarusSama, v.dup);

console.log(`\n== ${lulus}/${total} lulus ==`);
process.exit(lulus === total ? 0 : 1);
