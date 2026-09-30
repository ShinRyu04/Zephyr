// What does the Dev Environment actually render now, compared with what its
// component defines? The report says the buttons (Open Folder, Scan again) and
// the runtimes list are gone, leaving only text.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');

const r = await cdp.runAsync(
  `
  const st = S.getState();
  st.setSettingsOpen(false);
  st.setActivity('devenv');
  st.setSidebarVisible(true);
  await wait(2500);

  const dv = document.querySelector('[data-testid="dv-root"]');
  if (!dv) return JSON.stringify({ err: 'dv-root tidak ada' });

  const tombol = [...dv.querySelectorAll('button')].map((b) => {
    const x = b.getBoundingClientRect();
    return {
      teks: b.textContent.trim().slice(0, 28),
      testid: b.getAttribute('data-testid'),
      kotak: Math.round(x.width) + 'x' + Math.round(x.height),
      display: getComputedStyle(b).display,
    };
  });
  const seksi = [...dv.querySelectorAll('section, .dv-section, .dv-baris')].length;
  const input = dv.querySelectorAll('input, select').length;
  return JSON.stringify({
    dvH: Math.round(dv.getBoundingClientRect().height),
    dvTinggiIsi: dv.scrollHeight,
    anakLangsung: [...dv.children].map((c) => c.className),
    jumlahTombol: tombol.length,
    tombol: tombol.slice(0, 14),
    jumlahInput: input,
    jumlahSeksi: seksi,
    teks: dv.textContent.trim().slice(0, 180),
  });
`,
  45000,
);

console.log(r);
process.exit(0);
