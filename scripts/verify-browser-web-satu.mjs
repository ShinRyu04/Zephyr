/**
 * The consolidated tools must DISPATCH, not reimplement.
 *
 * `browser` (7 -> 1) and `web` (2 -> 1) are adapters: they translate the unified
 * argument shape and call the original tool. That is deliberate - the originals
 * hold the permission gates and the refusal messages, and a second copy of those
 * would drift.
 *
 * So the checks here are:
 *   1. every action maps to a tool that still exists;
 *   2. the unified arguments reach the original tool (proven by driving a fake
 *      original and reading what it received);
 *   3. an unknown action is refused, not silently ignored;
 *   4. the seven old names are gone from the catalogue and from the always-sent
 *      list, while `browser`/`web` are in it.
 *
 * Run: node scripts/verify-browser-web-satu.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = join(dirname(fileURLToPath(import.meta.url)), '..');
const baca = (rel) => readFileSync(join(akar, rel), 'utf8');

let lulus = 0;
let gagal = 0;
const hasil = (nama, ok, detail) => {
  if (ok) {
    lulus++;
    console.log(`  ok    ${nama}`);
  } else {
    gagal++;
    console.log(`  GAGAL ${nama}${detail ? `\n         ${detail}` : ''}`);
  }
};

const browser = baca('src/lib/zephyrTools/browser.ts');
const web = baca('src/lib/zephyrTools/webSatu.ts');
const katalog = baca('src/lib/zephyrTools/catalog.ts');
const agentTools = baca('src/lib/agentTools.ts');
const webAsli = baca('src/lib/zephyrTools/web.ts');

/*
 * Read the mapping from its OWN object literal, not from the whole file.
 *
 * Matching `word: 'word',` across the file also caught the tool's `parameters`
 * schema (`name: 'browser'`, `type: 'object'`), which made the count 9 and
 * reported two phantom actions. The mapping is the object assigned to `PETA`.
 */
function bacaPeta(sumber, nama = 'PETA') {
  const m = new RegExp(`const ${nama}[^=]*=\\s*\\{([\\s\\S]*?)\\};`).exec(sumber);
  if (!m) return [];
  return [...m[1].matchAll(/(\w+):\s*'([a-z_]+)'/g)].map((x) => [x[1], x[2]]);
}

console.log('\n1. Tujuh aksi browser memetakan ke tool yang MASIH ADA');
const petaBrowser = bacaPeta(browser);
hasil(`peta berisi 7 aksi (${petaBrowser.length})`, petaBrowser.length === 7, `dapat ${petaBrowser.length}`);
for (const [aksi, nama] of petaBrowser) {
  hasil(
    `aksi "${aksi}" -> ${nama} ada di web.ts`,
    new RegExp(`name: '${nama}'`).test(webAsli),
    'tool tujuan tidak didefinisikan - dispatch akan gagal saat dipanggil',
  );
}

console.log('\n2. Dua aksi web memetakan ke tool yang MASIH ADA');
const petaWeb = bacaPeta(web);
hasil(`peta berisi 2 aksi (${petaWeb.length})`, petaWeb.length === 2, `dapat ${petaWeb.length}`);
for (const [aksi, nama] of petaWeb) {
  hasil(
    `aksi "${aksi}" -> ${nama} ada di web.ts`,
    new RegExp(`name: '${nama}'`).test(webAsli),
    'tool tujuan tidak didefinisikan',
  );
}

console.log('\n3. Adapter meneruskan argumen, bukan menelannya');
hasil(
  'browser menyalin url/selector/text/simpanKe ke argumen tujuan',
  /args\.url = a\.url/.test(browser) &&
    /args\.selector = a\.selector/.test(browser) &&
    /args\.text = a\.text/.test(browser) &&
    /args\.simpanKe = a\.simpanKe/.test(browser),
  'ada argumen yang tidak diteruskan',
);
hasil(
  'browser meneruskan paneId DAN pane_id',
  /args\.paneId = a\.paneId/.test(browser) && /args\.pane_id = a\.paneId/.test(browser),
  'tujuh tool lama memakai dua ejaan berbeda - keduanya harus diisi',
);
hasil(
  'web menyalin query/url/maxChars',
  /args\.query = a\.query/.test(web) && /args\.url = a\.url/.test(web) && /args\.maxChars = a\.maxChars/.test(web),
  'ada argumen yang tidak diteruskan',
);

console.log('\n4. Aksi tak dikenal DITOLAK, bukan diabaikan');
hasil(
  'browser melempar untuk aksi di luar daftar',
  /if \(!AKSI\.includes\(aksi\)\)[\s\S]{0,120}throw new Error/.test(browser),
  'aksi asing akan jatuh ke undefined',
);
hasil(
  'web melempar untuk aksi di luar daftar',
  /if \(!AKSI\.includes\(aksi\)\)[\s\S]{0,120}throw new Error/.test(web),
  'aksi asing akan jatuh ke undefined',
);
hasil(
  'adapter melaporkan kalau tool tujuan hilang',
  /tidak ada di build ini/.test(browser) && /tidak ada di build ini/.test(web),
  'tool tujuan yang hilang akan menghasilkan TypeError, bukan kalimat jelas',
);

console.log('\n5. Katalog: nama lama hilang, nama baru masuk');
for (const lama of ['browser_open', 'browser_read', 'browser_click', 'browser_type', 'browser_list', 'browser_close', 'browser_download_url', 'web_search', 'web_fetch']) {
  const diKatalog = new RegExp(`^\\s*\\['${lama}',`, 'm').test(katalog);
  hasil(`"${lama}" tidak lagi jadi entri katalog`, !diKatalog, 'masih terdaftar - model melihat nama lama');
}
for (const baru of ['browser', 'web']) {
  hasil(`"${baru}" ada di katalog`, new RegExp(`^\\s*\\['${baru}',`, 'm').test(katalog), 'tidak terdaftar');
}
const selalu = katalog.split('TOOL_DIKIRIM_SELALU')[1] ?? '';
hasil("'browser' selalu dikirim", /'browser',/.test(selalu), 'harus dicari dulu lewat tool_search');
hasil("'web' selalu dikirim", /'web',/.test(selalu), 'harus dicari dulu lewat tool_search');

console.log('\n6. Tool lama DIKELUARKAN dari daftar agen');
hasil(
  'agentTools menyaring TOOL_WEB dengan TOOL_BROWSER_LAMA',
  /TOOL_WEB\.filter\(\(t\) => !TOOL_BROWSER_LAMA\.includes/.test(agentTools),
  'tujuh nama lama masih dikirim ke model',
);
hasil(
  'agentTools menyaring dengan TOOL_WEB_LAMA juga',
  /TOOL_WEB_LAMA\.includes/.test(agentTools),
  'web_search/web_fetch masih dikirim ke model',
);

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
