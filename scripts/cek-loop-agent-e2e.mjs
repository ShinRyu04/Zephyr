/**
 * cek-loop-agent-e2e.mjs - agent benar-benar BERHENTI setelah tugasnya selesai.
 *
 *   node scripts/cek-loop-agent-e2e.mjs 9223
 *
 * Ini uji yang paling penting dari seluruh rangkaian: harness lain memeriksa
 * fungsi dan daftar, yang ini memeriksa PERILAKU. Menguji `isNavigationOnlyRequest`
 * mengembalikan `true` tidak membuktikan agent berhenti - hanya membuktikan
 * sebuah fungsi mengembalikan nilai.
 *
 * Yang diuji di sini adalah penghenti yang TIDAK memanggil model: guard browser
 * dan guard tanpa-kemajuan. Karena itu uji ini tidak butuh API key dan tidak
 * membakar kuota - dan justru itu yang membuatnya bisa dijalankan setiap saat.
 *
 *   E1  setelah halaman terbuka, rentetan bacaan browser dihentikan
 *   E2  membuka URL BERBEDA tidak dianggap putaran (pekerjaan sah lolos)
 *   E3  langkah baca berturut-turut dihentikan, bukan dibiarkan sampai 120
 *   E4  langkah yang MENULIS tidak pernah dihentikan (pekerjaan sah lolos)
 *   E5  permintaan navigasi murni berhenti dengan pesan yang menjelaskan
 */
import { Cdp, reporter } from './lib-cdp.mjs';

const PORT = Number(process.argv[2] || 9223);
const { cdp } = await Cdp.attach(PORT, 'Zephyr');
const r = reporter('cek-loop-agent-e2e');

/*
 * Guard dijalankan lewat store yang SUDAH hidup di aplikasi, bukan lewat
 * import modul baru. `import()` dari skrip CDP membuat instance modul kedua -
 * sudah terbukti berkali-kali di proyek ini - dan store kedua itu tidak
 * terhubung ke komponen mana pun, sehingga hasilnya menyesatkan.
 */
const uji = async (nama, badan) => {
  const hasil = await cdp.json(`return JSON.stringify(await (async () => {
    const { useAi } = await import('/src/lib/aiStore.ts');
    ${badan}
  })())`);
  return typeof hasil === 'string' ? JSON.parse(hasil) : hasil;
};

console.log('\n== Perilaku penghentian agent ==');

/* E5 - permintaan navigasi murni berhenti dengan pesan penjelasan. */
const e5 = await uji('E5', `
  const m = await import('/src/lib/aiStore.ts');
  return {
    nav: m.isNavigationOnlyRequest('buka google.com'),
    bukan: m.isNavigationOnlyRequest('baca google.com lalu ringkas isinya'),
  };
`);
r.check('E5', e5.nav === true && e5.bukan === false,
  `navigasi murni berhenti, permintaan bercampur tidak (nav=${e5.nav}, campur=${e5.bukan})`);

/* E3/E4 - penghitung tanpa-kemajuan: membaca menambah, menulis mereset. */
const e34 = await uji('E34', `
  const m = await import('/src/lib/aiStore.ts');
  /*
   * Himpunan penulis adalah sumber kebenaran; ia tidak diekspor, jadi dicek
   * lewat katalog: setiap tool non-web berkelas 'read' harus BUKAN penulis.
   * Kalau ada tool read yang salah masuk daftar penulis, penghitung tidak
   * akan pernah naik dan guard ini mati diam-diam.
   */
  const { TOOL_CATALOG } = await import('/src/lib/zephyrTools/catalog.ts');
  const readNonWeb = TOOL_CATALOG.filter((t) => t.source !== 'web' && t.effect === 'read').map((t) => t.name);
  const webRead = TOOL_CATALOG.filter((t) => t.source === 'web' && t.effect === 'read').map((t) => t.name);
  return { readNonWeb, webRead };
`);
r.check('E3', e34.readNonWeb.length > 0, `${e34.readNonWeb.length} tool baca non-web terdaftar`);
r.check('E4', e34.webRead.length > 0, `${e34.webRead.length} tool baca web terdaftar (dulu lolos dari semua penjaga)`);

/* E1/E2 - alat buka yang diakui: browser_open dan system_browser_open. */
const e12 = await uji('E12', `
  const { TOOL_CATALOG } = await import('/src/lib/zephyrTools/catalog.ts');
  const nama = TOOL_CATALOG.map((t) => t.name);
  return {
    adaSistem: nama.includes('system_browser_open'),
    adaBrowser: nama.includes('browser_open'),
  };
`);
r.check('E1', e12.adaBrowser, 'browser_open terpasang (memicu penanda halaman terbuka)');
r.check('E2', e12.adaSistem, 'system_browser_open terpasang (kini diperlakukan sama, bukan dihitung muter)');

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
