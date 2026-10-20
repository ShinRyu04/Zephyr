/**
 * `tunjuk` turns a complaint into an OPEN page - and refuses to guess.
 *
 * Two things are worth proving, and they pull in opposite directions:
 *   1. a real complaint ("AI-nya boros token") reaches the right Settings
 *      section, because that translation is the whole point of the tool;
 *   2. a complaint it does NOT understand opens NOTHING and says so, because
 *      opening the wrong page costs the reader more than an honest gap.
 *
 * Run: node scripts/verify-tunjuk.mjs
 *
 * Source-level: the mapping tables and the guards are read from the module. The
 * tool's `run` needs the live stores (`bukaSetelan` reads `useStore`), so the
 * behavioural half drives the MAPPING function rather than the whole tool.
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

const tunjuk = baca('src/lib/zephyrTools/tunjuk.ts');
const katalog = baca('src/lib/zephyrTools/catalog.ts');
const agentTools = baca('src/lib/agentTools.ts');
const kendali = baca('src/lib/zephyrTools/kendaliJendela.ts');

console.log('\n1. Terdaftar dan selalu dikirim');
hasil(
  'tool diekspor sebagai tunjukTool',
  /export const tunjukTool: AgentTool/.test(tunjuk),
  'deklarasi tool tidak ditemukan',
);
hasil(
  'masuk AGENT_TOOLS',
  /TOOL_TUNJUK/.test(agentTools),
  'tool tidak pernah sampai ke model',
);
hasil(
  'masuk TOOL_DIKIRIM_SELALU',
  /'tunjuk',/.test(katalog.split('TOOL_DIKIRIM_SELALU')[1] ?? ''),
  'harus dicari lewat tool_search dulu - terlambat untuk pembaca yang bingung',
);
hasil(
  'punya entri katalog',
  /^\s*\['tunjuk',/m.test(katalog),
  'tanpa entri katalog, gate tidak mengenalinya',
);

console.log('\n2. Peta niat -> seksi benar-benar ada');
/*
 * The section list is read from `KONTROL_SETELAN` - the map that actually
 * dispatches each section. An earlier version of this check only matched values
 * starting with `PEMBUKA_`, so every section opened through a palette command
 * (`view.settings`, `settings.theme`, …) looked "missing" and the harness failed
 * on correct code. Read the KEYS of the map instead: the key is the section id,
 * whatever opens it.
 */
