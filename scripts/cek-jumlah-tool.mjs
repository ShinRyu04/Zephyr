/**
 * cek-jumlah-tool.mjs - berapa tool yang ADA vs berapa yang DIIZINKAN.
 *
 *   node scripts/cek-jumlah-tool.mjs [port]
 *
 * Dua angka ini sering tertukar, dan bedanya penting:
 *
 *   - jumlah tool TERDAFTAR  = berapa tool yang dimiliki Zephyr (kode)
 *   - jumlah SEKAAT TERBUKA  = berapa yang boleh dipakai agen (pengaturan)
 *
 * Angka seperti "31/76" berarti 31 sekat terbuka dari 76 tool - itu PENGATURAN,
 * bukan kode yang belum dibangun. Menyamakannya akan membuat orang membangun
 * ulang sesuatu yang sudah ada, atau menunggu rebuild yang tidak akan mengubah
 * apa pun.
 *
 * Alat bantu, bukan uji.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const d = await cdp.json(`return JSON.stringify(await (async () => {
  const gate = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'toolGate.ts');
  const tools = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'agentTools.ts');

  const terdaftar = (tools.AGENT_TOOLS || []).map((t) => t.spec.name);
  const g = gate.useToolGate.getState();

  /*
   * Sekat disimpan sebagai himpunan id. Id sebuah tool bisa berupa namanya
   * langsung, atau 'tool:<nama>'. Keduanya dihitung, karena keduanya
   * mengizinkan tool yang sama.
   */
  const aktif = [...(g.aktif || [])];
  const idGrup = (gate.TOOL_GROUPS || []).map((x) => x.id);
  const grupTerbuka = aktif.filter((a) => idGrup.includes(a));
  const semuaTerbuka = aktif.includes('all') || aktif.includes('*');

  /* Tool yang benar-benar boleh dipakai: lewat nama tool, lewat grupnya, atau
     karena semuanya dibuka. */
  const peta = {};
  for (const gr of gate.TOOL_GROUPS || []) for (const t of gr.tools || []) peta[t] = gr.id;

  const boleh = semuaTerbuka
    ? terdaftar
    : terdaftar.filter((n) => aktif.includes(n) || aktif.includes('tool:' + n) || aktif.includes(peta[n]));

  /* Tool INTI yang belum dibuka - inilah yang perlu disarankan ke pengguna. */
  const inti = gate.TOOL_INTI || [];
  const intiTertutup = inti.filter((n) => !boleh.includes(n));

  return {
    terdaftar: terdaftar.length,
    sekatAktif: aktif.length,
    semuaTerbuka,
    grupTerbuka: grupTerbuka.length,
    boleh: boleh.length,
    inti: inti.length,
    intiTertutup,
    contohSekat: aktif.slice(0, 12),
  };
})())`);

console.log('jumlah tool TERDAFTAR (kode)  :', d.terdaftar);
console.log('sekat yang terbuka (pengaturan):', d.sekatAktif, d.semuaTerbuka ? '(SEMUA terbuka)' : '');
console.log('grup yang terbuka              :', d.grupTerbuka);
console.log('tool yang BOLEH dipakai        :', d.boleh, 'dari', d.terdaftar);
console.log('tool inti                      :', d.inti, '| belum dibuka:', d.intiTertutup.length);
if (d.intiTertutup.length) console.log('  inti tertutup:', d.intiTertutup.join(', '));
console.log('contoh sekat terbuka           :', d.contohSekat.join(', '));

await cdp.close();
process.exit(0);
