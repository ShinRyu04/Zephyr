/**
 * cek-klaim-tool.mjs - verifikasi klaim "Zephyr BELUM punya X" satu per satu.
 *
 *   node scripts/cek-klaim-tool.mjs 9223
 *
 * Klaim yang datang dari luar (saran, review, atau agen lain) harus DIBUKTIKAN,
 * bukan dipercaya - sama seperti klaim audit. Yang salah akan mengirim saya
 * menulis tool yang sudah ada, dan itu waktu yang hilang plus risiko merusak
 * yang sudah bekerja.
 *
 * Untuk tiap kapabilitas: cari nama tool yang mungkin mewujudkannya, lalu
 * periksa apakah benar-benar terdaftar di AGENT_TOOLS.
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('cek-klaim-tool');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

const data = await cdp.json(`return JSON.stringify(await (async () => {
  const tools = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'agentTools.ts');
  const semua = (tools.AGENT_TOOLS || []).map((t) => t.spec.name);

  /* Kapabilitas yang diklaim BELUM ada, beserta nama tool yang mungkin
   * mewujudkannya. Kalau salah satu cocok, klaimnya gugur. */
  const klaim = {
    'search kode (grep/ripgrep)': ['search_text', 'grep', 'find_files'],
    'file tree / glob': ['file_list', 'find_files', 'glob', 'list_directory'],
    'codegraph / symbol explorer': ['lsp_query', 'get_problems', 'symbol', 'codegraph', 'definition', 'references'],
    'subagent / parallel task': ['subagent_run', 'subagent_list'],
    'web fetch + docs': ['web_fetch', 'web_search', 'fetch'],
    'screenshot / UI verify': ['screenshot_ui', 'browser_read', 'read_image'],
    'lint / typecheck gate': ['run_tests', 'get_problems', 'terminal_exec'],
    'test runner': ['run_tests', 'terminal_exec'],
  };

  const hasil = {};
  for (const [kap, kandidat] of Object.entries(klaim)) {
    const ketemu = kandidat.filter((k) => semua.includes(k));
    hasil[kap] = { ketemu, ada: ketemu.length > 0, kandidat };
  }

  return { jumlah: semua.length, semua, hasil };
})())`);

r.check('K0', data.jumlah > 0, `${data.jumlah} tool terdaftar di AGENT_TOOLS`);

/* ---- Tiap klaim: ADA atau GUGUR ---- */

const daftar = Object.entries(data.hasil);
let gugur = 0;
let bertahan = 0;

for (const [kap, h] of daftar) {
  if (h.ada) {
    gugur++;
    r.check(
      'K-' + kap.slice(0, 18),
      true,
      `"BELUM PUNYA ${kap}" -> GUGUR, Zephyr sudah punya: ${h.ketemu.join(', ')}`,
    );
  } else {
    bertahan++;
    r.check(
      'K-' + kap.slice(0, 18),
      false,
      `"BELUM PUNYA ${kap}" -> BENAR, tidak ada satu pun dari: ${h.kandidat.join(', ')}`,
    );
  }
}

r.check(
  'K-ringkas',
  true,
  `dari ${daftar.length} klaim: ${gugur} GUGUR (sudah ada), ${bertahan} bertahan (benar belum ada)`,
);

/* Daftar lengkap untuk diperiksa dengan mata. */
console.log('\nSeluruh ' + data.jumlah + ' tool Zephyr:');
console.log(data.semua.join(', '));

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
