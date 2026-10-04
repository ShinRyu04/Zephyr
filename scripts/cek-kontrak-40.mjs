/**
 * cek-kontrak-40.mjs - buktikan kontrak 40 inti di aplikasi yang HIDUP.
 *
 *   node scripts/cek-kontrak-40.mjs [port]
 *
 * Verifikasi katalog membuktikan KATALOGNYA benar. Berkas ini membuktikan
 * yang berbeda: bahwa sekat yang benar-benar dipakai aplikasi saat berjalan
 * sudah menerima kontrak itu. Dua hal itu bisa berbeda - katalog bisa benar
 * sementara store belum pernah membacanya.
 */
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const { cdp } = await Cdp.attach(PORT);

const WEB = [
  'web_search', 'web_fetch', 'browser_open', 'browser_read', 'browser_click',
  'browser_type', 'browser_nav', 'browser_list', 'browser_close',
  'browser_download_url', 'system_browser_open',
];

/*
 * Kontrak web: BUKAN "semua mati", tapi daftar-MATI eksplisit (lihat
 * tool-web-dan-penjelasan-ai.md). Lima tool berbahaya mati default; tool web
 * yang lain bisa dipakai sejak lahir. Harness lama memeriksa "tidak ada tool
 * web yang menyala" dan menolak desain itu - daftar nyala membuat tool baru
 * lahir mati, dan itu sumber kegagalan diam-diam yang nyata.
 */
const WEB_MATI = [
  'browser_click', 'browser_type', 'browser_download_url',
  'browser_close', 'system_browser_open',
];

const hasil = await cdp.json(`return JSON.stringify(await (async () => {
  const { AGENT_TOOLS } = await import('/src/lib/agentTools.ts');
  const { useToolGate, TOOL_INTI } = await import('/src/lib/toolGate.ts');
  const aktif = useToolGate.getState().aktif;
  const nama = AGENT_TOOLS.map((t) => t.spec.name);
  const web = ${JSON.stringify(WEB)};
  const webMatiHarap = ${JSON.stringify(WEB_MATI)};
  return {
    terpasang: nama.length,
    inti: TOOL_INTI.length,
    aktif: aktif.size,
    intiKurang: TOOL_INTI.filter((n) => !aktif.has(n)),
    webMenyala: web.filter((w) => aktif.has(w)),
    webMatiAktif: webMatiHarap.filter((w) => aktif.has(w)),
    popoverSubagents: !!document.querySelector('[data-testid="ai-subagents-trigger"]'),
  };
})())`);

let lulus = 0;
let gagal = 0;
const cek = (nama, syarat, rincian) => {
  if (syarat) {
    lulus++;
    console.log('  LULUS  ' + nama);
  } else {
    gagal++;
    console.log('  GAGAL  ' + nama + (rincian ? '  -> ' + JSON.stringify(rincian) : ''));
  }
};

/*
 * Jumlah tool TIDAK dipatok sebagai angka mati di sini.
 *
 * Dulu berkas ini memeriksa `=== 51` dan `=== 40`, dan dua baris itu harus
 * disunting SETIAP kali satu tool ditambahkan - dan cara itu sudah membuat
 * berkas ini menolak keadaan yang benar: menambah `suggest_command` gagal di
 * sini walau katalognya sehat. Yang diperiksa sekarang adalah HUBUNGANNYA:
 * tool inti hanyalah tool non-web, jadi keduanya tidak bisa berbeda pendapat.
 */
const jumlah = await cdp.json(`return JSON.stringify(await (async () => {
  const { TOOL_CATALOG, TOOL_INTI } = await import('/src/lib/tediTools/catalog.ts');
  const web = TOOL_CATALOG.filter((t) => t.source === 'web');
  return {
    katalog: TOOL_CATALOG.length,
    nonWeb: TOOL_CATALOG.length - web.length,
    intiDariKatalog: TOOL_INTI.length,
    web: web.length,
  };
})())`);

console.log('\n== Kontrak tool di aplikasi yang hidup ==');
cek('inti = katalog dikurangi web (katalog)', jumlah.intiDariKatalog === jumlah.nonWeb, jumlah);
cek('jumlah terpasang = inti + web', hasil.terpasang === jumlah.intiDariKatalog + jumlah.web, {
  dapat: hasil.terpasang,
  harap: jumlah.intiDariKatalog + jumlah.web,
});
cek('inti di katalog = inti di sekat', hasil.inti === jumlah.intiDariKatalog, {
  dapat: hasil.inti,
  harap: jumlah.intiDariKatalog,
});
cek('43 tool inti AKTIF', hasil.intiKurang.length === 0, { kurang: hasil.intiKurang });
cek('tool web daftar-MATI tidak menyala', hasil.webMatiAktif.length === 0, { bocor: hasil.webMatiAktif });
cek('popover subagents sudah hilang', hasil.popoverSubagents === false);

console.log('\n== ' + lulus + '/' + (lulus + gagal) + ' lulus ==');
await cdp.close();
process.exit(gagal === 0 ? 0 : 1);
