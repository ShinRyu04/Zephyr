// Prove the three side-panel activities actually render a panel when their
// ActivityBar button is clicked. They were listed in ActivityBar (button + icon
// + label) but had no case in Sidebar, so clicking them switched the activity
// and showed nothing - the button looked dead.
import { Cdp } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const { cdp } = await Cdp.attach(PORT);

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

const KASUS = [
  ['devenv', 'Dev Environment'],
  ['api', 'API Client'],
  ['sftp', 'SFTP'],
];

for (const [id, label] of KASUS) {
  const r = JSON.parse(
    await cdp.runAsync(
      `
      const st = S.getState();
      st.setSettingsOpen(false);
      st.setActivity('explorer');
      await wait(400);
      const btn = document.querySelector('[data-testid="ab-${id}"]');
      if (!btn) return JSON.stringify({ err: 'tombol ab-${id} tidak ada' });
      btn.click();
      await wait(1200);
      const side = document.querySelector('.side-panel, .side-nav, [class*="side"]');
      const aktif = S.getState().activity;
      // Anything rendered inside the sidebar that is not the empty shell.
      const isi = document.querySelector('.side-panel')?.children.length ?? 0;
      const teks = (document.querySelector('.side-panel')?.textContent || '').trim().slice(0, 70);
      return JSON.stringify({ aktif, isi, teks, tombolAda: true });
    `,
      40000,
    ),
  );
  check(
    `PANEL-${id}`,
    r.aktif === id && (r.isi ?? 0) > 0,
    r.err
      ? r.err
      : `activity=${r.aktif}, isi sidebar=${r.isi} elemen, teks="${r.teks}"`,
  );
}

const lulus = hasil.filter((x) => x.ok).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
await cdp.close();
process.exitCode = lulus === hasil.length ? 0 : 1;
