// run-all-verify.mjs — run every `npm run verify*` harness, one at a time, each
// in a fresh attach, with a timeout. Results go to verify-all.json.
//
// Between harnesses the app is reset through CDP: settings closed, every tab
// closed, the terminal panel hidden, and any leftover pane killed. Without this
// a harness inherits the previous one's state (an open Settings page, a dirty
// tab, a live shell) and fails on the leaked state instead of on the code. That
// is what made two runs of the same suite disagree.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Cdp } from './lib-cdp.mjs';

const AKAR = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(AKAR, 'package.json'), 'utf8'));
const nama = Object.keys(pkg.scripts).filter((k) => /^verify(:|$)/.test(k)).sort();
const lewati = new Set(['verify:28']);

/** Put the app back to a clean slate, best effort. */
async function resetApp() {
  try {
    const { cdp } = await Cdp.attach('9223');
    await cdp.runAsync(`
      const st = S.getState();
      st.setSettingsOpen(false);
      st.setActivity('explorer');
      for (const t of [...st.tabs]) st.forceCloseTab(t.id);
      // Panes hold a live shell each; close them so the pty count returns to 0.
      const term = window.__ZEPHYR_TERM__;
      if (term) {
        const ts = term.getState();
        for (const tab of [...ts.terminalTabs]) {
          for (const pane of [...tab.panes]) { try { ts.killPane(pane.id); } catch {} }
          try { ts.closeTab(tab.id); } catch {}
        }
        ts.setVisible(false);
      }
      S.setState({ sidebarVisible: true });
      await wait(400);
      return 'ok';
    `, 60000);
    await cdp.close();
    return true;
  } catch {
    // The app may be closed or busy; the harness will report its own failure.
    return false;
  }
}

const hasil = [];
for (const k of nama) {
  if (lewati.has(k)) { hasil.push({ nama: k, status: 'SKIP' }); console.log(`SKIP  ${k}`); continue; }
  await resetApp();
  const arg = pkg.scripts[k].replace(/^node\s+/, '');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(AKAR, arg)], {
    cwd: AKAR, encoding: 'utf8', timeout: 8 * 60 * 1000, maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - t0;
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/==\s*(\d+)\/(\d+)\s*lulus\s*==/);
  const status = r.status === 0 ? 'PASS' : 'FAIL';
  hasil.push({ nama: k, status, exit: r.status, ms, tally: m ? m[0] : null });
  console.log(`${status === 'PASS' ? 'PASS' : 'FAIL'}  ${k.padEnd(16)} exit=${r.status} ${(ms / 1000).toFixed(0)}s ${m ? m[0] : ''}`);
}

const lulus = hasil.filter((h) => h.status === 'PASS').length;
const gagal = hasil.filter((h) => h.status === 'FAIL');
console.log(`\nPASS=${lulus} FAIL=${gagal.length} SKIP=${hasil.filter((h) => h.status === 'SKIP').length} TOTAL=${hasil.length}`);
for (const h of gagal) console.log(`  FAIL ${h.nama} ${h.tally || ''}`);
fs.writeFileSync(path.join(AKAR, 'verify-all.json'), JSON.stringify(hasil, null, 2));
process.exitCode = gagal.length ? 1 : 0;

