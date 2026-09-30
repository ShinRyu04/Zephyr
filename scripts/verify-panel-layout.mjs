// All three views must fill the middle area: width ~80% of the window and the
// height equal to the editor area, with nothing clipped horizontally.
import { Cdp } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach(process.argv[2] || '9223');

const hasil = [];
const check = (id, ok, detail) => {
  hasil.push({ id, ok });
  console.log(`${ok ? 'LULUS' : 'GAGAL'}  ${id}  ${detail}`);
};

const SEL = {
  devenv: '[data-testid="dv-root"]',
  api: '[data-testid="api-root"]',
  sftp: '[data-testid="sftp-root"]',
};

for (const id of ['devenv', 'api', 'sftp']) {
  const r = JSON.parse(
    await cdp.runAsync(
      `
      const st = S.getState();
      st.setSettingsOpen(false);
      st.setActivity(${JSON.stringify(id)});
      st.setSidebarVisible(true);
      await wait(2200);
      const v = document.querySelector(${JSON.stringify(SEL[id])});
      const ea = document.querySelector('.editor-area');
      if (!v) return JSON.stringify({ err: 'view tidak ada' });
      const vb = v.getBoundingClientRect();
      const eb = ea.getBoundingClientRect();
      return JSON.stringify({
        w: Math.round(vb.width),
        h: Math.round(vb.height),
        areaH: Math.round(eb.height),
        x: Math.round(vb.left),
        winW: window.innerWidth,
        melu: v.scrollWidth - v.clientWidth,
        teks: v.textContent.trim().slice(0, 50),
      });
    `,
      40000,
    ),
  );
  check(
    `PANEL-${id}`,
    !r.err && r.h >= r.areaH - 20 && r.w >= r.winW * 0.5 && r.melu <= 1,
    r.err
      ? r.err
      : `lebar ${r.w}px (window ${r.winW}), tinggi ${r.h}px dari area ${r.areaH}px, x=${r.x}, luber=${r.melu}, teks="${r.teks}"`,
  );
}

const lulus = hasil.filter((x) => x.ok).length;
console.log(`\n== ${lulus}/${hasil.length} lulus ==`);
await cdp.close();
process.exitCode = lulus === hasil.length ? 0 : 1;
