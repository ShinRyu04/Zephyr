// probe-changelog.mjs — buktikan TABEL changelog tampil di panel notifikasi.
import { Cdp } from 'file:///D:/Zephyr/scripts/lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');
const N = `window.__ZEPHYR_NOTIF__`;

// 1) Suntik notifikasi dengan detail markdown (heading, list, bold, tabel).
let r = await cdp.eval(`${N}.notify({
  severity: 'info',
  message: 'Zephyr v1.1.8 tersedia',
  detail: '## Zephyr v1.1.8\\n\\n### Model AI\\n- Gemini baru\\n- Claude baru\\n\\n| Provider | Model |\\n| --- | --- |\\n| Gemini | 3.8 Flash |\\n| Claude | Fable 5.1 |',
  source: 'update',
  actions: [{ label: 'Lihat & pasang', command: 'help.checkUpdates' }],
});
${N}.center(true);
'ok'`);
console.log('notify:', r);

// 2) Tunggu render lalu baca DOM panel.
await new Promise((res) => setTimeout(res, 700));
const dom = await cdp.eval(`(() => {
  const panel = document.querySelector('[data-testid="nc-panel"]');
  if (!panel) return JSON.stringify({ panel: false });
  const tabel = panel.querySelectorAll('table');
  const th = panel.querySelectorAll('table th');
  const td = panel.querySelectorAll('table td');
  const h5 = panel.querySelectorAll('h5');
  const li = panel.querySelectorAll('li');
  const strong = panel.querySelectorAll('strong');
  return JSON.stringify({
    panel: true,
    jmlTabel: tabel.length,
    jmlTh: th.length,
    jmlTd: td.length,
    thTeks: [...th].map((x) => x.textContent.trim()),
    tdTeks: [...td].map((x) => x.textContent.trim()),
    judul: [...h5].map((x) => x.textContent.trim()),
    list: [...li].map((x) => x.textContent.trim()),
    bold: [...strong].map((x) => x.textContent.trim()),
    htmlSnippet: panel.querySelector('.upd-changelog table')?.outerHTML.slice(0, 300) ?? null,
  });
})()`);
console.log(dom);

// 3) Bersihkan: tutup panel & hapus notif uji.
await cdp.eval(`${N}.center(false)`);
const bersih = await cdp.eval(`${N}.clear(); 'ok'`);
console.log('bersih:', bersih);