const blokSetelan = /KONTROL_SETELAN[^=]*=\s*\{([\s\S]*?)\};/.exec(kendali);
const seksiNyata = new Set(
  [...(blokSetelan?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map((m) => m[1]),
);
const blokTabelSetelan = /const NIAT_SETELAN[^=]*=\s*\[([\s\S]*?)\n\];/.exec(tunjuk)?.[1] ?? '';
const seksiTabel = [...blokTabelSetelan.matchAll(/seksi: '([a-z]+)'/g)].map((m) => m[1]);
console.log(`        seksi nyata (${seksiNyata.size}): ${[...seksiNyata].join(', ')}`);
/*
 * `models` is NOT a Settings section - it is a stand-alone popup
 * (`AiModelsModal`). It is allowed explicitly here and handled by its own branch
 * in the tool, because "where do I put my API key" is one of the most common
 * questions and the answer is not in Settings at all.
 */
const seksiAsing = seksiTabel.filter((s) => s !== 'models' && !seksiNyata.has(s));
hasil(
  `semua ${seksiTabel.length} seksi di tabel ada di daftar nyata`,
  seksiAsing.length === 0,
  `tidak ada: ${seksiAsing.join(', ')}`,
);

const blokPanel = /KONTROL_PANEL[^=]*=\s*\{([\s\S]*?)\};/.exec(kendali);
const panelNyata = new Set(
  [...(blokPanel?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map((m) => m[1]),
);
const panelTabel = [...tunjuk.matchAll(/panel: '([a-z]+)'/g)].map((m) => m[1]);
const panelAsing = panelTabel.filter((p) => !panelNyata.has(p));
hasil(
  `semua ${panelTabel.length} panel di tabel ada di daftar nyata`,
  panelAsing.length === 0,
  `tidak ada: ${panelAsing.join(', ')} (nyata: ${[...panelNyata].join(', ')})`,
);

console.log('\n3. Perilaku: niat nyata -> tujuan yang benar');
/*
 * The mapping is duplicated here ON PURPOSE for the check: a harness that calls
 * the module's own matcher would pass even if the table were empty. These pairs
 * are the reader's own words, taken from the conversation.
 *
 * Destinations that are NOT Settings sections carry a `panel:` prefix - agent
 * settings and MCP moved into the Agent Customizations panel, and the Settings
 * nav has no row for them any more.
 */
const NIAT_UJI = [
  ['biar AI nggak boros token', 'panel:agent-custom'],
  ['cara ganti tema', 'theme'],
  ['gimana ganti pintasan keyboard', 'shortcuts'],
  ['di mana atur server mcp', 'panel:agent-mcp'],
  ['mau ganti api key', 'models'],
  ['intellisense saya mati', 'lsp'],
  ['pasang ekstensi dari marketplace', 'extensions'],
  ['cara commit git', 'scm'],
  ['atur izin akses web', 'security'],
  ['ganti bahasa antarmuka', 'general'],
  ['cek versi aplikasi', 'about'],
  ['agennya gak munculin to-do list', 'panel:agent-todo'],
  /* Dua jendela yang dilaporkan mendarat di Settings. Yang benar adalah
     jendela miliknya sendiri, bukan `settings`. */
  ['buka chat settings', 'panel:chat-settings'],
  ['buka agent customizations', 'panel:agent-custom'],
];

/* Re-implement the matchers from the module's own tables so a table edit is felt.
   Longest matching trigger wins, exactly like `pilihTerbaik()` in the module. */
const bacaKata = (blok) => [...blok.matchAll(/'([^']+)'/g)].map((x) => x[1]);

const permukaan = [
  ...tunjuk.matchAll(/id: '([a-z-]+)',\s*\n\s*kata: \[([\s\S]*?)\],/g),
].map((m) => ({ id: m[1], kata: bacaKata(m[2]) }));

const entri = [...blokTabelSetelan.matchAll(/seksi: '([a-z]+)',\s*\n\s*kata: \[([\s\S]*?)\],/g)].map((m) => ({
  seksi: m[1],
  kata: bacaKata(m[2]),
}));
hasil(`tabel niat terbaca (${entri.length} seksi)`, entri.length >= 10, `cuma ${entri.length}`);
hasil(`tabel permukaan terbaca (${permukaan.length})`, permukaan.length >= 5, `cuma ${permukaan.length}`);

const terbaik = (niat, daftar, ambil) => {
  const n = niat.toLowerCase();
  let best;
  let len = 0;
  for (const d of daftar) {
    for (const k of d.kata) {
      if (k.length > len && n.includes(k)) {
        best = d;
        len = k.length;
      }
    }
  }
  return best ? ambil(best) : null;
};

const cocok = (niat) => {
  /* Same precedence as the tool: a surface first, then a Settings section. */
  return (
    terbaik(niat, permukaan, (p) => `panel:${p.id}`) ??
    terbaik(niat, entri, (e) => e.seksi)
  );
};

for (const [niat, harus] of NIAT_UJI) {
  const dapat = cocok(niat);
  hasil(`"${niat}" -> ${harus}`, dapat === harus, `dapat ${dapat ?? '(tidak ketemu)'}`);
}

console.log('\n4. Niat yang tidak dikenal TIDAK membuka apa pun');
for (const niat of ['harga bitcoin hari ini', 'buatkan puisi tentang hujan', 'xyzzy plugh']) {
  const dapat = cocok(niat);
  hasil(`"${niat}" -> tidak ketemu`, dapat === null, `keliru cocok ke ${dapat}`);
}
/*
 * The fallback branch must not OPEN anything. Checked structurally: the branch
 * that returns "Tidak ada halaman yang cocok" is the LAST block in `run`, and it
 * must not contain a call to `bukaSetelan(` / `bukaPanel(` after that string.
 *
 * An earlier version used a greedy regex that ran past the end of the branch and
 * matched the calls in the branches ABOVE it, so it failed on correct code.
 * Anchor on the return statement and stop at the closing of `run`.
 */
const cabangFallback = tunjuk.slice(tunjuk.indexOf('Tidak ada halaman yang cocok'));
hasil(
  'cabang tidak-ketemu TIDAK memanggil bukaSetelan/bukaPanel',
  cabangFallback.length > 0 &&
    !/bukaSetelan\(/.test(cabangFallback) &&
    !/bukaPanel\(/.test(cabangFallback),
  'cabang fallback masih membuka sesuatu - tebakan yang tidak boleh terjadi',
);
hasil(
  'hasil tidak-ketemu menyebut daftar yang tersedia',
  /Bagian Settings yang ada: \$\{daftarSetelan\(\)/.test(tunjuk),
  'pembaca tidak diberi jalan keluar saat tidak ketemu',
);

console.log('\n5. Guard: seksi yang tidak ada di build ini ditolak');
hasil(
  'memeriksa daftarSetelan() sebelum membuka',
  /daftarSetelan\(\)[\s\S]{0,120}includes/.test(tunjuk),
  'bisa membuka seksi yang tidak ada',
);
hasil(
  'buka=false tidak memindahkan layar',
  /if \(!buka\)/.test(tunjuk),
  'buka=false diabaikan',
);

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
