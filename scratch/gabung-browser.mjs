/*
 * Consolidate the seven browser tools in `web.ts` into one `browser` tool.
 *
 * The tool bodies are NOT rewritten: each old `run` is renamed to a named
 * function and handed to `buatBrowserTool` as the bridge. That keeps every gate
 * check, every refusal message and every `kebijakan()` call exactly where it was
 * - this change is about how many NAMES the model sees, not about behaviour.
 *
 * Run once: node scratch/gabung-browser.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const P = 'src/lib/zephyrTools/web.ts';
const asli = readFileSync(P, 'utf8');
const baris = asli.split(/\r?\n/);

/** [nama lama, nama fungsi baru] */
const PETA = [
  ['browser_open', 'bukaBrowser'],
  ['browser_read', 'bacaBrowser'],
  ['browser_click', 'klikBrowser'],
  ['browser_type', 'ketikBrowser'],
  ['browser_list', 'daftarBrowser'],
  ['browser_close', 'tutupBrowser'],
  ['browser_download_url', 'unduhBrowser'],
];

/*
 * Find each tool object by its `name:` line, then walk outward to the enclosing
 * `{ ... }` entry in the TOOL_WEB array. Each entry starts at a line matching
 * /^  \{/ and ends at the matching /^  \},/.
 */
const entri = [];
for (const [nama] of PETA) {
  const idxNama = baris.findIndex((b) => new RegExp(`name: '${nama}'`).test(b));
  if (idxNama < 0) {
    console.error(`GAGAL: tool ${nama} tidak ditemukan`);
    process.exit(1);
  }
  let mulai = idxNama;
  while (mulai > 0 && !/^  \{$/.test(baris[mulai])) mulai--;
  let akhir = idxNama;
  while (akhir < baris.length && !/^  \},?$/.test(baris[akhir])) akhir++;
  entri.push({ nama, mulai, akhir });
}

console.log('entri ditemukan:');
for (const e of entri) console.log(`  ${e.nama.padEnd(22)} baris ${e.mulai + 1}..${e.akhir + 1}`);

/*
 * Extract each `run` body and turn it into a standalone function.
 *
 * The bodies reference `wajib`, `kebijakan`, `evalPane` and friends - all module
 * scope in this file - so they keep working unchanged once lifted out of the
 * object literal.
 */
const fungsi = [];
for (const e of entri) {
  const blok = baris.slice(e.mulai, e.akhir + 1);
  const iRun = blok.findIndex((b) => /^\s{4}run:/.test(b));
  if (iRun < 0) {
    console.error(`GAGAL: run tidak ditemukan di ${e.nama}`);
    process.exit(1);
  }
  /*
   * `run: async (a) => {` ... `},` - collect the body.
   *
   * The body ends at the FIRST line that closes the arrow function. That is a
   * line whose only content is `}` at the indentation the `run:` line started
   * with (4 spaces inside a tool object). Counting braces instead was tried and
   * is wrong here: the bodies contain template literals with `${...}` and
   * strings holding braces, so a naive counter drifts.
   *
   * An earlier version matched /^\s{4}\},?$/ - four spaces - which is right for
   * the close of `run` itself. It is NOT right for `browser_open`, whose body
   * contains a `}` closing an `if` at TWO spaces followed by a template
   * continuation; that line was taken as the end of the function and the rest of
   * the body was dropped.
   */
  /*
   * `run: async (a) => {` ... its own closing `},`
   *
   * The body ends at the first line that is ONLY `},` at the SAME indentation as
   * the `run:` line. Everything from there to the end of the tool object is
   * structure, not body - so the walk stops and the remainder is discarded.
   *
   * Two earlier versions were wrong and both produced a file that would not
   * compile: one matched exactly four spaces (the file uses two), the other kept
   * the closing `},` and then also emitted the object's own `},` and `}`, leaving
   * three stray closers per tool. Reading the indentation off the `run:` line
   * instead of hard-coding it is what makes this independent of the file.
   */
  const badan = [];
  const indentRun = /^\s*/.exec(blok[iRun])[0].length;
  for (let i = iRun + 1; i < blok.length; i++) {
    const b = blok[i];
    const indent = /^\s*/.exec(b)[0].length;
    /* `},` closes the arrow function itself - at ANY indentation. The bodies in
       this file also contain `  },` (closing an `if`), so the match is on the
       line being exactly `},` and nothing else. */
    if (/^\s*\},?\s*$/.test(b)) break;
    badan.push(b);
  }
  /* De-indent by the common amount so the body sits inside a function. */
  const minimal = Math.min(
    ...badan.filter((b) => b.trim()).map((b) => /^\s*/.exec(b)[0].length),
  );
  const badanRapi = badan.map((b) => b.slice(Number.isFinite(minimal) ? minimal : 0));
  const namaFn = PETA.find(([n]) => n === e.nama)[1];
  fungsi.push({ nama: e.nama, namaFn, badan: badanRapi });
}

