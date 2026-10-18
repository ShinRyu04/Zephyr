// B: SFTP / Dev Environment / API Client TIDAK boleh tampil di area editor.
import { Cdp, keluarBersih } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(9223, 'Zephyr');
const h = await cdp.json(
  `return JSON.stringify(await (async () => {
  const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.__ZEPHYR__;
  const out = {};

  /* Activity lama yang dulu merender view ke editor. */
  for (const act of ['sftp', 'devenv', 'api']) {
    S.getState().setActivity(act);
    await tunggu(900);
    out[act] = {
      activity: S.getState().activity,
      diEditor: !!document.querySelector('.editor-host [data-testid="sftp-host"], .editor-host .dv-title, .editor-host .api-send'),
      adaHost: !!document.querySelector('[data-testid="sftp-host"]'),
      lebarEditor: Math.round(document.querySelector('.editor-host')?.getBoundingClientRect().width ?? 0),
    };
  }

  /* Lewat Tools: harus MUNCUL di sana. */
  S.getState().setToolsTab('sftp');
  S.getState().setActivity('tools');
  await tunggu(1100);
  out.viaTools = {
    toolsTab: S.getState().toolsTab,
    adaHost: !!document.querySelector('[data-testid="sftp-host"]'),
  };

  /* Kembali ke explorer: editor harus normal lagi. */
  S.getState().setActivity('explorer');
  await tunggu(700);
  out.normal = { activity: S.getState().activity, adaSidebar: !!document.querySelector('aside.sidebar') };

  return out;
})().catch((e) => ({ fatal: String(e) })))`,
  180000,
);

const d = typeof h === 'string' ? JSON.parse(h) : h;
if (d.fatal) {
  console.error('GAGAL:', d.fatal);
  keluarBersih(1);
}

console.log(JSON.stringify(d, null, 1));

let lulus = 0;
let gagal = 0;
const cek = (n, ok, info = '') => {
  console.log(`  ${ok ? 'LULUS' : 'GAGAL'}  ${n}${info ? `  ${info}` : ''}`);
  if (ok) lulus++;
  else gagal++;
};

console.log('\nBukti B — SFTP keluar dari editor:');
for (const act of ['sftp', 'devenv', 'api']) {
  cek(`activity "${act}" TIDAK merender view di editor`, d[act]?.diEditor === false, String(d[act]?.diEditor));
}
cek('Tools > SFTP tetap berfungsi', d.viaTools?.adaHost === true, String(d.viaTools?.adaHost));
cek('kembali ke explorer normal', d.normal?.adaSidebar === true, '');

console.log(`\n== ${lulus}/${lulus + gagal} lulus ==`);
keluarBersih(gagal ? 1 : 0);
