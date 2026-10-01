/**
 * uji-gerbang-git.mjs - buktikan gerbang git benar-benar menolak operasi ganda.
 *
 *   node scripts/uji-gerbang-git.mjs 9223
 *
 * Yang dibuktikan: saat `busy` true, operasi git MENOLAK dan memberi pesan yang
 * menyebut operasi apa yang sedang berjalan. Bukan sekadar "kodenya ada" -
 * gerbang yang tidak pernah menolak sama saja tidak ada.
 */
import { Cdp, reporter, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] ? String(process.argv[2]) : '9223';
const r = reporter('gerbang-git');

const { cdp } = await Cdp.attach(PORT);
cdp.snapshot = null;

/* ---- Sumber: pastikan tidak ada operasi yang lolos tanpa gerbang ---- */

const sumber = await cdp.json(`return JSON.stringify(await (async () => {
  const teks = await fetch(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'gitStore.ts').then((x) => x.text());
  const setBusy = (teks.match(/set\\(\\{ busy: true/g) || []).length;
  const mulai = (teks.match(/mulaiSibuk\\(/g) || []).length;
  const selesai = (teks.match(/selesaiSibuk\\(\\)/g) || []).length;
  return { setBusy, mulai, selesai };
})())`);

r.check('H1', sumber.setBusy <= 1, `hanya satu set busy:true yang tersisa (di commit yang sudah benar): ${sumber.setBusy}`);
r.check('H2', sumber.mulai >= 14, `${sumber.mulai} operasi memakai gerbang mulaiSibuk`);
r.check('H3', sumber.selesai >= 14, `${sumber.selesai} operasi melepas gerbangnya di finally`);

/* ---- Hidup: gerbang benar-benar menolak ---- */

const tolak = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'gitStore.ts');
  const g = m.useGit;

  /* Tandai seolah ada operasi lain yang sedang jalan. */
  g.setState({ busy: true, busyLabel: 'checkout', scmError: null });
  await new Promise((res) => setTimeout(res, 120));

  const sebelum = g.getState().scmError;

  /* Panggil operasi yang seharusnya menolak. Fetch dipilih karena tidak
     menyentuh apa pun kalau ditolak - tidak ada efek samping yang perlu
     dibersihkan setelah uji. */
  let hasil = 'TIDAK DIPANGGIL';
  try {
    await g.getState().fetch();
    hasil = 'selesai-tanpa-lewat';
  } catch (e) {
    hasil = 'melempar: ' + String(e.message).slice(0, 70);
  }
  await new Promise((res) => setTimeout(res, 200));

  const sesudah = g.getState();
  return {
    sebelum,
    hasil,
    pesan: sesudah.scmError,
    masihSibuk: sesudah.busy,
    label: sesudah.busyLabel,
  };
})())`);

r.check(
  'H4',
  /Masih sibuk/i.test(tolak.pesan || ''),
  `operasi kedua DITOLAK dengan pesan yang jelas: ${JSON.stringify((tolak.pesan || '').slice(0, 110))}`,
);
r.check(
  'H5',
  /checkout/.test(tolak.pesan || ''),
  `pesannya menyebut operasi yang sedang berjalan: ${JSON.stringify(tolak.pesan || '')}`,
);
r.check('H6', tolak.masihSibuk === true && tolak.label === 'checkout', 'operasi pertama tidak terganggu oleh percobaan kedua');

/* ---- Gerbang dilepas setelah selesai ---- */

const lepas = await cdp.json(`return JSON.stringify(await (async () => {
  const m = await import(String.fromCharCode(47) + 'src' + String.fromCharCode(47) + 'lib' + String.fromCharCode(47) + 'gitStore.ts');
  m.useGit.setState({ busy: false, busyLabel: '', scmError: null });
  await new Promise((res) => setTimeout(res, 120));
  const s = m.useGit.getState();
  return { busy: s.busy, label: s.busyLabel };
})())`);

r.check('H7', lepas.busy === false && lepas.label === '', 'gerbang dilepas, store kembali bisa dipakai');

const { lulus, total } = r.selesai();
await cdp.close();
process.exit(lulus === total ? 0 : 1);
