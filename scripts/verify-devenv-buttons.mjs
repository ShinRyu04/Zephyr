// verify-devenv-buttons.mjs — every DevEnv button/control must do SOMETHING.
// .click() bypasses hit-testing (see the A1 lesson), so this drives a real
// mouse click at each control's centre, then checks that the app reacted:
// a status message changed, the store moved, or the DOM changed.
//
// Usage: node scripts/verify-devenv-buttons.mjs [port]
import { Cdp, sleep } from './lib-cdp.mjs';

const PORT = process.argv[2] || '9223';
const { cdp } = await Cdp.attach(PORT);

// Open the panel and wait for the rows.
await cdp.runAsync(`
  S.getState().setSettingsOpen(false);
  if (TS().maximized || TS().visible) TS().setVisible(false);
  S.setState({ sidebarVisible: true });
  S.getState().setActivity('devenv');
  for (let i = 0; i < 80; i++) { await wait(100); if (document.querySelector('[data-testid="dv-services"]')) break; }
  await wait(1800);
  return 'ok';
`, 120000);

// List the controls to exercise. "safe" ones have no side effect on the machine
// (toast/open-folder/open-settings); start/stop are checked but not required to
// change machine state here.
const kontrol = JSON.parse(await cdp.runAsync(`
  const ids = [...document.querySelectorAll('.dv [data-testid]')]
    .filter((e) => e.tagName === 'BUTTON' || e.tagName === 'SELECT' || e.tagName === 'INPUT')
    .map((e) => e.getAttribute('data-testid'))
    .filter((t) => t && t.startsWith('dv-'))
    .filter((t) => !t.endsWith('-status'));
  return JSON.stringify([...new Set(ids)]);
`, 30000));

console.log(`controls found: ${kontrol.length}`);

async function centre(testid) {
  return JSON.parse(await cdp.runAsync(`
    const el = document.querySelector('[data-testid="${testid}"]');
    if (!el) return JSON.stringify(null);
    // .dv is the real scroll container; scrollIntoView can pick the wrong one,
    // so walk up to the nearest scrollable ancestor and set its scrollTop.
    let p = el.parentElement;
    let scroller = null;
    while (p && p !== document.body) {
      const ov = getComputedStyle(p).overflowY;
      if ((ov === 'auto' || ov === 'scroll') && p.scrollHeight > p.clientHeight) { scroller = p; break; }
      p = p.parentElement;
    }
    const er = el.getBoundingClientRect();
    if (scroller) {
      const sr = scroller.getBoundingClientRect();
      scroller.scrollTop += (er.top + er.height / 2) - (sr.top + sr.height / 2);
    } else {
      el.scrollIntoView({ block: 'center' });
    }
    await wait(150);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) return JSON.stringify(null);
    return JSON.stringify({ x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) });
  `, 15000));
}

/** A snapshot of everything a click could plausibly change. */
async function snapshot() {
  return cdp.runAsync(`
    const st = S.getState();
    const setUi = window.__ZEPHYR_SET__?.ui?.getState?.();
    const sel = document.activeElement?.getAttribute?.('data-testid') || '';
    const dvRoot = document.querySelector('[data-testid="dv-root"]');
    const baris = dvRoot ? dvRoot.querySelectorAll('.dv-baris').length : 0;
    return JSON.stringify({
      status: st.statusMessage || '',
      activity: st.activity || '',
      settingsOpen: !!st.settingsOpen,
      section: setUi?.section || '',
      active: sel,
      baris,
      // A rescan flips this; without it, "Scan again" looks inert because a
      // completed identical scan changes nothing else.
      memindai: window.__ZEPHYR_DEVENV__?.state?.()?.memindai ?? false,
      // The auto-start checkboxes and the domain/server inputs write straight
      // into settings, so a click that only moves one of them is still a
      // reaction. Without these the probe reports a working control as dead.
      auto: JSON.stringify(
        (st.settings.devenv?.services ?? {}).map
          ? Object.fromEntries(
              Object.entries(st.settings.devenv?.services ?? {}).map(([k, v]) => [
                k,
                v?.autoStart ?? null,
              ]),
            )
          : {},
      ),
      root: st.settings.devenv?.rootFolder ?? '',
      domain: st.settings.devenv?.domain ?? '',
      server: st.settings.devenv?.server ?? '',
    });
  `, 15000);
}

const hasil = [];
for (const t of kontrol) {
  // Re-open the panel each iteration: clicking Open/Settings navigates away.
  const siap = await cdp.runAsync(`
    S.getState().setSettingsOpen(false);
    if (TS().maximized || TS().visible) TS().setVisible(false);
    S.setState({ sidebarVisible: true });
    S.getState().setActivity('devenv');
    // Wait for the panel, then for the projects section (a project row only
    // exists after the ~3s scan lands), then for this exact control.
    for (let i = 0; i < 60; i++) { await wait(100); if (document.querySelector('[data-testid="dv-services"]')) break; }
    for (let i = 0; i < 40; i++) { await wait(150); if (document.querySelector('[data-testid="${t}"]')) break; }
    await wait(400);
    return document.querySelector('[data-testid="${t}"]') ? 'ada' : 'tidak';
  `, 40000);
  if (siap !== 'ada') { hasil.push({ t, skipped: 'no-render' }); continue; }
  const cc = await centre(t);
  if (!cc) { hasil.push({ t, skipped: 'offscreen' }); continue; }
  const depan = await snapshot();
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cc.x, y: cc.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cc.x, y: cc.y, button: 'left', clickCount: 1 });
  await sleep(500);
  const belakang = await snapshot();
  const beda = Object.keys(depan).filter((k) => depan[k] !== belakang[k]);
  hasil.push({ t, reacted: beda.length > 0, changed: beda });
}

const mati = hasil.filter((h) => h.reacted === false && !h.skipped);
console.log(JSON.stringify(hasil, null, 1));
console.log(`\ncontrols: ${kontrol.length}, checked: ${hasil.filter((h) => !h.skipped).length}, no-reaction: ${mati.length}, skipped: ${hasil.filter((h) => h.skipped).length}`);
if (mati.length) console.log('NO-REACTION: ' + mati.map((m) => m.t).join(', '));
await cdp.close();