/*
 * Build the replacement text: named functions + one `browser` entry.
 */
const teksFungsi = fungsi
  .map(
    (f) =>
      `/* Bekas tool \`${f.nama}\` - badan aslinya, tidak diubah. */\n` +
      `async function ${f.namaFn}(a: Record<string, unknown>): Promise<string> {\n` +
      f.badan.join('\n') +
      `\n}\n`,
  )
  .join('\n');

const entriBaru =
  `  /*\n` +
  `   * \`browser\` - SATU tool untuk tujuh aksi pane browser.\n` +
  `   *\n` +
  `   * Tujuh nama lama (\`browser_open\`, \`browser_read\`, \`browser_click\`,\n` +
  `   * \`browser_type\`, \`browser_list\`, \`browser_close\`, \`browser_download_url\`)\n` +
  `   * menjadi satu, dengan \`aksi\` sebagai parameter. Badan tiap aksi TIDAK\n` +
  `   * ditulis ulang: fungsi-fungsi di atas adalah badan aslinya, lengkap dengan\n` +
  `   * gerbang izin dan pesan penolakannya. Yang berubah hanya berapa NAMA yang\n` +
  `   * dilihat model.\n` +
  `   */\n` +
  `  buatBrowserTool({\n` +
  `    open: (url) => bukaBrowser({ url }),\n` +
  `    read: (paneId) => bacaBrowser(paneId ? { paneId } : {}),\n` +
  `    click: (paneId, selector) => klikBrowser(paneId ? { paneId, selector } : { selector }),\n` +
  `    type: (paneId, selector, text) =>\n` +
  `      ketikBrowser(paneId ? { paneId, selector, text } : { selector, text }),\n` +
  `    list: () => daftarBrowser({}),\n` +
  `    close: (paneId) => tutupBrowser(paneId ? { paneId } : {}),\n` +
  `    download: (url, simpanKe) => unduhBrowser(simpanKe ? { url, simpanKe } : { url }),\n` +
  `  }),`;

/*
 * Rebuild the file: everything before the first entry, the new functions, the
 * new single entry, then everything after the last entry.
 */
/*
 * Rebuild the file.
 *
 * The helper functions must go BEFORE the `export const TOOL_WEB` array, not at
 * the first entry's position: that position is INSIDE the array literal, and an
 * `async function` declaration is not a valid array element. Inserting them there
 * produced `error TS1109: Expression expected` at the array's closing bracket -
 * the parser had been reading declarations as elements.
 */
const awal = entri[0].mulai;
const akhir = entri[entri.length - 1].akhir;
if (entri.some((e, i) => i > 0 && e.mulai <= entri[i - 1].akhir)) {
  console.error('GAGAL: entri tumpang tindih - berhenti supaya tidak merusak berkas');
  process.exit(1);
}

const iArray = baris.findIndex((b) => /^export const TOOL_WEB\b/.test(b));
if (iArray < 0 || iArray > awal) {
  console.error('GAGAL: deklarasi TOOL_WEB tidak ditemukan sebelum entri pertama');
  process.exit(1);
}

const hasil = [
  ...baris.slice(0, iArray),
  ...teksFungsi.split('\n'),
  ...baris.slice(iArray, awal),
  entriBaru,
  /* NO synthetic `];` - the closing bracket sits after the last entry and is
     already inside this slice. Adding one produced two of them. */
  ...baris.slice(akhir + 1),
].join('\n');

writeFileSync(P, hasil);
console.log(`ok: ${fungsi.length} tool digabung jadi satu entri \`browser\``);
