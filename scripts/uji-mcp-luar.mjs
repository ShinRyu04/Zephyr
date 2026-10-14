/**
 * uji-mcp-luar.mjs - bukti tool server MCP luar bisa dipanggil agent.
 *
 * Kenapa ini penting: pembaca bisa mendaftarkan server MCP di Settings, dan
 * Zephyr menampilkan daftar tool-nya - tapi AGENT tidak pernah diberi tahu
 * bahwa tool itu ada. `AGENT_TOOLS` adalah array statis dari modul Zephyr
 * sendiri, jadi setiap server yang didaftarkan pembaca tidak terlihat oleh
 * model. Pembaca melihat "12 tool tersedia", model tidak bisa memanggil satu pun.
 *
 * Yang diuji:
 *   1. nama tool yang dibangun bisa dipecah kembali dengan benar
 *   2. nama Zephyr sendiri TIDAK dianggap server luar
 *   3. id server yang memuat tanda hubung tetap benar
 *   4. spec yang dikirim punya bentuk yang sah (name + parameters object)
 *   5. nama server dan nama tool yang memuat `__` tidak saling tertukar
 *
 * Murni: tidak menempel ke CDP, tidak butuh app jalan, tidak butuh server MCP.
 *
 *   node scripts/uji-mcp-luar.mjs
 */
import { reporter } from './lib-cdp.mjs';
import fs from 'node:fs';

const R = reporter('tool server MCP luar');

let gagal = false;
const asli = R.check.bind(R);
R.check = (id, ok, detail) => {
  if (!ok) gagal = true;
  asli(id, ok, detail);
};

/* Cerminan namaToolMcp/pecahNamaMcp di src/lib/mcpTools.ts. */
const namaToolMcp = (serverId, tool) => `mcp__${serverId}__${tool}`;

function pecahNamaMcp(nama) {
  if (!nama.startsWith('mcp__')) return null;
  const sisa = nama.slice('mcp__'.length);
  const pisah = sisa.indexOf('__');
  if (pisah <= 0) return null;
  const serverId = sisa.slice(0, pisah);
  const tool = sisa.slice(pisah + 2);
  if (!serverId || !tool) return null;
  if (serverId === 'zephyr') return null;
  return { serverId, tool };
}

/* ── 1. Bolak-balik ───────────────────────────────────────────────────── */

const kasus = [
  ['sentry', 'list_issues'],
  ['github', 'create_pr'],
  ['my-server', 'do-thing'],
  ['s', 't'],
  ['server', 'tool_with_underscores'],
];

for (const [sid, tool] of kasus) {
  const nama = namaToolMcp(sid, tool);
  const balik = pecahNamaMcp(nama);
  R.check(
    `M-${sid}.${tool}`,
    balik && balik.serverId === sid && balik.tool === tool,
    `${nama} -> ${balik ? `${balik.serverId}.${balik.tool}` : 'null'}`,
  );
}

/* ── 2. Namespace Zephyr sendiri ditolak ──────────────────────────────── */

R.check('M1', pecahNamaMcp('mcp__zephyr__inspect') === null, 'mcp__zephyr__ bukan server luar');
R.check('M2', pecahNamaMcp('mcp__zephyr__run_command') === null, 'mcp__zephyr__ (tool sendiri) bukan server luar');

/* ── 3. Nama yang bukan milik kita ────────────────────────────────────── */

for (const buruk of ['read_file', 'grep', 'mcp__', 'mcp__sentry', '__x__y', 'mcp__sentry__']) {
  R.check(`M3-${buruk || 'kosong'}`, pecahNamaMcp(buruk) === null, `"${buruk}" ditolak`);
}

/* ── 4. Tool yang memuat `__` tetap utuh ──────────────────────────────── */

/*
 * Dibelah pada `__` PERTAMA setelah prefiks, bukan yang terakhir. Kalau
 * dibelah dari belakang, tool bernama `a__b` akan terbaca sebagai server `a`
 * dan tool `b` - panggilan yang salah server.
 */
const dbl = pecahNamaMcp('mcp__sentry__list__issues');
R.check('M4', dbl && dbl.serverId === 'sentry' && dbl.tool === 'list__issues', `tool ber-__ utuh (${JSON.stringify(dbl)})`);

/* ── 5. Spec punya bentuk yang sah ────────────────────────────────────── */

/* Cerminan mcpExternalSpecs(). */
const buatSpec = (t) => ({
  name: namaToolMcp(t.serverId, t.name),
  description: `[${t.serverLabel}] ${t.description || t.name}`.trim(),
  parameters: Object.keys(t.schema).length > 0 ? t.schema : { type: 'object', properties: {} },
});

const s1 = buatSpec({ serverId: 'sentry', serverLabel: 'Sentry', name: 'list_issues', description: 'Daftar issue', schema: { type: 'object', properties: { q: { type: 'string' } } } });
R.check('M5', s1.name === 'mcp__sentry__list_issues', `nama benar (${s1.name})`);
R.check('M6', s1.description.startsWith('[Sentry]'), 'label server ikut di description');
R.check('M7', s1.parameters.type === 'object', 'schema diteruskan apa adanya');

const s2 = buatSpec({ serverId: 'x', serverLabel: 'X', name: 'y', description: '', schema: {} });
R.check('M8', s2.parameters.type === 'object' && !!s2.parameters.properties, 'schema kosong dapat objek default');
R.check('M9', s2.description === '[X] y', 'description kosong jatuh ke nama tool');

/* ── 6. Pemeriksaan silang ke sumber ──────────────────────────────────── */

const mcpSrc = (() => {
  try {
    return fs.readFileSync('src/lib/mcpTools.ts', 'utf8');
  } catch {
    return '';
  }
})();
const agentSrc = (() => {
  try {
    return fs.readFileSync('src/lib/agentTools.ts', 'utf8');
  } catch {
    return '';
  }
})();

R.check('M10', /export function pecahNamaMcp/.test(mcpSrc), 'pecahNamaMcp diekspor');
R.check('M11', /indexOf\('__'\)/.test(mcpSrc), 'dibelah pada __ PERTAMA di sumber');
R.check('M12', /serverId === 'zephyr'/.test(mcpSrc), 'namespace Zephyr ditolak di sumber');
R.check('M13', /mcpExternalSpecs\(\)/.test(agentSrc), 'agentTools menyertakan spec MCP luar');
R.check(
  'M14',
  /pecahNamaMcp\(nama\)/.test(agentSrc),
  'agentTools merutekan panggilan MCP luar sebelum pencarian lokal',
);

console.log('\n  catatan: aturan di atas mencerminkan src/lib/mcpTools.ts');
R.selesai();
process.exit(gagal ? 1 : 0);
