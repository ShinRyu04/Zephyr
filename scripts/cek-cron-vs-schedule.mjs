/**
 * cek-cron-vs-schedule.mjs - apakah `cron_*` dan `schedule_command` berbeda?
 *
 *   node scripts/cek-cron-vs-schedule.mjs [port]
 *
 * Dua sistem penjadwalan berdampingan itu mencurigakan. Yang menentukan bukan
 * namanya, melainkan: apakah keduanya menyimpan ke tempat yang sama, dan apakah
 * salah satu hanya pembungkus yang lain.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const d = await cdp.json(`return JSON.stringify(await (async () => {
  const tools = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'agentTools.ts');
  const daftar = tools.AGENT_TOOLS || [];

  const ambil = (nama) => {
    const t = daftar.find((x) => x.spec.name === nama);
    if (!t) return null;
    return {
      nama,
      ket: String(t.spec.description || ''),
      param: Object.keys(t.spec.parameters.properties || {}),
      wajib: t.spec.parameters.required || [],
      /* Badan fungsinya, untuk melihat apakah ia memanggil yang lain. */
      badan: t.run ? String(t.run).slice(0, 320) : null,
    };
  };

  return {
    cron_create: ambil('cron_create'),
    cron_list: ambil('cron_list'),
    schedule_command: ambil('schedule_command'),
    list_schedules: ambil('list_schedules'),
  };
})())`);

for (const [nama, t] of Object.entries(d)) {
  if (!t) {
    console.log('\n=== ' + nama + ': TIDAK ADA ===');
    continue;
  }
  console.log('\n=== ' + nama + ' ===');
  console.log('  deskripsi:', t.ket.slice(0, 200));
  console.log('  parameter:', t.param.join(', '));
  console.log('  wajib    :', t.wajib.join(', ') || '(tidak ada)');
}

/* Periksa apakah salah satu memanggil invoke yang sama dengan yang lain. */
console.log('\n=== apakah saling memanggil? ===');
const badan = Object.entries(d)
  .filter(([, t]) => t && t.badan)
  .map(([n, t]) => [n, t.badan]);
for (const [n, b] of badan) {
  const sebut = ['cron_create', 'schedule_command', 'list_schedules', 'cron_list'].filter((x) => x !== n && b.includes(x));
  console.log('  ' + n + ' menyebut: ' + (sebut.length ? sebut.join(', ') : '(tidak ada)'));
}

await cdp.close();
process.exit(0);
