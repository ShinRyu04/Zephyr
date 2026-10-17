/**
 * External MCP tools must be ANNOUNCED to the model, not just mounted.
 *
 * Bug 7. The whole chain was wired - `mcpStore` -> `mcpTools` -> `agentTools` ->
 * `mcpClientCall` -> `mcp_client.rs` - and `mcpExternalSpecs()` sends external
 * tools on EVERY request. But the prompt only ever said "3 external server(s):
 * context7, github, deepwiki". A server NAME is not a tool name: the model had
 * no way to learn that `mcp__context7__query-docs` was in its own tool list, so
 * the reader's servers were effectively invisible.
 *
 * Run: node scripts/verify-mcp-prompt.mjs
 *
 * The behavioural half imports the real module and checks the text that comes
 * out, because a source check would pass even if the branch never ran.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const runtime = baca('src/lib/zephyrRuntime.ts');
const mcpTools = baca('src/lib/mcpTools.ts');
const agentTools = baca('src/lib/agentTools.ts');

console.log('\n1. Sumber: baris MCP menyebut tool, bukan cuma nama server');
hasil(
  'barisMcp memakai mcpRingkas()',
  /function barisMcp[\s\S]*?mcpRingkas\(\)/.test(runtime),
  'baris MCP masih hanya menyebut nama server',
);
hasil(
  'menyebut bentuk nama tool mcp__<server>__<tool>',
  /mcp__<server>__<tool>/.test(runtime),
  'model tidak diberi tahu bagaimana tool luar dipanggil',
);
hasil(
  'melarang mengaku server tidak terjangkau',
  /never claim a server listed here is unreachable/i.test(runtime),
  'tidak ada instruksi agar model tidak menolak server yang ada',
);
hasil(
  'mcpRingkas diimpor statis (bukan async)',
  /^import \{ mcpRingkas \} from '\.\/mcpTools';$/m.test(runtime),
  'impor dinamis membuat blok sinkron kadang kosong di giliran pertama',
);

console.log('\n2. Sumber: yang dihitung sama dengan yang dikirim');
hasil(
  'mcpRingkas menghitung dari daftar yang dipasang',
  /function hitungRingkas\(list: McpExternalTool\[\]\)/.test(mcpTools),
  'ringkasan tidak dihitung dari daftar nyata',
);
hasil(
  'mcpExternalSpecs memakai jatah yang SAMA dengan ringkasan',
  /const jatah = new Map\(ringkas\.map\(\(r\) => \[r\.serverId, r\.dipakai\]\)\)/.test(mcpTools),
  'angka di prompt bisa berbeda dari jumlah skema yang dikirim',
);
hasil(
  'tool MCP luar dikirim SELALU (bukan lewat tool_search)',
  /return \[\.\.\.daftar\.map\(\(t\) => t\.spec\), \.\.\.mcpExternalSpecs\(\)\]/.test(agentTools),
  'tool luar masih disembunyikan di balik tool_search',
);

console.log('\n3. Perilaku: angka di ringkasan == jumlah skema yang benar-benar dikirim');
/*
 * `mcpTools.ts` diimpor LANGSUNG (Node 24 membuang anotasi tipe sendiri). Itu
 * modul yang memutuskan berapa tool dikirim, jadi mengujinya di sini
 * membuktikan hal yang paling penting: angka yang ditulis ke prompt tidak bisa
 * berbeda dari jumlah skema yang sampai ke model.
 *
 * `zephyrRuntime.ts` TIDAK diimpor: ia menarik `mcpStore`, yang mengimpor
 * `./commands` tanpa ekstensi - resolusi Vite, bukan Node - dan repo ini tidak
 * punya transpiler TS di devDependencies. Karena itu kalimat prompt-nya
 * diperiksa di tingkat SUMBER (bagian 1), dan bunyinya yang sebenarnya baru
 * terbukti saat app hidup (Fase 5-6). Itu batas yang saya sebut apa adanya,
 * bukan yang saya sembunyikan.
 */
try {
  const { setMcpExternalTools, mcpRingkas, mcpExternalSpecs } = await import(
    pathToFileURL(join(akar, 'src/lib/mcpTools.ts')).href
  );

  /* Two servers, one of them over the cap: the cap must bite in BOTH places. */
  const daftar = [
    ...Array.from({ length: 5 }, (_, i) => ({
      serverId: 'kecil',
      serverLabel: 'Kecil',
      name: `t${i}`,
      description: 'd',
      schema: {},
    })),
    ...Array.from({ length: 60 }, (_, i) => ({
      serverId: 'besar',
      serverLabel: 'Besar',
      name: `u${i}`,
      description: 'd',
      schema: {},
    })),
  ];
  setMcpExternalTools(daftar, 40);

  const ringkas = mcpRingkas();
  const spec = mcpExternalSpecs();
  const kecil = ringkas.find((r) => r.serverId === 'kecil');
  const besar = ringkas.find((r) => r.serverId === 'besar');

  hasil(
    'ringkasan melaporkan 5/5 untuk server kecil',
    kecil?.dipakai === 5 && kecil?.total === 5,
    `dapat ${kecil?.dipakai}/${kecil?.total}`,
  );
  hasil(
    'ringkasan memotong server besar di 40 (dari 60)',
    besar?.dipakai === 40 && besar?.total === 60 && besar?.dibuang === 20,
    `dapat ${besar?.dipakai}/${besar?.total}, dibuang ${besar?.dibuang}`,
  );
  hasil(
    'jumlah skema yang dikirim == jumlah "dipakai" di ringkasan',
    spec.length === ringkas.reduce((n, r) => n + r.dipakai, 0),
    `spec=${spec.length}, jumlah dipakai=${ringkas.reduce((n, r) => n + r.dipakai, 0)}`,
  );
  hasil(
    'nama skema memakai bentuk mcp__<server>__<tool>',
    spec.every((s) => /^mcp__[a-z0-9]+__[a-z0-9]+$/.test(s.name)),
    `contoh: ${spec.slice(0, 3).map((s) => s.name).join(', ')}`,
  );

  setMcpExternalTools([], 40);
  hasil('tanpa server, tidak ada skema terkirim', mcpExternalSpecs().length === 0, 'masih ada skema');
} catch (e) {
  hasil('mcpTools bisa diimpor untuk uji perilaku', false, String(e));
}

console.log(`\n${gagal === 0 ? 'LULUS' : 'GAGAL'} - ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal === 0 ? 0 : 1);
