// Diagnosa V1/V3 verify08: apakah halaman Settings benar-benar ter-render.
import { Cdp, sleep } from './lib-cdp.mjs';

const { cdp } = await Cdp.attach('9223');

await cdp.eval(`(() => {
  const s = window.__ZEPHYR__.getState();
  s.setActivity('settings');
  s.setSettingsOpen(true);
  if (!window.__ZEPHYR__.getState().sidebarVisible) s.toggleSidebar();
  return 'ok';
})()`);
await sleep(600);

const r = await cdp.eval(
  `JSON.stringify({
    settingsOpen: window.__ZEPHYR__.getState().settingsOpen,
    activity: window.__ZEPHYR__.getState().activity,
    sidebarVisible: window.__ZEPHYR__.getState().sidebarVisible,
    setPage: !!document.querySelector('.settings-page, [data-testid="settings-page"]'),
    sectionAktif: document.querySelector('[data-testid="set-section"]')?.getAttribute('data-section') ?? null,
    nav: [...document.querySelectorAll('[data-testid^="set-nav-"]')].map(n => n.getAttribute('data-testid')),
    body: document.body.className,
    judul: [...document.querySelectorAll('.settings-page h2, .settings-body h2')].map(h => h.textContent),
  })`,
);
console.log(r);
await cdp.close();
