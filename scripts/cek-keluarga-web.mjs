/**
 * cek-keluarga-web.mjs - periksa tool web/browser untuk tumpang tindih.
 *
 *   node scripts/cek-keluarga-web.mjs [port]
 *
 * Keluarga ini paling rawan tumpang tindih: "membuka halaman", "mengambil
 * halaman", "membaca halaman", dan "mencari di web" kedengarannya sama, dan
 * dari nama saja tidak bisa dibedakan apakah mereka benar-benar beda atau cuma
 * empat jalan menuju hal yang sama.
 *
 * Yang menentukan: fungsi BACKEND apa yang dipanggil masing-masing. Kalau dua
 * tool memanggil fungsi backend yang sama, mereka duplikat - apa pun namanya.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const d = await cdp.json(`return JSON.stringify(await (async () => {
  const tools = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'agentTools.ts');
  const daftar = tools.AGENT_TOOLS || [];

  const nama = daftar.map((t) => t.spec.name);
  const keluarga = nama.filter((n) =>
    /web|browser|http|url|fetch|search|nav|click|download|system_browser/i.test(n),
  );

  const rinci = keluarga.map((n) => {
    const t = daftar.find((x) => x.spec.name === n);
    const badan = t.run ? String(t.run) : '';
    /* Fungsi backend yang dipanggil - inilah yang membedakan duplikat dari
       tool yang memang berbeda peran. */
    /*
     * Regexnya dibangun dari potongan string, BUKAN ditulis langsung sebagai
     * regex literal.
     *
     * Backslash di dalam template literal DIMAKAN oleh template-nya sendiri
     * sebelum sampai ke JS: garis miring ganda menjadi satu, dan tanda kurung
     * yang di-escape kehilangan escape-nya - lalu regexnya rusak menjadi
     * "Unterminated group". Menyusunnya dari String.fromCharCode menghilangkan
     * seluruh kelas masalah itu, dan cara yang sama sudah dipakai di berkas ini
     * untuk masalah yang sama.
     */
    const titik = String.fromCharCode(92) + '.';
    const buka = String.fromCharCode(92) + '(';
    const pola = new RegExp('cmd' + titik + '([a-zA-Z_]+)' + String.fromCharCode(92) + 's' + buka, 'g');
    const panggilan = [...badan.matchAll(pola)].map((m) => m[1]);
    const unik = [...new Set(panggilan)];
    return {
      nama: n,
      ket: String(t.spec.description || '').slice(0, 150),
      param: Object.keys(t.spec.parameters.properties || {}),
      panggil: unik,
    };
  });

  /* Cari fungsi backend yang dipakai lebih dari satu tool - itu duplikat. */
  const peta = {};
  for (const x of rinci) for (const p of x.panggil) (peta[p] = peta[p] || []).push(x.nama);
  const bersama = Object.entries(peta).filter(([, v]) => v.length > 1);

  return { jumlahSemua: nama.length, keluarga, rinci, bersama };
})())`);

console.log('total tool:', d.jumlahSemua);
console.log('keluarga web/browser:', d.keluarga.length, '->', d.keluarga.join(', '));

console.log('\n=== RINCI ===');
for (const x of d.rinci) {
  console.log('\n  ' + x.nama);
  console.log('    param : ' + (x.param.join(', ') || '(tidak ada)'));
  console.log('    panggil: ' + (x.panggil.join(', ') || '(tidak ada fungsi cmd)'));
  console.log('    ket   : ' + x.ket);
}

console.log('\n=== FUNGSI BACKEND YANG DIPAKAI LEBIH DARI SATU TOOL ===');
if (d.bersama.length === 0) console.log('  tidak ada');
for (const [fungsi, tools] of d.bersama) {
  console.log('  ' + fungsi + '  <-  ' + tools.join(', '));
}

await cdp.close();
process.exit(0);
